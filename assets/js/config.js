/* =========================================================
   TRENDLI9 PRINTS — Site configuration
   Edit business details here; every page reads from this file.
   ========================================================= */
window.T9_CONFIG = {
  brand: "Trendli9 Prints",
  tagline: "Unmatched Quality. Flawless Prints.",
  parent: "A unit of Colorflu",

  // WhatsApp / phone — country code + number, digits only
  whatsapp: "919932627413",
  phoneDisplay: "+91 99326 27413",
  phoneTel: "+919932627413",
  email: "Trendli9prints@gmail.com",

  // Instagram handle (no @) — every Instagram link, label and the JSON-LD sameAs read this one line
  instagram: "trend.li9",

  address: {
    line1: "LG Towers, Flat No. 101",
    line2: "Krishna Gardens Street, Dabagardens",
    city: "Visakhapatnam",
    state: "Andhra Pradesh",
    country: "India",
    mapsQuery: "LG Towers Krishna Gardens Street Dabagardens Visakhapatnam"
  },

  hours: "Mon – Sat · 10:00 AM – 8:00 PM",
  currency: "₹",
  // Order upload service (site/worker: Cloudflare Worker + Workers KV). When set, browsers that can't
  // share files send the order text with a link whose preview shows the order image.
  orderApi: "https://trendli9-orders.trendli9-orders.workers.dev",
  // TODO(client): confirm typical turnaround wording
  turnaround: "Most DTF transfer orders are ready within 24–48 hours. Apparel and bulk timelines depend on quantity and are confirmed on WhatsApp."
};
