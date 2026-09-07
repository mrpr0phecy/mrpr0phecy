// generate-cards-json.js
// Standalone zero-dependency script to auto-generate cards/cards.json

const fs = require('fs');
const path = require('path');

const cardsDir = path.join(__dirname, 'cards');
const outputFile = path.join(cardsDir, 'cards.json');

const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.html'));

const musicList = ['audio-tone-frequency-generator', 'audio-bpm-tapper', 'binaural-neuro-tuner', 'bpm-counter', 'capo-calculator', 'carol-karaoke', 'chord-finder', 'chord-progression', 'ear-trainer', 'instrument-care', 'interval-trainer', 'metronome', 'music-quiz', 'music-theory', 'recording-basics', 'rhythm-generator', 'scale-trainer', 'sheet-music', 'song-writer', 'tempo-map', 'transposer', 'tuner', 'youtube-dj'];
const healthList = ['sleep-circadian-rem-calculator', 'crisis-offline-triage', 'bmi', 'bmr', 'bodyfat', 'calorie', 'childgrowth', 'fitnesscore', 'heartrate', 'hydration', 'idealweight', 'leanbodymass', 'macros', 'metabolicage', 'onerepmax', 'sleep', 'steps', 'targetheartrate', 'tdee', 'vo2max', 'waisthip', 'waterintake', 'pregnancy-due-date-calculator', 'ovulation-fertile-window-calculator'];
const financeList = ['fire-financial-independence-calc', 'freelance-rate-calculator', 'smart-contract-gas-estimator', 'break-even', 'budget', 'compoundinterest', 'creditcard', 'currency', 'datecalc', 'debtpayoff', 'discount', 'fuelcost', 'grocerybudget', 'inflation', 'interest', 'investment', 'lease', 'loan', 'meal-cost-calculator', 'mortgage', 'networth', 'rent', 'retirement', 'roi', 'salary', 'salarycompare', 'savings', 'splitbill', 'studentloan', 'subscription', 'tax'];
const museumList = ['bayes-chance-hall', 'constant-treasury', 'deep-time-museum', 'element-hall', 'energy-watt-exchange', 'statistics-illusion-gallery', 'thermal-wall-simulator', 'structural-beam-stress', 'pipe-flow-simulator', 'room-acoustics-simulator', 'daylight-room-simulator', 'moisture-capillary-simulator'];
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

