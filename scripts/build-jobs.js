#!/usr/bin/env node
/**
 * build-jobs.js — the multi-step "jobs": one form, several tools, the numbers
 * carried forward.
 *
 * What a job is
 * -------------
 * A job is a short, hand-built sequence of existing tools for a task people
 * actually do — "Can I afford this home?", "Measure once, decorate the room",
 * "What an hourly rate is really worth". Each step is a *normal tool on
 * tool.html*: it opens as a filled link (`tool.html?card=…&<field>=<value>`),
 * so the visitor can read the URL, share one step, or wander off mid-job
 * without losing anything. The rail above the card (rendered by tool.html from
 * `jobs.json`) shows where they are and carries the answer forward.
 *
 * The site already proves a card cannot be measured from the outside (see
 * ARCHITECTURE.md §3 — the home page stopped running tools). A job is the
 * opposite bet: it never runs a tool beside another one. It carries ONE number
 * out of a card the visitor just used, into the next card, in the URL.
 *
 * Why the definitions live in this file
 * -------------------------------------
 * Same reason `generate-cards-json.js` holds the category lists: a job is
 * curated content about specific cards, and every reference in it is a promise
 * that a control with that id exists. Hand-editing a published JSON would rot
 * the first time a card renamed a field. Here, `validate()` re-reads the cards
 * through `scripts/lib/card-fields.js` on every build and *fails* if a job fills
 * a field that is gone or reads an element the card does not have — so the
 * broken link never ships.
 *
 * Outputs (both generated; never hand-edit):
 *   jobs.json  — the machine-readable job list (tool.html's rail reads it)
 *   jobs.html  — the human page: what jobs are, and a start link for each step
 *
 * Usage:
 *   node scripts/build-jobs.js
 *   node scripts/build-jobs.js --check     # exit 1 if either output is stale
 *
 * Adding a job: add an entry to JOBS, run the build, and the validator will
 * tell you about every id you got wrong. Prefer carrying a value the visitor
 * typed (an input's id) over one the card computed (an output's id): the first
 * is exact, the second is read back out of rendered text.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { readCard, hasRunTrigger } = require('./lib/card-fields.js');

const ROOT = path.join(__dirname, '..');
const CARDS = path.join(ROOT, 'cards');
const OUT_JSON = path.join(ROOT, 'jobs.json');
const OUT_HTML = path.join(ROOT, 'jobs.html');
const BASE = 'https://www.themostusefulsiteintheworld.com';
const VERSION = new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ jobs --- */
// `fills`    starter values for the first screen (rare — only where a job's
//            premise needs them, e.g. the UK salary tool starting on the UK).
// `carry`    [{from, to, label?}] — `from` is an id on THIS step's card (a
//            control the visitor typed into, or an element the card wrote an
//            answer into); `to` is a field on the NEXT step's card. Order
//            matters where one value fills two controls: the last write wins,
//            so put the coarse one (a range) first. `label` is how the rail
//            names the value in a sentence ("waiting for <label>"); leave it
//            out and the source card's own field label is used.
// `nextLabel` what the rail's Next button says when it carries nothing.
const JOBS = [
  {
    id: 'can-i-afford-this-home',
    title: 'Can I afford this home?',
    blurb: 'Start with what you earn and what you have saved, end with the monthly payment and what overpaying would save.',
    steps: [
      {
        card: 'mortgage-affordability-calculator',
        title: 'What a lender might offer',
        note: 'Your income, deposit, term and the rate you expect. The result is a borrowing range, not a promise.',
        carry: [
          { from: 'gma-dep', to: 'mortgage-down' },
          { from: 'gma-rate', to: 'mortgage-rate' },
          { from: 'gma-term', to: 'mortgage-years' }
        ]
      },
      {
        card: 'mortgage',
        title: 'The monthly payment',
        note: 'The deposit, rate and term you just used are already in — add the price you are looking at.',
        carry: [
          { from: 'mortgage-rate', to: 'mo-rate' },
          { from: 'mortgage-years', to: 'mo-term' }
        ]
      },
      {
        card: 'mortgage-overpayment-calculator',
        title: 'What overpaying saves',
        note: 'Your rate and term carried over. Add the balance you would still owe.',
        carry: []
      }
    ]
  },
  {
    id: 'weight-to-macros',
    title: 'From your weight to what you eat',
    blurb: 'Height, weight and age typed once, then carried through BMI, daily energy needs and a macro split.',
    steps: [
      {
        card: 'bmi',
        title: 'Start with BMI',
        note: 'Height, weight, age. Nothing leaves the page.',
        carry: [
          { from: 'bmi-height-input', to: 'bmr-height' },
          { from: 'bmi-height-input', to: 'bmr-height-input' },
          { from: 'bmi-weight-input', to: 'bmr-weight' },
          { from: 'bmi-weight-input', to: 'bmr-weight-input' },
          { from: 'bmi-age', to: 'bmr-age' },
          { from: 'bmi-age', to: 'bmr-age-input' }
        ]
      },
      {
        card: 'bmr',
        title: 'Your daily energy needs',
        note: 'Height, weight and age are in. Pick the activity level that matches an ordinary week.',
        carry: [
          { from: 'bmr-height-input', to: 'mc-height', label: 'your height' },
          { from: 'bmr-weight-input', to: 'mc-weight', label: 'your weight' },
          { from: 'bmr-age-input', to: 'mc-age', label: 'your age' },
          { from: 'tdee-result', to: 'mc-custom-calories', label: 'your daily energy figure' }
        ]
      },
      {
        card: 'macros',
        title: 'Split it into protein, carbs and fat',
        note: 'Your daily calorie figure is carried in; set the split you want to try.',
        carry: []
      }
    ]
  },
  {
    id: 'do-up-a-room',
    title: 'Measure once, decorate the room',
    blurb: 'Type the room, paint, wallpaper and flooring all get the same dimensions — no re-measuring, no unit slips.',
    steps: [
      {
        card: 'paint-calculator',
        title: 'Paint the walls',
        note: 'Width, length and ceiling height, plus coats and tin size.',
        carry: [
          { from: 'pntcalc-w', to: 'wallpap-w' },
          { from: 'pntcalc-l', to: 'wallpap-l' },
          { from: 'pntcalc-h', to: 'wallpap-h' }
        ]
      },
      {
        card: 'wallpaper-estimator',
        title: 'Work out the wallpaper',
        note: 'Your room is already in. Add doors, windows and the pattern repeat.',
        carry: [
          { from: 'wallpap-w', to: 'tileflr-w' },
          { from: 'wallpap-l', to: 'tileflr-l' }
        ]
      },
      {
        card: 'tile-flooring-estimator',
        title: 'And the floor',
        note: 'Same room again. Pick the tile size, pack coverage and waste allowance.',
        carry: []
      }
    ]
  },
  {
    id: 'recipe-to-air-fryer',
    title: 'A UK recipe, in an air fryer',
    blurb: 'Scale the recipe, turn its gas mark into degrees, then into air-fryer temperature and time.',
    steps: [
      {
        card: 'recipeconverter',
        title: 'Scale the recipe',
        note: 'Original and new servings, and the units your recipe uses.',
        carry: [],
        nextLabel: 'Next: work out the oven setting'
      },
      {
        card: 'oven-gas-mark-temperature-converter',
        title: 'Gas mark to degrees',
        note: 'Read the temperature from your recipe and put it in here (or pick the gas mark).',
        carry: [{ from: 'ogmk-c', to: 'afrk-c' }]
      },
      {
        card: 'air-fryer-oven-conversion',
        title: 'Convert it for the air fryer',
        note: 'The temperature is in. Add the time the recipe gives.',
        carry: []
      }
    ]
  },
  {
    id: 'hourly-rate-to-take-home',
    title: 'What an hourly rate is really worth',
    blurb: 'Day rate, hours and paid weeks in; an annual figure your take-home tool can use.',
    steps: [
      {
        card: 'hourly-to-annual-salary-converter',
        title: 'Hourly to annual',
        note: 'Your rate, hours a week and paid weeks a year.',
        carry: [{ from: 'hsal-annual', to: 'sc-gross' }]
      },
      {
        card: 'salary',
        title: 'The take-home',
        note: 'Your annual figure is in. Check the country, then add pension and student loan if they apply.',
        fills: { 'sc-country': 'uk', 'sc-pay-period': 'annual' },
        carry: []
      }
    ]
  },
  {
    id: 'debt-then-budget',
    title: 'See what debt costs you',
    blurb: 'Work out the payment that clears the balance, then put that number into an honest monthly budget.',
    steps: [
      {
        card: 'debtpayoff',
        title: 'What clears the balance',
        note: 'Balance, interest rate and the monthly payment you can manage.',
        carry: [{ from: 'dp-payment-input', to: 'budget-debt' }]
      },
      {
        card: 'budget',
        title: 'Fit it into a budget',
        note: 'Your debt payment is already in the plan. Fill in the rest of the month.',
        carry: []
      }
    ]
  },
  {
    id: 'emergency-fund-to-investing',
    title: 'From an emergency fund to investing',
    blurb: 'Work out what to put aside each month, see it build up, then see what compounding does to it.',
    steps: [
      {
        card: 'savings-goal-emergency-fund-planner',
        title: 'What should you put aside?',
        note: 'Essential monthly spend and a deadline — and, in "or monthly budget", what you can actually save.',
        carry: [{ from: 'sgef-afford', to: 'savings-monthly' }]
      },
      {
        card: 'savings',
        title: 'Watch it build up',
        note: 'Your monthly amount is in. Add what you already have and an interest rate.',
        carry: [{ from: 'savings-monthly', to: 'ci-monthly-contribution' }]
      },
      {
        card: 'compoundinterest',
        title: 'What compounding does',
        note: 'The same monthly amount, invested. Try different periods and rates.',
        carry: []
      }
    ]
  },
  {
    id: 'cycle-a-new-aquarium',
    title: 'Cycle a new aquarium',
    blurb: 'Track the nitrogen cycle from the volume you have, then plan the water changes that keep the readings right.',
    steps: [
      {
        card: 'aquarium-nitrogen-cycle-tracker',
        title: 'Track the cycle',
        note: 'Your tank volume and today\'s ammonia and nitrite readings.',
        carry: [{ from: 'ac-vol', to: 'awc-d-vol' }]
      },
      {
        card: 'aquarium-water-change-salinity-calculator',
        title: 'Plan the water changes',
        note: 'Volume carried over. Add your nitrate reading and the target you want.',
        carry: []
      }
    ]
  }
];

