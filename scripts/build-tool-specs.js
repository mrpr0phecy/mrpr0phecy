#!/usr/bin/env node
/**
 * build-tool-specs.js — pointer #4 (AI-agent readability)
 *
 * Emits a machine-readable spec per tool so ChatGPT/Claude/Perplexity can
 * call `bmi_calculator({height, weight})` and get a clean answer without
 * scraping HTML.
 *
 * Design constraints (CONSTRAINTS.md):
 *  - Never change URLs or delete tools. This only *adds* files under `api/`.
 *  - Generated artefacts are only written by their generator.
 *  - No secrets, no network at runtime, CORS-open by being static.
 *
 * Sources: the two existing manifests are the single source of truth:
 *  - `tools-index.json`  — 1250 tools, categories, slugs, titles, descriptions
 *  - `cards/cards.json`  — path field for fragment location
 *
 * Output:
 *  - `api/tools.json`            — manifest with counts + per-tool summary
 *  - `api/tools/<slug>.json`     — one JSON spec per tool
 *
 * Per-tool shape (minimum viable per pointer #4):
 *  {
 *    "slug": "bmi",
 *    "title": "BMI Calculator",
 *    "description": "...",
 *    "category": "health-and-fitness",
 *    "categoryName": "Health & Fitness",
 *    "url": "https://www.themostusefulsiteintheworld.com/tool.html?card=bmi",
 *    "embedUrl": "https://www.themostusefulsiteintheworld.com/tool.html?card=bmi&embed=1",
 *    "standaloneUrl": "https://www.themostusefulsiteintheworld.com/tools/bmi.html" | null,
 *    "inputs": [ {name, type, label, unit} ],   // best-effort inferred
 *    "outputs": [ {name, type} ],
 *    "formula": "BMI = kg / m² (WHO)",
 *    "sources": ["https://www.who.int/..."],
 *    "version": "2026-09-19"
 *  }
 *
 * Inputs/outputs are *inferred* from the fragment HTML where possible
 * (labels + input[type] + units in prose). Where inference is uncertain we
 * leave the arrays empty and describe the tool as `interactive` — still
 * callable as "open this URL", which is the honest fallback for a visual
 * tool that has no single formula.
 *
 * Usage:
 *   node scripts/build-tool-specs.js
 *   node scripts/build-tool-specs.js --check
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_JSON = path.join(ROOT, 'tools-index.json');
const CARDS_JSON = path.join(ROOT, 'cards', 'cards.json');
const TOOL_PAGES = path.join(ROOT, 'scripts', 'tool-pages.json');
const OUT_DIR = path.join(ROOT, 'api', 'tools');
const OUT_MANIFEST = path.join(ROOT, 'api', 'tools.json');

const BASE = 'https://www.themostusefulsiteintheworld.com';

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// Cards whose fragment scan threw: filled in by the per-card builder below and
// reported by main() instead of being swallowed by an empty catch.
const scanFailures = [];

function inferSpec(tool, cardEntry, standalonePaths) {
  const slug = tool.slug;
  const category = tool.category;
  const categoryName = tool.categoryName;
  const title = tool.title;
  const description = tool.description;
  const url = `${BASE}/tool.html?card=${encodeURIComponent(slug)}`;
  const embedUrl = `${BASE}/tool.html?card=${encodeURIComponent(slug)}&embed=1`;
  // The page path comes from scripts/tool-pages.json, never from the slug:
  // the compound-interest page is declared at `tools/compound-interest.html`
  // while its card slug is `compoundinterest`, and guessing `tools/${slug}`
  // published a standaloneUrl that 404s (api/tools/compoundinterest.json,
  // llms-full.txt and every agent that trusted it).
  const standalonePath = standalonePaths.get(slug);
  const standaloneUrl = standalonePath ? `${BASE}/${standalonePath}` : null;

  // HTML entities a formula is allowed to need. Without these the published
  // text says `&radic;` and `&pi;` where the curated formulas above say ÷ and −.
  const ENTITIES = {
    divide: '÷', times: '×', minus: '−', nbsp: ' ', amp: '&', lt: '<', gt: '>',
    le: '≤', ge: '≥', ne: '≠', plusmn: '±', deg: '°', sup2: '²', sup3: '³',
    pi: 'π', radic: '√', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ',
    lambda: 'λ', mu: 'μ', omega: 'ω', sigma: 'σ', sum: '∑', infin: '∞', asymp: '≈',
    middot: '·', permil: '‰', prime: '′', Prime: '″', laquo: '«', raquo: '»',
  };
  const VULGAR_FRACTION = {
    12: '½', 13: '⅓', 23: '⅔', 14: '¼', 34: '¾', 15: '⅕', 25: '⅖', 35: '⅗', 45: '⅘',
    16: '⅙', 56: '⅚', 18: '⅛', 38: '⅜', 58: '⅝', 78: '⅞',
  };

  // Cards whose fragment scan threw: collected here, reported by main() at the
  // end rather than swallowed. This catch used to be empty and it hid a
  // ReferenceError that blanked every formula and source on the cards whose
  // text contains an HTML entity — the specs were regenerated twice before
  // anyone noticed. A scan must never fail quietly.
  // Best-effort input/output sniff from fragment HTML (if present).
  let inputs = [];
  let outputs = [];
  let formula = null;
  let sources = [];
  let scanError = null;
  try {
    const fragPath = path.join(ROOT, cardEntry && cardEntry.path ? cardEntry.path : `cards/${slug}.html`);
    if (fs.existsSync(fragPath)) {
      const html = fs.readFileSync(fragPath, 'utf8');
      // Input labels: <label for=...>Text</label>  +  <input ... id=...>
      const labelRe = /<label[^>]*for=["']([^"']+)["'][^>]*>(.*?)<\/label>/gis;
      const inputRe = /<input[^>]*>/gis;
      const inputsById = new Map();
      let m;
      while ((m = inputRe.exec(html)) !== null) {
        const tag = m[0];
        const id = (tag.match(/\bid=["']([^"']+)["']/i) || [])[1] || '';
        const type = (tag.match(/\btype=["']([^"']+)["']/i) || [])[1] || 'text';
        const placeholder = (tag.match(/\bplaceholder=["']([^"']+)["']/i) || [])[1] || '';
        if (id) inputsById.set(id, { id, type, placeholder });
      }
      while ((m = labelRe.exec(html)) !== null) {
        const id = m[1];
        const label = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
        const inp = inputsById.get(id);
        if (inp && label) {
          // Skip hidden / submit buttons in inputs list:
          if (['hidden','submit','button'].includes((inp.type||'').toLowerCase())) continue;
          inputs.push({ name: id, type: inp.type || 'number', label, unit: '' });
        }
      }
      // Fill the gaps: a card commonly labels one input and leaves the rest
      // bare, and the old fallback only ran when NOTHING was labelled — so
      // giving summary-generator's slider a `for=` (a real accessibility fix)
      // silently dropped its four option checkboxes from the published spec.
      // Labelled inputs keep their label; the rest are named by their id.
      for (const [id, inp] of inputsById) {
        if (inputs.length >= 8) break;
        if (inputs.find(i => i.name === id)) continue;
        if (['hidden','submit','button'].includes((inp.type||'').toLowerCase())) continue;
        inputs.push({ name: id, type: inp.type || 'text', label: id.replace(/[-_]/g,' '), unit: '' });
      }
      // Outputs: look for id containing result/output/value
      const outRe = /\bid=["']([^"']*(?:result|output|value|answer)[^"']*)["']/gi;
      while ((m = outRe.exec(html)) !== null) {
        const id = m[1];
        if (!inputs.find(i => i.name === id)) {
          outputs.push({ name: id, type: 'number' });
        }
      }
      outputs = outputs.slice(0, 8);
      // Formula hint: first line containing "=" and a plausible operator —
      // read from the page a VISITOR can see. Scanning the raw file also
      // scanned the card's <script>, and `[A-Z]…=` matches JS assignments
      // happily: on 2026-09-22 this published `ElementById(id);}; var
      // TAU=Math.PI*` as the formula of 3d-spirograph-nebula, `Date());};
      // to.value=iso(new Date())` as age-calculator's, and JS source as the
      // `formula` of 1,017 of the 1,250 tools — a field agents.html tells
      // outside agents is "one tool's formula".
      // Tags and attributes go too: `[^<]` still lets a match run from a text
      // node into `style="width:100%;"` or a placeholder attribute, which is
      // how `Request approval for Q2 marketing budget" style="width:100%;" /`
      // became a formula.
      const visible = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        // Inline handlers first: `onclick="…if (i > 0)…"` hides a `>` inside a
        // quoted attribute, which ends the tag regex early and leaks the JS
        // out as text — that is how `Each(function(block){var ans=parseInt(…)`
        // was still being published after the script blocks were removed.
        .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, ' ')
        .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&frac(\d)(\d);/g, (_, a, b) => VULGAR_FRACTION[a + b] || a + '/' + b)
        .replace(/&([a-z]+);/gi, (whole, e) => ENTITIES[e] || ENTITIES[e.toLowerCase()] || whole);
      const formulaM = visible.match(/[A-Z][^<]{0,60}=[^<]{0,80}(?:÷|×|\*|\/|\+|−)/);
      if (formulaM) formula = formulaM[0].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0, 180);
      // Sources: href to who/nih/irs/nhs/fca/gov
      const hrefRe = /href=["'](https?:\/\/[^"']+)["']/gi;
      while ((m = hrefRe.exec(html)) !== null) {
        const u = m[1];
        if (/who\.int|nih\.gov|irs\.gov|nhs\.uk|fca\.org\.uk|\.gov(\.uk)?\//i.test(u) && !sources.includes(u)) sources.push(u);
      }
      sources = sources.slice(0, 4);
    }
  } catch (e) {
    // This catch used to be empty; it swallowed a ReferenceError that silently
    // blanked every formula and source on cards whose text contained an HTML
    // entity, and the specs were regenerated twice before anyone noticed. Never
    // let a scan fail quietly.
    scanError = (e && e.message) || String(e);
    scanFailures.push({ slug, message: scanError });
  }

  // Curated formulas for the deepest YMYL tools (prevents the regex grabbing `let x =` assignments).
  const CURATED_FORMULA = {
    'bmi': 'BMI = weight(kg) ÷ height(m)² — WHO classification: <18.5 underweight, 18.5–24.9 normal, 25–29.9 overweight, ≥30 obese.',
    'bmr': 'Mifflin-St Jeor: men 10·w + 6.25·h − 5·a + 5; women 10·w + 6.25·h − 5·a − 161 (w=kg, h=cm, a=years).',
    'a1c-average-glucose-converter': 'eAG(mg/dL) = 28.7 × HbA1c(%) − 46.7 — NGSP/DCCT; eAG(mmol/L) = 1.59 × A1c − 2.59.',
    'loan': 'M = P·r·(1+r)ⁿ ÷ ((1+r)ⁿ − 1), r=annual/12, n=years×12.',
    'mortgage': 'M = P·r·(1+r)ⁿ ÷ ((1+r)ⁿ − 1), r=annual/12, n=years×12.',
    'compoundinterest': 'A = P·(1 + r/n)^(n·t) — compound interest.',
    'percentages': 'part = whole × percent ÷ 100.',
    'bodyfat': 'US Navy: %fat from neck/waist/hip circumferences and height (log₁₀).',
  };
  if (CURATED_FORMULA[slug]) formula = CURATED_FORMULA[slug];
  // Regex fallback captured JS assignments — discard and fall back.
  if (formula && /^\s*(let|var|const)\s/.test(formula)) formula = null;
  if (formula && formula.length > 180) formula = formula.slice(0, 180) + '…';

  // Sensible defaults where inference found nothing: describe as interactive.
  if (!formula && /calculator|converter/i.test(title)) {
    formula = 'Interactive — open the URL and enter your values; result is computed client-side.';
  }

  return {
    slug,
    title,
    description: String(description || '').replace(/\s+/g,' ').trim(),
    category,
    categoryName,
    url,
    embedUrl,
    standaloneUrl,
    inputs: inputs.slice(0, 8),
    outputs: outputs.slice(0, 8),
    formula: formula || 'Interactive browser tool — no single closed-form formula (see description).',
    sources,
    tags: tool.tags || [],
    popularity: tool.popularity || 0,
    featured: !!tool.featured,
    updated: tool.updated || '2026-09-19',
    version: '2026-09-19',
  };
}

function build() {
  const index = readJson(INDEX_JSON);
  const cards = readJson(CARDS_JSON);
  const standalonePaths = new Map();
  try {
    const tp = readJson(TOOL_PAGES);
    if (tp && Array.isArray(tp.pages)) {
      for (const p of tp.pages) if (p && p.slug && p.path) standalonePaths.set(p.slug, p.path);
    }
  } catch {}

  const cardByName = new Map();
  for (const c of cards) {
    const name = c.name || c.id || (c.file||'').replace(/\.html$/,'');
    cardByName.set(name, c);
  }

  const tools = index.tools || [];
  const specs = tools.map(t => inferSpec(t, cardByName.get(t.slug), standalonePaths));
  return { index, specs };
}

/** The bytes of one spec file. One writer, used by both build and --check. */
function specText(spec) {
  return JSON.stringify(spec, null, 2) + '\n';
}

