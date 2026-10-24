/* Advisory Actions page (#/actions[/pending | /committee/<ID or section number> | /year/<YYYY> | /item/<id>]).
   /item/<id> (e.g. p3139; linked from the Agenda Items page) shows that action's year with its row highlighted and
   focused; an unknown id gives the plain page.
   Data: data/src/advisory_actions.json → FCR.RAW.advisoryActions — an index of GSO item M-39, "Advisory Actions of the
   General Service Conference of Alcoholics Anonymous 1951–2026": {source, sections:[{sid, name, committee, kind, page}],
   actions:[{id, year, sec, page, text (a summary in our own words), floor?, noaction? (recorded but not adopted),
   cross? (the committee tag M-39 prints after the item), tags?, due?:[{year, month? | during?, what}]}]}; plus
   data/src/followups.json → FCR.RAW.followups: {requests (dated asks in the Final Reports — committee, board, trustees'
   and G.S.O. reports — that are not Advisory Actions; 'committed' ones may have no date), outcomes (what became of one)}.
   The repo is public, so it keeps no original wording; every row links to its page of the PDF on aa.org.
   Top of the page: everything dated after today (Advisory Action follow-ups and committee requests) so none is missed,
   then the ones that fell due at the last Conference and what became of them. Below: browse and search every action.
   Styles: assets/css/actions.css (class prefix aa-). */
