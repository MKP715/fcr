/* Fit the soft-rule strengths (spreadPenalty, neighborPenalty, sameStatePenalty) to the recent draws (in-sample;
   tools/dev/model_report.js has the forward-chained version).
   Scores each setting by how well it predicts the actual committees of panels FROM..last (log-likelihood, top-1,
   top-3), and checks that simulated draws reproduce the observed neighbour / region statistics.
   Usage: node tools/dev/calibrate_soft_rules.js [fromPanel=71] [sims=800]   (env SP, NBP, SS = comma lists)
   backtest() uses the same 'backtest' quality for every setting (sims only sets the statistics runs). */
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = {};
require(path.join(ROOT, 'data/fcr-data.js'));
require(path.join(ROOT, 'assets/js/core.js'));
require(path.join(ROOT, 'assets/js/predict.js'));
const F = window.FCR;
const FROM = +process.argv[2] || 71;
const SIMS = +process.argv[3] || 800;
const panels = F.panels.filter((p) => p >= FROM && Object.keys(F.predict.buildProblem(p).actual).length > 20);
const region = (a) => (F.areas[a] || {}).region;

function stats(assign, cont) {
  const o = { nbSame: 0, nbCross: 0, regDup: 0, covered: 0 };
  const byC = {};
  Object.entries(assign).forEach(([a, c]) => (byC[c] = byC[c] || []).push(+a));
  Object.entries(byC).forEach(([c, news]) => {
    const all = news.concat(cont[c] || []);
    for (let i = 0; i < news.length; i++) for (let j = 0; j < all.length; j++) {
      const a = news[i], b = all[j]; if (a === b || (j < news.length && j <= i)) continue;
      const nb = F.isNeighbor(a, b), sr = region(a) === region(b);
      if (nb && sr) o.nbSame++; else if (nb) o.nbCross++; else if (sr) o.regDup++;
    }
    o.covered += new Set(all.map(region)).size;
  });
  return o;
}
const observed = { nbSame: 0, nbCross: 0, regDup: 0, covered: 0 };
panels.forEach((P) => { const pr = F.predict.buildProblem(P); const s = stats(pr.actual, pr.cont); Object.keys(observed).forEach((k) => (observed[k] += s[k])); });
console.log(`Panels ${panels.join(',')} · observed`, JSON.stringify(observed));

const grid = [];
const SP = (process.env.SP || '2,3,4,5').split(',').map(Number), NBP = (process.env.NBP || '0,1,2,3').split(',').map(Number), SS = (process.env.SS || '0,8').split(',').map(Number);
for (const sp of SP) for (const nbp of NBP) for (const ss of SS) grid.push({ spreadPenalty: sp, neighborPenalty: nbp, sameStatePenalty: ss });
const rows = [];
for (const g of grid) {
  const opt = Object.assign({}, g, { btSims: SIMS });
  const bt = F.predict.backtest(opt, panels);
  const sim = { nbSame: 0, nbCross: 0, regDup: 0, covered: 0 }; let nd = 0;
  panels.forEach((P) => {
    const pr = F.predict.buildProblem(P); let k = 0; const acc = { nbSame: 0, nbCross: 0, regDup: 0, covered: 0 };
    F.predict.simulate(pr, Object.assign({}, g, { sims: 300, onDraw: (pick) => { const s = stats(pick, pr.cont); Object.keys(acc).forEach((x) => (acc[x] += s[x])); k++; } }));
    Object.keys(sim).forEach((x) => (sim[x] += acc[x] / k)); nd++;
  });
  rows.push({ ...g, ...bt.overall, sim });
  console.log(`spread ${g.spreadPenalty} nb ${g.neighborPenalty} ss ${g.sameStatePenalty} | logLik ${bt.overall.logLik.toFixed(4)} top1 ${(bt.overall.top1 * 100).toFixed(1)}% top3 ${(bt.overall.top3 * 100).toFixed(1)}% meanP ${(bt.overall.meanP * 100).toFixed(1)}% | sim nbSame ${sim.nbSame.toFixed(1)} nbCross ${sim.nbCross.toFixed(1)} regDup ${sim.regDup.toFixed(1)} covered ${sim.covered.toFixed(1)}`);
}
rows.sort((a, b) => b.logLik - a.logLik);
console.log('\nBest by log-likelihood:', JSON.stringify(rows.slice(0, 3).map((r) => ({ spread: r.spreadPenalty, nb: r.neighborPenalty, ss: r.sameStatePenalty, logLik: +r.logLik.toFixed(4), top1: +r.top1.toFixed(3), top3: +r.top3.toFixed(3), meanP: +r.meanP.toFixed(3) }))));
