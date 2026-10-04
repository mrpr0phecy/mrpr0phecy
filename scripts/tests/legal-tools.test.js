#!/usr/bin/env node
'use strict';
// Run: node scripts/tests/legal-tools.test.js (jsdom installed in /tmp/tenv).
//
// The five legal cards added 2026-10-04 are read by solicitors, barristers and
// paralegals who will diarise the dates they print and quote the fees and
// limits they show. `scripts/test-card.js` proves they mount and do not throw;
// it cannot prove that CPR 6.26 deems a document posted on Friday 2 October
// 2026 served on Monday 5 October, or that 14.5 weeks at the £751 cap is
// £10,889.50. So the rules are driven here, in jsdom, through the real DOM:
// set the inputs, read the rendered output, compare against vectors worked out
// from the sources named in each card.
//
// Vectors, and where each one comes from:
//   limitation  Limitation Act 1980: s.5 six years from accrual, s.8 twelve for
//               a deed, s.11(4) PI runs from the later of injury and knowledge,
//               s.14B three years from knowledge with a 15-year longstop,
//               s.24 six years for a judgment. ERA 1996 s.111(2) is "three
//               months beginning with the EDT" -> 29 December for a 30 September
//               dismissal; the Employment Rights Act 2025 (s.152, Sch.12) makes
//               it six months less a day for relevant dates on or after
//               1 October 2026 -> 31 March 2027. s.207B(3): the conciliation
//               window is not counted; s.207B(4): if the extended limit still
//               lands within a month of Day B it moves to one month after Day B.
//               EqA 2010 s.129(3) is six months from the last day of employment.
//   CPR         CPR 6.14 second business day after the step; CPR 6.26 second
//               calendar day for post/DX (rolled forward if not a business day)
//               and same day for delivery/email/fax/personal before 4.30pm;
//               CPR 7.5 four months to serve in the UK, six out of the
//               jurisdiction; CPR 2.8 clear days put the AoS at 14 days and the
//               defence at 14/28 days after service (CPR 10.3, 15.4).
//   fees        EX50 as republished for the 13 July 2026 uplift: issue fees
//               £35/£50/£70/£80/£115/£205/£455 then 5% to £200,000 then
//               £10,000; hearing fees £27/£59/£85/£123/£181/£346, £619 fast
//               track, £1,334 intermediate and multi-track; applications £321
//               and £126; detailed assessment £398 up to £15,000 and £801 to
//               £50,000; probate £526 over £5,000, £2 a sealed copy then, £22
//               for a second application.
//   awards      Employment Rights (Increase of Limits) Order 2026 (SI 2026/310):
//               week's pay £751, compensatory maximum £123,543, minimum basic
//               award £9,157; ERA 1996 s.119 age bands 1.5/1/0.5 weeks and the
//               20-year cap; the Ninth Addendum to the Presidential Guidance
//               gives the Vento bands from 6 April 2026.
//   IHT         IHTA 1984: nil-rate band £325,000, residence nil-rate band
//               £175,000 tapered by £1 for every £2 over £2,000,000, 40%, or
//               36% where at least 10% of the baseline goes to charity, APR/BPR
//               100% relief capped at £2.5 million from 6 April 2026 (Finance
//               Act 2026 s.65 and Sch.12) with 50% above, unquoted shares at
//               50%, and the seven-year gift taper (20/40/60/80%).
//
// jsdom is deliberately not a repository dependency (the site is zero-dep), so
// it lives outside the workspace. Without it this suite SKIPs loudly and exits
// 0:   mkdir -p /tmp/tenv && cd /tmp/tenv && npm i jsdom
let JSDOM;
try { ({ JSDOM } = require('/tmp/tenv/node_modules/jsdom')); } catch (_) {
  try { ({ JSDOM } = require('jsdom')); } catch (e) {
    console.log('SKIP legal-tools: jsdom not installed (mkdir -p /tmp/tenv && cd /tmp/tenv && npm i jsdom)');
    process.exit(0);
  }
}
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const CARDS = path.join(__dirname, '..', '..', 'cards');

