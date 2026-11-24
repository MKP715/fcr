/* Proposed Agenda Items page (#/agenda[/item/<key> | /theme/<id> | /topic/<id> | /status/<fwd|no|under|out|deferred> |
   /body/<key> | /forwarded | /trends | /last | /process]).
   Data: data/src/pai.json → FCR.RAW.pai — GSO's status grid of the proposed agenda items (PAIs) for the next Conference and
   what the trustees' committees and boards decided at the fall board weekend, in this app's own words:
   {source (the latest grid: title, as_of, total, ordinal, pages, drive_name, drive_url, spanish_url, note), previous_grid (the
   grid before it: as_of, pages, drive_name, drive_url), previous (last cycle's grid), decisions_source (the board weekend's
   reports: title, short (the cite prefix "Q4 2026 board reports"), date, weekend_start, weekend_end, pages, drive_url, note),
   snapshots:[{as_of, total, note, counts:{forwarded, forwarded_topic, no_action, under, out, deferred}}], bodies, families,
   themes:[{id, family, name, scope, lede, background, now, now_cite, asked, raised, considerations, questions, watch, learn,
   aa}], asks, reason_kinds + reason_kinds_about ({kind: label} and {kind: one sentence}), items:[{key ('38' | '2025-7'), n,
   cycle, received, body, group, page (latest grid), page_oct (the grid before), status, outcome?, superseded_by?, same_as?,
   cluster?, title, summary, asks, themes, targets, submitter, responds_to, related_aa, learn, conf_committee, conf_reason,
   note?, differs?, decision?:{by, met, action (forwarded | forwarded_topic | no_action | referred | deferred | pending),
   reason, to_committee?, to_provisional?, to_text?, referred_to?, topic?, cite ("Q4 2026 board reports p. N"), also? [pages],
   reason_kind? (no_action only), note?, prior? {by, action, met, cite, also?} (the board weekend’s own open decision, kept
   when a later one by another body replaced it)}}], clusters, agenda_topics:[{id, title, kind (item | general_topic | added |
   reference), by, keys, to_committee | null, to_provisional, to_text, summary, why | null, cite, also?, themes, note?,
   related? (reference only)}] (in display order: Final Report committee order, most proposals first, reference last),
   open_meetings:[{id, by | null, date ('YYYY-MM-DD' | 'YYYY-MM' | null), approx, date_note, keys, text, cite, also?,
   calendar_id?, title? (heading of an entry with no proposals)}], observations, last (the cycle before: outcomes per body
   and theme), history (counts per year, process steps, facts)}. Checked by build_data.py check_pai / check_pai_decisions.
   Statuses: forwarded | forwarded_topic | no_action | under | withdrawn | superseded | removed | deferred (the 2025 items held
   for the Conference), grouped by statusGroup() as fwd | no | under | out | deferred for the filter, the counts and routes.
   The grid and the board reports go to Conference members only, and the grid prints every motion as submitted: the repo
   keeps no submitted wording and no group names, so rows show the summaries, the submitter kind and named districts/areas
   only (`quote` is never shown).
   Page: where things stand (a stepper from FCR.calendar, honours ?today=; a note when the date viewed comes before the grid,
   or a board weekend has met since it), stat tiles, what stands out, what goes to the Conference (the agenda topics by
   Conference committee, what is still open, why the rest got no action), trends (charts in plain HTML/CSS: each mark
   focusable with a text data-tip, each chart with a "Show as table" twin), themes explained, all proposals (filters, search,
   copies folded into their original in the same status section, section headings counting every proposal, incremental
   "Show more"; each row with its board weekend decision), last cycle, how a
   proposal travels, source. Deep links: item/<key> resets the filters, opens and highlights the row; theme/<id> filters the
   list and opens that theme's explainer; topic/<id> highlights that agenda topic; status/<group> and body/<key> filter the
   list; forwarded | trends | last | process scroll to their section; an unknown key, id or value is the plain page with a
   callout. Styles: assets/css/pai.css (class prefix pai-). */