// Wellbeing & Community — tools for the moments when people are scared, confused or alone
// Ten tools added to fill genuine gaps found by auditing the existing 552-card
// catalogue. Exact filenames, mapped explicitly so no substring list can claim them.
const gapFillMap = {
  'hike-time-planner': 'Science & Engineering',
  'photo-exposure-lab': 'Science & Engineering',
  'baby-sleep-planner': 'Health & Fitness',
  'energy-tariff-comparator': 'Finance & Money',
  'unit-price-comparator': 'Finance & Money',
  'fluid-type-scale': 'Productivity & Lifestyle',
  'fabric-yardage-estimator': 'Productivity & Lifestyle',
  'car-care-tracker': 'Home & DIY',
  'roman-numeral-converter': 'Mathematics',
  'age-calculator-exact': 'Productivity & Lifestyle',
  'business-days-working-days-calculator': 'Productivity & Lifestyle',
  'isbn-10-13-converter': 'Productivity & Lifestyle',
  'iban-validator-formatter': 'Finance & Money',
  'luhn-check-digit-validator': 'Finance & Money',
  'number-to-words-cheque-writer': 'Writing & Language',
  'gcf-lcm-prime-factor-calculator': 'Mathematics',
  'speed-distance-time-calculator': 'Productivity & Lifestyle',
  'fuel-economy-mpg-converter': 'Productivity & Lifestyle',
  'tv-viewing-distance-calculator': 'Productivity & Lifestyle',
  'print-dpi-photo-size-calculator': 'SaaS & Business Killers',
  'video-bitrate-file-size-calculator': 'SaaS & Business Killers',
  'shoe-size-converter': 'Productivity & Lifestyle',
  'sunrise-sunset-calculator': 'Astronomy & Space',
  'screen-ppi-calculator': 'SaaS & Business Killers',
  'tire-size-comparison-calculator': 'Productivity & Lifestyle',
  'iso-week-number-finder': 'Productivity & Lifestyle',
  'overnight-shift-duration-calculator': 'Productivity & Lifestyle',
  'character-limit-platform-counter': 'Writing & Language',
  'random-number-dice-coin-generator': 'Productivity & Lifestyle',
  'jet-lag-sleep-shift-planner': 'Health & Fitness',
  'clothing-size-converter': 'Productivity & Lifestyle',
  'meeting-overlap-timezone-planner': 'Productivity & Lifestyle',
  'px-rem-em-unit-converter': 'SaaS & Business Killers',
  'htaccess-redirect-generator': 'SaaS & Business Killers',
  'body-surface-area-calculator': 'Health & Fitness',
  'golden-ratio-crop-calculator': 'SaaS & Business Killers',
  'markup-vs-margin-calculator': 'Finance & Money',
  'hourly-to-annual-salary-converter': 'Finance & Money',
  'overtime-pay-calculator': 'Finance & Money',
  'feet-inches-cm-height-converter': 'Productivity & Lifestyle',
  'stone-pounds-kg-weight-converter': 'Productivity & Lifestyle',
  'paper-size-iso-us-converter': 'Productivity & Lifestyle',
  'ring-size-converter': 'Productivity & Lifestyle',
  'passport-photo-size-guide': 'Productivity & Lifestyle',
  'cabin-bag-airline-size-checker': 'Productivity & Lifestyle',
  'dimensional-weight-shipping-calculator': 'SaaS & Business Killers',
  'oven-gas-mark-temperature-converter': 'Culinary & Food Science',
  'yeast-fresh-instant-converter': 'Culinary & Food Science',
  'air-fryer-oven-conversion': 'Culinary & Food Science',
  'ev-charging-cost-calculator': 'Productivity & Lifestyle',
  'horsepower-kw-torque-converter': 'Productivity & Lifestyle',
  'intermittent-fasting-window-planner': 'Health & Fitness',
  'calorie-deficit-weight-loss-timeline': 'Health & Fitness',
  'protein-daily-intake-calculator': 'Health & Fitness',
  'a1c-average-glucose-converter': 'Health & Fitness',
  'mean-arterial-pressure-calculator': 'Health & Fitness',
  'hyperfocal-depth-of-field-calculator': 'SaaS & Business Killers',
  'crop-factor-35mm-equivalent': 'SaaS & Business Killers',
  'nd-filter-exposure-calculator': 'SaaS & Business Killers',
  'bytes-kb-mb-gb-converter': 'SaaS & Business Killers',
  'download-time-calculator': 'SaaS & Business Killers',
  'uk-holiday-entitlement-calculator': 'Productivity & Lifestyle',
  'ucas-tariff-points-calculator': 'Productivity & Lifestyle',
  'schengen-90-180-day-calculator': 'Productivity & Lifestyle',
  'notice-period-end-date-calculator': 'Productivity & Lifestyle',
  'gps-coordinates-dms-decimal': 'Productivity & Lifestyle',
  'ratio-proportion-calculator': 'Mathematics',
  'scientific-notation-sigfig-calculator': 'Mathematics',
  'prime-number-checker': 'Mathematics',
  'sales-commission-calculator': 'Finance & Money',
  'keyword-density-word-frequency': 'Writing & Language',
  'cagr-annual-growth-calculator': 'Finance & Money',
  'apr-apy-converter': 'Finance & Money',
  'hmrc-mileage-allowance-calculator': 'Finance & Money',
  'battery-runtime-mah-calculator': 'Science & Engineering',
  'led-current-limiting-resistor': 'Science & Engineering',
  'voltage-divider-calculator': 'Science & Engineering',
  'pool-spa-volume-calculator': 'Home & DIY',
  'projector-throw-distance-calculator': 'Productivity & Lifestyle',
  'xml-beautifier-formatter': 'SaaS & Business Killers',
  'color-harmony-palette-generator': 'SaaS & Business Killers',
  'mattress-size-converter': 'Productivity & Lifestyle',
  'abv-proof-dilution-calculator': 'Culinary & Food Science',
  'leap-year-weekday-finder': 'Productivity & Lifestyle',
  'rule-of-72-doubling-calculator': 'Finance & Money',
  'gallons-litres-pints-converter': 'Productivity & Lifestyle',
  'acres-hectares-sqm-converter': 'Productivity & Lifestyle',
  'bar-psi-kpa-pressure-converter': 'Productivity & Lifestyle',
  'knots-mph-kph-converter': 'Productivity & Lifestyle',
  'duplicate-line-remover-sorter': 'Writing & Language',
  'julian-day-date-converter': 'Astronomy & Space',
  'bra-size-converter': 'Productivity & Lifestyle',
  'hat-size-converter': 'Productivity & Lifestyle',
  'business-card-size-guide': 'Productivity & Lifestyle',
  'engine-displacement-converter': 'Productivity & Lifestyle',
  'celsius-fahrenheit-kelvin-converter': 'Productivity & Lifestyle',
  'audio-file-size-calculator': 'SaaS & Business Killers',
  'timelapse-interval-calculator': 'SaaS & Business Killers',
  'qtc-heart-interval-calculator': 'Health & Fitness',
  'pregnancy-weight-gain-guide': 'Health & Fitness',
  'baby-formula-mixing-calculator': 'Health & Fitness',
  'rc-time-constant-calculator': 'Science & Engineering',
  'speaker-ohm-wiring-calculator': 'Science & Engineering',
  'mulch-coverage-calculator': 'Home & DIY',
  'garden-plant-spacing-calculator': 'Home & DIY',
  'cubic-bezier-easing-preview': 'SaaS & Business Killers',
  'nginx-redirect-generator': 'SaaS & Business Killers',
  'html-css-minifier': 'SaaS & Business Killers',
  'ascii-hex-binary-text-converter': 'Writing & Language',
  'uk-postcode-formatter': 'Productivity & Lifestyle',
  'fiscal-quarter-finder': 'Productivity & Lifestyle',
  'keyboard-key-tester': 'Productivity & Lifestyle',
  'gitignore-template-builder': 'SaaS & Business Killers',
  'diceware-passphrase-generator': 'SaaS & Business Killers',
  'tabata-interval-timer': 'Health & Fitness',
  'lumen-lux-calculator': 'Science & Engineering',
  'vcard-contact-generator': 'Productivity & Lifestyle',
  'ics-event-builder': 'Productivity & Lifestyle',
  'nato-phonetic-speller': 'Writing & Language',
  'wind-chill-calculator': 'Science & Engineering',
  'cors-header-builder': 'SaaS & Business Killers',
  'csv-json-converter': 'SaaS & Business Killers',
  'heat-index-calculator': 'Science & Engineering',
  'tap-drill-size-chart': 'Home & DIY',
  'rainwater-harvest-calculator': 'Home & DIY',
  'flesch-reading-ease': 'Writing & Language',
  'uk-alcohol-units-calculator': 'Health & Fitness',
  'mortgage-overpayment-calculator': 'Finance & Money',
  'rental-yield-calculator': 'Finance & Money',
  'stripe-paypal-fee-calculator': 'Finance & Money',
  'css-specificity-calculator': 'SaaS & Business Killers',
  'json-flatten-unflatten': 'SaaS & Business Killers',
  'quadratic-equation-solver': 'Mathematics',
  'pythagoras-triangle-solver': 'Mathematics',
  'running-split-pace-calculator': 'Sports',
  'led-watt-equivalent-calculator': 'Home & DIY',
  'dew-point-calculator': 'Science & Engineering',
  'pro-rata-salary-calculator': 'Finance & Money',
  'waist-to-height-ratio': 'Health & Fitness',
  'delay-time-bpm-calculator': 'Music & Audio',
  'meat-internal-temperature-guide': 'Culinary & Food Science',
  'nanoid-generator': 'SaaS & Business Killers',
  'srt-subtitle-time-shifter': 'SaaS & Business Killers',
  'skip-hire-volume-calculator': 'Home & DIY',
  'html-to-markdown-converter': 'Writing & Language',
  'mean-median-mode-stdev': 'Mathematics',
  'syllable-counter': 'Writing & Language',
  'karvonen-heart-rate-zones': 'Health & Fitness',
  'note-frequency-calculator': 'Music & Audio',
  'dividend-yield-calculator': 'Finance & Money',
  'downlight-spacing-calculator': 'Home & DIY',
  'blood-pressure-category-guide': 'Health & Fitness',
  'turkey-thaw-cook-time': 'Culinary & Food Science',
  'rice-water-ratio-calculator': 'Culinary & Food Science',
  'beaufort-wind-scale': 'Science & Engineering',
  'clock-angle-calculator': 'Mathematics',
  'radians-degrees-converter': 'Mathematics',
  'ieee-754-converter': 'SaaS & Business Killers',
  'guitar-fret-calculator': 'Music & Audio',
  'sleep-debt-calculator': 'Health & Fitness',
  'loan-amortization-schedule': 'Finance & Money',
  'sphere-cylinder-cone-volume': 'Mathematics',
  'scrabble-score-calculator': 'Productivity & Lifestyle',
  'markdown-table-generator': 'Writing & Language',
  'ltv-mortgage-calculator': 'Finance & Money',
  'query-string-parser': 'SaaS & Business Killers',
  'carbon-14-dating-calculator': 'Museum & Collection',
  'mohs-hardness-gallery': 'Museum & Collection',
  'heraldry-blazon-workshop': 'Museum & Collection',
  'egyptian-hieroglyph-alphabet': 'Museum & Collection',
  'younger-futhark-runes': 'Museum & Collection',
  'dewey-decimal-classifier': 'Museum & Collection',
  'messier-catalogue-hall': 'Museum & Collection',
  'conservation-lux-hours': 'Museum & Collection',
  'museum-tombstone-label': 'Museum & Collection',
  'pigment-cabinet-of-colour': 'Museum & Collection',
  'dinosaur-scale-hall': 'Museum & Collection',
  'japanese-era-nengo': 'Museum & Collection',
  'british-regnal-years': 'Museum & Collection',
  'sundial-gnomon-angle': 'Museum & Collection',
  'architectural-orders-column': 'Museum & Collection',
  'seven-wonders-hall': 'Museum & Collection',
  'roman-coin-denominations': 'Museum & Collection',
  'latin-date-kalends-nones': 'Museum & Collection',
  'hominin-timeline-hall': 'Museum & Collection',
  'uk-hallmark-decoder': 'Museum & Collection'
};

