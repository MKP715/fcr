/* Proposed Agenda Items page (#/agenda[/item/<key> | /theme/<id> | /trends | /last | /process]).
   Data: data/src/pai.json → FCR.RAW.pai — GSO's status grid of the proposed agenda items (PAIs) for the next Conference, in
   this app's own words: {source, snapshots, previous, bodies, families, themes:[{id, family, name, scope, lede, background,
   now, asked, raised, considerations, questions, watch, learn, aa}], asks, items:[{key ('38' | '2025-7'), n, cycle, received,
   body, group, page, status, outcome?, superseded_by?, same_as?, cluster?, title, summary, asks, themes, targets, submitter,
   responds_to, related_aa, learn, conf_committee, conf_reason, note?, differs?}], clusters, observations, last (the cycle
   before: outcomes per body and theme), history (counts per year, process steps, facts)}. Checked by build_data.py check_pai.
   The grid goes to Conference members only and prints every motion as submitted: the repo keeps no submitted wording and no
   group names, so rows show the summaries, the submitter kind and named districts/areas only (`quote` is never shown).
   Page: where things stand (a stepper from FCR.calendar, honours ?today=), stat tiles, what stands out, trends (charts in
   plain HTML/CSS: each mark focusable with a text data-tip, each chart with a "Show as table" twin), themes explained, all
   proposals (filters, search, copies folded into their original, incremental "Show more"), last cycle, how a proposal
   travels, source. Deep links: item/<key> resets the filters, opens and highlights the row; theme/<id> filters the list and
   opens that theme's explainer; trends | last | process scroll to their section; an unknown key or id is a plain page.
   Styles: assets/css/pai.css (class prefix pai-). */
