# vendor/

Third-party libraries committed into the repo rather than loaded from a CDN.

| File | Library | Version | Licence | Why it is here |
|---|---|---|---|---|
| `qrcode.js` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase | 2.0.4 | MIT | `cards/wifi-qr-generator.html` encodes **Wi-Fi passwords**. It previously built the QR by putting the password in a URL and sending it to a third-party image API while the page claimed "100% private". Generating locally is the only way that claim can be true, and a hand-rolled encoder could not be verified to spec — so a proven library is vendored instead of fetched, because a CDN request would leak the referrer and reintroduce a third party. |

Vendored copies are unmodified. Their licences are their own and are **not**
covered by this repo's MIT `LICENSE` — see `LICENSE` for the carve-out.

Verified on vendoring: encode/decode round-trip against the independent `jsQR`
decoder (the algorithm phone cameras use) across QR versions 3-6, including
UTF-8 SSIDs and passwords, open networks and 40-character credentials.
