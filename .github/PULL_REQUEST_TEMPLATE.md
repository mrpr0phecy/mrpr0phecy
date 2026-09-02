<!--
Thanks for the PR! A few quick checks before review:
- [ ] `bash scripts/verify.sh` is green (run it before pushing)
- [ ] If you added a tool, `node generate-cards-json.js` ran
- [ ] If you added/changed top-level pages, `sitemap.xml` is regenerated
- [ ] No placeholders (grep for `dQw4w9WgXcQ|VIDEO_ID|PLAYLIST_ID|YOUR_`)
- [ ] No `target="_blank"` without `rel="noopener noreferrer"`
- [ ] New element IDs use a per-tool prefix (one shared DOM)
- [ ] No secrets, no tokens, no agent-auth output
-->

## What this PR does

<!-- One or two sentences. If the change is large, link to a long-form note in AGENTS.md instead of pasting the full story here. -->

## Why

<!-- What's the user-visible problem, the gap, or the constraint? -->

## Type of change

<!-- Check all that apply. -->

- [ ] New tool
- [ ] Tool fix / improvement
- [ ] New top-level page (popular / new / use-case / help / about / press / embed / changelog / sitemap / blog / ...)
- [ ] SEO / structured-data / sitemap / RSS / llms.txt / robots.txt
- [ ] Music page (translated cluster — I edited **all** of them)
- [ ] Cross-link / footer / nav / discovery pills
- [ ] Bug fix (please describe the bug in "What this PR does")
- [ ] Build / verify-script / CI / workflow
- [ ] Documentation only (README / AGENTS / CONTRIBUTING / INCOME / ARCHITECTURE)

## Touches the tool count?

- [ ] No
- [ ] Yes — and I updated the hero badge in `index.html`, the footer
      discover pills, `README.md`, `AGENTS.md`, `INCOME.md`, and any
      JSON-LD on the top-level discovery pages.

## Touches Product B (music)?

- [ ] No
- [ ] Yes — and I edited the full hreflang cluster of 13 pages
      (or it's a single-language change that doesn't change the cluster).

## Touches anything in the no-fly list?

<!-- CNAME, sw.js, guide.txt, system/, substitutions/, digitaldetoxcardshtml/, the CV files, opensourcenews.html, token.html. -->

- [ ] No
- [ ] Yes — I checked with the owner first, or the change is a doc-only
      reference to one of these files.

## Agent session handoff (if applicable)

<!-- If you are an AI agent appending to AGENTS.md, paste the handoff prose here so the reviewer can spot-check it. -->

## Verify run (paste the last 10 lines of `bash scripts/verify.sh`)

```
<!-- paste here -->
```

## Live deploy check (30–60 s after merge)

<!-- `curl -sI https://www.themostusefulsiteintheworld.com/<your-page>.html` and the result. -->
