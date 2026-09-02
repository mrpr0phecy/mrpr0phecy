# LEGAL.md — compliance register and rules for contributors

The legal system of record for `mrpr0phecy/mrpr0phecy`. Public-facing wording
lives in **[legal.html](legal.html)** — that page is what visitors read and what
binds. This file is the internal register: what was found, what was fixed, and
the rules that keep it true.

Jurisdiction: England &amp; Wales. Regimes that apply: **UK GDPR**, **PECR
reg. 6** (cookies/storage), **CAP/ASA** rules on misleading claims, **Consumer
Protection from Unfair Trading Regulations**, plus platform ToS (YouTube,
PayPal, GitHub Pages).

Audit date: **2 September 2026**. Reviewer: legal pass over the whole repo.

---

## 1. The system in one page

| Concern | Single source of truth | Never do instead |
|---|---|---|
| Privacy, cookies, terms, disclaimers, IP, takedown | `legal.html` (one page, nine anchored sections) | A second privacy page, or per-page terms |
| Loading any third-party script | `consent.js` | Inline `gtag`/Tawk snippets in a page |
| Per-tool risk warnings | `RISK_NOTICES` tables in `index.html` + `tool.html` | Hand-written disclaimers inside a card |
| Code licence and asset carve-outs | `LICENSE` | Per-file licence headers |
| Footer legal links | the `legal-bar` block at the end of every page | Ad-hoc footer links |

Four artefacts. Everything else references them.

---

## 2. What was wrong before this pass

| # | Finding | Risk | Status |
|---|---|---|---|
| 1 | Google Analytics (`G-G058FVW6Z2`) loaded unconditionally on 14 pages; Tawk.to live chat on 12 translated pages. No consent banner, no privacy policy anywhere on the domain. | **High** — PECR reg. 6 breach; UK GDPR transparency breach (ICO fines + enforcement). | Fixed |
| 2 | Same pages advertised "no tracking" and "100% Private" while running GA. | **High** — misleading commercial claim (CPRs/ASA) on pages that also solicit donations and sponsorship. | Fixed |
| 3 | No privacy policy, no terms of use, no liability limitation anywhere. | **High** — unlimited exposure on tool outputs; no governing-law clause. | Fixed |
| 4 | No `LICENSE`. Public repo with no licence = all rights reserved by default, and no carve-out separating MIT-able code from all-rights-reserved music/photography. | **Medium** — ambiguity in both directions. | Fixed |
| 5 | Health, financial, electrical and legal-document tools shipped with no disclaimer. BMI, dosage-adjacent, mortgage, breaker-sizing and a GDPR privacy-policy generator are all present. | **High** — negligent misstatement; regulated-advice perimeter (FCA/SRA adjacency). | Fixed |
| 6 | Tool count contradicted itself: `483` (donate, sponsor, 404), `500` (tool.html, README, AGENTS.md), `562` (actual, index.html). Donation and sponsorship pages carried the wrong number. | **Medium** — inaccurate claim on the two pages that ask for money. | Fixed |
| 7 | Donations solicited via PayPal with no refund position, no "this is a gift, not a purchase" statement, no charity-status clarification. | **Medium** — consumer-law and PayPal-ToS exposure. | Fixed |
| 8 | `sonicfansite.html` uses SEGA marks and characters; `government.html` presents political content. Disclaimers were partial and buried. | **Medium** — trade mark; implied endorsement. | Fixed (`legal.html` §8, footer on every page) |
| 9 | No takedown route published; contact address appeared only on `sponsor.html`. | **Medium** — no safe-harbour-style process, slow complaint handling. | Fixed |
| 10 | ~40 live third-party feeds (BBC, Reuters, AP, NYT and others) reproduced on news pages. | **Low–Medium** — headline/snippet reuse. Ongoing: display headline + link only, never full article text. | Documented |

---

## 3. What was implemented

**`consent.js`** — the only loader for GA and Tawk.to. No third-party request
fires before an explicit Accept. Decline is a single click of equal prominence
(ICO requirement), the choice persists in `localStorage`, GA runs with
`anonymize_ip` and Google Signals off, and any `[data-consent-manage]` element
re-opens the banner. All 26 inline snippets were deleted and replaced with one
`<script defer src="/consent.js" data-analytics>` (or `data-chat`) tag.

