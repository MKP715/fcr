/* Views part 2: Conference committees, rotation grid; plus the page-wide scroller helper (sticky offsets, edge fades). */
(function () {
  'use strict';
  const FCR = window.FCR;
  const esc = FCR.esc;
  const V = FCR.views, UI = FCR.ui;
  const safe = (f) => { try { return f(); } catch (e) { return null; } };

  // ---------- page-wide: horizontal scrollers, sticky offsets, tab strip, print ----------
  // CSS in app.css reads these classes:
  //   .sc-l / .sc-r  the scroller has more to show on that side (edge fade; shadow beside a sticky first column)
  //   .sc-fit        a .table-wrap whose table fits: overflow visible, so its header sticks under the tab strip
  //   .sc-s1         a .table-wrap that scrolls sideways and whose first column is narrow: that column sticks
  //   --stick-top    height of the sticky chrome (top bar + tab strip), on <html>
  // Opt out per wrapper with .no-fit / .no-s1. UI.scrollers() re-scans now (views call it after drawing off-#main).
  const SCROLLERS = '.table-wrap, .gantt-scroll, .og-scroll, .p-heat-wrap, .g-scroll, #tabs';
  const root = document.documentElement;
  const tog = (n, c, on) => { if (n.classList.contains(c) !== !!on) n.classList.toggle(c, !!on); };
  function edges(w) {
    const max = w.scrollWidth - w.clientWidth;
    tog(w, 'sc-l', max > 1 && w.scrollLeft > 1);
    tog(w, 'sc-r', max > 1 && w.scrollLeft < max - 1);
  }
  /** Is the page (not a scroll box such as a side sheet) what scrolls this element vertically? */
  function pageScrolled(n) {
    for (let p = n.parentElement; p && p !== document.body; p = p.parentElement) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowY)) return false;
    }
    return true;
  }
  function fitTable(w) {
    const t = w.querySelector(':scope > table');
    if (!t) return;
    let fits = t.offsetWidth <= w.clientWidth + 1 && !w.classList.contains('no-fit') && pageScrolled(w);
    tog(w, 'sc-fit', fits);
    if (fits && getComputedStyle(w).overflowX !== 'visible') { tog(w, 'sc-fit', false); fits = false; }   // a page rule keeps it scrolling
    let s1 = false;
    if (!fits && !w.classList.contains('no-s1')) {
      const r = [...t.rows].find((x) => x.cells[0] && x.cells[0].colSpan === 1);
      s1 = !!r && r.cells[0].offsetWidth <= w.clientWidth * 0.45;
    }
    tog(w, 'sc-s1', s1);
  }
  function stickTop() {
    let top = 0;
    [document.querySelector('.topbar'), document.getElementById('tabs')].forEach((e) => {
      if (!e) return;
      const cs = getComputedStyle(e);
      if (cs.position === 'sticky' || cs.position === 'fixed') top = Math.max(top, (parseFloat(cs.top) || 0) + e.offsetHeight);
    });
    const v = top + 'px';
    if (root.style.getPropertyValue('--stick-top') !== v) root.style.setProperty('--stick-top', v);
  }
  // (the active tab is centred in the strip by app.js route(); the strip's edge fades update from its scroll events)
  const seen = new WeakSet();
  const ro = window.ResizeObserver ? new ResizeObserver(() => schedule()) : null;
  let raf = 0;
  function scan() {
    raf = 0;
    stickTop();
    document.querySelectorAll(SCROLLERS).forEach((w) => {
      if (!seen.has(w)) { seen.add(w); w.addEventListener('scroll', () => edges(w), { passive: true }); if (ro) ro.observe(w); }
      if (w.classList.contains('table-wrap')) fitTable(w);
      edges(w);
    });
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(scan); }
  UI.scrollers = scan;
  const mainEl = document.getElementById('main');
  if (mainEl && window.MutationObserver) new MutationObserver(schedule).observe(mainEl, { childList: true, subtree: true });
  ['resize', 'hashchange', 'load'].forEach((ev) => window.addEventListener(ev, schedule));
  if (ro) ['.topbar', '#tabs'].forEach((s) => { const e = document.querySelector(s); if (e) ro.observe(e); });
  schedule();
  // Print: open every closed <details>, and shrink tables wider than a printed page (~720 CSS px); undo afterwards.
  let printOpened = [], printZoomed = [];
  window.addEventListener('beforeprint', () => {
    printOpened = [...document.querySelectorAll('main details:not([open])')]; printOpened.forEach((d) => (d.open = true));
    printZoomed = [];
    document.querySelectorAll('main :is(.table-wrap:not(.sx-pt-wrap), .p-heat-wrap, .og-scroll) > :first-child').forEach((c) => {   // the Structure pairs table fits by itself in print
      const w = c.scrollWidth; if (w > 720) { c.style.zoom = (720 / w).toFixed(3); printZoomed.push(c); }
    });
  });
  window.addEventListener('afterprint', () => {
    printOpened.forEach((d) => (d.open = false)); printOpened = [];
    printZoomed.forEach((c) => { c.style.zoom = ''; }); printZoomed = [];
  });

  // ---------- shared bits ----------
  const myArea = () => +FCR.store.get('myArea', 65) || 65;
  const isPhone = () => !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
  const dash = (s) => String(s).replace(/\s*[-–]\s*/, '–');
  /** When the lot for panel P is drawn (December before its first Conference), relative to FCR.today(). */
  function drawStatus(P) {
    const y = P + 1949, t = FCR.today();
    const cal = (FCR.RAW.calendar && FCR.RAW.calendar.events) || [];
    const href = cal.some((e) => e.id === `panel${P}-draw`) ? `#/calendar/panel${P}-draw` : `#/calendar/${encodeURIComponent(`committee-draw@${y}-12-01`)}`;
    if (t < new Date(y, 11, 1)) return { done: false, href, short: `to be drawn December ${y}`, text: `to be drawn by lot in December ${y}` };
    if (t < new Date(y + 1, 0, 1)) return { done: false, now: true, href, short: `being drawn now`, text: `being drawn by lot this month (December ${y}; the date is not published)` };
    return { done: true, href, short: `drawn December ${y}`, text: `drawn by lot in December ${y}; the assignments reach this app with the ${y + 1} Final Report` };
  }
  /** Where the committee rosters are in a year's report, from the year file's notes ('' when not recorded). */
  function rosterPages(Y) {
    const n = (Y && Y.notes) || '', rg = '(\\d+(?:\\s*[-–]\\s*\\d+)?)';
    let m = new RegExp('Conference Committees(?: roster)?\\s+(?:on\\s+)?(?:PDF\\s+)?pp?\\.\\s*' + rg + '(?:\\s*\\(printed\\s+(?:pp?\\.\\s*)?' + rg + '\\))?', 'i').exec(n);
    if (m) return `Conference Committees roster on PDF p. ${dash(m[1])}${m[2] ? ` (printed p. ${dash(m[2])})` : ''}`;
    m = new RegExp('rosters?(?: are)?(?: on)? PDF\\s*pp?\\.\\s*' + rg + '(?:\\s*(?:=|\\()\\s*printed\\s+(?:pp?\\.\\s*)?' + rg + ')?', 'i').exec(n);
    if (m) return `rosters on PDF pp. ${dash(m[1])}${m[2] ? ` (printed pp. ${dash(m[2])})` : ''}`;
    m = /page images \(PDF pp\.\s*(\d+\s*[-–]\s*\d+)\)/i.exec(n);
    return m ? `rosters on PDF pp. ${dash(m[1])}` : '';
  }
  const reportOf = (y) => (FCR.RAW.reports || []).find((r) => r.year === +y && !r.historical) || null;
  /** "Source: 2026 Final Report (Confidential edition), rosters on PDF pp. … Open PDF" */
  function sourceLine(y, extra) {
    const r = reportOf(y), pg = rosterPages(FCR.Y(y));
    return `<p class="small muted c-src">Source: ${y} Final Report${r && r.edition ? ` (${esc(r.edition)} edition)` : ''}${pg ? ', ' + esc(pg) : ''}${extra || ''}.${r && r.drive_url ? ` <a href="${esc(r.drive_url)}" target="_blank" rel="noopener">Open PDF</a>` : ''}</p>`;
  }
  /** Standard committee size before a year: the most common size in the loaded years before it (FCR.predict.targetSizes
      for the primaries; the same count for Archives and IC/RF); for the first loaded year, over all loaded years. */
  function stdSize(id, year, secondary) {
    if (!secondary && FCR.predict && FCR.predict.targetSizes) {
      const t = FCR.predict.targetSizes([id], year)[id];
      return t != null ? t : FCR.predict.targetSizes([id], 1e4)[id] != null ? FCR.predict.targetSizes([id], 1e4)[id] : null;
    }
    const cnt = {}, first = {}, ys = FCR.years.filter((y) => y < year);
    (ys.length ? ys : FCR.years).forEach((y) => {
      const cm = (FCR.Y(y).conference_committees || []).find((x) => x.committee === id);
      if (!cm) return;
      const k = (cm.members || []).filter((m) => m.area != null).length;
      cnt[k] = (cnt[k] || 0) + 1; if (first[k] == null) first[k] = y;
    });
    const ks = Object.keys(cnt).map(Number).sort((a, b) => cnt[b] - cnt[a] || first[a] - first[b]);
    return ks.length ? ks[0] : null;
  }
  /** Chair facts from the loaded reports: next-year chairs/alternates are first-year members; a secondary committee's chair
      or alternate is not also chair of their primary committee the same year (several were its alternate chair). */
  let factsMemo = null;
  function chairFacts() {
    if (factsMemo) return factsMemo;
    const f = { first: 0, total: 0, sec: 0, overlap: 0, from: FCR.years[0], to: FCR.latestYear };
    const lead = (m) => m.role === 'chair' || m.role === 'alt_chair';
    FCR.years.forEach((y) => {
      const Y = FCR.Y(y), cc = Y.conference_committees || [];
      (Y.next_year_chairs || []).forEach((nc) => [nc.chair, nc.alternate].forEach((p) => {
        if (!p || p.area == null) return;
        f.total++;
        const cm = cc.find((c) => c.committee === nc.committee), m = cm && (cm.members || []).find((x) => x.area === p.area);
        if (m && m.panel === y - 1950) f.first++;
      }));
      const prim = new Set();   // primary-committee chairs (alternates can and do hold a secondary chair)
      cc.filter((c) => !c.secondary).forEach((c) => (c.members || []).forEach((m) => { if (m.role === 'chair') prim.add(m.area); }));
      cc.filter((c) => c.secondary).forEach((c) => (c.members || []).forEach((m) => { if (lead(m)) { f.sec++; if (prim.has(m.area)) f.overlap++; } }));
    });
    return (factsMemo = f);
  }
  const pct = (p) => FCR.predict.fmt(p) + (p > 0 ? '%' : '');

  // ---------- COMMITTEES ----------
  V.committees = function (el, args) {
    const nextY = FCR.latestYear + 1;
    const rawYear = parseInt(args && args[0], 10);
    const year = FCR.years.includes(rawYear) || (rawYear === nextY && !!FCR.Y(FCR.latestYear)) ? rawYear : FCR.latestYear;
    const focus = args && args[1] ? String(args[1]).toUpperCase() : null;
    const projected = !FCR.Y(year);              // next year: continuing panel + next_year_chairs + the model's seat counts
    const P1 = year - 1950, P2 = year - 1951;    // first-year and second-year panels at this Conference
    const Y = FCR.Y(year), prev = FCR.Y(year - 1) || {};
    const conf = FCR.conference(year);
    const ord = FCR.ordinal(year - 1950);
    const mine = myArea();
    const ds = projected ? drawStatus(P1) : null;
    const od = projected ? safe(() => FCR.predict.odds(P1)) : null;
    const f = chairFacts();

    // Panel P1 assignments announced before the report (an elect entry with `committee` or `panel<P>_committee`, e.g. user_provided)
    // (UI.announcedCommittee accepts an id, a name or an abbreviation: 'PI', 'Public Information', 'T&A'; the secondary too)
    const announced = projected && FCR.elects && FCR.elects.panel === P1 ? FCR.elects.list.map((e) => ({ e, an: e.delegate && UI.announcedCommittee ? UI.announcedCommittee(e.area, P1) : null }))
      .filter((x) => x.an).flatMap((x) => [x.an.committee].concat(x.an.secondary || []).map((c) => ({ name: x.e.delegate, area: x.e.area, panel: P1, role: 'member', committee: c, announced: true }))) : [];
    let comms = [];
    if (Y) comms = Y.conference_committees || [];
    else {
      comms = (prev.conference_committees || []).map((c) => ({
        committee: c.committee, printed_name: c.printed_name, secondary: c.secondary, secretary: c.secretary, secretaries: c.secretaries,
        members: (c.members || []).filter((m) => m.panel === P2).map((m) => {
          const nc = (prev.next_year_chairs || []).find((x) => x.committee === c.committee) || {};
          const role = nc.chair && nc.chair.area === m.area ? 'chair' : nc.alternate && nc.alternate.area === m.area ? 'alt_chair' : 'member';
          return Object.assign({}, m, { role });
        }).concat(announced.filter((m) => m.committee === c.committee)),
      }));
    }
    const nextChairs = (Y && Y.next_year_chairs) || [];

    const areaTag = (n) => {
      const a = FCR.areas[n];
      return a ? `<a class="c-ar" href="#/area/${n}" data-tip="Area ${n} · ${esc(a.name)} · ${esc(FCR.regionName(a.region))} region">${UI.regionDot(a.region)}<span>A${n} · ${esc(a.name)}</span></a>`
        : `<span class="c-ar muted"><span>Area ${esc(n)}</span></span>`;
    };
    const who = (p) => (p && p.name ? `${UI.personLink(p.name)}${p.area != null ? ` <span class="muted">A${esc(p.area)}</span>` : ''}` : '<span class="muted">—</span>');
    const roleRank = (m) => (m.role === 'chair' ? 0 : m.role === 'alt_chair' ? 1 : 2);
    const memberLi = (m) => `<li class="c-m${m.area === mine ? ' c-mine' : ''}"><span class="c-who">${UI.personLink(m.name)}${UI.roleBadge(m.role) ? ' ' + UI.roleBadge(m.role) : ''}</span>${m.area != null ? areaTag(m.area) : ''}</li>`;

    const card = (c) => {
      const id = c.committee, meta = FCR.COMMITTEES[id] || {}, sec = !!c.secondary;
      const members = c.members || [];
      const seated = members.filter((m) => m.area != null && !m.announced).length;
      const known = members.filter((m) => m.announced);
      const std = stdSize(id, year, sec);
      const info = projected && !sec && od ? safe(() => FCR.predict.committee(P1, id)) : null;
      const sObj = projected && sec && od && od.secondary ? od.secondary[id] : null;
      const seats = info ? info.seats : sObj ? sObj.seats : null;
      const oddsHref = sec ? `#/predict/${P1}` : `#/predict/${P1}/committee/${id}`;
      let size;
      if (projected) {
        size = seats != null ? `${seated} continuing + <strong>${seats}</strong> new${known.length ? ` (${known.length} known)` : ''} = ${seated + seats}${std != null ? ` <span class="muted">· standard size ${std}</span>` : ''}`
          : `${seated} continuing${std != null ? ` <span class="muted">· standard size ${std}</span>` : ''}`;
      } else {
        const d = std != null ? seated - std : 0;
        size = `${seated} members${std != null ? ` <span class="muted">· standard size ${std}</span>${d ? ` <span class="badge" data-tip="${d > 0 ? 'Larger' : 'Smaller'} than this committee's most common size in the earlier reports" tabindex="0">${d > 0 ? '+' : '−'}${Math.abs(d)}</span>` : ''}` : ''}`;
      }
      const panels = [...new Set(members.map((m) => m.panel))].sort((a, b) => a - b);   // 2nd-year (chairs) first
      const groups = panels.map((p) => `<div class="c-ph">Panel ${esc(p)}${p === P2 ? ' · 2nd year' : p === P1 ? ' · 1st year' : ''}${projected && p === P1 ? ` · ${known.length} of ${seats != null ? seats : '?'} announced` : ''}</div>
        <ul class="c-ml">${members.filter((m) => m.panel === p).slice().sort((a, b) => roleRank(a) - roleRank(b)).map(memberLi).join('')}</ul>`).join('');
      // projected year: the new seats, the likeliest areas for them, and next year's chair candidates (first-year members)
      let proj = '';
      if (projected && seats != null) {
        const top = info ? info.eligible.slice(0, 3).map((e) => ({ a: e.area, p: e.p }))
          : sObj && sObj.probs ? Object.entries(sObj.probs).map(([a, p]) => ({ a: +a, p })).sort((x, y) => y.p - x.p).slice(0, 3) : [];
        const n = seats;
        const over = conf.over;
        const candTxt = over
          ? `Elected at the end of the ${ord} Conference from its Panel ${P1} members; the names appear when the ${year} Final Report is loaded.`
          : `only its ${n} new Panel ${P1} member${n === 1 ? '' : 's'}${known.length ? ` (known so far: ${known.map((m) => esc(m.name)).join(', ')})` : ''}: at the end of the ${ord} Conference the committee elects its ${year + 1} chair and alternate from its first-year members — about 1 in ${n} (${Math.round(100 / n)}%) each to chair, ${Math.min(2, n)} in ${n} to chair or be alternate.`;
        proj = `<div class="c-new small"><span class="badge new">+${n}</span> Panel ${P1} seat${n === 1 ? '' : 's'}, ${esc(ds.text)}. <a href="${oddsHref}">(odds)</a>
            ${top.length ? `<div class="c-top">Likeliest (model): ${top.map((t) => `<a href="${sec ? oddsHref : `#/predict/${P1}/area/${t.a}/${id}`}" class="chip${t.a === mine ? ' accent' : ''}" data-tip="${esc(FCR.areaLabel(t.a))}">A${t.a} ${esc(pct(t.p))}</a>`).join(' ')}</div>` : ''}</div>
          <div class="c-cand small"><strong>${year + 1} chair candidates</strong> · ${candTxt}${sec && f.sec ? ` Its chair and alternate ${f.overlap ? 'are rarely' : 'have never been'} also chair of their primary committee that year (${f.overlap} of ${f.sec}, ${f.from}–${f.to}).` : ''}</div>`;
      }
      const nc = nextChairs.find((x) => x.committee === id);
      return `<div class="card c-card${focus === id ? ' c-focus' : ''}" id="cc-${esc(id)}">
        <h3><span>${esc(c.printed_name || meta.name || id)}${sec ? ' <span class="badge" data-tip="Members serve on this as a second committee, besides their primary one" tabindex="0">secondary</span>' : ''}</span><span class="badge">${esc(meta.abbr || '')}</span></h3>
        <div class="c-size small">${size}</div>
        ${groups}
        ${nc ? `<div class="c-next small"><span class="muted">${year + 1} chair</span> ${who(nc.chair)} <span class="muted">· alt.</span> ${who(nc.alternate)}</div>` : ''}
        ${proj}
        ${c.secretary ? `<div class="c-meta small">GSO Staff secretary: ${FCR.secretaries(c).map((x) => UI.personLink(x.name) + (x.label ? ` <span class="muted">(${esc(x.label)})</span>` : '')).join(', ')}</div>` : ''}
        ${id !== 'OTHER' && ((FCR.RAW.advisoryActions || {}).sections || []).some((s) => s.committee === id) ? `<div class="c-meta small"><a href="#/actions/committee/${esc(id)}">Advisory Actions of this committee →</a></div>` : ''}
        ${id !== 'OTHER' ? `<div class="c-meta small muted">Trustees' counterpart: <a href="#/structure/${FCR.Y(year) ? year : FCR.latestYear}/pair/${esc(id)}">${meta.trustees ? esc(meta.trustees) : 'none'}</a></div>` : ''}
      </div>`;
    };

    // "your area" this year
    const mineTerm = comms.map((c) => ({ c, m: (c.members || []).find((m) => m.area === mine) })).filter((x) => x.m);
    const mineTxt = mineTerm.length ? mineTerm.map((x) => `${UI.personLink(x.m.name)} · ${esc(FCR.cname(x.c.committee))}${x.m.panel === P2 ? ' (2nd year)' : x.m.panel === P1 ? ' (1st year)' : ''}`).join('; ') : '';
    const mineNew = projected && FCR.areaParity(mine) === P1 % 2 && !mineTerm.some((x) => x.m.panel === P1) ? (() => {
      const e = FCR.elects && FCR.elects.panel === P1 ? FCR.elects.byArea[mine] : null;
      const p = od && od.top && od.top[mine];
      return `${e && e.delegate ? UI.personLink(e.delegate) + ' ' : ''}(Panel ${P1}) ${esc(ds.short)}${p ? ` — likeliest ${(p.nearTie && p.tied && p.tied.length > 1 ? p.tied.slice(0, 3) : [p.c]).map((c) => `${esc(FCR.cabbr(c))} ${esc(pct(((od.probs || {})[mine] || {})[c] ?? (c === p.c ? p.p : p.p2)))}`).join(' ≈ ')}` : ''} · <a href="#/predict/${P1}/area/${mine}">why?</a>`;
    })() : '';

    const glanceOk = typeof UI.conferenceGlance === 'function';
    const inSession = !conf.over && conf.startDate && FCR.today() >= new Date(conf.startDate.getFullYear(), conf.startDate.getMonth(), conf.startDate.getDate());
    const confState = projected ? (conf.over ? 'met · report pending' : inSession ? 'in session' : conf.datesKnown ? 'upcoming' : '') : '';
    el.innerHTML = `
      <div class="page-head"><div><h1>Conference committees</h1>
        <p>Each area delegate serves on one primary Conference committee for both years of the term; some also get a secondary committee
        (Archives, International Conventions/Regional Forums). Most committees are paired with a trustees' committee (Grapevine and La Viña meets with the AA Grapevine board; Policy/Admissions and Report and Charter have none — see <a href="#/structure/${FCR.Y(year) ? year : FCR.latestYear}/pairs">committee pairs</a>), and a GSO staff member is its secretary.</p></div>
        <label class="c-yr">Year ${UI.yearSelect('c-year', FCR.years, year, FCR.Y(FCR.latestYear) ? [{ v: nextY, l: `${nextY} · ${FCR.ordinal(nextY - 1950)} GSC (projected)` }] : [])}</label></div>
      ${projected ? `<div class="callout">${conf.over ? `The ${ord} Conference has met; until its ${year} Final Report is loaded this view is built from the ${year - 1} report.` : `Projected view of the ${ord} Conference (${year}).`}
        The second-year Panel ${P2} members are known (same committee as last year) and so are the ${year} chairs.
        The first-year Panel ${P1} delegates are ${esc(ds.text)} (<a href="${ds.href}">calendar</a>); the seat counts below are the model's standard sizes — see <a href="#/predict/${P1}">Predict</a>.</div>` : ''}
      ${glanceOk ? `<details class="card c-glance"${isPhone() ? '' : ' open'}><summary><span class="c-gl-h">${ord} Conference at a glance</span>${conf.theme ? ` <em class="c-gl-t">“${esc(conf.theme)}”</em>` : ''}${confState ? ` <span class="chip">${esc(confState)}</span>` : ''}</summary>${UI.conferenceGlance(year, { noTheme: true })}</details>` : ''}
      ${mineTxt || mineNew ? `<p class="c-mine-l small">${UI.regionDot(FCR.areaRegion(mine))} <strong>Area ${mine}</strong> in ${year}: ${[mineTxt, mineNew].filter(Boolean).join('; ')}</p>` : ''}
      <nav class="c-index" aria-label="Jump to a committee">${comms.map((c) => `<a class="chip${focus === c.committee ? ' accent' : ''}" href="#/committees/${year}/${esc(c.committee)}" data-tip="${esc(FCR.cname(c.committee))}">${esc(FCR.cabbr(c.committee))}</a>`).join('')}<a class="chip" href="#/committees/${year}/chairs">Chairs by year</a></nav>
      <div class="grid c-cards" id="c-cards"></div>
      ${projected ? sourceLine(year - 1, ` — continuing Panel ${P2} members and the ${year} chairs; new seats from the model's standard sizes`) : sourceLine(year)}
      <h2 class="section-title" id="c-chairs-h">Chairs and alternate chairs by year</h2>
      <p class="small ink2">The chair and alternate of each committee are elected at the end of a Conference, by plurality, from that committee's first-year members, and chair it the next year as second-year delegates (${f.first} of ${f.total} were first-year members, ${f.from}–${f.to}). Newest year first.</p>
      <div id="c-chairs"></div>`;
    el.querySelector('#c-year').addEventListener('change', (e) => { location.hash = '#/committees/' + e.target.value; });
    el.querySelector('#c-cards').innerHTML = comms.map(card).join('') || UI.empty('No committee roster for this year.');

    // chairs history table: committee × year, newest first (next year's chairs come from the latest report)
    const yrs = FCR.years.slice().reverse();
    const ids = [...new Set([].concat(...FCR.years.slice().reverse().map((y) => (FCR.Y(y).conference_committees || []).map((c) => c.committee))))];
    const chairOf = (y, id) => { const c = (FCR.Y(y).conference_committees || []).find((x) => x.committee === id); if (!c) return null; return { ch: (c.members || []).find((m) => m.role === 'chair'), al: (c.members || []).find((m) => m.role === 'alt_chair') }; };
    const L = FCR.Y(FCR.latestYear) || {};
    const cell = (x, y) => {
      const cls = y === year ? ' class="c-sel"' : '';
      if (!x || (!x.ch && !x.al)) return `<td${cls}><span class="muted">—</span></td>`;
      return `<td${cls}><div class="c-chn">${who(x.ch)}</div>${x.al ? `<div class="c-alt">alt. ${esc(x.al.name)} A${esc(x.al.area)}</div>` : ''}</td>`;
    };
    const nxt = (id) => { const nc = (L.next_year_chairs || []).find((x) => x.committee === id); return nc ? { ch: nc.chair, al: nc.alternate } : null; };
    el.querySelector('#c-chairs').innerHTML = `<div class="table-wrap"><table class="t compact c-chairs"><thead><tr><th>Committee</th>
      <th${nextY === year ? ' class="c-sel"' : ''} data-tip="Elected at the end of the ${FCR.latestYear} Conference">${nextY} <span class="c-el">elected ${FCR.latestYear}</span></th>${yrs.map((y) => `<th${y === year ? ' class="c-sel"' : ''}>${y}</th>`).join('')}</tr></thead>
      <tbody>${ids.map((id) => `<tr><th scope="row"><a href="#/committees/${year}/${esc(id)}" data-tip="${esc((FCR.COMMITTEES[id] || {}).name || id)}"><span class="c-fn">${esc(FCR.cname(id))}</span><span class="c-ab">${esc(FCR.cabbr(id))}</span></a></th>${cell(nxt(id), nextY)}${yrs.map((y) => cell(chairOf(y, id), y)).join('')}</tr>`).join('')}</tbody></table></div>`;

    if (focus === 'CHAIRS') { const h = el.querySelector('#c-chairs-h'); if (h) h.scrollIntoView({ block: 'start' }); }
    else if (focus && FCR.COMMITTEES[focus]) { const n = document.getElementById('cc-' + focus); if (n) n.scrollIntoView({ block: isPhone() ? 'start' : 'center' }); }
  };

  // ---------- ROTATION GRID ----------
  const HEAT = (p) => (p < 0.05 ? 1 : p < 0.1 ? 2 : p < 0.2 ? 3 : p < 0.3 ? 4 : p < 0.45 ? 5 : 6);
  V.grid = function (el, args) {
    const HL = ['', ...FCR.PRIMARY_ORDER, 'ARCHIVES', 'ICRF'];
    const st = Object.assign({ sort: 'region', hl: '', showPred: true }, FCR.store.get('grid', {}));
    const argC = args && args[0] ? String(args[0]).toUpperCase() : '';
    if (HL.includes(argC)) st.hl = argC;
    if (!HL.includes(st.hl)) st.hl = '';
    const panels = FCR.panels.slice();
    const PP = panels.length ? panels[panels.length - 1] + 1 : FCR.cycle().electPanel;   // first panel the reports don't list yet
    const od = safe(() => FCR.predict.odds(PP));
    const ds = drawStatus(PP);
    const mine = myArea();
    el.innerHTML = `
      <div class="page-head"><div><h1>Rotation grid</h1>
        <p>Which area held which committee, panel by panel. Rows are areas, columns are panels (a panel = the delegates elected the same fall;
        they attend the Conferences of panel + 1950 and panel + 1951). Odd panels come from one half of the areas, even panels from the other.
        The last column is the model's Panel ${PP} forecast.</p></div></div>
      <div class="controls">
        <span class="small muted">Highlight</span>
        <div class="seg" id="g-hl" role="group" aria-label="Highlight a committee">${HL.map((c) => `<button type="button" data-c="${c}" aria-pressed="${st.hl === c}" class="${st.hl === c ? 'on' : ''}"${c ? ` data-tip="${esc(FCR.COMMITTEES[c].name)}"` : ''}>${c ? esc(FCR.cabbr(c)) : 'None'}</button>`).join('')}</div>
        <label>Group <select id="g-sort"><option value="region" ${st.sort === 'region' ? 'selected' : ''}>by region</option><option value="number" ${st.sort === 'number' ? 'selected' : ''}>by area number</option><option value="parity" ${st.sort === 'parity' ? 'selected' : ''}>odd / even panels</option></select></label>
        <label><input type="checkbox" id="g-pred" ${st.showPred ? 'checked' : ''}> Panel ${PP} model column</label>
      </div>
      <div class="legend">${FCR.PRIMARY_ORDER.concat(['ARCHIVES', 'ICRF']).map((c) => `<span><strong>${esc(FCR.cabbr(c))}</strong> ${esc(FCR.cname(c))}</span>`).join('')}<span><strong>+</strong> secondary committee</span><span><span class="badge chair">C</span>/<span class="badge alt">A</span> chair / alt. chair</span></div>
      <p class="small ink2 g-predkey" id="g-predkey"></p>
      <div class="card g-card"><div class="g-head" aria-hidden="true"></div><div class="g-scroll" id="g-wrap"></div></div>
      <h2 class="section-title">Committee mix per panel</h2>
      <p class="small ink2">How many new delegates each committee received in each panel. Committees are kept at their standard size (8 or 9 members over both panels), so each draw refills the seats the rotating panel leaves${od ? `; the last column is the model's Panel ${PP} seat count` : ''}.</p>
      <div id="g-sizes"></div>`;
    const wrap = el.querySelector('#g-wrap'), head = el.querySelector('.g-head');
    wrap.addEventListener('scroll', () => { head.scrollLeft = wrap.scrollLeft; }, { passive: true });
    el.querySelectorAll('#g-hl button').forEach((b) => b.addEventListener('click', () => {
      st.hl = b.dataset.c;
      try { history.replaceState(null, '', '#/grid' + (st.hl ? '/' + st.hl : '')); } catch (e) { /* file: URLs in some browsers */ }
      draw();
    }));
    el.querySelector('#g-sort').addEventListener('change', (e) => { st.sort = e.target.value; draw(); });
    el.querySelector('#g-pred').addEventListener('change', (e) => { st.showPred = e.target.checked; draw(); });

    const predTip = (a) => {
      const pr = od.probs[a] || {}, top = od.top && od.top[a], ranked = Object.entries(pr).filter((x) => x[1] > 0).sort((x, y) => y[1] - x[1]).slice(0, 3);
      const ex = od.lineup && od.lineup[a];
      return `<strong>Area ${a} · ${esc((FCR.areas[a] || {}).name || '')}</strong><br>Panel ${PP} (model, ${od.precomputed ? 'precomputed' : 'live run'})` +
        (ex ? `<br>Example full draw: ${esc(FCR.cname(ex))} (${esc(pct(pr[ex] || 0))})` : '') +
        (top ? `<br>Most likely: ${esc(FCR.cname(top.c))} ${esc(pct(top.p))}${top.nearTie && top.second ? ` ≈ ${esc(FCR.cabbr(top.second))} ${esc(pct(top.p2))}` : ''}` : '') +
        (ranked.length ? `<br>Top 3: ${ranked.map(([c, p]) => esc(FCR.cabbr(c)) + ' ' + esc(FCR.predict.fmt(p))).join(' · ')}` : '');
    };
    function predCell(a) {
      if (!od || !od.probs[a]) return '<td class="empty"></td>';
      const pr = od.probs[a];
      if (st.hl) {
        const secObj = (st.hl === 'ARCHIVES' || st.hl === 'ICRF') && od.secondary ? od.secondary[st.hl] : null;
        const p = secObj ? (secObj.probs && secObj.probs[a]) || 0 : pr[st.hl] || 0;
        const inDraw = !secObj && od.lineup && od.lineup[a] === st.hl;
        const tip = `<strong>Area ${a}</strong> · Panel ${PP} (model)<br>Chance of ${esc(FCR.cname(st.hl))}: ${esc(pct(p))}${inDraw ? '<br>In the example full draw' : ''}${p > 0 ? '' : '<br>Ruled out (held it in its last 3 terms, or the rules leave no seat)'}<br><br>${predTip(a)}`;
        return `<td class="pred ${p > 0 ? 'gh' + HEAT(p) : 'gx'}${inDraw ? ' ex' : ''}" data-tip-html="1" data-tip="${esc(tip)}">${esc(pct(p))}</td>`;
      }
      const c = (od.lineup && od.lineup[a]) || (od.top && od.top[a] && od.top[a].c);
      if (!c) return '<td class="empty"></td>';
      const p = pr[c] || 0, pp = Math.round(12 + 88 * Math.min(1, p / 0.5));
      return `<td class="pred" style="--pp:${pp}%" data-tip-html="1" data-tip="${esc(predTip(a))}">${esc(FCR.cabbr(c))}<i>${esc(pct(p))}</i></td>`;
    }
    function predKey() {
      const box = el.querySelector('#g-predkey');
      if (!st.showPred || !od) { box.innerHTML = ''; box.hidden = true; return; }
      box.hidden = false;
      const scale = `<span class="g-scale">${[[0.02, '<5'], [0.07, '5–10'], [0.15, '10–20'], [0.25, '20–30'], [0.38, '30–45'], [0.6, '45+']].map(([p, l]) => `<span class="gh${HEAT(p)}">${esc(l)}</span>`).join('')}</span>`;
      box.innerHTML = st.hl
        ? `<strong>P${PP} (model)</strong> = each area's chance of ${esc(FCR.cname(st.hl))} (%) ${scale} · – = ruled out${(st.hl === 'ARCHIVES' || st.hl === 'ICRF') ? '' : ' · outlined = in the example full draw'}. Panel ${PP} is ${esc(ds.text)}. <a href="#/predict/${PP}${(st.hl === 'ARCHIVES' || st.hl === 'ICRF') ? '' : '/committee/' + st.hl}">Who could land here →</a>`
        : `<strong>P${PP} (model)</strong> = one example full draw that obeys every rule; the fill shows that committee's chance for the area (darker = likelier). It can differ from an area's single most likely committee — hover a cell, or highlight a committee to see every area's chance of it. Panel ${PP} is ${esc(ds.text)}. <a href="#/predict/${PP}">Predict →</a>`;
    }

    let first = true;
    function draw() {
      FCR.store.set('grid', st);
      el.querySelectorAll('#g-hl button').forEach((b) => { b.classList.toggle('on', b.dataset.c === st.hl); b.setAttribute('aria-pressed', String(b.dataset.c === st.hl)); });
      const areas = FCR.areaList.slice();
      const groups = [];
      if (st.sort === 'region') FCR.REGIONS.forEach((r) => groups.push({ label: r.name, rid: r.id, areas: areas.filter((a) => a.region === r.id) }));
      else if (st.sort === 'parity') [1, 0].forEach((p) => groups.push({ label: p ? 'Odd-panel areas' : 'Even-panel areas', areas: areas.filter((a) => FCR.areaParity(a.n) === p) }));
      else groups.push({ label: '', areas });
      const unassigned = areas.filter((a) => !groups.some((g) => g.areas.includes(a)));
      if (unassigned.length) groups.push({ label: 'Region unknown', areas: unassigned });
      const showPredCol = !!(st.showPred && od);
      const ncol = panels.length + (showPredCol ? 1 : 0);
      const sty = `--n:${panels.length};--x:${showPredCol ? 1 : 0}`;
      const colg = `<colgroup><col class="g-c0">${panels.map(() => '<col class="g-cp">').join('')}${showPredCol ? '<col class="g-cx">' : ''}</colgroup>`;
      const headRow = (copy) => `<tr><th class="rowh" scope="col">Area</th>${panels.map((p) => `<th scope="col"${copy ? ` data-tip="Panel ${p}: Conferences ${p + 1950} and ${p + 1951}"` : ''}>P${p}<small>${p + 1950}–${String(p + 1951).slice(2)}</small></th>`).join('')}${showPredCol ? `<th scope="col"${copy ? ` data-tip="Panel ${PP} (model): example full draw and its chance; highlight a committee to see every area's chance of it"` : ''}>P${PP}<small>(model)</small></th>` : ''}</tr>`;
      let body = '';
      groups.forEach((g) => {
        if (g.label) body += `<tr class="region-sep"><th class="rowh" scope="rowgroup">${g.rid ? UI.regionDot(g.rid) : ''}${esc(g.label)}</th><td colspan="${ncol}"></td></tr>`;
        g.areas.forEach((a) => {
          body += `<tr${a.n === mine ? ' class="g-mine"' : ''}><th class="rowh" scope="row"><a href="#/area/${a.n}" data-tip="Area ${a.n} · ${esc(a.name)} · ${esc(FCR.regionName(a.region))} region">${a.n} <span>${esc(a.short || a.name)}</span></a></th>`;
          panels.forEach((p) => {
            const t = FCR.term(a.n, p);
            if (!t) { body += '<td class="empty"></td>'; return; }
            const roles = [].concat(...Object.values(t.roles));
            const ch = roles.find((r) => r.committee === t.committee && r.role === 'chair') ? 'C' : roles.find((r) => r.committee === t.committee && r.role === 'alt_chair') ? 'A' : '';
            const sec = t.secondaryList.length ? '+' : '';
            const isHl = st.hl && (t.committee === st.hl || t.secondaryList.includes(st.hl));
            const cls = isHl ? (t.committee === st.hl ? 'hl' : 'hl2') : '';
            const tip = `<strong>${esc(t.name || '')}</strong> · Area ${a.n}<br>Panel ${p} (${p + 1950}–${p + 1951})<br>${esc(FCR.cname(t.committee || ''))}${t.secondaryList.length ? '<br>+ ' + t.secondaryList.map((s) => esc(FCR.cname(s))).join(', ') : ''}${roles.length ? '<br>' + roles.map((r) => (r.role === 'chair' ? 'Chair ' : 'Alt. chair ') + esc(FCR.cabbr(r.committee))).join(', ') : ''}`;
            body += `<td class="${cls}" data-tip-html="1" data-tip="${esc(tip)}">${t.committee ? esc(FCR.cabbr(t.committee)) : '?'}${sec}${ch ? `<sup>${ch}</sup>` : ''}</td>`;
          });
          if (showPredCol) body += predCell(a.n);
          body += '</tr>';
        });
      });
      const keep = first ? null : wrap.scrollLeft;
      head.innerHTML = `<table class="rgrid" style="${sty}">${colg}<thead>${headRow(true)}</thead></table>`;
      wrap.innerHTML = `<table class="rgrid" style="${sty}">${colg}<thead class="g-vh">${headRow(false)}</thead><tbody>${body}</tbody></table>`;
      wrap.scrollLeft = keep == null ? wrap.scrollWidth : keep;     // open at the newest panels and the model column
      head.scrollLeft = wrap.scrollLeft;
      first = false;
      predKey();
    }
    draw();

    // sizes table: new members per committee per panel (+ the model's seats for the next panel)
    const comms = FCR.PRIMARY_ORDER.filter((c) => Object.values(FCR.terms).some((t) => t.committee === c));
    const showSeats = od && od.seats;
    el.querySelector('#g-sizes').innerHTML = `<div class="table-wrap"><table class="t compact"><thead><tr><th>Committee</th>${panels.map((p) => `<th class="n">P${p}</th>`).join('')}${showSeats ? `<th class="n" data-tip="Seats the model gives each committee in the Panel ${PP} draw (standard size − continuing members)">P${PP} (model)</th>` : ''}</tr></thead><tbody>${comms.map((c) => `<tr><td><a href="#/grid/${c}" data-c="${c}" class="g-hlk">${esc(FCR.cname(c))}</a></td>${panels.map((p) => { const n = Object.values(FCR.terms).filter((t) => t.panel === p && t.committee === c).length; return `<td class="n">${n || '<span class="muted">·</span>'}</td>`; }).join('')}${showSeats ? `<td class="n"><strong>${od.seats[c] != null ? od.seats[c] : '–'}</strong></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
    el.querySelectorAll('#g-sizes .g-hlk').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault(); st.hl = a.dataset.c;
      try { history.replaceState(null, '', '#/grid/' + st.hl); } catch (er) { /* ignore */ }
      draw(); el.querySelector('.g-card').scrollIntoView({ block: 'start' });
    }));
  };

})();
