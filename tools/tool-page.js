/* Shared loader for /tools/<slug>.html — injects the card fragment. */
(function () {
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 2500);
  }

  function inject(container, html) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var scripts = Array.from(doc.querySelectorAll('script'));
    scripts.forEach(function (s) { s.remove(); });
    var styles = Array.from(doc.querySelectorAll('style'));
    styles.forEach(function (s) { s.remove(); });
    container.innerHTML = '';
    var wrap = document.createElement('div');
    while (doc.body.firstChild) wrap.appendChild(doc.body.firstChild);
    container.appendChild(wrap);
    styles.forEach(function (s) {
      var n = document.createElement('style');
      n.textContent = s.textContent;
      container.appendChild(n);
    });
    scripts.forEach(function (s) {
      try {
        var n = document.createElement('script');
        Array.from(s.attributes).forEach(function (a) { n.setAttribute(a.name, a.value); });
        n.textContent = s.textContent;
        container.appendChild(n);
      } catch (err) { console.warn(err); }
    });
  }

  async function boot() {
    var slug = document.body.getAttribute('data-tool');
    var box = document.getElementById('toolBox');
    if (!slug || !box) return;
    try {
      var res = await fetch('../cards/' + encodeURIComponent(slug) + '.html');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      inject(box, await res.text());
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
