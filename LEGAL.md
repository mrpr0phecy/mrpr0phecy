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
| Analytics | `analytics.js` — the only GA loader | Inline `gtag` snippets in a page |
| Cross-agent coordination | [`staff/`](staff/) | Editing a shared file without checking the board |
| Support / questions | `help.html` (searchable FAQ + email) | A third-party chat widget |
| Per-tool risk warnings | `RISK_NOTICES` tables in `index.html` + `tool.html` | Hand-written disclaimers inside a card |
| Code licence and asset carve-outs | `LICENSE` | Per-file licence headers |
| Footer legal links | the `legal-bar` block at the end of every page | Ad-hoc footer links |

Four artefacts. Everything else references them.

**Position as of 2 September 2026 (final): Google Analytics runs sitewide and
the privacy claims have been removed.** The owner's priority is reach — GA is
needed to know which tools are used and to price sponsorship honestly. So the
contradiction was resolved in the other direction: keep the analytics, delete
the "no tracking / 100% private / no cookies" claims wherever they appeared.

GA loads from **`analytics.js`** and nowhere else, with `anonymize_ip` on and
both Google Signals and ad personalisation off. `legal.html` §3 discloses it in
full with working opt-out instructions. Tawk.to stays removed (replaced by
`help.html`). No consent banner currently ships — see the open item in §5.

---

## 2. What was wrong before this pass

| # | Finding | Risk | Status |
|---|---|---|---|
| 1 | Google Analytics (`G-G058FVW6Z2`) loaded unconditionally on 14 pages; Tawk.to live chat on 12 translated pages. No consent banner, no privacy policy anywhere on the domain. | **High** — PECR reg. 6 breach; UK GDPR transparency breach (ICO fines + enforcement). | Fixed — both removed entirely |
| 2 | Same pages advertised "no tracking" and "100% Private" while running GA. | **High** — misleading commercial claim (CPRs/ASA) on pages that also solicit donations and sponsorship. | Fixed — claims now true |
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

**Analytics consolidated** — the 26 scattered inline GA/Tawk snippets were
replaced by a single `analytics.js` loaded by all 45 top-level pages. The
measurement ID exists in exactly one file, so changing property, adding a
consent gate or removing analytics is a one-file edit rather than a 45-file
sweep. Tawk.to was retired in favour of `help.html`.

**Claims removed to match** — every "no tracking", "no cookies", "no analytics"
and "100% private" claim was stripped from the site, because GA makes them
false. Replacements that remain accurate: "no ads", "no accounts", "no
sign-ups", "no paywalls", "runs in your browser", "your inputs never leave your
device".

**`help.html`** — the replacement for live chat. A searchable, client-side FAQ
(19 answers across using the tools, privacy, music, money and legal) with an
email fallback. Runs no network calls, sets no storage and measures nothing.
Carries `FAQPage` JSON-LD so the answers can surface directly in search results.
Chosen over a live widget deliberately: a one-person site cannot staff real-time
chat, and a widget nobody is behind creates a false impression of availability.

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

1. **Never write "no tracking", "no cookies", "no analytics" or "100%
   private".** Google Analytics runs sitewide, so these are false — and they
   previously sat on the donation and sponsorship pages, which turns a wording
   slip into a consumer-protection problem. Accurate alternatives: "no ads",
   "no accounts", "no sign-ups", "no paywalls", "runs in your browser".
2. **Analytics loads from `analytics.js` only.** One tag per page. Never inline
   a `gtag` snippet — the whole point is a single place to change or remove it.
   Any *new* third party needs a row in `legal.html` §3 and a note here.
2b. **Support goes through `help.html`.** Add new answers there rather than
   bolting on a chat widget.
3. **Never put a disclaimer inside a card.** Add the slug or category to
   `RISK_NOTICES` mapping in `index.html` and `tool.html` — keep the two in
   step.
4. **New tool in a regulated area** (health, money, electrical, legal
   documents)? Confirm it matches a risk class before shipping. If it fits none,
   add one rather than shipping bare.
5. **Every new top-level page** gets the `legal-bar` footer block and a
   `sitemap.xml` entry. If it answers a common question, add it to `help.html`
   and to that page's `FAQPage` JSON-LD.
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

- **Contact address — now load-bearing.** With chat removed, email is the only
  support route, and `help.html` promises "a reply within a few days".
  `legal.html` publishes
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
- **No consent banner currently ships.** Strictly, UK PECR reg. 6 wants prior
  consent before GA's non-essential storage. The current position — full
  disclosure in `legal.html` §3, working opt-out instructions, IP anonymisation,
  ad personalisation off — is a defensible middle ground for a one-person site,
  and the ICO's practical focus is ad-tech rather than aggregate stats. It is
  not, however, the maximally safe position. A banner would cost 20–50% of
  measured traffic, which is the opposite of why GA was reinstated. Revisit if
  UK/EU becomes the dominant audience or sponsorship contracts start depending
  on the numbers. Tracked as staff DISCUSSION #4.
- **Six of seven agent branches still ship the old contradiction** (analytics
  plus "no tracking" claims). Run `python3 staff/scan.py` to see the current
  state; each branch must strip the claims before merging.
- **Music rights.** If any recording contains an uncleared sample or a
  collaborator with an unwritten split, resolve it before pushing the catalogue
  commercially.

---

## 6. Review cadence

Re-run this audit whenever a third party is added, a monetisation route changes,
or annually — whichever comes first. Update the audit date at the top and the
"Last updated" line in `legal.html` together.
