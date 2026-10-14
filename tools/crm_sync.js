// Daily CRM → hub sync for Quotations closed tracking.
//   node tools/crm_sync.js <leads.json>
// <leads.json>: rows from the CRM Fresh table (type = 'PT'), each {phone, status, closed_time, timestamp, destination, tc, value, leadID}.
// Writes data/crm.enc.json: the leads keyed by normalised phone, AES-GCM encrypted with a fresh key that is wrapped
// with the CRM public key in data/users.json (crm.pub). Only logged-in hub users can unwrap it (private key in the vault).
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const normPhone = p => { let s = String(p || "").replace(/\D/g, ""); if (s.startsWith("60")) s = s.slice(1); else if (s.startsWith("1") && s.length >= 9) s = "0" + s; return s.length >= 9 ? s : ""; };
(async () => {
  const rows = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const users = JSON.parse(fs.readFileSync(path.join(ROOT, "data/users.json"), "utf8"));
  if (!users.crm || !users.crm.pub) throw new Error("No CRM key: an admin must press Account → Set up CRM link first.");
  const leads = rows.map(r => ({ p: normPhone(r.phone), s: r.status || "", c: r.closed_time || "", t: String(r.timestamp || "").slice(0, 19), d: r.destination || "", tc: r.tc || "", v: r.value || "", l: r.leadID || "" })).filter(r => r.p);
  const { subtle } = globalThis.crypto;
  const pub = await subtle.importKey("spki", Buffer.from(users.crm.pub, "base64"), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const raw = globalThis.crypto.getRandomValues(new Uint8Array(32)), iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const k = await subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const body = JSON.stringify({ generatedAt: new Date().toISOString(), leads });
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(body));
  const key = await subtle.encrypt({ name: "RSA-OAEP" }, pub, raw);
  const b = x => Buffer.from(x).toString("base64");
  fs.writeFileSync(path.join(ROOT, "data/crm.enc.json"), JSON.stringify({ v: 1, generatedAt: new Date().toISOString(), count: leads.length, key: b(key), iv: b(iv), ct: b(ct) }, null, 1) + "\n");
  console.log(`crm.enc.json: ${leads.length} leads`);
})().catch(e => { console.error(e.message); process.exit(1); });
