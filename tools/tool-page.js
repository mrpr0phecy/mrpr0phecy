/* Shared loader for /tools/<slug>.html — isolated iframe, no ID clashes. */
(function () {
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 2500);
  }

  function withFrame(cb) {
    if (window.CardFrame) { cb(); return; }
    var s = document.createElement('script');
    s.src = '../cards/card-frame.js';
    s.onload = function () { cb(); };
    s.onerror = function () { cb(); };
    document.head.appendChild(s);
  }

  function inject(container, html, slug, title) {
    if (window.CardFrame) {
      window.CardFrame.mount(container, html, { slug: slug, title: title || slug, minHeight: 240 });
      return;
    }
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    container.innerHTML = '';
    var wrap = document.createElement('div');
    while (doc.body.firstChild) wrap.appendChild(doc.body.firstChild);
    container.appendChild(wrap);
  }

  async function boot() {
    var slug = document.body.getAttribute('data-tool');
    var title = document.body.getAttribute('data-title') || slug;
    var box = document.getElementById('toolBox');
    if (!slug || !box) return;
    try {
      var res = await fetch('../cards/' + encodeURIComponent(slug) + '.html');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var html = await res.text();
      withFrame(function () { inject(box, html, slug, title); });
    } catch (err) {
      box.innerHTML = '<p style="color:#ff4d4d">Could not load this tool (' + String(err.message || err) + '). Try the <a href="../all-tools.html">full catalogue</a>.</p>';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    boot();
    var share = document.getElementById('shareBtn');
    if (share) share.addEventListener('click', function () {
      var url = location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { toast('Link copied'); }).catch(function () { toast(url); });
      } else { toast(url); }
    });
    var embed = document.getElementById('embedBtn');
    if (embed) embed.addEventListener('click', function () {
      var slug = document.body.getAttribute('data-tool') || '';
      var title = document.body.getAttribute('data-title') || 'Tool';
      var code = '<iframe src="' + location.origin + '/tool.html?card=' + encodeURIComponent(slug) + '" width="100%" height="450" style="border:none;border-radius:12px;" title="' + title.replace(/"/g, '') + '"></iframe>';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function () { toast('Embed code copied'); }).catch(function () { prompt('Copy embed code', code); });
      } else { prompt('Copy embed code', code); }
    });
  });
})();
