/* Drive the app in headless Chrome over the DevTools protocol: true phone widths, dark mode, scripted interaction.
   Usage: node tools/dev/shoot.js --out <dir> [--width 1400] [--height 1000] [--mobile] [--dark] [--full] [--print]
                                  [--query "?today=2027-01-15"] [--eval "<js>"] [--vp] [--no-shot] route [route...]
   --print emulates print media (the app's @media print styles; the beforeprint hook does not fire, so call it from --eval).
   For each route: loads index.html#/<route>, waits for it to settle, prints one JSON line
   {route, errors, overflowX, height, eval?} and saves <out>/<route>[-m][-dark].png (full page with --full).
   --eval runs in the page after load (may be async; `return` a value), e.g.
     --eval "document.querySelector('#gsearch').value='brandy';document.querySelector('#gsearch').dispatchEvent(new Event('input'));return [...document.querySelectorAll('#gsearch-results .t')].map(x=>x.textContent)" */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const argv = process.argv.slice(2);
const opt = { vp: false, print: false, out: null, width: 1400, height: 1000, mobile: false, dark: false, full: false, query: '', evalJs: null, shot: true, routes: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--out') opt.out = argv[++i];
  else if (a === '--width') opt.width = +argv[++i];
  else if (a === '--height') opt.height = +argv[++i];
  else if (a === '--mobile') { opt.mobile = true; if (!argv.includes('--width')) opt.width = 390; if (!argv.includes('--height')) opt.height = 844; }
  else if (a === '--dark') opt.dark = true;
  else if (a === '--full') opt.full = true;
  else if (a === '--query') opt.query = argv[++i];
  else if (a === '--eval') opt.evalJs = argv[++i];
  else if (a === '--no-shot') opt.shot = false;
  else if (a === '--vp') opt.vp = true;
  else if (a === '--print') opt.print = true;
  else opt.routes.push(a);
}
if (!opt.out || !opt.routes.length) { console.error('usage: node tools/dev/shoot.js --out <dir> [options] route [route...]'); process.exit(2); }
fs.mkdirSync(opt.out, { recursive: true });

const ROOT = path.join(__dirname, '..', '..');
const fileUrl = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const profile = path.join(opt.out, 'profile-' + process.pid);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = (port, p, method) => new Promise((res, rej) => {
  const req = http.request({ host: '127.0.0.1', port, path: p, method: method || 'GET' }, (r) => { let s = ''; r.on('data', (d) => (s += d)); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } }); });
  req.on('error', rej); req.end();
});

(async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
  let port = null;
  for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { /* not yet */ } }
  if (!port) { console.error('Chrome did not start'); chrome.kill(); process.exit(1); }
  const targets = await getJson(port, '/json/list');
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let seq = 0; const pending = new Map(); const waiters = [];
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); if (msg.error) rej(new Error(msg.error.message)); else res(msg.result); }
    else if (msg.method) waiters.filter((w) => w.method === msg.method).forEach((w) => { waiters.splice(waiters.indexOf(w), 1); w.res(msg.params); });
  });
  const send = (method, params) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params: params || {} })); });
  const once = (method, ms) => Promise.race([new Promise((res) => waiters.push({ method, res })), sleep(ms || 15000)]);
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: opt.width, height: opt.height, deviceScaleFactor: 1, mobile: opt.mobile });
  if (opt.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setEmulatedMedia', Object.assign({ features: [{ name: 'prefers-color-scheme', value: opt.dark ? 'dark' : 'light' }] }, opt.print ? { media: 'print' } : {}));
  const q = opt.query ? (opt.query.startsWith('?') ? opt.query : '?' + opt.query) : '';
  let i = 0;
  for (const route of opt.routes) {
    i++;
    const url = `${fileUrl}${q}${q ? '&' : '?'}_r=${i}#/${route}`;
    const loaded = once('Page.loadEventFired', 20000);
    await send('Page.navigate', { url });
    await loaded; await sleep(1200);
    const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
    const info = await ev(`(() => ({ errors: (window.__errs || []).slice(), overflowX: document.documentElement.scrollWidth > window.innerWidth + 1, scrollW: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))()`);
    const row = Object.assign({ route }, info);
    if (opt.evalJs) {
      try { row.eval = await ev(`(async () => { ${opt.evalJs} })()`); } catch (e) { row.eval = 'EVAL ERROR: ' + e.message; }
      await sleep(400);
      row.errorsAfterEval = await ev('(window.__errs || []).slice()');
    }
    if (opt.shot) {
      const slug = route.replace(/[\/%?&=]/g, '_') || 'today';
      const file = path.join(opt.out, `${slug}${opt.mobile ? '-m' : ''}${opt.dark ? '-dark' : ''}.png`);
      const h = opt.full ? Math.min(info.height, 12000) : opt.height;
      if (opt.full) await send('Emulation.setDeviceMetricsOverride', { width: opt.width, height: h, deviceScaleFactor: 1, mobile: opt.mobile });
      // --vp: what the user sees right now (after --eval scrolled the page); otherwise from the top of the document.
      const shot = opt.vp ? await send('Page.captureScreenshot', { format: 'png' })
        : await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: opt.width, height: h, scale: 1 }, captureBeyondViewport: true });
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      if (opt.full) await send('Emulation.setDeviceMetricsOverride', { width: opt.width, height: opt.height, deviceScaleFactor: 1, mobile: opt.mobile });
      row.shot = file;
    }
    console.log(JSON.stringify(row));
  }
  try { await send('Browser.close'); } catch (e) { /* closing */ }
  ws.close(); setTimeout(() => { try { chrome.kill(); } catch (e) { /* gone */ } try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* locked */ } process.exit(0); }, 300);
})().catch((e) => { console.error(e); process.exit(1); });
