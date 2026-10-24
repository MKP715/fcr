/* Precompute the default committee odds for the panels the Predict page offers that have no published draw yet
   (Panel 77 in 2026) → data/src/forecast.json, bundled as RAW.forecast. FCR.predict.odds(P) returns this table when
   the rule settings equal the defaults, the model version matches and the inputs are unchanged (fingerprint), so every
   page shows the same, precise numbers instantly. Also stores the explain() ablation steps for the same panel (served
   only to explain() steps, never as the main table).
   Usage: node tools/dev/precompute_forecast.js [panel ...] [--quick]     then: python tools/build_data.py
          node tools/dev/precompute_forecast.js --check   (exit 1 if the bundled forecast is stale for any pending panel)
   Re-run after changing predict.js (MODEL_VERSION), the model defaults (analysis.json model_defaults), the data (new
   Final Report, corrections) or the geography the rules use (areas.json regions/states, adjacency.json): the
   fingerprint covers all of these, so --check reports STALE until the table is rebuilt. */
const path = require('path');
const L = require('./model_lib');
const CHECK = process.argv.includes('--check');
const F = L.load({ noForecast: !CHECK });
const X = F.predict;
const QUICK = process.argv.includes('--quick');
const D = X.settingsOf({});

// Panels without a published draw that the Predict page can show: after the last loaded panel up to the panel being
// elected now (and the delegate-elects' panel). In 2026 that is Panel 77; with ?today= in 2027 it would add Panel 78.
const args = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const last = Math.max(...F.panels), cyc = F.cycle();
// Panel last+2 is included too: with ?today= in the next year the page offers it (its continuing panel is still unknown).
const pending = []; for (let p = last + 1; p <= Math.max(cyc.electPanel, last + 2); p++) pending.push(p);
if (F.elects.panel != null && !pending.includes(F.elects.panel) && F.elects.panel > last) pending.push(F.elects.panel);
const panels = args.length ? args : pending;
if (CHECK) {
  const stale = panels.filter((P) => !X.forecastValid(P));
  panels.forEach((P) => console.log(`Panel ${P}: forecast ${X.forecastValid(P) ? 'valid' : 'STALE or missing'} (model ${X.MODEL_VERSION}, inputs ${X.buildProblem(P).fingerprint})`));
  process.exit(stale.length ? 1 : 0);
}

const r5 = (x) => Math.round(x * 1e5) / 1e5;
const rp = (x) => (!x ? 0 : x < 0.001 ? +x.toPrecision(2) : Math.round(x * 1e4) / 1e4); // 0.01-point resolution; tiny values kept
const table = (pr, t) => { const o = {}; pr.areas.forEach((a) => (o[a] = pr.committees.map((c) => rp((t[a] || {})[c] || 0)))); return o; };
const roundObj = (o) => { const r = {}; Object.entries(o || {}).forEach(([k, v]) => (r[k] = typeof v === 'number' ? r5(v) : v)); return r; };

const out = { model_version: X.MODEL_VERSION, generated: new Date().toISOString().slice(0, 10),
  note: 'Precomputed by tools/dev/precompute_forecast.js with the default rule settings. probs/se are per area in the order of `committees`; se = between-chain standard error.',
  panels: {} };
panels.forEach((P) => {
  const pr = X.buildProblem(P);
  const t0 = Date.now();
  const q = QUICK ? 'interactive' : 'precise';
  const sim = X.simulate(pr, Object.assign({}, D, { quality: q, seed: 20261020 + P }));
  // effective sample size per cell, p(1-p)/se² (cells with 2% < p < 98%)
  const ess = [];
  pr.areas.forEach((a) => pr.committees.forEach((c) => { const p = sim.probs[a][c], s = sim.se[a][c]; if (p > 0.02 && p < 0.98 && s > 0) ess.push(p * (1 - p) / (s * s)); }));
  ess.sort((x, y) => x - y);
  const top = {};
  pr.areas.forEach((a) => {
    const r = Object.entries(sim.probs[a]).sort((x, y) => y[1] - x[1]);
    top[a] = { c: r[0][0], p: r5(r[0][1]), second: r[1][0], p2: r5(r[1][1]), nearTie: r[0][1] - r[1][1] < 0.03 };
  });
  const sec = X.secondary(pr, D);
  const secondary = {
    ICRF: { seats: sec.ICRF.seats, regions: sec.ICRF.regions, basis: sec.ICRF.basis, rotation: sec.ICRF.rotation, probs: roundObj(sec.ICRF.probs), recent: sec.ICRF.recent, held: sec.ICRF.held, expectedRecentHolderPicks: r5(sec.ICRF.expectedRecentHolderPicks) },
    ARCHIVES: { seats: sec.ARCHIVES.seats, lambda: sec.ARCHIVES.lambda, probs: roundObj(sec.ARCHIVES.probs), continuing: sec.ARCHIVES.continuing, nbOfContinuing: sec.ARCHIVES.nbOfContinuing, expectedNeighbourPairs: r5(sec.ARCHIVES.expectedNeighbourPairs), sets: sec.ARCHIVES.sets },
  };
  const wall = Date.now() - t0;
  // explain() ablation chain (all but the last step, which is the main table); only for the panel being elected now
  const ablation = P !== cyc.electPanel && !args.length ? [] : X.ablationSettings(D).slice(0, -1).map((s, i) => {
    const r = X.simulate(pr, Object.assign({}, s.settings, { quality: QUICK ? 'interactive' : 'interactive', chains: QUICK ? 8 : 32, seed: 7000 + i }));
    return { key: s.key, label: s.label, settings: s.settings, quality: 'interactive', draws: r.draws, chains: r.chains, capacityRule: r.capacityRule, seats: roundObj(r.seats), probs: table(pr, r.probs) };
  });
  out.panels[P] = {
    panel: P, committees: pr.committees, settings: D, quality: q, draws: sim.draws, chains: sim.chains, perChain: sim.perChain,
    ess: { median: Math.round(ess[ess.length >> 1] || 0), min: Math.round(ess[0] || 0) }, wall_ms: wall, acceptRate: r5(sim.acceptRate),
    fingerprint: pr.fingerprint, capacityRule: sim.capacityRule, seats: roundObj(sim.seats),
    probs: table(pr, sim.probs), se: table(pr, sim.se), lineup: sim.lineup, top,
    nearTies: Object.keys(top).filter((a) => top[a].nearTie).map(Number),
    secondary, ablation,
  };
  console.log(`Panel ${P}: ${sim.draws.toLocaleString()} draws (${sim.chains} chains), ESS median ${out.panels[P].ess.median.toLocaleString()} / min ${out.panels[P].ess.min.toLocaleString()}, ${wall} ms; ` +
    `near-ties ${out.panels[P].nearTies.length}/${pr.areas.length}` + (pr.areas.includes(65) ? `; Area 65: ${Object.entries(sim.probs[65]).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([c, v]) => c + ' ' + (v * 100).toFixed(1) + '±' + (sim.se[65][c] * 100).toFixed(2)).join(', ')}` : ''));
});
// compact: one line per numeric array
const txt = JSON.stringify(out, null, 1).replace(/\[\s*(-?[\d.e+-]+(?:,\s*-?[\d.e+-]+)*)\s*\]/g, (m, x) => '[' + x.replace(/\s+/g, '') + ']');
require('fs').writeFileSync(path.join(L.ROOT, 'data/src/forecast.json'), txt + '\n', 'utf8');
console.log('wrote data/src/forecast.json for panels', panels.join(', '));