const sportsList = [
  'cricket-chase-calculator',
  'football-points-needed',
  'tournament-bracket-generator',
  'golf-whs-handicap-calculator',
  'darts-checkout-calculator',
  'cycling-power-speed-calculator',
  'swimming-pace-calculator',
  'tennis-live-scorer',
  'basketball-efficiency-calculator',
  'youth-team-rotation-planner',
  'cricket-net-run-rate-calculator',
  'snooker-scorer-and-snookers',
  'darts-average-and-leg-tracker',
  'golf-stableford-scorecard-calculator',
  'rugby-points-score-builder',
  'running-cadence-stride-calculator',
  'baseball-stats-calculator',
  'betting-odds-each-way-calculator',
  'athletics-decathlon-points-calculator',
  'motorsport-lap-time-stint-calculator',
  'bowling-score-calculator',
  'badminton-scorekeeper',
  'volleyball-score-sheet',
  'ice-hockey-goalie-stats',
  'powerlifting-dots-wilks-score',
  'table-tennis-scorekeeper',
  'archery-score-calculator',
  'formula1-championship-points',
  'round-robin-fixture-generator',
  'rowing-erg-pace-calculator',
  // Folded in from other categories (were default/Health/Science):
  'boxing-fight-decision-predictor',
  'boxing-judge-criteria-trainer',
  'boxing-knockdown-count-rules',
  'boxing-punch-stat-tracker',
  'boxing-round-by-round-analyzer',
  'boxing-round-timer-bell',
  'boxing-scorecard-comparator',
  'boxing-ten-point-must-scorecard',
  'boxing-three-judge-simulator',
  'boxing-weight-class-checker',
  'premier-league',
  'bike-gear-calculator',
  'race-pace-predictor',
  'chess-elo-rating-calculator',
  'diving-score-calculator',
  'bouldering-score-calculator',
  'gymnastics-score-calculator',
  'triathlon-race-planner',
  'netball-scorekeeper',
  'handball-scorekeeper',
  'curling-score-calculator',
  'showjumping-faults-calculator',
  'weightlifting-sinclair-score'
];

