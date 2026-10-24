/* Learn view: the service structure as an explorable tree (from The A.A. Service Manual 2026–2028 plus the Final Reports),
   the rules that drive rotation with page-cited quotes, and an A–Z glossary. Routes: #/learn, #/learn/<node>,
   #/learn/rules, #/learn/glossary, #/learn/glossary/<term>. */
(function () {
  'use strict';
  const FCR = window.FCR;
  const esc = FCR.esc;
  const V = FCR.views, UI = FCR.ui;
  const L0 = (FCR.RAW && FCR.RAW.learn) || {};
  const LEARN = { nodes: L0.nodes || [], glossary: L0.glossary || [], quiz: L0.quiz || [], rules: L0.rules || [] };
  const TL = (FCR.RAW && FCR.RAW.timelines) || {};   // timelines.json: founding era, a delegate's two-year term
  const fold = FCR.fold;

  const LINKS = {
    delegates: ['Delegates & Map', '#/delegates'], committees: ['Committees', '#/committees'], grid: ['Rotation Grid', '#/grid'],
    predict: ['Predict', '#/predict'], board: ['Trustees & Boards', '#/board'], staff: ['GSO Staff', '#/staff'],
    timeline: ['Openings', '#/timeline'], reports: ['Reports', '#/reports'], calendar: ['Calendar', '#/calendar'],
    actions: ['Advisory Actions', '#/actions'],
    // the Conference the agenda-item data is for (pai.json source.ordinal): "Proposed agenda items (77th Conference)"
    agenda: [`Proposed agenda items${((FCR.RAW && FCR.RAW.pai) || {}).source ? ` (${FCR.ordinal(FCR.RAW.pai.source.ordinal)} Conference)` : ''}`, '#/agenda'],
  };
  const TOPIC = {
    committee_assignment: 'How new delegates get their committee', secondary_committees: 'Secondary committees (Archives, IC/RF)',
    delegate_term: 'Delegate term & panels', chair_election: 'Committee chairs and the Delegate Chair', committee_size_composition: 'Committee size & make-up',
    trustee_classes_terms: 'Trustee classes & terms', regional_trustee_election_rotation: 'Regional trustee election calendar',
    trustee_at_large: 'Trustees-at-large', general_service_trustee: 'General service trustees', class_a_trustee: 'Class A trustees',
    nontrustee_directors: 'Nontrustee directors', gsb_officers: 'GSB officers & the chair', gso_staff_rotation: 'GSO Staff rotation',
    conference_composition: 'Who votes at the Conference', panel_numbering: 'Panel numbering', other: 'Third Legacy, boundaries & more',
  };

  // ---------- tree ----------
  const byId = {};
  LEARN.nodes.forEach((n) => (byId[n.id] = n));
  const kids = {};
  LEARN.nodes.forEach((n) => { const p = n.parent || '_root'; (kids[p] = kids[p] || []).push(n); });
  Object.values(kids).forEach((l) => l.sort((a, b) => (a.order || 0) - (b.order || 0)));
  const roots = kids._root || [];
  function pathTo(id) { const out = []; let n = byId[id]; while (n) { out.unshift(n); n = byId[n.parent]; } return out; }
  function subtree(id) { const out = []; (function walk(x) { out.push(x); (kids[x] || []).forEach((c) => walk(c.id)); })(id); return out; }
  // Questions per node, counting its descendants ("Quiz me on this" opens #/quiz/node/<id>).
  const qCount = {};
  LEARN.quiz.forEach((q) => pathTo(q.node).forEach((p) => (qCount[p.id] = (qCount[p.id] || 0) + 1)));
  // plus the generated cards of the per-topic decks (view-quiz.js, loaded after this file): counted on first use
  let genCounted = false;
  const quizCount = (id) => {
    if (!genCounted && FCR.quizGenNodes) { genCounted = true; FCR.quizGenNodes().forEach((g) => pathTo(g).forEach((p) => (qCount[p.id] = (qCount[p.id] || 0) + 1))); }
    return qCount[id] || 0;
  };

  function treeHtml(list, sel, open, depth) {
    return `<ul class="ltree" style="${depth ? '' : 'padding-left:0'}">${list.map((n) => {
      const ch = kids[n.id] || [];
      const isOpen = open.has(n.id);
      return `<li><div class="lnode ${n.id === sel ? 'on' : ''}">${ch.length ? `<button class="ltog" data-t="${n.id}" aria-expanded="${isOpen}" aria-label="${isOpen ? 'Collapse' : 'Expand'} ${esc(n.title)}">${isOpen ? '▾' : '▸'}</button>` : '<span class="ltog" aria-hidden="true"></span>'}<a href="#/learn/${n.id}"${n.id === sel ? ' aria-current="page"' : ''}>${esc(n.title)}</a>${n.role_label ? ` <span class="muted small">${esc(n.role_label)}</span>` : ''}</div>
        ${ch.length && isOpen ? treeHtml(ch, sel, open, depth + 1) : ''}</li>`;
    }).join('')}</ul>`;
  }

  // ---------- detail ----------
  const list = (label, arr) => (arr && arr.length ? `<h4>${label}</h4><ul class="small">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
  const cite = (q) => (q.source ? `${esc(q.source)}${q.page ? ', p. ' + esc(q.page) : ''}` : q.page ? 'p. ' + esc(q.page) : '');
  const isCanada = (rid) => rid === 'ECAN' || rid === 'WCAN';

  /** Delegate Chair of each Conference: conference_chair of every loaded year, next_conference_chair of the latest, plus the node's extra rows. */
  function delegateChairRows(n) {
    const rows = {};
    const put = (y, name, area, alt, src) => {
      const r = rows[y] || (rows[y] = { year: y });
      if (name && !r.name) { r.name = name; r.area = area; }
      if (alt && alt.name && !r.alt) r.alt = alt;
      if (src && !r.src) r.src = src;
    };
    FCR.years.forEach((y) => {
      const Y = FCR.Y(y) || {}, P = FCR.Y(y - 1) || {};
      const c = Y.conference_chair;
      put(y, c && c.name, c && c.area, Y.conference_alt_chair || P.next_conference_alt_chair, c ? `${y} Final Report` : '');
      const nx = Y.next_conference_chair;
      if (nx && nx.name) put(y + 1, nx.name, nx.area, Y.next_conference_alt_chair, `${y} Final Report`);
    });
    (n.history_extra || []).forEach((x) => put(x.year, x.name, x.area, x.alt, x.source));
    return Object.values(rows).filter((r) => r.name).sort((a, b) => b.year - a.year);
  }
  function specialHtml(n) {
    if (n.special === 'delegate_chair_history') {
      const rows = delegateChairRows(n);
      if (!rows.length) return '';
      const known = (nm) => { try { return FCR.personRoles(nm).length > 0; } catch (e) { return false; } };
      const who = (p) => (p && p.name ? `${known(p.name) ? UI.personLink(p.name) : esc(p.name)} <span class="muted small">${p.area != null ? UI.areaLink(p.area, { noname: true }) : ''}</span>` : '<span class="muted">—</span>');
      return `<h4>Delegate Chairs by Conference <span class="muted small">newest first</span></h4>
        <div class="table-wrap"><table class="t compact l-dc"><thead><tr><th>Conference</th><th>Delegate Chair</th><th>Region</th><th>Alternate</th></tr></thead><tbody>
        ${rows.map((r) => { const a = FCR.areas[r.area] || {}; return `<tr><td>${r.year} <span class="muted small">${FCR.ordinal(r.year - 1950)}</span></td><td>${who(r)}</td><td>${a.region ? `${UI.regionDot(a.region)} ${esc(FCR.regionName(a.region))} <span class="muted small">${isCanada(a.region) ? 'Canada' : 'U.S.'}</span>` : '—'}</td><td>${r.alt ? who(r.alt) : '<span class="muted">—</span>'}</td></tr>`; }).join('')}
        </tbody></table></div><p class="small muted">From each Final Report's opening pages (2009–2010 from the 2009 report). An alternate is printed only for some years.</p>`;
    }
    if (n.special === 'my_region') {
      const my = +FCR.store.get('myArea', 65), a0 = FCR.areas[my];
      if (!a0 || !a0.region) return '';
      const rid = a0.region, areas = FCR.areaList.filter((a) => a.region === rid);
      let rt = null; try { rt = FCR.regionalTrustee(rid); } catch (e) { rt = null; }
      const par = (a) => { const p = FCR.areaParity(a.n); return p == null ? '' : p ? 'odd' : 'even'; };
      return `<h4>Your region: ${UI.regionDot(rid)} ${esc(FCR.regionName(rid))} <span class="muted small">from Area ${my}; change your area on Today</span></h4>
        <p class="small">${areas.length} areas: ${areas.map((a) => `${UI.areaLink(a.n, { brief: true })} <span class="muted">(${par(a)})</span>`).join(', ')}.</p>
        ${rt && (rt.current || rt.nextElection) ? `<p class="small">Regional trustee: ${rt.current ? UI.personLink(rt.current.name) : '—'}${rt.nextElection ? ` · next election at the ${rt.nextElection} Conference` : ''}.</p>` : ''}`;
    }
    return '';
  }

  // ---------- timelines (timelines.json; a node opts in with "timeline": "<key>") ----------
  const pgs = (p) => (/[,–]|\d-\d/.test(p) ? 'pp. ' : 'p. ') + p;
  const srcOf = (x) => [x.page ? pgs(x.page) : '', x.source || ''].filter(Boolean).join('; ');
  const nodeLink = (id) => (id && byId[id] ? ` <a class="l-tl-node" href="#/learn/${esc(id)}">Learn: ${esc(byId[id].title)} →</a>` : '');

  /** Founding era 1935–1962: the four hand-overs of authority as a chain, then every dated step. */
  function foundingHtml() {
    const ev = TL.founding || [], chain = TL.founding_chain || [];
    if (!ev.length) return '';
    return `<h4>How authority passed <span class="muted small">${esc(ev[0].year)}–${esc(ev[ev.length - 1].year)}</span></h4>
      ${chain.length ? `<ol class="l-chain" aria-label="Who held final authority">${chain.map((c) => `<li><span class="l-chain-yr">${esc(c.year)}</span>${esc(c.label)} <span class="muted">(${esc(srcOf(c))})</span></li>`).join('')}</ol>` : ''}
      <ol class="l-tl l-tl-years" aria-label="Founding era, year by year">${ev.map((e, i) => `<li><span class="l-tl-yr${i && ev[i - 1].year === e.year ? ' rep' : ''}">${esc(e.year)}</span>
        <p class="small">${e.date ? `<strong>${esc(e.date)}</strong> · ` : ''}${esc(e.text)} <span class="muted">(${esc(srcOf(e))})</span>${nodeLink(e.node)}</p></li>`).join('')}</ol>`;
  }

  // A delegate's two-year term. Step windows are '<year offset>/<MM-DD | start | end>[±days]' from the year the panel takes
  // office (Panel P: P + 1950); start/end are that year's Conference dates. Day numbers are UTC days (no DST surprises).
  const dnum = (y, m, d) => Date.UTC(y, m - 1, d) / 864e5;
  const dOf = (D) => dnum(D.getFullYear(), D.getMonth() + 1, D.getDate());
  function termDay(spec, T) {
    const m = /^([+-]?\d+)\/(?:(\d\d)-(\d\d)|(start|end)([+-]\d+)?)$/.exec(spec || '');
    if (!m) return null;
    const y = T + +m[1];
    if (m[2]) return dnum(y, +m[2], +m[3]);
    const cd = FCR.conferenceDates(y);
    return dOf(m[4] === 'start' ? cd.start : cd.end) + (+m[5] || 0);
  }
  /** Panels inside their term on FCR.today() (?today= works): {P, at: the last step begun, on: still inside it, stage}. */
  function termPanels(steps) {
    const t = FCR.today(), now = dOf(t), y = t.getFullYear(), out = [];
    for (let P = y - 1952; P <= y - 1949; P++) {
      const T = P + 1950;
      const win = steps.map((s) => {   // a window that doesn't parse is ignored (null <= now would be true)
        if (!s.from) return null;
        const w = [termDay(s.from, T), termDay(s.to || s.from, T)];
        return w[0] == null || w[1] == null ? null : w;
      });
      const ok = win.filter(Boolean);
      if (!ok.length || now < Math.min(...ok.map((w) => w[0])) || now > Math.max(...ok.map((w) => w[1]))) continue;
      let at = -1; win.forEach((w, i) => { if (w && w[0] <= now) at = i; });
      if (at < 0) continue;
      const stage = now < dnum(T, 1, 1) ? 'delegates-elect' : now < dnum(T + 1, 1, 1) ? 'first-year delegates' : now < dnum(T + 2, 1, 1) ? 'second-year delegates' : 'past delegates';
      out.push({ P, at, on: win[at][1] >= now, stage });
    }
    return out;
  }
  function termHtml() {
    const steps = TL.delegate_term || [];
    if (!steps.length) return '';
    const here = termPanels(steps).reverse(), cyc = FCR.cycle();   // newest panel first: it is earliest in the term
    const my = +FCR.store.get('myArea', 65), par = FCR.areaParity(my);
    // the next Calendar occurrence (or the one under way) of each linked rule
    let cal = [];
    try { const C = FCR.calendar, t0 = C.todayStr(); cal = C.items({ from: t0, to: C.add(t0, 800), scope: 'everything' }); } catch (e) { cal = []; }
    const calFor = (id) => cal.find((o) => o.ruleId === id || o.id === id);
    const panelHref = (P) => (cyc.servingPanels.includes(P) ? '#/delegates/current' : P > cyc.servingPanels[1] ? '#/delegates/next' : FCR.Y(P + 1951) ? `#/delegates/${P + 1951}` : '');
    const tag = (h) => { const href = panelHref(h.P);
      return `<span class="l-here">${href ? `<a href="${href}">Panel ${h.P}</a>` : `Panel ${h.P}`} · ${esc(h.stage)}${par != null && h.P % 2 === par ? ` · Area ${my}'s panel` : ''}</span>`; };
    const where = (h) => (h.on ? esc(steps[h.at].title) : `after “${esc(steps[h.at].title)}”${steps[h.at + 1] ? `, before “${esc(steps[h.at + 1].title)}”` : ''}`);
    const rows = steps.map((s, i) => {
      const at = here.filter((h) => h.at === i), on = at.filter((h) => h.on), after = at.filter((h) => !h.on);
      const o = s.calendar ? calFor(s.calendar) : null;
      return `<li${on.length ? ' class="is-here"' : ''}><div class="l-tl-when small">${esc(s.when)}</div><strong>${esc(s.title)}</strong>${on.map(tag).join('')}
        <p class="small">${esc(s.text)} <span class="muted">(${esc(srcOf(s))})</span>${o ? ` <a href="#/calendar/${encodeURIComponent(o.key)}">${esc(s.calendar_label || 'Calendar')}: ${esc(FCR.calendar.when(o))} →</a>` : ''}</p></li>
        ${after.length ? `<li class="l-tl-gap">${after.map(tag).join('')} <span class="small muted">${where(after[0])}</span></li>` : ''}`;
    }).join('');
    // other days to preview (?today= reloads the app as of that date), around the next Conference
    const N = cyc.nextConference, cs = FCR.conferenceDates(N).start, pad = (x) => String(x).padStart(2, '0');
    const iso = (D) => `${D.getFullYear()}-${pad(D.getMonth() + 1)}-${pad(D.getDate())}`;
    const dayHref = (D) => `${location.pathname}?today=${iso(D)}#/learn/delegate`;
    const tries = [[new Date(N - 1, 11, 15), 'after the draw'], [new Date(N, 2, 1), 'pre-Conference'], [new Date(cs.getFullYear(), cs.getMonth(), cs.getDate() + 2), 'Conference week'], [new Date(N, 6, 15), 'report-backs']];
    return `<h4>A delegate's two-year term <span class="muted small">election to rotation</span></h4>
      ${here.length ? `<p class="small l-here-asof">Where the panels are on ${esc(UI.fmtDate(FCR.today()))}${FCR.asOfOverride ? ' (preview date)' : ''}:</p>
        <ul class="l-here-list small">${here.map((h) => `<li>${tag(h)} ${where(h)}</li>`).join('')}</ul>` : ''}
      <ol class="l-tl l-term" aria-label="A delegate's two-year term, step by step">${rows}</ol>
      <p class="small muted l-tl-try">The markers move with the date. See another day: ${tries.map(([D, t]) => `<a href="${esc(dayHref(D))}">${esc(UI.fmtDate(D, 'short'))}</a> (${esc(t)})`).join(' · ')}${FCR.asOfOverride ? ` · <a href="${esc(location.pathname + '#/learn/delegate')}">back to today</a>` : ''}.</p>`;
  }
  const TIMELINES = { founding: foundingHtml, delegate_term: termHtml };

  // Generated quiz decks (view-quiz.js) offered on the nodes they drill.
  const DECKS = [
    ['concepts', 'Which Concept?', (id) => pathTo(id).some((p) => p.id === 'concepts')],
    ['committees', 'Which committee does this?', (id) => id === 'conf_committees' || id === 'trustees_committees'],
  ];

  function detailHtml(n) {
    if (!n) return UI.empty('Pick a part of the structure in the tree.');
    const crumbs = pathTo(n.id).map((p) => `<a href="#/learn/${p.id}">${esc(p.title)}</a>`).join(' › ');
    const ch = kids[n.id] || [];
    const links = (n.app_links || []).filter((k) => LINKS[k]);
    const nq = quizCount(n.id);
    const decks = DECKS.filter((d) => d[2](n.id));
    const see = (n.see_also || []).filter((s) => byId[s.node]);
    return `<div class="small muted l-crumbs">${crumbs}</div>
      <h2 class="l-title">${esc(n.title)} ${n.role_label ? `<span class="badge">${esc(n.role_label)}</span>` : ''}</h2>
      <p>${esc(n.summary)}</p>
      ${see.length ? `<div class="small l-see">${see.map((s) => `<div>${esc(s.lead || 'See also:')} <a href="#/learn/${esc(s.node)}">${esc(byId[s.node].title)} →</a>${s.note ? ` <span class="muted">${esc(s.note)}</span>` : ''}</div>`).join('')}</div>` : ''}
      <dl class="kv">${n.chosen_by ? `<dt>Chosen by</dt><dd>${esc(n.chosen_by)}</dd>` : ''}${n.term ? `<dt>Term</dt><dd>${esc(n.term)}</dd>` : ''}${n.how_many ? `<dt>How many</dt><dd>${esc(n.how_many)}</dd>` : ''}</dl>
      ${list('Qualifications', n.qualifications)}${list('Duties', n.duties)}${specialHtml(n)}${TIMELINES[n.timeline] ? TIMELINES[n.timeline]() : ''}${list('Good to know', n.facts)}
      ${(n.quotes || []).length ? `<h4>${n.quotes.some((q) => q.source) ? 'In their words' : 'From the Service Manual'}</h4>${n.quotes.map((q) => `<blockquote class="small l-quote">“${esc(q.text)}”<span class="muted"> — ${cite(q)}</span></blockquote>`).join('')}` : ''}
      ${links.length || nq || decks.length ? `<div class="flex l-actions">${nq ? `<a class="chip accent" href="#/quiz/node/${n.id}">Quiz me on this · ${nq} question${nq === 1 ? '' : 's'}</a>` : ''}${decks.map((d) => `<a class="chip accent" href="#/quiz/${d[0]}">Quiz: ${esc(d[1])} →</a>`).join('')}${links.map((k) => `<a class="chip" href="${LINKS[k][1]}">See it in ${LINKS[k][0]} →</a>`).join('')}</div>` : ''}
      ${ch.length ? `<h4 class="l-inside">Inside ${esc(n.title)}</h4><div class="flex">${ch.map((c) => `<a class="chip" href="#/learn/${c.id}">${esc(c.title)}</a>`).join('')}</div>` : ''}`;
  }

  // ---------- glossary ----------
  const gl = LEARN.glossary.slice().sort((a, b) => fold(a.term).localeCompare(fold(b.term)));
  const gslug = (t) => 'g-' + fold(t).replace(/ /g, '-');
  const gNames = (g) => {
    const t = g.term, base = t.replace(/\s*\(.*?\)\s*/g, ' ').trim(), par = (t.match(/\(([^)]*)\)/) || [])[1];
    return [t, base, par].filter(Boolean).map(fold);
  };
  const GI = gl.map((g) => ({ g, names: gNames(g), def: fold(g.definition), node: g.node && byId[g.node] ? g.node : null }));
  // Glossary terms that name a tree node link to it (explicit `node`, else a title/role-label match).
  GI.forEach((x) => {
    if (x.node) return;
    const hit = LEARN.nodes.find((n) => x.names.some((nm) => nm && (nm === fold(n.role_label) || nm === fold(n.title.replace(/\s*\(.*?\)\s*/g, ' ')))));
    if (hit) x.node = hit.id;
  });
  /** Ranked filter: exact term > term prefix > word start in term > inside term > definition word start > inside definition. */
  function rankGloss(q) {
    const f = fold(q), c = f.replace(/ /g, '');
    if (!f) return GI.map((x) => x);
    const short = c.length < 3;
    return GI.map((x) => {
      const cn = x.names.map((n) => n.replace(/ /g, ''));
      let s = 0;
      if (x.names.includes(f) || cn.includes(c)) s = 100;
      else if (x.names.some((n) => n.startsWith(f))) s = 80;
      else if (x.names.some((n) => (' ' + n).includes(' ' + f))) s = 60;
      else if (!short && cn.some((n) => n.includes(c))) s = 40;
      else if (!short && (' ' + x.def).includes(' ' + f)) s = 20;
      else if (!short && x.def.replace(/ /g, '').includes(c)) s = 10;
      return Object.assign({ s }, x);
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.names[0].length - b.names[0].length);
  }
  const gItem = (x, hit) => `<div class="gl-item${hit ? ' hit' : ''}" id="${gslug(x.g.term)}"><dt>${esc(x.g.term)}${x.g.region ? ` <span class="badge">${esc(FCR.regionName(x.g.region))}</span>` : ''}</dt>
    <dd>${esc(x.g.definition)} <span class="muted small">${x.g.source ? esc(x.g.source) + (x.g.page && !/p\. ?\d/.test(x.g.source) ? ', p. ' + esc(x.g.page) : '') : x.g.page ? 'Service Manual p. ' + esc(x.g.page) : ''}</span>${x.node ? ` <a class="small" href="#/learn/${x.node}">Learn: ${esc(byId[x.node].title)} →</a>` : ''}</dd></div>`;
  const letterOf = (x) => { const ch = x.names[0].charAt(0).toUpperCase(); return /[A-Z]/.test(ch) ? ch : '#'; };

  /** Sticky offsets: the "On this page" bar sits under the top bar (+ the tab strip when that is sticky); CSS reads --l-stick. */
  function setStick(el) {
    const top = document.querySelector('.topbar'), tabs = document.getElementById('tabs');
    const off = (top ? top.offsetHeight : 0) + (tabs && getComputedStyle(tabs).position === 'sticky' ? tabs.offsetHeight : 0);
    el.style.setProperty('--l-stick', off + 'px');
  }

  let lastKey = null; // the node/section/term the page last scrolled to (a theme toggle re-renders without moving the page)
  V.learn = function (el, args) {
    args = args || [];
    const mode = args[0] === 'glossary' ? 'glossary' : args[0] === 'rules' ? 'rules' : null;
    const glossQ = mode === 'glossary' ? (() => { try { return decodeURIComponent(args[1] || ''); } catch (e) { return args[1] || ''; } })() : '';
    const asked = !mode && args[0] ? args[0] : null;
    const sel = asked && byId[asked] ? asked : (roots[0] && roots[0].id) || 'fellowship';
    const open = new Set(FCR.store.get('learnOpen', ['fellowship', 'conference', 'gsb', 'conf_committees']));
    pathTo(sel).forEach((p) => open.add(p.id));
    const phone = window.matchMedia && window.matchMedia('(max-width: 800px)').matches;
    const rules = (FCR.RAW.rules && FCR.RAW.rules.rules) || [];
    const letters = [...new Set(GI.map(letterOf))];
    el.innerHTML = `
      <div class="page-head"><div><h1>Learn the structure</h1>
        <p>The U.S./Canada general service structure from the group to the General Service Office, built from <em>The A.A. Service Manual 2026–2028</em> (printed page numbers) and, where marked, the Final Conference Reports. Pick any part to see who fills it, how they are chosen, for how long, and where to see the real people in this app.</p></div></div>
      <nav class="l-toc" aria-label="On this page"><span class="small muted">On this page</span>
        <button class="chip" data-go="l-structure">Structure</button><button class="chip" data-go="l-rules">Rules</button><button class="chip" data-go="l-glossary">Glossary</button>
        <a class="chip" href="#/calendar">Calendar ↗</a><a class="chip" href="#/quiz">Quiz ↗</a></nav>
      <section id="l-structure" class="l-sec">
      <div class="card"><h3>The inverted triangle <span class="muted small">pick a level</span></h3>
        <div class="triangle">${[['group', 'A.A. groups & GSRs', 100], ['district', 'Districts & DCMs', 88], ['area_assembly', 'Area assemblies — 93 areas', 76], ['delegate', 'Area delegates — two panels', 64],
          ['conference', 'General Service Conference (~135 voting members)', 52], ['gsb', 'General Service Board (21–22 trustees)', 40], ['operating_corps', 'AAWS · AA Grapevine', 28], ['gso', 'GSO · Grapevine office', 18]]
          .map(([id, t, w]) => `<a href="#/learn/${id}" class="${pathTo(sel).some((p) => p.id === id) ? 'on' : ''}" style="width:${phone ? Math.round(44 + w * 0.56) : w}%">${esc(t)}</a>`).join('')}</div>
        <p class="small ink2">Authority flows upward from the groups (Concepts I–II); the Conference is the active voice and effective conscience of A.A. as a whole.</p></div>
      <div class="learn-grid">
        <details class="card ltree-wrap" id="l-treebox"${phone && asked ? '' : ' open'}><summary><strong>Service tree</strong>${phone && asked && byId[sel] ? ` <span class="muted small">· open to pick another part</span>` : ''}</summary>
          <div class="flex l-treebar"><span class="spacer"></span><button class="btn" id="l-all">expand all</button><button class="btn" id="l-none">collapse</button></div><div id="l-tree"></div></details>
        <div class="card" id="l-detail" tabindex="-1">${asked && !byId[asked] ? `<div class="callout warn small">No part of the structure is called “${esc(asked)}”.</div>` : ''}${detailHtml(byId[sel])}</div>
      </div>
      <h2 class="section-title">What happens when</h2>
      <div class="card"><div id="l-coming"></div><div class="flex" style="margin-top:8px"><a class="chip accent" href="#/calendar">Open the Calendar: the service year, month by month →</a></div>
        ${(L0.cycle || []).length ? `<details class="l-more"><summary>The service year in the Service Manual <span class="muted small">${L0.cycle.length}</span></summary><ul class="small">${L0.cycle.map((c) => `<li><strong>${esc(c.when)}</strong>: ${esc(c.what)}${c.page ? ` <span class="muted">(p. ${esc(c.page)})</span>` : ''}</li>`).join('')}</ul></details>` : ''}</div>
      </section>
      <section id="l-rules" class="l-sec"><h2 class="section-title">Rules that drive rotation</h2>
      ${rules.map((r) => `<details ${r.topic === 'committee_assignment' && !phone ? 'open' : ''}><summary>${esc(TOPIC[r.topic] || r.topic)}</summary>
        <div class="rule"><p class="small">${esc(r.summary)}</p>${(r.quotes || []).map((q) => `<blockquote>“${esc(q.text)}”<cite>${esc(q.source || '')}${q.page ? ', p. ' + esc(q.page) : ''}</cite></blockquote>`).join('')}</div></details>`).join('') || UI.empty('Rules not loaded.')}
      ${LEARN.rules.length ? `<details class="l-more"><summary>More rules from the Service Manual <span class="muted small">${LEARN.rules.length}</span></summary>
        <div class="l-rulelist">${LEARN.rules.map((r) => `<div class="rule"><strong class="small">${esc(r.topic)}</strong><p class="small">${esc(r.summary)}</p>${(r.quotes || []).map((q) => `<blockquote>“${esc(q.text)}”<cite>${q.source ? esc(q.source) + ', ' : ''}p. ${esc(q.page)}</cite></blockquote>`).join('')}</div>`).join('')}</div></details>` : ''}
      </section>
      <section id="l-glossary" class="l-sec"><h2 class="section-title">Glossary <span class="muted small">${gl.length} terms</span></h2>
      <div class="gl-tools"><input id="l-gq" type="search" placeholder="Filter the glossary (GSR, hat, 459…)" aria-label="Filter the glossary" autocomplete="off">
        <div class="gl-az" role="navigation" aria-label="Glossary letters">${'#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => letters.includes(c) ? `<button data-l="${c}" aria-label="Terms starting with ${c === '#' ? 'a number' : c}">${c}</button>` : `<span aria-hidden="true">${c}</span>`).join('')}</div></div>
      <div id="l-gcount" class="small muted" role="status" aria-live="polite"></div>
      <div id="l-gloss"></div></section>`;

    setStick(el);

    // tree
    const treeBox = el.querySelector('#l-treebox');
    const drawTree = () => { el.querySelector('#l-tree').innerHTML = roots.length ? treeHtml(roots, sel, open, 0) : UI.empty('Learning content not loaded.'); };
    drawTree();
    el.querySelector('#l-tree').addEventListener('click', (e) => {
      const b = e.target.closest('.ltog[data-t]'); if (!b) return;
      const id = b.dataset.t; if (open.has(id)) open.delete(id); else open.add(id); FCR.store.set('learnOpen', [...open]); drawTree();
      const again = el.querySelector(`.ltog[data-t="${id}"]`); if (again) again.focus();
    });
    el.querySelector('#l-all').addEventListener('click', () => { LEARN.nodes.forEach((n) => open.add(n.id)); FCR.store.set('learnOpen', [...open]); drawTree(); });
    el.querySelector('#l-none').addEventListener('click', () => { open.clear(); pathTo(sel).forEach((p) => open.add(p.id)); FCR.store.set('learnOpen', [...open]); drawTree(); });
    // keep the selected node visible inside the (desktop) scrolling tree
    const showSel = () => {
      const on = el.querySelector('.lnode.on'); if (!on || !treeBox) return;
      if (treeBox.scrollHeight > treeBox.clientHeight + 4) treeBox.scrollTop += on.getBoundingClientRect().top - treeBox.getBoundingClientRect().top - treeBox.clientHeight / 3;
    };

    // "what happens when": the Calendar page's shared widget, when it is available
    const box = el.querySelector('#l-coming');
    try { if (UI.comingUp) UI.comingUp(box, { limit: 5 }); } catch (e) { box.innerHTML = ''; }
    if (!box.innerHTML.trim()) box.innerHTML = '<p class="small">The yearly cycle, with dates: proposed agenda items due <strong>September 30</strong> · October feedback call · Oct/Nov board weekend (committee chairs attend) · <strong>December</strong> committee draw by lot · background material in mid/late <strong>February</strong> · the <strong>April</strong> Conference (77th: April 11–17, 2027) · Final Report in the summer.</p>';

    // "On this page" chips scroll within the page (a hash link would re-route)
    el.querySelector('.l-toc').addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]'); if (!b) return;
      const t = el.querySelector('#' + b.dataset.go); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });

    // glossary
    const gBox = el.querySelector('#l-gloss'), gCount = el.querySelector('#l-gcount'), gq = el.querySelector('#l-gq');
    const drawGloss = (q, hitId) => {
      const r = rankGloss(q);
      if (!fold(q)) {
        const by = {}; r.forEach((x) => (by[letterOf(x)] = by[letterOf(x)] || []).push(x));
        const keys = Object.keys(by).sort((a, b) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)));
        const lid = (L) => 'gl-' + (L === '#' ? 'num' : L);
        // phones: one collapsed group per letter (the A-Z bar and deep links open them); desktop: the full list
        gBox.innerHTML = phone
          ? keys.map((L) => { const hit = by[L].some((x) => gslug(x.g.term) === hitId); return `<details class="gl-group" id="${lid(L)}"${hit ? ' open' : ''}><summary><span class="gl-letter-s">${L}</span> <span class="muted small">${by[L].length} term${by[L].length === 1 ? '' : 's'}: ${esc(by[L].slice(0, 3).map((x) => x.g.term.replace(/\s*\(.*?\)/g, '')).join(', '))}${by[L].length > 3 ? '…' : ''}</span></summary><dl class="gl-list">${by[L].map((x) => gItem(x, gslug(x.g.term) === hitId)).join('')}</dl></details>`; }).join('')
          : keys.map((L) => `<h3 class="gl-letter" id="${lid(L)}">${L}</h3><dl class="gl-list">${by[L].map((x) => gItem(x, gslug(x.g.term) === hitId)).join('')}</dl>`).join('');
        gCount.textContent = '';
      } else {
        gBox.innerHTML = r.length ? `<dl class="gl-list">${r.map((x) => gItem(x, gslug(x.g.term) === hitId)).join('')}</dl>` : UI.empty('No matching terms. Try a shorter word, or search everything at the top of the page.');
        gCount.textContent = r.length ? `${r.length} matching term${r.length === 1 ? '' : 's'}, best first` : '';
      }
    };
    let hitId = null;
    if (glossQ) { const best = rankGloss(glossQ)[0]; if (best && best.s >= 60) hitId = gslug(best.g.term); else gq.value = glossQ; }
    drawGloss(gq.value, hitId);
    gq.addEventListener('input', () => drawGloss(gq.value));
    gq.addEventListener('keydown', (e) => { if (e.key === 'Escape') { gq.value = ''; drawGloss(''); } });
    el.querySelector('.gl-az').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-l]'); if (!b) return;
      if (gq.value) { gq.value = ''; drawGloss(''); }
      const t = el.querySelector('#gl-' + (b.dataset.l === '#' ? 'num' : b.dataset.l)); if (!t) return;
      if (t.tagName === 'DETAILS') t.open = true;
      t.scrollIntoView({ block: 'start' });
    });

    // deep links: scroll to the node / section / term (scroll-margin keeps it clear of the sticky header)
    const key = (mode || 'node') + '|' + (mode === 'glossary' ? glossQ : sel);
    const target = mode === 'glossary' ? (hitId && el.querySelector('#' + hitId)) || el.querySelector('#l-glossary')
      : mode === 'rules' ? el.querySelector('#l-rules') : asked ? el.querySelector('#l-detail') : null;
    const go = () => {
      showSel();
      if (!target) return;
      if (lastKey !== key || window.scrollY < 10) { target.scrollIntoView({ block: 'start' }); if (asked) target.focus({ preventScroll: true }); }
    };
    if (target || asked) requestAnimationFrame(go); else showSel();
    lastKey = key;
  };
  window.addEventListener('resize', () => { const m = document.getElementById('main'); if (m && m.querySelector('.l-toc')) setStick(m); });

  FCR.learnQuiz = LEARN.quiz;
  /** Tree helpers for other views (quiz node mode): FCR.learnTree.subtree(id) -> [ids], .node(id) -> node|undefined. */
  FCR.learnTree = { subtree, node: (id) => byId[id], pathTo: (id) => pathTo(id).map((n) => n.id) };
})();