function mount(slug) {
  const dom = new JSDOM(fs.readFileSync(path.join(CARDS, slug + '.html'), 'utf8'), {
    runScripts: 'dangerously', pretendToBeVisual: false
  });
  return dom.window;
}
// The cards wait for DOMContentLoaded when the fragment is parsed, so let the
// event fire before reading anything the card renders at start-up.
const tick = () => new Promise(function (resolve) { setTimeout(resolve, 0); });
function input(w, id, value) {
  const e = w.document.getElementById(id);
  assert.ok(e, 'no #' + id);
  if (e.type === 'checkbox') e.checked = !!value; else e.value = String(value);
  e.dispatchEvent(new w.Event('input', { bubbles: true }));
  e.dispatchEvent(new w.Event('change', { bubbles: true }));
}
function text(w, id) {
  const e = w.document.getElementById(id);
  assert.ok(e, 'no #' + id);
  return e.textContent.replace(/\s+/g, ' ');
}
function num(w, id) {
  const m = text(w, id).match(/-?\d[\d,]*(?:\.\d+)?/);
  assert.ok(m, 'no number in #' + id + ': ' + text(w, id).slice(0, 120));
  return parseFloat(m[0].replace(/,/g, ''));
}

(async function run() {

  /* ---- 1. Limitation and claim deadline ---------------------------------- */
  {
    const w = mount('uk-limitation-period-calculator'); await tick();
    input(w, 'lim-type', 'contract'); input(w, 'lim-date', '2026-01-15');
    assert.match(text(w, 'lim-res-date'), /15 January 2032/, 'six years from 15 January 2026 is 15 January 2032');
    assert.match(text(w, 'lim-res-date'), /Thursday/, '15 January 2032 is a Thursday');

    input(w, 'lim-date', '2020-01-01');
    assert.match(text(w, 'lim-res-date'), /1 January 2026/, 'a six-year period accruing on 1 January 2020 expires on 1 January 2026');

    input(w, 'lim-type', 'deed'); input(w, 'lim-date', '2026-01-15');
    assert.match(text(w, 'lim-res-date'), /15 January 2038/, 'a deed gets twelve years (s.8)');

    input(w, 'lim-type', 'judgment'); input(w, 'lim-date', '2026-01-15');
    assert.match(text(w, 'lim-res-date'), /15 January 2032/, 'a judgment is enforced for six years (s.24)');

    input(w, 'lim-type', 'contribution'); input(w, 'lim-date', '2026-01-15');
    assert.match(text(w, 'lim-res-date'), /15 January 2028/, 'contribution claims get two years (s.10)');

    input(w, 'lim-type', 'defamation'); input(w, 'lim-date', '2026-01-15');
    assert.match(text(w, 'lim-res-date'), /15 January 2027/, 'defamation is one year (s.4A)');

    // Personal injury: the later of injury and knowledge (s.11(4)).
    input(w, 'lim-type', 'pi'); input(w, 'lim-date', '2026-01-15'); input(w, 'lim-knowledge', '2027-03-01');
    assert.match(text(w, 'lim-res-date'), /1 March 2030/, 'PI: three years from the later date of knowledge');
    input(w, 'lim-knowledge', '2025-01-01');
    assert.match(text(w, 'lim-res-date'), /15 January 2029/, 'knowledge before the injury does not shorten the three years from the injury');

    // Latent damage: three years from knowledge, subject to the 15-year longstop.
    input(w, 'lim-type', 'latent'); input(w, 'lim-date', '2026-01-15'); input(w, 'lim-knowledge', '2035-01-01');
    assert.match(text(w, 'lim-res-date'), /1 January 2038/, 'latent damage: three years from knowledge');
    input(w, 'lim-knowledge', '2040-01-01');
    assert.match(text(w, 'lim-res-date'), /15 January 2041/, 'the 15-year longstop caps the later knowledge date');

    // Employment tribunal: three months less a day, six from 1 October 2026.
    input(w, 'lim-type', 'et-ud'); input(w, 'lim-date', '2026-09-30');
    assert.match(text(w, 'lim-res-date'), /29 December 2026/, 'EDT 30 September 2026 -> 29 December 2026 (three months less a day)');
    input(w, 'lim-date', '2026-10-01');
    assert.match(text(w, 'lim-res-date'), /31 March 2027/, 'EDT 1 October 2026 -> 31 March 2027 (six months less a day, ERA 2025)');
    assert.match(text(w, 'lim-steps'), /six months/, 'the six-month regime is explained on the card');
    input(w, 'lim-date', '2027-01-31');
    assert.match(text(w, 'lim-res-date'), /30 July 2027/, 'EDT 31 January -> the day before the corresponding date, 30 July');
    input(w, 'lim-date', '2027-11-30');
    assert.match(text(w, 'lim-res-date'), /29 May 2028/, 'EDT 30 November -> 29 May (the corresponding date exists in May, so less one day)');

    input(w, 'lim-type', 'et-red'); input(w, 'lim-date', '2027-01-31');
    assert.match(text(w, 'lim-res-date'), /30 July 2027/, 'redundancy pay was already six months');
    input(w, 'lim-type', 'et-equalpay'); input(w, 'lim-date', '2027-01-31');
    assert.match(text(w, 'lim-res-date'), /30 July 2027/, 'equal pay is six months from the last day of employment (EqA s.129(3))');
    input(w, 'lim-type', 'et-contract'); input(w, 'lim-date', '2026-10-15');
    assert.match(text(w, 'lim-res-date'), /14 April 2027/, 'ET breach of contract: six months less a day from termination on/after 1 October 2026');

    // ACAS early conciliation, s.207B.
    input(w, 'lim-type', 'et-ud'); input(w, 'lim-date', '2026-07-01');
    input(w, 'lim-acas-a', '2026-09-10'); input(w, 'lim-acas-b', '2026-09-25');
    assert.match(text(w, 'lim-res-date'), /25 October 2026/, 's.207B(4): one month after Day B when the extended limit lands inside it');
    input(w, 'lim-acas-a', '2026-06-01'); input(w, 'lim-acas-b', '2026-07-01');
    assert.match(text(w, 'lim-res-date'), /30 October 2026/, 's.207B(3): 30 paused days push 30 September to 30 October');
    input(w, 'lim-acas-a', '2026-11-01'); input(w, 'lim-acas-b', '2026-11-20');
    assert.match(text(w, 'lim-res-detail'), /expired before Day A/, 'early conciliation does not revive a claim already out of time');
    w.close();
    console.log('PASS limitation — Limitation Act 1980 periods, PI knowledge, latent longstop, ET three/six months and the s.207B conciliation rules.');
  }

  /* ---- 2. CPR service and response dates --------------------------------- */
  {
    const w = mount('cpr-service-deadline-calculator'); await tick();
    input(w, 'cpr-doc', 'claim'); input(w, 'cpr-method', 'post');
    input(w, 'cpr-date', '2026-10-02'); input(w, 'cpr-poc', 'with'); input(w, 'cpr-issue', '2026-10-01');
    assert.match(text(w, 'cpr-res-served'), /6 October 2026/, 'CPR 6.14: posted Friday 2 October 2026, deemed served Tuesday 6 October');
    assert.match(text(w, 'cpr-res-deadlines'), /20 Oct 2026/, 'the acknowledgment and 14-day defence fall 14 clear days after service');
    assert.match(text(w, 'cpr-res-deadlines'), /3 Nov 2026/, 'the defence with an acknowledgment is 28 days after service');
    assert.match(text(w, 'cpr-res-validity'), /1 Feb 2027/, 'CPR 7.5(1): four months from issue on 1 October 2026');
    assert.match(text(w, 'cpr-res-validity'), /two clear business days/, 'the card warns against posting on the last day');

    input(w, 'cpr-date', '2026-12-24');
    assert.match(text(w, 'cpr-res-served'), /30 December 2026/, 'posting on 24 December skips Christmas Day and the substitute holiday (29 and 30 December)');

    input(w, 'cpr-date', '2026-10-03');
    assert.match(text(w, 'cpr-res-served'), /6 October 2026/, 'a step taken on a Saturday is counted from the Monday');

    input(w, 'cpr-doc', 'other'); input(w, 'cpr-date', '2026-10-02');
    assert.match(text(w, 'cpr-res-served'), /5 October 2026/, 'CPR 6.26: a document posted on Friday is deemed served on the second day, Monday');
    input(w, 'cpr-method', 'email'); input(w, 'cpr-time', 'before');
    assert.match(text(w, 'cpr-res-served'), /2 October 2026/, 'email before 4.30pm on a business day is service that day');
    input(w, 'cpr-time', 'after');
    assert.match(text(w, 'cpr-res-served'), /5 October 2026/, 'email after 4.30pm is service on the next business day');
    input(w, 'cpr-method', 'personal'); input(w, 'cpr-time', 'before'); input(w, 'cpr-date', '2026-10-04');
    assert.match(text(w, 'cpr-res-served'), /5 October 2026/, 'personal service on a Sunday is deemed on the Monday');
    input(w, 'cpr-method', 'dx'); input(w, 'cpr-date', '2026-12-30');
    assert.match(text(w, 'cpr-res-served'), /4 January 2027/, 'DX left on 30 December is deemed served on the next business day after New Year');
    assert.match(text(w, 'cpr-res-deadlines'), /response period/, 'a non-claim document points to the deemed date for the response period');

    // Particulars of claim served separately.
    input(w, 'cpr-doc', 'claim'); input(w, 'cpr-method', 'post'); input(w, 'cpr-date', '2026-10-02');
    input(w, 'cpr-poc', 'follow'); input(w, 'cpr-pocdate', '2026-10-12'); input(w, 'cpr-issue', '2026-10-01');
    assert.match(text(w, 'cpr-res-deadlines'), /26 Oct 2026/, 'AoS runs 14 days from service of particulars served separately');

    // Out of the jurisdiction: CPR 6.14 does not apply.
    input(w, 'cpr-abroad', true); input(w, 'cpr-poc', 'with');
    assert.match(text(w, 'cpr-res-served'), /Not set by CPR 6.14/, 'CPR 6.14 is limited to service within the UK');
    assert.match(text(w, 'cpr-res-deadlines'), /Practice Direction 6B/, 'out-of-jurisdiction response periods come from PD 6B or the court');
    assert.match(text(w, 'cpr-res-validity'), /1 Apr 2027/, 'CPR 7.5(2): six months to serve out of the jurisdiction');
    w.close();
    console.log('PASS CPR — deemed service under 6.14 and 6.26 (post, DX, email, personal, holidays), CPR 2.8 clear days, 10.3/15.4/15.5 clocks, 7.5 validity and the out-of-jurisdiction route.');
  }

  /* ---- 3. Court, tribunal and probate fees ------------------------------- */
  {
    const w = mount('uk-court-fee-calculator'); await tick();
    input(w, 'fee-value', '12500'); input(w, 'fee-track', 'fast');
    assert.equal(num(w, 'fee-res-total'), 1244, '£12,500 issue fee is 5% (£625) plus the £619 fast-track hearing fee');
    assert.equal(num(w, 'fee-res-total'), 625 + 619, 'the parts reconcile');
    input(w, 'fee-track', 'small'); input(w, 'fee-value', '3000');
    assert.equal(num(w, 'fee-res-total'), 296, '£3,000 claim: £115 to issue plus the £181 small-claims hearing fee');
    input(w, 'fee-value', '300');
    assert.equal(num(w, 'fee-res-total'), 62, '£300: £35 to issue plus £27 for the hearing');
    input(w, 'fee-track', 'none'); input(w, 'fee-value', '10000');
    assert.equal(num(w, 'fee-res-total'), 455, '£10,000 is the top of the £455 band');
    input(w, 'fee-value', '200000');
    assert.equal(num(w, 'fee-res-total'), 10000, '5% of £200,000 is £10,000');
    input(w, 'fee-value', '250000');
    assert.equal(num(w, 'fee-res-total'), 10000, 'above £200,000 the issue fee is capped at £10,000');
    input(w, 'fee-value', '12500');
    assert.match(text(w, 'fee-res-detail'), /Money Claim Online/, 'the online-issue note is shown for claims over £10,000');

    input(w, 'fee-possession', 'possession'); input(w, 'fee-value', '0');
    assert.equal(num(w, 'fee-res-total'), 415, 'possession in the county court is £415');
    input(w, 'fee-court', 'hc');
    assert.equal(num(w, 'fee-res-total'), 559, 'possession in the High Court is £559');
    input(w, 'fee-possession', 'nonmoney');
    assert.equal(num(w, 'fee-res-total'), 663, 'a non-money claim in the High Court is £663');
    input(w, 'fee-court', 'cc');
    assert.equal(num(w, 'fee-res-total'), 387, 'a non-money claim in the county court is £387');

    input(w, 'fee-possession', 'money'); input(w, 'fee-value', '12500'); input(w, 'fee-track', 'none');
    input(w, 'fee-app', 'notice'); input(w, 'fee-assess', '15000');
    assert.equal(num(w, 'fee-res-total'), 625 + 321 + 398, 'an application on notice plus assessment of £15,000');
    input(w, 'fee-assess', '15001');
    assert.equal(num(w, 'fee-res-total'), 625 + 321 + 801, 'assessment above £15,000 moves to the £801 band');
    input(w, 'fee-assess', '500001');
    assert.equal(num(w, 'fee-res-total'), 625 + 321 + 6640, 'assessment over £500,000 is £6,640');

    input(w, 'fee-app', 'none'); input(w, 'fee-assess', '0'); input(w, 'fee-estate', '5000');
    assert.equal(num(w, 'fee-res-total'), 625, 'probate is free at £5,000');
    input(w, 'fee-estate', '5001');
    assert.equal(num(w, 'fee-res-total'), 625 + 526, 'probate costs £526 above £5,000');
    input(w, 'fee-copies', '4'); input(w, 'fee-second', 'yes');
    assert.equal(num(w, 'fee-res-total'), 625 + 526 + 8 + 22, 'sealed copies are £2 each with the application and a second application is £22');
    w.close();
    console.log('PASS court fees — EX50 issue bands, 5% scale, hearing fees by track, applications, assessment bands and probate.');
  }

  /* ---- 4. Employment tribunal awards ------------------------------------- */
  {
    const w = mount('uk-employment-tribunal-award-calculator'); await tick();
    // Defaults: born 14 March 1979, EDT 30 September 2026, 11 years, £920 a week.
    assert.equal(num(w, 'et-res-total'), 55889.5, 'defaults: 14.5 weeks x £751 = £10,889.50 basic plus £45,000 compensatory');
    assert.match(text(w, 'et-res-split'), /Basic award £10,889\.50/, 'the basic award is itemised');
    assert.match(text(w, 'et-res-split'), /compensatory £45,000/, 'the loss sits under the 52-week cap of £47,840');

    input(w, 'et-loss', '200000');
    assert.equal(num(w, 'et-res-split'), 10889.5, 'the basic award does not move with the loss claim');
    assert.equal(num(w, 'et-res-total'), 10889.5 + 47840, 'the compensatory award is capped at 52 weeks of gross pay');

    input(w, 'et-capoff', true);
    assert.equal(num(w, 'et-res-total'), 10889.5 + 200000, 'the ERA 2025 removal of the cap is modelled when the box is ticked');
    assert.match(text(w, 'et-res-warn'), /1 January 2027/, 'the card flags the commencement assumption');

    input(w, 'et-capoff', false); input(w, 'et-loss', '45000'); input(w, 'et-uncapped', true);
    assert.equal(num(w, 'et-res-total'), 10889.5 + 45000, 'whistleblowing dismissals have no cap');

    input(w, 'et-uncapped', false); input(w, 'et-polkey', '50'); input(w, 'et-acas', '25');
    assert.equal(num(w, 'et-res-total'), 10889.5 + 45000 * 0.5 * 1.25, 'Polkey then the ACAS uplift of 25%');
    input(w, 'et-vento', '20000');
    assert.equal(num(w, 'et-res-total'), 10889.5 + 28125 + 20000, 'injury to feelings sits outside the unfair-dismissal cap');

    // Contributory conduct, and the floor for a protected dismissal.
    input(w, 'et-vento', '0'); input(w, 'et-polkey', '0'); input(w, 'et-acas', '0');
    input(w, 'et-contrib', '50');
    assert.equal(num(w, 'et-res-split'), 10889.5 * 0.5, 'contributory conduct halves the basic award');
    input(w, 'et-protected', true);
    assert.equal(num(w, 'et-res-split'), 9157, 'a protected dismissal cannot go below the £9,157 minimum basic award');

    // Age bands and the 20-year cap.
    input(w, 'et-protected', false); input(w, 'et-contrib', '0'); input(w, 'et-years', '20');
    assert.equal(num(w, 'et-res-split'), 17648.5, '20 years: 7 at 1.5 weeks and 13 at 1 week, all at £751');
    input(w, 'et-years', '25');
    assert.match(text(w, 'et-res-warn'), /20 years/, 'only the last 20 years count');
    assert.equal(num(w, 'et-res-split'), 17648.5, 'service beyond 20 years adds nothing');

    // Historical limits follow the EDT.
    input(w, 'et-dob', '1970-01-01'); input(w, 'et-edt', '2025-06-01'); input(w, 'et-years', '10');
    input(w, 'et-limits', '2025'); input(w, 'et-loss', '100000');
    assert.match(text(w, 'et-res-warn'), /historical limits/, 'a historical limit year is flagged');
    assert.equal(num(w, 'et-res-split'), 10 * 1.5 * 719, '2025/26: 15 weeks x the £719 cap = £10,785 basic award');
    assert.equal(num(w, 'et-res-total'), 10 * 1.5 * 719 + 47840, 'the compensatory award is still capped at 52 weeks of gross pay (£47,840)');
    w.close();
    console.log('PASS tribunal awards — age-banded basic award, £751 cap, 20-year and 52-week limits, Polkey/contributory/ACAS adjustments, protected minimum and historical limits.');
  }

  /* ---- 5. Inheritance Tax and probate ------------------------------------ */
  {
    const w = mount('uk-inheritance-tax-estate-calculator'); await tick();
    // Defaults: home £400,000, cash £300,000, debts £15,000, no transfers.
    assert.equal(num(w, 'iht-res-tax'), 74000, '£685,000 less £325,000 and the £175,000 residence band leaves £185,000 at 40%');
    input(w, 'iht-descendant', false);
    assert.equal(num(w, 'iht-res-tax'), 144000, 'without a direct descendant there is no residence nil-rate band');
    input(w, 'iht-descendant', 'yes');

    // Transferred allowances.
    input(w, 'iht-nrbt', '100'); input(w, 'iht-rnrbt', '100');
    assert.equal(num(w, 'iht-res-tax'), 0, 'two nil-rate bands and two residence bands cover £685,000');
    input(w, 'iht-nrbt', '0'); input(w, 'iht-rnrbt', '0');

    // Residence band taper: £1 for every £2 over £2m.
    input(w, 'iht-home', '2000000'); input(w, 'iht-cash', '300000');
    assert.equal(num(w, 'iht-res-tax'), 771000, 'net £2,285,000 tapers the residence band to £32,500');
    assert.match(text(w, 'iht-res-detail'), /142,500/, 'the amount tapered away is itemised');
    input(w, 'iht-charity', '250000');
    assert.equal(num(w, 'iht-res-tax'), 603900, '£250,000 to charity is over 10% of the baseline, so 36% applies');
    assert.match(text(w, 'iht-res-split'), /36%/, 'the reduced rate is reported');
    input(w, 'iht-charity', '0'); input(w, 'iht-home', '400000'); input(w, 'iht-cash', '300000');

    // APR/BPR: 100% up to £2.5m from 6 April 2026, 50% above; AIM shares 50%.
    input(w, 'iht-business', '3000000'); input(w, 'iht-aim', '200000');
    assert.equal(num(w, 'iht-res-tax'), 284000, '£2.5m relieved in full, £500,000 at 50%, AIM £200,000 at 50%');
    assert.match(text(w, 'iht-res-detail'), /2,500,000/, 'the capped 100% relief is shown');
    input(w, 'iht-business', '0'); input(w, 'iht-aim', '0');

    // Failed gifts: oldest first, taper relief, and they use the nil-rate band.
    input(w, 'iht-g1', '500000'); input(w, 'iht-g1d', '2022-09-01');
    assert.equal(num(w, 'iht-res-tax'), 260000, 'a 2022 gift: £56,000 (20% taper on £175,000) plus £204,000 on the estate');
    assert.match(text(w, 'iht-breakdown'), /taper relief 20%/, 'four whole years give 20% taper relief');
    input(w, 'iht-g1d', '2017-09-01');
    assert.equal(num(w, 'iht-res-tax'), 74000, 'a gift more than seven years before death is outside the charge');
    assert.match(text(w, 'iht-breakdown'), /outside the charge/, 'the gift list explains why');

    // Pensions: outside the estate until 6 April 2027, then included automatically.
    input(w, 'iht-g1', '0'); input(w, 'iht-date', '2026-09-01'); input(w, 'iht-pensionval', '500000');
    assert.equal(num(w, 'iht-res-tax'), 74000, 'before 6 April 2027 an unused pension is outside the estate');
    assert.match(text(w, 'iht-res-detail'), /excluded from the estate/, 'the card says the pension is excluded');
    input(w, 'iht-pension', true);
    assert.equal(num(w, 'iht-res-tax'), 274000, 'ticking the box models the planned inclusion for an earlier death');
    assert.match(text(w, 'iht-res-warn'), /planning, not the current charge/, 'and warns that this is planning, not the current charge');
    input(w, 'iht-date', '2027-09-01'); input(w, 'iht-pension', false);
    assert.equal(num(w, 'iht-res-tax'), 274000, 'from 6 April 2027 the £500,000 pension is inside the estate automatically: £685,000 at 40%');
    assert.match(text(w, 'iht-res-warn'), /subject to the final rules/, 'the card flags that the inclusion is modelled on the scheduled change');

    // Probate fee follows the net estate.
    assert.match(text(w, 'iht-res-detail'), /526/, 'the £526 probate fee is quoted for an estate over £5,000');
    w.close();
    console.log('PASS inheritance tax — nil-rate and residence bands with the £2m taper, transfers, 36% charity rate, £2.5m APR/BPR cap, AIM shares, failed gifts with taper relief, pensions from 2027 and the probate fee.');
  }

  console.log('ALL LEGAL TOOL TESTS PASSED');
})().catch(function (err) {
  console.error('LEGAL TOOL TESTS FAILED');
  console.error(err && err.stack || err);
  process.exit(1);
});