/** The bytes of the manifest. One writer, used by both build and --check. */
function manifestText(index, specs) {
  return JSON.stringify({
    version: index.version || '2026-09-19',
    count: specs.length,
    categories: index.categories,
    tools: specs.map(s => ({
      slug: s.slug,
      title: s.title,
      description: s.description,
      category: s.category,
      categoryName: s.categoryName,
      url: s.url,
      embedUrl: s.embedUrl,
      standaloneUrl: s.standaloneUrl,
      inputs: s.inputs,
      outputs: s.outputs,
      formula: s.formula,
      sources: s.sources,
      tags: s.tags,
      popularity: s.popularity,
      featured: s.featured,
      updated: s.updated,
    })),
  }, null, 2) + '\n';
}

function main() {
  const isCheck = process.argv.includes('--check');
  const { index, specs } = build();

  if (isCheck) {
    if (!fs.existsSync(OUT_MANIFEST)) {
      console.error('FAIL: api/tools.json missing — run: node scripts/build-tool-specs.js');
      process.exit(1);
    }
    const current = readJson(OUT_MANIFEST);
    if (current.count !== specs.length) {
      console.error(`FAIL: api/tools.json count ${current.count} != ${specs.length} — run: node scripts/build-tool-specs.js`);
      process.exit(1);
    }
    // Content, not just the count. This check used to compare the number of
    // tools and the existence of api/tools/bmi.json and nothing else, so eight
    // per-tool specs (sleep, earthing-calculator, therapy-values-time-gap and
    // five others) sat stale in the repository: their committed "formula" and
    // "outputs" disagreed with the fragments they are generated from, and the
    // gate still said OK. A spec guarded only by a spot-check is not guarded.
    const drifted = [];
    if (fs.readFileSync(OUT_MANIFEST, 'utf8') !== manifestText(index, specs)) drifted.push('api/tools.json');
    for (const spec of specs) {
      const file = path.join(OUT_DIR, spec.slug + '.json');
      let actual = null;
      try { actual = fs.readFileSync(file, 'utf8'); } catch (error) { drifted.push('api/tools/' + spec.slug + '.json (missing)'); continue; }
      if (actual !== specText(spec)) drifted.push('api/tools/' + spec.slug + '.json');
    }
    if (drifted.length) {
      console.error(`FAIL: ${drifted.length} per-tool spec(s) drift from the cards — run: node scripts/build-tool-specs.js`);
      console.error('      ' + drifted.slice(0, 10).join('\n      '));
      process.exit(1);
    }
    console.log(`api/tools specs OK (${specs.length} specs, ${index.categories.length} categories, content matches)`);
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(OUT_MANIFEST), { recursive: true });

  // Write per-tool
  for (const spec of specs) {
    fs.writeFileSync(path.join(OUT_DIR, spec.slug + '.json'), specText(spec), 'utf8');
  }

  fs.writeFileSync(OUT_MANIFEST, manifestText(index, specs), 'utf8');

  // Count
  const manifest = manifestText(index, specs);
  const gz = require('zlib').gzipSync(Buffer.from(manifest)).length;
  console.log(`✔ api/tools.json written (${specs.length} specs, ${index.categories.length} categories, ~${Math.round(gz/1024)}KB gzip)`);
  console.log(`✔ ${specs.length} per-tool specs written to api/tools/<slug>.json`);
  if (scanFailures.length) {
    console.warn(`\n⚠ ${scanFailures.length} card(s) fell back to defaults because their fragment ` +
                 `scan threw — the outputs above are still written, but those specs carry less:`);
    for (const f of scanFailures.slice(0, 10)) console.warn(`    ${f.slug}: ${f.message}`);
    if (scanFailures.length > 10) console.warn(`    ... and ${scanFailures.length - 10} more`);
  }
}

main();
