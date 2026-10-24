/* Quiz view: the Learn question bank (Service Manual and Final Reports, page-cited) plus questions generated from the
   rosters, the committee-draw history, the calendar and data/src/quiz_gen.json (Which Concept? / Which committee does
   this?). Questions are dealt like a shuffled deck (no repeats until the deck is used up); a missed question comes back
   a few cards later. Keys: 1-4 answer, N or Enter next.
   Routes: #/quiz, #/quiz/<mode> (all|manual|concepts|committees|people|region|rules), #/quiz/node/<learn node id>. */
(function () {
  'use strict';
  const FCR = window.FCR;
  const esc = FCR.esc;
  const V = FCR.views, UI = FCR.ui;

  const MODES = [['all', 'All'], ['manual', 'Service Manual'], ['concepts', 'Which Concept?'], ['committees', 'Which committee?'], ['people', 'People & committees'], ['region', 'My region'], ['rules', 'Draw rules & calendar']];
  const SMALL = ['SW', 'WC', 'ECAN', 'WCAN']; // July 2020 small-region rule (2021 Final Report, p. 26)
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const full = (c) => (FCR.COMMITTEES[c] || { name: c }).name;
  const and = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
  const list = (xs) => xs.join(' · ');
  const endDot = (s) => (/[.!?”’"')]$/.test(String(s)) ? '' : '.');
  const myArea = () => { const n = +FCR.store.get('myArea', 65); return FCR.areas[n] ? n : 65; };

  // ---------- question pools: Map id -> {q, a, wrong?|pool?, link, src} ----------
  function bankPool(filter) {
    const m = new Map();
    (FCR.learnQuiz || []).forEach((x) => {
      if (!x || !x.q || !x.a || !x.wrong || x.wrong.length < 2 || !filter(x)) return;
      m.set('b:' + hash(x.q), { q: x.q, a: x.a, wrong: x.wrong.slice(0, 3), link: '#/learn/' + (x.node || ''),
        src: x.source ? `${x.source}${x.page ? ', p. ' + x.page : ''}` : x.page ? `Service Manual p. ${x.page}` : '' });
    });
    return m;
  }

  // ---------- generated Service Manual decks (data/src/quiz_gen.json); `also` = answers that fit too, never offered as wrong ----------
  const GEN = (FCR.RAW && FCR.RAW.quizGen) || {};
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const learnLink = (id, fallback) => '#/learn/' + (id && FCR.learnTree && FCR.learnTree.node(id) ? id : fallback);
  const manualSrc = (p) => (p ? `Service Manual p. ${p}` : '');

  /** Which Concept? A cue in our own words; the options are Concepts ("Concept III – Right of Decision"). */
  function conceptPool() {
    const m = new Map(), C = {};
    (GEN.concepts || []).forEach((c) => { if (ROMAN[c.n] && c.title) C[c.n] = c; });
    const label = (n) => `Concept ${ROMAN[n]} – ${C[n].title}`;
    (GEN.concept_cues || []).forEach((x) => {
      const c = C[x.concept]; if (!c || !x.cue) return;
      const skip = new Set([x.concept].concat(x.also || []));
      m.set('gc:' + hash(x.cue), { q: 'Which of the Twelve Concepts does this belong to?', cue: x.cue, a: label(x.concept),
        pool: Object.keys(C).map(Number).filter((n) => !skip.has(n)).map(label), link: learnLink(c.node, 'concepts'), src: manualSrc(x.page) });
    });
    return m;
  }

  /** Which committee does this? A duty from pp. 46-48 (Conference) or 58-60 (trustees); the options are committees of the same side.
      `merged` (All / Service Manual decks): skip duties marked `bank`, which repeat a learn.json bank question. */
  function committeePool(merged) {
    const m = new Map(), T = FCR.TRUSTEES_COMMITTEES, extra = {};
    (GEN.trustees_extra || []).forEach((x) => { if (x.key && x.title) extra[x.key] = x.title; });   // Compliance, Employees' Retirement (p. 60)
    const SIDES = {
      conference: { ask: 'Which Conference committee', ids: FCR.PRIMARY_ORDER.concat(['ARCHIVES', 'ICRF']), name: full,
        link: (c) => learnLink('cc_' + c.toLowerCase(), 'conf_committees') },
      trustees: { ask: 'Which trustees’ committee', ids: Object.keys(T).filter((k) => !T[k].session).concat(Object.keys(extra).filter((k) => !T[k])), name: (k) => (T[k] ? T[k].name : extra[k]),
        link: (k) => learnLink({ NOMINATING: 'gsb_nominating', INTERNATIONAL: 'trustees_international' }[k], 'trustees_committees') },
    };
    (GEN.committee_scopes || []).forEach((x) => {
      const S = x.side === 'conference' || x.side === 'trustees' ? SIDES[x.side] : null; if (!S || !x.duty || !S.ids.includes(x.committee) || (merged && x.bank)) return;
      const d0 = String(x.duty).trim(), skip = new Set([x.committee].concat(x.also || []));
      const duty = /\b[A-Z]\.[A-Z]\.$/.test(d0) ? d0 : d0.replace(/\.$/, '');   // keep the period of a closing "A.A." / "U.S."
      m.set(`gk:${x.side}:${hash(duty)}`, { q: `${S.ask} ${/^[A-Z][a-z]/.test(duty) ? duty[0].toLowerCase() + duty.slice(1) : duty}?`, a: S.name(x.committee),
        pool: S.ids.filter((k) => !skip.has(k)).map(S.name), link: S.link(x.committee), src: manualSrc(x.page) });
    });
    return m;
  }

  const nodeOf = (link) => String(link || '').replace(/^#\/learn\//, '');
  /** Learn node ids of the generated cards in the per-topic decks (view-learn.js adds them to "Quiz me on this · N"). */
  FCR.quizGenNodes = () => [...conceptPool().values(), ...committeePool(true).values()].map((v) => nodeOf(v.link));

  /** Roster questions; `areaOk(n)` limits them to some areas (My region). */
  function peoplePool(areaOk, rid) {
    const m = new Map(), Y = FCR.latestYear, L = FCR.Y(Y) || {};
    const serving = Object.values(FCR.terms).filter((t) => t.name && t.years.includes(Y));
    const mine = serving.filter((t) => areaOk(t.area));
    const namePool = (t) => (rid ? serving.filter((x) => FCR.areas[x.area] && FCR.areas[x.area].region === rid) : serving).map((x) => FCR.termName(x, Y));
    mine.forEach((t) => {
      const c = t.committees[Y] || t.committee;
      if (c) m.set(`pc:${t.area}-${t.panel}`, { q: `${FCR.termName(t, Y)} (${FCR.areaLabel(t.area)}, Panel ${t.panel}) served on which Conference committee in ${Y}?`, a: full(c), pool: FCR.PRIMARY_ORDER.filter((x) => x !== c).map(full), link: '#/area/' + t.area, src: `${Y} Final Report roster` });
      m.set(`pd:${t.area}-${t.panel}`, { q: `Who was the Panel ${t.panel} delegate for ${FCR.areaLabel(t.area)} at the ${Y} Conference?`, a: FCR.termName(t, Y), pool: namePool(t), link: '#/area/' + t.area, src: `${Y} Final Report roster` });
    });
    FCR.areaList.filter((a) => a.region && areaOk(a.n)).forEach((a) => {
      if (!rid) m.set(`pr:${a.n}`, { q: `Which region is Area ${a.n} (${a.name}) in?`, a: FCR.regionName(a.region), pool: FCR.REGIONS.map((r) => r.name), link: '#/area/' + a.n });
    });
    (L.next_year_chairs || []).forEach((nc) => {
      if (!nc.chair || !nc.chair.name || (rid && !(FCR.areas[nc.chair.area] && FCR.areas[nc.chair.area].region === rid))) return;
      m.set(`pch:${nc.committee}`, { q: `Who was elected to chair the ${Y + 1} Conference Committee on ${full(nc.committee)}?`, a: nc.chair.name, pool: (L.next_year_chairs || []).map((x) => x.chair && x.chair.name), link: '#/committees', src: `${Y} Final Report` });
    });
    if (!rid) {
      const label = (x) => x.position || FCR.POSITIONS[x.position_id];
      (L.trustees || []).filter((x) => x.position_id && x.position_id !== 'OTHER' && !x.emeritus).forEach((t) => {
        m.set(`pt:${hash(t.name)}`, { q: `What position did ${t.name} hold on the General Service Board in ${Y}?`, a: label(t), pool: (L.trustees || []).map(label), link: '#/board', src: `${Y} Final Report` });
      });
      const one = (x) => (FCR.secretaries(x)[0] || {}).name;
      const secs = (L.conference_committees || []).map(one).filter(Boolean);
      (L.conference_committees || []).filter((x) => one(x) && FCR.secretaries(x).length === 1).forEach((c) => {
        m.set(`ps:${c.committee}`, { q: `Which GSO staff member was secretary to the ${full(c.committee)} committee in ${Y}?`, a: one(c), pool: secs, link: '#/staff', src: `${Y} Final Report` });
      });
    }
    return m;
  }

  /** Questions computed from the draw rules, the region and the trustee calendar. */
  function rulesPool(opts) {
    const m = new Map(), rid = opts.rid, my = myArea();
    const cyc = FCR.cycle();
    const P = cyc.electPanel; // the next panel to be drawn (elected this fall, drawn in December)
    const k = (FCR.MODEL_DEFAULTS && FCR.MODEL_DEFAULTS.excludeLast) || 3;
    let prob = null;
    try { prob = FCR.predict && FCR.predict.buildProblem ? FCR.predict.buildProblem(P) : null; } catch (e) { prob = null; }
    const committees = prob ? prob.committees : FCR.PRIMARY_ORDER;
    const ordered = (set) => FCR.PRIMARY_ORDER.filter((c) => set.has(c)).map(FCR.cname); // short names (several full names contain "and")
    const altSets = (right, n) => { // wrong options: same-size sets of other committees
      const out = new Set(); const key = list(right);
      for (let i = 0; i < 40 && out.size < 8; i++) { const s = list(ordered(new Set(shuffle(committees).slice(0, n)))); if (s !== key) out.add(s); }
      return [...out];
    };
    const recent = (a) => {
      if (!prob || !prob.histKnown || !prob.history[a]) return null;
      return FCR.predict.recentCommittees ? FCR.predict.recentCommittees(prob.history[a], P, k) : new Set(prob.history[a].filter((h) => h.panel >= P - 2 * k).map((h) => h.committee));
    };
    const areaSet = opts.areas;
    if (prob) areaSet.filter((a) => prob.areas.includes(a)).forEach((a) => {
      const ex = recent(a); if (!ex || !ex.size || ex.size >= committees.length) return;
      const right = ordered(ex);
      m.set(`rx:${P}:${a}`, { q: `Since Panel 71 the lot has almost never put an area on a committee it held in its last ${k} terms. Which committees is the Panel ${P} delegate from ${FCR.areaLabel(a)} very unlikely to get?`,
        a: list(right), pool: altSets(right, right.length), link: `#/predict/${P}/area/${a}`, src: 'Rosters 2017-2026; 2025 Final Report, pp. 84-85' });
      // small-region rule: the region's continuing (second-year) delegates block their committees too
      const r = FCR.areas[a] && FCR.areas[a].region;
      if (SMALL.includes(r) && prob.contKnown) {
        const taken = new Set(Object.keys(prob.cont).filter((c) => prob.cont[c].some((x) => FCR.areas[x] && FCR.areas[x].region === r)));
        const left = new Set(committees.filter((c) => !ex.has(c) && !taken.has(c)));
        if (left.size >= 1 && left.size <= 6) {
          const lr = ordered(left);
          m.set(`rs:${P}:${a}`, { q: `If both the skip-recent-committees pattern and the July 2020 small-region rule (no second ${FCR.regionName(r)} delegate on a committee) hold, which committees are left for the Panel ${P} delegate from ${FCR.areaLabel(a)}?`,
            a: list(lr), pool: altSets(lr, lr.length), link: `#/predict/${P}/area/${a}`, src: '2021 Final Report, p. 26; rosters' });
        }
      }
    });
    // IC/RF: which panel parity fills each region's seat (since Panel 69)
    const icrf = {};
    Object.values(FCR.terms).forEach((t) => { if (t.panel >= 69 && t.secondaryList.includes('ICRF')) { const r0 = FCR.areas[t.area] && FCR.areas[t.area].region; if (r0) (icrf[r0] = icrf[r0] || new Set()).add(t.panel % 2); } });
    FCR.REGIONS.filter((r) => !rid || r.id === rid).forEach((r) => {
      const s = icrf[r.id]; if (!s || s.size !== 1) return;
      const odd = s.has(1);
      m.set(`ri:${r.id}`, { q: `Since Panel 69, which panels have supplied the ${r.name} member of the International Conventions/Regional Forums committee?`,
        a: odd ? 'Odd-numbered panels' : 'Even-numbered panels', wrong: [odd ? 'Even-numbered panels' : 'Odd-numbered panels', 'Both, in turn within each panel', 'Whichever panel has a free seat that year'], link: '#/learn/cc_icrf', src: 'Rosters 2017-2026' });
    });
    // regional trustee calendar
    const sched = ((FCR.RAW.rules && FCR.RAW.rules.regional_trustee_schedule) || []).filter((s) => / regional trustee$/i.test(s.position || ''))
      .map((s) => ({ name: s.position.replace(/ regional trustee$/i, ''), years: s.election_years || [] }));
    if (sched.length) {
      const y0 = cyc.nextConference;
      const pairs = [y0, y0 + 1, y0 + 2, y0 + 3].map((y) => [y, sched.filter((s) => s.years.includes(y)).map((s) => s.name).sort()]).filter((x) => x[1].length);
      if (!rid) pairs.forEach(([y, names]) => m.set(`rt:${y}`, { q: `Which regions elect a regional trustee at the ${y} Conference?`, a: and(names), pool: pairs.filter((p) => p[0] !== y).map((p) => and(p[1])).concat(['Northeast and Pacific', 'Southwest and Western Canada']), link: '#/learn/regional_trustees', src: 'Service Manual p. 54' }));
      if (rid) {
        const s = sched.find((x) => x.name.toLowerCase() === FCR.regionName(rid).toLowerCase());
        const nxt = s && s.years.filter((y) => y >= y0).sort((a, b) => a - b)[0];
        if (nxt) m.set(`rtr:${rid}`, { q: `At which Conference does the ${FCR.regionName(rid)} next elect a regional trustee?`, a: String(nxt), wrong: [nxt + 1, nxt + 2, nxt - 1].map(String), link: '#/learn/regional_trustees', src: 'Service Manual p. 54' });
        let rt = null; try { rt = FCR.regionalTrustee(rid); } catch (e) { rt = null; }
        const others = FCR.REGIONS.map((r) => { try { const x = FCR.regionalTrustee(r.id); return x && x.current && x.current.name; } catch (e) { return null; } });
        if (rt && rt.current) m.set(`rtn:${rid}`, { q: `Who is the ${FCR.regionName(rid)} regional trustee?`, a: rt.current.name, pool: others, link: '#/board', src: `${FCR.latestYear} Final Report` });
      }
    }
    // panel arithmetic and each area's panel parity
    const base = cyc.electPanel;
    (rid ? [base - 1, base] : [base - 6, base - 5, base - 4, base - 3, base - 2, base - 1, base, base + 1]).forEach((p) => m.set(`pm:${p}`, { q: `Panel ${p} delegates attend which two Conferences?`, a: `${p + 1950} and ${p + 1951}`, wrong: [`${p + 1949} and ${p + 1950}`, `${p + 1951} and ${p + 1952}`, `${p + 1948} and ${p + 1949}`], link: '#/learn/panels', src: 'Service Manual p. 130' }));
    areaSet.forEach((n) => {
      const par = FCR.areaParity(n); if (par == null || !FCR.areas[n]) return;
      const nextP = (base % 2 === par) ? base : base + 1;
      m.set(`pp:${n}`, { q: `Does ${FCR.areaLabel(n)} elect odd-numbered or even-numbered panels?`, a: `${par ? 'Odd' : 'Even'}: its next delegate is Panel ${nextP}`, wrong: [`${par ? 'Even' : 'Odd'}: its next delegate is Panel ${nextP + 1}`, 'It alternates between odd and even each term', 'Neither: it elects a delegate every year'], link: '#/area/' + n, src: 'Service Manual Appendix M, p. 130' });
    });
    // My region extras: which area is in the region, neighbours, delegate-elects
    if (rid) {
      const inR = FCR.areaList.filter((a) => a.region === rid), outR = FCR.areaList.filter((a) => a.region && a.region !== rid);
      inR.forEach((a) => {
        if (parseInt(hash('prr' + a.n), 36) % 4 === 0) // a few of these (same wording, different answers) are enough
          m.set(`prr:${a.n}`, { q: `Which of these areas is in the ${FCR.regionName(rid)} region?`, a: FCR.areaLabel(a.n), pool: outR.map((x) => FCR.areaLabel(x.n)), link: '#/area/' + a.n });
        const nb = FCR.neighbors(a.n);
        if (nb.length) {
          const pick = nb[Math.floor(Math.random() * nb.length)];
          const non = FCR.areaList.filter((x) => x.n !== a.n && !nb.includes(x.n) && x.region === rid).map((x) => FCR.areaLabel(x.n));
          if (non.length >= 3) m.set(`pn:${a.n}`, { q: `Which of these areas shares a border with ${FCR.areaLabel(a.n)}?`, a: FCR.areaLabel(pick), pool: non, link: '#/area/' + a.n, src: 'Area boundaries' });
        }
      });
      const EP = FCR.elects && FCR.elects.panel;
      const ens = inR.map((a) => FCR.elects.byArea[a.n]).filter((e) => e && e.delegate);
      if (EP && ens.length >= 2) ens.forEach((e) => m.set(`pe:${e.area}`, { q: `Who is the Panel ${EP} delegate${FCR.electStage() === 'elect' ? '-elect' : ''} for ${FCR.areaLabel(e.area)}?`, a: e.delegate, pool: ens.map((x) => x.delegate).concat(Object.values(FCR.elects.byArea).map((x) => x.delegate)), link: '#/area/' + e.area, src: 'Area websites / your notes' }));
    }
    // calendar facts: dated, high-confidence items from the Calendar page's engine (FCR.calendar, view-calendar.js)
    const C = FCR.calendar;
    if (C && C.items && C.when) {
      let list = [];
      try {
        const t0 = FCR.today(), iso = (d) => d.toISOString().slice(0, 10);
        list = C.items({ from: iso(t0), to: iso(new Date(t0.getTime() + 540 * 864e5)), scope: 'everything' });
      } catch (e) { list = []; }
      const n = {}; list.forEach((o) => (n[o.id] = (n[o.id] || 0) + 1));      // skip weekly/monthly repeats
      // My region: the region's own events (Southwest: also 'southwest'/'area65' items), my area's local ones, and key dates for everyone
      const mineScope = (o) => o.scope === rid || (rid === 'SW' && (o.scope === 'southwest' || o.scope === 'area65'))
        || (o.scope === 'area' && +o.area === my) || (o.scope === 'all' && ['deadline', 'conference', 'election'].includes(o.category));
      const CATS = ['conference', 'committee', 'board', 'deadline', 'election', 'forum', 'publication', 'convention', 'world'];
      const pick = list.filter((o) => o.confidence === 'high' && !o.approx && !o.window && n[o.id] <= 2 && CATS.includes(o.category)
        && !/^aa-followups-/.test(o.id)   // generated follow-up groups (build_data.py) are not quiz facts
        && (rid ? mineScope(o) : o.scope === 'all'));
      const whens = [...new Set(list.filter((o) => !o.window && !o.approx && !/^aa-followups-/.test(o.id)).map((o) => C.when(o)))];
      const seenT = new Set();
      pick.forEach((o) => {
        const t = o.title, w = C.when(o); if (seenT.has(t)) return; seenT.add(t);
        // every date of the same event (same title) stays out of the distractors: a yearly item can occur twice in the 540-day
        // window, and its other true date must not be offered as a wrong answer; the question then asks for the next one
        const same = new Set(list.filter((x) => x.title === t).map((x) => C.when(x)));
        const pool = whens.filter((x) => !same.has(x));
        if (pool.length < 3) return;
        m.set(`ce:${hash(t + o.start)}`, { q: same.size > 1 ? `When is the next one: ${t}?` : `When is this: ${t}?`, a: w, pool, link: '#/calendar', src: o.source ? String(o.source).split(';')[0].slice(0, 90) : 'Calendar' });
      });
    }
    return m;
  }

  function poolFor(key) {
    const [mode, arg] = key.split(':');
    const my = myArea(), rid = (FCR.areas[my] || {}).region || 'SW';
    const bank = (f) => bankPool(f);
    const merge = (...ms) => { const out = new Map(); ms.forEach((x) => x.forEach((v, k) => out.set(k, v))); return out; };
    if (mode === 'node') {   // the topic's bank questions plus the generated cards that link to it (a Concept's cues, a committee's duties)
      const ids = new Set(FCR.learnTree ? FCR.learnTree.subtree(arg) : [arg]);
      const mine = (m) => new Map([...m].filter(([, v]) => ids.has(nodeOf(v.link))));
      return merge(bank((x) => ids.has(x.node)), mine(conceptPool()), mine(committeePool(true)));
    }
    if (mode === 'concepts') return conceptPool();
    if (mode === 'committees') return committeePool();
    if (mode === 'manual') return merge(bank((x) => !x.mode || x.mode === 'manual'), conceptPool(), committeePool(true));
    if (mode === 'people') return peoplePool(() => true, null);
    const regionAreas = FCR.areaList.filter((a) => a.region === rid).map((a) => a.n);
    if (mode === 'region') return merge(bank((x) => x.region === rid), peoplePool((n) => FCR.areas[n] && FCR.areas[n].region === rid, rid), rulesPool({ rid, areas: regionAreas }));
    const rules = rulesPool({ rid: null, areas: [...new Set([my].concat(regionAreas))] });
    if (mode === 'rules') return merge(bank((x) => x.mode === 'rules' || (x.mode === 'region' && x.region === rid)), rules);
    // All: every bank, generated and rules question plus a fixed third of the roster questions (so people don't swamp the deck)
    const people = new Map([...peoplePool(() => true, null)].filter(([id]) => parseInt(hash(id), 36) % 3 === 0));
    return merge(bank((x) => x.mode !== 'region' || x.region === rid), conceptPool(), committeePool(true), people, rules);
  }

  // ---------- deck state (per mode), the current card and the score live in FCR.store ----------
  const getDecks = () => FCR.store.get('quizDeck', {}) || {};
  const getCur = () => FCR.store.get('quizCur', {}) || {};
  function deal(key, pool, avoid) {
    const decks = getDecks(); const st = decks[key] || { queue: [], round: 0, missed: [] };
    st.queue = (st.queue || []).filter((id) => pool.has(id));
    let card = null;
    for (let pass = 0; pass < 2 && !card; pass++) {
      if (!st.queue.length) { // a fresh shuffled deck (never starting with the card just shown)
        st.queue = shuffle([...pool.keys()]); st.round = (st.round || 0) + 1; st.seen = 0;
        if (st.queue.length > 1 && st.queue[0] === avoid) st.queue.push(st.queue.shift());
      }
      while (st.queue.length && !card) {
        const id = st.queue.shift(), s = pool.get(id);
        const wrong = s.wrong ? s.wrong.slice(0, 3) : shuffle([...new Set((s.pool || []).filter((x) => x && x !== s.a))]).slice(0, 3);
        if (wrong.length >= 2 && !wrong.includes(s.a)) card = { id, q: s.q, cue: s.cue || '', a: s.a, opts: shuffle([s.a].concat(wrong)), link: s.link, src: s.src || '', picked: null };
      }
    }
    if (card) st.seen = (st.seen || 0) + 1;
    st.size = pool.size; st.missed = (st.missed || []).filter((id) => pool.has(id));
    decks[key] = st; FCR.store.set('quizDeck', decks);
    return card;
  }
  function onAnswer(key, card, ok) {
    const decks = getDecks(); const st = decks[key] || { queue: [], missed: [] };
    st.missed = st.missed || [];
    if (ok) st.missed = st.missed.filter((x) => x !== card.id);
    else { if (!st.missed.includes(card.id)) st.missed.push(card.id); const q = st.queue || []; q.splice(Math.min(q.length, 3 + Math.floor(Math.random() * 3)), 0, card.id); st.queue = q; }
    decks[key] = st; FCR.store.set('quizDeck', decks);
  }

  // ---------- view ----------
  V.quiz = function (el, args) {
    args = args || [];
    const nodeId = args[0] === 'node' && args[1] ? args[1] : null;
    let mode = nodeId ? 'node' : MODES.some((m) => m[0] === args[0]) ? args[0] : FCR.store.get('quizMode', 'all');
    if (!MODES.some((m) => m[0] === mode) && mode !== 'node') mode = 'all';
    if (args[0] && mode !== 'node' && MODES.some((m) => m[0] === args[0])) FCR.store.set('quizMode', mode);
    const rid = (FCR.areas[myArea()] || {}).region || 'SW';
    const key = mode === 'node' ? 'node:' + nodeId : mode === 'region' ? 'region:' + rid : mode;
    const node = nodeId && FCR.learnTree ? FCR.learnTree.node(nodeId) : null;
    const score = FCR.store.get('quiz', { right: 0, total: 0, streak: 0 });
    const pool = poolFor(key);

    function render(card) {
      const st = getDecks()[key] || {};
      const left = (st.queue || []).length, missed = (st.missed || []).length;
      el.innerHTML = `<div class="page-head"><div><h1>Quiz yourself</h1><p>Questions from the Service Manual and the Final Reports (with page numbers), the rosters, the committee-draw history and the calendar. Each deck is shuffled: no repeats until you've seen it all, and missed questions come back.</p></div></div>
        <div class="qz-bar"><div class="seg" id="qz-mode" role="group" aria-label="Question set">${MODES.map(([k, l]) => `<button data-m="${k}" class="${mode === k ? 'on' : ''}" aria-pressed="${mode === k}">${l}${k === 'region' ? ` (${esc(FCR.regionName(rid))})` : ''}</button>`).join('')}</div>
          <span class="spacer"></span><span id="qz-score" aria-live="polite">Score <strong>${score.right}/${score.total}</strong> · streak ${score.streak}</span><button class="btn" id="qz-reset">Reset score</button></div>
        ${mode === 'node' ? `<div class="callout qz-node">Quiz on <strong>${esc(node ? node.title : nodeId)}</strong> · <a href="#/learn/${esc(nodeId)}">back to Learn</a> · <a href="#/quiz/all">all questions</a></div>` : ''}
        ${mode === 'concepts' ? `<div class="qz-meta small muted"><span>Each card puts an idea from the Twelve Concepts in our own words: name the Concept it belongs to. <a href="#/learn/concepts">The Concepts on Learn</a></span></div>` : ''}
        ${mode === 'committees' ? `<div class="qz-meta small muted"><span>Each card gives a duty from the Service Manual (Conference committees pp. 46–48, trustees’ committees pp. 58–60): name the committee. <a href="#/learn/conf_committees">Conference committees</a> · <a href="#/learn/trustees_committees">Trustees’ committees</a></span></div>` : ''}
        ${mode === 'region' ? `<div class="qz-meta small"><label for="qz-area">Your area</label><select id="qz-area">${FCR.areaList.map((a) => `<option value="${a.n}" ${a.n === myArea() ? 'selected' : ''}>${esc(FCR.areaLabel(a.n))}</option>`).join('')}</select><span class="muted">sets the region (also used on Today)</span></div>` : ''}
        ${card ? `<div class="qz-meta small muted" id="qz-deck">Card ${st.seen || 1} · ${left} left in this ${pool.size}-question deck${missed ? ` · ${missed} missed to review` : ''}<span class="qz-keys"> · keys 1–4 answer, N next</span></div>
        <div class="card quiz-card"><div class="quiz-q" id="qz-q">${esc(card.q)}${card.cue ? ` <span class="qz-cue">${esc(card.cue)}</span>` : ''}</div>
          <div class="quiz-opts" role="group" aria-labelledby="qz-q">${card.opts.map((o, i) => `<button type="button" data-i="${i}"><span class="qz-k" aria-hidden="true">${i + 1}</span><span class="qz-t">${esc(o)}</span></button>`).join('')}</div>
          <div id="qz-live" class="small" role="status" aria-live="polite" style="margin-top:8px"></div>
          <div id="qz-after" style="margin-top:12px" hidden><div class="flex">${card.link ? `<a href="${card.link}">Learn more →</a>` : ''}${card.src ? `<span class="small muted">${esc(card.src)}</span>` : ''}<span class="spacer"></span><button class="btn primary" id="qz-next">Next question</button></div></div></div>`
          : UI.empty(mode === 'node' ? 'No questions for this part of the structure yet.' : 'Not enough data for this quiz yet.')}`;
      el.querySelectorAll('#qz-mode button').forEach((b) => b.addEventListener('click', () => { location.hash = '#/quiz/' + b.dataset.m; }));
      el.querySelector('#qz-reset').addEventListener('click', () => { score.right = 0; score.total = 0; score.streak = 0; FCR.store.set('quiz', score); paintScore(); });
      const sel = el.querySelector('#qz-area');
      if (sel) sel.addEventListener('change', () => { FCR.store.set('myArea', +sel.value); const c = getCur(); delete c[key]; FCR.store.set('quizCur', c); V.quiz(el, args); });
      if (!card) return;
      const btns = [...el.querySelectorAll('.quiz-opts button')];
      btns.forEach((b) => b.addEventListener('click', () => answer(card, +b.dataset.i)));
      el.querySelector('#qz-next').addEventListener('click', next);
      if (card.picked != null) showAnswer(card, false);
    }
    function paintScore() { const s = el.querySelector('#qz-score'); if (s) s.innerHTML = `Score <strong>${score.right}/${score.total}</strong> · streak ${score.streak}`; }
    function showAnswer(card, focus) {
      const ok = card.opts[card.picked] === card.a;
      el.querySelectorAll('.quiz-opts button').forEach((x, i) => {
        const o = card.opts[i];
        if (o === card.a) { x.classList.add('right'); x.querySelector('.qz-t').insertAdjacentHTML('beforeend', ' <span class="small">— correct answer</span>'); }
        else if (i === card.picked) { x.classList.add('wrong'); x.querySelector('.qz-t').insertAdjacentHTML('beforeend', ' <span class="small">— your answer</span>'); }
        x.setAttribute('aria-disabled', 'true');
      });
      el.querySelector('#qz-live').textContent = ok ? 'Correct.' : `Not quite. The answer is ${card.a}${endDot(card.a)}`;
      el.querySelector('#qz-after').hidden = false;
      if (focus) el.querySelector('#qz-next').focus();
    }
    function answer(card, i) {
      if (card.picked != null) return;
      card.picked = i;
      const ok = card.opts[i] === card.a;
      score.total++; if (ok) { score.right++; score.streak++; } else score.streak = 0;
      FCR.store.set('quiz', score); paintScore();
      const c = getCur(); c[key] = card; FCR.store.set('quizCur', c);
      onAnswer(key, card, ok);
      showAnswer(card, true);
    }
    function next() {
      const prev = getCur()[key];
      const card = deal(key, pool, prev && prev.id);
      const c = getCur(); if (card) c[key] = card; else delete c[key]; FCR.store.set('quizCur', c);
      render(card);
      const q = el.querySelector('.quiz-card'); if (q && q.getBoundingClientRect().top < 0) q.scrollIntoView({ block: 'start' });
    }
    // Keep the current card across re-renders (theme toggle, Back): only deal when there is none or it left the pool.
    const cur = getCur()[key];
    if (cur && pool.has(cur.id) && Array.isArray(cur.opts) && cur.opts.includes(cur.a)) render(cur); else next();
  };

  // Keyboard: 1-4 pick an answer, N (or Enter outside a button) goes to the next question. One listener for the app.
  document.addEventListener('keydown', (e) => {
    if (!/^#\/quiz/.test(location.hash) || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target; if (t && /^(input|select|textarea)$/i.test(t.tagName)) return;
    const card = document.querySelector('#main .quiz-card'); if (!card) return;
    const after = card.querySelector('#qz-after');
    if (/^[1-4]$/.test(e.key) && after && after.hidden) {
      const b = card.querySelectorAll('.quiz-opts button')[+e.key - 1]; if (b) { e.preventDefault(); b.click(); }
    } else if ((e.key === 'n' || e.key === 'N' || (e.key === 'Enter' && !(t && /^(button|a)$/i.test(t.tagName)))) && after && !after.hidden) {
      e.preventDefault(); card.querySelector('#qz-next').click();
    }
  });
})();
