/* Structure page (#/structure[/<year>[/pairs | /pair/<id>]]): the U.S./Canada service structure as an interactive org
   chart (after the Service Manual's Appendix C charts, pp. 108–109) filled with the names and counts of one Final
   Report, and the Conference committees side by side with their corresponding trustees' committees, with everyone on
   each side.
   Chart: every box is a <button>; a small tidy-tree pass places them (children side by side, or stacked under the parent
   for lists; on narrow screens every list stacks) and one SVG layer draws the connectors. Clicking a box opens it in the
   details panel and unfolds its children; the round handle under a box folds or unfolds it. A committee box is tied to
   its counterpart by a dashed line (hover, focus or select). The details panel is a sticky side column above 1180px and
   a bottom sheet below. Pairings: FCR.COMMITTEES[..].tc and FCR.TRUSTEES_COMMITTEES (core.js).
   "Who can correct whom" (toolbar toggle, #/structure/<year>/checks): labeled arrows between the levels' boxes (groups,
   Conference, General Service Board, corporate boards, staff) from structure_checks.json, the rest dimmed; on phones, in
   the stacked tree and in print the same arrows are a vertical list.
   Styles: assets/css/structure.css (class prefix sx-). */
(function () {
  'use strict';
  const FCR = window.FCR;
  const esc = FCR.esc;
  const V = FCR.views, UI = FCR.ui;
  const TCS = FCR.TRUSTEES_COMMITTEES || {};
  const same = (a, b) => FCR.sameName(a, b);
  const plural = (n, w, pl) => `${n} ${n === 1 ? w : pl || w + 's'}`;
  const listAnd = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
  const CC_ORDER = FCR.PRIMARY_ORDER.concat(['ARCHIVES', 'ICRF']);
  const ccRank = (id) => { const i = CC_ORDER.indexOf(id); return i < 0 ? 99 : i; };
  const TC_ORDER = Object.keys(TCS);
  const ccLabel = (id) => FCR.cname(id);
  const tcLabel = (k) => (TCS[k] ? TCS[k].short || TCS[k].name : k);
  /** 'Trustees’ Literature Committee'; the General Sharing Session is a session the board holds, not a committee. */
  const tcFull = (k, printed) => (TCS[k] && TCS[k].session ? TCS[k].name : `Trustees’ ${(TCS[k] || {}).name || printed} Committee`);
  const brk = (s) => esc(s).replace(/\//g, '/<wbr>');   // 'Treatment/Accessibilities' may wrap at the slash
  const stopAfter = (name) => (/\.$/.test(String(name || '')) ? '' : '.');   // 'Scott H.' already ends the sentence
  const MANUAL = 'Service Manual 2026–2028';
  const BOARD = (FCR.RAW && FCR.RAW.board) || {};
  /** Who can correct whom (data/src/structure_checks.json): levels (chart box ids) and the arrows between them. */
  const CHECKS = (FCR.RAW && FCR.RAW.structureChecks) || {};
  /** 'C-34' -> 'p. C-34'; '124–125, C-10' -> 'pp. 124–125, C-10'. */
  const pgText = (p) => (/,|–/.test(String(p)) ? 'pp. ' : 'p. ') + p;
  /** 'FR26 p4 L140-142' -> '2026 Final Report, PDF p. 4' (data refs count PDF pages; views.js refPage says the same). */
  const frRef = (r) => { const m = /FR(\d\d) p(\d+)/.exec(r || ''); return m ? `20${m[1]} Final Report, PDF p. ${m[2]}` : ''; };
  /** ' (thru Feb. 2023)' from a roster note such as 'thru Feb. 2023 (resigned)'. */
  const thru = (note) => { const m = /thru [^()]+/i.exec(note || ''); return m ? ` (${m[0].trim()})` : ''; };

  // ---------- one year's data ----------
  function yearData(year) {
    const Y = FCR.Y(year) || {};
    const ccs = (Y.conference_committees || []).slice().sort((a, b) => ccRank(a.committee) - ccRank(b.committee));
    const tcs = (Y.trustees_committees || []).map((c) => ({ key: FCR.tcKey(c.committee) || 'X_' + FCR.fold(c.committee).replace(/ /g, '_').toUpperCase(), c }))
      .sort((a, b) => (TC_ORDER.indexOf(a.key) + 1 || 99) - (TC_ORDER.indexOf(b.key) + 1 || 99));
    // trustees seated at the Conference: not emeriti, not those who left before it (served_thru, e.g. 2023)
    const trustees = (Y.trustees || []).filter((t) => !t.emeritus && !t.served_thru);
    const left = (Y.trustees || []).filter((t) => !t.emeritus && t.served_thru);
    // the chair at the Conference: an interim chair when one is printed ('Interim Chair' 2023, 'Chair (interim)' 2024)
    const offs = Y.gsb_officers || [];
    const ic = offs.find((o) => /chair/i.test(o.title || '') && /interim|acting/i.test(o.title || '') && !/vice/i.test(o.title || ''));
    const pc = offs.find((o) => /^chair(person)?$/i.test(String(o.title || '').trim()));
    const chairName = ((ic || pc) || {}).name || ((Y.trustees || []).find((t) => t.position_id === 'GSB_CHAIR') || {}).name || null;
    const chairInterim = !!ic;
    /** Holds the chair's own seat (a Class B chair's extra seat); an interim chair keeps the seat they were elected to. */
    const isChairSeat = (t) => !chairInterim && !!chairName && same(t.name, chairName);
    const dirs = Y.nontrustee_directors || [];
    /** What a trustees' committee member is: 'Class A (nonalcoholic) trustee', 'AAWS nontrustee director', 'GSO staff' … */
    const roleOf = (name) => {
      const t = trustees.find((x) => same(x.name, name));
      if (t) return isChairSeat(t) ? 'GSB chair' : t.position_id && t.position_id !== 'OTHER' && FCR.POSITIONS[t.position_id] ? FCR.POSITIONS[t.position_id] : t.position || 'trustee';
      const l = left.find((x) => same(x.name, name));
      if (l) return `${l.position_id && FCR.POSITIONS[l.position_id] ? FCR.POSITIONS[l.position_id] : 'trustee'} (left ${l.served_thru})`;
      if ((Y.trustees || []).some((x) => x.emeritus && same(x.name, name))) return 'trustee emeritus';
      const d = dirs.find((x) => same(x.name, name));
      if (d) return /grape/i.test(d.board || '') ? FCR.POSITIONS.DIR_GRAPEVINE : FCR.POSITIONS.DIR_AAWS;
      if ((Y.gso_staff || []).some((s) => same(s.name, name))) return 'GSO staff';
      const o = offs.find((x) => same(x.name, name));
      return o ? 'GSB ' + String(o.title || '').toLowerCase() : '';
    };
    const corpChair = (list) => (list || []).find((d) => /chair/i.test(d.role || '')) || null;
    return { year, Y, ccs, tcs, trustees, left, chairName, chairInterim, isChairSeat, dirs, roleOf, corpChair, P2: year - 1951, P1: year - 1950 };
  }
  const ccOf = (D, id) => D.ccs.find((c) => c.committee === id) || null;
  const chairOfCC = (c) => ((c && c.members) || []).find((m) => m.role === 'chair') || null;
  const chairOfTC = (c) => ((c && c.members) || []).find((m) => m.type === 'chair') || null;
  /** Members of a committee; consultants are listed but are not members (rosters mark them '*** Consultant'). */
  const nMem = (c) => ((c && c.members) || []).filter((m) => m.type !== 'consultant').length;
  const nCons = (c) => ((c && c.members) || []).filter((m) => m.type === 'consultant').length;
  const memText = (c) => plural(nMem(c), 'member') + (nCons(c) ? ` + ${plural(nCons(c), 'consultant')}` : '');
  // The General Sharing Session is not a committee: the roster prints only who leads it (and a secretary).
  const SESSION = `held by the board at each quarterly weekend, open to all trustees, directors, appointed committee members and staff (${MANUAL}, p. 61)`;
  const sessionSub = (c) => { const m = ((c && c.members) || [])[0]; return m ? `led by ${m.name}` : 'board session'; };
  /** Counterpart of a Conference committee: {kind:'tc', key} | {kind:'board'} | null. */
  const ccPair = (id) => { const k = (FCR.COMMITTEES[id] || {}).tc; return k === 'GV_BOARD' ? { kind: 'board' } : k ? { kind: 'tc', key: k } : null; };
  /** The pairs card a Conference committee id, trustees' committee key or GV_BOARD belongs to. */
  const pairId = (id) => ((FCR.COMMITTEES[id] && FCR.COMMITTEES[id].tc) || id);

  // ---------- shared bits ----------
  const learnLink = (id, label) => (FCR.learnTree && FCR.learnTree.node(id) ? `<a href="#/learn/${id}">${esc(label || 'Read more in Learn')} →</a>` : '');
  /** First n sentences of a Learn node's summary. Splits only at a stop that ends a word of two or more letters and is
      followed by a capital, so 'A.A. World Services', 'U.S. and Canada', 'Inc. (AAWS)' and 'Dr. Bob' stay whole. */
  const blurb = (id, n) => {
    const nd = FCR.learnTree && FCR.learnTree.node(id);
    if (!nd || !nd.summary) return '';
    const s = String(nd.summary).replace(/\b(Dr|Mr|Mrs|Ms|St|No|pp?|vs)\./g, '$1\u0000')
      .split(/(?<=(?<!\b[A-Z])[.!?])\s+(?=[A-Z“"‘])/).map((x) => x.replace(/\u0000/g, '.'));
    return `<p>${esc(s.slice(0, n || 2).join(' ').trim())}</p>`;
  };
  const MBADGE = { chair: '<span class="badge chair">Chair</span>', appointed: '<span class="badge" data-tip="Appointed committee member (not a trustee)" tabindex="0">ACM</span>', consultant: '<span class="badge" data-tip="Consultant to the committee (not a member)" tabindex="0">cons.</span>' };
  const secLine = (c) => { const s = FCR.secretaries(c || {}); return s.length ? `GSO staff secretary: ${s.map((x) => UI.personLink(x.name) + (x.label ? ` <span class="muted">(${esc(x.label)})</span>` : '')).join(', ')}` : ''; };
  /** Conference committee members, second-year panel first, chair and alternate on top. */
  function ccMembers(D, c) {
    const rk = { chair: 0, alt_chair: 1 };
    const ms = (c.members || []).slice().sort((a, b) => a.panel - b.panel || (rk[a.role] ?? 2) - (rk[b.role] ?? 2) || a.area - b.area);
    const mine = +FCR.store.get('myArea', 65) || 65;
    const li = (m) => `<li${m.area === mine ? ' class="sx-mine"' : ''}>${UI.personLink(m.name)} <span class="small muted">${m.area != null ? UI.areaLink(m.area, { noname: true }) : ''}</span> ${UI.roleBadge(m.role)}</li>`;
    const panels = [...new Set(ms.map((m) => m.panel))];
    return panels.map((p) => `<div class="sx-ph">Panel ${esc(p)}${p === D.P2 ? ' · 2nd year' : p === D.P1 ? ' · 1st year' : ''}</div><ul class="sx-ml">${ms.filter((m) => m.panel === p).map(li).join('')}</ul>`).join('');
  }
  /** Trustees' committee members: chair first, then trustees, directors, appointed members and consultants. */
  function tcMembers(D, c) {
    const rank = (m) => (m.type === 'chair' ? 0 : m.type === 'member' ? (/director/i.test(D.roleOf(m.name)) ? 2 : 1) : m.type === 'appointed' ? 3 : 4);
    const ms = (c.members || []).slice().sort((a, b) => rank(a) - rank(b));
    return `<ul class="sx-ml">${ms.map((m) => { const r = D.roleOf(m.name); return `<li>${UI.personLink(m.name)} ${MBADGE[m.type] || ''}${r ? ` <span class="small muted">${esc(r)}</span>` : ''}${m.note && /thru/i.test(m.note) ? ` <span class="small muted">· ${esc(m.note)}</span>` : ''}</li>`; }).join('')}</ul>`;
  }
  const corpList = (list) => `<ul class="sx-ml">${(list || []).map((d) => `<li>${UI.personLink(d.name)}${/chair/i.test(d.role || '') ? ' <span class="badge chair">Chair</span>' : ''} <span class="small muted">${esc(String(d.role || '').replace(/^chair,\s*/i, ''))}</span></li>`).join('') || '<li class="muted small">Not printed.</li>'}</ul>`;

  // ---------- the chart's tree ----------
  // node: {id, title, sub, kind: base|conf|board|corp, dot (region colour), learn, stack, open, children, pairs: [ids], detail()}
  function buildTree(D) {
    const { Y, year } = D;
    const mine = +FCR.store.get('myArea', 65) || 65;
    const N = (o) => Object.assign({ children: [], pairs: [], stack: false, open: false }, o);
    const dels = Y.delegates || [];
    const ord = FCR.ordinal(year - 1950);
    // delegate-elects (panel_elects.json) belong only to the chart whose first-year panel they follow, and only until
    // the Final Report that lists them is loaded (stage 'elect' before Jan 1, 'serving' during the term)
    const EP = FCR.elects && FCR.elects.panel;
    const stage = FCR.electStage ? FCR.electStage(FCR.cycle()) : null;
    const showEl = EP === D.P1 + 1 && (stage === 'elect' || stage === 'serving');
    const electLine = (name) => (stage === 'elect' ? `Panel ${EP} delegate-elect: ${UI.personLink(name)} <span class="muted">(takes office Jan 1, ${EP + 1950})</span>`
      : `Panel ${EP} delegate: ${UI.personLink(name)} <span class="muted">(serving since Jan 1, ${EP + 1950}; not yet in a Final Report)</span>`);

    // delegates by region -> areas
    const regions = FCR.REGIONS.map((r) => {
      const areas = FCR.areaList.filter((a) => a.region === r.id);
      const rt = D.trustees.find((t) => t.position_id === FCR.REGION_SEAT[r.id]);
      return N({
        id: 'reg-' + r.id, title: `${r.name} region`, sub: `${plural(areas.length, 'area')}${rt ? ' · trustee ' + rt.name : ''}`, kind: 'base', dot: FCR.regionColor(r.id), stack: true,
        children: areas.map((a) => {
          const ds = dels.filter((d) => d.area === a.n);
          const e = showEl && !FCR.term(a.n, EP) && FCR.elects.byArea[a.n];
          return N({
            id: 'area-' + a.n, title: `Area ${a.n} · ${a.short || a.name}`, sub: ds.length ? ds.map((d) => `${d.name} · P${d.panel}`).join('; ') : 'no delegate printed', kind: 'base', dot: FCR.regionColor(r.id), mine: a.n === mine,
            detail: () => `<p>${UI.areaLink(a.n)} · ${esc(r.name)} region</p>
              ${ds.length ? `<h4>Delegate at the ${ord} Conference</h4><ul class="sx-ml">${ds.map((d) => {
                const cm = D.ccs.filter((c) => (c.members || []).some((m) => m.area === a.n && same(m.name, d.name)));
                return `<li>${UI.personLink(d.name)} <span class="small muted">Panel ${esc(d.panel)}${d.city ? ' · ' + esc(d.city) : ''}</span>${cm.length ? `<div class="small">${cm.map((c) => esc(ccLabel(c.committee))).join(' · ')}</div>` : ''}</li>`;
              }).join('')}</ul>` : ''}
              ${e && e.delegate ? `<p class="small">${electLine(e.delegate)}</p>` : ''}
              <p><a href="#/area/${a.n}">Open the area page →</a></p>`,
          });
        }),
        detail: () => `<p>${plural(areas.length, 'area')}. The region’s areas nominate candidates for regional trustee, and when the seat rotates a nominating session at the Conference selects the nominee by Third Legacy Procedure (${MANUAL}, p. 55)${rt ? `. Regional trustee in ${year}: ${UI.personLink(rt.name)}` : '.'}</p>
          <h4>Delegates at the ${ord} Conference</h4><ul class="sx-ml">${areas.map((a) => dels.filter((d) => d.area === a.n).map((d) => `<li${a.n === mine ? ' class="sx-mine"' : ''}>${UI.areaLink(a.n, { noname: true })} ${UI.personLink(d.name)} <span class="small muted">P${esc(d.panel)}</span></li>`).join('')).join('')}</ul>
          <p><a href="#/delegates/${year}/${r.id}">Delegates of this region →</a></p>`,
      });
    });
    const known = showEl ? FCR.elects.list.filter((e) => e.delegate && !FCR.term(e.area, EP)).length : 0;
    const delegates = N({
      id: 'delegates', title: 'Area delegates', sub: `${dels.length} · Panels ${D.P2} and ${D.P1}`, kind: 'base', learn: 'delegate', stack: true, children: regions,
      detail: () => `${blurb('delegate', 2)}<p>${dels.length} delegates at the ${ord} Conference: Panel ${D.P2} in their second year, Panel ${D.P1} in their first. Each area elects a delegate every two years (odd and even panels alternate).</p>
        ${known ? `<p class="small">Panel ${esc(EP)} ${stage === 'elect' ? 'delegate-elects' : 'delegates (not yet in a Final Report)'} known so far: ${known}.</p>` : ''}
        <p><a href="#/delegates/${year}">All delegates →</a></p>`,
    });

    // Conference committees
    const ccNodes = D.ccs.map((c) => {
      const id = c.committee, ch = chairOfCC(c), pr = ccPair(id);
      return N({
        id: 'cc-' + id, title: ccLabel(id), sub: `${ch ? 'Chair ' + ch.name + ' · ' : ''}${plural(nMem(c), 'member')}${c.secondary ? ' · secondary' : ''}`, kind: 'conf', learn: 'cc_' + id.toLowerCase(), cc: id,
        pairs: pr ? [pr.kind === 'board' ? 'gv' : 'tc-' + pr.key] : [],
        detail: () => `<p class="small muted">${esc(c.printed_name || FCR.COMMITTEES[id].name)}${c.secondary ? ' · secondary committee' : ''} · ${plural(nMem(c), 'member')}</p>
          ${ccMembers(D, c)}<p class="small">${secLine(c)}</p>
          <p class="small"><strong>Trustees’ counterpart:</strong> ${pr ? `<button type="button" class="linkish" data-sel="${pr.kind === 'board' ? 'gv' : 'tc-' + pr.key}">${esc(pr.kind === 'board' ? 'AA Grapevine board' : tcFull(pr.key))}</button>` : `none (${MANUAL}, p. 47)`}</p>
          <p class="small"><a href="#/structure/${year}/pair/${id}" data-pj="${esc(pairId(id))}">Side by side →</a> · <a href="#/committees/${year}/${id}">Committees page →</a> ${learnLink('cc_' + id.toLowerCase(), 'Learn')}</p>`,
      });
    });
    const nPrim = D.ccs.filter((c) => !c.secondary).length;
    const ccsNode = N({
      id: 'ccs', title: 'Conference committees', sub: `${nPrim} primary + ${D.ccs.length - nPrim} secondary`, kind: 'conf', learn: 'conf_committees', stack: true, open: true, children: ccNodes,
      detail: () => `${blurb('conf_committees', 2)}<table class="sx-mini"><tbody>${D.ccs.map((c) => { const ch = chairOfCC(c); return `<tr><th scope="row"><button type="button" class="linkish" data-sel="cc-${esc(c.committee)}">${esc(ccLabel(c.committee))}</button></th><td>${ch ? UI.personLink(ch.name) : '—'}</td></tr>`; }).join('')}</tbody></table>
        <p class="small"><a href="#/committees/${year}">Committees page →</a></p>`,
    });

    // trustees' committees
    const tcNodes = D.tcs.map(({ key, c }) => {
      const ch = chairOfTC(c), meta = TCS[key] || {}, ccIds = (meta.cc || []).filter((x) => ccOf(D, x));
      return N({
        id: 'tc-' + key, title: tcLabel(key) || c.committee, sub: meta.session ? sessionSub(c) : `${ch ? 'Chair ' + ch.name + thru(ch.note) + ' · ' : ''}${memText(c)}`, kind: 'board', learn: key === 'NOMINATING' ? 'gsb_nominating' : 'trustees_committees',
        pairs: ccIds.map((x) => 'cc-' + x),
        detail: () => `<p class="small muted">${esc(tcFull(key, c.committee))}${meta.auxiliary ? ' · auxiliary' : ''} · ${meta.session ? SESSION : memText(c)}</p>
          ${tcMembers(D, c)}<p class="small">${secLine(c)}</p>
          <p class="small"><strong>Conference counterpart:</strong> ${ccIds.length ? listAnd(ccIds.map((x) => `<button type="button" class="linkish" data-sel="cc-${x}">${esc(ccLabel(x))}</button>`)) : `none (${MANUAL}, ${meta.ref || 'Appendix C, p. 109'})`}</p>
          <p class="small"><a href="#/structure/${year}/pair/${esc(key)}" data-pj="${esc(key)}">Side by side →</a> · <a href="#/board/${year}">Trustees &amp; Boards →</a></p>`,
      });
    });
    const tcsNode = N({
      id: 'tcs', title: 'Trustees’ committees', sub: `${D.tcs.length} in the ${year} roster`, kind: 'board', learn: 'trustees_committees', stack: true, open: true, children: tcNodes,
      detail: () => `${blurb('trustees_committees', 3)}<table class="sx-mini"><tbody>${D.tcs.map(({ key, c }) => { const ch = chairOfTC(c); return `<tr><th scope="row"><button type="button" class="linkish" data-sel="tc-${esc(key)}">${esc(tcLabel(key) || c.committee)}</button></th><td>${ch ? UI.personLink(ch.name) + esc(thru(ch.note)) : '—'}</td></tr>`; }).join('')}</tbody></table>
        <p class="small"><a href="#/board/${year}">Who sits on which committee →</a></p>`,
    });

    // the board now: the trustee slate elected at the annual meeting right after this Conference, while it is current
    const co = FCR.currentOfficers ? FCR.currentOfficers() : null;
    const now = co && co.source === 'slate' && co.conferenceYear === year && FCR.cycle().lastConference <= year && co.trustees && (co.trustees.A || []).length ? co.trustees : null;   // until the next Conference meets
    const nowNames = now ? now.A.concat(now.B || []) : [];
    const nowWhen = now ? UI.fmtDate(co.asOf, 'short') : '';
    const nowNote = now ? `<p><strong>Now: ${nowNames.length} trustees (${now.A.length} Class A + ${(now.B || []).length} Class B)</strong>, elected at the annual meeting on ${esc(nowWhen)}.${(() => {
      const joined = nowNames.filter((n) => !D.trustees.some((t) => same(t.name, n))), off = D.trustees.filter((t) => !nowNames.some((n) => same(n, t.name)));
      const stop = (n) => (/\.$/.test(n) ? '' : '.');   // 'Jeff S.' already ends the sentence
      return (joined.length ? ` Joined then: ${listAnd(joined.map((n) => UI.personLink(n)))}${stop(joined[joined.length - 1])}` : '') + (off.length ? ` Rotated off: ${listAnd(off.map((t) => UI.personLink(t.name)))}${stop(off[off.length - 1].name)}` : '');
    })()}</p>` : '';

    // ---- trustees, seat by seat ----
    // 21 seats: 8 regional (one per region), 2 at-large (U.S., Canada), 4 general service (2 AAWS, 2 AA Grapevine) and
    // 7 Class A; a Class B chair adds an extra Class B seat for the chair term (Service Manual p. 58), a Class A chair
    // holds one of the 7 Class A seats. The chart shows the seats as they stand now (FCR.positionHistory, isCurrent) for
    // the latest report until the next Conference meets, otherwise the trustees printed at that Conference. An empty seat
    // is a dashed 'Vacant seat' box; a seat whose term ends at the next Conference is marked.
    const ph = FCR.positionHistory();
    const nextConf = FCR.cycle().nextConference;
    const slotFor = (name, pid) => ph.find((s) => s.pid === pid && s.aliases.some((a) => same(a, name)) && (s.years.includes(year) || s.electedAfter === year)) || ph.find((s) => s.pid === pid && s.aliases.some((a) => same(a, name))) || null;
    const holdersNow = () => ph.filter((s) => s.isCurrent && s.seat !== 'director').map((s) => ({ name: s.name, pid: s.pid, cls: s.class || (s.pid === 'CLASS_A' ? 'A' : 'B'), start: s.start, end: s.fullEnd || s.end, firstEnd: s.firstTermEnd, left: s.leftEarly ? s.servedThru || s.leftYear : null, board: s.board, city: s.city, roles: [] }));
    const holdersAt = () => D.trustees.map((t) => { const s = slotFor(t.name, t.position_id); return { name: t.name, pid: t.position_id || 'OTHER', cls: t.class, start: s ? s.start : t.elected_year, end: s ? s.fullEnd || s.end : null, firstEnd: s ? s.firstTermEnd : null, left: s && s.leftEarly ? s.servedThru || s.leftYear : null, board: s ? (s.boardByYear[year] || s.board) : null, city: t.city, roles: t.board_roles || [] }; });
    const SEAT_GROUPS = [
      { k: 'reg', title: 'Regional trustees', learn: 'regional_trustees', pids: Object.values(FCR.REGION_SEAT) },
      { k: 'tal', title: 'Trustees-at-large', learn: 'trustees_at_large', pids: ['TAL_US', 'TAL_CANADA'] },
      { k: 'gst', title: 'General service trustees', learn: 'general_service_trustees', n: 4 },
      { k: 'a', title: 'Class A trustees', learn: 'class_a', n: 7 },
    ];
    /** Seats of one roster: {chair: {holder, extra, interim}|null, groups: [{k, title, learn, seats: [{h}|{vacant, label}], filled, total}], filled, total}. */
    function seatModel(hs, chairNm, chairInt) {
      const isChairH = (h) => !!chairNm && same(h.name, chairNm);
      const extra = (h) => h.pid === 'GSB_CHAIR' || (!chairInt && isChairH(h) && h.cls !== 'A' && !/^(REG_|TAL_|GST$)/.test(h.pid));
      const chairH = hs.find((h) => isChairH(h)) || hs.find((h) => h.pid === 'GSB_CHAIR') || null;
      const rest = hs.filter((h) => !extra(h));
      const groups = SEAT_GROUPS.map((g) => {
        let seats;
        if (g.pids) seats = g.pids.map((pid) => { const h = rest.find((x) => x.pid === pid); return h ? { h } : { vacant: true, label: FCR.POSITIONS[pid] }; });
        else {
          const hs2 = rest.filter((h) => (g.k === 'a' ? h.cls === 'A' : h.pid === 'GST'));
          seats = hs2.map((h) => ({ h }));
          // general service seats: 2 AAWS + 2 AA Grapevine, named when every holder's board is known
          const miss = [];
          if (g.k === 'gst' && hs2.every((h) => h.board)) ['AAWS', 'Grapevine'].forEach((b) => { for (let j = hs2.filter((h) => h.board === b).length; j < 2; j++) miss.push(b); });
          for (let i = hs2.length; i < g.n; i++) seats.push({ vacant: true, label: g.k === 'a' ? 'Class A trustee' : FCR.positionLabel({ pid: 'GST', board: miss[i - hs2.length] || null }) });
        }
        return Object.assign({}, g, { seats, filled: seats.filter((s) => s.h).length, total: seats.length });
      });
      const ex = chairH && extra(chairH) ? 1 : 0;
      return { chair: chairH ? { h: chairH, extra: !!ex, interim: !!chairInt } : null, groups, filled: groups.reduce((s, g) => s + g.filled, 0) + ex, total: 21 + ex };
    }
    const atConf = seatModel(holdersAt(), D.chairName, D.chairInterim);
    const nowSeats = !!now && year === FCR.latestYear;   // positionHistory follows the latest report, so only its chart
    const M = nowSeats ? seatModel(holdersNow(), (co.byTitle || {})['Interim Chair'] || (co.byTitle || {}).Chair || null, !!(co.byTitle || {})['Interim Chair']) : atConf;
    const opensNext = nowSeats ? ((FCR.openings(nextConf, nextConf)[0] || {}).seats || []).filter((s) => !s.soft && s.holder) : [];
    const opening = (h) => opensNext.find((s) => s.pid === h.pid && same(s.name, h.name)) || null;
    const where = (h) => (/^REG_/.test(h.pid) ? FCR.regionName(Object.keys(FCR.REGION_SEAT).find((r) => FCR.REGION_SEAT[r] === h.pid)) : h.pid === 'TAL_US' ? 'U.S.' : h.pid === 'TAL_CANADA' ? 'Canada' : h.pid === 'GST' ? (h.board === 'Grapevine' ? 'AA Grapevine' : h.board || 'general service') : h.cls === 'A' ? 'Class A' : '');
    const termText = (h) => (!h.end ? '' : (h.end <= year && !nowSeats ? `rotated at the ${year} Conference` : h.firstEnd && h.firstEnd < h.end && h.firstEnd >= (nowSeats ? nextConf : year) ? `first term to ${h.firstEnd}` : `term to ${h.end}`) + (h.left ? ` · left ${h.left}` : ''));
    const isChairM = (h) => M.chair && same(M.chair.h.name, h.name);
    const seatNode = (h, k, i) => {
      const op = opening(h);
      return N({
        id: `seat-${k}-${i}`, person: h.name, pid: h.pid, title: h.name + (isChairM(h) && k !== 'chair' ? (M.chair.interim ? ' (interim chair)' : ' (chair)') : ''), kind: 'board', cls: op ? 'opening' : '',
        sub: [k === 'chair' ? 'extra Class B seat' : where(h), op ? `seat opens at the ${nextConf} Conference` : termText(h)].filter(Boolean).join(' · '),
        detail: () => `<p>${UI.personLink(h.name)} · ${esc(k === 'chair' ? 'General Service Board chair (Class B, extra seat)' : FCR.positionLabel({ pid: h.pid, board: h.board }))}${h.city ? ' · ' + esc(h.city) : ''}</p>
          <p class="small">${[h.start ? `On the board since ${h.start}` : '', termText(h)].filter(Boolean).join(' · ')}</p>
          ${op ? `<p class="small"><strong>This seat opens at the ${nextConf} Conference.</strong> ${op.deadline && op.deadline.date ? `${op.deadline.passed ? 'Résumés were due' : 'Résumés due'} ${esc(UI.fmtDate(op.deadline.date, 'short'))}. ` : ''}${op.nominatedBy ? esc(op.nominatedBy) : ''}</p>` : ''}
          ${(h.roles || []).length ? `<p class="small">${h.roles.map(esc).join(' · ')}</p>` : ''}
          ${alsoOn[h.name] ? `<p class="small">Also sits on the ${esc(alsoOn[h.name])} board (the dashed line on the chart).</p>` : ''}
          <p class="small"><a href="#/person/${encodeURIComponent(h.name)}">Person page →</a> · <a href="#/timeline">Openings →</a></p>`,
      });
    };
    const vacantNode = (s, k, i) => N({
      id: `seat-${k}-${i}`, title: 'Vacant seat', sub: s.label, kind: 'board', cls: 'vacant',
      detail: () => `<p><strong>${esc(s.label)}: no one ${nowSeats ? 'holds this seat now' : `held this seat at the ${ord} Conference`}.</strong></p><p class="small">Vacant seats are usually filled at the board’s next annual meeting; see <a href="#/timeline">Openings</a> for how each kind of seat is filled.</p>`,
    });
    const groupSub = (g) => {
      const opens = g.seats.filter((s) => s.h && opening(s.h)).length, vac = g.total - g.filled;
      return [`${g.filled} of ${g.total} seats filled`, vac ? `${vac} vacant` : '', opens ? `${opens} open${opens === 1 ? 's' : ''} in ${nextConf}` : ''].filter(Boolean).join(' · ');
    };
    const tGroups = [];
    if (M.chair) {
      const c = M.chair, ch = c.h;
      tGroups.push(N({
        id: 'tg-chair', title: c.interim ? 'Board chair (interim)' : 'Board chair', kind: 'board', learn: 'gsb_chair', stack: true, open: c.extra,
        sub: c.extra ? `${ch.name} · 1 extra Class B seat` : c.interim ? `${ch.name} · holds their own ${where(ch) || ''} seat` : `${ch.name} · holds a Class A seat`,
        children: c.extra ? [seatNode(ch, 'chair', 0)] : [],
        detail: () => `<p>${UI.personLink(ch.name)}${c.interim ? ' (interim; the chair’s office was vacant).' : /\.$/.test(ch.name) ? '' : '.'}</p><p class="small">The chair serves a four-year chair term. ${c.extra ? 'As a Class B (A.A. member) chair they sit in an extra seat, so the board has 22 trustees for the chair term' : c.interim ? 'An interim chair keeps the seat they were elected to, so they are also listed under that seat' : 'A Class A chair holds one of the seven Class A seats, so the board stays at 21'} (${MANUAL}, p. 58).</p>`,
      }));
    }
    M.groups.forEach((g) => tGroups.push(N({
      id: 'tg-' + g.k, title: g.title, sub: groupSub(g), kind: 'board', learn: g.learn, stack: true, open: true, cls: g.filled < g.total ? 'has-vacant' : '',
      children: g.seats.map((s, i) => (s.h ? seatNode(s.h, g.k, i) : vacantNode(s, g.k, i))),
      detail: () => `<p>${esc(groupSub(g))}.</p><ul class="sx-ml">${g.seats.map((s) => (s.h ? `<li>${UI.personLink(s.h.name)} <span class="small muted">${esc([where(s.h), opening(s.h) ? `opens ${nextConf}` : termText(s.h)].filter(Boolean).join(' · '))}</span></li>` : `<li class="muted"><em>Vacant</em> <span class="small">${esc(s.label)}</span></li>`)).join('')}</ul>`,
    })));
    // trustees emeriti: former trustees (usually past chairs) the board invites to its meetings and the Conference, without a
    // vote and without a seat, so nothing "opens". In 2023 the trustees' Nominating Committee recommended no new appointments
    // (FR23 PDF p. 95); work on guidelines for trustees emeriti continued through 2025-26 (FR26 PDF p. 109).
    const EM = BOARD.trustees_emeriti || {};
    const emNames = (Y.trustees || []).filter((t) => t.emeritus).map((t) => t.name);
    (((EM.attending || []).find((a) => a.year === year) || {}).names || []).forEach((n) => { if (!emNames.some((x) => same(x, n))) emNames.push(n); });
    if (emNames.length) {
      const stopNote = (EM.notes || []).find((n) => /cease appointing/i.test(n.text || ''));
      const titleOf = (n) => ((EM.notes || []).some((m) => /emerita/i.test(m.text || '') && String(m.text || '').indexOf(n) >= 0) ? 'trustee emerita' : 'trustee emeritus');   // as the reports call them
      tGroups.push(N({
        id: 'tg-em', title: 'Trustees emeriti', kind: 'board', learn: 'trustees_emeriti', stack: true, open: true, cls: 'emeritus',
        sub: `${emNames.length} at the ${ord} Conference · no vote · not a seat`,
        children: emNames.map((n, i) => N({ id: 'em-' + i, title: n, sub: `${titleOf(n)} · no vote`, kind: 'board', cls: 'emeritus',
          detail: () => `<p>${UI.personLink(n)}, ${titleOf(n)}.</p><p class="small">Trustees emeriti are former trustees, usually past board chairs, invited to the quarterly board meetings and the Conference as a resource of corporate memory; they do not vote (${MANUAL}, p. 58). The title is not a seat, so it has no term to end.</p>${(() => { const x = (EM.notes || []).find((m) => m.year === year && String(m.text || '').indexOf(n) === 0); return x ? `<p class="small">${esc(x.text)} (${esc(frRef(x.ref))})</p>` : ''; })()}` })),
        detail: () => `<p>${listAnd(emNames.map((n) => UI.personLink(n)))} attended the ${ord} Conference as ${emNames.length === 1 ? 'a ' + titleOf(emNames[0]) : 'trustees emeriti'}.</p><p class="small">Former trustees, usually past board chairs, invited to board meetings and the Conference; no vote and no seat (${MANUAL}, p. 58).${stopNote && stopNote.year <= year ? ` In ${stopNote.year} the trustees’ Nominating Committee recommended that the board stop naming new trustees emeriti, with those already named keeping the title (${esc(frRef(stopNote.ref))}); the board had not settled it, and a subcommittee was still working on guidelines for trustees emeriti in 2025–26 (2026 Final Report, PDF p. 109).` : ''}</p>${(EM.all || []).length ? `<p class="small">Trustees emeriti named in the 2017–2026 reports: ${listAnd(EM.all.map((n) => UI.personLink(n)))}${stopAfter(EM.all[EM.all.length - 1])}</p>` : ''}`,
      }));
    }
    const vacM = M.total - M.filled, vacAt = atConf.total - atConf.filled;
    const opensAll = M.groups.reduce((n, g) => n + g.seats.filter((s) => s.h && opening(s.h)).length, 0) + (M.chair && M.chair.extra && opening(M.chair.h) ? 1 : 0);
    const KIND = { reg: 'regional', tal: 'at-large', gst: 'general service', a: 'Class A' };
    const vacText = (m) => m.groups.filter((g) => g.filled < g.total).map((g) => `${g.total - g.filled} ${KIND[g.k]}`).join(', ');
    const trusteesNode = N({
      id: 'trustees', title: nowSeats ? 'Trustees now' : 'Trustees', kind: 'board', stack: true, open: true, children: tGroups, cls: vacM ? 'has-vacant' : '',
      sub: [`${M.filled} of ${M.total} seats filled`, vacM ? `${vacM} vacant` : '', opensAll ? `${opensAll} open${opensAll === 1 ? 's' : ''} in ${nextConf}` : ''].filter(Boolean).join(' · '),
      detail: () => `${nowNote}<p>The board has ${M.total} seats: 8 regional, 2 at-large and 4 general service (Class B), and 7 Class A${M.chair && M.chair.extra ? ', plus an extra Class B seat for the chair' : ''}. ${nowSeats ? `${M.filled} of them are filled now.` : `${M.filled} were filled at the ${ord} Conference.`}${vacM ? ` Vacant: ${esc(vacText(M))}.` : ''}</p>
        ${nowSeats ? `<p class="small">At the ${ord} Conference itself ${atConf.filled} of ${atConf.total} seats were filled${vacAt ? ` (vacant: ${esc(vacText(atConf))})` : ''}; the trustees’ committees on this chart are as printed then.</p>` : ''}
        ${!nowSeats && D.left.length ? `<p class="small">Left before the Conference: ${listAnd(D.left.map((t) => `${UI.personLink(t.name)} (${esc(t.served_thru)})`))}.</p>` : ''}
        ${opensAll ? `<p class="small">${opensAll} seat${opensAll === 1 ? '' : 's'} open at the ${nextConf} Conference (marked on the chart); see <a href="#/timeline">Openings</a> for résumé deadlines.</p>` : ''}
        <ul class="sx-ml">${tGroups.map((g) => `<li><button type="button" class="linkish" data-sel="${g.id}">${esc(g.title)}</button> <span class="small muted">${esc(g.sub)}</span></li>`).join('')}</ul>
        <p class="small">${learnLink('class_a', 'Class A in Learn')} · ${learnLink('class_b', 'Class B in Learn')}</p>`,
    });

    // operating corporations and offices
    const aawsChair = D.corpChair(Y.aaws_directors), gvChair = D.corpChair(Y.grapevine_directors);
    const staff = Y.gso_staff || [], gvStaff = Y.grapevine_staff || [];
    const nameOf = (x) => (x && typeof x === 'object' ? x.name : x) || null;
    const gm = nameOf(Y.general_manager), sd = nameOf(Y.staff_director);
    // titles from board.json: an interim general manager (Stephanie L., 2021), the Staff Services director's printed title
    const gmInterim = !!gm && (BOARD.general_managers || []).some((g) => g.interim && same(g.name, gm));
    const sdTitle = ((BOARD.staff_services_directors || []).find((d) => sd && same(d.name, sd) && (d.years || []).includes(year)) || {}).title || 'director of Staff Services';
    const gso = N({
      id: 'gso', title: 'General Service Office', sub: `${gm ? (gmInterim ? 'interim GM ' : 'GM ') + gm + ' · ' : ''}${plural(staff.length, 'staff member')} · paid`, kind: 'corp', learn: 'gso', cls: 'paid',
      detail: () => `${blurb('gso', 2)}${gm ? `<p>${gmInterim ? 'Interim general manager' : 'General manager'}: ${UI.personLink(gm)}${sd ? ` · ${esc(sdTitle)}: ${UI.personLink(sd)}` : ''}</p>` : ''}
        <h4>GSO Staff (${staff.length})</h4><ul class="sx-ml">${staff.map((s) => `<li>${UI.personLink(s.name)}${(s.assignments || []).length ? ` <span class="small muted">${s.assignments.map(esc).join(' · ')}</span>` : s.title ? ` <span class="small muted">${esc(s.title)}</span>` : ''}</li>`).join('')}</ul>
        <p class="small">Everyone in the office is a paid employee of AAWS or AA Grapevine — about 100 people (88 AAWS, 12 Grapevine), many of them not A.A. members (${MANUAL}, p. 87). The general manager and staff have no term limit; GSO Staff members rotate desks about every two years. Of all these employees, about 15 A.A.-member staff (the GSO Staff and Grapevine/La Viña staff) are voting Conference members (p. 41).</p>
        <p class="small"><a href="#/staff">GSO Staff page →</a></p>`,
    });
    // ---- the two corporate boards, member by member ----
    // Each member is a trustee (regional trustees in their 2nd-3rd year, the general service trustees, sometimes a Class A
    // trustee: linked by a dashed line to their trustee seat), a nontrustee director (up to four one-year terms, Service
    // Manual p. 68; the pool general service trustees come from, p. 56) or a paid employee who sits on the board (the
    // general manager, a GSO staff member, the Grapevine publisher: the "special workers" of p. 63 — trustees, directors and
    // appointed committee members are volunteers). The board now (slate elected at the annual meeting) for the latest
    // report until the next Conference meets, otherwise the board printed in that year's report.
    const seatIdOf = {};
    (function walk(ns) { ns.forEach((n) => { if (n.person) seatIdOf[n.person] = n.id; walk(n.children); }); })(tGroups);
    const seatOf = (name) => { const k = Object.keys(seatIdOf).find((x) => same(x, name)); return k ? seatIdOf[k] : null; };
    const alsoOn = {};
    const boardOpenings = nowSeats ? FCR.openings(nextConf, nextConf + 3) : [];
    function corpBoard(which) {
      const isA = which === 'aaws', label = isA ? 'AAWS' : 'AA Grapevine', dirPid = isA ? 'DIR_AAWS' : 'DIR_GRAPEVINE';
      const printed = (isA ? Y.aaws_directors : Y.grapevine_directors) || [];
      const list = nowSeats && co && (co[which] || []).length ? co[which] : printed;
      const chairName = nowSeats && co && co.boardChairs ? (co.boardChairs[which] || {}).name || null : ((printed.find((d) => /chair/i.test(d.role || '')) || {}).name || null);
      const roleOf = (n) => String((printed.find((d) => same(d.name, n)) || {}).role || '').replace(/^chair,\s*/i, '');
      const dirOpen = boardOpenings.map((o) => ({ year: o.year, seats: o.seats.filter((x) => x.pid === dirPid) })).filter((o) => o.seats.length);
      const members = list.map((d, i) => {
        const role = roleOf(d.name), sid = seatOf(d.name);
        const former = /\bformer\b|not attending/i.test(role);   // 2021: a former GM and a former publisher, printed '[not attending]'
        const emp = !former && (!!d.employee || /general manager|publisher|staff member|editor/i.test(role) || (!!gm && same(d.name, gm)) || staff.some((x) => same(x.name, d.name)));
        const slot = !sid && !emp && !former ? ph.find((s) => s.pid === dirPid && s.aliases.some((a) => same(a, d.name)) && (nowSeats ? s.isCurrent : s.years.includes(year))) || null : null;
        const isChair = !!chairName && same(chairName, d.name);
        const gone = !sid && !emp && !former ? D.left.find((t) => same(t.name, d.name)) : null;   // a trustee who left before the Conference (2023)
        const kind = former ? 'former' : emp ? 'employee' : sid || gone ? 'trustee' : 'director';
        const isGM = !!gm && same(d.name, gm), isPub = /publisher/i.test(role);
        const empRole = isGM ? 'GSO general manager' : staff.some((x) => same(x.name, d.name)) ? 'GSO staff member' : role || 'employee';
        const seatNodeOf = sid ? (function find(ns) { for (const n of ns) { if (n.id === sid) return n; const f = find(n.children); if (f) return f; } return null; })(tGroups) : null;
        const trusteeRole = seatNodeOf ? (seatNodeOf.pid === 'GSB_CHAIR' ? 'GSB chair' : FCR.positionLabel({ pid: seatNodeOf.pid, board: null })) : gone ? `${FCR.POSITIONS[gone.position_id] || 'trustee'} · left ${gone.served_thru}` : role;
        // what actually happened to the director's seat: slot.end is the year it really ended (moved up, left or rotated)
        const end = slot ? slot.end : null;
        const opensAt = slot && nowSeats ? (dirOpen.find((o) => o.seats.some((x) => !x.soft && same(x.name, d.name))) || {}).year || null : null;
        if (sid) alsoOn[seatNodeOf.person] = label;
        const movedUp = slot && slot.movedUpYear && end === slot.movedUpYear ? end : null;
        const leftEarly = slot && slot.leftEarly && !movedUp ? slot.servedThru || slot.leftYear || end : null;
        const dirTerm = movedUp ? `moved up to general service trustee in ${movedUp}` : leftEarly ? `left ${leftEarly}` : opensAt ? `seat opens at the ${opensAt} Conference` : end ? (!nowSeats && end <= year ? `rotated at the ${end} Conference` : `term to ${end}`) : '';
        const sub = [isChair ? 'chair' : '', kind === 'former' ? `former employee · not attending` : kind === 'employee' ? `paid employee · ${empRole}` : kind === 'trustee' ? trusteeRole : ['nontrustee director', dirTerm].filter(Boolean).join(' · ')].filter(Boolean).join(' · ');
        // directors are elected for one-year terms; a director who is not a trustee may serve four in a row, except the AAWS
        // president (the general manager) and the Grapevine publisher (AAWS bylaws, Manual p. 146; Grapevine bylaws, p. 155)
        const empTerm = isGM ? 'Elected to the board each year like every director; as president of AAWS the general manager is not limited to four consecutive terms (AAWS bylaws, ' + MANUAL + ', p. 146).'
          : isPub ? 'Elected to the board each year like every director; the publisher is not limited to four consecutive terms (AA Grapevine bylaws, ' + MANUAL + ', p. 155).'
          : `Elected to the board each year like every director, for up to four consecutive one-year terms (${isA ? 'AAWS bylaws, ' + MANUAL + ', p. 146' : 'AA Grapevine bylaws, ' + MANUAL + ', p. 155'}).`;
        const n = N({
          id: `${which}-m${i}`, title: d.name, sub, kind: 'corp', cls: kind === 'employee' ? 'paid' : sid ? 'linked' : opensAt === nextConf ? 'opening' : '',
          pairs: sid ? [sid] : [],
          detail: () => `<p>${UI.personLink(d.name)}${isChair ? ` · chair of the ${esc(label)} board` : ''}</p>
            ${kind === 'former' ? `<p class="small">Printed on the ${esc(label)} board list as ${esc(role)}: a former employee who no longer held the job and did not attend the Conference.</p>`
            : kind === 'employee' ? `<p class="small"><strong>Paid employee</strong> (${esc(empRole)}) who also sits on the ${esc(label)} board. Trustees, directors and appointed committee members serve without pay (travel and lodging are covered); the exception is these “special workers”, paid employees of AAWS and AA Grapevine who serve on the corporate boards (${MANUAL}, p. 63). ${esc(empTerm)}</p>`
            : kind === 'trustee' && sid ? `<p class="small">A trustee (${esc(trusteeRole)}) who also serves on the ${esc(label)} board; the board seat goes with the trustee seat (regional trustees usually serve on a corporate board in years 2–3; general service trustees always do). <button type="button" class="linkish" data-sel="${sid}">Show the trustee seat</button></p>`
            : kind === 'trustee' ? `<p class="small">A trustee (${esc(trusteeRole)}) still printed on the ${esc(label)} board list, who left before the ${ord} Conference.</p>`
            : `<p class="small">${esc(label)} nontrustee director: not a trustee, but a voting Conference member. Up to four one-year terms (${MANUAL}, p. 68)${dirTerm ? '; ' + dirTerm : ''}. General service trustees are chosen from current or past nontrustee directors (p. 56).</p>`}`,
        });
        return n;
      });
      const nE = members.filter((m) => m.cls === 'paid').length, nF = members.filter((m) => /former employee/.test(m.sub)).length;
      const nD = members.filter((m) => /^(chair · )?nontrustee director/.test(m.sub)).length, nT = members.length - nE - nD - nF;
      const possible = dirOpen.find((o) => o.year === nextConf && o.seats.some((x) => x.soft));
      return N({
        id: `${which}-board`, title: `${label} board`, kind: 'corp', learn: 'nontrustee_directors', stack: true, open: true, children: members,
        sub: [`${members.length} members: ${nT} trustee${nT === 1 ? '' : 's'}, ${nD} nontrustee director${nD === 1 ? '' : 's'}, ${nE} paid employee${nE === 1 ? '' : 's'}${nF ? `, ${nF} former employee${nF === 1 ? '' : 's'} (not attending)` : ''}`, possible ? `possible director opening in ${nextConf}` : ''].filter(Boolean).join(' · '),
        detail: () => `<p>${nowSeats ? `The ${esc(label)} board elected at the annual meeting on ${esc(nowWhen)}` : `The ${esc(label)} board as printed in the ${year} report`}: ${nT} trustee${nT === 1 ? '' : 's'}, ${nD} nontrustee director${nD === 1 ? '' : 's'} and ${nE} paid employee${nE === 1 ? '' : 's'}${nF ? `, plus ${nF} former employee${nF === 1 ? '' : 's'} printed as not attending` : ''}.${chairName ? ` Chair: ${UI.personLink(chairName)}${stopAfter(chairName)}` : nowSeats ? ' The board chair for this year is not published yet.' : ''}</p>
          ${dirOpen.length ? `<p class="small"><strong>Director seats opening:</strong> ${dirOpen.map((o) => `${o.year}: ${listAnd(o.seats.map((x) => (x.soft ? 'possibly one more, if a director moves up to general service trustee' : esc(x.name) + '’s seat')))}`).join('; ')}. Openings are announced in Box 4-5-9 (${MANUAL}, p. 68).</p>` : ''}
          <p class="small"><a href="#/board/${year}">Trustees &amp; Boards →</a> · <a href="#/timeline">Openings →</a></p>`,
      });
    }
    const aawsBoard = corpBoard('aaws'), gvBoard = corpBoard('grapevine');
    // a trustee's seat box points back at their corporate-board box (dashed line on hover or select)
    [aawsBoard, gvBoard].forEach((b) => b.children.forEach((m) => m.pairs.forEach((sid) => {
      (function find(ns) { for (const n of ns) { if (n.id === sid) { n.pairs.push(m.id); return true; } if (find(n.children)) return true; } return false; })(tGroups);
    })));
    const aaws = N({
      id: 'aaws', title: 'A.A. World Services, Inc.', sub: `board of ${aawsBoard.children.length}${aawsChair && !nowSeats ? ' · chair ' + aawsChair.name : ''}`, kind: 'corp', learn: 'aaws', stack: true, open: true, children: [aawsBoard, gso],
      detail: () => `${blurb('aaws', 2)}<p class="small">AAWS runs the General Service Office and publishes the literature. Its board and the office are shown below it on the chart.</p><p class="small"><a href="#/board/${year}">Trustees &amp; Boards →</a></p>`,
    });
    const gvo = N({
      id: 'gvo', title: 'Grapevine & La Viña office', sub: `${gvStaff.length ? gvStaff.map((s) => s.name).join(', ') + ' · ' : ''}paid staff`, kind: 'corp', learn: 'gv_staff', cls: 'paid',
      detail: () => `${blurb('gv_staff', 2)}<ul class="sx-ml">${gvStaff.map((s) => `<li>${UI.personLink(s.name)} <span class="small muted">${esc(s.title || '')}</span></li>`).join('') || '<li class="muted small">Not printed.</li>'}</ul><p class="small">Paid employees of AA Grapevine, Inc., with no term limit.</p>`,
    });
    const gv = N({
      id: 'gv', title: 'AA Grapevine, Inc.', sub: `board of ${gvBoard.children.length}${gvChair && !nowSeats ? ' · chair ' + gvChair.name : ''}`, kind: 'corp', learn: 'grapevine_inc', stack: true, open: true, children: [gvBoard, gvo],
      pairs: ccOf(D, 'GRAPEVINE') ? ['cc-GRAPEVINE'] : [],
      detail: () => `${blurb('grapevine_inc', 2)}<p class="small">The Conference Committee on <button type="button" class="linkish" data-sel="cc-GRAPEVINE">Grapevine and La Viña</button> meets jointly with members of this board instead of a trustees’ committee (${MANUAL}, p. 46).</p>`,
    });
    const corps = N({
      id: 'corps', title: 'Operating corporations', sub: 'AAWS and AA Grapevine', kind: 'corp', learn: 'operating_corps', stack: true, open: true, children: [aaws, gv],
      detail: () => `${blurb('operating_corps', 3)}<p class="small"><a href="#/board/${year}">Trustees &amp; Boards →</a></p>`,
    });
    const offs = Y.gsb_officers || [];
    const leftOf = (n) => D.left.find((t) => same(t.name, n));
    // officers who are GSO employees (assistant treasurer, assistant secretary): board.json slates flag them
    const slateEmployee = (n) => (BOARD.slates || []).some((sl) => (sl.gsb_officers || []).some((o) => o.employee && same(o.name, n)));
    const gsb = N({
      id: 'gsb', title: 'General Service Board', sub: `${now ? `${nowNames.length} trustees now (${D.trustees.length} at the Conference)` : `${D.trustees.length} trustees`}${D.chairName ? ` · ${D.chairInterim ? 'interim chair' : 'chair'} ${D.chairName}` : ''}`, kind: 'board', learn: 'gsb', open: true, children: [tcsNode, trusteesNode, corps],
      detail: () => `${blurb('gsb', 2)}${nowNote}<h4>Officers printed in the ${year} report</h4><ul class="sx-ml">${offs.map((o) => `<li><span class="small muted">${esc(o.title)}</span> ${UI.personLink(o.name)}${o.employee || /employee|staff coordinator|chief financial/i.test(o.note || '') || slateEmployee(o.name) ? ' <span class="small sx-paid-t">paid employee</span>' : ''}${leftOf(o.name) ? ` <span class="small muted">(left ${esc(leftOf(o.name).served_thru)})</span>` : ''}</li>`).join('') || '<li class="muted small">Not printed.</li>'}</ul>
        <p class="small"><a href="#/board/${year}">Trustees &amp; Boards →</a></p>`,
    });

    // Conference membership: the report's own count, with the breakdown from the printed rosters
    const conf = FCR.conference ? FCR.conference(year) : {};
    const printed = conf && conf.members && conf.members.total ? conf.members : null;
    const inStaff = (n) => staff.concat(gvStaff).some((s) => same(s.name, n)) || D.dirs.some((d) => same(d.name, n)) || D.trustees.some((t) => same(t.name, n));
    // employees who sit on a corporate board (GM, publisher) but are not in the staff lists; not a former one marked 'not attending' (2021)
    const empDirs = (Y.aaws_directors || []).concat(Y.grapevine_directors || []).filter((d) => /general manager|publisher/i.test(d.role || '') && !/\bformer\b|not attending/i.test(d.role || '') && !inStaff(d.name));
    const voting = (s) => !/nonvoting/i.test(`${s.title || ''} ${s.role || ''}`);   // 2024 lists two new hires as nonvoting resources
    const rows = [['Area delegates', dels.length], ['Trustees', D.trustees.length], ['Nontrustee directors (AAWS, Grapevine)', D.dirs.length],
      ['GSO and Grapevine staff (paid employees)', staff.filter(voting).length + gvStaff.filter(voting).length]].concat(empDirs.length ? [[`Employee directors (${empDirs.map((d) => d.role).join(', ')})`, empDirs.length]] : []);
    const sum = rows.reduce((s, r) => s + r[1], 0);
    const gsc = N({
      id: 'gsc', title: 'General Service Conference', sub: `${ord} GSC · ${year} · ${printed ? printed.total : sum} members`, kind: 'conf', learn: 'conference', open: true, children: [delegates, ccsNode, gsb],
      detail: () => `${blurb('conference', 2)}<p>${Y.theme ? `Theme: “${esc(Y.theme)}”. ` : ''}${Y.dates ? esc(Y.dates) : ''}${Y.location ? ', ' + esc(Y.location) : ''}.</p>
        ${printed ? `<p>${printed.total} Conference members (${esc(frRef(printed.ref))}).</p>` : ''}
        <table class="sx-mini"><caption class="small muted">Counted from the ${year} report’s rosters</caption><tbody>
          ${rows.map(([l, n]) => `<tr><th scope="row">${esc(l)}</th><td class="num">${n}</td></tr>`).join('')}
          <tr class="sx-tot"><th scope="row">Total</th><td class="num">${sum}</td></tr></tbody></table>
        ${printed && printed.total !== sum ? `<p class="small muted">The rosters give ${sum}; the report counts ${printed.total}.</p>` : ''}
        ${Y.conference_chair ? `<p class="small">Delegate chair: ${UI.personLink(Y.conference_chair.name || Y.conference_chair)}${Y.conference_chair.area ? ' (' + UI.areaLink(Y.conference_chair.area, { noname: true }) + ')' : ''}</p>` : ''}
        <p class="small"><a href="#/reports/${year}">${year} Final Report →</a></p>`,
    });
    const assemblies = N({
      id: 'assemblies', title: 'Area assemblies', sub: `${FCR.areaList.length} areas in ${FCR.REGIONS.length} regions`, kind: 'base', learn: 'area_assembly', open: true, children: [gsc],
      detail: () => `${blurb('area_assembly', 2)}<p class="small">Your area: ${UI.areaLink(mine)}.</p>`,
    });
    const districts = N({ id: 'districts', title: 'Districts', sub: 'GSRs elect a DCM', kind: 'base', learn: 'district', open: true, children: [assemblies], detail: () => `${blurb('district', 2)}${blurb('dcm', 1)}` });
    return N({ id: 'groups', title: 'A.A. groups', sub: 'each elects a GSR', kind: 'base', learn: 'group', open: true, children: [districts], detail: () => `${blurb('group', 2)}${blurb('gsr', 1)}` });
  }

  // ---------- layout (tidy tree, top-down; `stack` lists go in a column under the parent) ----------
  // Phones: every node with several children stacks them (an indented tree), and a single child sits straight below.
  // Desktop tree width ≈ 5 W + 6–8 IND + 4 HG (trustee seats and board members nest two or three levels); where it would
  // not fit at the 80% fit floor the chart switches to the stacked tree. geom() widens W on wide frames (budget: 8 IND).
  const G = { W: 148, IND: 18, VG: 12, HG: 10, LG: 40 };
  function measure(n, g, phone) {
    const kids = n.open ? n.children : [];
    n.isStack = false; n.isChain = false;
    if (!kids.length) { n.bw = g.W; n.bh = n.h; return; }
    kids.forEach((k) => measure(k, g, phone));
    n.isStack = n.stack || (phone && kids.length > 1);
    n.isChain = phone && !n.isStack;
    if (n.isStack) {
      n.bw = Math.max(g.W, g.IND + Math.max(...kids.map((k) => k.bw)));
      n.bh = n.h + kids.reduce((s, k) => s + g.VG + k.bh, 0);
    } else {
      n.cw = kids.reduce((s, k) => s + k.bw, 0) + g.HG * (kids.length - 1);
      n.bw = Math.max(g.W, n.cw);
      n.bh = n.h + g.LG + Math.max(...kids.map((k) => k.bh));
    }
  }
  function place(n, x, y, g) {
    const kids = n.open ? n.children : [];
    n.x = !kids.length || n.isStack || n.isChain ? x : x + (n.bw - g.W) / 2; n.y = y;
    if (!kids.length) return;
    if (n.isStack) { let cy = y + n.h + g.VG; kids.forEach((k) => { place(k, x + g.IND, cy, g); cy += k.bh + g.VG; }); }
    else { let cx = n.isChain ? x : x + (n.bw - n.cw) / 2; kids.forEach((k) => { place(k, cx, y + n.h + g.LG, g); cx += k.bw + g.HG; }); }
  }

  // ---------- page ----------
  // One listener each for the whole app; the live page installs its hooks (cleared when it is no longer on screen).
  const hooks = { resize: null, beforeprint: null, afterprint: null, key: null };
  ['resize', 'beforeprint', 'afterprint'].forEach((ev) => window.addEventListener(ev, () => { if (hooks[ev]) hooks[ev](); }));
  document.addEventListener('keydown', (e) => { if (hooks.key) hooks.key(e); });
  window.addEventListener('hashchange', () => { document.documentElement.style.scrollPaddingBottom = ''; });

  V.structure = function (el, args) {
    const raw = parseInt(args && args[0], 10);
    const year = FCR.Y(raw) ? raw : FCR.latestYear;
    const D = yearData(year);
    // #/structure/<year>/pair/<id>: a Conference committee id, a trustees' committee key or GV_BOARD
    let pa = args && args[1] === 'pair' && args[2] ? String(args[2]) : null;
    if (pa) { try { pa = decodeURIComponent(pa); } catch (e) { /* keep it raw */ } }
    const focusPair = pa && /^[A-Za-z0-9_]+$/.test(pa) ? pa.toUpperCase() : null;
    const root = buildTree(D);
    const byId = {};
    (function walk(n, parent) { byId[n.id] = n; n.parent = parent; n.children.forEach((k) => walk(k, n)); })(root, null);
    const st = { sel: null, hover: null, zoom: null, stack: false, print: false, cc: false, arrow: null, ccHot: null, ccFold: [], ccOpened: [] };   // zoom null = fit to width; stack: see isPhone(); cc: who can correct whom

    // ---- who can correct whom: levels -> their boxes; arrows grouped by (from, to, dir), one line per group ----
    const LV = {};
    (CHECKS.levels || []).forEach((l) => { LV[l.id] = Object.assign({}, l, { nodes: [].concat(l.node || []).filter((id) => byId[id]) }); });
    const lvOrder = (CHECKS.levels || []).map((l) => l.id).filter((id) => LV[id]);
    const ARROWS = (CHECKS.arrows || []).filter((a) => LV[a.from] && LV[a.to]).map((a, i) => Object.assign({ i }, a));
    const CC_GROUPS = [];
    ARROWS.forEach((a) => {
      let G = CC_GROUPS.find((x) => x.from === a.from && x.to === a.to && x.dir === a.dir);
      if (!G) { G = { gi: CC_GROUPS.length, from: a.from, to: a.to, dir: a.dir, items: [] }; CC_GROUPS.push(G); }
      G.items.push(a); a.gi = G.gi;
    });
    const lvIds = new Set([].concat(...Object.values(LV).map((l) => l.nodes)));
    const lvAnc = new Set();   // boxes the levels hang under: they stay unfolded while the arrows are shown
    lvIds.forEach((id) => { for (let p = byId[id].parent; p; p = p.parent) lvAnc.add(p.id); });
    const lvName = (id) => (LV[id] ? LV[id].short || LV[id].label : id);
    const ccDir = (a) => (a.dir === 'down' ? 'dn' : 'up');
    const ccKind = (a) => (a.dir === 'down' ? 'authority to correct' : 'a check kept');
    const ccSrc = (a, full) => (a.page ? (full ? MANUAL + ', ' : '') + pgText(a.page) : a.source || MANUAL);   // a printed page, else the item's source
    const ccBtn = (a) => `<button type="button" class="sx-ccl ${ccDir(a)}" data-cc="${a.i}"><span class="sx-cca" aria-hidden="true">${a.dir === 'down' ? '↓' : '↑'}</span>${esc(a.label)}<span class="sr-only">, ${ccKind(a)}: ${esc(lvName(a.from))} to ${esc(lvName(a.to))}</span></button>`;
    // the vertical list (phones, the stacked tree, print): each arrow in the gap above the lower of its two levels
    const ladder = ARROWS.length ? `<section class="sx-ladder" aria-labelledby="sx-lad-h"><h3 id="sx-lad-h">Who can correct whom</h3>
      <p class="small muted"><span class="sx-key sx-key-dn"></span> authority to correct the level below · <span class="sx-key sx-key-up"></span> a check the level below keeps.<span class="sx-lad-pick"> Pick one for what it means and the ${MANUAL} page.</span></p>
      <ol class="sx-lad">${lvOrder.map((id, i) => {
        const lv = LV[id], n0 = byId[lv.nodes[0]];
        const gap = ARROWS.filter((a) => Math.max(lvOrder.indexOf(a.from), lvOrder.indexOf(a.to)) === i).sort((a, b) => (a.dir === b.dir ? a.i - b.i : a.dir === 'down' ? -1 : 1));
        const boxes = lv.nodes.length > 1 ? `<span class="small"> · ${lv.nodes.map((x) => `<button type="button" class="linkish" data-sel="${esc(x)}">${esc(byId[x].title)}</button>`).join(' · ')}</span>` : '';
        return `${gap.length ? `<li class="sx-lad-gap"><ul>${gap.map((a) => `<li>${ccBtn(a)} <span class="small muted">${esc(lvName(a.from))} → ${esc(lvName(a.to))} · ${esc(ccSrc(a))}</span><span class="sx-lad-x small">${esc(a.text)}</span></li>`).join('')}</ul></li>` : ''}
          <li class="sx-lad-lv k-${n0 ? n0.kind : 'base'}">${n0 && lv.nodes.length === 1 ? `<button type="button" class="linkish" data-sel="${esc(n0.id)}">${esc(lv.label)}</button>` : esc(lv.label)}${boxes}</li>`;
      }).join('')}</ol></section>` : '';

    // ---- pairs table + cards ----
    const pairedTC = D.tcs.filter((x) => (TCS[x.key] || {}).cc && TCS[x.key].cc.some((id) => ccOf(D, id)));
    const loneCC = D.ccs.filter((c) => !ccPair(c.committee));
    const loneTC = D.tcs.filter((x) => !pairedTC.includes(x));
    const gvCC = ccOf(D, 'GRAPEVINE');
    const cnt = (c) => `${nMem(c)}${nCons(c) ? ` <span class="small muted" data-tip="${esc(plural(nCons(c), 'consultant'))} (not members)" tabindex="0">+${nCons(c)} cons.</span>` : ''}`;
    const ccCell = (c) => `<th scope="row"><a href="#/structure/${year}/pair/${esc(c.committee)}" data-pj="${esc(pairId(c.committee))}">${brk(ccLabel(c.committee))}</a>${c.secondary ? ' <span class="badge" data-tip="Secondary committee" tabindex="0">2nd</span>' : ''}</th><td class="sx-ch">${chairOfCC(c) ? UI.personLink(chairOfCC(c).name) : '—'}</td><td class="n sx-n">${cnt(c)}</td>`;
    const tcCell = (key, c, rs) => {
      const r = rs > 1 ? ` rowspan="${rs}"` : '', ch = chairOfTC(c), ses = TCS[key] && TCS[key].session, lead = ses && (c.members || [])[0];
      return `<td${r} class="sx-tc"><a href="#/structure/${year}/pair/${esc(key)}" data-pj="${esc(key)}">${brk((TCS[key] || {}).name || c.committee)}</a></td><td${r} class="sx-ch">${ch ? UI.personLink(ch.name) + esc(thru(ch.note)) : lead ? UI.personLink(lead.name) + ' <span class="small muted">(leads it)</span>' : '—'}</td><td${r} class="n sx-n">${ses ? '<span class="muted" data-tip="A board session, not a committee" tabindex="0">—</span>' : cnt(c)}</td>`;
    };
    const ARROW = '<td class="sx-arr"><span aria-hidden="true">⇄</span><span class="sr-only">pairs with</span></td>';
    const NONE = (text, cols, cls) => `<td colspan="${cols}" class="sx-none${cls ? ' ' + cls : ''}">${text}</td>`;
    const groups = [];
    const group = (title) => { const g = { title, rows: [] }; groups.push(g); return g.rows; };
    let rows = group('Paired with a trustees’ committee');
    pairedTC.forEach(({ key, c }) => {
      const ids = TCS[key].cc.filter((id) => ccOf(D, id));
      ids.forEach((id, i) => rows.push(`<tr>${ccCell(ccOf(D, id))}${ARROW}${i === 0 ? tcCell(key, c, ids.length) : ''}</tr>`));
    });
    if (gvCC) {
      const gc = D.corpChair(D.Y.grapevine_directors);
      group('Paired with a corporate board').push(`<tr>${ccCell(gvCC)}${ARROW}<td class="sx-tc"><a href="#/structure/${year}/pair/GV_BOARD" data-pj="GV_BOARD">AA Grapevine board</a> <span class="small muted">(no trustees’ committee)</span></td><td class="sx-ch">${gc ? UI.personLink(gc.name) : '—'}</td><td class="n sx-n">${(D.Y.grapevine_directors || []).length}</td></tr>`);
    }
    if (loneCC.length) { rows = group('Conference committees with no trustees’ counterpart'); loneCC.forEach((c) => rows.push(`<tr>${ccCell(c)}${NONE(`No corresponding trustees’ committee (${MANUAL}, p. 47)`, 4)}</tr>`)); }
    if (loneTC.length) { rows = group('Trustees’ committees with no Conference counterpart'); loneTC.forEach(({ key, c }) => rows.push(`<tr>${NONE('No Conference committee', 1)}${NONE('', 2, 'sx-ch')}<td class="sx-arr"></td>${tcCell(key, c, 1)}</tr>`)); }
    const pairTable = `<div class="table-wrap sx-pt-wrap"><table class="t sx-pt"><colgroup><col class="sx-c-cc"><col class="sx-c-ch"><col class="sx-c-n"><col class="sx-c-arr"><col class="sx-c-tc"><col class="sx-c-ch"><col class="sx-c-n"></colgroup>
      <thead><tr><th scope="col">Conference committee</th><th scope="col" class="sx-ch">Chair at the ${year} Conference</th><th scope="col" class="n sx-n">Members</th><th scope="col" class="sx-arr"><span class="sr-only">pairs with</span></th><th scope="col">Trustees’ committee</th><th scope="col" class="sx-ch">Chair</th><th scope="col" class="n sx-n">Members</th></tr></thead>
      ${groups.map((g) => `<tbody><tr class="sx-grp"><th colspan="7" scope="rowgroup">${g.title}</th></tr>${g.rows.join('')}</tbody>`).join('')}</table></div>`;

    const ccSide = (ids) => ids.map((id) => { const c = ccOf(D, id); return c ? `<div class="sx-sub"><h4>Conference Committee on ${esc(c.printed_name || FCR.COMMITTEES[id].name)}${c.secondary ? ' <span class="badge">secondary</span>' : ''}</h4>
      <div class="small muted">${plural(nMem(c), 'delegate')} · ${secLine(c) || 'no secretary printed'}</div>${ccMembers(D, c)}</div>` : ''; }).join('');
    const tcSide = (key, c) => `<div class="sx-sub"><h4>${esc(tcFull(key, c.committee))}${(TCS[key] || {}).auxiliary ? ' <span class="badge">auxiliary</span>' : ''}</h4>
      <div class="small muted">${TCS[key] && TCS[key].session ? 'A session, not a committee: ' + SESSION + '. The roster prints who leads it' : memText(c)} · ${secLine(c) || 'no secretary printed'}</div>${tcMembers(D, c)}</div>`;
    const PAIRS = '<span class="sx-arr-t" aria-hidden="true">⇄</span><span class="sr-only">pairs with</span>';
    const card = (id, title, left, right) => `<article class="card sx-pc${right && left ? '' : ' one'}" id="sx-pair-${esc(id)}" tabindex="-1"><h3>${title}</h3>
      <div class="sx-pc-cols">${left ? `<section class="sx-side k-conf" aria-label="Conference side">${left}</section>` : ''}${left && right ? '<div class="sx-pc-arr" aria-hidden="true">⇄</div>' : ''}${right ? `<section class="sx-side k-board" aria-label="Trustees’ side">${right}</section>` : ''}</div></article>`;
    const cards = pairedTC.map(({ key, c }) => {
      const ids = TCS[key].cc.filter((id) => ccOf(D, id));
      return card(key, `${ids.map((id) => esc(ccLabel(id))).join(' + ')} ${PAIRS} trustees’ ${esc(tcLabel(key))}`, ccSide(ids), tcSide(key, c));
    });
    if (gvCC) cards.push(card('GV_BOARD', `Grapevine and La Viña ${PAIRS} AA Grapevine board`, ccSide(['GRAPEVINE']),
      `<div class="sx-sub"><h4>AA Grapevine board <span class="small muted">(corporate board)</span></h4><div class="small muted">As printed in the ${year} report. The Conference committee meets jointly with members of this board (${MANUAL}, p. 46).</div>${corpList(D.Y.grapevine_directors)}</div>`));
    // the October feedback call began with the Equitable Distribution of Workload trial (2023 report); dated, from the 2025 report
    const callNote = year >= 2025 ? ' Before the November 2024 board weekend, the chair of the trustees’ General Service Conference Committee met with Agenda, Policy and Admissions, and Report and Charter about related proposed agenda items (2025 Final Report, p. 84).' : '';
    const loneCards = loneCC.map((c) => card(c.committee, `${esc(ccLabel(c.committee))} <span class="small muted">· no trustees’ counterpart</span>`, ccSide([c.committee]) + `<p class="small muted">No corresponding trustees’ committee (${MANUAL}, p. 47).${callNote}</p>`, ''))
      .concat(loneTC.map(({ key, c }) => card(key, `${esc(TCS[key] && TCS[key].session ? TCS[key].name : 'Trustees’ ' + tcLabel(key))} <span class="small muted">· no Conference counterpart</span>`, '', tcSide(key, c))));

    el.innerHTML = `<div class="sx-page">
      <div class="page-head"><div><h1>Structure of the Conference</h1>
        <p>How the U.S./Canada service structure fits together, from the groups to the General Service Office — the “upside-down triangle” and the committee charts of the ${MANUAL} (Appendix C, pp. 108–109) — filled in with the names printed in the ${year} Final Report.</p></div>
        <label>Year ${UI.yearSelect('sx-year', FCR.years, year)}</label></div>
      <nav class="flex rp-jump" aria-label="On this page"><span class="small muted">On this page:</span><button type="button" class="chip" data-jump="sx-chart-h">Org chart</button><button type="button" class="chip" data-jump="sx-pairs">Committee pairs</button><button type="button" class="chip" data-jump="sx-who">Who is on each</button></nav>
      <h2 class="section-title" id="sx-chart-h">Org chart</h2>
      <div class="sx-layout">
        <div class="card sx-chart-card" id="sx-chart">
          <div class="sx-tools">
            <div class="seg" role="group" aria-label="Fold or unfold"><button type="button" data-act="expand">Unfold all</button><button type="button" data-act="collapse">Fold all</button></div>
            <div class="seg" role="group" aria-label="Zoom"><button type="button" data-act="out" aria-label="Zoom out">−</button><button type="button" data-act="fit" title="Fit to width (down to 80%)">Fit</button><button type="button" data-act="in" aria-label="Zoom in">+</button></div>
            ${ARROWS.length ? '<button type="button" class="pg-toggle sx-cc-tog" data-act="checks" aria-pressed="false" title="Arrows for the checks and balances between the levels (Twelve Concepts, Conference Charter)">Who can correct whom</button>' : ''}
            <span class="sx-legend small"><span class="sx-li sx-li-cc"><span class="sx-key sx-key-dn"></span>authority to correct</span><span class="sx-li sx-li-cc"><span class="sx-key sx-key-up"></span>check kept</span><span class="sx-li"><span class="sx-key k-base"></span>groups → areas</span><span class="sx-li"><span class="sx-key k-conf"></span>Conference</span><span class="sx-li"><span class="sx-key k-board"></span>General Service Board</span><span class="sx-li"><span class="sx-key k-corp"></span>corporations &amp; offices</span><span class="sx-li"><span class="sx-key sx-key-pair"></span>linked (committee pair, or the same person’s other seat)</span><span class="sx-li"><span class="sx-key sx-key-paid"></span>paid employee</span><span class="sx-li"><span class="sx-key sx-key-em"></span>emeritus (no vote)</span><span class="sx-li"><span class="sx-key sx-key-vacant"></span>vacant seat</span><span class="sx-li"><span class="sx-key sx-key-open"></span>seat opens at the next Conference</span></span>
          </div>
          ${ladder}
          <div class="sx-frame" id="sx-frame"><div class="sx-sizer"><div class="sx-canvas" id="sx-canvas"></div></div></div>
          <p class="small muted sx-hint">Click a box for details (it also unfolds what is under it); the round handle folds or unfolds a box. Hover a committee to see its counterpart, or a trustee to see their corporate-board seat. “Unfold all” leaves the areas folded under their regions.</p>
        </div>
        <aside class="card sx-panel" id="sx-panel" aria-label="Details"></aside>
      </div>
      <p class="sr-only" aria-live="polite" id="sx-live"></p>
      <h2 class="section-title" id="sx-pairs">Conference committees and their trustees’ committees (${year})</h2>
      <p class="small ink2 sx-note">Most Conference committees work all year with a corresponding committee of the General Service Board and meet it jointly, for information only, at the start of Conference week; the two secondary committees meet theirs at a dinner meeting during the week (${MANUAL}, pp. 45 and 48; pairings pp. 46–48 and 58–60). Click a committee for everyone on both sides.</p>
      ${pairTable}
      <h2 class="section-title" id="sx-who">Who is on each, side by side</h2>
      <div class="sx-cards">${cards.join('')}</div>
      ${loneCards.length ? `<h3 class="sx-h3">Committees without a counterpart</h3><div class="sx-cards one">${loneCards.join('')}</div>` : ''}
      <p class="small muted">Source: ${year} Final Report rosters (Conference committees, trustees’ committees, corporate boards, GSO Staff); pairings from the ${MANUAL}. Consultants are listed but not counted as members. <a href="#/board/${year}">Trustees &amp; Boards</a> has the full trustees’ committee grid.</p>
    </div>`;

    const frame = el.querySelector('#sx-frame'), sizer = el.querySelector('.sx-sizer'), canvas = el.querySelector('#sx-canvas'), panel = el.querySelector('#sx-panel'), live = el.querySelector('#sx-live');
    const chartCard = el.querySelector('#sx-chart'), ccTog = el.querySelector('.sx-cc-tog');
    const still = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    el.querySelector('#sx-year').addEventListener('change', (e) => { location.hash = '#/structure/' + e.target.value + (st.cc ? '/checks' : ''); });
    const sheet = () => getComputedStyle(panel).position === 'fixed';   // the details are a bottom sheet (<= 1180px)
    const jumpTo = (id, focus) => {
      const t = document.getElementById(id); if (!t || !el.contains(t)) return;
      t.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'start' });
      if (focus) { if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); }
    };
    const closeSheet = () => { if ((st.sel || st.arrow != null) && sheet()) { st.sel = null; st.arrow = null; mark(); showPanel(null); } };
    const flash = (id) => {
      el.querySelectorAll('.sx-pc.hit').forEach((x) => x.classList.remove('hit'));
      const c = document.getElementById('sx-pair-' + id);
      if (!c || !el.contains(c)) return;
      closeSheet();
      c.classList.add('hit'); jumpTo('sx-pair-' + id, true);
      try { history.replaceState(history.state, '', `#/structure/${year}/pair/${id}${st.cc ? '/checks' : ''}`); } catch (e) { /* file:// quirks */ }
    };
    el.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => { closeSheet(); jumpTo(b.dataset.jump, true); }));
    // pair links (table, panel) jump to their card in place; the page root is new on every render (<main> is not)
    el.querySelector('.sx-page').addEventListener('click', (e) => {
      const a = e.target.closest('[data-pj]');
      if (!a || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;   // modified clicks open a new tab/window
      e.preventDefault(); flash(a.dataset.pj);
    });

    // ---- chart drawing ----
    const avail = () => { const cs = getComputedStyle(frame); return frame.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 1; };
    // the stacked (indented) tree on phones, and wherever the side-by-side tree would not fit at 80%
    const isPhone = () => frame.clientWidth < 700 || st.stack;
    // desktop boxes widen with the frame (up to 230px) so a wide screen gets roomier boxes instead of a small chart
    const geom = () => {
      if (isPhone()) return Object.assign({}, G, { W: Math.max(200, Math.min(300, frame.clientWidth - 110)), IND: 18, LG: 26 });   // room for 4 indents + the pair loop
      if (st.print) return G;   // print: the base width, so the page zoom stays readable
      const W = Math.max(G.W, Math.min(230, Math.floor((avail() - 8 * G.IND - 4 * G.HG) / 5)));   // up to 8 indents deep (regions, trustee seats)
      return W === G.W ? G : Object.assign({}, G, { W });
    };
    const visible = () => { const out = []; (function walk(n) { out.push(n); if (n.open) n.children.forEach(walk); })(root); return out; };
    const shown = (id) => { const n = byId[id]; if (!n) return false; for (let p = n.parent; p; p = p.parent) if (!p.open) return false; return true; };
    const nodeHtml = (n) => {
      const kids = n.children.length;
      return `<button type="button" class="sx-node k-${n.kind}${n.mine ? ' mine' : ''}${n.cls ? ' ' + n.cls : ''}${kids ? ' has-kids' : ''}${st.cc ? (lvIds.has(n.id) ? ' cc-lv' : ' dim') : ''}" data-id="${esc(n.id)}">
        <span class="sx-t">${n.dot ? `<span class="dot" style="background:${n.dot}"></span> ` : ''}${brk(n.title)}</span>${n.sub ? `<span class="sx-s">${brk(n.sub)}</span>` : ''}</button>
        ${kids ? `<button type="button" class="sx-tog" data-tog="${esc(n.id)}" aria-expanded="${n.open}" aria-label="${n.open ? 'Fold' : 'Unfold'} ${esc(n.title)} (${kids})">${n.open ? '−' : '+' + kids}</button>` : ''}`;
    };
    function draw(keepFocus) {
      const g = geom(), phone = isPhone(), vis = visible();
      // who can correct whom: arrows on the chart when it is laid out side by side (not on phones, stacked or printed)
      const visIds = new Set(vis.map((n) => n.id));
      const ccGs = st.cc && !phone && !st.print ? CC_GROUPS.filter((G) => LV[G.from].nodes.some((id) => visIds.has(id)) && LV[G.to].nodes.some((id) => visIds.has(id))) : [];
      const ccN = ccGs.reduce((s, G) => s + G.items.length, 0);
      chartCard.classList.toggle('cc-on', st.cc);
      chartCard.classList.toggle('cc-list', st.cc && ccN < ARROWS.length);   // the vertical list too when arrows are missing
      const ccHtml = ccGs.length ? `<svg class="sx-cc-svg" aria-hidden="true"></svg><div class="sx-ccw" role="list" aria-label="Who can correct whom: ${ccN} arrows">${ccGs.map((G) => `<div class="sx-ccg ${ccDir(G)}" data-g="${G.gi}" role="none">${G.items.map((a) => `<div role="listitem">${ccBtn(a)}</div>`).join('')}</div>`).join('')}</div>` : '';
      canvas.innerHTML = `<svg class="sx-edges" aria-hidden="true"></svg><svg class="sx-links" aria-hidden="true"></svg>${ccHtml}${vis.map(nodeHtml).join('')}`;
      vis.forEach((n) => { n.el = canvas.querySelector(`.sx-node[data-id="${n.id}"]`); n.el.style.width = g.W + 'px'; n.tog = canvas.querySelector(`.sx-tog[data-tog="${n.id}"]`); });
      vis.forEach((n) => { n.h = n.el.offsetHeight; });
      measure(root, g, phone);
      if (!phone && !st.print && root.bw * 0.8 > avail()) { st.stack = true; draw(keepFocus); return; }
      place(root, 0, 0, g);
      const ov = ccGs.length ? ccLayout(g, vis, ccGs) : null;
      const dx = ov && ov.minX < 6 ? 6 - ov.minX : 0;   // a lane or label left of the tree: shift everything right
      if (dx) { vis.forEach((n) => { n.x += dx; }); ov.groups.forEach((gr) => { gr.label.x += dx; gr.paths.forEach((p) => { p.x += dx; p.x1 += dx; p.x2 += dx; }); }); }
      const W = Math.ceil(Math.max(root.bw + dx, ov ? ov.maxX + dx + 6 : 0)), H = Math.ceil(Math.max(root.bh, ov ? ov.maxY + 6 : 0)) + 14;
      if (ov && W * 0.8 > avail()) { st.stack = true; draw(keepFocus); return; }   // the arrows would not fit: the list instead
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      vis.forEach((n) => { n.el.style.left = n.x + 'px'; n.el.style.top = n.y + 'px'; });
      if (ov) ccRender(ov, W, H);
      // connectors: parent bottom-centre (side by side) or a rail at the parent's left (stacked); the fold handle sits where they start
      const paths = [];
      vis.forEach((n) => {
        if (!n.children.length) return;
        const rail = n.isStack;
        const sx = rail ? n.x + g.IND / 2 : n.x + g.W / 2, sy = n.y + n.h;
        if (n.tog) { n.tog.style.left = sx + 'px'; n.tog.style.top = sy + 'px'; }
        if (!n.open) return;
        n.children.forEach((k) => {
          if (rail) paths.push(`M${sx},${sy} V${k.y + Math.min(k.h, 40) / 2} H${k.x}`);
          else { const my = sy + g.LG / 2; paths.push(`M${sx},${sy} V${my} H${k.x + g.W / 2} V${k.y}`); }
        });
      });
      [canvas.querySelector('.sx-edges'), canvas.querySelector('.sx-links')].forEach((s) => { s.setAttribute('width', W); s.setAttribute('height', H); s.setAttribute('viewBox', `0 0 ${W} ${H}`); });
      canvas.querySelector('.sx-edges').innerHTML = `<path d="${paths.join(' ')}"/>`;
      zoomTo(st.zoom);
      mark();
      if (keepFocus) { const f = canvas.querySelector(keepFocus); if (f) f.focus({ preventScroll: !sheet() }); }
    }
    /** Who can correct whom: down arrows (authority to correct) run on the right of the boxes, up arrows (checks kept) on
        the left. Each group of arrows between the same boxes is one line: out of a port on the box edge (ports spread
        down the edge, ordered by where the other end sits), along a vertical lane clear of every box and other lane, into
        the other box. A level of two boxes (AAWS + Grapevine) pairs with another of two by position, else with each box.
        The group's labels (its arrows' buttons) stack beside its lane, where they cover no box and no other stack. */
    function ccLayout(g, vis, gs) {
      const visIds = new Set(vis.map((n) => n.id));
      const obst = vis.map((n) => ({ x: n.x, y: n.y, w: g.W, h: n.h + (n.children.length ? 12 : 0) }));   // + the fold handle
      const hits = (r, list, m) => list.some((o) => r.x < o.x + o.w + m && r.x + r.w + m > o.x && r.y < o.y + o.h + m && r.y + r.h + m > o.y);
      const groups = gs.map((G) => {
        const A = LV[G.from].nodes.filter((id) => visIds.has(id)), B = LV[G.to].nodes.filter((id) => visIds.has(id));
        const pairs = A.length === B.length && A.length > 1 ? A.map((a, i) => [a, B[i]]) : [].concat(...A.map((a) => B.map((b) => [a, b])));
        return { G, side: G.dir === 'down' ? 'R' : 'L', shared: A.length === 1 || B.length === 1, pairs: pairs.map(([a, b]) => ({ a: byId[a], b: byId[b] })), el: canvas.querySelector(`.sx-ccg[data-g="${G.gi}"]`) };
      });
      const ports = {};
      const attach = (n, side, gi, other) => { const k = n.id + side; (ports[k] = ports[k] || []); if (!ports[k].some((p) => p.gi === gi)) ports[k].push({ gi, oy: other.y + other.h / 2 }); };
      groups.forEach((gr, gi) => gr.pairs.forEach((p) => { attach(p.a, gr.side, gi, p.b); attach(p.b, gr.side, gi, p.a); }));
      const portY = (n, side, gi) => { const l = ports[n.id + side].slice().sort((p, q) => p.oy - q.oy); return Math.round(n.y + Math.min(n.h, 110) * (l.findIndex((p) => p.gi === gi) + 1) / (l.length + 1)); };
      const lanes = [];
      /** How much of the lane x (lo..hi) runs over boxes (within m px of one) and along other lanes (closer than sp px). */
      const laneCost = (x, lo, hi, m, sp) => obst.reduce((s, o) => s + (x > o.x - m && x < o.x + o.w + m ? Math.max(0, Math.min(hi, o.y + o.h + 3) - Math.max(lo, o.y - 3)) : 0), 0)
        + lanes.reduce((s, l) => s + (Math.abs(l.x - x) < sp ? Math.max(0, Math.min(hi, l.hi + 6) - Math.max(lo, l.lo - 6)) : 0), 0);
      // the x nearest x0 (within 60px, never closer than 6px to the boxes it joins) clear of every box and lane; where
      // there is none (an unfolded chart), the one crossing the least
      const laneAt = (side, x0, lo, hi) => {
        const lim = side === 'R' ? x0 - 10 : x0 + 10;
        let best = null;
        for (let k = 0; k <= 40; k++) {
          const x = x0 + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 3;
          if (side === 'R' ? x < lim : x > lim) continue;
          if (!laneCost(x, lo, hi, 5, 7)) { best = { x }; break; }
          const c = laneCost(x, lo, hi, 1, 4);
          if (!best || c < best.c) best = { x, c };
        }
        lanes.push({ x: best.x, lo, hi }); return best.x;
      };
      groups.forEach((gr, gi) => {
        const R = gr.side === 'R', edge = (n) => (R ? n.x + g.W : n.x);
        const ends = gr.pairs.map((p) => ({ a: p.a, b: p.b, ya: portY(p.a, gr.side, gi), yb: portY(p.b, gr.side, gi) }));
        gr.paths = [];
        (gr.shared ? [ends] : ends.map((e) => [e])).forEach((set) => {   // a shared end: one lane for all its paths
          const xs = [].concat(...set.map((e) => [edge(e.a), edge(e.b)])), ys = [].concat(...set.map((e) => [e.ya, e.yb]));
          const x = laneAt(gr.side, R ? Math.max(...xs) + 16 : Math.min(...xs) - 16, Math.min(...ys), Math.max(...ys));
          set.forEach((e) => gr.paths.push({ x, x1: edge(e.a), y1: e.ya, x2: edge(e.b), y2: e.yb }));
        });
      });
      const placed = [];
      groups.forEach((gr) => {
        const w = gr.el.offsetWidth, h = gr.el.offsetHeight, p = gr.paths[0], mid = (p.y1 + p.y2) / 2;
        // candidates: beside the line on its outer side (stepping past a neighbouring lane if need be) near the middle,
        // then the inner side; the first that covers no box, label stack or lane wins, else the first one
        const cands = [];
        for (let k = 0; k < 81; k++) {
          const dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 8;
          [0, 12, 24, 36].forEach((e) => cands.push({ x: gr.side === 'R' ? p.x + 9 + e : p.x - 9 - w - e, dy, score: Math.abs(dy) + e * 3 }));
          cands.push({ x: gr.side === 'R' ? p.x - 9 - w : p.x + 9, dy, score: Math.abs(dy) + 240 });
        }
        cands.sort((u, v) => u.score - v.score);
        let best = null;
        for (const c of cands) {
          const r = { x: c.x, y: Math.round(mid - h / 2 + c.dy), w, h };
          const ok = r.y >= 0 && !hits(r, obst, 5) && !hits(r, placed, 6) && !lanes.some((l) => l.x > r.x - 4 && l.x < r.x + r.w + 4 && r.y < l.hi && r.y + r.h > l.lo);
          if (ok || !best) best = { r, ok };
          if (ok) break;
        }
        gr.label = best.r; placed.push(best.r);
      });
      const xs = [].concat(...groups.map((gr) => [gr.label.x, gr.label.x + gr.label.w].concat(gr.paths.map((p) => p.x))));
      const ys = [].concat(...groups.map((gr) => [gr.label.y + gr.label.h].concat(gr.paths.map((p) => Math.max(p.y1, p.y2)))));
      return { groups, minX: Math.min(...xs), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    }
    function ccRender(ov, W, H) {
      const svg = canvas.querySelector('.sx-cc-svg');
      svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.innerHTML = ov.groups.map((gr) => {
        const s = gr.side === 'R' ? 1 : -1;   // arrowheads point back at the box: left on the right side, right on the left
        const d = gr.paths.map((p) => `M${p.x1},${p.y1} H${p.x} V${p.y2} H${p.x2 + 8 * s}`).join(' ');
        const ends = gr.paths.map((p) => `<polygon points="${p.x2},${p.y2} ${p.x2 + 10 * s},${p.y2 - 5} ${p.x2 + 10 * s},${p.y2 + 5}"/><circle cx="${p.x1 + 3 * s}" cy="${p.y1}" r="3"/>`).join('');
        return `<g class="${ccDir(gr.G)}" data-g="${gr.G.gi}"><path class="halo" d="${d}"/><path d="${d}"/>${ends}</g>`;
      }).join('');
      ov.groups.forEach((gr) => { gr.el.style.left = gr.label.x + 'px'; gr.el.style.top = gr.label.y + 'px'; });
    }
    /** Fit to the frame's content box (its padding excluded), never below 80% so box text stays readable. */
    function fitScale() { return Math.max(isPhone() ? 0.45 : 0.8, Math.min(1, avail() / (parseFloat(canvas.style.width) || 1))); }
    function zoomTo(z) {
      const s = z == null ? fitScale() : z;
      canvas.style.transform = `scale(${s})`;
      sizer.style.width = Math.ceil(parseFloat(canvas.style.width) * s) + 'px';
      sizer.style.height = Math.ceil(parseFloat(canvas.style.height) * s) + 'px';
      canvas.dataset.scale = s;
    }
    // highlight: the selected box, and the counterpart(s) of the hovered / selected committee with a dashed line
    function mark() {
      canvas.querySelectorAll('.sx-node.sel, .sx-node.pair').forEach((x) => x.classList.remove('sel', 'pair'));
      canvas.querySelectorAll('.sx-node[aria-current]').forEach((x) => x.removeAttribute('aria-current'));
      const sel = st.sel && shown(st.sel) && byId[st.sel];
      if (sel && sel.el && sel.el.isConnected) { sel.el.classList.add('sel'); sel.el.setAttribute('aria-current', 'true'); }
      const src = (st.hover && byId[st.hover]) || sel;
      const ds = [];
      if (src && src.pairs.length && shown(src.id)) {
        const g = geom();
        src.pairs.forEach((pid) => {
          const p = byId[pid];
          if (!p || !shown(pid) || !p.el || !p.el.isConnected) return;
          p.el.classList.add('pair');
          const a = src.x <= p.x ? src : p, b = a === src ? p : src;
          const x1 = a.x + g.W, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
          if (x2 > x1 + 4) { const dx = Math.max(30, (x2 - x1) / 2); ds.push(`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`); }
          else { const lx = Math.max(a.x, b.x) + g.W + 16; ds.push(`M${a.x + g.W},${y1} C${lx},${y1} ${lx},${y2} ${b.x + g.W},${y2}`); }   // same column (phones)
        });
      }
      const links = canvas.querySelector('.sx-links');
      if (links) links.innerHTML = ds.length ? `<path class="halo" d="${ds.join(' ')}"/><path d="${ds.join(' ')}"/>` : '';
      // who can correct whom: the picked arrow's labels and boxes; its line (or the hovered label's) stands out
      if (!ARROWS.length) return;
      el.querySelectorAll('.sx-ccl.on').forEach((x) => { x.classList.remove('on'); x.removeAttribute('aria-current'); });
      canvas.querySelectorAll('.sx-node.cc-end').forEach((x) => x.classList.remove('cc-end', 'cc-dn', 'cc-up'));
      const a = st.cc && st.arrow != null ? ARROWS[st.arrow] : null;
      const hot = st.ccHot != null ? st.ccHot : a ? a.gi : null;
      const svg = canvas.querySelector('.sx-cc-svg');
      if (svg) { svg.classList.toggle('picked', hot != null); svg.querySelectorAll('g[data-g]').forEach((x) => x.classList.toggle('on', +x.dataset.g === hot)); }
      if (!a) return;
      el.querySelectorAll(`.sx-ccl[data-cc="${a.i}"]`).forEach((x) => { x.classList.add('on'); x.setAttribute('aria-current', 'true'); });
      LV[a.from].nodes.concat(LV[a.to].nodes).forEach((id) => { const n = byId[id]; if (n.el && n.el.isConnected && shown(id)) n.el.classList.add('cc-end', 'cc-' + ccDir(a)); });
    }
    const reveal = (id) => { for (let p = byId[id] && byId[id].parent; p; p = p.parent) p.open = true; };
    /** Keep the selected box — with its counterpart and dashed line when they fit — above the bottom sheet, and let
        focus scrolling clear the sheet too. */
    function clearSheet(n) {
      const on = !!n && sheet();
      document.documentElement.style.scrollPaddingBottom = on ? (panel.offsetHeight + 16) + 'px' : '';
      if (!on || !n.el) return;
      const top = panel.getBoundingClientRect().top;
      const stick = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stick-top')) || 100;
      const rs = [n].concat(n.pairs.map((id) => byId[id]).filter((p) => p && p.el && p.el.isConnected && shown(p.id))).map((x) => x.el.getBoundingClientRect());
      const u = { top: Math.min(...rs.map((r) => r.top)), bottom: Math.max(...rs.map((r) => r.bottom)) };
      const r = u.bottom - u.top <= top - stick - 32 ? u : n.el.getBoundingClientRect();
      if (r.bottom > top - 8) window.scrollBy(0, r.bottom - top + 24);
      else if (r.top < stick) window.scrollBy(0, r.top - stick - 12);
    }
    function select(id, opts) {
      const n = byId[id]; if (!n) return;
      opts = opts || {};
      st.sel = id; st.arrow = null;
      reveal(id);
      if (n.children.length && !n.open) n.open = true;
      n.pairs.forEach(reveal);
      draw(opts.focus ? `.sx-node[data-id="${id}"]` : null);
      showPanel(n);
      if (n.el) {   // the box may sit off the scrolled frame (zoomed in) or off screen
        const s = +canvas.dataset.scale || 1, nx = n.x * s;
        if (nx < frame.scrollLeft || nx + geom().W * s > frame.scrollLeft + frame.clientWidth) frame.scrollLeft = Math.max(0, nx - 24);
      }
      if (sheet()) clearSheet(n);
      else if (opts.scroll && n.el) {
        const r = n.el.getBoundingClientRect(), stick = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stick-top')) || 100;
        if (r.top < stick || r.bottom > window.innerHeight - 20) window.scrollTo(0, Math.max(0, window.scrollY + r.top - stick - 80));
      }
    }
    const kindLabel = { base: 'Groups to areas', conf: 'General Service Conference', board: 'General Service Board', corp: 'Corporations and offices' };
    function showPanel(n) {
      panel.classList.toggle('open', !!n);
      live.textContent = n ? `${n.title}: details shown` : '';
      if (!n && st.cc) {
        document.documentElement.style.scrollPaddingBottom = '';
        const nDown = ARROWS.filter((a) => a.dir === 'down').length;
        panel.innerHTML = `<h3>Who can correct whom</h3>
          <p class="small">Concept X: ultimate authority runs down the structure — the groups over the Conference, the Conference over the trustees, the trustees over the service corporations, and the corporations over their executives and staff. Yet it should “practically never be used in full, except in an emergency” (${MANUAL}, p. C-34).</p>
          <ul class="small sx-how"><li><span class="sx-key sx-key-dn"></span> <strong>Down:</strong> authority to correct the level below (${nDown} arrows).</li>
            <li><span class="sx-key sx-key-up"></span> <strong>Up:</strong> a check the level below keeps — the Right of Decision, the trustees’ legal veto, appeal and petition (${ARROWS.length - nDown} arrows).</li></ul>
          <p class="small muted">Pick an arrow’s label for what it means and the page. The other boxes are dimmed but still work; turning the view off unfolds what it folded.</p>
          <p class="small">${learnLink('concept_x', 'Concept X in Learn')}</p>`;
        return;
      }
      if (!n) {
        document.documentElement.style.scrollPaddingBottom = '';
        panel.innerHTML = `<h3>How to read the chart</h3>
          <p class="small">The structure runs from the A.A. groups at the top down to the service offices — A.A.’s “upside-down triangle”: the groups hold the ultimate authority, and each level serves the one above it.</p>
          <ul class="small sx-how"><li><strong>Groups → districts → area assemblies</strong> elect GSRs, DCMs and, every two years, a delegate.</li>
            <li><strong>The Conference</strong> (delegates, trustees, directors and staff) works through 13 Conference committees.</li>
            <li><strong>The General Service Board</strong> works through trustees’ committees, most of them paired with a Conference committee, and oversees the two operating corporations.</li>
            <li><strong>The AAWS and AA Grapevine boards</strong> are made up of trustees (a dashed line links them to their trustee seat), nontrustee directors, and paid employees.</li>
            <li><strong>Who is paid:</strong> only the green boxes — the General Service Office and Grapevine office staff, and the employees who also sit on a corporate board. Trustees, nontrustee directors and appointed committee members serve without pay, with travel covered (${MANUAL}, p. 63); delegates are volunteers elected by their areas.</li></ul>
          <p class="small muted">Pick any box to see who serves there in ${year}.</p>`;
        return;
      }
      const path = []; for (let p = n.parent; p; p = p.parent) path.unshift(p);
      const body = n.detail ? n.detail() : '';
      panel.innerHTML = `<div class="sx-p-h"><span class="sx-key k-${n.kind}"></span><span class="small muted">${esc(kindLabel[n.kind] || '')}</span><button type="button" class="icon-btn sx-close" aria-label="Close details">✕</button></div>
        <h3>${esc(n.title)}</h3>${n.sub ? `<p class="small ink2">${esc(n.sub)}</p>` : ''}
        ${path.length ? `<nav class="small sx-crumbs" aria-label="Where this sits">${path.map((p) => `<button type="button" class="linkish" data-sel="${esc(p.id)}">${esc(p.title)}</button>`).join(' › ')}</nav>` : ''}
        <div class="sx-p-body">${body}</div>
        ${n.learn && !/href="#\/learn\//.test(body) ? `<p class="small">${learnLink(n.learn)}</p>` : ''}`;
    }
    /** An arrow's button: its label on the chart, or its row in the vertical list. */
    const ccButton = (i) => canvas.querySelector(`.sx-ccl[data-cc="${i}"]`) || el.querySelector(`.sx-ladder .sx-ccl[data-cc="${i}"]`);
    /** One arrow in the details panel: what it means, the page, its two ends on the chart, and the next / previous arrow. */
    function showArrow(i, opts) {
      const a = ARROWS[i]; if (!a) return;
      st.arrow = i; st.sel = null;
      mark();
      const ends = (id) => LV[id].nodes.map((x) => `<button type="button" class="linkish" data-sel="${esc(x)}">${esc(byId[x].title)}</button>`).join(' · ');
      const step = (j, txt) => (ARROWS[j] ? `<button type="button" class="linkish" data-cc="${j}">${txt}</button>` : '<span></span>');
      panel.classList.add('open');
      panel.innerHTML = `<div class="sx-p-h"><span class="sx-key sx-key-${ccDir(a)}"></span><span class="small muted">Who can correct whom · ${ccKind(a)}</span><button type="button" class="icon-btn sx-close" aria-label="Close details">✕</button></div>
        <h3 tabindex="-1">${esc(a.label)}</h3><p class="small ink2">${esc(LV[a.from].label)} → ${esc(LV[a.to].label)}</p>
        <p>${esc(a.text)}</p>
        <p class="small muted">${esc(ccSrc(a, true))}</p>
        <p class="small">On the chart: ${ends(a.from)} → ${ends(a.to)}</p>
        ${a.learn ? `<p class="small">${learnLink(a.learn)}</p>` : ''}
        <nav class="small sx-cc-nav" aria-label="Other arrows">${step(i - 1, `‹ ${esc((ARROWS[i - 1] || {}).label || '')}`)}<span class="muted">${i + 1} of ${ARROWS.length}</span>${step(i + 1, `${esc((ARROWS[i + 1] || {}).label || '')} ›`)}</nav>`;
      live.textContent = `${a.label}: details shown`;
      if (opts && opts.inPanel) panel.querySelector('h3').focus({ preventScroll: true });
      const b = ccButton(i);
      if (b && opts && opts.focus) b.focus({ preventScroll: !sheet() });
      if (sheet()) clearSheet(b ? { el: b, pairs: [] } : null);
    }
    const closePanel = () => {
      if (st.arrow != null) { const i = st.arrow; st.arrow = null; mark(); showPanel(null); const f = ccButton(i); if (f) f.focus({ preventScroll: true }); return; }
      const id = st.sel; st.sel = null; mark(); showPanel(null); const f = id && canvas.querySelector(`.sx-node[data-id="${id}"]`); if (f) f.focus({ preventScroll: true });
    };
    panel.addEventListener('click', (e) => {
      const c = e.target.closest('[data-cc]');
      if (c) { showArrow(+c.dataset.cc, { inPanel: true }); return; }
      const b = e.target.closest('[data-sel]');
      if (b) { select(b.dataset.sel, { scroll: true, focus: true }); return; }
      if (e.target.closest('.sx-close')) closePanel();
    });
    const ladderEl = el.querySelector('.sx-ladder');
    if (ladderEl) ladderEl.addEventListener('click', (e) => {
      const c = e.target.closest('[data-cc]');
      if (c) { showArrow(+c.dataset.cc); return; }
      const b = e.target.closest('[data-sel]');
      if (b) select(b.dataset.sel, { scroll: true, focus: true });
    });
    canvas.addEventListener('click', (e) => {
      const c = e.target.closest('.sx-ccl');
      if (c) { showArrow(+c.dataset.cc); return; }
      const t = e.target.closest('.sx-tog');
      if (t) {
        const n = byId[t.dataset.tog]; n.open = !n.open;
        if (st.sel && !shown(st.sel)) { st.sel = null; showPanel(null); }   // the selected box was folded away
        draw(`.sx-tog[data-tog="${n.id}"]`);
        return;
      }
      const b = e.target.closest('.sx-node');
      if (b) select(b.dataset.id, { focus: true });
    });
    // hovering or focusing a box shows its counterpart; an arrow label lights up its line
    const hoverAt = (t) => {
      const b = t.closest('.sx-node'), l = t.closest('.sx-ccg');
      const id = b ? b.dataset.id : null, gi = l ? +l.dataset.g : null;
      if (id !== st.hover || gi !== st.ccHot) { st.hover = id; st.ccHot = gi; mark(); }
    };
    canvas.addEventListener('mouseover', (e) => hoverAt(e.target));
    canvas.addEventListener('mouseleave', () => { if (st.hover || st.ccHot != null) { st.hover = null; st.ccHot = null; mark(); } });
    canvas.addEventListener('focusin', (e) => { if (e.target.closest('.sx-node, .sx-ccg')) hoverAt(e.target); });
    canvas.addEventListener('focusout', () => { if (st.hover || st.ccHot != null) { st.hover = null; st.ccHot = null; mark(); } });
    el.querySelector('.sx-tools').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = b.dataset.act, cur = +canvas.dataset.scale || 1;
      if (a === 'checks') setCC(!st.cc);
      else if (a === 'expand') { Object.values(byId).forEach((n) => { if (n.children.length && !/^reg-/.test(n.id)) n.open = true; }); draw(); }
      else if (a === 'collapse') { Object.values(byId).forEach((n) => { if (n.children.length && !['groups', 'districts', 'assemblies'].includes(n.id)) n.open = false; }); if (st.sel && !shown(st.sel)) st.sel = null; st.stack = false; draw(); if (st.arrow != null) showArrow(st.arrow); else showPanel(st.sel ? byId[st.sel] : null); }   // an open arrow stays (in the list if its boxes folded away)
      else if (a === 'fit') { st.zoom = null; zoomTo(null); }
      else { st.zoom = Math.max(0.4, Math.min(1.6, Math.round((cur + (a === 'in' ? 0.1 : -0.1)) * 10) / 10)); zoomTo(st.zoom); }
    });
    /** Who can correct whom on or off. On: everything not on the way to a level's box folds and the boxes on the way
        unfold (both remembered, so turning it off restores the reader's folds) and the chart re-lays out with the
        arrows; the details panel explains the view. */
    function applyCC(on) {
      if (on) {
        st.ccFold = Object.values(byId).filter((n) => n.children.length && n.open && !lvAnc.has(n.id)).map((n) => n.id);
        st.ccFold.forEach((id) => { byId[id].open = false; });
        st.ccOpened = [...lvAnc].filter((id) => !byId[id].open);
        lvIds.forEach(reveal);
      } else {
        st.ccFold.forEach((id) => { byId[id].open = true; }); st.ccFold = [];
        st.ccOpened.forEach((id) => { byId[id].open = false; }); st.ccOpened = [];
      }
      st.cc = on; st.arrow = null; st.ccHot = null; st.stack = false;
      if (st.sel && !shown(st.sel)) st.sel = null;
      if (ccTog) ccTog.setAttribute('aria-pressed', String(on));
    }
    function setCC(on) {
      applyCC(on);
      draw(); showPanel(st.sel ? byId[st.sel] : null);
      live.textContent = on ? `Who can correct whom: ${ARROWS.length} arrows between ${lvOrder.length} levels; the other boxes are dimmed.` : 'Who can correct whom: off.';
      try { history.replaceState(history.state, '', `#/structure/${year}${on ? '/checks' : ''}`); } catch (e) { /* file:// quirks */ }
    }
    const alive = () => el.contains(canvas);
    hooks.key = (e) => {
      if (!alive()) { hooks.key = null; return; }
      if (e.key !== 'Escape' || e.defaultPrevented || !(st.sel || st.arrow != null) || !sheet()) return;   // the search box handles its own Escape
      const t = e.target;
      if (t && t.closest && !t.closest('.sx-page') && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      closePanel();
    };
    let lastW = frame.clientWidth;
    hooks.resize = () => {
      if (!alive()) { hooks.resize = null; return; }
      if (Math.abs(frame.clientWidth - lastW) > 4) {
        lastW = frame.clientWidth; st.stack = false; draw();
        const ab = st.arrow != null ? ccButton(st.arrow) : null;   // an open arrow: keep its label above the sheet
        clearSheet(st.sel ? byId[st.sel] : ab ? { el: ab, pairs: [] } : null);
      }
    };
    // printing: the whole chart on one page width (about 680 CSS px of a Letter/A4 page). zoom, not transform: a
    // transformed canvas keeps its unscaled layout box, which shrinks the whole printout and splits boxes across pages.
    hooks.beforeprint = () => {
      if (!alive()) { hooks.beforeprint = null; return; }
      if (frame.clientWidth >= 700) { st.print = true; st.stack = false; draw(); }   // desktop: lay out at the base box width
      const w = parseFloat(canvas.style.width) || 1, h = parseFloat(canvas.style.height) || 1, s = Math.min(1, 680 / w);
      canvas.style.transform = 'none'; canvas.style.zoom = s;
      sizer.style.width = Math.ceil(w * s) + 'px'; sizer.style.height = Math.ceil(h * s) + 'px';
    };
    hooks.afterprint = () => { if (!alive()) { hooks.afterprint = null; return; } canvas.style.zoom = ''; if (st.print) { st.print = false; draw(); } else zoomTo(st.zoom); };

    if (args && (args[1] === 'checks' || (pa && args[3] === 'checks')) && ARROWS.length) applyCC(true);   // #/structure/<year>/checks, or .../pair/<id>/checks
    draw();
    showPanel(null);
    if (focusPair) {
      const id = document.getElementById('sx-pair-' + pairId(focusPair)) ? pairId(focusPair) : document.getElementById('sx-pair-' + focusPair) ? focusPair : null;
      if (id) requestAnimationFrame(() => flash(id));
    } else if (args && args[1] === 'pairs') requestAnimationFrame(() => jumpTo('sx-pairs', true));   // #/structure/<year>/pairs
  };
})();
