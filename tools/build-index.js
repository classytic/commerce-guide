// Portal index builder for the commerce-guides GitHub Pages site.
// Scans modules/*/spec.json, groups guides into curated categories, and emits
// index.html at the repo root. Thumbnails reference each module's first
// screenshot by RELATIVE path (served by Pages) — the index stays light while
// the guides themselves keep their data-URI self-containment.
//
// Usage:  node tools/build-index.js
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MODULES = path.join(ROOT, "modules");

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Curated categories (order = page order). A slug missing here lands in "More".
const CATEGORIES = [
  {
    id: "sell",
    title: "Sell — POS, Orders & Growth",
    blurb: "Ring up sales at the register, take online orders through fulfilment, and run the levers that bring customers back.",
    slugs: ["pos-register", "sales-orders", "returns-rma", "promotions-coupons", "loyalty-points"],
  },
  {
    id: "buy",
    title: "Buy — Purchasing & Suppliers",
    blurb: "Procure-to-pay: raise POs, receive goods, book expense bills, and reconcile the supplier subsidiary ledger.",
    slugs: ["inventory-purchase-orders", "expense-purchases", "suppliers-partner-ledger"],
  },
  {
    id: "stock",
    title: "Stock — Inventory & Warehouse",
    blurb: "Per-branch stock control, warehouse operations, inter-branch transfers, cycle counts, and how cost flows into COGS.",
    slugs: [
      "inventory-stock-control",
      "warehouse-wms-lifecycle",
      "warehouse-loading-catalog",
      "transfers-challan",
      "stock-adjustments",
      "cost-valuation",
    ],
  },
  {
    id: "books",
    title: "Books — Accounting & Tax",
    blurb: "The single company-wide ledger: chart of accounts, receivables/payables aging, VAT + withholding, and closing the period.",
    slugs: ["accounting-chart-of-accounts", "ar-ap-aging", "invoice-tax-withholding", "period-close"],
  },
];

// ---- scan modules ----------------------------------------------------------
const guides = {};
for (const dir of fs.readdirSync(MODULES)) {
  const specPath = path.join(MODULES, dir, "spec.json");
  if (!fs.existsSync(specPath)) continue; // WIP module (screenshots only)
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const out = spec.out || `${dir}.html`;
  if (!fs.existsSync(path.join(MODULES, dir, out))) continue; // not built
  const thumb = spec.steps?.[0]?.img ? `modules/${dir}/${spec.steps[0].img}` : null;
  guides[spec.slug] = {
    dir,
    href: `modules/${dir}/${out}`,
    module: spec.module,
    section: spec.section || "",
    lede: spec.lede || "",
    steps: spec.steps?.length ?? 0,
    thumb,
  };
}

const placed = new Set();
const catBlocks = CATEGORIES.map((cat) => {
  const items = cat.slugs.map((slug) => guides[slug]).filter(Boolean);
  items.forEach((g) => placed.add(g.dir));
  if (!items.length) return "";
  const cards = items
    .map(
      (g) => `
        <a class="card" href="${esc(g.href)}">
          <div class="thumb">${g.thumb ? `<img src="${esc(g.thumb)}" alt="" loading="lazy" decoding="async" />` : ""}</div>
          <div class="card-body">
            <p class="card-kicker">${esc(g.section)}</p>
            <h3>${esc(g.module)}</h3>
            <p>${esc(g.lede)}</p>
            <div class="card-meta">
              <span class="steps-pill">${g.steps}</span> steps
              <span class="open">Open guide →</span>
            </div>
          </div>
        </a>`
    )
    .join("\n");
  return `
    <section class="cat" id="${cat.id}">
      <div class="cat-head"><h2>${esc(cat.title)}</h2><span class="count">${items.length} guide${items.length === 1 ? "" : "s"}</span></div>
      <p class="cat-blurb">${esc(cat.blurb)}</p>
      <div class="grid">
${cards}
      </div>
    </section>`;
}).join("\n");

// Anything not in a curated category still gets listed.
const leftovers = Object.values(guides).filter((g) => !placed.has(g.dir));
const moreBlock = leftovers.length
  ? `
    <section class="cat" id="more">
      <div class="cat-head"><h2>More</h2><span class="count">${leftovers.length}</span></div>
      <div class="grid">
${leftovers
  .map(
    (g) => `
        <a class="card" href="${esc(g.href)}">
          <div class="thumb">${g.thumb ? `<img src="${esc(g.thumb)}" alt="" loading="lazy" decoding="async" />` : ""}</div>
          <div class="card-body">
            <p class="card-kicker">${esc(g.section)}</p>
            <h3>${esc(g.module)}</h3>
            <p>${esc(g.lede)}</p>
            <div class="card-meta"><span class="steps-pill">${g.steps}</span> steps <span class="open">Open guide →</span></div>
          </div>
        </a>`
  )
  .join("\n")}
      </div>
    </section>`
  : "";

const total = Object.keys(guides).length;
const totalSteps = Object.values(guides).reduce((n, g) => n + g.steps, 0);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>BigBoss Commerce — Operator Guides</title>
<meta name="description" content="Click-by-click visual walkthroughs of the BigBoss Commerce admin dashboard — POS, orders, purchasing, inventory, warehouse, accounting and tax." />
<link rel="stylesheet" href="assets/site.css" />
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <p class="eyebrow"><span class="dot"></span>BigBoss Commerce &nbsp;·&nbsp; Operator Guides</p>
      <h1>Learn the platform, one flow at a time.</h1>
      <p class="lede">Click-by-click visual walkthroughs of the admin dashboard, captured live from the running app. Each guide traces one business flow end to end — what to click, what the system does underneath, and which journals it books.</p>
      <div class="meta-row">
        <span class="chip"><b>${total}</b> guides</span>
        <span class="chip"><b>${totalSteps}</b> annotated steps</span>
        <span class="chip"><span class="ring"></span> callout = where to click</span>
        <span class="chip"><b>EN</b> · translation-ready</span>
      </div>
    </header>
${catBlocks}
${moreBlock}
    <footer class="foot">
      <p><span class="mono">How these are made</span>Every guide is a single self-contained HTML file built from live screenshots (<code>tools/build-doc.js</code>). Narration lines are tagged for translation, so the same steps can drive Bangla (or any locale) voiceover video renders.</p>
      <span class="badge">commerce-guides · ${total} modules · ${totalSteps} steps</span>
    </footer>
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, "index.html"), html);
console.log(`wrote index.html — ${total} guides, ${totalSteps} steps`);
