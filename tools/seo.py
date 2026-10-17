#!/usr/bin/env python3
"""Writes the SEO <head> block (title, description, canonical, Open Graph, Twitter,
JSON-LD) into every page, plus sitemap.xml and robots.txt.
Re-run after changing BASE (e.g. when the site moves to trendli9.com):
    python3 tools/seo.py
"""
import json, re, html, datetime, pathlib

BASE = "https://trendli9.com/"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OG_IMAGE = BASE + "assets/img/og-image.jpg"
TODAY = datetime.date.today().isoformat()

BUSINESS = {
    "@type": "LocalBusiness", "@id": BASE + "#business",
    "name": "Trendli9 Prints", "alternateName": "Trendli9",
    "url": BASE, "logo": BASE + "assets/img/icon-512.png", "image": OG_IMAGE,
    "description": "DTF printing studio in Visakhapatnam (Vizag): DTF transfers and gang sheets, custom T-shirt printing, saree & blouse prints, hotel and uniform branding, bulk corporate orders and DTF spare parts.",
    "telephone": "+91-9932627413", "email": "Trendli9prints@gmail.com",
    "parentOrganization": {"@type": "Organization", "name": "Colorflu"},
    "address": {"@type": "PostalAddress", "streetAddress": "LG Towers, Flat No. 101, Krishna Gardens Street, Dabagardens",
                "addressLocality": "Visakhapatnam", "addressRegion": "Andhra Pradesh", "addressCountry": "IN"},
    "openingHoursSpecification": [{"@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], "opens": "10:00", "closes": "20:00"}],
    "areaServed": [{"@type": "City", "name": "Visakhapatnam"}, {"@type": "State", "name": "Andhra Pradesh"}, {"@type": "Country", "name": "India"}],
    "sameAs": ["https://instagram.com/trend.li9"],
    "knowsAbout": ["DTF printing", "DTF transfers", "DTF gang sheets", "Custom T-shirt printing", "Saree printing", "Blouse printing",
                   "Hotel uniform branding", "Bulk corporate T-shirts", "DTF printer spare parts"],
}

# file: (title, description, breadcrumb name or None, noindex)
PAGES = {
    "index.html": ("DTF Printing & Custom T-Shirt Printing in Vizag | Trendli9 Prints",
        "DTF printing in Visakhapatnam (Vizag): DTF transfers, gang sheets, custom T-shirts, saree & blouse prints, uniforms and bulk orders. Free quote on WhatsApp.", None, False),
    "services.html": ("DTF Printing Job Work in Visakhapatnam | Trendli9 Prints",
        "DTF printing job work in Vizag for T-shirt printers, clothing brands, garment manufacturers, boutiques and bulk B2B orders. Gang sheets, transfers and more.", "Services", False),
    "gang-sheet.html": ("Free DTF Gang Sheet Builder (22 × 39 in) | Trendli9 Prints",
        "Free online DTF gang sheet builder: upload designs, set sizes in inches and auto-pack 22 × 39 in sheets. DTF gang sheet printing in Visakhapatnam, quoted on WhatsApp.", "Gang Sheet Builder", False),
    "halftone.html": ("Free DTF Halftone Generator & Background Remover | Trendli9",
        "Free DTF halftone tool: remove black or white backgrounds and turn soft edges and gradients into clean halftone dots, ready for DTF transfer printing.", "Smart Halftone", False),
    "shop.html": ("Custom T-Shirts, Hoodies & DTF Supplies in Vizag | Trendli9 Prints",
        "Custom printed T-shirts, hoodies, polos, caps, tote bags and cushion covers, plus DTF transfers, ink, film, powder and printheads in Visakhapatnam. Get a quote.", "Shop", False),
    "studio.html": ("Design Your Own T-Shirt Online | Trendli9 Design Studio",
        "Design a custom T-shirt, hoodie, polo, cap, tote or cushion online: upload artwork, add text, pick a 2×2, 3×3 or 4×4 in print and get a quote on WhatsApp.", "Design Studio", False),
    "gallery.html": ("DTF Printing Work Gallery – T-Shirts, Sarees & Uniforms | Trendli9",
        "Photos of our DTF printing work in Visakhapatnam: DTF transfers, custom T-shirts and hoodies, saree and blouse prints, hotel uniforms and home décor fabric.", "Gallery", False),
    "about.html": ("About Trendli9 Prints – DTF Printing Studio in Visakhapatnam",
        "Trendli9 Prints is a DTF printing studio in Visakhapatnam and a unit of Colorflu, printing for brands, boutiques, hotels, garment makers and individuals.", "About", False),
    "contact.html": ("Contact Trendli9 Prints – DTF & T-Shirt Printing in Vizag",
        "Contact Trendli9 Prints, Dabagardens, Visakhapatnam. WhatsApp or call +91 99326 27413 for DTF printing, custom T-shirt and bulk order quotes.", "Contact", False),
    "orders.html": ("My Orders — Trendli9 Prints",
        "View the orders you've placed with Trendli9 Prints from this device and continue them on WhatsApp.", "My Orders", True),
}

START, END = "<!-- SEO -->", "<!-- /SEO -->"

def esc(s): return html.escape(s, quote=True)

def faq_from(page):
    items = re.findall(r'<details><summary>(.*?)</summary><div class="ans">(.*?)</div></details>', page, re.S)
    strip = lambda s: re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()
    return [{"@type": "Question", "name": strip(q), "acceptedAnswer": {"@type": "Answer", "text": strip(a)}} for q, a in items]

def services_ld():
    js = (ROOT / "assets/js/catalog.js").read_text()
    block = js[js.index("const SERVICES"):js.index("const GALLERY")]
    out = []
    for m in re.finditer(r'\{ id: "([^"]+)".*?name: "([^"]+)".*?short: "([^"]+)"', block, re.S):
        sid, name, short = m.groups()
        out.append({"@type": "Service", "name": name, "description": short, "url": BASE + "services.html#" + sid,
                    "serviceType": name, "provider": {"@id": BASE + "#business"},
                    "areaServed": [{"@type": "City", "name": "Visakhapatnam"}, {"@type": "Country", "name": "India"}]})
    return out

def head_block(f, title, desc, crumb, noindex, page):
    url = BASE if f == "index.html" else BASE + f
    lines = [
        START,
        f'<title>{esc(title)}</title>',
        f'<meta name="description" content="{esc(desc)}">',
        f'<meta name="robots" content="{"noindex, follow" if noindex else "index, follow, max-image-preview:large"}">',
        f'<link rel="canonical" href="{url}">',
        '<meta name="geo.region" content="IN-AP"><meta name="geo.placename" content="Visakhapatnam">',
        '<meta property="og:site_name" content="Trendli9 Prints"><meta property="og:locale" content="en_IN">',
        f'<meta property="og:type" content="website"><meta property="og:url" content="{url}">',
        f'<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}">',
        f'<meta property="og:image" content="{OG_IMAGE}"><meta property="og:image:alt" content="Trendli9 Prints — DTF printing studio in Visakhapatnam">',
        f'<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{esc(title)}"><meta name="twitter:description" content="{esc(desc)}"><meta name="twitter:image" content="{OG_IMAGE}">',
    ]
    if not noindex:
        graph = []
        if f == "index.html":
            graph += [BUSINESS, {"@type": "WebSite", "@id": BASE + "#site", "url": BASE, "name": "Trendli9 Prints", "inLanguage": "en-IN", "publisher": {"@id": BASE + "#business"}}]
            faq = faq_from(page)
            if faq: graph.append({"@type": "FAQPage", "mainEntity": faq})
        else:
            graph.append({"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": BASE},
                {"@type": "ListItem", "position": 2, "name": crumb, "item": url}]})
            graph.append({"@type": "WebPage", "url": url, "name": title, "description": desc, "isPartOf": {"@id": BASE + "#site"}, "about": {"@id": BASE + "#business"}})
        if f == "services.html": graph += services_ld()
        if f in ("gang-sheet.html", "halftone.html", "studio.html"):
            graph.append({"@type": "WebApplication", "name": crumb, "url": url, "applicationCategory": "DesignApplication",
                          "operatingSystem": "Any (web browser)", "isAccessibleForFree": True, "provider": {"@id": BASE + "#business"}})
        ld = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False).replace("</", "<\\/")
        lines.append(f'<script type="application/ld+json">{ld}</script>')
    lines.append(END)
    return "\n  ".join(lines)