/* ---------------------------------------------------------------- helpers -- */
function cardSource(slug) {
  return fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8');
}

// `hasRunTrigger` comes from scripts/lib/card-fields.js, the one answer to
// "is there something here that `run=1` can press?". The engine in tool.html
// carries the same rule (it cannot require a Node module), and
// scripts/tests/jobs.test.js mounts real markup through both and fails if they
// ever stop agreeing.

// One answer per card, so the validator's notes and the published JSON can
// never disagree about whether a step can run itself.
const runsCache = new Map();
function runsFor(slug) {
  if (!runsCache.has(slug)) runsCache.set(slug, hasRunTrigger(cardSource(slug)));
  return runsCache.get(slug);
}

function allIds(html) {
  const ids = new Set();
  const re = /\bid\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let m;
  while ((m = re.exec(html))) ids.add(m[2] !== undefined ? m[2] : m[3]);
  return ids;
}

function fieldIds(card) {
  return new Set(card.fields.map(f => f.id));
}

/* -------------------------------------------------------------- validation -- */
function validate() {
  const errors = [];
  const notes = [];
  const seenJobs = new Set();

  JOBS.forEach(function (job, ji) {
    const where = `job ${ji + 1} (${job.id})`;
    if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(job.id)) errors.push(`${where}: id must be a slug`);
    if (seenJobs.has(job.id)) errors.push(`${where}: duplicate id`);
    seenJobs.add(job.id);
    if (!job.title || !job.blurb) errors.push(`${where}: needs a title and a blurb`);
    if (!Array.isArray(job.steps) || job.steps.length < 2) {
      errors.push(`${where}: a job is at least two steps — one tool is not a job`);
      return;
    }

    job.steps.forEach(function (step, si) {
      const at = `${where} step ${si + 1} (${step.card})`;
      if (!step.card || !fs.existsSync(path.join(CARDS, step.card + '.html'))) {
        errors.push(`${at}: no such card`);
        return;
      }
      const html = cardSource(step.card);
      const card = readCard(path.join(CARDS, step.card + '.html'));
      const fields = fieldIds(card);
      const ids = allIds(html);
      const isLast = si === job.steps.length - 1;

      if (!step.title || !step.note) errors.push(`${at}: needs a title and a note`);
      if (!runsFor(step.card)) notes.push(`${at}: no run trigger — the visitor presses its own control`);

      Object.keys(step.fills || {}).forEach(function (id) {
        if (!ids.has(id)) errors.push(`${at}: fills #${id}, which the card does not have`);
      });

      const carry = step.carry || [];
      if (isLast) {
        if (carry.length) errors.push(`${at}: the last step has nothing to carry into`);
      } else if (!carry.length && !step.nextLabel) {
        // A step with nothing to carry is fine, but the rail has to say what
        // Next will do rather than showing a bare "Next step".
        errors.push(`${at}: no carry and no nextLabel — the rail would show a bare Next`);
      }
      carry.forEach(function (pair) {
        if (!pair.from || !ids.has(pair.from)) {
          errors.push(`${at}: carries from #${pair.from}, which the card does not have`);
        }
        const next = job.steps[si + 1];
        if (!next) { errors.push(`${at}: carry on the last step`); return; }
        const nextCard = readCard(path.join(CARDS, next.card + '.html'));
        if (!fieldIds(nextCard).has(pair.to)) {
          errors.push(`${at}: carries #${pair.from} into ${next.card}#${pair.to}, which is not a field the link can fill`);
        }
      });
    });
  });

  return { errors, notes };
}

