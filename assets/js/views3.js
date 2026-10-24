/* Views part 3: Trustees & Boards, GSO Staff, Openings & rotation, Reports (Final Report library + Conference facts).
   Data: year rosters (FCR.Y), board.json via FCR.currentOfficers / positionHistory / openings, conferences.json via
   FCR.conference. Styles: assets/css/board.css (class prefixes bd- board, st- staff, op- openings, rp- reports). */
(function () {
  'use strict';
  const FCR = window.FCR;
  const esc = FCR.esc;
  const V = FCR.views, UI = FCR.ui;
  const RAW = FCR.RAW, BOARD = RAW.board || {}, CONF = RAW.conferences || {};
  const same = (a, b) => FCR.sameName(a, b);

  // ---------- dates (one short format everywhere: "Jan 1, 2027", en-dash ranges) ----------
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const isoD = (s) => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1, 12) : null; };
  const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysTo = (d) => Math.round((day0(d) - day0(FCR.today())) / 864e5);
  const inDays = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 1 ? `in ${n} days` : n === -1 ? 'yesterday' : `${-n} days ago`);
  /** 'Jan 1, 2027' (Date or ISO); a month-only ISO ('2020-05') gives 'May 2020'. */
  const fmtD = (s, noYear) => {
    if (!s) return '';
    const d = s instanceof Date ? s : isoD(s); if (!d) return String(s);
    if (typeof s === 'string' && s.length === 7) return `${MON[d.getMonth()]} ${d.getFullYear()}`;
    return `${MON[d.getMonth()]} ${d.getDate()}${noYear ? '' : ', ' + d.getFullYear()}`;
  };
  /** 'Apr 11–17, 2027' · 'Apr 26 – May 2, 2026' · 'Dec 30, 2026 – Jan 2, 2027'. */
  const fmtRange = (a, b) => {
    const A = a instanceof Date ? a : isoD(a), B = b instanceof Date ? b : isoD(b);
    if (!A) return '';
    if (typeof a === 'string' && a.length === 7) return fmtD(a);
    if (!B || +day0(A) === +day0(B)) return fmtD(A);
    if (A.getFullYear() !== B.getFullYear()) return `${fmtD(A)} – ${fmtD(B)}`;
    if (A.getMonth() === B.getMonth()) return `${MON[A.getMonth()]} ${A.getDate()}–${B.getDate()}, ${A.getFullYear()}`;
    return `${fmtD(A, true)} – ${fmtD(B)}`;
  };
  const yr2 = (a, b) => `${a}–${String(b).slice(2)}`;   // '2026–27'

  // ---------- shared bits ----------
  const reportOf = (y) => (RAW.reports || []).find((r) => r.year === +y && !r.historical) || null;
  /** "Open PDF" link to the Drive copy of a year's report ('' when there is none). */
  const pdfLink = (y, label) => { const r = reportOf(y); return r && r.drive_url ? `<a href="${esc(r.drive_url)}" target="_blank" rel="noopener">${esc(label || 'Open PDF')}</a>` : ''; };
  /** "past delegate P68 · Area 46" (marks areas that were inferred, not printed). */
  const pdHtml = (pd) => {
    if (!pd || !(pd.area || pd.panel)) return '';
    const inf = pd.area_inferred || pd.inferred;
    return `past delegate ${pd.panel ? 'P' + pd.panel + ' ' : ''}${pd.area ? UI.areaLink(pd.area, { noname: true }) : ''}${inf ? ' <span class="muted" data-tip="Area inferred (city and panel parity); the report prints only the panel" tabindex="0">(inferred)</span>' : ''}`;
  };
  const joinDot = (parts) => parts.filter(Boolean).join(' · ');
  const listAnd = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
  /** 'FR26 p40-41 L3336-3459' -> '2026 report p. 40-41' (line numbers and audit ids dropped). */
  const refText = (r) => String(r || '').replace(/FR(\d\d) p(\d+(?:[-–]\d+)?)(?: L\d+(?:[-–,]\d+)*(?:ff?)?(?:,\s*L\d+(?:[-–,]\d+)*(?:ff?)?)*)?/g, (m, y, pg) => `20${y} report p. ${pg}`).replace(/\bp(\d+(?:[-–]\d+)?) L\d+(?:[-–,]\d+)*(?:ff?)?(?:,\s*L\d+(?:[-–,]\d+)*(?:ff?)?)*/g, 'p. $1').replace(/ L\d+(?:[-–]\d+)?(?:ff)?/g, '').replace(/\s*\(text[^)]*\)/g, '').replace(/R6-H\d+(?: \([^)]*\))?/g, 'board rosters 2017–2026').replace(/years\/[^;,)]*/g, 'report rosters');
  const pattern = (id) => (BOARD.patterns || []).find((p) => p.id === id) || null;
  /** "On this page" chip row for long pages: secs = [[elementId, label]]; wireJumps(el) makes the chips scroll there. */
  const jumpNav = (secs) => `<nav class="flex rp-jump" aria-label="On this page"><span class="small muted">On this page:</span>${secs.map(([id, l]) => `<button type="button" class="chip" data-jump="${id}">${l}</button>`).join('')}</nav>`;
  const wireJumps = (el) => el.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => {
    const t = el.querySelector('#' + b.dataset.jump);
    if (!t) return;
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    t.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });   // offset: scroll-margin-top (app.css)
    if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
    t.focus({ preventScroll: true });
  }));
  const myArea = () => +FCR.store.get('myArea', 65) || 65;
  const ROOT_CLASS = (cls, html) => `<div class="${cls}">${html}</div>`;

  // Trustees' committees: short column labels (full name in the tooltip).
  const TC_SHORT = [[/^archives/i, 'Archives'], [/^audit/i, 'Audit'], [/^compensation/i, 'Compensation'], [/^conference$/i, 'Conference'],
    [/conventions|forums|^icrf/i, 'IC/RF'], [/cooperation|c\.?\s?p\.?\s?c/i, 'CPC/T&A'], [/^corrections/i, 'Corrections'], [/finance/i, 'Fin. & Budget'],
    [/^international$/i, 'Int’l'], [/^literature/i, 'Literature'], [/^nominating/i, 'Nominating'], [/^public information/i, 'PI'], [/sharing/i, 'Sharing']];
  const secLabel = (l) => (/c\.?\s?p\.?\s?c|cooperation/i.test(l) ? 'CPC' : /treatment|accessib/i.test(l) ? 'T&A' : /international conv/i.test(l) ? 'IC' : /regional forum/i.test(l) ? 'RF' : l);
  const tcShort = (n) => { const s = String(n || ''); const h = TC_SHORT.find(([re]) => re.test(s)); return h ? h[1] : s; };
  const MTYPE = {
    chair: '<span class="badge chair">Chair</span>',
    appointed: '<span class="badge" data-tip="Appointed committee member (not a trustee)" tabindex="0">ACM</span>',
    consultant: '<span class="badge" data-tip="Consultant to the committee" tabindex="0">cons.</span>',
    member: '<span class="bm-dot" role="img" aria-label="member">●</span>',
  };
  const MTEXT = { chair: 'chair', appointed: 'ACM', consultant: 'consultant', member: '' };
  const LEGEND = '<p class="small muted bm-legend"><span class="bm-dot">●</span> member · <span class="badge chair">Chair</span> chair · <span class="badge">ACM</span> appointed committee member (not a trustee) · <span class="badge">cons.</span> consultant. Name variants printed in different lists (Tom I. / Thomas (Tom) I.) are merged into one row. <em>Members</em> counts the chair, members and ACMs; +N are consultants.</p>';

  // GSB officer titles in one order ('First Vice-Chair' …), as core.js normalises them.
  const TITLES = ['Chair', 'Interim Chair', 'First Vice-Chair', 'Second Vice-Chair', 'Treasurer', 'Secretary', 'Assistant Treasurer', 'Assistant Secretary'];
  const normTitle = (t) => { const s = String(t || '').toLowerCase(); return s.includes('interim') ? 'Interim Chair' : /^chair/.test(s) ? 'Chair' : /first/.test(s) ? 'First Vice-Chair' : /second/.test(s) ? 'Second Vice-Chair' : /assistant tr/.test(s) ? 'Assistant Treasurer' : /assistant sec/.test(s) ? 'Assistant Secretary' : /treas/.test(s) ? 'Treasurer' : /secret/.test(s) ? 'Secretary' : t; };
  const byTitle = (list) => list.map((o) => Object.assign({}, o, { title: normTitle(o.title) })).sort((a, b) => TITLES.indexOf(a.title) - TITLES.indexOf(b.title));

  // ---------- seats and the corporate-board pattern ----------
  const REG_PIDS = Object.values(FCR.REGION_SEAT);
  const sched = () => (RAW.rules && RAW.rules.regional_trustee_schedule) || [];
  const latestSlate = () => (BOARD.slates || []).slice().sort((a, b) => a.conference_year - b.conference_year).pop() || null;
  /** Corporate board a person sits on in the latest slate ('AAWS' | 'AA Grapevine' | null). */
  const boardNow = (name) => { const s = latestSlate(); if (!s) return null; if ((s.aaws_directors || []).some((d) => same(d.name, name))) return 'AAWS'; if ((s.grapevine_directors || []).some((d) => same(d.name, name))) return 'AA Grapevine'; return null; };
  /** Regional trustees elected at Conference yr: names when known, else "the Northeast and Southwest regional trustees elected in 2027". */
  function cohort(yr) {
    const slots = FCR.positionHistory().filter((p) => REG_PIDS.includes(p.pid) && p.start === yr);
    if (slots.length) return { slots, known: true, text: listAnd(slots.map((p) => esc(p.name))) };
    const rs = sched().filter((s) => /regional/i.test(s.position) && (s.election_years || []).includes(yr)).map((s) => s.position.replace(/ regional trustee/i, ''));
    return { slots: [], known: false, text: `the ${rs.length ? listAnd(rs) + ' ' : ''}regional trustees elected in ${yr}` };
  }
  /** Expected corporate-board moves at the annual meeting after Conference Y (pattern R6-H8: regional trustees serve
      on AAWS or AA Grapevine in trustee years 2–3; each new pair splits one AAWS + one Grapevine). HTML sentence. */
  function corpMoves(Y) {
    const join = cohort(Y - 1), leave = cohort(Y - 3);
    const lv = leave.slots.map((p) => ({ name: p.name, board: boardNow(p.name) }));
    const lvText = lv.length ? (lv.every((x) => x.board) && lv.length === 2 && lv[0].board !== lv[1].board
      ? `one on ${lv[0].board} succeeding ${esc(lv[0].name)}, one on ${lv[1].board} succeeding ${esc(lv[1].name)}`
      : `succeeding ${listAnd(lv.map((x) => esc(x.name) + (x.board ? ` (${x.board})` : '')))}`) : `succeeding ${leave.text}`;
    return `After the ${Y} Conference ${join.text} ${join.known && join.slots.length === 1 ? 'is' : 'are'} expected to join the corporate boards (${lvText}).`;
  }
  /** The person's slot in a seat (positionHistory), preferring the one that covers `year`. */
  const slotOf = (ph, name, pid, year) => ph.find((s) => s.pid === pid && (s.years.includes(year) || s.electedAfter === year) && s.aliases.some((a) => same(a, name)))
    || ph.find((s) => s.pid === pid && s.aliases.some((a) => same(a, name))) || null;
  /** One wording for a seat's end everywhere: "rotates 2028 (proj.)", "served to 2026", "left Jan. 2023". */
  function rotText(s, year) {
    if (!s || !s.end) return '';
    if (s.leftYear) return `left the board ${esc(s.servedThru || s.leftYear)}`;
    if (s.movedUpYear && s.end === s.movedUpYear) return `moved up ${s.movedUpYear} → ${esc(FCR.positionLabel({ pid: s.movedTo, board: s.board }))}`;
    const known = !!s.rotatingYear || !s.isCurrent;
    if (s.end === year) return known ? `rotates at the close of the ${year} Conference` : `rotates ${year} (proj.)`;
    if (s.end < year) return `rotated ${s.end}`;
    return known ? `served to ${s.end}` : `rotates ${s.end} (proj.)`;
  }
  const chairOf = (name, year) => (BOARD.gsb_chairs || []).find((c) => !c.interim && same(c.name, name) && (c.from == null ? c.to - 4 : c.from) < year && year <= c.to) || null;

  // ---------- TRUSTEES & BOARDS ----------
  V.board = function (el, args) {
    const rawYear = parseInt(args && args[0], 10);
    const year = FCR.Y(rawYear) ? rawYear : FCR.latestYear;
    const Y = FCR.Y(year) || {};
    const ph = FCR.positionHistory();
    const cyc = FCR.cycle();
    const co = FCR.currentOfficers();
    const trustees = Y.trustees || [];
    const tc = Y.trustees_committees || [];
    const seated = trustees.filter((t) => !t.emeritus);
    const pidOf = (t) => t.position_id || 'OTHER';
    const isChair = (t) => pidOf(t) === 'GSB_CHAIR' || !!chairOf(t.name, year);
    const chairSeat = seated.filter(isChair);
    const regional = seated.filter((t) => !isChair(t) && REG_PIDS.includes(pidOf(t))).sort((a, b) => REG_PIDS.indexOf(pidOf(a)) - REG_PIDS.indexOf(pidOf(b)));
    const classA = seated.filter((t) => !isChair(t) && t.class === 'A').sort((a, b) => (a.elected_year || 0) - (b.elected_year || 0));
    const OTH = ['TAL_US', 'TAL_CANADA', 'GST', 'OTHER'];
    const gstBoard = (t) => { const s = slotOf(ph, t.name, 'GST', year); return (s && (s.boardByYear[year] || s.board)) || ''; };
    const others = seated.filter((t) => !isChair(t) && t.class !== 'A' && !REG_PIDS.includes(pidOf(t)))
      .sort((a, b) => OTH.indexOf(pidOf(a)) - OTH.indexOf(pidOf(b)) || gstBoard(a).localeCompare(gstBoard(b)));
    const dirs = Y.nontrustee_directors || [];
    const bs = FCR.boardSize(year);
    const seats = 21 + (bs.chairB ? 1 : 0);

    // committee memberships (merged name variants) for cards, the matrix and the phone lists
    const memberOf = (c, names) => (c.members || []).find((m) => names.some((n) => same(n, m.name))) || null;
    const committeesOf = (names) => tc.map((c) => ({ c, m: memberOf(c, names) })).filter((x) => x.m);
    const cmteLine = (t) => {
      const list = committeesOf([t.name]);
      if (list.length) return list.map(({ c, m }) => `<span data-tip="${esc(c.committee)}">${esc(tcShort(c.committee))}</span>${m.type === 'chair' ? ' <span class="small">(chair)</span>' : ''}`).join(' · ');
      return (t.trustee_committees || []).map(esc).join(' · ');
    };

    const card = (t, opt) => {
      opt = opt || {};
      const pid = opt.pid || pidOf(t);
      const s = slotOf(ph, t.name, pid, year);
      const ce = pid === 'GSB_CHAIR' || opt.chair ? chairOf(t.name, year) || (BOARD.gsb_chairs || []).find((c) => same(c.name, t.name) && !c.interim) : null;
      const badges = [];
      if (ce || pid === 'GSB_CHAIR') badges.push('<span class="badge chair">Chair</span>');
      if (s && s.leftYear === year) badges.push(`<span class="badge rot">left ${esc(s.servedThru || year)}</span>`);
      else if (s && s.movedUpYear === year) badges.push(`<span class="badge rot" data-tip="Leaves this seat at the annual meeting after the ${year} Conference" tabindex="0">moves up ${year}</span>`);
      else if (t.rotating || (s && s.end === year)) badges.push(`<span class="badge rot" data-tip="Rotates at the close of the ${year} Conference" tabindex="0">rotating ${year}</span>`);
      else if (s && s.firstTermEnd === year && s.end > year) badges.push(`<span class="badge soft" data-tip="First 3-year term ends; Class A trustees may serve a second term" tabindex="0">first term ends ${year}</span>`);
      const label = pid === 'GST' && s && (s.boardByYear[year] || s.board) ? FCR.positionLabel({ pid, board: s.boardByYear[year] || s.board })
        : pid.startsWith('DIR_') || (FCR.POSITIONS[pid] && !/^(GSB_CHAIR|OTHER)$/.test(pid)) ? FCR.POSITIONS[pid] : (t.position || FCR.POSITIONS[pid] || '');
      const start = s ? s.start : t.seat_since || t.elected_year;
      let line;
      if (ce) line = joinDot([ce.chair_since || ce.from ? `Chair since ${ce.chair_since || ce.from}` : `Chair until ${ce.to}`, 'four-year chair term',
        ce.to > FCR.latestYear ? `rotates ${ce.to} (proj.)` : ce.chair_since || ce.from ? `to ${ce.served_thru || ce.to}` : '', ce.class === 'A' ? 'Class A' : 'Class B']);
      else if (s && s.firstTermEnd && s.firstTermEnd >= year && s.firstTermEnd < s.end && s.isCurrent) line = joinDot([start ? `Elected ${start}` : '', `first term ends ${s.firstTermEnd}`, `rotates by ${s.end} (proj.)`]);
      else line = joinDot([start ? `Elected ${start}` : '', rotText(s, year)]);
      const earlier = ce ? `<div class="small muted">${esc(ce.note || '')}${!ce.note && t.prior_position ? 'Earlier: ' + esc(t.prior_position) : ''}</div>` : '';
      return `<div class="card bd-card${opt.cls ? ' ' + opt.cls : ''}">
        <div class="bd-card-h"><strong>${UI.personLink(t.name)}</strong>${badges.join('')}</div>
        <div class="small ink2">${joinDot([esc(label), esc(t.city || '')])}</div>
        <div class="small">${joinDot([line, pdHtml(t.past_delegate || (s && s.past))])}</div>${earlier}
        ${(t.board_roles || []).length ? `<div class="bd-roles">${t.board_roles.map((r) => `<span class="chip accent">${esc(r)}</span>`).join('')}</div>` : ''}
        ${opt.noCmte ? '' : (() => { const c = cmteLine(t); return c ? `<div class="small muted bd-cmte">${c}</div>` : ''; })()}
      </div>`;
    };
    const section = (title, list, note, id) => `<h2 class="section-title"${id ? ` id="${id}"` : ''}>${title}</h2>${note ? `<p class="small muted bd-note">${note}</p>` : ''}<div class="grid gauto bd-cards">${list.join('') || UI.empty('No data')}</div>`;

    // ---- officers: printed list (serving at Conference Y) vs the slate elected right after it ----
    const slates = BOARD.slates || [];
    const sAfter = slates.find((s) => s.conference_year === year), sBefore = slates.find((s) => s.conference_year === year - 1);
    const meetingOf = (s) => { if (!s) return ''; const d = fmtD(s.meeting_date); return d ? (s.date_approx ? 'about ' + d : d) : `after the ${s.conference_year} Conference`; };
    const printed = byTitle(Y.gsb_officers || []);
    const offChip = (o, prev) => {
      const changed = prev && prev.length && !prev.some((p) => p.title === o.title && same(p.name, o.name));
      return `<span class="chip bd-off"><strong>${esc(o.title)}</strong> ${/^\(/.test(o.name) ? esc(o.name) : UI.personLink(o.name)}${o.third_legacy ? ' <abbr class="muted" data-tip="Elected by Third Legacy Procedure (since 2024)" tabindex="0">3L</abbr>' : ''}${o.employee ? ' <span class="muted" data-tip="GSO employee, not a trustee" tabindex="0">*</span>' : ''}${changed ? ' <span class="badge new">new</span>' : ''}</span>`;
    };
    const isCur = co && co.source === 'slate' && co.conferenceYear === year;
    const corpChair = (key, Yr) => {
      const pr = ((FCR.Y(Yr + 1) || {})[key] || []).find((d) => /chair/i.test(d.role || ''));
      if (pr) return `${UI.personLink(pr.name)} <span class="small muted">(printed in the ${Yr + 1} report)</span>`;
      if (co && co.conferenceYear === Yr) {
        const bc = co.boardChairs[key === 'aaws_directors' ? 'aaws' : 'grapevine'];
        if (bc && bc.name) return UI.personLink(bc.name);
        if (bc && bc.pattern) return `<span class="muted">not published</span> — ${esc(bc.pattern.text)}${bc.pattern.candidates.length ? ` (${listAnd(bc.pattern.candidates.map((n) => UI.personLink(n)))})` : ''}`;
      }
      return '<span class="muted">not published</span>';
    };
    const pendingNote = isCur && cyc.reportPending && cyc.lastConference > year ? `<p class="callout warn small">The ${cyc.lastConference} Conference has met; the officers elected at the ${cyc.lastConference} annual meeting appear here when the ${cyc.lastConference} Final Report is loaded.</p>` : '';
    const officers = `<div class="card bd-officers" id="bd-off"><h3>Officers of the General Service Board</h3>${pendingNote}
      <div class="grid g2">
        <div><h4>Serving at the ${year} Conference</h4>
          <p class="small muted">As printed in the ${year} report: elected at the annual meeting after the ${year - 1} Conference${sBefore ? ' (' + meetingOf(sBefore) + ')' : ''}.</p>
          <div class="flex">${printed.map((o) => offChip(o)).join('') || '<span class="muted small">Not printed.</span>'}</div></div>
        <div class="bd-off-now"><h4>${isCur ? `Current officers — since ${meetingOf(sAfter)}` : `Elected after the ${year} Conference${sAfter ? ' (' + meetingOf(sAfter) + ')' : ''}`}</h4>
          ${sAfter ? `<p class="small muted">Slate presented to the ${year} Conference; serves ${yr2(year, year + 1)}. Source: ${esc(refText(sAfter.ref))}.</p>
            <div class="flex">${byTitle(sAfter.gsb_officers || []).map((o) => offChip(o, printed)).join('')}</div>
            <div class="small bd-corpchairs"><div>AAWS board chair ${yr2(year, year + 1)}: ${corpChair('aaws_directors', year)}</div><div>AA Grapevine board chair ${yr2(year, year + 1)}: ${corpChair('grapevine_directors', year)}</div></div>`
          : `<p class="small muted">No slate recorded for ${year}.</p>`}</div>
      </div></div>`;

    // ---- trustees' committee matrix (desktop) + per-committee lists (phone) ----
    const rowsM = [];
    const addRow = (n, group) => { let r = rowsM.find((x) => x.names.some((y) => same(y, n))); if (!r) rowsM.push((r = { name: n, names: [n], group })); else if (!r.names.includes(n)) r.names.push(n); return r; };
    chairSeat.concat(regional, others, classA).forEach((t) => addRow(t.name, 'Trustees'));
    dirs.forEach((d) => addRow(d.name, 'Nontrustee directors'));
    tc.forEach((c) => (c.members || []).forEach((m) => addRow(m.name, 'Emeriti, appointed members, consultants, staff')));
    const groups = [...new Set(rowsM.map((r) => r.group))];
    // members exclude consultants, whom the rosters list separately ('*** Consultant')
    const nMem = (c) => (c.members || []).filter((m) => m.type !== 'consultant').length, nCons = (c) => (c.members || []).length - nMem(c);
    const exOfficio = (r) => chairSeat.some((t) => same(t.name, r.name) && !t.served_thru) && !tc.some((c) => memberOf(c, r.names));
    // interim-chair years (2023, 2024): the interim chair keeps their own rows and is marked; a trustee who left before the Conference is marked
    const interimChair = (Y.gsb_officers || []).find((o) => /chair/i.test(o.title || '') && /interim|acting/i.test(o.title || '') && !/vice/i.test(o.title || ''));
    const leftOf = (r) => trustees.find((t) => t.served_thru && r.names.some((n) => same(n, t.name)));
    const rowNote = (r) => (interimChair && r.names.some((n) => same(n, interimChair.name)) ? ' <span class="badge" data-tip="Interim GSB chair — ex officio on every trustees’ committee" tabindex="0">interim chair</span>'
      : leftOf(r) ? ` <span class="badge rot" data-tip="Left the board before the ${year} Conference" tabindex="0">left ${esc(leftOf(r).served_thru)}</span>` : '');
    // bordered grid: fixed equal committee columns (data-col drives the column highlight), counts + secretaries in the footer
    const bmHead = (s) => esc(s).replace(/^Compensation$/, 'Compen&shy;sation');
    const matrix = tc.length ? `<div class="table-wrap bm-wrap"><table class="t compact bm" style="--bm-n:${tc.length}"><colgroup><col class="bm-c0">${tc.map(() => '<col>').join('')}</colgroup>
      <thead><tr><th scope="col">Member</th>${tc.map((c, i) => `<th scope="col" class="bm-c" data-col="${i}" data-tip="${esc(c.committee)}${FCR.secretaries(c).length ? ' · secretary ' + esc(FCR.secretaries(c).map((x) => x.name).join(', ')) : ''}" tabindex="0">${bmHead(tcShort(c.committee))}</th>`).join('')}</tr></thead><tbody>
        ${groups.map((g) => `<tr class="bm-group"><th scope="rowgroup" colspan="${tc.length + 1}"><span>${esc(g)}</span></th></tr>` + rowsM.filter((r) => r.group === g).map((r) => `<tr><th scope="row" class="bm-name">${UI.personLink(r.name)}${r.names.length > 1 ? ` <span class="bm-var" data-tip="Also printed as ${esc(r.names.slice(1).join(' · '))}" tabindex="0">+${r.names.length - 1}</span>` : ''}${rowNote(r)}</th>${exOfficio(r) ? `<td colspan="${tc.length}" class="bm-ex"><span>GSB chair — ex officio on every trustees’ committee</span></td>` : tc.map((c, i) => { const m = memberOf(c, r.names); return `<td class="bm-c" data-col="${i}">${m ? MTYPE[m.type] || MTYPE.member : ''}</td>`; }).join('')}</tr>`).join('')).join('')}
      </tbody><tfoot>
        <tr class="bm-count"><th scope="row">Members</th>${tc.map((c, i) => `<td class="bm-c num" data-col="${i}">${nMem(c)}${nCons(c) ? ` <span class="small muted" data-tip="${nCons(c)} consultant${nCons(c) === 1 ? '' : 's'} (listed, not members)" tabindex="0">+${nCons(c)}</span>` : ''}</td>`).join('')}</tr>
        <tr class="bm-sec"><th scope="row">GSO Staff secretary</th>${tc.map((c, i) => `<td class="bm-c" data-col="${i}">${FCR.secretaries(c).map((x) => UI.personLink(x.name) + (x.label ? ` <span class="muted">(${esc(secLabel(x.label))})</span>` : '')).join('<br>') || '<span class="muted">—</span>'}</td>`).join('')}</tr>
      </tfoot></table></div>` : UI.empty('No trustees’ committee roster in this report.');
    const phoneList = `<div class="bm-phone">${tc.map((c) => {
      const ch = (c.members || []).find((m) => m.type === 'chair');
      return `<details><summary>${esc(tcShort(c.committee))} <span class="small muted">· ${ch ? 'chair ' + esc(ch.name) + ' · ' : ''}${nMem(c)} member${nMem(c) === 1 ? '' : 's'}${nCons(c) ? ` + ${nCons(c)} cons.` : ''}</span></summary>
        <div class="small muted">${esc(c.committee)}</div>
        <ul class="bm-list">${(c.members || []).map((m) => `<li>${UI.personLink(m.name)}${MTEXT[m.type] ? ` <span class="small muted">${MTEXT[m.type]}</span>` : ''}</li>`).join('')}</ul>
        ${FCR.secretaries(c).length ? `<div class="small">Secretary: ${FCR.secretaries(c).map((x) => UI.personLink(x.name) + (x.label ? ` (${esc(x.label)})` : '')).join(', ')}</div>` : ''}</details>`;
    }).join('')}</div>`;

    // ---- AAWS / AA Grapevine boards: printed list and the slate elected after this Conference ----
    const roleOf = (name, Yr) => {
      const s = ph.find((p) => p.aliases.some((a) => same(a, name)) && p.start <= Yr && (p.end || 9999) > Yr && (p.years.length ? p.years[0] <= Yr + 1 : true));
      if (!s) return '';
      return s.pid.startsWith('REG_') ? 'regional trustee' : s.pid === 'GST' ? 'general service trustee' : s.pid === 'CLASS_A' ? 'Class A trustee' : s.pid.startsWith('DIR_') ? 'nontrustee director' : s.pid.startsWith('TAL') ? 'trustee-at-large' : '';
    };
    const corpCard = (title, key, slKey) => {
      const pr = Y[key] || [];
      const sl = sAfter ? sAfter[slKey] || [] : [];
      return `<div class="card"><h3>${title}</h3><div class="bd-two">
        <div><div class="small muted">Printed in the ${year} report (board ${yr2(year - 1, year)})</div>
          <ul class="bd-plain">${pr.map((d) => `<li>${UI.personLink(d.name)} <span class="small muted">${esc(d.role || '')}</span></li>`).join('') || '<li class="muted small">Not printed.</li>'}</ul></div>
        ${sAfter ? `<div><div class="small muted">Elected ${meetingOf(sAfter)} (board ${yr2(year, year + 1)})</div>
          <ul class="bd-plain">${sl.map((d) => `<li>${UI.personLink(d.name)} <span class="small muted">${d.employee ? 'employee*' : d.nonalcoholic ? 'Class A (nonalcoholic)' : roleOf(d.name, year)}</span>${pr.length && !pr.some((p) => same(p.name, d.name)) ? ' <span class="badge new">new</span>' : ''}</li>`).join('')}</ul>
          <div class="small">Chair: ${corpChair(key, year)}</div></div>` : ''}
      </div></div>`;
    };

    // ---- patterns (display only) ----
    const latest = year === FCR.latestYear;
    const pt = (id) => { const p = pattern(id); return p ? `${esc(p.text)} <span class="muted">(${esc(refText(p.ref))})</span>` : ''; };
    const patterns = `<div class="card bd-patterns"><h3>How the corporate boards are staffed <span class="small muted">patterns in 2017–2026, not rules</span></h3><ul>
      <li>${pt('regional_on_corporate_boards')}${latest ? `<br><strong>Next:</strong> ${corpMoves(cyc.nextConference)}` : ''}</li>
      <li>${pt('board_chair_alternation')}${latest && co && co.boardChairs ? `<br><strong>${yr2(co.conferenceYear, co.conferenceYear + 1)}:</strong> AAWS — ${corpChair('aaws_directors', co.conferenceYear)}; AA Grapevine — ${corpChair('grapevine_directors', co.conferenceYear)}.` : ''}</li>
      <li>${pt('gst_from_directors')}</li>
      <li>${pt('treasurer_class_a')}</li>
    </ul></div>`;

    // ---- emeriti ----
    const att = ((BOARD.trustees_emeriti || {}).attending || []).find((e) => e.year === year);
    const em = trustees.filter((t) => t.emeritus).map((t) => ({ name: t.name, note: t.note || 'Trustee emeritus' }));
    ((att && att.names) || []).forEach((n) => { if (!em.some((e) => same(e.name, n))) em.push({ name: n, note: 'Trustee emeritus (attended)' }); });
    const emNotes = ((BOARD.trustees_emeriti || {}).notes || []).filter((n) => n.year === year);

    const src = Y.source || {};
    const pages = /rosters? on PDF pp?\.\s*([\d]+\s*[-–]\s*\d+)/i.exec(Y.notes || '');
    // the board now: the trustee slate elected at the annual meeting right after this Conference (when that slate is current)
    const now = co && co.source === 'slate' && co.conferenceYear === year && cyc.lastConference <= year && co.trustees && (co.trustees.A || []).length ? co.trustees : null;   // until the next Conference meets
    const nowNames = now ? now.A.concat(now.B || []) : [];
    const joined = nowNames.filter((n) => !seated.some((t) => same(t.name, n)));
    const leftNow = now ? seated.filter((t) => !nowNames.some((n) => same(n, t.name))).map((t) => t.name) : [];
    const nowLine = now ? `<p class="callout small bd-now"><strong>Now: ${nowNames.length} trustees (${now.A.length} Class A + ${(now.B || []).length} Class B)</strong>, elected at the annual meeting on ${meetingOf(sAfter)}.${joined.length ? ` Joined then: ${listAnd(joined.map((n) => UI.personLink(n)))}${/\.$/.test(joined[joined.length - 1]) ? '' : '.'}` : ''}${leftNow.length ? ` Rotated off: ${listAnd(leftNow.map((n) => UI.personLink(n)))}${/\.$/.test(leftNow[leftNow.length - 1]) ? '' : '.'}` : ''} The cards below count the ${bs.total} trustees listed at the ${year} Conference${bs.total < seats ? ` (${seats - bs.total} seat${seats - bs.total === 1 ? '' : 's'} vacant then)` : ''}.</p>` : '';
    const yearSel = UI.yearSelect('b-year', FCR.years, year);
    el.innerHTML = ROOT_CLASS('bd-page', `
      <div class="page-head"><div><h1>General Service Board, trustees' committees &amp; boards</h1>
        <p>21 trustees: 7 Class A (nonalcoholic) and 14 Class B (alcoholic) — 8 regional, 2 trustees-at-large (U.S. and Canada), 4 general service trustees (2 on each corporate board).
        A Class B board chair sits in an <em>additional</em> Class B seat, so the board has 22. The AAWS and AA Grapevine boards add nontrustee directors.</p></div>
        <label>Year ${yearSel}</label></div>
      ${nowLine}
      <div class="grid g4 bd-stats">
        <div class="card stat"><span class="v num">${bs.total || '—'}</span><span class="l">trustees at the ${year} Conference, as listed in the report</span></div>
        <div class="card stat"><span class="v num">${bs.a}</span><span class="l">Class A (nonalcoholic)</span></div>
        <div class="card stat"><span class="v num">${bs.b}</span><span class="l">Class B (alcoholic)${bs.chairB ? ', incl. the chair' : ''}</span></div>
        <div class="card stat"><span class="v num">${seats} seats</span><span class="l">${bs.chairB ? 'the Class B chair adds one' : 'the chair holds a regular seat'}${bs.total && bs.total < seats ? ` · ${seats - bs.total} vacant at the Conference` : ''}</span></div>
      </div>
      ${jumpNav([['bd-off', 'Officers'], chairSeat.length ? ['bd-chair', 'Chair'] : null, ['bd-reg', 'Regional'], ['bd-oth', 'At-large &amp; GST'], ['bd-classa', 'Class A'], ['bd-dirs', 'Directors'],
        (Y.newly_elected || []).length ? ['bd-new', 'Newly elected'] : null, ['bd-corp', 'Corporate boards'], ['bd-tc', 'Trustees’ committees']].filter(Boolean))}
      ${officers}
      ${chairSeat.length ? section('Board chair', chairSeat.map((t) => card(t, { chair: true, noCmte: pidOf(t) === 'GSB_CHAIR' })), bs.chairB ? 'A Class B chair sits in an extra seat, so the board has 22 trustees until the chair term ends (Service Manual p. 58). The chair is ex officio on every trustees’ committee.' : 'A Class A chair serves a four-year chair term over and above the Class A term (Service Manual p. 69).', 'bd-chair') : ''}
      ${section('Regional trustees', regional.map((t) => card(t)), 'Four one-year terms on a fixed Service Manual calendar (p. 54). In years 2–3 each regional trustee usually also serves on the AAWS or AA Grapevine board.', 'bd-reg')}
      ${section('Trustees-at-large &amp; general service trustees', others.map((t) => card(t)), 'General service trustees come from the corporate boards: two serve on AAWS and two on AA Grapevine.', 'bd-oth')}
      ${section('Class A (nonalcoholic) trustees', classA.map((t) => card(t)), 'Up to two three-year terms; the first-term end is shown because a trustee may leave then.', 'bd-classa')}
      ${section('Nontrustee directors', dirs.map((d) => card(d, { pid: /grape/i.test(d.board || '') ? 'DIR_GRAPEVINE' : 'DIR_AAWS' })), 'Directors of AAWS or AA Grapevine who are not trustees (up to four years); a general service trustee opening is usually filled from them.', 'bd-dirs')}
      ${(Y.newly_elected || []).length ? `<h2 class="section-title" id="bd-new">Elected following the ${year} Conference</h2><div class="grid gauto bd-cards">${Y.newly_elected.map((n) => `<div class="card bd-card"><div class="bd-card-h"><strong>${UI.personLink(n.name)}</strong><span class="badge new">new</span></div>
          <div class="small ink2">${joinDot([esc(FCR.POSITIONS[n.position_id] && n.position_id !== 'OTHER' ? FCR.POSITIONS[n.position_id] : n.position || ''), esc(n.city || '')])}</div>
          <div class="small">${joinDot([sAfter && isoD(sAfter.meeting_date) && isoD(sAfter.meeting_date) <= FCR.today() ? `took the seat ${meetingOf(sAfter)}` : `takes the seat ${sAfter ? 'on ' + meetingOf(sAfter) : 'at the annual meeting'}`, n.succeeds ? 'succeeds ' + esc(n.succeeds) : '', pdHtml(n.past_delegate)])}</div></div>`).join('')}</div>` : ''}
      ${em.length ? `<h2 class="section-title">Trustees emeriti</h2><div class="grid gauto bd-cards">${em.map((t) => `<div class="card bd-card"><strong>${UI.personLink(t.name)}</strong><div class="small ink2">${esc(t.note)}</div></div>`).join('')}</div>${emNotes.map((n) => `<p class="small muted">${esc(n.text)} (${esc(n.ref)})</p>`).join('')}` : ''}
      <h2 class="section-title" id="bd-corp">AAWS and AA Grapevine boards</h2>
      <div class="grid g2">${corpCard('AAWS board', 'aaws_directors', 'aaws_directors')}${corpCard('AA Grapevine board', 'grapevine_directors', 'grapevine_directors')}</div>
      <p class="small muted">* GSO / Grapevine employee. Report ${year} prints the boards that served ${yr2(year - 1, year)}; the slate elected after the Conference serves ${yr2(year, year + 1)}.</p>
      ${patterns}
      <h2 class="section-title" id="bd-tc">Who sits on which trustees' committee (${year})</h2>
      ${LEGEND}${matrix}${phoneList}
      <p class="small">Which Conference committee each trustees’ committee works with, with both memberships side by side: <a href="#/structure/${year}/pairs">Structure → committee pairs</a>.</p>
      <p class="small muted bd-src">Source: ${year} Final Report${src.edition ? ' (' + esc(String(src.edition).replace(/^./, (c) => c.toUpperCase())) + ' edition)' : ''}${pages ? ', rosters on PDF pp. ' + esc(pages[1]) : ''}${sAfter ? '; slate ' + esc(refText(sAfter.ref)) : ''}. ${pdfLink(year)}</p>`);
    el.querySelector('#b-year').addEventListener('change', (e) => { location.hash = '#/board/' + e.target.value; });
    wireJumps(el);
    // matrix: highlight the hovered committee's column (the row highlight is CSS)
    const bm = el.querySelector('table.bm');
    if (bm) {
      let hc = null;
      const mark = (i) => { if (i === hc) return; bm.querySelectorAll('.bm-hc').forEach((x) => x.classList.remove('bm-hc')); hc = i; if (i != null) bm.querySelectorAll(`[data-col="${i}"]`).forEach((x) => x.classList.add('bm-hc')); };
      bm.addEventListener('mouseover', (e) => { const c = e.target.closest('[data-col]'); mark(c ? c.dataset.col : null); });
      bm.addEventListener('mouseleave', () => mark(null));
    }
  };

  // ---------- GSO STAFF ----------
  // Every printed assignment / secretaryship maps to one desk, so each year shows one chip per desk instead of
  // "Corrections / Conf. Corrections / Trustees' Corrections". Order = display order.
  const DESKS = {
    SCOORD: ['Staff coord.', 'Staff coordinator (also GSB assistant secretary and an AAWS director)'],
    SSD: ['Staff Services', 'Director of Staff Services'],
    CONF: ['Conference', 'Conference desk: Conference coordinator; secretary of the Conference Committee on Agenda and the trustees’ Conference Committee'],
    TRU: ['Trustees/Nom.', 'Conference Committee on Trustees and trustees’ Nominating Committee'],
    CPC: ['CPC', 'Cooperation with the Professional Community'], TA: ['T&A', 'Treatment and Accessibilities'],
    CPCTA: ['CPC/T&A', 'Cooperation with the Professional Community / Treatment and Accessibilities'],
    REMOTE: ['Remote Comm.', 'Remote Communities'], COR: ['Corrections', 'Corrections'], FIN: ['Finance', 'Finance / Self-Support'],
    GV: ['Grapevine', 'Grapevine and La Viña'], LIT: ['Literature', 'Literature'], PA: ['Policy/Adm.', 'Policy and Admissions'],
    PI: ['PI', 'Public Information'], RC: ['R&C', 'Report and Charter'], ARC: ['Archives', 'Archives'],
    IC: ['Int’l Conv.', 'International Conventions'], RF: ['Reg. Forums', 'Regional Forums'], ICRF: ['IC/RF', 'International Conventions/Regional Forums'],
    INTL: ['International', 'International (trustees’ International Committee)'], WSM: ['WSM', 'World Service Meeting'],
    GS: ['Group Serv.', 'Group Services'], AUDIT: ['Audit', 'Trustees’ Audit Committee'], COMP: ['Compensation', 'Trustees’ Compensation Committee'],
    SHARE: ['Sharing', 'GSB Sharing Session'],
  };
  const DESK_ORDER = Object.keys(DESKS);
  const CONF_DESK = { AGENDA: 'CONF', CPC: 'CPC', CORRECTIONS: 'COR', FINANCE: 'FIN', GRAPEVINE: 'GV', LITERATURE: 'LIT', POLICY: 'PA', PI: 'PI', REPORT: 'RC', TREATMENT: 'TA', SPECIAL_NEEDS: 'TA', TRUSTEES: 'TRU', ARCHIVES: 'ARC', ICRF: 'ICRF' };
  /** Desk keys of one printed assignment ('Trustees’ ICRF committee (secretary, Regional Forums)' -> ['RF']); [] = another role. */
  function desksOf(text) {
    const f = FCR.fold(text), p = FCR.fold((String(text).match(/\(([^)]*)\)/) || [])[1] || '');
    if (/^aaws|aaws director|assistant secretary|correspondent|ad hoc|lim newsletter|communication services|online groups|orientation/.test(f) && !/group services/.test(f)) return [];
    if (/international convention|regional forum|\bicrf\b/.test(f)) {
      const ic = /international convention/.test(p) || (/international convention/.test(f) && !/regional forum/.test(f));
      const rf = /regional forum/.test(p) || (/regional forum/.test(f) && !/international convention/.test(f));
      return [ic ? 'IC' : rf ? 'RF' : 'ICRF'];
    }
    const out = [];
    const cpc = /cooperation|\bcpc\b|\bc p c\b/.test(f), ta = /treatment|accessib|special needs/.test(f);
    if (cpc || ta) out.push(cpc && ta ? 'CPCTA' : cpc ? 'CPC' : 'TA');
    if (/remote communit/.test(f)) out.push('REMOTE');
    if (out.length) return out;
    // strip "conference committee on" / "trustees" prefixes and "committee (secretary)" endings, then name the desk
    const core = f.replace(/\b(co )?secretary\b.*$|\b(interim|acting)\b.*$/g, '').replace(/^(trustees|conference committee on|conference(?= \w+ committee))\s+/, '').replace(/\s*\bcommittee\b\s*$/, '').trim();
    const T = [['SCOORD', /staff coordinator/], ['SSD', /staff services/], ['WSM', /world service meeting/], ['CONF', /^conference( coordinator)?$|^agenda$|^conference agenda$|general service conference|conference coordinator/],
      ['TRU', /^trustees$|nominating/], ['COR', /correction/], ['FIN', /financ|budget|self support/], ['GV', /grapevine|la vina/], ['LIT', /literature/],
      ['PA', /policy|admission/], ['PI', /public information/], ['RC', /report and charter/], ['ARC', /archives/], ['INTL', /^international\b/],
      ['AUDIT', /audit/], ['COMP', /compensation/], ['SHARE', /sharing session/], ['GS', /group services/]];
    const hit = T.find(([, re]) => re.test(core));
    return hit ? [hit[0]] : [];
  }
  /** Desks by person and year: [{name, names, staff, gv, years:{y:{deskKey:{sources[], interim}}}, other:{y:[text]}, titles:{y}}]. */
  function staffDesks() {
    const rows = [];
    const rowOf = (n) => { let r = rows.find((x) => x.names.some((m) => same(m, n))); if (!r) rows.push((r = { name: n, names: [n], years: {}, other: {}, titles: {} })); else if (!r.names.includes(n)) r.names.push(n); return r; };
    const add = (n, y, keys, src, otherText) => {
      const r = rowOf(n), Yd = (r.years[y] = r.years[y] || {});
      if (!keys.length) { if (otherText && !(r.other[y] || []).includes(otherText)) (r.other[y] = r.other[y] || []).push(otherText); return; }
      keys.forEach((k) => { const d = (Yd[k] = Yd[k] || { sources: [], interim: false }); if (!d.sources.includes(src)) d.sources.push(src); if (/interim|acting/i.test(src)) d.interim = true; });
    };
    FCR.years.forEach((y) => {
      const Y = FCR.Y(y);
      (Y.gso_staff || []).forEach((s) => {
        const r = rowOf(s.name); r.staff = true; r.titles[y] = s.title || ''; r.years[y] = r.years[y] || {}; r.name = s.name;  // latest staff-list spelling
        (s.assignments || []).forEach((a) => add(s.name, y, desksOf(a), `GSO Staff list: ${a}`, a));
        if (s.title) add(s.name, y, desksOf(s.title), `title: ${s.title}`, null);
      });
      (Y.conference_committees || []).forEach((c) => FCR.secretaries(c).forEach((x) => {
        const k = c.committee === 'ICRF' && x.label ? desksOf(x.label) : [CONF_DESK[c.committee]].filter(Boolean);
        add(x.name, y, k, `secretary, Conference Committee on ${FCR.COMMITTEES[c.committee] ? FCR.COMMITTEES[c.committee].name : c.committee}${x.label ? ' (' + x.label + ')' : ''}`, null);
      }));
      (Y.trustees_committees || []).forEach((c) => FCR.secretaries(c).forEach((x) => {
        add(x.name, y, desksOf(x.label || c.committee), `secretary, trustees’ ${c.committee} Committee${x.label ? ' (' + x.label + ')' : ''}`, null);
      }));
      (Y.grapevine_staff || []).forEach((s) => { const r = rowOf(s.name); r.gv = true; r.titles[y] = s.title || ''; });
    });
    // a generic CPC/T&A or IC/RF chip is folded into the specific desk the same person-year has
    rows.forEach((r) => Object.values(r.years).forEach((Yd) => {
      if (Yd.CPCTA && (Yd.CPC || Yd.TA)) { (Yd.CPC || Yd.TA).sources.push(...Yd.CPCTA.sources); delete Yd.CPCTA; }
      if (Yd.ICRF && (Yd.IC || Yd.RF)) { (Yd.IC || Yd.RF).sources.push(...Yd.ICRF.sources); delete Yd.ICRF; }
    }));
    rows.forEach((r) => { r.seen = [...new Set(Object.keys(r.years).concat(Object.keys(r.titles)).map(Number))].sort((a, b) => a - b); r.last = r.seen[r.seen.length - 1]; });
    return rows;
  }
  const deskChip = (k, d) => `<span class="chip st-desk" data-tip="${esc(DESKS[k][1])} — ${esc(d.sources.join(' · '))}" tabindex="0">${esc(DESKS[k][0])}${d.interim ? ' <span class="muted">int.</span>' : ''}</span>`;
  const deskChips = (Yd, other) => DESK_ORDER.filter((k) => Yd && Yd[k]).map((k) => deskChip(k, Yd[k])).join('') +
    (other && other.length ? `<span class="chip st-other" data-tip="Also: ${esc(other.join(' · '))}" tabindex="0">+${other.length}</span>` : '');
  /** Public: desk chips of a staff member in a year (for the person page). */
  UI.staffDesks = function (name, year) {
    const r = staffDesks().find((x) => x.names.some((n) => same(n, name)));
    return r && r.years[year] ? deskChips(r.years[year], r.other[year]) : '';
  };

  V.staff = function (el) {
    const yrs = FCR.years.slice().reverse();                 // newest year first
    const L = FCR.latestYear, LY = FCR.Y(L) || {};
    const rows = staffDesks().filter((r) => r.seen.some((y) => (r.years[y] && Object.keys(r.years[y]).length) || r.titles[y])).sort((a, b) => b.last - a.last || (b.staff ? 1 : 0) - (a.staff ? 1 : 0) || a.name.localeCompare(b.name));
    const now = FCR.today();
    const ev = (BOARD.desk_rotations || {}).events || [];
    const lastWide = ev.filter((e) => /office-wide/i.test(e.text)).pop();
    const cc = (BOARD.conference_coordinators || []).slice().pop();
    const tcConf = (LY.trustees_committees || []).find((c) => /^conference$/i.test(c.committee));
    const tcChair = tcConf && (tcConf.members || []).find((m) => m.type === 'chair');
    const drawYear = now.getFullYear(), drawPanel = drawYear - 1949;
    const whenText = (w) => (/^\d{4}-\d{2}(-\d{2})?$/.test(w) ? fmtD(w) : w);
    const hist = (title, list, note) => `<div class="card"><h3>${title}</h3><ul class="st-hist">${list.join('')}</ul>${note ? `<p class="small muted">${note}</p>` : ''}</div>`;
    const gmSpan = (g) => { const a = g.from ? whenText(String(g.from)) : null, b = g.to ? whenText(String(g.to)) : 'today'; return a ? `${a} – ${b}` : (g.seen || []).join(', '); };
    const li = (when, name, extra) => `<li><span class="st-when">${esc(when)}</span> ${UI.personLink(name)}${extra || ''}</li>`;
    const gms = (BOARD.general_managers || []).slice().reverse().map((g) => li(gmSpan(g), g.name, `${g.interim ? ' <span class="small muted">interim</span>' : ''}${g.note ? `<div class="small muted">${esc(g.note)}</div>` : ''}`));
    const yrsOf = (g) => FCR.yearRange(g.years || []);
    const ssd = (BOARD.staff_services_directors || []).slice().reverse().map((g) => li(yrsOf(g), g.name, ` <div class="small muted">${esc(g.title || '')}</div>`));
    const sco = ((BOARD.staff_coordinators || {}).list || []).slice().reverse().map((g) => li(yrsOf(g), g.name));
    const cco = (BOARD.conference_coordinators || []).slice().reverse().map((g) => li(g.from ? 'since ' + fmtD(g.from) : yrsOf(g), g.name));
    const cur = rows.filter((r) => r.staff && (LY.gso_staff || []).some((s) => same(s.name, r.name)));
    const lastWideText = lastWide ? `Last office-wide rotation: ${esc(whenText(lastWide.when))} (${esc(lastWide.text.replace(/^Office-wide rotation[^:]*:\s*/, '').replace(/\.$/, ''))}). ` : '';
    el.innerHTML = ROOT_CLASS('st-page', `
      <div class="page-head"><div><h1>GSO Staff &amp; assignments</h1>
        <p>Twelve GSO Staff members (all A.A. members) each carry an assignment, or “desk” (Conference, Literature, CPC, Corrections …), and serve as secretary of the matching Conference and trustees' committees.
        Desks rotate, so the secretary of a committee changes over time.</p></div></div>
      <div class="grid g2">
        <div class="callout st-callout"><strong>Rotation.</strong> ${lastWideText}Most staff rotate desks about every two years (Service Manual, Concept XI footnote 8: AAWS, with the board's approval, uses a two-year rotation for most staff).
          The next office-wide change is expected in late summer 2027 or 2028; the timing is not fixed.</div>
        <div class="callout st-callout"><strong>The December committee draw</strong> (Panel ${drawPanel}, December ${drawYear}) is run by the Conference coordinator${cc ? `, ${UI.personLink(cc.name)}${cc.from ? ' (since ' + esc(fmtD(cc.from)) + ')' : ''}` : ''},
          with the chair of the trustees’ Conference Committee${tcChair ? ` (${UI.personLink(tcChair.name)} in the ${L} report)` : ''}. <a href="#/predict/${drawPanel}">Panel ${drawPanel} forecast →</a></div>
      </div>
      <div class="grid g2 st-top">
        <div class="card"><h3>GSO Staff (${L} report)</h3><ul class="st-cur">${cur.map((r) => `<li><span class="st-n">${UI.personLink(r.name)}</span> <span class="st-chips">${deskChips(r.years[L], r.other[L])}</span></li>`).join('') || '<li class="muted">No data</li>'}</ul></div>
        <div class="card"><h3>Grapevine / La Viña (${L} report)</h3><ul class="st-cur">${(LY.grapevine_staff || []).map((s) => `<li>${UI.personLink(s.name)} <span class="small muted">${esc(s.title || '')}</span></li>`).join('') || '<li class="muted">No data</li>'}</ul>
          <p class="small muted">The GSO general manager and the Grapevine publisher and editors are employees without a term limit, so no end is projected for them.</p></div>
      </div>
      <h2 class="section-title">Who led the office</h2>
      <div class="grid g4 st-leaders">
        ${hist('GSO general manager', gms)}
        ${hist('Director of Staff Services', ssd)}
        ${hist('Staff coordinator', sco, esc((BOARD.staff_coordinators || {}).note || ''))}
        ${hist('Conference coordinator', cco, 'Coordinates the Conference and runs the December committee draw.')}
      </div>
      <h2 class="section-title">Desks by year</h2>
      <p class="small muted">Newest year first; one chip per desk (hover, focus or tap a chip for the printed sources; “int.” = interim). Rows merge name variants (Zenaida (Zenny) M. / Zenny M.); “+N” lists other roles printed that year (regional correspondent, AAWS director, ad hoc committee secretary …). Committee secretaries who are not GSO Staff (finance, publishing) are included.</p>
      <div class="table-wrap st-wrap"><table class="t compact st-t"><thead><tr><th scope="col">Staff member</th>${yrs.map((y) => `<th scope="col">${y}</th>`).join('')}</tr></thead><tbody>
        ${rows.map((r) => `<tr><th scope="row">${UI.personLink(r.name)}${r.names.length > 1 ? ` <span class="bm-var" data-tip="Also printed as ${esc(r.names.filter((n) => n !== r.name).join(' · '))}" tabindex="0">+${r.names.length - 1}</span>` : ''}<div class="small muted">${esc(FCR.yearRange(r.seen))}${r.gv ? ' · Grapevine' : !r.staff ? ' · secretary' : ''}</div></th>${yrs.map((y) => `<td data-y="${y}">${deskChips(r.years[y], r.other[y]) || (r.titles[y] ? `<span class="small muted">${esc(r.titles[y])}</span>` : '')}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <h2 class="section-title">Desk changes 2017–2026</h2>
      <ul class="timeline-list st-events">${ev.slice().reverse().map((e) => `<li><strong>${esc(whenText(e.when))}</strong> — ${esc(e.text)} <span class="small muted">(${esc(refText(e.ref))})</span></li>`).join('')}</ul>
      <p class="small muted">${esc((BOARD.desk_rotations || {}).note || '')}</p>`);
  };


  // ---------- OPENINGS & ROTATION ----------
  const NOM_SHORT = {
    REG: (s) => `${s.region ? FCR.regionName(s.region) + ' areas' : 'The region’s areas'} send résumés; the Conference elects`,
    TAL_US: () => 'U.S. areas send résumés; the Conference elects',
    TAL_CANADA: () => 'Canadian areas send résumés; the Conference elects',
    GST: (s) => `the ${s.board === 'Grapevine' ? 'AA Grapevine' : s.board === 'AAWS' ? 'AAWS' : 'corporate'} board proposes one of its directors; the GSB elects`,
    CLASS_A: () => 'trustees’ Nominating Committee search; the GSB elects',
    GSB_CHAIR: () => 'trustees’ Nominating Committee; the GSB elects',
    DIR_AAWS: () => 'AAWS board call (Box 4-5-9 and a mailing)',
    DIR_GRAPEVINE: () => 'AA Grapevine board call',
  };
  const ruleKey = (pid) => (pid && pid.startsWith('REG_') ? 'REG' : pid);
  const seatName = (s) => (s.pid.startsWith('REG_') ? `${FCR.regionName(s.region)} regional trustee` : s.pid === 'GSB_CHAIR' ? 'General Service Board chair' : s.label);
  const endDot = (html) => (/\.(<\/a>)?$/.test(html) ? html : html + '.');   // no "Teresa J.." at a sentence end
  /** Latest official Nominating Committee rotation table entry for a year: {n, src} (trustee seats incl. the chair). */
  const officialCount = (y) => { const r = (BOARD.rotation_schedules || []).filter((x) => x.by_year && x.by_year[y]).sort((a, b) => b.source_year - a.source_year)[0]; return r ? { n: r.by_year[y].total, src: r.source_year } : null; };
  /** Date-aware "how and when" line for one seat of the Conference `o.year`. */
  function dueText(s, o) {
    const c = FCR.conference(o.year);
    const conf = `the ${FCR.ordinal(o.year - 1950)} Conference${c.datesKnown ? ' (' + fmtRange(c.startDate, c.endDate) + ')' : ''}`;
    const d = s.deadline;
    if (d && d.date) {
      const dd = isoD(d.date);
      if (!d.passed) return `<span class="op-due">Résumés due ${fmtD(dd)}${d.daysLeft <= 400 ? ' — ' + inDays(d.daysLeft) : ''}</span>`;
      return `<span class="op-closed">Résumés closed ${fmtD(dd)}; elected at ${conf}${c.over ? '' : daysTo(c.startDate) <= 0 ? ' — meeting now' : ' — ' + inDays(daysTo(c.startDate))}</span>`;
    }
    if (s.pid === 'CLASS_A') {
      const n = daysTo(new Date(o.year - 1, 7, 31, 12));
      return n >= 0 ? `Call about June ${o.year - 1}, applications ~Aug 31, ${o.year - 1} (recent pattern, not fixed)${n <= 400 ? ' — ' + inDays(n) : ''}`
        : `Applications closed ~Aug 31, ${o.year - 1} (recent pattern); the GSB elects after ${conf}`;
    }
    if (s.pid === 'GST' || s.pid === 'GSB_CHAIR') return `Elected at the annual meeting after ${conf}`;
    if (d && d.text) return `<span data-tip="${esc(d.text)}" tabindex="0">Board call; dates vary</span>`;
    return '';
  }

  function ganttHtml(cyc) {
    const ph = FCR.positionHistory().filter((p) => p.start);
    const now = FCR.today();
    const tNow = now.getFullYear() + (now - new Date(now.getFullYear(), 0, 1)) / (365.25 * 864e5);
    const OFF = 0.3;   // seats turn over at the annual meeting right after the late-April Conference
    // from 5 years before the first loaded report (older bars are clipped at the left edge) to 6 years ahead
    const y0 = Math.max((FCR.years[0] || 2017) - 5, Math.min(...ph.map((p) => (p.priorClassA ? p.priorClassA.start : p.start)))), y1 = cyc.year + 6;
    const x = (t) => (((Math.max(y0, Math.min(y1, t)) - y0) / (y1 - y0)) * 100).toFixed(2);
    const ROWS = [['CHAIR', 'GSB chair', 'Chair of the General Service Board: every chair (Class A or B, interim chairs included) with the chair term', 1]]
      .concat(REG_PIDS.map((pid) => [pid, FCR.POSITIONS[pid].replace(/ trustee$/, ''), FCR.POSITIONS[pid] + ' (four one-year terms)', 1]))
      .concat([['TAL_US', 'Trustee-at-large/U.S.', 'Trustee-at-large/U.S.', 1], ['TAL_CANADA', 'Trustee-at-large/Canada', 'Trustee-at-large/Canada', 1],
        ['GST_AAWS', 'General service (AAWS)', 'General service trustees on the AAWS board', 2], ['GST_GV', 'General service (AA Grapevine)', 'General service trustees on the AA Grapevine board', 2],
        ['CLASS_A', 'Class A (nonalcoholic)', 'Class A trustees: up to two 3-year terms (tick = first-term end)', 7],
        ['DIR_AAWS', 'AAWS director', 'AAWS nontrustee directors (up to 4 years)', 3], ['DIR_GRAPEVINE', 'AA Grapevine director', 'AA Grapevine nontrustee directors (up to 4 years)', 3]]);
    const grp = (pid, board) => (pid === 'GST' ? (board === 'Grapevine' ? 'GST_GV' : 'GST_AAWS') : pid === 'GSB_CHAIR' ? null : pid);
    const segs = {};
    const add = (g, sg) => { if (g) (segs[g] = segs[g] || []).push(sg); };
    ph.forEach((s) => {
      const g = grp(s.pid, s.board); if (!g) return;
      const lbl = FCR.positionLabel(s);
      if (s.pid === 'CLASS_A' && s.chairSince && s.priorClassA) { add(g, { name: s.name, a: s.priorClassA.start + OFF, b: s.priorClassA.end + OFF, tip: `${s.name} · Class A trustee ${s.priorClassA.start}–${s.priorClassA.end} (then GSB chair, see the chair row)` }); return; }
      const b = s.leftYear ? s.leftYear + 0.05 : s.end + OFF;
      const ends = s.leftYear ? `left ${s.servedThru || s.leftYear}` : s.isCurrent ? `rotates ${s.end} (proj.)` : s.movedUpYear === s.end ? `moved up ${s.end}` : `to ${s.end}`;
      add(g, { name: s.name, a: s.start + OFF, b, cur: s.isCurrent, tick: s.isCurrent && s.firstTermEnd && s.firstTermEnd < s.end && s.firstTermEnd + OFF > tNow ? s.firstTermEnd + OFF : null,
        tip: `${s.name} · ${lbl} · elected ${s.start}, ${ends}${s.isCurrent && s.firstTermEnd && s.firstTermEnd < s.end ? ` · first term ends ${s.firstTermEnd}` : ''}` });
    });
    (BOARD.gsb_chairs || []).forEach((c) => {
      const from = c.from != null ? c.from : c.to - 4;
      let a = from + OFF, b = c.to + OFF;
      if (c.interim && c.from === c.to) { a = c.from + 0.05; b = c.from + OFF; }            // Jan–Apr interim
      if (c.served_thru) b = +(/\d{4}/.exec(c.served_thru) || [c.to])[0] + 0.05;
      const cur = c.to > FCR.latestYear;
      add('CHAIR', { name: c.name, a, b, cur, interim: !!c.interim,
        tip: `${c.name} · ${c.interim ? 'interim ' : ''}GSB chair (Class ${c.class}) · ${c.from == null ? 'until ' + c.to + ' (start before the loaded reports)' : c.from + '–' + (c.served_thru ? c.served_thru : c.to)}${cur ? ' (proj.)' : ''}` });
    });
    FCR.openings(cyc.nextConference, y1 + 6).forEach((o) => o.seats.filter((s) => !s.holder && !s.soft && !s.likely).forEach((s) => {
      add(s.pid === 'GSB_CHAIR' ? 'CHAIR' : grp(s.pid, s.board), { name: `elected ${s.start}`, a: s.start + OFF, b: s.end + OFF, succ: true,
        tip: `${s.label} · to be elected ${s.start}${s.successorOf ? ' (successor of ' + s.successorOf + (s.generation > 1 ? '’s successor' : '') + ')' : ''} · term to ${s.end}` });
    }));
    const bar = (sg) => {
      const A = Math.max(sg.a, y0), B = Math.min(sg.b, y1); if (B <= A) return '';
      const tip = `data-tip="${esc(sg.tip)}" tabindex="0"`;
      const txt = (w) => (w >= 1.8 ? esc(sg.name) : '');
      const cls = sg.succ ? 'succ' : sg.interim ? 'interim' : '';
      let h;
      if (sg.cur && !sg.succ && A < tNow && B > tNow) h = `<div class="og-bar ${cls}" style="left:${x(A)}%;width:${x(tNow) - x(A)}%" ${tip}>${txt(tNow - A)}</div><div class="og-bar proj" style="left:${x(tNow)}%;width:${x(B) - x(tNow)}%" ${tip}>${tNow - A < 1.8 ? txt(B - tNow) : ''}</div>`;
      else h = `<div class="og-bar ${sg.cur && !sg.succ && A >= tNow ? 'proj' : cls}" style="left:${x(A)}%;width:${x(B) - x(A)}%" ${tip}>${txt(B - A)}</div>`;
      if (sg.tick && sg.tick > y0 && sg.tick < y1) h += `<span class="og-tick" style="left:${x(sg.tick)}%" data-tip="${esc(sg.name)}: first 3-year term ends ${Math.floor(sg.tick)}" tabindex="0"></span>`;
      return h;
    };
    const rows = ROWS.map(([g, label, full, seats]) => {
      const list = (segs[g] || []).sort((p, q) => p.a - q.a || (p.succ ? 1 : 0) - (q.succ ? 1 : 0));
      const lanes = [];
      list.forEach((sg) => {   // successors continue their predecessor's lane when they can
        let lane = lanes.find((l) => Math.abs(l.until - sg.a) < 0.02) || lanes.find((l) => l.until <= sg.a + 0.02);
        if (!lane) lanes.push((lane = { until: -Infinity, segs: [] }));
        lane.segs.push(sg); lane.until = sg.b;
      });
      if (!lanes.length) lanes.push({ segs: [] });
      return lanes.map((l, i) => `<div class="og-row${i ? ' cont' : ''}"><div class="og-lab"${i ? '' : ` data-tip="${esc(full)}" tabindex="0"`}>${i ? '' : esc(label) + (seats > 1 ? ` <span class="muted">(${seats} seats)</span>` : '')}</div><div class="og-track">${l.segs.map(bar).join('')}<div class="og-now" style="left:${x(tNow)}%"></div></div></div>`).join('');
    }).join('');
    const ticks = []; for (let y = Math.ceil(y0 / 2) * 2; y <= y1; y += 2) ticks.push(y);
    return `<div class="og-scroll"><div class="og">
      <div class="og-axis"><div></div><div class="og-ticks">${ticks.map((y) => `<span style="left:${x(y)}%">${y}</span>`).join('')}<span class="og-today" style="left:${x(tNow)}%">today</span></div></div>
      ${rows}</div></div>
      <p class="small muted og-legend"><span class="og-key"></span> seen in the reports · <span class="og-key proj"></span> rest of the current term (projected) · <span class="og-key succ"></span> successor not yet elected · <span class="og-key interim"></span> interim chair · <span class="og-key tick"></span> Class A first-term end · <span class="og-key now"></span> today.
      Hover, focus or tap a bar for the dates. A term that ended early shows where the holder was last listed.</p>`;
  }

  // ---------- regional trustee election tracker (election_steps.json; rules.json schedule; Conference + annual-meeting dates) ----------
  const STEPS = RAW.electionSteps || {};
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  /** Regions electing a regional trustee at Conference y, region by region: the Service Manual table (rules.json) inside
      the years it lists for that region, outside them the every-fourth-year rule (calendar.json trustee_rotation). */
  function regionsElecting(y) {
    const s = sched(), rot = (((RAW.calendar || {}).trustee_rotation || {}).regions_by_year_mod4 || {})[String(y % 4)] || [];
    return Object.keys(FCR.REGION_SEAT).filter((rid) => {
      const e = s.find((x) => (x.position || '').toLowerCase() === (FCR.POSITIONS[FCR.REGION_SEAT[rid]] || '-').toLowerCase());
      const ys = (e && e.election_years) || [];
      return ys.length && y >= Math.min(...ys) && y <= Math.max(...ys) ? ys.includes(y) : rot.includes(rid);
    });
  }
  const nextElection = (rid, from) => { for (let y = from; y < from + 8; y++) if (regionsElecting(y).includes(rid)) return y; return null; };
  /** Annual meeting of members after Conference y: the recorded date, else the Saturday on or after the close (GSB bylaws,
      p. 140), approximate when the Conference dates are, or the record gives only a month. */
  function annualMeeting(y) {
    const m = (BOARD.annual_meetings || []).find((a) => a.year === y);
    if (m && /^\d{4}-\d{2}-\d{2}$/.test(m.date || '')) return { d: isoD(m.date), approx: !!m.approx };
    const c = FCR.conference(y), e = c.endDate;
    return { d: new Date(e.getFullYear(), e.getMonth(), e.getDate() + ((13 - e.getDay()) % 7), 12), approx: !c.datesKnown || !!c.approx || !!(m && m.approx) };
  }
  /** Dated window {a, b, approx, vague} of one step's `when` (election_steps.json meta) for the election at Conference y,
      or null when `when` does not resolve. vague: a day inside a Conference week whose dates are not announced. */
  function stepWindow(w, y) {
    const md = (yr, s) => (/^\d{2}-\d{2}$/.test(s || '') ? new Date(yr, +s.slice(0, 2) - 1, +s.slice(3), 12) : null);
    const plus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
    const c = FCR.conference(y), cApprox = !c.datesKnown || !!c.approx;
    let W = null;
    if (w.rel === 'year_before') W = w.month ? { a: new Date(y - 1, w.month - 1, 1, 12), b: new Date(y - 1, w.month, 0, 12), approx: !!w.approx } : { a: md(y - 1, w.from), b: md(y - 1, w.to), approx: !!w.approx };
    else if (w.rel === 'before_conference') W = { a: md(y, w.from), b: plus(c.startDate, -1), approx: cApprox };
    else if (w.rel === 'conference') {
      // a weekday of Conference week (the first one on or after the opening day, at most the closing day), else an offset
      const s0 = c.startDate, a0 = w.weekday != null ? plus(s0, (w.weekday - s0.getDay() + 7) % 7) : plus(s0, w.offset || 0);
      const a = a0 > c.endDate ? plus(c.endDate, 0) : a0;
      W = { a, b: (w.offset != null || w.weekday != null) && !w.to_end ? a : plus(c.endDate, 0), approx: !!w.approx || cApprox, vague: !c.datesKnown };
    } else if (w.rel === 'annual_meeting') { const m = annualMeeting(y); W = { a: m.d, b: m.d, approx: m.approx }; }
    else if (!w.rel && w.month_day) { const d = md(y, w.month_day); W = { a: d, b: d, approx: !!w.approx }; }
    const ok = (d) => d instanceof Date && !isNaN(d);
    return W && ok(W.a) && ok(W.b) ? W : null;
  }
  /** 'May 2026' · 'Jun – Dec 2026' · 'Wed, Apr 14, 2027' · 'Jan 2 – Apr 10, 2027' ('about …' when approximate; no weekday
      when vague, so none is invented for a Conference whose dates are not announced). */
  const winText = (W) => {
    const { a, b } = W, endOfMonth = new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate();
    const s = +day0(a) === +day0(b) ? `${W.vague ? '' : WD[a.getDay()] + ', '}${fmtD(a)}`
      : a.getDate() === 1 && b.getDate() === endOfMonth && a.getFullYear() === b.getFullYear() ? (a.getMonth() === b.getMonth() ? `${MONTH[a.getMonth()]} ${a.getFullYear()}` : `${MON[a.getMonth()]} – ${MON[b.getMonth()]} ${a.getFullYear()}`)
      : fmtRange(a, b);
    return (W.approx ? 'about ' : '') + s;
  };
  const soon = (n) => (n <= 120 ? inDays(n) : n < 548 ? `in about ${Math.round(n / 30.4)} months` : `in about ${Math.round(n / 365.25)} years`);
  const pageRef = (p) => (p ? ` <span class="muted nowrap">(p. ${esc(p)})</span>` : '');

  /** Tracker for the regional trustee election at Conference y: dated steps with the current one marked (from FCR.today()),
      and per region the seat's holder, who votes and area dates on file (calendar.json). HTML. */
  function trackerHtml(y, myR) {
    const steps = STEPS.regional_trustee || [];
    if (!steps.length) return UI.empty('No election steps loaded.');
    const t = day0(FCR.today()), c = FCR.conference(y), ph = FCR.positionHistory();
    const regs = regionsElecting(y).sort((p, q) => (q === myR) - (p === myR));   // your region first
    // a step whose `when` does not resolve is left out rather than stalling the tracker on it
    const st = steps.map((s) => ({ s, W: stepWindow(s.when || {}, y) })).filter((x) => x.W)
      .map((x) => Object.assign(x, { done: day0(x.W.b) < t, begun: day0(x.W.a) <= t }));
    if (!st.length) return UI.empty('No dated election steps.');
    const cur = st.findIndex((x) => !x.done);   // -1: every step is behind us
    const nx = cur >= 0 ? st[cur + 1] || null : null;
    const sum = cur < 0 ? `All ${st.length} steps are done: the trustees elected at the ${y} annual meeting are serving.`
      : (st[cur].begun ? `<strong>Now: step ${cur + 1} of ${st.length}</strong> — ${esc(st[cur].s.title)} (${winText(st[cur].W)}).`
        : `<strong>${cur ? `Next: step ${cur + 1} of ${st.length}` : 'Not started yet'}</strong> — ${cur ? '' : 'step 1, '}${esc(st[cur].s.title)}: ${winText(st[cur].W)}, ${soon(daysTo(st[cur].W.a))}.`)
        + (nx && st[cur].begun ? ` <strong>Next:</strong> ${esc(nx.s.title)} — ${winText(nx.W)}${daysTo(nx.W.a) > 0 ? ', ' + soon(daysTo(nx.W.a)) : ''}.` : '');
    const stepLi = (x, i) => {
      const k = cur < 0 || i < cur ? 'done' : i === cur ? (x.begun ? 'now' : 'next') : 'todo';
      const single = +day0(x.W.a) === +day0(x.W.b), n = daysTo(x.W.a);
      const badge = k === 'now' ? '<span class="badge op-now">now</span>' : k === 'next' ? `<span class="badge soft">next · ${soon(n)}</span>` : '';
      const dn = x.s.date_note ? [`<li class="muted">Date: ${esc(x.s.date_note.text)}${x.s.date_note.source ? ` (${esc(x.s.date_note.source)})` : ''}</li>`] : [];
      // a step behind us folds its text into the details, so the steps under way and ahead stand out
      const more = (k === 'done' ? [`<li>${esc(x.s.text)}${pageRef(x.s.page)}</li>`] : []).concat((x.s.more || []).map((m) => `<li>${esc(m.text)}${pageRef(m.page)}</li>`), dn);
      return `<li class="op-step ${k}"${k === 'now' ? ' aria-current="step"' : ''}>
        <span class="op-step-m" aria-hidden="true">${k === 'done' ? '✓' : i + 1}</span>
        <div class="op-step-d">${winText(x.W)}${k === 'todo' && single && n > 0 ? `<span class="op-step-in">${soon(n)}</span>` : ''}</div>
        <div class="op-step-b"><div class="op-step-h"><strong>${esc(x.s.title)}</strong>${badge}${k === 'done' ? '<span class="op-sr">(done)</span>' : ''}</div>
          ${k === 'done' ? '' : `<div class="small">${esc(x.s.text)}${pageRef(x.s.page)}</div>`}
          ${more.length ? `<details class="op-step-more"${i === cur ? ' open' : ''}><summary class="small">Details</summary><ul class="small">${more.join('')}</ul></details>` : ''}</div>
      </li>`;
    };
    // per region: the seat's holder, the voters, area dates on file (calendar events of the region's areas that name a trustee)
    const evs = FCR.calendar ? FCR.calendar.items({ from: st[0].W.a, to: c.startDate, scope: 'everything' }).filter((o) => o.kind === 'event' && o.scope === 'area' && /trustee/i.test(o.title)) : [];
    const regCard = (rid) => {
      const pid = FCR.REGION_SEAT[rid], mine = rid === myR;
      const hold = ph.find((p) => p.pid === pid && p.end === y && !p.leftYear) || ph.find((p) => p.pid === pid && p.start === y - 4);
      const nAreas = Object.keys(FCR.areas).filter((n) => FCR.areas[n].region === rid).length;
      const ev = evs.filter((o) => FCR.areaRegion(o.area) === rid);
      return `<div class="op-trk-reg${mine ? ' mine' : ''}">
        <div class="op-seat-h">${UI.regionDot(rid)}<strong>${esc(FCR.regionName(rid))}</strong>${mine ? '<span class="chip accent">your region</span>' : ''}</div>
        <div class="small">Succeeds ${hold ? `${UI.personLink(hold.name)} <span class="muted">(elected ${hold.start})</span>` : `the trustee elected in ${y - 4}`}</div>
        <div class="small">Votes in the nominating session: the region’s ${nAreas} delegates plus ${nAreas} others (${nAreas * 2} in all)${pageRef('55')}</div>
        ${mine ? `<div class="small">Your area’s delegate (${UI.areaLink(myArea(), { noname: true })}) is one of them.</div>` : ''}
        ${ev.length ? `<div class="small op-trk-ev"><span class="muted">Area dates on file:</span><ul>${ev.map((o) => `<li><a href="#/calendar/${encodeURIComponent(o.key)}">${esc(FCR.calendar.when(o))}</a> · ${esc(o.title)}</li>`).join('')}</ul></div>` : ''}
      </div>`;
    };
    const notes = STEPS.regional_trustee_notes || [];
    const tal = sched().filter((s) => /at-large/i.test(s.position || '') && (s.election_years || []).includes(y)).map((s) => s.position);
    const note = (id) => notes.find((n) => n.id === id);
    const until = regs.length ? nextElection(regs[0], y + 1) : null;
    return `<h3>${y} · ${FCR.ordinal(y - 1950)} Conference <span class="small muted">${c.datesKnown ? fmtRange(c.startDate, c.endDate) + (c.approx ? ' (preferred)' : '') : 'late April (dates not announced)'}</span></h3>
      <p class="small op-trk-sum">${sum}</p>
      <div class="op-trk-body">
        <ol class="op-steps" role="list" aria-label="Steps of the ${y} regional trustee election">${st.map(stepLi).join('')}</ol>
        <div class="op-trk-side">
          ${regs.map(regCard).join('')}
          ${until ? `<div class="small">The new trustees serve until the ${until} Conference and normally sit on the AAWS or AA Grapevine board ${y + 1}–${y + 3}.${pageRef('54')}</div>` : ''}
          ${tal.length && note('tal') ? `<div class="small"><strong>Also in ${y}:</strong> ${esc(listAnd(tal))}. ${esc(note('tal').text)}${pageRef(note('tal').page)}</div>` : ''}
          ${note('vacancy') ? `<div class="small muted">${esc(note('vacancy').text)}${pageRef(note('vacancy').page)}</div>` : ''}
        </div>
      </div>`;
  }
  /** The tracker card: a choice of the election under way, the next one and your region's next (when later), defaulting to
      your region's when it is one of the first two. Wire with wireTracker(). */
  function trackerCard(myR) {
    const t = day0(FCR.today()), y0 = t.getFullYear();
    const Ya = t <= day0(annualMeeting(y0).d) ? y0 : y0 + 1;   // the election under way (its annual meeting not yet held)
    const mineY = myR ? nextElection(myR, Ya) : null;
    const yrs = [Ya, Ya + 1].concat(mineY && mineY > Ya + 1 ? [mineY] : []);
    const sel = mineY && mineY <= Ya + 1 ? mineY : Ya;
    const names = (y) => regionsElecting(y).map((r) => FCR.regionName(r)).join(' & ');
    const lbl = (y) => `${y} · ${esc(names(y))}${regionsElecting(y).includes(myR) ? ' <span class="small">(your region)</span>' : ''}`;
    return `<div class="card op-trk">
      <div class="op-trk-pick"><div class="seg" role="group" aria-label="Choose an election">${yrs.map((y) => `<button type="button" data-trk="${y}" aria-pressed="${y === sel}"${y === sel ? ' class="on"' : ''}>${lbl(y)}</button>`).join('')}</div></div>
      <div class="op-trk-view" id="op-trk-view">${trackerHtml(sel, myR)}</div><p class="op-sr" aria-live="polite" id="op-trk-live"></p></div>`;
  }
  function wireTracker(el, myR) {
    const view = el.querySelector('#op-trk-view');
    el.querySelectorAll('[data-trk]').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('[data-trk]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      view.innerHTML = trackerHtml(+b.dataset.trk, myR);
      const sm = view.querySelector('.op-trk-sum');
      el.querySelector('#op-trk-live').textContent = `${b.textContent.trim()}. ${sm ? sm.textContent : ''}`;
    }));
  }

  V.timeline = function (el) {
    const cyc = FCR.cycle();
    const ops = FCR.openings();                 // next Conference .. +4, successors chained
    const co = FCR.currentOfficers();
    const ph = FCR.positionHistory();
    const myR = FCR.areaRegion(myArea()), myC = FCR.regionCountry(myR);
    const mineOf = (s) => (s.region && s.region === myR ? 'your region' : (s.pid === 'TAL_US' && myC === 'US') || (s.pid === 'TAL_CANADA' && myC === 'CA') ? 'your country' : '');
    const seatRow = (s, o) => {
      const mine = mineOf(s);
      const who = s.holder ? `${UI.personLink(s.holder.name)} <span class="small muted">elected ${s.holder.start}</span>`
        : s.likely ? '<span class="muted">possible extra vacancy</span>'
        : `<span class="muted">the ${s.start} electee</span>${s.successorOf ? ` <span class="small muted">(${s.generation > 1 ? 'after ' : 'succeeds '}${esc(s.successorOf)}${s.generation > 1 ? '’s successor' : ''})</span>` : ''}`;
      const nom = (NOM_SHORT[ruleKey(s.pid)] || (() => ''))(s);
      return `<li class="op-seat${s.soft ? ' soft' : ''}${mine ? ' mine' : ''}">
        <div class="op-seat-h"><strong>${esc(seatName(s))}</strong>${mine ? `<span class="chip accent">${mine}</span>` : ''}${s.soft ? `<span class="badge soft">${s.likely ? 'likely' : 'may continue'}</span>` : ''}</div>
        <div class="small">${who}</div>
        ${s.note ? `<div class="small muted">${esc(s.note)}</div>` : ''}
        ${s.soft ? '' : `<div class="small op-when">${dueText(s, o)}</div>${nom && o === ops[0] ? `<div class="small muted">${esc(nom)}</div>` : ''}`}
      </li>`;
    };
    const officerLines = (o) => (co ? co.officers : []).filter((of) => !/^Assistant/.test(of.title) && !of.employee).map((of) => {
      const s = ph.find((p) => p.isCurrent && !p.pid.startsWith('DIR_') && p.pid !== 'GSB_CHAIR' && p.aliases.some((a) => same(a, of.name)));
      return s && s.end === o.year ? `<li class="op-seat small"><strong>${esc(of.title)}</strong> ${UI.personLink(of.name)} leaves the board — a new ${of.title.toLowerCase()} is elected at the annual meeting after this Conference${of.title === 'Treasurer' ? '; the treasurer must be a Class A trustee' : ''}.</li>` : '';
    }).filter(Boolean);
    const moves = (o) => {
      const out = [corpMoves(o.year)];
      o.seats.filter((s) => s.pid === 'GST' && !s.soft).forEach((s) => {
        const dpid = s.board === 'Grapevine' ? 'DIR_GRAPEVINE' : 'DIR_AAWS', bn = s.board === 'Grapevine' ? 'AA Grapevine' : 'AAWS';
        const ending = s.generation ? [] : ph.filter((p) => p.isCurrent && p.pid === dpid && p.end === o.year).map((p) => UI.personLink(p.name));
        const extra = o.seats.some((x) => x.likely && x.pid === dpid);
        out.push(`The new ${bn} general service trustee usually comes from the ${bn} nontrustee directors (10 of 10 with known history)${ending.length ? `: likely ${listAnd(ending)}, whose director term ends ${o.year}` : extra ? `; none of their terms ends in ${o.year}, so a mid-term director may move up and open an extra director seat` : ''}.`);
      });
      if (o.seats.some((s) => s.seat === 'chair' && !s.soft)) out.push('A new GSB chair takes office: a Class A chair uses one of the 7 Class A seats and the 22nd seat dissolves; a Class B chair keeps the board at 22 (Service Manual p. 58).');
      return out;
    };
    const card = (o, i) => {
      const c = FCR.conference(o.year);
      const G = [['Trustees', o.seats.filter((s) => s.seat === 'trustee')], ['Directors', o.seats.filter((s) => s.seat === 'director')], ['Officers', o.seats.filter((s) => s.seat === 'chair')]];
      const offs = officerLines(o), off = officialCount(o.year), n = o.counts.trustees + o.counts.chair;
      const cnt = joinDot([`${o.counts.trustees} trustee seat${o.counts.trustees === 1 ? '' : 's'}`, o.counts.chair ? 'GSB chair' : '', o.counts.directors ? `${o.counts.directors} director seat${o.counts.directors === 1 ? '' : 's'}` : '', o.counts.soft ? `${o.counts.soft} possible` : '']);
      return `<div class="card op-card${i === 0 ? ' next' : ''}" id="op-y${o.year}">
        <h3><span>${o.year} · ${FCR.ordinal(o.ordinal)} Conference</span><span class="small muted">${c.datesKnown ? fmtRange(c.startDate, c.endDate) + (c.approx ? ' (preferred)' : '') : 'late April (dates not announced)'}</span></h3>
        <div class="small op-count">${cnt}${off ? ` <span class="chip${off.n === n ? ' good' : ''}" data-tip="Trustees’ Nominating Committee rotation table in the ${off.src} report (trustee seats incl. the chair)" tabindex="0">official table: ${off.n}${off.n === n ? ' ✓' : ''}</span>` : ''}</div>
        ${G.map(([k, list]) => (list.length || (k === 'Officers' && offs.length) ? `<h4 class="op-g">${k}</h4><ul class="op-seats">${list.map((s) => seatRow(s, o)).join('')}${k === 'Officers' ? offs.join('') : ''}</ul>` : '')).join('')}
        <details class="op-moves"${i === 0 ? ' open' : ''}><summary>Likely knock-on moves</summary><ul>${moves(o).map((m) => `<li>${m}</li>`).join('')}</ul></details>
        <div class="small muted op-foot">Delegates: Panel ${o.year - 1951} rotates Dec 31, ${o.year}; Panel ${o.year - 1949} is elected in fall ${o.year}. The ${o.year} committee chairs are Panel ${o.year - 1951} delegates.</div>
      </div>`;
    };
    // date-aware headline: the next deadline, or what the last Conference decided while its report is pending
    const notes = [];
    if (cyc.reportPending) {
      const p = FCR.openings(cyc.lastConference, cyc.lastConference)[0], pc = FCR.conference(cyc.lastConference);
      const hard = p ? p.seats.filter((s) => !s.soft) : [];
      if (hard.length) notes.push(`The ${FCR.ordinal(cyc.lastConference - 1950)} Conference (${fmtRange(pc.startDate, pc.endDate)}) has met and chose successors for ${hard.length} seats (${listAnd(hard.map((s) => esc(seatName(s))))}). Their names appear when the ${cyc.lastConference} Final Report is loaded.`);
    }
    const first = ops[0];
    const due = first ? first.seats.filter((s) => !s.soft && s.deadline && s.deadline.date) : [];
    if (due.length) {
      const d = due[0].deadline, fc = FCR.conference(first.year), confT = `the ${FCR.ordinal(first.year - 1950)} Conference${fc.datesKnown ? ' (' + fmtRange(fc.startDate, fc.endDate) + ')' : ''}`;
      const names = listAnd(due.map((s) => esc(seatName(s))));
      let t = d.passed ? `Résumés for the ${names} seats closed ${fmtD(d.date)}; ${confT} elects them${fc.over ? '' : daysTo(fc.startDate) <= 0 ? ' — it is meeting now' : ' — ' + inDays(daysTo(fc.startDate))}.`
        : `<strong>Résumés due ${fmtD(d.date)} — ${inDays(d.daysLeft)}</strong>: ${endDot(names)} Areas send résumés to GSO; ${confT} elects.`;
      const mine = due.find((s) => s.region === myR);
      if (mine) t += endDot(` Your region (${esc(FCR.regionName(myR))}) chooses a new regional trustee${mine.holder ? ', succeeding ' + UI.personLink(mine.holder.name) : ''}`);
      notes.push(t);
    }
    const rules = BOARD.seat_rules || {};
    const schedule = sched();
    el.innerHTML = ROOT_CLASS('op-page', `
      <div class="page-head"><div><h1>Openings &amp; rotation</h1>
        <p>Rotation keeps every seat turning over: regional trustees, trustees-at-large and general service trustees serve one 4-year term; Class A trustees up to two 3-year terms; nontrustee directors up to 4 years; the GSB chair a 4-year chair term.
        New trustees take their seats at the annual meeting right after the April Conference.</p></div></div>
      ${notes.map((n) => `<div class="callout op-callout">${n}</div>`).join('')}
      ${jumpNav(((STEPS.regional_trustee || []).length ? [['op-trk-h', 'Trustee election steps']] : []).concat(ops.map((o) => ['op-y' + o.year, String(o.year)]), [['op-rules-h', 'How seats are filled'], ['op-gantt-h', 'Seats over time']]))}
      ${(STEPS.regional_trustee || []).length ? `<h2 class="section-title" id="op-trk-h">Regional trustee election, step by step</h2>
      <p class="small muted">How an area’s candidate becomes a regional trustee (Service Manual pp. 54–56, own words), dated for the coming elections; the step under way is highlighted.</p>
      ${trackerCard(myR)}` : ''}
      <h2 class="section-title">Seats opening ${ops.length ? ops[0].year + '–' + ops[ops.length - 1].year : ''}</h2>
      <p class="small muted">Counts are trustee seats (the official Nominating Committee tables count the same way); director seats and soft markers (Class A first-term ends, a likely extra director vacancy) are listed but not counted. ${ops.length ? `“The ${ops[0].year} electee” = a successor not elected yet.` : ''}</p>
      <div class="grid g2 op-cards">${ops.map(card).join('')}</div>
      <h2 class="section-title" id="op-rules-h">How these seats are filled</h2>
      <div class="grid gauto op-rules">${['REG', 'TAL_US', 'TAL_CANADA', 'GST', 'CLASS_A', 'GSB_CHAIR', 'DIR_AAWS', 'DIR_GRAPEVINE'].filter((k) => rules[k]).map((k) => { const r = rules[k]; return `<div class="card op-rule"><h4>${esc(r.label)}</h4>
        <div class="small"><strong>Term:</strong> ${esc(r.term || '')}</div><div class="small"><strong>Who nominates:</strong> ${esc(r.nominated_by || '')}</div>
        ${r.deadline ? `<div class="small"><strong>Deadline:</strong> ${esc(r.deadline.text)}</div>` : ''}${r.pattern ? `<div class="small muted">${esc(r.pattern)}</div>` : ''}<div class="small muted">${esc(refText(r.ref))}</div></div>`; }).join('')}</div>
      ${schedule.length ? `<details class="op-sched"><summary>Trustee election calendar (Service Manual and reports)</summary><div class="table-wrap"><table class="t compact"><thead><tr><th>Position</th><th>Election years</th><th>Note</th></tr></thead><tbody>${schedule.map((s) => `<tr><td>${esc(s.position)}</td><td class="nowrap">${(s.election_years || []).join(', ')}</td><td class="small ink2">${esc(s.note || '')}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
      <h2 class="section-title" id="op-gantt-h">Board seats over time</h2>
      <div class="card op-gantt">${ganttHtml(cyc)}</div>`);
    // open the Gantt at "now" (phones and narrow windows): today line at ~60% of the visible track
    const gs = el.querySelector('.og-scroll'), nl = gs && gs.querySelector('.og-now'), lab = gs && gs.querySelector('.og-lab');
    if (gs && nl && gs.scrollWidth > gs.clientWidth) {
      const lw = lab ? lab.offsetWidth : 0;
      gs.scrollLeft = nl.getBoundingClientRect().left - gs.getBoundingClientRect().left - lw - (gs.clientWidth - lw) * 0.6;
    }
    if (el.querySelector('#op-trk-view')) wireTracker(el, myR);
    wireJumps(el);
  };


  // ---------- REPORTS: Conference at a glance + Final Report library + forums, conventions, world meetings ----------
  const floorText = (f) => {
    if (!f) return '';
    if (f.passed == null && f.not_resulting == null && f.total == null) return f.note ? esc(f.note) : '';
    const parts = [];
    if (f.total != null) parts.push(`${f.total} in all`);
    if (f.passed != null) parts.push(`${f.passed} became Advisory Actions`);
    if (f.not_resulting != null) parts.push(`${f.not_resulting} did not`);
    if (f.declined != null) parts.push(`${f.declined} declined`);
    if (f.recommitted != null) parts.push(`${f.recommitted} recommitted`);
    if (f.recommitted_note) parts.push(esc(f.recommitted_note));
    return parts.join(' · ');
  };
  const refTip = (o) => (o && o.ref ? ` data-tip="${esc(refText(o.ref))}" tabindex="0"` : '');
  /** HTML "Conference at a glance" for one held or future Conference (conferences.json via FCR.conference).
      Public so other pages can reuse it, e.g. a header on #/committees/<year>: UI.conferenceGlance(2026). */
  UI.conferenceGlance = function (year, opts) {
    opts = opts || {};
    const c = FCR.conference(year);
    const m = c.members || {};
    const kv = [];
    const row = (k, v, src) => { if (v) kv.push(`<dt${refTip(src)}>${k}</dt><dd>${v}</dd>`); };
    if (!opts.noTheme) row('Theme', c.theme ? `<em>${esc(c.theme)}</em>` : '');
    row('Dates', c.datesKnown ? fmtRange(c.startDate, c.endDate) + (c.approx ? ' (preferred dates)' : '') + (c.format && c.format !== 'in person' ? ` · ${esc(c.format)}` : '') : c.dates ? esc(c.dates) : '');
    row('Venue', c.venue ? esc(c.venue) : '');
    row('Members', m.total ? `${m.total}${m.delegates ? ` = ${m.delegates} delegates + ${m.board} trustees/directors + ${m.staff} staff` : ''}` : '', m);
    row('Agenda items', c.agenda_items && c.agenda_items.n ? `${c.agenda_items.approx ? 'over ' : ''}${c.agenda_items.n}${c.agenda_items.note ? ` <span class="small muted">(${esc(c.agenda_items.note)})</span>` : ''}` : '', c.agenda_items);
    const aaN = ((FCR.RAW.advisoryActions || {}).actions || []).some((a) => a.year === c.year);
    row('Advisory Actions', c.advisory_actions && c.advisory_actions.n ? String(c.advisory_actions.n) + (aaN ? ` · <a href="#/actions/year/${c.year}">read them →</a>` : '') : aaN ? `<a href="#/actions/year/${c.year}">read them →</a>` : '', c.advisory_actions);
    row('Floor actions', floorText(c.floor_actions), c.floor_actions);
    row('Keynote', c.keynote && c.keynote.name ? `${UI.personLink(c.keynote.name)} <span class="small muted">${esc(c.keynote.role || '')}${c.keynote.rotating ? ', rotating' : ''}</span>` : '', c.keynote);
    row('Delegate chair', c.delegateChair ? `${UI.personLink(c.delegateChair.name)}${c.delegateChair.area ? ' · ' + UI.areaLink(c.delegateChair.area) : ''}` : '');
    row('Workshop', c.workshop ? esc(c.workshop) : '');
    row('Presentations', (c.presentations || []).length ? c.presentations.map(esc).join(' · ') : '');
    const hl = (c.headlines || []).map((h) => `<li>${esc(h.text)} <span class="small muted">${esc(refText(h.ref))}</span></li>`).join('');
    const nx = c.next && (c.next.theme || (c.next.topics || []).length) ? `<div class="rp-next small"><strong>Next year (${c.year + 1}):</strong> ${c.next.theme ? `theme <em>${esc(c.next.theme)}</em>` : ''}${(c.next.topics || []).length ? ` · presentations: ${c.next.topics.map(esc).join('; ')}` : ''}${c.next.workshop ? ` · workshop: ${esc(c.next.workshop)}` : ''}</div>` : '';
    return `<div class="rp-glance"><dl class="kv rp-kv">${kv.join('')}</dl>${hl ? `<h4>Headline decisions</h4><ul class="rp-hl">${hl}</ul>` : ''}${nx}</div>`;
  };

  /** Reference documents (drive.json docs with a group), grouped: Service Manual & history, structure, GSR/DCM shelf, forms, newsletters. */
  function refDocs(docs) {
    const gs = [];
    docs.filter((d) => d.group && !d.main).forEach((d) => { let g = gs.find((x) => x.name === d.group); if (!g) gs.push((g = { name: d.group, list: [] })); g.list.push(d); });
    if (!gs.length) return '';
    const n = gs.reduce((k, g) => k + g.list.length, 0);
    const chip = (d) => `<a class="chip" href="${esc(d.url)}" target="_blank" rel="noopener"${d.why ? ` data-tip="${esc(d.why)}"` : ''}>${esc(d.title)}${/drive\.google\.com/.test(d.url) ? '' : ' ↗'}</a>`;
    return `<details class="rp-refs"><summary>Reference documents (${n}): ${gs.map((g) => esc(g.name)).join(' · ')}</summary>
      <p class="small muted">Links marked ↗ open aa.org or the Grapevine sites; the others are in your Drive (Google sign-in).</p>
      ${gs.map((g) => `<div class="rp-ref-g"><h3 class="small">${esc(g.name)}</h3><div class="flex rp-ref-chips">${g.list.map(chip).join('')}</div></div>`).join('')}</details>`;
  }

  V.reports = function (el, args) {
    const reps = (FCR.RAW.reports || []).slice().sort((a, b) => b.year - a.year);
    const dv = FCR.RAW.drive || {};
    const openYear = parseInt(args && args[0], 10) || null;          // #/reports/2024 opens that year
    const cyc = FCR.cycle();
    // held Conferences, plus the one that just met while its report is pending (facts known in advance)
    const held = Object.keys(CONF.years || {}).map(Number).concat(cyc.reportPending ? [cyc.lastConference] : []).filter((y, i, a) => a.indexOf(y) === i).sort((a, b) => b - a);
    const myR = FCR.areaRegion(myArea());
    // a second copy of the same report (e.g. another scan) is listed under the main link
    const altLinks = (r) => (r.alternates || []).filter((a) => a.drive_url).map((a) => `<a class="small nowrap rp-alt" href="${esc(a.drive_url)}" target="_blank" rel="noopener" data-tip="${esc(joinDot([a.note, (a.file_name || '').split('/').pop()]))}">${esc(a.label || 'other copy')}</a>`).join('');
    const fileLink = (r) => (r.drive_url ? `<a href="${esc(r.drive_url)}" target="_blank" rel="noopener" data-tip="${esc((r.file_name || '').split('/').pop())}">${/\/folders\//.test(r.drive_url) ? 'Open folder' : 'Open PDF'}</a>`.replace('<a ', '<a class="nowrap" ') + altLinks(r) : '<span class="muted">—</span>');
    const edition = (r) => esc(String(r.edition || '').replace(/\s*\(confidential members edition, scanned\)/i, ' (scanned)'));
    const scanNote = (r) => (r.incomplete || r.note ? `<div class="small rp-note">${r.incomplete ? '<span class="badge">incomplete scan</span> ' : ''}<span class="muted">${esc(r.note || '')}</span></div>` : '');
    const inApp = (r) => (FCR.Y(r.year) ? `<span class="nowrap"><a class="chip good" href="#/committees/${r.year}">✓ rosters</a> <a class="chip" href="#/board/${r.year}">board</a></span>` : r.historical ? '<span class="muted small nowrap">searchable scan</span>' : '<span class="muted small">not parsed</span>');
    // printed date strings without Conference facts ('April 26 - May 2, 2009') get the app's format too
    const MONS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const loose = (str) => {
      const m = /^([A-Za-z]+)\.? (\d{1,2})\s*[-–]\s*(?:([A-Za-z]+)\.? )?(\d{1,2}),? (\d{4})$/.exec(String(str || '').trim());
      const mi = (w) => MONS.findIndex((x) => w && x.startsWith(w.toLowerCase().slice(0, 3)));
      if (!m || mi(m[1]) < 0) return esc(str || '');
      const a = new Date(+m[5], mi(m[1]), +m[2]), b = new Date(+m[5], m[3] ? mi(m[3]) : mi(m[1]), +m[4]);
      return isNaN(a) || isNaN(b) ? esc(str) : fmtRange(a, b);
    };
    const place = (r) => { const c = (CONF.years || {})[r.year]; return [c && c.start ? fmtRange(c.start, c.end) : r.start ? fmtRange(r.start, r.end) : loose(r.dates), esc(r.location || '')].filter(Boolean).join('<br>'); };

    // coming Conferences
    const fut = FCR.futureConferences().filter((c) => !c.over);
    const futCards = fut.map((c, i) => `<div class="card rp-fut${i === 0 ? ' next' : ''}"><h3><span>${c.year} · ${FCR.ordinal(c.ordinal)} GSC</span>${i === 0 && c.startDate ? `<span class="small muted">${daysTo(c.startDate) <= 0 ? 'meeting now' : inDays(daysTo(c.startDate))}</span>` : ''}</h3>
        <div>${c.startDate && c.datesKnown ? fmtRange(c.startDate, c.endDate) : 'Dates not announced'}${c.approx ? ' <span class="small muted">(first-choice dates; venue not chosen)</span>' : ''}</div>
        ${c.venue ? `<div class="small ink2">${esc(c.venue)}</div>` : ''}
        ${c.theme ? `<div class="small">Theme: <em>${esc(c.theme)}</em></div>` : ''}
        ${(c.presentations || []).length ? `<div class="small muted">Presentations: ${c.presentations.map(esc).join(' · ')}</div>` : ''}
        ${c.workshop ? `<div class="small muted">Workshop: ${esc(c.workshop)}</div>` : ''}
        ${c.delegateChair ? `<div class="small">Delegate chair: ${UI.personLink(c.delegateChair.name)}${c.delegateChair.area ? ' · ' + UI.areaLink(c.delegateChair.area) : ''}</div>` : ''}
        <div class="small muted">Panels ${c.year - 1951} and ${c.year - 1950}</div></div>`).join('');

    // per-year glance (newest open unless a year was asked for)
    const glance = held.map((y, i) => {
      const c = FCR.conference(y), r = reportOf(y);
      const open = openYear ? openYear === y : i === 0;
      return `<details class="rp-year" id="rp-y${y}"${open ? ' open' : ''}><summary><span class="rp-sum-y">${y} · ${FCR.ordinal(y - 1950)}</span>${!(CONF.years || {})[y] ? ' <span class="badge">report pending</span>' : ''} <em>${esc(c.theme || '')}</em> <span class="small muted">${c.datesKnown ? fmtRange(c.startDate, c.endDate) : ''}</span></summary>
        ${UI.conferenceGlance(y, { noTheme: true })}
        <div class="flex rp-links small">${r ? pdfLink(y, 'Open the ' + y + ' Final Report (PDF)') : ''}${FCR.Y(y) ? `<a href="#/committees/${y}">Committees ${y}</a><a href="#/board/${y}">Board ${y}</a>` : ''}</div></details>`;
    }).join('');

    // Regional Forums by year (odd/even regions), International Conventions, WSM / REDELA
    const RF = CONF.regional_forums || {}, IC = CONF.international_conventions || {}, WM = CONF.world_meetings || {};
    const fyears = [...new Set((RF.list || []).map((f) => f.year))].sort((a, b) => b - a);
    const fStatus = (f) => { const e = isoD(f.end || f.start); return f.status === 'scheduled' && e && daysTo(e) < 0 ? 'held' : f.status; };   // date-aware
    const forumChip = (f) => `<li class="rp-forum${f.region && f.region === myR ? ' mine' : ''}">${f.region ? UI.regionDot(f.region) + ' <strong>' + esc(FCR.regionName(f.region)) + '</strong>' : '<strong>Special</strong>'}${f.kind && f.kind !== 'regular' ? ` <span class="small muted">${esc(f.kind)}</span>` : ''}
        <span class="small">${joinDot([esc(f.city || ''), f.area ? UI.areaLink(f.area, { noname: true }) : '', f.start ? fmtRange(f.start, f.end) : fmtD(f.month)])}</span>${fStatus(f) && fStatus(f) !== 'held' ? ` <span class="badge${fStatus(f) === 'scheduled' ? ' new' : ''}">${esc(fStatus(f))}</span>` : ''}${f.attendance ? ` <span class="small muted">${f.attendance.toLocaleString('en-US')} attended</span>` : ''}${f.note ? ` <span class="small muted">— ${esc(f.note)}</span>` : ''}</li>`;
    const forums = fyears.map((y) => `<div class="rp-fy"><div class="rp-fy-h"><strong>${y}</strong> <span class="small muted">${y % 2 ? 'odd year' : 'even year'}</span></div><ul class="rp-flist">${(RF.list || []).filter((f) => f.year === y).map(forumChip).join('')}</ul></div>`).join('');
    const icList = (IC.list || []).slice().sort((a, b) => b.year - a.year).map((c) => `<li><strong>${c.year}</strong> ${esc(c.city || 'site not chosen')}${c.start ? ' · ' + fmtRange(c.start, c.end) : ''} <span class="badge${c.status === 'cancelled' ? ' rot' : fStatus(c) === 'held' ? '' : ' new'}">${esc(fStatus(c))}</span>${c.theme ? ` <em class="small">${esc(c.theme)}</em>` : ''}${c.attendance ? ` <span class="small">· ${c.attendance.toLocaleString('en-US')} attended</span>` : ''}${c.note ? `<div class="small muted">${esc(c.note)}</div>` : ''}</li>`).join('');
    const wmList = (WM.list || []).slice().sort((a, b) => b.year - a.year).map((w) => `<li><strong>${w.year}</strong> ${esc(w.type)}${w.n ? ' ' + FCR.ordinal(w.n) : ''} · ${esc(w.place || '')}${w.start ? ' · ' + fmtRange(w.start, w.end) : w.month ? ' · ' + fmtD(w.month) : ''}${w.status ? ` <span class="badge${fStatus(w) === 'held' ? '' : ' new'}">${esc(fStatus(w))}</span>` : ''}${w.theme ? `<div class="small"><em>${esc(w.theme)}</em></div>` : ''}${w.note ? `<div class="small muted">${esc(w.note)}</div>` : ''}</li>`).join('');
    const sc = (CONF.structure_changes || []).slice().sort((a, b) => b.year - a.year).map((s) => `<li><strong>${esc(s.when)}</strong> — ${esc(s.text)} <span class="small muted">${esc(refText(s.ref))}</span></li>`).join('');
    const dchairs = FCR.delegateChairs().slice().reverse();
    const dcRule = (CONF.delegate_chair_rules || {}).text || '';
    const fin = (CONF.finance || []).slice().sort((a, b) => b.report_year - a.report_year);
    const money = (n) => (n == null ? '—' : '$' + (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n.toLocaleString('en-US')));
    // ----- report library: coverage grid 1951–latest, decade / text filter, table (desktop) and cards (phones) -----
    const byYear = {};
    reps.forEach((r) => { if (!byYear[r.year]) byYear[r.year] = r; });
    const lastY = Math.max(FCR.latestYear || 0, ...reps.map((r) => r.year));   // a Conference whose report is not out yet is not a gap
    const decOf = (y) => Math.floor(y / 10) * 10;
    const isFile = (r) => !!(r && r.drive_url && !/\/folders\//.test(r.drive_url));
    const gaps = [];
    for (let y = 1951; y <= lastY; y++) if (!byYear[y]) gaps.push(y);
    const runs = (ys) => ys.reduce((acc, y) => { const l = acc[acc.length - 1]; if (l && l[1] === y - 1) l[1] = y; else acc.push([y, y]); return acc; }, []).map(([a, b]) => (a === b ? String(a) : `${a}–${b}`));
    const decades = [];
    for (let d = decOf(lastY); d >= 1950; d -= 10) decades.push(d);
    const hlYear = openYear && !held.includes(openYear) && byYear[openYear] ? openYear : null;   // #/reports/1975 marks that row
    const lib = { dec: hlYear ? decOf(hlYear) : null, q: '', sortK: 'year', dir: -1 };
    const hay = (r) => FCR.fold([r.year, FCR.ordinal(r.year - 1950), 'gsc ' + (r.year - 1950), r.theme, r.dates, r.location, r.edition, (r.alternates || []).length ? 'alternate scan copy' : ''].join(' '));
    const tipOf = (r) => joinDot([`${r.year} · ${FCR.ordinal(r.year - 1950)} GSC`, r.theme ? `“${r.theme}”` : '', r.location || '', r.pages ? r.pages + ' pages' : '', FCR.Y(r.year) ? 'rosters in this app' : '']);
    const cell = (y) => {
      if (y < 1951 || y > lastY) return '<span class="rp-cell none" aria-hidden="true"></span>';
      const r = byYear[y], yy = '’' + String(y).slice(2);
      if (!r) return `<span class="rp-cell miss" tabindex="0" data-tip="${y} · ${FCR.ordinal(y - 1950)} GSC — not in your Drive">${yy}</span>`;
      const cls = 'rp-cell ' + (FCR.Y(y) ? 'app' : 'pdf');
      return isFile(r) ? `<a class="${cls}" href="${esc(r.drive_url)}" target="_blank" rel="noopener" data-tip="${esc(tipOf(r))}" aria-label="Open the ${y} Final Report (PDF)">${yy}</a>`
        : `<span class="${cls}" tabindex="0" data-tip="${esc(tipOf(r))}">${yy}</span>`;
    };
    const nHave = Object.keys(byYear).length;
    const libHead = `<p class="small">${nHave} of the ${lastY - 1950} Conferences (1951–${lastY}) are in your Drive; ${FCR.years.length} of them (${FCR.years[0]}–${FCR.latestYear}) are parsed into this app.${gaps.length ? ` Not in your Drive: ${runs(gaps).join(', ')}.` : ''}</p>
      <div class="rp-cov" role="group" aria-label="Final Reports by year">${decades.map((d) => `<div class="rp-cov-row"><button type="button" class="rp-cov-d" data-dec="${d}" aria-pressed="false" data-tip="Show only the ${d}s in the table">${d}s</button>${Array.from({ length: 10 }, (_, i) => cell(d + i)).join('')}</div>`).join('')}</div>
      <div class="flex small rp-cov-key"><span><i class="rp-cell app"></i>rosters in this app</span><span><i class="rp-cell pdf"></i>searchable scan</span><span><i class="rp-cell miss"></i>not in your Drive</span><span class="muted">Select a year to open its PDF, or a decade to filter the table.</span></div>
      <div class="flex rp-filter"><div class="seg" role="group" aria-label="Show one decade"><button type="button" data-dec="" aria-pressed="true">All</button>${decades.map((d) => `<button type="button" data-dec="${d}" aria-pressed="false">${d}s</button>`).join('')}</div>
        <input type="search" id="r-q" class="rp-q" placeholder="Find a year, theme or hotel" aria-label="Find a report by year, theme or hotel" autocomplete="off"><span class="small muted" id="r-n" aria-live="polite"></span></div>`;
    const sections = [['rp-glance-h', 'At a glance'], ['rp-lib', 'Report library'], ['rp-forums', 'Regional Forums'], ['rp-ic', 'Conventions & world meetings'], ['rp-sc', 'Structure changes'], ['rp-more', 'Delegate chairs & finance']];

    el.innerHTML = ROOT_CLASS('rp-page', `
      <div class="page-head"><div><h1>Conferences &amp; Final Reports</h1><p>What each General Service Conference decided, the Conferences ahead, and your Final Report library.
        Copies are stored in your Google Drive folder <em>Literature_Archive/Final Conference Reports</em> (links need your Google sign-in). The older reports are members’ editions: from 1957 they are marked “Confidential” because they print members’ full names (from 1975 with addresses), so the PDFs stay in your Drive and the app keeps only the facts shown here. For years you don’t have, your area archivist or the GSO Archives may hold copies.</p></div></div>
      <div class="flex rp-drive"><span class="small muted">In your Drive:</span>${dv.library_folder ? `<a class="chip accent" href="${esc(dv.library_folder)}" target="_blank" rel="noopener">📁 Final Reports folder</a>` : ''}${dv.historical_folder ? `<a class="chip" href="${esc(dv.historical_folder)}" target="_blank" rel="noopener">📁 Historical 1951–2009</a>` : ''}${dv.data_folder ? `<a class="chip" href="${esc(dv.data_folder)}" target="_blank" rel="noopener">📁 Extracted data &amp; text</a>` : ''}
        ${(dv.docs || []).filter((d) => d.main || !d.group).map((d) => `<a class="chip" href="${esc(d.url)}" target="_blank" rel="noopener"${d.why ? ` data-tip="${esc(d.why)}"` : ''}>${esc(d.title)}</a>`).join('')}</div>
      ${refDocs(dv.docs || [])}
      ${jumpNav(sections)}
      <h2 class="section-title">Coming Conferences</h2>
      <div class="grid g4 rp-futs">${futCards || UI.empty('No future Conference dates recorded.')}</div>
      <h2 class="section-title" id="rp-glance-h">Conference at a glance</h2>
      <p class="small muted">Counts are from each Final Report (hover a label for its page). “Floor actions” are motions made on the Conference floor; the ones adopted are printed among the Advisory Actions.</p>
      <div class="rp-years">${glance}</div>
      <h2 class="section-title" id="rp-lib">Final Report library</h2>
      ${libHead}
      <div class="rp-table" id="r-t"></div>
      <div class="rp-cards" id="r-c"></div>
      <h2 class="section-title" id="rp-forums">Regional Forums</h2>
      <p class="small">${esc((RF.rule || {}).text || '')} <span class="muted">${esc(((RF.rule || {}).refs || []).map(refText).join('; '))}</span></p>
      <div class="card rp-forums">${forums}</div>
      <div class="grid g2" id="rp-ic" style="margin-top:16px">
        <div class="card"><h3>International Conventions</h3><p class="small muted">${esc(IC.pattern || '')}</p><ul class="rp-plain">${icList}</ul></div>
        <div class="card"><h3>World Service Meeting &amp; REDELA</h3><p class="small muted">${esc(WM.pattern || '')}</p><ul class="rp-plain">${wmList}</ul></div>
      </div>
      <h2 class="section-title" id="rp-sc">Structure changes</h2>
      <ul class="timeline-list rp-sc">${sc}</ul>
      <h2 class="section-title" id="rp-more">Delegate chairs &amp; finance</h2>
      <div class="grid g2">
        <div class="card"><h3>Conference delegate chairs</h3><p class="small muted">${esc(dcRule)}</p>
          <ul class="rp-plain">${dchairs.map((d) => `<li><strong>${d.conference_year}</strong> ${UI.personLink(d.name)} <span class="small">${d.area ? UI.areaLink(d.area) : ''}${d.region ? ' · ' + esc(FCR.regionName(d.region)) : ''}</span>${d.alternate ? `<div class="small muted">alternate: ${esc(d.alternate.name)}${d.alternate.area ? ' (Area ' + d.alternate.area + ')' : ''}</div>` : ''}</li>`).join('')}</ul></div>
        <div class="card"><h3>Finance headlines</h3><p class="small muted">Prior-year figures as reported each April (contributions from groups and members; the Reserve Fund in months of operating expenses).</p>
          <div class="table-wrap"><table class="t compact"><thead><tr><th>Report</th><th class="n">Contributions</th><th class="n">Reserve</th></tr></thead><tbody>${fin.map((f) => `<tr><td>${f.report_year} <span class="small muted">(${f.data_year})</span></td><td class="n">${money(f.contributions)}${f.note_contrib ? ` <span class="small muted">${esc(f.note_contrib)}</span>` : ''}</td><td class="n">${f.reserve && f.reserve.months ? f.reserve.months + ' mo' : '—'}</td></tr>`).join('')}</tbody></table></div></div>
      </div>`);
    const cols = [
      { k: 'year', label: 'Year', num: true },
      { k: 'ordinal', label: 'GSC', sort: (r) => r.year, render: (r) => FCR.ordinal(r.year - 1950) },
      { k: 'theme', label: 'Theme', render: (r) => (r.theme ? `<em>${esc(r.theme)}</em>` : '') },
      { k: 'dates', label: 'Dates & place', sort: (r) => r.year, render: (r) => `<span class="small">${place(r)}</span>` },
      { k: 'file', label: 'Report', nosort: true, render: fileLink },
      { k: 'pages', label: 'Pages', num: true, render: (r) => (r.pages ? String(r.pages) : '') },
      { k: 'edition', label: 'Edition', render: (r) => `<span class="small">${edition(r)}</span>${scanNote(r)}` },
      { k: 'data', label: 'In this app', nosort: true, render: inApp },
      { k: 'src', label: 'Found at', nosort: true, render: (r) => (r.source_url ? `<a class="small" href="${esc(r.source_url)}" target="_blank" rel="noopener">source</a>` : '') },
    ];
    const card = (r) => `<li class="card rp-card${r.year === hlYear ? ' hl' : ''}" id="rp-c${r.year}"><div class="rp-card-h"><strong>${r.year}</strong> <span class="muted">${FCR.ordinal(r.year - 1950)} GSC</span> <span class="rp-files">${fileLink(r)}</span></div>
      ${r.theme ? `<div><em>${esc(r.theme)}</em></div>` : ''}${place(r) ? `<div class="small ink2">${place(r)}</div>` : ''}
      <div class="small muted">${joinDot([edition(r), r.pages ? r.pages + ' pages' : ''])}</div>${scanNote(r)}<div class="flex small">${inApp(r)}${r.source_url ? `<a href="${esc(r.source_url)}" target="_blank" rel="noopener">source</a>` : ''}</div></li>`;
    const libRows = () => {
      const words = FCR.fold(lib.q).split(' ').filter(Boolean);
      return reps.filter((r) => (lib.dec == null || decOf(r.year) === lib.dec) && words.every((w) => hay(r).includes(w)));
    };
    function drawLib() {
      const rows = libRows();
      UI.table(el.querySelector('#r-t'), cols, rows, { sortK: lib.sortK, dir: lib.dir, emptyMsg: 'No report matches.', rowId: (r) => 'rp-r' + r.year, rowClass: (r) => (r.year === hlYear ? 'hl' : ''), onSort: (k, d) => { lib.sortK = k; lib.dir = d; } });
      el.querySelector('#r-c').innerHTML = rows.length ? `<ul class="rp-clist">${rows.map(card).join('')}</ul>` : UI.empty('No report matches.');
      el.querySelector('#r-n').textContent = `${rows.length} of ${reps.length} reports`;
      el.querySelectorAll('[data-dec]').forEach((b) => { const on = b.dataset.dec === (lib.dec == null ? '' : String(lib.dec)); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    }
    el.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => {
      const d = b.dataset.dec ? +b.dataset.dec : null;
      lib.dec = b.classList.contains('rp-cov-d') && lib.dec === d ? null : d;   // a decade label toggles
      drawLib();
    }));
    const qIn = el.querySelector('#r-q');
    qIn.addEventListener('input', () => { lib.q = qIn.value; drawLib(); });
    drawLib();
    wireJumps(el);
    if (openYear) {
      const phone = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
      const t = el.querySelector('#rp-y' + openYear) || el.querySelector((phone ? '#rp-c' : '#rp-r') + openYear);
      if (t) window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 120);
    }
  };
})();
