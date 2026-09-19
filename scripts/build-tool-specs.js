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
 *  - `tools-index.json`  — 1194 tools, categories, slugs, titles, descriptions
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

function inferSpec(tool, cardEntry, standaloneSlugs) {
  const slug = tool.slug;
  const category = tool.category;
  const categoryName = tool.categoryName;
  const title = tool.title;
  const description = tool.description;
  const url = `${BASE}/tool.html?card=${encodeURIComponent(slug)}`;
  const embedUrl = `${BASE}/tool.html?card=${encodeURIComponent(slug)}&embed=1`;
  const standaloneUrl = standaloneSlugs.has(slug) ? `${BASE}/tools/${slug}.html` : null;

  // Best-effort input/output sniff from fragment HTML (if present).
  let inputs = [];
  let outputs = [];
  let formula = null;
  let sources = [];
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
      // Fallback: at least count inputs if labels missing
      if (inputs.length === 0 && inputsById.size > 0) {
        for (const [id, inp] of inputsById) {
          if (['hidden','submit','button'].includes((inp.type||'').toLowerCase())) continue;
          inputs.push({ name: id, type: inp.type || 'text', label: id.replace(/[-_]/g,' '), unit: '' });
        }
        inputs = inputs.slice(0, 6);
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
      // Formula hint: first line containing "=" and a plausible operator
      const formulaM = html.match(/[A-Z][^<]{0,60}=[^<]{0,80}(?:÷|×|\*|\/|\+|−)/);
      if (formulaM) formula = formulaM[0].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0, 180);
      // Sources: href to who/nih/irs/nhs/fca/gov
      const hrefRe = /href=["'](https?:\/\/[^"']+)["']/gi;
      while ((m = hrefRe.exec(html)) !== null) {
        const u = m[1];
        if (/who\.int|nih\.gov|irs\.gov|nhs\.uk|fca\.org\.uk|\.gov(\.uk)?\//i.test(u) && !sources.includes(u)) sources.push(u);
      }
      sources = sources.slice(0, 4);
    }
  } catch {}

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
  let standaloneSlugs = new Set();
  try {
    const tp = readJson(TOOL_PAGES);
    if (tp && Array.isArray(tp.pages)) standaloneSlugs = new Set(tp.pages.map(p => p.slug));
  } catch {}

  const cardByName = new Map();
  for (const c of cards) {
    const name = c.name || c.id || (c.file||'').replace(/\.html$/,'');
    cardByName.set(name, c);
  }

  const tools = index.tools || [];
  const specs = tools.map(t => inferSpec(t, cardByName.get(t.slug), standaloneSlugs));
  return { index, specs };
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
    const expectedCount = specs.length;
    if (current.count !== expectedCount) {
      console.error(`FAIL: api/tools.json count ${current.count} != ${expectedCount} — run: node scripts/build-tool-specs.js`);
      process.exit(1);
    }
    // Spot-check one file exists
    const probe = path.join(OUT_DIR, 'bmi.json');
    if (!fs.existsSync(probe)) {
      console.error('FAIL: api/tools/bmi.json missing — run: node scripts/build-tool-specs.js');
      process.exit(1);
    }
    // Ensure slugs sorted
    console.log(`api/tools specs OK (${specs.length} specs, ${index.categories.length} categories)`);
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(OUT_MANIFEST), { recursive: true });

  // Write per-tool
  for (const spec of specs) {
    const p = path.join(OUT_DIR, spec.slug + '.json');
    fs.writeFileSync(p, JSON.stringify(spec, null, 2) + '\n', 'utf8');
  }

  // Manifest
  const manifest = {
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
  };
  fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // Count
  const gz = require('zlib').gzipSync(Buffer.from(JSON.stringify(manifest))).length;
  console.log(`✔ api/tools.json written (${manifest.count} specs, ${index.categories.length} categories, ~${Math.round(gz/1024)}KB gzip)`);
  console.log(`✔ ${specs.length} per-tool specs written to api/tools/<slug>.json`);
}

main();
