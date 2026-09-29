# Trust — pointers #5 + #6 (YMYL, site-level signals)

Pointer #5 is YMYL. About 119 of 1312 tools touch money or the body. If those
pages feel like a bash-mash of thin fragments with no accountable author,
Google's quality raters (and users) are right to distrust the whole site.
This doc is the checklist we hold every deep page and every card to.

## The bar for a deep page (`tools/<slug>.html`)

A `tools/<slug>.html` deep page is where the 300+ honest words live — not
the homepage fragment. Our six pages (mortgage, bmi, compoundinterest, loan,
bmr, percentages) follow this template; clone it when you add the next one
via `scripts/tool-pages.json` → `python3 scripts/build-tool-pages.py`:

1. **Who is behind this** — About / Mission link, same footer everywhere.
2. **Methodology & sources** — named formula or standard (WHO, Mifflin-St
   Jeor, Bank of England) + primary sources with hrefs. Not "according to
   experts".
3. **Worked example** — one concrete calculation a reader can verify by hand.
4. **Edge cases & limits** — where the tool misleads (BMI underestimates
   athletes, mortgage payments ignore fees, etc.).
5. **Disclaimer** — one honest line: "Informational, not medical/financial
   advice. If a decision matters, talk to a qualified professional." Must
   appear above the fold or immediately under the tool chrome.
