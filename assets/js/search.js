/* Global search: one normalised index over
     areas (name, short, official name, state, acronyms, home cities: delegates', trustees' and areas.json 'cities'), regions,
     Conference committees (name, abbreviation, id) and the trustees' committees, panels (built from the query),
     people (FCR.people merged per person with FCR.personGroups: delegates incl. stand-in alternates, elects, chairs and
     delegate chairs; trustees, directors, officers, AAWS/Grapevine board members, ACMs, consultants; GSO and Grapevine
     staff with their desks, committee secretaries, general manager), the Learn tree, glossary and rules, calendar
     items (FCR.calendar), Conferences, proposed agenda items and their themes (FCR.RAW.pai; "pai 38" / "item 38" find
     one by number, a bare "38" only weakly so Area 38 comes first), the app's pages and Predict deep links.
   Text is folded (accents, punctuation, '&' -> 'and', 4-5-9 -> 459, Concept XII -> concept 12); every query word must
   match a word of the entry: exactly, at a word start, or (4+ letters) inside a word — so "pi" never matches
   Mississippi and "lit" never matches Accessibilities; numbers match whole ("6" is not 65).
   API (FCR.search):
     query(q, opts)  -> [{g, label, items:[{g, type, chip, t, d, href, score}], more, total}] in display order
                        opts: {all: true} no caps · {expand: '<group>'} show every row of one group
     flat(q, opts)   -> the same rows as one list
     index()         -> the index (built once; app.js builds it while the browser is idle)
     norm(s)         -> normalised text;  tokens(s) -> normalised words plus the abbreviations they spell out
     matcher(q)      -> (text | words[]) -> 0..1 for page filters (every query word must start a word), or null
     hint            -> the no-match hint text */
