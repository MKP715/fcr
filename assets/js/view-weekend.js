/* Board Weekends page (#/weekends[/<meeting id>[/<report id>]]).
   Data: data/src/board_meetings.json → FCR.RAW.boardMeetings — the General Service Board's quarterly weekends, newest
   first, in this app's own words: {meta:{about, note}, meetings:[{id (the board meeting's date, '2026-11-02'), season,
   quarter, year, title, formal, start, end, board_meeting, place, calendar_id, pai_cycle, source:{title, short, pages,
   drive_url, minutes_status, audience, page_note, slips}, overview:[{text, page}], attendance:{trustees_present,
   trustees_total, guests, page}, reports:[{id, name, kind ('minutes'|'board'|'trustees_committee'|'session'|'other'), tc
   (FCR.TRUSTEES_COMMITTEES key | null), body (pai.json bodies key | null), met, summary, accepted, accepted_page,
   highlights:[{text, page}], recommendations:[{text, outcome, status, board, page}], numbers:[{label, value, as_of, page}],
   next:[{date, end?, approx, text, page, calendar_id?}], pai:{assigned, considered, forwarded, no_action, other, page,
   note?} | null, followups:[{request (followups.json id) | null, text, page}]}], coming_up:[{date, end?, approx, text,
   page, calendar_id?}], numbers:[{label, value, as_of, page, report}]}]}. Checked by build_data.py check_board_meetings.
   Every page number is a PDF page of the packet ("Q4 2026 board reports p. N"); dates are ISO, or 'YYYY-MM' when only
   the month is known.
   Also read: FCR.RAW.pai (source, item statuses, agenda_topics, open_meetings, bodies) for the proposal tile and "What it
   means for the Conference" — every count computed, none typed; calendar.json events (date links to #/calendar/<id>);
   followups.json requests (what a follow-up answers); the Learn glossary ("Reading these reports"); drive.json's Quarterly
   Report (F-14) entry (the public summary on aa.org).
   Page: head (lede, related links, meeting chips when there are several); the meeting (dates, where it stands on
   FCR.today(), so ?today= works; overview; the next board meeting from the calendar, gsb-q1…q4 or the annual meeting
   after the Conference, or the one under way on the day viewed; a note when a newer board weekend has met whose reports are not loaded, or when the grid the
   counts come from is later than the day viewed; the minutes' status, past tense once the next quarterly meeting has
   approved them); at a glance (stat tiles; the recommendation tile counts only votes of reports that met during the
   weekend); what it means for the next Conference (agenda topics by Conference committee, still open, coming up: past
   dates marked done; past tense and a pointer to the Conference's outcome once it has met); board and committee reports (a card per
   report, grouped Boards / Trustees' committees / Sessions & other: name, kind, date and summary always shown, the rest
   in a <details> that print opens); numbers worth knowing; reading these reports; source with the packet's slips.
   Deep links: /<id> shows that meeting; /<id>/<report id> opens, highlights and focuses that report's card; an unknown
   meeting or report id is the plain page (the newest meeting, or that meeting) with a callout.
   Styles: assets/css/weekend.css (class prefix wk-). */
