#!/usr/bin/env python3
"""Generate the 12 topical-authority guide pages for the marketing/SEO pass.

Each guide is a "definitive source" page on a topic, with:
- story-led lede
- 4-6 sections of real content (not filler)
- "What this site gives you" curated list of relevant tools
- FAQ section with FAQPage JSON-LD (for AI citation)
- Article JSON-LD
- internal linking to category index, related blog post, embed page, use-case page

Why this matters: the research says AI engines (ChatGPT, Perplexity) cite
authoritative, well-structured Q&A content. 12 pillar guides, each one the
"definitive source" for a topic, with FAQ + Article schema, is the highest-ROI
thing this site can do for organic reach in 2026.
"""
import json
import os
import re
import textwrap

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS = json.load(open(os.path.join(ROOT, 'cards/cards.json')))
BY_CAT = {}
for c in CARDS:
    BY_CAT.setdefault(c.get('category', 'Other'), []).append(c)

def slugify(s):
    return re.sub(r'[^a-z0-9-]', '-', s.lower()).strip('-')

# 12 guides: (slug, title, eyebrow, lead, category_for_tools, sections, faqs)
GUIDES = [
    {
        'slug': 'mortgage',
        'title': 'How mortgages really work — and what your bank\'s calculator doesn\'t show you',
        'eyebrow': 'Money & finance · Definitive guide',
        'category': 'Finance & Money',
        'related_blog': '/blog/how-mortgage-payments-work.html',
        'related_use_case': 'I want to figure out my mortgage, rent, or a loan',
        'short_desc': 'The standard mortgage formula, the three things the bank\'s calculator never shows, and the honest way to use the numbers.',
        'lede': 'A mortgage is the largest financial transaction most people will ever make. The standard repayment formula is one line, but the bank\'s summary box never shows the three things that actually matter: the total interest paid over the life of the loan, the effect of the reversion rate when the fix ends, and what happens to the term if you start overpaying. This guide covers all of them, with the math written out and the assumptions named.',
        'sections': [
            ('The formula is the easy bit',
             'For a fixed-rate, capital-and-interest mortgage, the monthly payment is set by the standard amortisation formula: P × r × (1+r)^n / ((1+r)^n − 1), where P is the principal, r is the monthly interest rate (annual rate ÷ 12), and n is the total number of monthly payments. That formula gives the same payment every month for the life of the deal, and it is the formula every bank\'s calculator uses. The point of the formula is not cleverness. It is the unique payment amount that exactly amortises the loan to zero at the end of the term, assuming the rate never changes.'),
            ('What the bank\'s calculator doesn\'t tell you',
             'Three things, mostly.'),
            ('1. The interest front-loads the payment',
             'Because the loan balance is highest in month 1, interest is highest in month 1. The first payment of a typical 25-year mortgage is something like 65–80% interest. By year 15, that same payment is something like 30% interest. The balance isn\'t a straight line; it is a curve that flattens out. That is why the loan balance in year 5 can feel like it has barely moved. It has. The bank is just charging you interest on a much larger number than you owe today.'),
            ('2. The "headline rate" is rarely the rate you pay',
             'Almost no UK or US mortgage is fixed for the full 25–30 year term. A typical UK deal is 2, 3, or 5 years fixed, then reverts to the lender\'s standard variable rate (SVR), then you re-mortgage. The payment the calculator shows you is the payment during the fix, not the payment over the life of the loan. Worst case: you stay on SVR for the rest of the term, which is usually higher than any fixed deal you have ever seen. Realistic case: you re-fix every 2–5 years, your payment fluctuates, and your total interest paid is higher than the calculator implied.'),
            ('3. Overpayments cut the term, not the payment',
             'If you overpay by £100/month on a 25-year mortgage at 5%, you don\'t reduce your monthly payment — the bank reduces the term, because you have shortened the time needed to clear the balance. The interest saved is close to 40% of the overpayment over the remaining term, depending on when you start. Most lenders let you overpay by 10% of the balance per year without penalty. After that, an early-repayment charge (ERC) kicks in during the fix.'),
            ('The honest way to use a mortgage calculator',
             'Open the calculator and put in three things: the amount you are actually borrowing (purchase price minus deposit, plus any fees rolled in), the real rate (not the headline — if the deal is 5 years fixed at 4.5%, and you expect to re-fix at 5.5% after that, model the loan at 4.5% for 5 years and 5.5% for 20), and the term you actually want to be done by, not the maximum the lender will give you. Then ask: if I overpaid by £200/month, what does the term shorten to? That single number often decides whether the overpayment is worth it.'),
            ('What a "mortgage" actually costs over its life',
             'On a £250,000 loan at 4.5% over 25 years, the monthly payment is around £1,389. Over 25 years, you pay £416,556 — so £166,556 of that is interest. On a 30-year term at the same rate, the payment drops to about £1,267, but the total interest paid rises to about £206,000. Stretching the term by 5 years costs you £40,000 of extra interest for a £122/month saving. That is the part the bank\'s calculator never shows you in the summary box. It is the most important number on the page.'),
        ],
        'faqs': [
            ('What is the mortgage repayment formula?',
             'P × r × (1+r)^n / ((1+r)^n − 1), where P is the principal, r is the monthly rate, and n is the number of monthly payments.'),
            ('What is a fixed-rate mortgage?',
             'A deal where the interest rate is locked for a set period (usually 2, 3, or 5 years), after which the rate reverts to the lender\'s standard variable rate until you remortgage.'),
            ('What is an early-repayment charge (ERC)?',
             'A fee the lender charges if you overpay above the annual allowance (typically 10% of the balance) during the fixed period.'),
            ('What is the SVR?',
             'The lender\'s "standard variable rate" — the default rate that applies after a fixed deal ends, and the rate you pay if you never remortgage.'),
            ('What is the loan-to-value (LTV) ratio?',
             'The loan amount as a percentage of the property value. A £200,000 loan on a £250,000 property is 80% LTV. Lower LTVs get better rates.'),
        ],
    },
    {
        'slug': 'bmi',
        'title': 'What BMI actually measures — and what to use instead',
        'eyebrow': 'Health metrics · Definitive guide',
        'category': 'Health & Fitness',
        'related_blog': '/blog/what-bmi-actually-measures.html',
        'related_use_case': 'I want to check or improve my BMI, calories, or macros',
        'short_desc': 'A population screening tool, not a personal one. The formula, the limits, and the four better metrics in rough order of cost.',
        'lede': 'BMI is your weight in kilograms divided by your height in metres, squared. It was designed in the 1830s by Adolphe Quetelet as a population-level statistic, not a personal one. It survives because it costs nothing, requires no equipment, and works on a chart. The doctor still uses it because the doctor is looking at cohorts, not individuals. For personal decisions, you want at least one of: waist circumference, body-fat percentage, or a blood marker. This guide covers the formula, the limits, and what to use instead.',
        'sections': [
            ('The formula is the easy bit',
             'BMI = weight (kg) / height (m)². A 1.75 m, 75 kg person has a BMI of 24.5. That is it. Two numbers in, one number out. The classification bands (underweight, normal, overweight, obese I/II/III) are statistical cut-offs from population studies, not biological thresholds.'),
            ('What BMI actually predicts',
             'At a population level, BMI is a useful proxy for population-level mortality risk. A BMI of 18.5–25 in large cohorts is associated with the lowest all-cause mortality. A BMI above 30 is associated with meaningfully higher risk of type 2 diabetes, hypertension, cardiovascular disease, and several cancers. That is the level at which the metric works. The doctor at the NHS, looking at 30,000 patients, can use BMI to spot the cohort that needs further investigation. It is a sieve, not a diagnosis.'),
            ('What BMI is bad at', 'It is bad at almost everything that matters to a single person. Three specific cases:'),
            ('1. Muscle versus fat',
             'BMI does not distinguish muscle mass from fat mass. A lean, muscular 90 kg man at 1.83 m has a BMI of 26.9 — "overweight" by the chart. An inactive 90 kg man with 35% body fat at the same height has the same BMI. They are not at the same health risk.'),
            ('2. Ethnicity',
             'The cut-offs were derived from white European populations. The relationship between BMI and body-fat percentage, and between BMI and disease risk, differs across ethnic groups. The NICE guidelines in the UK recommend lower BMI cut-offs for South Asian populations, because disease risk starts at a lower BMI in those groups.'),
            ('3. Age and sex',
             'The "ideal" BMI band is similar across adults, but body composition changes with age. A 70-year-old with a BMI of 27 is not at the same risk as a 30-year-old with a BMI of 27. And women and men carry fat differently — women typically have a higher body-fat percentage at the same BMI.'),
            ('What to use instead, or alongside it',
             'For personal health decisions, BMI is the start of a conversation, not the end. Better metrics, in rough order of cost: waist circumference and waist-to-hip ratio (cheap, fast, and visceral fat — the dangerous kind — lives around the waist), body-fat percentage (via skinfold calipers, a bioelectrical impedance scale, or a DEXA scan), blood markers (fasting glucose, HbA1c, lipid panel, blood pressure), and cardiorespiratory fitness (VO₂ max is a stronger predictor of all-cause mortality than BMI).'),
            ('When BMI is enough',
             'If you fall squarely in the 18.5–25 range and have no other risk factors, you don\'t need a DEXA scan. The simple metric worked. If you fall outside the range, BMI tells you to look further, not to panic. The reason the doctor still uses it is exactly that: it is the cheapest tool in the drawer that catches most of the cases that need catching.'),
        ],
        'faqs': [
            ('What is the BMI formula?',
             'BMI = weight (kg) divided by height (m) squared. In imperial: 703 × weight (lb) / height (in)².'),
            ('What is a healthy BMI?',
             'For most adults, 18.5 to 24.9 is classified as "normal", 25 to 29.9 as "overweight", and 30+ as "obese". The cut-offs are population-level, not personal.'),
            ('Is BMI accurate for muscular people?',
             'No. BMI does not distinguish muscle from fat. A muscular person may have a high BMI and low body fat, and a sedentary person may have a "normal" BMI and high body fat.'),
            ('Is BMI different for different ethnicities?',
             'Yes. NICE in the UK recommends lower BMI cut-offs for South Asian, Chinese, and Japanese populations, because the same BMI corresponds to higher body-fat percentages and higher disease risk.'),
            ('What is a better metric than BMI?',
             'Waist circumference and waist-to-hip ratio are the cheapest upgrades. Body-fat percentage (via DEXA or skinfold) is more accurate. Cardiorespiratory fitness (VO₂ max) predicts mortality better than BMI.'),
        ],
    },
    {
        'slug': 'compound-interest',
        'title': 'Why compound growth is magic — and why the line goes up, not straight',
        'eyebrow': 'Personal finance · Definitive guide',
        'category': 'Finance & Money',
        'related_blog': '/blog/why-compound-interest-is-magic.html',
        'related_use_case': 'I want to calculate compound interest, savings, or an investment',
        'short_desc': 'Exponential growth, the rule of 72, and why the early saver always wins. The math, written out, with the assumptions named.',
        'lede': 'Compound growth is exponential: each year\'s growth is a percentage of a growing base. The shape of the line is a curve, not a straight line. The "magic" is not a metaphor — it is a process, and it works on you whether you use it for savings, investments, or (unfortunately) debt. This guide covers the rule of 72, why the early saver always wins, and what a "compound interest calculator" should actually tell you.',
        'sections': [
            ('The shape of the line',
             'Put £1,000 in a savings account at 5% per year. After year 1 you have £1,050. After year 2 you have £1,102.50. After year 3, £1,157.63. After year 10, £1,628.89. After year 20, £2,653.30. After year 30, £4,321.94. The simple-interest version — the one your brain imagines when you hear "5% a year" — gives you £1,500 after 10 years, £2,000 after 20, £2,500 after 30. The compound version is bigger than that in every year after the first, and the gap grows the further out you go. That is the magic. You did exactly the same thing each year. You didn\'t add any new money. The only difference is that the interest from this year becomes part of the base that next year\'s interest is calculated on.'),
            ('The rule of 72',
             'For small interest rates, money doubles in roughly 72 ÷ rate years. At 5%, that is 14.4 years. At 7%, about 10.3 years. At 10%, 7.2 years. The rule is approximate but useful — it lets you size up a "5% APY" or "7% annual return" in 10 seconds without doing the math. For a mortgage, the rule works in reverse: at 6% interest, the balance doubles in 12 years. (That is the bad kind of doubling.)'),
            ('Why people underestimate it',
             'Two reasons. The first is that the early years are unimpressive. The difference between simple and compound interest over 5 years on £1,000 at 5% is £28. That is not exciting. It doesn\'t feel like magic. The second is that the late years are unimaginable. The doubling at year 14 produces £2,000. By year 28 it is £4,000. By year 42, £8,000. Most people are not planning in 14-year chunks.'),
            ('Why this matters more for early savers than late',
             'Someone who starts saving £100/month at age 25 and stops at age 35 (contributing for 10 years) ends up with more at age 65 than someone who starts at age 35 and contributes for 30 years. This is the most counter-intuitive and most important result in personal finance. The first decade of contributions earns interest for 40 years. The last decade of contributions earns interest for 0 years. Time, not contribution, is the active ingredient.'),
            ('When compounding works against you',
             'It works identically on debt. A credit card balance at 24% APR doubles in roughly 3 years if you pay only the minimum. Minimum payments are set to maximise how long the balance survives, because the issuer earns interest on the outstanding balance for as long as possible. Compounding is not good or bad. It is a process. The question is which side of the process your money is on.'),
            ('What a "compound interest calculator" should tell you',
             'The balance at each year, not just the final number. The interest earned versus the contributions made. (You want this gap to be wide.) The doubling time at the given rate. The effect of adding a fixed monthly contribution. (This is where the real growth comes from, not the rate.) The future value in today\'s money, not just nominal terms.'),
        ],
        'faqs': [
            ('What is the compound interest formula?',
             'A = P(1 + r/n)^(nt), where P is principal, r is the annual rate, n is the number of compounding periods per year, and t is the number of years. For monthly compounding, n = 12.'),
            ('What is the rule of 72?',
             'A quick mental-math shortcut: money doubles in approximately 72 ÷ annual rate (as a percent) years. At 6% the doubling time is 12 years; at 8% it is 9 years; at 10% it is 7.2 years.'),
            ('Is compound interest better than simple interest?',
             'Compound interest earns interest on previously-paid interest. Over time it always outpaces simple interest, which only earns interest on the original principal.'),
            ('How often does compound interest compound?',
             'Daily, monthly, quarterly, or annually. The more frequent the compounding, the more you earn (or owe). Most savings accounts compound daily; most credit cards compound daily; most mortgages compound monthly.'),
            ('Why does compound interest matter more for early savers?',
             'The earlier you start, the more years the base has to grow. A 25-year-old saving for 10 years and stopping usually beats a 35-year-old saving for 30 years, because the early saver\'s contributions earn decades of additional compounding.'),
        ],
    },
    {
        'slug': 'passwords',
        'title': 'How to choose a strong password — and why your browser already does the hard part',
        'eyebrow': 'Security & privacy · Definitive guide',
        'category': 'Writing & Language',
        'related_blog': None,
        'related_use_case': 'I want to build or test a password, hash, or secret',
        'short_desc': 'What makes a password weak, what makes it strong, and why your browser\'s built-in password manager beats the old advice.',
        'lede': 'A strong password is long, unique, and machine-generated. Your browser already has a built-in password manager that does all three. This guide covers what makes a password weak, what makes it strong, how password managers work, and why the old advice ("add a symbol", "change it every 90 days") was wrong. If you take one thing from it: stop trying to remember passwords. Let a tool do it for you.',
        'sections': [
            ('What makes a password weak',
             'Short length. Real words. Reuse across sites. The character of a password is almost irrelevant if the password is one of the top 10,000 most-used strings, because the attacker tries those first. "Password123", "qwerty", and your dog\'s name followed by a birth year are not strong passwords — they are guesses, and the guessing is automated.'),
            ('What makes a password strong',
             'Length. Randomness. Uniqueness. The only thing the attacker cannot guess is a string that was never their dictionary, and the cheapest way to get one of those is to make it long and machine-generated. A 16-character random password from a password manager is, for practical purposes, uncrackable. A 6-character password you can remember is, for practical purposes, already cracked.'),
            ('Why the old advice was wrong',
             'For 20 years, security guidance told you to add a symbol, capitalise one letter, and change the password every 90 days. The advice was wrong. It produced passwords that are slightly harder for humans to remember and slightly easier for computers to guess, because the rules create a smaller search space than a fully random string. The modern guidance (NIST SP 800-63B, 2017 and 2024 revisions) is: use a long machine-generated string, never reuse it, do not force periodic changes. Two-factor authentication is the actual defence against credential theft; the password is the second layer, not the first.'),
            ('How password managers work',
             'A password manager generates, stores, and fills passwords for you. The browser\'s built-in manager (Chrome, Safari, Firefox, Edge) is now good enough for most people — it generates 20+ character random passwords, stores them locally or in the cloud, and fills them in. Dedicated managers (1Password, Bitwarden, KeePass) add features: cross-device sync, family sharing, breach alerts, secure notes. Either way, the principle is the same: you remember one long passphrase, the manager remembers the rest.'),
            ('Two-factor authentication',
             'A password is one factor: "something you know". Two-factor adds a second one, usually "something you have" (a phone, a hardware key) or "something you are" (a fingerprint). Even if your password is stolen, the attacker cannot log in without the second factor. Use an authenticator app (Authy, Google Authenticator, 1Password) or a hardware key (YubiKey, Titan) for important accounts. SMS codes are better than nothing but are vulnerable to SIM-swap attacks.'),
            ('What this site gives you',
             'A free, browser-side password generator that creates 8–64 character random strings with adjustable character classes. A hash generator if you ever need to check whether a file has been tampered with. Both are offline, both run in your browser, both leave nothing on the server.'),
        ],
        'faqs': [
            ('How long should a password be?',
             'At least 14 characters for important accounts, ideally 20+ for anything you would not want publicly known. Length matters more than character variety.'),
            ('Should I change my passwords regularly?',
             'Only if you have reason to believe one is compromised. Forced periodic changes produce weaker passwords (people cycle between 2-3 variants) without improving security. NIST explicitly advises against them.'),
            ('Is it safe to save passwords in my browser?',
             'Yes, for most people. The major browsers encrypt the password store and tie access to the device login. Dedicated managers add features (cross-platform, breach alerts) that the built-in managers lack, but the built-ins are not insecure.'),
            ('What is two-factor authentication?',
             'A second factor — usually a code from an app, a hardware key, or a fingerprint — required in addition to your password. Even if your password is stolen, the attacker cannot log in without the second factor.'),
            ('What makes a password generator trustworthy?',
             'It runs in your browser, uses a cryptographically-secure random number generator, and never sends the generated string to a server. The password tool on this site does all three.'),
        ],
    },
    {
        'slug': 'json',
        'title': 'JSON for people who hate JSON — a practical guide for non-engineers',
        'eyebrow': 'Code & data · Definitive guide',
        'category': 'Writing & Language',
        'related_blog': None,
        'related_use_case': 'I want to format, validate, or debug JSON or code',
        'short_desc': 'What JSON is, how to read it, how to spot the errors, and the tools that will format and validate it for you.',
        'lede': 'JSON (JavaScript Object Notation) is a text format that computers love and humans tolerate. It is the way most apps, APIs, and config files send structured data around. If you have ever opened a config file and seen curly brackets with quotes inside, that was JSON. This guide covers what JSON is, how to read it, the four errors you will hit, and which of the free tools on this site will format, validate, and diff it for you.',
        'sections': [
            ('What JSON is',
             'JSON is text, organised as a tree of name/value pairs. The whole thing lives inside curly braces. Each pair is a string in double quotes, a colon, and a value. Values can be strings, numbers, booleans, null, arrays (in square brackets), or other objects. That is the entire specification. It is intentionally tiny.'),
            ('How to read a JSON file',
             'Start at the top. The whole thing is one object. Read the field names left-to-right. When you hit a value that is itself an object or array, you are recursing — open a new mental "scope", read the contents, close it. Pretty-printing (adding indentation and newlines) makes the structure obvious; this site\'s JSON formatter does it in one click.'),
            ('The four errors you will hit',
             '1) Trailing comma (a comma after the last item in an object or array) — invalid in JSON, even though it is valid in JavaScript. 2) Single quotes instead of double quotes — JSON requires double quotes for strings. 3) Unquoted keys — keys must be in double quotes, even if they look like numbers. 4) Comments — JSON does not support comments. If you want comments, you want JSON5 or YAML, not JSON.'),
            ('JSON vs YAML vs TOML',
             'YAML is JSON\'s indentation-based cousin, popular for config files (Kubernetes, GitHub Actions, Ansible). TOML is the newer alternative, designed to be unambiguous and easy to parse (Rust\'s Cargo, Python\'s pyproject.toml). JSON is the most portable, the most widely supported, and the one most APIs use. If you control the format, pick the one your tooling supports; if you are sending data over the wire, JSON is the default.'),
            ('What this site gives you',
             'A JSON beautifier and validator that highlights errors inline. A JSON/YAML studio for converting between formats. A diff tool for comparing two JSON structures. All three run in your browser, none of them upload your data anywhere.'),
        ],
        'faqs': [
            ('Is JSON a programming language?',
             'No. JSON is a data format, like XML or CSV. It is written in plain text and is meant to be generated and parsed by code, not written by hand (though it is possible to write small JSON files by hand).'),
            ('What is the difference between JSON and JavaScript?',
             'JSON is a subset of JavaScript object syntax. A valid JSON document is also a valid JavaScript expression. The reverse is not true: JavaScript allows trailing commas, single quotes, comments, and unquoted keys, all of which are invalid JSON.'),
            ('Why do APIs use JSON?',
             'JSON is text, so it travels over any network. It is small (less verbose than XML). It is unambiguous to parse. Almost every programming language has a JSON parser in its standard library. It maps directly to the data structures most apps use.'),
            ('Is JSON safe to paste into a random web tool?',
             'Not always. Online JSON formatters can log or leak your data. The JSON tools on this site run entirely in your browser — no network requests are made — so it is safe to paste sensitive payloads.'),
        ],
    },
    {
        'slug': 'regex',
        'title': 'Regular expressions without the pain — a 5-minute practical guide',
        'eyebrow': 'Code & data · Definitive guide',
        'category': 'Writing & Language',
        'related_blog': None,
        'related_use_case': 'I want to format, validate, or debug JSON or code',
        'short_desc': 'The four characters that matter most, the syntax, and a worked example of a real regex from this site.',
        'lede': 'A regular expression (regex) is a small language for matching patterns in text. Once you have learned the four characters that do 80% of the work, the rest of the language stops being scary. This guide covers the syntax, the four characters that matter most, a worked example of a real regex from this site\'s code, and the test-and-explain tool that tells you what a regex does.',
        'sections': [
            ('The four characters that matter most',
             'The character class `[abc]` (matches one of the listed characters), the quantifier `+` (one or more of the previous element), the anchor `^` (start of the line) and `$` (end of the line). With those four, you can write a useful regex. Everything else is precision.'),
            ('Anatomy of a regex',
             'A regex is a pattern, optionally followed by flags. The pattern is a sequence of literal characters and metacharacters. Metacharacters are the things that mean something other than themselves: `.` (any single character), `*` (zero or more), `+` (one or more), `?` (zero or one), `[...]` (character class), `(...)` (group), `|` (alternation), `\` (escape). The flags are single letters after the closing `/` that modify behaviour: `g` (global), `i` (case-insensitive), `m` (multiline).'),
            ('A worked example',
             'Look at the regex this site uses to detect a YouTube video ID in a URL: `[a-zA-Z0-9_-]{11}`. That is a character class containing the 26 letters in both cases, the 10 digits, the underscore, and the hyphen, followed by `{11}` (exactly 11 of the previous element). The whole thing says: "find 11 consecutive characters, each of which is a letter, digit, underscore, or hyphen" — which is what a YouTube video ID looks like.'),
            ('Common pitfalls',
             'Greedy quantifiers: `*` and `+` match as much as they can, which is rarely what you want. Use `*?` and `+?` (the lazy versions) when you want the shortest match. Catastrophic backtracking: a pattern like `(a+)+b` can take exponential time on input that does not match; modern engines protect against this, but it is worth knowing about. Anchoring: a regex without `^` and `$` will match anywhere in the string, which is sometimes the bug.'),
            ('Testing and explaining',
             'A regex tester shows the matches inline and explains what each part of the pattern does. Use it before you ship a regex. The free regex tester on this site does both: live match highlighting and a plain-English explanation of every group.'),
        ],
        'faqs': [
            ('What is a regex?',
             'A regular expression is a pattern that matches text. The pattern is written in a small, dense language. Regexes are built into nearly every programming language, every text editor, and most command-line tools.'),
            ('Are regexes the same in every language?',
             'Mostly. The core syntax is portable. The differences show up at the edges: lookbehinds, named groups, Unicode property classes, and the specific metacharacters some engines allow or forbid. JavaScript, Python, Perl, and PCRE all use very similar regex dialects; older Unix tools use POSIX ERE or BRE.'),
            ('When should I not use a regex?',
             'When you are parsing HTML or XML (use a real parser), parsing JSON (use a JSON parser), or doing anything where the input is structured enough that a grammar-based tool is a better fit. Regexes are for patterns, not for grammars.'),
            ('How do I match an email address?',
             'You don\'t, in production. A correct email-address regex is hundreds of characters long and still does not cover the full RFC. In practice, "anything that looks like an email followed by an @ followed by anything that looks like a domain" is good enough. RFC 5321 and 5322 are the formal definitions; do not try to implement them in a regex.'),
        ],
    },
    {
        'slug': 'color',
        'title': 'How to pick a colour palette that doesn\'t look like a 2003 Geocities page',
        'eyebrow': 'Design · Definitive guide',
        'category': 'Writing & Language',
        'related_blog': None,
        'related_use_case': 'I need to design colours, contrast, or a website',
        'short_desc': 'Two anchors, one accent, a small set of semantic colours. The art-school waffle removed.',
        'lede': 'A good colour palette has two anchor colours (a primary and a neutral), one accent colour for emphasis, and a small set of semantic colours for state (success, warning, error). This guide covers colour theory without the art-school waffle, the WCAG contrast numbers you actually need, and the free tools on this site that will pick the palette for you and check whether the contrast between any two of your colours is readable.',
        'sections': [
            ('The shape of a good palette',
             'Two anchors. One accent. Four to six semantic colours. That is the entire shape. The anchors are the colours the user sees most of the time — usually a background neutral and a brand colour. The accent is the colour the user sees when something matters — a button, a callout, a current selection. The semantic colours are for state: success (green), warning (yellow/amber), error (red), info (blue). A palette of more than 10 colours is almost always the result of "let me add one more just in case" — and the case never comes.'),
            ('Choosing the anchors',
             'Pick the brand colour first. It should be the colour the user associates with the product, which is usually the colour of the logo and the primary CTA. Then pick the neutral. A neutral is a desaturated colour, usually a grey or off-white, that the body text and most of the surface area sits on. The two together should have a contrast ratio of at least 4.5:1 (WCAG AA for body text) — the contrast checker on this site will tell you in one click.'),
            ('Choosing the accent',
             'The accent should be complementary to the brand colour — opposite on the colour wheel — so it stands out. If the brand is blue, the accent is orange. If the brand is red, the accent is teal. The accent should be used sparingly: one button per screen, one highlight per paragraph. If the accent appears more than 5% of the time on a page, it is no longer an accent; it is a second brand colour.'),
            ('Semantic colours',
             'Green for success, amber for warning, red for error, blue for info. Pick the values once, document them, and use them everywhere. The palette on this site is: success `#39ff14` (a high-saturation green that is visible on dark backgrounds), warning `#ffd700` (gold), error `#ff4d4d` (a soft red, not a blood red), info `#2dd4ff` (cyan, the brand). Each is a single hex value used in a single role.'),
            ('Contrast and accessibility',
             'WCAG AA requires a contrast ratio of at least 4.5:1 for body text and 3:1 for large text (18 pt and above). WCAG AAA is 7:1 for body and 4.5:1 for large. Anything below 4.5:1 is unreadable for low-vision users. The contrast checker on this site accepts two hex values and reports the ratio with a pass/fail against each WCAG level. Use it on every colour pair you ship.'),
            ('What this site gives you',
             'A colour palette extractor that pulls the dominant colours from any image. A WCAG contrast checker that tells you whether your foreground/background pair is readable. A 4-bit and 8-bit colour picker for the retro aesthetic, because sometimes you want a Geocities page on purpose.'),
        ],
        'faqs': [
            ('What is WCAG contrast?',
             'A measure of the difference in luminance between two colours, expressed as a ratio. 4.5:1 is the minimum for AA body text, 7:1 for AAA. Higher is more readable. The contrast checker on this site reports the ratio for any pair of hex values.'),
            ('How many colours should a palette have?',
             'As few as you can. A practical palette is 5–8 colours: two anchors (primary + neutral), one accent, and 4–5 semantic colours. A palette of more than 10 colours is almost always a sign of "let me add one more just in case".'),
            ('What is a complementary colour?',
             'A colour directly opposite on the colour wheel. The complement of blue is orange; of red is teal; of yellow is purple. Complementary pairs create the strongest visual contrast and are how you pick an accent that stands out from a primary.'),
            ('Should I use a colour palette generator?',
             'Yes, but as a starting point, not a final answer. The generators on this site are useful for the first sketch; you will still want to verify the contrast between the generated colours with the WCAG checker before you ship.'),
        ],
    },
    {
        'slug': 'image',
        'title': 'Image file formats explained — when to use PNG, JPEG, WebP, AVIF, or SVG',
        'eyebrow': 'Design · Definitive guide',
        'category': 'Interactive Art & Living Worlds',
        'related_blog': None,
        'related_use_case': 'I want to draw, design, or play with images',
        'short_desc': 'The wrong format bloats your page or makes the picture look like a 1998 webcam. The modern defaults.',
        'lede': 'PNG, JPEG, WebP, AVIF, and SVG each have a reason to exist. The wrong choice either bloats your page or makes the picture look like a 1998 webcam. This guide covers what each format is good for, the modern defaults, the file-size implications, and the free tools on this site that will move a file from one to another without losing quality.',
        'sections': [
            ('JPEG — photographs',
             'JPEG is a lossy format designed for photographs. It compresses by averaging nearby pixels, which works well for natural scenes (where no two adjacent pixels are the same) and badly for sharp edges (where the averaging shows up as artefacts). Use JPEG for: photographs, complex gradients, anything with millions of colours. Do not use JPEG for: screenshots, line art, anything with text — the edges will look fuzzy.'),
            ('PNG — screenshots and line art',
             'PNG is a lossless format that supports transparency. It is the right choice for screenshots, icons, logos, and any image where the edges matter. The file size is larger than JPEG for photographs, but the lack of artefacts at sharp edges is worth it. Use PNG for: screenshots, logos, anything with text. The free image-to-Base64 tool on this site will encode a PNG to a data URL for inline embedding.'),
            ('WebP — the modern default for the web',
             'WebP is a newer format from Google that produces smaller files than JPEG or PNG at equivalent visual quality. It supports both lossy and lossless compression, plus transparency and animation. Browser support is now universal (all major browsers since 2020). Use WebP as the default for any raster image on a web page. The free image-to-Base64 tool on this site can encode WebP too.'),
            ('AVIF — the next step',
             'AVIF is the newest format, based on the AV1 video codec. It produces even smaller files than WebP at equivalent quality and supports the same features. Browser support is good (all major browsers since 2022) but not quite universal. Use AVIF when you can, with WebP as the fallback. The `<picture>` element lets you serve both: AVIF first, WebP for browsers that don\'t support AVIF yet.'),
            ('SVG — vector graphics',
             'SVG is a text format (XML) for vector graphics — shapes defined by coordinates, not pixels. SVGs are infinitely scalable, look sharp on any display, and are usually smaller than raster equivalents for line art, icons, and simple illustrations. Use SVG for: logos, icons, illustrations, charts, anything that could be drawn in Illustrator. The free SVG-to-PNG converter on this site can rasterise an SVG at any size if you need a fallback.'),
            ('The modern default',
             'For photographs: JPEG (or WebP if you control the markup, or AVIF for the best compression). For screenshots, logos, and line art: PNG (or WebP). For icons and illustrations: SVG. For everything on a web page: WebP or AVIF with a `<picture>` element and a fallback. If in doubt, the free image-to-Base64 tool on this site will let you preview any format before you commit.'),
        ],
        'faqs': [
            ('Is PNG lossless?',
             'Yes. PNG compresses without losing any pixel data. JPEG is lossy — every save discards some information. WebP and AVIF can be either.'),
            ('What is the smallest image format?',
             'AVIF, at equivalent quality. WebP is second. JPEG and PNG are larger for the same quality.'),
            ('Should I use SVG for photographs?',
             'No. SVG is for vector graphics. Photographs have millions of colour values per pixel; expressing that in SVG (as a series of paths) produces huge files. Use JPEG/WebP/AVIF for photographs.'),
            ('Can I use WebP everywhere?',
             'Yes, on a web page. All major browsers have supported WebP since 2020. For email or print, stick with PNG/JPEG.'),
        ],
    },
    {
        'slug': 'music',
        'title': 'BPM, tempo, and time signature — a 3-minute primer for the rest of us',
        'eyebrow': 'Music & audio · Definitive guide',
        'category': 'Music & Audio',
        'related_blog': None,
        'related_use_case': 'I want to make music or work with audio',
        'short_desc': 'BPM, tempo, time signature, and the free tools on this site that tap, count, tune, and build chords for you.',
        'lede': 'BPM is beats per minute. Tempo is the same thing in Italian. Time signature is the fraction at the start of a piece of music that tells you how many beats are in a bar. This guide covers what they are, why they matter, and the free tools on this site that tap, count, tune, and build chords for you — without any music theory required.',
        'sections': [
            ('BPM (beats per minute)',
             'A number that tells you how many beats fit in a minute. 60 BPM = one beat per second. 120 BPM = two beats per second. 90 BPM is a slow walk; 140 BPM is house music; 60 BPM is a heartbeat at rest. The free BPM tapper on this site works out the BPM of any song by tapping along — you tap, it counts, it gives you the number.'),
            ('Tempo markings',
             'Classical music uses Italian tempo markings instead of numbers. Largo is very slow (40–60 BPM). Adagio is slow (66–76). Andante is walking pace (76–108). Moderato is moderate (108–120). Allegro is fast (120–156). Presto is very fast (168–200). Prestissimo is as fast as you can play (200+). The two systems coexist: a piece marked "Allegro" might be exactly 132 BPM, or it might be "feel like 132 BPM".'),
            ('Time signatures',
             'The fraction at the start of a piece of music. The top number tells you how many beats are in a bar; the bottom number tells you which note value gets one beat. 4/4 (four quarter notes per bar) is the most common — it is so common it is called "common time". 3/4 (three quarter notes per bar) is waltz time. 6/8 (six eighth notes per bar) is jig time. 5/4 is odd time and the basis of "Take Five".'),
            ('Key and tuning',
             'The key tells you which notes are in the piece. A is the most common tuning reference; an orchestra tunes to A = 440 Hz by default. The free tuner on this site listens to your instrument and tells you whether each note is sharp, flat, or in tune. The free BPM tapper tells you the tempo. The free chord builder tells you which notes are in a chord so you can play one. None of them require you to read music.'),
            ('What this site gives you',
             'A BPM tapper, a tuner, a metronome, a chord builder, and a scale visualiser. All free, all in your browser, none of them upload your audio anywhere. The BPM tapper uses the Web Audio API to listen to your microphone; the rest are visual or input-based and never touch your mic.'),
        ],
        'faqs': [
            ('What is a normal BPM?',
             'For pop and rock, 100–130 BPM. For dance music, 120–130 BPM. For hip-hop, 80–100 BPM. For ballads, 60–80 BPM. 120 is the all-purpose default if you don\'t know.'),
            ('What is 4/4 time?',
             'The most common time signature: four quarter-note beats per bar. It is so common it is called "common time" and is often written as a "C" symbol at the start of the piece.'),
            ('What does A=440 mean?',
             'The note A above middle C is tuned to 440 Hz. That is the international standard tuning reference; orchestras tune to A=440 before a concert.'),
            ('How do I tune my instrument?',
             'Use the tuner on this site (or any tuner). Play a single note; the tuner will tell you whether the pitch is sharp, flat, or in tune. Adjust the tuning peg until the needle is centred.'),
        ],
    },
    {
        'slug': 'astronomy',
        'title': 'How to read a star chart — and pick a telescope that is not a waste of money',
        'eyebrow': 'Astronomy · Definitive guide',
        'category': 'Astronomy & Space',
        'related_blog': None,
        'related_use_case': 'I want to look at the stars or the moon',
        'short_desc': 'The eyepiece math, the Dawes and Rayleigh limits, and the free tools on this site that will calculate magnification and exit pupil.',
        'lede': 'A star chart is a map of the sky from your latitude, at your local sidereal time, on the date you happen to be looking up. A telescope is a light bucket with a magnification limit set by its aperture. This guide covers the eyepiece math, the Dawes and Rayleigh limits, the right way to think about magnification, and the free tools on this site that will calculate the magnification, exit pupil, field of view, and resolving power for any combination of telescope and eyepiece.',
        'sections': [
            ('The eyepiece math',
             'Magnification = telescope focal length / eyepiece focal length. A 1,000 mm telescope with a 10 mm eyepiece gives 100×. A 1,000 mm telescope with a 25 mm eyepiece gives 40×. The exit pupil — the diameter of the beam of light leaving the eyepiece — is telescope aperture / magnification. For night-time observing, the exit pupil should match the dilation of your dark-adapted eye (about 6–7 mm). Higher magnification makes things bigger but dimmer, and exaggerates any shake in the mount.'),
            ('What aperture actually does',
             'Aperture (the diameter of the primary lens or mirror) controls two things: how much light you collect, and how much detail you can resolve. Both are linear in aperture, so doubling the aperture doubles both. A 200 mm telescope collects 4× the light of a 100 mm telescope and resolves details 2× as fine. Magnification does neither — it only makes the image bigger. This is why a 200 mm telescope with low magnification is more useful than a 100 mm telescope with high magnification.'),
            ('Dawes and Rayleigh limits',
             'The Dawes limit is the smallest angular separation two stars can have and still appear as two distinct points: Dawes limit (arcseconds) = 116 / aperture (mm). The Rayleigh limit is similar but slightly looser: Rayleigh = 138 / aperture. A 100 mm telescope resolves down to about 1.16 arcseconds (Dawes) or 1.38 (Rayleigh). A 200 mm telescope halves that. Most of what you see in a small telescope is limited by atmosphere, not by the optics — the "seeing" matters more than the spec sheet.'),
            ('Field of view',
             'Field of view = apparent field of view of the eyepiece / magnification. A 50° apparent FOV eyepiece at 50× gives a true FOV of 1°. That is about twice the diameter of the full moon. A wider apparent FOV is more immersive but more expensive; the wide-field eyepieces on this site\'s calculator will tell you the actual number for any combination.'),
            ('What this site gives you',
             'An eyepiece calculator that takes telescope aperture, telescope focal length, and eyepiece focal length and reports magnification, exit pupil, true field of view, Dawes limit, and Rayleigh limit. A lunar phase tool that tells you the current phase and the next new and full moons. A telescope collimation checker for Newtonian reflectors. A dark-sky quality planner for picking an observing site. All free, all in your browser.'),
        ],
        'faqs': [
            ('What magnification do I need?',
             'For the moon and planets, 100–200×. For deep-sky objects (nebulae, galaxies), 30–80×. For the largest star clusters, the naked eye or binoculars are often better. Higher magnification is rarely the answer.'),
            ('What is a good first telescope?',
             'A 6-inch (150 mm) or 8-inch (200 mm) Dobsonian. Aperture matters more than fancy optics; a Dobsonian mount is stable, simple, and cheap. Avoid department-store "1000×" telescopes — they are optically poor and the mount wobbles.'),
            ('What is the best telescope for under £500?',
             'A 6" or 8" Dobsonian. A 200 mm Dobsonian in the UK costs around £350 and will show more than any 100 mm refractor at twice the price.'),
            ('What is exit pupil?',
             'The diameter of the beam of light leaving the eyepiece, in millimetres. For night-time observing it should match your dilated pupil (about 6–7 mm for a dark-adapted adult). A smaller exit pupil is fine for daytime viewing.'),
        ],
    },
    {
        'slug': 'writing',
        'title': 'How to write a cover letter, resume, or business email that someone will actually read',
        'eyebrow': 'Writing & business · Definitive guide',
        'category': 'Writing & Language',
        'related_blog': None,
        'related_use_case': 'I want to write a cover letter, resume, or email',
        'short_desc': 'The four-part structure, the two phrases that should never appear, and the free tools that will proofread, paraphrase, and tone-check the result.',
        'lede': 'Most cover letters, resumes, and business emails start with the writer and end with the writer. The reader never appears. The four-part structure that fixes this is simple, takes about ten minutes longer than the wrong way, and gets you read. This guide covers the structure, the two phrases that should never appear in a professional email, and the free tools on this site that will proofread, paraphrase, and tone-check the result.',
        'sections': [
            ('The four-part structure',
             'A professional letter or email has four parts: (1) the reason you are writing, in the first sentence; (2) the thing you want, in the second sentence; (3) the evidence that you are worth the recipient\'s time, in one or two short paragraphs; (4) the specific next step, in the closing sentence. Most people write the second and third parts and skip the first and fourth. The first sentence is the most important: if the recipient does not know what you want within the first ten words, they will assume the rest is the same.'),
            ('The two phrases that should never appear',
             '"I hope this email finds you well" and "I would be a great fit for this role". The first is filler. The second is an opinion, not evidence. Replace the first with the reason for the email. Replace the second with one specific, verifiable fact: a number, a result, a project. "I led the migration of 12,000 customer records to the new CRM, with zero downtime" is an argument. "I would be a great fit" is a wish.'),
            ('Cover letters',
             'A cover letter is a one-page argument that you are worth a 30-minute interview. It is not a summary of your resume. It is a single, specific, falsifiable claim about what you have done that is relevant to the job, plus the evidence for it. Three paragraphs is the right length. The first names the role and the specific thing about the company that attracted you. The second is the claim and evidence. The third is the next step: a specific time you are available to talk.'),
            ('Resumes',
             'A resume is a one-page list of evidence. Verbs at the start of each line ("led", "shipped", "cut", "grew"), numbers attached to the outcomes ("by 22%", "across 14 sites", "to 1.3 M monthly users"). The reader skims in 10–20 seconds. If the first verb on each line is not specific, the reader assumes the rest is the same. The free resume builder on this site scaffolds this structure.'),
            ('Business emails',
             'A business email should fit on one screen. If the recipient has to scroll, you have written a memo, not an email. The first sentence is the ask. The second sentence is why. The third sentence (if needed) is the supporting fact. The closing sentence is the next step. The free email template generator on this site will scaffold this for common scenarios — chasing an invoice, declining a meeting, escalating a blocker.'),
            ('What this site gives you',
             'A cover letter builder, a resume builder, an email template generator, a grammar checker, a paraphrasing tool, a proofreading and style checker, and a readability scorer. All of them run in your browser; none of them upload your draft anywhere.'),
        ],
        'faqs': [
            ('How long should a cover letter be?',
             'Three short paragraphs on one page. If the cover letter is longer than the resume, something is wrong.'),
            ('Should I address a cover letter to a specific person?',
             'Yes if you know it. "Dear Hiring Manager" is acceptable; "Dear Sir/Madam" or "To whom it may concern" is not.'),
            ('How long should a resume be?',
             'One page for most roles. Two pages is acceptable for senior roles with 10+ years of relevant experience. Never three pages unless you are a doctor or a researcher with a publication list.'),
            ('Should I use AI to write a cover letter?',
             'You can use it to draft, but you should rewrite the opening and the specific evidence in your own words. A cover letter that reads like a template is worse than no cover letter, because it tells the reader you did not care enough to write one.'),
        ],
    },
    {
        'slug': 'wellbeing',
        'title': 'How to breathe, ground, and calm down — three techniques that work in under 5 minutes',
        'eyebrow': 'Wellbeing · Definitive guide',
        'category': 'Wellbeing & Community',
        'related_blog': None,
        'related_use_case': 'I need to relax, sleep, or feel calmer',
        'short_desc': 'Box breathing, 4-7-8 breathing, and the 5-4-3-2-1 grounding technique. The physiology, when to use which, and the free tools that pace you through them.',
        'lede': 'Box breathing, 4-7-8 breathing, and the 5-4-3-2-1 grounding technique. These are the three most-studied, lowest-effort interventions for acute anxiety and stress, and they all fit in under five minutes. This guide covers the physiology of each, when to use which, and the free tools on this site that pace, time, and walk you through them — with audio and visuals, not a script you have to memorise.',
        'sections': [
            ('Why these work',
             'Slow, deliberate breathing activates the parasympathetic nervous system — the body\'s "rest and digest" mode — by stimulating the vagus nerve. The vagus nerve runs from the brainstem to the abdomen; slow breathing stretches it, which in turn slows the heart rate and reduces the stress-hormone cascade. The effect is measurable within 60 seconds: heart rate variability increases, blood pressure drops, the subjective feeling of anxiety decreases. The research is robust enough that the US military teaches box breathing to soldiers before operations.'),
            ('Box breathing (4-4-4-4)',
             'Inhale for 4 seconds. Hold for 4. Exhale for 4. Hold for 4. Repeat. The pattern is a square, which is where the name comes from. The technique is favoured by the US Navy SEALs and by most performance coaches. The free box-breathing tool on this site paces the four phases with a visual square and audio cues so you don\'t have to count.'),
            ('4-7-8 breathing',
             'Inhale for 4 seconds. Hold for 7. Exhale for 8. Repeat. The longer exhale is the active ingredient: extending the exhale relative to the inhale amplifies the parasympathetic response. The technique is from Dr Andrew Weil and is most useful when you are in a high-arousal state (panic, racing thoughts, acute anxiety). The free 4-7-8 tool on this site paces the three phases and reminds you to breathe through the nose.'),
            ('5-4-3-2-1 grounding',
             'Name 5 things you can see. 4 things you can hear. 3 things you can touch. 2 things you can smell. 1 thing you can taste. The technique works by forcing the brain to engage the senses, which interrupts the rumination loop that drives anxiety. It is most useful in the middle of a panic attack or a flashback, when the body is in "fight or flight" and the rational mind is offline. The free grounding tool on this site walks you through the five steps with visual and audio prompts.'),
            ('When to use which',
             'Box breathing: general stress, before a difficult conversation, after a shock. 4-7-8: acute anxiety, panic, racing thoughts at bedtime. 5-4-3-2-1: full panic attack, dissociation, flashback. None of these techniques are substitutes for professional mental-health support, and if you find yourself needing them often, the next step is a conversation with a GP.'),
            ('What this site gives you',
             'A box-breathing coach with a visual square and audio cues. A 4-7-8 coach. A 5-4-3-2-1 grounding walkthrough. A grief companion (separate, because grief is not a technique). A lucid-dreaming planner. All free, all in your browser, none of them upload your data anywhere.'),
        ],
        'faqs': [
            ('How fast does box breathing work?',
             'Most people feel a measurable reduction in heart rate within 60 seconds and a reduction in subjective anxiety within 2–3 cycles (about 1 minute). The effect is largest in the first five minutes and persists for 10–15 minutes after you stop.'),
            ('Is 4-7-8 safe?',
             'For most adults, yes. If you have a respiratory or cardiovascular condition, talk to your GP before trying. Do not practise while driving or operating machinery — the longer exhale can cause light-headedness in some people.'),
            ('What is the 5-4-3-2-1 technique?',
             'A grounding technique: name 5 things you can see, 4 you can hear, 3 you can touch, 2 you can smell, 1 you can taste. It interrupts the rumination loop by forcing the brain to engage the senses.'),
            ('When should I see a professional?',
             'If you find yourself needing these techniques more than a few times a week, or if the anxiety is interfering with sleep, work, or relationships, the next step is a conversation with your GP. These tools are first aid, not treatment.'),
        ],
    },
]


