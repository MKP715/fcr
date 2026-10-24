/* Recompute the committee-draw model evidence and write it to data/src/analysis.json (the Predict page reads it).
   Keeps transition_chi2 and model_defaults; recomputes summary, repeat_by_terms_back, backtest, neighbor_rule, and adds
   same_state, icrf_rotation, archives_neighbor, seats, forward_chained, calibration, ablation, best_of_k,
   rejected_rules, small_region_cap, region_cap_exceptions and watch_list (pre-registered checks for the next draw).
   Usage: node tools/dev/model_report.js [--quick] [--dry]   (~3-4 min; --quick ≈ 1 min with noisier numbers)
   then:  python tools/build_data.py */
const path = require('path');
const fs = require('fs');
const L = require('./model_lib');
const F = L.load({ noForecast: true });
const X = F.predict;
const QUICK = process.argv.includes('--quick'), DRY = process.argv.includes('--dry');
const RUN = QUICK ? { quality: 'fast', chains: 8 } : { quality: 'backtest', chains: 16 }; // same draw count for every variant
const T0 = Date.now();
const log = (...a) => console.log(((Date.now() - T0) / 1000).toFixed(0).padStart(4) + 's', ...a);
const D = X.settingsOf({});
const PANELS = L.scorablePanels(F), RECENT = PANELS.filter((p) => p >= 71), EARLY = PANELS.filter((p) => p < 71);
const NEXT = Math.max(...F.panels) + 1; // the pending draw (Panel 77 in 2026)
const span = (ps) => ps.length ? `${ps[0]}-${ps[ps.length - 1]}` : '';
const { r1, r2, r3, r4 } = L;
const region = (a) => (F.areas[a] || {}).region, state = (a) => (F.areas[a] || {}).state;
const pct = (x) => (x * 100).toFixed(1) + '%';

// ---------- cached panel runs ----------
const cache = new Map();
function run(P, settings, seed) {
  const s = X.settingsOf(settings);
  const key = P + '|' + JSON.stringify(s) + '|' + (seed || 77);
  if (!cache.has(key)) { const r = L.runPanel(F, P, s, Object.assign({ seed: seed || 77 }, RUN)); delete r.sim.options; cache.set(key, r); }
  return cache.get(key);
}
const metrics = (panels, s) => L.agg(panels.map((P) => run(P, s)));
const withD = (o) => Object.assign({}, D, o);

// ---------- 1. in-sample backtest, before/after ----------
log('in-sample backtests');
const OLD = withD({ capacity: 'replace', sameStatePenalty: 0, icrfRotation: 0, archivesNeighbor: 0 });
const perPanel = PANELS.map((P) => { const r = run(P, D); return Object.assign({ panel: P, excludeLast: L.panelOpts(P, D).excludeLast, seats: r.sim.capacityRule }, L.agg([r])); });
const abl = X.ablationSettings(D);
const backtest = {
  method: `Each past panel re-drawn from the history before it (in-sample: the rules were found in these panels). ${RUN.chains} chains × ${X.QUALITY[RUN.quality].draws} draws per panel for every variant; top-1/top-3 split credit on ties; logLik = mean log p(actual), floored at 0.001. Panels ≤ 70 use excludeLast 1 (the December 2019 draw was the last made by hand and skipped only the previous committee).`,
  draws_per_panel: RUN.chains * X.QUALITY[RUN.quality].draws,
  defaults: { recent: metrics(RECENT, D), early: metrics(EARLY, D), all: metrics(PANELS, D), panels_recent: span(RECENT), panels_early: span(EARLY) },
  previous_defaults: { settings: X.settingsOf(OLD), recent: metrics(RECENT, OLD), early: metrics(EARLY, OLD), all: metrics(PANELS, OLD) },
  per_panel: perPanel,
};
// legacy keys (older Predict page)
const st0 = metrics(PANELS, abl[0].settings), st2 = metrics(PANELS, abl[2].settings), all = backtest.defaults.all;
Object.assign(backtest, { seat_counts_only: { top1: st0.top1, top3: st0.top3, meanP: st0.meanP, logLik: st0.logLik }, lot_with_rules: Object.assign({ baseline: r3(1 / 11) }, st2), lot_with_all_rules: Object.assign({ panels: span(PANELS) }, all) });

// ---------- 2. ablation ----------
log('ablation');
const ablation = {
  method: 'Rules added one at a time (in-sample, same draws per variant). dLogLik = gain over the previous step; drop_one = all rules except one.',
  recent: abl.map((s, i) => Object.assign({ key: s.key, label: s.label }, metrics(RECENT, s.settings))),
  early: abl.map((s) => Object.assign({ key: s.key, label: s.label }, metrics(EARLY, s.settings))),
};
['recent', 'early'].forEach((k) => ablation[k].forEach((r, i) => (r.dLogLik = i ? r4(r.logLik - ablation[k][i - 1].logLik) : 0)));
const dropOne = { exclude: { excludeLast: 0 }, region: { regionCap: 99 }, spread: { spreadPenalty: 0 }, neighbors: { neighborPenalty: 0 }, state: { sameStatePenalty: 0 }, seats_target: { capacity: 'replace' } };
ablation.drop_one = Object.entries(dropOne).map(([k, o]) => { const m = metrics(RECENT, withD(o)); return Object.assign({ drop: k }, m, { dLogLik: r4(m.logLik - backtest.defaults.recent.logLik) }); });

