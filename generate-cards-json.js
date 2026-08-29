// generate-cards-json.js
// Standalone zero-dependency script to auto-generate cards/cards.json

const fs = require('fs');
const path = require('path');

const cardsDir = path.join(__dirname, 'cards');
const outputFile = path.join(cardsDir, 'cards.json');

const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.html') || f.endsWith('.hmtl'));

const musicList = ['audio-bpm-tapper', 'binaural-neuro-tuner', 'bpm-counter', 'capo-calculator', 'carol-karaoke', 'chord-finder', 'chord-progression', 'ear-trainer', 'instrument-care', 'interval-trainer', 'metronome', 'music-quiz', 'music-theory', 'recording-basics', 'rhythm-generator', 'scale-trainer', 'sheet-music', 'song-writer', 'tempo-map', 'transposer', 'tuner', 'youtube-dj'];
const healthList = ['crisis-offline-triage', 'bmi', 'bmr', 'bodyfat', 'calorie', 'childgrowth', 'fitnesscore', 'heartrate', 'hydration', 'idealweight', 'leanbodymass', 'macros', 'metabolicage', 'onerepmax', 'sleep', 'steps', 'targetheartrate', 'tdee', 'vo2max', 'waisthip', 'waterintake'];
const financeList = ['freelance-rate-calculator', 'smart-contract-gas-estimator', 'break-even', 'budget', 'compoundinterest', 'creditcard', 'currency', 'datecalc', 'debtpayoff', 'discount', 'fuelcost', 'grocerybudget', 'inflation', 'interest', 'investment', 'lease', 'loan', 'meal-cost-calculator', 'mortgage', 'networth', 'rent', 'retirement', 'roi', 'salary', 'salarycompare', 'savings', 'splitbill', 'studentloan', 'subscription', 'tax'];
const slList = ['second-life-surnames-guide', 'sl-buildmate', 'sl-events', 'sl-exchange', 'sl-market', 'sl-region-map', 'sl-texture'];
const mathList = ['algebra', 'calculus', 'complex-numbers', 'differential-equations', 'discrete-math', 'equation-solver', 'exam-prep-maths', 'exponents', 'formula-library', 'fractions', 'geometry', 'gpa', 'grade', 'graphing-calculator', 'hex-decimal', 'linear-algebra', 'logarithms', 'math-practice', 'math-universe-explorer', 'maths-flashcards', 'maths', 'matrices', 'number-theory', 'percentages', 'probability', 'sequences-series', 'statistics', 'trigonometry'];
const scienceList = [
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
const writingList = ['spanish-verb-master', 'french-pronunciation-verbs', 'chinese-tones-pinyin', 'german-cases-gender', 'korean-hangul-trainer', 'multilingual-phrase-matrix', 'japanese-kana-trainer', 'japanese-romaji-converter', 'japanese-numbers-counters', 'japanese-particles-master', 'japanese-jlpt-vocabulary', 'japanese-verb-conjugator', 'japanese-keigo-politeness', 'regex-tester-explainer', 'markdown-live-editor', 'morse-code-translator', 'cognitive-bias-detector', 'business-writing', 'citation', 'cover-letter', 'creative-writing', 'email-templates', 'essay-templates', 'essay', 'grammar-proof', 'kanji-helper', 'languages', 'literature-analysis', 'literature', 'meme-translation', 'plagiarism-check', 'proofreading', 'public-speaking', 'punctuation-guide', 'readability-score', 'readingtime', 'resume', 'seo-helper', 'seo-writing', 'spelling-check', 'summary-generator', 'translation-helper', 'vocab', 'vocabulary-trainer'];

function getCategory(name) {
  if (slList.some(s => name.includes(s))) return 'Virtual Worlds & Gaming';
  if (musicList.some(s => name.includes(s))) return 'Music & Audio';
  if (healthList.some(s => name.includes(s))) return 'Health & Fitness';
  if (financeList.some(s => name.includes(s))) return 'Finance & Money';
  if (mathList.some(s => name.includes(s))) return 'Mathematics';
  if (scienceList.some(s => name.includes(s))) return 'Science & Engineering';
  if (writingList.some(s => name.includes(s))) return 'Writing & Language';
  return 'Productivity & Lifestyle';
}

const manifest = files.map(file => {
  const base = file.replace(/\.(html|hmtl)$/, '');
  const filePath = path.join(cardsDir, file);
  const html = fs.readFileSync(filePath, 'utf8');

  // Extract title from first <h2>
  const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  let title = '';
  let id = base;
  if (h2Match) {
    const idAttr = h2Match[0].match(/id=["']([^"']+)["']/i);
    if (idAttr) id = idAttr[1];
    title = h2Match[1].replace(/<[^>]+>/g, '').replace(/[\r\n\t]+/g, ' ').trim();
  }
  if (!title) {
    title = base.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  // Extract description
  const pMatch = html.match(/<p[^>]*class=["'][^"']*(?:desc|description|small)["'][^>]*>([\s\S]*?)<\/p>/i) ||
                 html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  let description = '';
  if (pMatch) {
    description = pMatch[1].replace(/<[^>]+>/g, '').replace(/[\r\n\t]+/g, ' ').trim();
    if (description.length > 200) description = description.substring(0, 197) + '...';
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
