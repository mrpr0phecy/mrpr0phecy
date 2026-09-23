# Licence outreach kit — the first £299 is an email away

Written 2026-09-15. The funnel is built (`embed.html#pricing`, signed keys,
`embed-finance.html`); this file is the part that still needs a human: ten
emails, sent. STRATEGY.md is blunt about it — *the first licensee will come
from an email, not from a page.*

Everything below uses only verifiable facts. Do not invent traffic numbers —
the honest pitch is the product, not the audience.

---

## The 15-minute loop (repeat daily until it's boring)

1. Pick a target (list below). Find a real human and their domain.
2. Personalise ONE line — the thing on *their* site a calculator would fix.
3. Send the email (templates below). Log the date in the table at the bottom.
4. Follow up once after 5 working days. Then stop — a silence is an answer.
5. On a YES: take payment, open `licence-admin.html`, sign their key (30 s),
   send the handover email (button in the console does it).

## Who to write to (highest intent first)

| # | Vertical | Why they buy | Search for |
|---|---|---|---|
| 1 | Mortgage brokers | Clients ask "what can I borrow" all day; FCA-friendly estimate tool with no advice claim | "mortgage broker [town]" |
| 2 | Small accountancy practices | Salary/tax/VAT estimators as a client resource, branded as theirs | "accountant for freelancers [town]" |
| 3 | Estate & letting agents | Rental yield + affordability on listing pages | "letting agent [town]" |
| 4 | Independent financial advisers | A clean, disclaimed calculator beats a PDF factsheet | "ifa [town] pension" |
| 5 | Debt advice charities | Debt payoff + budget tools, free tier may be enough (keep the credit!) | "debt charity uk" |
| 6 | Freelancer accountant startups | IR35 comparator + rate calculator is literally their content marketing | "ir35 calculator" |
| 7 | Business energy brokers | Energy tariff comparator, their logo | "business energy comparison" |
| 8 | Trade training providers | Take-home-pay estimators for course pages ("earnings as a spark") | "electrician course cost" |
| 9 | Conveyancing solicitors | Overpayment + amortization tools for movers' guides | "conveyancing quote [town]" |
| 10 | Money bloggers with newsletters | White-label shelf of 80 finance tools saves them writing any | "uk money blog" |

## Template A — broker / adviser (short, specific)

> Subject: a mortgage calculator for [TheirSite] — £99/yr, no catch
>
> Hi [Name],
>
> You probably get "roughly what would my payments be?" emails every week.
> I run [The Most Useful Site in the World](https://www.themostusefulsiteintheworld.com/embed-finance.html)
> — a shelf of free browser calculators, including a [mortgage calculator with
> overpayment and amortization views](https://www.themostusefulsiteintheworld.com/embed-finance.html)
> that's checked against the current HMRC/tax-year rules by automated tests on
> every deploy.
>
> You can embed any of them on [TheirSite] free, forever — the only condition
> is a small "via The Most Useful Site in the World" credit link under the
> tool. If you'd rather have it under your own branding with no credit
> ([single tool £99/yr · whole finance category £299/yr](https://www.themostusefulsiteintheworld.com/embed.html#pricing)),
> that's a licence key I email you — it switches the credit off on your domain
> only. Nothing your visitors type is sent to me; the tool runs in their browser.
>
> Want me to send the free snippet so you can try it on a staging page today?
>
> [Your name]

## Template B — accountancy practice / freelancer startup

> Subject: branded salary & IR35 calculators for [TheirSite] (free option too)
>
> Hi [Name],
>
> Clients ask for take-home-pay, VAT and IR35 numbers before they'll even book
> a call. I maintain a shelf of 80 finance calculators
> ([embed them here](https://www.themostusefulsiteintheworld.com/embed-finance.html))
> — every statutory figure is updated each tax year and enforced by automated
> checks, so the numbers on your site stay correct in April without you
> touching anything.
>
> Embedding is free with a small credit link; £299/yr licenses the whole
> category under your branding with the credit removed. It's a one-iframe
> paste — no plugin, no account, nothing visitor-side sent to me.
>
> Worth a try on your resources page? I'll send the snippet either way.
>
> [Your name]

## Template C — follow-up (5 working days later)

> Subject: re: a mortgage calculator for [TheirSite]
>
> Hi [Name] — one nudge and then I'll leave it. If the timing's wrong, a
> "not now" is genuinely useful. If it's the wrong tool, tell me which one
> your visitors keep asking for and I'll tell you honestly whether I have it.
>
> [Your name]

## On a YES — the fulfilment checklist

1. Payment (processor choice is still an owner decision — see STRATEGY.md
   "what remains", item 2).
2. `licence-admin.html` → step 1 once ever: **generate keypair, export a
   backup**. Step 2 once ever: paste the public JWK into `embed.html`'s
   `mus-licence-pubkey` meta and deploy.
3. Step 3: domain + tier → **Sign licence** → "Open pre-filled handover email".
4. Buyer pastes the key at `embed.html#activate` and re-copies their snippet.
5. Log it in the table below. Diarise renewal = re-sign next year.

## Log

| Date | Target | Vertical | Template | Reply | Outcome |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## Honesty rules for this outreach

- Never claim traffic numbers you haven't measured; the pitch is the *product*.
- The free tier is a real offer, not a trick — lead with it (it's also the
  backlink that makes licence buyers find you).
- "Not financial advice" stays in every email that mentions the finance tools.
- No fake urgency, no "we noticed you visited" nonsense, one follow-up max.