// ---------- 3. forward-chained and leave-one-panel-out ----------
log('forward-chained grid');
const GRID = [];
const SP = QUICK ? [2, 4, 6] : [2, 3, 4, 5, 6], NB = QUICK ? [0, 2, 4] : [0, 1, 2, 3, 4], SS = [0, 8];
SP.forEach((sp) => NB.forEach((nb) => SS.forEach((ss) => GRID.push({ spreadPenalty: sp, neighborPenalty: nb, sameStatePenalty: ss }))));
const OLDGRID = [];
SP.forEach((sp) => NB.forEach((nb) => OLDGRID.push({ spreadPenalty: sp, neighborPenalty: nb, sameStatePenalty: 0, capacity: 'replace' })));
function choose(grid, train) {
  let best = null;
  grid.forEach((g) => { const s = withD(g); const m = L.agg(train.map((P) => run(P, s))); if (!best || m.logLik > best.m.logLik) best = { g, s, m }; });
  return best;
}
function chained(grid, trainOf) {
  const rows = RECENT.map((P) => {
    const b = choose(grid, trainOf(P)); const r = run(P, b.s);
    return { panel: P, chosen: b.g, train_logLik: b.m.logLik, ...L.agg([r]), _probs: r.probs, _pr: r.pr };
  });
  const overall = L.agg(rows.map((r) => run(r.panel, withD(r.chosen))));
  return { overall, per_panel: rows };
}
// Training windows: all scorable panels before P (primary, the literal forward chain), or only the app-era panels before
// P (the soft rules date from the December 2020 software; the hand-made draws show no neighbour avoidance), falling
// back to all earlier panels for the first app-era panel. Runs are cached, so every window reuses the same draws.
const allEarlier = (P) => PANELS.filter((p) => p < P);
const appEra = (P) => { const t = PANELS.filter((p) => p < P && p >= RECENT[0]); return t.length ? t : allEarlier(P); };
const fwdNew = chained(GRID, allEarlier);
log('forward old procedure');
const fwdOld = chained(OLDGRID, allEarlier);
const fwdAppNew = chained(GRID, appEra), fwdAppOld = chained(OLDGRID, appEra);
const loo = chained(GRID, (P) => PANELS.filter((p) => p !== P));
const strip = (c) => ({ overall: c.overall, per_panel: c.per_panel.map((r) => { const o = Object.assign({}, r); delete o._probs; delete o._pr; return o; }) });

// IC/RF rotation, forward-chained (exact; regions taken from the actual draw)
log('IC/RF rotation');
function icrfSlots() {
  const slots = [];
  F.panels.forEach((P) => {
    const pr = X.buildProblem(P);
    const winners = Object.entries(pr.actualSec).filter(([, l]) => l.includes('ICRF')).map(([a]) => +a);
    winners.forEach((w) => {
      const g = region(w), pool = pr.areas.filter((a) => region(a) === g);
      const recent = pool.filter((a) => (F.termsByArea[a] || []).some((t) => t.panel < P && t.panel >= P - 6 && t.secondaryList.includes('ICRF')));
      slots.push({ P, g, w, pool, recent, wRecent: recent.includes(w), forced: recent.length === pool.length });
    });
  });
  return slots.filter((s) => s.P >= 68);
}
const slots = icrfSlots();
const slotLL = (s, beta) => { const wt = (a) => (s.recent.includes(a) ? Math.exp(-beta) : 1); const Z = s.pool.reduce((x, a) => x + wt(a), 0); return Math.log(wt(s.w) / Z); };
const fitBeta = (ss) => { let best = { b: 0, v: -Infinity }; for (let b = 0; b <= 3.0001; b += 0.25) { const v = ss.reduce((x, s) => x + slotLL(s, b), 0) - b * b / 8; if (v > best.v) best = { b, v }; } return best.b; };
const unforced = slots.filter((s) => !s.forced);
const icFwd = { uniform: 0, rotation: 0, fixed: 0, n: 0, mpU: 0, mpR: 0, betas: [] };
[...new Set(slots.map((s) => s.P))].filter((P) => P >= 70).forEach((P) => {
  const b = fitBeta(slots.filter((s) => s.P < P)); icFwd.betas.push({ panel: P, beta: b });
  slots.filter((s) => s.P === P).forEach((s) => { icFwd.n++; icFwd.uniform += slotLL(s, 0); icFwd.rotation += slotLL(s, b); icFwd.fixed += slotLL(s, D.icrfRotation); icFwd.mpU += Math.exp(slotLL(s, 0)); icFwd.mpR += Math.exp(slotLL(s, b)); });
});
const icrf_rotation = {
  rule: `An area whose delegate sat on IC/RF in its last 3 terms is drawn for its region's IC/RF seat with weight e^-${D.icrfRotation} ≈ ${r2(Math.exp(-D.icrfRotation))} (soft, so tiny pools such as Western Canada still fill).`,
  slots: slots.length, forced_slots: slots.filter((s) => s.forced).length,
  recent_holder_picks_unforced: [unforced.filter((s) => s.wRecent).length, r2(unforced.reduce((x, s) => x + s.recent.length / s.pool.length, 0))],
  odd_panels_unforced: [unforced.filter((s) => s.P % 2 && s.wRecent).length, r2(unforced.filter((s) => s.P % 2).reduce((x, s) => x + s.recent.length / s.pool.length, 0))],
  beta_in_sample: fitBeta(slots),
  forward: { panels: `70-${Math.max(...slots.map((s) => s.P))}`, slots: icFwd.n, logLik_per_slot: { uniform: r3(icFwd.uniform / icFwd.n), rotation_refit: r3(icFwd.rotation / icFwd.n), rotation_default: r3(icFwd.fixed / icFwd.n) },
    meanP: { uniform: r3(icFwd.mpU / icFwd.n), rotation_refit: r3(icFwd.mpR / icFwd.n) }, betas: icFwd.betas },
  sources: 'R1-H9 and R3-SEC-3 audits (both verified): 3 of 32 unforced picks were recent holders vs 11.9 expected; odd panels 0 of 14-16.',
  display_note: '2024-25 IC/RF had 7 members: the Panel 74 West Central seat was not filled (2026 FR pp.82-83).',
};