6. **Last reviewed date** — `Last reviewed: 2026-09-19` (updated when the
   page's prose changes; fragment cache busting is separate).

Stock YMYL disclaimer block (paste into a `tools/*.html` body slot):

```html
<p class="ymyl-disclaimer" role="note">
  <strong>Note:</strong> This tool is for information only — not medical,
  financial, or legal advice. If a decision matters, get qualified advice.
  Methodology: <a href="https://www.who.int/...">WHO BMI</a> · Last reviewed:
  2026-09-19.
</p>
```

## Bills & Paydays Cash-flow Forecast (`cards/bills-cashflow-forecast.html`)

This is a date-based arithmetic worksheet, not a bank feed or a financial
recommendation. It starts with the balance the visitor enters, applies each
listed income as a positive amount and each listed bill as a negative amount,
then reports the running end-of-day balance over the selected inclusive date
range. Weekly and fortnightly events advance by fixed calendar-day intervals;
monthly, quarterly and yearly events keep the original calendar day and clamp
to the last day of a shorter month (for example, a January 31 recurrence lands
on February 28 or 29, then returns to the 31st when possible). All entries use
one selected currency; no exchange rates, interest, fees, tax, pending
transactions or unentered spending are inferred.

The forecast is only as complete as its inputs. It cannot guarantee that a
payment will clear or that an account will have the projected balance; verify
important dates and amounts with the provider or bank. This is informational,
not financial advice. The plan stays in volatile page memory until the visitor
explicitly exports it; exported files contain private financial details and
should be stored accordingly. **Last reviewed: 2026-09-28.**

## Job Offer Comparator (`cards/job-offer-comparator.html`)

This worksheet compares only the annual amounts a visitor supplies, in one
selected currency. Estimated package is base pay + expected cash bonus + the
visitor-entered annual employer-pension value + visitor-estimated value of
other benefits. Gross cash after commute is base pay + expected bonus −
(commute cost per onsite day × onsite days per year). The separate commute-time figure
is minutes each way × two × onsite days, converted to hours. Blank optional
amounts count as zero in totals and are shown as not entered where possible.

It does not estimate take-home pay, income tax, employee pension, bonus
probability, benefit value, inflation, or the value of leave/flexibility. Figures
are gross approximations and are not a recommendation or financial advice.
Verify the written offer and ask a qualified adviser about tax or pension
questions. Values remain in page memory unless copied; **Last reviewed:
2026-09-29.**

## Home Project Quote Comparator (`cards/home-project-quote-comparator.html`)

The comparison total is exactly the all-in quoted total the visitor enters plus
separately listed known costs not included in that quote. The tool does not
calculate tax, estimate unknown extras, normalize different scopes, verify a
contractor, assess workmanship, or judge contract / guarantee terms. Ask for
comparable written scopes, clarify provisional allowances and confirm terms
directly. It is an arithmetic worksheet, not a purchasing or financial
recommendation. Entries stay in page memory until copied; **Last reviewed:
2026-09-29.**

## Rental Move-in Condition Report (`cards/rental-move-in-condition-report.html`)

This is a user-authored record of the property address, inspection dates, meter
readings, access items and observations. It does not upload photographs,
authenticate signatures, interpret a tenancy agreement, assess legal compliance
or decide who is responsible for damage. Keep original dated evidence and share
the report through an agreed channel. Entries stay in page memory; the visitor
must explicitly copy or download a text report. Tenancy requirements vary and
this is not legal advice. **Last reviewed: 2026-09-29.**

## Care Handover Sheet (`cards/care-handover-sheet.html`)

This is a communication template for practical arrangements and details the
visitor chooses to transcribe from an existing plan. It does not verify
allergies, prescribe care, calculate or recommend medicine doses, grant
permission, or replace instructions from the responsible person or care team.
Check all information before acting. No details are saved automatically; a
copied/downloaded sheet may contain sensitive personal or health information
and should be protected. In an emergency, contact local emergency services.
**Last reviewed: 2026-09-29.**

## Email Header Inspector (`cards/email-header-inspector.html`)

The inspector parses pasted header fields locally: visible From / Reply-To /
Return-Path addresses and domains, reported SPF/DKIM/DMARC tokens, and the count
of `Received` fields. It makes no DNS, mail-provider, link or attachment checks.
Authentication results in pasted text are claims, not independent verification;
headers may be incomplete or altered, and a passing result is not a safety
verdict. Headers can contain personal addresses, server names and IP addresses.
The tool sends nothing and saves nothing automatically. **Last reviewed:
2026-09-29.**

## MT4 / MT5 Genetic Copy-Trade Lab (`cards/mt4-mt5-genetic-copy-trade-lab.html`)

This is an offline genetic-search worksheet, not a predictor or copier. It reads
a visitor-provided chronological CSV of signed net trade points (or derives
signed points from side, entry, close and an explicitly supplied point size).
Optional signal score (0–100), non-negative spread and copy-delay values, and
direction fields are candidate filters; each optional feature must be complete
and varied within the training rows to be enabled. Use values recorded at the
copy decision, not information learned after the trade. Include parseable
timestamps for the chronological sort; otherwise original CSV order is treated
as chronology. Run one symbol / point scale at a time, or normalize all points
consistently. The first 70% of rows is the training set; thresholds are evolved
through seeded population selection, crossover and mutation. Feature activation
and candidate ranges are also derived only from training rows. The final 30% is
held out and reported without being used for selection. If an enabled feature is
missing or invalid in the holdout, the run stops rather than treating those
rows as passing or fitting from them. A candidate must keep at least 15% of
training trades (minimum four).
Fitness is net training points − 0.65 × maximum cumulative drawdown − 2 × the
longest losing streak. The lab reports net points, win rate, average winning
and losing points, profit factor, drawdown and losing streak for the all-trades
baseline and the evolved filter.

If every trade includes maximum favourable excursion (MFE) and maximum
adverse excursion (MAE), the search can explore hypothetical take-profit and
stop-loss thresholds. If both thresholds were reached on one trade, it assumes
the stop was hit first because MFE / MAE cannot establish intrabar order. This
is a conservative simplification, not a tick-accurate replay. The PnL points
must already include costs the user intends to model; spread and copy delay are
filters, not a full slippage, commission, swap or execution simulator. Results
are historical and can be overfit; a positive holdout does not guarantee future
performance. No account balance, leverage, lot sizing or risk of ruin is
calculated.

CSV files are read in the browser and are not uploaded or saved automatically.
The generated MQL4 / MQL5 snippets are signal gates only: they contain no broker
connection, credentials, order-sending function or exit management, and must be
adapted to an existing EA's own inputs in the MetaTrader Strategy Tester or a
demo account first. This is not trading or financial advice. **Last reviewed:
2026-09-29.**

## Site-level trust signals (pointer #6)

These are not per-page wordcount: they tell Google "someone accountable runs
this catalogue".

* **About / Mission** — `about.html` states who runs the site, why it exists,
  that tools run client-side with no data collection, and how to report an
  error. No AI-generated vanity bio.
* **Contact** — `contact.html` is a plain mailto + response promise. No form
  that pretends to save.
* **Privacy** — `privacy.html` confirms: no cookies beyond the capped
  `__mp_*` localStorage buffers (§ INSTRUMENTATION), no third-party trackers
  by default, GA is the only script when present and is optional.
* **Terms** — `terms.html` states as-is, no warranty, user assumes risk.
* **People** — every YMYL deep page links to the same About; we do not
  invent per-tool author personas. If we add real reviewed-by bylines later,
  each must be a verifiable human.
* **Freshness** — homepage and tools pages carry `<meta name="last-reviewed"
  content="2026-09-19">`; updated on content edits. Build stamp `APP_VERSION`
  in `home-core.js` (and the `?v=` on every asset it loads) is deploy metadata,
  not content freshness.

## What to do next (pointer #1 → #5 loop)

1. `python3 scripts/check-thin-content.py` — the `YMYL without E-E-A-T signal`
   list (71 of 119 today) is the deep-page backlog. Prioritise by
   `zero_top_20` demand (see INSTRUMENTATION.md), not alphabetically.
2. For each candidate, add an entry to `scripts/tool-pages.json` and run
   `python3 scripts/build-tool-pages.py` — do not hand-edit `tools/*.html`.
3. Add the per-tool machine spec automatically via `node
   scripts/build-tool-specs.js` — the spec's `sources` and `formula` fields
   are cross-checked with the deep page's methodology.

## What we do not do

* Auto-expand short fragments into 500-word SEO filler by LLM. The short
  cards stay short; depth goes only to the deep pages where we can vouch for
  the prose.
* Fake citations. A tool that has no single formula is labelled
  `Interactive — open the URL …` in its machine spec.
* Delete thin tools to "improve average wordcount". CONSTRAINTS.md forbids
  URL deletion without owner sign-off; thin cards are not harmful, they are
  just not deep.