def find_tools_for_guide(guide):
    """Pick 4-6 most-relevant tools for a guide based on category + name keywords."""
    cat = guide['category']
    candidates = list(BY_CAT.get(cat, []))
    # Score: exact keyword match in name wins big
    keywords = re.findall(r'[a-z]{3,}', guide['title'].lower() + ' ' + guide['lede'].lower())
    keyword_set = set(keywords) - {'the', 'and', 'for', 'with', 'that', 'this', 'you', 'are', 'your'}
    scored = []
    for c in candidates:
        text = ' '.join([c.get('name', ''), c.get('title', ''), c.get('description', '') or '']).lower()
        score = sum(1 for k in keyword_set if k in text)
        scored.append((score, c))
    scored.sort(key=lambda x: -x[0])
    return [c for s, c in scored if s > 0][:6] or candidates[:5]


def slug(s):
    return re.sub(r'[^a-z0-9-]+', '-', s.lower()).strip('-')


def article_jsonld(guide, url):
    return {
        '@context': 'https://schema.org',
        '@type': 'Article',
        'headline': guide['title'],
        'description': guide['short_desc'],
        'author': {'@type': 'Person', 'name': 'Russell Head', 'url': 'https://www.themostusefulsiteintheworld.com/about.html'},
        'publisher': {'@type': 'Organization', 'name': 'The Most Useful Site in the World', 'url': 'https://www.themostusefulsiteintheworld.com/'},
        'datePublished': '2026-09-02',
        'dateModified': '2026-09-02',
        'image': 'https://www.themostusefulsiteintheworld.com/og-tools.png',
        'mainEntityOfPage': url,
        'wordCount': len(guide['lede'].split()) + sum(len(s[1].split()) for s in guide['sections']),
    }