// Archives neighbours (exact enumeration of distinct-region 4-sets)
log('Archives');
function archivesSet(P, lam) {
  const pr = X.buildProblem(P);
  const act = Object.entries(pr.actualSec).filter(([, l]) => l.includes('ARCHIVES')).map(([a]) => +a);
  const cont = Object.values(F.terms).filter((t) => t.panel === P - 1 && t.secondaryList.includes('ARCHIVES')).map((t) => t.area);
  const byReg = {}; pr.areas.forEach((a) => (byReg[region(a)] = byReg[region(a)] || []).push(a));
  const regs = Object.keys(byReg), k = act.length || 4;
  const pairsOf = (set) => { let p = 0; set.forEach((a, i) => { p += cont.filter((b) => F.isNeighbor(a, b)).length; for (let j = i + 1; j < set.length; j++) if (F.isNeighbor(a, set[j])) p++; }); return p; };
  let Z = 0, E0 = 0, N = 0; const chosen = [];
  const rec = (start) => { if (chosen.length === k) { const p = pairsOf(chosen); Z += Math.exp(-lam * p); E0 += p; N++; return; } for (let gi = start; gi <= regs.length - (k - chosen.length); gi++) for (const a of byReg[regs[gi]]) { chosen.push(a); rec(gi + 1); chosen.pop(); } };
  rec(0);
  const distinct = new Set(act.map(region)).size === act.length;
  const obsPairs = pairsOf(act);
  return { P, act, obsPairs, expPairsUniform: N ? E0 / N : 0, logLik: distinct && Z ? -lam * obsPairs - Math.log(Z) : Math.log(1e-6), distinct };
}
const arP = PANELS.concat([67]).filter((P) => Object.values(X.buildProblem(P).actualSec).some((l) => l.includes('ARCHIVES'))).sort((a, b) => a - b);
const arRows = arP.map((P) => ({ P, l0: archivesSet(P, 0), l1: archivesSet(P, 1), l25: archivesSet(P, 2.5) }));
const soft = arRows.filter((r) => r.P >= 72), early = arRows.filter((r) => r.P < 72);
const sumBy = (rows, f) => rows.reduce((x, r) => x + f(r), 0);
const archives_neighbor = {
  rule: `Archives: four new members from four different regions; each neighbour pair among them or with a continuing Archives member weighs e^-${D.archivesNeighbor} (mild).`,
  since_panel_72: { panels: span(soft.map((r) => r.P)), observed_pairs: sumBy(soft, (r) => r.l0.obsPairs), expected_uniform: r2(sumBy(soft, (r) => r.l0.expPairsUniform)) },
  before: { panels: span(early.map((r) => r.P)), observed_pairs: sumBy(early, (r) => r.l0.obsPairs), expected_uniform: r2(sumBy(early, (r) => r.l0.expPairsUniform)) },
  set_logLik_since_72: { lambda_0: r3(sumBy(soft, (r) => r.l0.logLik)), lambda_1: r3(sumBy(soft, (r) => r.l1.logLik)), lambda_2_5: r3(sumBy(soft, (r) => r.l25.logLik)) },
  note: 'λ = 2.5 fits P72-76 best in-sample, but a verifier found it overfit (truly forward λ ≈ 0.2-0.8), so the model uses the mild λ = 1. Archives was one per region and replaced the outgoing regions until Panel 71.',
};

// ---------- 4. calibration (said vs happened) ----------
log('calibration');
const BINS = [[0, 0.05], [0.05, 0.1], [0.1, 0.15], [0.15, 0.2], [0.2, 0.3], [0.3, 0.4], [0.4, 0.6], [0.6, 1.0001]];
function calib(rows) {
  const out = BINS.map(([lo, hi]) => ({ from: lo, to: Math.min(hi, 1), cells: 0, said: 0, happened: 0 }));
  const zero = { cells: 0, happened: 0 }; let brier = 0, nC = 0;
  rows.forEach(({ probs, pr }) => pr.areas.forEach((a) => { const act = pr.actual[a]; if (!act) return; pr.committees.forEach((c) => {
    const p = probs[a][c] || 0, y = act === c ? 1 : 0; brier += (p - y) ** 2; nC++;
    if (p === 0) { zero.cells++; zero.happened += y; return; }
    const b = out.find((x) => p >= x.from && p < x.to + (x.to === 1 ? 1e-9 : 0)) || out[out.length - 1]; b.cells++; b.said += p; b.happened += y;
  }); }));
  out.forEach((b) => { b.said = b.cells ? r3(b.said / b.cells) : null; b.happened_rate = b.cells ? r3(b.happened / b.cells) : null; });
  return { bins: out, impossible: zero, brier: r4(brier / nC) };
}
const calibration = {
  method: `Every area × committee cell of Panels ${span(RECENT)}: predicted probability vs whether it happened. forward = honest forward-chained predictions (soft-rule strengths chosen on earlier panels only); in_sample = fixed defaults.`,
  forward: calib(fwdNew.per_panel.map((r) => ({ probs: r._probs, pr: r._pr }))),
  in_sample: calib(RECENT.map((P) => { const r = run(P, D); return { probs: r.probs, pr: r.pr }; })),
};

