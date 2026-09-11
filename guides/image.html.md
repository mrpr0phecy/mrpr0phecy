# Image file formats explained — when to use PNG, JPEG, WebP, AVIF, or SVG

> Machine-readable Markdown version of https://www.themostusefulsiteintheworld.com/guides/image.html (llms.txt v2). Canonical page: https://www.themostusefulsiteintheworld.com/guides/image.html
### ⚡ TL;DR

The wrong format bloats your page or makes the picture look like a 1998 webcam. The modern defaults.

## JPEG — photographs

JPEG is a lossy format designed for photographs. It compresses by averaging nearby pixels, which works well for natural scenes (where no two adjacent pixels are the same) and badly for sharp edges (where the averaging shows up as artefacts). Use JPEG for: photographs, complex gradients, anything with millions of colours. Do not use JPEG for: screenshots, line art, anything with text — the edges will look fuzzy.

## PNG — screenshots and line art

PNG is a lossless format that supports transparency. It is the right choice for screenshots, icons, logos, and any image where the edges matter. The file size is larger than JPEG for photographs, but the lack of artefacts at sharp edges is worth it. Use PNG for: screenshots, logos, anything with text. The free image-to-Base64 tool on this site will encode a PNG to a data URL for inline embedding.

## WebP — the modern default for the web

WebP is a newer format from Google that produces smaller files than JPEG or PNG at equivalent visual quality. It supports both lossy and lossless compression, plus transparency and animation. Browser support is now universal (all major browsers since 2020). Use WebP as the default for any raster image on a web page. The free image-to-Base64 tool on this site can encode WebP too.

## AVIF — the next step

AVIF is the newest format, based on the AV1 video codec. It produces even smaller files than WebP at equivalent quality and supports the same features. Browser support is good (all major browsers since 2022) but not quite universal. Use AVIF when you can, with WebP as the fallback. The `<picture>` element lets you serve both: AVIF first, WebP for browsers that don't support AVIF yet.

## SVG — vector graphics

SVG is a text format (XML) for vector graphics — shapes defined by coordinates, not pixels. SVGs are infinitely scalable, look sharp on any display, and are usually smaller than raster equivalents for line art, icons, and simple illustrations. Use SVG for: logos, icons, illustrations, charts, anything that could be drawn in Illustrator. The free SVG-to-PNG converter on this site can rasterise an SVG at any size if you need a fallback.

## The modern default

For photographs: JPEG (or WebP if you control the markup, or AVIF for the best compression). For screenshots, logos, and line art: PNG (or WebP). For icons and illustrations: SVG. For everything on a web page: WebP or AVIF with a `<picture>` element and a fallback. If in doubt, the free image-to-Base64 tool on this site will let you preview any format before you commit.

## 🛠️ What this site gives you for Interactive Art & Living Worlds

Free, browser-side tools related to this topic. No sign-ups, no display ads.[🎨🎨 PixelVerse CanvasAn evolving communal pixel art tapestry. Paint with friends over time, record generational brushstrokes, watch the creation time-l](https://www.themostusefulsiteintheworld.com/tool.html?card=pixel-collaborative-infinite-mural)[🌊🌊 EchoPond CymaticsA communal fluid-dynamics sanctuary. Cast water drops into a resonant pond. Wave ripples interfere via the physical wave equation,](https://www.themostusefulsiteintheworld.com/tool.html?card=echo-pond-water-cymatics-soundscape)[🪐🪐 HarmonicOrbit LoomAn evolving celestial music box. Launch orbiting planets into gravitational fields. As orbital bodies cross harmonic resonance spo](https://www.themostusefulsiteintheworld.com/tool.html?card=harmonic-orbit-gravitational-soundscape)[⏳⏳ Sandpile MandalaAn emergent self-organized criticality simulator. Drop grains of sand into an abelian lattice. When cells exceed four grains, they](https://www.themostusefulsiteintheworld.com/tool.html?card=sandpile-fractal-mandala-zen)

## ❓ Frequently asked questions

****Is PNG lossless?****

Yes. PNG compresses without losing any pixel data. JPEG is lossy — every save discards some information. WebP and AVIF can be either.

****What is the smallest image format?****

AVIF, at equivalent quality. WebP is second. JPEG and PNG are larger for the same quality.

****Should I use SVG for photographs?****

No. SVG is for vector graphics. Photographs have millions of colour values per pixel; expressing that in SVG (as a series of paths) produces huge files. Use JPEG/WebP/AVIF for photographs.

****Can I use WebP everywhere?****

Yes, on a web page. All major browsers have supported WebP since 2020. For email or print, stick with PNG/JPEG.

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
