# FINANCE.md — money correctness, obligations and risk

Companion to `INCOME.md`. That document is about money coming *in*. This one is
about the three things that can quietly destroy the value of it:

1. **Financial tools that give wrong answers** — the site publishes 35 money
   calculators. A wrong tax figure is a credibility problem that no amount of
   good design repairs.
2. **Tax and record-keeping obligations** on the income `INCOME.md` describes.
3. **Regulatory exposure**, which right now is concentrated in one file.

Written 2026-09-02. Statutory figures are **2026/27** (England, Wales and
Northern Ireland) unless stated.

---

## 1. The correctness problem

### Why this is a finance issue, not a code issue

Every tool on this site is a promise. Most of them are low-stakes: if the BPM
counter is out by one, nobody's life changes. The money tools are different —
people act on the number. Someone budgeting a house move against a take-home
figure that is £2,500 too pessimistic makes a worse decision than if the tool
had never existed.

That asymmetry is why the money tools get a test suite and the others do not.

### What was found and fixed (2026-09-02)

Eight defects across two passes, all producing confidently-wrong numbers with
no indication anything was amiss.

**Pass 1 — the tax engines:**

| # | File | Defect | Impact |
|---|---|---|---|
| 1 | `tax.html` | Band widths computed as `max - min + 1` with `min` set one pound *into* the band, so the entire personal allowance was taxed | **£20,000 salary reported £4,000 income tax; the correct figure is £1,486 — overstated by 169%** |
| 2 | `salary.html` | National Insurance charged as a flat % of *entire* gross, defaulting to 12% (a rate abolished in 2024) | £20,000 salary showed £2,400 NI against a true £594 |
| 3 | `salary.html` | Student loan charged as a flat 9% of *entire* gross, ignoring the threshold entirely | £20,000 salary showed £1,800 against a true £0 on every plan |
| 4 | `salarycompare.html` | Basic-rate band derived as `50270 − allowance`, so the band *widened* as the allowance tapered; loan thresholds three years stale | Understated tax above £100,000 |

Defect 1 is the serious one. It was the site's headline tax tool, it was
labelled "2024-25", and it was wrong for every single user at every income.

**Pass 2 — the growth and debt engines:**

| # | File | Defect | Impact |
|---|---|---|---|
| 5 | `compoundinterest.html` | **Six of seven compounding frequencies were broken.** Only monthly worked; every other option ran the contribution loop then discarded it, overwriting with `yearStart*(1+r)^freq + annualContribution` | £10,000 at 7% annual with £500/month reported **£700** of interest — precisely the interest on the opening balance, as though £6,000 of contributions had never been paid in |
| 6 | `compoundinterest.html` | "Continuous" compounding silently mapped to monthly; the dedicated branch was unreachable dead code | Continuous gave monthly's answer |
| 7 | `mortgage.html` | Total cost of ownership added **one** year of property tax and insurance to a 25-year mortgage | Understated total cost by ~£48,000 at default inputs |
| 8 | `mortgage.html` | Amortisation billed the full nominal instalment in the final month rather than the amount actually taken | Total paid did not reconcile to principal + interest |

Also in pass 2, two honesty problems rather than arithmetic ones:

- **`debtpayoff.html` had placebo controls.** "Snowball" and "Avalanche"
  buttons changed a caption and produced byte-identical results. Both are
  multi-debt *ordering* strategies and cannot apply to a single-balance
  calculator at all. A control that implies a capability the tool lacks is
  worse than no control. Replaced with an explanation of when each wins —
  including the part most sources omit, that the gap is usually tens of pounds
  and the payment size matters far more than the ordering.
- **`fire-financial-independence-calc.html` was hard-coded to US dollars** with
  no selector, on a UK site. Now has a currency toggle defaulting to GBP,
  explicitly display-only with no conversion implied.

### Scotland — the largest coverage gap, now closed

The tools previously handled only England, Wales and Northern Ireland. Scottish
taxpayers are roughly 8% of the UK, and the divergence is not cosmetic:

- Six bands (19%–48%) against three.
- The **42% higher rate starts at £43,663**, not £50,270. That £6,600 slice is
  taxed at 20% in rUK and 42% in Scotland — a **50% marginal rate** with NI.
- In the £100k taper zone the Scottish effective marginal rate reaches roughly
  **67.5%**, against 60% in rUK.
- Below about **£33,500** a Scottish taxpayer pays slightly *less*, thanks to
  the 19% starter rate. Above it, progressively more.

`tax.html` now models all six bands behind a region selector. Three independent
confirmations that the implementation is right:

1. £50,000 → **£8,982**, matching the published worked example to the pound.
2. The crossover point *falls out of* the implementation at **£33,550**,
   against the ~£33,500 cited in the literature — not a figure that was coded in.
3. A Scottish taxpayer on £75,000 pays **£2,050** more than an English one,
   matching the published comparison.

The personal allowance, its taper and National Insurance are reserved to
Westminster, so both regimes deliberately share that code.

### The subtlety that caused defect 4 — worth understanding

The familiar table says basic rate runs "£12,571 to £50,270". That framing is
what produces the bug. The statute defines a **basic rate limit of £37,700**,
which is a *width* applied on top of whatever personal allowance you have.
£50,270 is not a fixed constant — it is simply £12,570 + £37,700.

So when the personal allowance tapers away above £100,000, **the point at which
40% starts falls with it**. Hard-coding £50,270 quietly understates tax for
exactly the people with the most complicated affairs.

This also produces the **60% trap**: between £100,000 and £125,140 you lose £1
of allowance for every £2 earned, so an extra £100 of salary costs £60 in tax —
62% with National Insurance. That is a higher marginal rate than the 45%
additional rate sitting above it, and it is the single most useful thing a UK
tax calculator can tell someone. `tax.html` now models it and explains it.

### The guard against regression

`scripts/check-finance.js` — **89 assertions**, wired into `scripts/verify.sh`
as step 7/8, so it runs on every pre-push check.

Its design principle: **every expected value is computed from an independent
implementation written from the published statutory rules.** Copying the card's
own logic into the test would prove only that the code equals itself. It also
sweeps every salary from £0 to £200,000 in £97 steps (2,062 points) rather than
spot-checking, because the bugs above were all boundary errors that spot checks
miss.

```bash
node scripts/check-finance.js     # or: bash scripts/verify.sh
```

It also enforces three standing rules: no stale tax-year labels in user-facing
copy, an advice caveat on every tool that outputs a financial decision, and no
placebo controls (a guard added after the debtpayoff finding).

Where a closed-form answer exists, the test uses it rather than a
reimplementation — compound growth with no contributions must equal
P(1 + r/n)^(nt) exactly, for every frequency. Where one does not, it uses a
reference derived a *different way* from the implementation: the Scottish check
is written from gross thresholds because the card stores cumulative taxable
widths, so a shared misconception cannot hide in both.

It also asserts invariants that must hold regardless of inputs — total paid
reconciles to principal + interest, overpaying always shortens the term, a
positive return always beats money paid in. Invariants catch bugs that anchor
values miss, because they hold across the whole input space.

**A worked warning from building this suite:** the first version of the test
disagreed with the fixed code at £125,140 — and the *test* was right and the
fix was wrong, because the reference had inherited the same £50,270 assumption.
Both were corrected against the statutory definition. If a finance test and the
code disagree, do not assume the code is wrong; go to the source.

### Standing rules for money tools

1. **State the tax year and the jurisdiction.** Presenting rUK figures to a
   Scottish user unlabelled is simply wrong. `tax.html` now models both; any
   tool that does not must say which one it means.
2. **Never hard-code a threshold that is derived.** £50,270 is derived. £37,700
   and £12,570 are the real constants.
3. **Thresholds, not flat percentages.** NI, student loans and the taper are
   all banded. A flat percentage of gross is always wrong.
