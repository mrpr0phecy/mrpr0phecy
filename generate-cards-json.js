// generate-cards-json.js
// Standalone zero-dependency script to auto-generate cards/cards.json

const fs = require('fs');
const path = require('path');

const cardsDir = path.join(__dirname, 'cards');
const outputFile = path.join(cardsDir, 'cards.json');

const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.html'));

const musicList = ['audio-tone-frequency-generator', 'audio-bpm-tapper', 'binaural-neuro-tuner', 'bpm-counter', 'capo-calculator', 'carol-karaoke', 'chord-finder', 'chord-progression', 'ear-trainer', 'instrument-care', 'interval-trainer', 'metronome', 'music-quiz', 'music-theory', 'recording-basics', 'rhythm-generator', 'scale-trainer', 'sheet-music', 'song-writer', 'tempo-map', 'transposer', 'tuner', 'youtube-dj'];
const healthList = ['sleep-circadian-rem-calculator', 'crisis-offline-triage', 'bmi', 'bmr', 'bodyfat', 'calorie', 'childgrowth', 'fitnesscore', 'heartrate', 'hydration', 'idealweight', 'leanbodymass', 'macros', 'metabolicage', 'onerepmax', 'sleep', 'steps', 'targetheartrate', 'tdee', 'vo2max', 'waisthip', 'waterintake'];
const financeList = ['fire-financial-independence-calc', 'freelance-rate-calculator', 'smart-contract-gas-estimator', 'break-even', 'budget', 'compoundinterest', 'creditcard', 'currency', 'datecalc', 'debtpayoff', 'discount', 'fuelcost', 'grocerybudget', 'inflation', 'interest', 'investment', 'lease', 'loan', 'meal-cost-calculator', 'mortgage', 'networth', 'rent', 'retirement', 'roi', 'salary', 'salarycompare', 'savings', 'splitbill', 'studentloan', 'subscription', 'tax'];
const slList = ['second-life-surnames-guide', 'sl-buildmate', 'sl-events', 'sl-exchange', 'sl-market', 'sl-region-map', 'sl-texture'];
const mathList = ['algebra', 'calculus', 'complex-numbers', 'differential-equations', 'discrete-math', 'equation-solver', 'exam-prep-maths', 'exponents', 'formula-library', 'fractions', 'geometry', 'gpa', 'grade', 'graphing-calculator', 'hex-decimal', 'linear-algebra', 'logarithms', 'math-practice', 'math-universe-explorer', 'maths-flashcards', 'maths', 'matrices', 'number-theory', 'percentages', 'probability', 'sequences-series', 'statistics', 'trigonometry'];
const scienceList = [
  'van-de-graaff-electrostatic-generator',
  'gravitational-n-body-galaxy-collision',
  'optomechanical-laser-tweezer',
  'diffraction-grating-laser-spectrometer',
  'kelvin-helmholtz-cloud-instability',
  'magnetic-eddy-current-brake',
  'spontaneous-synchronization-kuramoto',
  'atmospheric-aurora-borealis-field',
  'fiber-optic-total-internal-reflection',
  'bernoulli-levitating-air-stream',
  'cosmic-ray-cloud-chamber',
  'ferrofluid-spike-sculpture',
  'atmospheric-plasma-globe',
  'foucault-pendulum-earth-spin',
  'double-slit-quantum-eraser',
  'chaotic-magnetic-pendulum',
  'schlier-flow-thermal-shadow',
  'newton-cradle-momentum-mesh',
  'optical-soliton-wave-tank',
  'acoustic-levitation-standing-wave',
  'fluid-vortex-smoke-tunnel',
  'gravitational-lensing-black-hole',
  'moire-interference-lattice',
  'reaction-diffusion-turing-patterns',
  'quantum-wave-packet-tunneling',
  'prism-optics-ray-refraction',
  'lissajous-laser-oscillograph',
  'pendulum-wave-harmonograph',
  'magnetic-levitation-meissner-lab',
  'cymatic-sound-sculpture-3d',
  'subnet-cidr-network-calculator',
  'physics-unit-converter-matrix',
  'logic-gate-circuit-simulator',
  'water-density-anomaly',
  'water-phase-diagram',
  'steam-tables-thermodynamics',
  'water-surface-tension-capillary',
  'water-ion-product-kw-ph',
  'seawater-salinity-density-teos',
  'psychrometric-dewpoint-analyzer',
  'underwater-acoustics-sound-speed',
  'water-hardness-langelier-index',
  'water-dielectric-dipole-relaxation',
  'cymatics-chladni-plate',
  'damped-harmonic-oscillator',
  'double-pendulum-chaos',
  'vibration-isolation-transmissibility',
  'coupled-oscillators-normal-modes',
  'beam-vibration-modal-analysis',
  'four-bar-linkage-kinematics',
  'gyroscopic-precession-dynamics',
  'torsional-vibration-critical-speed',
  'faraday-waves-cymatics-fluid',
  'periodic-table-explorer',
  'doppler-effect-simulator',
  'special-relativity-calculator',
  'projectile-motion-simulator',
  'orbital-mechanics-calculator',
  'radioactive-decay-calculator',
  'sound-decibel-calculator',
  'chemical-solution-dilution',
  'fluid-reynolds-number',
  'photon-quantum-energy',
  'tr3b-anti-gravity-flight-calculator',
  'color-palette-extractor',
  'aspect-ratio-resizer',
  'eco-footprint-accelerator',
  'anatomy',
  'astronomy',
  'battery-sizing',
  'biology-tools',
  'boiling-point-finder',
  'breaker-sizing',
  'builders-workmate',
  'cable-length',
  'capacitor-calculator',
  'circuit-calculator',
  'conduit-sizing',
  'earthing-calculator',
  'ecology',
  'electrical-standards',
  'electricity',
  'energy',
  'environmental-science',
  'evolution-walker',
  'experiment-ideas',
  'genetics',
  'geography',
  'geology',
  'inductance-calculator',
  'inverter-sizing',
  'lab-planner',
  'lab-safety',
  'lighting-design',
  'load-calculator',
  'materials-science',
  'melting-point-finder',
  'microbiology',
  'motor-startup',
  'ohms-law',
  'optics',
  'oscilloscope',
  'pcb-trace-width',
  'physics',
  'plant-encyclopedia',
  'power-calculator',
  'resistor-color-code',
  'science-quiz',
  'science',
  'scientific-method',
  'seed-germination-calculator',
  'soil-ph-guide',
  'solar-panel-calculator',
  'solar-system-simulator',
  'thermodynamics',
  'transformer-calculator',
  'unit-converter-science',
  'unit-converter',
  'unitconverter',
  'voltage-drop',
  'wire-gauge'
];
const writingList = [
  'markdown-to-html-printer',
  'llm-prompt-token-counter',
  'regex-replace-string-transform',
  'spanish-verb-master', 'french-pronunciation-verbs', 'chinese-tones-pinyin', 'german-cases-gender', 'korean-hangul-trainer', 'multilingual-phrase-matrix', 'japanese-kana-trainer', 'japanese-romaji-converter', 'japanese-numbers-counters', 'japanese-particles-master', 'japanese-jlpt-vocabulary', 'japanese-verb-conjugator', 'japanese-keigo-politeness', 'regex-tester-explainer', 'markdown-live-editor', 'morse-code-translator', 'cognitive-bias-detector', 'business-writing', 'citation', 'cover-letter', 'creative-writing', 'email-templates', 'essay-templates', 'essay', 'grammar-proof', 'kanji-helper', 'languages', 'literature-analysis', 'literature', 'meme-translation', 'plagiarism-check', 'proofreading', 'public-speaking', 'punctuation-guide', 'readability-score', 'readingtime', 'resume', 'seo-helper', 'seo-writing', 'spelling-check', 'summary-generator', 'translation-helper', 'vocab', 'vocabulary-trainer'];