def faq_jsonld(guide):
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'mainEntity': [
            {
                '@type': 'Question',
                'name': q,
                'acceptedAnswer': {'@type': 'Answer', 'text': a},
            }
            for q, a in guide['faqs']
        ],
    }


def breadcrumb_jsonld(guide, url):
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://www.themostusefulsiteintheworld.com/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Guides', 'item': 'https://www.themostusefulsiteintheworld.com/guides/'},
            {'@type': 'ListItem', 'position': 3, 'name': guide['title'], 'item': url},
        ],
    }


def render_html(guide):
    url = f'https://www.themostusefulsiteintheworld.com/guides/{guide["slug"]}.html'
    article_ld = article_jsonld(guide, url)
    faq_ld = faq_jsonld(guide)
    breadcrumb_ld = breadcrumb_jsonld(guide, url)

    tools = find_tools_for_guide(guide)
    tool_cards = '\n'.join(
        f'<a class="gtool" href="../tool.html?card={c.get("name")}">'
        f'<div class="gt-emoji">{c.get("title", "").split()[0] if c.get("title") else "🛠️"}</div>'
        f'<div class="gt-name">{h.escape(c.get("title") or c.get("name").replace("-", " ").title())}</div>'
        f'<div class="gt-desc">{h.escape((c.get("description") or "")[:130])}</div>'
        f'</a>'
        for c in tools
    ) if tools else '<p style="color: var(--text-secondary); font-size: .92rem;">The most useful tools for this topic are linked from the home page and the <a href="../tools.html" style="color: var(--accent);">full index</a>.</p>'

    related_blog_html = ''
    if guide.get('related_blog'):
        related_blog_html = f'<p style="margin-top: 12px; color: var(--text-secondary); font-size: .9rem;">📖 Long-form companion: <a href="..{guide["related_blog"]}" style="color: var(--accent); text-decoration: underline;">{guide["related_blog"].split("/")[-1].replace(".html", "").replace("-", " ").title()}</a> on the blog.</p>'

    # FAQ rows
    faq_rows = '\n'.join(
        f'<details class="gfaq"><summary><strong>{h.escape(q)}</strong></summary><p>{h.escape(a)}</p></details>'
        for q, a in guide['faqs']
    )

    # Section rows
    section_rows = []
    for h2, body in guide['sections']:
        # If body is short, it's a sub-heading preamble; if long, it's content
        if len(body) < 80 and not body.endswith('.'):
            section_rows.append(f'<h3>{h.escape(h2)}</h3>')
            section_rows.append(f'<p>{h.escape(body)}</p>')
        else:
            section_rows.append(f'<h2 id="{slug(h2[:40])}">{h.escape(h2)}</h2>')
            section_rows.append(f'<p>{h.escape(body)}</p>')

    sections_html = '\n'.join(section_rows)

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23ffd400'/%3E%3Cstop offset='1' stop-color='%23ff9500'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='16' cy='16' r='13' fill='none' stroke='url(%23g)' stroke-width='5'/%3E%3Ccircle cx='16' cy='16' r='6' fill='none' stroke='url(%23g)' stroke-width='3'/%3E%3C/svg%3E">
<title>{h.escape(guide["title"])}</title>
<meta name="description" content="{h.escape(guide["short_desc"])}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<link rel="canonical" href="{url}">
<link rel="alternate" type="application/rss+xml" title="The Most Useful Site in the World — RSS feed" href="../feed.xml">
<meta name="theme-color" content="#0a0f14">
<meta property="og:type" content="article">
<meta property="og:site_name" content="The Most Useful Site in the World">
<meta property="og:title" content="{h.escape(guide["title"])}">
<meta property="og:description" content="{h.escape(guide["short_desc"])}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="https://www.themostusefulsiteintheworld.com/og-tools.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{h.escape(guide["title"])}">
<meta name="twitter:description" content="{h.escape(guide["short_desc"])}">
<meta name="twitter:image" content="https://www.themostusefulsiteintheworld.com/og-tools.png">
<meta property="article:published_time" content="2026-09-02">
<meta property="article:modified_time" content="2026-09-02">
<meta property="article:author" content="Russell Head">
<script type="application/ld+json">{json.dumps(article_ld, separators=(",", ":"))}</script>
<script type="application/ld+json">{json.dumps(faq_ld, separators=(",", ":"))}</script>
<script type="application/ld+json">{json.dumps(breadcrumb_ld, separators=(",", ":"))}</script>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
:root{{--accent:#2dd4ff;--text:#e6faff;--text-secondary:rgba(230,250,255,.7);--bg-primary:#0a0f14;--bg-secondary:#141e28;--border-light:rgba(255,255,255,.08);--gold:#ffd700;--success:#39ff14}}
body{{background:var(--bg-primary);color:var(--text);line-height:1.7;font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;overflow-x:hidden}}
a{{color:inherit}}
.wrap{{max-width:860px;margin:0 auto;padding:0 20px}}
.topbar{{border-bottom:1px solid var(--border-light);padding:13px 0;background:rgba(10,15,20,.9);position:sticky;top:0;z-index:100;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}}
.topbar .wrap{{display:flex;justify-content:space-between;align-items:center;gap:14px;max-width:1180px}}
.topbar a{{text-decoration:none;font-weight:800;font-size:.9rem}}.topbar .back{{color:var(--text-secondary);font-weight:600;font-size:.85rem}}.topbar .back:hover{{color:var(--text)}}
.hero{{padding:50px 0 24px;background:radial-gradient(ellipse 60% 50% at 50% 0%, rgba(45,212,255,0.08), transparent 70%)}}
.hero .eyebrow{{display:inline-block;font-size:.7rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);border:1px solid rgba(45,212,255,.34);background:rgba(45,212,255,.07);padding:5px 12px;border-radius:100px;margin-bottom:14px}}
.hero h1{{font-size:clamp(1.7rem,4.4vw,2.5rem);font-weight:900;letter-spacing:-.02em;line-height:1.2;color:#fff;margin-bottom:14px}}
.hero .lede{{font-size:1.05rem;color:#d4e7ee;max-width:760px;line-height:1.7}}
article{{margin:30px 0}}
article h2{{font-size:1.4rem;font-weight:800;margin:36px 0 12px;color:#fff;scroll-margin-top:60px;line-height:1.3}}
article h3{{font-size:1.15rem;font-weight:800;margin:24px 0 8px;color:#fff;line-height:1.3}}
article p{{margin:0 0 14px;color:#d4e7ee;font-size:1.02rem;line-height:1.75}}
article p strong{{color:#fff}}
article a{{color:var(--accent);text-decoration:underline;text-decoration-color:rgba(45,212,255,.4);text-underline-offset:2px}}
article a:hover{{text-decoration-color:var(--accent)}}
.tldr{{background:linear-gradient(135deg, rgba(255,215,0,0.07), transparent);border:1px solid rgba(255,215,0,.3);border-left:3px solid var(--gold);border-radius:0 12px 12px 0;padding:18px 22px;margin:20px 0}}
.tldr h3{{margin:0 0 8px;color:#fff;font-size:1.05rem;display:flex;align-items:center;gap:6px}}
.tldr p{{margin:0;font-size:.95rem;line-height:1.65}}
.tools-block{{margin:30px 0;padding:24px;background:linear-gradient(135deg, rgba(45,212,255,0.05), rgba(57,255,20,0.03));border:1px solid rgba(45,212,255,.2);border-radius:14px}}
.tools-block h2{{margin:0 0 14px;color:#fff;font-size:1.15rem}}
.tools-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:10px}}
.gtool{{background:rgba(20,30,40,.6);border:1px solid var(--border-light);border-radius:10px;padding:12px 14px;text-decoration:none;color:inherit;transition:all .2s;display:block}}
.gtool:hover{{border-color:var(--accent);background:rgba(45,212,255,.06);text-decoration:none;color:inherit;transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,.3)}}
.gt-emoji{{font-size:1.3rem;margin-bottom:4px}}
.gt-name{{font-size:.88rem;font-weight:700;color:#fff;margin-bottom:3px;line-height:1.3}}
.gt-desc{{font-size:.74rem;color:var(--text-secondary);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}}
.faq-block{{margin:36px 0;padding:24px;background:var(--bg-secondary);border:1px solid var(--border-light);border-radius:14px}}
.faq-block h2{{margin:0 0 14px;color:#fff;font-size:1.2rem}}
.gfaq{{background:rgba(10,15,20,.5);border:1px solid var(--border-light);border-radius:8px;padding:11px 14px;margin:8px 0;transition:all .2s}}
.gfaq[open]{{border-color:rgba(45,212,255,.3);background:rgba(45,212,255,.04)}}
.gfaq summary{{cursor:pointer;font-size:.95rem;color:#fff;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:8px}}
.gfaq summary::-webkit-details-marker{{display:none}}
.gfaq summary::after{{content:"+";color:var(--accent);font-size:1.3rem;font-weight:700;flex-shrink:0;transition:transform .2s}}
.gfaq[open] summary::after{{content:"−"}}
.gfaq p{{margin:8px 0 0;color:#d4e7ee;font-size:.94rem;line-height:1.6}}
.related-guides{{margin:36px 0;padding:22px;background:var(--bg-secondary);border:1px solid var(--border-light);border-radius:14px}}
.related-guides h3{{margin:0 0 12px;font-size:1rem;color:#fff}}
.related-guides ul{{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}}
.related-guides li a{{display:block;padding:9px 13px;background:rgba(45,212,255,0.06);border:1px solid rgba(45,212,255,.18);border-radius:8px;color:var(--text);text-decoration:none;font-size:.85rem;font-weight:600;transition:all .2s}}
.related-guides li a:hover{{background:rgba(45,212,255,.15);color:#fff;text-decoration:none}}
.cta{{margin:36px 0;padding:24px;border-radius:14px;background:linear-gradient(135deg, rgba(45,212,255,0.08), rgba(255,215,0,0.04));border:1px solid rgba(45,212,255,.2);text-align:center}}
.cta a{{display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border-radius:100px;background:var(--accent);color:#04141c;font-weight:800;font-size:.93rem;text-decoration:none;transition:all .2s;margin:4px}}
.cta a:hover{{transform:translateY(-2px);box-shadow:0 8px 24px rgba(45,212,255,.4);text-decoration:none;color:#04141c}}
.cta a.alt{{background:transparent;border:1px solid var(--border-light);color:#e6faff}}
.cta a.alt:hover{{background:rgba(255,255,255,.08);box-shadow:none}}
footer{{border-top:1px solid var(--border-light);margin-top:50px;padding:24px 0;text-align:center;color:var(--text-secondary);font-size:.85rem}}footer a{{text-decoration:none;margin:0 8px}}footer a:hover{{color:var(--text)}}
@media(prefers-reduced-motion:reduce){{*{{transition:none!important}}}}
</style>
</head>
<body>

<div class="topbar"><div class="wrap">
  <a href="../index.html">🛠️ The Most Useful Site in the World</a>
  <a class="back" href="../index.html">← Back to the tools</a>
</div></div>

<header class="hero"><div class="wrap">
  <div class="eyebrow">{h.escape(guide["eyebrow"])}</div>
  <h1>{h.escape(guide["title"])}</h1>
  <p class="lede">{h.escape(guide["lede"])}</p>
</div></header>

<main class="wrap"><article>

<div class="tldr">
  <h3>⚡ TL;DR</h3>
  <p>{h.escape(guide["short_desc"])}</p>
</div>

{sections_html}

<div class="tools-block">
  <h2>🛠️ What this site gives you for {h.escape(guide["category"])}</h2>
  <p style="color: var(--text-secondary); font-size: .94rem; margin: 0 0 12px;">Free, browser-side tools related to this topic. No sign-ups, no tracking, no ads.</p>
  <div class="tools-grid">
    {tool_cards}
  </div>
  {related_blog_html}
</div>

<div class="faq-block">
  <h2>❓ Frequently asked questions</h2>
  {faq_rows}
</div>

<div class="related-guides">
  <h3>📚 More definitive guides</h3>
  <ul>
    <li><a href="../guides/mortgage.html">How mortgages really work</a></li>
    <li><a href="../guides/bmi.html">What BMI actually measures</a></li>
    <li><a href="../guides/compound-interest.html">Why compound growth is magic</a></li>
    <li><a href="../guides/passwords.html">How to choose a strong password</a></li>
    <li><a href="../guides/json.html">JSON for people who hate JSON</a></li>
    <li><a href="../guides/regex.html">Regular expressions without the pain</a></li>
    <li><a href="../guides/color.html">How to pick a colour palette</a></li>
    <li><a href="../guides/image.html">Image file formats explained</a></li>
    <li><a href="../guides/music.html">BPM, tempo, and time signature</a></li>
    <li><a href="../guides/astronomy.html">How to read a star chart</a></li>
    <li><a href="../guides/writing.html">Cover letters, resumes, emails</a></li>
    <li><a href="../guides/wellbeing.html">Breathe, ground, calm down</a></li>
  </ul>
</div>

<div class="cta">
  <p style="margin:0 0 12px;color:#fff;font-size:1rem;font-weight:700;">Open the catalogue</p>
  <a href="../index.html">🔲 Browse all 562 tools</a>
  <a class="alt" href="../tools.html">📚 Full index</a>
  <a class="alt" href="../use-case.html">🎯 By use case</a>
  <a class="alt" href="../popular.html">⭐ Most popular</a>
  <a class="alt" href="../new.html">🆕 Just added</a>
  <a class="alt" href="../embed.html">🔌 Embed any tool</a>
  <a class="alt" href="../donate.html">☕ Donate</a>
</div>

</article></main>

<footer><div class="wrap">
  <p><a href="../index.html">All 562 tools</a>·<a href="../about.html">About</a>·<a href="../press.html">Press</a>·<a href="../tools.html">Index</a>·<a href="../popular.html">Popular</a>·<a href="../new.html">New</a>·<a href="../use-case.html">Use case</a>·<a href="../help.html">Help</a>·<a href="../changelog.html">Changelog</a>·<a href="../embed.html">Embed</a>·<a href="../sitemap.html">Sitemap</a>·<a href="../blog/">Blog</a>·<a href="../donate.html">Donate</a>·<a href="../sponsor.html">Sponsor</a>·<a href="../listen.html">Music</a></p>
</div></footer>

</body></html>'''


import html as h
import html as h_mod  # ensure h is available
h = h_mod

for g in GUIDES:
    out = render_html(g)
    path = os.path.join(ROOT, 'guides', f'{g["slug"]}.html')
    with open(path, 'w') as f:
        f.write(out)
    print(f'Wrote {path} ({len(out)} bytes)')

# Now build the guides index
guides_index = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23ffd400'/%3E%3Cstop offset='1' stop-color='%23ff9500'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='16' cy='16' r='13' fill='none' stroke='url(%23g)' stroke-width='5'/%3E%3Ccircle cx='16' cy='16' r='6' fill='none' stroke='url(%23g)' stroke-width='3'/%3E%3C/svg%3E">
<title>Guides — The Most Useful Site in the World</title>
<meta name="description" content="Definitive, math-honest guides on the topics the site\'s tools calculate. 12 long-form guides covering mortgages, BMI, compound interest, passwords, JSON, regex, colour, images, music, astronomy, writing, and wellbeing.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://www.themostusefulsiteintheworld.com/guides/">
<link rel="alternate" type="application/rss+xml" title="The Most Useful Site in the World — RSS feed" href="feed.xml">
<meta name="theme-color" content="#0a0f14">
<meta property="og:type" content="website">
<meta property="og:site_name" content="The Most Useful Site in the World">
<meta property="og:title" content="Guides — The Most Useful Site in the World">
<meta property="og:description" content="Definitive, math-honest guides on the topics the site\'s tools calculate.">
<meta property="og:url" content="https://www.themostusefulsiteintheworld.com/guides/">
<meta property="og:image" content="https://www.themostusefulsiteintheworld.com/og-tools.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Guides — The Most Useful Site in the World">
<meta name="twitter:description" content="Definitive, math-honest guides on the topics the site\'s tools calculate.">
<meta name="twitter:image" content="https://www.themostusefulsiteintheworld.com/og-tools.png">
<script type="application/ld+json">{"@context": "https://schema.org", "@type": "CollectionPage", "name": "Guides", "description": "12 definitive guides covering the topics the site\'s tools calculate.", "url": "https://www.themostusefulsiteintheworld.com/guides/"}</script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--accent:#2dd4ff;--text:#e6faff;--text-secondary:rgba(230,250,255,.7);--bg-primary:#0a0f14;--bg-secondary:#141e28;--border-light:rgba(255,255,255,.08);--gold:#ffd700;--success:#39ff14}
body{background:var(--bg-primary);color:var(--text);line-height:1.7;font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;overflow-x:hidden}
a{color:inherit}
.wrap{max-width:1100px;margin:0 auto;padding:0 20px}
.topbar{border-bottom:1px solid var(--border-light);padding:13px 0;background:rgba(10,15,20,.9);position:sticky;top:0;z-index:100;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.topbar .wrap{display:flex;justify-content:space-between;align-items:center;gap:14px;max-width:1180px}
.topbar a{text-decoration:none;font-weight:800;font-size:.9rem}.topbar .back{color:var(--text-secondary);font-weight:600;font-size:.85rem}.topbar .back:hover{color:var(--text)}
.hero{padding:60px 0 30px;text-align:center;background:radial-gradient(ellipse 60% 50% at 50% 0%, rgba(45,212,255,0.08), transparent 70%)}
.hero h1{font-size:clamp(2rem,4.6vw,3rem);font-weight:900;letter-spacing:-.025em;line-height:1.1;background:linear-gradient(135deg, #fff 20%, var(--accent) 80%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:10px}
.hero p{color:var(--text-secondary);font-size:1.05rem;max-width:680px;margin:0 auto}
.eyebrow{display:inline-block;font-size:.68rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);border:1px solid rgba(45,212,255,.34);background:rgba(45,212,255,.07);padding:5px 12px;border-radius:100px;margin-bottom:14px}
.intro{background:linear-gradient(135deg, rgba(255,215,0,0.06), transparent);border:1px solid rgba(255,215,0,.25);border-left:3px solid var(--gold);border-radius:0 12px 12px 0;padding:18px 22px;margin:24px 0;color:#d4e7ee;font-size:1rem;line-height:1.65}
.intro strong{color:#fff}
.guides-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;margin:24px 0 30px}
.gcard{background:var(--bg-secondary);border:1px solid var(--border-light);border-radius:14px;padding:22px 24px;text-decoration:none;color:inherit;display:block;transition:all .2s;position:relative;overflow:hidden}
.gcard::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg, var(--accent), var(--success));opacity:.5;transition:opacity .2s}
.gcard:hover{border-color:var(--accent);background:rgba(45,212,255,0.04);text-decoration:none;color:inherit;transform:translateY(-3px);box-shadow:0 12px 28px rgba(0,0,0,.4)}
.gcard:hover::before{opacity:1}
.gcard .eyebrow-card{display:inline-block;font-size:.66rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin-bottom:8px;padding:3px 8px;background:rgba(45,212,255,0.1);border-radius:8px;border:1px solid rgba(45,212,255,.18)}
.gcard h2{margin:0 0 8px;font-size:1.15rem;font-weight:800;color:#fff;line-height:1.3}
.gcard p{margin:0 0 10px;font-size:.92rem;color:var(--text-secondary);line-height:1.6}
.gcard .read{font-size:.8rem;font-weight:600;color:var(--accent)}
.cta{margin:50px 0;padding:26px;border-radius:16px;background:linear-gradient(135deg, rgba(45,212,255,.08), rgba(255,215,0,.04));border:1px solid rgba(45,212,255,.2);text-align:center}
.cta a{display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border-radius:100px;background:var(--accent);color:#04141c;font-weight:800;font-size:.93rem;text-decoration:none;transition:all .2s;margin:4px}
.cta a:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(45,212,255,.4);text-decoration:none;color:#04141c}
.cta a.alt{background:transparent;border:1px solid var(--border-light);color:#e6faff}.cta a.alt:hover{background:rgba(255,255,255,.08);box-shadow:none}
footer{border-top:1px solid var(--border-light);margin-top:50px;padding:24px 0;text-align:center;color:var(--text-secondary);font-size:.85rem}footer a{text-decoration:none;margin:0 8px}footer a:hover{color:var(--text)}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>

<div class="topbar"><div class="wrap">
  <a href="index.html">🛠️ The Most Useful Site in the World</a>
  <a class="back" href="index.html">← Back to the tools</a>
</div></div>

<header class="hero">
  <div class="wrap">
    <div class="eyebrow">📚 Guides · 12 definitive, math-honest explainers</div>
    <h1>Read this before you search again</h1>
    <p>The 12 guides below cover the topics the site\'s tools calculate. Each one is the "definitive source" on a single question — long enough to be useful, short enough to read in 10 minutes, with the math written out and the assumptions named.</p>
  </div>
</header>

<main class="wrap">

<div class="intro">
  <strong>Why these guides exist.</strong> The internet used to have a million small useful tools, and most of them were on a personal homepage. The modern search results for "calculate mortgage" or "what\'s my BMI" are dominated by sites that exist to harvest an email address, sign you up for a newsletter, or sell your output as a lead to a lender. There is no business model here. There is no newsletter, no lead form, no upsell, no pop-up. The whole point of the site is that the calculation is the product. These guides are the same: the answer is the answer; the math is the math; if the math has a known limitation, the page says so.
</div>

<div class="guides-grid">'''

for g in GUIDES:
    guides_index += f'''
    <a class="gcard" href="guides/{g["slug"]}.html">
      <span class="eyebrow-card">{g["eyebrow"]}</span>
      <h2>{g["title"]}</h2>
      <p>{g["short_desc"]}</p>
      <span class="read">Read the guide →</span>
    </a>'''

guides_index += '''
</div>

<div class="cta">
  <p style="margin:0 0 14px;color:#fff;font-size:1.1rem;font-weight:800;">Or go straight to the tools</p>
  <a href="index.html">🔲 Browse all 562 tools</a>
  <a class="alt" href="tools.html">📚 Full index</a>
  <a class="alt" href="use-case.html">🎯 By use case</a>
  <a class="alt" href="popular.html">⭐ Most popular</a>
  <a class="alt" href="new.html">🆕 Just added</a>
  <a class="alt" href="embed.html">🔌 Embed any tool</a>
  <a class="alt" href="blog/">📖 Blog</a>
  <a class="alt" href="donate.html">☕ Donate</a>
</div>

</main>

<footer><div class="wrap">
  <p><a href="index.html">All 562 tools</a>·<a href="about.html">About</a>·<a href="press.html">Press</a>·<a href="tools.html">Index</a>·<a href="popular.html">Popular</a>·<a href="new.html">New</a>·<a href="use-case.html">Use case</a>·<a href="help.html">Help</a>·<a href="changelog.html">Changelog</a>·<a href="embed.html">Embed</a>·<a href="sitemap.html">Sitemap</a>·<a href="blog/">Blog</a>·<a href="donate.html">Donate</a>·<a href="sponsor.html">Sponsor</a>·<a href="listen.html">Music</a></p>
</div></footer>

</body></html>'''

with open(os.path.join(ROOT, 'guides.html'), 'w') as f:
    f.write(guides_index)
print(f'Wrote guides.html ({len(guides_index)} bytes)')

# Also add guides/ alias (some pages link to /guides/, some to /guides.html)
import shutil
shutil.copyfile(os.path.join(ROOT, 'guides.html'), os.path.join(ROOT, 'guides', 'index.html'))
print('Wrote guides/index.html')