// ---------- 5. seats ----------
log('seats');
const pat = X.patterns();
const seatRows = PANELS.map((P) => {
  const pr = X.buildProblem(P), actual = {}; pr.committees.forEach((c) => (actual[c] = 0)); Object.values(pr.actual).forEach((c) => actual[c]++);
  const capT = X.simulate(pr, { quality: 'fast', chains: 1, sims: 1, capacity: 'target' }).seats, capR = X.simulate(pr, { quality: 'fast', chains: 1, sims: 1, capacity: 'replace' }).seats;
  const eq = (s) => pr.committees.filter((c) => Math.round(s[c]) === actual[c]).length;
  return { panel: P, committees: pr.committees.length, target_exact: eq(capT), replace_exact: eq(capR) };
});
const prN = X.buildProblem(NEXT);
const seatsNext = (cap) => { const s = X.simulate(prN, { quality: 'fast', chains: 1, sims: 1, capacity: cap }).seats; const o = {}; Object.keys(s).forEach((c) => (o[c] = r2(s[c]))); return o; };
const seats = {
  rule: 'Seats = standard committee size − continuing members ("target"); standard size = the committee\'s most common size in loaded years before the draw (tie → earliest seen). Falls back to "replace" (= outgoing members) when the totals don\'t add up.',
  standard_sizes: X.buildProblem(NEXT).target,
  target_matches: pat.seatTarget, replace_matches: pat.seatReplace,
  exact_panels: { target: seatRows.filter((r) => r.target_exact === r.committees).map((r) => r.panel), replace: seatRows.filter((r) => r.replace_exact === r.committees).map((r) => r.panel) },
  per_panel: seatRows,
  backtest_recent: { target: metrics(RECENT, D), replace: metrics(RECENT, withD({ capacity: 'replace' })), balance: metrics(RECENT, withD({ capacity: 'balance' })) },
  next_panel: { panel: NEXT, target: seatsNext('target'), replace: seatsNext('replace') },
  note: 'From Panel 75 GSO began rebalancing first- and second-year members on each committee (2024 FR p.68), which is why Panels 75 and 76 broke the replace rule. If GSO keeps rebalancing, Treatment/Accessibilities could get 4 new members instead of 5 (text only; modelling it was refuted in the audit).',
};

// ---------- 6. same state / province ----------
log('same state');
function nullStats(panels, settings, sims) {
  const tot = {}; let k = 0; const per = {};
  panels.forEach((P) => {
    const pr = X.buildProblem(P), acc = {}; let n = 0;
    X.simulate(pr, Object.assign({}, L.panelOpts(P, settings), { quality: RUN.quality, chains: 8, sims, onDrawIdx: (pick, ctx) => { const s = L.drawStats(F, pr, pick, ctx); Object.keys(s).forEach((x) => (acc[x] = (acc[x] || 0) + s[x])); n++; } }));
    per[P] = {}; Object.keys(acc).forEach((x) => { per[P][x] = acc[x] / n; tot[x] = (tot[x] || 0) + acc[x] / n; }); k++;
  });
  return { tot, per };
}
const obsStats = (panels) => { const o = {}; panels.forEach((P) => { const pr = X.buildProblem(P); const s = L.assignStats(F, pr, pr.actual); if (s) Object.keys(s).forEach((x) => (o[x] = (o[x] || 0) + s[x])); }); return o; };
const noSS = withD({ sameStatePenalty: 0 }), fair = withD({ spreadPenalty: 0, neighborPenalty: 0, sameStatePenalty: 0 });
const nsR = nullStats(RECENT, noSS, QUICK ? 2000 : 4000), nsE = nullStats(EARLY, noSS, QUICK ? 2000 : 4000);
const oR = obsStats(RECENT), oE = obsStats(EARLY);
let rawPairs = 0, rawYears = [];
F.years.forEach((y) => { let k = 0; (F.Y(y).conference_committees || []).filter((c) => !c.secondary && c.committee !== 'OTHER').forEach((c) => { const l = (c.members || []).filter((m) => m.area != null).map((m) => m.area); for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) if (state(l[i]) && state(l[i]) === state(l[j])) k++; }); rawPairs += k; rawYears.push(y); });
const ssGain = PANELS.map((P) => ({ panel: P, without: L.agg([run(P, noSS)]).logLik, with: L.agg([run(P, D)]).logLik }));
const same_state = {
  rule: `Areas of the same state or province (areas.json 'state' = main state; Areas 1, 48 and 74 span two) are kept off the same committee: cost ${D.sameStatePenalty} per same-state member, i.e. effectively never.`,
  raw_rosters: { years: `${rawYears[0]}-${rawYears[rawYears.length - 1]}`, same_state_pairs: rawPairs },
  observed_vs_expected_without_rule: { recent: [oR.sameState || 0, r2(nsR.tot.sameState)], early: [oE.sameState || 0, r2(nsE.tot.sameState)], panels_recent: span(RECENT), panels_early: span(EARLY) },
  p_zero_poisson_all: +Math.exp(-(nsR.tot.sameState + nsE.tot.sameState)).toPrecision(2),
  backtest_recent: { without: metrics(RECENT, noSS), with: metrics(RECENT, D) },
  panels_improved: [ssGain.filter((r) => r.with > r.without).length, ssGain.length], per_panel: ssGain,
  note: 'Not once in 2017-2026; the 2009 rosters had one same-state pair, so the wording is "not once in ten years", not "never". Within one panel two same-state areas are also same-region, so the one-per-region rule already separates new members; the rule bites on new members next to continuing ones.',
  sources: 'R5-H01/H02 audit, reproduced by two verifiers (forward-chained logLik -1.809 → -1.788, top-3 68.1% → 69.2%).',
};