const animeList = [
  'anime-binge-watch-calculator',
  'anime-release-schedule-converter',
  'anime-filler-canon-guide',
  'anime-japanese-phrases-tropes',
  'anime-character-archetype-matrix',
  'anime-cosplay-prop-scaler',
  'anime-convention-budget-planner',
  'manga-to-anime-chapter-converter',
  'anime-oped-music-analyzer',
  'anime-recommendation-mood-engine'
];

const aquariumList = [
  'aquarium-volume-weight-calculator',
  'aquarium-nitrogen-cycle-tracker',
  'aquarium-stocking-compatibility-calculator',
  'aquarium-water-change-salinity-calculator',
  'aquarium-heater-chiller-calculator',
  'aquarium-lighting-par-calculator',
  'aquarium-co2-drop-checker-calculator',
  'aquarium-medication-dosing-calculator',
  'aquarium-substrate-hardscape-calculator',
  'aquarium-feeding-vacation-planner'
];

const saasKillerList = [
  'meeting-cost-live-ticker',
  'invoice-billing-pdf-generator',
  'nda-contract-service-agreement-builder',
  'utm-campaign-matrix-builder',
  'gdpr-ccpa-privacy-policy-generator',
  'startup-cap-table-dilution-simulator',
  'social-media-image-resizer-cropper',
  'b2b-cold-email-sequence-generator',
  'saas-metrics-ltv-cac-calculator',
  'seo-meta-tag-social-previewer',
  'social-proof-testimonial-card-generator'
];

