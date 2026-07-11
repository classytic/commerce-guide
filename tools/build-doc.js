// Guidde/Scribe-style module doc builder for the Classytic commerce ERP.
// Reads screenshots, embeds them as data URIs, computes % callout boxes from
// raw pixel coords, and emits ONE self-contained HTML page per module.
//
// Usage:  node tools/build-doc.js modules/<name>/spec.json
// Images (spec.steps[].img) and the output file (spec.out) are resolved
// relative to the SPEC file's own directory, so each module folder is portable.
const fs = require("fs");
const path = require("path");

// Resolve everything relative to the spec file's directory.
const SPEC_PATH = path.resolve(process.argv[2]);
const DIR = path.dirname(SPEC_PATH);
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function dataUri(file) {
  const b = fs.readFileSync(file);
  return "data:image/png;base64," + b.toString("base64");
}

// ---- module definition -----------------------------------------------------
const spec = JSON.parse(fs.readFileSync(SPEC_PATH, "utf8"));

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Cache image dims + data URIs
const imgCache = {};
function img(file) {
  if (!imgCache[file]) {
    const p = path.join(DIR, file);
    imgCache[file] = { ...pngSize(p), uri: dataUri(p) };
  }
  return imgCache[file];
}

const ACTION_META = {
  NAVIGATE: { c: "steel", verb: "Go to" },
  ORIENT: { c: "steel", verb: "Review" },
  SEARCH: { c: "steel", verb: "Find" },
  CLICK: { c: "signal", verb: "Click" },
  CHOOSE: { c: "signal", verb: "Select" },
  TYPE: { c: "signal", verb: "Enter" },
  TOGGLE: { c: "signal", verb: "Toggle" },
  SAVE: { c: "result", verb: "Confirm" },
  RESULT: { c: "result", verb: "Result" },
};

const steps = spec.steps.map((s, i) => {
  // A step is EITHER screenshot-backed (img + box) OR a ledger-trace block
  // (s.ledger — a journal-entry posting table). Accounting flows are money
  // movement, not clicks; a Dr/Cr table shows the truth a screenshot can't.
  if (s.img) {
    const im = img(s.img);
    const b = s.box;
    const pct = {
      left: (b.x / im.w) * 100,
      top: (b.y / im.h) * 100,
      w: (b.w / im.w) * 100,
      h: (b.h / im.h) * 100,
    };
    return { ...s, n: i + 1, im, pct, meta: ACTION_META[s.action] || ACTION_META.CLICK };
  }
  return { ...s, n: i + 1, meta: ACTION_META[s.action] || ACTION_META.CLICK };
});

// ---- flow map --------------------------------------------------------------
const flowMap = steps
  .map(
    (s) => `
      <li class="flow-node">
        <span class="flow-num">${String(s.n).padStart(2, "0")}</span>
        <span class="flow-label">${esc(s.title)}</span>
      </li>`
  )
  .join('<li class="flow-arrow" aria-hidden="true">→</li>');

// ---- ledger figure (journal-entry posting table) --------------------------
// Renders a Dr/Cr trace in place of a screenshot for accounting-flow steps.
// `ledger`: { title, lines: [{code,name,dr,cr}], note?, totals?:{dr,cr} }.
function ledgerFigure(l) {
  const rows = (l.lines || [])
    .map(
      (r) => `
        <tr>
          <td class="je-code">${esc(r.code || "")}</td>
          <td class="je-name">${esc(r.name || "")}</td>
          <td class="je-amt je-dr">${r.dr ? esc(String(r.dr)) : ""}</td>
          <td class="je-amt je-cr">${r.cr ? esc(String(r.cr)) : ""}</td>
        </tr>`
    )
    .join("");
  const totals =
    l.totals && (l.totals.dr || l.totals.cr)
      ? `<tfoot><tr>
           <td></td><td class="je-total-label">Balanced</td>
           <td class="je-amt je-dr">${esc(String(l.totals.dr || ""))}</td>
           <td class="je-amt je-cr">${esc(String(l.totals.cr || ""))}</td>
         </tr></tfoot>`
      : "";
  return `
    <figure class="je">
      ${l.title ? `<figcaption class="je-cap">${esc(l.title)}</figcaption>` : ""}
      <table class="je-table">
        <thead><tr><th>Code</th><th>Account</th><th class="je-amt">Debit</th><th class="je-amt">Credit</th></tr></thead>
        <tbody>${rows}</tbody>
        ${totals}
      </table>
      ${l.note ? `<p class="je-note">${esc(l.note)}</p>` : ""}
    </figure>`;
}

