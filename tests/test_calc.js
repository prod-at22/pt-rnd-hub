// Tests for the PT costing calculator. The hub is the source of truth: these check the engine,
// rules and UI against fixed numbers, not against any R&D workbook.
//   node tests/test_calc.js        (needs jsdom: npm i jsdom)
const fs = require("fs"), path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.join(__dirname, "..");

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log("  FAIL", msg); } };
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------- mock GitHub repo
function mockRepo(files, validTokens) {
  let n = 0; const commits = {}, trees = {}, blobs = {};
  const root = "c0"; trees.t0 = { ...files }; commits[root] = { tree: "t0", parents: [] };
  const repo = { head: root, commits, trees, log: [] };
  repo.files = sha => trees[commits[sha].tree];
  repo.handle = (method, url, body, auth) => {
    const tok = (auth || "").replace("Bearer ", "");
    if (!validTokens.includes(tok)) return [401, { message: "Bad credentials" }];
    const u = new URL(url), p = u.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, "");
    if (method === "GET" && p === "/git/ref/heads/main") return [200, { object: { sha: repo.head } }];
    if (method === "GET" && p.startsWith("/contents/")) {
      const f = repo.files(u.searchParams.get("ref"))[p.slice(10)];
      return f === undefined ? [404, { message: "Not Found" }] : [200, { content: Buffer.from(f).toString("base64") }];
    }
    if (method === "GET" && p.startsWith("/git/commits/")) return [200, { tree: { sha: commits[p.slice(13)].tree } }];
    if (method === "POST" && p === "/git/trees") {
      const t = "t" + (++n); trees[t] = { ...trees[body.base_tree] };
      for (const f of body.tree) { if ("sha" in f) { if (f.sha === null) delete trees[t][f.path]; else trees[t][f.path] = blobs[f.sha]; } else trees[t][f.path] = f.content; }
      return [201, { sha: t }];
    }
    if (method === "POST" && p === "/git/blobs") { const b = "b" + (++n); blobs[b] = Buffer.from(body.content, "base64").toString("latin1"); return [201, { sha: b }]; }
    if (method === "POST" && p === "/git/commits") { const c = "c" + (++n); commits[c] = { tree: body.tree, parents: body.parents, message: body.message }; return [201, { sha: c }]; }
    if (method === "PATCH" && p === "/git/refs/heads/main") {
      if (commits[body.sha].parents[0] !== repo.head) return [422, { message: "Update is not a fast forward" }];
      repo.head = body.sha; repo.log.push(commits[body.sha].message); return [200, {}];
    }
    if (method === "POST" && /^\/repos\/prod-at22\/catalog-pt-public\/actions\/workflows\/mirror\.yml\/dispatches$/.test(u.pathname)) { repo.dispatches = (repo.dispatches || 0) + 1; return [204, null]; }
    if (method === "POST" && /^\/repos\/prod-at22\/pt-kb-house\/actions\/workflows\/mirror\.yml\/dispatches$/.test(u.pathname)) { repo.kbDispatches = (repo.kbDispatches || 0) + 1; return [204, null]; }
    return [404, { message: "no route " + method + " " + p }];
  };
  return repo;
}

// page = "" (hub) or "hnd/" etc. app.js / app.css are inlined because jsdom does not fetch them.
async function boot(repo, page = "hnd/", query = "", session = null) {   // session: sessionStorage carried over from another page in the same tab
  const html = fs.readFileSync(path.join(ROOT, page, "index.html"), "utf8")
    .replace(/<script src="[^"]*app\.js[^"]*"><\/script>/, () => "<script>" + fs.readFileSync(path.join(ROOT, "app.js"), "utf8") + "</script>")
    .replace(/<link rel="stylesheet"[^>]*>/, "");
  const errors = [];
  const dom = new JSDOM(html, {
    url: "https://prod-at22.github.io/pt-rnd-hub/" + page + query, runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, "crypto", { value: globalThis.crypto });
      w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
      if (session) for (const [k, v] of Object.entries(session)) w.sessionStorage.setItem(k, v);
      w.confirm = () => true; w.scrollTo = () => { };
      w.fetch = async (url, opt = {}) => {
        const mk = (status, j) => ({ ok: status < 300, status, text: async () => JSON.stringify(j), json: async () => j });
        if (String(url).startsWith("https://api.github.com")) {
          if (opt.cache !== "no-store") (repo.cached = repo.cached || []).push((opt.method || "GET") + " " + url);
          const [s, j] = repo.handle(opt.method || "GET", url, opt.body ? JSON.parse(opt.body) : null, (opt.headers || {}).Authorization);
          return mk(s, j);
        }
        // GitHub Pages serves the current head of the repo
        const rel = new URL(String(url), w.location.href).pathname.replace("/pt-rnd-hub/", "");
        const f = repo.files(repo.head)[rel];
        return f === undefined ? mk(404, {}) : { ok: true, status: 200, json: async () => JSON.parse(f) };
      };
      w.addEventListener("error", e => errors.push(e.message));
      const ce = w.console.error; w.console.error = (...a) => { errors.push(a.join(" ")); };
    },
  });
  const w = dom.window;
  for (let i = 0; i < 100 && !w.PTCALC?.DATA; i++) await tick(20);
  return { w, doc: w.document, errors };
}
const byCode = (data, c) => data.destinations.find(d => d.code === c);
const tick = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await tick(25); } return false; }
function fire(w, el, type) { el.dispatchEvent(new w.Event(type, { bubbles: true })); }
function setVal(w, el, v) { el.value = v; fire(w, el, "change"); }
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tab = async (w, doc, name) => { click(w, doc.querySelector(`[data-tabmain="${name}"]`)); await tick(5); };

