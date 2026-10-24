/* Do neighbouring areas avoid sharing a Conference committee?
   For each past panel, count neighbour pairs on the same committee and compare with simulated fair draws of the
   same panel under the current rules (seats, last-3 exclusions, one-per-region). Repeat for three neighbour
   definitions. Usage: node tools/dev/analyze_adjacency.js [sims=2000] [--no-region-cap] */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
global.window = {};
require(path.join(ROOT, 'data/fcr-data.js'));
require(path.join(ROOT, 'assets/js/core.js'));
require(path.join(ROOT, 'assets/js/predict.js'));
const F = window.FCR;
const SIMS = +process.argv[2] || 2000;
const regionCap = process.argv.includes('--no-region-cap') ? 99 : 1;

// ---- neighbour definitions ----
const pairsBorder = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/src/adjacency.json'), 'utf8')).pairs;
const areas = F.areaList;
const km = (a, b) => { const r = Math.PI / 180, la1 = a.lat * r, la2 = b.lat * r, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dg / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(h)); };
function toSet(pairs) { const s = new Set(); pairs.forEach(([a, b]) => { s.add(a + '-' + b); s.add(b + '-' + a); }); return s; }
const defs = {
  border: toSet(pairsBorder),
  within350km: toSet(areas.flatMap((a) => areas.filter((b) => b.n > a.n && km(a, b) < 350).map((b) => [a.n, b.n]))),
  nearest3: toSet(areas.flatMap((a) => areas.filter((b) => b.n !== a.n).sort((x, y) => km(a, x) - km(a, y)).slice(0, 3).map((b) => [a.n, b.n]))),
};
const region = (a) => (F.areas[a] || {}).region;

function countPairs(assign, adj, filter) { // assign: {area: committee} within one panel
  const byC = {};
  Object.entries(assign).forEach(([a, c]) => (byC[c] = byC[c] || []).push(+a));
  let same = 0, cross = 0;
  Object.values(byC).forEach((l) => { for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
    if (!adj.has(l[i] + '-' + l[j])) continue;
    if (region(l[i]) === region(l[j])) same++; else cross++;
  } });
  return { same, cross };
}
function countCrossPanel(assign, cont, adj) { // new member next to a continuing member of the same committee
  let n = 0;
  Object.entries(assign).forEach(([a, c]) => (cont[c] || []).forEach((b) => { if (adj.has(a + '-' + b)) n++; }));
  return n;
}

const panels = F.panels.filter((p) => Object.keys(F.predict.buildProblem(p).actual).length > 20);
console.log(`Panels ${panels.join(', ')} · ${SIMS} simulated draws per panel · regionCap ${regionCap}`);
for (const [name, adj] of Object.entries(defs)) {
  console.log(`\n=== Neighbour definition: ${name} (${adj.size / 2} pairs) ===`);
  console.log('panel | within-panel same-region obs/exp | within-panel CROSS-region obs/exp  P(sim<=obs) | across-panels obs/exp  P(sim<=obs)');
  const tot = { xObs: 0, cObs: 0, sObs: 0, xSim: Array(SIMS).fill(0), cSim: Array(SIMS).fill(0) };
  for (const P of panels) {
    const pr = F.predict.buildProblem(P);
    const obs = countPairs(pr.actual, adj);
    const cObs = countCrossPanel(pr.actual, pr.cont, adj);
    const xs = [], cs = [], ss = [];
    F.predict.simulate(pr, { sims: SIMS, regionCap, spreadPenalty: 0, neighborPenalty: 0, sameStatePenalty: 0, onDraw: (pick) => {
      const c = countPairs(pick, adj); xs.push(c.cross); ss.push(c.same); cs.push(countCrossPanel(pick, pr.cont, adj));
    } });
    const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
    const pLE = (v, o) => v.filter((x) => x <= o).length / v.length;
    console.log(`P${P}  | ${String(obs.same).padStart(3)} / ${mean(ss).toFixed(2).padStart(5)}             | ${String(obs.cross).padStart(3)} / ${mean(xs).toFixed(2).padStart(5)}   ${pLE(xs, obs.cross).toFixed(3)}            | ${String(cObs).padStart(3)} / ${mean(cs).toFixed(2).padStart(5)}  ${pLE(cs, cObs).toFixed(3)}`);
    tot.xObs += obs.cross; tot.sObs += obs.same; tot.cObs += cObs;
    for (let i = 0; i < SIMS; i++) { tot.xSim[i] += xs[i % xs.length]; tot.cSim[i] += cs[i % cs.length]; }
  }
  const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  const pLE = (v, o) => v.filter((x) => x <= o).length / v.length;
  console.log(`ALL   | same-region ${tot.sObs} | CROSS-region ${tot.xObs} vs expected ${mean(tot.xSim).toFixed(1)} → P(sim<=obs)=${pLE(tot.xSim, tot.xObs).toFixed(4)} | across-panels ${tot.cObs} vs ${mean(tot.cSim).toFixed(1)} → P=${pLE(tot.cSim, tot.cObs).toFixed(4)}`);
}