const interactiveArtList = [
  'pixel-collaborative-infinite-mural',
  'chrono-garden-l-system-botany',
  'harmonic-orbit-gravitational-soundscape',
  'bioma-evolutionary-petri-dish',
  'constellation-chronicle-star-weaver',
  'sandpile-fractal-mandala-zen',
  'quilt-tapestry-geometric-mosaic',
  'voxel-monolith-3d-time-capsule',
  'synapse-thought-constellation-network',
  'echo-pond-water-cymatics-soundscape'
];

const culinaryList = [
  'sous-vide-precision-cooker',
  'sourdough-hydration-calculator',
  'coffee-brew-ratio-calculator',
  'candy-sugar-stages-calculator',
  'meat-brining-salinity-calculator',
  'fermentation-salt-brine-calc',
  'flavor-wine-pairing-matrix',
  'pizza-dough-calculator',
  'food-shelf-life-storage-vault',
  'chocolate-tempering-curve-lab',
  'cooking-time-adjuster',
  'cooking-unit-converter',
  'recipeconverter',
  'recipe-scaler',
  'baking-pan-converter',
  'mealplanner',
  'meal-cost-calculator'
];

const lucidList = [
  'wbtb-rem-sleep-calculator',
  'lucid-reality-check-trainer',
  'mild-mnemonic-mantra-engine',
  'dream-sign-frequency-matrix',
  'wild-hypnagogia-tracker',
  'lucid-dream-stabilizer-sim',
  'lucid-supplements-timing-calc',
  'lucid-dream-quest-taskboard',
  'sleep-paralysis-hypnopompic',
  'binaural-lucid-frequency-gen',
  'sleep-circadian-rem-calculator'
];

const remedyList = [
  'herbal-tincture-ratio-calc',
  'essential-oil-dilution-calc',
  'herbal-infusion-decoction-timer',
  'herb-drug-interaction-checker',
  'adaptogen-matcher-matrix',
  'herbal-salve-beeswax-ratio',
  'poultice-compress-remedy-lab',
  'cold-flu-natural-remedy-hub',
  'natural-electrolyte-tonic-calc',
  'acupressure-somatic-point-map'
];

const birdingList = [
  'birding-binocular-optics-calc',
  'bird-silhouette-flight-id',
  'bird-song-mnemonic-trainer',
  'bird-nest-box-hole-sizing',
  'backyard-bird-feeder-diet',
  'bird-topography-field-marks',
  'birding-life-list-tally',
  'bird-migration-weather-calc',
  'hummingbird-nectar-spoilage',
  'bird-molt-cycle-ageing'
];

const dogList = [
  'dog-human-age-epigenetic-calc',
  'dog-chocolate-toxicity-calc',
  'dog-calorie-portion-calculator',
  'dog-ultrasonic-whistle-trainer',
  'dog-safe-toxic-food-checker',
  'dog-daily-walk-exercise-calc',
  'dog-dehydration-vital-checker',
  'dog-clicker-trainer-cadence',
  'puppy-adult-weight-predictor',
  'dog-crate-sizing-den-blueprint'
];

