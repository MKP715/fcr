/* Global search regression test (FCR.search in assets/js/search.js).
   Usage: node tools/dev/search_test.js [--fails] [--all] [--json <out.json>] [--only <category prefix>]
   Loads data/fcr-data.js and the app's classic scripts in Node behind a minimal DOM stub, then runs:
     - the S1 audit's 201 realistic queries (people, nicknames, accents, elects, roles, desks, areas, regions, committees,
       cities, panels, Learn terms, junk), viewed as of 2026-10-20;
     - the search/router task's queries (word starts, whole numbers, acronyms, groups, Predict deep links, calendar,
       Conferences, pages, proposed agenda items), also as of 2026-10-20;
     - a few date-dependent checks as of 2027-03-01, 2027-04-14, 2027-04-18 and 2027-09-15 (?today=).
   A query is a string, or {q, expand} to run it with that group expanded ("Show N more").
   Each query has expectations on the flattened result list (display order). Prints the failing queries (every query
   with --all) and a per-category table; exits 1 when fewer than 98% of the queries pass. */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');

// ---------- loading the app in Node ----------
function loadApp(today) {
  const noop = () => {};
  const el = () => ({ addEventListener: noop, removeEventListener: noop, style: { setProperty: noop }, setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, querySelectorAll: () => [], querySelector: () => null, appendChild: noop, textContent: '', innerHTML: '' });
  const ctx = {
    location: { search: today ? '?today=' + today : '', hash: '#/today' }, matchMedia: () => ({ matches: false, addEventListener: noop }),
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop, requestAnimationFrame: (f) => setTimeout(f, 0), innerWidth: 1400, innerHeight: 1000,
    document: { getElementById: el, querySelector: el, querySelectorAll: () => [], addEventListener: noop, documentElement: el(), body: el(), createElement: el },
    localStorage: { getItem: () => null, setItem: noop }, sessionStorage: { getItem: () => null, setItem: noop }, navigator: { userAgent: 'node' },
    console, setTimeout, clearTimeout, getComputedStyle: () => ({ getPropertyValue: () => '' }), history: { state: null },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const run = (file, required) => {
    try { vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file }); }
    catch (e) { if (required) throw e; console.warn(`warning: ${file} did not load in Node (${e.message}); its part of the index is skipped`); }
  };
  run('data/fcr-data.js', true);
  run('assets/js/core.js', true);
  run('assets/js/predict.js');
  vm.runInContext('window.FCR.views = window.FCR.views || {}; window.FCR.ui = window.FCR.ui || {};', ctx);
  run('assets/js/view-learn.js');
  run('assets/js/view-calendar.js');
  run('assets/js/search.js', true);
  return ctx.FCR;
}

// ---------- expectations ----------
const C = (c) => '#/committees/2026/' + c;
const A = (n) => '#/area/' + n;
const H = (href, n) => ({ k: 'href', href, n: n || 5 });          // a result with exactly this href in the top n
const HR = (re, n) => ({ k: 'hrefre', re, n: n || 5 });            // a result whose href (or title) matches re in the top n
const T = (re, n) => ({ k: 't', re, n: n || 5 });                  // a result whose title matches re in the top n
const TD = (re, n) => ({ k: 'td', re, n: n || 5 });                // a result whose title + description matches re in the top n
const G = (g) => ({ k: 'group', g });                              // the first group is g
const NONE = { k: 'none' };                                        // no results at all
const NOHREF = (href) => ({ k: 'nohref', href });                  // must not offer this (dead) link
const NOT = (re, n) => ({ k: 'nott', re, n: n || 1e9 });           // no result title in the top n matches re
const MAXT = (re, max) => ({ k: 'maxt', re, max });                // at most `max` results whose title matches (dedupe)
const MORE0 = (g) => ({ k: 'more0', g });                          // group g is listed in full (no "Show N more" row left)
const LEARN = /^#\/learn\//;