4. **Every money tool carries a caveat** explaining what it does *not* model.
5. **Add a test before fixing a bug**, so the sweep proves the fix.
6. **No placebo controls.** If a button cannot change the arithmetic, it must
   not appear as though it does. Explain the concept instead.
7. **Derive the test differently from the code.** A reference implementation
   that mirrors the implementation's structure will reproduce its mistakes.
   Prefer a closed form, an invariant, or a published worked example.

### Annual maintenance — every April

Rates change on **6 April**. The current freeze runs to **April 2028**, which
makes complacency easy and the eventual break sharper. Each April:

- Re-check: personal allowance, £37,700 basic rate limit, £125,140, NI
  thresholds and rates, all five student loan thresholds.
- Update the year labels; `check-finance.js` will fail on stale ones.
- Update the anchor values in the test suite from HMRC, not from the tool.

**Known already:** student loan thresholds rise every April even while tax
thresholds are frozen. They will need changing in April 2027 regardless.

---

## 2. Tax obligations on the income

Not advice — a map of what applies, so nothing is discovered late.

### The £1,000 trading allowance

Gross trading income of **£1,000 or less** in a tax year (6 April – 5 April)
generally needs no reporting. Four points people get wrong:

- It is **gross, not profit.** £1,200 received with £500 of costs is still over
  the line.
- It is **combined across all activities.** YouTube + donations + sponsorship +
  sync are added together, not £1,000 each.
- Above £1,000 you must **register for Self Assessment by 5 October following
  the end of that tax year**. Registering does not necessarily mean owing tax.
- The **£3,000 figure in the news is a reporting threshold, not an allowance**,
  and it is not in force. The taxable threshold remains £1,000.

You choose **either** the £1,000 allowance **or** actual expenses — never both.
Below roughly £1,000 of costs the allowance wins; above it, claim expenses.

### Are donations taxable?

There is no blanket exemption for "donations" or "tips". Where money is given
in connection with a trade — supporting a site you run and continue to publish
— HMRC will generally treat it as trading income. Treat PayPal donations as
taxable receipts and count them toward the £1,000. If donations ever become
substantial, take real advice rather than relying on a repo file.

### Sync licensing income

Royalty and licensing income has its own treatment and can be quite different
from trading income. A single £3,000 placement is exactly the kind of event
that pushes you over thresholds unexpectedly. Get advice **before** signing the
first meaningful licence, not at the following January.

### Visibility — assume HMRC already knows

Digital platforms have reported user income to HMRC automatically since January
2024, and HMRC cross-references it. PayPal, YouTube/AdSense and licensing
platforms all leave a trail. **Making Tax Digital for Income Tax** began April
2026 for qualifying income over £50,000, stepping down to £30,000 (April 2027)
and £20,000 (April 2028) — not a current concern, but the direction is clear.

### The minimum viable bookkeeping

Genuinely small, and it makes everything else easy:

1. **A separate account** (or at minimum a separate PayPal balance) for site
   and music money. Mixing personal and business money is what turns an
   afternoon's admin into a weekend's.
2. **A spreadsheet with five columns**: date, source, gross, fees, net. Every
   receipt. PayPal's fee is a deductible expense — but only if it is recorded.
3. **Keep records for at least five years** after the 31 January filing
   deadline.
4. **A note of the running total** against £1,000, checked quarterly. The
   deadline that catches people is 5 October, and it arrives six months after
   the money did.

### Key dates

| Date | What |
|---|---|
| 6 April | New tax year; rates change |
| **5 October** | **Register for Self Assessment** if you crossed £1,000 in the year that ended the previous 5 April |
| 31 January | File online and pay |

Late-filing penalties start at £100 **even when no tax is owed**, then £10/day.

---

## 3. Regulatory exposure — the token problem

**This is the most serious financial risk in the repository, and unlike the
calculator bugs it cannot be fixed by an agent unilaterally. It needs a
decision from the owner.**

### The situation

`token.html` promotes `$MRPROPHECY`, a Solana token. It is not a dormant file:

- Linked from **`index.html` three times**, including a sticky action button
- Linked from `music.html` and `tool.html`
- Listed in `sitemap.xml` and therefore submitted to search engines
- Contains a **"projected value of your bag at various market caps"
  calculator**
- Promises **"holder perks"**, buybacks and burns funded from site sponsorship
  revenue and streaming income
- Describes **governance rights** for holders

### Why this is a legal question and not a taste question

Since 8 October 2023, **section 21 of the Financial Services and Markets Act
2000** applies to "qualifying cryptoassets" — broadly, any transferable and
fungible cryptoasset. A fungible, transferable Solana token is squarely inside
that definition.

Section 21 prohibits communicating, in the course of business, an invitation or
inducement to engage in investment activity, unless the promotion is made or
approved through one of four lawful routes (an FCA-authorised firm, approval by
one, an FCA-registered cryptoasset business under a specific exemption, or
another Financial Promotion Order exemption).

**A promotion outside those routes is a criminal offence, punishable by up to
two years' imprisonment, an unlimited fine, or both.** It applies to
communications originating in the UK *or* merely capable of having an effect in
the UK. The FCA also maintains a public warning list of firms in breach.

A page projecting future token value, promising perks, and describing revenue
being used to buy back the token has the clear hallmarks of an inducement to
engage in investment activity. The forward-looking price calculator is the most
exposed element: it does the one thing this regime exists to prevent.

Further: HM Treasury's wider cryptoasset regime is due to come into force **25
October 2027**, bringing more firms and assets into scope. The direction of
travel is one way.

### Why it also undermines everything else in `INCOME.md`

Set the law aside for a moment; the commercial case points the same way.

- `sponsor.html`'s house rules explicitly refuse **"no crypto speculation"** as
  an advertiser. The site currently refuses to sell what it is itself
  promoting. A sponsor who notices will not raise it — they will just not reply.
- The tools site's entire positioning is *"no ads, no tracking, no accounts,
  nothing gated"*. "Hold the token to unlock Pro features" is a paywall, and it
  contradicts `donate.html`'s promise that all 562 tools are free to everyone
  forever.
- A homepage that links to a token three times reads, to a music supervisor
  weighing a £3,000 sync deal, as a reason to pick someone else.

The token is competing with the routes that actually earn.

### Options, honestly stated

I have deliberately **not changed `token.html` or its links** — it is a
substantive commercial decision and the wrong call in either direction is
costly.

| Option | What it involves | Risk left |
|---|---|---|
| **A. Remove** | Delete the page, its five inbound links, and the sitemap entry | Lowest. Cleanest fit with the rest of the site. |
| **B. Neutralise** | Remove the price projector, perks, buyback and governance claims; keep a factual, non-promotional page; `noindex` it; drop the homepage links | Materially reduced, but "is this still an inducement?" remains a judgement call |
| **C. Take advice** | Ask a UK financial-services solicitor before touching it | Costs money; the only route that actually resolves the question |
| **D. Leave it** | — | Criminal liability, FCA warning list, and ongoing damage to sponsorship and sync credibility |

**My recommendation: A or B now, and C before anything is ever promoted
again.** The asymmetry is stark — the token generates £0 today, while the
downside is unbounded. Even purely as a commercial call, removing it costs
nothing measurable and unblocks two revenue routes.

**In the meantime: do not build on it, do not link it from anywhere new, and do
not promote it.**

*This section is a flag raised by a careful reading of published FCA and FSMA
material. It is not legal advice, and I am not a lawyer. Its purpose is to make
sure the risk is a decision you have made, rather than one you have inherited.*

---

## 4. Corrections made to published claims

Accuracy in what the site claims about itself is a financial matter: every
number here is one a sponsor or buyer may check.

- **Tool count corrected from 483 to 562** across `donate.html` and
  `sponsor.html` (13 occurrences). The real count comes from
  `cards/cards.json`; 483 was roughly a year stale. Understating is less
  damaging than overstating, but a number that does not survive counting
  undermines the honesty the pages are built on.