const aiList = [
  'ai-function-call-schema-validator',
  'ai-context-window-budget-calc',
  'ai-prompt-injection-defense-lab',
  'ai-vector-embedding-similarity',
  'ai-chain-of-thought-scratchpad',
  'ai-agent-react-loop-simulator',
  'ai-few-shot-prompt-synthesizer',
  'ai-hallucination-entropy-gauge',
  'ai-model-cost-latency-matrix',
  'ai-mcp-protocol-tool-tester'
];

function getCategory(name) {
  if (aiList.some(s => name.includes(s))) return 'AI & Autonomous Agents';
  if (dogList.some(s => name.includes(s))) return 'Dogs & Canine Care';
  if (birdingList.some(s => name.includes(s))) return 'Birdwatching & Ornithology';
  if (remedyList.some(s => name.includes(s))) return 'Natural Remedies & Herbs';
  if (lucidList.some(s => name.includes(s))) return 'Lucid Dreaming & Sleep';
  if (interactiveArtList.some(s => name.includes(s))) return 'Interactive Art & Living Worlds';
  if (saasKillerList.some(s => name.includes(s))) return 'SaaS & Business Killers';
  if (aquariumList.some(s => name.includes(s))) return 'Aquatics & Fishkeeping';
  if (animeList.some(s => name.includes(s))) return 'Anime & Otaku Culture';
  if (culinaryList.some(s => name.includes(s))) return 'Culinary & Food Science';
  if (slList.some(s => name.includes(s))) return 'Virtual Worlds & Gaming';
  // MrProphecy minigames — checked first so they keep their own category
  // when this script is re-run (it overwrites categories every time).
  if (name.startsWith('mrprophecy-')) return 'MrProphecy Arcade';
  if (musicList.some(s => name.includes(s))) return 'Music & Audio';
  if (healthList.some(s => name.includes(s))) return 'Health & Fitness';
  if (financeList.some(s => name.includes(s))) return 'Finance & Money';
  if (mathList.some(s => name.includes(s))) return 'Mathematics';
  if (scienceList.some(s => name.includes(s))) return 'Science & Engineering';
  if (writingList.some(s => name.includes(s))) return 'Writing & Language';
  return 'Productivity & Lifestyle';
}

// Decode HTML entities so catalogue titles/descriptions read as plain text
// (titles are rendered as text, so a literal "&amp;" would show up verbatim).
function decodeEntities(str) {
  return String(str)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&hellip;/g, '\u2026')
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)));
}

const manifest = files.map(file => {
  const base = file.replace(/\.html$/, '');
  const filePath = path.join(cardsDir, file);
  const html = fs.readFileSync(filePath, 'utf8');

  // Extract title from first <h2>
  const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  let title = '';
  // Always derive id from the filename slug: <h2> ids are not unique across
  // cards (23 collisions found), and duplicate ids break DOM lookups.
  let id = base + '-title';
  if (h2Match) {
    let rawTitle = h2Match[1];
    rawTitle = rawTitle.replace(/<(span|div|small|p)[^>]*>[\s\S]*?<\/\1>/gi, '');
    title = decodeEntities(rawTitle.replace(/<[^>]+>/g, '')).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }
  if (!title) {
    title = base.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  // Extract description
  const pMatch = html.match(/<p[^>]*class=["'][^"']*(?:desc|description|small)["'][^>]*>([\s\S]*?)<\/p>/i) ||
                 html.match(/<p[^>]*>([\s\S]*?)<\/p>/i) ||
                 html.match(/<div[^>]*style=["'][^"']*rgba\(230,\s*250,\s*255[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  let description = '';
  if (pMatch) {
    description = decodeEntities(pMatch[1].replace(/<[^>]+>/g, '')).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (description.length > 200) description = description.substring(0, 197) + '...';
  }
  if (!description) {
    description = `Instant, free online ${title.replace(/^[^\w\s]+/, '').trim()} tool. No signup required.`;
  }

  return {
    id,
    name: base,
    title,
    description,
    category: getCategory(base),
    file: file,
    path: `cards/${file}`
  };
});

fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2));
console.log(`✅ cards.json updated with ${manifest.length} cards`);
