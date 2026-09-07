#!/usr/bin/env python3
"""Add HowTo + SoftwareApplication + FAQPage JSON-LD to the 10 most-searched
tool cards. Each card gets the right schema for its specific content.

Why this matters: the research says FAQPage + HowTo + SoftwareApplication JSON-LD
is the highest-ROI schema for tool pages. FAQ blocks get rich-result real
estate. SoftwareApplication JSON-LD surfaces app/calculation results in
Google. HowTo JSON-LD is the schema Google uses for step-by-step guides.

All the JSON-LD is added in <head>. No body content is touched.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (slug, title, description, faqs, howto_steps, application_category, application_sub_category)
TOOL_SCHEMAS = [
    {
        'path': 'cards/mortgage.html',
        'slug': 'mortgage',
        'title': 'Mortgage Calculator',
        'description': 'Calculate detailed mortgage payments with amortization schedules, extra payments, and total interest. The math written out, the assumptions named.',
        'application_category': 'FinanceApplication',
        'application_sub_category': 'Mortgage Calculator',
        'howto_steps': [
            {'name': 'Enter the loan amount', 'text': 'Type the loan amount in the principal field. This is the amount you will borrow, not the price of the property.'},
            {'name': 'Enter the interest rate', 'text': 'Type the annual interest rate as a percentage. If your deal is fixed for 2 years at 4.5%, use 4.5, not the reversion rate.'},
            {'name': 'Enter the loan term in years', 'text': 'Type the term in years, not months. A 25-year mortgage is 25, not 300.'},
            {'name': 'Review the monthly payment and total interest', 'text': 'The calculator shows the monthly payment and the total interest paid over the life of the loan. The total interest is the number the bank rarely prints.'},
            {'name': 'Try an overpayment', 'text': 'Add a monthly overpayment to see how the term and the total interest change. Most lenders let you overpay by 10% of the balance per year without penalty.'},
        ],
        'faqs': [
            ('What is the mortgage payment formula?',
             'P × r × (1+r)^n / ((1+r)^n − 1), where P is principal, r is monthly interest rate, and n is the total number of monthly payments.'),
            ('What is the SVR?',
             'The lender\'s Standard Variable Rate — the rate that applies after a fixed deal ends, and the rate you pay if you never remortgage. Usually higher than any fixed deal.'),
            ('What is an early-repayment charge?',
             'A fee the lender charges if you overpay above the annual allowance (typically 10% of the balance) during the fixed period.'),
        ],
    },
    {
        'path': 'cards/bmi.html',
        'slug': 'bmi',
        'title': 'BMI Calculator',
        'description': 'Calculate your Body Mass Index (BMI) with accurate WHO classification. A population screening tool, not a personal one.',
        'application_category': 'HealthApplication',
        'application_sub_category': 'BMI Calculator',
        'howto_steps': [
            {'name': 'Enter your weight', 'text': 'Type your weight in kilograms. To convert from pounds, divide by 2.205.'},
            {'name': 'Enter your height', 'text': 'Type your height in centimetres. To convert from feet/inches, multiply inches by 2.54 and add to feet × 30.48.'},
            {'name': 'Read the BMI number and the classification band', 'text': 'Below 18.5 is underweight, 18.5–24.9 is normal, 25–29.9 is overweight, 30+ is obese. The bands are population cut-offs, not personal thresholds. See the BMI guide for what to use alongside it.'},
        ],
        'faqs': [
            ('What is the BMI formula?',
             'BMI = weight (kg) divided by height (m) squared. In imperial: 703 × weight (lb) / height (in)².'),
            ('What is a healthy BMI?',
             'For most adults, 18.5 to 24.9 is classified as "normal", 25 to 29.9 as "overweight", and 30+ as "obese". The cut-offs are population-level, not personal.'),
            ('Is BMI accurate for muscular people?',
             'No. BMI does not distinguish muscle from fat. A muscular person may have a high BMI and low body fat.'),
        ],
    },
    {
        'path': 'cards/password.html',
        'slug': 'password',
        'title': 'Password Generator',
        'description': 'Create strong, random passwords instantly. Customize length and character sets. Runs in your browser, no data sent anywhere.',
        'application_category': 'UtilitiesApplication',
        'application_sub_category': 'Password Generator',
        'howto_steps': [
            {'name': 'Choose a length', 'text': 'At least 14 characters for important accounts, ideally 20+. Length matters more than character variety.'},
            {'name': 'Choose which character classes to include', 'text': 'Lowercase, uppercase, digits, symbols. More variety is slightly stronger but length dominates.'},
            {'name': 'Click Generate', 'text': 'The generator produces a fresh, cryptographically random string. The result is computed in your browser using crypto.getRandomValues.'},
            {'name': 'Copy the password and save it in your password manager', 'text': 'Don\'t memorise it. Let your browser\'s built-in password manager or a dedicated manager (1Password, Bitwarden) store it.'},
        ],
        'faqs': [
            ('How long should a password be?',
             'At least 14 characters for important accounts, ideally 20+ for anything you would not want publicly known. Length matters more than character variety.'),
            ('Should I change my passwords regularly?',
             'Only if you have reason to believe one is compromised. NIST advises against forced periodic changes. Forced changes produce weaker passwords without improving security.'),
            ('Is it safe to save passwords in my browser?',
             'Yes, for most people. Major browsers encrypt the password store and tie access to the device login.'),
        ],
    },
    {
        'path': 'cards/compoundinterest.html',
        'slug': 'compound-interest',
        'title': 'Compound Interest Calculator',
        'description': 'Calculate future value, growth projections, and compare investment scenarios. Visualise the curve.',
        'application_category': 'FinanceApplication',
        'application_sub_category': 'Compound Interest Calculator',
        'howto_steps': [
            {'name': 'Enter the starting amount', 'text': 'Type the initial principal — the amount you are starting with today.'},
            {'name': 'Enter the annual interest rate', 'text': 'Type the annual rate as a percentage. For savings accounts, use the APY. For investments, use the expected annual return after inflation.'},
            {'name': 'Enter the number of years', 'text': 'How long the money will grow. The longer, the more the curve shows.'},
            {'name': 'Add a monthly contribution (optional)', 'text': 'For most realistic scenarios, the monthly contribution matters more than the rate. The "magic" of compound growth comes from the base growing, not from a single lump sum.'},
            {'name': 'Read the future value and the chart', 'text': 'The chart shows the curve. The future-value number is where you end up. The difference between the contributions and the final value is the interest earned.'},
        ],
        'faqs': [
            ('What is the compound interest formula?',
             'A = P(1 + r/n)^(nt), where P is principal, r is annual rate, n is compounding periods per year, t is years. For monthly compounding n = 12.'),
            ('What is the rule of 72?',
             'Money doubles in approximately 72 ÷ annual rate (as a percent) years. At 6% the doubling time is 12 years; at 8% it is 9 years.'),
            ('Why does compound interest matter more for early savers?',
             'Earlier starts give the base more years to grow. A 25-year-old saving for 10 years and stopping usually beats a 35-year-old saving for 30 years.'),
        ],
    },
    {
        'path': 'cards/invoice-billing-pdf-generator.html',
        'slug': 'invoice',
        'title': 'Invoice Generator',
        'description': 'Generate clean, client-ready invoices with zero watermarks. Multi-currency, multi-line, tax-ready.',
        'application_category': 'BusinessApplication',
        'application_sub_category': 'Invoice Generator',
        'howto_steps': [
            {'name': 'Enter your business details', 'text': 'Your name or company name, address, VAT/GST number if applicable.'},
            {'name': 'Enter the client details', 'text': 'Who is being invoiced. Their name, address, and any reference number they need on the invoice.'},
            {'name': 'Add line items', 'text': 'Each line has a description, quantity, unit price, and optional tax rate. The calculator sums them automatically.'},
            {'name': 'Set the invoice date, due date, and currency', 'text': 'Pick the currency first — it sets the symbol throughout. The due date is usually 14, 30, or 60 days after the invoice date.'},
            {'name': 'Download or print', 'text': 'Use the browser\'s print-to-PDF for a copy. The page is styled for print by default.'},
        ],
        'faqs': [
            ('What should an invoice include?',
             'Date, invoice number, your details, client details, line items (description, quantity, unit price), subtotal, tax (if applicable), total, payment terms, and how to pay.'),
            ('When should invoices be sent?',
             'The same day the work is delivered. The faster you invoice, the faster you get paid. Average debtor days drop from 21 to 11 when you invoice on completion instead of monthly.'),
            ('How do I handle VAT/GST?',
             'Add a tax rate to each line item, or set a single tax rate for the whole invoice. The generator shows the subtotal, the tax amount, and the total separately.'),
        ],
    },
    {
        'path': 'cards/audio-bpm-tapper.html',
        'slug': 'bpm-tap',
        'title': 'BPM Tapper',
        'description': 'Tap to the rhythm of any track or beat. Calculates exact BPM, musical delay times, and exports the tempo.',
        'application_category': 'MusicApplication',
        'application_sub_category': 'BPM Tapper',
        'howto_steps': [
            {'name': 'Click Start', 'text': 'Begin the metronome. The first tap sets the start point.'},
            {'name': 'Tap along with the music', 'text': 'Tap the large button (or press the spacebar) on each beat. The calculator averages the intervals over time and reports the BPM.'},
            {'name': 'Read the BPM', 'text': 'After 8–16 taps the BPM is reliable. Continue tapping to refine. The number updates live.'},
            {'name': 'Use the tempo in your DAW or set list', 'text': 'Copy the BPM and use it to set the project tempo in your DAW, or to mark the track in a DJ set.'},
        ],
        'faqs': [
            ('What is a normal BPM?',
             'For pop and rock, 100–130 BPM. For dance music, 120–130 BPM. For hip-hop, 80–100 BPM. For ballads, 60–80 BPM. 120 is the all-purpose default.'),
            ('How do I tap more accurately?',
             'Tap 8–16 times on the strong beats of the bar (the kick or snare). Avoid the off-beats. The more consistent your taps, the more accurate the BPM.'),
            ('What if the song changes tempo?',
             'Tap the first 8 beats to get the initial BPM, then tap again from the section change. The calculator shows the running average.'),
        ],
    },
    {
        'path': 'cards/json-beautifier-validator.html',
        'slug': 'json',
        'title': 'JSON Beautifier & Validator',
        'description': 'Format, minify, validate, and debug JSON payloads with exact syntax error line text. Runs in your browser.',
        'application_category': 'DeveloperApplication',
        'application_sub_category': 'JSON Beautifier',
        'howto_steps': [
            {'name': 'Paste your JSON', 'text': 'Paste a JSON payload into the input box. The validator runs as you type.'},
            {'name': 'Read the validation result', 'text': 'Valid JSON is shown in the right panel, indented for readability. Invalid JSON shows the line and column of the first error.'},
            {'name': 'Format, minify, or sort', 'text': 'Use the toolbar to format with 2 or 4 spaces, minify (remove whitespace), or sort keys alphabetically.'},
            {'name': 'Copy the result', 'text': 'Click the copy button to put the formatted JSON on your clipboard.'},
        ],
        'faqs': [
            ('What is the difference between JSON and JavaScript?',
             'JSON is a subset of JavaScript object syntax. A valid JSON document is also a valid JavaScript expression. The reverse is not true: JavaScript allows trailing commas, single quotes, comments, and unquoted keys, all of which are invalid JSON.'),
            ('Why do APIs use JSON?',
             'JSON is text, so it travels over any network. It is small (less verbose than XML). It is unambiguous to parse. Almost every programming language has a JSON parser in its standard library.'),
            ('Is it safe to paste JSON into a random web tool?',
             'Not always. The JSON tools on this site run entirely in your browser — no network requests are made — so it is safe to paste sensitive payloads.'),
        ],
    },
    {
        'path': 'cards/color-contrast-wcag-simulator.html',
        'slug': 'color-contrast',
        'title': 'WCAG Contrast Checker',
        'description': 'Test color contrast ratios against WCAG 2.2 accessibility standards (AA / AAA) and preview with vision-impairment simulations.',
        'application_category': 'UtilitiesApplication',
        'application_sub_category': 'Contrast Checker',
        'howto_steps': [
            {'name': 'Pick a foreground colour', 'text': 'Type a hex value, RGB, or HSL, or use the colour picker. This is the colour of the text or icon.'},
            {'name': 'Pick a background colour', 'text': 'Same options. This is the colour behind the text or icon.'},
            {'name': 'Read the contrast ratio and the WCAG pass/fail', 'text': 'The ratio is a number from 1:1 to 21:1. WCAG AA requires 4.5:1 for body text and 3:1 for large text. AAA requires 7:1 / 4.5:1.'},
            {'name': 'Preview with vision-impairment simulations', 'text': 'Toggle the simulations to see how the colour pair looks for users with protanopia, deuteranopia, tritanopia, and cataracts.'},
        ],
        'faqs': [
            ('What is WCAG contrast?',
             'A measure of the difference in luminance between two colours, expressed as a ratio. 4.5:1 is the minimum for AA body text, 7:1 for AAA. Higher is more readable.'),
            ('How do I get 4.5:1?',
             'Either darken the text or lighten the background. The exact combination depends on the brand colours. The contrast checker on this site will tell you in one click.'),
            ('Is WCAG AA legally required?',
             'In the UK (Equality Act 2010), the US (ADA, Section 508), and the EU (Web Accessibility Directive) public-sector websites must meet WCAG AA. Private-sector requirements vary by country and sector.'),
        ],
    },
    {
        'path': 'cards/regex-tester-explainer.html',
        'slug': 'regex',
        'title': 'Regex Tester & Explainer',
        'description': 'Test, debug, and understand regular expressions in real-time. Live match highlighting and plain-English explanation of every group.',
        'application_category': 'DeveloperApplication',
        'application_sub_category': 'Regex Tester',
        'howto_steps': [
            {'name': 'Type or paste a regex', 'text': 'Use the pattern field. The tester shows matches in the test-string panel as you type.'},
            {'name': 'Set the flags', 'text': 'g (global), i (case-insensitive), m (multiline), s (dot-all). Toggle them in the flags row.'},
            {'name': 'Paste the text to test against', 'text': 'Use the test-string panel. Matches are highlighted; groups are labelled.'},
            {'name': 'Read the explanation', 'text': 'The explainer shows what every part of the regex does, in plain English. Use it to learn a regex you found in someone else\'s code, or to debug your own.'},
        ],
        'faqs': [
            ('What is a regex?',
             'A regular expression is a pattern that matches text. The pattern is written in a small, dense language. Regexes are built into nearly every programming language.'),
            ('When should I not use a regex?',
             'When you are parsing HTML or XML (use a real parser), parsing JSON (use a JSON parser), or doing anything where the input is structured enough that a grammar-based tool is a better fit.'),
            ('How do I match an email address?',
             'You don\'t, in production. A correct email regex is hundreds of characters long and still does not cover the full RFC. Use the regex to check the *shape*, then send a confirmation email.'),
        ],
    },
    {
        'path': 'cards/cooking-unit-converter.html',
        'slug': 'unit-converter',
        'title': 'Cooking Unit Converter',
        'description': 'Convert cooking units with food-specific densities. Cups to grams, tablespoons to millilitres, ounces to grams, with the right conversion for each ingredient.',
        'application_category': 'UtilitiesApplication',
        'application_sub_category': 'Cooking Unit Converter',
        'howto_steps': [
            {'name': 'Pick the ingredient', 'text': 'Type the ingredient (flour, sugar, butter, honey, water) or pick from the dropdown. Different ingredients have different densities; 1 cup of flour is not the same weight as 1 cup of honey.'},
            {'name': 'Pick the from-unit and to-unit', 'text': 'Cups, tablespoons, teaspoons, fluid ounces, millilitres, litres, grams, kilograms, ounces, pounds.'},
            {'name': 'Type the amount', 'text': 'The calculator converts and shows the equivalent in the to-unit, with the food-specific density used.'},
        ],
        'faqs': [
            ('How many grams in a cup of flour?',
             'About 120 g for all-purpose flour, 130 g for bread flour, 140 g for cake flour. The exact number depends on how you scoop; spoon-and-level is the standard.'),
            ('How many millilitres in a tablespoon?', '15 ml in the US, 20 ml in Australia. The UK tablespoon is now 15 ml, but older UK recipes use 20 ml. Pick the right standard for your recipe.'),
            ('How many grams in an ounce?', '28.35 g (avoirdupois ounce, the kitchen standard). The troy ounce is 31.10 g and is used for precious metals, not cooking.'),
        ],
    },
]


def software_application(schema):
    return {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        'name': schema['title'],
        'description': schema['description'],
        'url': f'https://www.themostusefulsiteintheworld.com/tool.html?card={schema["slug"]}',
        'applicationCategory': schema['application_category'],
        'applicationSubCategory': schema['application_sub_category'],
        'operatingSystem': 'Any (browser-based)',
        'browserRequirements': 'Requires JavaScript. Runs in any modern browser.',
        'offers': {
            '@type': 'Offer',
            'price': '0',
            'priceCurrency': 'GBP',
        },
        'isAccessibleForFree': True,
        'creator': {
            '@type': 'Person',
            'name': 'Russell Head',
            'url': 'https://www.themostusefulsiteintheworld.com/about.html',
        },
        'publisher': {
            '@type': 'Organization',
            'name': 'The Most Useful Site in the World',
            'url': 'https://www.themostusefulsiteintheworld.com/',
        },
    }


def howto_jsonld(schema):
    return {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        'name': f'How to use the {schema["title"]}',
        'description': f'A step-by-step guide to using the {schema["title"]} on The Most Useful Site in the World.',
        'step': [
            {
                '@type': 'HowToStep',
                'position': i + 1,
                'name': s['name'],
                'text': s['text'],
            }
            for i, s in enumerate(schema['howto_steps'])
        ],
    }


def faq_jsonld(schema):
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'mainEntity': [
            {
                '@type': 'Question',
                'name': q,
                'acceptedAnswer': {'@type': 'Answer', 'text': a},
            }
            for q, a in schema['faqs']
        ],
    }


for schema in TOOL_SCHEMAS:
    path = os.path.join(ROOT, schema['path'])
    if not os.path.exists(path):
        print(f'MISSING: {path}')
        continue
    html = open(path).read()
    # build the JSON-LD blocks
    sa = json.dumps(software_application(schema), separators=(',', ':'))
    ht = json.dumps(howto_jsonld(schema), separators=(',', ':'))
    fq = json.dumps(faq_jsonld(schema), separators=(',', ':'))
    new_block = f'\n<script type="application/ld+json">{sa}</script>\n<script type="application/ld+json">{ht}</script>\n<script type="application/ld+json">{fq}</script>\n'
    # only inject if not already there
    needle = '"name": "' + schema['title'] + '"'
    if needle in html and 'HowToStep' in html and 'FAQPage' in html and schema['title'] in html:
        print(f'ALREADY DONE: {schema["path"]}')
        continue
    # inject: if <head> exists, before </head>; else prepend to the file
    if '</head>' in html:
        html = html.replace('</head>', new_block + '</head>', 1)
    else:
        # prepend to the very top of the file
        html = new_block + html
    open(path, 'w').write(html)
    print(f'WROTE: {schema["path"]}')

print('Done.')