(function () {
  'use strict';
  const FCR = window.FCR;
  const esc = FCR.esc;
  const V = FCR.views, UI = FCR.ui;
  const RAW = FCR.RAW || {};
  const BM = RAW.boardMeetings || {};
  const META = BM.meta || {};
  const MEETINGS = BM.meetings || [];
  const P = RAW.pai || {};
  const PSRC = P.source || {};
  const ITEMS = P.items || [], TOPICS = P.agenda_topics || [], OPEN = P.open_meetings || [], BODIES = P.bodies || {};
  const CAL = RAW.calendar || {};
  const REQS = (RAW.followups || {}).requests || [];
  const GLOSS = (RAW.learn || {}).glossary || [];
  const DOCS = (RAW.drive || {}).docs || [];
  const TC = FCR.TRUSTEES_COMMITTEES || {};
  const nth = (n) => FCR.ordinal(n);
  const num = (n) => Number(n || 0).toLocaleString('en-US');
  const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many || one + 's'}`;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const listAnd = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
  const ucfirst = (s) => String(s || '').replace(/^\s*\S/, (c) => c.toUpperCase());
  const stopAfter = (s) => (/[.!?”"’)]$/.test(String(s || '').trim()) ? '' : '.');
  const dec = (s) => { try { return decodeURIComponent(s || ''); } catch (e) { return s || ''; } };
  const fmtD = (d) => UI.fmtDate(d, 'short');
  const monthOnly = (d) => /^\d{4}-\d{2}$/.test(String(d || ''));
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wday = (d) => { const D = UI.toDate(d); return D ? WD[D.getDay()] : ''; };
  /** Today as 'YYYY-MM-DD' (FCR.today(), so ?today= works). */
  const todayStr = () => {
    if (FCR.calendar && FCR.calendar.todayStr) return FCR.calendar.todayStr();
    const t = FCR.today(), p = (n) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
  };

  // ---------- lookups (no prototype: a route argument such as "constructor" must not count as a hit) ----------
  const dict = () => Object.create(null);
  const itemBy = dict(); ITEMS.forEach((x) => { itemBy[x.key] = x; });
  const evBy = dict(); (CAL.events || []).forEach((e) => { evBy[e.id] = e; });
  const reqBy = dict(); REQS.forEach((r) => { reqBy[r.id] = r; });
  const bodyOf = (k) => (k && Object.prototype.hasOwnProperty.call(BODIES, k) ? BODIES[k] : null);
  const BOARD_TINY = { AAWS: 'AAWS', GV: 'Grapevine', GSB: 'the board' };   // the "still open" breakdown
  const bodyName = (k) => { const b = bodyOf(k); return b ? b.name : k || ''; };
  /** Shortest clear name of a reviewing body: the trustees' committee's short name, else the board's. */
  const bodyTiny = (k) => { const b = bodyOf(k), t = b && b.tc && TC[b.tc]; return t ? (b.tc === 'CONFERENCE' ? 'Conference Committee (trustees’)' : t.short) : BOARD_TINY[k] || bodyName(k); };
  const pg = (p) => (p ? `<span class="wk-pg">p. ${esc(p)}</span>` : '');
  /** The Calendar route of an event id; an event listed on several dates has a key per date, so it gets no single link. */
  const calHref = (id) => { const e = id && evBy[id]; return e && !(e.dates && e.dates.length) ? `#/calendar/${encodeURIComponent(id)}` : ''; };
  const itemLink = (k) => {
    const x = itemBy[k];
    return x ? `<a class="wk-num" href="#/agenda/item/${encodeURIComponent(k)}" data-tip="${esc(`#${k}: ${x.title || 'proposal'}`)}">#${esc(k)}</a>` : `#${esc(k)}`;
  };
  /** Escape text and link each proposal number in it ("#12", "#2025-7") to Agenda Items when the item exists, as the
      Agenda page's linkify does; "Floor Action #6", "Article #12" and the like name something else and stay plain. */
  const linkNums = (raw) => {
    const re = /#(\d{4}-\d{1,3}|\d{1,3})\b/g, s = String(raw || '');
    let out = '', last = 0, mt;
    while ((mt = re.exec(s))) {
      const isRef = itemBy[mt[1]] && !/(?:^|[^a-z])(?:action|no\.?|number|article|step|page|chapter|tradition|concept)\s*$/i.test(s.slice(Math.max(0, mt.index - 14), mt.index));
      out += esc(s.slice(last, mt.index)) + (isRef ? itemLink(mt[1]) : esc(mt[0]));
      last = re.lastIndex;
    }
    return out + esc(s.slice(last));
  };
  /** A link to a Learn glossary term (exact term, folded), or the plain text when the glossary lacks it. */
  const gloss = (term, text) => {
    const f = FCR.fold(term), g = GLOSS.find((x) => FCR.fold(x.term) === f);
    return g ? `<a href="#/learn/glossary/${encodeURIComponent(g.term)}" data-tip="${esc(`Glossary: ${g.term}`)}">${esc(text || term)}</a>` : esc(text || term);
  };
  const learnNode = (id) => (FCR.learnTree && FCR.learnTree.node(id)) || null;
  // the Conference committees page for a coming Conference (it projects the year after the last report)
  const cYear = (cy) => (FCR.years.includes(cy) || cy === FCR.latestYear + 1 ? cy : FCR.latestYear);
  const repShort = (r) => String(r.name || r.id).replace(/\s*\([^)]*\)$/, '');

  // ---------- dates ----------
  /** "Nov 21–23, 2026" · "December 2026" · "about Jan 11–15, 2027" for {date, end?, approx}. */
  function whenTxt(o) {
    if (!o || !o.date) return 'No date given';
    if (monthOnly(o.date)) return UI.fmtDate(o.date, 'long');
    const s = o.end && o.end !== o.date ? UI.fmtRange(o.date, o.end, 'short') : UI.fmtDate(o.date, 'short');
    return (o.approx ? 'about ' : '') + s;
  }
  /** 'done' | 'now' | 'next' on day t; a month-only date covers its whole month. */
  function dayState(o, t) {
    if (!o || !o.date) return 'next';
    const s = monthOnly(o.date) ? o.date + '-01' : o.date;
    const e = o.end || (monthOnly(o.date) ? o.date + '-31' : o.date);
    return e < t ? 'done' : s <= t ? 'now' : 'next';
  }
  /** One dated row: the date (a Calendar link when the event exists), a done / now tag, a countdown, the text. */
  function dateRow(o, t, extra) {
    const st = dayState(o, t);
    const w = esc(whenTxt(o)), href = calHref(o.calendar_id);
    const tag = st === 'done' ? '<span class="wk-tag done">done</span>' : st === 'now' ? `<span class="wk-tag now">${monthOnly(o.date) ? 'this month' : o.approx ? 'about now' : 'now'}</span>` : '';
    const cd = st === 'next' && o.date && !monthOnly(o.date) ? UI.inDays(UI.daysUntil(o.date)) : '';
    return `<li class="wk-d wk-${st}"><div class="wk-dt">${href ? `<a href="${href}" data-tip="Open in the Calendar">${w}</a>` : w}${tag}${cd ? `<span class="wk-cd">${esc(cd)}</span>` : ''}</div>
      <div class="wk-dx">${o.text ? `${linkNums(o.text)}${stopAfter(o.text)} ` : ''}${pg(o.page)}${extra || ''}</div></li>`;
  }
  /** The next quarterly board weekend after day t, from the calendar (rules gsb-q1…q4), or with `annual` also the board's
      annual meeting right after the Conference (rule gsb-annual-meeting, the spring quarter's meeting): an occurrence or null. */
  function nextWeekend(t, annual) {
    if (!FCR.calendar || !FCR.calendar.items) return null;
    const re = annual ? /^gsb-(q[1-4]|annual-meeting)$/ : /^gsb-q[1-4]$/;
    try {
      return FCR.calendar.items({ from: t, to: FCR.calendar.add(t, 400), scope: 'everything' }).find((o) => re.test(o.ruleId || '') && o.start > t) || null;
    } catch (e) { return null; }
  }

  // ---------- the proposals, computed from the status grid that followed the weekend ----------
  const OUT = new Set(['withdrawn', 'superseded', 'removed']);
  /** Counts for meeting m, or null when the loaded grid is not this cycle's or predates the weekend. */
  function paiStats(m) {
    if (!ITEMS.length || !m.pai_cycle || PSRC.ordinal !== m.pai_cycle || !(String(PSRC.as_of || '') >= m.end)) return null;
    const cur = ITEMS.filter((x) => x.cycle === PSRC.ordinal);
    const n = (f) => cur.filter(f).length;
    const s = {
      total: PSRC.total || cur.length, asOf: PSRC.as_of,
      fwd1: n((x) => x.status === 'forwarded'), fwdT: n((x) => x.status === 'forwarded_topic'),
      no: n((x) => x.status === 'no_action'), under: n((x) => x.status === 'under'), out: n((x) => OUT.has(x.status)),
    };
    s.fwd = s.fwd1 + s.fwdT;
    if (!s.fwd && !s.no) return null;   // a grid without decisions yet
    const kind = (k) => TOPICS.filter((x) => x.kind === k);
    const keysIn = (ts) => ts.reduce((a, x) => a + (x.keys || []).length, 0);
    s.items = kind('item'); s.general = kind('general_topic'); s.added = kind('added');
    s.entries = s.items.length + s.general.length + s.added.length;
    s.itemProps = keysIn(s.items); s.genProps = keysIn(s.general);
    // still open, by who holds them (an item referred to another committee counts as referred)
    const open = dict();
    cur.filter((x) => x.status === 'under').forEach((x) => { const k = (x.decision || {}).action === 'referred' ? 'referred' : x.body || '-'; open[k] = (open[k] || 0) + 1; });
    s.open = Object.keys(open).map((k) => ({ k, n: open[k] })).sort((a, b) => (a.k === 'referred') - (b.k === 'referred') || b.n - a.n);
    s.openTxt = s.open.map((o) => `${o.n} ${o.k === 'referred' ? 'referred' : o.k === '-' ? 'other' : bodyTiny(o.k)}`).join(' · ');
    return s;
  }

  // ---------- the meeting: dates, where it stands today, overview ----------
  /** True once the board meeting that approves meeting m's minutes (its next quarterly meeting: a board weekend, or the
      annual meeting right after the Conference) has ended before day t. */
  function minutesApproved(m, t) {
    const ap = nextWeekend(m.end, true);
    return !!(ap && t > ap.end);
  }
  function meetingHTML(m, s, t) {
    const range = `${wday(m.start)}, ${UI.fmtDate(m.start, 'day')} – ${wday(m.end)}, ${UI.fmtDate(m.end, 'short')}`;
    const st = t < m.start ? 'before' : t <= m.end ? 'now' : 'after';
    const src = m.source || {};
    // the proposal counts come from the grid that followed the weekend: say so when that grid is later than the day viewed
    const gridLater = !!(s && s.asOf && t < s.asOf);
    const gridTxt = gridLater ? ` Its proposal counts come from GSO’s status grid of ${esc(fmtD(s.asOf))}.` : '';
    let where = '';
    if (st === 'before') where = `<p class="wk-asof">You are viewing the app as of ${esc(fmtD(t))}, before this weekend met. The page describes what it went on to do, from its reports.${gridTxt}</p>`;
    else if (st === 'now') where = `<p class="wk-asof">You are viewing the app as of ${esc(fmtD(t))}, while this weekend was meeting. The page describes what it did, from the reports that followed.${gridTxt}</p>`;
    else if (gridLater) where = `<p class="wk-asof">You are viewing the app as of ${esc(fmtD(t))}. The proposal counts on this page come from GSO’s status grid of ${esc(fmtD(s.asOf))}, which came out after that date.</p>`;
    // a later board weekend (or the annual meeting) under way on day t: name it, not the one after it (nextWeekend
    // looks only past t, as minutesApproved needs)
    let curBM = null;
    if (st === 'after' && FCR.calendar && FCR.calendar.items) {
      try {
        curBM = FCR.calendar.items({ from: t, to: t, scope: 'everything' }).find((o) => /^gsb-(q[1-4]|annual-meeting)$/.test(o.ruleId || '') && o.start <= t) || null;
      } catch (e) { curBM = null; }
    }
    const nx = st === 'after' && !curBM ? nextWeekend(t, true) : null;
    const ago = st === 'after' ? UI.inDays(UI.daysUntil(m.end)) : '';
    // a board weekend is named and counted down as the whole weekend (its board meeting closes it, on the last day); a
    // projected one ("about …") is counted down as the Calendar does ("in about 15 weeks"), a confirmed one in days
    const nxTxt = nx ? `Next ${nx.ruleId === 'gsb-annual-meeting' ? 'board meeting: the annual meeting after the Conference,' : 'board weekend:'} <a href="#/calendar/${encodeURIComponent(nx.key)}">${esc(FCR.calendar.when(nx))}</a> (${esc(nx.approx && FCR.calendar.countdown ? FCR.calendar.countdown(nx, t) : UI.inDays(UI.daysUntil(nx.start)))}).` : '';
    const curA = curBM ? `<a href="#/calendar/${encodeURIComponent(curBM.key)}">${esc(FCR.calendar.when(curBM))}</a>` : '';
    const curTxt = !curBM ? ''
      : curBM.ruleId === 'gsb-annual-meeting' ? `The board holds its annual meeting today (${curA}).`
        : `The next board weekend is under way (${curA}); its board meeting closes it on the last day${curBM.end === t ? ', today' : ` (${esc(UI.inDays(UI.daysUntil(curBM.end)))})`}.`;
    // the newest meeting in this app, viewed after a later board weekend has met: its reports are not loaded yet
    const later = st === 'after' && m === MEETINGS[0] && UI.boardWeekendsSince ? UI.boardWeekendsSince(m.end) : [];
    if (later.length) where = `<p class="callout warn small">${esc(UI.metSinceText ? UI.metSinceText(later) : `A newer board weekend has met since (${UI.fmtRange(later[later.length - 1].start, later[later.length - 1].end)})`)}; its reports are not in this app yet.</p>`;
    // the minutes are a draft until the next quarterly meeting approves them (the same test as "Reading these reports")
    const minTxt = !src.minutes_status ? ''
      : minutesApproved(m, t) ? '; the minutes in it are the draft sent out before the board approved them'
        : `; the minutes in it are ${esc(src.minutes_status)}`;
    return `<section class="card wk-meet" id="wk-meet" aria-labelledby="wk-meet-h">
      <h2 id="wk-meet-h">${esc(m.title)}</h2>
      <p class="wk-formal">${esc(m.formal || '')}${m.formal ? ' · ' : ''}${esc(range)} · ${esc(m.place || '')}${ago ? ` · <span class="muted">${esc(ago)}</span>` : ''}</p>
      ${where}
      ${(m.overview || []).length ? `<ul class="wk-ov">${m.overview.map((o) => `<li>${linkNums(o.text)}${stopAfter(o.text)} ${pg(o.page)}</li>`).join('')}</ul>` : ''}
      <p class="small muted wk-pgnote">“p. N” on this page is page N of the PDF of the ${esc(src.short || 'board reports')}${minTxt}.${nxTxt || curTxt ? ` ${nxTxt || curTxt}` : ''}</p>
    </section>`;
  }

  // ---------- at a glance ----------
  function glanceHTML(m, s) {
    const tiles = [];
    tiles.push(`<div class="card stat"><span class="v">${esc(UI.fmtRange(m.start, m.end, 'day'))}</span><span class="l">${esc(m.year)}, ${esc(m.place || '')}; the board met ${esc(wday(m.board_meeting))}, ${esc(UI.fmtDate(m.board_meeting, 'day'))}</span></div>`);
    const at = m.attendance || {};
    if (at.trustees_total) tiles.push(`<div class="card stat"><span class="v">${num(at.trustees_present)} of ${num(at.trustees_total)}</span><span class="l">trustees present${at.guests ? `; ${esc(at.guests)}` : ''} ${pg(at.page)}</span></div>`);
    if (s) {
      // the forwarded proposals make s.items + s.general entries; the trustees' committees' own added items hold none
      const fromProps = s.items.length + s.general.length;
      tiles.push(`<div class="card stat wk-kpi-pai"><span class="v">${num(s.fwd)} of ${num(s.total)}</span><span class="l"><a href="#/agenda/forwarded">forwarded to the ${esc(nth(m.pai_cycle))} Conference</a> (${pct(s.fwd, s.total)}%) as ${plural(fromProps, 'agenda entry', 'agenda entries')}${s.added.length ? ` (${num(s.entries)} in all with the ${num(s.added.length)} the trustees’ committees added)` : ''} · <a href="#/agenda/status/no">${num(s.no)} no action</a> · <a href="#/agenda/status/under">${num(s.under)} still open</a>${s.openTxt ? ` (${esc(s.openTxt)})` : ''}${s.out ? ` · <a href="#/agenda/status/out">${num(s.out)} withdrawn, superseded or removed</a> before the weekend` : ''} · grid of ${esc(fmtD(s.asOf))}</span></div>`);
    }
    // only the votes taken at this weekend: a report met during it (the attached June–July AAWS highlights have no date
    // and their approvals are months older; they stay on their own card)
    const recs = [];
    (m.reports || []).filter((r) => r.met && r.met >= m.start && r.met <= m.end).forEach((r) => (r.recommendations || []).forEach((x) => recs.push(x)));
    const gsb = recs.filter((x) => x.board === 'GSB' && x.status === 'approved');
    const other = recs.filter((x) => x.board !== 'GSB' && x.status === 'approved');
    if (recs.length) {
      const su = gsb.length && gsb.every((x) => /substantial unanimity/i.test(x.outcome || ''));
      const nB = new Set(other.map((x) => x.board)).size;
      const boards = listAnd([...new Set(other.map((x) => BOARD_TINY[x.board] || x.board))]);
      tiles.push(`<div class="card stat"><span class="v">${num(gsb.length)}</span><span class="l">committee recommendation${gsb.length === 1 ? '' : 's'} the General Service Board approved${su ? `, ${gsb.length === 1 ? '' : 'all '}by ${gloss('Substantial unanimity', 'substantial unanimity')}` : ''}${other.length ? `; the ${esc(boards)} board${nB > 1 ? 's' : ''} approved ${num(other.length)} more of ${nB > 1 ? 'their' : 'its'} own` : ''}</span></div>`);
    }
    const fin = new Set((m.reports || []).filter((r) => r.tc === 'FINANCE').map((r) => r.id));
    const fn = (m.numbers || []).filter((x) => fin.has(x.report));
    const months = fn.find((x) => /month/i.test(x.value)) || fn[0], bal = fn.find((x) => x !== months && /balance/i.test(x.label));
    if (months) tiles.push(`<div class="card stat"><span class="v">${esc(months.value)}</span><span class="l">${esc(months.label)}${months.as_of ? `, ${esc(months.as_of)}` : ''}${bal ? `; ${esc(bal.label)}: ${esc(bal.value)}` : ''} ${pg(months.page)}</span></div>`);
    return `<section class="wk-sec" id="wk-glance" aria-labelledby="wk-glance-h"><h2 class="section-title" id="wk-glance-h">At a glance</h2>
      <div class="grid g4 wk-kpis">${tiles.join('')}</div></section>`;
  }

  // ---------- what it means for the next Conference ----------
  function topicLi(x) {
    const keys = x.keys || [];
    const copies = keys.filter((k) => itemBy[k] && itemBy[k].same_as && keys.includes(itemBy[k].same_as)).length;
    const kind = x.kind === 'added' ? 'added by the trustees’ committee'
      : x.kind === 'general_topic' ? `${keys.length} proposals in one topic${copies ? `, ${copies === 1 ? '1 of them an exact copy' : `${num(copies)} of them exact copies`}` : ''}`
        : `${plural(keys.length - copies, 'proposal')}${copies ? ` + ${plural(copies, 'exact copy', 'exact copies')}` : ''}`;
    const cls = x.kind === 'general_topic' ? ' gen' : x.kind === 'added' ? ' add' : '';
    return `<li><a class="wk-tt" href="#/agenda/topic/${encodeURIComponent(x.id)}" data-tip="${esc(x.summary || x.title)}">${esc(x.title)}</a>
      <span class="wk-tmeta small"><span class="wk-kind${cls}">${esc(kind)}</span> <span class="muted">${esc(bodyName(x.by))}</span></span></li>`;
  }
  function topicsHTML(cy) {
    const order = (c) => { const i = (FCR.PRIMARY_ORDER || []).indexOf(c); return c ? (i >= 0 ? i : 50) : 99; };
    const groups = [];
    TOPICS.filter((x) => x.kind !== 'reference').forEach((x) => {
      const c = x.to_committee || '';
      let g = groups.find((y) => y.c === c);
      if (!g) groups.push((g = { c, list: [] }));
      g.list.push(x);
    });
    groups.sort((a, b) => order(a.c) - order(b.c));   // stable: the data's order within a committee
    const yr = cYear(cy);
    return groups.map((g) => {
      const cc = g.c && FCR.COMMITTEES[g.c];
      const prov = g.list.some((x) => x.to_provisional);
      const head = cc ? `<a href="#/committees/${yr}/${esc(g.c)}">Conference Committee on ${esc(cc.name)}</a>` : 'Committee not named in this weekend’s reports';
      return `<div class="wk-cgroup"><h4 class="wk-cgh">${head}${prov ? ` <span class="wk-prov" tabindex="0" data-tip="The trustees’ committee named this Conference committee only for possible routing, leaving the choice of committee to the final agenda.">provisional routing</span>` : ''}</h4>
        <ul class="wk-topics">${g.list.map(topicLi).join('')}</ul></div>`;
    }).join('');
  }
  /** Still open (pai open_meetings that hold proposals), soonest first; an undated entry last. `over`: the Conference has
      met since. Entries without proposals (the final agenda, the board's unnamed topics) are openNotesHTML's. */
  function openHTML(t, over) {
    const list = OPEN.filter((o) => (o.keys || []).length).sort((a, b) => (a.date ? 0 : 1) - (b.date ? 0 : 1) || String(a.date || '').localeCompare(String(b.date || '')));
    return list.map((o) => {
      // a meeting the packet dates two ways shows its calendar event's span, "about" included (Literature: about Nov 21–23),
      // as Agenda Items does; so does an entry dated the first day of a ruled event (the Conference week, a board weekend).
      // A board-weekend entry dated by a later day (its Monday board meeting) and a month-only date keep the entry's own date.
      const ev = evBy[o.calendar_id];
      const span = ev && (!ev.rule || o.date === ev.start) && o.date && !monthOnly(o.date) && ev.start <= o.date && o.date <= ev.end && ev.start !== ev.end;
      const d = Object.assign({}, o, span ? { date: ev.start, end: ev.end, approx: !!ev.approx } : {}, { text: '', page: null });
      const keys = o.keys || [];
      const open = keys.filter((k) => itemBy[k] && itemBy[k].status === 'under');
      const held = dayState(d, t) === 'done' && open.length
        ? ` <em class="wk-held">${over ? 'It has met; later status grids and the Conference’s own actions show the outcome.' : 'It has met; the next status grid will show what it decided.'}</em>` : '';
      const who = o.by ? esc(bodyName(o.by)) : 'Held for the Conference itself';
      const also = (o.also || []).length ? `; also p. ${o.also.map(esc).join(', ')}` : '';
      return dateRow(d, t, `<strong class="wk-who">${who}</strong>${keys.length ? ` · ${plural(keys.length, 'proposal')}: <span class="wk-nums">${keys.map(itemLink).join(' ')}</span>` : ''}
        <p class="wk-otext">${linkNums(o.text)}${stopAfter(o.text)}${held}</p>
        <p class="small muted wk-onote">${o.date_note ? `${esc(o.date_note)}${stopAfter(o.date_note)} ` : ''}<span class="wk-pg">${esc(o.cite || '')}${also}</span></p>`);
    }).join('');
  }
  /** The open_meetings entries that hold no proposal, as plain notes: the entry's title (else who), the text, the date note and cite, with no
      date tag, done/now tag or countdown (they are not meetings on open proposals). A note whose date has passed by
      day t (a month-only date: once its month has ended) is left out; its text speaks of it as still to come. */
  function openNotesHTML(t) {
    return OPEN.filter((o) => !(o.keys || []).length && !(o.date && (monthOnly(o.date) ? o.date + '-31' : o.date) < t)).map((o) => `<li class="wk-d wk-onokey"><div class="wk-dx">
      <strong class="wk-who">${o.title ? esc(o.title) : o.by ? esc(bodyName(o.by)) : 'Held for the Conference itself'}</strong>
      <p class="wk-otext">${linkNums(o.text)}${stopAfter(o.text)}</p>
      <p class="small muted wk-onote">${o.date_note ? `${esc(o.date_note)}${stopAfter(o.date_note)} ` : ''}<span class="wk-pg">${esc(o.cite || '')}</span></p></div></li>`).join('');
  }
  function confHTML(m, s, t) {
    const cy = (m.pai_cycle || 0) + 1950;
    const conf = s && FCR.conference ? FCR.conference(cy) : null;
    const confDates = conf && conf.startDate ? UI.fmtRange(conf.startDate, conf.endDate, 'long') : '';
    // viewed after that Conference has met: past tense, and a pointer to where its outcome is recorded. conf.over is true
    // from 00:00 on the closing day, while it still meets; with known dates, "met" starts the day after it ends
    const over = !!(conf && (conf.end ? t > conf.end : conf.over));
    const ups = (m.coming_up || []).slice();
    const past = ups.filter((o) => dayState(o, t) === 'done').length;
    const ref = TOPICS.filter((x) => x.kind === 'reference');
    let agenda = '';
    if (s) {
      const dupe = s.itemProps - s.items.length;
      const fromProps = s.items.length + s.general.length;   // the entries the forwarded proposals make
      agenda = `<h3 class="wk-h3">On the agenda</h3>
        <p class="wk-lead">By GSO’s status grid of ${esc(fmtD(s.asOf))}${t < s.asOf ? ' (published after the day you are viewing)' : ''}, <strong>${num(s.fwd)} of the ${num(s.total)} proposals (${pct(s.fwd, s.total)}%)</strong> ${over ? 'went on' : 'go on'} to the ${esc(nth(m.pai_cycle))} Conference${confDates ? ` (${esc(confDates)})` : ''} as <strong>${plural(fromProps, 'agenda entry', 'agenda entries')}</strong>:
          ${plural(s.items.length, 'single item')}${dupe > 0 ? ` (${num(s.itemProps)} proposals; identical ones count once)` : ''} and ${plural(s.general.length, 'general topic')} holding ${num(s.genProps)} proposals.${s.added.length ? ` The trustees’ committees added ${plural(s.added.length, 'item')} of their own, ${num(s.entries)} entries in all.` : ''}
          <a href="#/agenda/status/no">${num(s.no)} got no action</a> and <a href="#/agenda/status/under">${num(s.under)} ${over ? 'were' : 'are'} still open</a>${s.out ? `; the other ${num(s.out)} had been <a href="#/agenda/status/out">withdrawn, superseded or removed</a> before the weekend` : ''}.</p>
        ${topicsHTML(cy)}
        ${ref.map((x) => {
          // as Agenda Items does: the summary links most related proposals already, so only the others are listed again
          const rel = (x.related || []).filter((k) => !new RegExp(`#${k}\\b`).test(x.summary || ''));
          const also = (x.also || []).length ? `; also ${x.also.length > 1 ? 'pp.' : 'p.'} ${x.also.map(esc).join(', ')}` : '';
          return `<p class="wk-ref small"><strong>${esc(x.title)}.</strong> ${linkNums(x.summary)}${stopAfter(x.summary)}${rel.length ? ` Related proposals: <span class="wk-nums">${rel.map(itemLink).join(' ')}</span>.` : ''} <span class="wk-pg">${esc(x.cite || '')}${also}</span></p>`;
        }).join('')}
        <p class="small"><a href="#/agenda/forwarded">Every forwarded proposal on Agenda Items →</a></p>`;
    }
    const openN = s ? s.under : 0;
    // proposals held over from an earlier cycle that the list also shows (they wait for the Conference, not a trustees' body)
    const listed = new Set(OPEN.flatMap((x) => x.keys || []));
    const heldN = ITEMS.filter((x) => x.status === 'deferred' && listed.has(x.key)).length;
    const side = OPEN.length && s ? `<h3 class="wk-h3">Still open</h3>
        <p class="small ink2">In the grid of ${esc(fmtD(s.asOf))}, ${plural(openN, over ? 'proposal was' : 'proposal is', over ? 'proposals were' : 'proposals are')} not decided yet${heldN ? `, and the ${num(heldN)} held over from an earlier year ${over ? 'waited' : 'wait'} for the Conference itself` : ''}. Where and when each ${over ? 'was' : 'is'} next taken up:</p>
        <ul class="wk-dates wk-open">${openHTML(t, over)}</ul>${(() => { const n = openNotesHTML(t); return n ? `<p class="small ink2 wk-also">Also pending:</p><ul class="wk-dates wk-open wk-open-notes">${n}</ul>` : ''; })()}` : '';
    const overNote = over && s ? `<p class="callout small">The ${esc(nth(m.pai_cycle))} Conference has since met${confDates ? ` (${esc(confDates)})` : ''}; ${conf.hasReport ? 'its Final Report shows' : 'its Advisory Actions and, once published, its Final Report show'} what became of these proposals. The counts here are as GSO’s ${esc(fmtD(s.asOf))} grid gave them.</p>` : '';
    const coming = ups.length ? `<div class="wk-coming"><h3 class="wk-h3">Coming up</h3>
        <p class="small ink2">Dates the reports give for what follows the weekend${past ? ` (as of ${esc(fmtD(t))}, ${past} of ${ups.length} ${past === 1 ? 'is' : 'are'} past)` : ''}; a linked date opens the Calendar.</p>
        <ul class="wk-dates wk-cols">${ups.map((o) => dateRow(o, t)).join('')}</ul></div>` : '';
    if (!agenda && !side && !coming) return '';
    const cols = [agenda ? `<div class="wk-conf-a">${agenda}</div>` : '', side ? `<div class="wk-conf-b">${side}</div>` : ''].filter(Boolean);
    return `<section class="wk-sec" id="wk-conf" aria-labelledby="wk-conf-h"><h2 class="section-title" id="wk-conf-h">${s ? `${over ? 'What it meant' : 'What it means'} for the ${esc(nth(m.pai_cycle))} Conference` : 'What comes next'}</h2>
      ${overNote}${cols.length ? `<div class="wk-conf${cols.length === 1 ? ' one' : ''}">${cols.join('')}</div>` : ''}${coming}</section>`;
  }

  // ---------- board and committee reports ----------
  const KIND = { minutes: 'Board meeting and minutes', board: 'Corporate board', trustees_committee: 'Trustees’ committee', session: 'Session', other: 'Other committee' };
  const GROUPS = [
    ['wk-g-boards', 'Boards', (r) => r.kind === 'minutes' || r.kind === 'board'],
    ['wk-g-tc', 'Trustees’ committees', (r) => r.kind === 'trustees_committee'],
    ['wk-g-other', 'Sessions & other', (r) => r.kind !== 'minutes' && r.kind !== 'board' && r.kind !== 'trustees_committee'],
  ];
  const REC = { approved: 'Approved', no_vote: 'No vote printed', tabled: 'Tabled', in_progress: 'In progress', declined: 'Declined', referred: 'Referred' };
  const REC_BOARD = { GSB: 'General Service Board', AAWS: 'AAWS board', GV: 'AA Grapevine board' };
  /** The first n words of s, with an ellipsis when cut. */
  const words = (s, n) => { const w = String(s || '').split(/\s+/).filter(Boolean); return w.length > n ? w.slice(0, n).join(' ').replace(/[,;:.]$/, '') + '…' : w.join(' '); };
  function recLi(x) {
    const lab = REC[x.status] || ucfirst(x.status || '');
    // the outcome without the words the badge already says ("Approved by substantial unanimity" → "by substantial unanimity")
    const rest = String(x.outcome || '').replace(new RegExp('^' + lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b[,;:]?\\s*', 'i'), '').trim();
    const brd = x.board && !/board/i.test(rest) ? REC_BOARD[x.board] || x.board : '';
    return `<li><span class="badge wk-st wk-st-${esc(x.status || 'other')}">${esc(lab)}</span> ${linkNums(x.text)}${stopAfter(x.text)}
      <span class="small ink2">${[rest ? esc(ucfirst(rest)) : '', brd ? esc(brd) : ''].filter(Boolean).join(' · ')}${rest || brd ? ' ' : ''}${pg(x.page)}</span></li>`;
  }
  function fuLi(f) {
    const q = f.request ? reqBy[f.request] : null;
    return `<li>${linkNums(f.text)}${stopAfter(f.text)} ${pg(f.page)}${q ? `<div class="wk-fureq small"><span class="muted">On the ${esc(q.from_year || '')} request:</span> ${esc(words(q.text, 18))}</div>` : ''}</li>`;
  }
  function paiLine(r) {
    const p = r.pai;
    if (!p) return '';
    const parts = [`${num(p.forwarded)} forwarded`, `${num(p.no_action)} no action`];
    if (p.other) parts.push(`${num(p.other)} still open`);
    const lead = p.assigned && p.considered !== p.assigned ? `${plural(p.assigned, 'proposal')}, ${num(p.considered)} taken up: ` : `${plural(p.considered || p.assigned || 0, 'proposal')}: `;
    const txt = esc(lead + parts.join(' · '));
    return r.body && bodyOf(r.body) ? `<a href="#/agenda/body/${encodeURIComponent(r.body)}" data-tip="${esc(`List these on Agenda Items: proposals reviewed by the ${bodyName(r.body)}`)}">${txt}</a>` : txt;
  }
  function repCard(m, r, t) {
    const nameH = r.kind === 'trustees_committee' && r.tc && TC[r.tc]
      ? `<a href="#/board" data-tip="A committee of the General Service Board: its members are on Trustees &amp; Boards">${esc(r.name)}</a>` : esc(r.name);
    const meta = [esc(KIND[r.kind] || r.kind || ''), r.met ? `met ${esc(wday(r.met))}, ${esc(fmtD(r.met))}` : '', r.pai ? paiLine(r) : ''].filter(Boolean).join(' · ');
    const hl = r.highlights || [], recs = r.recommendations || [], nums = r.numbers || [], nx = r.next || [], fu = r.followups || [];
    const p = r.pai;
    const lab = [hl.length ? plural(hl.length, 'highlight') : '', recs.length ? plural(recs.length, 'recommendation') : '', p ? 'proposed items' : '',
      nums.length ? plural(nums.length, 'figure') : '', nx.length ? plural(nx.length, 'date') : '', fu.length ? plural(fu.length, 'follow-up') : ''].filter(Boolean);
    const body = [
      hl.length ? `<h5>Highlights</h5><ul class="wk-hl">${hl.map((h) => `<li>${linkNums(h.text)}${stopAfter(h.text)} ${pg(h.page)}</li>`).join('')}</ul>` : '',
      recs.length ? `<h5>Recommendations</h5><ul class="wk-recs">${recs.map(recLi).join('')}</ul>` : '',
      p ? `<h5>Proposed agenda items</h5><p>${num(p.assigned || p.considered)} assigned${p.considered !== p.assigned ? `, ${num(p.considered)} taken up` : ''}: ${num(p.forwarded)} forwarded to the Conference, ${num(p.no_action)} no action${p.other ? `, ${num(p.other)} still open` : ''}. ${pg(p.page)}${p.note ? ` <span class="ink2">${linkNums(p.note)}${stopAfter(p.note)}</span>` : ''}
        ${r.body && bodyOf(r.body) ? `<br><a href="#/agenda/body/${encodeURIComponent(r.body)}">Each proposal and why, on Agenda Items →</a>` : ''}</p>` : '',
      nums.length ? `<h5>Figures</h5><dl class="wk-fig">${nums.map((x) => `<div><dt>${esc(x.label)}</dt><dd><strong>${esc(x.value)}</strong>${x.as_of ? ` <span class="muted">· ${esc(x.as_of)}</span>` : ''} ${pg(x.page)}</dd></div>`).join('')}</dl>` : '',
      nx.length ? `<h5>Dates ahead</h5><ul class="wk-dates wk-compact">${nx.map((o) => dateRow(o, t)).join('')}</ul>` : '',
      fu.length ? `<h5>Follow-ups</h5><ul class="wk-fu">${fu.map(fuLi).join('')}</ul>${fu.some((f) => f.request) ? '<p class="small"><a href="#/actions/pending">Pending follow-ups on Advisory Actions →</a></p>' : ''}` : '',
    ].filter(Boolean).join('');
    return `<article class="card wk-rep" id="wk-r-${esc(r.id)}" aria-labelledby="wk-rh-${esc(r.id)}">
      <h4 id="wk-rh-${esc(r.id)}">${nameH}</h4>
      <div class="wk-rmeta small">${meta}</div>
      ${r.summary ? `<p class="wk-rsum">${linkNums(r.summary)}${stopAfter(r.summary)}</p>` : ''}
      ${r.accepted ? `<p class="wk-acc small"><span class="muted">At the board meeting:</span> ${linkNums(r.accepted)}${stopAfter(r.accepted)} ${pg(r.accepted_page)}</p>` : ''}
      ${body ? `<details class="wk-more"><summary>${esc(ucfirst(lab.join(' · ')) || 'More')}</summary>${body}</details>` : ''}
    </article>`;
  }
  function reportsHTML(m, t) {
    const reps = m.reports || [];
    if (!reps.length) return '';
    return `<section class="wk-sec" id="wk-reports" aria-labelledby="wk-reports-h"><h2 class="section-title" id="wk-reports-h">Board and committee reports</h2>
      <p class="small ink2 wk-intro">One card per report in the packet, in this app’s own words, with what the board’s minutes add. Open a card for its highlights, recommendations, figures, dates and follow-ups.</p>
      ${GROUPS.map(([id, h, f]) => { const rs = reps.filter(f); return rs.length ? `<div class="wk-rgroup"><h3 class="wk-h3" id="${id}">${esc(h)} <span class="small muted">${rs.length}</span></h3><div class="wk-reps">${rs.map((r) => repCard(m, r, t)).join('')}</div></div>` : ''; }).join('')}
    </section>`;
  }

  // ---------- numbers worth knowing ----------
  function numbersHTML(m) {
    const ns = m.numbers || [];
    if (!ns.length) return '';
    const repBy = dict(); (m.reports || []).forEach((r) => { repBy[r.id] = r; });
    const rows = ns.map((x) => {
      const r = repBy[x.report];
      return `<tr><td data-l="Figure">${esc(x.label)}</td><td class="wk-val" data-l="Value">${esc(x.value)}</td><td data-l="As of">${esc(x.as_of || '')}</td>
        <td data-l="Report">${r ? `<a href="#/weekends/${encodeURIComponent(m.id)}/${encodeURIComponent(r.id)}">${esc(repShort(r))}</a>` : ''}</td><td class="n" data-l="Page">${esc(x.page || '')}</td></tr>`;
    }).join('');
    return `<section class="wk-sec" id="wk-numbers" aria-labelledby="wk-numbers-h"><h2 class="section-title" id="wk-numbers-h">Numbers worth knowing</h2>
      <p class="small ink2">Figures exactly as the reports print them. Select a report to open its card.</p>
      <div class="table-wrap wk-ntbl-wrap"><table class="t compact wk-ntbl"><caption class="wk-sr">Key figures from the ${esc(m.title)} reports</caption>
        <thead><tr><th>Figure</th><th>Value</th><th>As of</th><th>Report</th><th class="n">Page</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  // ---------- reading these reports ----------
  function readingHTML(m, t) {
    // the meeting that approves these minutes: the next board weekend, or after a winter weekend the board's annual meeting
    // right after the Conference (its 2nd quarterly meeting)
    const nx = nextWeekend(m.end, true);
    const nxTxt = !nx ? '' : nx.ruleId === 'gsb-annual-meeting' ? ` (here, its meeting right after the Conference, ${esc(FCR.calendar.when(nx))})` : ` (here, the weekend of ${esc(FCR.calendar.when(nx))})`;
    const pend = nx && t > nx.end
      ? `The minutes were a draft until the board approved them at its next quarterly meeting${nxTxt}; the cards follow the draft in the packet.`
      : `The minutes are a draft until the board approves them at its next quarterly meeting${nxTxt}, so a detail can still change.`;
    const rows = [
      [esc('Report or minutes?'), 'Each board and trustees’ committee writes its own report: what it discussed and what it decided. The minutes are the board’s short record of its Monday meeting: who was there, and how it acted on each report and recommendation. The cards here combine the two; where they disagree, the source notes below give both.'],
      [esc('“Pending approval”'), pend],
      [esc('Accepted, approved'), 'Accepting a report takes it as written (“as amended”: with changes made at the meeting). A committee’s recommendation to the board needs a vote of its own.'],
      [gloss('Substantial unanimity'), 'A large majority, usually two-thirds or more. The board records the recommendations it approves this way.'],
      [gloss('Executive session'), 'A closed part of a meeting, used for matters such as choosing candidates. The reports note that one was held.'],
      [gloss('Interim meeting'), 'A meeting between weekends, often online, to finish work the weekend did not reach.'],
      [gloss('Took No Action (PAI status)', 'Took no action'), 'The proposal does not go to this Conference; the committee or board usually gives its reason. Anyone may send a new proposal for a later Conference.'],
      [gloss('Composition, Scope and Procedure'), 'The paper that sets out a committee’s members, remit and way of working.'],
    ];
    return `<section class="wk-sec" id="wk-read" aria-labelledby="wk-read-h"><h2 class="section-title" id="wk-read-h">Reading these reports</h2>
      <div class="card wk-read"><dl>${rows.map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`).join('')}</dl></div></section>`;
  }

  // ---------- source ----------
  function sourceHTML(m) {
    const src = m.source || {};
    const slips = src.slips || [];
    return `<section class="wk-sec wk-src" id="wk-src" aria-labelledby="wk-src-h"><h2 class="section-title" id="wk-src-h">Source</h2>
      <p class="small">GSO, “${esc(src.title || m.formal || '')}”${src.pages ? `, ${num(src.pages)} PDF pages` : ''}${src.audience ? `, sent to ${esc(src.audience)}` : ''}.${src.page_note && !/PDF pages/.test(META.note || '') ? ` ${esc(src.page_note)}` : ''}${src.drive_url ? ` Your copy: <a href="${esc(src.drive_url)}" target="_blank" rel="noopener">the packet in Google Drive ↗</a>.` : ''}</p>
      ${META.note ? `<p class="small ink2">${esc(META.note)}</p>` : ''}
      ${slips.length ? `<h3 class="wk-h3 small">Slips in the documents</h3><ul class="wk-slips small">${slips.map((x) => `<li>${linkNums(x)}</li>`).join('')}</ul>` : ''}
    </section>`;
  }

  // ---------- the page ----------
  V.weekends = function (el, args) {
    const head = (lede) => `<div class="page-head"><div><h1>Board Weekends</h1>${lede || ''}</div></div>`;
    if (!MEETINGS.length) { el.innerHTML = head() + UI.empty('No board weekend is loaded.'); return; }
    const t = todayStr();
    const a0 = dec(args && args[0]), a1 = dec(args && args[1]);
    const m0 = a0 ? MEETINGS.find((x) => x.id === a0) || null : null;
    const m = m0 || MEETINGS[0];
    const hit = m0 && a1 ? (m.reports || []).find((r) => r.id === a1) || null : null;
    const unknown = a0 && !m0 ? `No board weekend “${a0}” is in this app. Here is the latest one.`
      : m0 && a1 && !hit ? `No report “${a1}” is in the ${m.title}. Here is the whole weekend.` : '';
    const s = paiStats(m);
    const f14 = DOCS.find((d) => /\bF-14\b/.test(d.title || '') && d.url);   // \b: not the "F-14" inside "SMF-146"
    const lede = `<p>The General Service Board meets four times a year, each time at a weekend in New York. The A.A. World Services and AA Grapevine boards meet first, then the trustees’ committees and a sharing session, and the board’s own quarterly meeting closes the weekend.
      At the fall weekend the trustees’ committees decide which proposed agenda items go on to the next Conference, and since 2026 the incoming Conference committee chairs sit in.
      The board and committee reports go to Conference members; the public summary is the ${f14 ? `<a href="${esc(f14.url)}" target="_blank" rel="noopener">Quarterly Report on aa.org ↗</a>` : 'Quarterly Report on aa.org'}. This page sums up those reports in plain words.</p>`;
    const calH = calHref(m.calendar_id);
    const links = [
      learnNode('board_weekend') ? ['#/learn/board_weekend', 'Learn: board weekends'] : null,
      ['#/board', 'Trustees & Boards'], ['#/structure', 'Structure'], s ? ['#/agenda', 'Agenda Items'] : null,
      calH ? [calH, 'This weekend in the Calendar'] : null,
    ].filter(Boolean);
    const chips = MEETINGS.length > 1 ? `<nav class="flex wk-meets" aria-label="Board weekends"><span class="small muted">Weekends:</span>${MEETINGS.map((x) => `<a class="chip${x === m ? ' accent' : ''}" href="#/weekends/${encodeURIComponent(x.id)}"${x === m ? ' aria-current="page"' : ''}>${esc(x.title)}</a>`).join('')}</nav>` : '';
    const conf = confHTML(m, s, t);
    const jump = [['wk-glance', 'At a glance'], conf ? ['wk-conf', s ? `For the ${nth(m.pai_cycle)} Conference` : 'What comes next'] : null, (m.reports || []).length ? ['wk-reports', 'Reports'] : null,
      (m.numbers || []).length ? ['wk-numbers', 'Numbers'] : null, ['wk-read', 'Reading the reports'], ['wk-src', 'Source']].filter(Boolean);

    el.innerHTML = `<div class="wk-page">
      ${head(lede)}
      ${unknown ? `<p class="callout">${esc(unknown)}</p>` : ''}
      <nav class="flex wk-links" aria-label="Related pages">${links.map(([h, l]) => `<a class="chip" href="${esc(h)}">${esc(l)}</a>`).join('')}</nav>
      ${chips}
      ${meetingHTML(m, s, t)}
      <nav class="flex rp-jump" aria-label="On this page"><span class="small muted">On this page:</span>${jump.map(([id, l]) => `<button type="button" class="chip" data-jump="${id}">${esc(l)}</button>`).join('')}</nav>
      ${glanceHTML(m, s)}
      ${conf}
      ${reportsHTML(m, t)}
      ${numbersHTML(m)}
      ${readingHTML(m, t)}
      ${sourceHTML(m)}
    </div>`;

    el.querySelector('.wk-page').addEventListener('click', (e) => {
      // A link to the deep link already showing fires no hashchange, so the router would not re-run: re-run the view in
      // place (the card opened, scrolled to and focused again).
      const self = e.target.closest('a[href^="#/weekends/"]');
      if (self && self.getAttribute('href') === location.hash && !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) {
        e.preventDefault();
        if (UI.hideTip) UI.hideTip();
        V.weekends(el, location.hash.replace(/^#\/?/, '').split('/').slice(1));
        return;
      }
      const j = e.target.closest('[data-jump]');
      if (j) {
        const tg = el.querySelector('#' + j.dataset.jump + ' > h2') || el.querySelector('#' + j.dataset.jump);
        if (tg) { tg.scrollIntoView({ block: 'start' }); if (!tg.hasAttribute('tabindex')) tg.setAttribute('tabindex', '-1'); tg.focus({ preventScroll: true }); }
      }
    });

    // ---------- deep link: open, highlight and focus the report's card ----------
    if (hit) {
      const card = el.querySelector('#wk-r-' + CSS.escape(hit.id));
      if (card) {
        card.classList.add('wk-hit');
        const d = card.querySelector('details.wk-more'); if (d) d.open = true;
        requestAnimationFrame(() => {
          card.scrollIntoView({ block: 'start' });
          const h = card.querySelector('h4');
          if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
        });
      }
    }
  };
})();
