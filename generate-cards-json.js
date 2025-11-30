// generate-cards-json.js
// Node.js script to auto-generate cards.json from /cards directory

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio'); // npm install cheerio

const cardsDir = path.join(__dirname, 'cards');
const outputFile = path.join(cardsDir, 'cards.json');

const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.html'));

const manifest = files.map(file => {
  const filePath = path.join(cardsDir, file);
  const html = fs.readFileSync(filePath, 'utf8');
  const $ = cheerio.load(html);

  // Extract title from first <h2>
  const h2 = $('h2').first();
  const title = h2.text().trim();
  const id = h2.attr('id') || path.basename(file, '.html');

  return {
    id,
    title,
    path: `cards/${file}`,
    category: "Uncategorized",
    version: "1.0"
  };
});

fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2));
console.log(`✅ cards.json updated with ${manifest.length} cards`);