/* ----------------------------------------------------------------- output -- */
function buildJson() {
  return {
    version: VERSION,
    count: JOBS.length,
    about: 'Hand-built multi-step jobs over the catalogue. Each step is a normal tool on tool.html; the values in `carry` are moved from one step to the next in the URL (tool.html?card=<slug>&<field>=<value>&run=1), never through a server. `runs: true` means the step has a control that &run=1 can press.',
    url: BASE + '/jobs.html',
    jobs: JOBS.map(function (job) {
      return {
        id: job.id,
        title: job.title,
        blurb: job.blurb,
        steps: job.steps.map(function (step, i) {
          const byId = new Map(readCard(path.join(CARDS, step.card + '.html')).fields.map(f => [f.id, f]));
          const step_ = {
            n: i + 1,
            card: step.card,
            title: step.title,
            note: step.note,
            runs: runsFor(step.card),
            url: `${BASE}/tool.html?card=${step.card}&job=${job.id}&step=${i + 1}`
          };
          if (step.fills) step_.fills = step.fills;
          if (step.carry && step.carry.length) {
            step_.carry = step.carry.map(function (pair) {
              const field = byId.get(pair.from);
              return {
                from: pair.from,
                to: pair.to,
                label: pair.label || (field && field.label) || pair.from
              };
            });
          }
          if (step.nextLabel) step_.nextLabel = step.nextLabel;
          return step_;
        })
      };
    })
  };
}