// ---------- 7. best of K rounds (GSO 2023 FR p.64) ----------
log('best-of-K');
const KS = [1, 3, 5, 10];
const CRIT = {
  broadest: (s) => s.regionsCovered * 1000 - (s.nbSameRegion + s.nbCrossRegion + s.newNbCross + s.sameState),
  fewest_pairs: (s) => -(s.sameRegionNonNb + s.nbSameRegion + s.nbCrossRegion + s.newNbCross + s.sameState) * 1000 + s.regionsCovered,
};
const bok = {}; // bok[P][crit][K] = {probs}
PANELS.forEach((P) => {
  const pr = X.buildProblem(P); const picks = [], sc = { broadest: [], fewest_pairs: [] };
  const hard = Object.assign({}, L.panelOpts(P, D), { spreadPenalty: 0, neighborPenalty: 0, sameStatePenalty: 0, recency: 0 });
  X.simulate(pr, Object.assign({}, hard, { quality: RUN.quality, chains: 16, sims: QUICK ? 10000 : 40000, seed: 4242, onDrawIdx: (pick, ctx) => { picks.push(Int16Array.from(pick)); const s = L.drawStats(F, pr, pick, ctx); Object.keys(CRIT).forEach((k) => sc[k].push(CRIT[k](s))); } }));
  bok[P] = {};
  Object.keys(CRIT).forEach((cr) => { bok[P][cr] = {}; KS.forEach((K) => {
    const m = pr.committees.length, n = pr.areas.length, t = new Float64Array(n * m); let N = 0;
    for (let g = 0; g + K <= picks.length; g += K) { let b = g; for (let x = g + 1; x < g + K; x++) if (sc[cr][x] > sc[cr][b]) b = x; const pk = picks[b]; for (let i = 0; i < n; i++) t[i * m + pk[i]]++; N++; }
    const probs = {}; pr.areas.forEach((a, i) => { probs[a] = {}; pr.committees.forEach((c, k) => (probs[a][c] = t[i * m + k] / N)); });
    bok[P][cr][K] = Object.assign({ draws: N }, X.scoreProbs(pr, probs));
  }); });
});
const bokAgg = (panels, cr, K) => L.agg(panels.map((P) => bok[P][cr][K]));
const bokFwd = RECENT.map((P) => {
  const train = allEarlier(P); let best = null;
  Object.keys(CRIT).forEach((cr) => KS.forEach((K) => { const m = bokAgg(train, cr, K); if (!best || m.logLik > best.m.logLik) best = { cr, K, m }; }));
  return { panel: P, chosen: { criterion: best.cr, K: best.K }, ...L.agg([bok[P][best.cr][best.K]]), _row: bok[P][best.cr][best.K] };
});
const bokFwdAll = L.agg(bokFwd.map((r) => r._row)); bokFwd.forEach((r) => delete r._row);
const best_of_k = {
  question: 'GSO\'s 2023 report (p.64, Panel 73): "five selection rounds were performed and the round with the broadest distribution was selected". Does a best-of-K lot (K fair rounds under the hard rules, keep the broadest) explain the draws better than the soft penalties?',
  method: `Hard rules only (seats, skip last 3, one per region) → K independent rounds → keep the best by "broadest" (most regions per committee counting both panels; ties: fewest neighbour/same-state pairs) or "fewest_pairs" (fewest same-region, neighbour and same-state pairs). Forward-chained: criterion and K chosen on earlier panels only.`,
  in_sample_recent: Object.keys(CRIT).flatMap((cr) => KS.map((K) => Object.assign({ criterion: cr, K }, bokAgg(RECENT, cr, K)))),
  forward: { overall: bokFwdAll, per_panel: bokFwd },
  soft_penalties_forward: fwdNew.overall,
};
best_of_k.adopted = bokFwdAll.logLik > fwdNew.overall.logLik;
best_of_k.verdict = best_of_k.adopted
  ? `Best-of-K beats the soft penalties out of sample (logLik ${bokFwdAll.logLik} vs ${fwdNew.overall.logLik}).`
  : `Not adopted: forward-chained best-of-K logLik ${bokFwdAll.logLik} (top-3 ${pct(bokFwdAll.top3)}) vs the soft penalties ${fwdNew.overall.logLik} (top-3 ${pct(fwdNew.overall.top3)}). Keeping the best of a few rounds does spread regions, but not as strongly or as selectively as the draws show.`;

