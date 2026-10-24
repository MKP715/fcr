/* Router, global search box, theme toggle.
   Router: #/view/args -> FCR.views[view](main, args). On every navigation: document.title ("Predict · GSC Explorer"),
   the active tab (centred in the tab strip when it scrolls), focus on the page h1 (without scrolling), scroll to the top
   for a new page and back to the saved position on Back/Forward (sessionStorage, one entry per history entry; a view may
   still scroll to its own target on a new page). Errors are collected in #errlog.
   Theme toggle: sets data-theme and dispatches window 'fcr:theme' {detail: {theme, view, handled:false}}. A view that
   updates itself sets e.detail.handled = true (or calls e.preventDefault()); otherwise, after 50 ms, the page is re-rendered
   in place — except the views listed in CSS_ONLY (all styled by CSS tokens only), so open sections and in-page state survive
   a theme change. FCR.currentTheme() -> 'dark'|'light'.
   Only '' and '#/…' hashes are routes; any other fragment (the "Skip to content" link's #main) focuses that element instead.
   Search: an ARIA combobox over FCR.search.query() (search.js): grouped results with type chips and highlighted words,
   arrow keys / Enter / Escape, "/" to focus, "Show N more" per group, height kept above the phone keyboard. */
(function () {
  'use strict';
  const FCR = window.FCR;
  const esc = FCR.esc;
  const main = document.getElementById('main');
  const root = document.documentElement;
  const errs = () => (window.__errs = window.__errs || []);
  let curView = null;

  // ---------- theme ----------
  const saved = FCR.store.get('theme', null);
  if (saved) root.setAttribute('data-theme', saved);
  const sysDark = () => !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  FCR.currentTheme = () => root.getAttribute('data-theme') || (sysDark() ? 'dark' : 'light');
  const toggle = document.getElementById('theme-toggle');
  // Views styled by CSS tokens only: no re-render for a theme change (a re-render would close the sections the reader opened).
  // today/delegates/area/person mark the event handled themselves (views.js CSS_THEMED).
  const CSS_ONLY = new Set(['predict', 'quiz', 'calendar', 'learn', 'committees', 'grid', 'board', 'staff', 'timeline', 'reports', 'structure', 'actions', 'agenda']);
  const syncToggle = () => {
    if (!toggle) return;
    const label = FCR.currentTheme() === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme';
    toggle.title = label; toggle.setAttribute('aria-label', label);
  };
  function themeChanged() {
    const theme = FCR.currentTheme();
    const ev = new CustomEvent('fcr:theme', { detail: { theme, view: curView, handled: false }, cancelable: true });
    window.dispatchEvent(ev);
    syncToggle();
    const handled = () => ev.defaultPrevented || ev.detail.handled;
    if (handled() || CSS_ONLY.has(curView)) return;
    setTimeout(() => { if (!handled() && FCR.currentTheme() === theme) route({ rerender: true }); }, 50);
  }
  if (toggle) toggle.addEventListener('click', () => {
    const nxt = FCR.currentTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', nxt); FCR.store.set('theme', nxt);
    themeChanged();
  });
  if (window.matchMedia) {   // following the system theme: tell the views too
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => { if (!root.getAttribute('data-theme')) themeChanged(); };
    if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on);
  }
  syncToggle();

  const cyc = FCR.cycle();
  const asOfText = FCR.asOfOverride ? (FCR.ui && FCR.ui.fmtDate ? FCR.ui.fmtDate(FCR.asOfOverride, 'short') : FCR.asOfOverride.toISOString().slice(0, 10)) : '';
  document.getElementById('asof').textContent = `Reports ${FCR.years[0] || '—'}–${FCR.latestYear || '—'} · next: ${FCR.ordinal(cyc.nextOrdinal)} GSC (${cyc.nextConference})` +
    (asOfText ? ` · viewing as of ${asOfText}` : '');
  // ?today=YYYY-MM-DD preview: html.asof-preview, and (phones, where the subtitle is hidden) a small chip back to today
  if (asOfText) {
    root.classList.add('asof-preview');
    const chip = document.createElement('a');
    chip.className = 'asof-chip'; chip.href = location.pathname + location.hash;
    chip.title = 'Previewing the app as of this date — tap to return to today';
    chip.textContent = `As of ${asOfText} ✕`;
    chip.addEventListener('click', (e) => { e.preventDefault(); location.href = location.pathname + location.hash; });
    document.body.appendChild(chip);
  }

  // Sticky tabs sit right under the header, whatever its rendered height on this device.
  const topbar = document.querySelector('.topbar');
  const tabs = document.getElementById('tabs');
  const setTopbarH = () => { if (topbar) root.style.setProperty('--topbar-h', topbar.offsetHeight + 'px'); };
  setTopbarH();
  let resizeT = null;
  window.addEventListener('resize', () => { setTopbarH(); clearTimeout(resizeT); resizeT = setTimeout(() => centreTab(true), 150); });

  /** Scroll the tab strip (phones) so the active tab sits in the middle. */
  function centreTab(instant) {
    const a = tabs && tabs.querySelector('a.active');
    if (!a || tabs.scrollWidth <= tabs.clientWidth + 1) return;
    const tr = tabs.getBoundingClientRect(), ar = a.getBoundingClientRect();
    const left = Math.max(0, tabs.scrollLeft + (ar.left - tr.left) - (tabs.clientWidth - ar.width) / 2);
    try { tabs.scrollTo({ left, behavior: instant ? 'auto' : 'smooth' }); } catch (e) { tabs.scrollLeft = left; }
  }

  // ---------- page titles ----------
  const TAB_LABEL = {};
  if (tabs) tabs.querySelectorAll('a').forEach((a) => { TAB_LABEL[(a.getAttribute('href') || '').replace(/^#\//, '')] = a.textContent.trim(); });
  const dec = (s) => { try { return decodeURIComponent(s || ''); } catch (e) { return s || ''; } };
  const UPPER = (s) => String(s || '').toUpperCase();
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const QUIZ_MODES = { manual: 'Service Manual', concepts: 'Which Concept?', committees: 'Which committee?', people: 'People & committees', region: 'My region', rules: 'Draw rules & calendar' };
  /** The page title for a route. Every URL argument is checked the way its view checks it (an argument the view ignores
      gives the plain tab label), so the title always describes the page actually shown. */
  function titleFor(view, args) {
    const a0 = dec(args[0]);
    const node = (id) => (FCR.learnTree && id ? FCR.learnTree.node(id) : null);
    const yr = /^\d{4}$/.test(a0) ? +a0 : null;
    switch (view) {
      case 'area': { const a = /^\d+$/.test(a0) && own(FCR.areas, +a0) ? FCR.areas[+a0] : null; return a ? `Area ${a.n} · ${a.name}` : 'Area'; }
      case 'person': return a0 || 'Person';
      case 'committees': {   // the year the view shows (views2.js V.committees): a loaded year, or the next one once its chairs are known
        const y = yr && (FCR.years.includes(yr) || (yr === FCR.latestYear + 1 && FCR.Y(FCR.latestYear))) ? yr : FCR.latestYear;
        const c = UPPER(dec(args[1]));
        return (c && own(FCR.COMMITTEES, c) ? `${FCR.cname(c)} · ` : '') + (a0 && y ? `Committees ${y}` : 'Committees');
      }
      case 'predict': {   // the panel the view shows (view-predict.js panelChoices / V.predict)
        if (!a0 || !FCR.predict) return 'Predict';
        let P = null;
        try {
          const list = [...new Set(FCR.panels.concat(FCR.predict.pendingPanels()))].filter((p) => p >= (FCR.panels[0] || 0) + 2);
          P = list.includes(+a0) ? +a0 : FCR.predict.defaultPanel() || list.sort((a, b) => b - a)[0] || null;
        } catch (e) { P = null; }
        if (!P) return 'Predict';
        const x = dec(args[2]);
        const sub = args[1] === 'area' && /^\d+$/.test(x) && own(FCR.areas, +x) ? `Area ${+x} · `
          : args[1] === 'committee' && own(FCR.COMMITTEES, UPPER(x)) ? `${FCR.cname(UPPER(x))} · ` : '';
        return `${sub}Panel ${P} · Predict`;
      }
      case 'learn': {
        if (a0 === 'glossary') {   // the glossary filtered by a term: name the term only when it is one
          const f = FCR.fold(dec(args[1])), g = f && ((FCR.RAW && FCR.RAW.learn && FCR.RAW.learn.glossary) || []).find((x) => FCR.fold(x.term) === f);
          return g ? `${g.term} · Glossary` : 'Glossary · Learn';
        }
        if (a0 === 'rules') return 'Rules · Learn';
        return node(a0) ? `${node(a0).title} · Learn` : 'Learn';
      }
      case 'quiz': return a0 === 'node' && node(args[1]) ? `${node(args[1]).title} · Quiz` : own(QUIZ_MODES, a0) ? `${QUIZ_MODES[a0]} · Quiz` : 'Quiz';
      case 'board': { const y = parseInt(a0, 10); return FCR.Y(y) ? `Trustees & Boards ${y}` : TAB_LABEL.board || 'Trustees & Boards'; }   // V.board / V.structure use parseInt
      case 'structure': { const y = parseInt(a0, 10); return FCR.Y(y) ? `Structure ${y}` : TAB_LABEL.structure || 'Structure'; }
      case 'actions': {   // V.actions: /pending, /year/<YYYY>, /committee/<ID or section number>, /item/<id>
        const a1 = dec(args[1]);
        if (a0 === 'pending') return 'Pending follow-ups · Advisory Actions';
        const AA = (FCR.RAW && FCR.RAW.advisoryActions) || {}, ys = (AA.actions || []).map((x) => x.year);
        const it = a0 === 'item' && a1 ? (AA.actions || []).find((x) => x.id === a1) : null;   // the page shows that action's year
        if (it) return `${it.year} · Advisory Actions`;
        // same range as the page's Years select: an out-of-range year shows all years
        if (a0 === 'year' && /^\d{4}$/.test(a1) && ys.length && +a1 >= Math.min(...ys) && +a1 <= Math.max(...ys)) return `${a1} · Advisory Actions`;
        const s = a0 === 'committee' && a1 ? (AA.sections || []).find((x) => x.committee === a1.toUpperCase() || String(x.sid) === a1) : null;
        return s ? `${s.name} · Advisory Actions` : 'Advisory Actions';
      }
      case 'agenda': {   // V.agenda (view-pai.js): /item/<key>, /theme/<id>, /trends, /last, /process; an unknown key or theme is the plain page
        const P = (FCR.RAW && FCR.RAW.pai) || {}, a1 = dec(args[1]), tab = TAB_LABEL.agenda || 'Agenda Items';
        const SECT = { trends: 'Trends', process: 'How a proposal travels' };
        if (P.last && P.last.total) SECT.last = 'Last year';   // the section shows only with last cycle's figures
        if (own(SECT, a0)) return `${SECT[a0]} · ${tab}`;
        const it = a0 === 'item' && a1 ? (P.items || []).find((x) => x.key === a1) : null;
        // an item deferred from an earlier cycle (key '2025-7') names the year it was sent in
        if (it) return `${it.cycle !== (P.source || {}).ordinal ? a1.split('-')[0] + ' ' : ''}PAI ${it.n} · ${tab}`;
        const th = a0 === 'theme' && a1 ? (P.themes || []).find((x) => x.id === a1) : null;
        return th ? `${th.name} · ${tab}` : tab;
      }
      case 'reports': {   // a year with a report, a Conference entry, or the Conference whose report is pending
        const CONF = (FCR.RAW && FCR.RAW.conferences) || {}, cyc = FCR.cycle();
        const ok = yr && yr > 1950 && ((FCR.RAW.reports || []).some((r) => r.year === yr) || FCR.Y(yr) || own(CONF.years, String(yr)) ||
          (CONF.future || []).some((c) => c.year === yr) || (cyc.reportPending && cyc.lastConference === yr));
        return ok ? `${FCR.ordinal(yr - 1950)} Conference (${yr}) · Reports` : TAB_LABEL.reports || 'Reports';
      }
      case 'delegates': {   // the view and region the page shows (views.js V.delegates)
        const k = dec(args[1]);
        const reg = k && own(FCR.regionBy, k) ? FCR.regionBy[k].name + ' region · ' : '';
        const v = a0 === 'next' ? 'next' : FCR.years.some((y) => String(y) === a0) ? a0 : 'current';
        return reg + (v === 'current' ? TAB_LABEL.delegates || 'Delegates & Map' : v === 'next' ? 'Next panel · Delegates' : `Delegates ${v}`);
      }
      case 'calendar': {
        if (!a0 || !FCR.calendar) return 'Calendar';
        try {
          const t = FCR.calendar.todayStr(), d = (/@(\d{4}-\d{2}-\d{2})$/.exec(a0) || [])[1];
          const it = FCR.calendar.items({ from: d || FCR.calendar.add(t, -1100), to: d || FCR.calendar.add(t, 1500), scope: 'everything' }).find((o) => o.key === a0);
          return it ? `${it.title} · Calendar` : 'Calendar';
        } catch (e) { return 'Calendar'; }
      }
      default: return TAB_LABEL[view] || 'Today';
    }
  }

  // ---------- focus ----------
  /** Move focus to the page heading (screen readers announce the new page; Tab continues from there). Skipped when the
      view already put focus inside the page. */
  function focusHeading(force) {
    const ae = document.activeElement;
    if (!force && ae && ae !== document.body && ae !== main && main.contains(ae)) return;   // <main> itself (skip link, a click on text) is not "inside"
    const h = main.querySelector('h1');
    if (!h) return;
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    try { h.focus({ preventScroll: true }); } catch (e) { /* old browsers */ }
  }

  // ---------- scroll restoration (per history entry) ----------
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const SKEY = 'fcr:scroll';
  let scrollMap = {};
  try { scrollMap = JSON.parse(sessionStorage.getItem(SKEY) || '{}') || {}; } catch (e) { scrollMap = {}; }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const stateId = () => { const s = history.state; return s && typeof s === 'object' && typeof s.fcrEntry === 'string' ? s.fcrEntry : null; };
  const withId = (st, id) => (st == null ? { fcrEntry: id } : typeof st === 'object' && !Array.isArray(st) ? Object.assign({}, st, { fcrEntry: id }) : st);
  const nativePush = history.pushState.bind(history), nativeReplace = history.replaceState.bind(history);
  let entry = null, entryHash = location.hash, persistT = null;
  const persist = () => {
    clearTimeout(persistT);
    persistT = setTimeout(() => {
      try {
        const keys = Object.keys(scrollMap);
        if (keys.length > 150) keys.sort((a, b) => scrollMap[a].t - scrollMap[b].t).slice(0, keys.length - 120).forEach((k) => delete scrollMap[k]);
        sessionStorage.setItem(SKEY, JSON.stringify(scrollMap));
      } catch (e) { /* storage unavailable: positions are kept for this page load only */ }
    }, 250);
  };
  function saveScroll() {
    if (!entry) return;
    scrollMap[entry] = { y: Math.round(window.scrollY || window.pageYOffset || 0), h: entryHash, t: Date.now() };
    persist();
  }
  // Views that push or replace history entries themselves (Predict's side panel) keep an entry id, so Back works there too.
  const retitle = () => { const p = (location.hash || '#/today').replace(/^#\/?/, '').split('/'); const v = p[0] || 'today'; if (v === curView) document.title = titleFor(v, p.slice(1)) + ' · GSC Explorer'; };
  history.pushState = function (st, title, url) { saveScroll(); entry = newId(); const r = nativePush(withId(st, entry), title, url); entryHash = location.hash; retitle(); return r; };
  history.replaceState = function (st, title, url) { const r = nativeReplace(withId(st, entry || (entry = newId())), title, url); entryHash = location.hash; if (url != null) retitle(); return r; };
  let scrollT = null;
  window.addEventListener('scroll', () => { if (scrollT) return; scrollT = setTimeout(() => { scrollT = null; saveScroll(); }, 120); }, { passive: true });
  window.addEventListener('pagehide', saveScroll);
  let restoreTok = 0;
  /** Scroll back to y, again after the view's late renders (rAF, 60/200/500 ms), unless the reader scrolls first. */
  function restoreScroll(y) {
    const tok = ++restoreTok;
    let user = false;
    const stop = () => { user = true; };
    const evs = ['wheel', 'touchstart', 'keydown', 'mousedown'];
    evs.forEach((n) => window.addEventListener(n, stop, { passive: true, capture: true, once: true }));
    const go = () => { if (!user && tok === restoreTok && Math.abs((window.scrollY || 0) - y) > 2) window.scrollTo(0, y); };
    go();
    requestAnimationFrame(() => {
      go(); setTimeout(go, 60); setTimeout(go, 200);
      setTimeout(() => { go(); evs.forEach((n) => window.removeEventListener(n, stop, { capture: true })); }, 500);
    });
  }

  // ---------- router ----------
  let lastKey = null, firstRoute = true;
  /** Only '', '#' and '#/…' are routes; '#main' (the skip link) and other in-page fragments are not. */
  const isRoute = (h) => !h || h === '#' || /^#\//.test(h);
  function route(opts) {
    opts = opts || {};
    const h = location.hash;
    const parts = (isRoute(h) ? h || '#/today' : '#/today').replace(/^#\/?/, '').split('/');
    const view = parts[0] || 'today';
    const known = own(FCR.views, view) && typeof FCR.views[view] === 'function';
    const fn = known ? FCR.views[view] : FCR.views.today;
    const name = known ? view : 'today';
    if (tabs) tabs.querySelectorAll('a').forEach((a) => {
      const on = a.getAttribute('href') === '#/' + name;   // an unknown view falls back to Today, so Today is the active tab
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (FCR.ui && FCR.ui.hideTip) FCR.ui.hideTip();
    closeSearch();
    // A new page starts at the top (the view may then scroll to its own target); Back/Forward returns to the saved spot.
    const key = name + '/' + (parts[1] || '');
    const newPage = key !== lastKey;
    if (newPage && !opts.rerender && opts.restore == null) window.scrollTo(0, 0);
    lastKey = key; curView = name;
    const keepY = opts.rerender ? window.scrollY : null;   // a re-render (theme fallback) stays where the reader is
    try { fn(main, parts.slice(1)); }
    catch (e) { console.error(e); errs().push(e.message + ' (render ' + view + ')'); main.innerHTML = `<div class="callout warn">Something went wrong rendering this page: ${esc(e.message)}</div>`; }
    let log = document.getElementById('errlog');
    if (!log) { log = document.createElement('pre'); log.id = 'errlog'; log.hidden = true; document.body.appendChild(log); }
    log.textContent = errs().join('\n');
    if (keepY != null) restoreScroll(keepY);
    if (!opts.rerender) {
      document.title = titleFor(name, parts.slice(1)) + ' · GSC Explorer';
      if (opts.restore != null) restoreScroll(opts.restore);
      if (newPage && !firstRoute) focusHeading();
      centreTab(firstRoute);
    }
    firstRoute = false;
  }
  /** Focus an in-page target (the skip link's main, which has tabindex=-1), scrolling only when it is off screen. */
  function focusTarget(t) {
    if (!t) return;
    if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
    try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); }
    const r = t.getBoundingClientRect(), top = (topbar ? topbar.offsetHeight : 0) + (tabs ? tabs.offsetHeight : 0);
    if (r.top < top - 1 || r.top > window.innerHeight) window.scrollTo(0, Math.max(0, (window.scrollY || 0) + r.top - top));
  }
  // "Skip to content": move focus to <main> without changing the hash (a hash change would be routed as a page).
  const skip = document.querySelector('a.skip');
  if (skip) skip.addEventListener('click', (e) => { e.preventDefault(); focusTarget(main); });
  window.addEventListener('hashchange', () => {
    const h = location.hash;
    if (!isRoute(h)) {
      // An in-page fragment (#main typed or linked): put the page's own hash back and focus the target; no re-render.
      let t = null;
      try { t = document.getElementById(decodeURIComponent(h.slice(1))); } catch (e) { t = null; }
      nativeReplace(withId(history.state, entry || (entry = newId())), '', entryHash || location.pathname + location.search);
      focusTarget(t);
      return;
    }
    saveScroll();                                  // the page being left: its position is still on screen
    let id = stateId(), restore = null;
    if (id && id !== entry && scrollMap[id]) restore = scrollMap[id].y;   // Back/Forward to a page seen before
    if (!id) { id = newId(); nativeReplace(withId(history.state, id), ''); }   // a new page: tag its history entry
    entry = id; entryHash = location.hash;
    route({ restore });
  });

  // ---------- global search (index and scoring: search.js) ----------
  const input = document.getElementById('gsearch');
  const box = document.getElementById('gsearch-results');
  const wrap = input ? input.closest('.search-wrap') : null;
  let active = -1, expand = null, lastQ = '', indexed = false;
  const ensureIndex = () => {
    if (indexed || !FCR.search) return;
    indexed = true;
    try { const t0 = performance.now(); FCR.search.index(); FCR.search.buildMs = Math.round(performance.now() - t0); }
    catch (e) { errs().push(e.message + ' (search index)'); }
  };
  function closeSearch() {
    if (!box) return;
    box.hidden = true; active = -1;
    if (input) { input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
    if (wrap) wrap.classList.remove('open');
  }
  /** Keep the list above the on-screen keyboard (visualViewport) and within the window. */
  function fit() {
    if (!box || box.hidden) return;
    const vv = window.visualViewport;
    const top = box.getBoundingClientRect().top;
    const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    box.style.maxHeight = Math.max(140, Math.floor(Math.min(bottom - top - 8, Math.max(320, window.innerHeight * 0.75)))) + 'px';
  }
  // Highlight the query's words where a word of the text starts with them (accent-insensitive; numbers whole).
  const fold1 = (ch) => { const f = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); return f.length === 1 ? f : /[a-z0-9]/i.test(ch) ? ch.toLowerCase() : ' '; };
  function hl(text, words) {
    text = String(text || '');
    if (!words.length) return esc(text);
    let folded = '';
    for (let i = 0; i < text.length; i++) folded += fold1(text[i]);
    const mark = new Uint8Array(text.length);
    const alnum = (c) => /[a-z0-9]/.test(c || '');
    words.forEach((w) => {
      for (let i = folded.indexOf(w); i !== -1; i = folded.indexOf(w, i + 1)) {
        if (alnum(folded[i - 1])) continue;
        const after = folded[i + w.length];
        if ((/^\d+$/.test(w) || w.length === 1) && alnum(after)) continue;   // '6' is not 65; a lone letter only as an initial
        mark.fill(1, i, i + w.length);
      }
    });
    let out = '', on = false;
    for (let i = 0; i < text.length; i++) {
      if (!!mark[i] !== on) { out += on ? '</mark>' : '<mark>'; on = !on; }
      out += esc(text[i]);
    }
    return out + (on ? '</mark>' : '');
  }
  const queryWords = (q) => (FCR.search ? FCR.search.norm(q) : FCR.fold(q)).split(' ').filter((w) => w && (w.length > 1 || /\d/.test(w) || /^[a-z]$/.test(w)));
  function results(q) {
    if (!FCR.search) return [];
    ensureIndex();
    try { return FCR.search.query(q, { expand }); } catch (e) { errs().push(e.message + ' (search)'); return []; }
  }
  function render() {
    const q = input.value.trim();
    if (q !== lastQ) { expand = null; lastQ = q; }
    active = -1; input.removeAttribute('aria-activedescendant');
    if (!(q.length >= 2 || /^\d$/.test(q))) { box.innerHTML = ''; closeSearch(); live.textContent = ''; return; }
    const groups = results(q);
    if (!groups.length) {
      box.innerHTML = `<div class="sr-empty"><strong>No matches for “${esc(q)}”.</strong> ${esc(FCR.search ? FCR.search.hint : '')}</div>`;
      live.textContent = 'No matches.';
    } else {
      const words = queryWords(q);
      let i = 0, n = 0, html = '';
      groups.forEach((g, gi) => {
        html += `<div class="sr-group" role="group" aria-labelledby="srg-${gi}"><div class="sr-gh" id="srg-${gi}">${esc(g.label)}</div>`;
        g.items.forEach((r) => {
          html += `<a class="sr" id="sr-${i}" role="option" aria-selected="false" data-i="${i}" href="${esc(r.href)}"><span class="sr-main"><span class="t">${hl(r.t, words)}</span>` +
            `<span class="d">${hl(r.d, words)}</span></span>${r.chip ? `<span class="sr-chip">${esc(r.chip)}</span>` : ''}</a>`;
          i++; n++;
        });
        if (g.more > 0) { html += `<div class="sr sr-more" id="sr-${i}" role="option" aria-selected="false" data-i="${i}" data-expand="${esc(g.g)}">Show ${g.more} more · ${esc(g.label)}</div>`; i++; }
        html += '</div>';
      });
      box.innerHTML = html;
      live.textContent = `${n} result${n === 1 ? '' : 's'}${groups.length > 1 ? ' in ' + groups.length + ' groups' : ''}. Use the arrow keys to choose.`;
    }
    box.hidden = false; box.scrollTop = 0;
    input.setAttribute('aria-expanded', 'true');
    if (wrap) wrap.classList.add('open');
    fit();
  }
  const options = () => [...box.querySelectorAll('[role="option"]')];
  function setActive(i) {
    const items = options();
    active = items.length ? (i + items.length) % items.length : -1;
    items.forEach((x, j) => { const on = j === active; x.classList.toggle('active', on); x.setAttribute('aria-selected', String(on)); });
    const it = items[active];
    if (!it) { input.removeAttribute('aria-activedescendant'); return; }
    input.setAttribute('aria-activedescendant', it.id);
    // keep the active row in view, below its sticky group heading
    const head = it.parentElement && it.parentElement.firstElementChild && it.parentElement.firstElementChild !== it ? it.parentElement.firstElementChild.offsetHeight : 0;
    const top = it.offsetTop, bottom = top + it.offsetHeight;
    if (top - head < box.scrollTop) box.scrollTop = Math.max(0, top - head);
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  }
  function choose(it) {
    if (!it) return;
    if (it.dataset.expand) {   // "Show N more": open the whole group, keep the place
      const g = it.dataset.expand, idx = +it.dataset.i;
      expand = g; render();
      setActive(idx);
      input.focus();
      return;
    }
    const href = it.getAttribute('href');
    closeSearch();
    if (href === location.hash) { window.scrollTo(0, 0); focusHeading(true); }
    else location.hash = href;   // the router moves focus to the new page's h1
  }
  let live = null;
  if (input && box) {
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-controls', 'gsearch-results'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-keyshortcuts', '/');
    input.setAttribute('enterkeyhint', 'go'); input.setAttribute('spellcheck', 'false'); input.setAttribute('autocapitalize', 'off');
    const narrow = window.matchMedia && window.matchMedia('(max-width: 640px)');
    const setPh = () => { input.placeholder = narrow && narrow.matches ? 'Search names, areas, terms…' : 'Search people, areas, committees, terms, dates…'; };
    setPh(); if (narrow && narrow.addEventListener) narrow.addEventListener('change', setPh);
    box.setAttribute('role', 'listbox'); box.setAttribute('aria-label', 'Search results');
    live = document.createElement('div');
    live.className = 'gs-live'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
    (wrap || document.body).appendChild(live);

    input.addEventListener('input', render);
    input.addEventListener('focus', () => { ensureIndex(); if (input.value.trim() && box.hidden) render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (box.hidden) render();
        if (box.hidden || !options().length) return;
        setActive(active < 0 ? (e.key === 'ArrowDown' ? 0 : -1) : active + (e.key === 'ArrowDown' ? 1 : -1));
        e.preventDefault();
      } else if (e.key === 'Enter') {
        if (!input.value.trim()) return;
        e.preventDefault();
        if (box.hidden) render();
        const items = options();
        choose(items[active] || items.find((x) => !x.dataset.expand));
      } else if (e.key === 'Escape') {
        if (!box.hidden) { closeSearch(); e.preventDefault(); }
        else if (input.value) { input.value = ''; render(); e.preventDefault(); }
      } else if (e.key === 'Tab') closeSearch();
    });
    box.addEventListener('mousedown', (e) => { if (e.target.closest('[data-expand]')) e.preventDefault(); });   // keep focus in the box
    box.addEventListener('click', (e) => {
      const more = e.target.closest('[data-expand]');
      if (more) { e.preventDefault(); choose(more); return; }
      const a = e.target.closest('a.sr');
      if (a && a.getAttribute('href') === location.hash) { e.preventDefault(); choose(a); return; }
      if (a) closeSearch();
    });
    document.addEventListener('click', (e) => { if (wrap && !wrap.contains(e.target)) closeSearch(); });
    document.addEventListener('keydown', (e) => {
      const ae = document.activeElement;
      const typing = ae && (/^(input|select|textarea)$/i.test(ae.tagName) || ae.isContentEditable);
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); input.focus(); input.select(); }
      else if (e.key === 'Escape' && !box.hidden && ae !== input) closeSearch();
    });
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', fit); window.visualViewport.addEventListener('scroll', fit); }
    window.addEventListener('resize', fit);
  }

  // ---------- start ----------
  entry = stateId();
  const reloadAt = entry && scrollMap[entry] && scrollMap[entry].h === location.hash ? scrollMap[entry].y : null;   // a reload returns to the same spot
  if (!entry) { entry = newId(); nativeReplace(withId(history.state, entry), ''); }
  entryHash = location.hash;
  route({ restore: reloadAt });
  // Build the search index while the browser is idle, so the first keystroke is quick and first paint is not delayed.
  (window.requestIdleCallback ? (f) => window.requestIdleCallback(f, { timeout: 4000 }) : (f) => setTimeout(f, 1200))(ensureIndex);
})();