(function () {
  'use strict';
  const FCR = window.FCR;
  const esc = FCR.esc;
  const V = FCR.views, UI = FCR.ui;
  const P = (FCR.RAW && FCR.RAW.pai) || {};
  const SRC = P.source || {};
  const ITEMS = P.items || [], THEMES = P.themes || [], FAMS = P.families || [], BODIES = P.bodies || {}, ASKS = P.asks || {};
  const CLUSTERS = P.clusters || [], OBS = P.observations || [], LAST = P.last || {}, HIST = P.history || {};
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

  const STATUS = { under: 'Under consideration', withdrawn: 'Withdrawn', superseded: 'Superseded', removed: 'Removed', deferred: 'Deferred from 2025' };
  const statusGroup = (x) => (x.status === 'under' ? 'under' : x.status === 'deferred' ? 'deferred' : 'out');
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
  const label = (x) => '#' + x.key;
  const titleOf = (x) => x.title || (x.status === 'removed' ? 'Entry removed (no text in the grid)' : 'Untitled entry');
  const itemHref = (k) => `#/agenda/item/${encodeURIComponent(k)}`;
  const itemLink = (k, cls) => { const x = byKey[k]; return x ? `<a class="${cls || 'pai-num'}" href="${itemHref(k)}" data-tip="${esc(`${label(x)}: ${titleOf(x)}`)}">${esc(label(x))}</a>` : esc('#' + k); };
  const themeHref = (id) => `#/agenda/theme/${encodeURIComponent(id)}`;
  const learnTitle = (id) => { const n = FCR.learnTree && FCR.learnTree.node(id); return n ? n.title : null; };
  const learnChips = (ids) => (ids || []).filter(learnTitle).map((id) => `<a class="chip" href="#/learn/${esc(id)}">${esc(learnTitle(id))}</a>`).join(' ');
  /** "2021 · Literature — summary" with the year and section linking to the action on the Advisory Actions page. */
  const aaLine = (id) => { const a = aaBy[id]; return a ? `<li><a href="#/actions/item/${encodeURIComponent(id)}">${a.year} · ${esc(secName(a.sec) || 'Advisory Action')}</a> — ${esc(a.text)}${stopAfter(a.text)}</li>` : ''; };
  const aaList = (ids, cls) => { const li = (ids || []).map(aaLine).filter(Boolean); return li.length ? `<ul class="pai-aa ${cls || ''}">${li.join('')}</ul>` : ''; };
  // Conference committees page for the coming Conference (the committees page projects the year after the last report)
  const cYear = () => (FCR.years.includes(CY) || CY === FCR.latestYear + 1 ? CY : FCR.latestYear);

  // Phrases in the observations that name a theme (the first mention in each one links to its explainer)
  const THEME_PHRASES = [
    [/Charter protection/, 'charter'], [/Fellowship review before (?:Big Book )?changes?/, 'review'], [/keeping the text as it is/, 'preserve'],
    [/founders' writings/, 'founders'], [/specific wording/, 'wording'], [/the 2026 “Eskimo” change/, 'eskimo'],
    [/Plain Language Big Book/, 'plbb'], [/Preamble items/, 'preamble'], [/floor actions and late committee recommendations/, 'floor'],
    [/Reserve Fund/, 'finance'],
  ];
  function themeLinks(s, used) {
    let best = null;
    THEME_PHRASES.forEach(([re, id]) => { if (used.has(id) || !themeBy[id]) return; const m = re.exec(s); if (m && (!best || m.index < best.m.index)) best = { m, id }; });
    if (!best) return esc(s);
    used.add(best.id);
    return esc(s.slice(0, best.m.index)) + `<a href="${themeHref(best.id)}">${esc(best.m[0])}</a>` + themeLinks(s.slice(best.m.index + best.m[0].length), used);
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
      D.hay[x.key] = ' ' + fold([x.title, x.summary, (x.targets || []).join(' '), (x.themes || []).map((t) => (themeBy[t] || {}).name).join(' '),
        'pai item', x.key, x.n, label(x), bodyName(x.body), STATUS[x.status], x.asks, x.outcome, x.differs].join(' ')) + ' ';
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
      case 'prelim': return `The trustees’ committees met at the fall board weekend${q4 ? ` (${when(q4)})` : ''}. The preliminary agenda and an updated status grid ${isNow ? 'are due about now' : 'are expected'} (${when(s)}); until the new grid is in this app, the page shows the status of ${asOf}.`;
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
      return `<div class="pai-grow"><span class="pai-hlab">${lab}</span><span class="pai-pair">
        ${barTrack(now, max, 'a', `${name}: ${plural(now, 'proposal')} for the ${nth(ORD)} Conference`, now)}
        ${barTrack(L.total, max, 'c', `${name}: ${plural(L.total, 'proposal')} for the ${nth(ORD - 1)} Conference${L.total ? `, ${L.forwarded} forwarded to it` : ''}`, `${L.total}${L.total ? ` · ${L.forwarded ? L.forwarded + ' forwarded' : 'none forwarded'}` : ''}`)}</span></div>`;
    };
    const wd = CUR.filter((x) => !x.body).length, lwd = (lastBy.WD || {}).total || 0;
    const tbl = [];
    groups.forEach(([g, ks]) => ks.forEach((k) => { const L = lastBy[k] || { total: 0, forwarded: 0 }; tbl.push([esc(bodyName(k)), d.byBody[k] || 0, L.total, L.forwarded]); }));
    return `<section class="card pai-chart" aria-labelledby="pai-c3"><h3 id="pai-c3">Where they went</h3>
      <p class="small ink2">The trustees’ committee or board that reviews each proposal, this cycle and last. The figure after last year’s bar is how many of them it forwarded to the Conference.</p>
      ${legend([['a', `${nth(ORD)} Conference (this cycle)`], ['c', `${nth(ORD - 1)} Conference (last cycle)`]])}
      <div class="pai-hbars pai-gbars">${groups.map(([g, ks]) => `<div class="pai-fam"><h4 class="pai-famh">${esc(g)}</h4>${ks.map(row).join('')}</div>`).join('')}</div>
      <p class="small muted">Not shown: ${plural(wd, 'item')} withdrawn, superseded or removed this cycle (${lwd} last cycle)${derive().deferred.length ? ` and the ${derive().deferred.length} deferred Plain Language Big Book items` : ''}.</p>
      ${twin('Proposals by reviewing body', ['Reviewing body', `${nth(ORD)} (this cycle)`, `${nth(ORD - 1)} (last cycle)`, 'Forwarded last cycle'], tbl, [1, 2, 3])}</section>`;
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
      const tip = has ? `${c.year} (${nth(c.ordinal)} Conference): ${num(c.received)} proposals received${c.forwarded != null ? `, ${c.forwarded} forwarded` : ''}` : `${c.year} (${nth(c.ordinal)} Conference): no total in its Final Report`;
      return `<span class="pai-slot${has ? '' : ' gap'}"${has ? ` tabindex="0" role="img" aria-label="${esc(tip)}"` : ''} data-tip="${esc(tip)}">${has ? `<span class="pai-col${cur ? '' : ' ctx'}" style="--h:${frac(c.received, tk.top)}"></span><span class="pai-cap" style="--h:${frac(c.received, tk.top)}">${c.received}</span>` : '<span class="pai-gaplab">no total found</span>'}</span>`;
    }).join('');
    const xl = cs.map((c) => `<span class="pai-yl${c.year === CY ? ' cur' : ''}"><span class="pai-long">${c.year}</span><span class="pai-short">’${String(c.year).slice(2)}</span></span>`).join('');
    return `<section class="card pai-chart" aria-labelledby="pai-c7"><h3 id="pai-c7">Proposals received per Conference</h3>
      <p class="small ink2">Totals where a Final Report or a status grid gives one; for the other years the Final Report gives no total (their grids are not in this app).</p>
      ${legend([['a', `${CY} (this cycle)`], ['c', 'earlier Conferences']])}
      <div class="pai-cols pai-ycols" style="--n:${cs.length}"><div class="pai-plot"><div class="pai-bars">${cols}</div></div><div class="pai-yaxis" aria-hidden="true">${xl}</div></div>
      ${twin('Proposals received per Conference', ['Year', 'Conference', 'Received', 'Forwarded', 'Source'], cs.map((c) => [c.year, esc(nth(c.ordinal)), c.received == null ? '<span class="muted">no total in the Final Report</span>' : num(c.received), c.forwarded == null ? '<span class="muted">—</span>' : c.forwarded, `<span class="small">${esc(c.cite || '')}</span>`]), [2, 3])}</section>`;
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
    return `<details class="card pai-theme" id="pai-th-${esc(t.id)}"><summary><span class="pai-th-name">${esc(t.name)}</span> <span class="small muted pai-th-n">${plural(c.total, 'proposal')}${def ? ` + ${def} deferred from 2025` : ''}${more > 0 ? `, ${more} more touch it` : ''}</span></summary>
      <div class="pai-th-body"><h4 class="pai-sr">${esc(t.name)}</h4>
      ${t.lede ? `<p class="pai-lede">${linkify(t.lede)}</p>` : ''}
      ${t.scope ? `<p class="small muted">Covers: ${esc(t.scope)}</p>` : ''}
      ${sec('Background', (t.background || []).length ? `<ul class="pai-bg">${t.background.map((b) => `<li>${esc(b.text)}${stopAfter(b.text)} ${b.cite ? `<span class="small muted">(${esc(b.cite)})</span>` : ''}${aaList(b.aa, 'small')}</li>`).join('')}</ul>` : '')}
      ${moreAA.length ? sec('Other related Advisory Actions', aaList(moreAA, 'small')) : ''}
      ${sec('Where things stand now', t.now ? `<p>${esc(t.now)}${t.now_cite ? ` <span class="small muted">(${esc(t.now_cite)})</span>` : ''}</p>` : '')}
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
  function rowHTML(x, st) {
    const copies = copiesOf[x.key] || [];
    const recv = x.received ? `received ${esc(fmtD(x.received))}` : '';
    const stat = x.status === 'under' ? `<span class="ink2">${STATUS.under}</span>`
      : `<span class="badge pai-st pai-st-${esc(x.status)}">${esc(STATUS[x.status] || x.status)}</span>${x.superseded_by ? ` by ${itemLink(x.superseded_by)}` : ''}`;
    const meta = [`<a class="pai-num" href="${itemHref(x.key)}">${esc(label(x))}</a>`, x.cycle !== ORD ? `<span>${esc(nth(x.cycle))} cycle (${x.cycle + 1950} Conference), item ${x.n}</span>` : '', recv,
      x.body ? `<span>${esc(bodyName(x.body))}</span>` : '', stat].filter(Boolean).join(' · ');
    const themes = (x.themes || []).filter((t) => themeBy[t]).map((t, i) => `<button type="button" class="chip pai-fchip${i === 0 ? ' main' : ''}" data-ftheme="${esc(t)}" data-tip="${esc(`${i === 0 ? 'Main theme' : 'Also'}: ${themeBy[t].name}. Select to list every proposal on it.`)}">${esc(themeBy[t].name)}</button>`).join('');
    const ask = x.asks ? `<button type="button" class="chip pai-fchip pai-ask" data-fasks="${esc(x.asks)}" data-tip="${esc(`Asks to ${ASKS[x.asks] || x.asks}. Select to list every proposal of this kind.`)}">asks: ${esc((ASK_LABEL[x.asks] || x.asks).toLowerCase())}</button>` : '';
    const cc = x.conf_committee && FCR.COMMITTEES[x.conf_committee];
    const guess = cc && x.status !== 'removed' && x.status !== 'withdrawn' && x.status !== 'superseded'
      ? `<div class="pai-guess small"><span class="pai-gtag" data-tip="This app’s guess from the Service Manual’s committee scopes, not GSO’s or the trustees’ decision">our guess</span> If it reaches the agenda, likely the <a href="#/committees/${cYear()}/${esc(x.conf_committee)}">Conference Committee on ${esc(cc.name)}</a>${x.conf_reason ? `: ${esc(x.conf_reason)}` : '.'}</div>` : '';
    const others = x.same_as ? (copiesOf[x.same_as] || []).filter((k) => k !== x.key) : [];
    const same = x.same_as ? `<div class="pai-same small">Same wording as ${itemLink(x.same_as)}${x.near ? ', apart from a word or a typo,' : ''}${others.length ? ` and ${plural(others.length, 'other item')}` : ''}.</div>`
      : copies.length ? `<div class="pai-same small">${st.copies ? `${plural(copies.length, 'more item', 'more items')} with the same wording:` : `+${copies.length} more with the same wording:`} ${copies.map((k) => itemLink(k)).join(' ')}</div>` : '';
    const resp = (x.responds_to || []).length ? `<h5>Responds to</h5><ul class="pai-resp">${x.responds_to.map((r) => `<li><strong>${esc(r.year)}</strong> · ${esc(r.what)}${(r.aa || []).filter((id) => aaBy[id]).length ? ` — ${r.aa.filter((id) => aaBy[id]).map((id) => `<a href="#/actions/item/${encodeURIComponent(id)}" data-tip="${esc(`${aaBy[id].year}: ${aaBy[id].text}`)}">${aaBy[id].year} action</a>`).join(', ')}` : ''}</li>`).join('')}</ul>` : '';
    const rel = (x.related_aa || []).filter((id) => aaBy[id]);
    const more = [
      x.differs ? `<h5>How it differs</h5><p>${linkify(x.differs)}</p>` : '',
      x.note ? `<h5>Background</h5><p>${linkify(x.note)}</p>` : '',
      resp,
      rel.length ? `<h5>Related Advisory Actions</h5>${aaList(rel)}` : '',
      (x.learn || []).some(learnTitle) ? `<div class="flex pai-learn"><span class="small muted">Learn:</span>${learnChips(x.learn)}</div>` : '',
      `<p class="pai-src small muted">Source: GSO status grid of ${esc(fmtD(SRC.as_of))}, p. ${esc(x.page)}${SRC.drive_name ? ` (your Drive copy: ${esc(SRC.drive_name)})` : ''}. Summary in this app’s own words.</p>`,
    ].filter(Boolean).join('');
    const nMore = [x.differs, x.note, (x.responds_to || []).length, rel.length].filter(Boolean).length;
    const moreLab = [x.differs ? 'how it differs' : '', x.note ? 'background' : '', rel.length ? plural(rel.length, 'related action') : ''].filter(Boolean);
    return `<li class="pai-row${x.status !== 'under' ? ' pai-off' : ''}" id="pai-${esc(x.key)}">
      <div class="pai-meta small">${meta}</div>
      <h4 class="pai-title">${esc(titleOf(x))}</h4>
      ${x.summary ? `<p class="pai-sum">${esc(x.summary)}</p>` : x.outcome ? `<p class="pai-sum ink2">${esc(x.outcome)}${stopAfter(x.outcome)}</p>` : ''}
      ${x.summary && x.outcome && x.status !== 'under' ? `<p class="small ink2 pai-outc">Grid: ${esc(x.outcome)}${stopAfter(x.outcome)}</p>` : ''}
      ${themes || ask ? `<div class="pai-chips">${themes}${ask}</div>` : ''}
      ${fromHTML(x.submitter)}${same}${guess}
      ${x.summary ? `<details class="pai-more"><summary>${nMore ? esc(ucfirst(moreLab.join(', ') || 'more')) : 'Source'}</summary>${more}</details>` : `<p class="pai-src small muted">Source: GSO status grid of ${esc(fmtD(SRC.as_of))}, p. ${esc(x.page)}.</p>`}
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
      <div class="table-wrap pai-fw-wrap"><table class="t compact pai-fw"><caption class="pai-sr">Proposals forwarded to the ${esc(nth(ORD - 1))} Conference and what happened</caption>
        <thead><tr><th class="n">Item</th><th>Proposal</th><th>Heard by</th><th>What happened</th></tr></thead>
        <tbody>${fw.map((f) => `<tr><td class="n" data-l="Item">${esc(f.n)}</td><td data-l="Proposal">${esc(f.title)}</td><td data-l="Heard by">${f.conf_committee ? esc(FCR.cname(f.conf_committee)) : '—'}</td>
          <td data-l="What happened">${esc(f.outcome)}${stopAfter(f.outcome)}${(f.aa || []).filter((id) => aaBy[id]).length ? ` ${f.aa.filter((id) => aaBy[id]).map((id) => `<a href="#/actions/item/${encodeURIComponent(id)}">${aaBy[id].year} Advisory Action →</a>`).join(' ')}` : ''}${f.cite ? `<div class="small muted">${esc(f.cite)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>
      <h3 class="pai-h3">Themes, this cycle and last</h3>
      <p class="small ink2">Proposals by main theme. Last cycle’s numbers are counted from the February ${CY - 1} grid.</p>
      <div class="table-wrap"><table class="t compact pai-tc"><thead><tr><th>Theme</th><th class="n">${esc(nth(ORD))}</th><th class="n">${esc(nth(ORD - 1))}</th><th class="n">Forwarded</th><th>Last cycle’s items</th></tr></thead>
        <tbody>${tc.filter((r) => themeBy[r.theme]).map((r) => `<tr><td><a href="${themeHref(r.theme)}">${esc(themeBy[r.theme].name)}</a></td><td class="n">${(d.prim[r.theme] || {}).total || 0}</td><td class="n">${r.total}</td><td class="n">${r.forwarded}</td><td class="small muted">${(r.examples || []).length ? 'e.g. ' + r.examples.map((n) => esc(n)).join(', ') : ''}</td></tr>`).join('')}</tbody></table></div>
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
    const hitItem = a0 === 'item' && byKey[a1] ? byKey[a1] : null;
    const hitTheme = a0 === 'theme' && themeBy[a1] ? themeBy[a1] : null;
    if (hitItem && hitItem.same_as) st.copies = true;
    if (hitTheme) st.theme = hitTheme.id;
    const unknown = (a0 === 'item' && a1 && !hitItem) ? `No proposal “${a1}” is in this grid.` : (a0 === 'theme' && a1 && !hitTheme) ? `No theme “${a1}” on this page.` : '';

    const S = steps();
    const conf = FCR.conference ? FCR.conference(CY) : null;
    const confDates = conf && conf.startDate ? UI.fmtRange(conf.startDate, conf.endDate, 'long') : '';
    const ratio = LAST.total ? SRC.total / LAST.total : 0;
    const ratioTxt = ratio ? (Math.abs(ratio - Math.round(ratio)) < 0.05 ? Math.round(ratio) : ratio.toFixed(1)) + '×' : '';
    const prev = t < SRC.as_of ? `<p class="small pai-asof">You are viewing the app as of ${esc(fmtD(t))}. This page shows GSO’s grid of ${esc(fmtD(SRC.as_of))}, so it includes proposals that arrived after that day.</p>` : '';
    const out = d.out;
    const nearN = CUR.filter((x) => x.same_as && x.near).length;
    // after the fall board weekend the Oct 1 statuses are out of date until a newer grid is loaded
    const q4 = S.find((s) => s.id === 'q4'), confS = S.find((s) => s.id === 'conf');
    const stale = q4 && t > q4.end && !(confS && t > confS.end) ? `<p class="small pai-asof">The statuses on this page are those of GSO’s grid of ${esc(fmtD(SRC.as_of))}. The trustees’ committees have met since then; the next status grid and the preliminary agenda show which proposals went forward.</p>` : '';

    // controls: options with counts
    const opt = (v, txt, sel) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(txt)}</option>`;
    const themeOpts = () => `${opt('', 'All themes', st.theme)}${FAMS.map((f) => `<optgroup label="${esc(f.name)}">${themesOfFam(f.id).map((th) => opt(th.id, `${th.name} (${d.any[th.id]})`, st.theme)).join('')}</optgroup>`).join('')}`;
    const bodyCount = {}; ITEMS.forEach((x) => { const k = x.body || '-'; bodyCount[k] = (bodyCount[k] || 0) + 1; });
    const bodyOpts = () => `${opt('', 'Any reviewing body', st.body)}${Object.keys(BODIES).sort((a, b) => (bodyCount[b] || 0) - (bodyCount[a] || 0)).map((k) => opt(k, `${bodyName(k)} (${bodyCount[k] || 0})`, st.body)).join('')}${bodyCount['-'] ? opt('-', `None: withdrawn, removed or deferred (${bodyCount['-']})`, st.body) : ''}`;
    const askCount = {}; ITEMS.forEach((x) => { if (x.asks) askCount[x.asks] = (askCount[x.asks] || 0) + 1; });
    const askOpts = () => `${opt('', 'Any request', st.asks)}${Object.keys(ASKS).filter((k) => askCount[k]).map((k) => opt(k, `${ASK_LABEL[k] || k}: ${ASKS[k]} (${askCount[k]})`, st.asks)).join('')}`;
    const kindCount = {}; ITEMS.forEach((x) => { if (x.submitter) { const k = x.submitter.kind || 'unstated'; kindCount[k] = (kindCount[k] || 0) + 1; } });
    const kindOpts = () => `${opt('', 'Anyone', st.from)}${Object.keys(KIND).filter((k) => kindCount[k]).map((k) => opt(k, `${KIND[k]} (${kindCount[k]})`, st.from)).join('')}`;
    const stCount = { under: 0, out: 0, deferred: 0 }; ITEMS.forEach((x) => stCount[statusGroup(x)]++);
    const statOpts = () => `${opt('', 'Any status', st.status)}${opt('under', `Under consideration (${stCount.under})`, st.status)}${opt('out', `Withdrawn, superseded or removed (${stCount.out})`, st.status)}${stCount.deferred ? opt('deferred', `Deferred from 2025 (${stCount.deferred})`, st.status) : ''}`;

    el.innerHTML = `<div class="pai-page">
      <div class="page-head"><div><h1>Proposed Agenda Items</h1>
        <p>Anyone in A.A. (a member, a group, a district or an area) may propose an item for the General Service Conference’s agenda. Proposals that arrive by ${esc(UI.fmtDate(d.deadline, 'long').replace(/,? \d{4}$/, ''))} go to the next April’s Conference, and later ones to the one after (proposals are welcome all year). The trustees’ committees and boards then decide which go to the Conference. This page explains the ${num(SRC.total)} proposals for the ${esc(nth(ORD))} Conference${confDates ? ` (${esc(confDates)})` : ''} in GSO’s status grid as of ${esc(UI.fmtDate(SRC.as_of, 'long'))}, in plain words. <a href="#/learn/agenda_path">How an idea becomes an agenda item →</a></p></div></div>
      ${unknown ? `<p class="callout">${esc(unknown)} Here is the whole page.</p>` : ''}
      <nav class="flex rp-jump" aria-label="On this page"><span class="small muted">On this page:</span>${[['pai-now', 'Where things stand'], ['pai-trends', 'Trends'], ['pai-themes', 'Themes'], ['pai-browse', 'All proposals'], ['pai-last', 'Last year'], ['pai-process', 'How it works']].filter(([id]) => id !== 'pai-last' || LAST.total).map(([id, txt]) => `<button type="button" class="chip" data-jump="${id}">${txt}</button>`).join('')}</nav>

      <section class="card pai-now" id="pai-now" tabindex="-1" aria-labelledby="pai-now-h"><h2 id="pai-now-h">Where things stand</h2>
        ${S.length ? stepperHTML(S, t) : ''}
        <p class="pai-today"><strong>Today${FCR.asOfOverride ? ` (${esc(fmtD(t))})` : ''}:</strong> ${esc(todayLine(S, t))}</p>
        ${prev}${stale}
        <p class="small muted">Dates from the <a href="#/calendar">Calendar</a>; select a step for its details. Area 65 steps are this app’s home area.</p>
      </section>

      <div class="grid g4 pai-kpis">
        <div class="card stat"><span class="v">${num(SRC.total)}</span><span class="l">proposals for the ${esc(nth(ORD))} Conference${ratioTxt ? `, ${ratioTxt} last year’s ${num(LAST.total)}` : ''}${d.deferred.length ? `; plus ${d.deferred.length} deferred from 2025` : ''}</span></div>
        <div class="card stat"><span class="v">${num(CUR.length - d.copies)}</span><span class="l">distinct wordings; ${plural(d.copies, 'item repeats', 'items repeat')} another${nearN ? ` (${d.copies - nearN} word for word, ${nearN} apart from a word or a typo)` : ' word for word'}</span></div>
        <div class="card stat"><span class="v">${num(d.under)}</span><span class="l">under consideration in the ${esc(fmtD(SRC.as_of))} grid; ${out} withdrawn, superseded or removed</span></div>
        <div class="card stat"><span class="v">${pct(d.last14, d.dated)}%</span><span class="l">arrived in the last 14 days before the ${esc(UI.fmtDate(d.deadline, 'day'))} deadline (${d.last14} of ${d.dated})</span></div>
        ${LAST.total ? `<div class="card stat"><span class="v">${LAST.forwarded} of ${LAST.total}</span><span class="l">reached the agenda last cycle (${pct(LAST.forwarded, LAST.total)}%), the ${esc(nth(ORD - 1))} Conference</span></div>` : ''}
      </div>

      ${OBS.length ? `<section class="pai-sec" aria-labelledby="pai-obs-h"><h2 class="section-title" id="pai-obs-h">What stands out</h2>${obsHTML()}</section>` : ''}

      <section id="pai-trends" class="pai-sec" tabindex="-1" aria-labelledby="pai-trends-h"><h2 class="section-title" id="pai-trends-h">Trends</h2>
        <div class="pai-trends">${themeChart()}${weeksChart()}${bodiesChart()}${asksChart()}${whoChart()}${clustersCard()}</div>
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
          <label class="pai-lab">Sort <select id="pai-sort">${opt('grid', 'Grid order (GSO’s grouping)', st.sort)}${opt('num', 'Number', st.sort)}${opt('new', 'Date received, latest first', st.sort)}</select></label>
          <button type="button" class="btn" id="pai-reset">Clear filters</button>
        </div>
        <p class="small muted pai-gnote">“Our guess” in a row is this app’s guess, from the Service Manual’s committee scopes, of the Conference committee that would hear the item. It is not GSO’s or the trustees’ decision.</p>
        <p id="pai-live" class="pai-live" role="status" aria-live="polite"></p>
        <div id="pai-results"></div>
      </section>

      ${lastHTML()}
      ${processHTML()}

      <p class="small muted pai-srcline">Source: GSO, “${esc(SRC.title || '')}”, as of ${esc(UI.fmtDate(SRC.as_of, 'long'))} (sent to Conference members; your copy is in the ${FCR.RAW.drive && FCR.RAW.drive.data_folder ? `<a href="${esc(FCR.RAW.drive.data_folder)}" target="_blank" rel="noopener">Drive data folder ↗</a>` : 'Drive data folder'}, file ${esc(SRC.drive_name || '')}${P.previous && P.previous.drive_name ? `; last cycle’s: ${esc(P.previous.drive_name)}` : ''}). Motions are printed there exactly as submitted; the summaries here are this app’s own.</p>
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
      // copies fold into their original when it is in the list too
      const inL = new Set(L.map((x) => x.key));
      const folded = (x) => x !== hit && x.same_as && inL.has(x.same_as);
      const hidden = st.copies ? 0 : L.filter(folded).length;
      if (!st.copies) L = L.filter((x) => !folded(x));
      if (st.sort === 'num') L.sort((a, b) => (isCur(b) - isCur(a)) || a.n - b.n);
      else if (st.sort === 'new') L.sort((a, b) => String(b.received || '').localeCompare(String(a.received || '')) || b.n - a.n);
      else L.sort((a, b) => idx[a.key] - idx[b.key]);
      if (hit && L.includes(hit)) L = [hit].concat(L.filter((x) => x !== hit));
      return { L, hidden };
    }
    const groupKey = (x) => (x.status === 'deferred' ? 'deferred' : !x.body ? 'out' : x.body + (x.group != null ? '|' + x.group : ''));
    const groupTitle = (x) => {
      if (x.status === 'deferred') return 'Deferred from 2025 (Plain Language Big Book)';
      if (!x.body) return 'Withdrawn, superseded or removed';
      const gs = new Set(ITEMS.filter((y) => y.body === x.body && y.group != null).map((y) => y.group));
      return bodyName(x.body) + (x.group != null && gs.size > 1 ? ` · GSO’s group ${x.group + 1} of ${gs.size}` : '');
    };
    function draw(announce) {
      const { L, hidden } = list();
      const shown = L.slice(0, st.limit);
      let html = '';
      if (st.sort === 'grid') {
        // grouped by key, not by adjacent runs: a pinned search hit leads its own group instead of opening a duplicate one
        const gm = new Map(); shown.forEach((x) => { const k = groupKey(x); if (!gm.has(k)) gm.set(k, { k, x, list: [] }); gm.get(k).list.push(x); });
        html = [...gm.values()].map((g) => `<div class="pai-group"><h3 class="pai-gh">${esc(groupTitle(g.x))} <span class="small muted">${L.filter((y) => groupKey(y) === g.k).length}</span></h3><ul class="pai-list">${g.list.map((x) => rowHTML(x, st)).join('')}</ul></div>`).join('');
      } else {
        // no visible group headings here: a hidden h3 keeps the outline h2 → h3 → h4 (the count line says how many)
        html = shown.length ? `<h3 class="pai-sr">${st.sort === 'num' ? 'Proposals by number' : 'Proposals by date received, latest first'}</h3><ul class="pai-list">${shown.map((x) => rowHTML(x, st)).join('')}</ul>` : '';
      }
      const th = st.theme ? themeBy[st.theme] : null;
      const countTxt = `<strong>${plural(L.length, 'proposal')}</strong>${hidden ? ` · ${plural(hidden, 'exact copy', 'exact copies')} folded into ${hidden === 1 ? 'its original' : 'their originals'}` : ''}${th ? ` · ${esc(th.name)} · <a href="${themeHref(th.id)}">about this theme →</a>` : ''}`;
      res.innerHTML = `<p class="small pai-count">${countTxt}</p>${html || UI.empty('No proposal matches. Clear a filter or try fewer words.')}
        ${L.length > shown.length ? `<p><button type="button" class="btn" id="pai-more">Show ${Math.min(60, L.length - shown.length)} more (${L.length - shown.length} left)</button></p>
        <p class="small muted pai-printnote">Printed: the first ${shown.length} of ${L.length} matching proposals. Narrow the filters, or press “Show more” before printing, to include the rest.</p>` : ''}`;
      if (announce && live) live.textContent = `${plural(L.length, 'proposal')}${th ? ' · ' + th.name : ''}`;
      const more = res.querySelector('#pai-more');
      // keep keyboard focus: move it to the first newly shown row
      if (more) more.addEventListener('click', () => { const n = st.limit; st.limit += 60; draw(); const first = res.querySelectorAll('.pai-row')[n]; if (first) { first.setAttribute('tabindex', '-1'); first.focus(); } });
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
    } else if (a0 === 'trends' || a0 === 'last' || a0 === 'process') target = el.querySelector('#pai-' + a0);
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