// ---------- 8. rejected rules ----------
log('rejected rules');
const rej = (rule, settings, extra) => { const m = settings ? metrics(RECENT, withD(settings)) : null; return Object.assign({ rule }, m ? { logLik: m.logLik, top3: m.top3, dLogLik: r4(m.logLik - backtest.defaults.recent.logLik) } : {}, extra); };
// dLogLik = in-sample change vs the defaults on the app-era panels (|d| < 0.01 is within noise / overfitting range)
const rejected_rules = [
  rej('Skip only the last 2 committees', { excludeLast: 2 }, { evidence: 'K3 beats K2 in all 5 app-era panels with 3-back data (R1-H1).' }),
  rej('Skip the last 4 committees', { excludeLast: 4 }, { evidence: 'K3 beats K4 in P74-76 (R1-H1).' }),
  rej('4-term "grid" window (avoid committees held since 2017)', null, { evidence: 'R1-H4, refuted by a verifier: P76 avoidance is not significant under nearly as good nulls (sp2: P=0.04; sp1: 0.11). Pre-registered check below: the default expects about 12 Panel 77 areas on their Panel 67/69 committee.' }),
  rej('Favour committees never held / long unheld (recency)', { recency: 1 }, { evidence: 'Never-held count 115 vs 113.4 expected; forward-chained P74-76 logLik -1.774 → -1.780 to -1.787 (R1-H5, R5-H20).' }),
  rej('Two-hop neighbours / distance apart', null, { evidence: 'Two-hop 144 vs 145.3, within 600 km 114 vs 110, total spread 3,379 vs 3,369 thousand km; a two-hop penalty lowers logLik -1.748 → -1.794 (R5-H03-H09).' }),
  rej('Consecutive area numbers apart', null, { evidence: '16 vs 27.3 (p 0.038, Holm 1); does not replicate in Panels 68-70 (R5-H05/H06).' }),
  rej('U.S./Canada mix, francophone areas', null, { evidence: 'Committees without a Canadian 4 vs 4.1; Quebec/francophone pairs 0 vs 0.15-0.23 (no power) (R5-H10-H15).' }),
  rej('Seat inheritance (new member from the outgoing member\'s region / neighbour / state)', null, { evidence: 'Region 209 vs 205.9, neighbour 83 vs 74.7, state 15 vs 18.0 (R5-H16-H19); refilling the outgoing region is already produced by the spread rule.' }),
  rej('Mechanical order (area number, name, initials)', null, { evidence: 'All p ≥ 0.19 (R5-H24-H28, H32).' }),
  rej('Fixed rotation order between committees', null, { evidence: `Transitions are flat (χ² ${F.RAW.analysis && F.RAW.analysis.transition_chi2 ? F.RAW.analysis.transition_chi2.chi2 : '119.5'} on 99 df); transition weights lower forward logLik -1.938 → -1.942 to -1.971 (R1-H11).` }),
  rej('Trustee-election partner regions together (inconclusive)', null, { evidence: '+9 pairs (z 3.5) in P71-76, mostly EC & SE; not in P68-70 (z 0.36); a bonus gains +0.009 logLik but costs 2.5 points of top-1 (R5-H13).' }),
  rej('Region cap 2 (soft cap) instead of 1', { regionCap: 2 }, { evidence: '4 exceptions since P74 (see region_cap_exceptions), but relaxing the cap predicts worse (R5-RCAP: -1.744 vs -1.726).' }),
  rej('Balance committee totals instead of standard sizes', { capacity: 'balance' }, { evidence: 'Reproduces a panel\'s seats with probability ≈ 0.002 (R2-S3).' }),
];

// ---------- 9. small-region cap and region-cap exceptions ----------
log('small regions');
const SMALLR = L.SMALL;
const small_region_cap = {
  rule_text: 'July 2020 trustees\' decision (2021 FR p.26): Southwest, West Central, Eastern Canada and Western Canada have no more than one delegate on a committee, counting both panels.',
  by_year: F.years.map((y) => {
    const cases = [];
    (F.Y(y).conference_committees || []).filter((c) => !c.secondary && c.committee !== 'OTHER').forEach((c) => {
      const l = (c.members || []).filter((m) => m.area != null).map((m) => m.area);
      SMALLR.forEach((g) => { const xs = l.filter((a) => region(a) === g); if (xs.length > 1) cases.push({ committee: c.committee, region: g, areas: xs.sort((a, b) => a - b) }); });
    });
    return { year: y, doubles: cases.length, cases };
  }),
  note: 'Held every year 2019-2024; broke twice in 2025 and four times in 2026 (the rebalancing years). Text only: the model\'s spread rule treats all regions alike.',
};
const region_cap_exceptions = { cases: pat.regionCapExceptions, note: `Within a new panel the one-per-region rule held in every draw up to Panel 73; since then ${pat.regionCapExceptions.length} committees got two new members from one region. The model keeps the cap at 1 (a soft cap of 2 predicts worse).` };

