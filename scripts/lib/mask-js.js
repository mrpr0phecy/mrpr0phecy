'use strict';
// mask-js.js — a JavaScript source with its strings, comments and regex
// literals blanked out, at the SAME length and the same line breaks as the
// original.
//
// Every static card check needs the same first move: find a brace, a call or a
// declaration WITHOUT being fooled by the same text sitting inside a string or
// a comment. `check-card-init.js` grew this masker first (a brace inside a
// string cannot be allowed to move a closing brace); `check-card-leftovers.js`
// needs it next (a `.remove()` inside a comment is not a removal).
//
// Blanking in place over a character array is deliberate. The first version
// built the output with `out.push(...)`, which drifted by a byte whenever an
// escape landed on the last character of a block — and a mask that is one byte
// longer than its source silently matches the wrong braces, which is exactly
// the bug it exists to prevent. Every offset must survive, so the assertion at
// the end is part of the contract, not a sanity check.

// A `/` after one of these words starts a regex, not a division: deciding by
// the previous character alone read `return /[",]/.test(s)` as a division, so
// the quote inside the class opened a phantom string that blanked the rest of
// the script — and every check after it saw nothing.
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete',
  'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
function wordBefore(code, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(code[j])) j--;
  const end = j + 1;
  while (j >= 0 && /[A-Za-z0-9_$]/.test(code[j])) j--;
  if (j >= 0 && code[j] === '.') return '';  // obj.return / x is a division
  return code.slice(j + 1, end);
}

/** Blank strings, comments and regex literals, keeping every offset and line. */
function mask(code) {
  const out = code.split('');
  const n = code.length;
  const blank = (a, b) => {
    for (let k = Math.max(0, a); k < Math.min(b, n); k++) out[k] = code[k] === '\n' ? '\n' : ' ';
  };
  let i = 0;
  let prev = '';
  while (i < n) {
    const c = code[i];
    const nxt = code[i + 1] || '';
    if (c === '/' && nxt === '/') {
      const start = i;
      while (i < n && code[i] !== '\n') i++;
      blank(start, i);
      continue;
    }
    if (c === '/' && nxt === '*') {
      const start = i;
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i = Math.min(i + 2, n);
      blank(start, i);
      continue;
    }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%^~<>'.includes(prev) || REGEX_AFTER_WORD.has(wordBefore(code, i)))) {
      // A regex literal or a division: decide by whether it closes on the line.
      const start = i;
      i += 1;
      let inClass = false;
      let closed = false;
      while (i < n) {
        const ch = code[i];
        if (ch === '\\') { i += 2; continue; }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) { i += 1; closed = true; break; }
        else if (ch === '\n') break;
        i += 1;
      }
      if (closed) { blank(start, i); prev = '/'; } else { i = start + 1; prev = c; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const start = i;
      i += 1;
      while (i < n && code[i] !== c) {
        if (code[i] === '\\') { i += 2; continue; }
        i += 1;
      }
      i = Math.min(i + 1, n);
      blank(start, i);
      prev = c;
      continue;
    }
    if (!/\s/.test(c)) prev = c;
    i += 1;
  }
  const masked = out.join('');
  if (masked.length !== code.length) throw new Error('mask drifted');
  return masked;
}

/** Index of the `}` matching the `{` at openIdx, or -1. Masked input only. */
function matchBrace(masked, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < masked.length; i++) {
    if (masked[i] === '{') depth++;
    else if (masked[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

module.exports = { mask, matchBrace };
