// Generates the static audience blocks, jump nav and grouped service list in services.html
// from catalog.js (run: node tools/build-services.js)
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "assets/js/catalog.js"), "utf8"), ctx);
const { AUDIENCES, SERVICES } = ctx.window.T9_CATALOG;
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const attr = s => esc(s).replace(/\n/g, "&#10;");
// Same details the studio's WhatsApp auto-reply asks for, so the visitor only fills the blanks.
const waBrief = intro => `Hi Trendli9! ${intro}\n\nName / business: \nDTF printing quantity (sheets or pieces): \nDesign / artwork: \nFabric / application: \nPrinting requirements: `;
const IMG = { "p-rack-printed": [1000, 1500], "p-rack-black": [1000, 1500], "g-blouse": [1024, 1024] };
const dims = img => IMG[img] || [1024, 768];

const aud = AUDIENCES.map((a, i) => `
          <article class="aud reveal" id="${a.id}" aria-labelledby="${a.id}-t"${i % 2 ? ' data-delay="1"' : ""}>
            <figure class="aud__media"><img src="assets/img/${a.img}.webp" alt="${esc(a.name)}: DTF printing job work in Visakhapatnam" loading="lazy" width="${dims(a.img)[0]}" height="${dims(a.img)[1]}"></figure>
            <div class="aud__body">
              <h3 id="${a.id}-t"><i data-icon="${a.icon}"></i> ${esc(a.name)}</h3>
              <p class="aud__title">${esc(a.title)}</p>
              <h4 class="aud__label">Who it's for</h4>
              <p>${esc(a.who)}</p>
              <h4 class="aud__label">What we do</h4>
              <p>${esc(a.what)}</p>
              <h4 class="aud__label">Typical jobs</h4>
              <ul class="aud__jobs">${a.jobs.map(j => `<li>${esc(j)}</li>`).join("")}</ul>
              <div class="aud__cta">
                <a class="btn btn--wa" href="#" data-wa="${attr(waBrief(a.wa))}"><i data-icon="whatsapp"></i> WhatsApp your job</a>
                <a class="link-arrow" href="${a.link.href}">${esc(a.link.label)} <i data-icon="arrow"></i></a>
              </div>
            </div>
          </article>`).join("");

const rows = AUDIENCES.map((a, gi) => {
  const list = SERVICES.filter(s => s.aud === a.id);
  return `
        <div class="svc-group svc-group--${"cmyk"[gi]}" aria-labelledby="g-${a.id}">
          <header class="svc-group__head">
            <span class="svc-group__n">0${gi + 1}</span>
            <h3 id="g-${a.id}">${esc(a.name)}</h3>
            <a class="link-arrow" href="#${a.id}" aria-label="How our job work fits ${esc(a.name)}">How it fits you <i data-icon="arrow"></i></a>
          </header>
          <div class="svc-group__list">${list.map(s => `
            <article class="svc-item reveal" id="${s.id}">
              <div class="svc-item__media"><img src="assets/img/${s.img}.webp" alt="${esc(s.name)} by Trendli9 Prints" loading="lazy" width="1024" height="768">${s.tag ? `<span class="svc-item__tag">${esc(s.tag)}</span>` : ""}</div>
              <div class="svc-item__body">
                <h4>${esc(s.name)}</h4>
                <p>${esc(s.long)}</p>
                <ul class="svc-item__pts">${s.points.map(p => `<li><i data-icon="check"></i>${esc(p)}</li>`).join("")}</ul>
                <div class="actions">
                  <a class="btn btn--wa btn--sm" href="#" data-wa="${attr(waBrief(`I'd like a quote for ${s.name}.`))}"><i data-icon="whatsapp"></i> Get a quote</a>
                  <a class="btn btn--ghost btn--sm" href="shop.html?cat=${s.shop}">View products <i data-icon="arrow"></i></a>
                </div>
              </div>
            </article>`).join("")}
          </div>
        </div>`;
}).join("");

const nav = AUDIENCES.map(a => `<li><a class="chip" href="#${a.id}">${esc(a.short)}</a></li>`).join("")
  + `<li><a class="chip" href="#all-services">All services</a></li><li><a class="chip" href="#how">How it works</a></li><li><a class="chip" href="#quote">Get a quote</a></li>`;

const file = path.join(root, "services.html");
let page = fs.readFileSync(file, "utf8");
for (const m of ["SVC-NAV", "SVC-AUD", "SVC-ROWS"]) if (!page.includes(`<!--${m}-->`)) throw new Error(`marker <!--${m}--> missing in services.html`);
page = page.replace(/<!--SVC-NAV-->[\s\S]*?<!--\/SVC-NAV-->/, `<!--SVC-NAV-->${nav}<!--/SVC-NAV-->`)
           .replace(/<!--SVC-AUD-->[\s\S]*?<!--\/SVC-AUD-->/, `<!--SVC-AUD-->${aud}\n          <!--/SVC-AUD-->`)
           .replace(/<!--SVC-ROWS-->[\s\S]*?<!--\/SVC-ROWS-->/, `<!--SVC-ROWS-->${rows}\n        <!--/SVC-ROWS-->`);
fs.writeFileSync(file, page);
console.log("services.html updated:", AUDIENCES.length, "audiences,", SERVICES.length, "services");