// ---------- 10. neighbour rule (kept field for the Predict page) ----------
log('neighbour rule');
const nfR = nullStats(RECENT, fair, QUICK ? 1500 : 3000), nfE = nullStats(EARLY, fair, QUICK ? 1500 : 3000), fitR = nullStats(RECENT, D, QUICK ? 1500 : 3000);
const maxCovered = (pr) => { const cnt = {}; pr.areas.concat(...Object.values(pr.cont)).forEach((a) => (cnt[region(a)] = (cnt[region(a)] || 0) + 1)); return Object.values(cnt).reduce((s, k) => s + Math.min(k, pr.committees.length), 0); };
let atMax = 0, maxPer = 0;
RECENT.forEach((P) => { const pr = X.buildProblem(P); const s = L.assignStats(F, pr, pr.actual); maxPer = maxCovered(pr); if (s && s.regionsCovered === maxPer) atMax++; });
const pairObs = (o, nul) => ({ same_region_neighbors: [o.nbSameRegion || 0, r1(nul.tot.nbSameRegion)], cross_region_neighbors: [o.nbCrossRegion || 0, r1(nul.tot.nbCrossRegion)], same_region_non_neighbors: [o.sameRegionNonNb || 0, r1(nul.tot.sameRegionNonNb)], regions_covered: [o.regionsCovered || 0, r1(nul.tot.regionsCovered)] });
const prevNR = (F.RAW.analysis || {}).neighbor_rule || {};
const neighbor_rule = {
  era_from_panel: RECENT[0], era_to_panel: RECENT[RECENT.length - 1],
  cross_panel: pairObs(oR, nfR),
  within_panel_cross_region_neighbors: [oR.newNbCross || 0, r1(nfR.tot.newNbCross)],
  max_regions_covered_per_panel: maxPer, panels_at_max: atMax,
  early_era: (() => { const e = pairObs(oE, nfE); return { panels: span(EARLY), cross_region_neighbors: e.cross_region_neighbors, same_region_neighbors: e.same_region_neighbors, regions_covered: e.regions_covered }; })(),
  fit: { spreadPenalty: D.spreadPenalty, neighborPenalty: D.neighborPenalty, sameStatePenalty: D.sameStatePenalty, simulated_vs_observed: pairObs(oR, fitR) },
  backtest_recent: { seat_and_history_rules_only: metrics(RECENT, abl[2].settings), plus_region_spread: metrics(RECENT, abl[3].settings), plus_both: metrics(RECENT, abl[4].settings), plus_same_state: metrics(RECENT, abl[5].settings) },
  backtest_early: { seat_and_history_rules_only: metrics(EARLY, abl[2].settings), plus_both: metrics(EARLY, abl[4].settings) },
  method: 'Observed counts vs simulated fair draws of the same panel under the seat/exclusion/one-per-region rules (expected). Neighbours = areas sharing a border (data/src/adjacency.json).',
};
if (prevNR.method && !neighbor_rule.method) neighbor_rule.method = prevNR.method;

// ---------- 11. watch list for the next draw ----------
log('watch list');
const prW = X.buildProblem(NEXT), wst = { sameState: [], back4: [], grid: [], smallDoubles: [], capPairs: [], nbCross: [], nbSame: [] };
const committeeBack = (a, k) => { const t = F.term(a, NEXT - 2 * k); return t && t.committee; };
const back4 = {}, back5 = {}; prW.areas.forEach((a) => { back4[a] = committeeBack(a, 4); back5[a] = committeeBack(a, 5); });
const smallBase = {}; // small-region doubles already present among continuing members do not count
X.simulate(prW, Object.assign({}, D, { quality: 'interactive', chains: QUICK ? 8 : 32, onDrawIdx: (pick, ctx) => {
  const s = L.drawStats(F, prW, pick, ctx);
  let b4 = 0, gr = 0; for (let i = 0; i < ctx.n; i++) { const a = ctx.areas[i], c = ctx.committees[pick[i]]; if (back4[a] === c) b4++; if (back4[a] === c || back5[a] === c) gr++; }
  wst.sameState.push(s.sameState); wst.back4.push(b4); wst.grid.push(gr); wst.smallDoubles.push(s.smallDoubles); wst.capPairs.push(s.capPairs); wst.nbCross.push(s.nbCrossRegion + s.newNbCross); wst.nbSame.push(s.nbSameRegion);
} }));
const dist = (v) => { const s = v.slice().sort((a, b) => a - b), m = v.reduce((a, b) => a + b, 0) / v.length; const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { mean: r2(m), sd: r2(Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length)), p05: q(0.05), p95: q(0.95), p_zero: r3(v.filter((x) => x === 0).length / v.length) }; };
const P_le = (v, x) => r3(v.filter((y) => y <= x).length / v.length);
const secW = X.secondary(prW, D), secU = X.secondary(prW, withD({ icrfRotation: 0, archivesNeighbor: 0 }));
const watch_list = {
  panel: NEXT, draw: `December ${NEXT + 1949}`, registered_on: new Date().toISOString().slice(0, 10), model_version: X.MODEL_VERSION, settings: D,
  checks: [
    { id: 'same_state', what: 'New members sitting on a committee with a same-state/province member (both panels)', expected: dist(wst.sameState), confirms: 'the same-state rule if 0 (a draw without it expects ' + r1(nsR.tot.sameState / RECENT.length) + ' per panel)' },
    { id: 'four_back', what: `Areas drawn onto the committee they held 4 terms back (Panel ${NEXT - 8})`, expected: dist(wst.back4), confirms: 'nothing new if near the expectation; far fewer would suggest a 4-term window' },
    { id: 'grid_67_69', what: `Areas drawn onto their Panel ${NEXT - 10} or Panel ${NEXT - 8} committee (R1 "grid" hypothesis)`, expected: Object.assign(dist(wst.grid), { p_le_6: P_le(wst.grid, 6) }), confirms: '6 or fewer would support the rejected 4-term "grid" rule (the default expects about 12)' },
    { id: 'icrf_recent_holders', what: 'IC/RF seats going to an area that held IC/RF in its last 3 terms', expected: { mean: r2(secW.ICRF.expectedRecentHolderPicks), uniform_lot: r2(secU.ICRF.expectedRecentHolderPicks), seats: secW.ICRF.seats }, confirms: 'the IC/RF rotation rule if 0 (a plain lot expects ' + r2(secU.ICRF.expectedRecentHolderPicks) + ')' },
    { id: 'archives_neighbours', what: 'Neighbour pairs among the new Archives members and with continuing ones', expected: { mean: r2(secW.ARCHIVES.expectedNeighbourPairs), uniform_lot: r2(secU.ARCHIVES.expectedNeighbourPairs) }, confirms: 'the mild Archives neighbour rule if 0' },
    { id: 'small_region_doubles', what: 'Committees with two members from Southwest, West Central, Eastern Canada or Western Canada (2027 rosters, both panels)', expected: dist(wst.smallDoubles), confirms: 'a return to the July 2020 small-region cap if 0; the 2025-26 loosening if 2 or more' },
    { id: 'region_cap', what: 'Committees with two new members from one region', expected: dist(wst.capPairs), confirms: 'the hard cap if 0 (4 exceptions in Panels 74-76)' },
    { id: 'cross_region_neighbours', what: 'New members next to a neighbouring area across a region line (both panels)', expected: dist(wst.nbCross), confirms: 'the neighbour rule if near the expectation' },
    { id: 'seats', what: 'New seats per committee', expected: seatsNext('target'), confirms: 'standard sizes; Treatment/Accessibilities 4 instead of 5 would mean GSO kept rebalancing' },
  ],
};

