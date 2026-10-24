/* Views part 1: shared UI helpers, Today, Delegates & Map, Area profile, Person.
   Shared helpers (FCR.ui): regionDot, areaLink, areaShort, personLink, cchip, roleBadge, yearSelect, fmtDate(d, style),
   fmtRange(a, b, style), daysUntil(d), inDays(n), pct(p), rankOdds / oddsSummary / oddsCompact (one forecast for every page:
   FCR.predict.odds), drawStatus(P), electStatus(e), empty(msg), table(el, cols, rows, opts), hideTip, isPhone(), delegateRows(view),
   predictPanelFor(n), neighborInfo(n, P), myArea(box, onChange). Page styles: assets/css/pages.css (class prefix pg-). */
(function () {
  'use strict';
  const FCR = window.FCR;
  const esc = FCR.esc;
  const V = (FCR.views = FCR.views || {});
  const UI = (FCR.ui = {});
  const ord = FCR.ordinal;
  const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
  const joinDot = (xs) => xs.filter(Boolean).join(' · ');
  const listAnd = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
  UI.isPhone = () => !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches);

  // ---------- dates: one format everywhere ("Oct 20, 2026" / "October 20, 2026", en-dash ranges) ----------
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  /** Date | 'YYYY-MM-DD' | 'YYYY-MM' -> Date (noon local), or null. */
  const toDate = (d) => {
    if (d instanceof Date) return d;
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(d || ''));
    return m ? new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1, 12) : null;
  };
  const monthOnly = (d) => typeof d === 'string' && /^\d{4}-\d{2}$/.test(d);
  const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  UI.toDate = toDate;
  /** style: 'long' (default) "October 20, 2026" · 'short' "Oct 20, 2026" · 'day' "Oct 20" · 'month' "Oct 2026" ('long' month names
      for 'month' when longMonth). A 'YYYY-MM' string always gives the month form. */
  UI.fmtDate = function (d, style) {
    const D = toDate(d); if (!D) return d == null ? '' : String(d);
    const M = style === 'long' || !style ? MONTH : MON;
    if (monthOnly(d) || style === 'month') return `${M[D.getMonth()]} ${D.getFullYear()}`;
    if (style === 'day') return `${MON[D.getMonth()]} ${D.getDate()}`;
    return `${M[D.getMonth()]} ${D.getDate()}, ${D.getFullYear()}`;
  };
  /** "Apr 11–17, 2027" · "Apr 26 – May 2, 2026" · "Dec 30, 2026 – Jan 2, 2027"; style 'long' spells months, 'day' drops the year. */
  UI.fmtRange = function (a, b, style) {
    const A = toDate(a), B = toDate(b);
    if (!A) return '';
    if (monthOnly(a)) return UI.fmtDate(a, style === 'long' ? 'long' : 'month');
    const st = style === 'long' ? 'long' : style === 'day' ? 'day' : 'short';
    if (!B || +day0(A) === +day0(B)) return UI.fmtDate(A, st);
    const M = st === 'long' ? MONTH : MON, yr = st === 'day' ? '' : ', ' + A.getFullYear();
    if (A.getFullYear() !== B.getFullYear()) return `${UI.fmtDate(A, st)} – ${UI.fmtDate(B, st)}`;
    if (A.getMonth() === B.getMonth()) return `${M[A.getMonth()]} ${A.getDate()}–${B.getDate()}${yr}`;
    return `${M[A.getMonth()]} ${A.getDate()} – ${M[B.getMonth()]} ${B.getDate()}${yr}`;
  };
  /** Whole days from today (FCR.today(), so ?today= works) to d; negative when d is past. */
  UI.daysUntil = (d) => { const D = toDate(d); return D ? Math.round((day0(D) - day0(FCR.today())) / 864e5) : null; };
  UI.inDays = (n) => (n == null ? '' : n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 1 ? `in ${n.toLocaleString('en-US')} days` : `${(-n).toLocaleString('en-US')} days ago`);
  const yr2 = (a, b) => (a === b ? String(a) : `${a}–${String(b).slice(2)}`);   // '2026–27'

  // ---------- links, chips ----------
  UI.regionDot = (rid) => `<span class="dot" style="background:${FCR.regionColor(rid)}"></span>`;
  UI.areaLink = (n, opts) => {
    const a = FCR.areas[n]; if (!a) return n == null ? '' : `Area ${n}`;
    const label = opts && opts.brief ? a.short || a.name : a.name;
    return `<a href="#/area/${n}" data-tip="${esc(a.name)} · ${esc(FCR.regionName(a.region))} region">${opts && opts.short ? '' : 'Area '}${n}${opts && opts.noname ? '' : ' · ' + esc(label)}</a>`;
  };
  /** Area link that reads "Area 43 · New Hampshire" on wide screens and "A43" on phones (full name in the tooltip). */
  UI.areaShort = (n) => {
    const a = FCR.areas[n]; if (!a) return n == null ? '' : `Area ${n}`;
    return `<a href="#/area/${n}" class="pg-alink" data-tip="Area ${n} · ${esc(a.name)} · ${esc(FCR.regionName(a.region))} region"><span class="pg-long">Area ${n} · ${esc(a.short || a.name)}</span><span class="pg-short">A${n}</span></a>`;
  };
  UI.personLink = (name) => name && /^\(/.test(name) ? `<span class="muted">${esc(name)}</span>` : name ? `<a href="#/person/${encodeURIComponent(name)}">${esc(name)}</a>` : '<span class="muted">—</span>';
  UI.cchip = (id, role) => id ? `<span class="chip" data-tip="${esc(FCR.COMMITTEES[id] ? FCR.COMMITTEES[id].name : id)}">${esc(FCR.cabbr(id))}${role === 'chair' ? ' <span class="badge chair">Chair</span>' : role === 'alt_chair' ? ' <span class="badge alt">Alt</span>' : ''}</span>` : '';
  UI.roleBadge = (role) => role === 'chair' ? '<span class="badge chair">Chair</span>' : role === 'alt_chair' ? '<span class="badge alt">Alt. chair</span>' : '';
  UI.yearSelect = (id, years, sel, extra) => `<select id="${id}">${(extra || []).map((o) => `<option value="${o.v}" ${String(o.v) === String(sel) ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}${years.slice().reverse().map((y) => `<option value="${y}" ${String(y) === String(sel) ? 'selected' : ''}>${y} · ${ord(y - 1950)} GSC</option>`).join('')}</select>`;
  UI.empty = (msg) => `<div class="empty-state">${esc(msg)}</div>`;

  // ---------- the shared forecast (FCR.predict.odds) ----------
  /** '32%', '<1%', '–' (impossible). */
  UI.pct = (p) => { const s = FCR.predict && FCR.predict.fmt ? FCR.predict.fmt(p) : String(Math.round((p || 0) * 100)); return s === '–' ? s : s + '%'; };
  /** odds() for panel P when it is usable on a plain page: precomputed, or simulated when the continuing panel is known
      (a draw whose other half isn't published would only be noise). null otherwise. */
  UI.oddsFor = function (P) {
    const pd = FCR.predict; if (!pd || !pd.odds) return null;
    try {
      if (pd.forecastValid && pd.forecastValid(P)) return pd.odds(P);
      const pr = pd.buildProblem(P);
      return pr && pr.areas.length && pr.contKnown ? pd.odds(P) : null;
    } catch (e) { return null; }
  };
  /** One area's committees, most likely first: [{c, p, se, tied}] (impossible ones dropped). */
  UI.rankOdds = function (O, n) {
    const pr = (O && O.probs[n]) || {}, se = (O && O.se && O.se[n]) || {}, top = (O && O.top && O.top[n]) || { tied: [] };
    return Object.keys(pr).filter((c) => pr[c] > 0).sort((a, b) => pr[b] - pr[a]).map((c) => ({ c, p: pr[c], se: se[c], tied: !!top.nearTie && top.tied.includes(c) }));
  };
  const oddsTip = (x, O) => `${FCR.COMMITTEES[x.c] ? FCR.COMMITTEES[x.c].name : x.c}: ${(x.p * 100).toFixed(1)}%${x.se != null ? ' ± ' + (x.se * 100).toFixed(1) + ' pt' : ''} · ${O.precomputed ? 'precomputed forecast, ' + (O.draws || 0).toLocaleString('en-US') + ' simulated draws' : 'simulated, ' + (O.draws || 0).toLocaleString('en-US') + ' draws (approximate)'}`;
  /** "<b>Public Information</b> ≈ <b>Agenda</b> 32% / 31% · <b>Treatment/Accessibilities</b> 17%" — near-ties (< 3 points) joined by ≈. */
  UI.oddsSummary = function (O, n, k, abbr) {
    const r = UI.rankOdds(O, n); if (!r.length) return '';
    k = k || 3;
    const nm = (c) => esc(abbr ? FCR.cabbr(c) : FCR.cname(c));
    const one = (x) => `<span class="pg-odd" data-tip="${esc(oddsTip(x, O))}" tabindex="0"><strong>${nm(x.c)}</strong> ${UI.pct(x.p)}</span>`;
    const tied = r.filter((x) => x.tied);
    if (tied.length < 2) return r.slice(0, k).map(one).join(' · ');
    const head = `<span class="pg-tie" data-tip="${esc(tied.map((x) => oddsTip(x, O)).join(' · '))} — within 3 points: too close to call" tabindex="0">${tied.map((x) => `<strong>${nm(x.c)}</strong>`).join(' ≈ ')} <span class="nowrap">${tied.map((x) => UI.pct(x.p)).join(' / ')}</span></span>`;
    return [head].concat(r.filter((x) => !x.tied).slice(0, Math.max(1, k - tied.length)).map(one)).join(' · ');
  };
  /** Plain-text compact form for tables: "PI 32% ≈ AGD 31% · T&A 17%". */
  UI.oddsCompact = function (O, n, k) {
    const r = UI.rankOdds(O, n); if (!r.length) return '';
    const t = (x) => `${FCR.cabbr(x.c)} ${UI.pct(x.p)}`;
    const tied = r.filter((x) => x.tied);
    if (tied.length < 2) return r.slice(0, k || 3).map(t).join(' · ');
    return [tied.map(t).join(' ≈ ')].concat(r.filter((x) => !x.tied).slice(0, 1).map(t)).join(' · ');
  };
  /** Where the December draw of panel P stands today: {state:'before'|'december'|'after', year, text}. */
  UI.drawStatus = function (P) {
    const y = P + 1949, now = FCR.today();
    const state = now < new Date(y, 11, 1) ? 'before' : now < new Date(y + 1, 0, 1) ? 'december' : 'after';
    const text = state === 'before' ? `to be drawn by lot in December ${y}` : state === 'december' ? `being drawn by lot this month (December ${y})`
      : `drawn by lot in December ${y}; published in the ${y + 1} Final Report${FCR.Y(y + 1) ? '' : ' (not loaded yet)'}`;
    return { state, year: y, text };
  };

  /** A committee announced for area n's Panel P delegate before its Final Report (panel_elects.json 'committee' or
      'panel<P>_committee', e.g. user_provided once the December draw is known): {committee, secondary, source} or null. */
  UI.announcedCommittee = function (n, P) {
    const e = FCR.elects && FCR.elects.panel === P ? FCR.elects.byArea[n] : null;
    const raw = e && (e.committee || e['panel' + P + '_committee']);
    if (!raw) return null;
    const f = FCR.fold(raw), id = String(raw).toUpperCase();
    const C = FCR.COMMITTEES[id] ? id : Object.keys(FCR.COMMITTEES).find((k) => [FCR.COMMITTEES[k].name, FCR.cname(k), FCR.cabbr(k)].some((x) => FCR.fold(x) === f));
    if (!C) return null;
    const sec = e.secondary_committee || e['panel' + P + '_secondary'] || null;
    return { committee: C, secondary: sec && FCR.COMMITTEES[String(sec).toUpperCase()] ? String(sec).toUpperCase() : null,
      source: e.committee_source || (e.user_provided ? 'reported by the user' : e.source_note || '') };
  };
  /** "Drawn: <chip> Public Information" line with the forecast's chance for it (the forecast stays below for comparison). */
  UI.announcedLine = function (n, P, O) {
    const an = UI.announcedCommittee(n, P);
    if (!an) return '';
    const p = O && O.probs && O.probs[n] ? O.probs[n][an.committee] : null;
    return `<div class="pg-line"><span class="badge new">drawn</span> <strong>${esc(FCR.cname(an.committee))}</strong>${an.secondary ? ` + ${esc(FCR.cname(an.secondary))}` : ''}` +
      `${p != null ? ` <span class="small muted">· the forecast gave it ${UI.pct(p)}</span>` : ''}${an.source ? ` <span class="small muted">· ${esc(an.source)}</span>` : ''}</div>`;
  };

  /** Election status of a delegate-elect record, date-aware: "Election Nov 14", "Voted Oct 10 · result not posted". */
  UI.electStatus = function (e) {
    const ds = String(e.election_date || '').split(/\s*(?:\/|\bto\b)\s*/).filter(Boolean);
    const a = ds[0] || null, b = ds[ds.length - 1] || a;
    const D = toDate(a);
    const when = D ? UI.fmtRange(a, b, D.getFullYear() === FCR.today().getFullYear() ? 'day' : 'short') : '';
    const past = D ? UI.daysUntil(toDate(b) || D) < 0 : false;
    if (e.status === 'election_scheduled') return when ? (past ? `Voted ${when} · result not loaded` : `Election ${when}`) : 'Election scheduled';
    if (e.status === 'held_results_not_found') return when ? `Voted ${when} · result not posted` : 'Voted · result not posted';
    if (e.status === 'elected' && !e.delegate) return 'Elected · name not posted';
    return 'Not yet known';
  };

  /** Sortable table. cols: [{k, label, num, cls, nosort, render(row), sort(row)}]; opts: {sortK, dir, compact, emptyMsg, rowClass(row), rowId(row), onSort(k, dir), cls}. */
  UI.table = function (el, cols, rows, opts) {
    opts = opts || {};
    let sortK = opts.sortK || null, dir = opts.dir || 1;
    function draw() {
      let r = rows.slice();
      const c0 = sortK && cols.find((x) => x.k === sortK);
      if (c0) {
        const f = c0.sort || ((row) => row[c0.k]);
        r.sort((a, b) => { const x = f(a), y = f(b); return (x == null ? 1 : y == null ? -1 : x < y ? -1 : x > y ? 1 : 0) * dir; });
      }
      const cl = (c) => [c.num ? 'n' : '', c.cls || ''].filter(Boolean).join(' ');
      el.innerHTML = `<div class="table-wrap"><table class="t ${opts.compact ? 'compact' : ''} ${opts.cls || ''}"><thead><tr>${cols.map((c) => c.nosort
        ? `<th class="${cl(c)}">${esc(c.label)}</th>`
        : `<th class="${cl(c)} sortable" data-k="${c.k}" aria-sort="${sortK === c.k ? (dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="thbtn">${esc(c.label)}${sortK === c.k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}</tr></thead><tbody>${r.length ? r.map((row) => `<tr${opts.rowId && opts.rowId(row) ? ` id="${esc(opts.rowId(row))}"` : ''}${opts.rowClass && opts.rowClass(row) ? ` class="${opts.rowClass(row)}"` : ''}>${cols.map((c) => `<td class="${cl(c)}">${c.render ? c.render(row) : esc(row[c.k])}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}">${UI.empty(opts.emptyMsg || 'Nothing matches.')}</td></tr>`}</tbody></table></div>`;
      el.querySelectorAll('th.sortable .thbtn').forEach((btn) => btn.addEventListener('click', () => {
        const k = btn.closest('th').dataset.k; if (sortK === k) dir = -dir; else { sortK = k; dir = 1; }
        if (opts.onSort) opts.onSort(sortK, dir);
        draw();
        const again = el.querySelector(`th[data-k="${k}"] .thbtn`); if (again) again.focus();
      }));
    }
    draw();
  };

  // Tooltip for any [data-tip]: mouse hover, keyboard focus, and tap (touch) all work; Escape or any scroll closes it.
  let tipEl = null;
  const tipBox = () => document.getElementById('tooltip');
  function place(x, y) {
    const tip = tipBox(); if (!tip) return;
    const left = Math.max(8, Math.min(x + 14, window.innerWidth - tip.offsetWidth - 8));
    const top = y + 16 + tip.offsetHeight > window.innerHeight ? y - tip.offsetHeight - 10 : y + 16;
    tip.style.left = left + 'px'; tip.style.top = Math.max(8, top) + 'px';
  }
  function showTip(t, x, y) {
    const tip = tipBox(); if (!tip || !t) return;
    if (tipEl && tipEl !== t) tipEl.removeAttribute('aria-describedby');
    tipEl = t;
    if (t.hasAttribute('data-tip-html')) tip.innerHTML = t.getAttribute('data-tip'); else tip.textContent = t.getAttribute('data-tip');
    tip.hidden = false;
    // a mark whose name already is the tip text (chart bars: aria-label = data-tip) is not described twice
    if (t.getAttribute('aria-label') !== t.getAttribute('data-tip')) t.setAttribute('aria-describedby', 'tooltip');
    if (x == null) { const r = t.getBoundingClientRect(); x = r.left; y = r.bottom - 8; }
    place(x, y);
  }
  function hideTip() { const tip = tipBox(); if (tip) tip.hidden = true; if (tipEl) tipEl.removeAttribute('aria-describedby'); tipEl = null; }
  UI.hideTip = hideTip;
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { if (tipEl && e.pointerType !== 'touch') hideTip(); return; }
    showTip(t, e.clientX, e.clientY);
  });
  document.addEventListener('mousemove', (e) => { const tip = tipBox(); if (tip && !tip.hidden && tipEl) place(e.clientX, e.clientY); });
  // A tap or click also moves focus (to <main tabindex=-1>, or away from the heading the router focused). Only keyboard
  // focus moves close a tip here; taps and hovers are handled by pointerup / mouseover.
  let pointerAt = 0;
  const notePointer = () => { pointerAt = Date.now(); };
  document.addEventListener('pointerdown', notePointer, true);
  document.addEventListener('pointerup', notePointer, true);
  const byPointer = () => Date.now() - pointerAt < 800;
  document.addEventListener('focusin', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) showTip(t); else if (!byPointer()) hideTip(); });
  document.addEventListener('focusout', () => { if (!byPointer()) hideTip(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
  // capture: scrolling inside a table, the Gantt or the grid does not bubble to the document
  document.addEventListener('scroll', () => { if (tipEl) hideTip(); }, { passive: true, capture: true });
  document.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return;
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { hideTip(); return; }
    if (tipEl === t) hideTip(); else showTip(t, e.clientX, e.clientY);
  });

  /** Delegate rows for a "view year". mode 'current' = everyone serving today (+ elects), 'next' = the next Conference. */
  UI.delegateRows = function (view) {
    const cyc = FCR.cycle();
    const rows = [];
    const EP = FCR.elects.panel, stage = FCR.electStage(cyc);
    const yearMode = /^\d{4}$/.test(String(view));
    FCR.areaList.forEach((a) => {
      const list = FCR.termsByArea[a.n] || [];
      let terms;
      if (yearMode) terms = list.filter((t) => t.years.includes(+view) || t.panel + 1950 === +view || t.panel + 1951 === +view).filter((t) => FCR.Y(+view) ? t.years.includes(+view) : true);
      else if (view === 'next') terms = list.filter((t) => t.panel === cyc.nextConference - 1951);
      else terms = list.filter((t) => cyc.servingPanels.includes(t.panel));
      terms.forEach((t) => {
        // y = the year being described; yd = the latest year with a roster (names, attendance)
        const y = yearMode ? +view : (view === 'next' ? cyc.nextConference : cyc.year);
        const yd = Math.min(y, FCR.latestYear);
        const roles = t.roles[y] || [];
        const at = t.attended[yd];
        rows.push({
          area: a.n, areaName: a.name, region: a.region, panel: t.panel, name: FCR.termName(t, yd), names: t.names.slice(), city: FCR.termCity(t, yd),
          yearOfTerm: y === t.firstYear ? 1 : y === t.lastYear ? 2 : null,
          committee: t.committees[y] || t.committee, secondary: (t.secondary[y] || t.secondaryList || []),
          role: (roles.find((r) => !FCR.COMMITTEES[r.committee] || !FCR.COMMITTEES[r.committee].secondaryNow) || {}).role || null,
          roles, rotates: t.lastYear, status: t.statusByYear[yd] || 'delegate', seatedFor: at && at.for ? at.for : null,
          delegateChair: (t.delegateChair || []).filter((d) => d.year === y), elect: false, term: t,
        });
      });
      // Delegate-elect data (one panel, EP) fills in people the Final Reports don't list yet.
      const e = FCR.elects.byArea[a.n];
      if (!yearMode && e && EP != null && !list.some((t) => t.panel === EP)) {
        const include = view === 'current' ? (stage === 'elect' || stage === 'serving') : view === 'next' && (EP === cyc.nextConference - 1950 || EP === cyc.nextConference - 1951);
        if (include) {
          const yy = view === 'next' ? cyc.nextConference : cyc.year;
          rows.push({ area: a.n, areaName: a.name, region: a.region, panel: EP, name: e.delegate || '', names: [e.delegate, e.alternate].filter(Boolean),
            statusText: e.delegate ? '' : UI.electStatus(e), city: '', yearOfTerm: yy === EP + 1950 ? 1 : yy === EP + 1951 ? 2 : 0, committee: null, secondary: [], role: null, roles: [],
            rotates: EP + 1951, status: e.status, elect: stage === 'elect', fromWeb: true, electInfo: e, delegateChair: [] });
        }
      }
    });
    return rows;
  };

  /** The panel whose committee draw is still unknown for area n: the delegate-elect data's panel when it matches the
      area and isn't in a Final Report yet, otherwise the area's next panel by the calendar. */
  UI.predictPanelFor = function (n, cyc) {
    cyc = cyc || FCR.cycle();
    const parity = FCR.areaParity(n), EP = FCR.elects.panel;
    if (EP != null && parity === EP % 2 && !FCR.term(n, EP) && FCR.electStage(cyc) !== 'past') return EP;
    let p = cyc.electPanel; if (parity != null && p % 2 !== parity) p += 1;
    while (FCR.term(n, p)) p += 2;
    return p;
  };

  /** Neighbours of area n: continuing members (panel P-1) with their committee, and neighbours drawn in the same lot (panel P). */
  UI.neighborInfo = function (n, P) {
    return FCR.neighbors(n).map((b) => {
      const cont = FCR.term(b, P - 1);
      return { area: b, region: (FCR.areas[b] || {}).region, sameLot: FCR.areaParity(b) === P % 2, cont, committee: cont ? cont.committee : null,
        sameState: !!(FCR.areas[b] && FCR.areas[n] && FCR.areas[b].state && FCR.areas[b].state === FCR.areas[n].state) };
    });
  };

  /** What the model knows against area n in the draw of panel P: {excluded:[{committee, panel, name}], cont:{C:[{area, neighbor, sameState, sameRegion}]}}. */
  /** Caveat when the continuing panel's committees are not published yet (its neighbours/regions can't be used). */
  UI.roughNote = (P) => `<div class="small pg-warn pg-line">Rough forecast: the Panel ${P - 1} committees are not published yet (${P - 1 + 1950} Final Report), so continuing members' neighbours, states and regions can't be taken into account.</div>`;
  UI.drawContext = function (n, P) {
    const out = { excluded: [], cont: {}, contKnown: true };
    try {
      const pd = FCR.predict, pr = pd.buildProblem(P);
      out.contKnown = !!pr.contKnown;
      const hist = pr.history[n] || [], ex = pd.recentCommittees(hist, P, FCR.MODEL_DEFAULTS.excludeLast);
      out.excluded = hist.filter((h) => h.panel >= P - 2 * FCR.MODEL_DEFAULTS.excludeLast && ex.has(h.committee)).map((h) => { const t = FCR.term(n, h.panel); return { committee: h.committee, panel: h.panel, name: t ? t.name : '' }; });
      const a = FCR.areas[n] || {};
      pr.committees.forEach((c) => {
        const l = (pr.cont[c] || []).map((b) => { const B = FCR.areas[b] || {}; return { area: b, neighbor: FCR.isNeighbor(n, b), sameState: !!(a.state && B.state === a.state), sameRegion: B.region === a.region }; })
          .filter((x) => x.neighbor || x.sameState || x.sameRegion);
        if (l.length) out.cont[c] = l;
      });
    } catch (e) { /* no problem for this panel */ }
    return out;
  };

  // ---------- TODAY ----------
  const nAreasOf = (p) => FCR.areaList.filter((a) => FCR.areaParity(a.n) === p % 2).length;
  const termsOfPanel = (p) => Object.values(FCR.terms).filter((t) => t.panel === p).length;
  const seatName = (s) => (s.pid.startsWith('REG_') ? `${FCR.regionName(s.region)} regional trustee` : s.pid === 'GSB_CHAIR' ? 'GSB chair' : cap(s.label));
  /** Date-aware résumé / election line for a seat elected at Conference `year` ('' when the seat has no fixed deadline). */
  function seatDueText(s, year) {
    const c = FCR.conference(year), cyc = FCR.cycle();
    const confT = `the ${ord(year - 1950)} Conference${c.datesKnown ? ' (' + UI.fmtRange(c.startDate, c.endDate) + ')' : ''}`;
    const d = s && s.deadline;
    if (c.over) return `Elected at ${confT}; the name appears when the ${year} Final Report is loaded.`;
    if (cyc.inSession && cyc.nextConference === year) return `${cap(confT)} is meeting now and elects this seat this week.`;
    if (!d || !d.date) return `Elected at or after ${confT}.`;
    if (!d.passed) return `Résumés due ${UI.fmtDate(d.date, 'short')} — <strong>${UI.inDays(d.daysLeft)}</strong>; ${confT} elects.`;
    return `Résumés closed ${UI.fmtDate(d.date, 'short')}; ${confT} elects — ${UI.daysUntil(c.startDate) <= 0 ? 'meeting now' : UI.inDays(UI.daysUntil(c.startDate))}.`;
  }

  V.today = function (el) {
    const cyc = FCR.cycle(), now = cyc.now;
    const L = FCR.Y(FCR.latestYear) || {};
    const conf = FCR.conference(cyc.nextConference);
    const EP = FCR.elects.panel, stage = FCR.electStage(cyc);
    const myN = +FCR.store.get('myArea', 65) || 65, myRegion = FCR.areaRegion(myN);
    const lastC = FCR.conference(cyc.lastConference);

    // next Conference card
    const cdText = cyc.inSession ? `in session now — day ${UI.daysUntil(now) - UI.daysUntil(conf.startDate) + 1} of ${UI.daysUntil(conf.endDate) - UI.daysUntil(conf.startDate) + 1}`
      : conf.datesKnown ? UI.inDays(UI.daysUntil(conf.startDate)) : '';
    let calKey = null;
    try { const ci = FCR.calendar && conf.start ? FCR.calendar.items({ from: conf.start, to: conf.end, scope: 'everything' }).find((o) => o.ruleId === 'conference' && o.start === conf.start) : null; calKey = ci ? ci.key : null; } catch (e) { calKey = null; }
    const dc = conf.delegateChair;
    // proposed agenda items for this Conference (pai.json, GSO's status grid): from the grid's date until the Conference opens
    const paiSrc = ((FCR.RAW && FCR.RAW.pai) || {}).source || {};
    const nPai = paiSrc.conference_year === conf.year && !cyc.inSession && now < conf.startDate && (!paiSrc.as_of || now >= new Date(paiSrc.as_of + 'T00:00:00'))
      ? (FCR.RAW.pai.items || []).filter((x) => x.cycle === paiSrc.ordinal && x.status === 'under').length : 0;
    // once the trustees' committees have met at the fall board weekend after the grid's date, its statuses are old news
    let paiQ4 = null;
    try { paiQ4 = nPai && FCR.calendar && paiSrc.as_of && conf.start ? FCR.calendar.items({ from: paiSrc.as_of, to: conf.start, scope: 'everything' }).find((o) => o.ruleId === 'gsb-q4') : null; } catch (e) { paiQ4 = null; }
    const paiStale = !!paiQ4 && FCR.calendar.todayStr() > (paiQ4.end || paiQ4.start);
    const confCard = `<div class="card pg-conf">
        <div class="pg-kicker">${cyc.inSession ? 'Meeting now' : 'Next Conference'}</div>
        <h2 class="pg-conf-t">${ord(conf.ordinal)} General Service Conference</h2>
        <div class="pg-conf-when"><strong>${conf.datesKnown ? UI.fmtRange(conf.startDate, conf.endDate, 'long') : `spring ${conf.year} (dates not announced)`}</strong>${cdText ? ` <span class="pg-cd${cyc.inSession ? ' now' : ''}">${esc(cdText)}</span>` : ''}</div>
        ${conf.venue ? `<div class="pg-conf-venue ink2">${esc(conf.venue)}</div>` : ''}
        ${conf.theme ? `<div class="pg-conf-theme">Theme: <em>“${esc(conf.theme)}”</em></div>` : `<div class="pg-conf-theme muted small">${FCR.conference(conf.year - 1).over && !FCR.Y(conf.year - 1) ? `Theme chosen at the ${ord(conf.ordinal - 1)} Conference; it appears with the ${conf.year - 1} Final Report.` : `Theme: chosen at the ${ord(conf.ordinal - 1)} Conference.`}</div>`}
        ${dc ? `<div class="small ink2">Delegate chair: ${UI.personLink(dc.name)} · ${UI.areaShort(dc.area)}</div>` : ''}
        ${nPai ? `<div class="small pg-conf-pai">${paiStale ? `${nPai} proposed agenda items were under review in GSO’s ${esc(UI.fmtDate(paiSrc.as_of, 'short'))} grid` : `${nPai} proposed agenda items under review`} · <a href="#/agenda">Agenda&nbsp;Items&nbsp;→</a></div>` : ''}
        <div class="pg-conf-links small">${calKey ? `<a href="#/calendar/${encodeURIComponent(calKey)}">In the calendar →</a>` : '<a href="#/calendar">Calendar →</a>'} <a href="#/reports">Conference facts →</a></div>
        ${UI.conferenceGlance && (conf.workshop || conf.presentations) ? `<details class="pg-more"><summary>Workshop and presentation topics</summary>${UI.conferenceGlance(conf.year, { noTheme: true })}</details>` : ''}
      </div>`;

    // stats
    const secondP = cyc.nextConference - 1951, firstP = cyc.nextConference - 1950;
    const knownElects = (p) => (EP === p ? FCR.elects.list.filter((x) => x.delegate).length : 0);
    const nSecond = termsOfPanel(secondP);
    const stat = (v, l, href, tip) => `<${href ? `a href="${href}"` : 'div'} class="card stat${href ? ' pg-statlink' : ''}"${tip ? ` data-tip="${esc(tip)}"` : ''}><span class="v num">${v}</span><span class="l">${l}</span></${href ? 'a' : 'div'}>`;
    const s1 = nSecond ? stat(nSecond, cyc.inSession ? `Panel ${secondP} delegates are serving their 2nd year at this Conference — the committee chairs are among them`
      : `Panel ${secondP} delegates return for their 2nd year at the ${cyc.nextConference} Conference — committee chairs come from them`, '#/delegates/next')
      : stat(nAreasOf(secondP), `Panel ${secondP} delegates (one per area) return for their 2nd year in ${cyc.nextConference}${knownElects(secondP) ? ` · ${knownElects(secondP)} names known from area sites` : ''} · <span class="pg-warn">${secondP + 1950} Final Report not loaded yet</span>`, '#/delegates/next');
    const elStart = new Date(firstP + 1949, 8, 1), inOffice = new Date(firstP + 1950, 0, 1);
    let s2;
    if (EP === firstP && stage === 'elect') s2 = stat(`${knownElects(firstP)}<small class="muted"> / ${nAreasOf(firstP)}</small>`, `Panel ${firstP} delegate-elects found so far (take office Jan 1, ${firstP + 1950})`, '#/delegates/current');
    else if (EP === firstP && stage === 'serving') s2 = stat(`${knownElects(firstP)}<small class="muted"> / ${nAreasOf(firstP)}</small>`, `Panel ${firstP} delegates known from area websites (in office since Jan 1, ${firstP + 1950}; not yet in a Final Report)`, '#/delegates/current');
    else s2 = stat(nAreasOf(firstP), now < elStart ? `Panel ${firstP} delegates to be elected in the fall of ${firstP + 1949} (take office Jan 1, ${firstP + 1950})`
      : now < inOffice ? `Panel ${firstP} delegates being elected now (fall ${firstP + 1949}; take office Jan 1, ${firstP + 1950})` : `Panel ${firstP} delegates in office since Jan 1, ${firstP + 1950} (names not loaded)`);
    const op0 = (FCR.openings(cyc.nextConference, cyc.nextConference) || [])[0];
    const nSeats = op0 ? op0.counts.trustees + op0.counts.chair : 0;
    const s3 = stat(nSeats, `trustee seat${nSeats === 1 ? '' : 's'}${op0 && op0.counts.chair ? ' (incl. the GSB chair)' : ''} ${cyc.inSession ? 'being filled at this Conference' : `open at the ${ord(cyc.nextOrdinal)} Conference (${cyc.nextConference})`}${op0 && op0.counts.directors ? ` · plus ${op0.counts.directors} board director seat${op0.counts.directors === 1 ? '' : 's'}` : ''}`, '#/timeline');
    const s4 = cyc.reportPending ? stat(FCR.latestYear, `latest Final Report loaded · <span class="pg-warn">the ${cyc.lastConference} report (${ord(cyc.lastConference - 1950)} GSC) is not loaded yet</span>`, '#/reports')
      : stat(FCR.years.length, `Final Reports loaded (${FCR.years[0]}–${FCR.latestYear})`, '#/reports');

    // chairs (the latest report's "next year" table)
    const chairsYear = FCR.latestYear + 1, nextChairs = L.next_year_chairs || [];
    const chairsConf = FCR.conference(chairsYear), cdc = chairsConf.delegateChair;
    const chairsNote = chairsYear < cyc.nextConference
      ? `<div class="callout warn">The ${cyc.nextConference} chairs were elected at the ${cyc.lastConference} Conference; they appear when the ${cyc.lastConference} Final Report is loaded. Showing the ${chairsYear} chairs from the ${FCR.latestYear} report.</div>` : '';

    // board leadership (slate elected at the latest annual meeting)
    const off = FCR.currentOfficers();
    const staleOff = off && cyc.lastConference > off.conferenceYear;
    const asOf = off && off.asOf ? (/^\d{4}-\d{2}-\d{2}$/.test(off.asOf) && !off.approx ? UI.fmtDate(off.asOf, 'short') : UI.fmtDate(off.asOf.slice(0, 7), 'month')) : '';
    const BOARD = FCR.RAW.board || {};
    const gm = (BOARD.general_managers || []).filter((g) => !g.to).pop();
    const bc = (k, lbl) => { const b = off && off.boardChairs && off.boardChairs[k]; if (!b) return ''; return `<dt>${lbl} chair <span class="small muted">${esc(b.period || '')}</span></dt><dd>${b.name ? UI.personLink(b.name) : `<span class="muted">not yet published</span>${b.pattern ? ` <span class="small muted" tabindex="0" data-tip="${esc(cap(b.pattern.text) + (b.pattern.candidates && b.pattern.candidates.length ? ': ' + b.pattern.candidates.join(' or ') : ''))}">(pattern)</span>` : ''}`}</dd>`; };
    const board = off ? `<div class="card pg-board"><h3>Board leadership <span class="small muted">${off.source === 'slate' ? `since ${esc(asOf)}` : esc(off.ref || '')}</span></h3>
        ${staleOff ? `<p class="small pg-warn">${cyc.lastConference - off.conferenceYear > 1 ? `New slates were elected at the annual meetings after the ${ord(off.conferenceYear + 1 - 1950)}–${ord(cyc.lastConference - 1950)} Conferences; they appear when those Final Reports are loaded.` : `A new slate was elected at the annual meeting after the ${ord(cyc.lastConference - 1950)} Conference (${UI.fmtDate(lastC.endDate, 'month')}); it appears when the ${cyc.lastConference} Final Report is loaded.`} Shown: the slate of ${esc(asOf)}.</p>` : ''}
        <dl class="kv">${off.officers.map((o) => `<dt>${esc(o.title)}</dt><dd>${UI.personLink(o.name)}${o.employee ? ' <span class="small muted">GSO employee</span>' : ''}</dd>`).join('')}
        ${bc('aaws', 'AAWS board')}${bc('grapevine', 'AA Grapevine board')}
        ${gm || L.general_manager ? `<dt>GSO general manager</dt><dd>${UI.personLink(gm ? gm.name : L.general_manager)}</dd>` : ''}
        ${L.staff_director ? `<dt>Staff Services director</dt><dd>${UI.personLink(L.staff_director)}</dd>` : ''}</dl>
        <p class="small"><a href="#/board">Trustees &amp; boards →</a></p></div>` : '';

    // seats opening (FCR.openings: trustee seats counted, director seats and soft markers listed)
    const ops = FCR.openings(cyc.nextConference, cyc.nextConference + 2) || [];
    const seatChip = (s) => {
      const who = s.holder ? s.holder.name : s.successorOf ? `successor of ${s.successorOf}` : s.name;
      const tip = joinDot([s.note, s.deadline && s.deadline.text, s.nominatedBy]);
      return `<a class="chip pg-seat${s.soft ? ' soft' : ''}${s.region && s.region === myRegion ? ' mine' : ''}" href="#/timeline"${tip ? ` data-tip="${esc(tip)}"` : ''}>${esc(seatName(s))} · ${esc(who)}${s.soft ? ' <span class="muted">(maybe)</span>' : ''}</a>`;
    };
    const firstDue = ops[0] && ops[0].seats.find((s) => !s.soft && s.deadline && s.deadline.date);
    const seats = `<div class="card pg-seats"><h3>Seats opening soon <a class="small" href="#/timeline">all openings →</a></h3>
        ${ops.map((o) => { const n = o.counts.trustees + o.counts.chair;
          const hard = o.seats.filter((s) => !s.soft), soft = o.seats.filter((s) => s.soft);
          return `<div class="pg-seats-y"><div><strong>${o.year} · ${ord(o.ordinal)} Conference</strong> <span class="small muted">${n} trustee seat${n === 1 ? '' : 's'}${o.counts.chair ? ' incl. the GSB chair' : ''}${o.counts.directors ? ` · +${o.counts.directors} director` : ''}</span></div>
            <div class="pg-chips">${hard.map(seatChip).join('') || '<span class="muted small">No projected rotations</span>'}${soft.length ? `<span class="chip pg-seat soft" tabindex="0" data-tip="${esc(soft.map((s) => `${seatName(s)} · ${s.holder ? s.holder.name : s.successorOf ? 'successor of ' + s.successorOf : s.name}${s.note ? ' — ' + s.note : ''}`).join(' | '))}">+${soft.length} may also open</span>` : ''}</div>
            ${o === ops[0] && firstDue ? `<p class="small pg-line">${seatDueText(firstDue, o.year)} <span class="muted">(regional and at-large seats; areas send résumés to GSO)</span></p>` : ''}</div>`; }).join('')}
        <p class="small muted">Projected from election year + standard term (regional, at-large and general service trustees 4 years, Class A up to two 3-year terms, nontrustee directors 4). Dashed = may also open (a Class A first term ending, a possible extra director vacancy). Confirm against the next Final Report.</p></div>`;

    // term explainer (date-aware)
    const elP = cyc.electPanel, par = elP % 2 ? 'odd' : 'even', fallNow = now.getMonth() >= 8;
    const termNote = `<div class="callout">A delegate's term runs <strong>Jan 1 of the year after election to Dec 31 two years later</strong>.
        Right now Panel ${cyc.rotatingPanel} (second and final year, ends Dec 31, ${cyc.year}) and Panel ${cyc.year - 1950} (first year) are serving;
        areas with ${par}-numbered panels ${fallNow ? `are electing their Panel ${elP} delegates this fall` : `elect their Panel ${elP} delegates in the fall of ${cyc.year}`} (in office Jan 1, ${cyc.year + 1}).
        At the ${cyc.nextConference} Conference the Panel ${cyc.nextConference - 1951} delegates are the second-year members, and the committee chairs come from them.</div>`;

    el.innerHTML = `<div class="pg pg-today">
      <div class="page-head"><div><h1>Where things stand</h1>
      <p>As of <strong>${UI.fmtDate(now)}</strong> · latest Final Report loaded: <strong>${FCR.latestYear}</strong> (${ord(FCR.latestYear - 1950)} GSC${L.theme ? ', “' + esc(L.theme) + '”' : ''}).</p></div></div>
      ${cyc.reportPending ? (cyc.lastConference - FCR.latestYear > 1
        ? `<div class="callout warn">The ${ord(FCR.latestYear + 1 - 1950)}–${ord(cyc.lastConference - 1950)} Conferences have met (the latest ${lastC.datesKnown ? UI.fmtRange(lastC.startDate, lastC.endDate) : 'this spring'}), but their Final Reports aren't loaded, so their results — committee assignments, chairs, new trustees and officers — are not shown below.</div>`
        : `<div class="callout warn">The ${ord(cyc.lastConference - 1950)} Conference met ${lastC.datesKnown ? UI.fmtRange(lastC.startDate, lastC.endDate) : 'this spring'}. Its Final Report (usually out in late summer) isn't loaded yet, so its results — committee assignments, next year's chairs, new trustees and officers — are not shown below.</div>`) : ''}
      <div class="grid g2 pg-top">${confCard}<div class="card cal-mini-card pg-coming" id="t-coming"></div></div>
      <div class="grid g4 pg-stats">${s1}${s2}${s3}${s4}</div>
      <div class="card pg-myarea" id="my-area"></div>
      ${termNote}
      <h2 class="section-title">${chairsYear} Conference committee chairs &amp; alternates</h2>
      ${chairsNote}
      ${cdc ? `<p class="pg-dchair">Delegate chair of the ${ord(chairsYear - 1950)} Conference: ${UI.personLink(cdc.name)} · ${UI.areaShort(cdc.area)} <span class="small muted">(a second-year delegate, chosen by lot)</span></p>` : ''}
      <div id="t-chairs"></div>
      <div class="grid g2 pg-pair">${board}${seats}</div>
    </div>`;
    try { if (UI.comingUp) UI.comingUp(el.querySelector('#t-coming'), { limit: 5, bare: true }); else el.querySelector('#t-coming').innerHTML = '<h3>Coming up</h3><p><a href="#/calendar">Calendar →</a></p>'; } catch (e) { el.querySelector('#t-coming').innerHTML = '<h3>Coming up</h3><p><a href="#/calendar">Calendar →</a></p>'; }
    const nameCell = (p) => p ? `${UI.personLink(p.name)} <span class="small muted">${UI.areaShort(p.area)}</span>` : '<span class="muted">—</span>';
    UI.table(el.querySelector('#t-chairs'), [
      { k: 'committee', label: 'Committee', render: (r) => `<a href="#/committees/${chairsYear}/${r.committee}" data-tip="${esc(FCR.COMMITTEES[r.committee] ? FCR.COMMITTEES[r.committee].name : r.committee)}"><span class="pg-long">${esc(FCR.cname(r.committee))}</span><span class="pg-short">${esc(FCR.cabbr(r.committee))}</span></a>`, sort: (r) => FCR.cname(r.committee) },
      { k: 'chair', label: 'Chair', render: (r) => `${nameCell(r.chair)}<div class="pg-mshow small"><span class="muted">alt.</span> ${nameCell(r.alternate)}</div>`, sort: (r) => r.chair && r.chair.name },
      { k: 'alt', label: 'Alternate chair', cls: 'pg-hide-m', render: (r) => nameCell(r.alternate), sort: (r) => r.alternate && r.alternate.name },
    ], nextChairs, { compact: true, cls: 'pg-chairs', rowClass: (r) => ((r.chair && r.chair.area === myN) || (r.alternate && r.alternate.area === myN) ? 'pg-mine' : ''), emptyMsg: 'The latest report has no next-year chairs table.' });
    // A new "my area" changes the chairs-table and seat-chip highlights too: rebuild the page, keep focus on the selector.
    UI.myArea(el.querySelector('#my-area'), () => { V.today(el); const s = el.querySelector('#my-area-sel'); if (s) s.focus(); });
  };

  /** "My area" card: delegates, election status, next committee odds, regional trustee seat (all date-aware).
      onChange: called after the reader picks another area (default: redraw this card only). */
  UI.myArea = function (box, onChange) {
    if (!box) return;
    const cyc = FCR.cycle();
    const n = +FCR.store.get('myArea', 65) || 65;
    const a = FCR.areas[n];
    if (!a) { box.innerHTML = ''; return; }
    const terms = (FCR.termsByArea[n] || []).filter((t) => cyc.servingPanels.includes(t.panel));
    const EP = FCR.elects.panel, stage = FCR.electStage(cyc);
    const elect = FCR.elects.byArea[n];
    const showElect = !!(elect && EP != null && (stage === 'elect' || stage === 'serving') && !FCR.term(n, EP));
    const P = UI.predictPanelFor(n, cyc);
    const O = UI.oddsFor(P);
    const ctx = UI.drawContext(n, P);
    const ds = UI.drawStatus(P);
    const delLine = (t) => {
      const hs = FCR.termHolders(t), h = hs[hs.length - 1];
      const roles = [].concat(...Object.keys(t.roles).sort().map((y) => t.roles[y].map((r) => `${r.role === 'chair' ? 'chair' : 'alt. chair'} ${esc(FCR.cabbr(r.committee))} ${y}`)),
        (t.delegateChair || []).map((d) => `${d.role === 'chair' ? 'delegate chair' : 'alt. delegate chair'} of the ${ord(d.ordinal)} GSC`));
      return `<div class="pg-dl">${UI.personLink(h.name)} <span class="small muted">Panel ${t.panel}</span> ${UI.cchip(t.committee)} ${t.secondaryList.map((s) => UI.cchip(s)).join(' ')}
        <div class="small ink2">${joinDot([`term ${t.firstYear}–${t.lastYear}`, t.lastYear === cyc.year ? `<strong>rotates Dec 31, ${cyc.year}</strong>` : t.firstYear === cyc.year ? 'first year' : '', ...roles])}</div></div>`;
    };
    const electLine = !showElect ? '' : `<div class="pg-dl"><span class="badge new">Panel ${EP}</span> ${elect.delegate
      ? `<strong>${UI.personLink(elect.delegate)}</strong> <span class="small ink2">${stage === 'elect' ? `delegate-elect · takes office Jan 1, ${EP + 1950}` : `serving ${EP + 1950}–${EP + 1951} · not yet in a Final Report`}</span>${elect.alternate ? `<div class="small ink2">alternate ${UI.personLink(elect.alternate)}</div>` : ''}`
      : `<span class="small">${esc(UI.electStatus(elect))}</span>`}
      ${elect.source_note || elect.source_url ? `<div class="small muted">${[elect.source_note ? esc(elect.source_note) : '', elect.source_url ? `<a href="${esc(elect.source_url)}" target="_blank" rel="noopener">${elect.user_provided ? 'election notice' : 'source'}</a>` : ''].filter(Boolean).join(' · ')}</div>` : ''}</div>`;
    const delegatesHtml = terms.map(delLine).join('') + electLine || '<span class="muted small">No current term loaded.</span>';

    // committee forecast
    // committee abbreviations carry their full name as a tip (as the chips do elsewhere)
    const cfull = (c) => (FCR.COMMITTEES[c] ? FCR.COMMITTEES[c].name : c);
    const ab = (c) => `<span class="pg-ab" tabindex="0" data-tip="${esc(cfull(c))}">${esc(FCR.cabbr(c))}</span>`;
    const exHtml = ctx.excluded.map((x) => `<span class="badge pg-x" tabindex="0" data-tip="${esc(cfull(x.committee))} — held by Area ${n} in Panel ${x.panel}${x.name ? ' (' + esc(x.name) + ')' : ''}; skipped for ${FCR.MODEL_DEFAULTS.excludeLast} terms">${esc(FCR.cabbr(x.committee))}</span>`).join(' ');
    const contNb = Object.keys(ctx.cont).filter((c) => ctx.cont[c].some((x) => x.neighbor || x.sameState));
    const contRg = Object.keys(ctx.cont).filter((c) => !contNb.includes(c));
    const nbHtml = contNb.length ? `<div class="small pg-line">Neighbours continuing on ${contNb.map((c) => `<span class="nowrap">${ab(c)} (${ctx.cont[c].filter((x) => x.neighbor || x.sameState).map((x) => UI.areaLink(x.area, { noname: true })).join(', ')})</span>`).join(', ')} <span class="muted">— neighbouring and same-state areas rarely share a committee</span></div>` : '';
    const rgHtml = contRg.length ? `<div class="small pg-line">Other ${esc(FCR.regionName(a.region))} delegates continue on ${contRg.map(ab).join(', ')} <span class="muted">— a second member from the region is less likely</span></div>` : '';
    const forecast = UI.announcedLine(n, P, O) + (O && O.probs[n]
      ? `<div class="pg-line">${ds.state === 'after' || UI.announcedCommittee(n, P) ? '<span class="small muted">Forecast before the draw:</span> ' : ''}${UI.oddsSummary(O, n, 4)}</div>
         ${(O.top[n] || {}).nearTie ? '<div class="small muted">Top committees within 3 points of each other: too close to call.</div>' : ''}${ctx.contKnown ? '' : UI.roughNote(P)}
         ${exHtml ? `<div class="small pg-line">Ruled out (held in its last ${FCR.MODEL_DEFAULTS.excludeLast} terms): ${exHtml}</div>` : ''}${nbHtml}${rgHtml}
         <div class="small pg-line"><a href="#/predict/${P}/area/${n}">Why these odds? →</a></div>`
      : `<div class="muted small">${!O ? `The forecast needs the Panel ${P - 1} committees, first published in the ${P - 1 + 1950} Final Report.` : 'Not enough history to forecast.'}</div>`);

    // regional trustee
    const rt = FCR.regionalTrustee(a.region), cur = rt.current;
    const rotated = cur && cur.end && cur.end <= cyc.lastConference;
    let rtHtml = '';
    if (cur && !rotated) {
      rtHtml = `<div>${UI.personLink(cur.name)} <span class="small muted">elected ${cur.start} · rotates at the ${cur.end} Conference</span></div>`;
      if (rt.nextElection === cur.end) {
        const op = (FCR.openings(cur.end, cur.end) || [])[0];
        const s = op && op.seats.find((x) => x.pid === rt.pid && !x.soft);
        rtHtml += `<div class="small pg-line"><strong>Next ${esc(FCR.regionName(a.region))} regional trustee</strong> — ${seatDueText(s, cur.end)}${s && s.deadline && !s.deadline.passed ? ' Areas of the region send résumés to GSO.' : ''}</div>`;
      } else if (rt.nextElection) rtHtml += `<div class="small pg-line">Next ${esc(FCR.regionName(a.region))} regional trustee election: the ${rt.nextElection} Conference.</div>`;
    } else if (cur && rotated) {
      rtHtml = `<div>${UI.personLink(cur.name)} <span class="small muted">served ${cur.start}–${cur.end}; rotated at the ${ord(cur.end - 1950)} Conference</span></div>
        <div class="small pg-line">The successor was elected at the ${ord(cur.end - 1950)} Conference; the name appears when the ${cur.end} Final Report is loaded.${rt.nextElection ? ` Next ${esc(FCR.regionName(a.region))} election: the ${rt.nextElection} Conference.` : ''}</div>`;
    } else rtHtml = `<div class="muted small">Not in the loaded reports.</div>${rt.nextElection ? `<div class="small">Next election: the ${rt.nextElection} Conference.</div>` : ''}`;

    box.innerHTML = `
      <div class="flex"><h3 style="margin:0">My area</h3>
        <select id="my-area-sel" aria-label="Choose my area">${FCR.areaList.map((x) => `<option value="${x.n}" ${x.n === n ? 'selected' : ''}>Area ${x.n} · ${esc(x.name)}</option>`).join('')}</select>
        <span class="spacer"></span><a href="#/area/${n}">full area history →</a></div>
      <div class="grid g3 pg-myarea-g">
        <div><div class="pg-sub">Delegates</div>${delegatesHtml}</div>
        <div><div class="pg-sub">Panel ${P} delegate's committee — ${esc(ds.text)}</div>${forecast}</div>
        <div><div class="pg-sub">${UI.regionDot(a.region)} ${esc(FCR.regionName(a.region))} regional trustee</div>${rtHtml}</div>
      </div>`;
    box.querySelector('#my-area-sel').addEventListener('change', (e) => { FCR.store.set('myArea', +e.target.value); if (onChange) onChange(); else UI.myArea(box); });
  };

  // ---------- DELEGATES & MAP ----------
  // Filter: accent/punctuation folding (FCR.fold), word-start matching, whole numbers, "panel 77"/"p77", "area 65"/"a65",
  // and exact keys for abbreviations (committee PI/T&A/IC/RF, state TX, region SW) so "pi" does not find Mississippi.
  const compact = (s) => FCR.fold(s).replace(/ /g, '');
  let ABBR = null;
  const abbrSet = () => ABBR || (ABBR = new Set([].concat(Object.keys(FCR.COMMITTEES).map((c) => compact(FCR.cabbr(c))),
    FCR.REGIONS.map((r) => compact(r.id)), FCR.areaList.map((a) => compact(a.state || '')).filter(Boolean))));
  function rowIndex(r) {
    const a = FCR.areas[r.area] || {};
    const cs = [r.committee].concat(r.secondary || []).filter(Boolean);
    const text = [].concat(r.names || [], [r.name, a.name, a.short, a.state, FCR.regionName(r.region), r.city],
      cs.map((c) => (FCR.COMMITTEES[c] ? FCR.COMMITTEES[c].name + ' ' + FCR.cname(c) : c)),
      (r.roles || []).map((x) => (x.role === 'chair' ? 'chair' : 'alternate chair alt chair')),
      (r.delegateChair || []).length ? ['delegate chair'] : [], r.fromWeb ? [r.elect ? 'elect delegate elect' : 'area site'] : [],
      r.status === 'alternate' ? ['alternate seated'] : []).join(' ');
    return { words: FCR.fold(text).split(' '), keys: cs.map((c) => 'c:' + compact(FCR.cabbr(c))).concat(['s:' + compact(a.state || ''), 'r:' + compact(r.region || '')]), nums: [r.area, r.panel, r.rotates] };
  }
  function makeFilter(q) {
    let f = FCR.fold(q); if (!f) return null;
    let panel = null, area = null;
    f = f.replace(/\b(?:panel|p) ?(\d{2})\b/, (m, d) => { panel = +d; return ' '; }).replace(/\b(?:area|a) ?(\d{1,2})\b/, (m, d) => { area = +d; return ' '; });
    const toks = f.split(' ').filter(Boolean), key = toks.join('');
    const punct = /[&/.]/.test(q);   // 'p/a' is the committee, 'pa' also Pacific and Pennsylvania
    const isKey = toks.length > 0 && !/\s/.test(String(q).trim()) && abbrSet().has(key);   // 'ic/rf', 't&a', 'pi', 'tx' (typed without spaces)
    return (r) => {
      if (panel != null && r.panel !== panel) return false;
      if (area != null && r.area !== area) return false;
      if (!toks.length) return true;
      const ix = r._ix || (r._ix = rowIndex(r));
      if (isKey) return ix.keys.includes('c:' + key) || (!punct && (ix.keys.includes('s:' + key) || ix.keys.includes('r:' + key)));
      return toks.every((t) => (/^\d+$/.test(t) ? ix.nums.includes(+t) : ix.words.some((w) => w.startsWith(t))));
    };
  }

  let map = null, markerLayer = null, tiles = null, homeBounds = null, delRefresh = null;
  const isDark = () => { const t = document.documentElement.getAttribute('data-theme'); return t ? t === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); };
  // Esri gray canvas: no API key needed, works from file:// as well as a web host.
  const tileUrl = (dark) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${dark ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base'}/MapServer/tile/{z}/{y}/{x}`;
  /** Theme change: swap the tiles only (no re-render). app.js fires 'fcr:theme'; the attribute observer covers other toggles. */
  function syncTiles() { if (map && tiles && document.body.contains(map.getContainer())) tiles.setUrl(tileUrl(isDark())); }
  // These pages are styled by CSS tokens only (pins included), so the theme change needs no re-render here.
  const CSS_THEMED = ['today', 'delegates', 'area', 'person'];
  window.addEventListener('fcr:theme', (e) => { syncTiles(); if (e.detail && CSS_THEMED.includes(e.detail.view)) e.detail.handled = true; });
  try { new MutationObserver(syncTiles).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* old browser */ }
  if (window.matchMedia) { const mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', syncTiles); }
  // Phone/desktop column sets: re-render the delegates table when the width crosses the breakpoint.
  if (window.matchMedia) { const mq = window.matchMedia('(max-width: 640px)'); const h = () => { if (delRefresh && document.getElementById('d-table')) delRefresh(); }; if (mq.addEventListener) mq.addEventListener('change', h); }

  V.delegates = function (el, args) {
    const okView = (v) => v === 'current' || v === 'next' || FCR.years.some((y) => String(y) === String(v));
    const st = Object.assign({ view: 'current', region: '', panel: '', committee: '', q: '', rot: false, sortK: 'area', dir: 1 }, FCR.store.get('delegates', {}));
    if (!okView(st.view)) st.view = 'current';
    if (args && args[0] && okView(args[0])) st.view = String(args[0]);
    // #/delegates/<view>/<region id or name> (search's region results) opens filtered to that region
    const rk = args && args[1] ? (() => { try { return decodeURIComponent(args[1]); } catch (e) { return args[1]; } })() : '';
    const urlRegion = rk && Object.prototype.hasOwnProperty.call(FCR.regionBy, rk) ? FCR.regionBy[rk] : null;
    if (urlRegion) st.region = urlRegion.id;
    const cyc = FCR.cycle();
    const myN = +FCR.store.get('myArea', 65) || 65;
    const rotYear = () => (st.view === 'current' ? cyc.year : st.view === 'next' ? cyc.nextConference : +st.view);
    el.innerHTML = `<div class="pg pg-del">
      <div class="page-head"><div><h1>Delegates &amp; map</h1><p>All 93 areas of the U.S./Canada structure. Pick a Conference year or “serving today”, then filter by region, panel, committee or any text.</p></div></div>
      <div class="controls pg-del-ctl">
        <label>Show ${UI.yearSelect('d-view', FCR.years, st.view, [{ v: 'current', l: `Serving today (${UI.fmtDate(cyc.now, 'short')})` }, { v: 'next', l: `${cyc.nextConference} Conference (projected)` }])}</label>
        <label>Region <select id="d-region"><option value="">All regions</option>${FCR.REGIONS.map((r) => `<option value="${r.id}" ${st.region === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
        <label>Panel <select id="d-panel"><option value="">Both</option><option value="odd" ${st.panel === 'odd' ? 'selected' : ''}>Odd panels</option><option value="even" ${st.panel === 'even' ? 'selected' : ''}>Even panels</option></select></label>
        <label>Committee <select id="d-comm"><option value="">Any</option>${Object.keys(FCR.COMMITTEES).filter((c) => c !== 'OTHER').map((c) => `<option value="${c}" ${st.committee === c ? 'selected' : ''}>${esc(FCR.cname(c))}</option>`).join('')}</select></label>
        <input id="d-q" type="search" placeholder="Filter: name, area, state, city, committee, “panel 77”…" aria-label="Filter delegates" value="${esc(st.q)}">
        <button type="button" class="pg-toggle" id="d-rot" aria-pressed="${st.rot ? 'true' : 'false'}"></button>
        <span class="spacer"></span><span id="d-count" class="small muted" aria-live="polite"></span>
      </div>
      <div class="legend pg-legend" id="d-legend" role="group" aria-label="Regions: filter the list and zoom the map"></div>
      <div id="map" class="pg-map" role="region" aria-label="Map of areas"></div>
      <div id="d-table" class="pg-dtable"></div></div>`;
    const legend = el.querySelector('#d-legend');
    legend.innerHTML = FCR.REGIONS.map((r) => `<button type="button" data-r="${r.id}" aria-pressed="${st.region === r.id}">${UI.regionDot(r.id)}${esc(r.name)}</button>`).join('');
    legend.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      st.region = st.region === b.dataset.r ? '' : b.dataset.r; el.querySelector('#d-region').value = st.region; refresh(); fitRegion(st.region);
    }));
    initMap(el.querySelector('#map'), myN);
    const bind = (id, k, ev) => el.querySelector(id).addEventListener(ev || 'change', (e) => { st[k] = e.target.value; refresh(); if (k === 'region') fitRegion(st.region); });
    bind('#d-view', 'view'); bind('#d-region', 'region'); bind('#d-panel', 'panel'); bind('#d-comm', 'committee'); bind('#d-q', 'q', 'input');
    el.querySelector('#d-rot').addEventListener('click', () => { st.rot = !st.rot; refresh(); });

    let O = null, oddsTried = false;
    function refresh() {
      FCR.store.set('delegates', st);
      legend.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.r === st.region)));
      const rb = el.querySelector('#d-rot'); rb.setAttribute('aria-pressed', String(!!st.rot)); rb.textContent = `Rotating Dec 31, ${rotYear()}`;
      let all = UI.delegateRows(st.view);
      // forecast for the delegate-elect rows (the one shared forecast: FCR.predict.odds)
      if (all.some((r) => r.fromWeb)) {
        if (!oddsTried) { oddsTried = true; O = UI.oddsFor(FCR.elects.panel); }
        const ds = UI.drawStatus(FCR.elects.panel);
        all.forEach((r) => { if (r.fromWeb && O && O.probs[r.area]) { r.forecast = UI.oddsCompact(O, r.area, 3); r.forecast2 = UI.oddsCompact(O, r.area, 2); r.forecastP = (O.top[r.area] || {}).p || 0; r.drawState = ds; } });
      }
      const fq = makeFilter(st.q);
      const rows = all.filter((r) => (!st.region || r.region === st.region) &&
        (!st.panel || (st.panel === 'odd' ? r.panel % 2 === 1 : r.panel % 2 === 0)) &&
        (!st.committee || r.committee === st.committee || (r.secondary || []).includes(st.committee)) &&
        (!st.rot || r.rotates === rotYear()) && (!fq || fq(r)));
      // 'Serving today' also lists the next panel's delegate-elects (most still unnamed): count them apart from the seats
      const seat = (r) => st.view !== 'current' || !r.elect;
      const sAll = all.filter(seat).length, sRows = rows.filter(seat).length, eRows = rows.filter((r) => r.elect);
      let countText = sRows === sAll ? `${sAll} delegates` : `${sRows} of ${sAll} delegates`;
      if (eRows.length) countText += ` · ${eRows.filter((r) => r.name).length} of ${eRows.length} Panel ${FCR.elects.panel} elects known`;
      el.querySelector('#d-count').textContent = countText;
      drawMarkers(rows, myN);
      const phone = UI.isPhone();
      const P0 = FCR.elects.panel;
      const delegateCell = (r) => {
        if (r.fromWeb) {
          const e = r.electInfo, tip = [e.notes, e.source_note, e.source_url ? 'source: ' + e.source_url : ''].filter(Boolean).join(' · ');
          return e.delegate ? `${UI.personLink(e.delegate)} <span class="badge new" tabindex="0" data-tip="${esc((r.elect ? 'Delegate-elect' : 'Serving; not yet in a Final Report') + ' · ' + (tip || 'from the area’s website'))}">${r.elect ? 'elect' : 'serving'}</span>`
            : `<span class="muted pg-status" tabindex="0" data-tip="${esc(`Panel ${r.panel} delegate not known yet` + (tip ? ' · ' + tip : ''))}">${esc(r.statusText)}</span>`;
        }
        return `${UI.personLink(r.name)}${r.status === 'alternate' ? ` <span class="badge" tabindex="0" data-tip="Alternate delegate seated${r.seatedFor ? ' for ' + esc(r.seatedFor) : ''}">alt.</span>` : ''}${(r.delegateChair || []).length ? ' <span class="badge chair" data-tip="Conference delegate chair">Del. chair</span>' : ''}`;
      };
      const phoneNow = UI.isPhone();
      const committeeCell = (r) => {
        if (r.committee) return `<span class="pg-chips">${UI.cchip(r.committee, r.role)}${(r.secondary || []).map((s) => UI.cchip(s)).join('')}</span>`;
        const an = r.fromWeb ? UI.announcedCommittee(r.area, r.panel) : null;
        if (an) return `<span class="pg-chips" data-tip="${esc('Announced before the Final Report' + (an.source ? ' · ' + an.source : ''))}">${UI.cchip(an.committee)}${an.secondary ? UI.cchip(an.secondary) : ''}</span>`;
        if (r.forecast) {
          const after = r.drawState && r.drawState.state === 'after';
          return `<a class="small pg-likely" href="#/predict/${P0}/area/${r.area}" data-tip="${esc((after ? `Drawn by lot in December ${r.drawState.year}; not published yet. ` : '') + 'Forecast for the draw (default model) — ≈ marks committees within 3 points. Click for the explanation.')}">${after ? 'forecast ' : 'likely '}${esc(phoneNow ? r.forecast2 : r.forecast)}</a>`;
        }
        return '<span class="muted">—</span>';
      };
      const yrBadge = (r) => (r.yearOfTerm === 1 ? ' <span class="badge" data-tip="first year at the Conference">1st yr</span>' : r.yearOfTerm === 2 ? ' <span class="badge" data-tip="second (final) year">2nd yr</span>' : '');
      const cols = phone ? [
        { k: 'area', label: 'Area', render: (r) => `<a href="#/area/${r.area}" data-tip="Area ${r.area} · ${esc(r.areaName)} · ${esc(FCR.regionName(r.region))} region">${UI.regionDot(r.region)} ${r.area}</a><div class="small muted pg-ashort">${esc((FCR.areas[r.area] || {}).short || r.areaName).replace(/\//g, '/<wbr>')}</div>` },
        { k: 'name', label: 'Delegate', render: delegateCell, sort: (r) => r.name || 'zz' },
        { k: 'panel', label: 'Panel', cls: 'pg-nw', render: (r) => `<span data-tip="Term ends Dec 31, ${r.rotates}">${r.panel}</span>${r.yearOfTerm ? `<div><span class="badge" data-tip="${r.yearOfTerm === 1 ? 'first year at the Conference' : 'second (final) year'}">${r.yearOfTerm === 1 ? '1st' : '2nd'}</span></div>` : ''}` },
        { k: 'committee', label: 'Committee', render: committeeCell, sort: (r) => (r.committee ? FCR.cname(r.committee) : 'zz') },
      ] : [
        { k: 'area', label: 'Area', num: true, cls: 'pg-nw', render: (r) => `<a href="#/area/${r.area}">${r.area}</a>` },
        { k: 'areaName', label: 'Area name', render: (r) => `<a href="#/area/${r.area}">${esc(r.areaName)}</a>` },
        { k: 'region', label: 'Region', cls: 'pg-nw', render: (r) => `${UI.regionDot(r.region)} ${esc(FCR.regionName(r.region))}`, sort: (r) => FCR.regionName(r.region) },
        { k: 'name', label: 'Delegate', render: delegateCell, sort: (r) => r.name || 'zz' },
        { k: 'panel', label: 'Panel', num: true, cls: 'pg-nw', render: (r) => `${r.panel}${yrBadge(r)}` },
        { k: 'committee', label: 'Committee', render: committeeCell, sort: (r) => (r.committee ? FCR.cname(r.committee) : 'zz') },
        { k: 'city', label: 'Home city', render: (r) => `<span class="ink2">${esc(r.city)}</span>` },
        { k: 'rotates', label: 'Rotates', num: true, cls: 'pg-nw', render: (r) => `<span data-tip="Term ends Dec 31, ${r.rotates}">${r.rotates}</span>` },
      ];
      if (!cols.some((c) => c.k === st.sortK)) st.sortK = 'area';
      UI.table(el.querySelector('#d-table'), cols, rows, { sortK: st.sortK, dir: st.dir, compact: true, cls: 'pg-deltab',
        rowClass: (r) => (r.area === myN ? 'pg-mine' : ''), onSort: (k, d) => { st.sortK = k; st.dir = d; FCR.store.set('delegates', st); },
        emptyMsg: 'No delegate matches these filters.' });
    }
    delRefresh = refresh;
    refresh();
    if (urlRegion) fitRegion(urlRegion.id, true);
  };

  const OUTLYING = [2, 17, 77];   // Alaska, Hawaii, Puerto Rico: reachable from the map's corner buttons
  const slotOf = (rid) => (FCR.regionBy[rid] ? FCR.regionBy[rid].slot : 0);
  /** Zoom the map to a region ('' = all). instant: no animation (the page's first view; a zoom animation still running
      when the map is rebuilt makes Leaflet throw). */
  function fitRegion(rid, instant) {
    if (!map) return;
    const anim = instant ? { animate: false } : {};
    if (!rid) { if (homeBounds) map.fitBounds(homeBounds, Object.assign({ padding: [16, 16] }, anim)); return; }
    const pts = FCR.areaList.filter((a) => a.region === rid && a.lat != null && !OUTLYING.includes(a.n)).map((a) => [a.lat, a.lng]);
    if (pts.length) map.fitBounds(pts, Object.assign({ padding: [28, 28], maxZoom: 6 }, anim));
  }
  function zoomClass() {
    if (!map) return;
    const z = map.getZoom(), c = map.getContainer();
    c.classList.toggle('pg-z1', z < 3.25); c.classList.toggle('pg-z2', z >= 3.25 && z < 4.5);
  }
  function initMap(node, myN) {
    if (!window.L) { node.innerHTML = UI.empty('Map library could not load (offline?). The table below still works.'); return; }
    if (map) { map.remove(); map = null; }
    const coarse = !!(L.Browser.mobile || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
    map = L.map(node, { scrollWheelZoom: false, dragging: !coarse, tap: !coarse, worldCopyJump: true, zoomSnap: 0.25 });
    const pts = FCR.areaList.filter((a) => a.lat != null && !OUTLYING.includes(a.n)).map((a) => [a.lat, a.lng]);
    homeBounds = pts.length ? L.latLngBounds(pts) : null;
    if (homeBounds) map.fitBounds(homeBounds, { padding: [16, 16] }); else map.setView([46, -98], 3);
    tiles = L.tileLayer(tileUrl(isDark()), { attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors', maxZoom: 16 }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    // corner buttons: back to the U.S./Canada view, or jump to the areas outside it
    const Inset = L.Control.extend({ options: { position: 'topright' }, onAdd() {
      const d = L.DomUtil.create('div', 'leaflet-bar pg-inset');
      d.innerHTML = [['home', 'the U.S. and Canada', 'All'], ['2', 'Alaska (Area 2)', 'AK'], ['17', 'Hawaii (Area 17)', 'HI'], ['77', 'Puerto Rico (Area 77)', 'PR']]
        .map(([k, l, t]) => `<button type="button" data-k="${k}" title="Show ${l}" aria-label="Show ${l}">${t}</button>`).join('');
      L.DomEvent.disableClickPropagation(d);
      d.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-k]'); if (!b) return;
        if (b.dataset.k === 'home') { fitRegion(''); return; }
        const a = FCR.areas[+b.dataset.k]; if (a && a.lat != null) map.setView([a.lat, a.lng], +b.dataset.k === 2 ? 3.5 : 6.5);
      });
      return d; } });
    new Inset().addTo(map);
    map.on('zoomend', zoomClass); zoomClass();
    // An open popup on a phone fills the map's width: hide the corner controls meanwhile (pages.css .pg-pop), so the
    // popup's × and title are not under the zoom and AK/HI/PR buttons.
    node.classList.remove('pg-pop');
    map.on('popupopen', () => node.classList.add('pg-pop'));
    map.on('popupclose', () => node.classList.remove('pg-pop'));
    // Wheel zoom switches on after the first click. On touch screens dragging is off, so a swipe over the map scrolls the
    // page: a tap on an empty spot of the map turns panning on (a tap on a pin or popup only reads it), and a touch
    // anywhere outside the map turns it off again.
    const m0 = map;
    node.addEventListener('click', () => m0.scrollWheelZoom.enable(), { once: true });
    if (coarse) {
      const hint = L.DomUtil.create('div', 'pg-map-hint', node);
      hint.textContent = 'Tap an empty spot to pan and zoom';
      const showHint = (on) => { hint.style.display = on ? '' : 'none'; };
      node.addEventListener('click', (e) => {
        if (e.target.closest && e.target.closest('.leaflet-marker-icon, .leaflet-popup, .leaflet-control')) return;
        if (!m0.dragging.enabled()) { m0.dragging.enable(); showHint(false); }
      });
      const off = (e) => {
        if (map !== m0 || !document.body.contains(node)) { document.removeEventListener('touchstart', off, true); return; }   // map re-rendered or page left
        if (!node.contains(e.target) && m0.dragging.enabled()) { m0.dragging.disable(); showHint(true); }
      };
      document.addEventListener('touchstart', off, { capture: true, passive: true });
    }
  }
  function drawMarkers(rows, myN) {
    if (!map || !markerLayer) return;
    markerLayer.clearLayers();
    const byArea = {};
    rows.forEach((r) => (byArea[r.area] = byArea[r.area] || []).push(r));
    FCR.areaList.forEach((a) => {
      if (a.lat == null || a.lng == null) return;
      const rs = byArea[a.n];
      const icon = L.divIcon({ className: 'pg-pin-wrap', html: `<div class="area-pin pg-pin r${slotOf(a.region)}${rs ? '' : ' dim'}${a.n === myN ? ' mine' : ''}">${a.n}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
      const m = L.marker([a.lat, a.lng], { icon, title: `Area ${a.n} ${a.name}`, alt: `Area ${a.n} ${a.name}`, zIndexOffset: rs ? 100 : 0, keyboard: true });
      m.bindPopup(`<strong>Area ${a.n} · ${esc(a.name)}</strong><br>${UI.regionDot(a.region)} ${esc(FCR.regionName(a.region))} region<br>` +
        (rs ? rs.map((r) => `${r.fromWeb ? `<em>Panel ${r.panel}${r.elect ? ' elect' : ''}:</em> ` : `Panel ${r.panel}: `}<strong>${esc(r.name || r.statusText || '')}</strong>${r.committee ? ' · ' + esc(FCR.cname(r.committee)) : r.forecast ? ` · <span class="pg-muted">likely ${esc(r.forecast)}</span>` : ''}${r.role ? ' (' + (r.role === 'chair' ? 'chair' : 'alt. chair') + ')' : ''}`).join('<br>') : '<span class="pg-muted">filtered out</span>') +
        `<br><a href="#/area/${a.n}">Area history &amp; forecast →</a>`);
      markerLayer.addLayer(m);
    });
  }

  // ---------- AREA PROFILE ----------
  const money = (v) => (v == null ? '—' : '$' + Math.round(v).toLocaleString('en-US'));
  const refPage = (r) => String(r || '').replace(/FR(\d\d) p(\d+(?:[-–]\d+)?).*/, (m, y, p) => `20${y} Final Report, PDF p. ${p}`);
  V.area = function (el, args) {
    const n = +args[0]; const a = FCR.areas[n];
    if (!a) { el.innerHTML = `<div class="pg">${UI.empty('Unknown area')}<p class="pg-center"><a class="btn" href="#/delegates">← all areas</a></p></div>`; return; }
    const terms = FCR.termsByArea[n] || [];
    const cyc = FCR.cycle();
    const parity = FCR.areaParity(n);
    const P = UI.predictPanelFor(n, cyc);
    const EP = FCR.elects.panel, stage = FCR.electStage(cyc);
    const elect = P === EP ? FCR.elects.byArea[n] : null;
    const O = UI.oddsFor(P);
    const pred = O && O.probs[n] ? O.probs[n] : null;
    const ctx = UI.drawContext(n, P);
    const ds = UI.drawStatus(P);
    const held = new Set(terms.map((t) => t.committee).filter(Boolean));
    const never = FCR.PRIMARY_ORDER.filter((c) => !held.has(c));
    const serving = cyc.year >= P + 1950;   // panel P is in office (its committee is drawn, not yet published)

    // header
    const meta = [`${UI.regionDot(a.region)} ${esc(FCR.regionName(a.region))} region`, a.state ? esc(a.state) : '',
      parity == null ? '' : `${parity ? 'odd' : 'even'}-numbered panels · elects in the fall of ${parity ? 'even' : 'odd'} years`,
      a.website ? `<a href="${esc(a.website)}" target="_blank" rel="noopener">area website</a>` : ''];

    // next / current delegate card
    const electP = elect && elect.delegate ? `<p class="pg-big">${serving ? 'Delegate' : 'Delegate-elect'}: <strong>${UI.personLink(elect.delegate)}</strong>${elect.alternate ? ` <span class="small ink2">· alternate ${UI.personLink(elect.alternate)}</span>` : ''}</p>
        <p class="small muted">${joinDot([serving ? `in office since Jan 1, ${P + 1950}; not yet in a Final Report` : `takes office Jan 1, ${P + 1950}`, elect.source_note ? esc(elect.source_note) : '', elect.source_url ? `<a href="${esc(elect.source_url)}" target="_blank" rel="noopener">source</a>` : ''])}</p>`
      : elect ? `<p>Delegate-elect: <span class="muted">not yet known</span> · <span class="small">${esc(UI.electStatus(elect))}</span>${elect.source_url ? ` · <a class="small" href="${esc(elect.source_url)}" target="_blank" rel="noopener">source</a>` : ''}</p>`
      : cyc.year < P + 1949 || (cyc.year === P + 1949 && cyc.now.getMonth() < 8) ? `<p class="small ink2">Elected in the fall of ${P + 1949}; takes office Jan 1, ${P + 1950}.</p>`
      : cyc.year === P + 1949 ? `<p class="small ink2">Being elected this fall (${P + 1949}); takes office Jan 1, ${P + 1950}. Not tracked here yet.</p>`
      : `<p class="small ink2">In office since Jan 1, ${P + 1950}; the name appears with the ${P + 1950} Final Report.</p>`;
    const exByC = {}; ctx.excluded.forEach((x) => (exByC[x.committee] = x));
    const top = O && O.top ? O.top[n] : null;
    const predRows = pred ? FCR.PRIMARY_ORDER.filter((c) => c in pred).sort((x, y) => pred[y] - pred[x] || (exByC[x] ? 1 : 0) - (exByC[y] ? 1 : 0)).map((c) => {
      const p = pred[c], se = O.se && O.se[n] ? O.se[n][c] : null, x = exByC[c];
      const why = (ctx.cont[c] || []).map((k) => `${k.sameState ? 'same-state' : k.neighbor ? 'neighbouring' : 'same-region'} Area ${k.area} continues`).join('; ');
      return `<tr class="${x ? 'pg-out' : ''}"><td>${esc(FCR.cname(c))}${held.has(c) && !x ? ' <span class="small muted">(held before)</span>' : ''}${top && top.nearTie && top.tied.includes(c) ? ' <span class="pg-tiemark" data-tip="Within 3 points of the top committee: too close to call">≈</span>' : ''}</td>
        <td>${x ? `<span class="small muted">✕ held in Panel ${x.panel}${x.name ? ' (' + esc(x.name) + ')' : ''}</span>` : `<div class="pbar" data-tip="${esc(`${(p * 100).toFixed(1)}%${se != null ? ' ± ' + (se * 100).toFixed(1) + ' pt' : ''}${why ? ' · ' + why : ''}`)}" tabindex="0"><span style="width:${(p * 100).toFixed(1)}%"></span></div>`}</td>
        <td class="n">${UI.pct(p)}</td></tr>`;
    }).join('') : '';
    const nextCard = `<div class="card pg-next"><h3>${serving ? 'Current delegate' : 'Next delegate'} · Panel ${P} (${P + 1950}–${P + 1951})</h3>
        ${electP}
        ${serving ? `<p class="small ink2">Next election: the Panel ${P + 2} delegate, in the fall of ${P + 1951} (takes office Jan 1, ${P + 1952}).</p>` : ''}
        <p class="small ink2 pg-line">Conference committee — ${esc(ds.text)}.${ds.state === 'after' || UI.announcedCommittee(n, P) ? ' Forecast made before the draw:' : ''}</p>
        ${UI.announcedLine(n, P, O)}
        ${pred ? `${top && top.nearTie ? `<p class="small"><strong>${top.tied.map((c) => esc(FCR.cname(c))).join(' ≈ ')}</strong> — too close to call.</p>` : ''}
          ${ctx.contKnown ? '' : UI.roughNote(P)}<table class="t compact pg-odds"><tbody>${predRows}</tbody></table>
          <p class="small pg-line"><a href="#/predict/${P}/area/${n}">Why these odds? →</a> <span class="muted">${O.precomputed ? 'Precomputed forecast, ' + (O.draws || 0).toLocaleString('en-US') + ' simulated draws.' : 'Simulated now (approximate).'} Same numbers as on Predict.</span></p>`
          : UI.empty(O ? 'Not enough history to forecast.' : `The forecast needs the Panel ${P - 1} committees, first published in the ${P - 1 + 1950} Final Report.`)}
        ${never.length ? `<p class="small pg-line">Committees this area has <strong>not</strong> held in the loaded reports: ${never.map((c) => UI.cchip(c)).join(' ')}</p>` : ''}
      </div>`;

    // neighbours and same-state areas
    const nb = UI.neighborInfo(n, P);
    const sameState = a.state ? FCR.areaList.filter((b) => b.n !== n && b.state === a.state && !FCR.isNeighbor(n, b.n)) : [];
    const nr = ((FCR.RAW.analysis || {}).neighbor_rule || {}).cross_panel;
    const nObs = nr ? (nr.same_region_neighbors || [0])[0] + (nr.cross_region_neighbors || [0])[0] : null;
    const nExp = nr ? Math.round((nr.same_region_neighbors || [0, 0])[1] + (nr.cross_region_neighbors || [0, 0])[1]) : null;
    const relation = (x) => {
      const st = x.sameState ? ` <span class="badge" data-tip="Same state as Area ${n}">${esc(a.state)}</span>` : '';
      if (x.sameLot) {
        const e = FCR.elects.panel === P ? FCR.elects.byArea[x.area] : null;
        return `<span class="small">drawn in the same lot (Panel ${P})${e && e.delegate ? ` · ${UI.personLink(e.delegate)}` : ''} — ${x.sameState ? 'same state: almost never on the same committee (not once in 2017–2026)' : 'rarely put on the same committee'}</span>${st}`;
      }
      if (x.committee) return `continuing Panel ${x.cont.panel} delegate on ${UI.cchip(x.committee)} <span class="small muted">→ ${esc(FCR.cabbr(x.committee))} ${x.sameState ? 'very unlikely' : 'less likely'} for Area ${n}</span>${st}`;
      if (FCR.areaParity(x.area) === (P - 1) % 2) return `<span class="small">continuing Panel ${P - 1} delegate — committee not yet published</span>${st}`;
      return `<span class="muted small">—</span>${st}`;
    };
    const nbCard = nb.length ? `<div class="card pg-nb"><h3>Neighbouring areas <span class="muted small">${nb.length} share a border</span></h3>
        <p class="small ink2">The draw keeps neighbouring areas apart${nObs != null ? `: in Panels 71–76 neighbours shared a committee ${nObs} times, against about ${nExp} under a plain lot` : ''}. Areas of the same state or province have not once shared a primary committee in 2017–2026, and each committee's new members come from different regions (broken 4 times since Panel 74). So a committee held by a continuing neighbour is less likely — rarely, not never — for Area ${n}'s Panel ${P} delegate.</p>
        <div class="table-wrap"><table class="t compact pg-nbtab"><thead><tr><th>Area</th><th class="pg-nw pg-hide-m">Region</th><th>Relation to the Panel ${P} draw</th></tr></thead><tbody>
        ${nb.map((x) => `<tr><td><span class="pg-mshow">${UI.regionDot(x.region)}</span> ${UI.areaLink(x.area, { brief: true })}${x.region === a.region ? '' : ' <span class="badge pg-mshow">other region</span>'}</td><td class="pg-nw pg-hide-m">${UI.regionDot(x.region)} ${esc(FCR.regionName(x.region))}${x.region === a.region ? '' : ' <span class="badge">other region</span>'}</td><td>${relation(x)}</td></tr>`).join('')}
        </tbody></table></div>
        ${sameState.length ? `<p class="small pg-line">Also in ${esc(a.state)} (not neighbours): ${sameState.map((b) => UI.areaLink(b.n, { brief: true })).join(', ')} — same state, so also almost never on the same committee.</p>` : ''}</div>` : '';

    // chairs, delegate chairs, trustees and directors from this area
    const lead = [];
    terms.forEach((t) => Object.keys(t.roles).sort().forEach((y) => t.roles[y].forEach((r) => lead.push({ y: +y, html: `${UI.personLink(FCR.termName(t, Math.min(+y, FCR.latestYear)))} — ${r.role === 'chair' ? 'chair' : 'alternate chair'}, <a href="#/committees/${y}/${r.committee}">${esc(FCR.cname(r.committee))}</a> ${y}${r.elected ? ' <span class="small muted">(elected; roster not loaded)</span>' : ''} <span class="small muted">Panel ${t.panel}</span>` }))));
    FCR.delegateChairs().forEach((d) => [['chair', d], ['alternate', d.alternate]].forEach(([role, p]) => { if (p && p.area === n) lead.push({ y: d.conference_year, html: `${UI.personLink(p.name)} — ${role === 'chair' ? 'delegate chair' : 'alternate delegate chair'} of the ${ord(d.ordinal)} Conference (${d.conference_year})` }); }));
    const seenP = new Set();
    FCR.positionHistory().filter((p) => p.past && p.past.area === n).sort((x, y) => (x.start || 0) - (y.start || 0)).forEach((p) => {
      const k = p.name + '|' + p.pid; if (seenP.has(k)) return; seenP.add(k);
      lead.push({ y: p.start || 0, html: `${UI.personLink(p.name)} — ${esc(cap(p.label || FCR.positionLabel(p)))} ${p.start ? `${p.start}–${p.end || ''}` : ''}${p.past.panel ? ` <span class="small muted">Panel ${p.past.panel} delegate${p.past.area_inferred || p.past.inferred ? ' · area inferred from city and panel' : ''}</span>` : ''}` });
    });
    lead.sort((x, y) => y.y - x.y);
    const leadCard = `<div class="card pg-lead"><h3>Chairs, delegate chairs, trustees &amp; directors from Area ${n}</h3>
        ${lead.length ? `<ul class="pg-list">${lead.map((x) => `<li>${x.html}</li>`).join('')}</ul>` : `<p class="muted small">None in the loaded reports (${FCR.years[0]}–${FCR.latestYear}).</p>`}</div>`;

    // group contributions
    const contrib = FCR.areaContributions ? FCR.areaContributions(n) : [];
    const contribCard = contrib.length ? `<div class="card pg-contrib"><h3>Group contributions to GSO</h3>
        <p class="small ink2">From each Final Report's “Groups and Other Entities Contribution Report”: how many of the area's active groups sent a contribution to the General Service Office during the calendar year before the report, their total and the average per contributing group (U.S. dollars).</p>
        <div class="table-wrap"><table class="t compact"><thead><tr><th>Year</th><th class="n">Groups contributing</th><th class="n">Share</th><th class="n">Total</th><th class="n pg-hide-m">Average</th></tr></thead><tbody>
        ${contrib.slice().reverse().map((r) => `<tr><td><span data-tip="${esc(refPage(r.ref))}" tabindex="0">${r.year}</span></td><td class="n">${r.groups_contributed != null ? r.groups_contributed.toLocaleString('en-US') : '—'} <span class="muted">of ${r.active_groups != null ? r.active_groups.toLocaleString('en-US') : '—'}</span></td><td class="n">${r.pct_contributed != null ? r.pct_contributed.toFixed(1) + '%' : '—'}</td><td class="n">${money(r.total)}</td><td class="n pg-hide-m">${money(r.average)}</td></tr>`).join('')}
        </tbody></table></div><p class="small muted">Source: ${esc(refPage(contrib[contrib.length - 1].ref))} and earlier reports.</p></div>` : '';

    el.innerHTML = `<div class="pg pg-area">
      <div class="page-head"><div><h1>Area ${n} · ${esc(a.name).replace(/\//g, '/<wbr>')}</h1><p>${joinDot(meta)}</p></div>
        <a class="btn" href="#/delegates">← all areas</a></div>
      <div class="grid g2 pg-pair">
        <div class="card"><h3>Delegates by panel</h3><div id="a-terms"></div></div>
        ${nextCard}
      </div>
      ${nbCard}
      <div class="grid g2 pg-pair">${leadCard}${contribCard || '<div></div>'}</div>
    </div>`;

    // delegates table: newest first, with the delegate-elect row and seated alternates; roles merged into the committee cell
    const rows = terms.slice().reverse().map((t) => ({ t, panel: t.panel }));
    if (elect && !FCR.term(n, P)) rows.unshift({ panel: P, elect });
    UI.table(el.querySelector('#a-terms'), [
      { k: 'panel', label: 'Panel', num: true, cls: 'pg-nw', render: (r) => `${r.panel}<div class="small muted">${r.panel + 1950}–${String(r.panel + 1951).slice(2)}</div>` },
      { k: 'name', label: 'Delegate', nosort: true, render: (r) => {
        if (r.elect) return r.elect.delegate ? `${UI.personLink(r.elect.delegate)} <span class="badge new" data-tip="${serving ? 'Serving; not yet in a Final Report' : 'Delegate-elect'}">${serving ? 'serving' : 'elect'}</span>` : `<span class="muted small">${esc(UI.electStatus(r.elect))}</span>`;
        const t = r.t, hs = FCR.termHolders(t);
        const who = hs.length > 1 ? hs.map((h) => `${UI.personLink(h.name)} <span class="small muted">${FCR.yearRange(h.years)}</span>`).join(' → ') + ' <span class="small muted" data-tip="The delegate was replaced during the term" tabindex="0">(replaced)</span>' : UI.personLink(hs[0].name);
        const byAlt = {}; Object.keys(t.attended).sort().forEach((y) => { const at = t.attended[y]; (byAlt[at.name] = byAlt[at.name] || []).push(y + (at.inferred ? ' (inferred)' : '')); });
        const alts = Object.keys(byAlt).map((nm) => `<div class="small muted">alternate ${UI.personLink(nm)} seated ${byAlt[nm].join(', ')}</div>`).join('');
        return who + alts; } },
      { k: 'committee', label: 'Committee & roles', nosort: true, render: (r) => {
        if (r.elect) { const an = UI.announcedCommittee(n, r.panel); return an ? `${UI.cchip(an.committee)}${an.secondary ? ' ' + UI.cchip(an.secondary) : ''} <span class="small muted">announced</span>` : `<span class="small muted">${esc(UI.drawStatus(r.panel).text)}</span>`; }
        const t = r.t;
        const ys = Object.keys(t.committees).sort(), byYear = new Set(ys.map((y) => t.committees[y]));
        const chips = byYear.size > 1 ? ys.map((y) => `${UI.cchip(t.committees[y])} <span class="small muted">${y}</span>`).join(' ') : UI.cchip(t.committee);
        const roles = [].concat(...Object.keys(t.roles).sort().map((y) => t.roles[y].map((x) => `${x.role === 'chair' ? 'Chair' : 'Alt. chair'} ${esc(FCR.cabbr(x.committee))} ${y}`)),
          (t.delegateChair || []).map((d) => `${d.role === 'chair' ? 'Delegate chair' : 'Alt. delegate chair'}, ${ord(d.ordinal)} GSC`));
        return `<span class="pg-chips">${chips}${t.secondaryList.map((s) => UI.cchip(s)).join('')}</span>${roles.length ? `<div class="small pg-roles">${roles.join(' · ')}</div>` : ''}`; } },
    ], rows, { compact: true, emptyMsg: 'No terms in the loaded reports.' });
  };

  // ---------- PERSON ----------
  const TC_SHORT = [[/cooperation with the professional community\/treatment/i, 'CPC/Treatment and Accessibilities'], [/international conventions\/(a\.a\. )?regional forums/i, 'IC/RF'], [/^icrf$/i, 'IC/RF']];
  const tcShort = (s) => { const m = TC_SHORT.find(([re]) => re.test(s)); return m ? m[1] : s; };
  /** Trustees' committees of `names` in report year y: roster (with chair) plus bio-only entries. */
  function trusteeCommittees(names, y) {
    const Y = FCR.Y(y) || {}, same = (n) => names.some((x) => FCR.sameName(x, n));
    const roster = (Y.trustees_committees || []).map((c) => { const m = (c.members || []).find((x) => same(x.name)); return m ? { name: tcShort(c.committee), chair: m.type === 'chair', type: m.type } : null; }).filter(Boolean);
    const rec = (Y.trustees || []).concat(Y.nontrustee_directors || []).find((t) => same(t.name)) || {};
    const key = (s) => FCR.fold(s).split(' ')[0];
    (rec.trustee_committees || []).forEach((b) => {
      const nm = tcShort(String(b).replace(/\s*\(chair\)\s*/i, '')), k = key(nm);
      if (!roster.some((r) => key(r.name) === k)) roster.push({ name: nm, chair: /\(chair\)/i.test(b), bio: true });
    });
    return { list: roster, boardRoles: rec.board_roles || [] };
  }
  /** "rotates 2027 (proj.)", "rotated 2026", "left Jan. 2023", "moved up 2026 → …" for a positionHistory slot. */
  function seatEnd(s, cyc) {
    if (s.leftYear) return `left ${esc(s.servedThru)}`;
    if (s.movedUpYear) return `moved up ${s.movedUpYear} → ${esc(FCR.positionLabel(s.movedTo))}`;
    if (s.rotatingYear) return `rotated ${s.rotatingYear}`;
    if (!s.isCurrent) return `served to ${s.end}`;
    if (s.end && s.end <= cyc.lastConference) return `term ended at the ${ord(s.end - 1950)} Conference (not yet in a loaded report)`;
    return s.end ? `rotates ${s.end} (proj.)` : '';
  }
  const runs = (ys) => { ys = [...new Set(ys)].sort((a, b) => a - b); const out = []; ys.forEach((y) => { const l = out[out.length - 1]; if (l && y === l[1] + 1) l[1] = y; else out.push([y, y]); }); return out; };
  const DEL = /^(delegate|seated_alternate|conf_chair|delegate_chair|delegate_elect|alternate_elect)$/;
  const SEAT = /^(trustee|director|trustee_elect|director_elect)$/;
  const STAFF = /^(staff|staff_role|gm|staff_director|gvstaff|secretary)$/;

  function personGroupHtml(g, i, groups, cyc) {
    const names = [...new Set([].concat(...g.roles.map((r) => r.names || [r.name])))];
    const has = (re) => g.roles.filter((r) => re.test(r.kind));
    const li = (main, sub) => `<li><div class="pg-rl">${main}</div>${sub ? `<div class="pg-rd">${sub}</div>` : ''}</li>`;
    const sections = [];
    // delegate service: one line per term with committees, chair roles, delegate chair and seated alternates
    const dl = [];
    const termsDone = new Set();
    has(/^delegate$/).forEach((r) => {
      const t = FCR.term(r.area, r.panel); if (!t) { dl.push(li(`<a href="${r.href}">${esc(r.desc)}</a>`)); return; }
      termsDone.add(r.area + '-' + r.panel);
      const ys = (r.years && r.years.length ? r.years : t.years).slice().sort();
      const cs = [...new Set(ys.map((y) => t.committees[y]).filter(Boolean))];
      const sec = [...new Set([].concat(...ys.map((y) => t.secondary[y] || [])))];
      const roles = [].concat(...ys.map((y) => (t.roles[y] || []).map((x) => `<a href="#/committees/${y}/${x.committee}">${x.role === 'chair' ? 'Chair' : 'Alternate chair'}, ${esc(FCR.cname(x.committee))} (${y})</a>`)),
        (t.delegateChair || []).map((d) => `${d.role === 'chair' ? 'Delegate chair' : 'Alternate delegate chair'} of the ${ord(d.ordinal)} Conference (${d.year})`));
      const alt = ys.filter((y) => t.attended[y] && t.attended[y].for).map((y) => `an alternate (${UI.personLink(t.attended[y].name)}) attended the ${y} Conference`);
      dl.push(li(`<a href="#/area/${t.area}"><strong>Panel ${t.panel} delegate</strong></a> · ${UI.areaLink(t.area)} <span class="muted">· ${FCR.yearRange(ys) || t.firstYear + '–' + t.lastYear}</span>`,
        joinDot([cs.length ? `Committee: ${cs.map((c) => UI.cchip(c)).join(' ')}${sec.length ? ' · secondary ' + sec.map((c) => UI.cchip(c)).join(' ') : ''}` : '', ...roles, ...alt])));
    });
    has(/^conf_chair$/).filter((r) => !termsDone.has(r.area + '-' + r.panel)).forEach((r) => dl.push(li(`<a href="${r.href}">${esc(r.desc)}</a>`)));
    has(/^delegate_chair$/).filter((r) => !termsDone.has(r.area + '-' + r.panel)).forEach((r) => dl.push(li(`<a href="${r.href}">${esc(r.desc)}</a>`)));
    has(/^seated_alternate$/).forEach((r) => dl.push(li(`<a href="${r.href}">${esc(r.desc)}</a>`)));
    has(/^(delegate_elect|alternate_elect)$/).forEach((r) => {
      const P = r.panel, e = FCR.elects.byArea[r.area] || {}, alt = r.kind === 'alternate_elect';
      const before = cyc.year < P + 1950, after = cyc.year > P + 1951;
      const title = alt ? `Panel ${P} alternate delegate` : before ? `Panel ${P} delegate-elect` : `Panel ${P} delegate`;
      const ed = String(e.election_date || '').split(/\s*(?:\/|\bto\b)\s*/).filter(Boolean);
      const when = before ? `elected ${ed.length ? UI.fmtRange(ed[0], ed[ed.length - 1]) : P + 1949} · takes office Jan 1, ${P + 1950}`
        : after ? `served ${P + 1950}–${P + 1951}` : `serving ${P + 1950}–${P + 1951} · not yet in a Final Report`;
      let sub = '';
      if (!alt && !FCR.term(r.area, P)) {
        const O = UI.oddsFor(P), ds = UI.drawStatus(P);
        const an = UI.announcedCommittee(r.area, P);
        sub = joinDot([an ? `Committee: <strong>${esc(FCR.cname(an.committee))}</strong>${an.secondary ? ' + ' + esc(FCR.cname(an.secondary)) : ''} (drawn December ${P + 1949}${an.source ? '; ' + esc(an.source) : ''})` : `Committee ${esc(ds.text)}`,
          O && O.probs[r.area] ? `${ds.state === 'after' || an ? 'forecast before the draw' : 'forecast'}: ${UI.oddsSummary(O, r.area, 3)} · <a href="#/predict/${P}/area/${r.area}">why?</a>` : '']);
      }
      if (r.userProvided || e.user_provided) sub = joinDot([sub, `<span class="muted">${esc(e.source_note || 'reported by the user')}</span>`]);
      dl.push(li(`<a href="#/area/${r.area}"><strong>${title}</strong></a> · ${UI.areaLink(r.area)} <span class="muted">· ${when}</span>`, sub));
    });
    if (dl.length) sections.push(['Delegate service', dl]);

    // board seats (positionHistory slots of this person)
    const pids = new Set(has(SEAT).map((r) => r.position).filter(Boolean));
    let tcShown = false;
    const slots = FCR.positionHistory().filter((s) => pids.has(s.pid) && (s.aliases || [s.name]).some((al) => names.some((n) => FCR.sameName(n, al))));
    const bl = slots.sort((a, b) => (a.start || 0) - (b.start || 0)).map((s) => {
      const pd = s.past && (s.past.panel || s.past.area) ? `Past delegate: ${joinDot([s.past.panel ? 'Panel ' + s.past.panel : '', s.past.area ? UI.areaLink(s.past.area) : ''])}${s.past.area_inferred || s.past.inferred ? ' <span class="muted" tabindex="0" data-tip="Area inferred from the home city and panel parity; the report prints only the panel">(area inferred)</span>' : ''}` : '';
      const yrs = (s.years || []).slice().sort((a, b) => b - a);
      let tc = s.seat !== 'director' ? yrs.map((y) => { const x = trusteeCommittees(s.aliases || [s.name], y); return x.list.length || x.boardRoles.length ? `<tr><td class="pg-nw">${y}</td><td>${x.list.map((c) => `<span class="chip${c.bio ? ' pg-bio' : ''}"${c.bio ? ' data-tip="From the biography list only"' : ''}>${esc(c.name)}${c.chair ? ' <span class="badge chair">Chair</span>' : c.type === 'consultant' ? ' <span class="small muted">cons.</span>' : ''}</span>`).join('')}${x.boardRoles.length ? `<div class="pg-mshow small ink2">${esc(x.boardRoles.map(cap).join(', '))}</div>` : ''}</td><td class="small ink2 pg-hide-m">${esc(x.boardRoles.map(cap).join(', '))}</td></tr>` : ''; }).join('') : '';
      if (tc) tcShown = true;
      return li(`<a href="#/board/${Math.min(FCR.latestYear, s.latestYear || FCR.latestYear)}"><strong>${esc(cap(s.label || FCR.positionLabel(s)))}</strong></a> <span class="muted">· ${joinDot([s.start ? 'elected ' + s.start : '', seatEnd(s, cyc), s.firstTermEnd && s.isCurrent ? 'first 3-year term ends ' + s.firstTermEnd : '', s.chairSince ? 'GSB chair from ' + s.chairSince : ''])}</span>`,
        joinDot([pd, s.city ? 'Home: ' + esc(s.city) : '']) + (tc ? `<div class="table-wrap pg-tc"><table class="t compact"><thead><tr><th>Report</th><th>Trustees’ committees</th><th class="pg-hide-m">Board roles</th></tr></thead><tbody>${tc}</tbody></table></div>` : ''));
    });
    has(SEAT).filter((r) => !slots.some((s) => s.pid === r.position)).forEach((r) => bl.push(li(`<a href="${r.href}">${esc(cap(r.desc || r.role))}</a>`)));
    if (bl.length) sections.push(['Board seats', bl]);

    // GSB officer: slate years -> "2025–26"; the current slate reads "since May 2, 2026"
    const off = FCR.currentOfficers();
    const byTitle = {};
    has(/^officer$/).forEach((r) => (byTitle[r.title || r.role] = (byTitle[r.title || r.role] || []).concat(r.years)));
    const ol = Object.keys(byTitle).map((ti) => {
      const rs = runs(byTitle[ti]).map(([a, b]) => { const asOf = off && off.asOf ? UI.fmtDate(off.asOf, off.approx ? 'month' : 'short') : '';
        return off && b === off.conferenceYear && asOf && cyc.lastConference <= b ? (a === b ? `since ${asOf}` : `since ${a} (re-elected ${asOf})`) : yr2(a, b + 1); });
      return li(`<a href="#/board"><strong>GSB ${esc(ti)}</strong></a> <span class="muted">· ${rs.join(', ')}</span>`);
    });
    if (ol.length) sections.push(['General Service Board officer', ol]);
    const cb = has(/^(aaws_board|grapevine_board)$/).map((r) => li(`<a href="${r.href}">${esc(cap(r.desc))}</a>`));
    if (cb.length) sections.push(['Corporate boards', cb]);
    const tl = has(tcShown ? /^(acm|consultant)$/ : /^(tc_chair|acm|consultant)$/).map((r) => li(`<a href="${r.href}">${esc(cap(r.desc))}</a>`));
    if (tl.length) sections.push(['Trustees’ committees', tl]);
    // GSO / Grapevine staff, committee secretaries, general manager: with the desks per year (FCR.ui.staffDesks)
    const sr = has(STAFF);
    if (sr.length) {
      const items = sr.map((r) => li(`<a href="${r.href}">${esc(cap(r.desc))}</a>`));
      const ys = [...new Set([].concat(...sr.map((r) => r.years)))].sort((a, b) => b - a);
      // consecutive years with the same desks collapse into one row ("2017–2026 · Archives")
      const dr = [];
      if (UI.staffDesks) ys.slice().reverse().forEach((y) => { const h = names.map((n) => UI.staffDesks(n, y)).find(Boolean); if (!h) return; const l = dr[dr.length - 1]; if (l && l.h === h && l.b === y - 1) l.b = y; else dr.push({ a: y, b: y, h }); });
      const desks = dr.reverse().map((d) => `<tr><td class="pg-nw">${d.a === d.b ? d.a : d.a + '–' + d.b}</td><td>${d.h}</td></tr>`).join('');
      if (desks) items.push(`<li class="pg-noline"><div class="table-wrap pg-tc"><table class="t compact"><thead><tr><th>Reports</th><th>Desks and committees served</th></tr></thead><tbody>${desks}</tbody></table></div></li>`);
      sections.push([sr.some((r) => /^(staff|staff_role|gm|staff_director|gvstaff)$/.test(r.kind)) ? 'GSO and Grapevine staff' : 'Committee secretary', items]);
    }
    const em = has(/^emeritus$/).map((r) => li(`<a href="${r.href}">${esc(cap(r.desc))}</a>`));
    if (em.length) sections.push(['Trustee emeritus', em]);

    const latest = slots.slice().sort((a, b) => (b.latestYear || 0) - (a.latestYear || 0))[0];
    const delR = has(/^delegate$/).reduce((a, r) => (!a || (r.panel || 0) > (a.panel || 0) ? r : a), null) || has(/^delegate_elect$/)[0];   // the latest delegate term
    const pdS = latest && latest.past && latest.past.panel ? `Panel ${latest.past.panel} delegate${latest.past.area ? ', Area ' + latest.past.area + ' · ' + ((FCR.areas[latest.past.area] || {}).name || '') : ''}`
      : delR ? `${delR.kind === 'delegate_elect' ? `Panel ${delR.panel} ${cyc.year < delR.panel + 1950 ? 'delegate-elect' : 'delegate'}` : delR.role}, Area ${delR.area} · ${(FCR.areas[delR.area] || {}).name || ''}` : '';
    const summary = joinDot([latest ? `${cap(latest.label || FCR.positionLabel(latest))}${latest.start ? ' ' + latest.start + '–' + (latest.end || '') : ''}` : '', pdS]) || g.label.replace(/^.*? — /, '');
    const maybe = (g.maybeSameAs || []).map((k) => groups.findIndex((x) => x.key === k)).filter((j) => j >= 0);
    return `<section class="card pg-pcard" id="pg-p${i}">
      ${groups.length > 1 ? `<h2 class="pg-pname">${esc(g.name)}</h2>` : ''}<p class="ink2 pg-plabel">${esc(summary)}</p>
      ${maybe.length ? `<p class="small pg-maybe">Possibly the same person as ${maybe.map((j) => `<button type="button" class="pg-linkbtn" data-jump="pg-p${j}">${esc(groups[j].label)}</button>`).join(' or ')} — the reports print only a first name and last initial.</p>` : ''}
      ${sections.map(([h, items]) => `<h3 class="pg-sech">${esc(h)}</h3><ul class="pg-roles">${items.join('')}</ul>`).join('')}
    </section>`;
  }

  function personEmpty(el, name) {
    const f = FCR.fold(name), toks = f.split(' ').filter(Boolean), first = toks[0] || '', last = toks.length > 1 ? toks[toks.length - 1].charAt(0) : '';
    const best = new Map();
    FCR.people.forEach((p) => {
      const nf = FCR.fold(p.name), nt = nf.split(' '), nl = nt.length > 1 ? nt[nt.length - 1].charAt(0) : '';
      let s = 0;
      if (first.length >= 2 && nt[0].startsWith(first.slice(0, Math.min(3, first.length)))) s += 2;
      if (first.length >= 3 && nt.some((w) => w.startsWith(first))) s += 1;
      if (last && nl === last) s += 1;
      if (s >= 2 && (!best.has(nf) || best.get(nf).s < s)) best.set(nf, { s, p });
    });
    const sug = [...best.values()].sort((a, b) => b.s - a.s || (b.p.lastYear || 0) - (a.p.lastYear || 0)).slice(0, 10);
    el.innerHTML = `<div class="pg pg-person"><div class="page-head"><div><h1>${esc(name || 'Person')}</h1></div></div>
      <div class="card pg-empty"><p><strong>No one named “${esc(name)}” appears in the loaded reports</strong> (${FCR.years[0]}–${FCR.latestYear}), the board slates or the area election results.</p>
      ${sug.length ? `<p class="small ink2">Similar names:</p><ul class="pg-sug">${sug.map((x) => `<li><a href="#/person/${encodeURIComponent(x.p.name)}">${esc(x.p.name)}</a> <span class="small muted">${esc(cap(x.p.desc || x.p.role))}</span></li>`).join('')}</ul>` : ''}
      <p class="small muted">Names appear as printed (first name and last initial). The search box (press /) finds every printed spelling, nicknames included.</p></div></div>`;
  }

  V.person = function (el, args) {
    let name = args[0] || '';
    try { name = decodeURIComponent(name); } catch (e) { /* keep the raw text */ }
    const groups = FCR.personGroups(name);
    if (!groups.length) { personEmpty(el, name); return; }
    const cyc = FCR.cycle();
    el.innerHTML = `<div class="pg pg-person">
      <div class="page-head"><div><h1>${esc(groups.length === 1 ? groups[0].name : name)}</h1>
        <p>${groups.length > 1 ? `<strong>${groups.length} different people</strong> share this printed name in the loaded reports; each is listed on its own.` : 'Every role found for this person in the loaded Final Reports, board slates and area election results.'}</p></div></div>
      ${groups.length > 1 ? `<div class="pg-jump">${groups.map((g, i) => `<button type="button" class="chip" data-jump="pg-p${i}">${esc(g.label)}</button>`).join('')}</div>` : ''}
      ${groups.map((g, i) => personGroupHtml(g, i, groups, cyc)).join('')}
    </div>`;
    el.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => { const t = document.getElementById(b.dataset.jump); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  };
})();