const wellbeingList = [
  'difficult-conversation-scripter',
  'scam-sense-checker',
  'plain-language-decoder',
  'apology-builder',
  'household-emergency-plan',
  'carer-respite-planner',
  'grief-companion',
  'accessible-text-prep',
  'street-sharing-planner',
  'grounding-breathing-coach'
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
  'social-proof-testimonial-card-generator',
  // 2026-09-05 — ten browser replacements for paid SaaS products
  'csv-data-studio',
  'json-to-typescript-interface-generator',
  'image-optimiser-studio',
  'json-ld-structured-data-generator',
  'ab-test-significance-calculator',
  'startup-runway-burn-rate-simulator',
  'brand-logo-mark-generator',
  'email-signature-generator',
  'business-model-canvas-builder',
  'markdown-slide-deck-builder',
  // 2026-09-07 — high-intent, private web and content utilities
  'text-case-slug-converter',
  'uuid-ulid-generator',
  'unix-timestamp-date-converter',
  'url-encoder-query-builder',
  'html-entity-encoder-decoder',
  'lorem-ipsum-placeholder-generator',
  'text-diff-checker',
  'css-box-shadow-generator',
  'css-grid-layout-generator',
  'robots-sitemap-generator',
  // 2026-09-07 — ten high-intent browser utilities for developers and makers
  'css-border-radius-generator',
  'css-flexbox-playground',
  'css-filter-generator',
  'favicon-svg-icon-generator',
  'sql-formatter-query-helper',
  'mock-data-generator',
  'html-table-generator',
  'curl-command-builder',
  'email-subject-line-tester',
  'css-animation-generator',
  // 2026-09-07 — high-search developer / designer lookups
  'color-hex-rgb-hsl-converter',
  'http-status-code-encyclopedia',
  'mime-type-lookup-table',
  'semver-compare-bump-calculator'
];

