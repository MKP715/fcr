/* Committee-assignment predictor.
   Service Manual (2026–2028, ch. 7): "Committee assignments are determined by lot … typically held in December …
   to replace outgoing delegates on each committee." The rosters add regularities, all shown on the Predict page:
   (1) an area is not drawn onto a committee it held in its last three terms, (2) a new panel's members of one
   committee come from different regions, (3) each committee is refilled to its standard size (8 or 9), and softly
   (4) regions spread across the whole committee, (5) neighbouring areas and (6) areas of the same state/province
   are kept apart. The predictor samples that constrained lot: a greedy fill finds a valid starting assignment, then
   Markov chains of committee swaps mix it so each valid assignment is drawn with weight exp(-soft costs).
   Every page reads the odds through FCR.predict.odds(P, opts): the default forecast of a pending panel is
   precomputed offline (data/src/forecast.json, tools/dev/precompute_forecast.js); anything else is simulated once
   per panel + settings and memoised, so all pages agree.
   Public API (FCR.predict): odds(P, opts) · explain(P, area, opts) · whatIf(P, area, committee, opts) ·
   committee(P, c, opts) · secondary(problem, opts) · simulate(problem, opts) · backtest(opts, panels) · patterns() ·
   fmt(p) · ablationSettings(opts) · buildProblem(P) · typicalDraw(problem, opts, probs) (legacy; prefer odds().lineup). */