**`legal.html`** — one page, nine sections: who runs the site, privacy, cookies
(with a table naming every third party and when it loads), data rights, terms of
use, tool-accuracy disclaimer, donations and sponsorship, IP and trade marks,
takedown. Linked from the footer of every page and listed in `sitemap.xml`.

**Footer `legal-bar`** — appended to all 43 top-level pages: Privacy &amp;
Cookies, Terms, Disclaimer, Cookie choice, plus a one-line copyright and
"estimates, not professional advice" reminder.

**Risk notices** — category- and slug-driven warnings rendered into the card
footer in `index.html` and above the tool in `tool.html`. Five classes:
`medical`, `finance`, `engineering`, `legal`, `feed`. No card contains its own
disclaimer text, so the wording changes in two places and propagates to every
affected tool.

**Claim wording** — "no tracking" / "100% Private" replaced with the defensible
"no ads, no accounts, no ad tracking" and "Runs in your browser". The claims are
now literally true: no advertising network exists, and analytics only run on
consent.

**`LICENSE`** — MIT for site code, with an explicit carve-out list for music,
artwork, photography, CVs, third-party libraries and third-party marks.

**Tool count** — normalised to **562** (`ls cards/*.html | wc -l`) everywhere,
including the donation and sponsorship pages.

---

## 4. Rules for anyone editing this repo

1. **Never inline a third-party script.** If a page needs analytics or chat, add
   the `consent.js` tag. If it needs a *new* third party, add it to
   `consent.js`, add a row to the table in `legal.html` §3, and note it here.
2. **Never write "no tracking", "100% private", "zero cookies"** or similar
   absolutes while `consent.js` ships. Use "no ads, no accounts, no ad
   tracking".
3. **Never put a disclaimer inside a card.** Add the slug or category to
   `RISK_NOTICES` mapping in `index.html` and `tool.html` — keep the two in
   step.
4. **New tool in a regulated area** (health, money, electrical, legal
   documents)? Confirm it matches a risk class before shipping. If it fits none,
   add one rather than shipping bare.
5. **Every new top-level page** gets the `legal-bar` footer block and a
   `sitemap.xml` entry.
6. **Tool counts** come from `ls cards/*.html | wc -l`. Update
   `index.html`, `tool.html`, `donate.html`, `sponsor.html`, `404.html` and the
   JSON-LD together, or leave the number out.
7. **No sampling, reposting or embedding third-party music, art or footage**
   beyond official embeds. Official YouTube/SoundCloud embeds only.
8. **News pages: headline, source name and link only.** Never reproduce full
   article bodies, never strip attribution.
9. **Nothing that reads as advice.** "Estimate", "guide", "aid" — never
   "recommended dose", "you should invest", "this is compliant".
10. **Takedown emails are answered the same week** and the material comes down
    while it is reviewed.

---

## 5. Open items for the owner

These need a human decision — they are outside what a code change can settle.

- **Contact address.** `legal.html` publishes
  `hello@themostusefulsiteintheworld.com`. Confirm that mailbox is monitored, or
  swap it for one that is. A published address nobody reads is worse than none.
- **Trading identity.** The site is stated as a sole individual, not a company.
  If donation or sponsorship income becomes material, take accounting advice on
  self-assessment and on whether a limited company is worthwhile.
- **ICO registration.** A sole trader doing consent-based analytics for their
  own site is usually exempt from the data-protection fee, but confirm against
  the ICO self-assessment if any visitor personal data is ever collected
  directly (a contact form, a mailing list, an account system).
- **Sponsorship contracts.** `sponsor.html` sells placements up to £1,000. Use a
  short written agreement covering deliverable, duration, refund and the right
  to refuse content, rather than an email thread.
- **Google Analytics necessity.** Consent banners depress accepted-analytics
  volume heavily. A cookieless, aggregate-only alternative would let the site
  drop the banner entirely and restore an unqualified privacy claim. Worth
  considering.
- **Music rights.** If any recording contains an uncleared sample or a
  collaborator with an unwritten split, resolve it before pushing the catalogue
  commercially.

---

## 6. Review cadence

Re-run this audit whenever a third party is added, a monetisation route changes,
or annually — whichever comes first. Update the audit date at the top and the
"Last updated" line in `legal.html` together.
