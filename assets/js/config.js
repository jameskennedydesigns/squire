/* ==========================================================================
   SITE CONFIG — edit everything personal in this one file.
   Images: every placeholder is a gray block. To use a real image, set the
   `image` field (path or URL) on a project / post, or replace the
   <div class="ph"> blocks in the HTML with <img> tags.
   ========================================================================== */
window.SITE = {
  name: "Your Name",            // footer wordmark, copy, {name}
  brand: "",                    // optional nav logo / disc wordmark (empty = name®)
  role: "Design Engineer",      // hero wordmark (stacked)
  location: "CITY, CC",         // live clock label, e.g. "LONDON, UK"
  timezone: "Europe/London",    // IANA timezone for the clock
  since: "2018",                // "© 2018-26"
  email: "hello@yourname.com",
  socials: [
    { label: "LinkedIn", href: "https://www.linkedin.com/" },
    { label: "X (Twitter)", href: "https://x.com/" },
    { label: "Instagram", href: "https://www.instagram.com/" }
  ],

  /* ---- WORK: limited to 5 projects ------------------------------------
     Each project is a 3D disc: all 5 spin through the homepage hero
     and sit flat on the Portfolio canvas.
     `disc`:  square artwork printed on the disc — an image, animated GIF or
              looping video (.mp4 / .webm / .mov, plays muted) (falls back to `image`,
              then to a generated gray cover). The disc's title, wordmark and
              rim text are printed over it; `discInk: "white"` prints them in
              white instead of black
     `image`: cover image for the project page
     `shape`: disc size on the Portfolio canvas — "portrait" (420px) or
              "landscape" (480px). `slug` is used in project.html?p=<slug> */
  projects: [
    {
      slug: "project-01",
      title: "Project One",
      year: "2026",
      shape: "portrait",
      services: "Product Design, Design System, Front-end Engineering",
      summary: "A short summary of the project — what it is, who it was for, and what you did. Replace this placeholder with your own words.",
      image: "",
      disc: ""
    },
    {
      slug: "project-02",
      title: "Project Two",
      year: "2025",
      shape: "landscape",
      services: "Web App, Interaction Design, Prototyping",
      summary: "A short summary of the project — what it is, who it was for, and what you did. Replace this placeholder with your own words.",
      image: "",
      disc: ""
    },
    {
      slug: "project-03",
      title: "Project Three",
      year: "2025",
      shape: "portrait",
      services: "Brand Website, Motion, Creative Development",
      summary: "A short summary of the project — what it is, who it was for, and what you did. Replace this placeholder with your own words.",
      image: "",
      disc: ""
    },
    {
      slug: "project-04",
      title: "Project Four",
      year: "2024",
      shape: "portrait",
      services: "Mobile App, UI Engineering, Accessibility",
      summary: "A short summary of the project — what it is, who it was for, and what you did. Replace this placeholder with your own words.",
      image: "",
      disc: ""
    },
    {
      slug: "project-05",
      title: "Project Five",
      year: "2024",
      shape: "landscape",
      services: "Design Tooling, Component Library, Documentation",
      summary: "A short summary of the project — what it is, who it was for, and what you did. Replace this placeholder with your own words.",
      image: "",
      disc: ""
    }
  ],

  /* ---- FEED / NOTES ---------------------------------------------------- */
  posts: [
    { slug: "the-logic-of-emotion", title: "The Logic of Emotion", date: "April 26, 2026",
      excerpt: "In design, clarity isn’t about simplicity for its own sake. It’s about removing what doesn’t serve meaning — until what remains feels inevitable." },
    { slug: "precision-over-perfection", title: "Precision Over Perfection", date: "March 29, 2026",
      excerpt: "Design isn’t about getting everything right — it’s about making the right things matter." },
    { slug: "the-language-of-shape", title: "The Language of Shape", date: "March 2, 2026",
      excerpt: "Every curve, line, and contrast says something. Good design doesn’t speak louder — it speaks clearer." },
    { slug: "thinking-in-motion", title: "Thinking in Motion", date: "February 9, 2026",
      excerpt: "Motion is not decoration. It explains how an interface thinks, and every transition tells part of the story." },
    { slug: "systems-that-breathe", title: "Systems That Breathe", date: "January 18, 2026",
      excerpt: "A design system is never finished. The best ones leave room for the next idea without losing their shape." },
    { slug: "code-as-material", title: "Code as Material", date: "December 7, 2025",
      excerpt: "When you design in the medium you ship in, the gap between intention and outcome starts to disappear." }
  ]
};