(function () {
  'use strict';
  const FCR = window.FCR;
  const RAW = FCR.RAW || window.FCR_DATA || {};
  const MODEL_VERSION = '2026-10-20.2'; // bump when the sampler or a rule changes (invalidates forecast.json)

  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(arr, r) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  /** The rule settings (everything else in an options object is run control: seed, quality, sims, fixed …). */
  const RULE_KEYS = ['excludeLast', 'regionCap', 'crossPanelRegion', 'capacity', 'recency', 'spreadPenalty', 'neighborPenalty', 'sameStatePenalty', 'icrfRotation', 'archivesNeighbor'];
  const BASE = {
    excludeLast: 3,        // hard: skip committees the area held in its last k terms (panels P-2 … P-2k)
    regionCap: 1,          // hard: max new delegates from one region on a committee within the panel
    crossPanelRegion: false, // count continuing members toward regionCap too
    capacity: 'target',    // 'target' = standard size − continuing (fallback 'replace'); 'replace' = seats vacated; 'balance' = even totals
    recency: 0,            // soft: extra weight for committees not held for a long time (tested, not used)
    spreadPenalty: 4,      // soft: cost per extra same-region member on the committee (both panels)
    neighborPenalty: 2,    // soft: cost per neighbouring area on the committee (both panels)
    sameStatePenalty: 8,   // soft (≈ hard): cost per same-state/province member on the committee (both panels; main state)
    icrfRotation: 1.6,     // IC/RF: an area that held IC/RF in its last 3 terms weighs e^-1.6 ≈ 0.2
    archivesNeighbor: 1,   // Archives: weight e^-1 per neighbour pair among new members and with continuing members
    quality: 'interactive',
    seed: 77,
  };
  const pickKeys = (o, keys) => { const r = {}; keys.forEach((k) => { if (o && o[k] !== undefined) r[k] = o[k]; }); return r; };
  const DEFAULTS = Object.assign({}, BASE, pickKeys(RAW.modelDefaults || {}, RULE_KEYS));
  FCR.MODEL_DEFAULTS = DEFAULTS;
  const settingsOf = (o) => { const s = Object.assign({}, DEFAULTS, o || {}); const r = {}; RULE_KEYS.forEach((k) => (r[k] = s[k])); return r; };
  const sameSettings = (a, b) => RULE_KEYS.every((k) => String((a || {})[k]) === String((b || {})[k]));

  /** Sampler presets. thin and burn are in units of n proposals (n = areas in the panel); draws are per chain.
      Measured on Panel 77 (48 areas) in Node: 'fast' ≈ 50 ms, 'interactive' ≈ 120 ms (between-seed sd ≈ 0.3-0.4 pt per
      cell, worst ≈ 2 pts), 'precise' ≈ 13 s (1.5 million draws, ≥ 100,000 effective per cell) for the offline forecast. */
  const QUALITY = {
    fast:        { chains: 8,  draws: 400,  thin: 8, burn: 150 },
    backtest:    { chains: 8,  draws: 1000, thin: 8, burn: 200 },
    interactive: { chains: 8,  draws: 1200, thin: 8, burn: 200 },
    precise:     { chains: 256, draws: 6000, thin: 8, burn: 400 },
  };

  const ICRF_PARITY = { 1: ['EC', 'ECAN', 'NE', 'PA'], 0: ['SE', 'SW', 'WC', 'WCAN'] }; // fixed slots since the Panel 70 draw

  function regionOf(a) { const x = FCR.areas[a]; return x && x.region ? x.region : 'R?' + a; }
  function stateOf(a) { const x = FCR.areas[a]; return x && x.state ? x.state : 'S?' + a; } // main state only (Areas 1, 48, 74 span two)
  function primaryCommittees(year) {
    const Y = FCR.Y(year) || FCR.Y(FCR.latestYear);
    const ids = (Y.conference_committees || []).filter((c) => !c.secondary && c.committee !== 'OTHER').map((c) => c.committee);
    return ids.length ? [...new Set(ids)] : FCR.PRIMARY_ORDER.slice();
  }
  function panelTerms(P) { return Object.values(FCR.terms).filter((t) => t.panel === P); }
  /** Committees an area held in its last k terms before panel P (by panel distance, so a missing term doesn't shift the window). */
  function recentCommittees(hist, P, k) { return new Set(hist.filter((h) => h.panel >= P - 2 * k).map((h) => h.committee)); }
  /** Standard committee sizes before year: each committee's most common size in loaded years < year (tie → earliest seen). */
  function targetSizes(committees, year) {
    const T = {};
    committees.forEach((c) => {
      const cnt = {}, first = {};
      FCR.years.filter((y) => y < year).forEach((y) => {
        const cm = (FCR.Y(y).conference_committees || []).find((x) => !x.secondary && x.committee === c);
        if (!cm) return;
        const k = (cm.members || []).filter((m) => m.area != null).length;
        cnt[k] = (cnt[k] || 0) + 1; if (first[k] == null) first[k] = y;
      });
      const ks = Object.keys(cnt).map(Number);
      if (ks.length) T[c] = ks.sort((a, b) => cnt[b] - cnt[a] || first[a] - first[b])[0];
    });
    return T;
  }
  function hash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); }

  /** Build the problem for target panel P using only information available before its first Conference. */
  function buildProblem(P) {
    const year = P + 1950;
    const parity = P % 2;
    const committees = primaryCommittees(FCR.Y(year) ? year : FCR.latestYear);
    const known = panelTerms(P);
    let areas = known.length ? known.map((t) => t.area) : FCR.areaList.map((a) => a.n).filter((n) => FCR.areaParity(n) === parity);
    areas = [...new Set(areas)].sort((a, b) => a - b);
    const cont = {}; committees.forEach((c) => (cont[c] = []));
    panelTerms(P - 1).forEach((t) => { const c = t.committees[year] || t.committee; if (c && cont[c]) cont[c].push(t.area); });
    const outgoing = {}; committees.forEach((c) => (outgoing[c] = []));
    panelTerms(P - 2).forEach((t) => { if (t.committee && outgoing[t.committee]) outgoing[t.committee].push(t.area); });
    const history = {};
    areas.forEach((a) => {
      history[a] = (FCR.termsByArea[a] || []).filter((t) => t.panel < P && t.committee).map((t) => ({ panel: t.panel, committee: t.committee, secondary: t.secondaryList }));
    });
    const actual = {};
    known.forEach((t) => { if (t.committees[year] || t.committee) actual[t.area] = t.committees[year] || t.committee; });
    const actualSec = {};
    known.forEach((t) => { if (t.secondaryList.length) actualSec[t.area] = t.secondaryList; });
    const outKnown = committees.some((c) => outgoing[c].length);
    const contKnown = committees.some((c) => cont[c].length);
    // Is the history complete? The previous term of this parity (P-2) must be in the data for exclusions to be reliable.
    const histKnown = panelTerms(P - 2).some((t) => t.committee);
    const target = targetSizes(committees, year);
    // Fingerprint of every input the sampler reads, including the geography behind the spread, neighbour and
    // same-state rules (region, main state, border pairs of the areas in the lot and the continuing members).
    const involved = [...new Set(areas.concat(...committees.map((c) => cont[c])))].sort((a, b) => a - b);
    const geo = involved.map((a) => a + ':' + regionOf(a) + ':' + stateOf(a));
    const nb = []; involved.forEach((a, i) => involved.slice(i + 1).forEach((b) => { if (FCR.isNeighbor(a, b)) nb.push(a + '-' + b); }));
    const fingerprint = hash(JSON.stringify([P, committees, areas, cont, outgoing, target, areas.map((a) => history[a].map((h) => h.panel + h.committee)), geo, nb]));
    return { P, year, committees, areas, cont, outgoing, history, actual, actualSec, outKnown, contKnown, histKnown, target, fingerprint };
  }

  /** New seats per committee. 'target' = standard size − continuing members, falling back to 'replace' when that
      doesn't add up to the panel size; 'replace' = outgoing members (reconciled to the panel size); 'balance' = even totals. */
  function capacities(problem, opt, r) {
    const { committees, areas, cont, outgoing, outKnown } = problem;
    const cap = {}; committees.forEach((c) => (cap[c] = 0));
    if (opt.capacity === 'target') {
      const T = problem.target || {};
      const ok = committees.every((c) => T[c] != null && T[c] - cont[c].length >= 0);
      const s = committees.reduce((a, c) => a + (T[c] || 0) - cont[c].length, 0);
      if (ok && s === areas.length) { committees.forEach((c) => (cap[c] = T[c] - cont[c].length)); cap._rule = 'target'; return cap; }
    }
    const outTotal = committees.reduce((s, c) => s + outgoing[c].length, 0);
    if ((opt.capacity === 'replace' || opt.capacity === 'target') && outKnown) {
      committees.forEach((c) => (cap[c] = outgoing[c].length));
      let diff = areas.length - outTotal; // reconcile if the panel size differs from the outgoing panel
      const tot = (c) => cap[c] + cont[c].length;
      while (diff > 0) { const m = Math.min(...committees.map(tot)); const cs = committees.filter((c) => tot(c) === m); cap[cs[Math.floor(r() * cs.length)]]++; diff--; }
      while (diff < 0) { const m = Math.max(...committees.map(tot)); const cs = committees.filter((c) => tot(c) === m && cap[c] > 0); cap[cs[Math.floor(r() * cs.length)]]--; diff++; }
      cap._rule = 'replace';
    } else {
      const tot = {}; committees.forEach((c) => (tot[c] = cont[c].length));
      for (let i = 0; i < areas.length; i++) {
        const m = Math.min(...committees.map((c) => tot[c])); const cs = committees.filter((c) => tot[c] === m);
        const c = cs[Math.floor(r() * cs.length)]; cap[c]++; tot[c]++;
      }
      cap._rule = 'balance';
    }
    return cap;
  }

  function weight(hist, c, opt, P) {
    if (!opt.recency) return 1;
    let last = null;
    for (const h of hist) if (h.committee === c) last = h.panel;
    const gapTerms = last == null ? 8 : Math.min(8, (P - last) / 2);
    return 1 + opt.recency * (gapTerms / 8);
  }

  /** Index the problem into typed arrays for the sampler (areas i < n, committees k < m, regions g < G, states s < NS). */
  function prepare(problem, opt) {
    const { committees, areas, history, P, cont } = problem;
    const n = areas.length, m = committees.length;
    const cidx = {}; committees.forEach((c, k) => (cidx[c] = k));
    const gIdx = {}, sIdx = {};
    const gOf = (a) => { const g = regionOf(a); return gIdx[g] != null ? gIdx[g] : (gIdx[g] = Object.keys(gIdx).length); };
    const sOf = (a) => { const s = stateOf(a); return sIdx[s] != null ? sIdx[s] : (sIdx[s] = Object.keys(sIdx).length); };
    const reg = new Int16Array(n), sta = new Int16Array(n);
    areas.forEach((a, i) => { reg[i] = gOf(a); sta[i] = sOf(a); });
    const contList = []; committees.forEach((c, k) => (cont[c] || []).forEach((b) => contList.push([k, b, gOf(b), sOf(b)])));
    const G = Object.keys(gIdx).length, NS = Object.keys(sIdx).length;
    const nbm = new Uint8Array(n * n), nbl = [];
    for (let i = 0; i < n; i++) { const l = []; for (let j = 0; j < n; j++) if (i !== j && FCR.isNeighbor(areas[i], areas[j])) { nbm[i * n + j] = 1; l.push(j); } nbl.push(Int16Array.from(l)); }
    const allowed = new Uint8Array(n * m), excl = [];
    areas.forEach((a, i) => { const ex = recentCommittees(history[a] || [], P, opt.excludeLast); excl.push(ex); committees.forEach((c, k) => (allowed[i * m + k] = ex.has(c) ? 0 : 1)); });
    let lw = null;
    if (opt.recency) { lw = new Float64Array(n * m); areas.forEach((a, i) => committees.forEach((c, k) => (lw[i * m + k] = Math.log(weight(history[a] || [], c, opt, P))))); }
    // continuing members' contribution to the soft-cost counts
    const R0 = new Int16Array(m * G), S0 = new Int16Array(m * NS), NB0 = new Int16Array(m * n), RC0 = new Int16Array(m * G);
    contList.forEach(([k, b, g, s]) => {
      R0[k * G + g]++; S0[k * NS + s]++; if (opt.crossPanelRegion) RC0[k * G + g]++;
      for (let i = 0; i < n; i++) if (FCR.isNeighbor(areas[i], b)) NB0[k * n + i]++;
    });
    const fixed = new Int16Array(n).fill(-1);
    Object.entries(opt.fixed || {}).forEach(([a, c]) => { const i = areas.indexOf(+a); if (i >= 0 && cidx[c] != null) fixed[i] = cidx[c]; });
    return { n, m, G, NS, areas, committees, cidx, reg, sta, nbm, nbl, allowed, excl, lw, R0, S0, NB0, RC0, fixed };
  }

  /** Greedy most-constrained-first fill: only used to find a valid starting assignment for a chain. */
  function greedyStart(ctx, capArr, opt, r) {
    const { n, m, G, reg, allowed, RC0, fixed } = ctx;
    const capR = opt.regionCap;
    for (let attempt = 0; attempt < 8; attempt++) {
      const cap = Int16Array.from(capArr), RC = Int16Array.from(RC0), pick = new Int16Array(n).fill(-1);
      let relax = 0, ok = true;
      for (let i = 0; i < n; i++) if (fixed[i] >= 0) { const k = fixed[i]; pick[i] = k; cap[k]--; RC[k * G + reg[i]]++; }
      const remaining = shuffle([...Array(n).keys()].filter((i) => fixed[i] < 0), r);
      while (remaining.length) {
        let bestI = 0, bestN = Infinity, bestAllowed = null;
        for (let x = 0; x < remaining.length; x++) {
          const i = remaining[x], g = reg[i], al = [];
          for (let k = 0; k < m; k++) if (cap[k] > 0 && allowed[i * m + k] && RC[k * G + g] < capR) al.push(k);
          if (al.length < bestN) { bestN = al.length; bestI = x; bestAllowed = al; if (bestN === 0) break; }
        }
        const i = remaining.splice(bestI, 1)[0], g = reg[i];
        let al = bestAllowed;
        if (!al.length) {
          if (attempt < 7) { ok = false; break; }
          relax++;
          al = []; for (let k = 0; k < m; k++) if (cap[k] > 0 && allowed[i * m + k]) al.push(k);
          if (!al.length) for (let k = 0; k < m; k++) if (cap[k] > 0) al.push(k);
          if (!al.length) for (let k = 0; k < m; k++) al.push(k);
        }
        const k = al[Math.floor(r() * al.length)];
        pick[i] = k; cap[k]--; RC[k * G + g]++;
      }
      if (ok) return { pick, RC, relax };
    }
    return null;
  }

  /** Sample the lot. Options: rule settings (see DEFAULTS), quality ('fast' | 'backtest' | 'interactive' | 'precise'),
      sims (legacy: total kept draws), seed, fixed {area: committee} (known assignments that condition the rest),
      onDraw(pick {area: committee}) per kept draw. Returns probs/se per area × committee, mean seats, an example draw. */
  function simulate(problem, options) {
    const t0 = now();
    const opt = Object.assign({}, DEFAULTS, options || {});
    const qname = QUALITY[opt.quality] ? opt.quality : 'interactive';
    const q = Object.assign({}, QUALITY[qname], opt.chains ? { chains: opt.chains } : {});
    const chains = Math.max(1, q.chains);
    const perChain = opt.sims ? Math.max(1, Math.ceil(opt.sims / chains)) : q.draws;
    const r = rng(opt.seed + problem.P * 101);
    const ctx = prepare(problem, opt);
    const { n, m, G, NS, areas, committees, cidx, reg, sta, nbm, nbl, allowed, lw, R0, S0, NB0, fixed } = ctx;
    const free = Int16Array.from([...Array(n).keys()].filter((i) => fixed[i] < 0)), nf = free.length;
    const sp = +opt.spreadPenalty || 0, nbp = +opt.neighborPenalty || 0, ssp = +opt.sameStatePenalty || 0, capR = opt.regionCap;
    const soft = sp > 0 || nbp > 0 || ssp > 0 || !!lw;
    const thin = Math.max(1, Math.round(q.thin * n)), burn = Math.round(q.burn * n);
    const tally = new Float64Array(n * m), sq = new Float64Array(n * m), seatSum = new Float64Array(m);
    const maxStore = 3000, storeEvery = Math.max(1, Math.ceil((chains * perChain) / maxStore));
    const store = []; let relaxed = 0, draws = 0, prop = 0, acc = 0, seatAdjusted = false, capRule = null, okChains = 0;
    const onDraw = opt.onDraw, onDrawIdx = opt.onDrawIdx;
    for (let ch = 0; ch < chains; ch++) {
      const capObj = capacities(problem, opt, r); capRule = capObj._rule;
      const capArr = new Int16Array(m); committees.forEach((c, k) => (capArr[k] = capObj[c]));
      // known assignments take their seats; if a committee has none left, borrow one from the committee with most spare
      const fc = new Int16Array(m); for (let i = 0; i < n; i++) if (fixed[i] >= 0) fc[fixed[i]]++;
      for (let k = 0; k < m; k++) while (fc[k] > capArr[k]) {
        let best = -1; for (let k2 = 0; k2 < m; k2++) if (k2 !== k && capArr[k2] - fc[k2] > 0 && (best < 0 || capArr[k2] - fc[k2] > capArr[best] - fc[best])) best = k2;
        if (best < 0) break; capArr[best]--; capArr[k]++; seatAdjusted = true;
      }
      const st = greedyStart(ctx, capArr, opt, r);
      if (!st) continue;
      okChains++; relaxed += st.relax;
      const pick = st.pick, RC = st.RC;
      const R = Int16Array.from(R0), S = Int16Array.from(S0), NB = Int16Array.from(NB0);
      for (let i = 0; i < n; i++) { const k = pick[i]; R[k * G + reg[i]]++; S[k * NS + sta[i]]++; const l = nbl[i]; for (let x = 0; x < l.length; x++) NB[k * n + l[x]]++; }
      const ct = new Float64Array(n * m);
      const total = burn + perChain * thin;
      let next = burn + thin;
      for (let it = 1; it <= total; it++) {
        // propose swapping the committees of two free areas (symmetric proposal; Metropolis on the soft costs)
        prop++;
        const i = free[(r() * nf) | 0], j = free[(r() * nf) | 0];
        if (i !== j) {
          const ka = pick[i], kb = pick[j];
          if (ka !== kb && allowed[i * m + kb] && allowed[j * m + ka]) {
            const gi = reg[i], gj = reg[j];
            if (gi === gj || (RC[kb * G + gi] < capR && RC[ka * G + gj] < capR)) {
              let d = 0;
              if (soft) {
                const si = sta[i], sj = sta[j], nij = nbm[i * n + j];
                if (sp && gi !== gj) d += sp * (R[kb * G + gi] + R[ka * G + gj] - R[ka * G + gi] - R[kb * G + gj] + 2);
                if (nbp) d += nbp * (NB[kb * n + i] + NB[ka * n + j] - NB[ka * n + i] - NB[kb * n + j] - 2 * nij);
                if (ssp && si !== sj) d += ssp * (S[kb * NS + si] + S[ka * NS + sj] - S[ka * NS + si] - S[kb * NS + sj] + 2);
                if (lw) d += lw[i * m + ka] + lw[j * m + kb] - lw[i * m + kb] - lw[j * m + ka];
              }
              if (d <= 0 || r() < Math.exp(-d)) {
                acc++;
                pick[i] = kb; pick[j] = ka;
                if (gi !== gj) { R[ka * G + gi]--; R[kb * G + gi]++; R[kb * G + gj]--; R[ka * G + gj]++; RC[ka * G + gi]--; RC[kb * G + gi]++; RC[kb * G + gj]--; RC[ka * G + gj]++; }
                const si = sta[i], sj = sta[j];
                if (si !== sj) { S[ka * NS + si]--; S[kb * NS + si]++; S[kb * NS + sj]--; S[ka * NS + sj]++; }
                let l = nbl[i]; for (let x = 0; x < l.length; x++) { NB[ka * n + l[x]]--; NB[kb * n + l[x]]++; }
                l = nbl[j]; for (let x = 0; x < l.length; x++) { NB[kb * n + l[x]]--; NB[ka * n + l[x]]++; }
              }
            }
          }
        }
        if (it === next) {
          next += thin;
          for (let x = 0; x < n; x++) ct[x * m + pick[x]]++;
          if (draws % storeEvery === 0) store.push(Int16Array.from(pick));
          if (onDrawIdx) onDrawIdx(pick, ctx);
          if (onDraw) { const o = {}; for (let x = 0; x < n; x++) o[areas[x]] = committees[pick[x]]; onDraw(o); }
          draws++;
        }
      }
      for (let x = 0; x < n * m; x++) { tally[x] += ct[x]; const p = ct[x] / perChain; sq[x] += p * p; }
      for (let k = 0; k < m; k++) seatSum[k] += capArr[k];
    }
    // pooled probabilities; between-chain standard errors (chains are independent replicates)
    const probs = {}, se = {}, seats = {};
    const K = okChains;
    areas.forEach((a, i) => {
      probs[a] = {}; se[a] = {};
      committees.forEach((c, k) => {
        const x = i * m + k, p = draws ? tally[x] / draws : 0;
        probs[a][c] = p;
        if (K > 1) { const v = Math.max(0, (sq[x] / K - p * p) * K / (K - 1)); se[a][c] = Math.sqrt(v / K); }
        else se[a][c] = draws ? Math.sqrt(p * (1 - p) / draws) : 0;
      });
    });
    committees.forEach((c, k) => (seats[c] = K ? seatSum[k] / K : 0));
    // example full draw: the stored draw whose areas sit on their most probable committees (max Σ log p)
    let best = null, bestS = -Infinity;
    store.forEach((pk) => { let s = 0; for (let x = 0; x < n; x++) s += Math.log(tally[x * m + pk[x]] / draws || 1e-9); if (s > bestS) { bestS = s; best = pk; } });
    const lineup = best ? {} : null;
    if (best) areas.forEach((a, x) => (lineup[a] = committees[best[x]]));
    return { probs, se, seats, draws, chains: K, perChain, quality: qname, relaxRate: K ? relaxed / (K * n) : 0, acceptRate: prop ? acc / prop : 0,
      options: opt, settings: settingsOf(opt), capacityRule: capRule, seatAdjusted, fixed: Object.assign({}, opt.fixed || {}), lineup, ms: Math.round(now() - t0) };
  }

  /** One complete, rule-consistent draw: among simulated draws, the one whose areas sit on their most probable
      committees (highest sum of log-probabilities under `probs`). Unlike per-area favourites, it never puts two areas
      somewhere the rules keep them apart. Prefer odds(P).lineup, which comes with the shared forecast. */
  function typicalDraw(problem, options, probs) {
    let best = null;
    simulate(problem, Object.assign({}, options, { sims: undefined, quality: 'fast', seed: ((options && options.seed) || DEFAULTS.seed) + 7, onDraw: (pick) => {
      let sc = 0; for (const a in pick) sc += Math.log((probs[a] && probs[a][pick[a]]) || 1e-6);
      if (!best || sc > best.score) best = { score: sc, pick: Object.assign({}, pick) };
    } }));
    return best ? best.pick : null;
  }

  /** Secondary committees (computed exactly, no sampling noise).
      IC/RF: one delegate per region; since the Panel 70 draw odd panels fill East Central, Eastern Canada, Northeast and
      Pacific, even panels Southeast, Southwest, West Central and Western Canada. Within a region the seat rotates: an area
      that held IC/RF in its last 3 terms weighs e^-icrfRotation.
      Archives: four new members from four different regions, each neighbour pair (among them or with a continuing
      Archives member) weighing e^-archivesNeighbor. */
  function secondary(problem, options) {
    const opt = Object.assign({}, DEFAULTS, options || {});
    const { P, areas } = problem;
    const out = { ICRF: null, ARCHIVES: null };
    const regsOf = (p, sc) => panelTerms(p).filter((t) => t.secondaryList.includes(sc)).map((t) => regionOf(t.area));
    // IC/RF
    const contRegions = [...new Set(regsOf(P - 1, 'ICRF'))];
    const complement = FCR.REGIONS.map((x) => x.id).filter((g) => !contRegions.includes(g));
    let regions, basis;
    if (P >= 70) {
      regions = ICRF_PARITY[P % 2].slice();
      basis = contRegions.length >= 3 && complement.slice().sort().join() === regions.slice().sort().join() ? 'continuing' : 'parity';
    } else if (contRegions.length >= 3) { regions = complement; basis = 'continuing'; }
    else {
      const hist = new Set(); [2, 4, 6].forEach((k) => regsOf(P - k, 'ICRF').forEach((g) => hist.add(g)));
      regions = hist.size === 4 ? [...hist] : ICRF_PARITY[P % 2].slice(); basis = hist.size === 4 ? 'history' : 'parity';
    }
    const held = {}, recent = {};
    areas.forEach((a) => {
      const ps = (FCR.termsByArea[a] || []).filter((t) => t.panel < P && t.secondaryList.includes('ICRF')).map((t) => t.panel);
      if (ps.length) held[a] = ps;
      const rp = ps.filter((p) => p >= P - 6); if (rp.length) recent[a] = rp[rp.length - 1];
    });
    const beta = +opt.icrfRotation || 0;
    const icProbs = {}, pools = {};
    regions.forEach((g) => {
      const pool = areas.filter((a) => regionOf(a) === g); pools[g] = pool;
      const w = pool.map((a) => (recent[a] != null ? Math.exp(-beta) : 1)); const Z = w.reduce((s, x) => s + x, 0);
      pool.forEach((a, i) => (icProbs[a] = w[i] / Z));
    });
    const expRecentPicks = Object.keys(recent).reduce((s, a) => s + (icProbs[a] || 0), 0);
    out.ICRF = { seats: regions.length, regions, probs: icProbs, basis, outgoingRegions: regsOf(P - 2, 'ICRF'), continuingRegions: contRegions,
      held, recent, rotation: beta, pools, expectedRecentHolderPicks: expRecentPicks };
    // Archives: exact enumeration of every distinct-region set of `seats` areas
    const outgoing = regsOf(P - 2, 'ARCHIVES');
    const contA = panelTerms(P - 1).filter((t) => t.secondaryList.includes('ARCHIVES')).map((t) => t.area);
    const byReg = {}; areas.forEach((a) => (byReg[regionOf(a)] = byReg[regionOf(a)] || []).push(a));
    const regs = Object.keys(byReg);
    const seats = Math.min(outgoing.length || 4, regs.length);
    const lam = +opt.archivesNeighbor || 0;
    const nbCont = {}; areas.forEach((a) => { const l = contA.filter((b) => FCR.isNeighbor(a, b)); if (l.length) nbCont[a] = l; });
    const mass = {}; areas.forEach((a) => (mass[a] = 0));
    let Z = 0, sets = 0, expPairs = 0;
    const chosen = [];
    const rec = (start, pairs) => {
      if (chosen.length === seats) { const w = Math.exp(-lam * pairs); Z += w; sets++; expPairs += w * pairs; chosen.forEach((a) => (mass[a] += w)); return; }
      for (let gi = start; gi <= regs.length - (seats - chosen.length); gi++) {
        for (const a of byReg[regs[gi]]) {
          let add = (nbCont[a] || []).length; for (const b of chosen) if (FCR.isNeighbor(a, b)) add++;
          chosen.push(a); rec(gi + 1, pairs + add); chosen.pop();
        }
      }
    };
    rec(0, 0);
    const arProbs = {}; areas.forEach((a) => (arProbs[a] = Z ? mass[a] / Z : seats / areas.length));
    out.ARCHIVES = { seats, probs: arProbs, outgoingRegions: outgoing, continuingRegions: regsOf(P - 1, 'ARCHIVES'), continuing: contA,
      nbOfContinuing: nbCont, lambda: lam, sets, expectedNeighbourPairs: Z ? expPairs / Z : 0 };
    return out;
  }

  /** Score the model against panels whose assignments are known. Every variant uses the same draw count ('backtest'
      quality unless options.quality is given); top-1/top-3 split credit on ties. The rules were identified from these
      same panels, so this is in-sample. Panels ≤ 70 (the last manual draw, December 2019) excluded only the previous
      committee: options.excludeLastManual (default 1; null = off) caps excludeLast for them. */
  function backtest(options, panels) {
    options = options || {};
    const base = Object.assign({}, DEFAULTS, options, { quality: options.btQuality || (options.quality && options.quality !== DEFAULTS.quality ? options.quality : 'backtest'), sims: undefined, onDraw: undefined });
    const manual = options.excludeLastManual === undefined ? 1 : options.excludeLastManual;
    panels = panels || FCR.panels.filter((p) => {
      const pr = buildProblem(p);
      return Object.keys(pr.actual).length > 20 && Object.values(pr.history).filter((h) => h.length).length > 20;
    });
    const rows = [];
    let n = 0, sumP = 0, top1 = 0, top3 = 0, base1 = 0, ll = 0, draws = 0;
    panels.forEach((P) => {
      const pr = buildProblem(P);
      const opt = Object.assign({}, base, manual != null && P <= 70 ? { excludeLast: Math.min(base.excludeLast, manual) } : {});
      const res = simulate(pr, opt);
      const sc = scoreProbs(pr, res.probs);
      if (!sc.n) return;
      draws = res.draws;
      rows.push({ panel: P, n: sc.n, meanP: sc.sumP / sc.n, logLik: sc.ll / sc.n, top1: sc.t1 / sc.n, top3: sc.t3 / sc.n, baseline: 1 / pr.committees.length, relax: res.relaxRate, excludeLast: opt.excludeLast, seats: res.capacityRule });
      n += sc.n; sumP += sc.sumP; top1 += sc.t1; top3 += sc.t3; base1 += sc.n / pr.committees.length; ll += sc.ll;
    });
    return { rows, overall: n ? { n, meanP: sumP / n, logLik: ll / n, top1: top1 / n, top3: top3 / n, baseline: base1 / n, drawsPerPanel: draws, quality: base.quality } : null };
  }
  /** Tie-aware scoring of a probability table against the actual draw (logLik floored at 1e-3 per area). */
  function scoreProbs(pr, probs) {
    let n = 0, sumP = 0, t1 = 0, t3 = 0, ll = 0;
    const eps = 1e-12;
    pr.areas.forEach((a) => {
      const act = pr.actual[a]; if (!act || !probs[a]) return;
      const vals = pr.committees.map((c) => probs[a][c] || 0), p = probs[a][act] || 0;
      const above = vals.filter((v) => v > p + eps).length, tied = vals.filter((v) => Math.abs(v - p) <= eps).length;
      n++; sumP += p; ll += Math.log(Math.max(p, 1e-3));
      t1 += Math.max(0, Math.min(1, (1 - above) / tied)); t3 += Math.max(0, Math.min(1, (3 - above) / tied));
    });
    return { n, sumP, t1, t3, ll };
  }

  /** Empirical regularities in the loaded rosters (each pair is [hits, opportunities]). */
  function patterns() {
    const out = { repeatK: {}, regionDup: [0, 0], crossRegionDup: [0, 0], seatReplace: [0, 0], seatTarget: [0, 0], seatMisses: [], icrfAlternation: [0, 0],
      archivesDistinct: [0, 0], chairsFirstYear: [0, 0], sameStatePairs: [0, 0], regionCapExceptions: [] };
    [1, 2, 3, 4].forEach((k) => (out.repeatK[k] = [0, 0]));
    Object.values(FCR.terms).forEach((t) => {
      if (!t.committee) return;
      [1, 2, 3, 4].forEach((k) => { const o = FCR.term(t.area, t.panel - 2 * k); if (o && o.committee) { out.repeatK[k][1]++; if (o.committee === t.committee) out.repeatK[k][0]++; } });
    });
    FCR.panels.forEach((P) => {
      const year = P + 1950; const byC = {};
      panelTerms(P).forEach((t) => { if (t.committee) (byC[t.committee] = byC[t.committee] || []).push(t.area); });
      const prevSize = {}; panelTerms(P - 2).forEach((t) => { if (t.committee) prevSize[t.committee] = (prevSize[t.committee] || 0) + 1; });
      const T = targetSizes(Object.keys(byC), year);
      let miss = 0;
      Object.entries(byC).forEach(([c, list]) => {
        const regs = list.map(regionOf);
        out.regionDup[1]++; if (new Set(regs).size < regs.length) { out.regionDup[0]++; if (P >= 68) out.regionCapExceptions.push({ panel: P, committee: c, areas: list.filter((a, i) => regs.indexOf(regs[i]) !== regs.lastIndexOf(regs[i])) }); }
        if (Object.keys(prevSize).length) { out.seatReplace[1]++; if ((prevSize[c] || 0) === list.length) out.seatReplace[0]++; else miss++; }
        const contA = panelTerms(P - 1).filter((t) => (t.committees[year] || t.committee) === c).map((t) => t.area);
        const contList = contA.map(regionOf);
        if (contList.length && T[c] != null) { out.seatTarget[1]++; if (T[c] - contList.length === list.length) out.seatTarget[0]++; }
        if (contList.length) { out.crossRegionDup[1]++; if (regs.some((g) => contList.includes(g))) out.crossRegionDup[0]++; }
        if (contA.length) list.forEach((a) => contA.forEach((b) => { out.sameStatePairs[1]++; if (stateOf(a) === stateOf(b)) out.sameStatePairs[0]++; }));
      });
      if (miss) out.seatMisses.push({ panel: P, year, miss, of: Object.keys(byC).length });
      const icNew = panelTerms(P).filter((t) => t.secondaryList.includes('ICRF')).map((t) => regionOf(t.area));
      const icOut = panelTerms(P - 2).filter((t) => t.secondaryList.includes('ICRF')).map((t) => regionOf(t.area));
      if (icNew.length && icOut.length) { out.icrfAlternation[1]++; if (icNew.slice().sort().join() === icOut.slice().sort().join()) out.icrfAlternation[0]++; }
      const ar = panelTerms(P).filter((t) => t.secondaryList.includes('ARCHIVES')).map((t) => regionOf(t.area));
      if (ar.length) { out.archivesDistinct[1]++; if (new Set(ar).size === ar.length) out.archivesDistinct[0]++; }
    });
    FCR.years.forEach((y) => (FCR.Y(y).next_year_chairs || []).forEach((nc) => ['chair', 'alternate'].forEach((k) => {
      const p = nc[k]; if (!p || p.area == null) return;
      out.chairsFirstYear[1]++; if (FCR.term(p.area, y - 1950)) out.chairsFirstYear[0]++;
    })));
    return out;
  }

  // ---------- shared odds ----------
  const memo = {};
  const probMemo = {};
  function problemFor(P) { return probMemo[P] || (probMemo[P] = buildProblem(P)); }
  function forecastEntry(P) { const f = RAW.forecast && RAW.forecast.panels; return (f && f[P]) || null; }
  /** Is the precomputed table usable for this panel (same model version, same inputs and same default rule settings)?
      True means odds(P) with the defaults is served instantly from the table, without a simulation. */
  function forecastValid(P) {
    const fc = forecastEntry(P);
    return !!(fc && RAW.forecast.model_version === MODEL_VERSION && fc.fingerprint === problemFor(P).fingerprint && sameSettings(fc.settings, DEFAULTS));
  }
  function unpack(fc, table, P) {
    const pr = problemFor(P), cs = fc.committees || pr.committees, out = {};
    pr.areas.forEach((a) => { const row = (table || {})[a] || []; out[a] = {}; cs.forEach((c, k) => (out[a][c] = row[k] || 0)); });
    return out;
  }
  function topPicks(pr, probs) {
    const out = {};
    pr.areas.forEach((a) => {
      const r = Object.entries(probs[a] || {}).sort((x, y) => y[1] - x[1]);
      if (!r.length) return;
      const gap = r[0][1] - ((r[1] || [])[1] || 0);
      out[a] = { c: r[0][0], p: r[0][1], second: (r[1] || [])[0] || null, p2: (r[1] || [])[1] || 0, nearTie: r.length > 1 && gap < 0.03, tied: r.filter((x) => r[0][1] - x[1] < 0.03).map((x) => x[0]) };
    });
    return out;
  }
  /** FCR.predict.odds(P, opts) → the one shared forecast for panel P under opts (memoised; see the file header).
      Returns {panel, probs, se, seats, draws, chains, precomputed, settings, quality, lineup, top, secondary {ICRF, ARCHIVES},
      generated, modelVersion, ms, fixed}. opts: any rule setting, quality, seed, fixed {area: committee};
      precomputed: false forces a fresh simulation. The precomputed table is used when the rule settings equal the
      defaults it was built with; the stored explain() ablation tables (no ± and no example draw) are used only for
      requests that pass step: true (explain() and the Predict page's step warm-up), so a user setting that happens to
      equal an ablation step still gets a full live run. */
  function odds(P, options) {
    options = options || {};
    const opt = Object.assign({}, DEFAULTS, options);
    const settings = settingsOf(opt);
    const fixed = opt.fixed && Object.keys(opt.fixed).length ? opt.fixed : null;
    const quality = QUALITY[opt.quality] ? opt.quality : 'interactive';
    const usePre = options.precomputed !== false && !fixed;
    const step = !!options.step; // internal: an explain() step may use the stored ablation tables
    const base = P + '|' + JSON.stringify(settings);
    const preKey = base + '|pre', stepKey = base + '|step';
    const key = base + '|' + quality + '|' + (fixed ? JSON.stringify(fixed) : '') + '|' + opt.seed;
    if (usePre && memo[preKey]) return memo[preKey];
    if (memo[key]) return memo[key]; // a step whose settings equal a live run already shown reuses that run (consistent page)
    if (usePre && step && memo[stepKey]) return memo[stepKey];
    const pr = problemFor(P);
    const fc = usePre && forecastValid(P) ? forecastEntry(P) : null;
    const main = !!fc && sameSettings(fc.settings, settings);
    const variant = fc ? (main ? fc : step ? (fc.ablation || []).find((v) => sameSettings(v.settings, settings)) : null) : null;
    let res;
    if (variant) {
      res = { panel: P, probs: unpack(fc, variant.probs, P), se: variant.se ? unpack(fc, variant.se, P) : null, seats: variant.seats || fc.seats,
        draws: variant.draws || fc.draws, chains: variant.chains || fc.chains, precomputed: true, ablationStep: main ? null : variant.key || true, settings,
        quality: variant.quality || fc.quality, lineup: variant.lineup || null, capacityRule: variant.capacityRule || fc.capacityRule,
        generated: RAW.forecast.generated, modelVersion: RAW.forecast.model_version, ms: 0, fixed: {} };
    } else {
      const sim = simulate(pr, Object.assign({}, opt, { quality, sims: undefined, chains: undefined, onDraw: undefined, onDrawIdx: undefined, fixed: fixed || undefined }));
      res = { panel: P, probs: sim.probs, se: sim.se, seats: sim.seats, draws: sim.draws, chains: sim.chains, precomputed: false, settings, quality: sim.quality,
        lineup: sim.lineup, generated: null, modelVersion: MODEL_VERSION, ms: sim.ms, fixed: fixed || {}, relaxRate: sim.relaxRate, capacityRule: sim.capacityRule, seatAdjusted: sim.seatAdjusted };
    }
    res.top = topPicks(pr, res.probs);
    res.secondary = secondary(pr, opt);
    return (memo[variant ? (main ? preKey : stepKey) : key] = res);
  }

  // ---------- explanations for the Predict page ----------
  const STEPS = [
    { key: 'seats', label: 'Seat counts only', set: (o) => ({ excludeLast: 0, regionCap: 99, spreadPenalty: 0, neighborPenalty: 0, sameStatePenalty: 0, recency: 0 }) },
    { key: 'exclude', label: 'skip the last 3 committees', set: (o) => ({ excludeLast: o.excludeLast }), on: (o) => o.excludeLast > 0 },
    { key: 'region', label: 'one new member per region', set: (o) => ({ regionCap: o.regionCap }), on: (o) => o.regionCap < 99 },
    { key: 'spread', label: 'spread regions', set: (o) => ({ spreadPenalty: o.spreadPenalty }), on: (o) => o.spreadPenalty > 0 },
    { key: 'neighbors', label: 'neighbours apart', set: (o) => ({ neighborPenalty: o.neighborPenalty }), on: (o) => o.neighborPenalty > 0 },
    { key: 'state', label: 'same state apart', set: (o) => ({ sameStatePenalty: o.sameStatePenalty, recency: o.recency }), on: (o) => o.sameStatePenalty > 0 || o.recency > 0 },
  ];
  /** Cumulative rule settings for the ablation chain (seat counts only → … → all rules). */
  function ablationSettings(options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    let cur = Object.assign({}, settingsOf(o), STEPS[0].set(o));
    return STEPS.map((s, i) => { if (i) cur = Object.assign({}, cur, s.set(o)); return { key: s.key, label: s.label, on: i === 0 || s.on(o), settings: Object.assign({}, cur) }; });
  }
  const termName = (a, p) => { const t = FCR.term(a, p); return t ? FCR.termName(t, p + 1950) || t.name || '' : ''; };
  function contInfo(pr, a, c) {
    return (pr.cont[c] || []).map((b) => ({ area: b, name: termName(b, pr.P - 1), region: regionOf(b), sameRegion: regionOf(b) === regionOf(a), neighbor: FCR.isNeighbor(a, b), sameState: stateOf(b) === stateOf(a) }));
  }
  /** Why does `area` get these odds? Ablation chain with the probabilities after each rule, plus concrete reasons. */
  function explain(P, area, options) {
    area = +area;
    const pr = problemFor(P);
    if (!pr.areas.includes(area)) return null;
    const o = Object.assign({}, DEFAULTS, options || {});
    const steps = ablationSettings(o).map((s) => {
      const r = odds(P, Object.assign({}, options || {}, s.settings, { fixed: o.fixed, step: true }));
      return { key: s.key, label: s.label, on: s.on, settings: s.settings, probs: Object.assign({}, r.probs[area]), se: r.se ? Object.assign({}, r.se[area]) : null, precomputed: r.precomputed };
    });
    steps.forEach((s, i) => { s.delta = {}; pr.committees.forEach((c) => (s.delta[c] = i ? s.probs[c] - steps[i - 1].probs[c] : 0)); });
    const fin = odds(P, options);
    const hist = pr.history[area] || [];
    const exSet = recentCommittees(hist, P, o.excludeLast);
    const excluded = hist.filter((h) => h.panel >= P - 2 * o.excludeLast && exSet.has(h.committee)).map((h) => ({ committee: h.committee, panel: h.panel, name: termName(area, h.panel) }));
    const continuing = {}, reasons = {};
    pr.committees.forEach((c) => {
      const ci = contInfo(pr, area, c);
      continuing[c] = ci.filter((x) => x.sameRegion || x.neighbor || x.sameState);
      const rs = [];
      if (exSet.has(c)) rs.push(`held by Area ${area} in Panel ${excluded.filter((x) => x.committee === c).map((x) => x.panel).join(', ')} (skip last ${o.excludeLast})`);
      ci.filter((x) => x.sameState).forEach((x) => rs.push(`same-state Area ${x.area}${x.name ? ' (' + x.name + ')' : ''} continues here`));
      ci.filter((x) => x.neighbor && !x.sameState).forEach((x) => rs.push(`neighbouring Area ${x.area}${x.name ? ' (' + x.name + ')' : ''} continues here`));
      ci.filter((x) => x.sameRegion && !x.neighbor && !x.sameState).forEach((x) => rs.push(`same-region Area ${x.area}${x.name ? ' (' + x.name + ')' : ''} continues here`));
      if (!(fin.seats[c] > 0)) rs.push('no open seats');
      reasons[c] = rs;
    });
    return { panel: P, area, region: regionOf(area), state: stateOf(area), steps, final: Object.assign({}, fin.probs[area]), se: fin.se ? Object.assign({}, fin.se[area]) : null,
      excluded, continuing, reasons, seats: Object.assign({}, fin.seats), top: fin.top[area], precomputed: fin.precomputed };
  }
  /** What if `area` draws `committee`? Conditional odds of the other new members on that committee. */
  function whatIf(P, area, committee, options) {
    area = +area;
    const pr = problemFor(P);
    if (!pr.areas.includes(area) || !pr.committees.includes(committee)) return null;
    const base = odds(P, options);
    const fixed = Object.assign({}, (options && options.fixed) || {}, { [area]: committee });
    const res = odds(P, Object.assign({}, options || {}, { fixed }));
    const fellows = pr.areas.filter((b) => b !== area && !(b in fixed) && res.probs[b][committee] > 0)
      .map((b) => ({ area: b, p: res.probs[b][committee], se: res.se ? res.se[b][committee] : null, prior: base.probs[b][committee], region: regionOf(b) }))
      .sort((x, y) => y.p - x.p);
    return { panel: P, area, committee, prior: base.probs[area][committee], impossible: !(base.probs[area][committee] > 0), seats: res.seats[committee],
      others: (res.seats[committee] || 0) - 1, continuing: contInfo(pr, area, committee), fellows, probs: res.probs, se: res.se, draws: res.draws, seatAdjusted: !!res.seatAdjusted, ms: res.ms };
  }
  /** Who could land on committee c? Seats, continuing members, ranked eligible areas (probabilities sum to seats), ruled-out areas. */
  function committee(P, c, options) {
    const pr = problemFor(P);
    if (!pr.committees.includes(c)) return null;
    const o = Object.assign({}, DEFAULTS, options || {});
    const res = odds(P, options);
    const cont = (pr.cont[c] || []).map((b) => ({ area: b, name: termName(b, P - 1), region: regionOf(b), state: stateOf(b) }));
    const outgoing = (pr.outgoing[c] || []).map((b) => ({ area: b, name: termName(b, P - 2), region: regionOf(b) }));
    const eligible = [], ruledOut = [];
    pr.areas.forEach((a) => {
      const p = res.probs[a][c] || 0;
      const ex = (pr.history[a] || []).filter((h) => h.committee === c && h.panel >= P - 2 * o.excludeLast);
      const ci = contInfo(pr, a, c);
      const flags = { sameRegion: ci.filter((x) => x.sameRegion).map((x) => x.area), neighbor: ci.filter((x) => x.neighbor).map((x) => x.area), sameState: ci.filter((x) => x.sameState).map((x) => x.area) };
      const nm = ex.map((h) => termName(a, h.panel)).filter(Boolean);
      const reason = ex.length ? `held ${FCR.cabbr(c)} in Panel ${ex.map((h) => h.panel).join(', ')}${nm.length ? ' (' + nm.join(', ') + ')' : ''}`
        : flags.sameState.length ? `same-state Area ${flags.sameState.join(', ')} continues here` : 'no simulated draw put it here';
      if (ex.length || !(p > 0)) ruledOut.push({ area: a, region: regionOf(a), p, panels: ex.map((h) => h.panel), reason });
      else eligible.push({ area: a, region: regionOf(a), p, se: res.se ? res.se[a][c] : null, flags });
    });
    eligible.sort((x, y) => y.p - x.p);
    return { panel: P, committee: c, seats: res.seats[c], standard: pr.target[c] != null ? pr.target[c] : null, continuing: cont, outgoing, eligible, ruledOut,
      sum: eligible.reduce((s, x) => s + x.p, 0), precomputed: res.precomputed };
  }

  /** Panels whose committee draw has no Final Report yet, oldest first: every panel after the last loaded one up to the
      panel being elected by the calendar, plus the delegate-elect data's panel while it is still current. */
  function pendingPanels() {
    const cyc = FCR.cycle();
    const last = FCR.panels[FCR.panels.length - 1] || 0;
    const pend = []; for (let p = last + 1; p <= cyc.electPanel; p++) pend.push(p);
    if (FCR.elects && FCR.elects.panel != null && FCR.electStage(cyc) !== 'past' && FCR.elects.panel > last) pend.push(FCR.elects.panel);
    return [...new Set(pend)].sort((a, b) => a - b);
  }
  /** The panel the Predict page opens on: the first pending panel whose first Conference hasn't ended yet (its draw is
      still news), else the newest pending one, else the newest loaded panel. Shared by Predict, search and the views. */
  function defaultPanel() {
    const today = FCR.today(), pend = pendingPanels();
    return pend.find((p) => today < FCR.conferenceDates(p + 1950).end) || pend[pend.length - 1] || FCR.panels[FCR.panels.length - 1] || null;
  }

  /** Shared percentage format: '–' impossible, '<1' for 0 < p < 0.5%, else whole percent ('32'). */
  function fmt(p) { return !(p > 0) ? '–' : p < 0.005 ? '<1' : String(Math.round(p * 100)); }

  FCR.predict = { odds, fmt, pendingPanels, defaultPanel, buildProblem, simulate, typicalDraw, secondary, backtest, patterns, primaryCommittees, recentCommittees,
    explain, whatIf, committee, scoreProbs, ablationSettings, targetSizes, settingsOf, sameSettings, forecastEntry, forecastValid,
    QUALITY, RULE_KEYS, MODEL_VERSION, regionOf, stateOf, _memo: memo };
})();