(function () {
  'use strict';
  const FCR = window.FCR;
  const esc = FCR.esc;
  const V = FCR.views, UI = FCR.ui;
  const P = (FCR.RAW && FCR.RAW.pai) || {};
  const SRC = P.source || {};
  const ITEMS = P.items || [], THEMES = P.themes || [], FAMS = P.families || [], BODIES = P.bodies || {}, ASKS = P.asks || {};
  const CLUSTERS = P.clusters || [], OBS = P.observations || [], LAST = P.last || {}, HIST = P.history || {};
  const PG = P.previous_grid || {}, DS = P.decisions_source || {}, TOPICS = P.agenda_topics || [], OPEN = P.open_meetings || [];
  const RK = P.reason_kinds || {}, RKA = P.reason_kinds_about || {};
  const CY = SRC.conference_year || 2027, ORD = SRC.ordinal || CY - 1950;
  const nth = (n) => FCR.ordinal(n);
  const fold = (s) => FCR.fold(s);
  const fmtD = (d) => UI.fmtDate(d, 'short');
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const num = (n) => Number(n || 0).toLocaleString('en-US');
  const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many || one + 's'}`;
  const listAnd = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
  const ucfirst = (s) => String(s || '').replace(/^\s*\S/, (c) => c.toUpperCase());
  const stopAfter = (s) => (/[.!?”"’)]$/.test(String(s || '').trim()) ? '' : '.');
  /** 'YYYY-MM-DD' | 'YYYY-MM' → UTC day number (no DST surprises). */
  const dnum = (s) => { const [y, m, d] = String(s).split('-').map(Number); return Date.UTC(y, (m || 1) - 1, d || 1) / 864e5; };
  const dstr = (n) => new Date(n * 864e5).toISOString().slice(0, 10);

  // ---------- lookups (no prototype: a route argument such as "constructor" or "__proto__" must not count as a hit) ----------
  const dict = () => Object.create(null);
  const byKey = dict(), idx = dict();
  ITEMS.forEach((x, i) => { byKey[x.key] = x; idx[x.key] = i; });
  const themeBy = dict(); THEMES.forEach((t) => { themeBy[t.id] = t; });
  const famBy = dict(); FAMS.forEach((f) => { famBy[f.id] = f; });
  const themesOfFam = (fid) => THEMES.filter((t) => t.family === fid);
  // exact copies: original key → [copy keys] (same_as names the item with identical wording, or identical but for a word or
  // a typo: near: true)
  const copiesOf = dict();
  ITEMS.forEach((x) => { if (x.same_as) (copiesOf[x.same_as] = copiesOf[x.same_as] || []).push(x.key); });
  const isCur = (x) => x.cycle === ORD;                      // numbered in this cycle's grid (not the deferred 2025 items)
  const CUR = ITEMS.filter(isCur);
  const AAX = (FCR.RAW && FCR.RAW.advisoryActions) || {};
  const aaBy = dict(); (AAX.actions || []).forEach((a) => { aaBy[a.id] = a; });
  const secName = (sid) => ((AAX.sections || []).find((s) => s.sid === sid) || { name: '' }).name;

  const STATUS = { forwarded: `Forwarded to the ${nth(ORD)} Conference`, forwarded_topic: 'Forwarded in a general topic', no_action: 'No action',
    under: 'Under consideration', withdrawn: 'Withdrawn', superseded: 'Superseded', removed: 'Removed', deferred: 'Deferred from 2025' };
  /** The status group of the filter, the counts and #/agenda/status/<group>: fwd (both forwarded kinds) | no | under | out | deferred. */
  const statusGroup = (x) => (x.status === 'forwarded' || x.status === 'forwarded_topic' ? 'fwd' : x.status === 'no_action' ? 'no'
    : x.status === 'under' || x.status === 'deferred' ? x.status : 'out');
  const GROUPS = ['fwd', 'no', 'under', 'out', 'deferred'];
  const GROUP = { fwd: 'Forwarded', no: 'No action', under: 'Under consideration', out: 'Withdrawn, superseded or removed', deferred: 'Deferred from 2025' };
  const isOpen = (x) => x.status === 'under' || x.status === 'deferred';   // still to be decided (the 2025 items: by the Conference)
  // what a trustees' committee or board did with an item at the board weekend (decision.action)
  // (pending: "Not reached", not "… yet": the row's label already names the weekend, so it stays true once a later meeting has met)
  const ACTION = { forwarded: 'Forwarded', forwarded_topic: 'Forwarded in a general topic', no_action: 'No action', referred: 'Referred to another committee', deferred: 'Put off to a later meeting', pending: 'Not reached' };
  const HAS_DEC = ITEMS.some((x) => x.decision);
  /** "Fall board weekend" (the season of the board meeting whose reports hold the decisions). */
  const WK = (() => { const m = +String(DS.date || '').slice(5, 7); return m ? `${m <= 3 ? 'Winter' : m <= 6 ? 'Spring' : m <= 9 ? 'Summer' : 'Fall'} board weekend` : 'Board weekend'; })();
  /** The board weekends of the Board Weekends page (board_meetings.json), to name the meeting a decision was made at. */
  const BMS = ((FCR.RAW || {}).boardMeetings || {}).meetings || [];
  /** A decision is credited to the board weekend whose dates hold it (decision.met); a decision made after the weekend whose
      reports this page cites (an interim meeting) is "Later meeting". */
  const isLater = (dc) => !!(dc && dc.met && DS.weekend_end && dc.met > DS.weekend_end);
  const decLabel = (dc) => {
    const m = dc.met && BMS.find((b) => b.start && b.end && b.start <= dc.met && dc.met <= b.end);
    return m && m.season ? `${ucfirst(m.season)} board weekend` : isLater(dc) ? 'Later meeting' : WK;
  };
  const wkRange = () => (DS.weekend_start ? UI.fmtRange(DS.weekend_start, DS.weekend_end || DS.weekend_start, 'short') : '');
  /** "Q4 2026 board reports p. 52; also pp. 6, 54" for a decision or an agenda topic (callers often wrap it in parentheses,
      so no parentheses of its own). */
  const citeOf = (o) => `${o.cite || ''}${(o.also || []).length ? `; also ${o.also.length > 1 ? 'pp.' : 'p.'} ${o.also.join(', ')}` : ''}`;
  const PROV_TIP = 'The trustees’ committee named this Conference committee only for possible routing, leaving the choice of committee to the final agenda (early February).';
  const ENTRIES = TOPICS.filter((t) => t.kind !== 'reference');   // agenda entries: single items, general topics, the trustees' own additions
  const ASK_LABEL = { protect: 'Protect', restore: 'Restore', change: 'Change', create: 'Create', procedure: 'Procedure', study: 'Study', other: 'Other' };
  const KIND = { unstated: 'Not stated in the grid', individual: 'An individual member', group: 'A group', district: 'A district', area: 'An area', committee: 'A committee' };
  const BOARD_SHORT = { AAWS: 'A.A.W.S. board', GV: 'AA Grapevine board', GSB: 'General Service Board' };
  /** Short label of a reviewing body: the trustees' committee's short name, or the board's. */
  const bodyShort = (k) => {
    const b = BODIES[k]; if (!b) return k || '';
    const tc = b.tc && FCR.TRUSTEES_COMMITTEES[b.tc];
    return tc ? (b.tc === 'CONFERENCE' ? 'General Service Conference' : tc.short) : BOARD_SHORT[k] || b.name;
  };
  const bodyName = (k) => (BODIES[k] ? BODIES[k].name : '');
  /** "trustees’ Literature Committee", "AA Grapevine board" (for a sentence; ucfirst() it at the start of one). */
  const byShort = (k) => (BODIES[k] && BODIES[k].tc ? `trustees’ ${bodyShort(k)} Committee` : bodyShort(k));
  const ccLink = (c) => { const cc = FCR.COMMITTEES[c]; return cc ? `<a href="#/committees/${cYear()}/${esc(c)}">Conference Committee on ${esc(cc.name)}</a>` : esc(c || ''); };
  const label = (x) => '#' + x.key;
  const titleOf = (x) => x.title || (x.status === 'removed' ? 'Entry removed (no text in the grid)' : 'Untitled entry');
  const itemHref = (k) => `#/agenda/item/${encodeURIComponent(k)}`;
  const itemLink = (k, cls) => { const x = byKey[k]; return x ? `<a class="${cls || 'pai-num'}" href="${itemHref(k)}" data-tip="${esc(`${label(x)}: ${titleOf(x)}`)}">${esc(label(x))}</a>` : esc('#' + k); };
  const themeHref = (id) => `#/agenda/theme/${encodeURIComponent(id)}`;
  const topicHref = (id) => `#/agenda/topic/${encodeURIComponent(id)}`;
  const topicBy = dict(); TOPICS.forEach((t) => { topicBy[t.id] = t; });
  const topicLink = (id) => (topicBy[id] ? `<a href="${topicHref(id)}">${esc(topicBy[id].title)}</a>` : '');
  const openBy = dict(); OPEN.forEach((m) => (m.keys || []).forEach((k) => { openBy[k] = m; }));   // still-open item → where it is decided next
  const dlink = (url, txt) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(txt)} ↗</a>` : esc(txt));   // a Drive copy (opens in a new tab)
  const learnTitle = (id) => { const n = FCR.learnTree && FCR.learnTree.node(id); return n ? n.title : null; };
  const learnChips = (ids) => (ids || []).filter(learnTitle).map((id) => `<a class="chip" href="#/learn/${esc(id)}">${esc(learnTitle(id))}</a>`).join(' ');
  /** "2021 · Literature — summary" with the year and section linking to the action on the Advisory Actions page. */
  const aaLine = (id) => { const a = aaBy[id]; return a ? `<li><a href="#/actions/item/${encodeURIComponent(id)}">${a.year} · ${esc(secName(a.sec) || 'Advisory Action')}</a> — ${esc(a.text)}${stopAfter(a.text)}</li>` : ''; };
  const aaList = (ids, cls) => { const li = (ids || []).map(aaLine).filter(Boolean); return li.length ? `<ul class="pai-aa ${cls || ''}">${li.join('')}</ul>` : ''; };
  // Conference committees page for the coming Conference (the committees page projects the year after the last report)
  const cYear = () => (FCR.years.includes(CY) || CY === FCR.latestYear + 1 ? CY : FCR.latestYear);

  // Phrases in the observations that name a theme (the first mention in each one links to its explainer), or an agenda topic
  // ([re, id, 'topic']: links to that topic in "What goes to the Conference")
  const THEME_PHRASES = [
    [/Charter protection/, 'charter'], [/Fellowship review before (?:Big Book )?changes?/, 'review'], [/keeping the text as it is/, 'preserve'],
    [/founders[’'] writings/, 'founders'], [/specific wording/, 'wording'], [/the 2026 “Eskimo” change/, 'eskimo'],
    [/Plain Language Big Book/, 'plbb'], [/Preamble items/, 'preamble'], [/floor actions and late committee recommendations/, 'floor'],
    [/Reserve Fund/, 'finance'],
    [/expanding the Conference Charter to cover the Big Book[’']s first 164 pages/, 'charter-first-164-pages', 'topic'],
    [/floor-actions topic/, 'recommendations-floor-actions-process', 'topic'], [/online-area topic/, 'online-area-process', 'topic'],
  ];
  function themeLinks(s, used) {
    let best = null;
    THEME_PHRASES.forEach(([re, id, kind]) => {
      const k = (kind || 'theme') + ':' + id;
      if (used.has(k) || !(kind === 'topic' ? topicBy[id] : themeBy[id])) return;
      const m = re.exec(s); if (m && (!best || m.index < best.m.index)) best = { m, k, href: kind === 'topic' ? topicHref(id) : themeHref(id) };
    });
    if (!best) return esc(s);
    used.add(best.k);
    return esc(s.slice(0, best.m.index)) + `<a href="${best.href}">${esc(best.m[0])}</a>` + themeLinks(s.slice(best.m.index + best.m[0].length), used);
  }
  /** Escape text, link "#72" / "#2025-7" to the item (when it exists) and, with themes, the first mention of a theme. */
  function linkify(raw, themes, used) {
    const re = /#(\d{4}-\d{1,3}|\d{1,3})\b/g, out = [];
    used = used || new Set();
    const text = (s) => (themes ? themeLinks(s, used) : esc(s));
    let last = 0, m;
    raw = String(raw || '');
    while ((m = re.exec(raw))) {
      // "Floor Action #6", "No. #3", "Article #12" name something else, not a proposal
      const isRef = byKey[m[1]] && !/(?:^|[^a-z])(?:action|no\.?|number|article|step|page|chapter|tradition|concept)\s*$/i.test(raw.slice(Math.max(0, m.index - 14), m.index));
      out.push(text(raw.slice(last, m.index))); out.push(isRef ? itemLink(m[1]) : esc(m[0])); last = re.lastIndex;
    }
    out.push(text(raw.slice(last)));
    return out.join('');
  }

  // ---------- derived numbers (once) ----------
  let D = null;
  function derive() {
    if (D) return D;
    D = {};
    const prim = {};   // main theme → {total, copies} (this cycle's rows)
    const any = {};    // any theme → count (every row, both cycles: what the theme filter shows)
    THEMES.forEach((t) => { prim[t.id] = { total: 0, copies: 0 }; any[t.id] = 0; });
    CUR.forEach((x) => { const t = (x.themes || [])[0]; if (t && prim[t]) { prim[t].total++; if (x.same_as) prim[t].copies++; } });
    ITEMS.forEach((x) => (x.themes || []).forEach((t) => { if (any[t] != null) any[t]++; }));
    D.prim = prim; D.any = any;
    D.copies = CUR.filter((x) => x.same_as).length;
    D.under = CUR.filter((x) => x.status === 'under').length;
    D.out = CUR.filter((x) => statusGroup(x) === 'out').length;
    D.deferred = ITEMS.filter((x) => x.status === 'deferred');
    // status groups (every row: what the filter counts) and this cycle's outcomes
    D.grp = {}; GROUPS.forEach((g) => { D.grp[g] = 0; }); ITEMS.forEach((x) => { D.grp[statusGroup(x)]++; });
    D.fwd = CUR.filter((x) => statusGroup(x) === 'fwd').length;
    D.no = CUR.filter((x) => statusGroup(x) === 'no').length;
    D.open = D.under;
    D.entries = ENTRIES.length;
    D.added = ENTRIES.filter((t) => t.kind === 'added').length;
    D.fromProps = D.entries - D.added;
    // no-action decisions that name who takes the idea on (referred_to), and how many of those join work already under way
    const handed = ITEMS.filter((x) => x.decision && x.decision.action === 'no_action' && x.decision.referred_to);
    D.handed = handed.length;
    D.handedWip = handed.filter((x) => x.decision.reason_kind === 'in_progress').length;
    // this cycle's decided items (forwarded or no action) whose decision came after the weekend the reports cover
    D.later = CUR.filter((x) => (statusGroup(x) === 'fwd' || statusGroup(x) === 'no') && isLater(x.decision)).length;
    D.laterFwd = CUR.filter((x) => statusGroup(x) === 'fwd' && isLater(x.decision)).length;
    D.atWk = D.fwd + D.no - D.later;
    /** {fwd, no, under} per key (a reviewing body, a main theme) over this cycle's rows. */
    const outBy = (f) => { const o = {}; CUR.forEach((x) => { const k = f(x), g = statusGroup(x); if (k == null || g === 'out') return; o[k] = o[k] || { fwd: 0, no: 0, under: 0 }; if (o[k][g] != null) o[k][g]++; }); return o; };
    D.bodyOut = outBy((x) => x.body || null);
    D.themeOut = outBy((x) => (x.themes || [])[0] || null);
    D.rk = {}; ITEMS.forEach((x) => { const k = x.decision && x.decision.action === 'no_action' && x.decision.reason_kind; if (k) D.rk[k] = (D.rk[k] || 0) + 1; });
    // the deadline (calendar rule, else Sept 30) and the weeks counted back from it
    const dl = calOcc('pai-deadline', `${CY - 1}-09-01`, `${CY - 1}-10-31`);
    D.deadline = dl ? dl.start : `${CY - 1}-09-30`;
    const dated = CUR.filter((x) => x.received);
    D.dated = dated.length;
    const end = dnum(D.deadline);
    D.last14 = dated.filter((x) => end - dnum(x.received) >= 0 && end - dnum(x.received) < 14).length;
    const first = Math.min(...dated.map((x) => dnum(x.received)));
    const nW = Math.floor((end - first) / 7) + 1;
    D.weeks = Array.from({ length: nW }, (_, i) => { const e = end - 7 * (nW - 1 - i); return { s: dstr(e - 6), e: dstr(e), n: 0 }; });
    dated.forEach((x) => { const k = Math.floor((end - dnum(x.received)) / 7); if (k >= 0 && k < nW) D.weeks[nW - 1 - k].n++; });
    D.w0 = end - 7 * nW + 1;   // first day of the first week
    D.wDays = 7 * nW;
    // reviewing bodies, asks, submitters (this cycle's rows)
    const cnt = (f) => { const c = {}; CUR.forEach((x) => { const k = f(x); if (k != null) c[k] = (c[k] || 0) + 1; }); return c; };
    D.byBody = cnt((x) => x.body || null);
    D.byAsk = cnt((x) => (x.title ? x.asks || 'other' : null));
    D.byKind = cnt((x) => (x.submitter ? x.submitter.kind || 'unstated' : null));
    D.withText = CUR.filter((x) => x.title).length;
    const areas = {};
    ITEMS.forEach((x) => ((x.submitter || {}).areas || []).forEach((n) => { (areas[n] = areas[n] || []).push(x.key); }));
    D.areas = Object.keys(areas).map(Number).sort((a, b) => a - b).map((n) => ({ n, keys: areas[n] }));
    // search text per item (folded; padded so whole numbers can be matched)
    D.hay = {};
    ITEMS.forEach((x) => {
      const dc = x.decision || {};
      D.hay[x.key] = ' ' + fold([x.title, x.summary, (x.targets || []).join(' '), (x.themes || []).map((t) => (themeBy[t] || {}).name).join(' '),
        'pai item', x.key, x.n, label(x), bodyName(x.body), STATUS[x.status], GROUP[statusGroup(x)], x.asks, x.outcome, x.differs,
        // the board weekend's decision: its reason, the topic it joined, where it goes or was handed
        dc.reason, ACTION[dc.action], dc.topic && topicBy[dc.topic] ? topicBy[dc.topic].title : '', dc.to_text, dc.to_provisional ? 'provisional routing' : '',
        dc.referred_to, RK[dc.reason_kind]].join(' ')) + ' ';
    });
    return D;
  }

  // ---------- calendar steps ----------
  let OCC = null;
  const occs = () => { if (!OCC) OCC = FCR.calendar ? FCR.calendar.items({ from: `${CY - 1}-08-01`, to: `${CY}-12-31`, scope: 'everything' }) : []; return OCC; };
  /** The first occurrence of a calendar rule starting in [from, to]. */
  function calOcc(rule, from, to) { return occs().find((o) => o.ruleId === rule && o.start >= from && (!to || o.start <= to)) || null; }
  const STEPS = [
    { id: 'fall', rules: ['a65-fall-assembly'], t: 'Area 65 votes', s: 'Fall Assembly' },
    { id: 'deadline', rules: ['pai-deadline'], t: 'Deadline', s: 'proposals due' },
    { id: 'calls', rules: ['october-feedback-call'], t: 'Feedback calls', s: 'with committee members' },
    { id: 'q4', rules: ['gsb-q4'], t: 'Trustees decide', s: 'fall board weekend' },
    { id: 'prelim', rules: ['preliminary-agenda', 'pai-status-grid'], t: 'Preliminary agenda', s: 'and a new grid' },
    { id: 'q1', rules: ['gsb-q1'], t: 'Winter weekend', s: 'board meets' },
    { id: 'final', rules: ['final-agenda'], t: 'Final agenda', s: 'early February' },
    { id: 'bg', rules: ['background-posted'], t: 'Background', s: 'reaches members' },
    { id: 'spring', rules: ['a65-spring-assembly'], t: 'Mock committees', s: 'Area 65 Spring Assembly' },
    { id: 'conf', rules: ['conference'], t: `${nth(ORD)} Conference`, s: 'New York' },
    { id: 'report', rules: ['final-report'], t: 'Final Report', s: 'outcomes' },
  ];
  /** Steps with their real dates, chained in order (each starts on or after the one before). */
  function steps() {
    let after = `${CY - 1}-09-01`;
    const out = [];
    STEPS.forEach((st) => {
      const os = st.rules.map((r) => calOcc(r, after, `${CY}-12-31`)).filter(Boolean);
      if (!os.length) return;
      const o = os[0];
      const s = os.map((x) => x.start).sort()[0], e = os.map((x) => x.end).sort().pop();
      out.push(Object.assign({}, st, { o, os, start: s, end: e, approx: os.some((x) => x.approx), window: os.some((x) => x.window) }));
      after = s;
    });
    return out;
  }
  const when = (s) => (s ? (s.approx ? 'about ' : '') + (s.start === s.end ? fmtD(s.start) : UI.fmtRange(s.start, s.end, 'short')) : '');
  const cdown = (s) => (s && FCR.calendar ? FCR.calendar.countdown(s.o) : '');

  /** When an open meeting (open_meetings[]) takes place: {txt, note, o (its calendar occurrence, for the link), start, end}.
      A meeting of its own (an interim meeting) takes its calendar event's dates and label ("about Nov 21–23, 2026", "the packet
      gives both dates"); one only expected at a board weekend keeps its own approximate date ("about Feb 1, 2027"). */
  function omWhen(m) {
    const o = m.calendar_id ? occs().find((x) => x.id === m.calendar_id) || null : null;
    const d = m.date || '', day = (s) => (s.length === 7 ? s + '-01' : s);
    const lastDay = (s) => (s.length === 7 ? dstr(dnum(s.slice(0, 4) + '-' + String(+s.slice(5) + 1).padStart(2, '0') + '-01') - 1) : s);
    const inside = o && d && o.start <= day(d) && lastDay(d) <= o.end;
    if (o && inside && (!m.approx || o.approx || o.label)) return { txt: FCR.calendar.when(o), note: o.label || '', o, start: o.start, end: o.end };
    if (!d) return { txt: 'No date given', note: '', o, start: '', end: '' };
    const txt = (m.approx ? 'about ' : '') + (d.length === 7 ? UI.fmtDate(d, 'month') : fmtD(d));
    return { txt, note: '', o, start: day(d), end: d.length === 7 ? lastDay(d) : d };
  }
  const omDate = (w) => (w.o ? `<a href="#/calendar/${encodeURIComponent(w.o.key)}" data-tip="${esc(`Calendar: ${w.o.title}`)}">${esc(w.txt)}</a>` : esc(w.txt));

  /** Once the grid carries the board weekend's decisions: what it shows, and what is still to come before the final agenda. */
  function decidedLine(S, t) {
    const d = derive(), g = (id) => S.find((s) => s.id === id), q1 = g('q1'), fin = g('final');
    const head = `GSO’s ${fmtD(SRC.as_of)} grid shows what the ${WK.toLowerCase()}${wkRange() ? ` (${wkRange()})` : ''} decided: ${d.fwd} of the ${num(SRC.total)} proposals go to the ${nth(ORD)} Conference (${plural(d.entries, 'agenda entry', 'agenda entries')} so far${d.added ? `, counting ${d.added} the trustees’ committees added` : ''}), ${d.no} got no action and ${d.open} ${d.open === 1 ? 'is' : 'are'} still open${d.out ? `; the other ${d.out} had been withdrawn, superseded or removed before the weekend` : ''}.${d.later ? ` Of the ${d.fwd + d.no} forwarded or given no action, ${d.later} ${d.later === 1 ? 'was' : 'were'} decided at later meetings.` : ''}`;
    // meetings of their own on open items (the interim meetings; a board weekend is named below), as held or still to come
    const held = [], next = [];
    OPEN.filter((m) => (m.keys || []).length && m.by).forEach((m) => {
      const w = omWhen(m);
      if (!w.o || w.o.ruleId || !w.start) return;
      const what = m.keys.length === 1 ? '#' + m.keys[0] : `${m.keys.length} of them`;
      const dates = w.txt + (w.note ? '; ' + w.note : '');
      if (w.end < t) held.push(`the ${byShort(m.by)} met on ${what} (${dates})`);
      else next.push(`the ${byShort(m.by)}’s meeting on ${what} (${dates}${w.start <= t ? (m.approx || w.o.window || w.o.approx || w.note ? '; expected about now' : '; under way') : ''})`);
    });
    if (q1 && q1.start > t) next.push(`the winter board weekend (${when(q1)})`);
    if (fin && fin.start > t) next.push(`the final agenda (${when(fin)})`);
    return head + (held.length ? ` Since then ${listAnd(held)}; the next grid will show the outcome.` : '') + (next.length ? ` Still to come: ${listAnd(next)}.` : '');
  }

  /** One line on what the date (FCR.today(), so ?today= works) means for these proposals. */
  function todayLine(S, t) {
    const g = (id) => S.find((s) => s.id === id);
    const conf = g('conf'), rep = g('report'), dl = g('deadline'), q4 = g('q4'), q1 = g('q1'), fin = g('final');
    const next78 = calOcc('pai-deadline', `${CY}-09-01`, `${CY}-10-31`);
    const asOf = fmtD(SRC.as_of);
    if (conf && t > conf.end) {
      return `This cycle is over: the ${nth(ORD)} Conference met ${when(conf)}. Its Final Report${rep && t < rep.start ? ` (expected ${when(rep)})` : ''} shows what became of each agenda item.${!next78 ? ''
        // the deadline day itself still counts (proposals are accepted until 11:59 pm)
        : t <= next78.start ? ` New proposals now go to the ${nth(ORD + 1)} Conference (deadline ${fmtD(next78.start)}).`
          : ` Proposals for the ${nth(ORD + 1)} Conference closed on ${fmtD(next78.start)}; new ones now go to the ${nth(ORD + 2)} Conference.`}`;
    }
    // the grid in the app carries the fall decisions and the date viewed is on or after it, before the winter weekend
    if (HAS_DEC && t >= SRC.as_of && !(q1 && t >= q1.start)) return decidedLine(S, t);
    const nowS = S.filter((s) => s.start <= t && t <= s.end), cur = nowS[nowS.length - 1];
    const nxt = S.find((s) => s.start > t);
    const s = cur || nxt;
    if (!s) return '';
    const isNow = s === cur;
    const dlTxt = dl ? fmtD(dl.start) : 'September 30';
    switch (s.id) {
      case 'fall': return isNow ? `Area 65’s Fall Assembly is meeting (${when(s)}) and votes on the area’s own proposals before the ${dlTxt} deadline.`
        : `Proposals for the ${nth(ORD)} Conference are still coming in. Area 65’s Fall Assembly votes on the area’s own proposals ${when(s)} (${cdown(s)}); the deadline is ${dlTxt}.`;
      case 'deadline': return isNow ? `This is the deadline day: proposals must arrive by 11:59 pm. Later ones are held for the ${nth(ORD + 1)} Conference.`
        : `The last days before the deadline: proposals for the ${nth(ORD)} Conference must arrive by ${dlTxt}, 11:59 pm (${cdown(s)}).`;
      case 'calls': return `The list is closed (the deadline was ${dlTxt}). In October the trustees’ committee chairs ask Conference committee members for their views; the trustees’ committees then decide at the fall board weekend${q4 ? ` ${when(q4)} (${cdown(q4)})` : ''}, and the next status grid follows in November.`;
      case 'q4': return isNow ? `The fall board weekend is under way (${when(s)}): the trustees’ committees and boards decide on each proposal — forward it to the Conference, keep it at board level, or route it to the A.A.W.S. or Grapevine board.`
        : `The list is closed. The trustees’ committees meet at the fall board weekend ${when(s)} (${cdown(s)}) to decide which proposals go forward; the next status grid follows in November.`;
      case 'prelim': return `The trustees’ committees met at the fall board weekend${q4 ? ` (${when(q4)})` : ''}. The preliminary agenda and an updated status grid ${isNow ? 'are due about now' : 'are expected'} (${when(s)}); ${HAS_DEC && SRC.as_of > t
        ? `this page already shows that grid, of ${asOf}.` : `until the new grid is in this app, the page shows the status of ${asOf}.`}`;
      case 'q1': return isNow ? `The winter board weekend is under way (${when(s)}); the final agenda follows${fin ? ` ${when(fin)}` : ' in early February'}. This page shows the grid of ${asOf}.`
        : `The preliminary agenda is out. The final agenda follows the winter board weekend${q1 ? ` (${when(q1)}, ${cdown(q1)})` : ''}. This page still shows the grid of ${asOf}.`;
      case 'final': return `The final agenda of the ${nth(ORD)} Conference is ${isNow ? 'due about now' : 'expected'} (${when(s)}); it can place some items with a committee other than the one they were sent to.`;
      case 'bg': return `Background material on every agenda item reaches Conference members ${isNow ? 'about now' : when(s)}${isNow ? ` (${when(s)})` : ''}; delegates share it with their areas so groups can discuss it.`;
      case 'spring': return isNow ? `Area 65’s Spring Assembly holds its pre-Conference mock committees about now (${when(s)}).`
        : `Background is out; groups and districts are studying the agenda. Area 65’s Spring Assembly holds pre-Conference mock committees ${when(s)} (${cdown(s)}).`;
      case 'conf': return isNow ? `The ${nth(ORD)} Conference is meeting (${when(s)}): its committees consider the agenda items this week, and the full Conference votes on their recommendations.`
        : `The ${nth(ORD)} Conference meets ${when(s)} (${cdown(s)}).`;
      default: return '';
    }
  }
  function stepperHTML(S, t) {
    const nowIds = new Set(S.filter((s) => s.start <= t && t <= s.end).map((s) => s.id));
    const nxt = S.find((s) => s.start > t);
    let yr = null;
    const li = S.map((s) => {
      const state = nowIds.has(s.id) ? 'now' : s.end < t ? 'done' : nxt && nxt.id === s.id ? 'next' : 'todo';
      const y = s.start.slice(0, 4), withYear = y !== yr; yr = y;
      const d = (s.approx ? 'about ' : '') + (s.start === s.end ? UI.fmtDate(s.start, withYear ? 'short' : 'day') : UI.fmtRange(s.start, s.end, withYear ? 'short' : 'day'));
      const tip = s.os.map((o) => `${o.title}: ${FCR.calendar.when(o)}`).join(' · ');
      const sr = { now: ' (now)', done: ' (done)', next: ' (next)', todo: '' }[state];
      // aria-current on the focusable link; the visible "now" pill is hidden from assistive tech (the .pai-sr text says it once)
      return `<li class="pai-step ${state}"><a href="#/calendar/${encodeURIComponent(s.o.key)}"${state === 'now' ? ' aria-current="step"' : ''} data-tip="${esc(tip)}">
        <span class="pai-dot" aria-hidden="true"></span><span class="pai-st-t">${esc(s.t)}${state === 'now' ? ' <span class="pai-st-now" aria-hidden="true">now</span>' : ''}</span>
        <span class="pai-st-s">${esc(s.s)}</span><span class="pai-st-d">${esc(d)}</span><span class="pai-sr">${sr}</span></a></li>`;
    }).join('');
    return `<div class="pai-steps-wrap g-scroll"><ol class="pai-steps" style="--n:${S.length}" aria-label="The ${esc(nth(ORD))} Conference’s agenda, step by step">${li}</ol></div>`;
  }

  // ---------- chart pieces (plain HTML/CSS; colours from tokens in pai.css) ----------
  const legend = (items) => `<div class="pai-legend" aria-hidden="true">${items.map(([cls, txt]) => `<span><i class="pai-sw ${cls}"></i>${esc(txt)}</span>`).join('')}</div>`;
  /** "Show as table" twin: head = [labels], rows = [[cells (HTML)]], num = indexes of numeric columns. */
  function twin(caption, head, rows, numCols) {
    const n = new Set(numCols || []);
    return `<details class="pai-tbl"><summary>Show as table</summary><div class="table-wrap"><table class="t compact"><caption class="pai-sr">${esc(caption)}</caption>
      <thead><tr>${head.map((h, i) => `<th${n.has(i) ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${n.has(i) ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  }
  /** Clean axis ticks for 0..max: {top, step}. */
  function ticks(max) {
    const raw = Math.max(1, max) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) || 10 * mag;
    return { step, top: Math.ceil(Math.max(1, max) / step) * step };
  }
  const frac = (v, max) => (max ? Math.max(0, Math.min(1, v / max)) : 0).toFixed(4);
  /** One bar of a plain (non-button) bar chart. The whole track, not the mark, is the hover/focus target, so a short bar
      still has a full-width hit area; it is named (role img) by its tooltip text, which also covers the value at the tip.
      A zero value keeps its name and hover tip but is no keyboard stop. */
  const barTrack = (v, max, cls, tip, val) => `<span class="pai-track" role="img" aria-label="${esc(tip)}" data-tip="${esc(tip)}"${v > 0 ? ' tabindex="0"' : ''}><span class="pai-seg ${cls} end" style="--w:${frac(v, max)}"></span><span class="pai-val">${val}</span></span>`;
  // outcome segments of a stacked bar: forwarded (accent) | no action (lighter step) | still open (accent hatching)
  const OUTCOME = [['fwd', 'a', 'forwarded'], ['no', 'b', 'no action'], ['under', 'o', 'still open']];
  const outcomeLegend = () => legend(OUTCOME.map(([, cls, t]) => [cls, t]));
  /** One stacked bar (same hit-area rules as barTrack): o = {fwd, no, under}; each segment keeps its own hover tip. */
  function stackTrack(o, max, name, tip, val) {
    const on = OUTCOME.filter(([k]) => (o[k] || 0) > 0);
    const segs = on.map(([k, cls, t], i) => `<span class="pai-seg ${cls}${i === on.length - 1 ? ' end' : ''}" style="--w:${frac(o[k], max)}" data-tip="${esc(`${name}: ${o[k]} ${t}`)}"></span>`).join('');
    return `<span class="pai-track" role="img" aria-label="${esc(tip)}" data-tip="${esc(tip)}"${on.length ? ' tabindex="0"' : ''}>${segs}<span class="pai-val">${val}</span></span>`;
  }
  const outcomeTip = (o) => OUTCOME.map(([k, , t]) => `${o[k] || 0} ${t}`).join(', ');

  // a. themes: one bar per main theme, distinct wording | exact copies, grouped by family
  function themeChart() {
    const d = derive();
    const max = Math.max(1, ...THEMES.map((t) => d.prim[t.id].total));
    const fams = FAMS.map((f) => {
      const ts = themesOfFam(f.id).filter((t) => d.prim[t.id].total).sort((a, b) => d.prim[b.id].total - d.prim[a.id].total);
      const sum = ts.reduce((s, t) => s + d.prim[t.id].total, 0);
      const rows = ts.map((t) => {
        const c = d.prim[t.id], dist = c.total - c.copies;
        // the list a bar opens is every row touching the theme (secondary themes and deferred items too), so say so
        const tip = `${t.name}: ${plural(c.total, 'proposal')} with this as the main theme — ${plural(dist, 'distinct wording')}${c.copies ? `, ${plural(c.copies, 'exact copy', 'exact copies')}` : ''}. Select to list every proposal that touches this theme: ${num(d.any[t.id])}, counting secondary themes${d.deferred.length ? ' and the items deferred from 2025' : ''}.`;
        return `<button type="button" class="pai-hrow" data-theme-bar="${esc(t.id)}" data-tip="${esc(tip)}">
          <span class="pai-hlab">${esc(t.name)}</span>
          <span class="pai-track"><span class="pai-seg a${c.copies ? '' : ' end'}" style="--w:${frac(dist, max)}" data-tip="${esc(`${t.name}: ${plural(dist, 'distinct wording')}`)}"></span>${c.copies ? `<span class="pai-seg b end" style="--w:${frac(c.copies, max)}" data-tip="${esc(`${t.name}: ${plural(c.copies, 'exact copy', 'exact copies')} of another item`)}"></span>` : ''}<span class="pai-val">${c.total}${c.copies ? ` · ${c.copies} cop${c.copies === 1 ? 'y' : 'ies'}` : ''}</span></span></button>`;
      }).join('');
      return rows ? `<div class="pai-fam"><h4 class="pai-famh">${esc(f.name)} <span class="muted">${sum}</span></h4>${rows}</div>` : '';
    }).join('');
    const tblRows = [];
    FAMS.forEach((f) => themesOfFam(f.id).forEach((t) => { const c = d.prim[t.id]; tblRows.push([esc(f.name), `<a href="${themeHref(t.id)}">${esc(t.name)}</a>`, c.total, c.total - c.copies, c.copies]); }));
    // the caption counts what is plotted (rows with no text have no theme)
    const n = THEMES.reduce((s, t) => s + d.prim[t.id].total, 0), none = CUR.length - n;
    return `<section class="card pai-chart pai-c-themes" aria-labelledby="pai-c1"><h3 id="pai-c1">Themes</h3>
      <p class="small ink2">Proposals by their main theme (${num(n)} of the ${plural(CUR.length, 'item')} in the ${esc(nth(ORD))} cycle${none ? `; ${none === 1 ? 'the removed entry has' : `the ${none} removed entries have`} no text and no theme` : ''}${d.deferred.length ? `; the ${d.deferred.length} deferred from 2025 are not counted` : ''}). Each bar splits into distinct wordings and exact copies of another item. Select a bar to list every proposal that touches its theme; that list also counts secondary themes${d.deferred.length ? ' and the deferred items' : ''}, so it can be longer than the bar.</p>
      ${legend([['a', 'distinct wording'], ['b', 'exact copy of another item']])}
      <div class="pai-hbars">${fams}</div>
      ${twin('Proposals by main theme', ['Family', 'Theme', 'Proposals', 'Distinct wordings', 'Exact copies'], tblRows, [2, 3, 4])}</section>`;
  }

  // b. when they arrived: weekly columns up to the deadline, with the June grid and the deadline marked
  function weeksChart() {
    const d = derive(), W = d.weeks;
    if (!W.length) return '';
    const max = Math.max(...W.map((w) => w.n)), tk = ticks(max);
    const xOf = (iso) => ((dnum(iso) - d.w0) / d.wDays).toFixed(4);
    const lab = new Set([W.length - 1, W.length - 2]);   // the headline: the last two weeks
    const top = W.reduce((b, w, i) => (w.n > W[b].n ? i : b), 0); lab.add(top);
    const range = (w) => UI.fmtRange(w.s, w.e, 'short');
    // a week with proposals is a named, focusable mark; an empty week is not a stop at all
    const cols = W.map((w, i) => {
      if (!w.n) return '<span class="pai-slot" aria-hidden="true"></span>';
      const tip = `${range(w)}: ${plural(w.n, 'proposal')} received`;
      return `<span class="pai-slot" tabindex="0" role="img" aria-label="${esc(tip)}" data-tip="${esc(tip)}"><span class="pai-col" style="--h:${frac(w.n, tk.top)}"></span>${lab.has(i) ? `<span class="pai-cap${i === top ? '' : ' opt'}" style="--h:${frac(w.n, tk.top)}">${w.n}</span>` : ''}</span>`;
    }).join('');
    const grid = []; for (let v = tk.step; v <= tk.top; v += tk.step) grid.push(`<span class="pai-gl" style="--y:${frac(v, tk.top)}" aria-hidden="true"><b>${v}</b></span>`);
    // month labels centred in each month; ticks at month starts
    const months = [];
    const a = new Date(d.w0 * 864e5), z = d.w0 + d.wDays;
    for (let y = a.getUTCFullYear(), m = a.getUTCMonth() + 1; ; m++) {
      if (m > 12) { m = 1; y++; }
      const s = Date.UTC(y, m - 1, 1) / 864e5; if (s >= z) break;
      const e = Math.min(z, Date.UTC(y, m, 1) / 864e5);
      if (s >= d.w0) months.push({ x: ((s - d.w0) / d.wDays).toFixed(4), c: ((s + e) / 2 - d.w0) / d.wDays, t: UI.fmtDate(dstr(s), 'month').slice(0, 3), w: (e - s) / d.wDays });
    }
    const snap = (P.snapshots || []).find((s) => s.as_of && s.as_of < SRC.as_of && s.total);
    const marks = [];
    if (snap) marks.push({ x: xOf(snap.as_of.length === 7 ? snap.as_of + '-01' : snap.as_of), t: `${UI.fmtDate(snap.as_of, 'long').replace(/ \d{4}$/, '')} grid: ${snap.total}`, cls: '' });
    marks.push({ x: '1', t: `${UI.fmtDate(d.deadline, 'day')} deadline`, cls: ' end' });
    const sh = pct(d.last14, d.dated);
    const two = W.slice(-2);
    return `<section class="card pai-chart" aria-labelledby="pai-c2"><h3 id="pai-c2">When they arrived</h3>
      <p class="small ink2">Proposals received each week up to the ${esc(fmtD(d.deadline))} deadline (${plural(d.dated, 'item')} with a date). <strong>${d.last14} of them (${sh}%) came in the last 14 days</strong>${two.length === 2 ? ` (${esc(UI.fmtRange(two[0].s, two[1].e, 'day'))})` : ''}.</p>
      <div class="pai-cols" style="--n:${W.length}">
        <div class="pai-plot">${grid.join('')}<div class="pai-bars">${cols}</div>${marks.map((m) => `<span class="pai-mark${m.cls}" style="--x:${m.x}" aria-hidden="true"></span>`).join('')}</div>
        <div class="pai-xaxis" aria-hidden="true">${months.map((m) => `<span class="pai-tick" style="--x:${m.x}"></span>${m.w > 0.06 ? `<span class="pai-xl" style="--x:${m.c.toFixed(4)}">${esc(m.t)}</span>` : ''}`).join('')}</div>
        <div class="pai-annots" aria-hidden="true">${marks.map((m) => `<span class="pai-annot${m.cls}" style="--x:${m.x}">${esc(m.t)}</span>`).join('')}</div>
      </div>
      ${twin('Proposals received per week', ['Week', 'Received'], W.map((w) => [esc(range(w)), w.n]), [1])}</section>`;
  }

  // c. where they went: reviewing body, this cycle vs the last one (with how many of last year's went forward)
  function bodiesChart() {
    const d = derive();
    const lastBy = {}; (LAST.by_body || []).forEach((b) => { lastBy[b.key] = b; });
    const keys = Object.keys(BODIES);
    const max = Math.max(1, ...keys.map((k) => Math.max(d.byBody[k] || 0, (lastBy[k] || {}).total || 0)));
    const sortBy = (a, b) => (d.byBody[b] || 0) - (d.byBody[a] || 0) || ((lastBy[b] || {}).total || 0) - ((lastBy[a] || {}).total || 0);
    const groups = [['Trustees’ committees', keys.filter((k) => BODIES[k].tc).sort(sortBy)], ['Boards', keys.filter((k) => !BODIES[k].tc).sort(sortBy)]];
    const row = (k) => {
      const now = d.byBody[k] || 0, L = lastBy[k] || { total: 0, forwarded: 0 };
      const name = bodyName(k);
      // a board label is not a link: its full name (when it says more than the label) is hidden text and a hover tip, not
      // an extra keyboard stop
      const short = bodyShort(k);
      const lab = BODIES[k].tc ? `<a href="#/board" data-tip="${esc(name)} (a committee of the General Service Board)">${esc(short)}</a>` : `<span data-tip="${esc(name)}">${esc(short)}${fold(name) !== fold(short) ? `<span class="pai-sr"> (${esc(name)})</span>` : ''}</span>`;
      // this cycle: split by what the body decided (once the grid has decisions); last cycle: one context bar
      const o = d.bodyOut[k] || { fwd: 0, no: 0, under: 0 };
      const cur = HAS_DEC ? stackTrack(o, max, name, `${name}: ${plural(now, 'proposal')} for the ${nth(ORD)} Conference — ${outcomeTip(o)}`, `${o.fwd} of ${now} forwarded`)
        : barTrack(now, max, 'a', `${name}: ${plural(now, 'proposal')} for the ${nth(ORD)} Conference`, now);
      return `<div class="pai-grow"><span class="pai-hlab">${lab}</span><span class="pai-pair">
        ${cur}
        ${barTrack(L.total, max, 'c', `${name}: ${plural(L.total, 'proposal')} for the ${nth(ORD - 1)} Conference${L.total ? `, ${L.forwarded} forwarded to it` : ''}`, L.total ? `${L.forwarded} of ${L.total} forwarded` : 'none')}</span></div>`;
    };
    const wd = CUR.filter((x) => !x.body).length, lwd = (lastBy.WD || {}).total || 0;
    const tbl = [];
    groups.forEach(([g, ks]) => ks.forEach((k) => {
      const L = lastBy[k] || { total: 0, forwarded: 0 }, o = d.bodyOut[k] || { fwd: 0, no: 0, under: 0 };
      tbl.push([esc(bodyName(k)), d.byBody[k] || 0].concat(HAS_DEC ? [o.fwd, o.no, o.under] : [], [L.total, L.forwarded]));
    }));
    const head = ['Reviewing body', `${nth(ORD)} (this cycle)`].concat(HAS_DEC ? ['Forwarded', 'No action', 'Still open'] : [], [`${nth(ORD - 1)} (last cycle)`, 'Forwarded last cycle']);
    return `<section class="card pai-chart" aria-labelledby="pai-c3"><h3 id="pai-c3">Where they went</h3>
      <p class="small ink2">The trustees’ committee or board that reviews each proposal, this cycle and last.${HAS_DEC ? ` This cycle’s bar splits by what it decided at the ${esc(WK.toLowerCase())}; the figure after each bar is how many it forwarded to the Conference.` : ' The figure after last year’s bar is how many of them it forwarded to the Conference.'}</p>
      ${legend((HAS_DEC ? OUTCOME.map(([, cls, t]) => [cls, `${nth(ORD)}: ${t}`]) : [['a', `${nth(ORD)} Conference (this cycle)`]]).concat([['c', `${nth(ORD - 1)} Conference (last cycle)`]]))}
      <div class="pai-hbars pai-gbars">${groups.map(([g, ks]) => `<div class="pai-fam"><h4 class="pai-famh">${esc(g)}</h4>${ks.map(row).join('')}</div>`).join('')}</div>
      <p class="small muted">Not shown: ${plural(wd, 'item')} withdrawn, superseded or removed this cycle (${lwd} last cycle)${derive().deferred.length ? ` and the ${derive().deferred.length} deferred Plain Language Big Book items` : ''}.</p>
      ${twin('Proposals by reviewing body', head, tbl, head.map((_, i) => i).slice(1))}</section>`;
  }

  // c2. what the trustees decided, by main theme: forwarded | no action | still open (same rows and order as the Themes chart)
  function decidedChart() {
    if (!HAS_DEC) return '';
    const d = derive(), z = { fwd: 0, no: 0, under: 0 };
    const tot = (o) => o.fwd + o.no + o.under, oOf = (id) => d.themeOut[id] || z;
    const max = Math.max(1, ...THEMES.map((t) => tot(oOf(t.id))));
    const fams = FAMS.map((f) => {
      const ts = themesOfFam(f.id).filter((t) => tot(oOf(t.id))).sort((a, b) => d.prim[b.id].total - d.prim[a.id].total);
      const rows = ts.map((t) => {
        const o = oOf(t.id), n = tot(o);
        return `<div class="pai-grow"><span class="pai-hlab"><a href="${themeHref(t.id)}" data-tip="${esc(`${t.name}: list its proposals and open its explainer`)}">${esc(t.name)}</a></span>
          ${stackTrack(o, max, t.name, `${t.name}: ${plural(n, 'proposal')} with this as the main theme — ${outcomeTip(o)}`, `${o.fwd} of ${n} forwarded`)}</div>`;
      }).join('');
      return rows ? `<div class="pai-fam"><h4 class="pai-famh">${esc(f.name)}</h4>${rows}</div>` : '';
    }).join('');
    const tbl = [];
    FAMS.forEach((f) => themesOfFam(f.id).forEach((t) => { const o = oOf(t.id); if (tot(o)) tbl.push([esc(f.name), `<a href="${themeHref(t.id)}">${esc(t.name)}</a>`, o.fwd, o.no, o.under, tot(o)]); }));
    const shown = THEMES.reduce((s, t) => s + tot(oOf(t.id)), 0);
    const outN = CUR.filter((x) => statusGroup(x) === 'out').length;
    return `<section class="card pai-chart pai-c-themes" aria-labelledby="pai-c8"><h3 id="pai-c8">What the trustees decided, by theme</h3>
      <p class="small ink2">What became of the proposals at the ${esc(WK.toLowerCase())}${wkRange() ? ` (${esc(wkRange())})` : ''}, by their main theme (${num(shown)} of the ${num(CUR.length)} items in the ${esc(nth(ORD))} cycle; the ${outN} withdrawn, superseded or removed${d.deferred.length ? ` and the ${d.deferred.length} deferred from 2025` : ''} are not counted). The figure after each bar is how many went forward.</p>
      ${outcomeLegend()}
      <div class="pai-hbars pai-dbars">${fams}</div>
      ${twin('Board weekend decisions by main theme', ['Family', 'Theme', 'Forwarded', 'No action', 'Still open', 'Total'], tbl, [2, 3, 4, 5])}</section>`;
  }

  /** Single-series horizontal bars: rows [{lab (HTML), sub?, v, tip, attr?}], value "N · P%" at the tip. */
  function simpleBars(rows, total) {
    const max = Math.max(1, ...rows.map((r) => r.v));
    return `<div class="pai-hbars pai-sbars">${rows.map((r) => `<div class="pai-grow"><span class="pai-hlab">${r.lab}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>
      ${barTrack(r.v, max, 'a', r.tip, `${r.v}${total ? ` · ${pct(r.v, total)}%` : ''}`)}</div>`).join('')}</div>`;
  }
  // d. what they ask
  function asksChart() {
    const d = derive();
    const ks = Object.keys(ASKS).filter((k) => d.byAsk[k]).sort((a, b) => d.byAsk[b] - d.byAsk[a]);
    const tot = ks.reduce((s, k) => s + d.byAsk[k], 0);
    return `<section class="card pai-chart" aria-labelledby="pai-c4"><h3 id="pai-c4">What they ask</h3>
      <p class="small ink2">The kind of request each proposal makes (${plural(tot, 'proposal')} with a summary; this app’s own sorting, not GSO’s).</p>
      ${simpleBars(ks.map((k) => ({ lab: esc(ASK_LABEL[k] || k), sub: ASKS[k], v: d.byAsk[k], tip: `${ASK_LABEL[k] || k} (${ASKS[k]}): ${plural(d.byAsk[k], 'proposal')}, ${pct(d.byAsk[k], tot)}%` })), tot)}
      ${twin('Proposals by kind of request', ['Request', 'Meaning', 'Proposals', 'Share'], ks.map((k) => [esc(ASK_LABEL[k] || k), esc(ASKS[k]), d.byAsk[k], pct(d.byAsk[k], tot) + '%']), [2, 3])}</section>`;
  }
  // e. who sent them, and the areas the grid names
  function whoChart() {
    const d = derive();
    const ks = Object.keys(d.byKind).sort((a, b) => d.byKind[b] - d.byKind[a]);
    const tot = ks.reduce((s, k) => s + d.byKind[k], 0);
    const myN = +FCR.store.get('myArea', 65) || 65, myR = FCR.areaRegion(myN);
    const areaRows = d.areas.map((a) => {
      const r = FCR.areaRegion(a.n), mine = r && r === myR;
      return `<li class="${mine ? 'pai-mine' : ''}">${UI.areaLink(a.n)} <span class="small muted">${esc(FCR.regionName(r))}</span>${mine ? ` <span class="badge pai-myr">from your region</span>` : ''}
        <span class="pai-nums">${a.keys.map((k) => itemLink(k)).join(' ')}</span></li>`;
    }).join('');
    return `<section class="card pai-chart" aria-labelledby="pai-c5"><h3 id="pai-c5">Who sent them</h3>
      <p class="small ink2">Who the grid says a proposal comes from (${plural(tot, 'row')}, copies included). Most do not say.</p>
      ${simpleBars(ks.map((k) => ({ lab: esc(KIND[k] || k), v: d.byKind[k], tip: `${KIND[k] || k}: ${plural(d.byKind[k], 'proposal')}, ${pct(d.byKind[k], tot)}%` })), tot)}
      ${d.areas.length ? `<h4 class="pai-subh">Areas named in the grid <span class="muted small">${d.areas.length}</span></h4><ul class="pai-areas">${areaRows}</ul>
        <p class="small muted">Your region is the ${esc(FCR.regionName(myR))} region (Area ${myN}); change your area on the <a href="#/today">Today</a> page.</p>` : ''}
      ${twin('Proposals by submitter', ['Submitter', 'Proposals', 'Share'], ks.map((k) => [esc(KIND[k] || k), d.byKind[k], pct(d.byKind[k], tot) + '%']), [1, 2])}</section>`;
  }
  // f. same wording, many senders
  function clustersCard() {
    const cl = CLUSTERS.filter((c) => (c.keys || []).length >= 2).slice().sort((a, b) => b.keys.length - a.keys.length || b.copies - a.copies);
    if (!cl.length) return '';
    const rows = cl.map((c) => { const x = byKey[c.keys[0]] || {}; return `<tr><td><a href="${itemHref(c.keys[0])}">${esc(titleOf(x))}</a></td><td class="n" data-s="items">${c.keys.length}</td><td class="n" data-s="exact cop${c.copies === 1 ? 'y' : 'ies'}">${c.copies}</td><td><span class="pai-nums">${c.keys.map((k) => itemLink(k)).join(' ')}</span></td></tr>`; }).join('');
    return `<section class="card pai-chart pai-c-wide" id="pai-clusters" aria-labelledby="pai-c6"><h3 id="pai-c6">Same wording, many senders</h3>
      <p class="small ink2">Groups of proposals with identical or very similar wording (${plural(cl.length, 'group')}). “Exact copies” counts the items that repeat another item of the group word for word, or apart from a word or a typo.</p>
      <div class="table-wrap"><table class="t compact pai-cl"><thead><tr><th>What it asks (first item)</th><th class="n">Items</th><th class="n">Exact copies</th><th>Item numbers</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }
  // per-year totals (How a proposal travels): columns, this cycle in accent, gaps where the app's sources give no total
  // (no total in that year's Final Report; the status grids that went to Conference members are not all in this app)
  function yearsChart() {
    const cs = (HIST.counts || []).slice().sort((a, b) => a.year - b.year);
    if (cs.filter((c) => c.received != null).length < 3) return '';
    const max = Math.max(...cs.map((c) => c.received || 0)), tk = { top: max };   // every value is labelled: no axis, so scale to the tallest
    const cols = cs.map((c) => {
      const cur = c.year === CY, has = c.received != null;
      const tip = has ? `${c.year} (${nth(c.ordinal)} Conference): ${num(c.received)} proposals received${c.forwarded != null ? `, ${c.forwarded} forwarded${c.note ? ` (${c.note})` : ''}` : ''}` : `${c.year} (${nth(c.ordinal)} Conference): no total in its Final Report`;
      return `<span class="pai-slot${has ? '' : ' gap'}"${has ? ` tabindex="0" role="img" aria-label="${esc(tip)}"` : ''} data-tip="${esc(tip)}">${has ? `<span class="pai-col${cur ? '' : ' ctx'}" style="--h:${frac(c.received, tk.top)}"></span><span class="pai-cap" style="--h:${frac(c.received, tk.top)}">${c.received}</span>` : '<span class="pai-gaplab">no total found</span>'}</span>`;
    }).join('');
    const xl = cs.map((c) => `<span class="pai-yl${c.year === CY ? ' cur' : ''}"><span class="pai-long">${c.year}</span><span class="pai-short">’${String(c.year).slice(2)}</span></span>`).join('');
    return `<section class="card pai-chart" aria-labelledby="pai-c7"><h3 id="pai-c7">Proposals received per Conference</h3>
      <p class="small ink2">Totals where a Final Report or a status grid gives one; for the other years the Final Report gives no total (their grids are not in this app).</p>
      ${legend([['a', `${CY} (this cycle)`], ['c', 'earlier Conferences']])}
      <div class="pai-cols pai-ycols" style="--n:${cs.length}"><div class="pai-plot"><div class="pai-bars">${cols}</div></div><div class="pai-yaxis" aria-hidden="true">${xl}</div></div>
      ${twin('Proposals received per Conference', ['Year', 'Conference', 'Received', 'Forwarded', 'Source'], cs.map((c) => [c.year, esc(nth(c.ordinal)), c.received == null ? '<span class="muted">no total in the Final Report</span>' : num(c.received), c.forwarded == null ? '<span class="muted">—</span>' : c.forwarded, `<span class="small">${c.note ? `${esc(ucfirst(c.note))}. ` : ''}${esc(c.cite || '')}</span>`]), [2, 3])}</section>`;
  }

  // ---------- what goes to the Conference ----------
  /** Item links of an agenda topic, each copy folded into its original when both are in the topic ("#14 +2"). */
  function topicNums(keys) {
    const inT = new Set(keys);
    const lead = keys.filter((k) => !(byKey[k] && byKey[k].same_as && inT.has(byKey[k].same_as)));
    return lead.map((k) => {
      const cs = keys.filter((c) => byKey[c] && byKey[c].same_as === k).map((c) => '#' + c);
      return `<span class="pai-tpn">${itemLink(k)}${cs.length ? `<span class="pai-cpn" data-tip="${esc(`Same wording: ${cs.join(', ')}`)}">+${cs.length}<span class="pai-sr"> with the same wording: ${esc(cs.join(', '))}</span></span>` : ''}</span>`;
    }).join(' ');
  }
  function topicCard(tp, groupProv) {
    const keys = tp.keys || [], n = keys.length;
    const copies = keys.filter((k) => byKey[k] && byKey[k].same_as).length;
    const kind = tp.kind === 'added' ? `Added by the ${byShort(tp.by)}`
      : (tp.kind === 'general_topic' ? `${plural(n, 'proposal')} in one topic` : n > 1 ? `${n} proposals as one item` : '1 proposal') + (copies ? ` · ${plural(copies, 'exact copy', 'exact copies')}` : '');
    const id = esc(tp.id);
    return `<article class="card pai-topic pai-tp-${esc(tp.kind)}" id="pai-tp-${id}" aria-labelledby="pai-tph-${id}">
      <h4 class="pai-tp-t" id="pai-tph-${id}"><a href="${topicHref(tp.id)}">${esc(tp.title)}</a></h4>
      <div class="pai-tp-meta small"><span class="badge pai-kind">${esc(kind)}</span>${tp.kind !== 'added' ? ` <span>forwarded by the ${esc(byShort(tp.by))}</span>` : ''}${tp.to_provisional && !groupProv ? ` <span class="pai-gtag" tabindex="0" data-tip="${esc(PROV_TIP)}">provisional routing</span>` : ''}</div>
      <p class="pai-tp-sum">${linkify(tp.summary)}</p>
      ${tp.why ? `<p class="small ink2 pai-tp-why"><strong>Why:</strong> ${linkify(tp.why)}</p>` : ''}
      ${tp.note ? `<p class="small muted">${linkify(tp.note)}</p>` : ''}
      ${n ? `<div class="pai-nums pai-tp-nums small"><span class="muted">${n === 1 ? 'Proposal' : 'Proposals'}:</span> ${topicNums(keys)}</div>` : ''}
      <p class="small muted pai-tp-cite">${esc(citeOf(tp))}</p></article>`;
  }
  /** The agenda topics by Conference committee (Final Report order, the unnamed last), then the reference notes. fin: the
      final-agenda step; finPast: it has ended by the day viewed (the routings shown stay the board weekend's, so the notes
      say the final agenda can move them rather than that it will settle them). */
  function topicsHTML(fin, finPast) {
    const ORDER = Object.keys(FCR.COMMITTEES);
    const gm = new Map();
    ENTRIES.forEach((tp) => { const k = tp.to_committee && FCR.COMMITTEES[tp.to_committee] ? tp.to_committee : ''; if (!gm.has(k)) gm.set(k, []); gm.get(k).push(tp); });
    const groups = [...gm.entries()].sort((a, b) => (a[0] ? ORDER.indexOf(a[0]) : 999) - (b[0] ? ORDER.indexOf(b[0]) : 999));
    const html = groups.map(([c, ts]) => {
      const props = ts.reduce((s, tp) => s + (tp.keys || []).length, 0);
      const allProv = ts.every((tp) => tp.to_provisional);
      const note = !c ? `The ${esc(WK.toLowerCase())} reports name only the ${esc(nth(ORD))} Conference for these; the final agenda gives each a committee.`
        : allProv ? (finPast ? `Provisional routing: named for possible routing only; the final agenda (${esc(when(fin))}) can place these with another committee.`
          : `Provisional routing: named for possible routing only; the final agenda in early February settles the committee.`) : '';
      return `<div class="pai-cgroup"><h3 class="pai-h3">${c ? ccLink(c) : `Committee not named in the ${esc(WK.toLowerCase())} reports`} <span class="small muted">${plural(ts.length, 'entry', 'entries')}${props ? ` · ${plural(props, 'proposal')}` : ''}</span></h3>
        ${note ? `<p class="small muted pai-cnote">${note}</p>` : ''}<div class="pai-topics">${ts.map((tp) => topicCard(tp, allProv)).join('')}</div></div>`;
    }).join('');
    const refs = TOPICS.filter((tp) => tp.kind === 'reference').map((tp) => {
      const rel = (tp.related || []).filter((k) => byKey[k] && !new RegExp(`#${k}\\b`).test(tp.summary || ''));   // the summary links most of them already
      return `<div class="callout pai-ref" id="pai-tp-${esc(tp.id)}"><p><strong>${esc(tp.title)}.</strong> ${linkify(tp.summary)} <span class="small muted">(${esc(citeOf(tp))})</span></p>${rel.length ? `<div class="pai-nums small"><span class="muted">Related:</span> ${rel.map((k) => itemLink(k)).join(' ')}</div>` : ''}</div>`;
    }).join('');
    return html + refs;
  }
  /** Still open: where and when each undecided item is decided next (open_meetings), dated by the calendar where it can be.
      Entries that hold no proposal (the final agenda, the board's unnamed topics) follow as plain notes, headed by their
      `title` (else the body), with no date tag, badge or countdown, so they never read as a meeting held or due; a dated
      note drops out once its date (a month: that whole month) has passed. Once the Conference has met (S: the steps) the
      lede (tied to the grid's date either way) is in the past tense and a held meeting points to later grids and the
      Conference's actions. */
  function openHTML(t, S) {
    if (!OPEN.length) return '';
    const d = derive();
    const cf = (S || []).find((s) => s.id === 'conf'), over = !!(cf && cf.end && t > cf.end);
    const dated = OPEN.filter((m) => (m.keys || []).length);
    const notes = OPEN.filter((m) => { if ((m.keys || []).length) return false; const w = omWhen(m); return !(w.end && w.end < t); });
    const rows = dated.map((m) => ({ m, w: omWhen(m) })).sort((a, b) => (a.w.start ? 0 : 1) - (b.w.start ? 0 : 1) || String(a.w.start).localeCompare(String(b.w.start))).map(({ m, w }) => {
      const state = w.end && w.end < t ? 'held' : w.start && w.start <= t ? 'now' : '';
      const who = m.by ? ucfirst(byShort(m.by)) : `Held for the ${nth(ORD)} Conference`;
      const keys = (m.keys || []).filter((k) => byKey[k]);
      // once its date has passed: a meeting on proposals still open has its outcome in the next grid (a trustees' committee or
      // board; after the Conference: later grids and the Conference's actions) or in the Final Report (the Conference
      // itself); a row without open proposals only says so.
      // An uncertain date ("about", a calendar note such as "the packet gives both dates") is never "now" for sure.
      const stillOpen = keys.some((k) => isOpen(byKey[k]));
      const pastTxt = !stillOpen ? 'date passed' : !m.by ? 'the Conference met; its Final Report shows the outcome'
        : over ? 'met; later grids and the Conference’s actions show the outcome' : 'held; the next grid shows the outcome';
      const unsure = m.approx || (w.o && (w.o.window || w.o.approx)) || w.note;
      return `<li class="pai-om${state ? ' ' + state : ''}">
        <div class="pai-om-d">${omDate(w)}${w.note ? ` <span class="muted">(${esc(w.note)})</span>` : ''}${state === 'held' ? ` <span class="badge pai-st">${esc(pastTxt)}</span>` : state === 'now' ? ` <span class="badge pai-st pai-st-fwd">${unsure ? 'expected about now' : 'now'}</span>` : ''}</div>
        <div class="pai-om-b"><strong>${esc(who)}</strong>${keys.length ? ` · ${plural(keys.length, 'proposal')}` : ''}</div>
        <p>${linkify(m.text)}</p>
        ${keys.length > 1 ? `<div class="pai-nums">${keys.map((k) => itemLink(k)).join(' ')}</div>` : ''}
        <p class="small muted">${m.date_note ? esc(m.date_note) + ' ' : ''}(${esc(citeOf(m))})</p></li>`;
    }).join('');
    const lede = over
      ? `In GSO’s ${esc(fmtD(SRC.as_of))} grid, ${plural(d.open, 'numbered proposal was', 'numbered proposals were')} still undecided${d.deferred.length ? `, and the ${d.deferred.length} held over from 2025 waited for the Conference itself` : ''}.`
      : `In GSO’s ${esc(fmtD(SRC.as_of))} grid, ${plural(d.open, 'numbered proposal is', 'numbered proposals are')} still undecided${d.deferred.length ? `, and the ${d.deferred.length} held over from 2025 wait for the Conference itself` : ''}.`;
    return `<h3 class="pai-h3" id="pai-open">Still open</h3>
      <p class="small ink2">${lede} Dates link to the Calendar.</p>
      ${rows ? `<ul class="pai-open">${rows}</ul>` : ''}
      ${notes.length ? `<p class="small ink2 pai-open-also">Also pending</p><ul class="pai-open">${notes.map((m) => `<li class="pai-om">
        <div class="pai-om-b"><strong>${esc(m.title || (m.by ? ucfirst(byShort(m.by)) : `Held for the ${nth(ORD)} Conference`))}</strong></div>
        <p>${linkify(m.text)}</p>
        <p class="small muted">${m.date_note ? esc(m.date_note) + ' ' : ''}(${esc(citeOf(m))})</p></li>`).join('')}</ul>` : ''}`;
  }
  // d2. why the rest got no action: one reason kind per decision (this app's sorting of the reports' reasons)
  function whyNotChart() {
    const d = derive();
    const ks = Object.keys(RK).filter((k) => d.rk[k]).sort((a, b) => d.rk[b] - d.rk[a]);
    if (!ks.length) return '';
    const tot = ks.reduce((s, k) => s + d.rk[k], 0);
    return `<section class="card pai-chart pai-why" aria-labelledby="pai-why-h"><h3 id="pai-why-h">Not forwarded: why</h3>
      <p class="small ink2">The main reason given for each of the ${plural(tot, 'proposal')} that got no action, one per proposal (this app’s sorting of the reports’ reasons).${d.handed ? ` For ${d.handed} of them the report also names who takes the idea on: a subcommittee, a GSO department or staff member, or another committee${d.handedWip && RK.in_progress ? ` (${d.handedWip} of these ${d.handed} are counted under “${esc(RK.in_progress)}”)` : ''}.` : ''}</p>
      ${simpleBars(ks.map((k) => ({ lab: esc(RK[k]), v: d.rk[k], tip: `${RK[k]}: ${plural(d.rk[k], 'proposal')}, ${pct(d.rk[k], tot)}%. ${RKA[k] || ''}` })), tot)}
      ${twin('Reasons for no action', ['Reason', 'Meaning', 'Proposals', 'Share'], ks.map((k) => [esc(RK[k]), esc(RKA[k] || ''), d.rk[k], pct(d.rk[k], tot) + '%']), [2, 3])}
      <p class="small pai-why-more"><a href="#/agenda/status/no">All ${tot} no-action proposals, each with its reason →</a></p></section>`;
  }
  /** What goes to the Conference. The lede counts what the board weekend (and any later meeting in the grid) decided, so its
      tenses hold on any day; once the final agenda's dates have passed (finPast) it drops "so far" and says the routings
      shown are the weekend's, which the final agenda can change. */
  function fwdHTML(S, t) {
    if (!ENTRIES.length) return '';
    const d = derive(), fin = S.find((s) => s.id === 'final');
    const finPast = !!(fin && fin.end && fin.end < t);
    return `<section id="pai-fwd" class="pai-sec" tabindex="-1" aria-labelledby="pai-fwd-h"><h2 class="section-title" id="pai-fwd-h">What goes to the ${esc(nth(ORD))} Conference</h2>
      <p class="ink2 pai-fwd-lede">At the ${esc(WK.toLowerCase())}${wkRange() ? ` (${esc(wkRange())})` : ''} the trustees’ committees and boards decided on ${d.atWk} of the ${num(SRC.total)} proposals${d.later ? `; ${d.later} more ${d.later === 1 ? 'was' : 'were'} decided at later meetings` : ''}. ${d.later ? 'In all they' : 'They'} forwarded ${d.fwd} (${pct(d.fwd, SRC.total)}%), which reach the agenda as ${plural(d.fromProps, 'entry', 'entries')}${d.added ? `; with ${d.added} the trustees’ committees added on their own, that makes ${d.entries}${finPast ? '' : ' so far'}` : ''}. ${d.no} got no action and ${d.open} ${d.open === 1 ? 'was' : 'were'} left open${d.out ? `; the other ${d.out} had been withdrawn, superseded or removed before the weekend` : ''}. ${finPast ? `The routings shown here are the ${esc(WK.toLowerCase())}’s; the final agenda (${esc(when(fin))}) can place some items with another committee.` : `Committee routings can still change until the final agenda${fin ? ` (${esc(when(fin))})` : ' in early February'}.`}
        Citations such as “${esc(DS.short || 'board reports')} p. 52” give the PDF page of the weekend’s board and committee reports.</p>
      ${topicsHTML(fin, finPast)}
      ${openHTML(t, S)}
      ${whyNotChart()}
    </section>`;
  }

  // ---------- what stands out ----------
  function obsHTML() {
    if (!OBS.length) return '';
    const split = (s) => {
      const i = s.indexOf(': ');
      if (i > 0 && i < 110) return [s.slice(0, i + 1), s.slice(i + 2)];
      const j = s.search(/[.] (?=[A-Z#“])/);   // else the first sentence, when it is short enough to read as a heading
      if (j > 0 && j < 100) return [s.slice(0, j + 1), s.slice(j + 2)];
      return ['', s];
    };
    const li = (o) => { const [h, b] = split(String(o)); const used = new Set(); return `<li>${h ? `<strong>${linkify(h, true, used)}</strong> ` : ''}${linkify(b, true, used)}</li>`; };
    // the first six stay in view; the rest one tap away (print opens them)
    return `<ul class="pai-obs">${OBS.slice(0, 6).map(li).join('')}</ul>${OBS.length > 6 ? `<details class="pai-obs-more"><summary>${OBS.length - 6} more observations</summary><ul class="pai-obs">${OBS.slice(6).map(li).join('')}</ul></details>` : ''}`;
  }

  // ---------- themes explained ----------
  /** "This fall: 4 forwarded (in “<general topic>”; as “<item>” and “<item>”), 7 no action, 7 left open; 1 had been
      withdrawn, superseded or removed before the weekend." — computed from the main-theme rows of this cycle, so the parts
      add up to the card's count. Proposals go "in" a general topic but "as" an item of their own; the titles are quoted
      (their own double quotes made single), so a title with a comma of its own stays readable in the list. The weekend
      "left open" some and the 2025 items "were held for" the Conference: both true on any day. */
  function fallLine(t) {
    if (!HAS_DEC) return '';
    const d = derive(), o = d.themeOut[t.id] || { fwd: 0, no: 0, under: 0 };
    const def = d.deferred.filter((x) => (x.themes || [])[0] === t.id).length;
    const out = CUR.filter((x) => (x.themes || [])[0] === t.id && statusGroup(x) === 'out').length;
    if (!o.fwd && !o.no && !o.under && !def && !out) return '';
    const tps = [...new Set(CUR.filter((x) => (x.themes || [])[0] === t.id && statusGroup(x) === 'fwd' && x.decision && topicBy[x.decision.topic]).map((x) => x.decision.topic))];
    // a quoted title: its own double quotes become single ones (“Update pamphlet ‘The A.A. Group’ …”)
    const tl = (id) => `“<a href="${topicHref(id)}">${esc(String(topicBy[id].title || '').replace(/“/g, '‘').replace(/”/g, '’'))}</a>”`;
    const gt = tps.filter((id) => topicBy[id].kind === 'general_topic'), its = tps.filter((id) => topicBy[id].kind !== 'general_topic');
    const where = [gt.length ? `in ${listAnd(gt.map(tl))}` : '', its.length ? `as ${listAnd(its.map(tl))}` : ''].filter(Boolean).join('; ');
    const parts = [o.fwd ? `${o.fwd} forwarded${where ? ` (${where})` : ''}` : 'none forwarded', o.no ? `${o.no} no action` : '', o.under ? `${o.under} left open` : ''].filter(Boolean);
    return `<p class="small pai-fall"><strong>This ${esc(WK.replace(/ board weekend$/, '').toLowerCase())}:</strong> ${parts.join(', ')}${out ? `; ${out} had been withdrawn, superseded or removed before the weekend` : ''}${def ? `; the ${def} deferred from 2025 were held for the Conference` : ''}.</p>`;
  }
  function themeCard(t) {
    const d = derive();
    const its = ITEMS.filter((x) => (x.themes || []).includes(t.id)).sort((a, b) => ((a.themes[0] === t.id ? 0 : 1) - (b.themes[0] === t.id ? 0 : 1)) || idx[a.key] - idx[b.key]);
    const bgAA = new Set(); (t.background || []).forEach((b) => (b.aa || []).forEach((id) => bgAA.add(id)));
    const moreAA = (t.aa || []).filter((id) => !bgAA.has(id));
    const c = d.prim[t.id] || { total: 0 };
    // main theme this cycle + main theme among the deferred 2025 items; "more" are the rows where it is a secondary theme
    const def = its.filter((x) => !isCur(x) && (x.themes || [])[0] === t.id).length, more = its.length - c.total - def;
    // the theme name is the card's (hidden) h4, so its sections are h5s and stay apart when several themes are open
    const sec = (h, body) => (body ? `<h5>${h}</h5>${body}` : '');
    const fw = HAS_DEC ? (d.themeOut[t.id] || {}).fwd || 0 : null;
    return `<details class="card pai-theme" id="pai-th-${esc(t.id)}"><summary><span class="pai-th-name">${esc(t.name)}</span> <span class="small muted pai-th-n">${plural(c.total, 'proposal')}${def ? ` + ${def} deferred from 2025` : ''}${more > 0 ? `, ${more} more touch it` : ''}${fw != null && c.total ? ` · ${fw ? `${fw} forwarded` : 'none forwarded'}` : ''}</span></summary>
      <div class="pai-th-body"><h4 class="pai-sr">${esc(t.name)}</h4>
      ${t.lede ? `<p class="pai-lede">${linkify(t.lede)}</p>` : ''}
      ${t.scope ? `<p class="small muted">Covers: ${esc(t.scope)}</p>` : ''}
      ${sec('Background', (t.background || []).length ? `<ul class="pai-bg">${t.background.map((b) => `<li>${esc(b.text)}${stopAfter(b.text)} ${b.cite ? `<span class="small muted">(${esc(b.cite)})</span>` : ''}${aaList(b.aa, 'small')}</li>`).join('')}</ul>` : '')}
      ${moreAA.length ? sec('Other related Advisory Actions', aaList(moreAA, 'small')) : ''}
      ${sec('Where things stand now', (t.now ? `<p>${linkify(t.now)}${t.now_cite ? ` <span class="small muted">(${esc(t.now_cite)})</span>` : ''}</p>` : '') + fallLine(t))}
      ${sec('What this year’s proposals ask', `${t.asked ? `<p>${linkify(t.asked)}</p>` : ''}${its.length ? `<div class="pai-nums">${its.map((x) => itemLink(x.key)).join(' ')}</div><p><button type="button" class="btn pai-show" data-show-theme="${esc(t.id)}">Show ${its.length === 1 ? 'it' : `these ${its.length}`} in the list</button></p>` : ''}`)}
      ${sec('What submitters say', (t.raised || []).length ? `<ul>${t.raised.map((r) => `<li>${linkify(r)}</li>`).join('')}</ul>` : '')}
      ${sec('Other considerations', (t.considerations || []).length ? `<ul>${t.considerations.map((r) => `<li>${linkify(r.text)}${r.cite ? ` <span class="small muted">(${esc(r.cite)})</span>` : ''}</li>`).join('')}</ul>` : '')}
      ${sec('Questions to talk over with your group', (t.questions || []).length ? `<ol>${t.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>` : '')}
      ${sec('Watch for', t.watch ? `<p>${linkify(t.watch)}</p>` : '')}
      ${(t.learn || []).some(learnTitle) ? `<div class="flex pai-learn"><span class="small muted">Learn:</span>${learnChips(t.learn)}</div>` : ''}
      </div></details>`;
  }

  // ---------- one proposal ----------
  function fromHTML(s) {
    if (!s) return '';
    const areas = (s.areas || []).map((n) => `${UI.areaLink(n)} <span class="muted">(${esc(FCR.regionName(FCR.areaRegion(n)))})</span>`);
    const ds = s.districts || [];
    const dist = ds.length ? `District${ds.length > 1 ? 's' : ''} ${esc(listAnd(ds))}` : '';
    const place = s.place && !areas.length ? ` (${esc(s.place)})` : '';
    let who;
    if (s.kind === 'district') who = [dist || 'A district', areas.join(', ')].filter(Boolean).join(', ') + place;
    else if (s.kind === 'area') who = areas.length ? areas.join(', ') : 'An area' + place;
    else who = esc(KIND[s.kind] || KIND.unstated) + (areas.length ? ', ' + areas.join(', ') : place);
    return `<div class="pai-from small"><span class="muted">From:</span> ${who}</div>`;
  }
  /** "Next: about Nov 21–23, 2026 (…)" for an item still open: where open_meetings says it is decided next. */
  function nextLine(x) {
    const m = isOpen(x) && openBy[x.key];
    if (!m) return '';
    const w = omWhen(m);
    // once that meeting has ended (by the day viewed, so ?today= works): "Met:", and where its outcome will be shown
    // (after the Conference: later grids and the Conference's actions, as in the Still open list)
    const t = FCR.calendar ? FCR.calendar.todayStr() : new Date().toISOString().slice(0, 10), met = w.end && w.end < t;
    const cf = steps().find((s) => s.id === 'conf'), over = !!(cf && cf.end && t > cf.end);
    return `<p class="pai-dec-l small"><span class="muted">${met ? 'Met' : 'Next'}:</span> ${omDate(w)}${w.note ? ` (${esc(w.note)})` : ''}${m.by ? `, ${esc(byShort(m.by))}` : `, the ${esc(nth(ORD))} Conference`}${met ? (!m.by ? '; the Final Report will show the outcome' : over ? '; later grids and the Conference’s actions show the outcome' : '; the next grid will show the outcome') : ''}</p>`;
  }
  /** The board weekend block of a row: what was decided, by whom and when, why, where it goes, the source page. */
  function decHTML(x) {
    const dc = x.decision;
    if (!dc) return x.status === 'deferred' && openBy[x.key] ? `<div class="pai-dec pai-dec-open">${nextLine(x)}</div>` : '';
    const fwd = dc.action === 'forwarded' || dc.action === 'forwarded_topic';
    const lines = [];
    if (dc.topic && topicBy[dc.topic]) lines.push(`<span class="muted">Part of:</span> ${topicLink(dc.topic)}`);
    if (fwd) lines.push(`<span class="muted">Goes to:</span> ${dc.to_committee && FCR.COMMITTEES[dc.to_committee] ? ccLink(dc.to_committee) : `the ${esc(nth(ORD))} Conference (committee not named in the ${esc(WK.toLowerCase())} reports)`}${dc.to_provisional ? ` <span class="pai-gtag" tabindex="0" data-tip="${esc(PROV_TIP)}">provisional routing</span>` : ''}`);
    if (dc.referred_to) lines.push(`<span class="muted">${dc.action === 'referred' ? 'Referred to' : 'Handed to'}:</span> ${esc(dc.referred_to)}`);
    const rk = dc.action === 'no_action' && RK[dc.reason_kind] ? ` <span class="pai-rk" tabindex="0" data-tip="${esc(RKA[dc.reason_kind] || '')}">${esc(RK[dc.reason_kind])}</span>` : '';
    // the head already says "No action": a reason that opens with "No action;" (":" or ".") starts after it. "No action on …"
    // and "No action as an agenda item; …" keep their words (they say what was not acted on).
    const cut = dc.action === 'no_action' ? String(dc.reason || '').replace(/^(?:Took )?no action\s*[;:.]\s*/i, '') : '';
    const rsn = cut ? ucfirst(cut) : dc.reason;
    // decision.prior: the board weekend's own open decision (a referral, a put-off) when a later grid moved the item to the
    // body it went to and that body decided it; shown first, so the weekend's step stays visible
    const pr = dc.prior;
    const prior = pr && pr.by ? `<p class="pai-dec-l small"><span class="muted">${esc(decLabel(pr))}:</span> ${esc(ACTION[pr.action] || pr.action)} · ${esc(byShort(pr.by))}${pr.met ? ` · ${esc(fmtD(pr.met))}` : ''}${pr.cite ? ` <span class="muted">(${esc(citeOf(pr))})</span>` : ''}</p>` : '';
    return `<div class="pai-dec pai-dec-${esc(dc.action)}">
      ${prior}<p class="pai-dec-h small"><span class="pai-dec-k">${esc(decLabel(dc))}</span> <strong>${esc(ACTION[dc.action] || dc.action)}</strong> · ${esc(byShort(dc.by))}${dc.met ? ` · ${esc(fmtD(dc.met))}` : ''}${rk}</p>
      <p class="pai-dec-r">${linkify(rsn)} <span class="small muted">(${esc(citeOf(dc))})</span></p>
      ${lines.map((l) => `<p class="pai-dec-l small">${l}</p>`).join('')}${nextLine(x)}</div>`;
  }
  /** "Nov 6, 2026 grid p. 1 (Oct 1 grid p. 10) · decision: Q4 2026 board reports p. 52". */
  function srcOf(x) {
    const pg = PG.as_of && x.page_oct != null ? ` (${UI.fmtDate(PG.as_of, PG.as_of.slice(0, 4) === String(SRC.as_of).slice(0, 4) ? 'day' : 'short')} grid p. ${x.page_oct})` : '';
    return `${fmtD(SRC.as_of)} grid p. ${x.page}${pg}${x.decision ? ` · decision: ${citeOf(x.decision)}` : ''}`;
  }
  function rowHTML(x, st) {
    const copies = copiesOf[x.key] || [];
    const recv = x.received ? `received ${esc(fmtD(x.received))}` : '';
    const g = statusGroup(x);
    const stat = x.status === 'under' ? `<span class="ink2">${STATUS.under}</span>`
      : `<span class="badge pai-st pai-st-${esc(g)}">${esc(STATUS[x.status] || x.status)}</span>${x.superseded_by ? ` by ${itemLink(x.superseded_by)}` : ''}`;
    const meta = [`<a class="pai-num" href="${itemHref(x.key)}">${esc(label(x))}</a>`, x.cycle !== ORD ? `<span>${esc(nth(x.cycle))} cycle (${x.cycle + 1950} Conference), item ${x.n}</span>` : '', recv,
      x.body ? `<span>${esc(bodyName(x.body))}</span>` : '', stat].filter(Boolean).join(' · ');
    const themes = (x.themes || []).filter((t) => themeBy[t]).map((t, i) => `<button type="button" class="chip pai-fchip${i === 0 ? ' main' : ''}" data-ftheme="${esc(t)}" data-tip="${esc(`${i === 0 ? 'Main theme' : 'Also'}: ${themeBy[t].name}. Select to list every proposal on it.`)}">${esc(themeBy[t].name)}</button>`).join('');
    const ask = x.asks ? `<button type="button" class="chip pai-fchip pai-ask" data-fasks="${esc(x.asks)}" data-tip="${esc(`Asks to ${ASKS[x.asks] || x.asks}. Select to list every proposal of this kind.`)}">asks: ${esc((ASK_LABEL[x.asks] || x.asks).toLowerCase())}</button>` : '';
    const cc = x.conf_committee && FCR.COMMITTEES[x.conf_committee];
    // once the trustees have named a committee (forwarded) or set an item aside, the app's guess has no place: still-open rows only
    const guess = cc && isOpen(x)
      ? `<div class="pai-guess small"><span class="pai-gtag" tabindex="0" data-tip="This app’s guess from the Service Manual’s committee scopes, not GSO’s or the trustees’ decision">our guess</span> If it reaches the agenda, likely the <a href="#/committees/${cYear()}/${esc(x.conf_committee)}">Conference Committee on ${esc(cc.name)}</a>${x.conf_reason ? `: ${esc(x.conf_reason)}` : '.'}</div>` : '';
    const others = x.same_as ? (copiesOf[x.same_as] || []).filter((k) => k !== x.key) : [];
    // a copy in another status section (a superseded copy of a forwarded item) is listed in its own section: name its status
    const cpLink = (k) => itemLink(k) + (byKey[k] && statusGroup(byKey[k]) !== g ? ` <span class="muted">(${esc(String(STATUS[byKey[k].status] || byKey[k].status).replace(/^\S/, (c) => c.toLowerCase()))})</span>` : '');
    const same = x.same_as ? `<div class="pai-same small">Same wording as ${itemLink(x.same_as)}${x.near ? ', apart from a word or a typo,' : ''}${others.length ? ` and ${plural(others.length, 'other item')}` : ''}.</div>`
      : copies.length ? `<div class="pai-same small">${st.copies ? `${plural(copies.length, 'more item', 'more items')} with the same wording:` : `+${copies.length} more with the same wording:`} ${copies.map(cpLink).join(' ')}</div>` : '';
    const resp = (x.responds_to || []).length ? `<h5>Responds to</h5><ul class="pai-resp">${x.responds_to.map((r) => `<li><strong>${esc(r.year)}</strong> · ${esc(r.what)}${(r.aa || []).filter((id) => aaBy[id]).length ? ` — ${r.aa.filter((id) => aaBy[id]).map((id) => `<a href="#/actions/item/${encodeURIComponent(id)}" data-tip="${esc(`${aaBy[id].year}: ${aaBy[id].text}`)}">${aaBy[id].year} action</a>`).join(', ')}` : ''}</li>`).join('')}</ul>` : '';
    const rel = (x.related_aa || []).filter((id) => aaBy[id]);
    const dNote = x.decision && x.decision.note;
    const more = [
      dNote ? `<h5>About the decision</h5><p>${linkify(dNote)}</p>` : '',
      x.differs ? `<h5>How it differs</h5><p>${linkify(x.differs)}</p>` : '',
      x.note ? `<h5>Background</h5><p>${linkify(x.note)}</p>` : '',
      resp,
      rel.length ? `<h5>Related Advisory Actions</h5>${aaList(rel)}` : '',
      (x.learn || []).some(learnTitle) ? `<div class="flex pai-learn"><span class="small muted">Learn:</span>${learnChips(x.learn)}</div>` : '',
      `<p class="pai-src small muted">Source: ${esc(srcOf(x))}${SRC.drive_name ? ` (your Drive copy of the grid: ${esc(SRC.drive_name)})` : ''}. Summary in this app’s own words.</p>`,
    ].filter(Boolean).join('');
    const nMore = [dNote, x.differs, x.note, (x.responds_to || []).length, rel.length].filter(Boolean).length;
    const moreLab = [dNote ? 'about the decision' : '', x.differs ? 'how it differs' : '', x.note ? 'background' : '', rel.length ? plural(rel.length, 'related action') : ''].filter(Boolean);
    // withdrawn, superseded and removed rows are faded; no-action rows stay readable; forwarded rows carry an accent rule
    return `<li class="pai-row${g === 'out' ? ' pai-off' : g === 'fwd' ? ' pai-fwd' : ''}" id="pai-${esc(x.key)}">
      <div class="pai-meta small">${meta}</div>
      <h4 class="pai-title">${esc(titleOf(x))}</h4>
      ${x.summary ? `<p class="pai-sum">${esc(x.summary)}</p>` : x.outcome ? `<p class="pai-sum ink2">${esc(x.outcome)}${stopAfter(x.outcome)}</p>` : ''}
      ${x.summary && x.outcome && x.status !== 'under' ? `<p class="small ink2 pai-outc">Grid: ${esc(x.outcome)}${stopAfter(x.outcome)}</p>` : ''}
      ${decHTML(x)}
      ${themes || ask ? `<div class="pai-chips">${themes}${ask}</div>` : ''}
      ${fromHTML(x.submitter)}${same}${guess}
      ${x.summary ? `<details class="pai-more"><summary>${nMore ? esc(ucfirst(moreLab.join(', ') || 'more')) : 'Source'}</summary>${more}</details>` : `<p class="pai-src small muted">Source: ${esc(srcOf(x))}.</p>`}
    </li>`;
  }

  // ---------- last cycle ----------
  function lastHTML() {
    if (!LAST.total) return '';
    const fw = LAST.forwarded_items || [];
    const d = derive();
    const tc = (LAST.theme_counts || []).slice();
    const fOrder = (id) => FAMS.findIndex((f) => f.id === (themeBy[id] || {}).family);
    tc.sort((a, b) => fOrder(a.theme) - fOrder(b.theme) || ((d.prim[b.theme] || {}).total || 0) - ((d.prim[a.theme] || {}).total || 0));
    const notes = LAST.notes || [];
    const note = (n) => `<li>${esc(n.text)}${n.cite ? ` <span class="small muted">(${esc(n.cite)})</span>` : ''}</li>`;
    return `<section id="pai-last" class="pai-sec" tabindex="-1" aria-labelledby="pai-last-h"><h2 class="section-title" id="pai-last-h">Last year: what happened</h2>
      <p class="ink2">For the ${esc(nth(ORD - 1))} Conference (${CY - 1}) the grid listed ${plural(LAST.total, 'proposal')}. ${LAST.forwarded} (${pct(LAST.forwarded, LAST.total)}%) were forwarded to the Conference, ${LAST.not_forwarded} were not, and ${LAST.withdrawn} ${LAST.withdrawn === 1 ? 'was' : 'were'} withdrawn or removed. Item numbers below are last cycle’s.</p>
      ${HAS_DEC ? `<p class="ink2">This ${esc(WK.replace(/ board weekend$/, '').toLowerCase())} the trustees’ committees and boards forwarded ${d.fwd} of the ${num(SRC.total)} proposals for the ${esc(nth(ORD))} Conference (${pct(d.fwd, SRC.total)}%${d.laterFwd ? `; ${d.laterFwd} of them at ${d.laterFwd === 1 ? 'a later meeting' : 'later meetings'}` : ''}), which make ${plural(d.fromProps, 'agenda entry', 'agenda entries')}${d.added ? ` (${d.entries} with the ${d.added} they added themselves)` : ''}; for the ${esc(nth(ORD - 1))} Conference they forwarded ${LAST.forwarded} of ${LAST.total} (${pct(LAST.forwarded, LAST.total)}%). <a href="#/agenda/forwarded">What goes to the ${esc(nth(ORD))} Conference →</a></p>` : ''}
      <div class="table-wrap pai-fw-wrap"><table class="t compact pai-fw"><caption class="pai-sr">Proposals forwarded to the ${esc(nth(ORD - 1))} Conference and what happened</caption>
        <thead><tr><th class="n">Item</th><th>Proposal</th><th>Heard by</th><th>What happened</th></tr></thead>
        <tbody>${fw.map((f) => `<tr><td class="n" data-l="Item">${esc(f.n)}</td><td data-l="Proposal">${esc(f.title)}</td><td data-l="Heard by">${f.conf_committee ? esc(FCR.cname(f.conf_committee)) : '—'}</td>
          <td data-l="What happened">${esc(f.outcome)}${stopAfter(f.outcome)}${(f.aa || []).filter((id) => aaBy[id]).length ? ` ${f.aa.filter((id) => aaBy[id]).map((id) => `<a href="#/actions/item/${encodeURIComponent(id)}">${aaBy[id].year} Advisory Action →</a>`).join(' ')}` : ''}${f.cite ? `<div class="small muted">${esc(f.cite)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>
      <h3 class="pai-h3">Themes, this cycle and last</h3>
      <p class="small ink2">Proposals by main theme. Last cycle’s numbers are counted from the February ${CY - 1} grid.</p>
      <div class="table-wrap"><table class="t compact pai-tc"><thead><tr><th>Theme</th><th class="n">${esc(nth(ORD))}</th>${HAS_DEC ? `<th class="n">${esc(nth(ORD))} forwarded</th>` : ''}<th class="n">${esc(nth(ORD - 1))}</th><th class="n">${esc(nth(ORD - 1))} forwarded</th><th>Last cycle’s items</th></tr></thead>
        <tbody>${tc.filter((r) => themeBy[r.theme]).map((r) => `<tr><td><a href="${themeHref(r.theme)}">${esc(themeBy[r.theme].name)}</a></td><td class="n">${(d.prim[r.theme] || {}).total || 0}</td>${HAS_DEC ? `<td class="n">${(d.themeOut[r.theme] || {}).fwd || 0}</td>` : ''}<td class="n">${r.total}</td><td class="n">${r.forwarded}</td><td class="small muted">${(r.examples || []).length ? 'e.g. ' + r.examples.map((n) => esc(n)).join(', ') : ''}</td></tr>`).join('')}</tbody></table></div>
      ${notes.length ? `<h3 class="pai-h3">Why items were or were not forwarded</h3><ul class="pai-notes">${notes.slice(0, 4).map(note).join('')}</ul>
        ${notes.length > 4 ? `<details class="pai-moren"><summary>${notes.length - 4} more notes</summary><ul class="pai-notes">${notes.slice(4).map(note).join('')}</ul></details>` : ''}` : ''}
    </section>`;
  }

  // ---------- how a proposal travels ----------
  function processHTML() {
    const pr = HIST.process || [];
    const numbered = pr.filter((p) => /^\d+\./.test(p.step)), other = pr.filter((p) => !/^\d+\./.test(p.step));
    const facts = HIST.facts || [];
    const pub = HIST.public_url || 'https://www.aa.org/proposed-agenda-item-information';
    return `<section id="pai-process" class="pai-sec" tabindex="-1" aria-labelledby="pai-process-h"><h2 class="section-title" id="pai-process-h">How a proposal travels</h2>
      <nav class="flex pai-links" aria-label="Related pages"><a class="chip" href="#/learn/agenda_path">Learn: the path of an agenda item</a><a class="chip" href="#/calendar">Calendar</a><a class="chip" href="#/actions">Advisory Actions</a><a class="chip" href="${esc(pub)}" target="_blank" rel="noopener">aa.org: proposed agenda item information ↗</a></nav>
      <div class="pai-proc">
        <ol class="pai-steplist">${numbered.map((p) => `<li><strong>${esc(p.step.replace(/^\d+\.\s*/, ''))}</strong><p>${esc(p.text)} ${p.cite ? `<span class="small muted">(${esc(p.cite)})</span>` : ''}</p></li>`).join('')}</ol>
        <div class="pai-proc-side">
          ${yearsChart()}
          ${other.length ? `<section class="card pai-statuses" aria-labelledby="pai-stt"><h3 id="pai-stt">What the statuses mean</h3><dl>${other.map((p) => `<dt>${esc(p.step.replace(/^Status:\s*/, ''))}</dt><dd>${esc(p.text)} ${p.cite ? `<span class="small muted">(${esc(p.cite)})</span>` : ''}</dd>`).join('')}</dl></section>` : ''}
        </div>
      </div>
      ${facts.length ? `<details class="pai-facts"><summary>More facts and history (${facts.length})</summary><ul>${facts.map((f) => `<li>${esc(f.text)}${f.cite ? ` <span class="small muted">(${esc(f.cite)})</span>` : ''}</li>`).join('')}</ul></details>` : ''}
      ${HIST.public_note ? `<details class="pai-facts"><summary>Where the grid comes from, and who receives it</summary><p>${esc(HIST.public_note)}</p></details>` : ''}
    </section>`;
  }

  // ---------- the page ----------
  V.agenda = function (el, args) {
    if (!ITEMS.length) { el.innerHTML = `<div class="page-head"><div><h1>Proposed Agenda Items</h1></div></div>${UI.empty('The proposed agenda items are not loaded.')}`; return; }
    const d = derive();
    const t = FCR.calendar ? FCR.calendar.todayStr() : new Date().toISOString().slice(0, 10);
    const a0 = args && args[0], a1 = args && args[1] ? (() => { try { return decodeURIComponent(args[1]); } catch (e) { return args[1]; } })() : '';
    const st = { theme: '', body: '', asks: '', from: '', status: '', q: '', copies: false, sort: 'grid', limit: 60 };
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const hitItem = a0 === 'item' && byKey[a1] ? byKey[a1] : null;
    const hitTheme = a0 === 'theme' && themeBy[a1] ? themeBy[a1] : null;
    const hitTopic = a0 === 'topic' && topicBy[a1] ? topicBy[a1] : null;
    // filters from the URL: a status group with rows, a reviewing body (any case)
    const hitStatus = a0 === 'status' && own(GROUP, a1) && d.grp[a1] ? a1 : '';
    const hitBody = a0 === 'body' && own(BODIES, a1.toUpperCase()) ? a1.toUpperCase() : '';
    if (hitItem && hitItem.same_as) st.copies = true;
    if (hitTheme) st.theme = hitTheme.id;
    if (hitStatus) st.status = hitStatus;
    if (hitBody) st.body = hitBody;
    const unknown = !a1 ? '' : a0 === 'item' && !hitItem ? `No proposal “${a1}” is in this grid.` : a0 === 'theme' && !hitTheme ? `No theme “${a1}” on this page.`
      : a0 === 'topic' && !hitTopic ? `No agenda topic “${a1}” on this page.` : a0 === 'status' && !hitStatus ? `No proposals with the status “${a1}” on this page.`
        : a0 === 'body' && !hitBody ? `No reviewing body “${a1}” on this page.` : '';

    const S = steps();
    const conf = FCR.conference ? FCR.conference(CY) : null;
    const confDates = conf && conf.startDate ? UI.fmtRange(conf.startDate, conf.endDate, 'long') : '';
    const ratio = LAST.total ? SRC.total / LAST.total : 0;
    const ratioTxt = ratio ? (Math.abs(ratio - Math.round(ratio)) < 0.05 ? Math.round(ratio) : ratio.toFixed(1)) + '×' : '';
    // viewing (?today=) a day before the grid: say what the page shows that was not known on that day
    let prev = '';
    if (t < SRC.as_of) {
      const lastIn = CUR.reduce((m, x) => (x.received && x.received > m ? x.received : m), '');
      const bits = [];
      if (lastIn && t < lastIn) bits.push('it lists proposals that arrived after that day');
      if (HAS_DEC && DS.weekend_start) bits.push(`its statuses are the decisions of the ${WK.toLowerCase()} (${wkRange()}), ${t < DS.weekend_start ? 'which had not met yet' : t <= (DS.weekend_end || DS.weekend_start) ? 'still under way on that day' : 'which had met, though GSO had not yet published them'}`);
      prev = `<p class="small pai-asof">You are viewing the app as of ${esc(fmtD(t))}. This page shows GSO’s grid of ${esc(fmtD(SRC.as_of))}${bits.length ? `: ${esc(listAnd(bits))}` : ', published after that day'}.</p>`;
    }
    const out = d.out;
    const nearN = CUR.filter((x) => x.same_as && x.near).length;
    // a board weekend that ended after the grid's date (and before the day viewed): its decisions are not in this grid yet
    const confS = S.find((s) => s.id === 'conf'), overC = !!(confS && confS.end && t > confS.end);
    const wkDone = occs().filter((o) => /^gsb-q\d$/.test(o.ruleId || '') && o.end < t).pop();
    // (after the Conference the today line already points to the Final Report)
    const stale = wkDone && wkDone.end > SRC.as_of ? `<p class="small pai-asof">The statuses on this page are those of GSO’s grid of ${esc(fmtD(SRC.as_of))}. The board has met again since then (${esc(FCR.calendar.when(wkDone))})${confS && t > confS.end
      ? ', and so has the Conference.' : '; the next status grid shows what changed.'}</p>` : '';
    // stat tiles: once the grid has decisions, where the proposals went; before that, what came in
    let takenUp = 0;   // how many of the open ones have been taken up since (their next meeting has met)
    const openParts = (() => {
      const c = {}, order = [];
      CUR.filter((x) => x.status === 'under').forEach((x) => {
        // an item whose next meeting (open_meetings) has ended by the day viewed was taken up there: the next grid says how
        // (a referred item too: the committee it went to has met since)
        let a = (x.decision || {}).action || 'pending';
        const om = openBy[x.key], ow = om && omWhen(om);
        if (ow && ow.end && ow.end < t) a = a === 'referred' ? 'referred_met' : 'met';
        const k = /^referred/.test(a) ? a : a + '|' + ((x.decision || {}).by || x.body);
        if (!c[k]) { c[k] = 0; order.push(k); } c[k]++;
      });
      // the ones not reached yet first, by size; then everything taken up since, as one part with one pointer to where the
      // outcome shows ("12 since taken up (Literature)", "18 since taken up (12 Literature, 6 AA Grapevine board)")
      const metK = order.filter((k) => /^(met|referred_met)/.test(k)), restK = order.filter((k) => !metK.includes(k));
      const lab = (k) => { const [a, by] = k.split('|'); return /^referred/.test(a) ? `referred to ${c[k] === 1 ? 'another trustees’ committee' : 'other trustees’ committees'}` : bodyShort(by); };
      const rest = restK.sort((a, b) => c[b] - c[a]).map((k) => { const a = k.split('|')[0];
        return a === 'referred' ? `${c[k]} ${lab(k)}` : `${c[k]} ${a === 'deferred' ? 'put off' : 'not yet reached'} (${lab(k)})`; });
      const metN = takenUp = metK.reduce((s, k) => s + c[k], 0);
      if (!metN) return rest;
      const what = metK.length === 1 ? lab(metK[0]) : metK.sort((a, b) => c[b] - c[a]).map((k) => `${c[k]} ${lab(k)}`).join(', ');
      return rest.concat(`${metN} since taken up (${what}); ${overC ? 'later grids and the Conference’s actions show the outcome' : 'the next grid shows the outcome'}`);
    })();
    // once some were taken up (or the Conference has met), "still open" is the grid's count: say which grid
    const openGrid = overC || takenUp > 0;
    const stat = (v, l) => `<div class="card stat"><span class="v">${v}</span><span class="l">${l}</span></div>`;
    const tTotal = stat(num(SRC.total), `proposals for the ${esc(nth(ORD))} Conference${ratioTxt ? `, ${ratioTxt} last year’s ${num(LAST.total)}` : ''}${d.deferred.length ? `; plus ${d.deferred.length} deferred from 2025` : ''}`);
    const tWord = stat(num(CUR.length - d.copies), `distinct wordings; ${plural(d.copies, 'item repeats', 'items repeat')} another${nearN ? ` (${d.copies - nearN} word for word, ${nearN} apart from a word or a typo)` : ' word for word'}`);
    const tLate = stat(`${pct(d.last14, d.dated)}%`, `arrived in the last 14 days before the ${esc(UI.fmtDate(d.deadline, 'day'))} deadline (${d.last14} of ${d.dated})`);
    const kpis = HAS_DEC ? [tTotal,
      stat(num(d.fwd), `forwarded (${pct(d.fwd, SRC.total)}%) → <a href="#/agenda/forwarded">${plural(d.entries, 'agenda entry', 'agenda entries')}</a>${d.added ? `, counting ${d.added} the trustees’ committees added` : ''}${LAST.total ? `; last cycle ${LAST.forwarded} of ${LAST.total}` : ''}`),
      stat(num(d.no), `<a href="#/agenda/status/no">no action</a> (${pct(d.no, SRC.total)}%)${d.handed ? `; for ${d.handed} the report names who takes the idea on` : ''}`),
      stat(num(d.open), `<a href="#/agenda/status/under">still open</a>${openGrid ? ` in the ${esc(fmtD(SRC.as_of))} grid` : ''}${openParts.length ? `: ${esc(openParts.join(', '))}` : ''}${out ? `; ${out} more were withdrawn, superseded or removed before the weekend` : ''}`)]
      : [tTotal, tWord, stat(num(d.under), `under consideration in the ${esc(fmtD(SRC.as_of))} grid; ${out} withdrawn, superseded or removed`), tLate];

    // controls: options with counts
    const opt = (v, txt, sel) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(txt)}</option>`;
    const themeOpts = () => `${opt('', 'All themes', st.theme)}${FAMS.map((f) => `<optgroup label="${esc(f.name)}">${themesOfFam(f.id).map((th) => opt(th.id, `${th.name} (${d.any[th.id]})`, st.theme)).join('')}</optgroup>`).join('')}`;
    const bodyCount = {}; ITEMS.forEach((x) => { const k = x.body || '-'; bodyCount[k] = (bodyCount[k] || 0) + 1; });
    const bodyOpts = () => `${opt('', 'Any reviewing body', st.body)}${Object.keys(BODIES).sort((a, b) => (bodyCount[b] || 0) - (bodyCount[a] || 0)).map((k) => opt(k, `${bodyName(k)} (${bodyCount[k] || 0})`, st.body)).join('')}${bodyCount['-'] ? opt('-', `None: withdrawn, removed or deferred (${bodyCount['-']})`, st.body) : ''}`;
    const askCount = {}; ITEMS.forEach((x) => { if (x.asks) askCount[x.asks] = (askCount[x.asks] || 0) + 1; });
    const askOpts = () => `${opt('', 'Any request', st.asks)}${Object.keys(ASKS).filter((k) => askCount[k]).map((k) => opt(k, `${ASK_LABEL[k] || k}: ${ASKS[k]} (${askCount[k]})`, st.asks)).join('')}`;
    const kindCount = {}; ITEMS.forEach((x) => { if (x.submitter) { const k = x.submitter.kind || 'unstated'; kindCount[k] = (kindCount[k] || 0) + 1; } });
    const kindOpts = () => `${opt('', 'Anyone', st.from)}${Object.keys(KIND).filter((k) => kindCount[k]).map((k) => opt(k, `${KIND[k]} (${kindCount[k]})`, st.from)).join('')}`;
    const statOpts = () => `${opt('', 'Any status', st.status)}${GROUPS.filter((g) => d.grp[g]).map((g) => opt(g, `${GROUP[g]} (${d.grp[g]})`, st.status)).join('')}`;

    el.innerHTML = `<div class="pai-page">
      <div class="page-head"><div><h1>Proposed Agenda Items</h1>
        <p>Anyone in A.A. (a member, a group, a district or an area) may propose an item for the General Service Conference’s agenda. Proposals that arrive by ${esc(UI.fmtDate(d.deadline, 'long').replace(/,? \d{4}$/, ''))} go to the next April’s Conference, and later ones to the one after (proposals are welcome all year). The trustees’ committees and boards then decide which go to the Conference. This page explains the ${num(SRC.total)} proposals for the ${esc(nth(ORD))} Conference${confDates ? ` (${esc(confDates)})` : ''} in GSO’s status grid as of ${esc(UI.fmtDate(SRC.as_of, 'long'))}${HAS_DEC ? `, with what the trustees decided at the ${esc(WK.toLowerCase())}` : ''}, in plain words. <a href="#/learn/agenda_path">How an idea becomes an agenda item →</a></p></div></div>
      ${unknown ? `<p class="callout">${esc(unknown)} Here is the whole page.</p>` : ''}
      <nav class="flex rp-jump" aria-label="On this page"><span class="small muted">On this page:</span>${[['pai-now', 'Where things stand'], ['pai-fwd', 'What goes forward'], ['pai-trends', 'Trends'], ['pai-themes', 'Themes'], ['pai-browse', 'All proposals'], ['pai-last', 'Last year'], ['pai-process', 'How it works']].filter(([id]) => (id !== 'pai-last' || LAST.total) && (id !== 'pai-fwd' || ENTRIES.length)).map(([id, txt]) => `<button type="button" class="chip" data-jump="${id}">${txt}</button>`).join('')}</nav>

      <section class="card pai-now" id="pai-now" tabindex="-1" aria-labelledby="pai-now-h"><h2 id="pai-now-h">Where things stand</h2>
        ${S.length ? stepperHTML(S, t) : ''}
        <p class="pai-today"><strong>Today${FCR.asOfOverride ? ` (${esc(fmtD(t))})` : ''}:</strong> ${esc(todayLine(S, t))}</p>
        ${prev}${stale}
        <p class="small muted">Dates from the <a href="#/calendar">Calendar</a>; select a step for its details. Area 65 steps are this app’s home area.</p>
      </section>

      <div class="grid g4 pai-kpis">${kpis.join('')}</div>

      ${OBS.length ? `<section class="pai-sec" aria-labelledby="pai-obs-h"><h2 class="section-title" id="pai-obs-h">What stands out</h2>${obsHTML()}</section>` : ''}

      ${fwdHTML(S, t)}

      <section id="pai-trends" class="pai-sec" tabindex="-1" aria-labelledby="pai-trends-h"><h2 class="section-title" id="pai-trends-h">Trends</h2>
        ${HAS_DEC ? `<div class="grid g4 pai-kpis pai-tkpis">${tWord}${tLate}</div>` : ''}
        <div class="pai-trends">${themeChart()}${decidedChart()}<div class="pai-tstack">${bodiesChart()}${asksChart()}</div><div class="pai-tstack">${weeksChart()}${whoChart()}</div>${clustersCard()}</div>
      </section>

      <section id="pai-themes" class="pai-sec" tabindex="-1" aria-labelledby="pai-themes-h"><h2 class="section-title" id="pai-themes-h">Themes explained</h2>
        <p class="callout">Summaries in plain words; members disagree on several of these — the page describes, it does not take sides. Each theme gives the background with its sources, where things stand, what this year’s proposals ask, and questions a group might talk over.</p>
        ${FAMS.map((f) => { const ts = themesOfFam(f.id); return ts.length ? `<div class="pai-tfam"><h3 class="pai-h3">${esc(f.name)}</h3>${ts.map(themeCard).join('')}</div>` : ''; }).join('')}
      </section>

      <section id="pai-browse" class="pai-sec" tabindex="-1" aria-labelledby="pai-browse-h"><h2 class="section-title" id="pai-browse-h">All proposals</h2>
        <div class="controls pai-controls">
          <label class="pai-lab">Theme <select id="pai-f-theme">${themeOpts()}</select></label>
          <label class="pai-lab">Sent to <select id="pai-f-body">${bodyOpts()}</select></label>
          <label class="pai-lab">Asks <select id="pai-f-asks">${askOpts()}</select></label>
          <label class="pai-lab">From <select id="pai-f-from">${kindOpts()}</select></label>
          <label class="pai-lab">Status <select id="pai-f-status">${statOpts()}</select></label>
          <label class="pai-lab pai-q">Search <input type="search" id="pai-q" placeholder="words or a number, e.g. preamble, article 3, 72" autocomplete="off"></label>
          <label><input type="checkbox" id="pai-copies"${st.copies ? ' checked' : ''}> show exact copies</label>
          <label class="pai-lab">Sort <select id="pai-sort">${opt('grid', 'Grid order (GSO’s status sections)', st.sort)}${opt('num', 'Number', st.sort)}${opt('new', 'Date received, latest first', st.sort)}</select></label>
          <button type="button" class="btn" id="pai-reset">Clear filters</button>
        </div>
        <p class="small muted pai-gnote">${HAS_DEC ? `Each decided row says what the ${esc(WK.toLowerCase())} did with it and why. ` : ''}“Our guess”${HAS_DEC ? ', on rows still open,' : ' in a row'} is this app’s guess, from the Service Manual’s committee scopes, of the Conference committee that would hear the item. It is not GSO’s or the trustees’ decision.</p>
        <p id="pai-live" class="pai-live" role="status" aria-live="polite"></p>
        <div id="pai-results"></div>
      </section>

      ${lastHTML()}
      ${processHTML()}

      <div class="small muted pai-srcline">
        <p>Source: GSO, “${esc(SRC.title || '')}”, as of ${esc(UI.fmtDate(SRC.as_of, 'long'))}${SRC.pages ? `, ${SRC.pages} pages` : ''} (your copy is in the ${FCR.RAW.drive && FCR.RAW.drive.data_folder ? `<a href="${esc(FCR.RAW.drive.data_folder)}" target="_blank" rel="noopener">Drive data folder ↗</a>` : 'Drive data folder'}: ${dlink(SRC.drive_url, SRC.drive_name || 'the grid')}${SRC.spanish_url ? `; ${dlink(SRC.spanish_url, 'Spanish edition')}` : ''}${PG.as_of ? `; the grid before it, of ${esc(fmtD(PG.as_of))}: ${dlink(PG.drive_url, PG.drive_name || 'Drive copy')}` : ''}${P.previous && P.previous.drive_name ? `; last cycle’s: ${esc(P.previous.drive_name)}` : ''}). ${SRC.note ? esc(SRC.note) : 'Sent to Conference members. Motions are printed there exactly as submitted; the summaries here are this app’s own.'}</p>
        ${DS.title ? `<p>Decisions: “${esc(DS.title)}”${DS.pages ? `, ${DS.pages} pages` : ''} (${dlink(DS.drive_url, 'your Drive copy')}). ${DS.note ? esc(DS.note) : `Cited as “${esc(DS.short || '')} p. N”, where N is the PDF page.`}</p>` : ''}
      </div>
    </div>`;

    // Where the stepper scrolls sideways (tablets, narrow windows), bring today's or the next step into view, centred.
    // Rects, not offsetLeft: the scroll box is not an offsetParent.
    const sw = el.querySelector('.pai-steps-wrap'), sn = sw && sw.querySelector('.pai-step.now, .pai-step.next');
    if (sn && sw.scrollWidth > sw.clientWidth) {
      const wb = sw.getBoundingClientRect(), nb = sn.getBoundingClientRect();
      sw.scrollLeft = Math.max(0, sw.scrollLeft + nb.left - wb.left - (sw.clientWidth - nb.width) / 2);
    }

    // ---------- the list ----------
    const res = el.querySelector('#pai-results'), live = el.querySelector('#pai-live');
    const sel = (id) => el.querySelector(id);
    function list() {
      const words = fold(st.q).split(' ').filter(Boolean);
      const ok = (x) => {
        if (st.theme && !(x.themes || []).includes(st.theme)) return false;
        if (st.body && (st.body === '-' ? !!x.body : x.body !== st.body)) return false;
        if (st.asks && x.asks !== st.asks) return false;
        if (st.from && ((x.submitter || {}).kind || (x.submitter ? 'unstated' : '')) !== st.from) return false;
        if (st.status && statusGroup(x) !== st.status) return false;
        if (words.length) { const h = d.hay[x.key]; if (!words.every((w) => (/^\d+$/.test(w) ? h.includes(' ' + w + ' ') : h.includes(w)))) return false; }
        return true;
      };
      let L = ITEMS.filter(ok);
      // a number typed in the search ("38", "pai 38", "2025-7") puts that proposal first, and it is never folded away
      const m = /(?:^|\s|#)(\d{4}-\d{1,3}|\d{1,3})(?:\s|$)/.exec(String(st.q).trim().replace(/^(?:pai|item)\s+/i, ''));
      const hit = m && byKey[m[1]];
      // copies fold into their original when it is in the list too and in the same status section (a superseded copy of a
      // forwarded original stays with the withdrawn ones, as in GSO's grid); all: every match, before the folding
      const inL = new Set(L.map((x) => x.key));
      const folded = (x) => x !== hit && x.same_as && inL.has(x.same_as) && statusGroup(x) === statusGroup(byKey[x.same_as]);
      const all = L.slice();
      const hidden = st.copies ? 0 : L.filter(folded).length;
      if (!st.copies) L = L.filter((x) => !folded(x));
      if (st.sort === 'num') L.sort((a, b) => (isCur(b) - isCur(a)) || a.n - b.n);
      else if (st.sort === 'new') L.sort((a, b) => String(b.received || '').localeCompare(String(a.received || '')) || b.n - a.n);
      else L.sort((a, b) => idx[a.key] - idx[b.key]);
      if (hit && L.includes(hit)) L = [hit].concat(L.filter((x) => x !== hit));
      return { L, hidden, all };
    }
    // grid order follows the latest grid's own status sections (forwarded, under consideration, took no action, withdrawn,
    // then the 2025 items deferred to this Conference); each row names its reviewing body in its meta line
    const SECTION = { fwd: `Forwarded to the ${nth(ORD)} Conference`, under: 'Under consideration', no: 'Took no action', out: 'Withdrawn, superseded or removed', deferred: 'Deferred from 2025 (Plain Language Big Book)' };
    const groupKey = (x) => statusGroup(x);
    const groupTitle = (x) => SECTION[statusGroup(x)];
    function draw(announce) {
      const { L, hidden, all } = list();
      const shown = L.slice(0, st.limit);
      let html = '';
      if (st.sort === 'grid') {
        // grouped by key, not by adjacent runs: a pinned search hit leads its own group instead of opening a duplicate one.
        // The count is the section's proposals, as the stat tiles count them, with the folded copies named when there are any.
        const gm = new Map(); shown.forEach((x) => { const k = groupKey(x); if (!gm.has(k)) gm.set(k, { k, x, list: [] }); gm.get(k).list.push(x); });
        const gCount = (k) => {
          const n = all.filter((y) => groupKey(y) === k).length, rows = L.filter((y) => groupKey(y) === k).length;
          return `${num(n)}${n > rows ? ` (${num(rows)} listed, ${plural(n - rows, 'exact copy', 'exact copies')} folded)` : ''}`;
        };
        html = [...gm.values()].map((g) => `<div class="pai-group"><h3 class="pai-gh">${esc(groupTitle(g.x))} <span class="small muted">${gCount(g.k)}</span></h3><ul class="pai-list">${g.list.map((x) => rowHTML(x, st)).join('')}</ul></div>`).join('');
      } else {
        // no visible group headings here: a hidden h3 keeps the outline h2 → h3 → h4 (the count line says how many)
        html = shown.length ? `<h3 class="pai-sr">${st.sort === 'num' ? 'Proposals by number' : 'Proposals by date received, latest first'}</h3><ul class="pai-list">${shown.map((x) => rowHTML(x, st)).join('')}</ul>` : '';
      }
      const th = st.theme ? themeBy[st.theme] : null;
      // the status and body filters are named too (a deep link sets them with the controls out of view)
      const named = [st.status ? GROUP[st.status] : '', st.body ? (st.body === '-' ? 'no reviewing body' : bodyName(st.body)) : ''].filter(Boolean);
      const countTxt = `<strong>${plural(L.length, 'proposal')}</strong>${named.map((s) => ` · ${esc(s)}`).join('')}${hidden ? ` · ${plural(hidden, 'exact copy', 'exact copies')} folded into ${hidden === 1 ? 'its original' : 'their originals'}` : ''}${th ? ` · ${esc(th.name)} · <a href="${themeHref(th.id)}">about this theme →</a>` : ''}`;
      res.innerHTML = `<p class="small pai-count">${countTxt}</p>${html || UI.empty('No proposal matches. Clear a filter or try fewer words.')}
        ${L.length > shown.length ? `<p><button type="button" class="btn" id="pai-more">Show ${Math.min(60, L.length - shown.length)} more (${L.length - shown.length} left)</button></p>
        <p class="small muted pai-printnote">Printed: the first ${shown.length} of ${L.length} matching proposals. Narrow the filters, or press “Show more” before printing, to include the rest.</p>` : ''}`;
      if (announce && live) live.textContent = `${plural(L.length, 'proposal')}${named.map((s) => ' · ' + s).join('')}${th ? ' · ' + th.name : ''}`;
      const more = res.querySelector('#pai-more');
      // keep keyboard focus: move it to the first newly shown row
      // (by key, not by DOM position: the grouped list can place a newly shown row above older ones)
      if (more) more.addEventListener('click', () => { const n = st.limit; st.limit += 60; const nx = draw()[n]; const first = nx && document.getElementById('pai-' + nx.key); if (first) { first.setAttribute('tabindex', '-1'); first.focus(); } });
      return L;
    }
    const sync = () => { sel('#pai-f-theme').value = st.theme; sel('#pai-f-body').value = st.body; sel('#pai-f-asks').value = st.asks; sel('#pai-f-from').value = st.from; sel('#pai-f-status').value = st.status; sel('#pai-copies').checked = st.copies; sel('#pai-sort').value = st.sort; };
    const bind = (id, k, ev) => sel(id).addEventListener(ev || 'change', (e) => { st[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; st.limit = 60; draw(true); });
    bind('#pai-f-theme', 'theme'); bind('#pai-f-body', 'body'); bind('#pai-f-asks', 'asks'); bind('#pai-f-from', 'from'); bind('#pai-f-status', 'status'); bind('#pai-copies', 'copies'); bind('#pai-sort', 'sort');
    let qT = null;
    sel('#pai-q').addEventListener('input', (e) => { clearTimeout(qT); qT = setTimeout(() => { st.q = e.target.value; st.limit = 60; draw(true); }, 150); });
    sel('#pai-reset').addEventListener('click', () => { Object.assign(st, { theme: '', body: '', asks: '', from: '', status: '', q: '', copies: false, sort: 'grid', limit: 60 }); sel('#pai-q').value = ''; sync(); draw(true); });
    /** Filter the list (from a chart bar, a chip or a theme card), scroll to it and put focus on the filter that changed. */
    const filterTo = (k, v) => {
      Object.assign(st, { theme: '', body: '', asks: '', from: '', status: '', q: '', limit: 60 }); st[k] = v; sel('#pai-q').value = ''; sync(); draw(true);
      const b = sel('#pai-browse'); b.scrollIntoView({ block: 'start' });
      const f = sel(k === 'asks' ? '#pai-f-asks' : '#pai-f-theme'); if (f) f.focus({ preventScroll: true });
    };
    el.querySelector('.pai-page').addEventListener('click', (e) => {
      // A link to the deep link already showing fires no hashchange, so the router would not re-run: re-run the view in
      // place with the same arguments (filters reset, the item or theme opened, scrolled to and focused again).
      const self = e.target.closest('a[href^="#/agenda/"]');
      if (self && self.getAttribute('href') === location.hash && !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) {
        e.preventDefault();
        if (UI.hideTip) UI.hideTip();
        V.agenda(el, location.hash.replace(/^#\/?/, '').split('/').slice(1));
        return;
      }
      const tb = e.target.closest('[data-theme-bar], [data-show-theme], [data-ftheme], [data-fasks]');
      if (tb) { if (tb.dataset.fasks) filterTo('asks', tb.dataset.fasks); else filterTo('theme', tb.dataset.themeBar || tb.dataset.showTheme || tb.dataset.ftheme); return; }
      const j = e.target.closest('[data-jump]');
      if (j) { const tg = el.querySelector('#' + j.dataset.jump); if (tg) { tg.scrollIntoView({ block: 'start' }); if (!tg.hasAttribute('tabindex')) tg.setAttribute('tabindex', '-1'); tg.focus({ preventScroll: true }); } }
    });

    // ---------- deep links ----------
    let target = null;
    if (hitItem) {
      const { L } = list();
      const i = L.indexOf(hitItem);
      if (i >= 0) st.limit = Math.max(60, Math.ceil((i + 1) / 60) * 60);
    }
    draw();
    if (hitItem) {
      target = res.querySelector('#pai-' + CSS.escape(hitItem.key));
      if (target) { target.classList.add('pai-hit'); const m = target.querySelector('details.pai-more'); if (m) m.open = true; }
    } else if (hitTheme) {
      target = el.querySelector('#pai-th-' + CSS.escape(hitTheme.id));
      if (target) target.open = true;
    } else if (hitTopic) {
      target = el.querySelector('#pai-tp-' + CSS.escape(hitTopic.id));
      if (target) target.classList.add('pai-hit');
    } else if (hitStatus || hitBody) target = el.querySelector('#pai-browse');
    else if (a0 === 'forwarded') target = el.querySelector('#pai-fwd');
    else if (a0 === 'trends' || a0 === 'last' || a0 === 'process') target = el.querySelector('#pai-' + a0);
    // A theme's <details> would take its whole open explainer as its name: focus its summary instead (which is focusable
    // already: a tabindex there would take it out of the Tab order).
    if (target) requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'start' });
      const fx = target.tagName === 'DETAILS' ? (target.querySelector('summary') || target) : target;
      if (fx.tagName !== 'SUMMARY' && !fx.hasAttribute('tabindex')) fx.setAttribute('tabindex', '-1');
      fx.focus({ preventScroll: true });
    });
  };
})();