// 2026-09-05 — ten survival & emergency-readiness tools. Matched exactly
// (not by substring) and checked early, so no other list can claim them.
const survivalList = [
  'water-purification-treatment-calculator',
  'heat-cold-exposure-survival-calc',
  'fire-escape-smoke-safety-planner',
  'gas-leak-carbon-monoxide-response',
  'poison-chemical-exposure-response',
  'driving-emergency-survival-guide',
  'emergency-comms-radio-planner',
  'evacuation-go-bag-planner',
  'personal-safety-awareness-planner',
  'cold-water-ice-drowning-rescue'
];

const interactiveArtList = ['3d-spirograph-nebula', 
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

const astronomyList = [
  'telescope-eyepiece-calculator',
  'telescope-limiting-resolver',
  'telescope-collimation-check',
  'deep-sky-exposure-planner',
  'dark-sky-quality-planner',
  'airmass-extinction-calculator',
  'equatorial-coord-finder',
  'lunar-phase-illuminator',
  'redshift-distance-calculator',
  'black-hole-horizon-calculator'
];

const homeDIYList = [
  'paint-calculator',
  'wall-anchor-guide',
  'picture-hanging-guide',
  'tile-flooring-estimator',
  'shelf-bracket-calculator',
  'screw-drill-chart',
  'room-layout-planner',
  'concrete-mix-calculator',
  'wallpaper-estimator',
  'insulation-calculator',
  'plumbing-pipe-sizing',
  'brick-calculator',
  'decking-calculator',
  'gravel-calculator',
  'fence-calculator',
  'plastering-calculator',
  'stud-framing-calculator',
  'board-foot-lumber-calculator',
  'stair-stringer-calculator',
  'roof-pitch-rafter-calculator',
  'drywall-calculator',
  'room-btu-hvac-calculator',
  'miter-bevel-angle-calculator',
  'laminate-flooring-calculator',
  'deck-joist-span-calculator',
  'grout-adhesive-calculator'
];

const demosList = [
  'monte-carlo-pi-estimator',
  'conways-game-of-life',
  'mandelbrot-set-explorer',
  'bifurcation-diagram-logistic-map',
  'fourier-series-synthesizer',
  'galton-board-central-limit',
  'buffons-needle-pi',
  'lorenz-attractor',
  'barnsley-fern-fractal',
  'eulers-identity-rotation'
];

const csList = [
  'sorting-algorithm-visualizer',
  'pathfinding-algorithm-visualizer',
  'towers-of-hanoi',
  'neural-network-playground',
  'big-o-complexity-explorer',
  'cellular-automata-explorer',
  'huffman-coding-compression',
  'classical-cipher-suite',
  'recursion-memoization-explorer',
  'binary-bits-bitwise-playground'
];

function getCategory(name) {
  if (gapFillMap[name]) return gapFillMap[name];
  if (sportsList.includes(name)) return 'Sports';
  if (demosList.includes(name)) return 'Mind-Blowing Demos';
  if (csList.includes(name)) return 'Algorithms & Computer Science';
  if (wellbeingList.includes(name)) return 'Wellbeing & Community';
  if (survivalList.includes(name)) return 'Survival & Emergency Readiness';
  if (homeDIYList.some(s => name.includes(s))) return 'Home & DIY';
  if (astronomyList.some(s => name.includes(s))) return 'Astronomy & Space';
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
  if (museumList.some(s => name.includes(s))) return 'Museum & Collection';
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

let previousByName = {};
try {
  const prev = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  if (Array.isArray(prev)) {
    for (const e of prev) {
      if (e && e.name) previousByName[e.name] = e;
    }
  }
} catch (e) {
  previousByName = {};
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
    category: (previousByName[base] && previousByName[base].category)
      ? previousByName[base].category
      : getCategory(base),
    file: file,
    path: `cards/${file}`
  };
});

fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2));
console.log(`✅ cards.json updated with ${manifest.length} cards`);

const { spawnSync } = require('child_process');
const disco = spawnSync(process.execPath, [path.join(__dirname, 'scripts', 'generate-discoverability.js')], {
  stdio: 'inherit'
});
if (disco.status) process.exit(disco.status);
