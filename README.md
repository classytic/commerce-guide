# BigBoss Commerce — Module Guides

Guidde/Scribe-style, click-by-click visual walkthroughs of the BigBoss Commerce
admin dashboard. **One self-contained HTML file per module**, built from live
screenshots of the running app with annotated callout boxes and
translation-ready narration — designed to later drive multi-language video
tutorials.

## Layout

```
modules/<name>/
  spec.json          # step definitions (actions, narration, callout boxes)
  screenshots/*.png  # raw captures from agent-browser
  <name>.html        # BUILT output — open in any browser, fully offline
tools/
  build-doc.js       # spec.json + screenshots -> one HTML file
```

## Build

```bash
node tools/build-doc.js modules/accounting/spec.json
# -> writes modules/accounting/accounting.html
```

The HTML embeds every screenshot as a data URI, so a single file is portable
(email it, host it, open it offline).

## Capture convention

Screenshots are taken with [agent-browser](https://www.npmjs.com/package/agent-browser)
against the running dev server (`localhost:3000`).

- **Viewport-only screenshots** (the default going forward): `agent-browser
  screenshot <path>` (NO `--full`). Each step image is the visible viewport
  (~1264×569) — keeps images short. Scroll the target into view first, then read
  its box; box coords are **viewport-relative** (do NOT add scroll offset):

  ```js
  const r = el.getBoundingClientRect();
  const box = { x: Math.round(r.left), y: Math.round(r.top),
                w: Math.round(r.width), h: Math.round(r.height) };
  ```

- **Full-page screenshots** (`--full`, used only for `accounting/`): the image is
  the whole document; box coords add the scroll offset
  (`r.left + scrollX`, `r.top + scrollY`).

`build-doc.js` derives the callout position as a percentage of each image's
natural size, so it is agnostic to which mode produced the shot.

## Translation / video pipeline

Each built page carries a `<script type="application/json" id="guide-steps">`
block: `{ module, slug, steps: [{ id, order, action, ui, narration: { en },
target }] }`. Add locales (e.g. `narration.bn`) and render a voiceover + a
pan-to-callout animation straight from the step boxes.
