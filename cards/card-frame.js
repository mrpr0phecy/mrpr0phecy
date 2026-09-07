/* card-frame.js — run each tool in its own iframe so IDs, CSS and JS cannot collide.
   Used by the homepage grid, the standalone modal, tool.html and /tools/*.html. */
(function (root) {
  'use strict';

  var seq = 0;
  var frames = Object.create(null);

  if (!root.__tmusiwFrameListen) {
    root.__tmusiwFrameListen = true;
    root.addEventListener('message', function (ev) {
      var d = ev.data;
      if (!d || d.type !== 'tmusiw-frame') return;
      var rec = frames[d.id];
      if (!rec || ev.source !== rec.iframe.contentWindow) return;
      var h = Math.max(rec.minHeight, Number(d.height) || rec.minHeight);
      if (rec.maxHeight) h = Math.min(h, rec.maxHeight);
      rec.iframe.style.height = h + 'px';
      if (typeof rec.onHeight === 'function') rec.onHeight(h, rec.iframe);
    });
  }

  function originBase() {
    try {
      return root.location.origin + '/';
    } catch (e) {
      return '/';
    }
  }

  function hostCss() {
    return [
      ':root{--accent:#2dd4ff;--accent-dark:#1aa3cc;--text:#e6faff;--text-secondary:rgba(230,250,255,.7);--text-tertiary:rgba(230,250,255,.4);--bg-primary:#0a0f14;--bg-secondary:#141e28;--bg-card:#141e28;--border-light:rgba(255,255,255,.08);--success:#39ff14;--error:#ff4d4d;--premium:#ffd700;--font-sans:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
      'html,body{margin:0;padding:0;background:transparent;color:var(--text);font-family:var(--font-sans);line-height:1.6;font-size:15px}',
      '*,*::before,*::after{box-sizing:border-box}',
      'img,canvas,svg,video,iframe{max-width:100%;height:auto}',
      'a{color:var(--accent)}',
      'input,select,textarea,button{font-family:inherit;font-size:14px;box-sizing:border-box;min-width:0;max-width:100%}',
      'input[type=text],input[type=number],input[type=email],input[type=search],input[type=password],select,textarea{background:rgba(20,30,40,.8);border:1px solid rgba(45,212,255,.25);color:var(--text);border-radius:8px;padding:10px 14px}',
      'button{cursor:pointer}',
      '.field,.card-wrap,[style*="grid-template-columns"]>*{min-width:0;max-width:100%}',
      '@media (max-width:640px){input,textarea,select{font-size:16px}.field [style*="display:flex"]{flex-wrap:wrap}}'
    ].join('');
  }

  function extractBody(html) {
    try {
      var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
      return doc.body ? doc.body.innerHTML : String(html || '');
    } catch (e) {
      return String(html || '');
    }
  }

  function srcdoc(html, id) {
    var body = extractBody(html);
    return '<!doctype html><html><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<base href="' + originBase() + '">'
      + '<style>' + hostCss() + '</style></head><body>'
      + body
      + '<script>(function(){function r(){try{var h=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight,document.documentElement.offsetHeight,1);parent.postMessage({type:"tmusiw-frame",id:' + JSON.stringify(id) + ',height:h},"*");}catch(e){}}'
      + 'if(typeof ResizeObserver!=="undefined"){try{new ResizeObserver(r).observe(document.documentElement);}catch(e){}}'
      + 'window.addEventListener("load",r);window.addEventListener("resize",r);'
      + 'setTimeout(r,30);setTimeout(r,200);setTimeout(r,800);})();<\/script>'
      + '</body></html>';
  }

  function unmount(container) {
    if (!container) return;
    var iframe = container.querySelector && container.querySelector('iframe.card-frame');
    if (iframe && iframe.dataset.frameId && frames[iframe.dataset.frameId]) {
      delete frames[iframe.dataset.frameId];
    }
    container.innerHTML = '';
  }

  function mount(container, html, opts) {
    opts = opts || {};
    if (!container) return null;
    unmount(container);
    var id = 'f' + (++seq) + ':' + (opts.slug || 'tool');
    var minHeight = opts.minHeight || 180;
    var iframe = document.createElement('iframe');
    iframe.className = 'card-frame';
    iframe.dataset.frameId = id;
    iframe.setAttribute('title', opts.title || 'Tool');
    iframe.setAttribute('loading', opts.loading || 'eager');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads');
    iframe.setAttribute('allow', 'clipboard-write; clipboard-read; autoplay; microphone; camera; geolocation; fullscreen; accelerometer; gyroscope');
    iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    iframe.style.cssText = 'width:100%;border:0;display:block;background:transparent;min-height:' + minHeight + 'px;height:' + minHeight + 'px;';
    frames[id] = { iframe: iframe, minHeight: minHeight, maxHeight: opts.maxHeight || 0, onHeight: opts.onHeight };
    iframe.srcdoc = srcdoc(html, id);
    container.appendChild(iframe);
    return iframe;
  }

  root.CardFrame = { mount: mount, unmount: unmount };
})(typeof window !== 'undefined' ? window : this);