for f, (title, desc, crumb, noindex) in PAGES.items():
    p = ROOT / f; s = p.read_text()
    if START in s:
        s = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda m: "", s, flags=re.S)
    else:  # first run: drop the hand-written tags this block replaces
        s = re.sub(r'\s*<title>.*?</title>', "", s, count=1, flags=re.S)
        s = re.sub(r'\s*<meta name="description"[^>]*>', "", s, count=1)
        s = re.sub(r'\s*<meta (property|name)="(og|twitter):[^"]+" content="[^"]*">', "", s)
        s = re.sub(r'\s*<script type="application/ld\+json">.*?</script>', "", s, flags=re.S)
    s = re.sub(r'(<meta name="viewport"[^>]*>)\n\s*', lambda m: m.group(1) + "\n  " + head_block(f, title, desc, crumb, noindex, s) + "\n  ", s, count=1)
    p.write_text(s)

indexed = [f for f, v in PAGES.items() if not v[3]]
(ROOT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    "".join(f'  <url><loc>{BASE if f == "index.html" else BASE + f}</loc><lastmod>{TODAY}</lastmod></url>\n' for f in indexed) + "</urlset>\n")
(ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nDisallow: /orders.html\nSitemap: {BASE}sitemap.xml\n")
print("SEO head written to", len(PAGES), "pages; sitemap has", len(indexed), "URLs")
