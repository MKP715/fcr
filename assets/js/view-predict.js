/* Predict view: #/predict[/<panel>[/area/<n>[/<committee>] | /committee/<ID>]].
   Layout: panel picker, "Your area" and the rule switchboard first; then the area × committee heat table (sortable,
   sticky Area column, my area pinned, compact top-3 list on phones), seats, secondary committees and the evidence
   (rule cards, rejected rules, honest accuracy, watch list) collapsed below. A side sheet explains one area ("Why
   these odds?", with a what-if) or one committee ("Who could land here"). Every number comes from FCR.predict
   (odds / explain / whatIf / committee), so this page agrees with every other page; the default forecast is
   precomputed (instant). Hash changes inside the page (sheet open/close, theme toggle) update in place. */
(function () {
  'use strict';
  const FCR = window.FCR;
  const esc = FCR.esc, V = FCR.views, UI = FCR.ui, M = FCR.predict;
  const D = FCR.MODEL_DEFAULTS;
  const AN = () => FCR.RAW.analysis || {};
  const fmt = M.fmt;
  const pc = (x, d) => (x == null || isNaN(x) ? '—' : (x * 100).toFixed(d || 0) + '%');
  const frac = (x) => (x && x[1] ? `<strong>${x[0]}</strong> of ${x[1]}` : '—');
  const ab = (c) => esc(FCR.cabbr(c));
  const cn = (c) => esc(FCR.cname(c));
  const aShort = (a) => { const x = FCR.areas[a]; return esc(x ? x.short || x.name : ''); };
  const dot = (a) => UI.regionDot(M.regionOf(a));
  const termName = (a, p) => { const t = FCR.term(a, p); return t ? FCR.termName(t, p + 1950) || t.name || '' : ''; };
  const heat = (v) => (v >= 0.3 ? 6 : v >= 0.2 ? 5 : v >= 0.15 ? 4 : v >= 0.11 ? 3 : v >= 0.06 ? 2 : v > 0 ? 1 : 0);
  const isPhone = () => !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
  const pctTxt = (p) => { const f = fmt(p); return f === '–' ? f : f + '%'; };
  const tipPct = (v, se) => (v > 0 ? `${(v * 100).toFixed(1)}%${se ? ' ± ' + (se * 100).toFixed(1) : ''}` : 'no simulated draw put it here');
  const problems = {};
  const problem = (P) => problems[P] || (problems[P] = M.buildProblem(P));
  const SEC_KEYS = ['icrfRotation', 'archivesNeighbor']; // only change the secondary lists: primaries stay precomputed

  // ---------- the rule switchboard ----------
  // off = the setting that switches the rule off; def = strength used when a rule that is off by default is switched on.
  const RULES = [
    { key: 'excludeLast', label: 'Skip the committees the area held recently', kind: 'select', opts: [1, 2, 3, 4, 5].map((v) => [v, `last ${v} term${v > 1 ? 's' : ''}`]), off: 0, drop: 'exclude', card: 'skip',
      tip: 'Hard rule: a committee the area held in its last N terms is never drawn.' },
    { key: 'regionCap', label: 'New members per region on a committee', kind: 'select', opts: [[1, 'at most 1'], [2, 'at most 2']], off: 99, drop: 'region', card: 'region',
      tip: 'Hard rule within the new panel: at most this many new members from one region on one committee.' },
    { key: 'spreadPenalty', label: 'Spread regions across the whole committee', kind: 'range', min: 0.5, max: 8, step: 0.5, off: 0, drop: 'spread', card: 'spread',
      tip: 'Soft rule: each extra member from one region on a committee (both panels) makes a draw e^-x times as likely.' },
    { key: 'neighborPenalty', label: 'Keep neighbouring areas apart', kind: 'range', min: 0.5, max: 6, step: 0.5, off: 0, drop: 'neighbors', card: 'neighbors',
      tip: 'Soft rule: each neighbouring area on the same committee (both panels) makes a draw e^-x times as likely.' },
    { key: 'sameStatePenalty', label: 'Keep areas of one state or province apart', kind: 'range', min: 1, max: 12, step: 1, off: 0, drop: 'state', card: 'state',
      tip: 'Soft rule (strong enough to be nearly hard): each same-state/province member on the committee makes a draw e^-x times as likely.' },
    { key: 'capacity', label: 'Seats per committee', kind: 'select', fixed: true, opts: [['target', 'standard sizes'], ['replace', 'replace outgoing'], ['balance', 'balance totals']], card: 'seats',
      tip: 'standard sizes = standard committee size − continuing members; replace outgoing = as many as rotated off; balance totals = even committee sizes.' },
    { key: 'icrfRotation', label: 'IC/RF seat rotates within the region', kind: 'range', min: 0.2, max: 4, step: 0.2, off: 0, sec: true, card: 'icrf',
      tip: 'Secondary committee: an area that held IC/RF in its last 3 terms weighs e^-x (1.6 → 0.20).' },
    { key: 'archivesNeighbor', label: 'Archives keeps neighbours apart', kind: 'range', min: 0.5, max: 4, step: 0.5, off: 0, sec: true, card: 'archives',
      tip: 'Secondary committee: each neighbour pair among the new Archives members or with a continuing member weighs e^-x.' },
    { key: 'recency', label: 'Favour committees not held for a long time', kind: 'range', min: 0.5, max: 3, step: 0.5, off: 0, def: 1, card: 'rejected', rejected: true,
      tip: 'Tested and rejected (no gain): extra weight for committees the area has not held for many terms.' },
  ];
  const RULE = {}; RULES.forEach((r) => (RULE[r.key] = r));
  const dOn = (r) => r.fixed || String(D[r.key]) !== String(r.off);
  const okVal = (r, v) => (r.kind === 'select' ? r.opts.some((o) => String(o[0]) === String(v)) : typeof v === 'number' && v >= r.min && v <= r.max);
  function loadState(raw) {
    const s = raw || FCR.store.get('predict.v2', {}) || {}, on = {}, val = {};
    RULES.forEach((r) => {
      on[r.key] = r.fixed ? true : s.on && typeof s.on[r.key] === 'boolean' ? s.on[r.key] : dOn(r);
      const dv = dOn(r) ? D[r.key] : r.def != null ? r.def : r.min;
      val[r.key] = s.val && okVal(r, s.val[r.key]) ? s.val[r.key] : dv;
    });
    return { on, val };
  }
  const saveState = (st) => FCR.store.set('predict.v2', st);
  /** Effective rule settings from the switchboard state. */
  function settingsOf(st) { const o = M.settingsOf(D); RULES.forEach((r) => (o[r.key] = r.fixed || st.on[r.key] ? st.val[r.key] : r.off)); return o; }
  /** The scorecard's "skip last 1 term" for the hand-made draws (Panels <= 70): a page-local override that is never saved,
      so it can't leak into other panels (backtest() applies the same rule per panel). */
  const manualOn = () => !!(pg && pg.manual && pg.P <= 70);
  function effOf() { const e = settingsOf(pg.st); if (manualOn()) e.excludeLast = 1; return e; }
  const changed = (eff) => RULES.filter((r) => String(eff[r.key]) !== String(D[r.key]));
  const primOpts = (eff) => { const o = Object.assign({}, eff); SEC_KEYS.forEach((k) => (o[k] = D[k])); return o; };
  const valTxt = (r, v) => {
    if (r.kind === 'select') return '';
    if (r.key === 'icrfRotation') return `${v} <small>· weight ${Math.exp(-v).toFixed(2)}</small>`;
    if (r.key === 'recency') return String(v);
    const m = Math.exp(v); return `${v} <small>· ${m > 1000 ? '≈ never' : '×1/' + Math.round(m)}</small>`;
  };
  const ruleDesc = (r, v) => (r.kind === 'select' ? (r.opts.find((o) => String(o[0]) === String(v)) || [0, String(v)])[1] : v === r.off ? 'off' : String(v));

  // ---------- panels ----------
  function panelChoices() {
    const cyc = FCR.cycle(), today = FCR.today();
    const pend = FCR.predict.pendingPanels();
    const list = [...new Set(FCR.panels.concat(pend))].filter((p) => p >= (FCR.panels[0] || 0) + 2).sort((a, b) => b - a);
    // Default: the first pending panel whose first Conference hasn't ended (its draw is still news), else the newest.
    const def = FCR.predict.defaultPanel() || list[0];
    return { list, def, cyc, today };
  }
  /** Honest status of a panel's draw as of FCR.today(). */
  function panelNote(P) {
    const pr = problem(P), today = FCR.today(), y = P + 1949;
    if (Object.keys(pr.actual).length) return { short: 'actual known — compare', long: `Actual draw known (${P + 1950} Final Report) — compare it with the model`, known: true };
    if (today < new Date(y, 8, 1)) return { short: `delegates elected fall ${y} · draw Dec ${y}`, long: `Delegates are elected in fall ${y}; the committees are drawn by lot in December ${y}` };
    if (today < new Date(y, 11, 1)) return { short: `draw December ${y}`, long: `Delegates elected this fall; committees drawn by lot in December ${y}` };
    if (today < new Date(y + 1, 0, 1)) return { short: `being drawn December ${y}`, long: `Committees are being drawn by lot this December (${y})` };
    return { short: `drawn December ${y} — awaiting the ${y + 1} Final Report`, long: `Drawn by lot in December ${y}; the results are published in the ${y + 1} Final Report (areas often announce them sooner)` };
  }

  // ---------- page state + routing ----------
  let pg = null; // the mounted page: {el, root, P, pr, st, eff, res, sec, sort, q, misses, detail, pushed, ...}
  const hashFor = (P, req) => `#/predict/${P}` + (!req ? '' : req.kind === 'area' ? `/area/${req.id}${req.c ? '/' + req.c : ''}` : `/committee/${req.id}`);
  function parseReq(args) {
    if (args[1] === 'area' && args[2]) return { kind: 'area', id: +args[2], c: args[3] ? String(args[3]).toUpperCase() : null };
    if (args[1] === 'committee' && args[2]) return { kind: 'committee', id: String(args[2]).toUpperCase() };
    return null;
  }
  V.predict = function (el, args) {
    args = args || [];
    const ch = panelChoices();
    let P = +args[0]; if (!ch.list.includes(P)) P = ch.def;
    const req = parseReq(args);
    if (pg && pg.el === el && pg.root && el.contains(pg.root) && pg.P === P) { if (!req) pg.pushed = false; showDetail(req); return; }
    mount(el, P, ch);
    showDetail(req);
  };
  /** Open a detail sheet from a click: one history entry while the sheet is open (Back closes it). */
  function go(req) {
    const url = hashFor(pg.P, req);
    try { if (!pg.detail) { history.pushState(null, '', url); pg.pushed = true; } else history.replaceState(null, '', url); }
    catch (e) { location.hash = url; return; }
    showDetail(req);
  }
  function closeDetail() {
    if (pg.pushed) { pg.pushed = false; history.back(); return; } // the hashchange closes the sheet
    try { history.replaceState(null, '', hashFor(pg.P, null)); } catch (e) { /* ignore */ }
    showDetail(null);
  }
  window.addEventListener('hashchange', () => { if (!/^#\/predict/.test(location.hash)) document.documentElement.classList.remove('p-lock'); });
  window.addEventListener('resize', () => { if (alive()) { stickyTop(); fitHeat(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && alive() && pg.detail) closeDetail(); });

  /** Offset for page-level sticky headers: the sticky top bar + tab strip, whatever their height on this device. */
  function stickyTop() {
    let top = 0;
    ['.topbar', '#tabs'].forEach((s) => { const e = document.querySelector(s); if (!e) return; const cs = getComputedStyle(e); if (cs.position === 'sticky' || cs.position === 'fixed') top = Math.max(top, (parseFloat(cs.top) || 0) + e.offsetHeight); });
    pg.root.style.setProperty('--p-top', top + 'px');
  }
  const alive = () => !!(pg && pg.root && document.contains(pg.root));
  const $ = (s) => pg.root.querySelector(s);

  function mount(el, P, ch) {
    const pr = problem(P), note = panelNote(P);
    const keep = pg && pg.P === P ? pg : null;
    pg = { el, P, pr, ch, note, st: loadState(), sort: keep ? keep.sort : { k: 'area', dir: 1 }, q: '', misses: false, detail: null, pushed: false,
      timer: null, known: Object.keys(pr.actual).length > 0, full: !!FCR.store.get('predict.full', false), wi: {}, manual: !!(keep && keep.manual) };
    pg.eff = effOf();
    const custom = changed(pg.eff).length > 0;
    const el2 = FCR.electsFor(P) || {}, nElect = Object.values(el2).filter((e) => e.delegate).length;
    el.innerHTML = `<div id="p-root" class="p-root">
      <div class="page-head"><div><h1>Predict committee assignments</h1>
        <p>New delegates' Conference committees are <strong>drawn by lot each December</strong>, <em>“to replace outgoing delegates on each committee”</em> (Service Manual 2026–2028, p. 45).
        Nobody can know the result in advance, but ten years of rosters show the lot follows firm rules; the chances below come from simulating it many times.</p></div></div>
      <div class="p-bar">
        <label class="p-panel">Target panel <select id="p-panel">${ch.list.map((p) => `<option value="${p}" ${p === P ? 'selected' : ''}>Panel ${p} (${p + 1950}–${p + 1951}) — ${esc(panelNote(p).short)}</option>`).join('')}</select></label>
        <span class="p-status" id="p-status" role="status" aria-live="polite"></span>
      </div>
      <p class="small ink2 p-pnote">${esc(note.long)}.${nElect && !pg.known ? ` Delegate-elects known for ${nElect} of ${pr.areas.length} areas.` : ''}</p>
      <div id="p-custom"></div>
      <nav class="flex p-jump" aria-label="On this page"><span class="small muted">On this page:</span>${[['p-mine', 'Your area'], ['p-results', 'Area by area'], ['p-seats-h', 'Open seats'], ['p-sec-h', 'Secondary'], ['p-ev-h', 'Evidence']].concat(AN().watch_list ? [['p-watchc', 'Watch list']] : []).map(([id, l]) => `<button type="button" class="chip" data-jump="${id}">${l}</button>`).join('')}</nav>
      <div class="grid p-top">
        <section class="card p-mine" id="p-mine" aria-labelledby="p-mine-h"></section>
        <details class="card p-switch" id="p-switch" ${custom || !isPhone() ? 'open' : ''}><summary><span class="p-sum-t">Rules the lot follows</span> <span class="p-sum-c" id="p-sum-c"></span></summary><div id="p-rules"></div></details>
      </div>
      <div id="p-warn"></div>
      <div id="p-score"></div>
      <section class="p-results${pg.full ? ' p-full' : ''}" id="p-results" aria-labelledby="p-title">
        <div class="p-thead"><h2 class="section-title" id="p-title">Area by area</h2>
          <div class="p-tools">
            <input type="search" id="p-q" placeholder="Find an area…" aria-label="Filter areas">
            ${pg.known ? '<label class="p-chk"><input type="checkbox" id="p-misses"> misses only</label>' : ''}
            <span class="seg p-view" role="group" aria-label="Table view on phones"><button type="button" data-view="top" class="${pg.full ? '' : 'on'}">Top 3</button><button type="button" data-view="full" class="${pg.full ? 'on' : ''}">All 11</button></span>
          </div></div>
        <div class="p-legend" id="p-legend"></div>
        <div class="p-heat-wrap" id="p-heat-wrap"></div>
        <ul class="p-compact" id="p-compact"></ul>
        <p class="small muted p-caption" id="p-caption"></p>
      </section>
      <h2 class="section-title" id="p-seats-h">Open seats and continuing members</h2>
      <div id="p-seats"></div>
      <h2 class="section-title" id="p-sec-h">Secondary committees</h2>
      <div class="grid g3 p-sec" id="p-sec"></div>
      <h2 class="section-title" id="p-ev-h">Evidence</h2>
      <div id="p-evidence" class="p-evidence"><p class="muted small">Loading the evidence…</p></div>
      <aside class="p-sheet" id="p-sheet" role="dialog" aria-modal="false" aria-labelledby="p-sheet-h" hidden>
        <div class="p-sheet-head"><div class="p-sheet-t" id="p-sheet-t"></div><button type="button" class="icon-btn p-close" id="p-close" aria-label="Close panel">✕</button></div>
        <div class="p-sheet-body" id="p-sheet-body"></div></aside>
    </div>`;
    pg.root = el.querySelector('#p-root');
    stickyTop();
    wire();
    renderRules();
    // First paint: the precomputed table is instant; anything that needs a simulation runs after the page has painted.
    const fast = M.forecastValid(P) && M.sameSettings(primOpts(pg.eff), D);
    if (fast) { compute('interactive'); renderResults(); }
    else { setBusy(true); renderSkeleton(); setTimeout(() => { if (!alive()) return; compute('interactive'); renderResults(true); setBusy(false); }, 30); }
    setTimeout(() => { if (alive()) renderEvidence(); }, 0);
  }

  function compute(q) {
    pg.res = M.odds(pg.P, Object.assign({}, primOpts(pg.eff), { quality: q }));
    pg.sec = SEC_KEYS.every((k) => String(pg.eff[k]) === String(D[k])) ? pg.res.secondary : M.secondary(pg.pr, pg.eff);
    pg.quality = q;
  }
  /** Re-run after a rule change: labels update at once, results ~250 ms after the last change (quick preview while dragging on a phone). */
  function schedule(q, immediate) {
    pg.eff = effOf(); saveState(pg.st); updateChanged();
    clearTimeout(pg.timer); setBusy(true);
    pg.timer = setTimeout(() => { if (!alive()) return; compute(q); renderResults(q !== 'fast'); setBusy(false); }, immediate ? 0 : 250);
  }
  function setBusy(on) {
    pg.busy = on; pg.root.classList.toggle('p-busy', on);
    if (on) $('#p-status').innerHTML = '<span class="chip"><span class="p-spin" aria-hidden="true"></span> Updating…</span>'; else renderStatus();
  }
  function renderSkeleton() { $('#p-heat-wrap').innerHTML = '<div class="empty-state">Simulating the lot with your rules…</div>'; }
  function meanSe(r) { let n = 0, s = 0; if (r.se) Object.values(r.se).forEach((row) => Object.values(row).forEach((v) => { if (v > 0) { n++; s += v; } })); return n ? (s / n) * 100 : null; }
  function renderStatus() {
    const r = pg.res; if (!r) return;
    const se = meanSe(r), seT = se == null ? '?' : se < 0.095 ? se.toFixed(2) : se.toFixed(1);
    $('#p-status').innerHTML = r.precomputed
      ? `<span class="chip good" tabindex="0" data-tip="Precomputed offline with the default rules (model ${esc(r.modelVersion)}, ${esc(r.generated || '')}); every page shows these same numbers.">✓ Precomputed · ${r.draws.toLocaleString()} draws${se != null ? ` · ±${seT} pt` : ''}</span>`
      : `<span class="chip" tabindex="0" data-tip="Simulated in your browser with these rules (${r.ms} ms, ${r.chains} chains). Approximate: a typical cell moves about ±${seT} points between runs.">Live run${pg.quality === 'fast' ? ' (quick preview)' : ''} · ${r.draws.toLocaleString()} draws · approx. ±${seT} pt</span>`;
  }
  function renderCustom() {
    const ch = changed(pg.eff);
    $('#p-custom').innerHTML = ch.length ? `<div class="callout p-customc"><strong>Custom rules</strong> (${ch.length} changed from the defaults): ${ch.map((r) => `${esc(r.label)} <strong>${esc(ruleDesc(r, pg.eff[r.key]))}</strong> <span class="muted">(default ${esc(ruleDesc(r, D[r.key]))}${r.key === 'excludeLast' && manualOn() ? `; manual-draw rule for Panel ${pg.P} only, not saved` : ''})</span>`).join(' · ')}.
      ${ch.every((r) => r.sec) ? 'Only the secondary committees change.' : 'These odds are a live, approximate run, not the precomputed forecast.'} <button type="button" class="btn" data-reset>Reset to defaults</button></div>` : '';
  }
  function updateChanged() {
    const n = changed(pg.eff).length;
    $('#p-sum-c').innerHTML = `<span class="chip${n ? ' accent' : ''}">${n ? n + ' changed from defaults' : 'all at defaults'}</span>`;
    const c = $('#p-changed'); if (c) c.textContent = `Changed from defaults: ${n}`;
    const b = $('#p-reset'); if (b) b.disabled = !n;
    pg.root.querySelectorAll('.p-rule').forEach((row) => { const r = RULE[row.dataset.k]; row.classList.toggle('changed', String(pg.eff[r.key]) !== String(D[r.key])); row.classList.toggle('off', !pg.st.on[r.key]); });
    renderCustom();
  }

  // ---------- switchboard ----------
  /** What a rule is worth, from the offline ablation in analysis.json (in-sample, Panels 71-76). */
  function worth(r) {
    const an = AN(), base = ((an.backtest || {}).defaults || {}).recent || (an.forward_chained || {}).in_sample_defaults;
    if (r.drop) {
      const d = ((an.ablation || {}).drop_one || []).find((x) => x.drop === r.drop);
      if (!d || !base) return '';
      const tip = `In-sample, Panels 71–76 (${base.n} areas), all other rules on. Mean chance on the actual committee ${pc(base.meanP, 1)} → ${pc(d.meanP, 1)}; log score ${base.logLik.toFixed(3)} → ${d.logLik.toFixed(3)}.`;
      return `<span tabindex="0" data-tip="${esc(tip)}">Without it: top-1 ${pc(base.top1)} → ${pc(d.top1)} · top-3 ${pc(base.top3)} → ${pc(d.top3)}</span>`;
    }
    if (r.key === 'capacity') {
      const s = (an.seats || {}).backtest_recent; if (!s || !s.target) return '';
      return `Top-3: standard sizes ${pc(s.target.top3)} · replace ${pc(s.replace.top3)} · balance ${pc(s.balance.top3)}. Standard sizes matched ${frac(an.seats.target_matches)} committee-panels, replace ${frac(an.seats.replace_matches)}.`;
    }
    if (r.key === 'icrfRotation') {
      const x = an.icrf_rotation || {}, h = x.recent_holder_picks_unforced, f = ((x.forward || {}).logLik_per_slot) || {};
      return h ? `Recent holders drew ${h[0]} of ${(x.slots || 0) - (x.forced_slots || 0) || 32} open seats vs ${h[1].toFixed(1)} by chance${f.uniform ? `; forward log score per seat ${f.uniform} → ${f.rotation_default}` : ''}.` : '';
    }
    if (r.key === 'archivesNeighbor') {
      const x = (an.archives_neighbor || {}).since_panel_72;
      return x ? `${x.observed_pairs} neighbour pairs in Panels ${x.panels} vs ${x.expected_uniform.toFixed(1)} by chance (mild: a stronger fit was overfit).` : '';
    }
    if (r.key === 'recency') {
      const x = (an.rejected_rules || []).find((y) => /recency|long unheld/i.test(y.rule));
      return x ? `Tested and rejected: log score ${x.dLogLik >= 0 ? '+' : ''}${x.dLogLik} (noise).` : 'Tested and rejected.';
    }
    return '';
  }
  function ruleRow(r) {
    const man = r.key === 'excludeLast' && manualOn();
    const on = man || pg.st.on[r.key], v = man ? 1 : pg.st.val[r.key], id = 'p-r-' + r.key;
    const ctl = r.kind === 'select'
      ? `<select id="${id}" data-val="${r.key}" aria-label="${esc(r.label)}" ${on ? '' : 'disabled'}>${r.opts.map((o) => `<option value="${o[0]}" ${String(o[0]) === String(v) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`
      : `<input type="range" id="${id}" data-val="${r.key}" min="${r.min}" max="${r.max}" step="${r.step}" value="${v}" aria-label="${esc(r.label)} strength" ${on ? '' : 'disabled'}><output for="${id}" id="${id}-o">${valTxt(r, v)}</output>`;
    const lab = r.fixed ? `<span class="p-rl p-rl-fixed" data-tip="${esc(r.tip)}" tabindex="0">${esc(r.label)}</span>`
      : `<label class="p-sw" data-tip="${esc(r.tip)}"><input type="checkbox" data-on="${r.key}" ${on ? 'checked' : ''}><span class="p-sw-ui" aria-hidden="true"></span><span class="p-rl">${esc(r.label)}${r.rejected ? ' <span class="badge">rejected</span>' : ''}${r.sec ? ' <span class="badge">secondary</span>' : ''}</span></label>`;
    return `<div class="p-rule${on ? '' : ' off'}" data-k="${r.key}"><div class="p-rtop">${lab}<span class="p-rctl">${ctl}</span></div>
      <div class="p-worth">${man ? `<strong>Manual-draw rule for Panel ${pg.P} only (not saved).</strong> ` : ''}${worth(r)} <a href="#/predict" data-card="${r.card}">evidence</a></div></div>`;
  }
  function renderRules() {
    $('#p-rules').innerHTML = `<div class="p-rhead"><span class="small ink2" id="p-changed"></span><button type="button" class="btn" id="p-reset">Reset to defaults</button></div>
      <div class="p-rlist">${RULES.map(ruleRow).join('')}</div>
      <p class="small muted p-rfoot">Results update about ¼ second after each change. With every rule at its default the page shows the precomputed forecast; any other setting runs a fresh, approximate simulation in your browser (≈0.2 s). Your settings are remembered on this device and change only this page.</p>`;
    updateChanged();
  }
  function resetRules() { pg.st = loadState({}); pg.manual = false; saveState({}); renderRules(); schedule('interactive', true); }

  // ---------- events (delegated; wired once per mount) ----------
  function wire() {
    const R = pg.root;
    R.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'p-panel') { location.hash = '#/predict/' + t.value; return; }
      if (t.id === 'p-myarea') { FCR.store.set('myArea', +t.value); renderMine(); renderHeat(); return; }
      if (t.id === 'p-misses') { pg.misses = t.checked; renderHeat(); return; }
      if (t.id === 'p-wi-c') { if (!pg.detail) return; pg.detail.c = t.value; pg.wi = { a: pg.detail.id, c: t.value }; try { history.replaceState(null, '', hashFor(pg.P, pg.detail)); } catch (er) { /* ignore */ } renderWhatIf(pg.detail.id, t.value); return; }
      if ((t.dataset.on || t.dataset.val) === 'excludeLast' && pg.manual) { pg.manual = false; pg.st.on.excludeLast = true; }
      if (t.dataset.on) { const k = t.dataset.on; pg.st.on[k] = t.checked; const c = $('#p-r-' + k); if (c) c.disabled = !t.checked; schedule('interactive'); return; }
      if (t.dataset.val) { const r = RULE[t.dataset.val]; if (r.kind === 'select') { pg.st.val[r.key] = typeof D[r.key] === 'number' || r.key === 'regionCap' ? +t.value : t.value; schedule('interactive'); } else { pg.st.val[r.key] = +t.value; schedule('interactive'); } }
    });
    R.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'p-q') { pg.q = t.value; renderHeat(); return; }
      if (t.dataset.val && t.type === 'range') { const r = RULE[t.dataset.val]; pg.st.val[r.key] = +t.value; const o = $('#' + t.id + '-o'); if (o) o.innerHTML = valTxt(r, +t.value); schedule(isPhone() ? 'fast' : 'interactive'); }
    });
    R.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('#p-reset') || t.closest('[data-reset]')) { resetRules(); return; }
      if (t.closest('#p-close')) { closeDetail(); return; }
      const jb = t.closest('[data-jump]'); if (jb) { jumpTo($('#' + jb.dataset.jump)); return; }
      const card = t.closest('[data-card]'); if (card) { e.preventDefault(); openCard(card.dataset.card); return; }
      const vb = t.closest('.p-view button'); if (vb) { pg.full = vb.dataset.view === 'full'; FCR.store.set('predict.full', pg.full); $('#p-results').classList.toggle('p-full', pg.full); R.querySelectorAll('.p-view button').forEach((b) => b.classList.toggle('on', b === vb)); return; }
      const man = t.closest('[data-manual]'); if (man) { pg.manual = true; renderRules(); schedule('interactive', true); return; }
      const bt = t.closest('#p-bt'); if (bt) { runBacktest(); return; }
      const srt = t.closest('[data-sort]');
      if (srt) {
        const k = srt.dataset.sort; pg.sort = { k, dir: pg.sort.k === k ? -pg.sort.dir : 1 }; renderHeat();
        const again = R.querySelector(`[data-sort="${k}"]`); if (again) again.focus();
        if (k.startsWith('c:') && !(e.ctrlKey || e.metaKey)) go({ kind: 'committee', id: k.slice(2) });
        return;
      }
      const g = t.closest('[data-go]');
      if (g && !(e.ctrlKey || e.metaKey || e.shiftKey || e.button)) { e.preventDefault(); const [kind, id, c] = g.dataset.go.split(':'); go(kind === 'area' ? { kind, id: +id, c: c || null } : { kind, id }); return; }
      // heat table: a click anywhere on a row explains that area (a committee cell also preselects the what-if)
      const tr = t.closest('#p-heat tbody tr[data-a]');
      if (tr && !t.closest('a')) { const td = t.closest('td[data-c]'); go({ kind: 'area', id: +tr.dataset.a, c: td ? td.dataset.c : null }); }
    });
    R.addEventListener('keydown', (e) => {
      const cellEl = e.target.closest && e.target.closest('#p-heat tbody [data-nav]');
      if (!cellEl) return;
      const rows = [...R.querySelectorAll('#p-heat tbody tr[data-a]')];
      const tr = cellEl.closest('tr'), ri = rows.indexOf(tr), cells = [...tr.querySelectorAll('[data-nav]')], ci = cells.indexOf(cellEl);
      let to = null;
      if (e.key === 'ArrowRight') to = cells[ci + 1]; else if (e.key === 'ArrowLeft') to = cells[ci - 1];
      else if (e.key === 'ArrowDown' && rows[ri + 1]) to = rows[ri + 1].querySelectorAll('[data-nav]')[ci];
      else if (e.key === 'ArrowUp' && rows[ri - 1]) to = rows[ri - 1].querySelectorAll('[data-nav]')[ci];
      else if (e.key === 'Home') to = cells[0]; else if (e.key === 'End') to = cells[cells.length - 1];
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go({ kind: 'area', id: +tr.dataset.a, c: cellEl.dataset.c || null }); return; }
      if (to) { e.preventDefault(); cellEl.tabIndex = -1; to.tabIndex = 0; to.focus(); }
    });
    $('#p-sheet').addEventListener('scroll', () => UI.hideTip && UI.hideTip(), { passive: true });
  }
  /** Scroll a section to just below the sticky top bar + tabs (closing the full-screen sheet on phones first). The
      offset comes from app.css's scroll-margin-top on main [id] / main .card (--stick-top), so no extra scrollBy. */
  function jumpTo(el) {
    if (!el) return;
    if (pg.detail && isPhone()) closeDetail();
    el.scrollIntoView({ block: 'start' });
  }
  /** Open the "Why these rules" cards and bring one into view. */
  function openCard(id) {
    const box = $(id === 'rejected' ? '#p-rej' : '#p-why'); if (!box) return;
    box.open = true;
    const c = $('#p-card-' + id) || box;
    jumpTo(c);
    c.classList.add('p-flash'); setTimeout(() => c.classList.remove('p-flash'), 1600);
  }

  // ---------- shared facts per area × committee ----------
  const excludedSet = (a) => M.recentCommittees(pg.pr.history[a] || [], pg.P, pg.eff.excludeLast);
  /** Continuing (Panel P-1) members of committee c that share a region, a border or a state with area a. */
  function contFlags(a, c) {
    const g = M.regionOf(a), s = M.stateOf(a);
    return (pg.pr.cont[c] || []).map((b) => ({ b, name: termName(b, pg.P - 1), rg: M.regionOf(b) === g, nb: FCR.isNeighbor(a, b), st: M.stateOf(b) === s })).filter((x) => x.rg || x.nb || x.st);
  }
  const flagWord = (x) => (x.st ? 'same-state' : x.nb && x.rg ? 'neighbouring' : x.nb ? 'neighbouring (across a region line)' : 'same-region');
  const markOf = (fl) => (fl.some((x) => x.st) ? 'ˢ' : fl.some((x) => x.nb) ? 'ⁿ' : fl.length ? 'ʳ' : '');
  function heldText(a, c) {
    const h = (pg.pr.history[a] || []).filter((x) => x.committee === c && x.panel >= pg.P - 2 * pg.eff.excludeLast);
    return h.map((x) => `Panel ${x.panel}${termName(a, x.panel) ? ' (' + termName(a, x.panel) + ')' : ''}`).join(', ');
  }
  function reasons(a, c, excl) {
    const out = [];
    if (excl.has(c)) out.push(`held by Area ${a} in ${heldText(a, c)} — ruled out by the skip rule`);
    contFlags(a, c).forEach((x) => out.push(`${flagWord(x)} Area ${x.b}${x.name ? ' (' + x.name + ')' : ''} continues here`));
    return out;
  }
  const bar = (p) => `<span class="p-track" aria-hidden="true"><i style="width:${Math.min(100, (p || 0) * 100).toFixed(1)}%"></i></span>`;

  function renderResults(refreshDetail) {
    renderStatus(); renderCustom(); renderMine(); renderWarn(); renderScore(); renderHeat(); renderSeats(); renderSec();
    if (refreshDetail && pg.detail) showDetail(pg.detail, true);
  }

  // ---------- "Your area" ----------
  function renderMine() {
    const box = $('#p-mine'), P = pg.P, pr = pg.pr, res = pg.res;
    const n = +FCR.store.get('myArea', 65);
    const sel = `<select id="p-myarea" aria-label="Your area">${FCR.areaList.map((x) => `<option value="${x.n}" ${x.n === n ? 'selected' : ''}>Area ${x.n} · ${esc(x.name)}</option>`).join('')}</select>`;
    const head = `<div class="p-mine-h"><h2 id="p-mine-h">Your area</h2>${sel}</div>`;
    if (!res) { box.innerHTML = head; return; }
    if (!pr.areas.includes(n)) {
      const np = UI.predictPanelFor ? UI.predictPanelFor(n) : null;
      box.innerHTML = `${head}<p>Area ${n} isn't in Panel ${P}'s lot: its delegates serve in ${FCR.areaParity(n) === 1 ? 'odd' : 'even'}-numbered panels.</p>
        ${np && np !== P && pg.ch.list.includes(np) ? `<p><a href="#/predict/${np}/area/${n}">See Area ${n} in Panel ${np} →</a></p>` : ''}`;
      return;
    }
    const p = res.probs[n] || {}, se = res.se ? res.se[n] : null, top = res.top[n], excl = excludedSet(n);
    const t = FCR.term(n, P), el = FCR.electsFor(P)[n];
    const who = t ? t.name : el && el.delegate ? el.delegate : null;
    const whoTxt = who ? `${pg.known ? 'Panel ' + P + ' delegate' : 'Panel ' + P + ' delegate-elect'} <strong>${esc(who)}</strong>` : `Panel ${P} delegate`;
    const ranked = pr.committees.filter((c) => p[c] > 0).sort((x, y) => p[y] - p[x]);
    let verdict = '';
    if (top) {
      const tied = top.nearTie ? top.tied.slice(0, 3) : [top.c];
      verdict = top.nearTie
        ? `Most likely ${tied.map((c) => `<strong>${cn(c)}</strong> ${fmt(p[c])}%`).join(' <span class="p-tie">≈</span> ')} — a near-tie: the model can't separate ${tied.length > 2 ? 'them' : 'the two'}.`
        : `Most likely <strong>${cn(top.c)}</strong> ${fmt(top.p)}%${top.second ? `, then ${cn(top.second)} ${fmt(top.p2)}%` : ''}.`;
    }
    const exList = [...excl].map((c) => `<span class="nowrap"><span class="badge p-strike">${ab(c)}</span> <span class="small muted">${esc(heldText(n, c))}</span></span>`);
    const less = pr.committees.filter((c) => !excl.has(c)).map((c) => ({ c, fl: contFlags(n, c) })).filter((x) => x.fl.length);
    const act = pr.actual[n];
    const actRank = act ? 1 + pr.committees.filter((c) => (p[c] || 0) > (p[act] || 0)).length : null;
    box.innerHTML = `${head}
      <p class="small ink2 p-who">${UI.regionDot(M.regionOf(n))} ${esc(FCR.regionName(M.regionOf(n)))} region · ${whoTxt} · ${pg.known ? `committee drawn December ${P + 1949}` : esc(pg.note.short)}</p>
      ${act ? `<p class="p-actual">Actual: <strong>${cn(act)}</strong> — the model gave it ${fmt(p[act])}% (#${actRank} of ${pr.committees.length}).</p>` : ''}
      <p class="p-verdict">${verdict}</p>
      <div class="p-bars">${ranked.slice(0, 5).map((c) => `<div class="p-brow"><span class="p-bn">${cn(c)}</span>${bar(p[c])}<span class="p-bv num" data-tip="${esc(cn(c) + ': ' + tipPct(p[c], se && se[c]))}">${fmt(p[c])}%${se && se[c] ? ` <small>±${(se[c] * 100).toFixed(1)}</small>` : ''}</span></div>`).join('')}</div>
      ${exList.length ? `<p class="small p-mine-l"><strong>Ruled out</strong> (held in the last ${pg.eff.excludeLast} terms): ${exList.join(' · ')}</p>` : ''}
      ${less.length ? `<p class="small p-mine-l"><strong>Less likely</strong>: ${less.map((x) => `${ab(x.c)} — ${x.fl.map((f) => `${flagWord(f)} Area ${f.b}${f.name ? ' (' + esc(f.name) + ')' : ''}`).join(', ')} continues`).join('; ')}.</p>` : ''}
      <p class="p-mine-links"><a href="${hashFor(P, { kind: 'area', id: n })}" data-go="area:${n}">Why these odds? →</a>
        ${top ? `<a href="${hashFor(P, { kind: 'area', id: n, c: top.c })}" data-go="area:${n}:${top.c}">What if ${esc(who || 'Area ' + n)} draws ${cn(top.c)}? →</a>` : ''}
        <a href="#/area/${n}">Area ${n} page →</a></p>`;
  }

  // ---------- input gaps, scorecard ----------
  function renderWarn() {
    const pr = pg.pr, P = pg.P;
    const gaps = pg.known ? [] : [!pr.outKnown && `Panel ${P - 2}'s committees (the seats being vacated) — seats are estimated by balancing committee totals`,
      !pr.histKnown && `the areas' Panel ${P - 2} committees — the skip rule only sees older terms`, !pr.contKnown && `Panel ${P - 1}'s committees (the continuing members)`].filter(Boolean);
    $('#p-warn').innerHTML = gaps.length ? `<div class="callout warn">Some inputs aren't in the loaded reports yet: ${gaps.map(esc).join('; ')}. Add the newer Final Report(s) for sharper odds.</div>` : '';
  }
  function renderScore() {
    const box = $('#p-score'); if (!pg.known) { box.innerHTML = ''; return; }
    const pr = pg.pr, res = pg.res, sc = M.scoreProbs(pr, res.probs), n = sc.n || 1;
    const rows = pr.areas.filter((a) => pr.actual[a]);
    const held = rows.filter((a) => !excludedSet(a).has(pr.actual[a])).length;
    const drawHit = res.lineup ? rows.filter((a) => res.lineup[a] === pr.actual[a]).length : null;
    const newBy = {}; rows.forEach((a) => (newBy[pr.actual[a]] = (newBy[pr.actual[a]] || 0) + 1));
    const seatHit = pr.committees.filter((c) => Math.round(res.seats[c] || 0) === (newBy[c] || 0)).length;
    const misses = rows.filter((a) => 1 + pr.committees.filter((c) => (res.probs[a][c] || 0) > (res.probs[a][pr.actual[a]] || 0)).length > 3).length;
    const st = (v, l, tip) => `<div class="p-stat" ${tip ? `tabindex="0" data-tip="${esc(tip)}"` : ''}><span class="v num">${v}</span><span class="l">${l}</span></div>`;
    box.innerHTML = `<section class="card p-scorecard" aria-label="Scorecard"><h3>Panel ${pg.P} scorecard <span class="small muted">actual draw from the ${pg.P + 1950} Final Report · ${sc.n} areas</span></h3>
      <div class="p-stats">
        ${st(pc(sc.t1 / n), '#1 pick was right', 'Ties split the credit.')}
        ${st(pc(sc.t3 / n), 'actual in the top 3')}
        ${st(pc(sc.sumP / n), `average chance on the actual committee (1 in ${pr.committees.length} = ${pc(1 / pr.committees.length)})`)}
        ${st(`${held}/${rows.length}`, `skip rule held (last ${pg.eff.excludeLast} terms)`)}
        ${st(`${seatHit}/${pr.committees.length}`, 'committees got the predicted number of seats')}
        ${drawHit != null ? st(`${drawHit}/${rows.length}`, 'example draw matched') : ''}
        ${st(misses, 'misses (actual not in the top 3)', 'Tick "misses only" above the table to list them.')}
      </div>
      <p class="small muted">In-sample: the rules were found in these same panels, so this flatters the model — see “How accurate is it?” below for honest out-of-sample numbers.
      ${pg.P <= 70 && pg.eff.excludeLast > 1 ? `<br><strong>Note:</strong> the December 2019 draw (Panel 70) and earlier were made by hand and skipped only the previous committee. <button type="button" class="btn" data-manual>Use “skip last 1 term”</button>` : ''}</p></section>`;
  }

  // ---------- heat table + phone list ----------
  function rowData() {
    const pr = pg.pr, res = pg.res, elects = FCR.electsFor(pg.P);
    return pr.areas.map((a) => {
      const p = res.probs[a] || {}, act = pr.actual[a];
      return { a, p, se: res.se ? res.se[a] : null, top: res.top[a], excl: excludedSet(a), hist: pr.history[a] || [], act,
        actRank: act ? 1 + pr.committees.filter((c) => (p[c] || 0) > (p[act] || 0)).length : null,
        draw: res.lineup ? res.lineup[a] : null, elect: !pg.known && elects[a] && elects[a].delegate ? elects[a].delegate : null };
    });
  }
  function sortRows(rows) {
    const { k, dir } = pg.sort;
    const key = k === 'top' ? (r) => -(r.top ? r.top.p : 0) : k === 'actual' ? (r) => (r.act ? r.p[r.act] || 0 : 9) : k === 'draw' ? (r) => (r.draw ? FCR.cname(r.draw) : 'zz')
      : k.startsWith('c:') ? (r) => (r.excl.has(k.slice(2)) ? 1 : -(r.p[k.slice(2)] || 0)) : (r) => r.a;
    return rows.slice().sort((x, y) => { const a = key(x), b = key(y); return a < b ? -dir : a > b ? dir : x.a - y.a; });
  }
  function filterRows(rows) {
    const q = FCR.fold(pg.q);
    return rows.filter((r) => {
      if (pg.misses && !(r.act && r.actRank > 3)) return false;
      if (!q) return true;
      const x = FCR.areas[r.a] || {};
      return String(r.a) === q || FCR.fold([x.name, x.short, x.state, FCR.regionName(x.region), 'area ' + r.a, r.elect].join(' ')).includes(q);
    });
  }
  function topCell(r) {
    if (!r.top) return '';
    const tied = r.top.nearTie ? r.top.tied.slice(0, 3) : [r.top.c];
    return tied.map((c, i) => `${i ? '<span class="p-tie" title="near-tie: within 3 points">≈</span> ' : ''}<strong>${ab(c)}</strong> <span class="muted">${fmt(r.p[c])}</span>`).join(' ');
  }
  function cell(r, c) {
    const v = r.p[c] || 0, ex = r.excl.has(c), fl = contFlags(r.a, c), mk = markOf(fl), s = ex ? 0 : heat(v);
    const why = reasons(r.a, c, r.excl);
    const tip = `Area ${r.a} · ${FCR.cname(c)}: ${ex ? 'ruled out' : tipPct(v, r.se && r.se[c])}${why.length ? ' — ' + why.join('; ') : ''}${pg.known && r.act === c ? ' · ACTUAL' : ''}`;
    const cls = `h p-h${s}${ex ? ' p-x' : ''}${pg.known && r.act === c ? ' p-act' : ''}`;
    return `<td class="${cls}" data-c="${c}" data-nav tabindex="-1" data-tip="${esc(tip)}">${ex ? '✕' : fmt(v)}${mk ? `<i class="p-mk" aria-hidden="true">${mk}</i>` : ''}</td>`;
  }
  /** When the whole table fits, let the page scroll it (so its header sticks under the tabs); otherwise scroll sideways with a sticky Area column. */
  function fitHeat() {
    const w = $('#p-heat-wrap'), t = $('#p-heat'); if (!w || !t) return;
    w.classList.remove('p-fit');
    if (t.offsetWidth <= w.clientWidth + 1 && !isPhone()) w.classList.add('p-fit');
  }
  function renderHeat() {
    if (!pg.res) return;
    const pr = pg.pr, cols = pr.committees, mine = +FCR.store.get('myArea', 65);
    const all = rowData(), pinned = all.filter((r) => r.a === mine);
    const rows = pinned.concat(filterRows(sortRows(all.filter((r) => r.a !== mine))));
    // natural order: highest chance first for Most likely and committees; misses first / A-Z for Actual and Example draw
    const sortTh = (k, label, cls, tip) => { const on = pg.sort.k === k, asc = k === 'actual' || k === 'draw'; return `<th scope="col" class="${cls || ''}" aria-sort="${on ? ((pg.sort.dir > 0) !== asc ? 'descending' : 'ascending') : 'none'}"><button type="button" class="thbtn" data-sort="${k}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${label}${on ? (pg.sort.dir > 0 ? ' ▾' : ' ▴') : ''}</button></th>`; };
    const areaTh = (() => { const on = pg.sort.k === 'area'; return `<th scope="col" class="p-sticky" aria-sort="${on ? (pg.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="thbtn" data-sort="area">Area${on ? (pg.sort.dir > 0 ? ' ▴' : ' ▾') : ''}</button></th>`; })();
    const seatsOf = (c) => { const v = pg.res.seats[c] || 0; return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1); };
    const head = `<tr>${areaTh}${sortTh('top', 'Most likely', '', 'Sort by the chance of each area\'s top committee')}${pg.known ? sortTh('actual', 'Actual', '', 'Sort by the chance the model gave the actual committee (misses first)') : ''}
      ${cols.map((c) => sortTh('c:' + c, `${ab(c)}<span class="p-seat">${seatsOf(c)} seats</span>`, 'n p-ch', `${FCR.COMMITTEES[c].name}: ${seatsOf(c)} new seats. Click to sort by it and see who could land there.`)).join('')}
      ${sortTh('draw', 'Example<br>full draw', 'p-drawh', 'One complete draw that obeys every rule at once')}<th scope="col">History <span class="muted">(old → new)</span></th></tr>`;
    const body = rows.map((r) => `<tr data-a="${r.a}" class="${r.a === mine ? 'mine' : ''}${pg.known && r.actRank > 3 ? ' p-missrow' : ''}">
      <th scope="row" class="p-sticky"><button type="button" class="p-abtn" data-nav tabindex="${r === rows[0] ? 0 : -1}" aria-label="Why these odds for Area ${r.a}?">${dot(r.a)} <span class="p-an" title="Area ${r.a} · ${aShort(r.a)}">Area ${r.a} · ${aShort(r.a)}</span></button>${r.a === mine ? '<span class="p-vh"> (your area)</span>' : ''}${r.elect ? `<span class="p-elect">elect: ${esc(r.elect)}</span>` : ''}</th>
      <td class="p-topc">${topCell(r)}</td>
      ${pg.known ? `<td class="p-actc${r.actRank > 3 ? ' p-miss' : ''}">${r.act ? `<strong>${ab(r.act)}</strong> <span class="muted">${fmt(r.p[r.act])} · #${r.actRank}</span>${r.excl.has(r.act) ? ' <span class="badge rot">was ruled out</span>' : ''}` : ''}</td>` : ''}
      ${cols.map((c) => cell(r, c)).join('')}
      <td>${r.draw ? `<span class="chip" data-tip="${esc(FCR.cname(r.draw))} in the example full draw${pg.known && r.draw === r.act ? ' — matches the actual draw' : ''}">${ab(r.draw)}${pg.known && r.draw === r.act ? ' ✓' : ''}</span>` : ''}</td>
      <td class="p-hist">${r.hist.map((h) => `<span class="badge${r.excl.has(h.committee) ? ' p-strike' : ''}" data-tip="Panel ${h.panel}: ${esc(FCR.cname(h.committee))}${termName(r.a, h.panel) ? ' (' + esc(termName(r.a, h.panel)) + ')' : ''}${r.excl.has(h.committee) ? ' — skipped this time' : ''}">${ab(h.committee)}</span>`).join(' ') || '<span class="muted small">—</span>'}</td></tr>`).join('');
    $('#p-heat-wrap').innerHTML = `<table class="t compact p-heat" id="p-heat"><caption class="p-vh">Chance (%) of each committee for each area in Panel ${pg.P}</caption><thead>${head}</thead><tbody>${body || `<tr><td colspan="${cols.length + 5}">${UI.empty('No area matches.')}</td></tr>`}</tbody></table>`;
    $('#p-compact').innerHTML = rows.map((r) => {
      const ranked = cols.filter((c) => r.p[c] > 0).sort((x, y) => r.p[y] - r.p[x]).slice(0, 3);
      return `<li class="${r.a === mine ? 'mine' : ''}"><button type="button" class="p-crow" data-go="area:${r.a}">
        <span class="p-cn">${dot(r.a)} Area ${r.a} · ${aShort(r.a)}${r.a === mine ? ' <span class="badge">yours</span>' : ''}${r.elect ? ` <span class="p-elect">${esc(r.elect)}</span>` : ''}</span>
        <span class="p-ctop">${ranked.map((c, i) => `<span class="p-cc p-h${heat(r.p[c])}${pg.known && r.act === c ? ' p-act' : ''}">${i && r.top && r.top.nearTie && r.top.tied.includes(c) ? '≈ ' : ''}${ab(c)} ${fmt(r.p[c])}</span>`).join('')}
        ${pg.known && r.act ? `<span class="p-cc p-cact${r.actRank > 3 ? ' p-miss' : ''}">actual ${ab(r.act)} #${r.actRank}</span>` : ''}</span></button></li>`;
    }).join('') || `<li>${UI.empty('No area matches.')}</li>`;
    fitHeat();
    const k = pg.eff.excludeLast;
    $('#p-legend').innerHTML = `<span class="p-scale" aria-label="Shading: chance of the committee">${[[1, '<6'], [2, '6–11'], [3, '11–15'], [4, '15–20'], [5, '20–30'], [6, '30+']].map(([s, l]) => `<span class="p-h${s}">${l}%</span>`).join('')}</span>
      ${k ? `<span class="p-lgf"><b>✕</b> held in its last ${k} term${k > 1 ? 's' : ''} (ruled out)</span>` : ''}<span class="p-lgf"><b>–</b> no simulated draw</span><span><b>&lt;1</b> under 0.5%</span>
      <span class="p-lgf"><b>ⁿ</b> a neighbouring area continues there</span><span class="p-lgf"><b>ʳ</b> a same-region area continues</span><span class="p-lgf"><b>ˢ</b> a same-state/province area continues</span><span><b>≈</b> near-tie (top two within 3 points)</span>
      ${pg.known ? '<span><b class="p-act-k">&nbsp;</b> actual committee</span>' : ''}<span class="p-lgc">Tap an area for all 11 committees and the reasons.</span>`;
    $('#p-caption').innerHTML = `Each number is the chance (%) that the area's new delegate is drawn onto that committee; hover or focus a cell for ± and the reasons. <strong>Example full draw</strong> = one complete draw that obeys every rule at once — it can differ from an area's own most likely committee, because the ${pr.areas.length} areas can't all get their favourite.
      Click an area (or press Enter on a cell) for “Why these odds?”; click a committee heading to sort by it and see who could land there.${pg.res.relaxRate > 0.005 ? ` Constraints had to be relaxed for ${(pg.res.relaxRate * 100).toFixed(1)}% of starting placements.` : ''}`;
  }

  // ---------- seats ----------
  function capacityRule() {
    const pr = pg.pr, s = pg.res.seats;
    if (pg.res.capacityRule) return pg.res.capacityRule;
    if (pr.committees.every((c) => pr.target[c] != null && Math.abs((s[c] || 0) - (pr.target[c] - pr.cont[c].length)) < 0.01)) return 'target';
    return pg.eff.capacity === 'target' ? (pr.outKnown ? 'replace' : 'balance') : pg.eff.capacity; // 'target' fell back
  }
  function renderSeats() {
    const pr = pg.pr, P = pg.P, res = pg.res, rule = capacityRule();
    const seatTxt = (c) => { const v = res.seats[c] || 0; return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1); };
    const who = (a, p) => `<span class="nowrap" data-tip="${esc(FCR.areaLabel(a))}${termName(a, p) ? ' · ' + esc(termName(a, p)) : ''}">${dot(a)} A${a}${termName(a, p) ? ` <span class="muted">${esc(termName(a, p))}</span>` : ''}</span>`;
    $('#p-seats').innerHTML = `<p class="small ink2">${rule === 'target' ? `Each committee is refilled to its <strong>standard size</strong> (its most common size before the draw: 8 or 9), so new seats = standard size − continuing members.` : rule === 'replace' ? 'New seats = the outgoing members on each committee (reconciled to the panel size).' : 'Seats balance the committee totals (average per draw).'} Click a committee for “Who could land here”.</p>
      <div class="p-seats-wrap"><table class="t compact p-seats"><thead><tr><th scope="col">Committee</th><th scope="col" class="n">New seats</th><th scope="col">Continuing Panel ${P - 1}</th><th scope="col">Outgoing Panel ${P - 2}</th></tr></thead><tbody>
      ${pr.committees.map((c) => `<tr><th scope="row"><a href="${hashFor(P, { kind: 'committee', id: c })}" data-go="committee:${c}">${esc(FCR.COMMITTEES[c].name)}</a></th>
        <td class="n" data-label="New seats"><strong>${seatTxt(c)}</strong>${rule === 'target' && pr.target[c] != null ? ` <span class="small muted">= ${pr.target[c]} − ${pr.cont[c].length}</span>` : ''}</td>
        <td class="small" data-label="Continuing">${pr.cont[c].map((a) => who(a, P - 1)).join(' · ') || '<span class="muted">—</span>'}</td>
        <td class="small" data-label="Outgoing">${pr.outgoing[c].map((a) => who(a, P - 2)).join(' · ') || '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  }

  // ---------- secondary committees ----------
  function renderSec() {
    const sec = pg.sec || {}, ic = sec.ICRF, ar = sec.ARCHIVES, pr = pg.pr, P = pg.P, an = AN();
    if (!ic || !ar) { $('#p-sec').innerHTML = ''; return; }
    const drawn = (a, k) => (pg.known && (pr.actualSec[a] || []).includes(k) ? ' <span class="chip good">✓ drawn</span>' : '');
    const li = (a, p, extra, k) => `<li class="p-li">${dot(a)}<span class="p-ln">${UI.areaLink(+a, { brief: true })}</span>${extra || ''}<span class="num p-lp">${fmt(p)}%</span>${drawn(a, k)}</li>`;
    const beta = +pg.eff.icrfRotation || 0;
    const icHtml = ic.regions.map((g) => {
      const pool = (ic.pools[g] || []).slice().sort((x, y) => (ic.probs[y] || 0) - (ic.probs[x] || 0));
      return `<div><h4>${UI.regionDot(g)} ${esc(FCR.regionName(g))}</h4><ul class="p-list">${pool.map((a) => li(a, ic.probs[a],
        ic.recent[a] != null ? ` <span class="badge p-held" data-tip="Held IC/RF in Panel ${(ic.held[a] || []).join(', ')}; weight e^-${beta} ≈ ${Math.exp(-beta).toFixed(2)}">held P${ic.recent[a]}</span>` : '', 'ICRF')).join('') || '<li class="muted small">no area</li>'}</ul></div>`;
    }).join('');
    const arList = Object.entries(ar.probs).sort((x, y) => y[1] - x[1]);
    const arLi = ([a, p]) => li(a, p, ar.nbOfContinuing[a] ? ` <span class="badge" data-tip="Borders continuing Archives member Area ${ar.nbOfContinuing[a].join(', ')} — mildly less likely">ⁿ A${ar.nbOfContinuing[a].join(', A')}</span>` : '', 'ARCHIVES');
    const ir = an.icrf_rotation || {};
    $('#p-sec').innerHTML = `
      <div class="card"><h3>International Conventions/Regional Forums</h3>
        <p class="small">“Composed of eight delegates chosen by lot, one from each region” (Service Manual p. 48). Since the Panel 70 draw the regions are fixed by panel parity, so Panel ${P} fills
        <strong>${ic.regions.map((g) => esc(FCR.regionName(g))).join(', ')}</strong> — ${ic.seats} seats, one per region. Within a region the seat rotates: an area that held IC/RF in its last 3 terms
        ${beta ? `weighs e^-${beta} ≈ ${Math.exp(-beta).toFixed(2)} (marked “held”)` : 'is treated like any other (rotation rule off)'}. Expected seats going to recent holders: ${ic.expectedRecentHolderPicks.toFixed(2)}.</p>
        <div class="p-icrf">${icHtml}</div>
        ${ir.display_note ? `<p class="small muted">${esc(ir.display_note)}</p>` : ''}</div>
      <div class="card"><h3>Archives</h3>
        <p class="small">${ar.seats} new members from ${ar.seats} different regions (held in every loaded panel). ${ar.lambda ? `Each neighbour pair among them or with a continuing member weighs e^-${ar.lambda} (mild; ⁿ = borders a continuing member).` : 'Neighbour rule off.'}
        Continuing Panel ${P - 1}: ${ar.continuing.map((a) => `${dot(a)} A${a}`).join(' ') || '—'}. Expected neighbour pairs: ${ar.expectedNeighbourPairs.toFixed(2)}.</p>
        <ul class="p-list">${arList.slice(0, 10).map(arLi).join('')}</ul>
        ${arList.length > 10 ? `<details class="p-more"><summary>All ${arList.length} areas</summary><ul class="p-list">${arList.slice(10).map(arLi).join('')}</ul></details>` : ''}</div>
      <div class="card"><h3>Good to know</h3><ul class="small p-facts">
        <li>Which secondary depends on the primary committee: since 2017 Treatment members went to IC/RF 8 times and Archives 0; Policy/Admissions 9 and 1; Report &amp; Charter 1 and 8; Finance 1 and 6; CPC 1 and 4 (permutation test p = 0.002). Both are drawn together in December, so this can't sharpen the odds above.</li>
        <li>No delegate has held both secondaries: 0 of 510 terms.</li>
        <li>2024–25 IC/RF had only 7 members: the Panel 74 West Central seat was not filled, and GSO noted rotation challenges (2026 Final Report pp. 82–83).</li>
        <li>Archives was one per region and refilled the outgoing regions until Panel 71; since Panel 72 the regions vary.</li>
        <li>Secondary committees elect their officers after the primary committees; in 2017–2026 no primary committee chair was also a secondary chair or alternate (0 of 40, about 8 expected).</li></ul></div>`;
  }

  // ---------- side sheet: "Why these odds?" and "Who could land here" ----------
  function showDetail(req, refresh) {
    const sh = $('#p-sheet'), open = !!req;
    if (req && req.kind === 'committee' && !pg.pr.committees.includes(req.id)) req = null;
    if (req && req.kind === 'area' && !FCR.areas[req.id]) req = null;
    const was = pg.detail;
    pg.detail = req;
    sh.hidden = !req; pg.root.classList.toggle('p-sheet-open', !!req);
    document.documentElement.classList.toggle('p-lock', !!req);
    if (!req) { if (was && pg.opener && document.contains(pg.opener)) pg.opener.focus({ preventScroll: true }); return; }
    if (!refresh && !was) pg.opener = document.activeElement;
    if (!pg.res) { $('#p-sheet-body').innerHTML = '<p class="muted">Simulating…</p>'; return; }
    if (req.kind === 'area') areaSheet(req.id, req.c); else committeeSheet(req.id);
    if (!refresh && open) { const h = $('#p-sheet-h'); if (h) h.focus({ preventScroll: true }); sh.scrollTop = 0; }
  }
  const sheetHead = (kicker, title) => { $('#p-sheet-t').innerHTML = `<p class="p-kicker">${kicker}</p><h2 id="p-sheet-h" tabindex="-1">${title}</h2>`; };
  const runOpts = () => Object.assign({}, primOpts(pg.eff), { quality: 'interactive' });

  function areaSheet(a, cSel) {
    const pr = pg.pr, P = pg.P, res = pg.res;
    sheetHead('Why these odds?', `Area ${a} · ${esc((FCR.areas[a] || {}).name || '')}`);
    const body = $('#p-sheet-body');
    if (!pr.areas.includes(a)) {
      const np = UI.predictPanelFor ? UI.predictPanelFor(a) : null;
      body.innerHTML = `<p>Area ${a} isn't in Panel ${P}'s lot.</p>${np && np !== P && pg.ch.list.includes(np) ? `<p><a href="#/predict/${np}/area/${a}">Area ${a} in Panel ${np} →</a></p>` : ''}`;
      return;
    }
    const p = res.probs[a], se = res.se ? res.se[a] : null, top = res.top[a], excl = excludedSet(a);
    const t = FCR.term(a, P), el = FCR.electsFor(P)[a], who = t ? t.name : el && el.delegate ? el.delegate : null;
    const order = pr.committees.slice().sort((x, y) => (p[y] || 0) - (p[x] || 0) || (excl.has(x) ? 1 : 0) - (excl.has(y) ? 1 : 0));
    const tied = top && top.nearTie ? top.tied.slice(0, 3) : null;
    body.innerHTML = `<p class="small ink2">${dot(a)} ${esc(FCR.regionName(M.regionOf(a)))} region · ${esc(M.stateOf(a))} · Panel ${P}${who ? ` · ${pg.known ? 'delegate' : 'delegate-elect'} ${esc(who)}` : ''} · <a href="#/area/${a}">area page</a></p>
      ${pr.actual[a] ? `<p class="p-actual">Actual: <strong>${cn(pr.actual[a])}</strong> (model ${fmt(p[pr.actual[a]])}%).</p>` : ''}
      <p class="p-verdict">${top ? (tied ? `${tied.map((c) => `<strong>${cn(c)}</strong> ${fmt(p[c])}%`).join(' ≈ ')}: a near-tie.` : `Most likely <strong>${cn(top.c)}</strong> ${fmt(top.p)}%.`) : ''}</p>
      <div class="p-bars p-bars-all">${order.map((c) => { const why = reasons(a, c, excl); return `<div class="p-brow${excl.has(c) ? ' p-out' : ''}"><span class="p-bn">${cn(c)}${markOf(contFlags(a, c)) ? ` <i class="p-mk2">${markOf(contFlags(a, c))}</i>` : ''}</span>${bar(p[c])}<span class="p-bv num">${excl.has(c) ? '✕' : pctTxt(p[c])}${se && se[c] ? ` <small>±${(se[c] * 100).toFixed(1)}</small>` : ''}</span>${why.length ? `<span class="p-bwhy">${esc(why.join('; '))}</span>` : ''}</div>`; }).join('')}</div>
      <h3 class="p-sh3">How the rules get there</h3><div id="p-steps"><p class="small muted"><span class="p-spin" aria-hidden="true"></span> Working out the rule-by-rule steps…</p></div>
      <h3 class="p-sh3">What if…</h3><div id="p-wi"></div>`;
    const cands = order.filter((c) => p[c] > 0);
    const c0 = cands.includes(cSel) ? cSel : pg.wi.a === a && cands.includes(pg.wi.c) ? pg.wi.c : cands[0];
    $('#p-wi').innerHTML = cands.length ? `<label class="p-wil">If ${esc(who || 'Area ' + a)} draws <select id="p-wi-c">${cands.map((c) => `<option value="${c}" ${c === c0 ? 'selected' : ''}>${esc(FCR.COMMITTEES[c].name)} (${fmt(p[c])}%)</option>`).join('')}</select></label><div id="p-wi-out"></div>` : '<p class="muted small">No committee is possible with these rules.</p>';
    // The ablation steps need up to 6 simulations with custom rules: warm them one per tick so the page stays responsive.
    const opts = runOpts(), steps = M.ablationSettings(opts), token = (pg.tok = (pg.tok || 0) + 1);
    let i = 0;
    const tick = () => {
      if (!alive() || pg.tok !== token) return;
      if (i < steps.length) { M.odds(P, Object.assign({}, opts, steps[i].settings, { step: true })); i++; const s = $('#p-steps .muted'); if (s) s.innerHTML = `<span class="p-spin" aria-hidden="true"></span> Working out the rule-by-rule steps (${i} of ${steps.length})…`; return setTimeout(tick, 0); }
      renderSteps(a, M.explain(P, a, opts));
      if (c0) setTimeout(() => { if (alive() && pg.tok === token) renderWhatIf(a, c0); }, 0);
    };
    setTimeout(tick, 0);
  }
  const STEP_HEAD = { seats: 'Seats only', exclude: '+Skip', region: '+Region', spread: '+Spread', neighbors: '+Nbrs', state: '+State' };
  function renderSteps(a, ex) {
    const box = $('#p-steps'); if (!box || !ex) return;
    const pr = pg.pr, reg = FCR.regionName(ex.region), last = ex.steps[ex.steps.length - 1];
    const order = pr.committees.slice().sort((x, y) => (last.probs[y] || 0) - (last.probs[x] || 0));
    const same = pr.areas.filter((b) => b !== a && M.regionOf(b) === ex.region);
    const listOf = (pred) => pr.committees.map((c) => ({ c, l: (ex.continuing[c] || []).filter(pred) })).filter((x) => x.l.length)
      .map((x) => `${ab(x.c)} (${x.l.map((y) => 'Area ' + y.area).join(', ')})`).join(', ');
    const text = (s) => {
      if (s.key === 'seats') return `Start from seat counts alone: each committee's share of the ${pr.areas.length} new seats (4 or 5 each, about ${Math.round(400 / pr.areas.length)}–${Math.round(500 / pr.areas.length)}%).`;
      if (s.key === 'exclude') return ex.excluded.length ? `Skip the last ${pg.eff.excludeLast} terms: ${ex.excluded.map((x) => `${ab(x.committee)} (Panel ${x.panel}${x.name ? ', ' + esc(x.name) : ''})`).join(', ')} drop to 0; the others rise.` : 'Skip recent committees: nothing to skip.';
      if (s.key === 'region') return `One new member per region: the ${same.length} other ${esc(reg)} areas in this lot can't join the same committee, so they compete with Area ${a} for seats.`;
      if (s.key === 'spread') { const l = listOf((y) => y.sameRegion); return l ? `Spread regions: a ${esc(reg)} delegate already continues on ${l} — those fall, the rest gain.` : `Spread regions: no ${esc(reg)} delegate continues anywhere, so little changes.`; }
      if (s.key === 'neighbors') { const l = listOf((y) => y.neighbor); return l ? `Neighbours apart: a neighbouring area continues on ${l}.` : 'Neighbours apart: no neighbouring area continues on any committee.'; }
      if (s.key === 'state') { const l = listOf((y) => y.sameState); return l ? `Same state apart: another ${esc(ex.state)} area continues on ${l} — almost ruled out (not once in 2017–2026).` : `Same state apart: no other ${esc(ex.state)} area continues on a committee.`; }
      return '';
    };
    const movers = (s) => {
      const d = pr.committees.map((c) => [c, s.delta[c] || 0]).filter((x) => Math.abs(x[1]) >= 0.02).sort((x, y) => y[1] - x[1]);
      const up = d.filter((x) => x[1] > 0).slice(0, 3), dn = d.filter((x) => x[1] < 0).slice(-3).reverse();
      return up.length || dn.length ? ` <span class="p-mov">${up.length ? '▲ ' + up.map(([c, v]) => `${ab(c)} +${Math.round(v * 100)}`).join(', ') : ''}${up.length && dn.length ? ' · ' : ''}${dn.length ? '▼ ' + dn.map(([c, v]) => `${ab(c)} ${Math.round(v * 100)}`).join(', ') : ''}</span>` : '';
    };
    box.innerHTML = `<p class="small ink2">Chance (%) of each committee as the rules are switched on one at a time${ex.steps.some((s) => !s.on) ? ' (rules you switched off are marked “off”)' : ''}:</p>
      <div class="p-steps-wrap"><table class="t compact p-steps"><thead><tr><th scope="col">Committee</th>${ex.steps.map((s) => `<th scope="col" class="n${s.on ? '' : ' muted'}" data-tip="${esc(s.label)}${s.on ? '' : ' (off)'}">${STEP_HEAD[s.key] || esc(s.label)}${s.on ? '' : '<br>off'}</th>`).join('')}</tr></thead>
      <tbody>${order.map((c) => `<tr><th scope="row">${ab(c)}</th>${ex.steps.map((s) => `<td class="h p-h${heat(s.probs[c] || 0)}">${fmt(s.probs[c] || 0)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <ol class="p-steplist small">${ex.steps.map((s, i) => { const tx = text(s), k = tx.indexOf(':'); return `<li${s.on ? '' : ' class="muted"'}>${k > 0 ? `<strong>${tx.slice(0, k)}</strong>${tx.slice(k)}` : tx}${s.on ? '' : ' <em>(off in your rules)</em>'}${i ? movers(s) : ''}</li>`; }).join('')}</ol>
      ${ex.steps.some((s) => !s.precomputed) ? '<p class="small muted">Steps simulated live (approximate).</p>' : '<p class="small muted">Every step is precomputed.</p>'}`;
  }
  function renderWhatIf(a, c) {
    const out = $('#p-wi-out'); if (!out) return;
    out.innerHTML = '<p class="small muted"><span class="p-spin" aria-hidden="true"></span> Simulating with Area ' + a + ' fixed on ' + cn(c) + '…</p>';
    setTimeout(() => {
      if (!alive() || !$('#p-wi-out')) return;
      const w = M.whatIf(pg.P, a, c, runOpts());
      if (!w) { out.innerHTML = ''; return; }
      if (w.impossible) { out.innerHTML = `<p class="small">Area ${a} can't draw ${cn(c)} under these rules.</p>`; return; }
      const cont = w.continuing || [];
      out.innerHTML = `<p class="small">${cn(c)} has ${Math.round(w.seats)} new seats, so ${w.others} would go to other areas — most likely:</p>
        <div class="p-bars">${w.fellows.slice(0, 8).map((f) => `<div class="p-brow"><span class="p-bn"><button type="button" class="p-link" data-go="area:${f.area}:${c}">${dot(f.area)} Area ${f.area} · ${aShort(f.area)}</button></span>${bar(f.p)}<span class="p-bv num" data-tip="Without the what-if: ${fmt(f.prior)}%">${fmt(f.p)}% <small class="muted">(was ${fmt(f.prior)})</small></span></div>`).join('')}</div>
        ${cont.length ? `<p class="small">Continuing members (Panel ${pg.P - 1}): ${cont.map((x) => `${dot(x.area)} Area ${x.area}${x.name ? ' ' + esc(x.name) : ''}${x.sameState ? ' <span class="badge">same state</span>' : x.neighbor ? ' <span class="badge">neighbour</span>' : x.sameRegion ? ' <span class="badge">same region</span>' : ''}`).join(' · ')}</p>` : ''}
        <p class="small muted">Conditional chances from one simulation with Area ${a} fixed on ${cn(c)} (${w.draws.toLocaleString()} draws, ${w.ms} ms; approximate).</p>
        <p class="small"><a href="${hashFor(pg.P, { kind: 'committee', id: c })}" data-go="committee:${c}">Who could land on ${cn(c)} →</a></p>`;
    }, 0);
  }
  function committeeSheet(c) {
    const P = pg.P, pr = pg.pr;
    sheetHead('Who could land here?', `${esc(FCR.COMMITTEES[c].name)} · Panel ${P}`);
    const cm = M.committee(P, c, runOpts());
    const rule = capacityRule();
    const seatsTxt = Math.abs(cm.seats - Math.round(cm.seats)) < 0.05 ? Math.round(cm.seats) : cm.seats.toFixed(1);
    const people = (l, p) => l.map((x) => `<li class="p-li">${dot(x.area)}<span class="p-ln">${UI.areaLink(x.area, { brief: true })}${x.name ? ` <span class="muted">${esc(x.name)}</span>` : ''}</span></li>`).join('');
    const fl = (x) => [x.flags.sameState.length && `<span class="badge" data-tip="Same-state Area ${x.flags.sameState.join(', ')} continues">ˢ</span>`,
      x.flags.neighbor.length && !x.flags.sameState.length && `<span class="badge" data-tip="Neighbouring Area ${x.flags.neighbor.join(', ')} continues">ⁿ</span>`,
      x.flags.sameRegion.length && !x.flags.neighbor.length && !x.flags.sameState.length && `<span class="badge" data-tip="Same-region Area ${x.flags.sameRegion.join(', ')} continues">ʳ</span>`].filter(Boolean).join('');
    const isAct = (a) => pg.known && pr.actual[a] === c;
    $('#p-sheet-body').innerHTML = `<p><strong>${seatsTxt} new seat${seatsTxt == 1 ? '' : 's'}</strong>${rule === 'target' && cm.standard != null ? ` = standard size ${cm.standard} − ${cm.continuing.length} continuing members` : ''}.</p>
      <div class="grid g2 p-cm2"><div><h4>Continuing (Panel ${P - 1})</h4><ul class="p-list">${people(cm.continuing) || '<li class="muted small">none</li>'}</ul></div>
        <div><h4>Outgoing (Panel ${P - 2})</h4><ul class="p-list">${people(cm.outgoing) || '<li class="muted small">none</li>'}</ul></div></div>
      <h3 class="p-sh3">Most likely new members</h3>
      <div class="p-bars">${cm.eligible.map((x) => `<div class="p-brow${isAct(x.area) ? ' p-hit' : ''}"><span class="p-bn"><button type="button" class="p-link" data-go="area:${x.area}:${c}">${dot(x.area)} Area ${x.area} · ${aShort(x.area)}</button> ${fl(x)}</span>${bar(x.p)}<span class="p-bv num" data-tip="${esc(tipPct(x.p, x.se))}">${fmt(x.p)}%${isAct(x.area) ? ' ✓' : ''}</span></div>`).join('')}</div>
      <p class="small muted">${cm.eligible.length} eligible areas; the chances add up to ${cm.sum.toFixed(2)} — the ${seatsTxt} seats${Math.abs(cm.sum - cm.seats) < 0.05 ? ' ✓' : ''}. ˢ ⁿ ʳ = a same-state, neighbouring or same-region member continues (less likely).${pg.known ? ' ✓ = actually drawn.' : ''}</p>
      ${cm.ruledOut.length ? `<details class="p-more"><summary>Ruled out or never drawn (${cm.ruledOut.length})</summary><ul class="p-list">${cm.ruledOut.map((x) => `<li class="p-li">${dot(x.area)}<span class="p-ln">${UI.areaLink(x.area, { brief: true })} <span class="muted small">${esc(x.reason)}</span></span>${isAct(x.area) ? ' <span class="badge rot">drawn anyway</span>' : ''}</li>`).join('')}</ul></details>` : ''}`;
  }

  // ---------- evidence (rendered after the first paint) ----------
  function ruleCards(pat, an) {
    const exp = (x) => (x && x[1] ? ` <span class="muted small">(chance ≈ ${Math.round(x[1] / 11)})</span>` : '');
    const nr = an.neighbor_rule || {}, c = nr.cross_panel || {}, f2 = (x) => (x ? `<strong>${x[0]}</strong> vs ${x[1]} expected` : '—');
    const ss = an.same_state || {}, ovr = ss.observed_vs_expected_without_rule || {}, seats = an.seats || {}, sz = seats.standard_sizes || {};
    const ir = an.icrf_rotation || {}, arn = an.archives_neighbor || {}, src = an.small_region_cap || {}, rce = (an.region_cap_exceptions || {}).cases || pat.regionCapExceptions || [];
    const bySize = (k) => Object.keys(sz).filter((x) => sz[x] === k).map(ab).join(', ');
    return [
      { id: 'skip', t: 'Recent committees are skipped', b: `<p>The area's new delegate drew the <em>same</em> committee as the previous delegate ${frac(pat.repeatK[1])} times${exp(pat.repeatK[1])}; as 2 terms back ${frac(pat.repeatK[2])}${exp(pat.repeatK[2])}; 3 terms back ${frac(pat.repeatK[3])}${exp(pat.repeatK[3])}; 4 terms back ${frac(pat.repeatK[4])}${exp(pat.repeatK[4])} — no longer avoided.</p>
        ${an.repeat_note ? `<p class="ink2">${esc(an.repeat_note)}</p>` : ''}<p class="ink2">⇒ an area's last <strong>three</strong> committees are off the table.</p>` },
      { id: 'seats', t: 'Seats refill each committee to its standard size', b: `<p>“Normally, a committee is made up of four or five first-year delegates and four or five second-year delegates” (Service Manual p. 45). Standard size = the committee's most common size before the draw: 8 for ${bySize(8)}; 9 for ${bySize(9)}. New seats = standard size − continuing members.</p>
        <p>This matched ${frac(seats.target_matches || pat.seatTarget)} committee-panels (${(((seats.exact_panels || {}).target) || []).length} of 9 panels exactly); “replace the outgoing members” matched ${frac(seats.replace_matches || pat.seatReplace)}.</p>
        <p class="ink2">${esc(seats.note || 'From Panel 75 GSO began rebalancing first- and second-year members on each committee (2024 Final Report p. 68).')}</p>` },
      { id: 'region', t: 'One new member per region', b: `<p>Two new delegates from the same region on one committee: ${frac(pat.regionDup)} committee-panels — far below chance. Sharing a region with a <em>continuing</em> member is common (${frac(pat.crossRegionDup)}); that is handled by the spread rule.</p>
        ${rce.length ? `<p><strong>Exceptions since Panel 74:</strong> ${rce.map((x) => `P${x.panel} ${ab(x.committee)} (Areas ${x.areas.join(' + ')})`).join(', ')}. ${esc((an.region_cap_exceptions || {}).note ? 'A soft cap of 2 predicts worse, so the model keeps 1.' : '')}</p>` : ''}` },
      { id: 'spread', t: 'Regions spread across the whole committee', b: `<p>Counting both panels, each committee's members come from as many regions as possible. Distinct regions per committee, Panels ${nr.era_from_panel || 71}–${nr.era_to_panel || 76}: ${f2(c.regions_covered)} under a fair lot${nr.max_regions_covered_per_panel ? ` (${nr.max_regions_covered_per_panel} per panel is the most possible; reached ${nr.panels_at_max || 0} times)` : ''}. A new delegate rarely joins a committee that already has a member from their region: ${f2(c.same_region_non_neighbors)}.</p>
        <p class="ink2">GSO's 2025 criteria: “striving to have wider regional representation across all committees.”</p>` },
      { id: 'neighbors', t: 'Neighbouring areas kept apart', b: `<p>Since Panel ${nr.era_from_panel || 71} (the December 2020 draw) a new delegate almost never lands where a <em>neighbouring</em> area's delegate sits: ${f2(c.same_region_neighbors)} for neighbours in the same region and ${f2(c.cross_region_neighbors)} across a region line${nr.early_era ? ` (Panels ${nr.early_era.panels}: ${nr.early_era.cross_region_neighbors[0]} vs ${nr.early_era.cross_region_neighbors[1]} — no avoidance yet)` : ''}.</p>
        <p class="ink2">GSO's 2025 criteria: “limit adjacent areas from different regions.” Neighbours = areas sharing a border.</p>` },
      { id: 'state', t: 'Same state or province kept apart', b: `<p>Not once in 2017–2026 did two areas of the same state or province sit on one committee: ${ovr.recent ? `<strong>${ovr.recent[0]}</strong> vs ${ovr.recent[1]} expected (Panels ${ovr.panels_recent})` : ''}${ovr.early ? ` and <strong>${ovr.early[0]}</strong> vs ${ovr.early[1]} (Panels ${ovr.panels_early})` : ''}; the chance of that by luck is ${ss.p_zero_poisson_all != null ? ss.p_zero_poisson_all.toExponential(1).replace('e-', ' × 10⁻').replace(/⁻(\d+)/, (m, d) => '⁻' + d.split('').map((x) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[x]).join('')) : 'tiny'}. The rule improved the fit in ${ss.panels_improved ? ss.panels_improved[0] + ' of ' + ss.panels_improved[1] : 'every'} panels.</p>
        <p class="ink2">Within one panel same-state areas share a region, so this bites on new members next to continuing ones. The 2009 rosters had one such pair, so “not once in ten years”, not “never”. Areas 1, 48 and 74 span two states; the main one is used.</p>` },
      { id: 'icrf', t: 'IC/RF: one per region, rotating', b: `<p>“Composed of eight delegates chosen by lot, one from each region” (Service Manual p. 48). Since the Panel 70 draw odd panels fill East Central, Eastern Canada, Northeast and Pacific; even panels Southeast, Southwest, West Central and Western Canada.</p>
        <p>Within a region the seat rotates: areas that held IC/RF in their last 3 terms took ${ir.recent_holder_picks_unforced ? `<strong>${ir.recent_holder_picks_unforced[0]}</strong> of ${(ir.slots || 36) - (ir.forced_slots || 4)} open seats vs ${ir.recent_holder_picks_unforced[1].toFixed(1)} by chance` : 'far fewer seats than chance'}${ir.odd_panels_unforced ? ` (odd panels ${ir.odd_panels_unforced[0]} vs ${ir.odd_panels_unforced[1].toFixed(1)})` : ''}. The model weighs them e^-1.6 ≈ 0.2 — soft, because tiny pools such as Western Canada must still fill.</p>
        ${ir.display_note ? `<p class="ink2">${esc(ir.display_note)}</p>` : ''}` },
      { id: 'archives', t: 'Archives: four regions, neighbours mildly apart', b: `<p>The new Archives members came from different regions in ${frac(pat.archivesDistinct)} panels. Until Panel 71 Archives was one per region and refilled the outgoing regions.</p>
        ${arn.since_panel_72 ? `<p>Since Panel 72: <strong>${arn.since_panel_72.observed_pairs}</strong> neighbour pairs (among new members or with continuing ones) vs ${arn.since_panel_72.expected_uniform.toFixed(1)} expected; before that ${arn.before.observed_pairs} vs ${arn.before.expected_uniform}.</p>` : ''}
        <p class="ink2">A strong neighbour rule fits best in-sample but a verifier found it overfit, so the model uses a mild one (each pair weighs e^-1).</p>` },
      { id: 'small', t: 'Small regions (text only)', b: `<p>${esc(src.rule_text || 'July 2020 trustees\' decision (2021 FR p. 26): Southwest, West Central, Eastern Canada and Western Canada have no more than one delegate on a committee.')}</p>
        ${src.by_year ? `<p>Committees with two members from one of these regions: ${src.by_year.map((y) => `${y.year} <strong>${y.doubles}</strong>`).join(' · ')}.</p>` : ''}<p class="ink2">${esc(src.note || '')}</p>` },
      { id: 'manual', t: 'The last manual draw (Panel 70)', b: `<p>The December 2019 draw (Panel 70) was the last made by hand; since December 2020 GSO uses its Conference Committee Assignment app (2021 Final Report pp. 27, 70). The manual draws skipped only the previous committee, so backtests of Panels ≤ 70 use “skip last 1 term”. It doesn't affect Panel 77.</p>` },
      { id: 'order', t: 'No fixed order', b: `<p>${an.transition_chi2 ? `Moves from one committee to the next are statistically flat (χ² = ${an.transition_chi2.chi2} on ${an.transition_chi2.df} df), so there is no hidden rotation table — it really is a lot.` : 'Moves between committees look random.'}</p>` },
      { id: 'chairs', t: 'Chairs', b: `<p>Each committee elects next year's chair and alternate chair by plurality at its last Conference meeting (Service Manual p. 45). In the rosters every one came from the first-year members (${frac(pat.chairsFirstYear)}). They are known once the Final Report is out — see <a href="#/today">Today</a>.</p>` },
    ];
  }
  function renderEvidence() {
    const box = $('#p-evidence'), an = AN(), pat = M.patterns();
    const cards = ruleCards(pat, an), rej = an.rejected_rules || [], fc = an.forward_chained || {}, cal = (an.calibration || {}).forward, cin = (an.calibration || {}).in_sample, bk = an.best_of_k || {};
    const row = (l, o, cls) => (o ? `<tr class="${cls || ''}"><th scope="row">${l}</th><td class="n">${pc(o.meanP, 1)}</td><td class="n">${pc(o.top1)}</td><td class="n">${pc(o.top3)}</td><td class="n">${o.logLik != null ? o.logLik.toFixed(3) : '—'}</td></tr>` : '');
    const fwd = (fc.new_procedure || {}).overall;
    const wl = an.watch_list;
    const expTxt = (e) => (e.mean != null ? `${e.mean}${e.p05 != null && e.p95 != null && e.p95 > e.p05 ? ` <span class="muted">(90%: ${e.p05}–${e.p95})</span>` : ''}${e.uniform_lot != null ? ` <span class="muted">(plain lot ${e.uniform_lot})</span>` : ''}` : Object.entries(e).map(([c, v]) => `${ab(c)} ${v}`).join(' · '));
    box.innerHTML = `
      <details class="card p-why" id="p-why"><summary>Why these rules (${cards.length}) <span class="small muted">— the regularities in ten years of rosters</span></summary>
        <div class="grid g3 p-cards">${cards.map((x, i) => `<div class="card p-rcard" id="p-card-${x.id}"><h3>${i + 1} · ${x.t}</h3><div class="small">${x.b}</div></div>`).join('')}</div></details>
      <details class="card" id="p-rej"><summary>Rules we tested and rejected (${rej.length + 1}) <span class="small muted">— including GSO's “best of five rounds”</span></summary>
        <p class="small ink2">Each idea was tested against the 2017–2026 rosters. “Log score vs defaults” is the change in the in-sample log score on Panels 71–76 (negative = worse; changes under 0.01 are noise); the out-of-sample tests in the cited audits decide.</p>
        <div class="p-tw"><table class="t compact p-rejt"><thead><tr><th scope="col">Rule</th><th scope="col" class="n">Log score vs defaults</th><th scope="col" class="n">Top-3</th><th scope="col">Evidence</th></tr></thead><tbody>
        ${rej.map((r) => `<tr><th scope="row">${esc(r.rule)}</th><td class="n" data-label="Log score vs defaults">${r.dLogLik != null ? (r.dLogLik >= 0 ? '+' : '') + r.dLogLik.toFixed(3) : '—'}</td><td class="n" data-label="Top-3">${r.top3 != null ? pc(r.top3) : '—'}</td><td class="small" data-label="Evidence">${esc(r.evidence || '')}</td></tr>`).join('')}
        ${bk.verdict ? `<tr><th scope="row">GSO's “five selection rounds, the broadest kept” (2023 FR p. 64) as a model</th><td class="n" data-label="Log score vs defaults">${bk.forward && fwd ? (bk.forward.overall.logLik - fwd.logLik).toFixed(3) : '—'}</td><td class="n" data-label="Top-3">${bk.forward ? pc(bk.forward.overall.top3) : '—'}</td><td class="small" data-label="Evidence">${esc(bk.verdict)}</td></tr>` : ''}</tbody></table></div></details>
      <details class="card" id="p-acc"><summary>How accurate is it?${fwd ? ` <span class="small muted">— out of sample the actual committee was in the top 3 for ${pc(fwd.top3)} of areas</span>` : ''}</summary>
        <p class="small ink2"><strong>Forward-chained</strong> = for each test panel (71–76) the soft-rule strengths are chosen using only the panels drawn before it, then that panel is scored — the honest test of how well the model would have predicted a draw it had not seen. <strong>Log score</strong> = the average log-chance given to the committee actually drawn (closer to 0 is better).</p>
        <div class="p-tw"><table class="t compact"><thead><tr><th scope="col">Test (Panels 71–76, ${fwd ? fwd.n : 279} areas)</th><th scope="col" class="n">Avg chance on actual</th><th scope="col" class="n">#1 right</th><th scope="col" class="n">In top 3</th><th scope="col" class="n">Log score</th></tr></thead><tbody>
          ${row('<strong>Forward-chained</strong> (honest: rule strengths chosen on earlier panels only)', fwd, 'p-best')}
          ${row('Leave one panel out', (fc.leave_one_out || {}).overall)}
          ${row('In-sample with the defaults (the rules were found in these panels)', fc.in_sample_defaults)}
          ${row('Previous model, forward-chained', (fc.previous_procedure || {}).overall)}
          ${row('GSO-style best of K rounds, forward-chained (not adopted)', (bk.forward || {}).overall)}
          ${row('Seat counts only (in-sample)', ((an.ablation || {}).recent || [])[0])}
          <tr><th scope="row">Blind guess (1 in 11)</th><td class="n">9.1%</td><td class="n">9%</td><td class="n">27%</td><td class="n">-2.398</td></tr></tbody></table></div>
        ${cal ? `<h4>Calibration: when the model says X%, how often does it happen?</h4>
        <div class="p-tw"><table class="t compact p-cal"><thead><tr><th scope="col">Model said</th><th scope="col" class="n">Cells</th><th scope="col" class="n">Said (avg)</th><th scope="col" class="n">Happened (forward)</th><th scope="col" class="n">Happened (in-sample)</th></tr></thead><tbody>
          ${cal.bins.map((b, i) => { const c2 = cin && cin.bins[i]; return `<tr><th scope="row">${Math.round(b.from * 100)}–${Math.round(b.to * 100)}%</th><td class="n">${b.cells}</td><td class="n">${pc(b.said, 1)}</td><td class="n"><strong>${pc(b.happened_rate, 1)}</strong> <span class="muted">(${b.happened})</span></td><td class="n">${c2 ? pc(c2.happened_rate, 1) : '—'}</td></tr>`; }).join('')}
          ${cal.impossible ? `<tr><th scope="row">0 (ruled out)</th><td class="n">${cal.impossible.cells}</td><td class="n">0%</td><td class="n"><strong>${cal.impossible.happened}</strong> happened</td><td class="n">${cin && cin.impossible ? cin.impossible.happened : '—'}</td></tr>` : ''}</tbody></table></div>
        <p class="small muted">Brier score ${cal.brier} (forward). Stated chances match outcomes within a few points in most bins; very high chances (60%+) come true a little less often than stated.</p>` : ''}
        <h4>Run the backtest in the app</h4>
        <p class="small"><button type="button" class="btn" id="p-bt">Backtest the current rules</button> <span class="muted">Re-draws each past panel (68–76) from the history before it — 8,000 draws per panel for every variant, about 5 s. In-sample: it shows how much the rules narrow the lot, not an independent test. Panels ≤ 70 use “skip last 1”.</span></p>
        <div id="p-bt-out" aria-live="polite"></div></details>
      ${wl ? `<section class="card p-watch" id="p-watchc"><h3>Watch list for the ${esc(wl.draw)} draw (Panel ${wl.panel}) <span class="small muted">registered ${esc(UI.fmtDate ? UI.fmtDate(wl.registered_on, 'short') : wl.registered_on)} · model ${esc(wl.model_version)}</span></h3>
        <p class="small ink2">What the default model expects once the Panel ${wl.panel} assignments are known (areas usually announce them in January; the ${wl.panel + 1950} Final Report confirms). Each line says which rule the result would confirm or question.</p>
        <div class="p-tw"><table class="t compact p-wl"><thead><tr><th scope="col">Check</th><th scope="col">Expected</th><th scope="col">What it would tell us</th></tr></thead><tbody>
        ${wl.checks.map((x) => `<tr><th scope="row">${esc(x.what)}</th><td class="num" data-label="Expected">${expTxt(x.expected)}</td><td class="small" data-label="What it would tell us">${esc(x.confirms)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
  }

  // ---------- in-app backtest: one panel per tick, every variant on the same draws, pooled ----------
  function runBacktest() {
    const out = $('#p-bt-out'), btn = $('#p-bt'); if (!out || pg.btRunning) return;
    const panels = FCR.panels.filter((p) => { const pr = problem(p); return Object.keys(pr.actual).length > 20 && Object.values(pr.history).filter((h) => h.length).length > 20; });
    const st = settingsOf(pg.st), cur = primOpts(st), custom = changed(st).filter((r) => !r.sec).length > 0;
    const variants = [{ l: custom ? 'Your rules' : 'Default rules', o: cur }, { l: 'Seat counts only', o: M.ablationSettings(cur)[0].settings }];
    const rows = variants.map(() => []), total = panels.length * variants.length, t0 = Date.now();
    let i = 0; pg.btRunning = true; btn.disabled = true;
    const step = () => {
      if (!alive()) return;
      if (i < total) {
        const v = Math.floor(i / panels.length), P = panels[i % panels.length];
        out.innerHTML = `<p class="small"><span class="p-spin" aria-hidden="true"></span> ${variants[v].l}: Panel ${P} (${i + 1} of ${total})…</p>`;
        const r = M.backtest(Object.assign({}, variants[v].o), [P]); if (r.rows[0]) rows[v].push(Object.assign({ draws: r.overall.drawsPerPanel }, r.rows[0]));
        i++; return setTimeout(step, 0);
      }
      pg.btRunning = false; btn.disabled = false;
      const pool = (rs) => { const n = rs.reduce((s, r) => s + r.n, 0) || 1; const w = (k) => rs.reduce((s, r) => s + r[k] * r.n, 0) / n; return { n, meanP: w('meanP'), logLik: w('logLik'), top1: w('top1'), top3: w('top3') }; };
      const ov = rows.map(pool);
      out.innerHTML = `<div class="p-tw"><table class="t compact p-bt"><thead><tr><th scope="col">Panel</th><th scope="col" class="n">Areas</th><th scope="col" class="n">Avg chance on actual</th><th scope="col" class="n">Log score</th><th scope="col" class="n">#1 right</th><th scope="col" class="n">Top 3</th><th scope="col" class="n">${esc(variants[1].l)}: avg / top 3</th></tr></thead><tbody>
        ${rows[0].map((r, k) => `<tr><th scope="row"><a href="#/predict/${r.panel}">Panel ${r.panel}</a>${r.excludeLast === 1 && pg.eff.excludeLast > 1 ? ' <span class="small muted">(skip 1)</span>' : ''}</th><td class="n">${r.n}</td><td class="n">${pc(r.meanP, 1)}</td><td class="n">${r.logLik.toFixed(3)}</td><td class="n">${pc(r.top1)}</td><td class="n">${pc(r.top3)}</td><td class="n muted">${rows[1][k] ? pc(rows[1][k].meanP, 1) + ' / ' + pc(rows[1][k].top3) : ''}</td></tr>`).join('')}
        <tr class="p-best"><th scope="row">Pooled (${variants[0].l.toLowerCase()})</th><td class="n">${ov[0].n}</td><td class="n">${pc(ov[0].meanP, 1)}</td><td class="n">${ov[0].logLik.toFixed(3)}</td><td class="n">${pc(ov[0].top1)}</td><td class="n">${pc(ov[0].top3)}</td><td class="n">${pc(ov[1].meanP, 1)} / ${pc(ov[1].top3)}</td></tr></tbody></table></div>
        <p class="small muted">${(rows[0][0] || {}).draws ? rows[0][0].draws.toLocaleString() : '8,000'} draws per panel for every variant, ${((Date.now() - t0) / 1000).toFixed(1)} s. In-sample (the rules were found in these panels); top-1/top-3 split credit on ties. 1 in 11 = 9.1%. Click a panel to open it with its actual draw.</p>`;
    };
    setTimeout(step, 0);
  }
})();