// The rail's word for a value: the label written on the card it comes from.
function labelOf(step, id) {
  const card = readCard(path.join(CARDS, step.card + '.html'));
  const field = card.fields.find(f => f.id === id);
  if (field) return field.label;
  const pair = (step.carry || []).find(c => c.from === id);
  return (pair && pair.label) || id;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// A step's start URL: the tool, the job, the step, and its starter values. Only
// steps after the first ask the card to run — on step 1 the visitor has not
// entered anything yet, so there is nothing to calculate.
function stepUrl(job, step, i) {
  const q = new URLSearchParams();
  q.set('card', step.card);
  q.set('job', job.id);
  q.set('step', String(i + 1));
  Object.keys(step.fills || {}).forEach(k => q.append(k, step.fills[k]));
  if (i > 0 && step.runs) q.set('run', '1');
  return 'tool.html?' + q.toString();
}

function buildHtml() {
  const count = JOBS.length;
  const steps = JOBS.reduce((n, j) => n + j.steps.length, 0);
  const cards = new Set(JOBS.flatMap(j => j.steps.map(s => s.card))).size;
  const title = `Jobs — ${count} Multi-Step Tool Workflows`;
  const description = `${count} hand-built jobs that run ${cards} of the site's free browser tools in sequence, carrying your numbers from one step to the next in the link itself. Nothing stored, nothing sent.`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Jobs',
    url: BASE + '/jobs.html',
    description,
    isPartOf: { '@type': 'WebSite', name: 'The Most Useful Site in the World', url: BASE + '/' },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: count,
      itemListElement: JOBS.map((job, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: job.title,
        url: `${BASE}/tool.html?card=${job.steps[0].card}&job=${job.id}&step=1`
      }))
    }
  };

  const jobBlocks = JOBS.map(function (job, ji) {
    const list = job.steps.map(function (step, i) {
      const last = i === job.steps.length - 1;
      return `<li class="step">
          <a class="step-link" href="${esc(stepUrl(job, step, i))}">
            <span class="step-n" aria-hidden="true">${i + 1}</span>
            <span class="step-body">
              <span class="step-title">${esc(step.title)}</span>
              <span class="step-note">${esc(step.note)}</span>
            </span>
          </a>
          ${last ? '' : `<span class="carry">${(step.carry || []).length
            ? 'carries ' + step.carry.map(c => esc(labelOf(step, c.from)) + ' into <code>' + esc(c.to) + '</code>').join(', ')
            : 'no numbers to carry — the next step starts fresh'}</span>`}
        </li>`;
    }).join('\n        ');

    return `<section class="job" id="job-${esc(job.id)}">
      <h2>${ji + 1}. ${esc(job.title)}</h2>
      <p class="blurb">${esc(job.blurb)}</p>
      <ol class="steps">
        ${list}
      </ol>
      <p class="start"><a href="${esc(stepUrl(job, job.steps[0], 0))}">Start this job →</a>
        <span class="start-note">${job.steps.length} steps · about a minute each</span></p>
    </section>`;
  }).join('\n\n    ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="favicon.ico" sizes="32x32">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<title>${esc(title)} — The Most Useful Site in the World</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${BASE}/jobs.html">
<meta name="theme-color" content="#0a0f14">
<meta property="og:type" content="website">
<meta property="og:site_name" content="The Most Useful Site in the World">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${BASE}/jobs.html">
<meta property="og:image" content="${BASE}/og-tools.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${BASE}/og-tools.png">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--accent:#2dd4ff;--text:#e6faff;--dim:rgba(230,250,255,.7);--bg:#0a0f14;--panel:#141e28;--line:rgba(255,255,255,.08);--gold:#ffd700}
body{background:var(--bg);color:var(--text);line-height:1.65;font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;overflow-x:hidden}
a{color:inherit}
.wrap{max-width:920px;margin:0 auto;padding:0 20px}
header.top{border-bottom:1px solid var(--line);padding:14px 0;position:sticky;top:0;background:rgba(10,15,20,.92);backdrop-filter:blur(8px);z-index:5}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:9px;text-decoration:none;font-weight:700;font-size:.9rem}
.brand img{width:22px;height:22px}
.brand span.accent{color:var(--accent)}
.top-links a{color:var(--accent);text-decoration:none;font-size:.85rem;font-weight:600;margin-left:14px}
.top-links a:hover{text-decoration:underline}
main{padding:38px 0 20px}
h1{font-size:clamp(1.7rem,5vw,2.4rem);line-height:1.15;letter-spacing:-.5px}
h1 .em{color:var(--accent)}
.lede{color:var(--dim);margin-top:14px;max-width:64ch;font-size:1.02rem}
.how{margin:26px 0 8px;padding:18px 20px;border:1px solid var(--line);border-radius:14px;background:linear-gradient(145deg,rgba(255,255,255,.03),rgba(255,255,255,.05))}
.how h2{font-size:1rem;color:var(--accent);margin-bottom:10px}
.how ol{margin-left:20px;color:var(--dim);font-size:.93rem}
.how li{margin:5px 0}
.how code{background:rgba(45,212,255,.1);border:1px solid rgba(45,212,255,.2);border-radius:5px;padding:1px 5px;font-size:.85em;color:#bff0ff;overflow-wrap:anywhere}
.jobs{margin-top:30px;display:grid;gap:26px}
.job{border:1px solid var(--line);border-radius:16px;padding:20px;background:var(--panel)}
.job h2{font-size:1.12rem;letter-spacing:-.2px}
.job .blurb{color:var(--dim);font-size:.92rem;margin:7px 0 15px}
.steps{list-style:none;display:grid;gap:9px}
.step{display:grid;gap:4px}
.step-link{display:flex;gap:12px;align-items:flex-start;text-decoration:none;padding:11px 12px;border:1px solid var(--line);border-radius:11px;background:rgba(255,255,255,.02);min-height:44px}
.step-link:hover{border-color:rgba(45,212,255,.45);background:rgba(45,212,255,.07)}
.step-n{flex:none;width:24px;height:24px;border-radius:50%;background:rgba(45,212,255,.14);border:1px solid rgba(45,212,255,.35);color:var(--accent);font-size:.78rem;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}
.step-title{display:block;font-weight:600;font-size:.94rem}
.step-note{display:block;color:var(--dim);font-size:.83rem;margin-top:2px}
.carry{color:rgba(230,250,255,.5);font-size:.76rem;padding-left:36px}
.carry code{color:#bff0ff}
.start{margin-top:15px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.start a{display:inline-flex;align-items:center;min-height:44px;padding:10px 18px;border-radius:10px;background:rgba(45,212,255,.12);border:1px solid rgba(45,212,255,.4);color:var(--accent);font-weight:700;text-decoration:none;font-size:.9rem}
.start a:hover{background:rgba(45,212,255,.22)}
.start-note{color:rgba(230,250,255,.5);font-size:.8rem}
.notes{margin-top:34px;padding:18px 20px;border:1px solid var(--line);border-radius:14px;color:var(--dim);font-size:.88rem}
.notes h2{font-size:.98rem;color:var(--text);margin-bottom:8px}
.notes p{margin:6px 0}
.notes a{color:var(--accent)}
footer{border-top:1px solid var(--line);margin-top:40px;padding:22px 0 34px;color:var(--dim);font-size:.85rem}
footer a{color:var(--accent);text-decoration:none}
footer a:hover{text-decoration:underline}
@media (max-width:520px){.job{padding:16px}.carry{padding-left:0}}
</style>
</head>
<body>
<header class="top">
  <div class="wrap">
    <a class="brand" href="index.html"><img src="logo-mark.svg" alt="" width="22" height="22"><span><span class="accent">The Most Useful</span> Site in the World</span></a>
    <nav class="top-links" aria-label="Site">
      <a href="index.html">All ${count === 1 ? '' : ''}tools</a>
      <a href="tools-index.html">Index</a>
      <a href="agents.html">For agents</a>
    </nav>
  </div>
</header>
<main class="wrap">
  <h1>Jobs: <span class="em">one form, several tools</span>, the numbers carried forward</h1>
  <p class="lede">A single tool answers a single question. These ${count} jobs answer the one you actually had — and every step is a normal tool on this site, opened with your numbers already in it.</p>

  <div class="how">
    <h2>How a job works</h2>
    <ol>
      <li>Open the first step and fill in what it asks.</li>
      <li>The rail above the tool shows where you are. Press <strong>Next step</strong> — it reads the answer you just got and puts it into the next tool.</li>
      <li>Everything travels in the web address: <code>tool.html?card=…&amp;field=value&amp;run=1</code>. Nothing is stored, nothing is uploaded, and every step can be shared as a link on its own.</li>
    </ol>
    <p class="notes" style="margin-top:12px;border:0;padding:0">Hand-built, not scraped: each job is checked against the ${cards} tools it uses on every build, so a renamed field fails the build instead of shipping a link that fills in nothing.</p>
  </div>

  <div class="jobs">
    ${jobBlocks}
  </div>

  <div class="notes">
    <h2>Honest limits</h2>
    <p>A job carries <strong>numbers you typed, and figures a tool has already worked out</strong> — it never guesses. Where a step needs something no earlier step produced (a mortgage balance, a pattern repeat, the time on your recipe card), the step says so and you type it.</p>
    <p>Nothing about a job runs without you: no card is executed in the background, and the site cannot see which job you opened. Started a job and stopped? Just reopen any step — the URL keeps that step's numbers.</p>
    <p>Want the machine-readable version? <a href="jobs.json">jobs.json</a> describes every step, every carried value and where it goes. Agents and developers: <a href="agents.html">agents.html</a>.</p>
  </div>
</main>
<footer>
  <div class="wrap">
    <p>Free forever · no accounts · no ads · nothing you type leaves your device. <a href="index.html">Browse all ${count === 1 ? '' : ''}tools</a> · <a href="donate.html">Support the site</a></p>
  </div>
</footer>
</body>
</html>
`;
}

/* ------------------------------------------------------------------- main -- */
function main() {
  const check = process.argv.includes('--check');
  const { errors, notes } = validate();
  if (errors.length) {
    console.error('build-jobs: a job references something that is not there:');
    errors.forEach(e => console.error('  ✗ ' + e));
    console.error('\nFix the job definition above (or the card), then rebuild.');
    process.exit(1);
  }
  notes.forEach(n => console.log('  note: ' + n));

  const json = JSON.stringify(buildJson(), null, 2) + '\n';
  const html = buildHtml();
  const stepCount = JOBS.reduce((n, j) => n + j.steps.length, 0);

  const targets = [
    ['jobs.json', OUT_JSON, json],
    ['jobs.html', OUT_HTML, html]
  ];

  let stale = 0;
  for (const [name, file, content] of targets) {
    let got = null;
    try { got = fs.readFileSync(file, 'utf8'); } catch (e) { got = null; }
    if (got === content) continue;
    stale++;
    if (check) { console.error(`✗ ${name} is stale — run: node scripts/build-jobs.js`); continue; }
    fs.writeFileSync(file, content);
    console.log(`✔ ${name} (${content.length} bytes)`);
  }
  if (check && stale) process.exit(1);
  console.log(`jobs OK — ${JOBS.length} jobs, ${stepCount} steps, all references verified against cards/`);
}

module.exports = { JOBS, validate, buildJson, buildHtml, hasRunTrigger };

if (require.main === module) main();
