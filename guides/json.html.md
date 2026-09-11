# JSON for people who hate JSON — a practical guide for non-engineers

> Machine-readable Markdown version of https://www.themostusefulsiteintheworld.com/guides/json.html (llms.txt v2). Canonical page: https://www.themostusefulsiteintheworld.com/guides/json.html
### ⚡ TL;DR

What JSON is, how to read it, how to spot the errors, and the tools that will format and validate it for you.

## What JSON is

JSON is text, organised as a tree of name/value pairs. The whole thing lives inside curly braces. Each pair is a string in double quotes, a colon, and a value. Values can be strings, numbers, booleans, null, arrays (in square brackets), or other objects. That is the entire specification. It is intentionally tiny.

## How to read a JSON file

Start at the top. The whole thing is one object. Read the field names left-to-right. When you hit a value that is itself an object or array, you are recursing — open a new mental "scope", read the contents, close it. Pretty-printing (adding indentation and newlines) makes the structure obvious; this site's JSON formatter does it in one click.

## The four errors you will hit

1) Trailing comma (a comma after the last item in an object or array) — invalid in JSON, even though it is valid in JavaScript. 2) Single quotes instead of double quotes — JSON requires double quotes for strings. 3) Unquoted keys — keys must be in double quotes, even if they look like numbers. 4) Comments — JSON does not support comments. If you want comments, you want JSON5 or YAML, not JSON.

## JSON vs YAML vs TOML

YAML is JSON's indentation-based cousin, popular for config files (Kubernetes, GitHub Actions, Ansible). TOML is the newer alternative, designed to be unambiguous and easy to parse (Rust's Cargo, Python's pyproject.toml). JSON is the most portable, the most widely supported, and the one most APIs use. If you control the format, pick the one your tooling supports; if you are sending data over the wire, JSON is the default.

## What this site gives you

A JSON beautifier and validator that highlights errors inline. A JSON/YAML studio for converting between formats. A diff tool for comparing two JSON structures. All three run in your browser, none of them upload your data anywhere.

## 🛠️ What this site gives you for Writing & Language

Free, browser-side tools related to this topic. No sign-ups, no display ads.[📚📚 Citation GeneratorGenerate perfectly formatted citations in APA, MLA, or Chicago style. Supports multiple authors, websites, and academic sources.](https://www.themostusefulsiteintheworld.com/tool.html?card=citation)[🧭🧭 Argument MapperStructure an essay or debate case before you write it. Lay out your thesis, the premises supporting it and the strongest objection](https://www.themostusefulsiteintheworld.com/tool.html?card=essay)[🇫🇷🇫🇷 French Verbs & PronunciationMaster the most critical French irregular verbs (être, avoir, aller, faire) and unlock fluent French pronunciation with our guide ](https://www.themostusefulsiteintheworld.com/tool.html?card=french-pronunciation-verbs)[🇩🇪🇩🇪 German Cases & GenderConquer the 4 German grammatical cases (Nominativ, Akkusativ, Dativ, Genitiv) and understand exactly how der, die, das shift based](https://www.themostusefulsiteintheworld.com/tool.html?card=german-cases-gender)[✍️✍️ Proofreading & Style CheckerAdvanced text analysis for grammar, style, readability, and clarity. Get detailed suggestions with explanations.](https://www.themostusefulsiteintheworld.com/tool.html?card=proofreading)[📖📖 JLPT Vocabulary StudioSupercharge your Japanese vocabulary for the JLPT N5 and N4 examinations. Includes native audio pronunciation, Furigana reading to](https://www.themostusefulsiteintheworld.com/tool.html?card=japanese-jlpt-vocabulary)

## ❓ Frequently asked questions

****Is JSON a programming language?****

No. JSON is a data format, like XML or CSV. It is written in plain text and is meant to be generated and parsed by code, not written by hand (though it is possible to write small JSON files by hand).

****What is the difference between JSON and JavaScript?****

JSON is a subset of JavaScript object syntax. A valid JSON document is also a valid JavaScript expression. The reverse is not true: JavaScript allows trailing commas, single quotes, comments, and unquoted keys, all of which are invalid JSON.

****Why do APIs use JSON?****

JSON is text, so it travels over any network. It is small (less verbose than XML). It is unambiguous to parse. Almost every programming language has a JSON parser in its standard library. It maps directly to the data structures most apps use.

****Is JSON safe to paste into a random web tool?****

Not always. Online JSON formatters can log or leak your data. The JSON tools on this site run entirely in your browser — no network requests are made — so it is safe to paste sensitive payloads.

### 📚 More definitive guides

- [How mortgages really work](https://www.themostusefulsiteintheworld.com/guides/mortgage.html)
- [What BMI actually measures](https://www.themostusefulsiteintheworld.com/guides/bmi.html)
- [Why compound growth is magic](https://www.themostusefulsiteintheworld.com/guides/compound-interest.html)
- [How to choose a strong password](https://www.themostusefulsiteintheworld.com/guides/passwords.html)
- [JSON for people who hate JSON](https://www.themostusefulsiteintheworld.com/guides/json.html)
- [Regular expressions without the pain](https://www.themostusefulsiteintheworld.com/guides/regex.html)
- [How to pick a colour palette](https://www.themostusefulsiteintheworld.com/guides/color.html)
- [Image file formats explained](https://www.themostusefulsiteintheworld.com/guides/image.html)
- [BPM, tempo, and time signature](https://www.themostusefulsiteintheworld.com/guides/music.html)
- [How to read a star chart](https://www.themostusefulsiteintheworld.com/guides/astronomy.html)
- [Cover letters, resumes, emails](https://www.themostusefulsiteintheworld.com/guides/writing.html)
- [Breathe, ground, calm down](https://www.themostusefulsiteintheworld.com/guides/wellbeing.html)

Open the catalogue[🔲 Browse all 1119 tools](https://www.themostusefulsiteintheworld.com/index.html)[📚 Full index](https://www.themostusefulsiteintheworld.com/tools.html)[🎯 By use case](https://www.themostusefulsiteintheworld.com/use-case.html)[⭐ Most popular](https://www.themostusefulsiteintheworld.com/popular.html)[🆕 Just added](https://www.themostusefulsiteintheworld.com/new.html)[🔌 Embed any tool](https://www.themostusefulsiteintheworld.com/embed.html)[☕ Donate](https://www.themostusefulsiteintheworld.com/donate.html)
