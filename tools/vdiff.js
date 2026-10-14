// Changes for a data edit made outside the page, with the page's own diff / describe (app.js in jsdom) — reverse-checked, null = absent.
//   NODE_PATH=<jsdom> node tools/vdiff.js <hub dir> <base dir> [catalog slugs,comma] [kb slugs,comma] > changes.json
// <base dir> holds the BEFORE copies: data.json, cat/<slug>.json, kb/<slug>.json (e.g. git show HEAD:data/data.json > base/data.json).
// Output = the history entry's "changes" list (path, from, to, label); catalog 'updated' / 'hub_version' stamps are left out.

const fs = require("fs"), path = require("path"); const { JSDOM } = require("jsdom");
const [ROOT, BASE, CATS = "", KBS = ""] = process.argv.slice(2);
const html = fs.readFileSync(path.join(ROOT, "hnd", "index.html"), "utf8")
  .replace(/<script src="[^"]*app\.js[^"]*"><\/script>/, () => "<script>" + fs.readFileSync(path.join(ROOT, "app.js"), "utf8") + "</script>").replace(/<link rel="stylesheet"[^>]*>/, "");
const dom = new JSDOM(html, { url: "https://x/pt-rnd-hub/hnd/", runScripts: "dangerously", beforeParse(w) {
  w.fetch = async u => { const f = path.join(ROOT, new URL(String(u), w.location.href).pathname.replace("/pt-rnd-hub/", ""));
    return fs.existsSync(f) ? { ok: true, json: async () => JSON.parse(fs.readFileSync(f, "utf8")) } : { ok: false, status: 404 }; }; } });
const J = f => JSON.parse(fs.readFileSync(f, "utf8")), C = o => JSON.parse(JSON.stringify(o));
const dedupe = out => { const seen = new Set();
  return out.filter(c => { const k = JSON.stringify(c.path); if (seen.has(k)) return false; seen.add(k); return true; })
    .filter((c, _, all) => !all.some(o => o !== c && o.path.length < c.path.length && JSON.stringify(c.path.slice(0, o.path.length)) === JSON.stringify(o.path))); };
(async () => {
  const w = dom.window; for (let i = 0; i < 200 && !(w.PTCALC && w.PTCALC.DATA); i++) await new Promise(r => setTimeout(r, 20));
  const P = w.PTCALC;
  const a = J(BASE + "/data.json"), b = J(ROOT + "/data/data.json");
  const strip = o => { o = C(o); delete o.version; delete o.updatedAt; delete o.updatedBy; return o; };
  let data = dedupe(P.diff(strip(a), strip(b)));
  const back = P.applyChanges(C(strip(b)), C(data), true);
  const nn = o => JSON.parse(JSON.stringify(o, (k, v) => v === null && k !== "" ? undefined : v));   // null = absent
  const canonD = o => JSON.stringify(nn(o), (k, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(q => [q, v[q]])) : v);
  if (canonD(back) !== canonD(strip(a))) throw new Error("data reverse-check failed");
  const canon = o => JSON.stringify(o, (k, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(q => [q, v[q]])) : v);
  const sub = (kind, slug, x, y) => { const ch = dedupe(P.diff(x, y)); const z = P.applyChanges(C(y), C(ch), true);
    if (canon(z) !== canon(x)) throw new Error(kind + " reverse-check failed");
    return ch.map(c => ({ ...c, path: [kind, slug, ...c.path] })); };
  const cat = CATS.split(",").filter(Boolean).flatMap(sl => sub("catalogs", sl, J(BASE + "/cat/" + sl + ".json"), J(ROOT + "/data/catalogs/" + sl + ".json")))
    .filter(c => c.path[2] !== "updated" && c.path[2] !== "hub_version");
  const kb = KBS.split(",").filter(Boolean).flatMap(sl => sub("kb", sl, J(BASE + "/kb/" + sl + ".json"), J(ROOT + "/data/kb/" + sl + ".json")));
  const all = [...data, ...cat, ...kb].map(c => ({ path: c.path, from: c.from === undefined ? null : c.from, to: c.to === undefined ? null : c.to, label: P.describe(a, c.path) }));
  process.stdout.write(JSON.stringify(all), () => process.exit(0));
})().catch(e => { console.error(e); process.exit(1); });
