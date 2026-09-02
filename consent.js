/* consent.js — single consent gate for every third-party script on this site.
 *
 * Why this exists (see LEGAL.md):
 *   UK PECR reg. 6 / UK GDPR require prior, informed, freely-given consent
 *   before non-essential cookies or storage are set. Google Analytics and
 *   Tawk.to both set non-essential storage, so neither may load until the
 *   visitor has said yes. This file is the ONLY place either is allowed to
 *   be loaded from — never paste an inline gtag or Tawk snippet into a page.
 *
 * Usage — one line in <head>, before </head>:
 *   <script defer src="/consent.js" data-analytics></script>          (GA only)
 *   <script defer src="/consent.js" data-analytics data-chat></script> (GA + live chat)
 *
 * Behaviour:
 *   - No third-party request of any kind is made before an explicit "Accept".
 *   - The choice is stored in localStorage under "tmusitw-consent"
 *     (v1 = accepted, "declined" = refused). No cookie is set by this file.
 *   - Declining is one click, as easy as accepting (UK ICO requirement).
 *   - Any element with [data-consent-manage] re-opens the banner, so
 *     "Cookie settings" links in footers work sitewide.
 */
(function () {
  'use strict';

  var GA_ID   = 'G-G058FVW6Z2';
  var TAWK_ID = '65c5157c8d261e1b5f5df1f5/1hma3rink';
  var KEY     = 'tmusitw-consent';
  var VALUE   = 'v1';

  var self = document.currentScript ||
             document.querySelector('script[src*="consent.js"]');
  var wantAnalytics = !!(self && self.hasAttribute('data-analytics'));
  var wantChat      = !!(self && self.hasAttribute('data-chat'));

  function read() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function write(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ }
  }

  function loadAnalytics() {
    if (!wantAnalytics || window.__tmusitwGA) return;
    window.__tmusitwGA = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    // IP anonymisation + no ad personalisation: data minimisation by default.
    window.gtag('config', GA_ID, { anonymize_ip: true, allow_google_signals: false });
  }

  function loadChat() {
    if (!wantChat || window.__tmusitwChat) return;
    window.__tmusitwChat = true;
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();
    var s = document.createElement('script');
    s.async = true;
    s.charset = 'UTF-8';
    s.setAttribute('crossorigin', '*');
    s.src = 'https://embed.tawk.to/' + TAWK_ID;
    document.head.appendChild(s);
  }

  function accept() { write(VALUE); loadAnalytics(); loadChat(); }

  // gtag() must exist before consent so inline onclick handlers never throw.
  if (typeof window.gtag !== 'function') {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
  }

  function banner() {
    if (document.getElementById('tmusitw-consent')) return;
    var host = document.createElement('div');
    host.id = 'tmusitw-consent';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-label', 'Cookie choice');
    host.style.cssText = [
      'position:fixed', 'left:12px', 'right:12px', 'bottom:12px', 'z-index:2147483000',
      'max-width:760px', 'margin:0 auto', 'padding:14px 16px', 'border-radius:12px',
      'background:#0d1218', 'color:#e6faff', 'border:1px solid rgba(45,212,255,.35)',
      'box-shadow:0 12px 40px rgba(0,0,0,.55)', 'display:flex', 'gap:12px',
      'align-items:center', 'flex-wrap:wrap', 'justify-content:space-between',
      'font:400 14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif'
    ].join(';');

    var text = document.createElement('p');
    text.style.cssText = 'margin:0;flex:1 1 320px;color:rgba(230,250,255,.85)';
    text.innerHTML = 'This page can load Google Analytics' +
      (wantChat ? ' and a live-chat widget' : '') +
      ', which use third-party storage. Nothing loads unless you agree. ' +
      '<a href="/legal.html#cookies" style="color:#2dd4ff">What this means</a>.';

    function button(label, primary, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'cursor:pointer;font:700 14px/1 system-ui,sans-serif;' +
        'padding:10px 16px;border-radius:100px;' +
        (primary ? 'background:#2dd4ff;color:#04141c;border:0'
                 : 'background:transparent;color:#e6faff;border:1px solid rgba(230,250,255,.35)');
      b.addEventListener('click', fn);
      return b;
    }

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    row.appendChild(button('Decline', false, function () {
      write('declined'); host.remove();
    }));
    row.appendChild(button('Accept', true, function () {
      accept(); host.remove();
    }));

    host.appendChild(text);
    host.appendChild(row);
    document.body.appendChild(host);
  }

  function start() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-consent-manage]');
      if (!t) return;
      e.preventDefault();
      try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
      banner();
    });

    if (!wantAnalytics && !wantChat) return;
    var state = read();
    if (state === VALUE) { accept(); return; }
    if (state === 'declined') return;
    banner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
