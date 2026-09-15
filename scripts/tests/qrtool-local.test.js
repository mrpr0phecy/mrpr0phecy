// Drives the REAL QR engine shipped inside cards/qrtool.html — the vendored
// qrcode-generator, the matrix painter's inputs, the SVG/PDF/ZIP builders and
// the card's top-level wiring — in a stub DOM. Zero dependencies.
//
// Why this exists: qrtool used to POST every URL, Wi-Fi credential, contact
// card and SMS it encoded to api.qrserver.com, and its SVG/PDF/JPEG/ZIP
// downloads were fake or broken (undefined functions, placeholder art).
// These tests pin the replacement: generation is 100% on-device, outputs are
// structurally valid, and the card cannot quietly regain egress.
//
// Run with: node scripts/tests/qrtool-local.test.js
'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

(async () => {
const card = fs.readFileSync('cards/qrtool.html', 'utf8');
const m = card.match(
  /<script>\n\/\/ ==================== CONFIGURATION ====================([\s\S]*?)\n<\/script>\n\n<!-- ===== 7\. CARD-SCOPED STYLES/
);
assert(m, 'could not extract the qrtool script block');
const script = m[1];

// ---- 1. the shipped card must contain no egress at all --------------------
// (Scan code, not prose: the card's provenance comment names the API it
// replaced, which must not count as a reference.)
const jsNoComments = script.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(?<!:)\/\/[^\n]*/g, ' ');
assert(!/qrserver|qrcode-monkey/i.test(jsNoComments),
  'qrtool references a third-party QR API again');
assert(!/\bfetch\s*\(/.test(jsNoComments), 'qrtool script contains fetch(');
assert(!/XMLHttpRequest|sendBeacon|new WebSocket|EventSource|importScripts/.test(jsNoComments),
  'qrtool script contains a raw network API');
assert(!/localStorage\.setItem\([^)]*qrData/.test(script),
  'qrtool must not persist encoded QR content');

// ---- 2. run the shipped script in a stub DOM ------------------------------
function stubEl() {
  return {
    style: {}, value: '', innerHTML: '', textContent: '', dataset: {},
    classList: { add() {}, remove() {} },
    addEventListener() {}, appendChild() {}, prepend() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [],
    getContext: () => null,
  };
}
const context = {
  document: {
    readyState: 'complete',
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => stubEl(),
    getElementById: () => stubEl(),
    createElement: () => stubEl(),
  },
  localStorage: { getItem: () => null, setItem() {} },
  console: { log() {}, warn() {}, error() {} },
  navigator: {},
  TextEncoder, TextDecoder, Uint8Array, DataView, Blob, atob, btoa,
  URL, Image: class {},
};
vm.createContext(context);
// Expose the script's lexical top-levels (const/let stay script-scoped in vm).
const expose = `
;globalThis.__t = { QR_CONFIG, qrState, QRTOOL_QRCODE, qrtoolBuildMatrix,
  qrtoolMakeSVG, qrtoolMakePDF, qrtoolMakeZIP, qrtoolCRC32,
  qrtoolDataURLBytes, updateSettings, getQRData };
`;
vm.runInContext(script + expose, context, { filename: 'cards/qrtool.html<script>' });
const t = context.__t;
assert(t && t.QRTOOL_QRCODE, 'QRTOOL_QRCODE did not initialise');

// ---- 3. the vendored engine produces a real matrix -------------------------
const matrix = t.qrtoolBuildMatrix('https://themostusefulsiteintheworld.com', 'M');
const n = matrix.getModuleCount();
assert.ok(n >= 21 && n <= 177, `implausible module count ${n}`);
const dark = (r, c) => {
  assert.ok(matrix.isDark(r, c), `expected dark module at ${r},${c}`);
};
const light = (r, c) => {
  assert.ok(!matrix.isDark(r, c), `expected light module at ${r},${c}`);
};
// Finder patterns in three corners: 7×7 ring, light separator around.
dark(0, 0); dark(0, 6); dark(6, 0); dark(6, 6); dark(3, 3);
light(0, 7); light(7, 0); light(7, 7);
dark(0, n - 7); dark(6, n - 1); dark(3, n - 4);
light(0, n - 8); light(7, n - 1);
dark(n - 1, 0); dark(n - 7, 6); dark(n - 4, 3);
light(n - 8, 0); light(n - 1, 7);
// Deterministic, and UTF-8 text survives.
assert.deepStrictEqual(
  t.qrtoolBuildMatrix('héllo — ✓ Ünïcode', 'M').getModuleCount(),
  t.qrtoolBuildMatrix('héllo — ✓ Ünïcode', 'M').getModuleCount());
// Oversized content must throw a clean overflow (handled by generateQR).
assert.throws(() => t.qrtoolBuildMatrix('x'.repeat(4000), 'M'));

// ---- 4. the SVG is real vector art built from the matrix ------------------
t.qrState.qrMatrix = matrix;
t.qrState.settings = { color: '#123456', bgColor: '#ffffff', size: 512, ecc: 'M', margin: 4 };
const svg = t.qrtoolMakeSVG();
assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), 'svg missing xmlns');
assert.ok(svg.endsWith('</svg>'), 'svg not closed');
const moduleCount = (svg.match(/M\d+ \d+h1v1h-1z/g) || []).length;
let darkTotal = 0;
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (matrix.isDark(r, c)) darkTotal++;
assert.strictEqual(moduleCount, darkTotal, 'SVG path modules != matrix dark modules');
assert.ok(!/href|url\(/.test(svg), 'svg must not reference external resources');

// ---- 5. the PDF is a structurally valid single-page document --------------
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
const fakeCanvas = {
  width: 512, height: 512,
  toDataURL: () => 'data:image/jpeg;base64,' + JPEG.toString('base64'),
};
t.qrState.qrCanvas = fakeCanvas;
const pdfBlob = t.qrtoolMakePDF();
assert.ok(pdfBlob instanceof Blob, 'PDF builder did not return a Blob');
const pdf = Buffer.from(await new Response(pdfBlob).arrayBuffer());
assert.ok(pdf.subarray(0, 9).toString('latin1') === '%PDF-1.4\n', 'bad PDF header');
assert.ok(pdf.includes('/DCTDecode'), 'PDF does not embed the JPEG');
assert.ok(pdf.subarray(-5).toString('latin1') === '%%EOF', 'PDF missing %%EOF');
const xrefOff = parseInt(/startxref\n(\d+)\n%%EOF$/.exec(pdf.toString('latin1'))[1], 10);
assert.ok(pdf.subarray(xrefOff, xrefOff + 4).toString('latin1') === 'xref',
  'startxref does not point at the xref table');
// Every xref entry must point at "N 0 obj".
const xrefBlock = pdf.subarray(xrefOff).toString('latin1').split('trailer')[0];
const entries = xrefBlock.split('\n').filter(l => /^\d{10} 00000 n /.test(l));
assert.strictEqual(entries.length, 5, `expected 5 objects, xref lists ${entries.length}`);
entries.forEach((line, i) => {
  const off = parseInt(line.slice(0, 10), 10);
  const head = pdf.subarray(off, off + 12).toString('latin1');
  assert.ok(head.startsWith(`${i + 1} 0 obj`), `xref entry ${i + 1} points at "${head}"`);
});
// The image stream /Length must match the embedded JPEG byte count.
const lenMatch = /\/Length (\d+) >>\nstream\n/.exec(pdf.toString('latin1'));
assert(lenMatch, 'image stream /Length not found');
assert.strictEqual(Number(lenMatch[1]), JPEG.length, 'JPEG /Length mismatch');

// ---- 6. CRC32 and the store-only ZIP are spec-correct ----------------------
assert.strictEqual(t.qrtoolCRC32(new TextEncoder().encode('123456789')), 0xCBF43926,
  'CRC32 failed the standard check vector');
const pngA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const pngB = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
const zipBlob = t.qrtoolMakeZIP([
  { name: 'qr-001.png', bytes: new Uint8Array(pngA) },
  { name: 'qr-002.png', bytes: new Uint8Array(pngB) },
]);
const zip = Buffer.from(await new Response(zipBlob).arrayBuffer());
assert.ok(zip.readUInt32LE(0) === 0x04034b50, 'bad local header signature');
// Walk the local entries, then the central directory, then the EOCD.
let off = 0;
const seen = [];
for (let i = 0; i < 2; i++) {
  assert.strictEqual(zip.readUInt32LE(off), 0x04034b50, `entry ${i}: bad signature`);
  assert.strictEqual(zip.readUInt16LE(off + 8), 0, 'entry not stored');
  const crc = zip.readUInt32LE(off + 14);
  const size = zip.readUInt32LE(off + 18);
  const nameLen = zip.readUInt16LE(off + 26);
  const extraLen = zip.readUInt16LE(off + 28);
  const name = zip.subarray(off + 30, off + 30 + nameLen).toString();
  const data = zip.subarray(off + 30 + nameLen, off + 30 + nameLen + size);
  const expect = i === 0 ? pngA : pngB;
  assert.ok(data.equals(expect), `entry ${i}: payload mismatch`);
  const crcTable = t.qrtoolCRC32(new Uint8Array(expect));
  assert.strictEqual(crc, crcTable, `entry ${i}: local CRC mismatch`);
  seen.push({ name, crc, size, localOff: off });
  off += 30 + nameLen + extraLen + size;
}
const cdOff = off;
for (let i = 0; i < 2; i++) {
  assert.strictEqual(zip.readUInt32LE(off), 0x02014b50, `central ${i}: bad signature`);
  assert.strictEqual(zip.readUInt16LE(off + 10), 0, 'central method not store');
  assert.strictEqual(zip.readUInt32LE(off + 16), seen[i].crc, `central ${i}: CRC mismatch`);
  assert.strictEqual(zip.readUInt32LE(off + 24), seen[i].size, `central ${i}: size mismatch`);
  assert.strictEqual(zip.readUInt32LE(off + 42), seen[i].localOff, `central ${i}: offset mismatch`);
  off += 46 + zip.readUInt16LE(off + 28);
}
const eocd = off;
assert.strictEqual(zip.readUInt32LE(eocd), 0x06054b50, 'bad EOCD signature');
assert.strictEqual(zip.readUInt16LE(eocd + 10), 2, 'EOCD entry count wrong');
assert.strictEqual(zip.readUInt32LE(eocd + 12), eocd - cdOff, 'EOCD central size wrong');
assert.strictEqual(zip.readUInt32LE(eocd + 16), cdOff, 'EOCD central offset wrong');
assert.strictEqual(eocd + 22, zip.length, 'EOCD must be the last 22 bytes');

// ---- 7. data-URL helper round-trips ----------------------------------------
const bytes = t.qrtoolDataURLBytes('data:image/png;base64,' + pngA.toString('base64'));
assert.ok(Buffer.from(bytes).equals(pngA), 'qrtoolDataURLBytes round-trip failed');

console.log('qrtool-local: 7/7 checks passed — matrix, SVG, PDF, ZIP, CRC32, no egress.');

})().catch((e) => { console.error(e && e.message || e); process.exit(1); });
