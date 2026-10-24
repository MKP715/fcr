/* Calendar view ("what to expect when") and the Today page's "Coming up" card.

   Data: data/src/calendar.json → FCR.RAW.calendar
   { as_of, about, sources:{key: text}, categories:[{id, label}],
     trustee_rotation:{regions_by_year_mod4:{'0'..'3': [region ids]}, tal:{'U.S.': year, Canada: year}},
     conference_dates:{YEAR:{start, end, place?, approx?, note?, source?}},
     rules:[{id, title, category, scope, rule, years, why, what_to_do, source, url?, confidence, approx?, projected?}],
     events:[{id, title, category, scope, start, end, dates?, place?, area?, approx, status, label?, rule?,
              why, what_to_do, source, url?, confidence}] }
   scope: 'all' (everyone) | 'southwest' (the region) | 'area65' | a region id ('NE', 'PA', …) | 'area' (+ area: n, local to that area)
          | 'regions' (other regions' business: shown under "Everything" only)
   years: 'all' | 'even' | 'odd' | {every, from} | [YEAR, …] (only those years)
   rule.type:
     fixed                       {month, day, time?}
     nth_weekday                 {month | months:[…], weekday 0=Sun…6, n (1-5, -1 = last), offset? (days added: -1 with weekday 6
                                  = the Friday before the n-th Saturday), days}
     fifth_monday_after_quarter  {quarter_end_month 12|6|9, start_offset (days before that Monday; -3 = Friday)}
     relative_to_conference      {anchor 'start'|'end', offset, days}   (Conference weeks come from conference_dates; a year with
                                  no entry gets an approximate, low-confidence window from the late-April fallback below)
     after_rule                  {rule: id | [ids], anchor, offset, days, label?} (anchored on the resolved occurrences of those rules)
     month_window                {from 'MM-DD', to 'MM-DD', label?} or {windows:[{from, to, label}]}
     weekend_nearest             {month, day}  (Fri-Sun around the Saturday nearest that date)
     conference                  (one per year from conference_dates; an approximate late-April window otherwise)
     undated                     {when}  (listed under "No fixed date")
   Titles may use {Y} {Y+1} {P} {P+1} {P-2} (P = Y-1950) {GSC} {GSC+1} (ordinal Conference) {RT} {RT+1} (trustees elected) {label}.
   An explicit event naming a rule replaces that rule's occurrence (same year for once-a-year rules, otherwise the nearest
   occurrence within 45 days), so a dated aa.org listing always beats a projection.

   Public API (FCR.calendar):
     items({from, to, scope, cats}) → occurrences sorted by start: {key, id, kind:'event'|'rule', title, category, scope, area,
       start, end ('YYYY-MM-DD'), approx, window (bool: a date range, not a known date), label, place, status, why, what_to_do,
       source, url, confidence, projected}
     upcoming({limit, scope, days, distinct}) → the next items from FCR.today(): dated items by start (under way first), then
       windows already open; when the limit would cut them all, the last row is the open window that matters most (Area 65
       first, then the one ending soonest); distinct: one row per multi-date event
     conference(year) → {start, end, place, approx} | null
     ics(items, name) → RFC 5545 text;   download(items, filename)
     countdown(item, todayStr) / when(item) → display strings;   inScope(item, scope);   undated() → undated rules
   UI.comingUp(box, {limit, scope, days}) renders a compact "Coming up" card with a "Full calendar →" link. */
