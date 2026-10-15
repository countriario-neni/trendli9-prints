/* =========================================================
   TRENDLI9 PRINTS — Services & product catalogue
   Prices are INDICATIVE "starting from" values (incl. one DTF print)
   and are confirmed by the team on WhatsApp. Edit freely.
   price: null  => shown as "Get price" (quote on WhatsApp)
   ========================================================= */
(function () {
  const APPAREL_COLORS = [
    { name: "White", hex: "#F7F7F5" }, { name: "Black", hex: "#16161A" },
    { name: "Navy", hex: "#1C2A4A" }, { name: "Royal Blue", hex: "#2350C8" },
    { name: "Red", hex: "#C8202F" }, { name: "Maroon", hex: "#6B1A2B" },
    { name: "Bottle Green", hex: "#14513A" }, { name: "Mustard", hex: "#E0A526" },
    { name: "Grey Melange", hex: "#A9ABAE" }, { name: "Lavender", hex: "#B9A6E0" },
    { name: "Sky Blue", hex: "#8CC8EC" }, { name: "Baby Pink", hex: "#F4BFD0" }
  ];
  const BASIC_COLORS = APPAREL_COLORS.filter(c =>
    ["White", "Black", "Navy", "Red", "Royal Blue", "Grey Melange", "Maroon", "Bottle Green"].includes(c.name));
  const NATURAL = [{ name: "Natural", hex: "#EFE6D2" }, { name: "Black", hex: "#16161A" }, { name: "Navy", hex: "#1C2A4A" }, { name: "Red", hex: "#C8202F" }];
  const ADULT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
  const KID_SIZES = ["2-3Y", "4-5Y", "6-7Y", "8-9Y", "10-11Y", "12-13Y"];

  // Extra print locations (DTF), added per piece
  const PRINT_AREAS = [
    { id: "front", name: "Front", add: 0 },
    { id: "back", name: "Back", add: 120 },
    { id: "lsleeve", name: "Left sleeve", add: 50 },
    { id: "rsleeve", name: "Right sleeve", add: 50 }
  ];

  // Bulk pricing tiers (discount on garment subtotal)
  const TIERS = [
    { min: 1, off: 0 }, { min: 10, off: 0.05 }, { min: 25, off: 0.10 },
    { min: 50, off: 0.15 }, { min: 100, off: 0.20 }
  ];

  const CATEGORIES = [
    { id: "apparel", name: "Apparel" },
    { id: "ethnic", name: "Saree & Ethnic" },
    { id: "accessories", name: "Bags & Caps" },
    { id: "home", name: "Home Décor" },
    { id: "uniform", name: "Hotel & Uniform" },
    { id: "dtf", name: "DTF Transfers" },
    { id: "consumables", name: "Spares & Consumables" }
  ];

  const PRODUCTS = [
    // ---------- Apparel ----------
    { id: "classic-tee", photo: "p-classic-tee", cat: "apparel", name: "Classic Crew T-Shirt", mockup: "tee", price: 349, unit: "piece",
      desc: "180 GSM 100% combed cotton, bio-washed, regular fit. The everyday canvas for brands, events and teams.",
      colors: APPAREL_COLORS, sizes: ADULT_SIZES, areas: PRINT_AREAS, custom: true, badge: "Bestseller", minQty: 1 },
    { id: "oversized-tee", photo: "p-oversized-tee", cat: "apparel", name: "Oversized Drop-Shoulder Tee", mockup: "tee", price: 449, unit: "piece",
      desc: "240 GSM heavyweight cotton, relaxed streetwear fit. Built for statement back prints.",
      colors: APPAREL_COLORS.slice(0, 10), sizes: ADULT_SIZES.slice(1), areas: PRINT_AREAS, custom: true, badge: "Trending", minQty: 1 },
    { id: "polo", photo: "p-polo", cat: "apparel", name: "Premium Polo T-Shirt", mockup: "polo", price: 499, unit: "piece",
      desc: "220 GSM honeycomb pique with ribbed collar. Ideal for corporate, staff and team uniforms.",
      colors: BASIC_COLORS, sizes: ADULT_SIZES, areas: PRINT_AREAS, custom: true, minQty: 1 },
    { id: "hoodie", photo: "p-hoodie", cat: "apparel", name: "Pullover Hoodie", mockup: "hoodie", price: 899, unit: "piece",
      desc: "320 GSM fleece-lined cotton blend with kangaroo pocket and drawcords.",
      colors: BASIC_COLORS, sizes: ADULT_SIZES, areas: PRINT_AREAS, custom: true, badge: "Winter pick", minQty: 1 },
    { id: "sweatshirt", photo: "p-sweatshirt", cat: "apparel", name: "Crew Neck Sweatshirt", mockup: "sweatshirt", price: 749, unit: "piece",
      desc: "300 GSM brushed fleece, ribbed cuffs and hem. Clean canvas for chest and back prints.",
      colors: BASIC_COLORS, sizes: ADULT_SIZES, areas: PRINT_AREAS, custom: true, minQty: 1 },
    { id: "kids-tee", photo: "p-kids-tee", cat: "apparel", name: "Kids T-Shirt", mockup: "tee", price: 299, unit: "piece",
      desc: "Soft 160 GSM cotton with skin-friendly, stretchable DTF prints. Birthday & school favourite.",
      colors: APPAREL_COLORS, sizes: KID_SIZES, areas: PRINT_AREAS.slice(0, 2), custom: true, minQty: 1 },

    // ---------- Saree & Ethnic ----------
    { id: "saree-print", cat: "ethnic", name: "Saree Motif & Border Printing", img: "svc-saree", price: null, unit: "saree",
      desc: "Vibrant DTF motifs, pallu art and borders printed onto your saree — silk, georgette, chiffon, cotton.",
      custom: false, quote: true, minQty: 1 },
    { id: "blouse-print", cat: "ethnic", name: "Designer Blouse Printing", img: "g-blouse", price: 299, unit: "blouse",
      desc: "Neckline, back and sleeve artwork with fine detail on ready or unstitched blouse fabric.",
      custom: false, quote: true, minQty: 1 },
    { id: "boutique-job", cat: "ethnic", name: "Boutique Garment Job Work", img: "svc-dtf", price: null, unit: "lot",
      desc: "Kurtis, lehengas, dupattas and kidswear — send your garments, we print and return pressed.",
      custom: false, quote: true, minQty: 5 },

    // ---------- Bags & Caps ----------
    { id: "cap", photo: "p-cap", cat: "accessories", name: "Baseball Cap", mockup: "cap", price: 299, unit: "piece",
      desc: "6-panel cotton twill cap with adjustable strap. Front DTF logo print.",
      colors: BASIC_COLORS, sizes: ["Free size"], areas: [PRINT_AREAS[0]], custom: true, minQty: 1 },
    { id: "tote", photo: "p-tote", cat: "accessories", name: "Canvas Tote Bag", mockup: "tote", price: 249, unit: "piece",
      desc: "12 oz natural canvas, 38×42 cm with long handles. Perfect for events, boutiques and merch.",
      colors: NATURAL, sizes: ["38 × 42 cm"], areas: PRINT_AREAS.slice(0, 2), custom: true, badge: "Eco", minQty: 1 },

    // ---------- Home Décor ----------
    { id: "cushion", photo: "p-cushion", cat: "home", name: "Printed Cushion Cover", mockup: "cushion", price: 299, unit: "piece",
      desc: "16×16 in poly-canvas cover with concealed zip. Photos, patterns, names — edge to edge.",
      colors: [{ name: "White", hex: "#F7F7F5" }, { name: "Natural", hex: "#EFE6D2" }, { name: "Grey Melange", hex: "#A9ABAE" }],
      sizes: ["16 × 16 in", "18 × 18 in"], areas: [PRINT_AREAS[0]], custom: true, minQty: 1 },
    { id: "decor-fabric", cat: "home", name: "Home Décor Fabric Printing", img: "svc-decor", price: null, unit: "metre",
      desc: "Table runners, curtains, wall tapestries and upholstery panels printed to your theme.",
      custom: false, quote: true, minQty: 1 },

    // ---------- Hotel & Uniform ----------
    { id: "apron", photo: "p-apron", cat: "uniform", name: "Chef & Service Apron", mockup: "apron", price: 349, unit: "piece",
      desc: "Twill bib apron with adjustable neck strap and waist ties. Logo printed to last through washes.",
      colors: BASIC_COLORS, sizes: ["Free size"], areas: [PRINT_AREAS[0]], custom: true, minQty: 1 },
    { id: "hotel-branding", cat: "uniform", name: "Hotel Branding Transfers", img: "svc-hotel", price: null, unit: "lot",
      desc: "Crest and logo transfers for chef coats, staff uniforms, linens, pillow covers and amenity bags.",
      custom: false, quote: true, minQty: 10 },
    { id: "uniform-print", cat: "uniform", name: "School & Staff Uniform Printing", img: "svc-bulk", price: null, unit: "lot",
      desc: "Logos, names and numbers on shirts, jerseys and jackets for schools, hospitals and offices.",
      custom: false, quote: true, minQty: 10 },

    // ---------- DTF Transfers ----------
    { id: "dtf-meter", cat: "dtf", name: "DTF Gang Sheet — Per Metre", img: "svc-dtf", price: 250, unit: "metre",
      desc: "Send your gang sheet (58 cm wide). Printed, powdered and cured — ready to press on any fabric.",
      sizes: ["58 cm × 1 m"], custom: false, badge: "₹250 / m", minQty: 1, meter: true },
    { id: "dtf-ready", cat: "dtf", name: "Ready-to-Press DTF Transfers", img: "process-heatpress", price: 45, unit: "transfer",
      desc: "Single designs cut to size. Press at 160 °C for 12–15 s, peel hot or cold.",
      sizes: ["Logo (10×10 cm)", "A5", "A4", "A3"], sizePrice: { "Logo (10×10 cm)": 15, "A5": 30, "A4": 45, "A3": 80 },
      custom: false, minQty: 10 },

    // ---------- Spares & Consumables ----------
    { id: "dtf-ink", cat: "consumables", name: "DTF Pigment Ink (C/M/Y/K/W)", img: "svc-consumables", price: null, unit: "litre",
      desc: "Vivid, wash-fast textile pigment inks. White ink with anti-settle formula.",
      sizes: ["Cyan", "Magenta", "Yellow", "Black", "White"], custom: false, quote: true, minQty: 1 },
    { id: "dtf-film", icon: "layers", tile: "var(--cyan)", cat: "consumables", name: "DTF PET Film Roll", img: "svc-consumables", price: null, unit: "roll",
      desc: "Hot & cold peel double-side matte film. A3 sheets, 30 cm and 60 cm × 100 m rolls.",
      sizes: ["A3 sheets (100)", "30 cm × 100 m", "60 cm × 100 m"], custom: false, quote: true, minQty: 1 },
    { id: "dtf-powder", icon: "sparkle", tile: "var(--violet)", cat: "consumables", name: "Hot-Melt Adhesive Powder", img: "svc-consumables", price: null, unit: "kg",
      desc: "Fine / medium TPU powder for soft hand-feel and strong wash durability.",
      sizes: ["Fine 1 kg", "Medium 1 kg", "Black 1 kg"], custom: false, quote: true, minQty: 1 },
    { id: "printhead", icon: "printer", tile: "var(--magenta)", cat: "consumables", name: "Printheads (XP600 / i3200 / L1800)", img: "svc-consumables", price: null, unit: "piece",
      desc: "Genuine and tested printheads for DTF printers, with installation guidance.",
      sizes: ["XP600", "i3200-A1", "L1800 / DX8"], custom: false, quote: true, minQty: 1 },
    { id: "spares-kit", icon: "package", tile: "var(--orange)", cat: "consumables", name: "Dampers, Capping & Wiper Kit", img: "svc-consumables", price: null, unit: "kit",
      desc: "Ink dampers, capping station, wiper blades, encoder strips and tubing for routine maintenance.",
      custom: false, quote: true, minQty: 1 },
    { id: "cleaning", icon: "droplet", tile: "var(--blue)", cat: "consumables", name: "Printhead Cleaning Solution", img: "svc-consumables", price: null, unit: "500 ml",
      desc: "Safe flush for clogged nozzles and daily maintenance of DTF printheads.",
      custom: false, quote: true, minQty: 1 }
  ];

  const SERVICES = [
    { id: "dtf-transfer", name: "DTF Transfer Printing", img: "svc-dtf", shop: "dtf",
      short: "Complete DTF job work — gang sheets, ready-to-press transfers, any fabric.",
      long: "Our production-grade DTF line prints razor-sharp, stretchable transfers that work on cotton, polyester, blends, denim, nylon and leather. Send a gang sheet or a single design — we print, powder, cure and hand you transfers ready to press.",
      points: ["Complete DTF transfer printing job work", "Gang sheets from ₹250 per metre", "Hot & cold peel, soft hand-feel", "Quick turnaround on standard orders"] },
    { id: "custom-apparel", name: "Custom Apparel Printing", img: "svc-apparel", shop: "apparel",
      short: "T-shirts, hoodies, polos and kidswear — single piece to thousands.",
      long: "Design your own merch or bring your artwork. We print on premium blanks or garments you supply, with full-colour detail, gradients and photo-quality results that survive the wash.",
      points: ["Custom T-shirt printing", "Clothing brand & reseller job work", "Front, back and sleeve prints", "No minimum order on blanks"] },
    { id: "saree-blouse", name: "Saree & Blouse Prints", img: "svc-saree", shop: "ethnic",
      short: "Motifs, borders and pallu art printed on silk, georgette and cotton.",
      long: "Bring traditional and contemporary artwork onto ethnic wear. Our transfers keep fine linework and rich colour on delicate fabrics, so boutiques can offer exclusive designs without embroidery lead-times.",
      points: ["Saree & blouse printing", "Boutique & garment printing", "Works on delicate fabrics", "Exclusive designs for boutiques"] },
    { id: "hotel-branding", name: "Hotel Branding Transfers", img: "svc-hotel", shop: "uniform",
      short: "Crests and logos for uniforms, linens and amenities.",
      long: "Consistent brand identity across every textile touchpoint — chef coats, front-office uniforms, aprons, pillow covers and laundry bags — with transfers built for commercial laundering.",
      points: ["Hotel & uniform printing", "Industrial-wash durability", "Brand-colour matched logos", "Repeat orders on file"] },
    { id: "corporate-bulk", name: "Corporate & Bulk Orders", img: "svc-bulk", shop: "apparel",
      short: "Event tees, staff uniforms and merch kits with bulk pricing.",
      long: "From product launches to annual days, we handle sizing sheets, individual names and numbers, packing and delivery — with tiered pricing that rewards volume.",
      points: ["Bulk & corporate T-shirt orders", "Names & numbers personalisation", "Size-wise packing", "Volume discounts up to 20%"] },
    { id: "home-decor", name: "Home Décor Fabric Printing", img: "svc-decor", shop: "home",
      short: "Cushions, runners, curtains and tapestries printed to your theme.",
      long: "Turn photos, patterns and brand art into soft furnishings for homes, cafés and hotels. Ideal for gifting, interiors and themed events.",
      points: ["Cushion covers & runners", "Wall tapestries & curtains", "Photo-quality detail", "Personalised gifting"] },
    { id: "spares", name: "DTF Spare Parts & Consumables", img: "svc-consumables", shop: "consumables",
      short: "Inks, film, powder, printheads and maintenance kits.",
      long: "Run your own DTF setup? We supply the same tested consumables and spares we trust on our production floor, with honest advice on maintenance and troubleshooting.",
      points: ["DTF spare parts & consumables", "Inks, PET film & powder", "Printheads & maintenance kits", "Technical guidance included"] }
  ];

  const GALLERY = [
    { img: "g-lion-tee", cap: "Rainbow lion — DTF on black tee", cat: "apparel", w: 1024, h: 1024 },
    { img: "svc-saree", cap: "Peacock & lotus saree motif", cat: "ethnic", w: 1024, h: 768 },
    { img: "svc-dtf", cap: "Full-colour DTF gang sheets", cat: "dtf", w: 1024, h: 768 },
    { img: "g-blouse", cap: "Traditional neckline print on blouse", cat: "ethnic", w: 1024, h: 1024 },
    { img: "process-heatpress", cap: "Peeling a fresh DTF transfer", cat: "dtf", w: 1024, h: 768 },
    { img: "g-kids", cap: "Kids tee & cap set", cat: "apparel", w: 1024, h: 1024 },
    { img: "svc-hotel", cap: "Hotel uniform crest transfers", cat: "uniform", w: 1024, h: 768 },
    { img: "svc-apparel", cap: "Streetwear capsule — tees, hoodie, tote", cat: "apparel", w: 1024, h: 768 },
    { img: "g-hoodie", cap: "Back print on a mustard hoodie", cat: "apparel", w: 1000, h: 1500 },
    { img: "svc-decor", cap: "Printed cushion covers & table runner", cat: "home", w: 1024, h: 768 },
    { img: "svc-bulk", cap: "Corporate bulk polo order", cat: "uniform", w: 1024, h: 768 },
    { img: "svc-consumables", cap: "DTF inks, film & powder", cat: "dtf", w: 1024, h: 768 }
  ];

  window.T9_CATALOG = { CATEGORIES, PRODUCTS, SERVICES, PRINT_AREAS, TIERS, GALLERY };
})();