// ---- table figure (reference / config table) ------------------------------
// Renders a headed table in place of a screenshot for reference steps (env vars,
// config knobs, permission matrices). `table`: { title?, columns:[...],
// rows:[[...]], note? }. The FIRST cell of each row renders as a code/key.
function tableFigure(t) {
  const head = (t.columns || [])
    .map((c, i) => `<th${i === 0 ? ' class="rt-key"' : ""}>${esc(String(c))}</th>`)
    .join("");
  const body = (t.rows || [])
    .map(
      (row) =>
        `<tr>${row
          .map((cell, i) =>
            i === 0
              ? `<td class="rt-key"><code>${esc(String(cell))}</code></td>`
              : `<td>${esc(String(cell))}</td>`
          )
          .join("")}</tr>`
    )
    .join("");
  return `
    <figure class="rt">
      ${t.title ? `<figcaption class="rt-cap">${esc(t.title)}</figcaption>` : ""}
      <div class="rt-scroll">
        <table class="rt-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      ${t.note ? `<p class="rt-note">${esc(t.note)}</p>` : ""}
    </figure>`;
}

// ---- step cards ------------------------------------------------------------
const stepCards = steps
  .map((s) => {
    let figure;
    if (s.ledger) {
      figure = ledgerFigure(s.ledger);
    } else if (s.table) {
      figure = tableFigure(s.table);
    } else {
      // pin sits at the box's top-left, nudged out; if the box hugs the top edge,
      // drop the pin just inside so it never clips off the figure.
      const pinTop = s.pct.top < 6 ? s.pct.top + 0.5 : s.pct.top;
      const labelBelow = s.pct.top < 12; // put the floating label under boxes near the top
      figure = `
        <figure class="shot">
          <div class="shot-frame" style="aspect-ratio:${s.im.w} / ${s.im.h}">
            <img src="${s.im.uri}" alt="${esc(s.title)}" loading="lazy" decoding="async" width="${s.im.w}" height="${s.im.h}" />
            <span class="callout" style="left:${s.pct.left.toFixed(3)}%;top:${pinTop.toFixed(3)}%;width:${s.pct.w.toFixed(3)}%;height:${s.pct.h.toFixed(3)}%"></span>
            <span class="callout-pin" style="left:${s.pct.left.toFixed(3)}%;top:${pinTop.toFixed(3)}%">${s.n}</span>
            <span class="callout-tag ${labelBelow ? "callout-tag--below" : ""}" style="left:${s.pct.left.toFixed(3)}%;top:${labelBelow ? (pinTop + s.pct.h).toFixed(3) : pinTop.toFixed(3)}%">${esc(s.tag || s.meta.verb)}</span>
          </div>
        </figure>`;
    }
    return `
    <article class="step step--${s.meta.c}" id="step-${s.n}">
      <div class="step-rail" aria-hidden="true">
        <span class="pin">${s.n}</span>
      </div>
      <div class="step-body">
        <p class="kicker"><span class="kicker-step">STEP ${String(s.n).padStart(2, "0")}</span><span class="kicker-dot">·</span><span class="kicker-act">${s.action}</span></p>
        <h3 class="step-title">${esc(s.title)}</h3>
        <p class="narration" data-i18n="step-${s.n}" lang="en">${esc(s.narration)}</p>
        ${figure}
      </div>
    </article>`;
  })
  .join("\n");

// ---- translatable payload (for the video / i18n pipeline) ------------------
const i18nPayload = {
  module: spec.module,
  slug: spec.slug,
  branchContext: spec.branchContext,
  locales: ["en"],
  steps: steps.map((s) => ({
    id: `step-${s.n}`,
    order: s.n,
    action: s.action,
    ui: s.title,
    narration: { en: s.narration },
    target: s.tag || s.meta.verb,
  })),
};