(function () {
  'use strict';
  const FCR = window.FCR;
  const esc = FCR.esc;
  const V = FCR.views, UI = FCR.ui;
  const AA = (FCR.RAW && FCR.RAW.advisoryActions) || {};
  const SRC = AA.source || {};
  const SECS = AA.sections || [];
  const ALL = AA.actions || [];
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const secOf = (sid) => SECS.find((s) => s.sid === sid) || { name: String(sid) };
  const pageUrl = (p) => (SRC.public_url ? `${SRC.public_url}#page=${p}` : '');
  const ordinal = (y) => FCR.ordinal(y - 1950);
  // dated requests in the Final Reports (not Advisory Actions) + what became of follow-ups (data/src/followups.json)
  const FU = (FCR.RAW && FCR.RAW.followups) || {};
  const REQ = FU.requests || [], OUT = FU.outcomes || [];
  const KIND = { report: 'Report requested', draft: 'Draft requested', plan: 'Plan requested', recommitted: 'Recommitted to the committee', committed: 'Committed to the board', deferred: 'Deferred', deadline: 'Deadline', other: 'Planned' };
  // request meta line: "Report requested · asked by <by>, <year> · from <who>"; "Recommitted · by the Conference · back to <who>"
  const ASKED = { report: 'asked by ', draft: 'asked by ', plan: 'asked by ', recommitted: 'by ', committed: 'by ', deferred: 'by ' };
  const WHO = { report: 'from ', draft: 'from ', plan: 'from ', recommitted: 'back to ', deferred: 'to ', deadline: 'by ', other: 'involves ' };
  const ucfirst = (s) => String(s || '').replace(/^\s*\S/, (c) => c.toUpperCase());
  const STATUS = { done: 'done', progress: 'progress report, continues', not_done: 'not done', superseded: 'replaced', unclear: 'unclear', update: 'update' };
  const C_ORDER = Object.keys(FCR.COMMITTEES || {});
  const cOrder = (cid) => (cid && C_ORDER.indexOf(cid) >= 0 ? C_ORDER.indexOf(cid) : 99);
  const reportOf = (y) => (FCR.RAW.reports || []).find((r) => r.year === +y && !r.historical) || null;
  /** 'FR26 p45 L3770-3781' -> '2026 Final Report, PDF p. 45' (data refs count PDF pages, as on the other pages). */
  const frRef = (r) => {
    // 'FR26 p44 L1-2; p72 L5-9' -> '2026 Final Report, PDF pp. 44, 72'; 'FR25 p45 …; FR26 p97 …' -> both reports
    const byYear = [];
    let y = null;
    String(r || '').split(';').forEach((part) => {
      const m = /(?:FR(\d\d)\s*)?p(\d+)/.exec(part);
      if (!m) return;
      if (m[1]) y = m[1];
      if (!y) return;
      let g = byYear.find((z) => z.y === y); if (!g) byYear.push((g = { y, pages: [] }));
      if (!g.pages.includes(m[2])) g.pages.push(m[2]);
    });
    return byYear.length ? byYear.map((g) => `20${g.y} Final Report, PDF p${g.pages.length > 1 ? 'p' : ''}. ${g.pages.join(', ')}`).join('; ') : String(r || '');
  };
  // an outcome is known once the Conference of its Final Report has met (matters only for ?today= previews)
  let CYC = null;
  const outKnown = (o, cyc) => { const ys = [...String(o.ref || '').matchAll(/FR(\d\d)/g)].map((m) => 2000 + +m[1]); return !ys.length || !cyc || Math.max(...ys) <= cyc.lastConference; };
  // a follow-up may carry an 'update' (news before it falls due) and later its result: the last known non-'update' wins
  const pickOut = (list, cyc) => { const k = list.filter((o) => outKnown(o, cyc)); const f = k.filter((o) => o.status !== 'update'); return (f.length ? f[f.length - 1] : k[k.length - 1]) || null; };
  const stopAfter = (s) => (/[.!?”"]$/.test(String(s || '').trim()) ? '' : '.');

  /** "at the 77th Conference (Apr 11–17, 2027)" / "by January 2027" / "during 2035" (a year, not its Conference). */
  function dueLabel(y, m, during) {
    if (during) return `during ${y}`;
    if (m) return `by ${MON[m - 1]} ${y}`;
    const c = FCR.conference ? FCR.conference(y) : null;
    const dates = c && c.startDate ? ` (${UI.fmtRange(c.startDate, c.endDate, 'short')}${c.approx ? ', approx.' : ''})` : '';
    return `at the ${ordinal(y)} Conference${dates}`;
  }
  /** Still to come? A dated month counts until its end; a year without a month means that year's Conference. */
  function isPending(d, cyc, today) {
    if (d.year > cyc.year) return true;
    if (d.year < cyc.year) return false;
    if (d.during) return true;
    if (d.month) return d.month - 1 >= today.getMonth();
    return !(cyc.confOver && cyc.lastConference >= d.year);
  }
  const fold = (s) => FCR.fold(s);

  function row(a, opt) {
    const s = secOf(a.sec);
    const pend = opt && opt.pending;
    return `<li class="aa-row${a.floor ? ' floor' : ''}${a.noaction ? ' noaction' : ''}" id="aa-${esc(a.id)}">
      <div class="aa-meta small"><button type="button" class="linkish aa-sec" data-sec="${a.sec}">${esc(s.name)}</button>${a.floor ? ' <span class="badge" data-tip="Brought up on the Conference floor, not from a committee report" tabindex="0">floor action</span>' : ''}${a.noaction ? ' <span class="badge aa-na" data-tip="M-39 records this item, but the proposal itself was not adopted: no action was taken, it was tabled, deferred, referred or sent back, or the vote fell short" tabindex="0">not adopted</span>' : ''}${a.cross ? ` <span class="small muted" data-tip="M-39 marks this item with the committee or meeting it came from, and usually lists it in that committee’s section too" tabindex="0">· from: ${esc(a.cross)}</span>` : ''}</div>
      <div class="aa-text">${esc(a.text)}${stopAfter(a.text)}</div>
      ${!pend && (a.due || []).length ? `<div class="aa-due small">${a.due.map((d) => { const o = pickOut(OUT.filter((z) => z.action === a.id && z.due_year === d.year), CYC); return `<span class="chip aa-due-chip${o ? ' aa-st-' + esc(o.status) : ''}" data-tip="${esc(d.what + (o ? ` — ${STATUS[o.status] || o.status}: ${o.text}` : ''))}" tabindex="0">due ${esc(dueLabel(d.year, d.month, d.during).replace(/ \(.*\)$/, ''))}${o ? ` · ${esc(STATUS[o.status] || o.status)}` : ''}</span>`; }).join(' ')}</div>` : ''}
      <div class="aa-src small"><a href="${esc(pageUrl(a.page))}" target="_blank" rel="noopener">original wording, M-39 p. ${a.page} ↗</a></div>
    </li>`;
  }

  V.actions = function (el, args) {
    if (!ALL.length) { el.innerHTML = `<div class="page-head"><div><h1>Advisory Actions</h1></div></div>${UI.empty('The Advisory Actions index is not loaded.')}`; return; }
    const cyc = FCR.cycle(), today = FCR.today();
    CYC = cyc;
    const y0 = Math.min(...ALL.map((a) => a.year)), y1 = Math.max(...ALL.map((a) => a.year));
    // ---- filters (from the URL, then from the controls) ----
    const st = { sec: '', era: '', q: '', floor: false, follow: false, limit: 120 };
    const a0 = args && args[0], a1 = args && args[1] ? (() => { try { return decodeURIComponent(args[1]); } catch (e) { return args[1]; } })() : '';
    if (a0 === 'committee' && a1) {
      const up = a1.toUpperCase();
      const s = SECS.find((x) => x.committee === up) || SECS.find((x) => String(x.sid) === a1);
      if (s) st.sec = String(s.sid);
    } else if (a0 === 'year' && /^\d{4}$/.test(a1) && +a1 >= y0 && +a1 <= y1) st.era = a1; // out of range: all years, as the select says
    // one action: its year, with every row of that year shown so the row is on the page
    const hit = a0 === 'item' && a1 ? ALL.find((a) => a.id === a1) || null : null;
    if (hit) { st.era = String(hit.year); st.limit = Math.max(st.limit, ALL.filter((a) => a.year === hit.year).length); }

    // ---- follow-ups: pending (future) and just fell due (what happened) ----
    // x = {d: {year, month?, during?, what}, a: Advisory Action} or {d, r: a request from a Final Report (followups.json)}.
    // Only what was already decided by the (possibly ?today=) date: actions and requests of Conferences that have met.
    const items = [];
    ALL.forEach((a) => a.year <= cyc.lastConference && (a.due || []).forEach((d) => items.push({ a, d, cid: secOf(a.sec).committee || null })));
    REQ.forEach((r) => r.due && r.from_year <= cyc.lastConference && items.push({ r, d: { year: r.due.year, month: r.due.month, during: r.due.during, what: r.text }, cid: r.committee || null }));
    const outcomeOf = (x) => pickOut(OUT.filter((o) => (x.a ? o.action === x.a.id : o.request === x.r.id) && (x.d.year ? o.due_year === x.d.year : !o.due_year)), cyc);
    const moved = (x) => { const o = outcomeOf(x); return !!o && o.status === 'superseded'; }; // the new date is a request of its own
    const mOf = (d) => d.month || (d.during ? 13 : 4); // a Conference is in April or May; "during" sorts last in its year
    const pending = items.filter((x) => isPending(x.d, cyc, today) && !moved(x)).sort((x, y) => x.d.year - y.d.year || mOf(x.d) - mOf(y.d) || cOrder(x.cid) - cOrder(y.cid) || (x.a ? 0 : 1) - (y.a ? 0 : 1));
    // fell due at (or since) the last Conference that has met; each outcome cites the report that shows it
    const recent = items.filter((x) => !isPending(x.d, cyc, today) && x.d.year >= cyc.lastConference).sort((x, y) => y.d.year - x.d.year || cOrder(x.cid) - cOrder(y.cid));
    // recommendations committed to the General Service Board: the report sets no date; listed until an outcome closes them
    const undated = REQ.filter((r) => !r.due && r.from_year <= cyc.lastConference).map((r) => ({ r, d: { what: r.text }, cid: r.committee || null }))
      .filter((x) => { const o = outcomeOf(x); return !(o && (o.status === 'done' || o.status === 'superseded')); });
    const groupBy = (list) => {
      const g = [];
      list.forEach((x) => { const k = `${x.d.year}|${x.d.month || ''}|${x.d.during ? 'y' : ''}`; let G = g.find((z) => z.k === k); if (!G) g.push((G = { k, year: x.d.year, month: x.d.month, during: x.d.during, list: [] })); G.list.push(x); });
      return g;
    };
    const outHTML = (o) => (o ? `<div class="aa-out small"><span class="badge aa-st aa-st-${esc(o.status)}">${esc(STATUS[o.status] || o.status)}</span> ${esc(o.text)}${stopAfter(o.text)} <span class="muted">(${esc(frRef(o.ref))})</span></div>` : '');
    const fuRow = (x) => {
      const o = outcomeOf(x);
      if (x.a) {
        return `<li class="aa-fu"><div class="aa-fu-what"><strong>${esc(ucfirst(x.d.what))}${stopAfter(x.d.what)}</strong></div>
          <div class="small ink2"><span class="aa-kind">Advisory Action</span> of the ${x.a.year} Conference · ${esc(secOf(x.a.sec).name)}${x.a.noaction ? ' (not adopted)' : ''}: ${esc(x.a.text)}${stopAfter(x.a.text)} <a href="${esc(pageUrl(x.a.page))}" target="_blank" rel="noopener">M-39 p. ${x.a.page} ↗</a></div>${outHTML(o)}</li>`;
      }
      const r = x.r, rep = reportOf(r.from_year);
      return `<li class="aa-fu aa-fu-req"><div class="aa-fu-what"><strong>${esc(r.text)}${stopAfter(r.text)}</strong></div>
        <div class="small ink2"><span class="aa-kind" data-tip="From a Final Report (a Conference committee report, or the board’s, trustees’ committees’ or G.S.O. reports); not an Advisory Action" tabindex="0">${esc(KIND[r.kind] || 'Request')}</span> · ${ASKED[r.kind] || ''}${esc(r.by || 'committee report')}, ${r.from_year}${r.who && r.kind !== 'committed' ? ` · ${WHO[r.kind] || ''}${esc(r.who)}` : ''} · ${esc(frRef(r.ref))}${rep && rep.drive_url ? ` <a href="${esc(rep.drive_url)}" target="_blank" rel="noopener">Open PDF ↗</a>` : ''}</div>${outHTML(o)}</li>`;
    };
    // a long group is split by the Conference committee that will receive the item (sub-heading one level down)
    const groupHTML = (G, H, title) => {
      const HS = 'h' + (+H.slice(1) + 1);
      const head = `<${H}>${title || `Due ${esc(dueLabel(G.year, G.month, G.during))}`} <span class="badge">${G.list.length}</span></${H}>`;
      if (G.list.length <= 6 || new Set(G.list.map((x) => x.cid)).size === 1) return `<div class="aa-fu-group">${head}${G.note || ''}<ul class="aa-fu-list">${G.list.map(fuRow).join('')}</ul></div>`;
      const subs = [];
      G.list.forEach((x) => { let s = subs.find((z) => z.cid === x.cid); if (!s) subs.push((s = { cid: x.cid, list: [] })); s.list.push(x); });
      return `<div class="aa-fu-group">${head}${G.note || ''}${subs.map((s) => `<div class="aa-fu-sub"><${HS} class="aa-fu-subh">${esc(s.cid && FCR.COMMITTEES[s.cid] ? FCR.COMMITTEES[s.cid].name : 'Other or the whole Conference')} <span class="small muted">${s.list.length}</span></${HS}><ul class="aa-fu-list">${s.list.map(fuRow).join('')}</ul></div>`).join('')}</div>`;
    };
    const undatedHTML = undated.length ? groupHTML({ list: undated, note: `<p class="small muted">Recommendations the Conference committed to the General Service Board. The board decides when and how to act on them; the report gives no date.</p>` }, 'h3', 'No date set') : '';
    const pendHTML = (pending.length ? groupBy(pending).map((G) => groupHTML(G, 'h3')).join('')
      : `<p class="muted">Nothing in the Advisory Actions or the Final Reports is dated after today.</p>`) + undatedHTML;
    const withOut = recent.filter((x) => { const o = outcomeOf(x); return o && o.status !== 'update'; }).length;
    const confOnly = recent.every((x) => !x.d.month && !x.d.during);
    const recentNote = (confOnly ? 'These were set for a Conference that has now met.' : 'These fell due recently, at a Conference that has now met or by a date now past.')
      + (cyc.reportPending ? ` The ${cyc.lastConference} Final Report is not in the app yet.` : '')
      + (withOut ? ' Where a Final Report shows what became of one, it is noted under it with its page; anything not done may come back as an agenda item.'
        : confOnly && !cyc.reportPending ? ` The ${cyc.lastConference} Final Report says whether each was done; anything not done may come back as an agenda item.`
          : ' A later Final Report should say whether each was done; anything not done may come back as an agenda item.');
    const recentHTML = recent.length ? `<details class="aa-recent"><summary>Fell due recently (${recent.length}) — ${withOut === recent.length ? 'what happened' : 'check they happened'}</summary>
        <p class="small muted">${esc(recentNote)}</p>
        ${groupBy(recent).map((G) => groupHTML(G, 'h3')).join('')}</details>` : '';
    const nReq = pending.filter((x) => x.r).length, nToCome = pending.length + undated.length;

    // ---- stats ----
    const nCross = ALL.filter((a) => a.cross).length, nNA = ALL.filter((a) => a.noaction).length;
    const sectionOptions = () => {
      const opt = (s) => `<option value="${s.sid}"${String(s.sid) === st.sec ? ' selected' : ''}>${esc(s.name)} (${ALL.filter((a) => a.sec === s.sid).length})</option>`;
      return `<option value="">All committees and topics</option>
        <optgroup label="Conference committees">${SECS.filter((s) => s.kind === 'committee').map(opt).join('')}</optgroup>
        <optgroup label="Former committee">${SECS.filter((s) => s.kind === 'historical').map(opt).join('')}</optgroup>
        <optgroup label="General topics">${SECS.filter((s) => s.kind === 'general').map(opt).join('')}</optgroup>`;
    };
    const decades = []; for (let d = Math.floor(y0 / 10) * 10; d <= y1; d += 10) decades.push(d);
    const eraOptions = () => `<option value="">All years ${y0}–${y1}</option>${decades.slice().reverse().map((d) => `<option value="${d}s"${st.era === d + 's' ? ' selected' : ''}>${d}s</option>`).join('')}
      <optgroup label="One Conference">${Array.from({ length: y1 - y0 + 1 }, (_, i) => y1 - i).map((y) => `<option value="${y}"${st.era === String(y) ? ' selected' : ''}>${y} · ${ordinal(y)}</option>`).join('')}</optgroup>`;

    el.innerHTML = `<div class="aa-page">
      <div class="page-head"><div><h1>Advisory Actions</h1>
        <p>Every Advisory Action of the General Service Conference from ${y0} to ${y1}, the recommendations the Conference adopted by substantial unanimity (two-thirds), which guide the General Service Board and the service structure. Each is summarized here in plain words; open its page for the original wording.${nNA ? ' The booklet also records some items the Conference did not adopt; they are marked “not adopted”.' : ''}</p></div></div>
      <div class="grid g4 aa-stats">
        <div class="card stat"><span class="v num">${ALL.length.toLocaleString('en-US')}</span><span class="l">entries ${y0}–${y1}, including ${nCross.toLocaleString('en-US')} marked with the committee or meeting they came from (most repeat an item in that committee’s section)${nNA ? ` and ${nNA} not adopted` : ''}</span></div>
        <div class="card stat"><span class="v num">${y1 - y0 + 1}</span><span class="l">Conferences covered</span></div>
        <div class="card stat"><span class="v num">${nToCome}</span><span class="l">follow-ups still to come${undated.length ? `, ${undated.length} of them with no date set` : ''}</span></div>
        <div class="card stat"><span class="v num">${ALL.filter((a) => a.floor).length}</span><span class="l">floor actions</span></div>
      </div>
      <nav class="flex rp-jump" aria-label="On this page"><span class="small muted">On this page:</span><button type="button" class="chip" data-jump="aa-pending">Pending follow-ups</button><button type="button" class="chip" data-jump="aa-browse">Browse and search</button>${FCR.learnTree && FCR.learnTree.node('advisory_actions') ? '<a class="chip" href="#/learn/advisory_actions">What is an Advisory Action?</a>' : ''}</nav>
      <section class="card aa-pending" id="aa-pending" tabindex="-1"><h2>Pending follow-ups <span class="badge">${nToCome}</span></h2>
        <p class="small ink2">Everything dated for later, so none is missed: follow-ups set by Advisory Actions (reports or drafts due at a coming Conference, items deferred to a later year, themes and events already set)${nReq ? `, and ${nReq} request${nReq === 1 ? '' : 's'} in the Final Reports (Conference committee reports, plus the board’s, trustees’ committees’ and G.S.O. reports): progress reports and drafts a committee asked to see again, items recommitted to a committee and other dated plans, which are not Advisory Actions` : ''}. Grouped by when they are due, then by the Conference committee that will receive them; dated ones also appear in the <a href="#/calendar">Calendar</a>.${undated.length ? ' Last, recommendations committed to the General Service Board, which have no date.' : ''}</p>
        ${pendHTML}${recentHTML}</section>
      <h2 class="section-title" id="aa-browse">Browse and search</h2>
      <div class="controls aa-controls">
        <label>Committee or topic <select id="aa-sec">${sectionOptions()}</select></label>
        <label>Years <select id="aa-era">${eraOptions()}</select></label>
        <label class="aa-q">Search <input type="search" id="aa-q" placeholder="words in the summaries, e.g. Big Book, anonymity, budget" autocomplete="off"></label>
        <label><input type="checkbox" id="aa-floor"> floor actions only</label>
        <label><input type="checkbox" id="aa-follow"> with a follow-up date</label>
      </div>
      <p id="aa-live" class="aa-live" role="status" aria-live="polite"></p>
      <div id="aa-results"></div>
      <p class="small muted aa-srcline">Source: ${esc(SRC.title || 'M-39')} (GSO item ${esc(SRC.item || 'M-39')}, ${esc(SRC.edition || '')}), © A.A. World Services, Inc. ${SRC.public_url ? `<a href="${esc(SRC.public_url)}" target="_blank" rel="noopener">Read it on aa.org ↗</a>` : ''}${SRC.drive_url ? ` · <a href="${esc(SRC.drive_url)}" target="_blank" rel="noopener">your Drive copy ↗</a>` : ''}. The summaries are this app’s own; the booklet keeps the original wording.</p>
    </div>`;

    const res = el.querySelector('#aa-results'), live = el.querySelector('#aa-live');
    function draw(announce) {
      const words = fold(st.q).split(' ').filter(Boolean);
      const list = ALL.filter((a) => {
        if (st.sec !== '' && String(a.sec) !== st.sec) return false;
        if (st.era) { if (/s$/.test(st.era)) { const d = +st.era.slice(0, 4); if (a.year < d || a.year > d + 9) return false; } else if (a.year !== +st.era) return false; }
        if (st.floor && !a.floor) return false;
        if (st.follow && !(a.due || []).length) return false;
        if (words.length) { const hay = fold(`${a.text} ${secOf(a.sec).name} ${(a.tags || []).join(' ')} ${a.year} ${a.cross || ''}${a.floor ? ' floor action' : ''}${a.noaction ? ' not adopted' : ''}`); if (!words.every((w) => hay.includes(w))) return false; }
        return true;
      }).sort((x, y) => y.year - x.year || x.sec - y.sec);
      const shown = list.slice(0, st.limit);
      const byYear = []; shown.forEach((a) => { let g = byYear.find((x) => x.year === a.year); if (!g) byYear.push((g = { year: a.year, list: [] })); g.list.push(a); });
      const sec = st.sec !== '' ? secOf(+st.sec) : null;
      // M-39 prints some items twice (in a committee's section and, marked "from:", under a topic): say so, so the count can differ from a Final Report's
      const nX = list.filter((a) => a.cross).length;
      const countTxt = `<strong>${list.length.toLocaleString('en-US')}</strong> ${nX ? `entr${list.length === 1 ? 'y' : 'ies'}, including ${nX.toLocaleString('en-US')} marked “from:” another committee or meeting` : `action${list.length === 1 ? '' : 's'}`}`;
      res.innerHTML = `<p class="small aa-count">${countTxt}${sec ? ` · ${esc(sec.name)}${sec.committee ? ` · <a href="#/committees/${FCR.latestYear}/${esc(sec.committee)}">this committee now →</a>` : ''}` : ''}</p>
        ${byYear.map((g) => `<div class="aa-ygroup"><h3 class="aa-yh">${g.year} <span class="small muted">${ordinal(g.year)} Conference · ${g.list.length}${list.filter((a) => a.year === g.year).length > g.list.length ? '+' : ''}</span></h3><ul class="aa-list">${g.list.map((a) => row(a)).join('')}</ul></div>`).join('') || UI.empty('No action matches.')}
        ${list.length > shown.length ? `<p><button type="button" class="btn" id="aa-more">Show ${Math.min(200, list.length - shown.length)} more (${(list.length - shown.length).toLocaleString('en-US')} left)</button></p>
        <p class="small muted aa-printnote">Printed: the first ${shown.length.toLocaleString('en-US')} of ${list.length.toLocaleString('en-US')} matching entries. Narrow the filters, or press “Show more” before printing, to include the rest.</p>` : ''}`;
      if (announce && live) live.textContent = `${list.length.toLocaleString('en-US')} ${list.length === 1 ? 'entry' : 'entries'}${sec ? ' · ' + sec.name : ''}`;
      const more = res.querySelector('#aa-more');
      // keep keyboard focus: move it to the first newly shown row
      if (more) more.addEventListener('click', () => { const n = st.limit; st.limit += 200; draw(); const first = res.querySelectorAll('.aa-row')[n]; if (first) { first.setAttribute('tabindex', '-1'); first.focus(); } });
    }
    const sel = (id) => el.querySelector(id);
    sel('#aa-sec').addEventListener('change', (e) => { st.sec = e.target.value; st.limit = 120; draw(true); });
    sel('#aa-era').addEventListener('change', (e) => { st.era = e.target.value; st.limit = 120; draw(true); });
    let qT = null;
    sel('#aa-q').addEventListener('input', (e) => { clearTimeout(qT); qT = setTimeout(() => { st.q = e.target.value; st.limit = 120; draw(true); }, 150); });
    sel('#aa-floor').addEventListener('change', (e) => { st.floor = e.target.checked; st.limit = 120; draw(true); });
    sel('#aa-follow').addEventListener('change', (e) => { st.follow = e.target.checked; st.limit = 120; draw(true); });
    // a section name in a row filters to that section; focus goes to the section select so the change is announced
    res.addEventListener('click', (e) => { const b = e.target.closest('[data-sec]'); if (!b) return; st.sec = b.dataset.sec; sel('#aa-sec').value = st.sec; st.limit = 120; draw(true); sel('#aa-browse').scrollIntoView({ block: 'start' }); sel('#aa-sec').focus({ preventScroll: true }); });
    el.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => { const t = el.querySelector('#' + b.dataset.jump); if (t) { t.scrollIntoView({ block: 'start' }); if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); } }));
    draw();
    // an item link: highlight its row and move focus there (the router then leaves focus alone); scroll once laid out
    const row1 = hit ? el.querySelector('#aa-' + hit.id) : null;
    if (row1) {
      row1.classList.add('aa-hit'); row1.setAttribute('tabindex', '-1');
      try { row1.focus({ preventScroll: true }); } catch (e) { /* old browsers */ }
      requestAnimationFrame(() => row1.scrollIntoView({ block: 'center' }));
    }
    // deep links scroll to their part of the page
    const target = a0 === 'pending' ? '#aa-pending' : (a0 === 'committee' || a0 === 'year') ? '#aa-browse' : null;
    if (target) requestAnimationFrame(() => { const t = el.querySelector(target); if (t) t.scrollIntoView({ block: 'start' }); });
  };
})();
