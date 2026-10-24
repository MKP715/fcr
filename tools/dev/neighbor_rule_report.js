/* Recompute only the "regions spread" and "neighbours apart" evidence (analysis.json field neighbor_rule).
   tools/dev/model_report.js writes the same field together with everything else; use this after changing
   adjacency.json when a full report is not needed. Model defaults and backtests are left alone.
     node tools/dev/neighbor_rule_report.js [fromPanel=71] [sims=3000]
   then: python tools/build_data.py */
const path = require('path');
const fs = require('fs');
const L = require('./model_lib');
const F = L.load({ noForecast: true });
const X = F.predict;
const FROM = +process.argv[2] || 71, SIMS = +process.argv[3] || 3000;
const D = X.settingsOf({});
const region = (a) => (F.areas[a] || {}).region;
const PANELS = L.scorablePanels(F), RECENT = PANELS.filter((p) => p >= FROM), EARLY = PANELS.filter((p) => p < FROM);
const span = (ps) => `${ps[0]}-${ps[ps.length - 1]}`;
const fair = Object.assign({}, D, { spreadPenalty: 0, neighborPenalty: 0, sameStatePenalty: 0 }); // seats, exclusions, one per region

function expected(panels, s) {
  const tot = {};
  panels.forEach((P) => {
    const pr = X.buildProblem(P), acc = {}; let n = 0;
    X.simulate(pr, Object.assign({}, L.panelOpts(P, s), { quality: 'backtest', sims: SIMS, onDrawIdx: (pick, ctx) => { const st = L.drawStats(F, pr, pick, ctx); Object.keys(st).forEach((k) => (acc[k] = (acc[k] || 0) + st[k])); n++; } }));
    Object.keys(acc).forEach((k) => (tot[k] = (tot[k] || 0) + acc[k] / n));
  });
  return tot;
}
const observed = (panels) => { const o = {}; panels.forEach((P) => { const pr = X.buildProblem(P); const s = L.assignStats(F, pr, pr.actual); if (s) Object.keys(s).forEach((k) => (o[k] = (o[k] || 0) + s[k])); }); return o; };
const pairs = (o, e) => ({ same_region_neighbors: [o.nbSameRegion || 0, L.r1(e.nbSameRegion)], cross_region_neighbors: [o.nbCrossRegion || 0, L.r1(e.nbCrossRegion)], same_region_non_neighbors: [o.sameRegionNonNb || 0, L.r1(e.sameRegionNonNb)], regions_covered: [o.regionsCovered || 0, L.r1(e.regionsCovered)] });
const oR = observed(RECENT), oE = observed(EARLY), eR = expected(RECENT, fair), eE = expected(EARLY, fair), fit = expected(RECENT, D);
const maxCovered = (pr) => { const cnt = {}; pr.areas.concat(...Object.values(pr.cont)).forEach((a) => (cnt[region(a)] = (cnt[region(a)] || 0) + 1)); return Object.values(cnt).reduce((s, k) => s + Math.min(k, pr.committees.length), 0); };
let atMax = 0, maxPer = 0;
RECENT.forEach((P) => { const pr = X.buildProblem(P); const s = L.assignStats(F, pr, pr.actual); maxPer = maxCovered(pr); if (s && s.regionsCovered === maxPer) atMax++; });
const ap = path.join(L.ROOT, 'data/src/analysis.json');
const a = JSON.parse(fs.readFileSync(ap, 'utf8'));
const e = pairs(oE, eE);
a.neighbor_rule = Object.assign({}, a.neighbor_rule, {
  era_from_panel: RECENT[0], era_to_panel: RECENT[RECENT.length - 1],
  cross_panel: pairs(oR, eR), within_panel_cross_region_neighbors: [oR.newNbCross || 0, L.r1(eR.newNbCross)],
  max_regions_covered_per_panel: maxPer, panels_at_max: atMax,
  early_era: { panels: span(EARLY), cross_region_neighbors: e.cross_region_neighbors, same_region_neighbors: e.same_region_neighbors, regions_covered: e.regions_covered },
  fit: { spreadPenalty: D.spreadPenalty, neighborPenalty: D.neighborPenalty, sameStatePenalty: D.sameStatePenalty, simulated_vs_observed: pairs(oR, fit) },
  method: 'Observed counts vs simulated fair draws of the same panel under the seat/exclusion/one-per-region rules (expected). Neighbours = areas sharing a border (data/src/adjacency.json).',
});
L.writeJson(ap, a);
console.log(JSON.stringify(a.neighbor_rule, null, 1));