// S1 audit (2026-10-20): 201 queries with their "ideal" expectations, kept verbatim.
const S1 = [
  // ---- current delegates (2026 roster) ----
  ['delegate-current', 'Sarah P.', H(A(65), 1), T(/^Sarah P\./, 1)],
  ['delegate-current', 'sarah', T(/^Sarah P\./, 5)],
  ['delegate-current', 'Lisa C.-D.', T(/^Lisa C\.-D\./, 1)],
  ['delegate-current', 'lisa c-d', T(/^Lisa C\.-D\./, 3)],
  ['delegate-current', 'Lisa CD', T(/^Lisa C\.-D\./, 3)],
  ['delegate-current', 'Jessie W.', T(/Jessica \(Jessie\) W\./, 3)],
  ['delegate-current', 'Jean-Yves', T(/^Jean-Yves M\./, 1)],
  ['delegate-current', 'jean yves', T(/^Jean-Yves M\./, 3)],
  ['delegate-current', 'Al M.', T(/^Allen \(Al\) M\./, 5)],
  ['delegate-current', 'Allen M', T(/^Allen \(Al\) M\./, 3)],
  ['delegate-current', 'Chitra', T(/^Chitra S\./, 1)],
  ['delegate-current', 'Jocelyne', T(/^Jocelyne C\./, 1)],
  ['delegate-current', 'Brian B.', TD(/Area 66/, 3)],
  ['delegate-current', 'Jay T.', TD(/Area 27/, 3)],
  // ---- accents / punctuation ----
  ['accent', 'Céline', T(/^Céline L\./, 1)],
  ['accent', 'celine', T(/^Céline L\./, 1)],
  ['accent', 'Andre D', T(/^André D\./, 1)],
  ['accent', 'Benoit', T(/^Benoît B\./, 1)],
  ['accent', 'Jean-Noel', T(/^Jean-Noël L\./, 1)],
  ['accent', 'Noël', T(/^Jean-Noël L\./, 3)],
  ['accent', 'José', { k: 'noerror' }],
  // ---- nicknames ----
  ['nickname', 'Jimmy D.', T(/Jimmy/, 1), MAXT(/Jimmy/, 1)],
  ['nickname', 'James D.', T(/Jimmy/, 3)],
  ['nickname', 'Jim D', T(/Jimmy/, 3)],
  ['nickname', 'Sherry S', T(/^Cheryl \(Sherry\) S\./, 1)],
  ['nickname', 'Cheryl S.', T(/^Cheryl \(Sherry\) S\./, 3)],
  ['nickname', 'Terry B', T(/^Terrance/, 3)],
  ['nickname', 'Nikki O', T(/Nikki\)? O\./, 1)],
  ['nickname', 'Bob W', TD(/general manager/i, 3)],
  // ---- delegate-elects (Panel 77, panel_elects.json) ----
  ['elect', 'Brandy', T(/^Brandy H\./, 1), H(A(65), 1)],
  ['elect', 'Brandy H.', T(/^Brandy H\./, 1)],
  ['elect', 'Donna W.', TD(/Area 15/, 3)],
  ['elect', 'Lupita', T(/^Lupita Y\./, 1)],
  ['elect', 'Liza C', T(/^Liza C\./, 1)],
  ['elect', 'Marcia H', T(/^Marcia H\./, 1)],
  ['elect', 'Derek S', T(/^Derek S\./, 3)],
  ['elect', 'Tommy O', T(/^Tommy O\./, 3)],
  ['elect', 'Jessica W.', TD(/Area 40/, 5)],
  ['elect', 'Bella', T(/^Bella L\./, 1), H(A(67), 1)],
  ['elect', 'Bella L.', T(/^Bella L\./, 1)],
  ['elect', 'Lisa I', T(/^Lisa I\./, 1), H(A(42), 1)],
  // ---- past delegates incl. alternates / mid-term names ----
  ['delegate-past', 'Gerry W.', TD(/Area 82/, 3)],
  ['delegate-past', 'Kimbrough', T(/^Kimbrough P\./, 1)],
  ['delegate-past', 'Anne B.', TD(/Area 82/, 5)],
  ['delegate-past', 'Teresa J.', TD(/Southwest regional trustee/, 2), TD(/Panel 68/, 3)],
  ['delegate-past', 'Pete B', TD(/Area 59/, 3)],
  ['delegate-past', 'Candice C.', TD(/Pacific regional trustee/i, 3)],
  ['delegate-past', 'Grace F.', TD(/AAWS/, 3)],
  ['delegate-past', 'Rainer L.', TD(/GSO staff/i, 3), TD(/Panel 71/, 3)],
  // ---- trustees by name ----
  ['trustee', 'Scott H.', TD(/General Service Board chair|GSB chair/i, 1)],
  ['trustee', 'Kerry M.', TD(/Class A/, 1)],
  ['trustee', 'Molly O.', T(/^Molly Ann O\./, 3)],
  ['trustee', 'Molly Ann O.', T(/^Molly Ann O\./, 1)],
  ['trustee', 'Teddy BW', T(/^Teddy B\.-W\./, 1)],
  ['trustee', 'Teddy B.-W.', T(/^Teddy B\.-W\./, 1)],
  ['trustee', 'Charles H', TD(/West Central/, 3)],
  ['trustee', 'Tom I', T(/^Thomas \(Tom\) I\./, 1)],
  ['trustee', 'Gail P', TD(/Western Canada/, 1)],
  ['trustee', 'Ken T', TD(/Northeast regional/i, 3)],
  ['trustee', 'Tim M.', TD(/Class A/, 3)],
  ['trustee', 'Jeff S.', TD(/Eastern Canada regional/i, 3)],
  ['trustee', 'Daniel S.', TD(/Grapevine/, 3)],
  ['trustee', 'Clint M.', TD(/general service trustee|AAWS/i, 3)],
  // ---- role words ----
  ['role', 'class a', TD(/Class A/, 3)],
  ['role', 'class a trustee', TD(/Class A/, 3)],
  ['role', 'regional trustee', TD(/regional trustee/i, 3)],
  ['role', 'southwest trustee', T(/^Teresa J\./, 3)],
  ['role', 'southwest regional trustee', T(/^Teresa J\./, 3)],
  ['role', 'trustee-at-large', T(/^(Jennifer B|Robert L)\./, 3)],
  ['role', 'trustee at large', T(/^(Jennifer B|Robert L)\./, 3)],
  ['role', 'general service trustee', TD(/general service trustee/i, 3)],
  ['role', 'chair', T(/^Scott H\./, 5)],
  ['role', 'gsb chair', T(/^Scott H\./, 3)],
  ['role', 'treasurer', TD(/treasurer/i, 3)],
  ['role', 'general manager', T(/^Bob W\.|^Robert( \(Bob\))? W\./, 3)],   // titles now use the canonical alias spelling
  ['role', 'publisher', T(/^(Christopher \(Chris\)|Chris) C\./, 3)],   // canonical alias spelling
  ['role', 'editor', T(/^(Jon W|Paola M)\./, 3)],
  ['role', 'staff coordinator', T(/^Racy J\./, 3)],
  ['role', 'nontrustee director', TD(/nontrustee director/i, 3)],
  ['role', 'AAWS chair', T(/^Ken T\./, 3)],
  ['role', 'Grapevine chair', T(/^David S\./, 3)],
  // ---- nontrustee directors ----
  ['director', 'Julie C.', TD(/AAWS/, 1)],
  ['director', 'Matt K', TD(/AAWS/, 1)],
  ['director', 'Fredy M', TD(/Grapevine/, 1)],
  ['director', 'Nicole O', T(/Nikki/, 1)],
  // ---- people listed only in aaws_directors / grapevine_directors / gsb_officers ----
  ['board-only', 'Chris C.', TD(/publisher/i, 3)],
  ['board-only', 'Robert W.', TD(/general manager/i, 3)],
  ['board-only', 'Paul K.', TD(/assistant treasurer|financial/i, 3)],
  ['board-only', 'Gregory T.', TD(/general manager/i, 3)],
  ['board-only', 'Stephanie L.', T(/^Stephanie L\./, 3)],
  // ---- appointed committee members / consultants ----
  ['acm', 'Gerry C.', TD(/appointed|ACM/i, 3)],
  ['acm', 'Tom P.', TD(/appointed|ACM/i, 3)],
  ['acm', 'Cesar F.', T(/^Cesar F\./, 1)],
  ['acm', 'Manisha', T(/^Manisha G\./, 1)],
  ['acm', 'Kirk H', T(/^Kirk H\./, 3)],
  ['acm', 'appointed committee member', HR(/^#\/learn\/acm$/, 5)],
  ['acm', 'ACM', HR(/^#\/learn\/acm$/, 5)],
  // ---- GSO staff by name ----
  ['staff', 'Eileen A.', TD(/GSO staff/i, 1)],
  ['staff', 'Rainer', TD(/GSO staff/i, 3)],
  ['staff', 'Misha', TD(/GSO staff/i, 1)],
  ['staff', 'Kimberly Jean L.', T(/^Kimberly Jean L\./, 1)],
  ['staff', 'Michelle M.', TD(/archiv/i, 3)],
  ['staff', 'Zenny', T(/Zenaida|Zenny/, 3)],
  ['staff', 'Dina F.', T(/^Dina F\./, 1)],
  ['staff', 'Sandra W.', TD(/Staff Services/i, 3)],
  // ---- staff by desk / assignment ----
  ['desk', 'literature desk', T(/^Misha Q\./, 3)],
  ['desk', 'conference coordinator', T(/^Rainer L\./, 3)],
  ['desk', 'corrections desk', T(/^Kacie N\./, 3)],
  ['desk', 'public information desk', T(/^Kelley C\./, 3)],
  ['desk', 'cpc desk', T(/^Karina C\./, 3)],
  ['desk', 'group services', T(/^Irene D\./, 3)],
  ['desk', 'regional forums', T(/^Diana L\./, 5)],
  ['desk', 'remote communities', T(/^Michael R\./, 3)],
  // ---- Grapevine / La Viña staff ----
  ['gvstaff', 'Jon W', TD(/editor/i, 1)],
  ['gvstaff', 'Paola', TD(/La Viña/, 1)],
  ['gvstaff', 'la viña editor', T(/^Paola M\./, 3)],
  // ---- area numbers ----
  ['area-num', '65', H(A(65), 1)],
  ['area-num', 'A65', H(A(65), 1)],
  ['area-num', 'a65', H(A(65), 1)],
  ['area-num', 'area 65', H(A(65), 1)],
  ['area-num', 'area65', H(A(65), 1)],
  ['area-num', '#65', H(A(65), 1)],
  ['area-num', 'Area #65', H(A(65), 1)],
  ['area-num', '6', H(A(6), 1)],
  ['area-num', '065', H(A(65), 1)],
  ['area-num', '94', NOHREF(A(94))],
  // ---- area names / abbreviations ----
  ['area-name', 'NETA', H(A(65), 1)],
  ['area-name', 'neta 65', H(A(65), 1)],
  ['area-name', 'north east texas', H(A(65), 1)],
  ['area-name', 'Northeast Texas', H(A(65), 1)],
  ['area-name', 'NE Texas', H(A(65), 1)],
  ['area-name', 'Texas', H(A(65), 4), H(A(66), 4), H(A(67), 4), H(A(68), 4)],
  ['area-name', 'TX', H(A(65), 4), H(A(66), 4), H(A(67), 4), H(A(68), 4)],
  ['area-name', 'Ontario', H(A(83), 4), H(A(84), 4), H(A(85), 4), H(A(86), 4)],
  ['area-name', 'Quebec', H(A(87), 4), H(A(88), 4), H(A(89), 4), H(A(90), 4)],
  ['area-name', 'Québec', H(A(87), 4), H(A(88), 4), H(A(89), 4), H(A(90), 4)],
  ['area-name', 'SENY', H(A(49), 1)],
  ['area-name', 'CNCA', H(A(6), 1)],
  ['area-name', 'WAGSA', H(A(13), 1)],
  ['area-name', 'SETA', H(A(67), 1)],
  ['area-name', 'Washington State East', H(A(92), 1)],
  ['area-name', 'Bahamas', H(A(15), 1)],
  ['area-name', 'Guantanamo', H(A(71), 1)],
  ['area-name', 'BC', H(A(79), 1)],
  ['area-name', 'Chicago', H(A(19), 1)],
  // ---- regions ----
  ['region', 'southwest', T(/^Southwest region/i, 3)],
  ['region', 'southwest region', T(/^Southwest region/i, 1)],
  ['region', 'Western Canada', T(/^Western Canada region/i, 3)],
  ['region', 'WCAN', T(/^Western Canada region/i, 1)],
  ['region', 'Pacific', T(/^Pacific region/i, 3)],
  ['region', 'east central', T(/^East Central region/i, 3)],
  // ---- committees ----
  ['committee', 'CPC', H(C('CPC'), 1)],
  ['committee', 'PI', H(C('PI'), 1)],
  ['committee', 'T&A', H(C('TREATMENT'), 1)],
  ['committee', 'IC/RF', H(C('ICRF'), 1)],
  ['committee', 'ICRF', H(C('ICRF'), 1)],
  ['committee', 'La Viña', H(C('GRAPEVINE'), 3)],
  ['committee', 'La Vina', H(C('GRAPEVINE'), 3)],
  ['committee', 'Vina', H(C('GRAPEVINE'), 3)],
  ['committee', 'policy admissions', H(C('POLICY'), 1)],
  ['committee', 'policy/admissions', H(C('POLICY'), 1)],
  ['committee', 'report & charter', H(C('REPORT'), 1)],
  ['committee', 'R&C', H(C('REPORT'), 1)],
  ['committee', 'report and charter', H(C('REPORT'), 1)],
  ['committee', 'trustees committee', H(C('TRUSTEES'), 3)],
  ['committee', 'accessibilities', H(C('TREATMENT'), 3)],
  ['committee', 'international conventions', H(C('ICRF'), 1)],
  ['committee', 'finance', H(C('FINANCE'), 3)],
  ['committee', 'special needs', NOHREF(C('SPECIAL_NEEDS'))],
  ['committee', 'other', NOHREF(C('OTHER'))],
  // ---- cities ----
  ['city', 'Carrollton', T(/^Sarah P\./, 1)],
  ['city', 'Levis', T(/^Jocelyne C\./, 3)],
  ['city', 'San Antonio', T(/^Amanda B\./, 3)],
  ['city', 'Montreal', T(/^André D\./, 3)],
  ['city', 'Dallas', H(A(65), 3)],
  // ---- panels ----
  ['panel', 'panel 77', T(/Panel 77/, 1)],
  ['panel', 'P77', T(/Panel 77/, 1)],
  ['panel', 'P76', T(/Panel 76/, 1)],
  ['panel', 'panel 75', T(/Panel 75/, 1)],
  // ---- Service Manual concepts ----
  ['learn', 'GSR', H('#/learn/gsr', 1)],
  ['learn', 'DCM', H('#/learn/dcm', 1)],
  ['learn', 'third legacy', H('#/learn/third_legacy', 3)],
  ['learn', 'inverted triangle', HR(LEARN, 3)],
  ['learn', 'upside-down triangle', HR(LEARN, 3)],
  ['learn', 'advisory action', H('#/learn/advisory_actions', 3)],
  ['learn', 'concept 12', HR(/^#\/learn\/(warranties|concepts)/, 3)],
  ['learn', 'concept xii', HR(/^#\/learn\/(warranties|concepts)/, 3)],
  ['learn', 'Concept I', H('#/learn/concept_authority', 1)],
  ['learn', 'Concept II', H('#/learn/concept_authority', 1)],
  ['learn', 'Concept 1', H('#/learn/concept_authority', 1)],
  ['learn', 'Concept V', H('#/learn/right_of_appeal', 1)],
  ['learn', 'Concept VII', H('#/learn/conference_and_trustees', 2)],
  ['learn', 'Concept VIII', HR(/^#\/learn\/(operating_corps|conference_and_trustees)$/, 2)],
  ['learn', 'group listing', H('#/learn/group_listing', 3)],
  ['learn', 'St. Louis Resolution', H('#/learn/resolution_1955', 3)],
  ['learn', 'Box 4-5-9', HR(LEARN, 3)],
  ['learn', '459', HR(LEARN, 3)],
  ['learn', 'regional forum', HR(/^#\/learn\/|ICRF/, 3)],
  ['learn', 'rotation', H('#/learn/rotation', 3)],
  ['learn', 'substantial unanimity', HR(LEARN, 3)],
  ['learn', 'delegate', H('#/learn/delegate', 5)],
  // ---- junk ----
  ['junk', '<script>', NONE],
  ['junk', 'a', NONE],
  ['junk', 'zz', NONE],
  ['junk', '   ', NONE],
  ['junk', '%', NONE],
  ['junk', '(', NONE],
  ['junk', '\\', NONE],
  ['junk', '*', NONE],
  ['junk', 'a.a.', { k: 'noerror' }],
  ['junk', '65)', { k: 'noerror' }],
];

// Search/router task (2026-10-20): word starts, whole numbers, acronyms, grouping, deep links, calendar, pages.
const TASK = [
  ['task-word-start', 'pi', H(C('PI'), 1), NOT(/Mississippi/)],
  ['task-word-start', 'lit', H(C('LITERATURE'), 1), NOT(/Accessibilities/)],
  ['task-word-start', 'miss', T(/^Area 37/, 1)],
  ['task-word-start', 'cor', H(C('CORRECTIONS'), 3)],
  ['task-numbers', '6', H(A(6), 1), NOT(/^Area 6[0-9]/, 3)],
  ['task-numbers', 'a6', H(A(6), 1)],
  ['task-numbers', 'area 6', H(A(6), 1)],
  ['task-numbers', '#6', H(A(6), 1)],
  ['task-numbers', '5', H(A(5), 1), NOT(/^Area 5[0-9]/, 3)],
  ['task-numbers', '93', H(A(93), 1)],
  ['task-numbers', 'A65', H(A(65), 1)],
  ['task-acronym', 'neta', H(A(65), 1), G('Areas')],
  ['task-acronym', 'swta', H(A(68), 1)],
  ['task-acronym', 'nwta', H(A(66), 1)],
  ['task-acronym', 'eamo', H(A(38), 1)],
  ['task-acronym', 'nord-est du quebec', H(A(89), 1)],
  ['task-acronym', 'washington state east', H(A(92), 1)],
  ['task-people', 'brandy', H(A(65), 1), G('Delegates'), H('#/predict/77/area/65', 3)],
  ['task-people', 'kerry', T(/^Kerry M\./, 1)],
  ['task-people', 'teresa', T(/^Teresa J\./, 1), TD(/Southwest regional trustee/, 1)],
  ['task-people', 'scott', T(/^Scott H\./, 1)],
  ['task-people', 'sarah p', TD(/Panel 75 delegate/, 1)],
  ['task-people', 'jimmy', TD(/past delegate Panel 59, Area 65/, 3)],
  ['task-people', 'Racy', TD(/Staff coordinator/i, 1)],
  ['task-people', 'Rainer L.', MAXT(/^Rainer L\./, 2)],
  ['task-people', 'Ken T.', TD(/Northeast regional trustee/, 2), TD(/Panel 72 delegate/, 3)],
  ['task-people', 'David S.', TD(/general service trustee/i, 2), TD(/Panel 76 delegate/, 4)],
  ['task-people', 'Tammy S.', TD(/delegate chair/i, 1)],
  ['task-roles', 'delegate chair', HR(/^#\/learn\/delegate_chair$/, 1), TD(/delegate chair of the 77th/i, 4)],
  ['task-roles', 'southwest trustee', T(/^Teresa J\./, 1)],
  ['task-roles', 'gsb chair', T(/^Scott H\./, 2)],
  ['task-roles', 'chair', T(/^Scott H\./, 1)],
  ['task-roles', 'regional trustee', TD(/regional trustee/i, 2)],
  ['task-roles', 'acm', HR(/^#\/learn\/acm$/, 1)],
  ['task-roles', 'general service trustee', TD(/General service trustee/i, 3)],
  ['task-roles', 'aaws chair', T(/^Ken T\./, 2)],
  ['task-desk', 'literature desk', T(/^Misha Q\./, 1)],
  ['task-desk', 'archives desk', TD(/Archives/, 2)],
  ['task-learn', 'gsr', H('#/learn/gsr', 1), G('Learn')],
  ['task-learn', 'dcm', H('#/learn/dcm', 1)],
  ['task-learn', 'third legacy', H('#/learn/third_legacy', 1)],
  ['task-learn', 'inverted triangle', HR(LEARN, 1)],
  ['task-learn', 'advisory action', H('#/learn/advisory_actions', 2)],
  ['task-learn', 'concept 12', HR(/^#\/learn\/(warranties|concepts)/, 2)],
  ['task-learn', 'concept XII', HR(/^#\/learn\/(warranties|concepts)/, 2)],
  ['task-learn', 'Box 4-5-9', HR(LEARN, 1), T(/Box 4-5-9/, 3)],
  ['task-learn', '459', T(/Box 4-5-9/, 2)],
  ['task-learn', 'Teller', HR(/^#\/learn\/glossary\/Teller$/, 1)],
  ['task-calendar', 'agenda deadline', G('Calendar'), T(/agenda item deadline/i, 1), HR(/^#\/calendar\/pai-deadline/, 1)],
  ['task-calendar', 'regional forum', HR(/^#\/learn\/|ICRF/, 2), T(/Southwest Regional Forum/, 6)],
  ['task-calendar', 'board weekend', T(/General Service Board weekend/, 3), HR(/^#\/calendar\/gsb-q4-2026$/, 3)],
  ['task-calendar', 'election results', T(/election results due/i, 2)],
  ['task-calendar', 'resumes due', T(/Résumés due/, 2)],
  ['task-calendar', 'swrda', T(/SWRDA/, 3), HR(/^#\/calendar\/swrda/, 3)],
  ['task-calendar', 'committee draw', T(/drawn by lot/i, 3)],
  ['task-calendar', 'panel 77 draw', T(/Panel 77 committees drawn by lot/, 2)],
  ['task-calendar', 'town hall', T(/town hall/i, 1)],
  ['task-conference', '77th conference', H('#/calendar/gsc77', 1)],
  ['task-conference', 'honoring our past', T(/77th General Service Conference/, 1)],
  ['task-conference', '2024 conference', H('#/reports/2024', 2)],
  ['task-conference', 'gsc 76', H('#/reports/2026', 1)],
  ['task-conference', '1975 conference', H('#/reports/1975', 1)],
  ['task-conference', '25th gsc', H('#/reports/1975', 1)],
  ['task-conference', 'golden moments of reflection', H('#/reports/1985', 1)],
  ['task-conference', 'singleness of purpose', H('#/reports/1988', 2), H('#/reports/2004', 2)],
  ['task-conference', 'first conference', H('#/reports/1951', 3)],
  ['task-conference', 'st louis conference', H('#/reports/1955', 3)],
  ['task-panels', 'panel 77', H('#/predict/77', 1), G('Panels')],
  ['task-panels', 'P76', T(/^Panel 76$/, 1), H('#/predict/76', 3)],
  ['task-panels', 'panel 78', T(/^Panel 78$/, 1), NOHREF('#/predict/78')],   // Predict can't show Panel 78 yet
  ['task-predict', '65 odds', H('#/predict/77/area/65', 1)],
  ['task-predict', 'predict 65', H('#/predict/77/area/65', 1)],
  ['task-predict', 'pi odds', H('#/predict/77/committee/PI', 1)],
  ['task-predict', '65', H(A(65), 1), H('#/predict/77/area/65', 2)],
  ['task-predict', 'cpc', H(C('CPC'), 1), H('#/predict/77/committee/CPC', 3)],
  ['task-predict', '66', H(A(66), 1), NOHREF('#/predict/77/area/66')],
  ['task-pages', 'calendar', H('#/calendar', 3)],
  ['task-pages', 'quiz', H('#/quiz', 2)],
  ['task-pages', 'openings', H('#/timeline', 3)],
  ['task-pages', 'predict', H('#/predict', 2)],
  ['task-accent', 'québec', H(A(87), 4), H(A(88), 4), H(A(89), 4), H(A(90), 4)],
  ['task-accent', 'la vina', H(C('GRAPEVINE'), 1)],
  ['task-accent', 'southwest', T(/^Southwest region/, 1)],
  ['task-junk', 'xqzv', NONE],
  ['task-junk', '>>', NONE],
  ['task-junk', '0', NONE],
  // integration pass (B4): alias merges, region deep link, city list
  ['task-alias', 'yoli', T(/^Yolanda F\./, 1), MAXT(/^Yol/, 1)],
  ['task-alias', 'bob s', T(/^Robert S\.|^Bob S\./, 3)],
  ['task-region', 'southwest region', H('#/delegates/current/SW', 1)],
  // "Show N more" on a group with hundreds of rows lists the whole group (no second, dead "Show N more")
  ['task-expand', { q: 'delegate', expand: 'Delegates' }, MORE0('Delegates')],
  ['task-expand', { q: 'chair', expand: 'Delegates' }, MORE0('Delegates')],
  ['task-expand', { q: 'committee', expand: 'Delegates' }, MORE0('Delegates')],
  // Agenda Items page (FCR.RAW.pai): items by number (a bare number stays Area 38's), themes, words, page entries
  ['task-agenda', 'pai 38', H('#/agenda/item/38', 1)],
  ['task-agenda', 'item 38', H('#/agenda/item/38', 1)],
  ['task-agenda', '38', H(A(38), 1), NOT(/^PAI /, 4)],
  ['task-agenda', '2025 pai 7', H('#/agenda/item/2025-7', 1)],
  ['task-agenda', 'eskimo', H('#/agenda/theme/eskimo', 1), T(/^PAI \d+ · .*Eskimo/, 4)],
  ['task-agenda', 'preamble men and women', T(/^PAI \d+ · .*Preamble/, 1), H('#/agenda/theme/preamble', 6)],
  ['task-agenda', 'article 3 charter', HR(/^#\/agenda\/(theme\/charter|item\/)/, 1), T(/^PAI \d+ · .*Article 3/, 3)],
  ['task-agenda', 'plain language big book', H('#/agenda/theme/plbb', 1)],
  ['task-agenda', 'proposed agenda items', H('#/agenda', 3)],
  ['task-agenda', 'pai status grid', H('#/agenda', 1), T(/^PAI status grid$/, 1)],
  // agenda items are concepts, like Learn: a theme or a title that starts with the word does not push Learn down
  ['task-agenda', 'virtual', H('#/learn/virtual_district', 1)],
  ['task-agenda', 'concepts', H('#/learn/concept_authority', 4)],
  ['task-agenda', 'floor action', H('#/learn/rules', 3)],
  // a title that starts with a common word is no strong hit ("Policy for …" stays below the committee and the people)
  ['task-agenda', 'policy', NOT(/^PAI /, 3)],
];

// Date-dependent checks.
const DATED = {
  '2027-03-01': [
    ['dated-2027-03', 'brandy', H(A(65), 1), TD(/Panel 77/, 1)],
    ['dated-2027-03', 'panel 77', T(/^Panel 77$/, 1), H('#/predict/77', 1)],
    ['dated-2027-03', 'agenda deadline', T(/agenda item deadline/i, 1)],
    ['dated-2027-03', 'board weekend', HR(/^#\/calendar\/gsb-q3-2027$/, 4)],
    ['dated-2027-03', '77th conference', H('#/calendar/gsc77', 1)],
  ],
  '2027-04-14': [
    ['dated-2027-04', 'southwest trustee', T(/^Teresa J\./, 2), T(/Southwest regional trustee nominee/, 6)],
    ['dated-2027-04', 'conference', T(/77th General Service Conference/, 3)],
    ['dated-2027-04', 'brandy', H(A(65), 1)],
  ],
  '2027-04-18': [   // the 77th has met (Apr 11-17); its Final Report is not loaded
    ['dated-2027-04m', 'gsc 77', T(/^77th General Service Conference/, 1), TD(/Final Report not loaded yet/, 1)],
    ['dated-2027-04m', 'next conference', T(/^78th General Service Conference/, 1), NOT(/^77th/)],
  ],
  '2027-09-15': [
    ['dated-2027-09', 'gsc 77', H('#/reports/2027', 1)],
    ['dated-2027-09', 'next conference', NOT(/^77th/)],
    ['dated-2027-09', 'panel 78', H('#/predict/78', 1)],
    ['dated-2027-09', 'agenda deadline', T(/agenda item deadline for the 78th/i, 1)],
    ['dated-2027-09', 'southwest regional forum', T(/Southwest Regional Forum/, 1)],
    ['dated-2027-09', 'brandy', H(A(65), 1)],
  ],
};

// ---------- runner ----------
function check(res, e, groups) {
  const top = (n) => res.slice(0, n);
  switch (e.k) {
    case 'href': return top(e.n).some((r) => r.href === e.href);
    case 'hrefre': return top(e.n).some((r) => e.re.test(r.href) || e.re.test(r.t));
    case 't': return top(e.n).some((r) => e.re.test(r.t));
    case 'td': return top(e.n).some((r) => e.re.test(r.t + ' ' + (r.d || '')));
    case 'group': return !!groups[0] && groups[0].g === e.g;
    case 'none': return res.length === 0;
    case 'nohref': return !res.some((r) => r.href === e.href);
    case 'nott': return !top(e.n).some((r) => e.re.test(r.t));
    case 'maxt': return res.filter((r) => e.re.test(r.t)).length <= e.max;
    case 'more0': { const g = groups.find((x) => x.g === e.g); return !!g && g.items.length > 0 && g.more === 0; }
    case 'noerror': return true;
  }
  return false;
}
const desc = (e) => e.k + (e.href ? ' ' + e.href : '') + (e.g ? ' ' + e.g : '') + (e.re ? ' ' + e.re : '') + (e.n && e.n < 1e9 ? ' top' + e.n : '') + (e.max != null ? ' max' + e.max : '');
function runSuite(F, cases, today) {
  return cases.map(([cat, q0, ...exps]) => {
    const q = typeof q0 === 'string' ? q0 : q0.q, opts = typeof q0 === 'string' ? undefined : { expand: q0.expand };
    let groups = [], res = [], err = null;
    const t0 = process.hrtime.bigint();
    try { groups = F.search.query(q, opts) || []; res = [].concat(...groups.map((g) => g.items)); } catch (x) { err = x.stack || x.message; }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const fails = err ? ['threw: ' + err] : exps.filter((e) => !check(res, e, groups)).map(desc);
    return { today, cat, q: opts ? `${q} (expand ${opts.expand})` : q, pass: !fails.length, fails, ms, n: res.length, top: res.slice(0, 5).map((r) => `{${r.g}} ${r.t} — ${r.d} [${r.href}]`) };
  });
}

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const pick = (list) => list.filter((c) => !only || c[0].startsWith(only));
const out = [];
const t0 = Date.now();
let F = loadApp('2026-10-20');
const tb = Date.now(); const entries = F.search.index().length; const buildMs = Date.now() - tb;
out.push(...runSuite(F, pick(S1.concat(TASK)), '2026-10-20'));
Object.entries(DATED).forEach(([d, cases]) => { const list = pick(cases); if (list.length) { F = loadApp(d); out.push(...runSuite(F, list, d)); } });

const by = {};
out.forEach((r) => { const b = (by[r.cat] = by[r.cat] || { pass: 0, fail: 0 }); r.pass ? b.pass++ : b.fail++; });
const show = (r) => console.log(`${r.pass ? 'PASS' : 'FAIL'} [${r.cat}${r.today !== '2026-10-20' ? ' @' + r.today : ''}] "${r.q}" n=${r.n}${r.fails.length ? ' :: ' + r.fails.join('; ') : ''}\n     top: ${r.top.slice(0, 3).join(' | ') || '(none)'}`);
if (argv.includes('--all')) out.forEach(show); else out.filter((r) => !r.pass).forEach(show);
const pass = out.filter((r) => r.pass).length;
console.log('\ncategory              pass');
Object.entries(by).forEach(([c, b]) => console.log(`  ${c.padEnd(20)} ${b.pass}/${b.pass + b.fail}`));
const ms = out.map((r) => r.ms).sort((a, b) => a - b);
if (ms.length) console.log(`\nindex: ${entries} entries built in ${buildMs} ms · query median ${ms[Math.floor(ms.length / 2)].toFixed(2)} ms, p95 ${ms[Math.floor(ms.length * 0.95)].toFixed(2)} ms, max ${ms[ms.length - 1].toFixed(2)} ms · total ${Date.now() - t0} ms`);
const rate = out.length ? pass / out.length : 0;
const s1 = out.filter((r) => !/^(task|dated)-/.test(r.cat));
console.log(`search_test: ${pass}/${out.length} pass (${(rate * 100).toFixed(1)}%; S1 audit queries ${s1.filter((r) => r.pass).length}/${s1.length})${rate >= 0.98 ? '' : ' — BELOW 98%'}`);
const j = argv.indexOf('--json'); if (j >= 0) fs.writeFileSync(argv[j + 1], JSON.stringify(out, null, 1));
process.exit(rate >= 0.98 ? 0 : 1);
