// Re-encode a video for the web: H.264 MP4, no audio (the site plays videos
// muted), longest side ≤ 1600 px, sized to fit under a byte budget (5 MB by
// default), with the index at the front so it starts playing while it loads.
//
//   swift tools/editor/compress_video.swift <in> <out.mp4> [maxMB=5] [maxSide=1600]
//
// Uses AVFoundation, which ships with macOS — no ffmpeg needed. Reads anything
// AVFoundation can (MP4, MOV, M4V); WebM is not supported.
import AVFoundation
import Foundation

func fail(_ msg: String) -> Never {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
    exit(1)
}

let args = CommandLine.arguments
guard args.count >= 3 else { fail("usage: compress_video <in> <out.mp4> [maxMB=5] [maxSide=1600]") }
let src = URL(fileURLWithPath: args[1]), dst = URL(fileURLWithPath: args[2])
let maxBytes = (Double(args.count > 3 ? args[3] : "5") ?? 5) * 1_000_000
let maxSide = Double(args.count > 4 ? args[4] : "1600") ?? 1600

let asset = AVURLAsset(url: src)
guard let track = asset.tracks(withMediaType: .video).first else { fail("no video track in \(src.path)") }
let duration = max(0.1, CMTimeGetSeconds(asset.duration))
let fps = max(1, Double(track.nominalFrameRate))

// output size: longest side ≤ maxSide, even numbers (H.264 needs them)
let natural = track.naturalSize
let scale = min(1, maxSide / Double(max(natural.width, natural.height)))
func even(_ v: Double) -> Int { let n = Int(v.rounded()); return max(2, n - n % 2) }
let width = even(Double(natural.width) * scale), height = even(Double(natural.height) * scale)

func encode(bitrate: Int) throws {
    try? FileManager.default.removeItem(at: dst)
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height
    ])
    output.alwaysCopiesSampleData = false
    reader.add(output)

    let writer = try AVAssetWriter(outputURL: dst, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [
            AVVideoAverageBitRateKey: bitrate,
            AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
            AVVideoMaxKeyFrameIntervalDurationKey: 2,
            AVVideoExpectedSourceFrameRateKey: fps
        ]
    ])
    input.expectsMediaDataInRealTime = false
    input.transform = track.preferredTransform
    writer.add(input)

    guard reader.startReading() else { throw reader.error ?? NSError(domain: "read", code: 1) }
    guard writer.startWriting() else { throw writer.error ?? NSError(domain: "write", code: 1) }
    writer.startSession(atSourceTime: .zero)

    let queue = DispatchQueue(label: "encode"), done = DispatchSemaphore(value: 0)
    var finished = false
    input.requestMediaDataWhenReady(on: queue) {
        if finished { return }
        while input.isReadyForMoreMediaData {
            guard let sample = output.copyNextSampleBuffer(), input.append(sample) else {
                finished = true; input.markAsFinished(); done.signal(); return
            }
        }
    }
    done.wait()
    let closed = DispatchSemaphore(value: 0)
    writer.finishWriting { closed.signal() }
    closed.wait()
    if reader.status == .failed { throw reader.error ?? NSError(domain: "read", code: 2) }
    if writer.status != .completed { throw writer.error ?? NSError(domain: "write", code: 2) }
}

// aim a little under the budget (container overhead, bitrate overshoot), then
// step down until it fits
var bitrate = Int(min(8_000_000, max(400_000, maxBytes * 8 * 0.9 / duration)))
var size = 0
for attempt in 1...5 {
    do { try encode(bitrate: bitrate) } catch { fail("encode failed: \(error.localizedDescription)") }
    size = (try? FileManager.default.attributesOfItem(atPath: dst.path)[.size] as? Int) ?? 0
    if Double(size) <= maxBytes || attempt == 5 { break }
    bitrate = Int(Double(bitrate) * min(0.85, maxBytes / Double(size) * 0.95))
}
print("\(width)x\(height) \(Int(fps))fps \(String(format: "%.1f", duration))s \(bitrate / 1000) kbps -> \(String(format: "%.2f", Double(size) / 1_000_000)) MB")
if Double(size) > maxBytes { fail("still over \(maxBytes / 1_000_000) MB after 5 tries") }