(function () {
  'use strict';
  const FCR = window.FCR;
  const V = FCR.views, UI = FCR.ui, esc = FCR.esc;
  const CAL = (FCR.RAW && FCR.RAW.calendar) || {};
  const RULES = CAL.rules || [], EVENTS = CAL.events || [];
  const CATS = CAL.categories && CAL.categories.length ? CAL.categories : [{ id: 'conference', label: 'Conference' }];
  const catLabel = (id) => (CATS.find((c) => c.id === id) || { label: id }).label;

  // ---------- day arithmetic on 'YYYY-MM-DD' strings (UTC day numbers: no DST surprises) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const num = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
  const str = (n) => { const t = new Date(n * 864e5); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
  const dow = (n) => (n + 4) % 7;                       // 1970-01-01 was a Thursday
  const add = (s, k) => str(num(s) + k);
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const todayStr = () => { const t = FCR.today(); return ymd(t.getFullYear(), t.getMonth() + 1, t.getDate()); };
  const toStr = (x) => (x instanceof Date ? ymd(x.getFullYear(), x.getMonth() + 1, x.getDate()) : x);
  /** n-th weekday (0=Sun) of a month; n = -1 for the last one. */
  function nthWeekday(y, m, wd, n) {
    if (n < 0) { let d = num(ymd(y, m, lastDay(y, m))); while (dow(d) !== wd) d--; return str(d); }
    let d = num(ymd(y, m, 1)); while (dow(d) !== wd) d++;
    return str(d + 7 * (n - 1));
  }
  const yearOk = (yrs, y) => !yrs || yrs === 'all' || (Array.isArray(yrs) ? yrs.includes(y) : yrs === 'even' ? y % 2 === 0 : yrs === 'odd' ? y % 2 === 1
    : typeof yrs === 'object' ? y >= (yrs.from || 0) && (y - (yrs.from || 0)) % (yrs.every || 1) === 0 : true);

  // ---------- Conference weeks and title tokens ----------
  function conference(y) {
    const c = (CAL.conference_dates || {})[y];
    return c ? { start: c.start, end: c.end, place: c.place || 'New York', approx: !!c.approx, note: c.note || '', source: c.source || '' } : null;
  }
  function trusteesFor(y) {
    const tr = CAL.trustee_rotation || {};
    const regs = ((tr.regions_by_year_mod4 || {})[String(((y % 4) + 4) % 4)] || []).map(FCR.regionName).sort();
    const tal = Object.keys(tr.tal || {}).filter((k) => (y - tr.tal[k]) % 4 === 0).map((k) => 'trustee-at-large/' + k);
    return (regs.length ? regs.join(' and ') + ' regional trustees' : 'regional trustees') + (tal.length ? ', ' + tal.join(', ') : '');
  }
  function fill(t, y, label) {
    return String(t || '').replace(/\{(Y|P|GSC|RT)([+-]\d+)?\}/g, (m, k, d) => {
      const v = (k === 'P' ? y - 1950 : y) + (d ? +d : 0);
      return k === 'GSC' ? FCR.ordinal(v - 1950) : k === 'RT' ? trusteesFor(v) : String(v);
    }).replace('{label}', label || '');
  }

  // ---------- expansion ----------
  const ONCE = { fixed: 1, fifth_monday_after_quarter: 1, relative_to_conference: 1, conference: 1, weekend_nearest: 1 };
  const oncePerYear = (r) => ONCE[r.rule.type] || (r.rule.type === 'nth_weekday' && !r.rule.months) || (r.rule.type === 'month_window' && !r.rule.windows);
  function occ(r, y, start, end, extra) {
    return Object.assign({
      key: r.id + '@' + start, id: r.id, ruleId: r.id, kind: 'rule', year: y, title: fill(r.title, y, extra && extra.label),
      category: r.category, scope: r.scope, area: r.area || null, start, end: end || start, approx: !!r.approx,
      window: false, label: '', place: '', status: 'scheduled', why: r.why || '', what_to_do: r.what_to_do || '',
      source: r.source || '', url: r.url || '', confidence: r.confidence || 'medium', projected: !!r.projected, time: r.rule.time || '',
    }, extra || {});
  }
  function expandRule(r, y) {
    const R = r.rule, out = [];
    if (!yearOk(r.years, y)) return out;
    if (R.type === 'fixed') out.push(occ(r, y, ymd(y, R.month, R.day)));
    else if (R.type === 'nth_weekday') (R.months || [R.month]).forEach((m) => { const s = add(nthWeekday(y, m, R.weekday, R.n), R.offset || 0); out.push(occ(r, y, s, add(s, (R.days || 1) - 1))); });
    else if (R.type === 'fifth_monday_after_quarter') {
      const close = R.quarter_end_month === 12 ? ymd(y - 1, 12, 31) : ymd(y, R.quarter_end_month, lastDay(y, R.quarter_end_month));
      let d = num(close) + 1; while (dow(d) !== 1) d++;
      const mon = str(d + 28);
      out.push(occ(r, y, add(mon, R.start_offset || 0), mon));
    } else if (R.type === 'relative_to_conference') {
      const c = conference(y), off = R.offset || 0, days = R.days || 1;
      if (c) {
        const s = add(R.anchor === 'end' ? c.end : c.start, off);
        out.push(occ(r, y, s, add(s, days - 1), { approx: r.approx || c.approx }));
      } else {
        // No Conference dates yet: the week falls in the Apr 12 – May 10 window the 'conference' fallback uses (starts Apr 12 –
        // May 4, ends Apr 18 – May 10), so show the matching range instead of dropping the item.
        const lo = R.anchor === 'end' ? ymd(y, 4, 18) : ymd(y, 4, 12), hi = R.anchor === 'end' ? ymd(y, 5, 10) : ymd(y, 5, 4);
        out.push(occ(r, y, add(lo, off), add(hi, off + days - 1),
          { approx: true, window: true, confidence: 'low', label: 'Conference dates not yet set' }));
      }
    } else if (R.type === 'month_window') {
      (R.windows || [R]).forEach((w) => {
        const [fm, fd] = w.from.split('-').map(Number), [tm, td] = w.to.split('-').map(Number);
        const inTitle = r.title.includes('{label}');
        out.push(occ(r, y, ymd(y, fm, fd), ymd(y, tm, td), { window: true, label: inTitle ? '' : w.label || R.label || '' }));
        if (inTitle) out[out.length - 1].title = fill(r.title, y, w.label);
      });
    } else if (R.type === 'weekend_nearest') {
      const t = num(ymd(y, R.month, R.day)), back = (dow(t) + 1) % 7;   // days back to the previous Saturday
      const sat = back <= 3 ? t - back : t + (7 - back);
      out.push(occ(r, y, str(sat - 1), str(sat + 1)));
    } else if (R.type === 'conference') {
      const c = conference(y);
      if (c) out.push(occ(r, y, c.start, c.end, { approx: c.approx, place: c.place, label: c.note }));
      else out.push(occ(r, y, ymd(y, 4, 12), ymd(y, 5, 10), { approx: true, window: true, label: 'April or early May (dates not yet set)', confidence: 'medium' }));
    }
    return out;
  }
  function fromEvent(e) {
    const list = e.dates && e.dates.length ? e.dates : [e.start];
    return list.map((s) => ({
      key: e.dates && e.dates.length ? e.id + '@' + s : e.id, id: e.id, ruleId: e.rule || null, kind: 'event', year: +s.slice(0, 4),
      title: e.title, category: e.category, scope: e.scope, area: e.area || null,
      start: s, end: e.dates && e.dates.length ? s : e.end || s, approx: !!e.approx,
      window: !!e.approx && num(e.end || s) - num(s) >= 6 && !/weekend/i.test(e.label || ''), label: e.label || '',
      place: e.place || '', status: e.status || 'scheduled', why: e.why || '', what_to_do: e.what_to_do || '',
      source: e.source || '', url: e.url || '', confidence: e.confidence || 'medium', projected: false, time: '',
    }));
  }
  /** Drop rule occurrences that an explicit event already covers. */
  function dedupe(occs, evs) {
    return occs.filter((o) => !evs.some((e) => {
      if (e.ruleId !== o.ruleId) return false;
      const r = RULES.find((x) => x.id === o.ruleId);
      return r && oncePerYear(r) ? e.year === o.year : Math.abs(num(e.start) - num(o.start)) <= 45;
    }));
  }
  const cache = {};
  /** Every occurrence for calendar years y0..y1 (rules expanded, de-duplicated, events merged), sorted. */
  function expandYears(y0, y1) {
    const k = y0 + '-' + y1; if (cache[k]) return cache[k];
    const evs = [].concat(...EVENTS.map(fromEvent));
    const dated = RULES.filter((r) => r.rule && r.rule.type !== 'undated');
    let base = [];
    dated.filter((r) => r.rule.type !== 'after_rule').forEach((r) => { for (let y = y0 - 1; y <= y1 + 1; y++) base = base.concat(expandRule(r, y)); });
    base = dedupe(base, evs);
    let rel = [];
    dated.filter((r) => r.rule.type === 'after_rule').forEach((r) => {
      const R = r.rule, anchors = [].concat(R.rule);
      base.concat(evs).filter((o) => anchors.includes(o.ruleId)).forEach((a) => {
        const s = add(R.anchor === 'end' ? a.end : a.start, R.offset || 0), y = +s.slice(0, 4);
        if (yearOk(r.years, y)) rel.push(occ(r, y, s, add(s, (R.days || 1) - 1), { approx: true, window: (R.days || 1) >= 7, label: R.label || '' }));
      });
    });
    rel = dedupe(rel, evs);
    const all = base.concat(rel, evs).filter((o) => +o.end.slice(0, 4) >= y0 && +o.start.slice(0, 4) <= y1);
    const seen = new Set();
    return (cache[k] = all.filter((o) => (seen.has(o.key) ? false : seen.add(o.key)))
      .sort((a, b) => num(a.start) - num(b.start) || num(a.end) - num(b.end) || a.title.localeCompare(b.title)));
  }

  // ---------- filters ----------
  const SW_SCOPES = { all: 1, southwest: 1, SW: 1, area65: 1 };
  function inScope(o, scope) {
    if (!scope || scope === 'everything' || scope === 'all') return true;
    if (SW_SCOPES[o.scope]) return true;
    if (scope === 'southwest') return o.scope === 'area' && FCR.areas[o.area] && FCR.areas[o.area].region === 'SW';
    return false;
  }
  function items(opts) {
    opts = opts || {};
    const t = todayStr();
    const from = toStr(opts.from) || add(t, -31), to = toStr(opts.to) || add(t, 366);
    return expandYears(+from.slice(0, 4), +to.slice(0, 4))
      .filter((o) => o.end >= from && o.start <= to && inScope(o, opts.scope) && (!opts.cats || !opts.cats.length || opts.cats.includes(o.category)));
  }
  function upcoming(opts) {
    opts = opts || {};
    const t = todayStr();
    const seen = new Set();
    const list = items({ from: t, to: add(t, opts.days || 120), scope: opts.scope || 'area65', cats: opts.cats })
      .filter((o) => { const len = num(o.end) - num(o.start); return !(o.window && len > 40 && (o.start < t || len >= 300)); })   // drop long windows already under way, and whole-year ones ("during 2027") at any time
      .filter((o) => !opts.distinct || o.kind !== 'event' || (seen.has(o.id) ? false : seen.add(o.id)));   // weekly series: next date only
    const open = (o) => o.window && o.start < t, n = opts.limit || 5;   // vague windows already open go after the dated items...
    const dated = list.filter((o) => !open(o));
    const win = list.filter(open).sort((a, b) => (b.scope === 'area65') - (a.scope === 'area65') || num(a.end) - num(b.end));
    // ...but keep one row for the most relevant of them, so a short window under way (the Summer Assembly) stays visible
    return (win.length && dated.length >= n ? dated.slice(0, n - 1).concat(win[0]) : dated.concat(win)).slice(0, n);
  }
  /** Merge the dates of one multi-date event within a list: the first keeps its place and lists the rest in `more`.
      Returns shallow copies (the expansion cache is never mutated). */
  function groupSeries(list) {
    const first = {}, out = [];
    list.forEach((o) => {
      if (o.kind === 'event' && o.key !== o.id) {
        if (first[o.id]) { first[o.id].more.push(o); return; }
        out.push((first[o.id] = Object.assign({}, o, { more: [] })));
      } else out.push(o);
    });
    return out;
  }
  /** Rows as listed: one per series, but split at today when the list spans it, so a weekly series' next date gets its own
      row below the Today marker (past dates stay in a row above it). */
  const rowList = (list, t, split) => (split ? groupSeries(list.filter((o) => o.end < t)).concat(groupSeries(list.filter((o) => o.end >= t))) : groupSeries(list));

  // ---------- display strings ----------
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const parts = (s) => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
  /** "Oct 30 – Nov 2, 2026", "Tue, Nov 10, 2026", "about Feb 15–25, 2027", "December 2026 (date not published)". */
  function when(o) {
    const a = parts(o.start), b = parts(o.end);
    if (o.window && a.d === 1 && b.d === lastDay(b.y, b.m) && a.y === b.y) return a.m === b.m ? `${MONTH[a.m - 1]} ${a.y}` : `${MONTH[a.m - 1]}–${MONTH[b.m - 1]} ${a.y}`;
    let s;
    if (o.start === o.end) s = `${WD[dow(num(o.start))]}, ${MON[a.m - 1]} ${a.d}, ${a.y}`;
    else if (a.y !== b.y) s = `${MON[a.m - 1]} ${a.d}, ${a.y} – ${MON[b.m - 1]} ${b.d}, ${b.y}`;
    else if (a.m !== b.m) s = `${MON[a.m - 1]} ${a.d} – ${MON[b.m - 1]} ${b.d}, ${a.y}`;
    else s = `${MON[a.m - 1]} ${a.d}–${b.d}, ${a.y}`;
    return (o.approx ? 'about ' : '') + s + (o.time ? ', ' + o.time : '');
  }
  /** "today", "tomorrow", "in 12 days", "in about 6 weeks", "now · ends in 3 days", "4 days ago". */
  function countdown(o, t) {
    t = t || todayStr();
    const ds = num(o.start) - num(t), de = num(o.end) - num(t);
    if (de < 0) return -de === 1 ? 'yesterday' : `${-de} days ago`;
    if (ds <= 0 && o.window) { const a = parts(o.start), b = parts(o.end);
      return a.d === 1 && b.d === lastDay(b.y, b.m) && a.m === b.m ? 'this month' : 'expected about now'; }
    if (ds <= 0) return o.start === o.end ? 'today' : de === 0 ? 'now · last day' : `now · ends in ${de} day${de === 1 ? '' : 's'}`;
    { const a = parts(o.start), b = parts(o.end);   // a whole-year window ("follow-ups due during 2027")
      if (o.window && a.y === b.y && a.m === 1 && a.d === 1 && b.m === 12 && b.d === 31) return 'some time in ' + a.y; }
    const ab = o.approx ? 'about ' : '';
    if (ds === 1) return o.approx ? 'in about a day' : 'tomorrow';
    if (ds >= 548) { const y = Math.round(ds / 182.6) / 2; return `in ${ab}${y} years`; }   // "in about 3 years", "in 2.5 years"
    if (ds >= 120) return `in ${ab}${Math.round(ds / 30.4)} months`;
    if (ds >= 60 || ((o.window || o.approx) && ds >= 14)) return `in ${ab}${Math.round(ds / 7)} weeks`;   // approximate: "in about 6 weeks", not "in about 44 days"
    return `in ${ab}${ds} days`;
  }
  function scopeLabel(o) {
    if (o.scope === 'area65') return 'Area 65';
    if (o.scope === 'southwest' || o.scope === 'SW') return 'Southwest';
    if (o.scope === 'area') return 'Area ' + o.area;
    if (o.scope === 'regions') return 'Other regions';
    if (FCR.regionBy[o.scope]) return FCR.regionName(o.scope) + ' region';
    return '';
  }

  // ---------- .ics (RFC 5545) ----------
  const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function fold(line) {                                  // 75-octet lines, continuation = CRLF + space
    const out = []; let cur = '', bytes = 0;
    for (const ch of line) {
      const b = unescape(encodeURIComponent(ch)).length;
      if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  function ics(list, name) {
    const now = new Date(), stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GSC Service Explorer//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:' + icsText(name || 'GSC service calendar')];
    list.forEach((o) => {
      // A long "expected window" (Sep 12 – Nov 30) would paint a weeks-long banner in a calendar app: export it as a one-day
      // reminder on the day the window opens, with the window in the title.
      const long = o.window && num(o.end) - num(o.start) > 7, w = when(o).replace(/^about /, '');
      const desc = ['When: ' + when(o) + (o.label ? ' (' + o.label + ')' : '') + (o.approx ? ' — approximate' : '') + '.', o.why,
        o.what_to_do ? 'What to do: ' + o.what_to_do : '', o.place ? 'Where: ' + o.place : '',
        'Source: ' + o.source + ' (confidence: ' + o.confidence + ')'].filter(Boolean).join('\n\n');
      L.push('BEGIN:VEVENT', 'UID:' + o.key.replace(/[^A-Za-z0-9._-]/g, '-') + '@gsc-service-explorer', 'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + o.start.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + add(long ? o.start : o.end, 1).replace(/-/g, ''),
        'SUMMARY:' + icsText(long ? `${o.title} (expected ${w})` : (o.approx ? '(approx.) ' : '') + o.title), 'DESCRIPTION:' + icsText(desc),
        'CATEGORIES:' + icsText(catLabel(o.category)), 'TRANSP:TRANSPARENT');
      if (o.place) L.push('LOCATION:' + icsText(o.place));
      if (/^https?:/.test(o.url)) L.push('URL:' + o.url);
      L.push('END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }
  function download(list, filename) {
    const blob = new Blob([ics(list)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename || 'gsc-calendar.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  FCR.calendar = { items, upcoming, conference, ics, download, countdown, when, inScope, scopeLabel, catLabel,
    undated: () => RULES.filter((r) => r.rule && r.rule.type === 'undated'), categories: CATS, todayStr, add };

  // ---------- page pieces ----------
  const CONF_TXT = { high: 'published date or a stated rule', medium: 'a pattern from several years, or a single source', low: 'an estimate: check before relying on it' };
  const SCOPES = [['area65', 'Area 65'], ['southwest', 'Southwest region'], ['everything', 'Everything']];
  const HORIZONS = [3, 12, 24];
  // Category marks: eight filled hues for the main categories; World and Observances are rings (11 hues would not stay
  // distinguishable: before, World/Deadlines and Observances/Conference were near-identical). The chip text always names it.
  const CAT_MARK = { conference: 'r1', committee: 'r7', board: 'r3', deadline: 'critical', election: 'r4', forum: 'r2', area: 'r5',
    publication: 'muted', convention: 'r6', world: 'r1 o', observance: 'r6 o' };
  /** class + style for a category mark (<i> or .cal-dot): ' o' marks a ring. */
  const mark = (c, cls) => { const [v, o] = (CAT_MARK[c] || 'muted').split(' ');
    return `class="${cls || ''}${o ? ' o' : ''}" style="--c:var(--${v})"`; };
  const domId = (k) => 'cal-' + String(k).replace(/[^A-Za-z0-9_-]/g, '-');
  /** Compact date for the left column: "Oct 30" + "Fri–Mon", "Feb 15–25", "Dec". */
  function dateCol(o) {
    const a = parts(o.start), b = parts(o.end);
    const wholeMonth = o.window && a.d === 1 && b.d === lastDay(b.y, b.m);
    if (wholeMonth) return [a.m === b.m ? MON[a.m - 1] : `${MON[a.m - 1]}–${MON[b.m - 1]}`, String(a.y)];
    if (o.start === o.end) return [`${MON[a.m - 1]} ${a.d}`, WD[dow(num(o.start))]];
    if (a.m !== b.m || a.y !== b.y) return [`${MON[a.m - 1]} ${a.d}`, `to ${MON[b.m - 1]} ${b.d}`];
    return [`${MON[a.m - 1]} ${a.d}–${b.d}`, o.window ? '' : `${WD[dow(num(o.start))]}–${WD[dow(num(o.end))]}`];
  }
  /** 'past' | 'now' (a dated item under way) | 'now win' (inside an expected window) | 'soon' (≤ 14 days) | ''. */
  function cdClass(o, t) {
    if (o.end < t) return 'past';
    if (o.start <= t) return o.window ? 'now win' : 'now';
    return num(o.start) - num(t) <= 14 ? 'soon' : '';
  }
  const shortDay = (s) => { const p = parts(s); return `${MON[p.m - 1]} ${p.d}`; };
  const andList = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  /** Where to read more in the app about an item: [[label, href]] (by its rule or event id, else its category). */
  function appLinks(o) {
    const id = String(o.ruleId || o.id || ''), y = +String(o.start || '').slice(0, 4), out = [];
    const add = (l, h) => { if (!out.some((x) => x[1] === h)) out.push([l, h]); };
    const conf = (yy) => FCR.ordinal ? FCR.ordinal(yy - 1950) : (yy - 1950) + 'th';
    const cy = FCR.Y(y) || y === FCR.latestYear + 1 ? y : null;   // years the Committees page can show (loaded + the projected next one)
    const P = y - 1949, Pok = FCR.panels.includes(P) || (FCR.predict && FCR.predict.pendingPanels && FCR.predict.pendingPanels().includes(P));
    if (/committee-draw|^panel\d+-draw$/.test(id)) { add(Pok ? `Panel ${P} forecast` : 'Predict', Pok ? `#/predict/${P}` : '#/predict'); add('How the lot works', '#/learn/cc_selection'); }
    else if (/^(conference|gsc\d+)$/.test(id)) { if (cy) add(`${conf(y)} Conference committees`, `#/committees/${y}`); add('What happens during Conference week', '#/learn/conference_week'); }
    else if (/chairs-(elected|orientation)/.test(id)) { add('Chairs by year', cy ? `#/committees/${y}/chairs` : `#/committees/${FCR.latestYear}/chairs`); add('How chairs are elected', '#/learn/cc_chairs'); }
    else if (/^(pai-|october-feedback|preliminary-agenda|final-agenda|background-posted|pai-status-grid)/.test(id)) add('How an idea becomes an agenda item', '#/learn/agenda_path');
    else if (/trustee|resumes-|openings-|class-a-deadline|director-searches|vacancy-cutoff|past-delegate-eligibility/.test(id)) { add('Seats opening', '#/timeline'); if (/sw-trustee|resume|trustee-elections/.test(id)) add('Regional trustees', '#/learn/regional_trustees'); }
    else if (/^gsb-|corporate-boards|^aaws-|^gv-board|board-sharing|advisory-actions|fiscal-year/.test(id)) add('Trustees & boards', '#/board');
    else if (/gso-staff-rotation/.test(id)) add('GSO staff desks', '#/staff');
    else if (/final-report|^fcr-\d+/.test(id)) add('Final Reports', FCR.Y(y) ? `#/reports/${y}` : '#/reports');
    else if (/panel-takes-office|election-assemblies|election-results|p7\d-elections|p8\d-elections/.test(id)) { add('Delegates', '#/delegates/next'); add('Panels and rotation', '#/learn/panels'); }
    else if (/swrda|swraasa|sw-forum|sw-rf|regional-forums|-rf-/.test(id)) add('Regional Forums by year', '#/reports');
    if (/^aa-followups-/.test(id)) add('Pending follow-ups', '#/actions/pending');
    // the agenda-item steps, and the fall assembly where Area 65 votes on its proposals: only those of the cycle the
    // Agenda Items page covers (July before that Conference to June after it), named by its Conference
    const ps = ((FCR.RAW && FCR.RAW.pai) || {}).source || {};
    if (ps.conference_year && /^(pai-|october-feedback|preliminary-agenda|final-agenda|background-posted|pai-status-grid|a65-fall-assembly)/.test(id)
      && o.start >= `${ps.conference_year - 1}-07-01` && o.start <= `${ps.conference_year}-06-30`) add(`Proposed agenda items (${conf(ps.conference_year)} Conference)`, '#/agenda');
    if (o.scope === 'area65' || (o.scope === 'area' && +o.area === 65)) add('Area 65', '#/area/65');
    return out;
  }
  function itemHTML(o, t, prefix) {
    const [d1, d2] = dateCol(o), id = domId((prefix || '') + o.key), sc = scopeLabel(o), cls = cdClass(o, t);
    const keys = [o.key].concat((o.more || []).map((x) => x.key)).join(' ');
    const links = appLinks(o), inApp = /^#/.test(o.url || '');
    const src = esc(o.source) + (o.url && !(inApp && links.length) ? ` · <a href="${esc(o.url)}"${/^https?:/.test(o.url) ? ' target="_blank" rel="noopener"' : ''}>${/^https?:/.test(o.url) ? 'source link ↗' : 'open in the app'}</a>` : '');
    return `<li class="cal-item${cls === 'past' ? ' past' : ''}${cls.startsWith('now') ? ' is-now' : ''}${cls === 'now win' ? ' is-win' : ''}" id="${id}" data-key="${esc(o.key)}" data-keys="${esc(keys)}">
      <div class="cal-date${o.approx ? ' approx' : ''}" aria-hidden="true">${o.approx ? '<span class="cal-about">about</span>' : ''}<span class="cal-d1">${esc(d1)}</span><span class="cal-d2">${esc(d2)}</span></div>
      <div class="cal-main">
        <h4 class="cal-h"><button type="button" class="cal-toggle" aria-expanded="false" aria-controls="${id}-d">
          <span ${mark(o.category, 'cal-dot')} aria-hidden="true"></span><span class="cal-title">${esc(o.title)}</span></button></h4>
        <div class="cal-meta"><span class="cal-when">${esc(when(o))}</span>${o.label ? ` <span class="muted">(${esc(o.label)})</span>` : ''}
          ${o.more && o.more.length ? `<span class="muted">· also ${esc(andList(o.more.map((x) => shortDay(x.start))))}</span>` : ''}
          <span class="cal-cd ${cls}">${esc(countdown(o, t))}</span>
          <span class="chip">${esc(catLabel(o.category))}</span>${sc ? ` <span class="chip cal-scope s-${esc(o.scope)}">${esc(sc)}</span>` : ''}
          ${o.confidence !== 'high' ? `<span class="chip cal-conf c-${o.confidence}" data-tip="${esc(o.confidence + ' confidence: ' + CONF_TXT[o.confidence])}">${o.confidence === 'low' ? 'estimate' : 'pattern'}</span>` : ''}
          ${o.status === 'held' && o.end < t ? '<span class="chip">held</span>' : ''}</div>
        <div class="cal-detail" id="${id}-d" hidden>
          ${o.why ? `<p>${esc(o.why)}</p>` : ''}
          ${o.what_to_do ? `<p><strong>What to do:</strong> ${esc(o.what_to_do)}</p>` : ''}
          <dl class="kv">
            <dt>When</dt><dd>${esc(when(o))}${o.label ? ' · ' + esc(o.label) : ''}${o.more && o.more.length ? ' · also ' + esc(andList(o.more.map(when))) : ''}${o.kind === 'rule' ? ` <span class="muted small">· projected from a recurring rule${o.projected ? ' (the official listing replaces it once posted)' : ''}</span>` : ''}</dd>
            ${o.place ? `<dt>Where</dt><dd>${esc(o.place)}</dd>` : ''}
            <dt>Who</dt><dd>${esc(sc || 'Everyone in the U.S./Canada structure')}${o.scope === 'area' && FCR.areas[o.area] ? ' · ' + UI.areaLink(o.area) : ''}</dd>
            <dt>Confidence</dt><dd><span class="cal-conf-txt c-${o.confidence}">${esc(o.confidence)}</span> · ${esc(CONF_TXT[o.confidence] || '')}</dd>
            <dt>Source</dt><dd>${src}</dd>
            ${links.length ? `<dt>In this app</dt><dd>${links.map(([l, h]) => `<a href="${esc(h)}">${esc(l)} →</a>`).join(' · ')}</dd>` : ''}
          </dl>
          <button type="button" class="btn cal-ics1" data-ics="${esc(o.key)}">Add to my calendar (.ics${o.more && o.more.length ? `, all ${o.more.length + 1} dates` : ''})</button>
        </div>
      </div></li>`;
  }
  const nowRow = (t) => `<li class="cal-nowmark" aria-label="Today"><span>Today · ${esc(when({ start: t, end: t }))}</span></li>`;
  /** List with the today marker after the items that started on or before today. */
  function listHTML(list, t, prefix, withNow) {
    let out = '', marked = !withNow;
    list = rowList(list, t, withNow);   // with the marker: finished, then under way, then ahead
    list.forEach((o) => { if (!marked && o.start > t) { out += nowRow(t); marked = true; } out += itemHTML(o, t, prefix); });
    if (!marked) out += nowRow(t);
    return `<ol class="cal-list">${out}</ol>`;
  }
  function monthStrip(months, byMonth, t) {
    const tp = parts(t);
    return `<ol class="cal-strip" aria-label="Jump to a month">${months.map(([y, m]) => {
      const l = byMonth[ymd(y, m, 1)] || [], cur = y === tp.y && m === tp.m, n = rowList(l, t, cur).length;
      const cats = [...new Set(l.map((o) => o.category))].slice(0, 7);
      return `<li><button type="button" class="cal-tile${cur ? ' cur' : ''}" data-jump="cal-m-${y}-${pad(m)}" aria-label="${MONTH[m - 1]} ${y}: ${n} item${n === 1 ? '' : 's'}"${cur ? ' aria-current="date"' : ''}>
        <span class="cal-tm">${MON[m - 1]}${m === 1 || cur ? ' ' + y : ''}</span><span class="cal-tn num">${n}</span>
        <span class="cal-tdots" aria-hidden="true">${cats.map((c) => `<i ${mark(c)}></i>`).join('')}</span>
        ${cur ? `<span class="cal-tnow" style="width:${Math.round((tp.d - 0.5) / lastDay(y, m) * 100)}%" title="Today"></span>` : ''}</button></li>`;
    }).join('')}</ol>`;
  }

  // ---------- the page ----------
  let filtersOpen = false;   // phones fold the filter card behind a one-line summary (kept for the session, not stored)
  V.calendar = function (el, args) {
    const st = Object.assign({ scope: 'area65', horizon: 12, cats: [] }, FCR.store.get('cal', {}));
    if (!SCOPES.some((s) => s[0] === st.scope)) st.scope = 'area65';
    if (!HORIZONS.includes(st.horizon)) st.horizon = 12;
    st.cats = (st.cats || []).filter((c) => CATS.some((x) => x.id === c));
    const t = todayStr(), tp = parts(t);
    const months = []; for (let i = 0; i < st.horizon; i++) { const mm = tp.m - 1 + i; months.push([tp.y + Math.floor(mm / 12), (mm % 12) + 1]); }
    const first = ymd(tp.y, tp.m, 1), [ly, lm] = months[months.length - 1], last = ymd(ly, lm, lastDay(ly, lm));
    const yearList = items({ from: first, to: last, scope: st.scope, cats: st.cats });
    const soon = items({ from: t, to: add(t, 60), scope: st.scope, cats: st.cats });
    // windows already open ("Final Report: about Aug 1 – Oct 15") go below the dated items, so today's deadline stays on top
    const openWin = (o) => o.window && o.start <= t, soonMain = soon.filter((o) => !openWin(o)), soonWin = soon.filter(openWin);
    const byMonth = {};
    yearList.forEach((o) => { const k = o.start < first ? first : o.start.slice(0, 8) + '01'; (byMonth[k] = byMonth[k] || []).push(o); });
    const rows = (l) => groupSeries(l).length;                     // a weekly series counts as one row
    const allCount = rows(items({ from: first, to: last, scope: st.scope }));
    // Deep link #/calendar/<key>: opened where it is listed; if it is not (past, beyond the horizon, filtered out) it is shown on top.
    const key = args && args[0] ? decodeURIComponent(args[0]) : '';
    const kd = (/@(\d{4}-\d{2}-\d{2})$/.exec(key) || [])[1];         // rule occurrences and series dates carry their date
    const linked = key && !yearList.concat(soon).some((o) => o.key === key)
      ? items({ from: kd || add(t, -1100), to: kd || add(t, 1500), scope: 'everything' }).filter((o) => o.key === key) : [];
    const chip = (id, label, on) => `<button type="button" class="cal-chip${on ? ' on' : ''}" data-cat="${id}" aria-pressed="${on}">${id !== '*' ? `<i ${mark(id)} aria-hidden="true"></i>` : ''}${esc(label)}</button>`;
    const fsum = [SCOPES.find((s) => s[0] === st.scope)[1], st.horizon + ' months', st.cats.length ? st.cats.map(catLabel).join(', ') : 'all categories'].join(' · ');
    el.innerHTML = `<div class="cal-page">
      <div class="page-head cal-head"><div><h1>Service calendar</h1>
        <p>What to expect when in the service year, as of <strong>${esc(when({ start: t, end: t }))}</strong>${FCR.asOfOverride ? ' (preview date)' : ''}.
        Dated items come from aa.org, the Final Reports and area websites; items marked <em>about</em> are projected from a recurring rule or a pattern. Open any item for why it matters, what to do and its source.</p></div>
        <div class="cal-actions"><button type="button" class="btn" id="cal-ics" title="Every dated item shown below, as one calendar file">Download .ics (${yearList.length})</button><button type="button" class="btn" id="cal-print">Print</button></div></div>
      <div class="card cal-filters${filtersOpen ? ' open' : ''}">
        <button type="button" class="cal-ftoggle" aria-expanded="${filtersOpen}" aria-controls="cal-fbody"><span class="cal-ft">Filters</span><span class="cal-fsum">${esc(fsum)}</span></button>
        <div class="cal-fbody" id="cal-fbody">
        <div class="cal-frow"><span class="cal-flabel" id="cal-l-scope">Who it matters to</span>
          <div class="seg" role="group" aria-labelledby="cal-l-scope">${SCOPES.map(([k, l]) => `<button type="button" data-scope="${k}" class="${st.scope === k ? 'on' : ''}" aria-pressed="${st.scope === k}">${l}</button>`).join('')}</div></div>
        <div class="cal-frow"><span class="cal-flabel" id="cal-l-hz">How far ahead</span>
          <div class="seg" role="group" aria-labelledby="cal-l-hz">${HORIZONS.map((h) => `<button type="button" data-hz="${h}" class="${st.horizon === h ? 'on' : ''}" aria-pressed="${st.horizon === h}">${h} months</button>`).join('')}</div></div>
        <div class="cal-frow"><span class="cal-flabel" id="cal-l-cat">Categories</span>
          <div class="cal-chips" role="group" aria-labelledby="cal-l-cat">${chip('*', 'All', !st.cats.length)}${CATS.map((c) => chip(c.id, c.label, st.cats.includes(c.id))).join('')}</div></div>
        <p class="small muted cal-fnote">${st.scope === 'area65' ? 'Area 65 view: everything for the whole structure, the Southwest region and NETA 65.' : st.scope === 'southwest' ? 'Southwest view: adds the other Southwest areas’ own assemblies.' : 'Everything: adds other regions’ forums and areas.'}
          Showing ${rows(yearList)}${st.cats.length ? ' of ' + allCount : ''} items.</p>
      </div></div>
      ${linked.length ? `<section class="cal-linked" aria-labelledby="cal-h-link"><h2 id="cal-h-link" class="section-title">Linked item <span class="muted small">${linked[0].end < first ? 'already past' : 'outside the current view'}</span></h2>
        ${listHTML(linked, t, 'l-', false)}</section>` : ''}
      <section class="cal-soon" aria-labelledby="cal-h-soon"><h2 id="cal-h-soon" class="section-title">Coming up <span class="muted small">next 60 days</span></h2>
        ${soonMain.length ? listHTML(soonMain, t, 's-', true) : soonWin.length ? '' : UI.empty('Nothing in the next 60 days for these filters.')}
        ${soonWin.length ? `<h3 class="cal-sub">Expected around now <span class="muted small">windows with no published date yet</span></h3>${listHTML(soonWin, t, 'w-', false)}` : ''}</section>
      <section class="cal-year" aria-labelledby="cal-h-year"><h2 id="cal-h-year" class="section-title">Month by month <span class="muted small">${MONTH[tp.m - 1]} ${tp.y} – ${MONTH[lm - 1]} ${ly}</span></h2>
        ${monthStrip(months, byMonth, t)}
        ${months.map(([y, m]) => { const k = ymd(y, m, 1), l = byMonth[k] || [], cur = y === tp.y && m === tp.m, n = rowList(l, t, cur).length;
          return `<section class="cal-month${cur ? ' cur' : ''}" id="cal-m-${y}-${pad(m)}" aria-labelledby="cal-mh-${y}-${pad(m)}">
            <h3 id="cal-mh-${y}-${pad(m)}">${MONTH[m - 1]} ${y} <span class="muted small">${n} item${n === 1 ? '' : 's'}${cur ? ' · this month' : ''}</span></h3>
            ${l.length ? listHTML(l, t, 'm-', cur) : '<p class="muted small cal-none">Nothing listed for these filters.</p>'}</section>`; }).join('')}
      </section>
      <section class="cal-undated-wrap" aria-labelledby="cal-h-und"><h2 id="cal-h-und" class="section-title">No fixed date</h2>
        <div class="card"><ul class="cal-undated">${FCR.calendar.undated().filter((r) => inScope(r, st.scope) && (!st.cats.length || st.cats.includes(r.category))).map((r) =>
          `<li><strong>${esc(r.title)}</strong> <span class="muted">· ${esc(r.rule.when)}</span><br><span class="small">${esc(r.why)}</span> <span class="small muted">(${esc(r.source)})</span></li>`).join('') || '<li class="muted">None for these filters.</li>'}</ul></div></section>
      <p class="small muted cal-foot">Calendar data as of ${esc(CAL.as_of ? (FCR.ui && FCR.ui.fmtDate ? FCR.ui.fmtDate(CAL.as_of, 'short') : CAL.as_of) : '—')}. Board weekends follow the bylaw rule (the fifth Monday after a quarter closes, Service Manual p.140) until aa.org lists them; aa.org’s 2028 dates run a week later than the rule, so projected weekends are marked <em>about</em>.</p></div>`;
    const root = el.firstElementChild;   // listeners live on this wrapper, so re-renders never stack handlers on <main>

    const save = () => { FCR.store.set('cal', st); V.calendar(el, []); };
    el.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => { st.scope = b.dataset.scope; save(); focusSel(`[data-scope="${st.scope}"]`); }));
    el.querySelectorAll('[data-hz]').forEach((b) => b.addEventListener('click', () => { st.horizon = +b.dataset.hz; save(); focusSel(`[data-hz="${st.horizon}"]`); }));
    el.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
      const c = b.dataset.cat;
      st.cats = c === '*' ? [] : st.cats.includes(c) ? st.cats.filter((x) => x !== c) : st.cats.concat(c);
      save(); focusSel(`[data-cat="${c}"]`);
    }));
    function focusSel(sel) { const b = el.querySelector(sel); if (b) b.focus({ preventScroll: true }); }
    el.querySelector('#cal-ics').addEventListener('click', () => download(yearList, `gsc-calendar-${st.scope}-${t}.ics`));
    el.querySelector('#cal-print').addEventListener('click', () => window.print());
    el.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => { const s = document.getElementById(b.dataset.jump); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    const ft = el.querySelector('.cal-ftoggle');
    ft.addEventListener('click', () => { filtersOpen = !filtersOpen; ft.setAttribute('aria-expanded', String(filtersOpen)); ft.parentElement.classList.toggle('open', filtersOpen); });
    root.addEventListener('click', onClick);
    if (key) {   // open the linked item where it is listed (month list first; a weekly series is listed under its first date)
      const sel = (p) => el.querySelector(`.cal-${p} .cal-item[data-keys~="${CSS.escape(key)}"]`);
      const li = sel('linked') || sel('year') || sel('soon');
      if (li) { toggle(li.querySelector('.cal-toggle'), true); setTimeout(() => li.scrollIntoView({ block: 'center' }), 0); }
    }
    function onClick(e) {
      const tg = e.target.closest('.cal-toggle'); if (tg) { toggle(tg); return; }
      const ib = e.target.closest('[data-ics]');
      if (ib) {   // the item, or every date of a weekly series
        const ks = (ib.closest('.cal-item').dataset.keys || ib.dataset.ics).split(' '), pool = yearList.concat(soon, linked);
        const list = ks.map((k) => pool.find((x) => x.key === k)).filter(Boolean);
        if (list.length) download(list, ib.dataset.ics.replace(/[^A-Za-z0-9-]+/g, '-') + '.ics');
        return;
      }
      // a tap anywhere else on a row (date, meta, empty space) opens or closes it; links, buttons, tooltip chips, the open
      // detail and text selections are left alone
      const li = e.target.closest('.cal-item');
      if (li && !e.target.closest('a, button, .cal-detail, [data-tip]') && !String(window.getSelection ? window.getSelection() : '')) toggle(li.querySelector('.cal-toggle'));
    }
  };
  function toggle(btn, force) {
    if (!btn) return;
    const open = force != null ? force : btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    const d = document.getElementById(btn.getAttribute('aria-controls')); if (d) d.hidden = !open;
    btn.closest('.cal-item').classList.toggle('open', open);
  }

  // ---------- Today page card ----------
  /** UI.comingUp(box, {limit = 5, scope = 'area65', days = 120, bare}) — compact "Coming up" card with countdowns. */
  UI.comingUp = function (box, opts) {
    if (!box) return;
    opts = opts || {};
    const t = todayStr(), list = upcoming({ limit: opts.limit || 5, scope: opts.scope || 'area65', days: opts.days || 120, distinct: true });
    const rows = list.map((o) => { const [d1, d2] = dateCol(o);
      return `<li><a href="#/calendar/${encodeURIComponent(o.key)}" class="cal-mini-row">
        <span class="cal-mini-date${o.approx ? ' approx' : ''}"><b>${esc(d1)}</b><small>${o.approx ? 'about' : esc(d2)}</small></span>
        <span class="cal-mini-title"><span ${mark(o.category, 'cal-dot')} aria-hidden="true"></span>${esc(o.title)}</span>
        <span class="cal-cd ${cdClass(o, t)}">${esc(countdown(o, t))}</span></a></li>`; }).join('');
    const inner = `<h3>Coming up <a class="small" href="#/calendar">Full calendar →</a></h3>
      ${rows ? `<ol class="cal-mini">${rows}</ol>` : UI.empty('Nothing on the calendar in the next few months.')}`;
    box.innerHTML = opts.bare ? inner : `<div class="card cal-mini-card">${inner}</div>`;
  };
})();