const html = `<style>
:root{
  --ink:#16181D; --ink-soft:#2A2D35;
  --paper:#EFEEEA; --paper-2:#E6E4DE;
  --card:#FFFFFF;
  --signal:#FF5A1F; --signal-ink:#B23A0E;
  --steel:#2B4C6F; --steel-soft:#4A6D91;
  --result:#1F7A4D;
  --mute:#6B6C70; --line:#D8D6CE;
  --mono:ui-monospace,"Cascadia Code","SF Mono",Menlo,Consolas,monospace;
  --sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
*{box-sizing:border-box}
body{margin:0}
.page{
  background:var(--paper);
  color:var(--ink);
  font-family:var(--sans);
  font-size:16px;line-height:1.55;
  -webkit-font-smoothing:antialiased;
  padding:clamp(20px,4vw,56px) clamp(16px,4vw,48px) 72px;
}
.wrap{max-width:1080px;margin:0 auto}

/* ---------- hero ---------- */
.hero{
  border:1px solid var(--line);
  background:
    linear-gradient(180deg,#fff, #fbfaf7);
  border-radius:18px;
  padding:clamp(24px,3.5vw,44px);
  position:relative;overflow:hidden;
}
.hero::before{
  content:"";position:absolute;inset:0;
  background:radial-gradient(120% 140% at 100% 0%, rgba(43,76,111,.06), transparent 55%);
  pointer-events:none;
}
.back-link{
  font-family:var(--mono);font-size:12px;letter-spacing:.06em;text-decoration:none;
  color:var(--mute);display:inline-block;margin:0 0 12px;
}
.back-link:hover{color:var(--signal-ink)}
.eyebrow{
  font-family:var(--mono);font-size:12px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--steel);margin:0 0 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;
}
.eyebrow .dot{width:5px;height:5px;border-radius:50%;background:var(--signal);display:inline-block}
h1{
  font-size:clamp(30px,5vw,50px);line-height:1.02;letter-spacing:-.02em;
  margin:0 0 12px;font-weight:800;text-wrap:balance;
}
.lede{font-size:clamp(16px,1.6vw,19px);color:var(--ink-soft);max-width:60ch;margin:0 0 22px}
.meta-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.chip{
  font-family:var(--mono);font-size:12px;letter-spacing:.03em;
  border:1px solid var(--line);background:#fff;border-radius:999px;
  padding:6px 12px;color:var(--ink-soft);display:inline-flex;gap:7px;align-items:center;
}
.chip b{color:var(--ink);font-weight:600}
.chip .ring{width:11px;height:11px;border-radius:3px;border:2px solid var(--signal);display:inline-block}

/* ---------- flow map ---------- */
.flowmap{
  margin:26px 0 8px;border:1px solid var(--line);background:var(--card);
  border-radius:14px;padding:16px 18px;overflow-x:auto;
}
.flowmap h2{font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--mute);margin:0 0 12px}
.flow{list-style:none;display:flex;align-items:center;gap:8px;margin:0;padding:0;min-width:max-content}
.flow-node{display:flex;align-items:center;gap:9px;background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:8px 12px}
.flow-num{font-family:var(--mono);font-size:12px;font-weight:700;color:#fff;background:var(--steel);border-radius:6px;padding:2px 7px;font-variant-numeric:tabular-nums}
.flow-label{font-size:13px;font-weight:600;white-space:nowrap;color:var(--ink)}
.flow-arrow{color:var(--steel-soft);font-size:16px}

/* ---------- steps ---------- */
.steps{margin-top:30px}
.step{display:grid;grid-template-columns:52px 1fr;gap:clamp(12px,2vw,22px);position:relative}
.step-rail{display:flex;flex-direction:column;align-items:center;position:relative}
.step-rail::before{content:"";position:absolute;top:44px;bottom:-30px;width:2px;background:linear-gradient(var(--line),var(--line));left:calc(50% - 1px)}
.step:last-child .step-rail::before{display:none}
.pin{
  width:42px;height:42px;border-radius:12px;display:grid;place-items:center;
  font-family:var(--mono);font-weight:700;font-size:18px;color:#fff;
  background:var(--steel);box-shadow:0 4px 12px rgba(22,24,29,.16);
  font-variant-numeric:tabular-nums;position:relative;z-index:1;
}
.step--signal .pin{background:var(--signal)}
.step--result .pin{background:var(--result)}
.step-body{padding-bottom:38px;min-width:0}
.kicker{font-family:var(--mono);font-size:12px;letter-spacing:.08em;margin:6px 0 4px;display:flex;gap:8px;align-items:center;text-transform:uppercase}
.kicker-step{color:var(--mute)}
.kicker-dot{color:var(--line)}
.kicker-act{color:var(--steel);font-weight:700}
.step--signal .kicker-act{color:var(--signal-ink)}
.step--result .kicker-act{color:var(--result)}
.step-title{font-size:clamp(19px,2.3vw,24px);line-height:1.2;letter-spacing:-.01em;margin:0 0 8px;font-weight:700;text-wrap:balance}
.narration{margin:0 0 16px;color:var(--ink-soft);max-width:64ch;font-size:15.5px}

/* ---------- screenshot + callout ---------- */
.shot{margin:0}
.shot-frame{
  position:relative;border-radius:12px;overflow:hidden;
  border:1px solid var(--line);background:var(--paper-2);
  box-shadow:0 1px 2px rgba(22,24,29,.05),0 12px 28px rgba(22,24,29,.09);
  width:100%;
}
.shot-frame img{display:block;width:100%;height:auto}
/* ---------- ledger (journal-entry) figure ---------- */
.je{margin:0;background:var(--card);border:1px solid var(--line);border-radius:14px;
  overflow:hidden;box-shadow:0 1px 2px rgba(22,24,29,.05),0 12px 28px rgba(22,24,29,.09)}
.je-cap{font-weight:650;font-size:.92rem;color:var(--ink);padding:14px 18px 10px;
  border-bottom:1px solid var(--line);letter-spacing:-.01em}
.je-table{width:100%;border-collapse:collapse;font-size:.9rem}
.je-table thead th{text-align:left;font-weight:600;font-size:.72rem;letter-spacing:.06em;
  text-transform:uppercase;color:var(--mute);padding:10px 18px;background:var(--paper-2)}
.je-table th.je-amt,.je-table td.je-amt{text-align:right;font-variant-numeric:tabular-nums}
.je-table tbody td{padding:9px 18px;border-top:1px solid var(--line);color:var(--ink-soft)}
.je-code{font-family:ui-monospace,"SF Mono",Menlo,monospace;color:var(--steel);font-weight:600}
.je-name{color:var(--ink)}
.je-dr{color:var(--signal-ink);font-weight:600}
.je-cr{color:var(--result);font-weight:600}
.je-table tfoot td{padding:10px 18px;border-top:2px solid var(--ink-soft);font-weight:700;background:var(--paper)}
.je-total-label{font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.je-note{margin:0;padding:12px 18px;font-size:.85rem;color:var(--mute);border-top:1px dashed var(--line);background:var(--paper-2)}
/* ---------- reference / config table figure ---------- */
.rt{margin:0;background:var(--card);border:1px solid var(--line);border-radius:14px;
  overflow:hidden;box-shadow:0 1px 2px rgba(22,24,29,.05),0 12px 28px rgba(22,24,29,.09)}
.rt-cap{font-weight:650;font-size:.92rem;color:var(--ink);padding:14px 18px 10px;
  border-bottom:1px solid var(--line);letter-spacing:-.01em}
.rt-scroll{overflow-x:auto}
.rt-table{width:100%;border-collapse:collapse;font-size:.88rem}
.rt-table thead th{text-align:left;font-weight:600;font-size:.72rem;letter-spacing:.06em;
  text-transform:uppercase;color:var(--mute);padding:10px 18px;background:var(--paper-2);white-space:nowrap}
.rt-table tbody td{padding:9px 18px;border-top:1px solid var(--line);color:var(--ink-soft);vertical-align:top}
.rt-table td.rt-key,.rt-table th.rt-key{white-space:nowrap}
.rt-table code{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:.82rem;
  color:var(--steel);font-weight:600;background:var(--paper);padding:2px 6px;border-radius:5px}
.rt-note{margin:0;padding:12px 18px;font-size:.85rem;color:var(--mute);border-top:1px dashed var(--line);background:var(--paper-2)}
.callout{
  position:absolute;border-radius:7px;
  border:2.5px solid var(--signal);
  box-shadow:0 0 0 3px rgba(255,90,31,.28), 0 0 0 9999px rgba(20,22,28,.42);
  pointer-events:none;
}
.step--steel .callout{border-color:var(--steel);box-shadow:0 0 0 3px rgba(43,76,111,.25),0 0 0 9999px rgba(20,22,28,.42)}
.step--result .callout{border-color:var(--result);box-shadow:0 0 0 3px rgba(31,122,77,.25),0 0 0 9999px rgba(20,22,28,.42)}
.callout-pin{
  position:absolute;transform:translate(-52%,-52%);
  width:26px;height:26px;border-radius:50%;background:var(--signal);color:#fff;
  font-family:var(--mono);font-weight:700;font-size:13px;display:grid;place-items:center;
  box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid #fff;z-index:3;
  font-variant-numeric:tabular-nums;
}
.step--steel .callout-pin{background:var(--steel)}
.step--result .callout-pin{background:var(--result)}
.callout-tag{
  position:absolute;transform:translate(-4px,calc(-100% - 10px));
  font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.04em;
  background:var(--signal);color:#fff;padding:4px 9px;border-radius:6px;white-space:nowrap;
  box-shadow:0 3px 10px rgba(0,0,0,.28);z-index:3;text-transform:uppercase;
}
.callout-tag--below{transform:translate(-4px,12px)}
.step--steel .callout-tag{background:var(--steel)}
.step--result .callout-tag{background:var(--result)}

/* ---------- ring pulse ---------- */
@media (prefers-reduced-motion:no-preference){
  .callout-pin{animation:pulse 2.6s ease-out infinite}
  @keyframes pulse{
    0%{box-shadow:0 0 0 0 rgba(255,90,31,.5),0 2px 8px rgba(0,0,0,.35)}
    70%{box-shadow:0 0 0 12px rgba(255,90,31,0),0 2px 8px rgba(0,0,0,.35)}
    100%{box-shadow:0 0 0 0 rgba(255,90,31,0),0 2px 8px rgba(0,0,0,.35)}
  }
}

/* ---------- footer ---------- */
.foot{
  margin-top:44px;border-top:1px solid var(--line);padding-top:24px;
  display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;
}
.foot p{margin:0;color:var(--mute);font-size:13.5px;max-width:60ch}
.foot .mono{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--steel);display:block;margin-bottom:6px}
.badge{font-family:var(--mono);font-size:11px;border:1px solid var(--line);border-radius:8px;padding:8px 12px;color:var(--ink-soft);background:#fff}

:focus-visible{outline:2px solid var(--signal);outline-offset:2px;border-radius:4px}
@media (max-width:640px){
  .step{grid-template-columns:38px 1fr}
  .pin{width:34px;height:34px;font-size:15px;border-radius:10px}
  .step-rail::before{top:38px}
}
</style>

<div class="page">
  <div class="wrap">
    <header class="hero">
      <a class="back-link" href="../../index.html">&larr; All guides</a>
      <p class="eyebrow"><span class="dot"></span>ERP by Classytic &nbsp;·&nbsp; Operator Guide &nbsp;·&nbsp; ${esc(spec.section)}</p>
      <h1>${esc(spec.module)}</h1>
      <p class="lede">${esc(spec.lede)}</p>
      <div class="meta-row">
        <span class="chip"><b>${steps.length}</b> steps</span>
        <span class="chip"><b>Branch</b> ${esc(spec.branchContext)}</span>
        <span class="chip"><span class="ring"></span> callout = where to click</span>
        <span class="chip"><b>EN</b> &nbsp;·&nbsp; translation-ready</span>
      </div>
    </header>

    <section class="flowmap" aria-label="Task flow">
      <h2>Flow — ${esc(spec.slug)}</h2>
      <ol class="flow">${flowMap}</ol>
    </section>

    <main class="steps">
${stepCards}
    </main>

    <footer class="foot">
      <p><span class="mono">Video / translation ready</span>Every step carries a single narration line, tagged <code>data-i18n</code> and mirrored in the embedded JSON below. Swap the <code>narration.en</code> strings for Bangla (or any locale) and drive a voiceover + screen-pan render straight from the step boxes.</p>
      <span class="badge">${esc(spec.slug)}.v1 · ${steps.length} steps · EN</span>
    </footer>
  </div>
</div>

<script type="application/json" id="guide-steps">
${JSON.stringify(i18nPayload, null, 2)}
</script>`;

fs.writeFileSync(path.join(DIR, spec.out), html);
console.log("wrote", spec.out, (Buffer.byteLength(html) / 1024).toFixed(0) + "KB");