- **Category example corrected** on `sponsor.html`: "all 33 Finance tools, or
  all 23 Music tools" → "all 35 Finance & Money tools, or all 23 Music & Audio
  tools", matching the actual catalogue.
- **Tax year labels** updated from 2024/25 to 2026/27 in `tax.html`,
  `salary.html` and `salarycompare.html`.

**Standing rule:** any public claim about scale — tool counts, subscribers,
traffic, catalogue size — must be traceable to a source that can be re-run.
`INCOME.md`'s audience figures are from 2026-08-30 and are now marked as
needing a re-check before being quoted to an advertiser.

---

## 5. Open items

Not done, deliberately, with reasons.

| Item | Why not done |
|---|---|
| **`token.html` decision** | Owner's call — see § 3. The one genuinely urgent item. |
| **Check YouTube watch hours** | Only visible to the account owner, and there is a 1 Feb 2027 deadline. See `INCOME.md`. |
| Audit the remaining finance tools | Now swept: the tax engines, `mortgage.html`, `compoundinterest.html`, `debtpayoff.html`, `retirement.html` (found correct — annuity-due, consistently applied) and the FIRE planner. Still unswept: `investment.html`, `loan.html`, `creditcard.html`, `inflation.html`, `roi.html`, `networth.html` and the ~20 smaller ones. |
| `networth.html` and `roi.html` currency | Both hard-code `$` like the FIRE planner did. Lower stakes (no statutory content) but the same UK-site mismatch. |
| Ko-fi / Stripe migration | Not worth the effort at current donation volume. Revisit at ~50 donations/month — see the platform fee table in INCOME.md. |
| A dedicated licensing page | Highest-value new build per `INCOME.md` Route 4. |

---

## Quick reference — 2026/27 (England, Wales & NI)

| | |
|---|---|
| Personal allowance | £12,570 (frozen to April 2028) |
| Basic rate limit (band **width**) | £37,700 @ 20% |
| Higher rate | 40% to £125,140 |
| Additional rate | 45% above £125,140 |
| PA taper | £1 per £2 above £100,000 → 60% effective (62% with NI) |
| Class 1 employee NI | 0% to £12,570 · 8% to £50,270 · 2% above |
| Class 4 self-employed NI | 6% £12,570–£50,270 · 2% above |
| Trading allowance | £1,000 gross |
| Student loans | Plan 1 £26,900 · Plan 2 £29,385 · Plan 4 £33,795 · Plan 5 £25,000 (9%) · Postgraduate £21,000 (6%) |
| ISA allowance | £20,000 |
| CGT annual exempt amount | £3,000 |
| Dividend allowance | £500 |

**Scottish income tax 2026/27** (non-savings, non-dividend income). Rates are
unchanged from 2025/26, but the starter and basic thresholds widened 7.4%:

| Band | Rate | Gross income |
|---|---|---|
| Starter | 19% | £12,571 – £16,537 |
| Basic | 20% | £16,538 – £29,526 |
| Intermediate | 21% | £29,527 – £43,662 |
| Higher | **42%** | £43,663 – £75,000 |
| Advanced | 45% | £75,001 – £125,140 |
| Top | 48% | above £125,140 |

Modelled in `tax.html` via the region selector. **Not yet** in `salary.html` or
`salarycompare.html`, which remain rUK-only and say so.

Three traps worth remembering:
- The personal allowance, its £100k taper and **National Insurance are reserved
  to Westminster** — identical in both regimes. Do not "Scottish-ify" them.
- For the Personal Savings Allowance and most statutory "higher rate taxpayer"
  tests, the **UK £50,270 threshold still applies**, not the Scottish £43,663.
  Only Gift Aid and Marriage Allowance use the Scottish threshold.
- Scottish thresholds are reset at each Scottish Budget, so they need checking
  every year — unlike the rUK thresholds, frozen to April 2028.

**Wales** sets its rates equal to England's, so a `C` tax code changes nothing.
