/* ============================================================================
   AEGIS OVERWATCH — theater selection console
   ----------------------------------------------------------------------------
   Worldwide site picker: fuzzy search over the atlas, grouped by region,
   keyboard-driven, and built so a presenter can go from "anywhere in the world"
   to a loaded theater in about two seconds without leaving the keyboard.
   ============================================================================ */
(function (global) {
'use strict';

/* subsequence match with a light relevance score — typing "hkg", "hong" or
   "victoria" should all surface Hong Kong */
function score(site, q) {
  if (!q) return 1;
  const hay = (site.name + ' ' + site.sub + ' ' + site.country + ' ' + site.region).toUpperCase();
  const name = site.name.toUpperCase();
  if (name === q) return 1000;
  if (name.startsWith(q)) return 500 - name.length;
  const idx = hay.indexOf(q);
  if (idx >= 0) return 300 - idx;
  /* subsequence fallback */
  let i = 0;
  for (let c = 0; c < hay.length && i < q.length; c++) if (hay[c] === q[i]) i++;
  return i === q.length ? 40 : -1;
}

function create(opts) {
  const atlas = opts.atlas;
  const onPick = opts.onPick;
  const root = document.getElementById(opts.rootId);
  const input = root.querySelector('.wc-input');
  const list = root.querySelector('.wc-list');
  const toggle = document.getElementById(opts.toggleId);
  const label = document.getElementById(opts.labelId);

  let open = false, cursor = 0, shown = [];

  function render() {
    const q = input.value.trim().toUpperCase();
    shown = atlas.map(s => ({ s, sc: score(s, q) })).filter(r => r.sc >= 0)
      .sort((a, b) => b.sc - a.sc || a.s.name.localeCompare(b.s.name))
      .map(r => r.s);
    if (cursor >= shown.length) cursor = Math.max(0, shown.length - 1);
    list.innerHTML = '';
    if (!shown.length) {
      const d = document.createElement('div');
      d.className = 'wc-empty';
      d.textContent = 'NO MATCH — TRY A CITY, COUNTRY OR REGION';
      list.appendChild(d);
      return;
    }
    let lastRegion = null;
    shown.forEach((s, i) => {
      if (!q && s.region !== lastRegion) {
        lastRegion = s.region;
        const h = document.createElement('div');
        h.className = 'wc-group'; h.textContent = s.region;
        list.appendChild(h);
      }
      const row = document.createElement('button');
      row.className = 'wc-row' + (i === cursor ? ' on' : '');
      row.dataset.i = i;
      const relief = s.elevMax - s.elevMin;
      row.innerHTML =
        '<span class="wc-nm">' + s.name + '</span>' +
        '<span class="wc-sub">' + s.sub + '</span>' +
        '<span class="wc-meta">' + s.country + '</span>' +
        '<span class="wc-tag">' + s.layout.toUpperCase() + '</span>' +
        '<span class="wc-el">' + relief + ' M</span>';
      row.addEventListener('click', () => choose(i));
      row.addEventListener('mousemove', () => {
        if (cursor !== i) { cursor = i; paintCursor(); }
      });
      list.appendChild(row);
    });
    paintCursor();
  }
  function paintCursor() {
    list.querySelectorAll('.wc-row').forEach(r => r.classList.toggle('on', +r.dataset.i === cursor));
    const el = list.querySelector('.wc-row.on');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }
  function choose(i) {
    const s = shown[i];
    if (!s) return;
    setOpen(false);
    onPick(s);
  }
  function setOpen(v) {
    open = v;
    root.classList.toggle('open', v);
    root.setAttribute('aria-hidden', v ? 'false' : 'true');
    toggle.classList.toggle('on', v);
    if (v) {
      input.value = ''; cursor = 0; render();
      setTimeout(() => input.focus(), 30);
    } else {
      input.blur();
    }
  }

  input.addEventListener('input', () => { cursor = 0; render(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(shown.length - 1, cursor + 1); paintCursor(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(0, cursor - 1); paintCursor(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(cursor); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    e.stopPropagation();
  });
  toggle.addEventListener('click', () => setOpen(!open));
  root.addEventListener('click', e => { if (e.target === root) setOpen(false); });

  return {
    setOpen, isOpen: () => open,
    setLabel(site) { if (label) label.textContent = site.name; },
    count: atlas.length,
  };
}

global.AegisConsole = { create, score };
})(window);
