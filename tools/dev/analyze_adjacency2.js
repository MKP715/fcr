/* Disentangle "avoid neighbours" from "avoid repeating a region already on the committee" (across panels).
   For each panel, compare observed vs simulated counts of new-member/continuing-member pairs on the same committee:
   (a) neighbours in the same region, (b) neighbours in different regions, (c) same region but not neighbours.
   Also checks whether new members fill regions missing from the continuing members ("region coverage").
   Usage: node tools/dev/analyze_adjacency2.js [sims=2000] [fromPanel=71] */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
global.window = {};
require(path.join(ROOT, 'data/fcr-data.js'));
require(path.join(ROOT, 'assets/js/core.js'));
require(path.join(ROOT, 'assets/js/predict.js'));
const F = window.FCR;
const SIMS = +process.argv[2] || 2000;
const FROM = +process.argv[3] || 71;
const pairs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/src/adjacency.json'), 'utf8')).pairs;
const adj = new Set(); pairs.forEach(([a, b]) => { adj.add(a + '-' + b); adj.add(b + '-' + a); });
const region = (a) => (F.areas[a] || {}).region;

function stats(assign, cont) {
  const o = { nbSame: 0, nbCross: 0, regNonNb: 0, regionsCovered: 0 };
  const byC = {};
  Object.entries(assign).forEach(([a, c]) => (byC[c] = byC[c] || []).push(+a));
  Object.entries(byC).forEach(([c, news]) => {
    const conts = cont[c] || [];
    news.forEach((a) => conts.forEach((b) => {
      const nb = adj.has(a + '-' + b), sr = region(a) === region(b);
      if (nb && sr) o.nbSame++; else if (nb) o.nbCross++; else if (sr) o.regNonNb++;
    }));
    o.regionsCovered += new Set(news.concat(conts).map(region)).size; // distinct regions on the whole committee
  });
  return o;
}

const panels = F.panels.filter((p) => Object.keys(F.predict.buildProblem(p).actual).length > 20 && F.panels.includes(p - 1));
const groups = { [`P${panels[0]}-P${FROM - 1}`]: panels.filter((p) => p < FROM), [`P${FROM}-P${panels[panels.length - 1]}`]: panels.filter((p) => p >= FROM) };
for (const [label, ps] of Object.entries(groups)) {
  const obs = { nbSame: 0, nbCross: 0, regNonNb: 0, regionsCovered: 0 };
  const sim = { nbSame: [], nbCross: [], regNonNb: [], regionsCovered: [] };
  const per = [];
  ps.forEach((P) => {
    const pr = F.predict.buildProblem(P);
    const o = stats(pr.actual, pr.cont);
    Object.keys(obs).forEach((k) => (obs[k] += o[k]));
    const draws = [];
    F.predict.simulate(pr, { sims: SIMS, spreadPenalty: 0, neighborPenalty: 0, sameStatePenalty: 0, onDraw: (pick) => draws.push(stats(pick, pr.cont)) });
    per.push(draws);
    const m = (k) => (draws.reduce((s, d) => s + d[k], 0) / draws.length).toFixed(1);
    console.log(`P${P}: nbSame ${o.nbSame}/${m('nbSame')}  nbCross ${o.nbCross}/${m('nbCross')}  regNonNb ${o.regNonNb}/${m('regNonNb')}  regionsCovered ${o.regionsCovered}/${m('regionsCovered')}`);
  });
  Object.keys(sim).forEach((k) => { for (let i = 0; i < SIMS; i++) sim[k].push(per.reduce((s, d) => s + d[i % d.length][k], 0)); });
  console.log(`== ${label} (${ps.length} panels): observed / expected / P(sim<=obs) / P(sim>=obs)`);
  Object.keys(obs).forEach((k) => {
    const v = sim[k], mean = v.reduce((s, x) => s + x, 0) / v.length;
    console.log(`   ${k.padEnd(15)} ${String(obs[k]).padStart(4)} / ${mean.toFixed(1).padStart(6)} / ${(v.filter((x) => x <= obs[k]).length / v.length).toFixed(4)} / ${(v.filter((x) => x >= obs[k]).length / v.length).toFixed(4)}`);
  });
}
