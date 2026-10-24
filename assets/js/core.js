/* Core data layer: indexes the per-year Final Report rosters into areas, delegate terms, committees, trustees,
   staff and people, adds the board slates / Conference facts (board.json, conferences.json), and answers
   "where are we in the service cycle". Public API is documented in tools/YEAR_SCHEMA.md ("core.js API"). */
(function () {
  'use strict';
  const RAW = window.FCR_DATA || { years: {}, areas: [], regions: [] };
  const FCR = (window.FCR = window.FCR || {});
  FCR.RAW = RAW;
  const BOARD = RAW.board || {}, CONF = RAW.conferences || {};

  // ---------- misc helpers ----------
  /** Lower-case, strip accents and collapse punctuation: 'Québec' -> 'quebec', 'Lisa C.-D.' -> 'lisa c d'. */
  FCR.fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  FCR.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  FCR.store = {
    get(k, d) { try { const v = localStorage.getItem('fcr:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('fcr:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  // ---------- reference tables ----------
  // trustees / tc: the corresponding trustees' committee (FCR.TRUSTEES_COMMITTEES key) — Service Manual 2026–2028 pp. 46–48.
  // Policy/Admissions and Report and Charter have none (p. 47); Grapevine and La Viña meets with the AA Grapevine board.
  FCR.COMMITTEES = {
    AGENDA:       { name: 'Agenda', abbr: 'AGD', trustees: 'General Service Conference', tc: 'CONFERENCE' },
    CPC:          { name: 'Cooperation with the Professional Community', short: 'CPC', abbr: 'CPC', trustees: 'CPC/Treatment and Accessibilities', tc: 'CPCTA' },
    CORRECTIONS:  { name: 'Corrections', abbr: 'COR', trustees: 'Corrections', tc: 'CORRECTIONS' },
    FINANCE:      { name: 'Finance', abbr: 'FIN', trustees: 'Finance and Budgetary', tc: 'FINANCE' },
    GRAPEVINE:    { name: 'Grapevine and La Viña', short: 'Grapevine/La Viña', abbr: 'GV', trustees: 'AA Grapevine board (no trustees’ committee)', tc: 'GV_BOARD' },
    LITERATURE:   { name: 'Literature', abbr: 'LIT', trustees: 'Literature', tc: 'LITERATURE' },
    POLICY:       { name: 'Policy and Admissions', short: 'Policy/Admissions', abbr: 'P/A', trustees: '', tc: null },
    PI:           { name: 'Public Information', abbr: 'PI', trustees: 'Public Information', tc: 'PI' },
    REPORT:       { name: 'Report and Charter', abbr: 'R&C', trustees: '', tc: null },
    TREATMENT:    { name: 'Treatment and Accessibilities', short: 'Treatment/Accessibilities', abbr: 'T&A', trustees: 'CPC/Treatment and Accessibilities', tc: 'CPCTA' },
    TRUSTEES:     { name: 'Trustees', abbr: 'TRU', trustees: 'Nominating', tc: 'NOMINATING' },
    SPECIAL_NEEDS:{ name: 'Special Needs/Accessibilities', abbr: 'SN', trustees: 'CPC/Treatment and Accessibilities', tc: 'CPCTA' },
    ARCHIVES:     { name: 'Archives', abbr: 'ARC', trustees: 'Archives', tc: 'ARCHIVES', secondaryNow: true },
    ICRF:         { name: 'International Conventions/Regional Forums', short: 'Int’l Conventions/Regional Forums', abbr: 'IC/RF', trustees: 'International Conventions/Regional Forums', tc: 'ICRF', secondaryNow: true },
    OTHER:        { name: 'Other', abbr: 'OTH', trustees: '', tc: null },
  };
  // Trustees' committees (committees of the General Service Board). `re` matches every name printed in the 2017–2026
  // rosters; `cc` = the Conference committees each one pairs with (Service Manual pp. 58–60; Appendix C p. 109); `ref` =
  // where the Manual says a committee has no Conference counterpart. The Manual lists 10 standing + 4 auxiliary
  // committees; the rosters print 13: Compliance and Employees' Retirement are not printed, and the General Sharing
  // Session (`session`) is printed although it is a session the board holds each quarterly weekend, not a committee (p. 61).
  FCR.TRUSTEES_COMMITTEES = {
    CONFERENCE:    { name: 'General Service Conference', short: 'Conference', re: /^(general service )?conference$/i, cc: ['AGENDA'] },
    ARCHIVES:      { name: 'Archives', short: 'Archives', re: /^archives/i, cc: ['ARCHIVES'] },
    CPCTA:         { name: 'Cooperation with the Professional Community/Treatment and Accessibilities', short: 'CPC/T&A', re: /cooperation|c\.?\s?p\.?\s?c/i, cc: ['CPC', 'TREATMENT'] },
    CORRECTIONS:   { name: 'Corrections', short: 'Corrections', re: /^corrections/i, cc: ['CORRECTIONS'] },
    FINANCE:       { name: 'Finance and Budgetary', short: 'Finance & Budgetary', re: /financ/i, cc: ['FINANCE'] },
    ICRF:          { name: 'International Conventions/Regional Forums', short: 'IC/RF', re: /conventions|forums/i, cc: ['ICRF'] },
    LITERATURE:    { name: 'Literature', short: 'Literature', re: /^literature/i, cc: ['LITERATURE'] },
    NOMINATING:    { name: 'Nominating', short: 'Nominating', re: /^nominating/i, cc: ['TRUSTEES'] },
    PI:            { name: 'Public Information', short: 'Public Information', re: /^public information/i, cc: ['PI'] },
    INTERNATIONAL: { name: 'International', short: 'International', re: /^international$/i, cc: [], ref: 'p. 59' },
    AUDIT:         { name: 'Audit', short: 'Audit', re: /^audit/i, cc: [], auxiliary: true, ref: 'p. 60' },
    COMPENSATION:  { name: 'Compensation', short: 'Compensation', re: /^compensation/i, cc: [], auxiliary: true, ref: 'p. 60' },
    SHARING:       { name: 'General Sharing Session', short: 'Sharing Session', re: /sharing/i, cc: [], session: true, ref: 'p. 61; Appendix C, p. 109' },
  };
  /** Key of a printed trustees' committee name ('Finance & Budgetary' -> 'FINANCE'), null when unknown. */
  FCR.tcKey = (printed) => Object.keys(FCR.TRUSTEES_COMMITTEES).find((k) => FCR.TRUSTEES_COMMITTEES[k].re.test(String(printed || '').trim())) || null;
  FCR.PRIMARY_ORDER = ['AGENDA', 'CPC', 'CORRECTIONS', 'FINANCE', 'GRAPEVINE', 'LITERATURE', 'POLICY', 'PI', 'REPORT', 'TREATMENT', 'TRUSTEES'];
  FCR.cname = (id) => (FCR.COMMITTEES[id] || { name: id }).short || (FCR.COMMITTEES[id] || { name: id }).name;
  FCR.cabbr = (id) => (FCR.COMMITTEES[id] || { abbr: id }).abbr;

  FCR.REGIONS = (RAW.regions && RAW.regions.length ? RAW.regions : [
    { id: 'EC', name: 'East Central' }, { id: 'NE', name: 'Northeast' }, { id: 'SE', name: 'Southeast' },
    { id: 'WC', name: 'West Central' }, { id: 'SW', name: 'Southwest' }, { id: 'PA', name: 'Pacific' },
    { id: 'ECAN', name: 'Eastern Canada' }, { id: 'WCAN', name: 'Western Canada' },
  ]).map((r, i) => Object.assign({ slot: i + 1 }, r));
  FCR.regionBy = {};
  FCR.REGIONS.forEach((r) => { FCR.regionBy[r.id] = r; FCR.regionBy[r.name] = r; });
  FCR.regionColor = (rid) => { const r = FCR.regionBy[rid]; return r ? `var(--r${r.slot})` : 'var(--muted)'; };
  FCR.regionName = (rid) => (FCR.regionBy[rid] ? FCR.regionBy[rid].name : rid || '—');
  FCR.regionCountry = (rid) => (rid === 'ECAN' || rid === 'WCAN' ? 'CA' : rid ? 'US' : null);

  FCR.POSITIONS = {
    CLASS_A: 'Class A (nonalcoholic) trustee',
    REG_EAST_CENTRAL: 'East Central regional trustee', REG_NORTHEAST: 'Northeast regional trustee',
    REG_SOUTHEAST: 'Southeast regional trustee', REG_WEST_CENTRAL: 'West Central regional trustee',
    REG_SOUTHWEST: 'Southwest regional trustee', REG_PACIFIC: 'Pacific regional trustee',
    REG_EASTERN_CANADA: 'Eastern Canada regional trustee', REG_WESTERN_CANADA: 'Western Canada regional trustee',
    TAL_US: 'Trustee-at-large/U.S.', TAL_CANADA: 'Trustee-at-large/Canada', GST: 'General service trustee',
    GSB_CHAIR: 'GSB chair (Class B — additional 22nd seat)',
    DIR_AAWS: 'AAWS nontrustee director', DIR_GRAPEVINE: 'AA Grapevine nontrustee director', OTHER: 'Other',
  };
  // Standard term lengths (years) used when projecting rotation; overridden by data/rules when present.
  // GSB chair: four-year term. A Class B chair sits in an extra seat (board = 22); a Class A chair uses one of the 7 Class A seats (board = 21).
  FCR.TERM_YEARS = Object.assign({ CLASS_A: 6, REG: 4, TAL_US: 4, TAL_CANADA: 4, GST: 4, GSB_CHAIR: 4, DIR_AAWS: 4, DIR_GRAPEVINE: 4 }, RAW.termYears || {});
  /** Board size for a year: 7 Class A + 14 Class B, plus one when the chair is a Class B member. */
  FCR.boardSize = function (year) {
    const Y = FCR.Y(year) || {};
    const ts = (Y.trustees || []).filter((t) => !t.emeritus);
    const a = ts.filter((t) => t.class === 'A').length, b = ts.filter((t) => t.class === 'B').length;
    const chairB = ts.some((t) => t.position_id === 'GSB_CHAIR');
    return { a, b, total: a + b, chairB };
  };
  FCR.termFor = (pid) => (pid && pid.startsWith('REG_') ? FCR.TERM_YEARS.REG : FCR.TERM_YEARS[pid] || 4);
  /** 'trustee' | 'director' | 'chair' — the kind of seat a position id stands for (official counts keep them apart). */
  FCR.seatKind = (pid) => (pid === 'GSB_CHAIR' ? 'chair' : pid && pid.startsWith('DIR_') ? 'director' : 'trustee');

  // ---------- years ----------
  FCR.years = Object.keys(RAW.years || {}).map(Number).sort((a, b) => a - b);
  FCR.latestYear = FCR.years[FCR.years.length - 1];
  FCR.Y = (y) => (RAW.years || {})[y];
  FCR.panelYears = (p) => [p + 1950, p + 1951];
  FCR.panelOf = (year, second) => (second ? year - 1951 : year - 1950);
  FCR.ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

  // ---------- areas ----------
  FCR.areas = {};
  (RAW.areas || []).forEach((a) => { FCR.areas[a.n] = a; });
  // Fill gaps from roster data (names only) so the app works before areas.json is complete.
  FCR.years.forEach((y) => (FCR.Y(y).delegates || []).forEach((d) => {
    if (!FCR.areas[d.area]) FCR.areas[d.area] = { n: d.area, name: d.area_name, region: null };
  }));
  FCR.areaList = Object.values(FCR.areas).sort((a, b) => a.n - b.n);
  FCR.areaLabel = (n) => { const a = FCR.areas[n]; return a ? `Area ${n} · ${a.name}` : `Area ${n}`; };
  FCR.areaRegion = (n) => (FCR.areas[n] || {}).region || null;

  // ---------- names, aliases and identity ----------
  // "James (Jimmy) D." ~ "Jimmy D." ~ "James D."; "Al J. M." ~ "Al M."; "Judith Ann K." ~ "Judith K.";
  // plus the alias groups from corrections.json ('Molly A. A.' ~ 'Molly O.' ~ 'Molly Ann O.', 'Clint M.' ~ 'Clinton M.').
  FCR.normName = (n) => (n || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-zà-ÿ\s]/g, ' ').replace(/\s+/g, ' ').trim();
  FCR.nameParts = function (n) {
    n = String(n || '');
    const nick = (n.match(/\(([^)]+)\)/) || [])[1];
    let toks = n.replace(/\(.*?\)/g, ' ').trim().split(/\s+/).filter(Boolean);
    const t2 = toks.filter((t) => !/^(hon|sr|sister)\.?$/i.test(t)); if (t2.length) toks = t2; // 'Hon. Kerry M.', 'Sr. Judith K.'
    const last = toks.length > 1 ? toks[toks.length - 1].replace(/[^A-Za-zÀ-ÿ]/g, '').charAt(0).toLowerCase() : '';
    const firsts = new Set([toks[0], nick].filter(Boolean).map((x) => x.toLowerCase().replace(/[^a-zà-ÿ-]/g, '')));
    return { firsts, last };
  };
  const ALIAS = {}; // normName -> group index
  FCR.ALIASES = (RAW.aliases || []).map((g, i) => { g.names.forEach((n) => { ALIAS[FCR.normName(n)] = i; }); return g; });
  const partsMemo = new Map(), groupMemo = new Map(); // sameName runs ~10^5 times while indexing: memoise the parsing
  const parts = (n) => { let p = partsMemo.get(n); if (!p) partsMemo.set(n, (p = FCR.nameParts(n))); return p; };
  function basicSame(a, b) {
    const A = parts(a), B = parts(b);
    if (!A.last || A.last !== B.last) return false;
    for (const f of A.firsts) if (B.firsts.has(f)) return true;
    return false;
  }
  /** Alias group index of a printed name (exact spelling or a nickname-compatible one), -1 if none. */
  const groupOf = (n) => {
    if (groupMemo.has(n)) return groupMemo.get(n);
    let g = ALIAS[FCR.normName(n)];
    if (g == null) g = FCR.ALIASES.findIndex((x) => x.names.some((m) => basicSame(m, n)));
    groupMemo.set(n, g); return g;
  };
  /** True when two printed names can be the same person (nickname-aware and alias-aware; NOT identity — see personGroups). */
  FCR.sameName = function (a, b) {
    if (!a || !b) return false;
    if (basicSame(a, b)) return true;
    const ga = groupOf(a);
    return ga >= 0 && (groupOf(b) === ga || FCR.ALIASES[ga].names.some((n) => basicSame(n, b)));
  };
  /** Canonical spelling of a name (first name of its alias group) or the name itself. */
  FCR.canonName = function (n) { const g = groupOf(n); return g >= 0 ? FCR.ALIASES[g].canonical || FCR.ALIASES[g].names[0] : n; };
  /** Every alias-group spelling of a name (including the name). */
  FCR.nameVariants = function (n) { const g = groupOf(n); return g >= 0 ? [...new Set([n].concat(FCR.ALIASES[g].names))] : [n]; };
  FCR.DISTINCT = RAW.distinctPeople || [];

  // ---------- delegate terms (area × panel) ----------
  const terms = {};
  const tkey = (a, p) => a + '-' + p;
  const newTerm = (area, panel, name) => ({ area, panel, name, city: '', years: [], committees: {}, secondary: {}, roles: {}, electedRoles: {}, statusByYear: {}, namesByYear: {}, cityByYear: {}, attended: {}, names: [], delegateChair: [] });
  const addName = (t, n) => { if (n && !t.names.includes(n)) t.names.push(n); };
  FCR.years.forEach((y) => {
    const Y = FCR.Y(y);
    (Y.delegates || []).forEach((d) => {
      if (!d.panel) return;
      const k = tkey(d.area, d.panel);
      const t = terms[k] || (terms[k] = newTerm(d.area, d.panel, d.name));
      if (d.name && d.status !== 'vacant') {
        // A seated alternate attends for the elected delegate, who still holds the term.
        t.name = d.status === 'alternate' && d.elected_delegate ? d.elected_delegate : d.name;
        if (d.status !== 'alternate' || !d.elected_delegate) t.city = d.city || t.city;
        t.namesByYear[y] = d.name; t.cityByYear[y] = d.city || '';
        if (d.status === 'alternate') t.attended[y] = { name: d.name, status: 'alternate', for: d.elected_delegate || null, inferred: !!d.status_inferred };
      }
      [d.name, d.printed_name, d.elected_delegate].forEach((n) => addName(t, n));
      t.years.push(y); t.statusByYear[y] = d.status || 'delegate';
    });
    (Y.conference_committees || []).forEach((c) => (c.members || []).forEach((m) => {
      if (m.area == null) return;
      const p = m.panel || ((Y.delegates || []).find((d) => d.area === m.area) || {}).panel;
      if (!p) return;
      const k = tkey(m.area, p);
      const t = terms[k] || (terms[k] = Object.assign(newTerm(m.area, p, m.name), { years: [y] }));
      addName(t, m.name); addName(t, m.printed_name);
      if (c.secondary) (t.secondary[y] = t.secondary[y] || []).push(c.committee);
      else t.committees[y] = c.committee;
      if (m.role === 'chair' || m.role === 'alt_chair') {
        const rs = (t.roles[y] = t.roles[y] || []);
        const ex = rs.find((r) => r.committee === c.committee);
        if (ex) { ex.role = m.role; delete ex.elected; } else rs.push({ committee: c.committee, role: m.role });
      }
    }));
  });
  // "<year+1> Chairpersons and Alternates" tables: an elected role is shown for year+1 only when that year's roster
  // is not loaded yet or does not print a different holder (2024 Corrections: Gerry W. was elected alternate, but
  // left as delegate and Tim H. served — the roster wins). Every election is kept in t.electedRoles.
  FCR.years.forEach((y) => {
    const Y = FCR.Y(y), N = FCR.Y(y + 1);
    (Y.next_year_chairs || []).forEach((nc) => {
      ['chair', 'alternate'].forEach((k2) => {
        const p = nc[k2]; if (!p || p.area == null) return;
        const role = k2 === 'chair' ? 'chair' : 'alt_chair';
        const t = terms[tkey(p.area, y - 1950)]; if (!t) return;
        addName(t, p.name); addName(t, p.printed_name);
        (t.electedRoles[y + 1] = t.electedRoles[y + 1] || []).push({ committee: nc.committee, role, electedAt: y });
        const nc1 = N && (N.conference_committees || []).find((c) => c.committee === nc.committee);
        const holder = nc1 && (nc1.members || []).find((m) => m.role === role);
        if (holder && holder.area !== p.area) { t.electedRoles[y + 1][t.electedRoles[y + 1].length - 1].notServed = true; return; }
        const rs = (t.roles[y + 1] = t.roles[y + 1] || []);
        if (!rs.some((r) => r.committee === nc.committee)) rs.push({ committee: nc.committee, role, elected: true });
      });
    });
  });
  Object.values(terms).forEach((t) => {
    t.years = [...new Set(t.years)].sort();
    const cs = Object.values(t.committees);
    t.committee = cs.length ? mode(cs) : null;              // primary committee for the term
    t.secondaryList = [...new Set([].concat(...Object.values(t.secondary)))];
    t.firstYear = t.panel + 1950; t.lastYear = t.panel + 1951;
    addName(t, t.name);
  });
  function mode(arr) { const c = {}; arr.forEach((x) => (c[x] = (c[x] || 0) + 1)); return Object.keys(c).sort((a, b) => c[b] - c[a])[0]; }
  FCR.terms = terms;
  FCR.term = (a, p) => terms[tkey(a, p)];
  /** Name/city of the person who actually served the term in year y (alternates can replace delegates mid-term). */
  FCR.termName = (t, y) => (y && t.namesByYear && t.namesByYear[y]) || t.name;
  FCR.termCity = (t, y) => (y && t.cityByYear && t.cityByYear[y] != null ? t.cityByYear[y] : t.city) || '';
  FCR.termsByArea = {};
  Object.values(terms).forEach((t) => (FCR.termsByArea[t.area] = FCR.termsByArea[t.area] || []).push(t));
  Object.values(FCR.termsByArea).forEach((l) => l.sort((a, b) => a.panel - b.panel));
  FCR.panels = [...new Set(Object.values(terms).map((t) => t.panel))].sort((a, b) => a - b);
  FCR.areaParity = (n) => { const l = FCR.termsByArea[n] || []; return l.length ? l[l.length - 1].panel % 2 : null; };

  // ---------- Conferences: facts, real dates, delegate chairs (conferences.json + year files) ----------
  const isoDate = (s, hour) => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1, hour == null ? 12 : hour) : null; };
  const futureBy = {}; (CONF.future || []).forEach((f) => { futureBy[f.year] = f; });
  /** Start/end Dates of the Conference of a year: conferences.json (held or announced), else an approximate late-April week. */
  FCR.conferenceDates = function (year) {
    const c = (CONF.years || {})[year] || futureBy[year];
    if (c && c.start && c.end) return { start: isoDate(c.start), end: isoDate(c.end), approx: c.status === 'preference', known: true };
    return { start: new Date(year, 3, 24, 12), end: new Date(year, 3, 30, 12), approx: true, known: false };
  };
  /** Everything known about one Conference (held or future). See YEAR_SCHEMA.md for the shape. */
  FCR.conference = function (year) {
    year = +year;
    const c = (CONF.years || {})[year] || futureBy[year] || {};
    const Y = FCR.Y(year) || {}, P = FCR.Y(year - 1) || {}, Pc = (CONF.years || {})[year - 1] || {};
    const dt = FCR.conferenceDates(year), now = FCR.today();
    const chair = Y.conference_chair || P.next_conference_chair || c.delegate_chair || null;
    return Object.assign({}, c, {
      year, ordinal: year - 1950,
      theme: c.theme || Y.theme || (Pc.next && Pc.next.theme) || null,
      start: dt.known ? (c.start || null) : null, end: dt.known ? (c.end || null) : null,
      startDate: dt.start, endDate: dt.end, approx: dt.approx, datesKnown: dt.known,
      dates: Y.dates || null,
      venue: c.venue || Y.location || null,
      presentations: (Pc.next && Pc.next.topics) || c.topics || null,
      workshop: c.workshop || (Pc.next && Pc.next.workshop) || null,
      delegateChair: chair ? { name: chair.name, area: chair.area } : null,
      nextDelegateChair: Y.next_conference_chair || null, nextAltDelegateChair: Y.next_conference_alt_chair || null,
      hasReport: !!FCR.Y(year), isFuture: !FCR.Y(year) && now < dt.end,
      over: now >= new Date(dt.end.getFullYear(), dt.end.getMonth(), dt.end.getDate(), 0),
      status: FCR.Y(year) ? 'held' : c.status || (dt.known ? 'final' : 'unknown'),
    });
  };
  /** The announced future Conferences (77th–80th) as FCR.conference() objects, earliest first. */
  FCR.futureConferences = () => (CONF.future || []).map((f) => FCR.conference(f.year)).sort((a, b) => a.year - b.year);
  /** Delegate chairs (and alternates where printed) 2009, 2010, 2017–2027 with area/region/country/source. */
  FCR.delegateChairs = function () {
    const list = (CONF.delegate_chairs || []).map((d) => Object.assign({}, d));
    const have = new Set(list.map((d) => d.conference_year));
    FCR.years.forEach((y) => {   // fill from the year files if conferences.json lacks a year
      const c = FCR.Y(y).conference_chair, n = FCR.Y(y).next_conference_chair;
      if (c && !have.has(y)) { list.push({ conference_year: y, ordinal: y - 1950, name: c.name, area: c.area, source: `${y} report` }); have.add(y); }
      if (n && !have.has(y + 1)) { list.push({ conference_year: y + 1, ordinal: y + 1 - 1950, name: n.name, area: n.area, source: `${y} report` }); have.add(y + 1); }
    });
    return list.map((d) => {
      d.region = d.region || FCR.areaRegion(d.area); d.country = d.country || FCR.regionCountry(d.region);
      d.panel = d.conference_year - 1951; d.areaName = (FCR.areas[d.area] || {}).name || '';
      if (d.alternate) { d.alternate = Object.assign({}, d.alternate); d.alternate.region = d.alternate.region || FCR.areaRegion(d.alternate.area); d.alternate.country = d.alternate.country || FCR.regionCountry(d.alternate.region); }
      return d;
    }).sort((a, b) => a.conference_year - b.conference_year);
  };
  // Delegate chair roles on the terms (chairs the Conference as a second-year delegate: panel = year - 1951).
  FCR.delegateChairs().forEach((d) => {
    [['chair', d], ['alternate', d.alternate]].forEach(([role, p]) => {
      if (!p || p.area == null) return;
      const t = terms[tkey(p.area, d.conference_year - 1951)];
      if (t) { t.delegateChair.push({ year: d.conference_year, role, ordinal: d.conference_year - 1950 }); addName(t, p.name); }
    });
  });

  // ---------- service-cycle clock ----------
  // "?today=YYYY-MM-DD" shows the app as of another date (handy for learning the yearly cycle, and for testing).
  const asOfParam = (() => { try { const m = /[?&]today=(\d{4})-(\d{2})-(\d{2})/.exec(window.location.search || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; } catch (e) { return null; } })();
  FCR.asOfOverride = asOfParam;
  FCR.today = () => (asOfParam ? new Date(asOfParam) : new Date());
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0);
  FCR.cycle = function (now) {
    now = now || FCR.today();
    const y = now.getFullYear();
    const latest = FCR.latestYear;
    // The Conference meets late April / early May (real dates from conferences.json); "over" from its closing day.
    const cd = FCR.conferenceDates(y);
    const confOver = now >= dayStart(cd.end);
    const inSession = !confOver && now >= dayStart(cd.start);
    const nextConf = Math.max((latest || y - 1) + 1, confOver ? y + 1 : y);
    const nd = FCR.conferenceDates(nextConf);
    const lastConf = confOver ? y : y - 1;
    return {
      now, year: y, latestData: latest, nextConference: nextConf, nextOrdinal: nextConf - 1950,
      // the last Conference held has met but its Final Report isn't loaded yet (stays true Jan–Apr of the next year)
      reportPending: latest < lastConf,
      servingPanels: [y - 1951, y - 1950],          // terms run Jan 1 of (panel+1950) to Dec 31 of (panel+1951)
      rotatingPanel: y - 1951,                       // ends Dec 31 this year
      electPanel: y - 1949,                          // elected this fall, takes office Jan 1 next year
      nextConfPanels: [nextConf - 1951, nextConf - 1950],
      confOver, inSession, lastConference: lastConf,
      nextStart: nd.start, nextEnd: nd.end, nextDatesKnown: nd.known,
      // whole calendar days (round, not ceil: a span across a DST change is N days ± 1 h)
      daysToNext: Math.max(0, Math.round((dayStart(nd.start) - dayStart(now)) / 864e5)),
    };
  };

  // ---------- delegate-elects (from area websites / the user) ----------
  // The file describes ONE panel (panelElectsMeta.panel). Before Jan 1 of panel+1950 they are delegate-elects;
  // during panel+1950/+1951 they are serving delegates (until a Final Report lists them).
  (function () {
    const meta = RAW.panelElectsMeta || {};
    const asOf = meta.as_of ? +String(meta.as_of).slice(0, 4) : null;
    const P = meta.panel || (asOf ? asOf - 1949 : null);
    const list = (RAW.panelElects || []).map((e) => Object.assign({}, e, {
      delegate: e.delegate || (P ? e['panel' + P + '_delegate'] : null) || null,
      alternate: e.alternate || (P ? e['panel' + P + '_alternate'] : null) || null,
    }));
    const byArea = {}; list.forEach((e) => (byArea[e.area] = e));
    FCR.elects = { panel: P, asOf: meta.as_of || null, list, byArea };
  })();
  FCR.electsFor = (panel) => (FCR.elects.panel != null && panel === FCR.elects.panel ? FCR.elects.byArea : {});
  /** 'elect' before the panel takes office, 'serving' during its term, 'past' afterwards, null if no data. */
  FCR.electStage = function (cyc) {
    const P = FCR.elects.panel; if (P == null || !FCR.elects.list.length) return null;
    cyc = cyc || FCR.cycle();
    if (cyc.year < P + 1950) return 'elect';
    if (cyc.year <= P + 1951) return 'serving';
    return 'past';
  };

  // ---------- staff assignments by year (from committee secretaries + staff list) ----------
  /** Normalise a committee's secretary fields to [{name, label}] (strings, "Name (role)", objects with for/note). */
  const secs = function (c) {
    const raw = c.secretaries && c.secretaries.length ? c.secretaries : String(c.secretary || '').split(/\s*[;,]\s*(?=[A-Z\u00C0-\u00DD])/);
    return raw.filter(Boolean).map((x) => {
      if (typeof x === 'object') return { name: x.name, label: x.for || String(x.note || '').replace(/^(interim\s+)?secretary,?\s*/i, '') };
      const m = String(x).trim().match(/^(.*\S)\s*\(([^)]*)\)\s*$/); // trailing "(role)" only, not a nickname
      return m && /\.$/.test(m[1].trim()) ? { name: m[1].trim(), label: m[2] } : { name: String(x).trim(), label: '' };
    }).filter((x) => x.name);
  };
  FCR.secretaries = secs;
  FCR.staffByYear = function () {
    const out = {};
    FCR.years.forEach((y) => {
      const Y = FCR.Y(y); const m = (out[y] = {});
      (Y.gso_staff || []).forEach((s) => { m[s.name] = new Set(s.assignments || []); });
      (Y.conference_committees || []).forEach((c) => secs(c).forEach((x) => (m[x.name] = m[x.name] || new Set()).add('Conf. ' + FCR.cname(c.committee) + (x.label ? ' (' + x.label + ')' : ''))));
      (Y.trustees_committees || []).forEach((c) => secs(c).forEach((x) => (m[x.name] = m[x.name] || new Set()).add('Trustees’ ' + c.committee + (x.label ? ' (' + x.label + ')' : ''))));
    });
    return out;
  };

  // ---------- board slates (board.json): who holds office after each annual meeting ----------
  const slates = (BOARD.slates || []).slice().sort((a, b) => a.conference_year - b.conference_year);
  const slateDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s.meeting_date || '') ? isoDate(s.meeting_date, 0) : FCR.conferenceDates(s.conference_year).end);
  const TITLE_ORDER = ['Chair', 'Interim Chair', 'First Vice-Chair', 'Second Vice-Chair', 'Treasurer', 'Secretary', 'Assistant Treasurer', 'Assistant Secretary'];
  const normTitle = (t) => { const s = String(t || '').toLowerCase(); return s.includes('interim') ? 'Interim Chair' : /^chair/.test(s) ? 'Chair' : /first/.test(s) ? 'First Vice-Chair' : /second/.test(s) ? 'Second Vice-Chair' : /assistant tr/.test(s) ? 'Assistant Treasurer' : /assistant sec/.test(s) ? 'Assistant Secretary' : /treas/.test(s) ? 'Treasurer' : /secret/.test(s) ? 'Secretary' : t; };
  FCR.slates = slates;
  /** The board as elected at the latest annual meeting on/before `date` (Date or 'YYYY-MM-DD'; default today).
      Returns {asOf, conferenceYear, source:'slate'|'printed', ref, officers:[{title,name,...}], byTitle, trustees:{A,B},
      aaws, grapevine, boardChairs:{aaws, grapevine}} or null when nothing is known. */
  FCR.currentOfficers = function (date) {
    const d = date ? (typeof date === 'string' ? isoDate(date) : date) : FCR.today();
    const s = slates.filter((x) => slateDate(x) <= d).pop();
    let out;
    if (s) {
      out = { asOf: s.meeting_date, approx: !!s.date_approx, conferenceYear: s.conference_year, source: 'slate', ref: s.ref,
        officers: (s.gsb_officers || []).map((o) => Object.assign({}, o, { title: normTitle(o.title) })),
        trustees: { A: (s.gsb_trustees.A || []).map((p) => p.name), B: (s.gsb_trustees.B || []).map((p) => p.name) },
        aaws: (s.aaws_directors || []).map((p) => Object.assign({}, p)), grapevine: (s.grapevine_directors || []).map((p) => Object.assign({}, p)), notes: s.notes || '' };
    } else {
      const y = FCR.years[0], Y = FCR.Y(y) || {};
      if (!(Y.gsb_officers || []).length) return null;
      out = { asOf: null, conferenceYear: y - 1, source: 'printed', ref: `${y} report officers list`, officers: Y.gsb_officers.map((o) => ({ title: normTitle(o.title), name: o.name })), trustees: null, aaws: Y.aaws_directors || [], grapevine: Y.grapevine_directors || [] };
    }
    // Interim chairs (board.json gsb_chairs): a chair who left mid-year (served_thru 'Jan. 2023' = through the end of
    // that month) or a slate printed '(vacant)' gives way to the interim chair of that slate period. from === to means
    // "interim until that year's annual meeting" (Jimmy D. Jan–Apr 2023); otherwise from..to (Mike L. Apr 2023–Apr 2024).
    {
      const chairs = BOARD.gsb_chairs || [];
      const ci = out.officers.findIndex((o) => o.title === 'Chair'), cur = ci >= 0 ? out.officers[ci] : null;
      const endOf = (st) => { const m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/.exec(st || ''); const mi = m ? 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[1].toLowerCase()) : -1; return mi >= 0 && mi % 3 === 0 ? new Date(+m[2], mi / 3 + 1, 1, 0) : null; };
      const rc = cur && chairs.find((c) => c.served_thru && FCR.sameName(c.name, cur.name)), rcEnd = rc && endOf(rc.served_thru), gone = !!(rcEnd && d >= rcEnd);
      if (cur && (gone || /^\(/.test(cur.name))) {
        const y = out.conferenceYear;
        const ic = chairs.find((c) => c.interim && (c.from === c.to ? c.from - 1 === y : c.from <= y && y < c.to));
        if (ic) out.officers[ci] = { title: 'Interim Chair', name: ic.name, interim: true, ref: ic.ref };
        else if (gone) out.officers.splice(ci, 1);   // no chair known: leave the title out rather than print a placeholder
      }
    }
    out.officers.sort((a, b) => TITLE_ORDER.indexOf(a.title) - TITLE_ORDER.indexOf(b.title));
    out.byTitle = {}; out.officers.forEach((o) => { out.byTitle[o.title] = o.name; });
    out.boardChairs = { aaws: boardChair('aaws', out.conferenceYear), grapevine: boardChair('grapevine', out.conferenceYear) };
    return out;
  };
  /** Corporate-board chair for the year after annual meeting Y: printed in report Y+1 if loaded, else the alternation
      pattern (regional trustee in year 3 <-> general service trustee, 10 of 10 years) as a labelled guess. */
  function boardChair(which, Y) {
    const key = which === 'aaws' ? 'aaws_directors' : 'grapevine_directors';
    const chairIn = (yr) => ((FCR.Y(yr) || {})[key] || []).find((d) => /chair/i.test(d.role || ''));
    const pr = chairIn(Y + 1);
    if (pr) return { name: pr.name, status: 'printed', period: `${Y}–${String(Y + 1).slice(2)}`, ref: `${Y + 1} report` };
    const prev = chairIn(Y);
    const prevType = prev ? (/general service/i.test(prev.role) ? 'GST' : /regional/i.test(prev.role) ? 'REG' : null) : null;
    const type = prevType === 'GST' ? 'REG' : prevType === 'REG' ? 'GST' : null;
    const s = slates.find((x) => x.conference_year === Y);
    const members = s ? (s[key] || []).map((p) => p.name) : [];
    const pos = FCR.positionHistory().filter((p) => p.isCurrent && members.some((m) => FCR.sameName(m, p.name)));
    const cands = pos.filter((p) => (type === 'GST' ? p.pid === 'GST' : type === 'REG' ? p.pid.startsWith('REG_') && Y - p.start === 2 : false)).map((p) => p.name);
    return { name: null, status: 'not published', period: `${Y}–${String(Y + 1).slice(2)}`, previous: prev ? prev.name : null,
      pattern: type ? { type, candidates: cands, text: type === 'GST' ? 'pattern: a general service trustee' : 'pattern: a regional trustee in their third year' } : null };
  }

  // ---------- trustees / board positions over time ----------
  const chairsA = (BOARD.gsb_chairs || []).filter((c) => c.class === 'A' && c.chair_since);
  const assignments = BOARD.board_assignments || [];
  let posMemo = null;
  /** One slot per person-in-seat with term start/end, projected rotation and flags (see YEAR_SCHEMA.md). Memoised. */
  FCR.positionHistory = function () {
    if (posMemo) return posMemo.slice();
    const slots = [];
    const firstOf = (n) => [...FCR.nameParts(n).firsts];
    const find = (pid, name, y, since) => {
      const direct = slots.find((s) => s.pid === pid && s.aliases.some((al) => FCR.sameName(al, name)));
      if (direct || y == null) return direct;
      // Same seat, continuous years, first name matches loosely (Charles/Charlie, Irma V. / Irma V. B.-N.)
      return slots.find((s) => {
        if (s.pid !== pid || s.years.includes(y)) return false;
        const last = s.years.length ? s.years[s.years.length - 1] : null;
        const cont = last === y - 1 || s.electedAfter === y - 1 || s.electedAfter === y;
        if (!cont) return false;
        if (since && s.elected && since !== s.elected) return false;
        const A = firstOf(name), B = s.aliases.flatMap(firstOf);
        return A.some((a) => B.some((b) => a && b && (a === b || (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4)))));
      });
    };
    const boardOf = (t, y) => {   // which corporate board a general service trustee serves (AAWS / Grapevine)
      if (t.board) return /grape/i.test(t.board) ? 'Grapevine' : 'AAWS';
      const r = (t.board_roles || []).join(' ');
      if (/aaws/i.test(r)) return 'AAWS';
      if (/grapevine/i.test(r)) return 'Grapevine';
      const Y = FCR.Y(y) || {};
      if ((Y.aaws_directors || []).some((d) => FCR.sameName(d.name, t.name))) return 'AAWS';
      if ((Y.grapevine_directors || []).some((d) => FCR.sameName(d.name, t.name))) return 'Grapevine';
      const a = assignments.find((x) => x.year <= y && x.role === 'general_service_trustee' && FCR.sameName(x.person, t.name));
      return a ? a.board : null;
    };
    FCR.years.forEach((y) => {
      const Y = FCR.Y(y);
      const list = [].concat(
        (Y.trustees || []).filter((t) => !t.emeritus).map((t) => Object.assign({ _src: 'trustee' }, t)),
        (Y.nontrustee_directors || []).map((t) => Object.assign({ _src: 'director', class: 'B', position_id: /grape/i.test(t.board || '') ? 'DIR_GRAPEVINE' : 'DIR_AAWS' }, t))
      );
      list.forEach((t) => {
        const pid = t.position_id || 'OTHER';
        const since = t.seat_since || t.elected_year || null;
        let s = find(pid, t.name, y, since);
        if (!s) slots.push((s = { pid, name: t.name, aliases: [t.name], class: t.class, years: [], elected: since, rotatingYear: null, past: t.past_delegate || null, city: t.city, latest: t, boardByYear: {} }));
        if (!s.aliases.includes(t.name)) s.aliases.push(t.name);
        if (!s.years.includes(y)) s.years.push(y);
        s.latest = t; s.latestYear = y; s.name = t.name; if (since) s.elected = since;
        if (t.rotating) s.rotatingYear = y;
        if (t.past_delegate && t.past_delegate.area) s.past = t.past_delegate;
        if (t.city) s.city = t.city;
        if (pid === 'GST') { const b = boardOf(t, y); if (b) s.boardByYear[y] = b; }
      });
      (Y.newly_elected || []).forEach((t) => {
        const pid = t.position_id || 'OTHER';
        const s = find(pid, t.name);
        const b = pid === 'GST' ? boardOf(t, y) : null;
        if (!s) slots.push({ pid, name: t.name, aliases: [t.name], class: t.class || (pid === 'CLASS_A' ? 'A' : 'B'), years: [], elected: t.seat_since || y, rotatingYear: null, past: t.past_delegate || null, city: t.city, latest: t, latestYear: y, electedAfter: y, boardByYear: b ? { [y]: b } : {}, succeeds: t.succeeds || null });
        else { if (!s.elected) s.elected = y; if (!s.aliases.includes(t.name)) s.aliases.push(t.name); if (b && !s.boardByYear[y]) s.boardByYear[y] = b; }
      });
    });
    // A director who moves up to a trustee seat (newly_elected Y, any non-DIR position) leaves the DIR seat at Y.
    FCR.years.forEach((y) => (FCR.Y(y).newly_elected || []).forEach((n) => {
      if (!n.position_id || n.position_id.startsWith('DIR_')) return;
      slots.filter((s) => s.pid.startsWith('DIR_') && s.aliases.some((al) => FCR.sameName(al, n.name)) && !s.years.some((x) => x > y))
        .forEach((s) => { if (!s.movedUpYear || y < s.movedUpYear) { s.movedUpYear = y; s.movedTo = n.position_id; } });
    }));
    const latest = FCR.latestYear;
    posMemo = slots.map((s) => {
      // A "rotating" mark contradicted by a later appearance in the same seat is ignored.
      if (s.rotatingYear && s.years.some((y) => y > s.rotatingYear)) s.rotatingYear = null;
      const term = FCR.termFor(s.pid);
      let start = s.elected || (s.years.length ? s.years[0] : null);
      // Class A GSB chair: the four-year chair term runs over and above the Class A term (Service Manual p.69).
      const ch = s.pid === 'CLASS_A' ? chairsA.find((c) => s.aliases.some((al) => FCR.sameName(al, c.name))) : null;
      if (ch) {
        s.chairSince = ch.chair_since; s.chairEnd = ch.chair_since + FCR.TERM_YEARS.GSB_CHAIR;
        // a past Class A trustee selected as chair (Michele G.: Class A 2010-16, chair 2017-21): the seat is the chair term
        if (start && start + FCR.TERM_YEARS.CLASS_A <= ch.chair_since) { s.priorClassA = { start, end: start + FCR.TERM_YEARS.CLASS_A }; start = ch.chair_since; }
      }
      const fullEnd = ch ? s.chairEnd : start ? start + term : null;
      // served_thru on the last record ("thru Jan. 2023") ends the seat in that year.
      const thru = s.latest && s.latest.served_thru && /(\d{4})/.exec(String(s.latest.served_thru));
      s.leftYear = thru && s.latestYear === s.years[s.years.length - 1] ? +thru[1] : null;
      s.servedThru = s.leftYear ? s.latest.served_thru : null;
      const projectedEnd = s.rotatingYear || s.movedUpYear || s.leftYear || fullEnd;
      const lastSeen = s.years.length ? s.years[s.years.length - 1] : null;
      const isCurrent = !s.rotatingYear && !s.leftYear && !(s.movedUpYear && s.movedUpYear <= latest) && (lastSeen === latest || s.electedAfter === latest);
      const left = !s.rotatingYear && !s.movedUpYear && !s.leftYear && !isCurrent && lastSeen != null ? lastSeen : null; // vanished without a rotation mark
      const end = left || projectedEnd;
      const bys = Object.keys(s.boardByYear || {}).map(Number).sort((a, b) => a - b);
      s.board = s.pid === 'GST' ? (bys.length ? s.boardByYear[bys[bys.length - 1]] : null) : s.pid === 'DIR_AAWS' ? 'AAWS' : s.pid === 'DIR_GRAPEVINE' ? 'Grapevine' : null;
      s.seat = FCR.seatKind(s.pid);
      // Class A trustees serve up to two 3-year terms: the first-term end is a soft marker (may continue).
      if (s.pid === 'CLASS_A' && start && !ch) { s.firstTermEnd = start + 3; s.firstTermSoft = true; }
      s.label = FCR.positionLabel(s);
      return Object.assign(s, { start, end, term, isCurrent, leftEarly: (s.leftYear || left || s.movedUpYear) ? (s.leftYear || left || s.movedUpYear) < fullEnd : false, fullEnd });
    });
    return posMemo.slice();
  };
  /** Display label for a slot / position id + board: 'General service trustee (AAWS)'. */
  FCR.positionLabel = function (s) {
    const pid = typeof s === 'string' ? s : s.pid;
    const base = FCR.POSITIONS[pid] || pid;
    return pid === 'GST' && s && s.board ? `${base} (${s.board === 'Grapevine' ? 'AA Grapevine' : 'AAWS'})` : base;
  };

  // ---------- region helpers ----------
  FCR.REGION_SEAT = { EC: 'REG_EAST_CENTRAL', NE: 'REG_NORTHEAST', SE: 'REG_SOUTHEAST', WC: 'REG_WEST_CENTRAL', SW: 'REG_SOUTHWEST', PA: 'REG_PACIFIC', ECAN: 'REG_EASTERN_CANADA', WCAN: 'REG_WESTERN_CANADA' };
  /** Service Manual election calendar (rules.json) for a position id, e.g. REG_SOUTHWEST -> {election_years:[...]}. */
  const scheduleFor = (pid) => ((RAW.rules && RAW.rules.regional_trustee_schedule) || []).find((s) => (s.position || '').toLowerCase() === (FCR.POSITIONS[pid] || '-').toLowerCase());
  /** Current regional trustee for a region plus the next scheduled election year (Service Manual calendar). */
  FCR.regionalTrustee = function (rid) {
    const pid = FCR.REGION_SEAT[rid];
    const cur = FCR.positionHistory().find((p) => p.pid === pid && p.isCurrent) || null;
    const sched = scheduleFor(pid);
    const yr = FCR.cycle().nextConference;
    const next = sched ? (sched.election_years || []).filter((y) => y >= yr).sort((a, b) => a - b)[0] : cur && cur.end;
    return { pid, current: cur, nextElection: next || null, schedule: sched ? sched.election_years : [] };
  };

  // ---------- openings: seats that turn over, with chained successors ----------
  const SEAT_RULES = BOARD.seat_rules || {};
  const ruleFor = (pid) => SEAT_RULES[pid && pid.startsWith('REG_') ? 'REG' : pid] || null;
  /** Year the successor of a seat ending in E finishes (REG: next Service Manual election year; Class A: 6 years). */
  function successorEnd(pid, E) {
    const s = scheduleFor(pid); const n = s && (s.election_years || []).filter((y) => y > E).sort((a, b) => a - b)[0];
    if (n) return n;
    return E + FCR.termFor(pid);
  }
  function deadlineFor(pid, E, now) {
    const r = ruleFor(pid), dl = r && r.deadline;
    if (!dl) return null;
    const txt = dl.text ? String(dl.text).replace(/\{year\}/g, E) : dl.text;   // seat_rules texts are year-neutral; '{year}' = election year
    if (dl.month_day) {
      const d = new Date(E, +dl.month_day.slice(0, 2) - 1, +dl.month_day.slice(3), 12);
      // Whole calendar days: the deadline date itself is still open ("due … today"), closed from the next day.
      // Math.round, not ceil: from a daylight-time date to Jan 1 (standard time) the span is N days + 1 h.
      return { date: `${E}-${dl.month_day}`, passed: dayStart(now) > dayStart(d), daysLeft: Math.max(0, Math.round((dayStart(d) - dayStart(now)) / 864e5)), text: txt, fixed: !!dl.fixed };
    }
    return { date: null, text: txt, fixed: !!dl.fixed };
  }
  /** Seats that open at each Conference fromYear..toYear (default: next Conference + 4), including successors of seats
      whose next holder is not elected yet. Returns [{year, ordinal, seats:[seat], counts:{trustees, directors, chair, soft}}];
      seat = {pid, label, seat:'trustee'|'director'|'chair', board, region, holder (slot)|null, name, successorOf,
      generation, start, end, soft, note, nominatedBy, deadline}. */
  FCR.openings = function (fromYear, toYear) {
    const now = FCR.today();
    fromYear = fromYear || FCR.cycle(now).nextConference; toYear = toYear || fromYear + 4;
    const rid = (pid) => Object.keys(FCR.REGION_SEAT).find((k) => FCR.REGION_SEAT[k] === pid) || null;
    const seats = [];
    const push = (o) => {
      const r = ruleFor(o.pid);
      seats.push(Object.assign({ seat: FCR.seatKind(o.pid), region: rid(o.pid), nominatedBy: r ? r.nominated_by : null, deadline: o.soft ? null : deadlineFor(o.pid, o.year, now) }, o,
        { label: o.pid === 'GSB_CHAIR' && !o.holder ? 'General Service Board chair' : FCR.positionLabel({ pid: o.pid, board: o.board }) }));
    };
    FCR.positionHistory().filter((p) => p.isCurrent && p.end).forEach((p) => {
      if (p.end >= fromYear && p.end <= toYear) push({ year: p.end, pid: p.pid, board: p.board, holder: p, name: p.name, successorOf: null, generation: 0, start: p.start, end: p.end });
      if (p.firstTermSoft && p.firstTermEnd < p.end && p.firstTermEnd >= fromYear && p.firstTermEnd <= toYear)
        push({ year: p.firstTermEnd, pid: p.pid, board: p.board, holder: p, name: p.name, generation: 0, start: p.start, end: p.firstTermEnd, soft: true, note: 'first 3-year term ends (may serve a second term)' });
      // chain successors beyond the horizon of the current holder
      let E = p.end, g = 1;
      while (E < toYear) {
        const E2 = successorEnd(p.pid, E);
        if (p.pid === 'CLASS_A' && E + 3 >= fromYear && E + 3 <= toYear && E + 3 < E2) push({ year: E + 3, pid: p.pid, board: null, holder: null, name: `(to be elected ${E})`, successorOf: p.name, generation: g, start: E, end: E + 3, soft: true, note: 'first 3-year term of the successor ends' });
        if (E2 > toYear) break;
        if (E2 >= fromYear) push({ year: E2, pid: p.pid, board: p.board, holder: null, name: `(to be elected ${E})`, successorOf: p.name, generation: g, start: E, end: E2,
          note: p.pid === 'GSB_CHAIR' ? 'next chair may be Class A or Class B (a Class B chair adds a 22nd seat)' : null });
        E = E2; g++;
      }
    });
    // A general service trustee comes from the same corporate board's directors: when none of that board's director
    // terms ends that year, a mid-term director usually moves up and opens an extra director seat (soft hint).
    seats.filter((s) => s.pid === 'GST' && !s.soft && s.board).forEach((s) => {
      const dpid = s.board === 'Grapevine' ? 'DIR_GRAPEVINE' : 'DIR_AAWS';
      if (!seats.some((x) => x.year === s.year && x.pid === dpid && !x.soft)) push({ year: s.year, pid: dpid, board: s.board, holder: null, name: '(possible vacancy)', successorOf: null, generation: s.generation, start: s.year, end: null, soft: true, likely: true,
        note: `likely an extra ${s.board === 'Grapevine' ? 'AA Grapevine' : 'AAWS'} director vacancy if a current director moves up to general service trustee (no director term on that board ends in ${s.year})` });
    });
    const out = [];
    for (let y = fromYear; y <= toYear; y++) {
      const list = seats.filter((s) => s.year === y).sort((a, b) => (a.soft ? 1 : 0) - (b.soft ? 1 : 0) || ['chair', 'trustee', 'director'].indexOf(a.seat) - ['chair', 'trustee', 'director'].indexOf(b.seat) || a.pid.localeCompare(b.pid));
      const hard = list.filter((s) => !s.soft);
      out.push({ year: y, ordinal: y - 1950, seats: list, counts: { trustees: hard.filter((s) => s.seat === 'trustee').length, directors: hard.filter((s) => s.seat === 'director').length, chair: hard.filter((s) => s.seat === 'chair').length, soft: list.length - hard.length } });
    }
    return out;
  };

  // ---------- people index ----------
  // One entry per person-role (aggregated over years): {name, names, kind, role, desc, years, year, lastYear, area,
  // panel, position, board, committee, href, anchor, nonAA}. Kinds: see YEAR_SCHEMA.md ("FCR.people kinds").
  const people = [];
  const idx = {};
  const range = (ys) => { ys = [...new Set(ys)].sort((a, b) => a - b); if (!ys.length) return ''; const runs = []; let a = ys[0], b = ys[0]; ys.slice(1).forEach((y) => { if (y === b + 1) b = y; else { runs.push([a, b]); a = b = y; } }); runs.push([a, b]); return runs.map(([x, z]) => (x === z ? String(x) : `${x}–${z}`)).join(', '); };
  FCR.yearRange = range;
  /** Service-year runs from board-year start years: [2024, 2025] -> '2024–26' (a board year runs annual meeting to annual meeting). */
  const svcRange = (ys) => { ys = [...new Set(ys)].sort((a, b) => a - b); const out = []; ys.forEach((y) => { const l = out[out.length - 1]; if (l && y === l[1] + 1) l[1] = y; else out.push([y, y]); }); return out.map(([a, b]) => `${a}–${String(b + 1).slice(2)}`).join(', '); };
  FCR.serviceYearRange = svcRange;
  /** Add or merge (same kind + key) an index entry. */
  function put(key, o, y) {
    let e = idx[key];
    if (!e) { e = idx[key] = Object.assign({ names: [], years: [] }, o); people.push(e); }
    if (o.name && !e.names.includes(o.name)) e.names.push(o.name);
    (o.names || []).forEach((n) => { if (n && !e.names.includes(n)) e.names.push(n); });
    if (y != null && !e.years.includes(y)) e.years.push(y);
    if (o.name) e.name = e.name || o.name;
    return e;
  }
  const anchorOf = (pd) => (pd && pd.panel ? `a${pd.area || '?'}p${pd.panel}` : null);
  /** The people who held a term: [{name, names (printed variants), years}] — usually one; two when a delegate was
      replaced (Area 82 Panel 73: Gerry W. 2023, Dwayne M. 2024). Seated alternates are not holders. */
  FCR.termHolders = function (t) {
    const alt = new Set(Object.values(t.attended).map((a) => a.name));
    // same holder unless the first name AND the name match fail (Ed A. = Edwin A., Rick W. = Richard W.; Gerry W. ≠ Dwayne M.)
    const pre = (n) => [...FCR.nameParts(n).firsts].map((f) => FCR.fold(f).slice(0, 2));
    const same = (a, b) => FCR.sameName(a, b) || pre(a).some((x) => pre(b).includes(x));
    const groups = [];
    t.years.forEach((y) => {
      const at = t.attended[y], n = at && at.for ? at.for : t.namesByYear[y] || t.name;
      if (!n) return;
      let g = groups.find((x) => x.names.some((m) => same(m, n)));
      if (!g) groups.push((g = { name: n, names: [n], years: [] }));
      g.name = n; if (!g.names.includes(n)) g.names.push(n); if (!g.years.includes(y)) g.years.push(y);
    });
    if (!groups.length) groups.push({ name: t.name, names: [t.name], years: t.years.slice() });
    t.names.filter((n) => !alt.has(n) || groups.some((g) => g.names.includes(n))).forEach((n) => {
      if (groups.some((g) => g.names.includes(n))) return;
      const g = groups.find((x) => x.names.some((m) => same(m, n))) || groups[groups.length - 1]; // nickname variants -> latest holder
      g.names.push(n);
    });
    return groups;
  };
  // Delegates (one entry per person holding the term, with every printed name variant), committee chair roles,
  // seated alternates, delegate chair.
  Object.values(terms).forEach((t) => {
    const anchor = `a${t.area}p${t.panel}`;
    const holders = FCR.termHolders(t);
    const holderOf = (y) => holders.find((h) => h.years.includes(+y)) || holders[holders.length - 1];
    holders.forEach((h, i) => {
      const k = 'd|' + t.area + '-' + t.panel + (i ? '|' + i : '');
      const noShow = h.years.filter((y) => t.attended[y] && t.attended[y].for);
      const e = put(k, { name: h.name, names: h.names, kind: 'delegate', key: 'd-' + t.area + '-' + t.panel, area: t.area, panel: t.panel, anchor,
        role: `Panel ${t.panel} delegate`, desc: `Panel ${t.panel} delegate · ${FCR.areaLabel(t.area)}${t.committee ? ' · ' + FCR.cname(t.committee) : ''}${holders.length > 1 ? ` (${range(h.years)})` : ''}${noShow.length ? ` · alternate seated ${range(noShow)}` : ''}`, href: `#/area/${t.area}` });
      e.years = h.years.slice();
    });
    Object.keys(t.roles).forEach((y) => t.roles[y].forEach((r) => {
      const h = holderOf(y);
      put(`cc|${t.area}-${t.panel}|${r.committee}|${r.role}|${y}`, { name: h.name, names: h.names, kind: 'conf_chair', area: t.area, panel: t.panel, anchor, committee: r.committee, roleType: r.role, elected: !!r.elected,
        role: `${r.role === 'chair' ? 'Chair' : 'Alternate chair'}, ${FCR.cname(r.committee)}`,
        desc: `${r.role === 'chair' ? 'Chair' : 'Alternate chair'} of the Conference Committee on ${FCR.cname(r.committee)} (${y}${r.elected ? ', elected ' + (y - 1) : ''}) · ${FCR.areaLabel(t.area)}`, href: `#/committees/${y}/${r.committee}` }, +y);
    }));
    Object.keys(t.attended).forEach((y) => {
      const at = t.attended[y];
      put(`sa|${t.area}-${t.panel}|${at.name}`, { name: at.name, kind: 'seated_alternate', area: t.area, panel: t.panel, anchor: `alt-a${t.area}p${t.panel}`,
        role: 'Alternate delegate (seated)', desc: `Alternate delegate seated at the ${y} Conference${at.for ? ' for ' + at.for : ''}${at.inferred ? ' (inferred)' : ''} · ${FCR.areaLabel(t.area)}`, href: `#/area/${t.area}` }, +y);
    });
  });
  FCR.delegateChairs().forEach((d) => [['chair', d], ['alternate', d.alternate]].forEach(([role, p]) => {
    if (!p || !p.name) return;
    put(`dc|${d.conference_year}|${role}`, { name: p.name, kind: 'delegate_chair', area: p.area, panel: d.conference_year - 1951, anchor: `a${p.area}p${d.conference_year - 1951}`, roleType: role,
      role: role === 'chair' ? 'Conference delegate chair' : 'Alternate delegate chair',
      desc: `${role === 'chair' ? 'Delegate chair' : 'Alternate delegate chair'} of the ${FCR.ordinal(d.ordinal)} Conference (${d.conference_year}) · ${FCR.areaLabel(p.area)}`, href: `#/area/${p.area}` }, d.conference_year);
  }));
  // Delegate-elects and alternate-elects (FCR.elects; Panel 77 includes Brandy H., Area 65).
  if (FCR.elects.panel != null) FCR.elects.list.forEach((e) => {
    const P = FCR.elects.panel;
    if (e.delegate) put(`de|${e.area}|${P}`, { name: e.delegate, kind: 'delegate_elect', area: e.area, panel: P, anchor: `a${e.area}p${P}`, userProvided: !!e.user_provided,
      role: `Panel ${P} delegate-elect`, desc: `Panel ${P} delegate (elected ${P + 1949}, serves ${P + 1950}–${String(P + 1951).slice(2)}) · ${FCR.areaLabel(e.area)}`, href: `#/area/${e.area}` }, P + 1949);
    if (e.alternate) put(`ae|${e.area}|${P}`, { name: e.alternate, kind: 'alternate_elect', area: e.area, panel: P, anchor: `alt-a${e.area}p${P}`,
      role: `Panel ${P} alternate delegate`, desc: `Panel ${P} alternate delegate · ${FCR.areaLabel(e.area)}`, href: `#/area/${e.area}` }, P + 1949);
  });
  // Trustees, emeriti, nontrustee directors, newly elected (with their new seat).
  const boardKey = (n) => FCR.normName(FCR.canonName(n));
  // Trustee and director entries are keyed by seat (the positionHistory slot), not by spelling: 'James (Jimmy) D.' 2020–22
  // and 'Jimmy D.' 2023 are one Southwest regional trustee term. positionHistory does not read FCR.people (memoised).
  const SLOTS = FCR.positionHistory();
  const seatKey = (pid, name, y) => { const i = SLOTS.findIndex((s) => s.pid === pid && s.years.includes(y) && s.aliases.includes(name)); return i >= 0 ? 'seat' + i : boardKey(name); };
  // Corporate-board lists: a respelled name in an adjacent year joins the same entry ('Chris C.' / 'Christopher (Chris) C.').
  const boardListKey = (kind, name, y) => {
    const k = `${kind}|${boardKey(name)}`; if (idx[k]) return k;
    const e = people.find((p) => p.kind === kind && p.years.some((x) => Math.abs(x - y) <= 1) && p.names.some((n) => FCR.sameName(n, name)));
    return e ? Object.keys(idx).find((x) => idx[x] === e) : k;
  };
  FCR.years.forEach((y) => {
    const Y = FCR.Y(y);
    (Y.trustees || []).forEach((t) => {
      if (t.emeritus) {
        put(`em|${boardKey(t.name)}`, { name: t.name, kind: 'emeritus', nonAA: t.class === 'A', role: 'Trustee emeritus', desc: `Trustee emeritus${t.note ? ' — ' + t.note : ''}`, href: '#/board/' + y }, y);
        return;
      }
      const pos = t.position_id || 'OTHER';
      const br = (t.board_roles || []).join(' '), board = pos !== 'GST' ? null : /aaws/i.test(br) ? 'AAWS' : /grapevine/i.test(br) ? 'Grapevine' : null;
      const e = put(`tr|${seatKey(pos, t.name, y)}|${pos}`, { name: t.name, kind: 'trustee', position: pos, class: t.class, nonAA: t.class === 'A', anchor: anchorOf(t.past_delegate), past: t.past_delegate || null, role: pos === 'OTHER' ? (t.position || 'Trustee') : FCR.POSITIONS[pos] }, y);
      e.name = t.name;   // newest printed spelling (years run oldest first)
      if (board) { e.board = board; e.role = FCR.positionLabel({ pid: 'GST', board }); }
      if (t.past_delegate && t.past_delegate.area) { e.past = t.past_delegate; e.anchor = anchorOf(t.past_delegate); }
      e.href = '#/board/' + Math.max(...e.years);
    });
    (Y.nontrustee_directors || []).forEach((t) => {
      const b = /grape/i.test(t.board || '') ? 'Grapevine' : 'AAWS';
      const e = put(`dir|${seatKey(b === 'AAWS' ? 'DIR_AAWS' : 'DIR_GRAPEVINE', t.name, y)}|${b}`, { name: t.name, kind: 'director', board: b, position: b === 'AAWS' ? 'DIR_AAWS' : 'DIR_GRAPEVINE', anchor: anchorOf(t.past_delegate), past: t.past_delegate || null, role: `${b === 'AAWS' ? 'AAWS' : 'AA Grapevine'} nontrustee director` }, y);
      e.name = t.name;
      if (t.past_delegate && t.past_delegate.area) { e.past = t.past_delegate; e.anchor = anchorOf(t.past_delegate); }
      e.href = '#/board/' + Math.max(...e.years);
    });
    (Y.newly_elected || []).forEach((t) => {
      const dir = (t.position_id || '').startsWith('DIR_');
      const lbl = t.position || FCR.POSITIONS[t.position_id] || 'trustee';
      put(`ne|${boardKey(t.name)}|${t.position_id}|${y}`, { name: t.name, kind: dir ? 'director_elect' : 'trustee_elect', position: t.position_id, board: t.board || (t.position_id === 'DIR_AAWS' ? 'AAWS' : t.position_id === 'DIR_GRAPEVINE' ? 'Grapevine' : null),
        nonAA: t.class === 'A' || t.position_id === 'CLASS_A', anchor: anchorOf(t.past_delegate), past: t.past_delegate || null, succeeds: t.succeeds || null,
        role: `Elected ${lbl}`, desc: `Elected ${lbl} after the ${y} Conference${t.succeeds ? ' (succeeds ' + t.succeeds + ')' : ''}`, href: '#/board/' + y }, y);
    });
    // Trustees' committees: chairs, appointed committee members (ACMs), consultants, secretaries (incl. non-staff).
    (Y.trustees_committees || []).forEach((c) => {
      (c.members || []).forEach((m) => {
        if (m.type === 'chair') put(`tcc|${boardKey(m.name)}|${c.slug || c.committee}`, { name: m.name, kind: 'tc_chair', committee: c.committee, role: `Chair, trustees’ ${c.committee} Committee`, href: '#/board/' + y }, y);
        if (m.type === 'appointed') put(`acm|${boardKey(m.name)}|${c.slug || c.committee}`, { name: m.name, kind: 'acm', committee: c.committee, role: `Appointed committee member, trustees’ ${c.committee} Committee`, href: '#/board/' + y }, y);
        if (m.type === 'consultant') put(`con|${boardKey(m.name)}|${c.slug || c.committee}`, { name: m.name, kind: 'consultant', committee: c.committee, role: `Consultant, trustees’ ${c.committee} Committee`, href: '#/board/' + y }, y);
      });
      secs(c).forEach((x) => put(`sec|${boardKey(x.name)}|t|${c.slug || c.committee}`, { name: x.name, kind: 'secretary', scope: 'trustees', committee: c.committee, role: `Secretary, trustees’ ${c.committee} Committee${x.label ? ' (' + x.label + ')' : ''}`, href: '#/staff' }, y));
    });
    (Y.conference_committees || []).forEach((c) => secs(c).forEach((x) => put(`sec|${boardKey(x.name)}|c|${c.committee}`, { name: x.name, kind: 'secretary', scope: 'conference', committee: c.committee, role: `Secretary, Conference Committee on ${FCR.cname(c.committee)}`, href: `#/committees/${y}/${c.committee}` }, y)));
    // Staff: GSO Staff desks, Grapevine staff, general manager, director of Staff Services.
    (Y.gso_staff || []).forEach((s) => {
      const e = put(`st|${boardKey(s.name)}`, { name: s.name, kind: 'staff', role: 'GSO Staff member', href: '#/staff', assignmentsByYear: {} }, y);
      e.assignmentsByYear[y] = s.assignments || [];
    });
    (Y.grapevine_staff || []).forEach((s) => put(`gv|${boardKey(s.name)}|${FCR.normName(s.title)}`, { name: s.name, kind: 'gvstaff', title: s.title || '', role: s.title || 'Grapevine staff', href: '#/staff' }, y));
    if (Y.general_manager) put(`gm|${boardKey(Y.general_manager)}`, { name: Y.general_manager, kind: 'gm', role: 'GSO general manager', href: '#/staff' }, y);
    if (Y.staff_director) put(`sd|${boardKey(Y.staff_director)}`, { name: Y.staff_director, kind: 'staff_director', role: 'Director of Staff Services', href: '#/staff' }, y);
    // AAWS / AA Grapevine board lists as printed (board during year y-1 → y).
    [['aaws_directors', 'aaws_board', 'AAWS'], ['grapevine_directors', 'grapevine_board', 'AA Grapevine']].forEach(([k, kind, lbl]) => (Y[k] || []).forEach((d) => {
      const e = put(boardListKey(kind, d.name, y - 1), { name: d.name, kind, board: lbl === 'AAWS' ? 'AAWS' : 'Grapevine', role: `${lbl} board`, href: '#/board/' + y, chairYears: [] }, y - 1);
      if (/chair/i.test(d.role || '') && !e.chairYears.includes(y - 1)) e.chairYears.push(y - 1);
    }));
  });
  // Slates (board.json): GSB officers and corporate-board members elected at each annual meeting.
  slates.forEach((s) => {
    (s.gsb_officers || []).forEach((o) => { if (!o.name || /^\(/.test(o.name)) return; const ti = normTitle(o.title); put(`of|${boardKey(o.name)}|${ti}`, { name: o.name, kind: 'officer', title: ti, role: `GSB ${ti}`, employee: !!o.employee, href: '#/board/' + Math.min(FCR.latestYear, s.conference_year + 1) }, s.conference_year); });
    [['aaws_directors', 'aaws_board', 'AAWS'], ['grapevine_directors', 'grapevine_board', 'AA Grapevine']].forEach(([k, kind, lbl]) => (s[k] || []).forEach((d) => put(boardListKey(kind, d.name, s.conference_year), { name: d.name, kind, board: lbl === 'AAWS' ? 'AAWS' : 'Grapevine', role: `${lbl} board`, employee: !!d.employee, href: '#/board/' + Math.min(FCR.latestYear, s.conference_year + 1), chairYears: [] }, s.conference_year)));
  });
  // Printed officers of the first report = the slate of the year before (no slate data for it).
  if (FCR.years.length) (FCR.Y(FCR.years[0]).gsb_officers || []).forEach((o) => { const ti = normTitle(o.title); put(`of|${boardKey(o.name)}|${ti}`, { name: o.name, kind: 'officer', title: ti, role: `GSB ${ti}`, href: '#/board/' + FCR.years[0] }, FCR.years[0] - 1); });
  // Interim chairs, filed under the slate periods (annual meeting Y -> Y+1) they cover: from === to = interim until that
  // year's annual meeting (Jimmy D. Jan–Apr 2023 -> period 2022–23); otherwise from..to (Mike L. 2023–24).
  (BOARD.gsb_chairs || []).filter((c) => c.interim).forEach((c) => {
    const a = c.from === c.to ? c.from - 1 : c.from, b = c.from === c.to ? c.from - 1 : c.to - 1;
    for (let y = a; y <= b; y++) put(`of|${boardKey(c.name)}|Interim Chair`, { name: c.name, kind: 'officer', title: 'Interim Chair', role: 'GSB interim chair', href: '#/board/' + Math.min(FCR.latestYear, c.to) }, y);
  });
  // board.json staff history and emeriti.
  (BOARD.general_managers || []).forEach((g) => { const ys = g.seen || []; const a = parseInt(g.from, 10), b = g.to ? parseInt(g.to, 10) : FCR.latestYear; if (a) for (let y = a; y <= b; y++) ys.push(y); ys.forEach((y) => put(`gm|${boardKey(g.name)}`, { name: g.name, kind: 'gm', role: `GSO general manager${g.interim ? ' (interim)' : ''}`, href: '#/staff' }, y)); });
  (BOARD.staff_services_directors || []).forEach((g) => (g.years || []).forEach((y) => put(`sd|${boardKey(g.name)}`, { name: g.name, kind: 'staff_director', role: g.title ? g.title.charAt(0).toUpperCase() + g.title.slice(1) : 'Director of Staff Services', href: '#/staff' }, y)));
  ((BOARD.staff_coordinators || {}).list || []).forEach((g) => (g.years || []).forEach((y) => put(`sc|${boardKey(g.name)}`, { name: g.name, kind: 'staff_role', title: 'Staff coordinator', role: 'GSO Staff coordinator', href: '#/staff' }, y)));
  (BOARD.conference_coordinators || []).forEach((g) => (g.years || []).forEach((y) => put(`cco|${boardKey(g.name)}`, { name: g.name, kind: 'staff_role', title: 'Conference coordinator', role: 'GSO Conference coordinator', href: '#/staff' }, y)));
  (((BOARD.trustees_emeriti || {}).attending) || []).forEach((e) => (e.names || []).forEach((n) => put(`em|${boardKey(n)}`, { name: n, kind: 'emeritus', nonAA: true, role: 'Trustee emeritus', href: '#/board/' + Math.min(FCR.latestYear, e.year) }, e.year)));
  // Finish entries: years, ranges and display text.
  const KIND_DESC = { trustee: (e) => `${e.role} · ${range(e.years)}`, director: (e) => `${e.role} · ${range(e.years)}`, officer: (e) => `${e.role} · elected ${range(e.years)}`,
    // corporate boards: e.years are board-year start years, shown as service years like the officer lines ('2024–26')
    aaws_board: (e) => `AAWS board · ${svcRange(e.years)}${e.chairYears && e.chairYears.length ? ' (chair ' + svcRange(e.chairYears) + ')' : ''}`, grapevine_board: (e) => `AA Grapevine board · ${svcRange(e.years)}${e.chairYears && e.chairYears.length ? ' (chair ' + svcRange(e.chairYears) + ')' : ''}`,
    tc_chair: (e) => `${e.role} · ${range(e.years)}`, acm: (e) => `${e.role} · ${range(e.years)}`, consultant: (e) => `${e.role} · ${range(e.years)}`, secretary: (e) => `${e.role} · ${range(e.years)}`,
    staff: (e) => `GSO Staff member · ${range(e.years)}`, gvstaff: (e) => `${e.role} · ${range(e.years)}`, gm: (e) => `${e.role} · ${range(e.years)}`, staff_director: (e) => `${e.role} · ${range(e.years)}`,
    staff_role: (e) => `${e.role} · ${range(e.years)}`, emeritus: (e) => `${e.role} · listed ${range(e.years)}` };
  people.forEach((e) => {
    e.years.sort((a, b) => a - b); e.year = e.years[0]; e.lastYear = e.years[e.years.length - 1];
    if (!e.desc && KIND_DESC[e.kind]) e.desc = KIND_DESC[e.kind](e);
    if (!e.role) e.role = e.kind;
    if (!e.href) e.href = '#/person/' + encodeURIComponent(e.name);
  });
  FCR.people = people;
  FCR.PEOPLE_KINDS = ['delegate', 'seated_alternate', 'conf_chair', 'delegate_chair', 'delegate_elect', 'alternate_elect', 'trustee', 'trustee_elect', 'director', 'director_elect', 'officer', 'aaws_board', 'grapevine_board', 'tc_chair', 'acm', 'consultant', 'secretary', 'staff', 'staff_role', 'gvstaff', 'gm', 'staff_director', 'emeritus'];

  /** Group every index entry matching `name` into distinct people. Entries are tied together by a delegate anchor
      (area+panel of a term or of a board member's past_delegate), split by corrections 'distinct_people' rules, and
      nonalcoholic (Class A) entries never join a delegate, and entries without an anchor never join a delegate by name
      alone (they get maybeSameAs: [delegate keys] instead). Returns [{key, name, label, roles, ambiguous, maybeSameAs?}]. */
  const DELEGATE_KINDS = /^(delegate|conf_chair|delegate_chair|delegate_elect|seated_alternate|alternate_elect)$/;
  const FAMILY = (k) => (DELEGATE_KINDS.test(k) ? 'delegate' : /^(staff|staff_role|secretary|gm|staff_director|gvstaff)$/.test(k) ? 'staff' : 'board');
  const REST_ORDER = ['trustee', 'director', 'trustee_elect', 'director_elect', 'staff', 'gm', 'staff_director', 'emeritus', 'officer', 'aaws_board', 'grapevine_board', 'staff_role', 'tc_chair', 'acm', 'consultant', 'gvstaff', 'secretary'];
  const isDel = (g) => g.roles.some((r) => DELEGATE_KINDS.test(r.kind));
  FCR.personGroups = function (name) {
    if (!name) return [];
    const hits = people.filter((p) => p.names.some((n) => FCR.sameName(n, name)));
    const rule = FCR.DISTINCT.find((r) => FCR.sameName(r.name, name));
    const matches = (m, e) => !!m && (!m.kinds || m.kinds.includes(e.kind)) && (m.area == null || m.area === e.area) && (m.panel == null || m.panel === e.panel);
    const groups = new Map();
    const get = (k, label) => { if (!groups.has(k)) groups.set(k, { key: k, label: label || null, roles: [], ambiguous: false }); return groups.get(k); };
    const rest = [];
    hits.forEach((e) => {
      // a rule's 'default' person takes the entries no other spec matches, except other delegate terms
      const sp = rule && (rule.people.find((x) => matches(x.match, e)) || (!(e.anchor && /^a\d/.test(e.anchor)) && rule.people.find((x) => x.default)));
      if (sp) return get(sp.key, sp.label).roles.push(e);
      if (e.anchor && !/\?/.test(e.anchor)) return get(e.anchor).roles.push(e);
      rest.push(e);
    });
    // One person, two terms in the same area: a replacement who finishes panel P and is then elected for the area's next
    // panel (Dwayne M., Area 82: Panel 73 in 2024, Panel 75 2025–26), or a seated alternate later elected delegate.
    // Same area, adjacent years and every role name compatible (so Amber N. never absorbs James (Jim) F.'s term).
    const termGs = [...groups.values()].filter((g) => !(rule && rule.people.some((x) => x.key === g.key)) && /^(alt-)?a\d+p\d+$/.test(g.key))
      .map((g) => { const ys = [].concat(...g.roles.map((r) => r.years)); return { g, area: +g.key.replace(/^(alt-)?a(\d+)p.*/, '$2'), lo: Math.min(...ys), hi: Math.max(...ys) }; })
      .sort((a, b) => a.lo - b.lo);
    termGs.forEach((t, i) => {
      const prev = termGs.slice(0, i).reverse().find((u) => u.area === t.area && groups.has(u.g.key) && t.lo <= u.hi + 2 && t.lo > u.lo
        && t.g.roles.every((r) => u.g.roles.every((q) => FCR.sameName(r.name, q.name))));
      if (!prev) return;
      prev.g.roles.push(...t.g.roles); prev.g.anchors = (prev.g.anchors || [prev.g.key]).concat(t.g.key); prev.hi = Math.max(prev.hi, t.hi);
      groups.delete(t.g.key);
    });
    // anchored first, then the roles that identify a person best (a trustee/staff record before a secretary line)
    const rank = (k) => { const i = REST_ORDER.indexOf(k); return i < 0 ? 99 : i; };
    rest.sort((a, b) => (b.anchor ? 1 : 0) - (a.anchor ? 1 : 0) || rank(a.kind) - rank(b.kind));
    rest.forEach((e) => {
      let cands = [...groups.values()];
      if (e.anchor) cands = cands.filter((g) => (g.anchors || [g.key]).some((k) => k.endsWith('p' + e.anchor.split('p')[1]) && k.startsWith('a'))); // 'a?p59': same panel
      if (e.nonAA) cands = cands.filter((g) => !isDel(g));
      // GSO/Grapevine staff cannot be a serving delegate at the same time (Michael R., staff 2023-26 ≠ Panel 75 delegate)
      if (FAMILY(e.kind) === 'staff') cands = cands.filter((g) => !g.roles.some((r) => r.kind === 'delegate' && r.years.some((y) => e.years.includes(y))));
      const same = cands.filter((g) => g.roles.some((r) => FAMILY(r.kind) === FAMILY(e.kind)));
      const own = 'n:' + FCR.normName(FCR.canonName(e.name)) + ':' + FAMILY(e.kind) + (e.nonAA ? ':A' : '') + (e.anchor || '');
      if (same.length === 1) same[0].roles.push(e);
      else if (!same.length && cands.length === 1 && !(e.anchor && !cands[0].key.startsWith('a')) && !(isDel(cands[0]) && !e.anchor)) cands[0].roles.push(e);
      else {   // a name-only match to a delegate is not identity: keep apart, but say who it may be
        const g = get(own); g.roles.push(e);
        cands.filter(isDel).forEach((d) => { g.maybeSameAs = [...new Set((g.maybeSameAs || []).concat(d.key))]; g.ambiguous = true; });
      }
    });
    const out = [...groups.values()];
    out.forEach((g) => {
      g.roles.sort((a, b) => (a.year || 0) - (b.year || 0));
      const latest = g.roles.slice().sort((a, b) => (b.lastYear || 0) - (a.lastYear || 0))[0];
      // an alias group restricted to board/staff kinds ('Thomas L. A.' = trustee 'Tom A.') never renames a delegate
      const ai = groupOf(latest.name), al = ai >= 0 ? FCR.ALIASES[ai] : null;
      g.name = al && al.kinds && !al.kinds.includes('delegate') && g.roles.every((r) => DELEGATE_KINDS.test(r.kind)) ? latest.name : FCR.canonName(latest.name);
      if (!g.label) {
        const ds = g.roles.filter((r) => r.kind === 'delegate');   // the latest delegate term ('Panel 75 delegate', not the P73 finish)
        const d = ds[ds.length - 1] || g.roles.find((r) => r.kind === 'trustee') || g.roles[0];
        g.label = `${g.name} — ${d.desc || d.role}`;
      }
      g.roles.forEach((r) => { r.person = g.key; r.personLabel = g.label; });
    });
    return out.sort((a, b) => (b.roles.length - a.roles.length));
  };
  /** Every role of the person(s) named `name` (alias- and distinct_people-aware), oldest first; each role has .person
      and .personLabel. Pass `key` (from personGroups) to keep one person only. */
  FCR.personRoles = function (name, key) {
    const gs = FCR.personGroups(name);
    const roles = [].concat(...gs.filter((g) => !key || g.key === key).map((g) => g.roles));
    return roles.sort((a, b) => (a.year || 0) - (b.year || 0));
  };

  // ---------- neighbouring areas (shared border; data/src/adjacency.json) ----------
  const NB = {};
  (RAW.adjacency || []).forEach(([a, b]) => { (NB[a] = NB[a] || new Set()).add(b); (NB[b] = NB[b] || new Set()).add(a); });
  FCR.neighbors = (a) => [...(NB[a] || [])].sort((x, y) => x - y);
  FCR.isNeighbor = (a, b) => !!(NB[a] && NB[a].has(b));

  // ---------- area extras (conferences.json) ----------
  /** Group contributions for an area by calendar year: [{year, report_year, active_groups, groups_contributed,
      pct_contributed, total, average, ref}] (from the Final Report contribution tables, 2022–2025). */
  FCR.areaContributions = function (n) {
    const ac = CONF.area_contributions || {}; const cols = ac.cols || [];
    return Object.keys(ac.years || {}).map(Number).sort((a, b) => a - b).map((y) => {
      const Y = ac.years[y], r = (Y.rows || {})[n]; if (!r) return null;
      const o = { year: y, report_year: Y.report_year, ref: Y.ref }; cols.forEach((c, i) => { o[c] = r[i]; }); return o;
    }).filter(Boolean);
  };

})();