(function () {
  'use strict';
  const FCR = window.FCR;
  if (!FCR || !FCR.fold) return;

  // ---------- normalisation ----------
  const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
  const ROMAN_OF = Object.keys(ROMAN).reduce((o, k) => ((o[ROMAN[k]] = k), o), {});
  // 'Concepts VI-VIII' / 'Concepts VI to VIII' -> 'Concepts VI VII VIII', so every number in the range is searchable
  const ROMAN_RANGE = /\b(concepts?|traditions?|steps?|warranties)\s+(xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)\s*(?:[-‐–—]|\s+to\s+)\s*(xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)\b/gi;
  const expandRange = (m, w, a, b) => {
    const lo = ROMAN[a.toLowerCase()], hi = ROMAN[b.toLowerCase()];
    if (!(hi > lo) || hi - lo > 11) return m;
    const out = []; for (let k = lo; k <= hi; k++) out.push(ROMAN_OF[k]);
    return w + ' ' + out.join(' ');
  };
  /** 'Québec' -> 'quebec', 'Box 4-5-9' -> 'box 459', '6:30' -> '630', 'Concept XII' -> 'concept 12', 'T&A' -> 't and a', "Int’l" -> 'intl'. */
  function norm(s) {
    const x = FCR.fold(String(s == null ? '' : s).replace(ROMAN_RANGE, expandRange).replace(/(\d)[-.:‐-–](?=\d)/g, '$1').replace(/['’‘`]/g, ''));
    // every numeral of a list or range: 'Concepts I-II' -> 'concepts 1 2', 'Concepts II and VI' -> 'concepts 2 and 6'
    return x.replace(/\b(concepts?|traditions?|steps?|warranty|warranties|articles?)((?:\s+(?:(?:and|to|or)\s+)?(?:xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)\b)+)/g,
      (m, w, rs) => w + rs.replace(/\b(xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)\b/g, (r) => ROMAN[r]));
  }
  const toks = (s) => { const n = norm(s); return n ? n.split(' ') : []; };
  // Abbreviations people type, added to any text that spells the long form out.
  const ABBR = [
    [/\bcooperation with the professional community\b/, 'cpc'], [/\bpublic information\b/, 'pi'], [/\btreatment\b/, 'ta'],
    [/\binternational conventions?\b/, 'icrf ic'], [/\bregional forums?\b/, 'icrf rf'], [/\breport and charter\b/, 'rc'],
    [/\bpolicy (and )?admissions\b/, 'pa'], [/\bgrapevine\b/, 'gv'], [/\bla vina\b/, 'lavina'], [/\bgeneral service board\b/, 'gsb'],
    [/\bgeneral service office\b/, 'gso'], [/\bgeneral service conference\b/, 'gsc'], [/\bworld services\b/, 'aaws'],
    [/\btrustees? at large\b/, 'tal'], [/\bappointed committee members?\b/, 'acm'], [/\bgeneral service representatives?\b/, 'gsr'],
    [/\bdistrict committee members?\b/, 'dcm'], [/\bgeneral manager\b/, 'gm'], [/\bnonalcoholic\b/, 'class a'],
    [/\bgeneral service trustees?\b/, 'gst'], [/\bproposed agenda items?\b/, 'pai'], [/\bworld service meeting\b/, 'wsm'],
    [/\bnontrustee\b/, 'non'], [/\bvice chair/, 'vicechair'], [/\bchairperson\b/, 'chair'], [/\bresumes?\b/, 'resume'],
  ];
  /** Normalised words of a text plus the abbreviations it spells out ('Public Information' -> public, information, pi). */
  const expand = (s) => { const n = norm(s); if (!n) return []; let x = n; for (const [re, a] of ABBR) if (re.test(n)) x += ' ' + a; return x.split(' '); };
  // Query-side synonyms, tried after the word itself at a small discount.
  const SYN = { inverted: ['upside'], ne: ['northeast'], nw: ['northwest'], se: ['southeast'], sw: ['southwest'], intl: ['international'],
    int: ['international'], board: ['gsb'], deadline: ['due', 'closes', 'close'], due: ['deadline'], chairman: ['chair'], chairwoman: ['chair'],
    chairperson: ['chair'], chairs: ['chair'], meeting: ['meetings'], vicechairperson: ['vicechair'], forums: ['forum'], conferences: ['conference'],
    weekends: ['weekend'], trustees: ['trustee'], delegates: ['delegate'], gsc: ['conference'] };
  // Nicknames, tried on names only.
  const NICK = {};
  [['robert', 'bob', 'rob', 'bobby'], ['william', 'bill', 'will', 'billy'], ['james', 'jim', 'jimmy', 'jamie'], ['thomas', 'tom', 'tommy'],
    ['michael', 'mike'], ['david', 'dave'], ['christopher', 'chris'], ['kenneth', 'ken'], ['timothy', 'tim'], ['theodore', 'ted', 'teddy'],
    ['charles', 'charlie', 'chuck'], ['matthew', 'matt'], ['gregory', 'greg'], ['daniel', 'dan', 'danny'], ['richard', 'rick', 'dick', 'rich'],
    ['joseph', 'joe'], ['steven', 'steve'], ['stephen', 'steve'], ['susan', 'sue'], ['margaret', 'peggy', 'maggie'], ['peter', 'pete'],
    ['elizabeth', 'liz', 'beth', 'betty'], ['katherine', 'kathy', 'kate'], ['kathleen', 'kathy'], ['catherine', 'cathy'], ['jennifer', 'jen', 'jenny'],
    ['anthony', 'tony'], ['andrew', 'andy'], ['edward', 'ed'], ['edwin', 'ed'], ['nicholas', 'nick'], ['samuel', 'sam'], ['benjamin', 'ben'],
    ['lawrence', 'larry'], ['terrance', 'terry'], ['terence', 'terry'], ['jessica', 'jessie', 'jess'], ['nicole', 'nikki'], ['rebecca', 'becky'],
    ['patricia', 'pat', 'patty'], ['patrick', 'pat'], ['clinton', 'clint'], ['zenaida', 'zenny'], ['douglas', 'doug'], ['ronald', 'ron'],
    ['donald', 'don'], ['gerald', 'gerry', 'jerry'], ['deborah', 'deb', 'debbie'], ['alexander', 'alex'], ['philip', 'phil'], ['frederick', 'fred', 'fredy']]
    .forEach((g) => g.forEach((n) => { NICK[n] = (NICK[n] || []).concat(g.filter((x) => x !== n)); }));
  // Words that refine a query but never exclude a result.
  const OPTIONAL = new Set(['the', 'of', 'and', 'for', 'to', 'in', 'on', 'at', 'with', 'a', 'an', 'desk', 'committee', 'area', 'region', 'who', 'is', 'what', 'when', 's']);
  const PREDICT_WORDS = new Set(['predict', 'prediction', 'predictions', 'odds', 'chance', 'chances', 'forecast', 'likely', 'probability']);
  const uniq = (a) => [...new Set(a)];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH_WORDS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  /** 'Apr 11–17, 2027' from two ISO dates. */
  function fmtRange(a, b) {
    const p = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
    const A = p(a), B = p(b) || A; if (!A) return '';
    if (A.y === B.y && A.m === B.m) return `${MONTHS[A.m - 1]} ${A.d}${B.d !== A.d ? '–' + B.d : ''}, ${A.y}`;
    if (A.y === B.y) return `${MONTHS[A.m - 1]} ${A.d} – ${MONTHS[B.m - 1]} ${B.d}, ${A.y}`;
    return `${MONTHS[A.m - 1]} ${A.d}, ${A.y} – ${MONTHS[B.m - 1]} ${B.d}, ${B.y}`;
  }
  const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; };

  // ---------- index entries ----------
  /** "Allen (Al) M." -> ['allen al m', 'allen m', 'al m']. */
  const nameForms = (n) => {
    const base = String(n || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const rest = base.split(' ').slice(1).join(' ');
    const nicks = [...String(n || '').matchAll(/\(([^)]+)\)/g)].map((m) => m[1] + ' ' + rest);
    return uniq([n, base].concat(nicks).map(norm).filter(Boolean));
  };
  const nameToks = (names) => uniq(names.flatMap((n) => toks(String(n).replace(/[()]/g, ' '))));
  function entry(o) {
    const names = [].concat(o.names || []).filter(Boolean);
    return {
      g: o.g, type: o.type || '', chip: o.chip || '', t: o.t, d: o.d || '', href: o.href, y: o.y || 0, cur: !!o.cur, prior: o.prior || 0,
      f: (o.f || []).map(([list, w, tag]) => [uniq((list || []).filter(Boolean)), w, tag || '']).filter((x) => x[0].length),
      names: uniq(names.flatMap(nameForms)), phrase: !!o.phrase,
      c: uniq((o.noCompact ? [] : names).concat(o.compacts || []).flatMap((n) => nameForms(n).map((x) => x.replace(/ /g, '')))).filter((x) => x.length >= 2),
      meta: o.meta || null,
    };
  }

  // ---------- build ----------
  let INDEX = null;
  const areaText = (a) => [a.name, a.short, a.official_name].concat(a.aka || []).filter(Boolean).join(' ');
  const ROLE_PREFIX = /^(gsb|gso|aa|aaws|the|conference) /;
  const PEOPLE_DELEG = /^(delegate|seated_alternate|conf_chair|delegate_chair|delegate_elect|alternate_elect)$/;
  const PEOPLE_STAFF = /^(staff|staff_role|gvstaff|gm|staff_director|secretary)$/;
  const IMPORTANCE = { trustee: 10, director: 9, gm: 9, trustee_elect: 8.5, staff_director: 8, director_elect: 7.5, staff_role: 7.5, officer: 7,
    delegate_elect: 6.5, delegate_chair: 6.4, staff: 6, gvstaff: 6, delegate: 5, alternate_elect: 4.5, aaws_board: 4, grapevine_board: 4,
    conf_chair: 3.5, tc_chair: 3, acm: 3, consultant: 2, secretary: 2, seated_alternate: 2, emeritus: 1 };
  // A small "seniority" prior so a generic role word ("chair") lists the GSB chair before committee chairs.
  const KIND_PRIOR = { trustee: 0.04, director: 0.03, gm: 0.03, trustee_elect: 0.03, staff_director: 0.02, staff_role: 0.02, officer: 0.03,
    delegate_elect: 0.03, delegate_chair: 0.03, delegate: 0.02, staff: 0.01, gvstaff: 0.01, emeritus: -0.02 };
  const KIND_WORDS = {
    delegate: 'delegate panel', seated_alternate: 'alternate delegate seated', conf_chair: 'delegate conference committee',
    delegate_chair: 'delegate chair conference', delegate_elect: 'delegate elect elected new', alternate_elect: 'alternate delegate elect elected',
    trustee: 'trustee board gsb', trustee_elect: 'trustee elected elect new board', director: 'director nontrustee board',
    director_elect: 'director nontrustee elected elect new board', officer: 'officer gsb board', aaws_board: 'aaws board director',
    grapevine_board: 'grapevine board director', tc_chair: 'trustees committee chair', acm: 'appointed committee member acm',
    consultant: 'consultant trustees committee', emeritus: 'trustee emeritus emeriti', staff: 'gso staff member desk assignment employee',
    staff_role: 'gso staff', gvstaff: 'grapevine staff', gm: 'gso general manager staff', staff_director: 'gso staff services director',
    secretary: 'staff secretary',
  };

  function build() {
    const out = [];
    const cyc = FCR.cycle();
    const L = FCR.latestYear;
    const Yl = FCR.Y(L) || {};
    const sameName = FCR.sameName;
    const yr = (r) => r.lastYear || r.year || 0;
    const range = FCR.yearRange || ((ys) => uniq(ys).join(', '));
    const stage = FCR.electStage ? FCR.electStage(cyc) : null;

    // ----- home cities per area (delegates' printed cities; trustees' cities for their past-delegate area) -----
    const cities = {};
    const addCity = (n, c) => { c = String(c || '').split(',')[0].trim(); if (n && c) (cities[n] = cities[n] || new Set()).add(c); };
    Object.values(FCR.terms).forEach((t) => { Object.values(t.cityByYear || {}).concat(t.city || []).forEach((c) => addCity(t.area, c)); });
    FCR.positionHistory().forEach((s) => { if (s.past && s.past.area && s.city) addCity(s.past.area, s.city); });
    FCR.areaList.forEach((a) => (a.cities || []).forEach((c) => addCity(a.n, c)));   // areas.json 'cities' (sourced, e.g. user_provided)

    // ----- areas -----
    const servingText = (n) => {
      const parts = [];
      cyc.servingPanels.forEach((P) => {
        const t = FCR.term(n, P);
        if (t) parts.push(`${FCR.termName(t, Math.min(cyc.year, L))} (Panel ${P})`);
        else if (FCR.elects.panel === P && FCR.elects.byArea[n] && FCR.elects.byArea[n].delegate) parts.push(`${FCR.elects.byArea[n].delegate} (Panel ${P})`);
      });
      const e = FCR.elects.byArea[n];
      if (stage === 'elect' && e && e.delegate) parts.push(`${e.delegate} (Panel ${FCR.elects.panel} elect)`);
      return parts.join(', ');
    };
    FCR.areaList.forEach((a) => {
      const names = [a.name, a.short, a.official_name].concat(a.aka || []).filter(Boolean);
      const nameForms2 = names.concat((a.aka || []).map((x) => x + ' ' + a.n), ['area ' + a.n, 'area ' + a.n + ' ' + a.name]);
      const who = servingText(a.n);
      out.push(entry({ g: 'Areas', type: 'area', chip: FCR.regionName(a.region), t: `Area ${a.n} · ${a.name}`,
        d: `${FCR.regionName(a.region)} region${a.state ? ' · ' + a.state : ''}${who ? ' · ' + who : ''}`,
        href: `#/area/${a.n}`, prior: 0.05, names: nameForms2, compacts: ['a' + a.n, 'area' + a.n], meta: { area: a.n },
        f: [[nameToks(names), 1], [[String(a.n), 'a' + a.n, 'area'], 1], [toks(a.state), 0.9], [toks([...(cities[a.n] || [])].join(' ')), 0.6],
          [toks(FCR.regionName(a.region)), 0.3]] }));
    });

    // ----- regions -----
    FCR.REGIONS.forEach((r) => {
      const n = FCR.areaList.filter((a) => a.region === r.id).length;
      const rt = FCR.regionalTrustee ? FCR.regionalTrustee(r.id) : null;
      const cur = rt && rt.current;
      out.push(entry({ g: 'Regions', type: 'region', chip: r.id, t: `${r.name} region`, href: `#/delegates/current/${r.id}`, prior: 0.08,
        d: `${n} areas${cur ? ' · regional trustee ' + cur.name : ''}${rt && rt.nextElection ? ' · next trustee election ' + rt.nextElection : ''}`,
        names: [r.name, r.name + ' region', r.id], compacts: [r.id], meta: { region: r.id },
        f: [[toks(r.name), 1], [[r.id.toLowerCase(), 'region'], 1]] }));
    });

    // ----- Conference committees (latest year each existed) and trustees' committees -----
    const lastYear = {};
    FCR.years.forEach((y) => (FCR.Y(y).conference_committees || []).forEach((c) => { lastYear[c.committee] = y; }));
    const CAKA = { GRAPEVINE: ['La Vina', 'Grapevine La Vina'], ICRF: ['International Conventions', 'Regional Forums', 'IC RF'], TREATMENT: ['Treatment Facilities', 'Accessibilities'],
      POLICY: ['Policy Admissions', 'P and A'], REPORT: ['R and C'], TRUSTEES: ['Trustees committee'], CPC: ['Professional Community'], PI: ['Public Info'] };
    Object.keys(FCR.COMMITTEES).filter((id) => lastYear[id] && id !== 'OTHER').forEach((id) => {
      const c = FCR.COMMITTEES[id], y = lastYear[id];
      const cc = (FCR.Y(y).conference_committees || []).find((x) => x.committee === id) || {};
      const chair = (cc.members || []).find((m) => m.role === 'chair');
      const sec = FCR.secretaries(cc).map((x) => x.name).join(', ');
      const names = [c.name, c.short, c.abbr, id].concat(CAKA[id] || []).filter(Boolean);
      out.push(entry({ g: 'Committees', type: 'committee', chip: c.secondaryNow ? 'secondary' : FCR.PRIMARY_ORDER.includes(id) ? 'primary' : '',
        t: c.name + (c.abbr && c.abbr !== c.name ? ` (${c.abbr})` : ''), href: `#/committees/${y}/${id}`, prior: 0.06, meta: { committee: id },
        d: `Conference committee${c.secondaryNow ? ' (secondary)' : ''} · ${y}${chair ? ': chair ' + chair.name + (chair.area ? ' (Area ' + chair.area + ')' : '') : ''}${sec ? ' · secretary ' + sec : ''}`,
        names, f: [[names.flatMap(expand), 1], [['committee', 'conference'], 0.6]] }));
    });
    (Yl.trustees_committees || []).forEach((c) => {
      const chair = (c.members || []).find((m) => m.type === 'chair');
      const sec = FCR.secretaries(c).map((x) => x.name).join(', ');
      out.push(entry({ g: 'Committees', type: 'trustees-committee', chip: 'trustees’', t: `Trustees’ ${c.committee} Committee`, href: '#/board/' + L, prior: 0,
        d: `General Service Board committee · ${L}${chair ? ': chair ' + chair.name : ''}${sec ? ' · secretary ' + sec : ''}`,
        names: ['trustees ' + c.committee, c.committee + ' committee trustees'], f: [[expand(c.committee), 0.95], [['trustees', 'committee', 'board', 'gsb'], 0.6]] }));
    });

    // ----- people: FCR.people merged per person (FCR.personGroups) -----
    const rawBoard = {};   // 'aaws'|'grapevine' -> year -> [{name, role}] (printed roles the index does not keep)
    FCR.years.forEach((y) => {
      const Y = FCR.Y(y);
      [['aaws', 'aaws_directors'], ['grapevine', 'grapevine_directors']].forEach(([b, k]) => (Y[k] || []).forEach((d) => {
        ((rawBoard[b] = rawBoard[b] || {})[y - 1] = rawBoard[b][y - 1] || []).push({ name: d.name, role: d.role || '' });
      }));
    });
    const printedBoardRoles = (r) => {
      const b = r.kind === 'aaws_board' ? 'aaws' : 'grapevine';
      const ys = r.years.slice().sort((a, z) => z - a);
      const hits = [];
      ys.forEach((y) => ((rawBoard[b] || {})[y] || []).forEach((d) => { if (d.role && r.names.some((n) => sameName(n, d.name))) hits.push({ y, role: d.role }); }));
      return hits;
    };
    const trusteeRecord = (r) => {   // the latest printed trustee/director record of a trustee role (city, committees)
      for (const y of r.years.slice().sort((a, z) => z - a)) {
        const Y = FCR.Y(y) || {};
        const t = (Y.trustees || []).concat(Y.nontrustee_directors || [], Y.newly_elected || []).find((x) => r.names.some((n) => sameName(n, x.name)));
        if (t) return t;
      }
      return null;
    };
    const slots = FCR.positionHistory();
    const slotOf = (r) => slots.find((s) => s.pid === r.position && s.aliases.some((al) => r.names.some((n) => sameName(n, al))));
    const officerNote = (r) => {
      for (const y of r.years.slice().sort((a, z) => z - a)) {
        const o = ((FCR.Y(y + 1) || {}).gsb_officers || []).concat((FCR.Y(y) || {}).gsb_officers || []).find((x) => x.note && r.names.some((n) => sameName(n, x.name)));
        if (o) return o.note;
      }
      return '';
    };
    const staffTitle = (r) => {
      const Y = FCR.Y(yr(r)) || {};
      const s = (Y.gso_staff || []).find((x) => r.names.some((n) => sameName(n, x.name)));
      return s && s.title ? s.title : '';
    };
    const delegateCur = (r) => (r.kind === 'delegate_elect' || r.kind === 'alternate_elect' ? stage === 'elect' || stage === 'serving'
      : (r.kind === 'delegate' || r.kind === 'conf_chair') ? cyc.servingPanels.includes(r.panel) && yr(r) >= Math.min(cyc.year, L)
        : r.kind === 'delegate_chair' ? yr(r) >= cyc.lastConference : r.kind === 'seated_alternate' ? yr(r) >= L : false);
    // Printed AAWS/Grapevine board lists of report L describe the year L-1 -> L, so L-1 is still current.
    const roleCur = (r) => (PEOPLE_DELEG.test(r.kind) ? delegateCur(r) : r.kind === 'aaws_board' || r.kind === 'grapevine_board' ? yr(r) >= L - 1 : yr(r) >= L);
    const short = (r) => {
      const ys = range(r.years || []);
      if (r.kind === 'delegate') return `Panel ${r.panel} delegate, Area ${r.area}`;
      if (r.kind === 'delegate_elect' || r.kind === 'alternate_elect') return `${r.role}, Area ${r.area}`;
      if (r.kind === 'seated_alternate') return `alternate seated ${ys}, Area ${r.area}`;
      if (r.kind === 'staff') return `GSO staff ${ys}`;
      return `${r.role}${ys ? ' ' + ys : ''}`;
    };
    const kindChip = (r, cur) => ({ delegate: cur ? 'serving' : 'past delegate', conf_chair: cur ? 'serving' : 'past delegate', delegate_chair: 'delegate chair',
      delegate_elect: stage === 'serving' ? 'serving' : 'elect', alternate_elect: 'alternate', seated_alternate: 'alternate', trustee: cur ? 'trustee' : 'past trustee',
      trustee_elect: cur ? 'elected' : 'trustee', director: cur ? 'director' : 'past director', director_elect: 'elected', officer: 'officer',
      aaws_board: 'AAWS board', grapevine_board: 'Grapevine board', tc_chair: 'committee chair', acm: 'ACM', consultant: 'consultant', emeritus: 'emeritus',
      staff: cur ? 'GSO staff' : 'past staff', staff_role: 'GSO staff', gvstaff: 'Grapevine staff', gm: cur ? 'general manager' : 'past GM',
      staff_director: 'Staff Services', secretary: 'secretary' }[r.kind] || r.kind);
    const cityName = (c) => String(c || '').split(',')[0].trim();   // 'Carrollton, TX' -> 'Carrollton' (the state is matched on the area)
    const cname = (id) => (id && FCR.COMMITTEES[id] ? FCR.COMMITTEES[id].name + ' ' + FCR.cabbr(id) : id || '');

    const assigned = new Set(), persons = [];
    FCR.people.forEach((p) => {
      if (assigned.has(p) || !p.name) return;
      FCR.personGroups(p.name).forEach((g) => {
        const roles = g.roles.filter((r) => !assigned.has(r));
        if (!roles.length) return;
        roles.forEach((r) => assigned.add(r));
        persons.push({ key: g.key, name: g.name, roles, maybe: g.maybeSameAs || null });
      });
    });
    FCR.people.filter((p) => p.name && !assigned.has(p)).forEach((p) => persons.push({ key: p.name, name: p.name, roles: [p] }));
    const nameCount = {};
    persons.forEach((P) => { const k = FCR.normName(P.name); nameCount[k] = (nameCount[k] || 0) + 1; });

    persons.forEach((P) => {
      const roles = P.roles.slice().sort((a, b) => yr(b) - yr(a) || (IMPORTANCE[b.kind] || 0) - (IMPORTANCE[a.kind] || 0));
      const curOf = new Map(roles.map((r) => [r, roleCur(r)]));
      const cur = roles.some((r) => curOf.get(r));
      // primary role: a current role first, then the newest, then the most senior
      const primary = roles.slice().sort((a, b) => (curOf.get(b) ? 1 : 0) - (curOf.get(a) ? 1 : 0) || yr(b) - yr(a) || (IMPORTANCE[b.kind] || 0) - (IMPORTANCE[a.kind] || 0))[0];
      // every printed spelling, plus the corrections' alias variants (a surname change, 'Yoli F.' = 'Yolanda F.')
      const names = uniq(roles.flatMap((r) => r.names || [r.name]).flatMap((n) => (FCR.nameVariants && !PEOPLE_DELEG.test(primary.kind) ? FCR.nameVariants(n) : [n])));
      const fam = PEOPLE_DELEG.test(primary.kind) ? 'Delegates' : PEOPLE_STAFF.test(primary.kind) ? 'Staff' : 'Trustees & boards';
      // Each role is its own pair of word lists (what the role is, at full weight; which committee/board, at 0.8), so a
      // two-word role query ("AAWS chair") prefers a person who holds that one role over one who has the words in two roles.
      const roleF = [], roleSets = [], deskCur = [], deskPast = [], kindW = [], areaN = [], areaW = [], cityW = [], pastArea = [];
      let city = '', extraDesc = '', pt = [], ph = [];
      const rn = new Map();   // role names as printed ('gsb treasurer', 'treasurer') -> current?
      roles.forEach((r) => {
        const c = curOf.get(r), w = c ? 1 : 0.65;
        let head = [r.role], attr = [];
        if (r.kind === 'aaws_board' || r.kind === 'grapevine_board') {
          const pr = printedBoardRoles(r);
          pr.forEach((x) => head.push(x.role));
          if (r.chairYears && r.chairYears.length) head.push('chair');
          if (r === primary && pr.length) extraDesc = pr[0].role;
        }
        if (r.kind === 'officer') { const nt = officerNote(r); if (nt) attr.push(nt); }
        if (r.kind === 'conf_chair') { head = [r.roleType === 'alt_chair' ? 'alternate chair' : 'chair']; attr.push(cname(r.committee), 'conference committee'); }
        if (r.kind === 'tc_chair') { head = ['chair']; attr.push(r.committee, 'trustees committee'); }
        if (r.kind === 'acm' || r.kind === 'consultant') { head = [r.kind === 'acm' ? 'appointed committee member acm' : 'consultant']; attr.push(r.committee, 'trustees committee'); }
        if (r.kind === 'secretary') { head = ['secretary']; attr.push(r.scope === 'conference' ? cname(r.committee) + ' conference committee' : r.committee + ' trustees committee'); }
        if (r.kind === 'delegate_elect' || r.kind === 'alternate_elect') head.push('elect elected new');
        if (r.kind === 'gvstaff') { const mag = /\b(AA\s+)?(Grapevine|La Vi[ñn]a)(?![a-z])/gi; attr.push(...(String(r.role).match(mag) || [])); head = [String(r.role).replace(mag, ' ')]; }
        if (r.kind === 'staff' || r.kind === 'secretary' || r.kind === 'gvstaff' || r.kind === 'staff_role') {
          const ly = yr(r);
          const asg = r.assignmentsByYear ? (r.assignmentsByYear[ly] || []) : [];
          const old = r.assignmentsByYear ? Object.keys(r.assignmentsByYear).filter((y) => +y !== ly).flatMap((y) => r.assignmentsByYear[y]) : [];
          const title = r.kind === 'staff' ? staffTitle(r) : '';
          (c ? deskCur : deskPast).push(...expand(asg.concat(title, r.kind === 'secretary' ? [r.scope === 'conference' ? cname(r.committee) : r.committee || '', 'desk'] : r.kind === 'staff' ? ['desk'] : []).join(' ')));
          deskPast.push(...expand(old.join(' ')));
          if (r === primary && asg.length) extraDesc = 'desk: ' + asg.join(', ');
          if (r === primary && title) extraDesc = title + (extraDesc ? ' · ' + extraDesc : '');
        }
        if (r.kind === 'trustee' || r.kind === 'director' || r.kind === 'trustee_elect' || r.kind === 'director_elect') {
          const rec = trusteeRecord(r);
          if (rec && rec.city && !city) city = rec.city;
          if (rec && rec.trustee_committees) deskPast.push(...expand(rec.trustee_committees.join(' ')));
          (rec && rec.board_roles ? rec.board_roles : []).forEach((x) => attr.push(x));
          if (r.board) head.push(r.board === 'Grapevine' ? 'AA Grapevine' : 'AAWS');
          if (r.class === 'A' || r.class === 'B') head.push('class ' + r.class);
        }
        if (r.past && r.past.area) { pastArea.push(...toks(areaText(FCR.areas[r.past.area] || {}) + ' ' + r.past.area)); }
        if (PEOPLE_DELEG.test(r.kind) && r.area != null) {
          areaN.push(String(r.area)); areaW.push(...toks(areaText(FCR.areas[r.area] || {})));
          kindW.push('panel', String(r.panel), 'p' + r.panel);
          const t = r.panel ? FCR.term(r.area, r.panel) : null;
          if (t) {
            (r.years || []).forEach((y) => { const cy = t.cityByYear && t.cityByYear[y]; if (cy) { cityW.push(...toks(cityName(cy))); if (!city && (r.kind === 'delegate' || r.kind === 'seated_alternate')) city = cy; } });
            if (r.kind === 'delegate') {
              if (t.committee) deskPast.push(...expand(cname(t.committee)));
              (t.secondaryList || []).forEach((s) => deskPast.push(...expand(cname(s))));
            }
          }
        }
        kindW.push(...toks(KIND_WORDS[r.kind] || ''));
        const H = uniq(expand(head.filter(Boolean).join(' '))), Aw = uniq(expand(attr.filter(Boolean).join(' ')));
        head.filter(Boolean).forEach((x) => { let n = norm(x); rn.set(n, rn.get(n) || c); while (ROLE_PREFIX.test(n)) { n = n.replace(ROLE_PREFIX, ''); rn.set(n, rn.get(n) || c); } });
        roleF.push([H, w, 'r'], [Aw, 0.8 * w, 'r']);
        roleSets.push({ h: H, a: Aw, w, cur: c });
        if (r === primary) { pt = H.concat(Aw); ph = H.slice(); if (r.kind === 'staff' && r.assignmentsByYear) ph.push(...expand((r.assignmentsByYear[yr(r)] || []).join(' '))); }
      });
      if (city && !cityW.length) cityW.push(...toks(cityName(city)));
      // display: the primary role, home city, then "also: …" (other roles, newest first)
      let d = primary.desc || primary.role || '';
      if (primary.kind === 'trustee' || primary.kind === 'director') {
        const s = slotOf(primary);
        d = `${FCR.positionLabel ? FCR.positionLabel(s || { pid: primary.position, board: primary.board }) : primary.role}`;
        if (s && s.isCurrent) d += ` · since ${s.start || range(primary.years)}${s.end ? ', rotates ' + s.end : ''}`;
        else d += ` · ${range(primary.years)}`;
        if (s && s.past && s.past.area) d += ` · past delegate Panel ${s.past.panel || '?'}, Area ${s.past.area}`;
      } else if ((primary.kind === 'aaws_board' || primary.kind === 'grapevine_board') && extraDesc) {
        d = d.replace(/ · /, ` (${extraDesc}) · `);
      } else if (extraDesc && PEOPLE_STAFF.test(primary.kind)) d += ' · ' + extraDesc;
      if (primary.kind === 'delegate' && curOf.get(primary)) d += ' · serving';
      if (city && fam === 'Delegates') d += ' · ' + city;
      const seen = new Set([short(primary)]);
      const also = [];
      roles.forEach((r) => { if (r === primary) return; const s = short(r); if (seen.has(s)) return; seen.add(s); also.push(s); });
      if (also.length) d += ' · also: ' + also.slice(0, 3).join('; ') + (also.length > 3 ? '; …' : '');
      if (P.maybe && P.maybe.length) d += ' · may be the same person as the Panel ' + P.maybe.map((k) => (/p(\d+)$/.exec(k) || [])[1]).filter(Boolean).join('/') + ' delegate';
      const delegRole = roles.find((r) => PEOPLE_DELEG.test(r.kind) && r.area != null);
      const name = P.name;
      const href = fam === 'Delegates' && delegRole ? `#/area/${delegRole.area}` : `#/person/${encodeURIComponent(name)}`;
      const e = entry({ g: fam, type: primary.kind, chip: kindChip(primary, curOf.get(primary)), t: name, d, href, y: Math.max(...roles.map(yr)), cur,
        prior: KIND_PRIOR[primary.kind] || 0, names, meta: { person: P.key, kind: primary.kind, area: delegRole ? delegRole.area : null, panel: delegRole ? delegRole.panel : null, ambiguous: nameCount[FCR.normName(name)] > 1 },
        f: [[nameToks(names), 1, 'n']].concat(roleF, [[deskCur, 0.9, 'd'], [deskPast, 0.35], [uniq(kindW), 0.5], [uniq(areaN), 0.5], [uniq(areaW), 0.4],
          [uniq(cityW), 0.8], [uniq(pastArea), 0.3]]) });
      e.roles = roleSets; e.pt = uniq(pt); e.ph = uniq(ph); e.rn = rn;
      out.push(e);
    });

    // ----- Learn: Service Manual tree, glossary, rules -----
    const learn = (FCR.RAW && FCR.RAW.learn) || {};
    const nodes = learn.nodes || [];
    const nodeById = {}; nodes.forEach((n) => { nodeById[n.id] = n; });
    const sing = (s) => s.replace(/s\b/g, '');
    nodes.forEach((n) => {
      out.push(entry({ g: 'Learn', type: 'node', chip: 'Manual', t: n.title, d: (n.role_label ? n.role_label + ' · ' : '') + clip(n.summary, 110),
        href: `#/learn/${n.id}`, prior: 0.02, names: [n.title, n.id.replace(/_/g, ' '), n.role_label].filter(Boolean),
        f: [[expand(n.title + ' ' + n.id.replace(/_/g, ' ')), 1], [expand(n.role_label || ''), 0.8],
          [expand([n.summary, n.chosen_by, n.term, n.how_many].concat(n.facts || [], n.duties || []).join(' ')), 0.3]] }));
    });
    const nodeFor = (g) => {
      if (g.node && nodeById[g.node]) return nodeById[g.node];
      const t = g.term, base = t.replace(/\s*\(.*?\)\s*/g, ' ').trim(), par = (t.match(/\(([^)]*)\)/) || [])[1];
      const forms = [t, base, par].filter(Boolean).map((x) => sing(norm(x)));
      return nodes.find((n) => forms.some((f) => f && (f === sing(norm(n.role_label || '-')) || f === sing(norm(n.title.replace(/\s*\(.*?\)\s*/g, ' '))) || f === sing(n.id.replace(/_/g, ' ')))));
    };
    (learn.glossary || []).forEach((g) => {
      const node = nodeFor(g);
      out.push(entry({ g: 'Learn', type: 'glossary', chip: 'Glossary', t: g.term, d: clip(g.definition, 120) + (g.page ? ` (p. ${g.page})` : ''),
        href: node ? `#/learn/${node.id}` : `#/learn/glossary/${encodeURIComponent(g.term)}`, prior: -0.03,
        names: [g.term, g.term.replace(/\s*\(.*?\)\s*/g, ' ').trim(), (g.term.match(/\(([^)]*)\)/) || [])[1]].filter(Boolean),
        f: [[expand(g.term), 0.95], [expand(g.definition || ''), 0.3]] }));
    });
    (learn.rules || []).forEach((r) => {
      if (!r.topic) return;
      out.push(entry({ g: 'Learn', type: 'rule', chip: 'Rule', t: r.topic, d: clip(r.summary, 120), href: '#/learn/rules', prior: -0.05,
        names: [r.topic], f: [[expand(r.topic), 0.85], [expand(r.summary || ''), 0.3]] }));
    });

    // ----- calendar (next occurrence of each item, from two weeks ago to two years ahead) -----
    const C = FCR.calendar;
    if (C && C.items) {
      const today = C.todayStr(), list = C.items({ from: C.add(today, -14), to: C.add(today, 730), scope: 'everything' });
      const pick = {};
      list.forEach((o) => { if (/^gsc\d+$/.test(o.id)) return; const p = pick[o.id]; if (!p || (p.end < today && o.end >= today)) pick[o.id] = o; });
      const MINE = { all: 1, southwest: 1, SW: 1, area65: 1 };
      const CAL_CHIP = { conference: 'Conference', committee: 'Committees', board: 'Board', deadline: 'Deadline', election: 'Election', forum: 'Forum',
        area: 'Area event', publication: 'Publication', convention: 'Convention', world: 'World', observance: 'Observance' };
      const dnum = (s) => Math.round(new Date(s + 'T12:00:00').getTime() / 864e5);
      Object.values(pick).forEach((o) => {
        const away = dnum(o.start) - dnum(today), past = o.end < today;
        const scope = C.scopeLabel ? C.scopeLabel(o.scope) : '';
        const cat = C.catLabel ? C.catLabel(o.category) : o.category;
        const month = MONTH_WORDS[+o.start.slice(5, 7) - 1];
        const tt = expand(o.title);
        out.push(entry({ g: 'Calendar', type: 'event', chip: CAL_CHIP[o.category] || cat, t: o.title, href: '#/calendar/' + encodeURIComponent(o.key),
          d: `${C.when ? C.when(o) : fmtRange(o.start, o.end)}${o.place && !o.title.includes(o.place) ? ' · ' + o.place : ''} · ${C.countdown ? C.countdown(o, today) : ''}${scope && !/everyone/i.test(scope) ? ' · ' + scope : ''}`,
          y: +o.start.slice(0, 4), prior: (past ? -0.06 : 0.04 * Math.exp(-Math.max(0, away) / 150)) + (MINE[o.scope] ? 0.02 : -0.04),
          names: [o.title], phrase: true, meta: { key: o.key, start: o.start },
          f: [[tt.filter((x) => !/^\d+$/.test(x)), 1], [tt.filter((x) => /^\d+$/.test(x)), 0.6], [toks(cat + ' ' + o.category), 0.6], [toks(o.place), 0.5], [[o.start.slice(0, 4), month], 0.5],
            [expand([o.label, o.why, o.what_to_do].join(' ')), 0.3]] }));
      });
    }

    // ----- Conferences (held: Final Report page; announced: calendar item) -----
    const calKeys = C && C.items ? new Set(C.items({ from: C.add(C.todayStr(), -60), to: C.add(C.todayStr(), 1500), scope: 'everything' }).map((o) => o.key)) : new Set();
    const nextConf = cyc.nextConference;
    const confYears = uniq(FCR.years.concat((FCR.futureConferences ? FCR.futureConferences() : []).map((c) => c.year))).sort((a, b) => a - b);
    confYears.forEach((y) => {
      const c = FCR.conference ? FCR.conference(y) : { year: y, ordinal: y - 1950 };
      const ord = FCR.ordinal(y - 1950);
      // held = its Final Report is loaded; met = it has met (FCR.conference(y).over) but its Final Report is not loaded yet
      const held = !!FCR.Y(y), met = !held && !!c.over;
      const dates = c.start ? fmtRange(c.start, c.end) : '';
      const ck = 'gsc' + (y - 1950);
      const href = held ? `#/reports/${y}` : calKeys.has(ck) ? `#/calendar/${ck}` : met ? `#/reports/${y}` : '#/reports';
      out.push(entry({ g: 'Conferences', type: 'conference', chip: held ? 'Final Report' : met ? 'met · report pending' : c.status === 'preference' ? 'dates proposed' : 'upcoming',
        t: `${ord} General Service Conference (${y})`, href, y, cur: !held && !met,
        prior: held || met ? 0.02 * Math.max(0, 1 - (L - y) / 10) : y === nextConf ? 0.06 : 0.02 - (y - nextConf) / 1000,
        d: [met && dates ? 'Met ' + dates : dates + (c.approx ? ' (proposed)' : ''), c.venue, c.theme ? `“${c.theme}”` : '', met ? 'Final Report not loaded yet' : '']
          .filter(Boolean).join(' · ') || (held ? 'Final Report loaded' : 'dates not yet announced'),
        names: [`${ord} conference`, `${ord} gsc`, `gsc ${y - 1950}`, `${y} conference`], compacts: [ck],
        f: [[[ord, String(y - 1950), 'gsc', 'conference', 'general', 'service', String(y)], 1], [expand(c.theme || ''), 0.7], [toks(c.venue), 0.4],
          [held || met ? ['report', 'final', 'held', 'met', 'last'] : ['upcoming', 'next'], 0.5]] }));
    });
    // scanned Final Reports from the years before the parsed rosters (#/reports/<year> marks that library row)
    (FCR.RAW.reports || []).filter((r) => !confYears.includes(r.year)).forEach((r) => {
      const y = r.year, ord = FCR.ordinal(y - 1950);
      out.push(entry({ g: 'Conferences', type: 'conference', chip: 'Final Report scan', t: `${ord} General Service Conference (${y})`, href: `#/reports/${y}`, y, prior: 0.001,
        d: [r.start ? fmtRange(r.start, r.end) : r.dates, r.location, r.theme ? `“${r.theme}”` : ''].filter(Boolean).join(' · '),
        names: [`${ord} conference`, `${ord} gsc`, `gsc ${y - 1950}`, `${y} conference`], compacts: ['gsc' + (y - 1950)],
        f: [[[ord, String(y - 1950), 'gsc', 'conference', 'general', 'service', String(y)], 1], [expand(r.theme || ''), 0.7], [toks(r.location), 0.4],
          [['report', 'final', 'held', 'scan', 'historical', 'pdf'], 0.5], [y === 1951 ? ['first', 'original'] : [], 0.9]] }));
    });

    // ----- proposed agenda items of the next Conference (FCR.RAW.pai): each item, then each theme -----
    // An item's title is a sentence about a subject, not a name, so its words weigh 0.6 (an exact word never counts as
    // a strong hit, a word found inside another stays under MIN_BASE): "first conference" is still the 1st Conference.
    // The title stays out of the compact forms (noCompact), so a title that starts with a common word ("Policy …",
    // "Reserve Fund: …", "(Twelve and Twelve) …") never gets the 0.85 prefix score; it keeps only the small name bonuses.
    // Its number sits in a 0.5 field, the weakest a number may match: "pai 38" and "item 38" find it (nothing else has
    // both words), a bare "38" stays below Area 38 and the 38th Conference.
    const PAI = (FCR.RAW && FCR.RAW.pai) || {};
    const paiCycle = (PAI.source || {}).ordinal;
    const paiTheme = {}; (PAI.themes || []).forEach((t) => { paiTheme[t.id] = t; });
    const isNum = (x) => /^\d+$/.test(x);
    (PAI.items || []).forEach((x) => {
      const y0 = x.cycle !== paiCycle ? String(x.key).split('-')[0] : '';   // deferred from an earlier cycle: key '2025-7'
      out.push(entry({ g: 'Agenda items', type: 'pai', chip: x.status === 'under' ? 'PAI' : x.status, t: `${y0 ? y0 + ' ' : ''}PAI ${x.n} · ${x.title || 'entry removed (no text in the grid)'}`,
        d: clip(x.summary || x.outcome, 120), href: `#/agenda/item/${encodeURIComponent(x.key)}`, prior: -0.02, names: [x.title], noCompact: true,
        f: [[expand(x.title || ''), 0.6], [[String(x.n), norm(x.key), y0], 0.5], [['pai', 'item'], 0.5],
          [expand((x.targets || []).concat((x.themes || []).map((id) => (paiTheme[id] || {}).name)).join(' ')), 0.5], [expand(x.summary || x.outcome || ''), 0.3]] }));
    });
    (PAI.themes || []).forEach((t) => {
      const n = (PAI.items || []).filter((x) => (x.themes || []).includes(t.id)).length;
      const tt = expand(t.name);
      out.push(entry({ g: 'Agenda items', type: 'pai-theme', chip: 'theme', t: t.name, d: `${n} proposal${n === 1 ? '' : 's'} · ${clip(t.lede, 110)}`,
        href: `#/agenda/theme/${encodeURIComponent(t.id)}`, prior: 0.03, names: [t.name],
        f: [[tt.filter((w) => !isNum(w)), 1], [tt.filter(isNum).concat(toks(t.scope).filter(isNum)), 0.5], [['theme', 'pai', 'proposed', 'agenda'], 0.5],
          [expand([t.scope, t.lede].join(' ')), 0.3]] }));
    });

    // ----- pages -----
    [['Today', '#/today', 'today home dashboard my area now where things stand'], ['Calendar', '#/calendar', 'calendar dates schedule events deadlines what to expect when ics'],
      ['Delegates & Map', '#/delegates', 'delegates map table list areas'], ['Committees', '#/committees', 'committees conference committee chairs members'],
      ['Rotation Grid', '#/grid', 'rotation grid history which area held which committee'], ['Predict', '#/predict', 'predict prediction model lot draw odds chances next committee forecast'],
      ['Trustees & Boards', '#/board', 'trustees board gsb aaws grapevine directors officers'], ['GSO Staff', '#/staff', 'gso staff assignments desks secretaries'],
      ['Openings', '#/timeline', 'openings timeline rotation vacancies elections resumes trustee seats'],
      ['Advisory Actions', '#/actions', 'advisory actions conference decisions recommendations m-39 pending follow-ups history what the conference decided'],
      ['Pending follow-ups (Advisory Actions and committee requests)', '#/actions/pending', 'pending follow ups advisory actions committee requests progress report brought back recommitted due future dated deferred not missed 2027'],
      ['Agenda Items (proposed agenda items)', '#/agenda', 'agenda items proposed pai pais proposals 77th conference 2027 themes submitted forwarded trustees committees'],
      ['Agenda items: trends', '#/agenda/trends', 'agenda items proposed pai trends charts themes arrived copies same wording senders'],
      ['PAI status grid', '#/agenda', 'pai proposed agenda items status grid gso list every proposal under consideration withdrawn superseded',
        'GSO’s list of every proposed agenda item and its status, summarized on the Agenda Items page'],
      ['Structure', '#/structure', 'structure org chart organization flow chart upside down triangle hierarchy counterpart corresponding trustees committees pairs'],
      ['Learn', '#/learn', 'learn service manual structure tree glossary rules'],
      ['Quiz', '#/quiz', 'quiz test flashcards practice questions'], ['Reports', '#/reports', 'reports final conference report pdf library']]
      .forEach(([t, href, words, d]) => out.push(entry({ g: 'Pages', type: 'page', chip: 'page', t, d: d || 'Open the ' + t + ' page', href, prior: -0.1, names: [t], f: [[toks(t + ' ' + words), 0.8]] })));
    return out;
  }

  // ---------- matching ----------
  /** Best score of one query word against a word list: exact 1, word start 0.85 (single letters only on names),
      inside a word 0.4 (4+ letters); numbers only whole. */
  function tokScore(qt, list, w, num, tag) {
    let best = 0;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t === qt) return w;
      if (num) continue;
      if (t.length > qt.length && t.startsWith(qt)) { const s = (qt.length === 1 ? (tag === 'n' ? 0.6 : 0) : 0.85) * w; if (s > best) best = s; }
      else if (qt.length >= 4 && t.length > qt.length && t.includes(qt)) { const s = 0.4 * w; if (s > best) best = s; }
    }
    return best;
  }
  let lastTag = '';   // the tag of the field that gave fieldScore its best score ('r' = a person's role)
  function fieldScore(qt, e) {
    const num = /^\d+$/.test(qt);
    let best = 0, tag = '';
    for (const [list, w, tg] of e.f) { if (num && w < 0.5) continue; const s = tokScore(qt, list, w, num, tg); if (s > best) { best = s; tag = tg; } if (best >= 1) break; }
    if (best < 0.85 && SYN[qt]) for (const alt of SYN[qt]) for (const [list, w, tg] of e.f) { if (w < 0.5) continue; const s = 0.9 * tokScore(alt, list, w, false); if (s > best) { best = s; tag = tg; } }
    if (best < 0.85 && NICK[qt] && e.f.length) { const [list, w] = e.f[0]; if (w >= 1) for (const alt of NICK[qt]) { const s = 0.85 * tokScore(alt, list, w, false); if (s > best) { best = s; tag = ''; } } }
    lastTag = tag;
    return best;
  }
  const inList = (t, list) => tokScore(t, list, 1, /^\d+$/.test(t)) >= 0.85;
  const GROUP_ORDER = ['Areas', 'Regions', 'Committees', 'Panels', 'Predict', 'Delegates', 'Trustees & boards', 'Staff', 'Calendar', 'Conferences', 'Agenda items', 'Learn', 'Pages'];
  const MIN_BASE = 0.25;   // a lone weak hit (a word buried in a summary) is noise
  const MAX_ROWS = 30;
  const index = () => INDEX || (INDEX = build());

  /** The panel the Predict page opens on (FCR.predict.defaultPanel), or null when no draw is pending. */
  const predictPanel = () => (FCR.predict && FCR.predict.defaultPanel && FCR.predict.pendingPanels().length ? FCR.predict.defaultPanel() : null);
  /** The panels the Predict page offers (view-predict.js panelChoices): loaded panels with two earlier ones, and pending ones. */
  const predictPanels = () => {
    try { return FCR.predict ? [...new Set(FCR.panels.concat(FCR.predict.pendingPanels()))].filter((p) => p >= (FCR.panels[0] || 0) + 2) : []; } catch (e) { return []; }
  };
  /** 'drawn by lot in December 2026' / 'being drawn this December' / 'drawn December 2026; results in the 2027 Final Report'. */
  function drawWhen(P) {
    const y = P + 1949, t = FCR.today();
    if (t < new Date(y, 11, 1)) return `drawn by lot in December ${y}`;
    if (t < new Date(y + 1, 0, 1)) return 'being drawn by lot this December';
    return `drawn December ${y}; results in the ${y + 1} Final Report`;
  }
  const pct = (p) => (FCR.predict && FCR.predict.fmt ? FCR.predict.fmt(p) : String(Math.round(p * 100))) + '%';
  /** Predict rows for an area / committee (precomputed forecast only, so a keystroke never waits for a simulation). */
  function predictArea(P, n, title) {
    if (!FCR.predict || !FCR.predict.odds) return null;
    if (FCR.areaParity(n) == null || FCR.areaParity(n) !== P % 2) return null;
    const ok = FCR.predict.forecastValid ? FCR.predict.forecastValid(P) : false;
    let d = `Chances for each Conference committee, why, and what if · ${drawWhen(P)}`;
    if (ok) {
      const o = FCR.predict.odds(P), pr = o && o.probs && o.probs[n], top = o && o.top && o.top[n];
      if (!pr) return null;
      const best = Object.entries(pr).sort((a, b) => b[1] - a[1]).slice(0, 3);
      d = `Most likely ${best.map(([c, p]) => FCR.cname(c) + ' ' + pct(p)).join(' · ')}${top && top.nearTie ? ' (near-tie)' : ''} · ${drawWhen(P)}`;
    }
    return { g: 'Predict', type: 'odds', chip: 'Panel ' + P, t: title || `Area ${n} · Panel ${P} committee odds`, d, href: `#/predict/${P}/area/${n}` };
  }
  function predictCommittee(P, id) {
    if (!FCR.predict || !FCR.predict.committee || !FCR.PRIMARY_ORDER.includes(id)) return null;
    let d = 'Seats, continuing members and the areas most likely to be drawn';
    if (FCR.predict.forecastValid && FCR.predict.forecastValid(P)) {
      try {
        const c = FCR.predict.committee(P, id);
        if (c) d = `${c.seats} new seat${c.seats === 1 ? '' : 's'} · likeliest: ${c.eligible.slice(0, 3).map((x) => `Area ${x.area} ${pct(x.p)}`).join(', ')}`;
      } catch (e) { /* keep the generic text */ }
    }
    return { g: 'Predict', type: 'odds', chip: 'Panel ' + P, t: `Who could land on ${FCR.cname(id)} · Panel ${P}`, d, href: `#/predict/${P}/committee/${id}` };
  }

  function query(raw, opts) {
    opts = opts || {};
    const q0 = String(raw || '').trim().toLowerCase();
    const qn = norm(q0);
    let qt = qn ? qn.split(' ') : [];
    if (!qt.length || (qn.length < 2 && !/^\d$/.test(qn))) return [];
    const idx = index();
    const res = [];
    const wantPredict = qt.length > 1 && qt.some((t) => PREDICT_WORDS.has(t)) && qt.some((t) => !PREDICT_WORDS.has(t));
    if (wantPredict) qt = qt.filter((t) => !PREDICT_WORDS.has(t));   // "65 odds": score the rest, then lead with the Predict row
    const coreRaw = wantPredict ? qt.join(' ') : q0;
    // Area number in any form: 65, 065, A65, a 65, area65, Area #65, #65.
    const an = coreRaw.match(/^(?:area\s*#?\s*|a\s*|#\s*)?0*(\d{1,2})$/);
    const areaHit = an && FCR.areas[+an[1]] ? '#/area/' + +an[1] : null;
    const cyc = FCR.cycle();
    const PP = predictPanel();
    // Panel in any form: panel 77, P77, Panel #77 (and a bare 2-digit number as a weaker guess).
    const pm = coreRaw.match(/^(?:panel\s*#?\s*|p\s*)(\d{1,3})$/) || (/^\d{2}$/.test(coreRaw) ? [coreRaw, coreRaw] : null);
    if (pm) {
      const P = +pm[1], bare = /^\d{2}$/.test(coreRaw), lo = FCR.panels[0] || P, hi = cyc.electPanel + (bare ? 0 : 1);
      if (P >= lo && P <= hi) {
        const n = FCR.areaList.filter((a) => FCR.areaParity(a.n) === P % 2).length;
        const fy = P + 1949;
        const stageTxt = P > cyc.electPanel ? `to be elected in fall ${fy}` : P === cyc.electPanel && cyc.year <= fy ? `elected fall ${fy}; committees drawn by lot in December ${fy}` : `elected fall ${fy}`;
        const pending = PP != null && P >= PP && predictPanels().includes(P);   // only a panel the Predict page can show
        const delYear = FCR.Y(P + 1951) ? P + 1951 : FCR.Y(P + 1950) ? P + 1950 : null;
        const learnPanels = ((FCR.RAW && FCR.RAW.learn && FCR.RAW.learn.nodes) || []).some((x) => x.id === 'panels');
        const href = pending ? '#/predict/' + P : cyc.servingPanels.includes(P) ? '#/delegates/current' : delYear ? '#/delegates/' + delYear
          : learnPanels ? '#/learn/panels' : '#/delegates/next';   // a panel not elected yet: how panels work
        const score = bare ? 0.95 : 2;
        res.push({ g: 'Panels', type: 'panel', chip: P % 2 ? 'odd' : 'even', t: `Panel ${P}`, href, score, base: score,
          d: `${P % 2 ? 'Odd' : 'Even'}-numbered areas (${n}) · ${stageTxt} · serves ${P + 1950}–${P + 1951} (the ${FCR.ordinal(P)} and ${FCR.ordinal(P + 1)} Conferences)` });
        if (!pending && FCR.predict && P >= lo + 2 && P <= (FCR.panels[FCR.panels.length - 1] || 0))
          res.push({ g: 'Predict', type: 'odds', chip: 'Panel ' + P, t: `Panel ${P} committee draw: predicted vs actual`, href: '#/predict/' + P, score: score - 0.05, base: score - 0.05,
            d: 'How the model\'s odds compared with the real draw (scorecard, misses)' });
        if (pending && FCR.elects.panel === P && FCR.electStage(cyc) === 'elect')
          res.push({ g: 'Panels', type: 'panel', chip: 'elects', t: `Panel ${P} delegate-elects`, href: '#/delegates/next', score: score - 0.04, base: score - 0.04,
            d: `${FCR.elects.list.filter((e) => e.delegate).length} of ${n} areas have announced their Panel ${P} delegate` });
      }
    }
    const opt0 = (t) => OPTIONAL.has(t);
    const lettersOnly = qt.every((t) => /^[a-z]$/.test(t));                 // "a.a.", "c d": only whole-name compact matches
    const req = lettersOnly ? [] : qt.filter((t) => !opt0(t) || qt.every(opt0));
    const opt = qt.filter((t) => !req.includes(t));
    const qcore = qt.join(' ');
    const qc = qcore.replace(/ /g, '');
    // 'concept 1' / 'tradition 3' names a whole number: it is not the start of 'concept 12' or 'tradition 31'
    const numRef = /\b(concepts?|traditions?|steps?|warranty|warranties|articles?) \d+$/.test(qcore);
    const pre = (str, pfx, inside) => {
      for (let i = inside ? str.indexOf(pfx) : str.startsWith(pfx) ? 0 : -1; i >= 0; i = inside ? str.indexOf(pfx, i + 1) : -1) if (!numRef || !/\d/.test(str.charAt(i + pfx.length))) return true;
      return false;
    };
    for (const e of idx) {
      let sum = 0, ok = true;
      const roleHits = e.roles ? [] : null, roleS = e.roles ? [] : null;
      for (const t of req) { const s = fieldScore(t, e); if (!s) { ok = false; break; } sum += s; if (roleHits && lastTag === 'r') { roleHits.push(t); roleS.push(s); } }
      let score = 0;
      if (ok && !lettersOnly) {
        for (const t of opt) sum += fieldScore(t, e);
        if (roleHits && roleHits.length >= 2) {
          // Words found in two different roles ("chair" of one committee, member of the AAWS board) count for less than one
          // role that holds them all ("AAWS chair"): use that role's own scores, or discount the mix.
          let best = -1, bestCur = false;
          for (const r of e.roles) {
            let rs = 0;
            for (const t of roleHits) { const x = Math.max(tokScore(t, r.h, r.w, /^\d+$/.test(t)), tokScore(t, r.a, 0.8 * r.w, /^\d+$/.test(t))); if (!x) { rs = -1; break; } rs += x; }
            if (rs > best) { best = rs; bestCur = r.cur; }
          }
          const mixed = roleS.reduce((a, b) => a + b, 0);
          sum = best >= 0 ? sum - mixed + best + (bestCur ? 0.05 : 0.03) * qt.length : sum - mixed * 0.25;
        }
        score = sum / qt.length;
        // a person whose main role (or a staff member's desk) is what was asked for ("chair" -> the GSB chair) comes first
        if (e.ph && e.ph.length && req.some((t) => inList(t, e.ph)) && req.every((t) => inList(t, e.ph) || e.f[0][0].includes(t))) score += 0.1;
        // the query names one of the person's roles exactly ('treasurer' = 'GSB Treasurer', not 'Assistant Treasurer')
        if (e.rn && e.rn.has(qcore)) score += e.rn.get(qcore) ? 0.15 : 0.08;
      }
      // compact form: "Lisa CD" ~ "Lisa C.-D.", "ICRF" ~ "IC/RF", "Teddy BW" ~ "Teddy B.-W."
      if (qc.length >= 3) for (const c of e.c) { if (c === qc) { score = Math.max(score, 1); break; } else if (pre(c, qc)) score = Math.max(score, 0.85); }
      if (areaHit && e.g === 'Areas' && e.href === areaHit) score = Math.max(score, 2);
      else if (areaHit && score && e.meta && e.meta.area === +an[1]) score += 0.3;   // "65": Area 65's delegates before other mentions of 65
      if (score < MIN_BASE) continue;
      const base = score, eq = !e.phrase && e.names.some((n) => n === qcore);
      // name bonuses (event titles: only a multi-word phrase found in the title)
      if (e.phrase) { if (qt.length > 1 && e.names.some((n) => (' ' + n).includes(' ' + qcore))) score += 0.15; } else if (eq) score += 0.5; else if (e.names.some((n) => pre(n, qcore))) score += 0.25; else if (e.names.some((n) => pre(' ' + n, ' ' + qcore, true))) score += 0.1;
      score += e.prior + (e.cur ? 0.15 : 0) + Math.min(e.y, 2100) / 1e6;
      res.push({ g: e.g, type: e.type, chip: e.chip, t: e.t, d: e.d, href: e.href, score, base, eq, meta: e.meta });
    }
    res.sort((a, b) => b.score - a.score);
    // Predict deep links for a strong area / committee / delegate-elect hit (or when the query asks for odds).
    if (PP != null) {
      const strong = (r) => r.base >= 0.85 || (areaHit && r.href === areaHit);
      const pr = [];
      const ar = res.find((r) => r.g === 'Areas' && strong(r));
      if (ar && (ar === res[0] || wantPredict || areaHit)) { const x = predictArea(PP, ar.meta.area); if (x) pr.push([x, ar.score]); }
      const el = res.find((r) => r.g === 'Delegates' && r.meta && r.meta.kind === 'delegate_elect' && r.base >= 0.85 && r.meta.panel === PP);
      if (el && (el === res[0] || wantPredict)) { const x = predictArea(PP, el.meta.area, `${el.t}: committee odds (Area ${el.meta.area}, Panel ${PP})`); if (x) pr.push([x, el.score]); }
      const cm = res.find((r) => r.g === 'Committees' && r.type === 'committee' && strong(r));
      if (cm && (cm === res[0] || wantPredict)) { const x = predictCommittee(PP, cm.meta.committee); if (x) pr.push([x, cm.score]); }
      pr.forEach(([x, s]) => { if (!res.some((r) => r.href === x.href)) res.push(Object.assign(x, { score: wantPredict ? s + 1 : s - 0.02, base: 1 })); });
      res.sort((a, b) => b.score - a.score);
    }
    // Group, order groups by their best hit, cap each group (fewer per group when many groups match). Concepts vs
    // things: when people/areas/committees match strongly, Learn shows only its exact match (first, as a definition)
    // or goes last with two items. Proposed agenda items and their themes are concepts too, like Learn and Pages: a
    // strong hit there never pushes Learn down.
    const by = {}, kept = new Set();
    res.forEach((r) => {
      const k = r.g === 'Learn' ? r.href : r.g + '|' + r.href + '|' + r.t;
      if (kept.has(k)) return;
      kept.add(k); (by[r.g] = by[r.g] || []).push(r);
    });
    // within a group: score, then newest
    Object.values(by).forEach((l) => l.sort((a, b) => b.score - a.score));
    const concept = (g) => g === 'Learn' || g === 'Pages' || g === 'Agenda items';
    const strong = Object.keys(by).some((g) => !concept(g) && by[g].some((r) => r.base >= 0.85));
    const learnEq = by.Learn && by.Learn[0].eq && !Object.keys(by).some((g) => !concept(g) && by[g][0].eq);
    const rank = (g) => (g === 'Learn' && strong ? (learnEq ? 99 : -99) : by[g][0].score);
    // Rows far below the best hit are dropped; within a group, rows well below its first row wait behind "Show N more".
    const floor = opts.all ? 0 : res.length ? res[0].score * 0.4 : 0;
    const rel = {}, vis = {};
    Object.keys(by).forEach((g) => {
      rel[g] = by[g].filter((r) => r.score >= floor);
      vis[g] = opts.all || opts.expand === g ? rel[g] : rel[g].filter((r) => r.score >= 0.6 * rel[g][0].score);
    });
    const groups = Object.keys(by).filter((g) => vis[g].length).sort((a, b) => rank(b) - rank(a) || GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b));
    const capFor = (g) => (opts.all || opts.expand === g ? 1e9 : g === 'Learn' && strong ? (learnEq ? 1 : 2) : groups.length >= 3 ? 4 : groups.length === 2 ? 6 : 12);
    const out = [];
    let left = opts.all || opts.expand ? 1e9 : MAX_ROWS;
    groups.forEach((g) => {
      if (left <= 0) return;
      const cap = Math.min(capFor(g), left);   // an expanded group shows every row above the floor, so "Show N more" goes away
      const items = vis[g].slice(0, cap).map((r) => ({ g: r.g, type: r.type, chip: r.chip, t: r.t, d: r.d, href: r.href, score: Math.round(r.score * 1000) / 1000 }));
      left -= items.length;
      out.push({ g, label: g, items, more: rel[g].length - items.length, total: rel[g].length });
    });
    return out;
  }
  const flat = (q, opts) => [].concat(...query(q, opts).map((g) => g.items));

  /** For page filters: matcher(q) -> (text | words[]) -> 0..1. Every query word must match a word of the text
      (exact, word start, or 4+ letters inside), accent/punctuation-insensitive, numbers whole; null for an empty query. */
  function matcher(q) {
    const qn = norm(q); if (!qn) return null;
    const all = qn.split(' '), words = all.filter((w) => !OPTIONAL.has(w) || all.every((x) => OPTIONAL.has(x)));
    return (text) => {
      const list = Array.isArray(text) ? text : expand(text);
      let sum = 0;
      for (const w of words) {
        let s = tokScore(w, list, 1, /^\d+$/.test(w));
        if (!s && SYN[w]) SYN[w].forEach((a) => { s = Math.max(s, 0.9 * tokScore(a, list, 1, false)); });
        if (!s) return 0; sum += s;
      }
      return sum / words.length;
    };
  }

  FCR.search = { query, flat, index, norm, tokens: expand, matcher, predictPanel,
    hint: 'Try an area number, a name like “Brandy H.”, or a committee like “CPC”.' };
})();