// ---------- 12. summary + write ----------
const an = JSON.parse(fs.readFileSync(path.join(L.ROOT, 'data/src/analysis.json'), 'utf8'));
const f = fwdNew.overall, b = backtest.defaults.recent;
const summary = `Assignments are made by lot (Service Manual 2026-2028, p. 45), but the lot follows firm rules. It skips the committees the area held in its last three terms, refills each committee to its standard size (8 or 9 members), and takes at most one new member per region on a committee. Since the December 2020 draw (Panel 71) it also spreads every committee across as many regions as possible counting both panels, and keeps neighbouring areas apart, matching GSO's 2025 criteria ('wider regional representation across all committees'; 'limit adjacent areas from different regions'). Areas from the same state or province never shared a committee in 2017-2026 (${same_state.observed_vs_expected_without_rule.recent[1] + same_state.observed_vs_expected_without_rule.early[1] | 0} pairs expected without that rule). The IC/RF seat rotates within each region (one per region, alternating regions by panel), and Archives takes four members from four different regions, mildly avoiding neighbours. Honest forward-chained test on Panels ${span(RECENT)} (rule strengths chosen on earlier panels only): the committee actually drawn got ${pct(f.meanP)} on average (1 in 11 = 9.1%), was the top pick ${pct(f.top1)} of the time and in the top three ${pct(f.top3)}. GSO's "best of five rounds" procedure, tested as a model, did ${best_of_k.adopted ? 'better' : 'not do better'} than these rules.`;
const out = Object.assign({}, an, {
  computed_on: new Date().toISOString().slice(0, 10), model_version: X.MODEL_VERSION,
  panels_analyzed: `${span(PANELS)} (Final Reports ${F.years[0]}-${F.years[F.years.length - 1]})`,
  summary,
  repeat_by_terms_back: pat.repeatK,
  repeat_note: '8 of the 9 two-terms-back repeats come from the December 2019 draw (Panel 70), the last draw made by hand; since the Conference Committee Assignment app (December 2020, Panel 71) only 1 of 279 (2021 FR pp.27, 70).',
  backtest, ablation, neighbor_rule, same_state, icrf_rotation, archives_neighbor, seats,
  forward_chained: {
    method: `For each test panel P = ${span(RECENT)}, the soft-rule strengths (spread ${SP.join('/')}, neighbour ${NB.join('/')}, same-state ${SS.join('/')}) are chosen by mean logLik on the panels before P only (${PANELS[0]}..P-1), then P is scored with a separate run. Seat counts are computed from data before each draw in every variant. previous_procedure = the old model (replace seats, no same-state rule) chosen the same way. app_era_window trains only on Panels ${RECENT[0]}..P-1 (it drifts to stronger penalties and scores worse); leave_one_out trains on every other panel.`,
    new_procedure: strip(fwdNew), previous_procedure: strip(fwdOld), app_era_window: { new_procedure: strip(fwdAppNew), previous_procedure: strip(fwdAppOld) }, leave_one_out: strip(loo),
    in_sample_defaults: b, icrf: icrf_rotation.forward,
  },
  calibration, best_of_k, rejected_rules,
  rejected_rules_note: `Rules tested and rejected. logLik/top3/dLogLik (where given) = in-sample on Panels ${span(RECENT)} vs the defaults (${backtest.defaults.recent.logLik}); differences under 0.01 are within noise, and the out-of-sample tests in the cited audits decide.`,
  small_region_cap, region_cap_exceptions, watch_list,
  model_defaults: an.model_defaults,
});
if (process.env.DUMP) L.writeJson(process.env.DUMP, out);
if (!DRY) L.writeJson(path.join(L.ROOT, "data/src/analysis.json"), out);
log('done', DRY ? '(dry run, not written)' : 'wrote data/src/analysis.json');
console.log(JSON.stringify({ in_sample_recent: b, previous_defaults_recent: backtest.previous_defaults.recent, forward_new: f, forward_old: fwdOld.overall, forward_app_new: fwdAppNew.overall, forward_app_old: fwdAppOld.overall, loo: loo.overall, best_of_k: bokFwdAll, ablation: ablation.recent.map((r) => [r.key, r.logLik, r.top3]), same_state: same_state.observed_vs_expected_without_rule, icrf: icrf_rotation.forward, archives: archives_neighbor.set_logLik_since_72, seats: seats.exact_panels, calib: calibration.forward.bins.map((x) => [x.from, x.cells, x.said, x.happened_rate]) }, null, 1));
