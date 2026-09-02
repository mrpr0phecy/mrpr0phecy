/* analytics.js — Google Analytics 4 for the whole site.
 *
 * ONE file, loaded by every top-level page:
 *   <script defer src="/analytics.js"></script>
 *
 * Why a shared file and not 44 inline snippets: the measurement ID, the
 * config and any future event wiring live in exactly one place. Changing
 * the property, adding a consent mode, or removing analytics entirely is a
 * one-file edit instead of a 44-file sweep.
 *
 * IMPORTANT (see LEGAL.md): GA sets non-essential third-party storage.
 * Because it loads unconditionally, no page on this site may claim
 * "no tracking", "no cookies", "no analytics" or "100% private".
 * The tools still process input locally — that claim is fine and true.
 */
(function () {
  'use strict';

  var GA_ID = 'G-G058FVW6Z2';

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('js', new Date());
  // Data minimisation: IP anonymisation on, no ad personalisation signals.
  // Keeps measurement useful without feeding advertising profiles.
  gtag('config', GA_ID, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
})();
