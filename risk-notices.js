/*!
 * risk-notices.js — shell-level risk notices for The Most Useful Site.
 *
 * ONE mapping used by BOTH index.html (cards rendered inline) and tool.html
 * (standalone tool pages), replacing hand-written per-card warnings that were
 * inconsistent and easy to forget (ROADMAP "Now": "Add risk notices at shell
 * level — one mapping used by both shells for medical, financial, engineering
 * and legal tools").
 *
 * Shells show the notice for a tool ABOVE its content; the tool's own copy is
 * untouched, so existing in-card caveats keep working (belt and braces).
 *
 * Contract (tested by scripts/tests/risk-notices.test.js):
 *   SiteRiskNotices.noticeFor({ name, category }) -> { icon, kind, text } | null
 *   SiteRiskNotices.build(notice, document)        -> element (div.risk-notice,
 *                                                     role="note")
 *   SiteRiskNotices.attach(container, { name, category }) -> element | null
 *
 * Adding an entry here is a reviewed, deliberate choice: the notices say what
 * a tool is NOT (a professional), never scare people away from a safe tool.
 */
(function (global) {
  'use strict';

  var KINDS = {
    financial: {
      icon: '\uD83D\uDCB0', // 💰
      text: 'Informational estimates only, not financial advice. Check the assumptions and figures before making money decisions.'
    },
    medical: {
      icon: '\uD83E\uDE7A', // 🩺
      text: 'Information and estimates only, not medical advice. For personal health decisions, speak to a qualified clinician.'
    },
    emergency: {
      icon: '\uD83D\uDEA8', // 🚨
      text: 'General guidance only. In any real emergency, call your local emergency number (999 in the UK) immediately.'
    },
    legal: {
      icon: '\u2696\uFE0F', // ⚖️
      text: 'General information only, not legal advice. Rules vary by jurisdiction and change over time; check official sources or a qualified adviser.'
    },
    diy: {
      icon: '\uD83E\uDEBA', // 🦺
      text: 'Guidance estimates only. Follow manufacturer instructions and building regulations, and use a qualified professional for structural, gas or electrical work.'
    }
  };

  // Whole categories whose output people may wrongly treat as professional
  // advice. Names must exist in cards/cards.json (the test enforces this).
  var CATEGORY_KINDS = {
    'Finance & Money': 'financial',
    'Health & Fitness': 'medical',
    'Wellbeing & Community': 'medical',
    'Natural Remedies & Herbs': 'medical',
    'Survival & Emergency Readiness': 'emergency'
  };

  // Per-tool overrides for tools outside those categories (or inside one but
  // needing a different kind — the tool entry always wins). Slugs must exist
  // in cards/cards.json (the test enforces this too).
  var TOOL_KINDS = {
    // Legal-adjacent, mostly in Finance & Money / SaaS & Business Killers.
    'bank-complaint-tracker': 'legal',
    'bank-fos-complaint': 'legal',
    'bank-sar-request': 'legal',
    'bank-small-claims': 'legal',
    'small-claims-lba-generator': 'legal',
    'tenancy-deposit-calculator': 'legal',
    'redundancy-notice-calculator': 'legal',
    'notice-period-end-date-calculator': 'legal',
    'uk-holiday-entitlement-calculator': 'legal',
    'nda-contract-service-agreement-builder': 'legal',
    'gdpr-ccpa-privacy-policy-generator': 'legal',
    'schengen-90-180-day-calculator': 'legal',
    // DIY/structural/electrical estimates (Home & DIY).
    'deck-joist-span-calculator': 'diy',
    'stair-stringer-calculator': 'diy',
    'shelf-bracket-calculator': 'diy',
    'wall-anchor-guide': 'diy',
    'stud-framing-calculator': 'diy',
    'roof-pitch-rafter-calculator': 'diy',
    'concrete-mix-calculator': 'diy',
    'plumbing-pipe-sizing': 'diy',
    'downlight-spacing-calculator': 'diy'
  };

  function noticeFor(card) {
    if (!card) return null;
    var kind = TOOL_KINDS[card.name] || CATEGORY_KINDS[card.category];
    if (!kind || !KINDS[kind]) return null;
    var entry = KINDS[kind];
    return { icon: entry.icon, kind: kind, text: entry.text };
  }

  function build(notice, doc) {
    var d = doc || global.document;
    if (!d || !notice) return null;
    var el = d.createElement('div');
    el.className = 'risk-notice';
    el.setAttribute('role', 'note');
    el.setAttribute('data-risk-kind', notice.kind);
    var icon = d.createElement('span');
    icon.className = 'risk-notice-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = notice.icon;
    var text = d.createElement('span');
    text.className = 'risk-notice-text';
    text.textContent = notice.text;
    el.appendChild(icon);
    el.appendChild(text);
    return el;
  }

  function attach(container, card) {
    if (!container || !card) return null;
    var notice = noticeFor(card);
    if (!notice) return null;
    var el = build(notice);
    container.insertBefore(el, container.firstChild);
    return el;
  }

  global.SiteRiskNotices = {
    noticeFor: noticeFor,
    build: build,
    attach: attach,
    kinds: KINDS,
    categoryKinds: CATEGORY_KINDS,
    toolKinds: TOOL_KINDS
  };
})(typeof window !== 'undefined' ? window : this);
