/* Shared Node harness for the model scripts (model_report.js, precompute_forecast.js, neighbor_rule_report.js):
   loads the bundled data + core.js + predict.js into a fake window, and offers scoring and per-draw statistics. */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');

/** Warn when data/fcr-data.js is older than the data/src files it is built from (run python tools/build_data.py). */
function checkBundle() {
  const bundle = fs.statSync(path.join(ROOT, 'data/fcr-data.js')).mtimeMs;
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const newer = walk(path.join(ROOT, 'data/src')).filter((f) => f.endsWith('.json') && !/forecast\.json$|analysis\.json$/.test(f) && fs.statSync(f).mtimeMs > bundle + 1000);
  if (newer.length) console.warn(`WARNING: data/fcr-data.js is older than ${newer.length} data/src file(s) (${newer.slice(0, 3).map((f) => path.relative(ROOT, f)).join(', ')}…); run python tools/build_data.py first.`);
  return !newer.length;
}

function load(opts) {
  opts = opts || {};
  checkBundle();
  global.window = {};
  require(path.join(ROOT, 'data/fcr-data.js'));
  // use the current data/src files even if the bundle is older
  window.FCR_DATA.adjacency = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/src/adjacency.json'), 'utf8')).pairs;
  const an = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/src/analysis.json'), 'utf8'));
  window.FCR_DATA.analysis = an; window.FCR_DATA.modelDefaults = an.model_defaults || {};
  if (opts.noForecast) window.FCR_DATA.forecast = {};
  require(path.join(ROOT, 'assets/js/core.js'));
  require(path.join(ROOT, 'assets/js/predict.js'));
  return window.FCR;
}

/** Panels with a known draw and enough history to score (same filter as FCR.predict.backtest). */
function scorablePanels(F) {
  return F.panels.filter((p) => { const pr = F.predict.buildProblem(p); return Object.keys(pr.actual).length > 20 && Object.values(pr.history).filter((h) => h.length).length > 20; });
}
/** The settings actually used for panel P (the December 2019 draw and earlier excluded only the previous committee). */
function panelOpts(P, settings) { return Object.assign({}, settings, P <= 70 && settings.excludeLast > 1 ? { excludeLast: 1 } : {}); }

/** Simulate panel P and score it against the actual draw. Returns {P, n, sumP, ll, t1, t3, probs, sim}. */
function runPanel(F, P, settings, run) {
  run = run || {};
  const pr = F.predict.buildProblem(P);
  const sim = F.predict.simulate(pr, Object.assign({}, panelOpts(P, settings), { quality: run.quality || 'backtest', seed: run.seed || 77, chains: run.chains, onDrawIdx: run.onDrawIdx }));
  const sc = F.predict.scoreProbs(pr, sim.probs);
  return Object.assign({ P, probs: sim.probs, sim, pr }, sc);
}
function agg(rows) {
  const s = rows.reduce((o, r) => { o.n += r.n; o.sumP += r.sumP; o.ll += r.ll; o.t1 += r.t1; o.t3 += r.t3; return o; }, { n: 0, sumP: 0, ll: 0, t1: 0, t3: 0 });
  return s.n ? { n: s.n, meanP: r4(s.sumP / s.n), logLik: r4(s.ll / s.n), top1: r4(s.t1 / s.n), top3: r4(s.t3 / s.n) } : null;
}
const r4 = (x) => Math.round(x * 10000) / 10000;
const r3 = (x) => Math.round(x * 1000) / 1000;
const r2 = (x) => Math.round(x * 100) / 100;
const r1 = (x) => Math.round(x * 10) / 10;

const SMALL = ['SW', 'WC', 'ECAN', 'WCAN'];
/** Statistics of one draw (pick = Int16Array committee index per area, ctx = the sampler's index tables). */
function drawStats(F, pr, pick, ctx) {
  const { n, m, areas, committees } = ctx;
  const region = (a) => (F.areas[a] || {}).region, state = (a) => (F.areas[a] || {}).state;
  const members = committees.map((c) => (pr.cont[c] || []).slice());
  const news = committees.map(() => []);
  for (let i = 0; i < n; i++) { members[pick[i]].push(areas[i]); news[pick[i]].push(areas[i]); }
  const o = { sameState: 0, nbSameRegion: 0, nbCrossRegion: 0, sameRegionNonNb: 0, regionsCovered: 0, smallDoubles: 0, capPairs: 0, newNbCross: 0 };
  committees.forEach((c, k) => {
    const cont = pr.cont[c] || [];
    news[k].forEach((a) => cont.forEach((b) => {
      const nb = F.isNeighbor(a, b), sr = region(a) === region(b);
      if (state(a) === state(b)) o.sameState++;
      if (nb && sr) o.nbSameRegion++; else if (nb) o.nbCrossRegion++; else if (sr) o.sameRegionNonNb++;
    }));
    const l = news[k];
    for (let x = 0; x < l.length; x++) for (let y = x + 1; y < l.length; y++) {
      if (region(l[x]) === region(l[y])) o.capPairs++;
      if (state(l[x]) === state(l[y])) o.sameState++;
      if (F.isNeighbor(l[x], l[y]) && region(l[x]) !== region(l[y])) o.newNbCross++;
    }
    const regs = members[k].map(region);
    o.regionsCovered += new Set(regs).size;
    SMALL.forEach((g) => { if (regs.filter((x) => x === g).length > 1) o.smallDoubles++; });
  });
  return o;
}
/** Same statistics for an assignment object {area: committee} (e.g. the actual draw). */
function assignStats(F, pr, assign) {
  const ctx = { n: pr.areas.length, m: pr.committees.length, areas: pr.areas, committees: pr.committees };
  const pick = Int16Array.from(pr.areas.map((a) => pr.committees.indexOf(assign[a])));
  if (pick.some((k) => k < 0)) return null;
  return drawStats(F, pr, pick, ctx);
}

function writeJson(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 1) + '\n', 'utf8'); }

module.exports = { ROOT, load, checkBundle, scorablePanels, panelOpts, runPanel, agg, drawStats, assignStats, writeJson, r1, r2, r3, r4, SMALL };