(async () => {
  const files = {};
  for (const f of ["data.json", "history.json", "users.json", "flags.json"]) files["data/" + f] = fs.readFileSync(path.join(ROOT, "data", f), "utf8");
  files["data/users.json"] = JSON.stringify({ repo: "", users: [] });   // start with no accounts (the live file has the real ones) → First-time setup
  for (const f of fs.readdirSync(path.join(ROOT, "data", "catalogs"))) files["data/catalogs/" + f] = fs.readFileSync(path.join(ROOT, "data", "catalogs", f), "utf8");
  for (const f of fs.readdirSync(path.join(ROOT, "data", "kb"))) files["data/kb/" + f] = fs.readFileSync(path.join(ROOT, "data", "kb", f), "utf8");
  const repo = mockRepo(files, ["tok-valid", "tok-new"]);
  const { w, doc, errors } = await boot(repo);
  const P = w.PTCALC, D = P.DATA;
  const HND = () => byCode(P.DATA, "HND");
  const V0 = D.version;   // versions below are relative to the data we start from

  console.log("1. FX belongs to the hub: changing it recalculates the costs that use it");
  {
    const h = byCode(D, "HND"), pk = h.packages.find(p => p.id === "basic"), vid = pk.assign[0].variant, f = h.fx.find(x => x.id === "WIF");
    const c0 = P.priceRow(h, pk, vid, 2).adult.cost, v0 = f.value;
    f.value = v0 * 1.1; const c1 = P.priceRow(h, pk, vid, 2).adult.cost; f.value = v0;
    ok(isFinite(c0) && c1 > c0 && near(P.priceRow(h, pk, vid, 2).adult.cost, c0), `Tokyo Basic 2 pax: WIF FX +10% raises cost ${c0} → ${c1}, restored after`);
  }

  console.log("1b. TO rates editor (Costing tab, Edit costs): per-pax cost tables");
  {
    const dp = await boot(repo, "dps/");
    ok(!dp.doc.querySelector("table.torates"), "TO rates editor hidden when not editing");
    dp.w.PTCALC.EDIT = true; dp.w.PTCALC.render(); await tick(5);
    const tbl = dp.doc.querySelector("table.torates");
    ok(tbl && tbl.querySelectorAll("tbody tr").length >= 10 && tbl.textContent.includes("Transport") && tbl.querySelector("input.ed"), "Bali: one editable row per pax, a column per component (Transport …)");
    dp.w.PTCALC.EDIT = false;
    ok(dp.errors.length === 0, "Bali TO Rates errors: " + dp.errors.join("|"));
    const h = byCode(D, "DPS"), pk = h.packages[0], vid = pk.assign[0].variant, v = h.variants.find(x => x.id === vid);
    const tid = /T\['([^']+)'\]/.exec(v.components[0].expr)[1], t = h.tables.find(x => x.id === tid), v0 = t.values["2"];
    const c0 = P.priceRow(h, pk, vid, 2).adult.cost; t.values["2"] = v0 + 100; const c1 = P.priceRow(h, pk, vid, 2).adult.cost; t.values["2"] = v0;
    ok(near(c1 - c0, 100 * (h.fx.find(f => f.id === t.fx) || { value: 1 }).value, 0.01) || near(c1 - c0, 100 / 2, 0.01), `editing a table cell changes the cost (${c0} → ${c1})`);
  }

  console.log("1d. Seoul Basic / Standard = ATK contract rate; add-ons from the Korea ProdReq");
  {
    const s = byCode(D, "SEL"), b = s.packages.find(p => p.id === "atk-bsc"), st = s.packages.find(p => p.id === "atk-std");
    const r = (pk, v, p) => P.priceRow(s, pk, v, p);
    const KRW = s.fx.find(f => f.id === "KRW").value;
    ok(s.fx.find(f => f.id === "KRW").live === "KRW" && KRW > 0.002 && KRW < 0.004, "KRW FX live (stored fallback " + KRW + ")");
    ok(near(r(b, "ATK-BSC", 2).adult.cost, 858261 * KRW) && near(r(b, "ATK-BSC", 10).adult.cost, 581256 * KRW) && near(r(b, "ATK-BSC", 25).adult.cost, 442351 * KRW), "Basic = CR KRW × live KRW FX (2/10/25 pax)");
    ok(near(r(st, "ATK-STD", 2).adult.cost, 1224774 * KRW) && near(r(st, "ATK-STD", 42).adult.cost, 420726 * KRW), "Standard = CR KRW × live KRW FX (2/42 pax)");
    ok(!isFinite(r(b, "ATK-BSC", 26).adult.cost), "Basic 26+ pax: not in the CR → no cost");
    ok(s.variants.filter(v => v.id !== "ATK-ST").every(v => v.components.length === 1), "one cost line (not broken down)");
    const sp = await boot(repo, "sel/", "?pkg=atk-bsc");
    const sh = [...sp.doc.querySelectorAll("#costPax tr.blk-head th")].map(x => x.textContent);
    ok(!sh.includes("Source"), "costing table has no Source column");
    ok(sh[1] === "Cost/Pax" && sp.doc.querySelector('#costPax tr[data-pax="2"]').children[1].textContent.trim() === Math.round(858261 * KRW).toLocaleString("en-US"), "Seoul costing: no breakdown column, Cost/Pax = 858,261 KRW × live KRW FX");
    ok(near(r(b, "ATK-BSC", 2).cnb.cost, 858261 * KRW * 0.5) && r(b, "ATK-BSC", 2).infant.cost === 0, "CNB 50%, infant FOC");
    ok(s.contracts.length === 3 && s.contracts.every(c => /ATK_CR_2026_Korea/.test(c.file) && fs.existsSync(path.join(ROOT, c.file))), "SEL TO Contract Rate = ATK CR 2026 (KRW xlsx + rates + terms) only");
    const ev = s.addons.find(x => x.label === "Everland ticket");
    ok(ev && near(ev.cost, 40700 * 0.003, 0.01) && ev.selling === 140, "Everland add-on: cost stored in RM (40,700 KRW × 0.0030), selling RM140");
    ok(s.addons.find(x => x.label === "K-ETA").cost === 27 && s.addons.find(x => x.label.startsWith("Hanbok")).cost === null, "K-ETA cost RM27; Hanbok has no cost rate (null)");
  }

  console.log("1e. Seoul-Jeju, Jeju, Jeju-Udo = ATK CR 2026");
  {
    const KRW = byCode(D, "SEL").fx.find(f => f.id === "KRW").value;
    const chk = (code, vid, exp) => { const d = byCode(D, code), pk = d.packages.find(p => p.assign.some(x => x.variant === vid));
      return Object.entries(exp).every(([p, c]) => near(P.priceRow(d, pk, vid, +p).adult.cost, c)) && !isFinite(P.priceRow(d, pk, vid, 26).adult.cost)
        && d.variants.find(v => v.id === vid).components.length === 1; };
    ok(chk("SELJJU", "ATK-STD", { 2: 1769500 * KRW, 9: 1138111 * KRW, 25: 865000 * KRW }), "SELJJU = CR KRW × live KRW FX, none at 26");
    ok(chk("JJU", "ATK-PT", { 2: 943000 * KRW, 9: 521889 * KRW, 25: 353000 * KRW }), "JJU = CR KRW × live KRW FX");
    ok(chk("JJUO", "ATK-STD", { 2: 1442257 * KRW, 10: 783357 * KRW, 25: 571827 * KRW }), "JJUO = CR KRW × live KRW FX");
    ok(!byCode(D, "JJU").variants.some(v => v.id === "ATK-ST") && byCode(D, "JJU").packages.length === 1, "Jeju Self Tour removed (PO 13 Oct 2026)");
    ok(byCode(D, "JJU").packages[0].assign[0].to === 25 && !("26" in byCode(D, "JJU").packages[0].pricing.adult), "Jeju Costing 2–25 pax (= CR)");
  }

  console.log("1f. Turkey / Istanbul: no 4★ (not in the MyTrip CR or catalog)");
  ok(["TUR", "ISTBUR", "ISTCAP"].every(c => !byCode(D, c).variants.some(v => /4\s*-?\s*STAR|4S$/i.test(v.id)) && !byCode(D, c).packages.some(p => /4/.test(p.id))), "TUR / ISTBUR / ISTCAP have only 3★ packages");

  console.log("1g. Tokyo Qayyum (Standard 2–7) from ProdReq Jepun");
  {
    const h = byCode(D, "HND"), st = h.packages.find(p => p.id === "standard"), c = p => P.priceRow(h, st, "QAYYUM-STD", p).adult.cost;
    // (2 × ¥22,000 + ¥81,000 + 3 × ¥76,000) × FX ÷ pax + apartment RM300 × 4 + Iyashi ¥500 × FX (ProdReq rates, Qayyum FX 0.026)
    const q = p => (353000 * 0.026) / p + 250 * 4 + 500 * 0.029;   // apartment RM250 × 4 nights; Iyashi is a common rate on the WIF FX
    ok([2, 4, 7].every(p => near(c(p), q(p), 0.01)), `Qayyum cost 2/4/7 pax at FX 0.026: ${c(2)} / ${c(4)} / ${c(7)}`);
  }

  console.log("1h. Tokyo / Osaka accommodation RM250 per pax per night");
  ok(byCode(D, "HND").rates.find(r => r.id === "apt").value === 250 && ["OSK", "KIX"].every(c => byCode(D, c).tables.filter(t => /__Accomm$/.test(t.id)).every(t => Object.values(t.values).every(v => v === (c === "OSK" ? 1000 : 1500)))), "HND apartment 250; OSK 4 × 250; KIX 6 × 250");

  console.log("1i. Package = package name, TO = operator name (tools/names.json)");
  {
    const names = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "names.json"), "utf8"));
    let n = 0;
    for (const d of D.destinations) { const m = names[d.code]; if (!m) continue;
      for (const p of d.packages) { ok(p.label === m.packages[p.id], `${d.code} package ${p.id} named "${p.label}"`); n++; }
      for (const v of d.variants) { ok(v.label === m.variants[v.id], `${d.code} TO ${v.id} named "${v.label}"`); n++; } }
    ok(n >= 195, "names checked: " + n);
    ok(!byCode(D, "TUR").packages.some(p => /mytrip/i.test(p.label)) && byCode(D, "TUR").variants.every(v => v.label === "MyTrip"), "Turki: no operator in package names; TO = MyTrip");
  }

  console.log("1c. Jakarta - Bandung: new CTRANS rate (v5)");
  {
    const j = byCode(D, "JBDO"), pk = j.packages[0];
    const c = (vid, p) => P.priceRow(j, pk, vid, p).adult.cost;
    ok(c("CTRANS", 2) === 936 && c("CTRANS", 5) === 684 && c("CTRANS", 10) === 635, "2/5/10 pax = 936/684/635");
    ok(c("CTRANS-HIACE", 5) === 757, "5 pax Hiace = 757");
    ok(!j.variants.some(v => v.components.some(x => /whoosh/i.test(x.label))), "no Whoosh component");
    ok([11, 15, 19].every(p => c("CTRANS", p) === 635) && !isFinite(c("CTRANS", 20)), "10–19 pax = RM635 (PO 9 Oct, v34); 20 pax has no TO rate (missing, not RM0)");
    const sp = p => P.priceRow(j, pk, "CTRANS", p);
    ok([[2, 1487], [4, 1227], [6, 1187], [10, 1147], [19, 1147]].every(([p, a]) => sp(p).adult.catalog === a), "catalog = Catalog PT v8 (2/4/6/10/19 pax = 1,487/1,227/1,187/1,147/1,147)");
    ok(sp(2).cwb.catalog === 1387 && sp(2).cnb.catalog === 1187 && sp(2).adult.selling === 1287, "2 pax CWB 1,387 · CNB 1,187 · selling 1,287 (catalog − 200)");
    ok(Object.keys(pk.pricing.adult).map(Number).every(p => p >= 2 && p <= 19), "JBDO priced 2–19 pax only");
  }

  console.log("2. selling / margin rules");
  {
    const sel = D.destinations.find(x => x.code === "SEL"), b = sel.packages.find(p => p.id === "atk-bsc");
    const r = P.priceRow(sel, b, "ATK-BSC", 2);
    ok(r.adult.catalog === 3497 && r.adult.selling === 3297, "Seoul Basic 2 pax adult catalog 3497, selling 3297 (− RM200)");
    ok(near(r.cwb.cost, r.adult.cost * 0.75), "Seoul CWB cost = 75% adult (CR extra bed)");
    ok(near(r.cnb.cost, r.adult.cost * 0.5), "Seoul CNB cost = 50% adult");
    ok(r.infant.selling === 200 && r.infant.cost === 0, "Seoul infant RM200, cost 0");
    ok(near(r.adult.margin, 3297 - r.adult.cost) && near(r.adult.pct, r.adult.margin / 3297), "Seoul margin & % on the selling price");
    const hnd = D.destinations.find(x => x.code === "HND"), s = hnd.packages.find(p => p.id === "standard");
    const r6 = P.priceRow(hnd, s, "QAYYUM-STD", 6), r8 = P.priceRow(hnd, s, "WIF-STD", 8);
    ok(r6.adult.catalog === 3797 && r6.adult.selling === 3597, "Tokyo Std 6 pax catalog 3797, selling 3597 (− RM200)");
    ok(r8.adult.catalog === 3897, "Tokyo Std 8 pax catalog 3897");
    ok(near(r6.cnb.cost, r6.adult.cost - 1200), "Tokyo CNB cost = adult − 1200");
    ok(near(r6.cwb.cost, r6.adult.cost), "Tokyo CWB cost = 100% adult");
    ok(r6.infant.selling === 200, "Tokyo infant RM200 with no tier-2 discount");
    ok(P.priceRow(hnd, s, "QAYYUM-STD", 8).cost === null, "Qayyum does not cover 8 pax");
    // a TO's own child rules (variants[].childRules) win over the package's rules
    const tv = hnd.variants.find(v => v.id === "QAYYUM-STD");
    tv.childRules = { cwbCost: { type: "pct", value: 0.5 }, cnbCost: { type: "pct", value: 0 } };
    const rc = P.priceRow(hnd, s, "QAYYUM-STD", 6), rw = P.priceRow(hnd, s, "WIF-STD", 8);
    ok(near(rc.cwb.cost, rc.adult.cost * 0.5) && rc.cnb.cost === 0 && near(rw.cnb.cost, rw.adult.cost - 1200), "TO childRules: Qayyum CWB 50% / CNB 0, WIF keeps the package rule (adult − 1200)");
    delete tv.childRules;
  }

  console.log("3. UI: destination / package / auto TO by pax");
  {
    ok(doc.querySelector("#controls").textContent.includes("Tokyo"), "/hnd/ page is locked to Tokyo");
    ok(doc.querySelector("#costPax") && doc.querySelector(".tabm.on").dataset.tabmain === "costing", "Costing tab opens by default");
    ok(doc.querySelector(".fxbox").textContent.includes("0.029") && doc.querySelector(".fxbox").textContent.includes("0.026"), "FX chips: WIF 0.029, Qayyum 0.026");
    ok([...doc.querySelectorAll(".tabm")].map(x => x.dataset.tabmain).join() === "costing,contracts,itinerary,surcharge,accommodation,addons,expect,policy,kbinfo,kbcalc,competitor,quotes,flags,history", "tabs: Costing, TO Contract Rate, Itinerary, Surcharge, Accommodation, Add On, What to Expect, Policy, Info KB, Simple Calculator, Competitor Analysis, Quotations, Flags, History");
    // each catalog section on its own tab (data/catalogs/<slug>.json for the selected package)
    setVal(w, doc.querySelector("#selPkg"), "standard"); await tick(5);
    await tab(w, doc, "itinerary"); await until(() => doc.querySelector("#cat-tokyo-standard"));
    const cd = doc.querySelector("#cat-tokyo-standard"), cdt = cd ? cd.textContent : "";
    ok(cd && cdt.includes("PRIVATE TOUR TOKYO STANDARD") && cdt.includes("Iyashi No Sato") && cdt.includes("Tipping Fee") && cdt.includes("Return flight ticket") && cdt.includes("Section L Apartment"), "Itinerary tab: title, hotels, includes, excludes");
    ok(cd && cd.querySelectorAll(".cd-itin tbody tr").length === 5 && cdt.includes("Kawaguchiko Mosque"), "Itinerary tab: 5-day itinerary");
    ok(cd && cd.querySelector('a[href$="tokyo-standard.pdf"]'), "links the public PDF");
    await tab(w, doc, "surcharge"); ok(doc.querySelector("#grid").textContent.includes("Peak Season"), "Surcharge tab");
    await tab(w, doc, "expect"); ok(doc.querySelector("#cat-tokyo-standard-expect"), "What to Expect tab");
    await tab(w, doc, "policy"); { const t = doc.querySelector("#grid").textContent; ok(t.includes("Important Notes") && t.includes("Deposit"), "Policy tab: important notes + deposit"); }
    await tab(w, doc, "addons"); { const tk = [...doc.querySelectorAll("input.aotick")]; ok(tk.length > 5 && tk.some(x => x.checked) && tk.every(x => x.disabled) && doc.querySelector("#grid").textContent.includes("Fuji Day Tour"), "Add On tab: catalog add-ons ticked for tokyo-standard (read-only when not editing)"); }
    await tab(w, doc, "itinerary");
    setVal(w, doc.querySelector("#selPkg"), "selftour"); await tick(5);
    ok(doc.querySelector("#grid").textContent.includes("has no published catalog"), "Self Tour: no catalog");
    location_hash_ok: { const old = await boot(repo, "hnd/", "#catalog"); ok(old.doc.querySelector(".tabm.on").dataset.tabmain === "itinerary", "old #catalog link opens Itinerary"); }
    setVal(w, doc.querySelector("#selPkg"), "basic"); await tick(5);
    await tab(w, doc, "costing");
    ok(doc.querySelector('[data-tabmain="contracts"]').textContent === "TO Contract Rate", "tab named TO Contract Rate");
    setVal(w, doc.querySelector("#selPkg"), "standard"); await tick(5);
    const rowAt = p => doc.querySelector(`#costPax tr[data-pax="${p}"]`);
    click(w, rowAt(6)); await tick(5);
    ok(doc.querySelector("#selVar").options[0].textContent.includes("Qayyum") && rowAt(6).classList.contains("cur"), "click 6 pax row → Qayyum, row highlighted");
    click(w, rowAt(8)); await tick(5);
    ok(doc.querySelector("#selVar").options[0].textContent === "Auto: WIF (8 pax)", "8 pax → WIF (Standard 8+)");
    ok([...doc.querySelector("#selVar").options].map(o => o.value).join() === "auto,QAYYUM-STD,WIF-STD", "TO box lists only this package's operators");
    ok(doc.querySelector("#selPkg").selectedOptions[0].textContent === "Tokyo Standard 5D4N", "Package box shows the package name");
    ok(rowAt(8).querySelector("td.sp").textContent.includes("3,697"), "8 pax selling 3,697 shown (catalog 3,897 − 200)");
    const sm = doc.querySelector(".summary").textContent;
    ok(!sm.includes("No TO cost") && !sm.includes("Catalog → Selling") && sm.includes("Margin range"), "summary has no 'No TO cost' / 'Catalog → Selling'");
    const rws = [...doc.querySelectorAll("#costPax tr[data-pax]")];
    ok(rws[0].classList.contains("alt") === false && rws[1].classList.contains("alt"), "costing rows alternate grey / white");
    const mg = rws.map(r => r.querySelector("td.mg"));
    ok(mg.every(td => { const v = parseFloat(td.textContent.replace(/[^\d.\-−]/g, "").replace("−", "-")); return !isFinite(v) || (v > 0 ? td.classList.contains("m-ok") : v < 0 ? td.classList.contains("m-bad") : !/m-(ok|bad)/.test(td.className)); }), "margin green when positive, red when negative");
    ok(P.priceRow(HND(), HND().packages[1], "WIF-STD", 8).adult.pct > 0 && w.eval("marginClass(0.01)") === "m-ok" && w.eval("marginClass(-0.01)") === "m-bad", "marginClass: + green, − red");
    click(w, rowAt(2)); await tick(5);
  }

  console.log("4. first-time setup, login, wrong password");
  {
    click(w, doc.querySelector("#btnLogin")); await tick(5);
    ok(doc.querySelector("#sTok"), "no users → setup form");
    doc.querySelector("#sTok").value = "tok-valid"; doc.querySelector("#sU").value = "ezie";
    doc.querySelector("#sP").value = "short"; doc.querySelector("#sP2").value = "short";
    click(w, doc.querySelector("#doSetup")); await tick(5);
    ok(doc.querySelector(".err-t").textContent.includes("10 characters"), "short password rejected");
    doc.querySelector("#sP").value = "correct-horse-1"; doc.querySelector("#sP2").value = "correct-horse-1";
    click(w, doc.querySelector("#doSetup"));
    ok(await until(() => !doc.querySelector("#sTok")), "setup completes");
    const users = JSON.parse(repo.files(repo.head)["data/users.json"]);
    ok(users.users.length === 1 && users.users[0].role === "admin", "users.json has admin");
    ok(!repo.files(repo.head)["data/users.json"].includes("tok-valid"), "token is not stored in plain text");
    click(w, doc.querySelector("#btnLogout")); await tick(5);
    click(w, doc.querySelector("#btnLogin")); await tick(5);
    doc.querySelector("#lu").value = "ezie"; doc.querySelector("#lp").value = "wrong-password";
    click(w, doc.querySelector("#doLogin"));
    ok(await until(() => doc.querySelector(".err-t")?.textContent.includes("Wrong")), "wrong password refused");
    doc.querySelector("#lp").value = "correct-horse-1"; doc.querySelector("#doLogin").disabled = false;
    click(w, doc.querySelector("#doLogin"));
    ok(await until(() => doc.querySelector("#btnEdit")), "correct password logs in");
  }

  console.log("5. add editor, editor login");
  {
    click(w, doc.querySelector("#btnAcct")); await tick(5);
    doc.querySelector("#nu").value = "thania"; doc.querySelector("#np").value = "thania-pass-2026"; doc.querySelector("#nr").value = "editor";
    click(w, doc.querySelector("#doAdd"));
    ok(await until(() => JSON.parse(repo.files(repo.head)["data/users.json"]).users.length === 2), "editor added");
    click(w, doc.querySelector("[data-close]")); click(w, doc.querySelector("#btnLogout")); await tick(5);
    click(w, doc.querySelector("#btnLogin")); await tick(5);
    doc.querySelector("#lu").value = "thania"; doc.querySelector("#lp").value = "thania-pass-2026";
    click(w, doc.querySelector("#doLogin"));
    ok(await until(() => doc.querySelector("#btnEdit")), "editor logs in with own password");
  }

  console.log("5a. login stays when moving to another destination page (same tab)");
  {
    const key = "ptRndHub.session", raw = w.sessionStorage.getItem(key), st = raw && JSON.parse(raw);
    ok(st && st.u === "thania" && st.vk && !raw.includes("tok-valid"), "sessionStorage keeps user + vault key, never the token");
    const carry = { [key]: raw };
    const sel = await boot(repo, "sel/", "", carry); await until(() => sel.doc.querySelector("#authArea .chip"));
    ok(sel.doc.querySelector("#authArea .chip").textContent.includes("thania") && !sel.doc.querySelector("#btnLogin"), "SEL page opens logged in as thania (no login form)");
    ok(!sel.doc.querySelector("#btnEdit") && sel.doc.querySelector("#authArea").textContent.includes("PO Aiman only"), "…and rights still apply on SEL");
    const kix = await boot(repo, "kix/", "", carry); await until(() => kix.doc.querySelector("#btnEdit"));
    ok(kix.doc.querySelector("#btnEdit") && kix.w.eval("SESSION.token") === "tok-valid", "KIX page: logged in, token decrypted again from users.json");
    const old = await boot(repo, "kix/", "", { [key]: JSON.stringify({ ...st, at: Date.now() - 31 * 60 * 1000 }) }); await until(() => old.doc.querySelector("#btnLogin"));
    ok(old.doc.querySelector("#btnLogin") && !old.w.sessionStorage.getItem(key), "older than 30 min idle → logged out, stored session cleared");
    const gone = await boot(repo, "kix/", "", { [key]: JSON.stringify({ ...st, u: "nobody" }) }); await until(() => gone.doc.querySelector("#btnLogin"));
    ok(gone.doc.querySelector("#btnLogin"), "user not in users.json (removed) → not logged in");
    const bad = await boot(repo, "kix/", "", { [key]: "{not json" }); await until(() => bad.doc.querySelector("#btnLogin"));
    ok(bad.doc.querySelector("#btnLogin") && !bad.w.sessionStorage.getItem(key), "unreadable stored session → logged out and cleared");
    const hub = await boot(repo, "", "", carry); await until(() => hub.doc.querySelector("#authArea .chip"));
    ok(hub.doc.querySelector("#authArea .chip").textContent.includes("thania") && !hub.doc.querySelector("#btnEdit"), "hub list page: still logged in, no Edit costs (nothing to edit there)");
    click(kix.w, kix.doc.querySelector("#btnLogout")); await tick(5);
    ok(!kix.w.sessionStorage.getItem(key) && kix.doc.querySelector("#btnLogin"), "Log out clears the stored session");
    ok([sel, kix, old, gone].every(p => !p.errors.length), "session errors: " + [sel, kix, old, gone].flatMap(p => p.errors).join("|"));
  }

  console.log("5b. editor rights: only the destinations where they are PO");
  {
    ok(P.DATA.destinations.find(d => d.code === "HND").po === "Thania", "fixture: HND PO is Thania");
    click(w, doc.querySelector("#btnEdit")); await tick(5);
    ok(![...doc.querySelectorAll("input.ed")].some(x => x.dataset.path === JSON.stringify(["destinations", "HND", "po"])), "editor cannot change the PO field (admin only)");
    const sel = P.DATA.destinations.find(d => d.code === "SEL"), k = Object.keys(sel.packages[0].pricing.adult)[0], was = sel.packages[0].pricing.adult[k];
    sel.packages[0].pricing.adult[k] = was + 1;
    let err = ""; try { await P.saveChanges("not mine"); } catch (e) { err = e.message; }
    ok(/only change your own destinations \(.*HND.*\)/.test(err) && repo.log.every(m => !m.includes("not mine")), "save refused for another PO's destination (SEL): " + err);
    sel.packages[0].pricing.adult[k] = was;
    click(w, doc.querySelector("#btnEdit")); await tick(5);
    const pg = await boot(repo, "sel/"); await until(() => pg.doc.querySelector("#authArea"));
    pg.w.PTCALC.SESSION = { u: "thania", role: "editor", token: "tok-valid" }; pg.w.PTCALC.render(); await tick(5);
    const dis = [...pg.doc.querySelectorAll("#authArea button[disabled]")].find(b => b.textContent.includes("PO Aiman only"));
    ok(!pg.doc.querySelector("#btnEdit") && dis, "SEL page: no Edit costs for Thania, shows 'PO Aiman only'");
    pg.w.PTCALC.SESSION = { u: "aiman", role: "editor", token: "tok-valid" }; pg.w.PTCALC.render(); await tick(5);
    ok(pg.doc.querySelector("#btnEdit"), "SEL page: Aiman (its PO) can edit");
    pg.w.PTCALC.SESSION = { u: "ezie", role: "admin", token: "tok-valid" }; pg.w.PTCALC.render(); await tick(5);
    ok(pg.doc.querySelector("#btnEdit"), "SEL page: admin can edit every destination");
    ok(pg.errors.length === 0, "rights errors: " + pg.errors.join("|"));
  }

  console.log("6. edit → save v2 → history → view v1 → restore v3");
  let before;
  {
    await tab(w, doc, "costing");
    setVal(w, doc.querySelector("#selPkg"), "basic"); await tick(5);
    const CAT = ["destinations", "HND", "packages", "basic", "pricing", "adult", "2"];
    before = HND().packages[0].pricing.adult["2"];
    ok(![...doc.querySelectorAll("input.ed")].some(x => x.dataset.path.includes('"fx"')), "FX is read-only when not editing");
    click(w, doc.querySelector("#btnEdit")); await tick(5);
    ok([...doc.querySelectorAll("input.ed")].some(x => x.dataset.path === JSON.stringify(["destinations", "HND", "fx", "WIF", "value"])), "FX is editable in Edit costs (the hub owns FX)");
    ok([...doc.querySelectorAll("table.torates input.ed")].some(x => x.dataset.path === JSON.stringify(["destinations", "HND", "rates", "hnd7", "value"])), "Edit costs: Tokyo supplier rates are editable on the Costing tab (Haneda 7-seater)");
    const inp = [...doc.querySelectorAll("input.ed")].find(x => x.dataset.path === JSON.stringify(CAT));
    ok(inp, "Basic 2 pax catalog price is editable in the costing table");
    setVal(w, inp, String(before + 100)); await tick(10);
    ok(near(P.priceRow(HND(), HND().packages[0], "WIF-BSC", 2).adult.catalog, before + 100), "catalog +100 recalculates");
    ok(doc.querySelector("#btnSave")?.textContent.includes("(1)"), "save button shows 1 change");
    click(w, doc.querySelector("#btnSave")); await tick(5);
    click(w, doc.querySelector("#doSave")); await tick(5);
    ok(doc.querySelector(".err-t").textContent.includes("note"), "note is required");
    doc.querySelector("#saveNote").value = "Basic catalog 2027";
    click(w, doc.querySelector("#doSave"));
    ok(await until(() => P.BASE.version === V0 + 1), "saved as V0+1");
    const remote = JSON.parse(repo.files(repo.head)["data/data.json"]);
    ok(remote.version === V0 + 1 && remote.updatedBy === "thania", "repo data.json V0+1 by thania");
    ok(byCode(remote,'HND').packages[0].pricing.adult["2"] === before + 100, "repo has new catalog price");
    const hist = JSON.parse(repo.files(repo.head)["data/history.json"]);
    const e = hist.entries.find(x => x.v === V0 + 1);
    ok(e && e.by === "thania" && e.changes.length === 1 && e.changes[0].from === before && e.changes[0].label.includes("@2 pax"), "history entry V0+1 with readable label");
    ok(repo.log.at(-1).startsWith(`v${V0 + 1} · thania: Basic catalog`), "one commit with version message");
    ok(await until(() => repo.dispatches >= 1), "save starts the PT Catalog House mirror (workflow_dispatch on catalog-pt-public)");
    // the catalog has no prices of its own: a price save stamps price_version so catalog-pt-public rebuilds it
    const catNow = JSON.parse(repo.files(repo.head)["data/catalogs/tokyo-basic.json"]), cat0 = JSON.parse(files["data/catalogs/tokyo-basic.json"]);
    ok(catNow.hub_version === V0 + 1 && !catNow.prices.rows.some(r => "amounts" in r), "catalog tokyo-basic: hub_version V0+1, still no amounts in the file");
    ok(JSON.stringify({ ...catNow, hub_version: null, updated: null }) === JSON.stringify({ ...cat0, hub_version: null, updated: null }), "nothing else changed in the catalog");
    ok(JSON.parse(repo.files(repo.head)["data/catalogs/index.json"])["tokyo-basic"].updated === catNow.updated, "catalog + index.json updated in the same commit");
    ok(e.catalogs && e.catalogs[0].includes("tokyo-basic"), "history entry lists the catalog rebuild: " + (e.catalogs || []).join("; "));
    click(w, doc.querySelector("#btnHistory")); await tick(5);
    ok(doc.querySelector(".tabm.on").dataset.tabmain === "history" && doc.querySelector("#grid").textContent.includes("Basic catalog 2027") && doc.querySelector("#grid").textContent.includes("Added destinations"), "History button opens the History tab with the notes");
    const snap = P.snapshotAt(V0);
    ok(byCode(snap,"HND").packages[0].pricing.adult["2"] === before, "V0 rebuilt from change log");
    // newest version listed on this page's History (V0 itself may not touch HND)
    const VV = Math.max(...[...doc.querySelectorAll("[data-view]")].map(x => +x.dataset.view).filter(v => v <= V0));
    click(w, doc.querySelector(`[data-view="${VV}"]`)); await tick(5);
    ok(doc.querySelector("#banners").textContent.includes(`Read-only: version ${VV}`), "viewing older version banner");
    click(w, doc.querySelector('[data-act="restore"]')); await tick(5);
    ok(doc.querySelector("#saveNote").value === `Restore to v${VV}`, "restore pre-fills note");
    click(w, doc.querySelector("#doSave"));
    ok(await until(() => P.BASE.version === V0 + 2), "restore saved as V0+2 " + (doc.querySelector(".err-t") || {}).textContent);
    ok(HND().packages[0].pricing.adult["2"] === before, "catalog back to V0");
  }

  console.log("7. concurrent saves");
  {
    // someone else saves v4 changing the Qayyum FX
    const other = JSON.parse(repo.files(repo.head)["data/data.json"]);
    byCode(other,'HND').fx.find(f => f.id === "QAYYUM").value = 0.026; other.version = V0 + 3;
    const oh = JSON.parse(repo.files(repo.head)["data/history.json"]);
    oh.entries.push({ v: V0 + 3, at: new Date().toISOString(), by: "ezie", note: "fx", changes: [{ path: ["destinations", "HND", "fx", "QAYYUM", "value"], from: 0.0259, to: 0.026 }] });
    let [, t] = repo.handle("POST", "https://api.github.com/repos/x/y/git/trees", { base_tree: repo.commits[repo.head].tree, tree: [{ path: "data/data.json", content: JSON.stringify(other) }, { path: "data/history.json", content: JSON.stringify(oh) }] }, "Bearer tok-valid");
    let [, c] = repo.handle("POST", "https://api.github.com/repos/x/y/git/commits", { tree: t.sha, parents: [repo.head], message: "other" }, "Bearer tok-valid");
    repo.handle("PATCH", "https://api.github.com/repos/x/y/git/refs/heads/main", { sha: c.sha }, "Bearer tok-valid");
    // we (still on v3) edit a different cell
    await tab(w, doc, "costing");
    click(w, doc.querySelector("#btnEdit")); await tick(5);
    const inp = [...doc.querySelectorAll("input.ed")].find(x => x.dataset.path === JSON.stringify(["destinations", "HND", "packages", "basic", "pricing", "adult", "3"]));
    setVal(w, inp, "5111"); await tick(10);
    click(w, doc.querySelector("#btnSave")); await tick(5);
    doc.querySelector("#saveNote").value = "ropeway price";
    click(w, doc.querySelector("#doSave"));
    ok(await until(() => P.BASE.version === V0 + 4), "different cell → replayed on top, saved V0+4");
    const r5 = JSON.parse(repo.files(repo.head)["data/data.json"]);
    ok(byCode(r5,'HND').fx.find(f => f.id === "QAYYUM").value === 0.026 && byCode(r5,'HND').packages[0].pricing.adult["3"] === 5111, "both users' edits kept");
    // same cell clash
    const o2 = JSON.parse(JSON.stringify(r5)); byCode(o2,'HND').packages[0].pricing.adult["3"] = 5222; o2.version = V0 + 5;
    [, t] = repo.handle("POST", "https://api.github.com/repos/x/y/git/trees", { base_tree: repo.commits[repo.head].tree, tree: [{ path: "data/data.json", content: JSON.stringify(o2) }] }, "Bearer tok-valid");
    [, c] = repo.handle("POST", "https://api.github.com/repos/x/y/git/commits", { tree: t.sha, parents: [repo.head], message: "other 2" }, "Bearer tok-valid");
    repo.handle("PATCH", "https://api.github.com/repos/x/y/git/refs/heads/main", { sha: c.sha }, "Bearer tok-valid");
    await tab(w, doc, "costing");
    click(w, doc.querySelector("#btnEdit")); await tick(5);
    const inp2 = [...doc.querySelectorAll("input.ed")].find(x => x.dataset.path === JSON.stringify(["destinations", "HND", "packages", "basic", "pricing", "adult", "3"]));
    setVal(w, inp2, "5333"); await tick(10);
    click(w, doc.querySelector("#btnSave")); await tick(5);
    doc.querySelector("#saveNote").value = "clash";
    click(w, doc.querySelector("#doSave"));
    ok(await until(() => doc.querySelector(".err-t")?.textContent.includes("same cells")), "same-cell clash is refused, not overwritten");
    ok(byCode(JSON.parse(repo.files(repo.head)["data/data.json"]),"HND").packages[0].pricing.adult["3"] === 5222, "other user's value untouched");
    click(w, doc.querySelector("[data-close]"));
  }

  console.log("8. editor cannot see admin tools; formulas admin-only");
  {
    click(w, doc.querySelector("#btnAcct")); await tick(5);
    ok(!doc.querySelector("#doAdd"), "editor has no Add user");
    click(w, doc.querySelector("[data-close]"));
    ok(!doc.querySelector('[data-tabmain="rates"]') && !doc.querySelector('[data-tabmain="quote"]'), "no Rates & FX or Quote tab");
  }

  console.log("8a. TO Contract Rate: upload, list, remove");
  {
    if (doc.querySelector('[data-act="discard"]')) { click(w, doc.querySelector('[data-act="discard"]')); await tick(5); }   // drop the clash edit from 7.
    await tab(w, doc, "contracts");
    const n0 = (HND().contracts || []).length;
    ok(doc.querySelector("#crFile") && doc.querySelectorAll("#contracts tbody tr").length === n0, "upload form + existing files listed when logged in");
    const pdf = "%PDF-1.4 rate card \u00ff test";
    const f = new w.File([Buffer.from(pdf, "latin1")], "WIF Rate Card 2027.pdf", { type: "application/pdf" });
    Object.defineProperty(doc.querySelector("#crFile"), "files", { value: [f], configurable: true });
    doc.querySelector("#crNote").value = "WIF 2027";
    const v0 = JSON.parse(repo.files(repo.head)["data/data.json"]).version;   // 7. left a newer remote version
    click(w, doc.querySelector("#doUpload"));
    ok(await until(() => P.BASE.version === v0 + 1), "upload saved as a new version");
    const files = repo.files(repo.head), all = byCode(JSON.parse(files["data/data.json"]), "HND").contracts, cr = all.filter(c => c.by === "thania");
    ok(all.length === n0 + 1 && cr.length === 1 && cr[0].name === "WIF Rate Card 2027.pdf" && cr[0].note === "WIF 2027" && cr[0].by === "thania" && /^contracts\/hnd\/\w+-WIF_Rate_Card_2027\.pdf$/.test(cr[0].file), "data.json lists the file: " + JSON.stringify(cr));
    ok(files[cr[0].file] === pdf, "file bytes committed to the repo");
    ok(repo.log.at(-1).includes("Uploaded WIF Rate Card 2027.pdf"), "commit message names the file");
    const link = [...doc.querySelectorAll("#contracts tbody a")].find(a => a.textContent === cr[0].name);
    ok(link && link.getAttribute("href") === "../" + cr[0].file && doc.querySelector("#contracts").textContent.includes("WIF 2027"), "file listed with link and note");
    const h = JSON.parse(files["data/history.json"]).entries.at(-1);
    ok(h.summary[0].includes("TO Contract Rate: Uploaded") && h.changes[0].path.join() === "destinations,HND,contracts", "history entry for the upload");
    click(w, doc.querySelector(`[data-delcr="${cr[0].id}"]`));
    ok(await until(() => P.BASE.version === v0 + 2), "remove saved as a new version");
    const f2 = repo.files(repo.head);
    ok(byCode(JSON.parse(f2["data/data.json"]), "HND").contracts.length === n0 && f2[cr[0].file] === undefined, "file and list entry removed");
    click(w, doc.querySelector("#btnLogout")); await tick(5);
    ok(!doc.querySelector("#crFile") && doc.querySelector("#contracts").textContent.includes("Log in to upload"), "logged out: no upload form");
  }

  console.log("8b. costing by pax (R&D layout): components ÷ pax = Cost/Pax, + Margin = Selling, Margin × pax = Total Gross");
  {
    await tab(w, doc, "costing");
    setVal(w, doc.querySelector("#selPkg"), "standard"); setVal(w, doc.querySelector("#selVar"), "auto"); await tick(5);
    click(w, doc.querySelector('#costPax [data-tab="adult"]')); await tick(5);
    ok(doc.querySelector(".summary") && doc.querySelector(".summary").textContent.includes("Lowest margin"), "costing summary strip");
    const titles = [...doc.querySelectorAll("#costPax tr.blk-title")].map(t => t.textContent);
    ok(titles.length === 2 && titles[0].includes("Qayyum") && titles[1].includes("/ WIF"), "one block per TO: " + titles.join(" | "));
    const heads = [...doc.querySelectorAll("#costPax tr.blk-head")].map(h => [...h.children].map(t => t.textContent));
    ok(heads[0].some(h => h.startsWith("Airport Haneda")) && heads[0].includes("Cost/Pax") && heads[0].includes("Total Gross"), "header names: " + heads[0].join("|"));
    ok(!doc.querySelector("#costPax .hint") && !doc.querySelector("#costPax .calc"), "no rate formulas until Show calculation is on");
    ok(!doc.querySelector("#rateRef"), "Rate reference hidden by default");
    click(w, doc.querySelector('#costPax [data-calc]')); await tick(5);
    ok(!doc.querySelector("#rateRef"), "Show calculation alone does not open Rate reference");
    click(w, doc.querySelector('#costPax [data-ref]')); await tick(5);
    ok(doc.querySelector('#costPax [data-ref]').textContent === "Hide rate reference", "button reads Hide rate reference when open");
    const rr = [...doc.querySelectorAll("#rateRef tr")].map(r => [...r.children].map(x => x.textContent)), col = c => rr.map(r => r[rr[0].indexOf(c)]);
    ok(col("A").slice(1).join("|") === "Haneda 7-seater|Qayyum|¥22,000" && col("B")[3] === "¥81,000" && col("E")[3] === "RM250", "Rate reference (horizontal) A/B/E: " + JSON.stringify([col("A"), col("B"), col("E")]));
    ok(col("W")[1].startsWith("FX Qayyum") && col("W")[3] === "0.026" && col("X")[3] === "0.029", "Rate reference FX codes W (Qayyum 0.026), X (WIF 0.029): " + JSON.stringify([col("W"), col("X")]));
    ok(col("I")[1] === "Fuji Tour 10-seater · 8–9 pax" && col("K")[1] === "Fuji Tour 14-seater · 10–14 pax" && col("M")[1] === "Fuji Tour Coaster 16–18 seat · 15–18 pax" && col("O")[1] === "Fuji Tour Bus 30 seat · 19+ pax", "band rates show their pax range: " + [col("I")[1], col("K")[1], col("M")[1], col("O")[1]].join(" / "));
    const calcRow = tr => [...tr.querySelectorAll(".calc")].map(x => x.textContent.replace(/ = [\d,]+$/, ""));
    const rows = [...doc.querySelectorAll("#costPax tr[data-pax]")], q2 = rows.find(r => r.dataset.pax === "2");
    ok(calcRow(q2).join("|") === "A × 2 × W|(B + C × 3) × W|D × 2 pax × X|E × 4 × 2 pax", "Qayyum 2 pax calculation: " + calcRow(q2).join("|"));
    ok(q2.children[1].textContent.endsWith("= 1,144"), "airport cell = formula = RM1,144: " + q2.children[1].textContent);
    const wBlk = [...doc.querySelectorAll("#costPax tr.blk-title")][1], w1 = (() => { let r = wBlk.nextElementSibling.nextElementSibling; return r; })();
    const wp = +w1.dataset.pax, wa = calcRow(w1)[0];
    ok(wa === (wp <= 9 ? "F" : wp <= 18 ? "G" : "H") + " × 2 × X", "WIF block airport uses the band at its pax (" + wp + "): " + wa);
    const g = calcRow(w1).find(x => x.includes("Q + R"));
    ok(g === "((Q + R + S + T) + (U + R + S + T) × 4) × X", "guide formula uses the rate codes (not N = nights): " + g);
    click(w, doc.querySelector('#costPax [data-calc]')); await tick(5);
    ok(!doc.querySelector("#costPax .calc") && doc.querySelector("#rateRef"), "Show calculation off: formulas gone, Rate reference stays");
    click(w, doc.querySelector('#costPax [data-ref]')); await tick(5);
    ok(!doc.querySelector("#rateRef"), "Hide rate reference");
    ok(heads[0].indexOf("Catalog Price") === heads[0].indexOf("Selling Price") - 1, "Catalog Price sits right before 'Selling Price'");
    ok(!heads[0].some(h => h.startsWith("WIF service charge")) && heads[1].some(h => h.startsWith("WIF service charge")), "WIF-only columns blank in the Qayyum block");
    const n = t => { const v = t.replace(/[^\d.\-−]/g, "").replace("−", "-"); return v === "" ? 0 : parseFloat(v); };
    let checked = 0;
    for (const tr of doc.querySelectorAll("#costPax tr[data-pax]")) {
      const td = [...tr.children].map(x => x.textContent.trim()), p = +td[0];
      const nComp = heads[0].indexOf("Cost/Pax") - 1;
      const sum = td.slice(1, 1 + nComp).reduce((a, x) => a + n(x), 0);
      const catEl = tr.children[2 + nComp], catIn = catEl.querySelector("input");
      const cost = n(td[1 + nComp]), cat = catIn ? +catIn.value : n(td[2 + nComp]), sell = n(td[3 + nComp]), m = n(td[4 + nComp]), gross = n(td[6 + nComp]);
      ok(Math.abs(cat - 200 - sell) <= 1, `pax ${p}: catalog ${cat} − 200 = selling ${sell}`);
      ok(Math.abs(sum / p - cost) <= 0.5 + nComp * 0.5 / p, `pax ${p}: ${sum}/${p} ≈ ${cost}`);
      ok(Math.abs(cost + m - sell) <= 1, `pax ${p}: ${cost} + ${m} = ${sell}`);
      ok(Math.abs(m * p - gross) <= p, `pax ${p}: ${m} × ${p} ≈ ${gross}`);
      checked++;
    }
    ok(checked >= 29, "rows 2–30 present (" + checked + ")");
    const r2 = [...doc.querySelectorAll("#costPax tr[data-pax]")].find(r => r.dataset.pax === "2");
    const qfx = HND().fx.find(f => f.id === "QAYYUM").value, qrate = HND().rates.find(r => r.id === "hndQ").value;
    ok(r2.children[1].textContent.trim() === Math.round(2 * qrate * qfx).toLocaleString("en-MY"), `Qayyum 2 pax airport = 2 × ¥${qrate} × ${qfx}, got ` + r2.children[1].textContent.trim());
    click(w, doc.querySelector('#costPax [data-tab="cnb"]')); await tick(5);
    ok(doc.querySelector("#costPax").textContent.includes("adult cost − RM1,200"), "CNB tab shows its cost rule");
  }

  console.log("8c. add-ons");
  {
    const hnd = HND(), a = hnd.addons.find(x => x.label.startsWith("Disneyland/Disneysea (2 pax)"));
    ok(a && a.cost === 754 && a.selling === 800, "Disneyland 2 pax add-on transcribed");
    await tab(w, doc, "addons");
    const q = doc.querySelector(`input.aq[data-addon="${a.id}"]`); setVal(w, q, "2"); await tick(5);
    ok(doc.querySelector("#addons .total").textContent.includes("RM1,600.00") && doc.querySelector("#addons .total").textContent.includes("RM92.00"), "2 × Disneyland = RM1,600 selling, RM92 margin");
    setVal(w, doc.querySelector(`input.aq[data-addon="${a.id}"]`), "0"); await tick(5);
    const sel = byCode(P.DATA, "SEL");
    ok(sel.addons.length > 40 && sel.addons.some(x => x.cost === null) && !sel.addons.some(x => x.cost === 0), "Seoul add-ons keep missing cost as null, not 0");
    const aceh = byCode(P.DATA, "ACEH"), ap = aceh.packages[0], ar = P.priceRow(aceh, ap, ap.assign[0].variant, 2);
    const ground = ar.cost.comps.find(c => c.key === "ground-cost").perPax;
    ok(near(ar.cwb.cost, ar.adult.cost - ground + 0.75 * ground), "Aceh CWB cost = 75% of Ground + tipping in full");
  }

  console.log("8d. hub and other destination pages");
  {
    const hub = await boot(repo, "");
    const links = [...hub.doc.querySelectorAll("#grid a")].map(a => a.getAttribute("href"));
    ok(["sel/?pkg=atk-bsc", "sel/?pkg=atk-std", "seljju/?pkg=atk-std", "hnd/?pkg=basic", "hnd/?pkg=standard", "kbv/?pkg=honeymoon", "aceh/?pkg=asonanggroe-3-star"].every(l => links.includes(l)), "hub links per catalog package: " + links.slice(0, 12).join(","));
    const hubRows = [...hub.doc.querySelectorAll("#grid .row")];
    const nCat = P.DATA.destinations.reduce((s, d) => s + (d.catalogs || []).length, 0);
    ok(hubRows.length === nCat && nCat >= 60, `hub: one row per catalog package (${nCat}), got ${hubRows.length}`);
    const names = hubRows.map(r => r.title + " " + r.children[0].textContent + " " + r.children[2].textContent);
    ok(!names.some(n => /ASONANGGROE|ATK-|WIF-|KTT-|MLE-|Bahrun|Legend-|IBRAHIM/i.test(n)), "hub shows package names, no TO names");
    ok(names.some(n => n.includes("PT ISTANBUL BURSA 5D4N") && n.includes("ISTBUR ·")), "Istanbul Bursa listed under ISTBUR");
    const srch = hub.doc.querySelector("#hubSearch"); srch.value = "maldives"; srch.dispatchEvent(new hub.w.Event("input", { bubbles: true }));
    const vis = hubRows.filter(r => r.style.display !== "none");
    ok(vis.length === byCode(P.DATA, "MLE").catalogs.length, "hub search 'maldives' shows only Maldives packages (" + vis.length + ")");
    srch.value = ""; srch.dispatchEvent(new hub.w.Event("input", { bubbles: true }));
    ok(hubRows.every(r => r.children.length === 4 && r.querySelector(".tier") && / · \S/.test(r.children[2].textContent) && /updated \d{4}-\d{2}-\d{2}/.test(r.children[3].textContent)), "hub rows = route + tier | duration | code · PO | updated date");
    const hndStd = hubRows.find(r => r.title.includes("TOKYO STANDARD"));
    ok(/v\d+ · /.test(hndStd.children[3].title), "Tokyo Standard last update shows the saved version: " + hndStd.children[3].title);
    const deep = await boot(repo, "sel/", "?pkg=atk-std");
    ok(deep.doc.querySelector("#selPkg").value === "atk-std", "sel/?pkg=atk-std opens Seoul Standard");
    ok(/PO\s*Aiman/.test(deep.doc.querySelector("#controls").textContent), "Seoul page shows PO Aiman");
    // Osaka / Tokyo-Osaka are rate by rate too (tools/build_jp_rates.py): codes + Rate reference
    for (const [path, pkg, want] of [["osk/", "ucop-std-wif-std", "A × 2 × J|B × J|C × 4 × 2 pax"], ["kix/", "qay-ucop-std-wif-std", "(A + B) × O|C × O|D × 2 pax|E × 2 pax × P|F × 6 × 2 pax"]]) {
      const pg = await boot(repo, path, "?pkg=" + pkg), $c = s => pg.doc.querySelector("#costPax " + s);
      click(pg.w, $c("[data-ref]")); await tick(5); click(pg.w, $c("[data-calc]")); await tick(5);
      const r2 = pg.doc.querySelector('#costPax tr[data-pax="2"]'), got = [...r2.querySelectorAll(".calc")].map(x => x.textContent.replace(/ = [\d,]+$/, "")).join("|");
      ok(got === want, path + " 2 pax calculation: " + got);
      ok(pg.doc.querySelectorAll("#rateRef thead th.rr-code").length >= 10, path + " Rate reference columns");
      ok(pg.errors.length === 0, path + " errors: " + pg.errors.join("|"));
    }
    const hubPO = [...hub.doc.querySelectorAll("#grid .row")].map(r => r.children[2].textContent.split(" · ")[1].trim());
    const poCount = n => P.DATA.destinations.filter(d => d.po === n).reduce((s, d) => s + d.catalogs.length, 0);
    ok(["Aiman", "Thania", "Fyka", "Acap"].every(n => hubPO.filter(x => x === n).length === poCount(n)), "hub PO column matches each destination's PO");
    ok(hub.doc.querySelector("#controls").style.display === "none", "hub has no calculator controls");
    ok(hub.errors.length === 0, "hub errors: " + hub.errors.join("|"));
    const sj = await boot(repo, "seljju/", "#quote");   // old #quote link falls back to Costing
    ok(sj.doc.querySelector("#controls").textContent.includes("Seoul - Jeju"), "/seljju/ shows Seoul - Jeju");
    ok(sj.doc.querySelector(".tabm.on").dataset.tabmain === "costing" && sj.doc.querySelector('#costPax tr[data-pax="2"] td.sp').textContent.includes("5,997"), "Seoul-Jeju 2 pax selling 5,997 (catalog 6,197 − 200, v29); #quote opens Costing");
    const kb = await boot(repo, "kbv/", "?pkg=standard#quote");
    const hotelSel = kb.doc.querySelector("#opt_hotel");
    ok(hotelSel && hotelSel.options.length === byCode(P.DATA, "KBV").options[0].choices.length, "Krabi has a hotel selector");
    const before4 = kb.doc.querySelector("#costPax").textContent;
    const fourStar = byCode(P.DATA, "KBV").options[0].choices.find(c => c.star === "4★");
    hotelSel.value = fourStar.id; hotelSel.dispatchEvent(new kb.w.Event("change", { bubbles: true })); await tick(5);
    ok(kb.doc.querySelector("#controls").textContent.includes("catalog +RM250") && kb.doc.querySelector("#costPax").textContent !== before4, "4★ hotel adds RM250 to the Standard catalog and changes the costing");
    const seasonSel = kb.doc.querySelector("#opt_season"); seasonSel.value = "High"; seasonSel.dispatchEvent(new kb.w.Event("change", { bubbles: true })); await tick(5);
    ok(kb.doc.querySelector("#opt_season").value === "High" && kb.errors.length === 0, "season selector works " + kb.errors.join("|"));
    { const K = byCode(P.DATA, "KBV"), st = K.packages.find(p => p.id === "standard");
      const a = P.priceRow(K, st, "std-emerald", 2), c = P.priceRow(K, st, "std-phiphi", 2);
      ok(c.adult.selling === a.adult.selling + 100 && c.cwb.selling === a.cwb.selling + 100, "Krabi Day 3 Phi Phi sells +RM100 (variants[].sellingUpgrade, catalog)"); }
    const fp = await boot(repo, "flags/");
    const nF = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "flags.json"), "utf8")).flags;
    ok(fp.doc.querySelectorAll(".flags tbody tr").length === nF.filter(f => f.severity !== "low").length, "flags page: high + medium shown by default");
    click(fp.w, fp.doc.querySelector('[data-sev="low"]')); await tick(5);
    ok(fp.doc.querySelectorAll(".flags tbody tr").length === nF.length && fp.errors.length === 0, "flags page: all " + nF.length + " with Low on");
    const jb = await boot(repo, "jbdo/", "#flags");
    ok(jb.doc.querySelector("#grid") && !jb.doc.querySelector("#grid").textContent.includes("price but no cost"), "JBDO Flags tab: no more 'price but no cost' (11–19 pax costed)");
    ok(jb.doc.querySelector(".fxbox").textContent.includes("MYR direct"), "MYR-direct destination says so");
    await tab(jb.w, jb.doc, "costing");
    const jh = [...jb.doc.querySelectorAll("#costPax tr.blk-head th")].map(t => t.textContent);
    ok(!jh.includes("Tipping") && !jh.includes("Ground Cost") && jh[1] === "Cost/Pax", "JBDO: RM0 Tipping hidden; Ground Cost is the only line, so it is Cost/Pax: " + jh.join("|"));
    ok(![...jb.doc.querySelectorAll("#costPax tr[data-pax] td")].some(td => td.textContent.trim() === "0"), "no RM0 component cells shown");
    for (const tb of ["costing", "contracts", "addons", "flags", "history"]) { await tab(jb.w, jb.doc, tb); ok(jb.errors.length === 0 && (jb.doc.querySelector("#grid").textContent.length > 20 || (tb === "flags" && jb.doc.querySelector("#grid").textContent.includes("No flags"))), "JBDO tab " + tb + " renders"); }
    for (const code of ["mle", "phu", "cts", "aceh", "kix"]) {
      const pg = await boot(repo, code + "/");
      ok(pg.doc.querySelector("#costPax") && pg.errors.length === 0, `/${code}/ renders without errors ` + pg.errors.join("|"));
    }
    ok(sj.errors.length === 0, "seljju errors: " + sj.errors.join("|"));
    fs.mkdirSync(path.join(ROOT, "zzz"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, "zzz", "index.html"), fs.readFileSync(path.join(ROOT, "hnd", "index.html"), "utf8").replace('"HND"', '"ZZZ"'));
    const bad = await boot(repo, "zzz/");
    fs.rmSync(path.join(ROOT, "zzz"), { recursive: true });
    ok(bad.doc.querySelector("#grid").textContent.includes("No destination with code ZZZ"), "unknown code shows a message");
  }

  console.log("8e. catalog sections: Costing price table, Itinerary editable, Add On tick — saved into data/catalogs/<slug>.json");
  {
    const V = P.BASE.version;
    await tab(w, doc, "costing"); setVal(w, doc.querySelector("#selPkg"), "standard"); await tick(5);
    await tab(w, doc, "itinerary"); await until(() => doc.querySelector("#cat-tokyo-standard"));
    const pkg = HND().packages.find(p => p.id === "standard");
    if (!doc.querySelector("#btnEdit")) {
      click(w, doc.querySelector("#btnLogin")); await tick(5);
      doc.querySelector("#lu").value = "thania"; doc.querySelector("#lp").value = "thania-pass-2026";
      click(w, doc.querySelector("#doLogin"));
    }
    ok(await until(() => doc.querySelector("#btnEdit")), "editor logged in");
    if (!/Stop/.test(doc.querySelector("#btnEdit").textContent)) { click(w, doc.querySelector("#btnEdit")); await tick(5); }
    await tab(w, doc, "costing"); await until(() => doc.querySelector("#cat-tokyo-standard-price"));
    const first = doc.querySelector("#cat-tokyo-standard-price .cd-t tbody tr td.num");
    ok(first && first.textContent === "RM" + (+pkg.pricing.adult["2"]).toLocaleString("en-US"), "Costing (Edit): catalog price table = Catalog Price column (2 pax adult): " + (first && first.textContent));
    await tab(w, doc, "itinerary");
    const cpath = (...p) => JSON.stringify(["tokyo-standard", ...p]);
    const titleIn = [...doc.querySelectorAll("input.ed.cat")].find(x => x.dataset.cpath === cpath("itinerary", 0, "title"));
    ok(titleIn && [...doc.querySelectorAll("input.ed.cat, textarea.ed.cat")].length > 20, "header, hotels, itinerary, includes/excludes are editable");
    setVal(w, titleIn, "KUL - HND (edited)"); await tick(10);
    const acts = [...doc.querySelectorAll("textarea.ed.cat")].find(x => x.dataset.cpath === cpath("itinerary", 0, "activities"));
    setVal(w, acts, acts.value + "\nWelcome dinner\n  - halal"); await tick(10);
    await tab(w, doc, "addons");
    const fuji = HND().addons.find(a => a.catalogs && "tokyo-standard" in a.catalogs && /Fuji Day Tour/.test(a.label)), nIn = HND().addons.filter(a => a.catalogs && "tokyo-standard" in a.catalogs).length;
    const tk = [...doc.querySelectorAll("input.aotick")].find(x => JSON.parse(x.dataset.tick).id === fuji.id);
    ok(tk && tk.checked && !tk.disabled, "Add On (Edit): tick enabled for " + fuji.label);
    tk.checked = false; fire(w, tk, "change"); await tick(10);
    ok(!(fuji.catalogs || {})["tokyo-standard"] && HND().addons.filter(a => a.catalogs && "tokyo-standard" in a.catalogs).length === nIn - 1, "untick removes it from the catalog");
    ok(doc.querySelector("#aoLabel") && doc.querySelector('[data-act="addAddon"]'), "Add On (Edit): Add item form");
    doc.querySelector("#aoCat").value = "Add On Activity"; doc.querySelector("#aoLabel").value = "Shibuya Sky Observatory";
    doc.querySelector("#aoPer").value = "pax"; doc.querySelector("#aoCost").value = "120"; doc.querySelector("#aoSell").value = "150";
    click(w, doc.querySelector('[data-act="addAddon"]')); await tick(10);
    const added = HND().addons.find(a => a.label === "Shibuya Sky Observatory");
    ok(added && /^hnd-n\d{3}$/.test(added.id) && added.cost === 120 && added.selling === 150 && added.per === "pax" && added.category === "Add On Activity", "new item added with cost / selling / per / category: " + JSON.stringify(added));
    ok(added && added.catalogs && added.catalogs["tokyo-standard"] > 0 && JSON.stringify(added.price_lines) === JSON.stringify(["RM150/pax"]), "new item ticked for tokyo-standard, catalog price text RM150/pax");
    ok([...doc.querySelectorAll("#addons input.ed")].some(x => x.value === "Shibuya Sky Observatory"), "new item listed (editable)");
    ok(doc.querySelector("#btnSave") && doc.querySelector("#btnSave").textContent.includes("(4)"), "Save counts 2 catalog edits + 1 add-on tick + 1 new item: " + (doc.querySelector("#btnSave") || {}).textContent);
    click(w, doc.querySelector("#btnSave")); await tick(5);
    doc.querySelector("#saveNote").value = "Tokyo Std itinerary";
    click(w, doc.querySelector("#doSave"));
    ok(await until(() => P.BASE.version === V + 1), "saved as one version");
    const cat = JSON.parse(repo.files(repo.head)["data/catalogs/tokyo-standard.json"]);
    ok(cat.itinerary[0].title === "KUL - HND (edited)" && JSON.stringify(cat.itinerary[0].activities.at(-1)) === JSON.stringify({ text: "Welcome dinner", sub: ["halal"] }), "catalog file has the edits (sub-item from '  - ')");
    ok(!cat.prices.rows.some(r => "amounts" in r) && !("addons" in cat) && cat.hub_version === V + 1, "no prices / add-ons written into the catalog; hub_version stamped for the add-on change");
    const rem = JSON.parse(repo.files(repo.head)["data/data.json"]), fujiNow = byCode(rem, "HND").addons.find(a => a.id === fuji.id);
    ok(!(fujiNow.catalogs || {})["tokyo-standard"], "repo data.json: Fuji Day Tour no longer ticked for tokyo-standard");
    ok(byCode(rem, "HND").addons.some(a => a.label === "Shibuya Sky Observatory" && a.catalogs && a.catalogs["tokyo-standard"]), "repo data.json: new item saved, ticked for tokyo-standard");
    const e = JSON.parse(repo.files(repo.head)["data/history.json"]).entries.find(x => x.v === V + 1);
    ok(e && e.changes.filter(c => c.path[0] === "catalogs" && c.path[1] === "tokyo-standard").length === 2 && e.changes.some(c => c.path[2] === "addons"), "history lists the 2 catalog edits + the add-on changes");
    ok(JSON.parse(repo.files(repo.head)["data/data.json"]).version === V + 1, "data.json version bumped with it");
    ok(!doc.querySelector("#btnSave"), "nothing pending after save");
    click(w, doc.querySelector("#btnEdit")); await tick(5);
  }

  console.log("8g. Info KB + Simple Calculator tabs: PT KB House content from data/kb/<slug>.json, edited and saved like the catalogs");
  {
    const V = P.BASE.version, kb0 = JSON.parse(files["data/kb/jepun.json"]), clone0 = o => JSON.parse(JSON.stringify(o));
    if (doc.querySelector("#btnEdit") && doc.querySelector("#btnEdit").textContent.includes("Stop")) { click(w, doc.querySelector("#btnEdit")); await tick(5); }
    await tab(w, doc, "kbinfo"); await until(() => doc.querySelector("#kb-attr"));
    const g = doc.querySelector("#grid"), t = g.textContent, a0 = kb0.content.attractions[0];
    ok(doc.querySelector('[data-tabmain="kbinfo"]').textContent === "Info KB" && doc.querySelector('[data-tabmain="kbcalc"]').textContent === "Simple Calculator", "tabs named Info KB and Simple Calculator");
    ok(t.includes(a0.n) && t.includes("Muslim-friendly") && g.querySelectorAll(".kb-attr").length >= kb0.content.attractions.length, "Info KB (HND → jepun KB): attractions with Muslim-friendly info");
    ok(g.querySelectorAll("#kb-faq details.kb-faq").length > 3 && g.querySelectorAll("#kb-blocks details").length > 3, "Info KB: FAQ sections and KB tab blocks (transport, flight, free gift …)");
    ok(!g.querySelector('[data-kbtext] img[src^="@asset"]') && !g.innerHTML.includes("@asset:"), "no unresolved KB image tokens in the hub page");
    ok(!doc.querySelector("#kb-linked") && !doc.querySelector("#grid .cd-itin") && !doc.querySelector("#grid").textContent.includes("Catalog price table"), "Info KB does not repeat the Costing / Itinerary tabs (price, itinerary, includes / excludes)");
    ok(!kb0.content.packages.some((p, i) => kb0.map.packages[i] && ("inc" in p || "exc" in p)) && kb0.content.itineraries.every((x, i) => !kb0.map.packages[i] || x === null), "the KB file keeps no copy of a linked package's itinerary / includes / excludes");
    const q = doc.querySelector("#kbq"); q.value = "halal"; q.dispatchEvent(new w.Event("input", { bubbles: true })); await tick(5);
    const items = [...g.querySelectorAll("[data-kbtext]")];
    ok(items.some(x => x.style.display === "none") && items.some(x => x.style.display !== "none"), "Info KB search filters the attractions / FAQ");
    q.value = ""; q.dispatchEvent(new w.Event("input", { bubbles: true }));
    await tab(w, doc, "kbcalc"); await until(() => doc.querySelector("#rndCard"));
    ok(!doc.querySelector("#kbCalcFrame") && !doc.querySelector("#qcCard"), "Simple Calculator (R&D): no embedded KB calculator, no second quotation calculator");
    {
      ok(doc.querySelector("[data-rndpk]") && !/RM[\d,.]+\s*Costing/.test(doc.querySelector("#rndCard tbody").textContent), "Simple Calculator (R&D): Pakej (from the Costing tab) folded by default, one summary line");
      click(w, doc.querySelector("[data-rndpk]")); await tick(10);
      const rows = [...doc.querySelectorAll("#rndCard tbody tr:not(.cat)")], tiers = kb0.calc.variants.reduce((s, v) => s + (v.tiers || []).length, 0);
      ok(rows.length >= tiers && rows.some(r => /RM[\d,.]+\s*Costing/.test(r.textContent)), "Simple Calculator (R&D): Buka shows every package tier, costed from Costing");
      ok(doc.querySelectorAll(".rnd-chips button").length >= 3 && /Semua/.test(doc.querySelector(".rnd-chips").textContent) && /Tiada kos/.test(doc.querySelector(".rnd-chips").textContent), "Simple Calculator (R&D): status filter (Semua + the statuses present)");
      const tc = rows.find(r => /Tokyo City/.test(r.textContent) && /1–7 pax/.test(r.textContent)), hnd = byCode(w.PTCALC.DATA, "HND"), q = hnd.rates.find(r => r.id === "qCity"), fx = hnd.fx.find(f => f.id === q.fx).value;
      ok(tc && /HND · qCity/.test(tc.textContent) && tc.textContent.includes("RM" + Math.round(q.value * fx).toLocaleString("en-MY")), "Simple Calculator (R&D): extra day Tokyo City 1–7 pax costed by formula on the HND rate qCity × FX");
      const t9 = rows.find(r => /9–12 pax/.test(r.textContent) && /wCity1012/.test(r.textContent));
      ok(t9 && /wCity1012 \+ gFull \+ gAcc \+ gMeal \+ gTrn/.test(t9.textContent) && /tertinggi 10 pax/.test(t9.textContent), "formula shown as used in the band (band(pax, …) resolved), worst pax named");
    }
    ok(doc.querySelector("#kb-calc-cfg #calc-tiers") && doc.querySelectorAll("#calc-tiers .calc-pkg").length === kb0.calc.variants.length, "Simple Calculator (R&D): full Sales calculator config below the price list");
    ok(doc.querySelectorAll("#calc-addons tbody tr").length === (kb0.calc.addons || []).length && doc.querySelector('[data-act="calcMd"]'), "Sales calculator config: add-ons table + Muat turun .md");
    const md = w.PTCALC.calcMd("Jepun", kb0.calc, kb0.map.variants);
    ok(md.includes("## Pakej & harga tier") && md.includes("| Pax | Adult | CWB | CNB |"), "calculator config as Markdown");
    click(w, doc.querySelector("#btnEdit")); await tick(5);
    await tab(w, doc, "kbinfo"); await until(() => doc.querySelector("#kb-attr .kbed"));
    const mp = JSON.stringify(["jepun", "content", "attractions", 0, "muslim"]), mi = [...doc.querySelectorAll(".kbed")].find(x => x.dataset.kpath === mp);
    ok(mi, "Edit costs: attraction Muslim-friendly text is editable");
    mi.value = "Surau di stesen (diuji)"; fire(w, mi, "change"); await tick(10);
    await tab(w, doc, "kbcalc"); await until(() => doc.querySelector("#kb-calc-edit textarea"));
    {
      const sel = doc.querySelector("#rndCard select.rnd-ao");
      ok(sel && sel.options.length > 1, "Edit costs: an add-on row can be linked to a hub add-on");
      const ri = [...doc.querySelectorAll('#rndCard input.rnd-in')].find(x => !x.value), key = JSON.parse(ri.dataset.rndlink).key; ri.value = "12.5"; fire(w, ri, "change"); await tick(10);
      ok(w.PTCALC.KBEDIT().jepun.rnd.cost[key].rm === 12.5, "Edit costs: manual cost saved into the KB file (rnd.cost, not published to the KB)");
      const r3 = [...doc.querySelectorAll('#rndCard input.rnd-in')].find(x => JSON.parse(x.dataset.rndlink).key === key); r3.value = "qCity + gFull"; fire(w, r3, "change"); await tick(10);
      ok(w.PTCALC.KBEDIT().jepun.rnd.cost[key].expr === "R.qCity + R.gFull", "one cost box: a formula typed with bare rate names is saved on the Costing rates");
      const r2 = [...doc.querySelectorAll('#rndCard input.rnd-in')].find(x => JSON.parse(x.dataset.rndlink).key === key); r2.value = ""; fire(w, r2, "change"); await tick(10);
      ok(!((w.PTCALC.KBEDIT().jepun.rnd || {}).cost || {})[key], "clearing the cost removes that row's link");
    }
    let ta = doc.querySelector("#kb-calc-edit textarea"); ta.value = "{ broken"; fire(w, ta, "change"); await tick(10);
    ok(doc.querySelector("#btnSave").textContent.includes("(1)"), "broken calculator JSON is not accepted");
    const dep = [...doc.querySelectorAll("#calc-asas .kbed")].find(x => x.dataset.kpath === JSON.stringify(["jepun", "calc", "deposit"]));
    ok(dep, "Edit costs: deposit editable in the calculator table"); dep.value = "600"; fire(w, dep, "change"); await tick(10);
    ok(doc.querySelector("#btnSave").textContent.includes("(2)"), "Save counts the 2 KB edits: " + doc.querySelector("#btnSave").textContent);
    click(w, doc.querySelector("#btnSave")); await tick(5);
    doc.querySelector("#saveNote").value = "KB Jepun: surau + deposit";
    click(w, doc.querySelector("#doSave"));
    ok(await until(() => P.BASE.version === V + 1), "saved as one version");
    const kb1 = JSON.parse(repo.files(repo.head)["data/kb/jepun.json"]);
    ok(kb1.content.attractions[0].muslim === "Surau di stesen (diuji)" && kb1.calc.deposit === 600, "data/kb/jepun.json has both edits");
    ok(JSON.stringify({ ...kb1, calc: { ...kb1.calc, deposit: kb0.calc.deposit } }).length === JSON.stringify(kb0).length - kb0.content.attractions[0].muslim.length + "Surau di stesen (diuji)".length, "nothing else changed in the KB file");
    const e = JSON.parse(repo.files(repo.head)["data/history.json"]).entries.find(x => x.v === V + 1);
    ok(e && e.kb && e.kb[0].includes("jepun") && e.changes.every(c => c.path[0] === "kb" && c.label.startsWith("KB jepun")), "history entry lists the KB changes: " + (e && (e.kb || []).join("; ")));
    ok(JSON.parse(repo.files(repo.head)["data/data.json"]).version === V + 1, "data.json version bumped with it");
    ok(await until(() => repo.kbDispatches >= 1), "save starts the PT KB House mirror (workflow_dispatch on pt-kb-house)");
    await tab(w, doc, "history"); ok(doc.querySelector("#grid").textContent.includes("KB Jepun: surau + deposit"), "Tokyo History shows the KB change (jepun covers HND)");
    if (doc.querySelector("#btnEdit") && doc.querySelector("#btnEdit").textContent.includes("Stop")) { click(w, doc.querySelector("#btnEdit")); await tick(5); }
    const ac = await boot(repo, "aceh/", "#kbinfo"); await until(() => ac.doc.querySelector("#kb-attr"));
    ok(ac.doc.querySelector("#grid").textContent.includes("Masjid Raya Baiturrahman") && ac.errors.length === 0, "bespoke KB (aceh) shows in Info KB");
  }

  console.log("8h. Accommodation tab: one hotel list per destination; catalogs (Accommodation + Surcharge rows) and the KB read it");
  {
    const pg = await boot(repo, "dps/", "#accommodation"); await until(() => pg.doc.querySelector("#hotels tbody tr"));
    const P2 = pg.w.PTCALC, D2 = () => P2.DATA.destinations.find(d => d.code === "DPS"), V = P2.BASE.version;
    const cat0 = JSON.parse(repo.files(repo.head)["data/catalogs/bali-standard.json"]);
    ok(!("rows" in (cat0.surcharge || {})) && !("accommodation" in cat0), "catalog file keeps no hotel rows (they live in the Accommodation tab)");
    ok(pg.doc.querySelectorAll("#hotels tbody tr").length === D2().hotels.length && D2().hotels.some(h => (h.catalogs || {})["bali-standard"] && h.catalogs["bali-standard"].sur), "Accommodation tab lists DPS hotels, ticked for bali-standard Surcharge");
    ok(!pg.doc.querySelector("#kb-hotels") && !pg.doc.querySelector("#hotels thead").textContent.includes("Kad KB"), "no KB hotel cards: the KB's Accommodation tab is this list (kb-build stay_html)");
    await tab(pg.w, pg.doc, "surcharge"); await until(() => pg.doc.querySelector("#grid").textContent.includes("Favehotel Kartika Plaza"));
    ok(pg.doc.querySelector("#grid").textContent.includes("RM40/pax/night"), "Surcharge tab: hotel rows (and amounts) from the Accommodation tab");
    P2.EDIT = true; P2.render(); await tab(pg.w, pg.doc, "accommodation"); await until(() => pg.doc.querySelector("#hotels input.ed"));
    P2.SESSION = { u: "fyka", role: "editor", token: "tok-valid" };
    const h0 = D2().hotels.find(h => (h.catalogs || {})["bali-standard"] && h.catalogs["bali-standard"].sur === 1);
    const nameIn = [...pg.doc.querySelectorAll("#hotels input.ed")].find(x => x.dataset.path === JSON.stringify(["destinations", "DPS", "hotels", h0.id, "name"]));
    nameIn.value = "Favehotel Kartika Plaza (diuji)"; fire(pg.w, nameIn, "change"); await tick(10);
    ok(D2().hotels.find(h => h.id === h0.id).name === "Favehotel Kartika Plaza (diuji)", "Edit costs: a hotel name is edited in the Accommodation list (one source for catalog and KB)");
    click(pg.w, pg.doc.querySelector('[data-act="addHotel"]')); await tick(10);
    const nh = D2().hotels.at(-1);
    ok(nh && /^dps-h\d+$/.test(nh.id) && pg.doc.querySelectorAll("#hotels tbody tr").length === D2().hotels.length, "+ Tambah hotel adds a row");
    const ni = [...pg.doc.querySelectorAll("#hotels input.ed")].find(x => x.dataset.path === JSON.stringify(["destinations", "DPS", "hotels", nh.id, "name"]));
    ni.value = "Hotel Baru Kuta"; fire(pg.w, ni, "change"); await tick(10);
    const tk = [...pg.doc.querySelectorAll("input.htick")].find(x => JSON.parse(x.dataset.htick).id === nh.id && JSON.parse(x.dataset.htick).slug === "bali-standard" && JSON.parse(x.dataset.htick).kind === "sur");
    tk.checked = true; fire(pg.w, tk, "change"); await tick(10);
    ok(D2().hotels.at(-1).catalogs["bali-standard"].sur > 1 && D2().hotels.at(-1).catalogs["bali-standard"].amounts.length === 2, "tick Surcharge for bali-standard: last position, one amount per surcharge column");
    click(pg.w, pg.doc.querySelector("#btnSave")); await tick(5);
    pg.doc.querySelector("#saveNote").value = "Bali hotel diuji";
    click(pg.w, pg.doc.querySelector("#doSave"));
    ok(await until(() => P2.BASE.version === V + 1), "saved as one version");
    const rem = JSON.parse(repo.files(repo.head)["data/data.json"]), hd = rem.destinations.find(d => d.code === "DPS").hotels;
    ok(hd.find(h => h.id === h0.id).name === "Favehotel Kartika Plaza (diuji)" && hd.some(h => h.name === "Hotel Baru Kuta"), "data.json has the hotel edits");
    const cat1 = JSON.parse(repo.files(repo.head)["data/catalogs/bali-standard.json"]);
    ok(cat1.hub_version === V + 1 && !("rows" in (cat1.surcharge || {})), "bali-standard: hub_version stamped (catalog rebuilds), still no hotel rows in the file");
    ok(pg.errors.length === 0, "accommodation errors: " + pg.errors.join("|"));
  }

  console.log("8f. Add On: delete an item (Edit costs), warns when it is in a catalog");
  {
    const pg = await boot(repo, "hnd/", "?pkg=standard#addons");
    await until(() => pg.doc.querySelector("input.aotick"));
    ok(!pg.doc.querySelector('[data-act="delAddon"]'), "no Delete button when not editing");
    pg.w.PTCALC.EDIT = true; pg.w.PTCALC.render(); await tick(5);
    const H2 = () => pg.w.PTCALC.DATA.destinations.find(d => d.code === "HND");
    const victim = H2().addons.find(a => a.catalogs && a.catalogs["tokyo-standard"]), n0 = H2().addons.length;
    let asked = ""; pg.w.confirm = m => { asked = m; return true; };
    click(pg.w, [...pg.doc.querySelectorAll('[data-act="delAddon"]')].find(b => b.dataset.id === victim.id)); await tick(10);
    ok(!H2().addons.some(a => a.id === victim.id) && H2().addons.length === n0 - 1, "item removed from the destination's add-ons");
    ok(asked.includes(victim.label) && asked.includes("tokyo-standard"), "confirm names the item and the catalog it is printed in");
    const ch = pg.w.PTCALC.diff(pg.w.PTCALC.BASE, pg.w.PTCALC.DATA);
    ok(ch.some(c => c.path[1] === "HND" && c.path[2] === "addons"), "the delete is a pending change (saved with Save)");
    pg.w.confirm = () => false;
    const keep = H2().addons[0]; click(pg.w, [...pg.doc.querySelectorAll('[data-act="delAddon"]')].find(b => b.dataset.id === keep.id)); await tick(5);
    ok(H2().addons.some(a => a.id === keep.id), "Cancel keeps the item");
    ok(pg.errors.length === 0, "delete errors: " + pg.errors.join("|"));
  }

  console.log("8z. GitHub API calls bypass the browser cache (API max-age=60 → stale head → 'not a fast forward')");
  ok(!(repo.cached || []).length, "every api.github.com request uses cache: no-store: " + (repo.cached || []).slice(0, 2).join(" | "));

  console.log("8y. Flags page: flags checked by a PO (tools/flags_ok.json) are left out and counted");
  {
    const fl = JSON.parse(repo.files(repo.head)["data/flags.json"]), oks = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "flags_ok.json"), "utf8")).ok;
    ok(oks.every(o => !fl.flags.some(f => f.code === o.code && f.title === o.title)), "no flag in flags.json matches an entry of flags_ok.json");
    const pg = await boot(repo, "flags/"); await until(() => pg.doc.querySelector(".flagbar"));
    ok(!(fl.verified || []).length || pg.doc.querySelector(".flagbar").textContent.includes(fl.verified.length + " checked by a PO, not an issue"), "Flags page shows how many flags were checked and found not an issue");
    ok(pg.errors.length === 0, "flags page errors: " + pg.errors.join("|"));
  }

  console.log("8x. cleared History / Flags (Aceh, PO 11 Oct 2026): tabs shown, empty");
  {
    const pg = await boot(repo, "aceh/", "", null); await until(() => pg.doc.querySelector("#controls h1"));
    const d = pg.w.PTCALC.DATA.destinations.find(x => x.code === "ACEH");
    ok(d.historyFrom > 0 && !(d.hideTabs || []).length, "ACEH: historyFrom set, no hidden tabs");
    ok([...pg.doc.querySelector("#selVar").options].map(o => o.value + "=" + o.textContent).join() === "auto=Auto: Asonanggroe", "one TO → the TO box has one choice: " + [...pg.doc.querySelector("#selVar").options].map(o => o.textContent).join(" | "));
    const tabBtn = id => pg.doc.querySelector(`[data-tabmain="${id}"]`);
    ok(tabBtn("history") && tabBtn("flags"), "Flags and History tabs are shown");
    click(pg.w, tabBtn("history")); await until(() => pg.doc.querySelector(".hist"));
    const shownV = [...pg.doc.querySelectorAll(".hist .e .pill.nav")].map(x => +x.textContent.replace("v", ""));
    ok(shownV.every(v => v >= d.historyFrom) && (shownV.length || pg.doc.querySelector(".hist").textContent.includes("history was cleared")), "History tab: only versions from v" + d.historyFrom + " (" + (shownV.join(",") || "none, 'cleared' note") + ")");
    ok(pg.w.PTCALC.HISTORY.entries.some(e => e.v < d.historyFrom && (e.changes || []).some(c => c.path[1] === "ACEH")), "the global log still has the older ACEH versions");
    click(pg.w, tabBtn("flags")); await tick(20);
    ok(!pg.doc.querySelector("#grid .flags tr.sev-high, #grid .flags tr.sev-medium, #grid .flags tr.sev-low") && pg.doc.querySelector("#grid").textContent.includes("No flags"), "Flags tab: nothing listed for ACEH");
    ok(pg.errors.length === 0, "aceh errors: " + pg.errors.join("|"));
  }

  console.log("8w. CWB / CNB tables: component columns (per child) when the package has tipping; they add up to Cost/Pax");
  for (const [page, expect] of [["aceh/", ["Ground Cost (75%)", "Tipping"]], ["acehsbg/", ["Ground Cost (75%)", "Dolphin (free)", "Glass Boat (free)", "Snorkelling (free)", "Tipping"]], ["ltoba/", ["Tipping (85%)"]], ["pek/", ["Tipping"]]]) {
    const pg = await boot(repo, page); await until(() => pg.doc.querySelector("#costPax"));
    for (const t of ["cwb", "cnb"]) {
      click(pg.w, pg.doc.querySelector(`#costPax [data-tab="${t}"]`)); await until(() => pg.doc.querySelector(`#costPax [data-tab="${t}"].on`));
      const head = [...pg.doc.querySelector("#costPax tr.blk-head").querySelectorAll("th")].map(th => th.textContent.trim());
      const iA = head.indexOf("Adult cost/pax"), iC = head.indexOf("Cost/Pax");
      const nb = s => { const v = parseFloat(String(s).replace(/[^\d.−-]/g, "").replace("−", "-")); return isFinite(v) ? v : 0; };
      let worst = 0, rows = 0;
      for (const tr of pg.doc.querySelectorAll("#costPax tr[data-pax]")) {
        const td = [...tr.querySelectorAll("td")].map(x => x.textContent.trim()); if (!/\d/.test(td[iC])) continue;
        const sum = td.slice(iA + 1, iC).reduce((s2, x) => s2 + nb(x), 0); worst = Math.max(worst, Math.abs(sum - nb(td[iC]))); rows++;
      }
      if (t === "cwb") ok(expect.every(e => head.some(h => h.startsWith(e))), `${page} CWB columns ${expect.join(", ")}: ` + head.join("|"));
      ok(iC - iA > 1 && rows > 0 && worst <= iC - iA, `${page} ${t.toUpperCase()}: components add up to Cost/Pax (±rounding, worst ${worst})`);
    }
    ok(pg.errors.length === 0, page + " errors: " + pg.errors.join("|"));
  }
  {
    for (const page of ["hnd/", "kix/"]) {   // HND: no tipping component · KIX: tipping RM0 → no column
      const pg = await boot(repo, page); await until(() => pg.doc.querySelector("#costPax"));
      click(pg.w, pg.doc.querySelector('#costPax [data-tab="cwb"]')); await until(() => pg.doc.querySelector('#costPax [data-tab="cwb"].on'));
      const head = [...pg.doc.querySelector("#costPax tr.blk-head").querySelectorAll("th")].map(th => th.textContent.trim());
      ok(head[1] === "Adult cost/pax" && head[2] === "Cost/Pax", page + " no (non-zero) tipping → CWB table unchanged: " + head.join("|"));
    }
  }

  {   // Aceh-Sabang child cost: Ground 75% / 50%, dolphin + glass boat + snorkelling free, tipping in full (rules.free, PO 11 Oct 2026)
    const x = byCode(P.DATA, "ACEHSBG"), pk = x.packages[0], r = P.priceRow(x, pk, pk.assign[0].variant, 2);
    ok(Math.round(r.cwb.cost) === 678 && Math.round(r.cnb.cost) === 465 && r.cwb.margin > 0 && r.cnb.margin > 0, `Aceh-Sabang 2 pax: CWB cost 850×75%+40 = 678, CNB 850×50%+40 = 465 (${Math.round(r.cwb.cost)} / ${Math.round(r.cnb.cost)})`);
  }

  {   // Bali (PO 11 Oct 2026): costs in IDR (live FX), honeymoon selling = catalog − RM200 per couple (rules.sellingDiscount 100/pax)
    const x = byCode(P.DATA, "DPS"), std = x.packages.find(p => p.id === "alfian-std-3s"), hny = x.packages.find(p => p.id === "alfian-hny-std");
    ok(x.tables.every(t => t.fx === "IDR") && x.tables.find(t => t.id === "Alfian-STD-3S__Transport").values["2"] === 1075000, "Bali cost tables in IDR (Standard transport 2 pax IDR 1,075,000)");
    const rs = P.priceRow(x, std, std.assign[0].variant, 2).adult, rh = P.priceRow(x, hny, hny.assign[0].variant, 2).adult;
    ok(rs.selling === 857 && rh.selling === 998.5, `selling: Standard 1057 − 200 = 857, Honeymoon 1098.5 − 100 = 998.5 (${rs.selling} / ${rh.selling})`);
  }

  console.log("8v. several TOs per package: Add TO (copy), pick it → costing follows, Banding TO, Make default, Remove, Save (TO Comparison = margin)");
  {
    const pg = await boot(repo, "aceh/"); await until(() => pg.doc.querySelector("#costPax"));
    const P2 = pg.w.PTCALC, D2 = () => P2.DATA.destinations.find(x => x.code === "ACEH"), V = P2.BASE.version;
    P2.SESSION = { u: "fyka", role: "editor", token: "tok-valid" }; P2.EDIT = true; P2.render(); await until(() => pg.doc.querySelector("#toList"));
    ok(pg.doc.querySelectorAll("#toList tbody tr").length === 1 && !pg.doc.querySelector("#toCompare"), "one TO: TO list has 1 row, no TO Comparison");
    pg.doc.querySelector("#toName").value = "Pak Rahman"; pg.doc.querySelector("#toSup").value = "Pak Rahman CR 2027";
    click(pg.w, pg.doc.querySelector('[data-act="toAdd"]')); await until(() => pg.doc.querySelector("#toCompare"));
    const nv = D2().variants.find(v => v.label === "Pak Rahman"), pkg = D2().packages[0];
    ok(nv && nv.id === "PAK-RAHMAN" && (pkg.alsoVariants || []).includes("PAK-RAHMAN") && nv.components.every(c => !/ASONANGGROE/.test(c.expr)), "new TO: own id, alternative of the package, own tables in its formulas");
    ok(D2().tables.some(t => t.id === "PAK-RAHMAN__Ground-Cost") && pg.doc.querySelectorAll("#toList tbody tr").length === 2, "its per-pax tables copied (Ground Cost, …) and listed");
    ok([...pg.doc.querySelector("#selVar").options].map(o => o.value).join() === "auto,ASONANGGROE-3-STAR,PAK-RAHMAN" && pg.doc.querySelector("#selVar").value === "PAK-RAHMAN", "Tour operator box: Auto + both TOs, new TO selected");
    const gc = [...pg.doc.querySelectorAll("table.torates input.ed")].find(x => x.dataset.path === JSON.stringify(["destinations", "ACEH", "tables", "PAK-RAHMAN__Ground-Cost", "values", "2"]));
    ok(gc, "TO rates: the new TO's Ground Cost is editable");
    gc.value = "600"; fire(pg.w, gc, "change"); await tick(20);
    const c2 = P2.priceRow(D2(), D2().packages[0], "PAK-RAHMAN", 2).adult.cost, c1 = P2.priceRow(D2(), D2().packages[0], "ASONANGGROE-3-STAR", 2).adult.cost;
    ok(Math.round(c2) === 630 && Math.round(c1) === 705, "costing follows the TO: 2 pax Pak Rahman 600+30 = 630, Asonanggroe 705");
    ok(pg.doc.querySelector("#costPax").textContent.includes("PAK RAHMAN") || pg.doc.querySelector("#costPax").textContent.includes("Pak Rahman"), "Costing table shows the picked TO");
    ok(/TO Comparison/.test(pg.doc.querySelector("#toCompare h2").textContent) && /Margin RM/.test(pg.doc.querySelector("#toCompare thead").textContent) && !/Cost\/Pax/.test(pg.doc.querySelector("#toCompare thead").textContent), "TO Comparison shows margin RM / % per TO (no cost column)");
    click(pg.w, pg.doc.querySelector('[data-act="toDefault"][data-id="PAK-RAHMAN"]')); await tick(20);
    ok(D2().packages[0].assign.length === 1 && D2().packages[0].assign[0].variant === "PAK-RAHMAN" && D2().packages[0].alsoVariants.includes("ASONANGGROE-3-STAR"), "Make default: Auto uses Pak Rahman, Asonanggroe becomes an alternative");
    click(pg.w, pg.doc.querySelector('[data-act="toDefault"][data-id="ASONANGGROE-3-STAR"]')); await tick(20);
    pg.w.confirm = () => true; click(pg.w, pg.doc.querySelector('[data-act="toRemove"][data-id="PAK-RAHMAN"]')); await tick(20);
    ok(!D2().variants.some(v => v.id === "PAK-RAHMAN") && !D2().tables.some(t => t.id.startsWith("PAK-RAHMAN__")) && !("alsoVariants" in D2().packages[0]), "Remove: TO, its tables and the alternative link gone");
    ok(P2.diff(P2.BASE, P2.DATA).filter(c => c.path[1] === "ACEH").length === 0, "after add + remove nothing is pending for ACEH");
    pg.doc.querySelector("#toName").value = "Pak Rahman"; click(pg.w, pg.doc.querySelector('[data-act="toAdd"]')); await tick(20);
    click(pg.w, pg.doc.querySelector("#btnSave")); await tick(5); pg.doc.querySelector("#saveNote").value = "Aceh TO kedua (ujian)";
    click(pg.w, pg.doc.querySelector("#doSave")); ok(await until(() => P2.BASE.version === V + 1), "saved as one version");
    const rem = JSON.parse(repo.files(repo.head)["data/data.json"]).destinations.find(x => x.code === "ACEH");
    ok(rem.variants.some(v => v.id === "PAK-RAHMAN") && rem.packages[0].alsoVariants.includes("PAK-RAHMAN"), "data.json has the new TO");
    ok(pg.errors.length === 0, "multi-TO errors: " + pg.errors.join("|"));
  }

  console.log("8y. Competitor Analysis tab: ARBA (Catalog Price) vs competitors, manual edit, AI result applied, saved as one version");
  {
    const pg = await boot(repo, "sel/", "#competitor"); await until(() => pg.doc.querySelector("#cmpCard"));
    const P2 = pg.w.PTCALC, D2 = () => P2.DATA.destinations.find(x => x.code === "SEL"), V = P2.BASE.version, $p = s => pg.doc.querySelector(s);
    ok($p('[data-tabmain="competitor"]').textContent === "Competitor Analysis" && $p('[data-tabmain="kbcalc"]').nextElementSibling.dataset.tabmain === "competitor", "Competitor Analysis tab sits next to Simple Calculator");
    const heads = () => [...pg.doc.querySelectorAll(".cg-head")].map(x => x.textContent.trim().split(/\s+/).slice(0, 2).join(" ")).join("|");
    const cells = l => { const cats = [...pg.doc.querySelectorAll(".cmp-grid > *")], k = cats.findIndex(x => x.classList.contains("cg-cat") && x.textContent === l), n = pg.doc.querySelectorAll(".cg-head").length; return cats.slice(k + 1, k + 1 + n); };
    ok(heads() === "ARBASeoul Basic|Lurima Travel" || heads() === "ARBA Seoul|Lurima Travel", "one package at a time (Package box): Seoul Basic vs Lurima (" + heads() + ")");
    ok($p(".cmp-other").textContent.includes("Competitors also for Seoul Standard") && !$p(".cmp-t"), "view mode: category cards (no table); link to the other package with competitors");
    ok([...pg.doc.querySelectorAll(".cg-cat")].map(x => x.textContent).join("|") === "Price per pax|Package|Guide & USP|Inclusions|Strengths|Weaknesses", "categories: Price per pax, Package, Guide & USP, Inclusions, Strengths, Weaknesses");
    let h = cells("Price per pax");
    const li3 = h[1].querySelector("li");
    ok(h[0].querySelector("li").textContent.includes("3 pax RM2,797") && li3.textContent.includes("3 pax RM1,750") && li3.querySelector(".cmp-gap.dn").textContent === "−37.4%" && li3.querySelector(".cmp-gap").title.includes("RM1,047") && li3.textContent.includes("like-for-like RM2,800"), "price bullets: ARBA = Selling Price (catalog 2,997 − 200), Lurima −37.4% (RM1,047, red), like-for-like RM2,800");
    click(pg.w, $p("[data-cmppkg]")); await tick(20);
    h = cells("Price per pax");
    ok(heads().split("|").length === 4 && heads().includes("Jeju Muslim|Selamat Bercuti|Sedunia Travel") && pg.doc.querySelector("#selPkg").value === "atk-std" && h[0].textContent.includes("RM3,497") && h[2].querySelector("li .cmp-gap.up").textContent === "+68.4%", "link switches the Package to Seoul Standard: 3 competitors, Selamat Bercuti +68.4% vs Selling RM3,497 (green)");
    ok(/K-ETA:\s*Excluded/.test(cells("Inclusions")[2].textContent) && cells("Weaknesses")[2].querySelectorAll("li").length === 3, "Inclusions bullets 'K-ETA: Excluded'; weaknesses split into bullets");
    ok($p(".cmp-ana h4").textContent === "Recommendations" && $p(".cmp-ana details summary").textContent === "Full analysis", "analysis: actions shown, full text folded");
    {
      const li = (col, l, re) => [...cells(l)[col].querySelectorAll("li")].find(x => re.test(x.textContent));
      const jm = li(1, "Inclusions", /Meals/), sk = li(2, "Inclusions", /K-ETA/), jh = li(1, "Package", /Hours/), jt = li(1, "Inclusions", /Tipping/), ja = li(1, "Inclusions", /Accommodation/);
      ok(jm.classList.contains("red") && jm.title === "ARBA: Breakfast", "differs from ARBA: Jeju meals 'per itinerary' > Breakfast → red (title shows ARBA value)");
      ok(sk.classList.contains("green") && jh.classList.contains("green"), "ARBA better: Selamat Bercuti K-ETA Excluded, Jeju 9 hrs < 10 hrs → green");
      ok(jt.classList.contains("yel") && !ja.classList.contains("df") && !li(1, "Package", /5D4N/).classList.contains("df"), "unclear difference → amber (tipping 'Not stated'); same → no mark (Included (3★…), 5D4N)");
      ok(!cells("Strengths")[1].querySelector(".df") && $p(".cmp-legend").textContent.includes("vs ARBA Selling Price") && !$p(".cmp-legend .df"), "strengths not compared; legend explains the price % colours only");
    }
    ok(!$p('[data-act="cmpAI"]') && !$p(".cmp-bar"), "view mode: no AI / edit controls");
    P2.SESSION = { u: "aiman", role: "editor", token: "tok-valid" }; P2.EDIT = true; P2.render(); await until(() => $p(".cmp-t textarea"));
    ok($p('[data-act="cmpAnalyse"]').disabled && $p('[data-act="cmpAI"]').disabled, "AI buttons disabled without a Claude API key");
    $p("#cmpName").value = "Pesaing Ujian"; pg.doc.querySelector("#cmpVs").value = "atk-st"; click(pg.w, $p('[data-act="cmpAdd"]')); await tick(20);
    const nu = D2().competitors.items.find(c => c.name === "Pesaing Ujian");
    ok(nu && nu.id === "pesaing-ujian" && nu.vs === "atk-st" && [...pg.doc.querySelectorAll(".cmp-t thead th")].some(x => x.textContent.includes("Seoul Self Tour")) && pg.doc.querySelector("#selPkg").value === "atk-st", "Tambah manual: new competitor vs Self Tour → page shows Self Tour");
    const pin = [...pg.doc.querySelectorAll(".cmp-t input.ed")].find(x => x.dataset.path === JSON.stringify(["destinations", "SEL", "competitors", "items", "pesaing-ujian", "prices", "4"]));
    setVal(pg.w, pin, "1999"); await tick(20);
    const ta = [...pg.doc.querySelectorAll(".cmp-t textarea")].find(x => x.dataset.path === JSON.stringify(["destinations", "SEL", "competitors", "arba", "atk-st", "meals"]));
    setVal(pg.w, ta, "Breakfast"); await tick(20);
    ok(D2().competitors.items.find(c => c.id === "pesaing-ujian").prices["4"] === 1999 && D2().competitors.arba["atk-st"].meals === "Breakfast", "edit a competitor price and a new ARBA package cell");
    pg.w.eval(`CMP_AI = { kind: "analysis", r: { arba: [{ id: "atk-st", attrs: { days: "5D4N", meals: "Lunch" } }], columns: [{ id: "atk-st", strength: "Harga rendah", weakness: "Tiada guide" }, { id: "pesaing-ujian", strength: "Murah", weakness: "-" }], summary: "## Summary\\n- **ARBA** is dearer", actions: ["Check the 4 pax price"] } }`);
    click(pg.w, (() => { const b = pg.doc.createElement("button"); b.id = "aiApply"; pg.doc.body.appendChild(b); return b; })()); await tick(20);
    const A = D2().competitors.arba["atk-st"];
    ok(A.days === "5D4N" && A.meals === "Breakfast" && A.strength === "Harga rendah" && D2().competitors.items.find(c => c.id === "pesaing-ujian").attrs.strength === "Murah", "AI analysis fills only empty cells (meals kept), strengths / weaknesses");
    ok($p(".cmp-ana") && $p(".cmp-md h4").textContent === "Summary" && $p(".cmp-md b").textContent === "ARBA" && $p(".cmp-ana").textContent.includes("Check the 4 pax price"), "AI summary + actions shown under the table");
    click(pg.w, $p("#btnSave")); await tick(5); $p("#saveNote").value = "Competitor ujian";
    click(pg.w, $p("#doSave")); ok(await until(() => P2.BASE.version === V + 1), "saved as one version");
    const saved = JSON.parse(repo.files(repo.head)["data/data.json"]).destinations.find(x => x.code === "SEL").competitors;
    ok(saved.items.some(c => c.id === "pesaing-ujian" && c.prices["4"] === 1999) && saved.analysis.by === "aiman" && saved.items.find(c => c.id === "lurima-seoul-lite").prices["3"] === 1750, "data.json has the competitor, price and analysis");
    ok(pg.errors.length === 0, "competitor errors: " + pg.errors.join("|"));
  }

  console.log("8z. Quotations: encrypted per-PO workplace, phone required, Telegram text parsed, CRM closed tracking");
  {
    const pg = await boot(repo, "sel/", "#quotes"); await until(() => pg.doc.querySelector("#grid .card"));
    const P2 = pg.w.PTCALC, $p = s => pg.doc.querySelector(s), W = pg.w;
    ok($p("#grid").textContent.includes("Log in to see quotations"), "not logged in: no quotation data shown");
    const vaultRaw = W.crypto.getRandomValues(new W.Uint8Array(32));
    P2.SESSION = { u: "aiman", role: "admin", token: "tok-valid", vaultRaw }; P2.render();
    ok(await until(() => $p("#qtCard")), "logged in: Quotations card loads (no file yet = empty list)");
    W.eval("crmSetup()"); ok(await until(() => W.eval("USERS.crm && USERS.crm.pub")), "Account → Set up CRM link stores a key pair (private key encrypted)");
    click(W, $p('[data-qt="new"]')); await until(() => $p("#qQuote"));
    $p("#qRequest").value = "Seoul\n6-10 November 2026\n3 Adult\nPuan Kamariah Moksin";
    $p("#qQuote").value = "PT SEOUL 5D4N\nPax: 3 Adult\nDate: 6-10 November 2026\nPrice: RM 4,197 per pax\nTotal 3 pax: RM 12,641\nPuan Kamariah Moksin";
    click(W, $p("#qParse")); await tick(5);
    ok($p("#qN_adult").value === "3" && $p("#qT_adult").value === "3997" && $p("#qT1_adult").textContent === "RM4,197" && $p("#qCust").value === "Puan Kamariah Moksin" && $p("#qTravel").value === "6-10 November 2026" && $p("#qStatus").value === "Quoted" && !$p("#qType"), "Fill from text: pax, quoted price = T1 (T2 = 4,197 − 200 = 3,997), customer, travel date; status Quoted; no Type field");
    click(W, $p("#qSuggest")); await tick(5);
    { const P = P2.DATA.destinations.find(x => x.code === "SEL").packages.find(x => x.id === $p("#qPkg").value), r = P2.priceRow(P2.DATA.destinations.find(x => x.code === "SEL"), P, "ATK-BSC", 3);
      ok($p("#qC_adult").value === String(Math.round(r.adult.cost)) && $p("#qT_adult").value === String(Math.round(r.adult.selling)) && $p("#qT1_adult").textContent === "RM" + Math.round(r.adult.selling + 200).toLocaleString("en-MY") && /Total T1/.test($p("#qTot").textContent) && /Margin/.test($p("#qTot").textContent), "Use Costing prices: cost + Selling T2 per category from Costing (3 pax), T1 = T2 + 200, totals and margin"); }
    click(W, $p('[data-qt="save"]')); await tick(10);
    ok($p("#modalRoot .err-t").textContent.includes("Phone number is required"), "phone is required");
    $p("#qPhone").value = "+60 12-368 2424"; click(W, $p('[data-qt="save"]'));
    ok(await until(() => !$p("#qQuote") && repo.files(repo.head)["data/quotes.enc.json"]), "saved as its own commit");
    const enc = repo.files(repo.head)["data/quotes.enc.json"];
    ok(!enc.includes("Kamariah") && !enc.includes("2424") && /"ct"/.test(enc) && /quotes: aiman added Q/.test(repo.log[repo.log.length - 1]) && !repo.log[repo.log.length - 1].includes("Kamariah"), "file and commit message carry no customer data (encrypted)");
    ok(await until(() => $p("#qtCard tbody").textContent.includes("Puan Kamariah Moksin")), "quotation listed for this destination");
    {   // customer change → v2; v1 kept
      click(W, $p('[data-qt="edit"]')); await until(() => $p('[data-qt="newver"]'));
      const v1T2 = $p("#qT_adult").value;
      click(W, $p('[data-qt="newver"]')); await until(() => /v2 \(new\)/.test($p(".qt-vers").textContent));
      ok($p("#qT_adult").value === v1T2 && $p("#qQuote").value === "" && $p("#qCust").value === "Puan Kamariah Moksin", "New version copies v1 (prices, customer) with an empty quotation text");
      setVal(W, $p("#qN_adult"), "4"); $p("#qT_adult").value = "3797"; $p("#qQuote").value = "PT SEOUL 5D4N v2\nPax: 4 Adult"; click(W, $p('[data-qt="save"]'));
      ok(await until(() => !$p("#qQuote") && /v2/.test($p("#qtCard tbody").textContent)), "saved: list shows v2");
      const q = W.eval("QT.list[0]");
      ok(q.versions.length === 2 && q.versions[0].t2.adult === +v1T2 && q.versions[1].t2.adult === 3797 && q.versions[1].adult === 4 && !("t2" in q) && q.customer === "Puan Kamariah Moksin", "versions[]: v1 unchanged, v2 with the new pax / price; customer & phone shared");
      ok($p("#qtCard tbody").textContent.includes("RM3,997") && $p("#qtCard tbody").textContent.includes("RM3,797"), "list shows the latest version (T1 3,997 / T2 3,797)");
      click(W, $p('[data-qt="edit"]')); await until(() => $p('[data-qt="ver"][data-vi="0"]'));
      click(W, $p('[data-qt="ver"][data-vi="0"]')); await until(() => /Older version/.test($p(".qt-vers").textContent));
      ok($p("#qT_adult").value === v1T2, "v1 can be opened again (kept for reference)"); click(W, $p("[data-close]"));
    }
    ok([...pg.doc.querySelectorAll(".qt-k")].find(k => k.textContent.includes("My requests")).textContent.includes("1"), "KPI: the PO's own requests");
    // CRM: a closed PT lead for the same phone (stored as 60123682424) → Closed
    {
      const users = W.eval("USERS"), { subtle } = require("crypto").webcrypto;
      const pub = await subtle.importKey("spki", Buffer.from(users.crm.pub, "base64"), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
      const raw = require("crypto").randomBytes(32), iv = require("crypto").randomBytes(12), k = await subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
      const body = JSON.stringify({ generatedAt: "2026-10-15T00:00:00Z", leads: [{ p: "0123682424", s: "Closed", c: "2026-10-14 21:00", t: "2026-10-13 10:00:00", d: "Seoul", tc: "Farah Faisal" }] });
      const ct = Buffer.from(await subtle.encrypt({ name: "AES-GCM", iv }, k, Buffer.from(body))), key = Buffer.from(await subtle.encrypt({ name: "RSA-OAEP" }, pub, raw));
      repo.trees[repo.commits[repo.head].tree]["data/crm.enc.json"] = JSON.stringify({ key: key.toString("base64"), iv: iv.toString("base64"), ct: ct.toString("base64") });
      W.eval("QT.crm = null; QT.crmErr = null; crmLoad()");
      await until(() => W.eval("!!QT.crm")); await tick(20);
      ok(!$p("#qtCard tbody").textContent.includes("Kamariah") && [...pg.doc.querySelectorAll(".qt-k")].find(k => k.textContent.includes("Closed")).textContent.includes("1"), "closed quotation leaves the Open view; KPI Closed = 1");
      click(W, $p('[data-qtf="Closed"]')); await tick(10);
      ok(await until(() => $p("#qtCard .qt-closed")), "CRM lead with the same phone, closed after the request → Closed");
      ok($p("#qtCard .sub").textContent.includes("CRM synced"), "CRM sync time shown");
    }
    P2.SESSION = { u: "thania", role: "editor", token: "tok-valid", vaultRaw }; W.eval("QT.list = null"); P2.render();
    ok(await until(() => $p("#qtCard")) && !$p("#qtCard tbody").textContent.includes("Kamariah") && !$p("#qtPo"), "another PO sees only their own quotations (no PO switch for editors)");
    ok(pg.errors.length === 0, "quotation errors: " + pg.errors.join("|"));
  }

  console.log("9. no runtime errors");
  ok(errors.length === 0, "errors: " + errors.join(" | "));

  console.log(`\n${fail ? "FAILED" : "ALL PASSED"}: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
