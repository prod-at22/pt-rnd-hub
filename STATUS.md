# Status & handoff (12 Oct 2026, data v73 — the hub is the source of truth)

PT R&D Hub (display name since 11 Oct 2026; was "PT R&D Costing Hub"). Repo renamed 10–11 Oct 2026 `pt-calculator-hub` → `pt-rnd-hub` (old Pages URL no longer works). Live: https://prod-at22.github.io/pt-rnd-hub/ · repo `prod-at22/pt-rnd-hub` (gh CLI is logged in as prod-at22).
How everything works: README.md. This file = where we stopped. Reply to the PO in Bahasa Melayu.

## Start of a new session
```bash
gh repo clone prod-at22/pt-rnd-hub && cd pt-rnd-hub
git config user.name "ezie ARBA" && git config user.email "eziearba@ezies-MacBook-Air.local"
git config http.postBuffer 524288000          # contracts/ has large files
npm i jsdom --no-save && node tests/test_calc.js   # must say ALL PASSED
```
After any change: `python3 tools/make_pages.py` (asset ?v= hash), run the tests, commit, push, wait for the Pages build.

## Page today
- Hub: one row per catalog package (name · PO · last update). 37 destinations.
- Destination page: header (PO, FX chips — editable in Edit costs) · **Package** (package name only) · **Tour operator** (operator
  name only; lists just that package's TOs, auto-picked by pax) · tabs Costing / Itinerary / Surcharge / Add On / What to Expect / Policy / TO Contract Rate / Flags / History.
- Costing table: one block per TO; component columns (group RM), headers = component name only. Rate-built TOs
  (Tokyo, Osaka, Tokyo-Osaka) get two buttons, both off by default: **Show rate reference** opens a horizontal table above Costing by
  pax (one column per code: A, B, … = rates in order of use, then the FX; item · pax band, supplier, rate; note on
  hover); **Show calculation** writes each cell as its formula in those codes, e.g. "A × 2 × R = 1,144"
  (rateCodes / rateRef / calcText in app.js). A component RM0 at every pax is
  hidden; a single cost line shows as Cost/Pax only. Cost/Pax · Catalog Price · **Selling Price = Catalog − RM200**
  (settings.sellingDiscount, all packages; infant no discount) · Margin (green +, red −) · % · Total Gross.
  Grey/white rows, one header colour, all centred. No Source column, no Quote / Rates & FX tabs.
  In **Edit costs** a *TO rates* table appears above Costing by pax (toRatesCard): per-pax cost per component for
  each TO, or the supplier rates for Tokyo / Osaka / Tokyo-Osaka — this is where TO costs are changed now.
- Names: tools/names.json (package + operator display names), applied by tools/apply_names.py.
- TO Contract Rate tab: files in contracts/<code>/ listed in data.json `contracts`. Uploading from the page needs
  login, which is still not set up (data/users.json empty) — files so far were committed directly.

## Catalog content (Itinerary / Surcharge / Add On / What to Expect / Policy tabs) — the hub is the source
- data/catalogs/<slug>.json = every catalog (67), same schema as Catalog PT. Imported once (8 Oct) byte for
  byte from Drive "Catalog PT (new)/catalogs" (`tools/import_catalogs.py --from-drive` — do NOT run again,
  it would overwrite hub edits). data/catalogs/index.json links slug → package (MAP in tools/flags.py);
  rebuild it with `python3 tools/import_catalogs.py` after editing a catalog. Not linked:
  maldives-standard, yunnan-3-wilayah-6d5n (no calculator package).
- Destination page tabs show the selected package's catalog section by section (see README "Catalogs"); every
  field editable in Edit costs; each card links the public page / PDF.
- **Mirror (automatic, no token)**: workflow `mirror.yml` lives in **prod-at22/catalog-pt-public** itself. Every
  10 min it checks this repo (public); when data/catalogs/ changed since `.hub-sha` (a Catalog Price or Add On save stamps hub_version in the catalog file) it rebuilds only those
  catalogs with catalog-build/build.py (all of them when catalog-build/ changed) and commits to itself
  (GITHUB_TOKEN, contents: write). Delay ≈10–15 min; catalog-pt-public → Actions → "Mirror from PT R&D
  Costing Hub" → Run workflow mirrors at once (slugs, or "all"). Tested 8 Oct (tokyo-standard published).
  CI PDFs = Linux Chrome (Liberation Serif, metric-compatible with the Mac's Times; same pages/layout).
  GitHub disables a scheduled workflow after 60 days without commits to catalog-pt-public — if catalogs sit
  unchanged that long, re-enable it in that repo's Actions tab.
- Drive "Catalog PT (new)" = backup builder only (its build.py pulls data/catalogs/ from here).
- Not editable on the page yet (read-only view; edit the JSON in the repo). Prices shown are the catalog's;
  the Costing tab keeps its own catalog prices in data.json — they can disagree (see flags).

## The hub is the source of truth (v28, 8 Oct 2026)
- All costs, FX, catalog prices, rules and add-ons are edited **on the page** and saved as versions. The R&D
  workbooks are no longer read: the importers (extract_rd, merge_dests, build_data, extract_fx, extract_krabi,
  build_jp_rates), the R&D comparison (tests/truth, crosscheck.py) and the R&D markers / cell references in
  data.json were removed (v28). Do not re-create an R&D import — it would overwrite saved edits.
- Contract-based costs stay script-built from the TO contract (not R&D): **SEL** Basic/Standard (tools/build_sel.py)
  and **SELJJU, JJU, JJUO** (tools/build_korea_cr.py), ATK CR 2026 KRW × 0.0030. Run them only when ATK sends a new CR.
- **HND / OSK / KIX** are rate by rate (rate × FX). Qayyum FX 0.026, WIF 0.029, apartment RM250/pax/night.
  contracts/hnd has the ARBA-internal Qayyum rate sheet (tools/make_qayyum_sheet.py; regenerate after a Qayyum rate change).
- **JBDO**: CTRANS fullboard rate 2–10 pax (v5); catalog = Catalog PT v8, 2–19 pax (v27). 10–19 pax cost RM635/pax (PO 9 Oct, v34).
- Flags (tools/flags.py): catalogs × the hub's own numbers only.
- **Catalogs** (v31): each catalog section comes from its own tab — price = Costing (Catalog Price column),
  header + hotels + itinerary + includes/excludes = Itinerary, Surcharge, Add On (tick per package; 210 catalog
  add-ons imported into data.json with catalogs {slug: position} + price_lines), What to Expect, Policy (notes +
  deposit). Catalog files keep no amounts and no add-on list (addon_groups = order + notes only). hub_version is
  stamped on save. catalog-build/hub_data.py = the rules for the build.
- **Publishing** (8 Oct): the mirror's 10-min cron ran once all day, so a save now dispatches mirror.yml itself
  (startCatalogMirror in app.js; token needs Actions: write on catalog-pt-public). mirror.yml uses
  catalog-build/changed.py, so a data.json-only change (prices, add-ons) is picked up too.
  tools/import_catalogs.py --from-drive is retired; the old Drive builder ("Catalog PT (new)/build.py") cannot
  render the new files — do not use it.

## HANDOFF (12 Oct 2026) — v79 live · Aceh + Bali + Bangkok + Beijing + Hokkaido + Istanbul + Jakarta-Bandung verified, Vietnam (Danang, Hanoi-Sapa, HCM-Dalat, Phu Quoc) on Ibrahim CR 2027 · next: ask the PO
- Live: hub v79, pt-kb-house and catalog-pt-public mirrored (CI "28/28 KB OK"), all verified.
- **Destination verification (one at a time, PO 11 Oct)**: cross-check R&D hub × catalog hub × KB hub (and the source PDF / CR);
  mirrors (.hub-sha, live = repo); fix in the hub, show the live-text diff (rebuilt catalog / KB vs snapshot), wait "ok push".
  **Aceh + Aceh-Sabang done (v55–v62):** one package each, "Aceh Standard 4D3N" / "Aceh - Sabang Standard 5D4N" (4★ / 5★ packages
  removed, their TO rates kept); Flags / History tabs shown but cleared (destinations[].historyFrom = 57); Kyriad = 5★ +RM90 everywhere
  (PO); KB vehicles = catalog (Avanza 2–4 · Innova 5–6 · Hiace 7–12); Late Booking RM50 also in the Aceh-Sabang catalog; Aceh-Sabang
  child cost: dolphin / glass boat / snorkelling free (rules.free) → CWB 19–30 %, CNB 31–41 %; Aceh-Sabang child prices 16–30 pax
  = Aceh pattern (CWB −20, CNB −10 per band); catalog meals "Breakfast" (was "International Breakfast"); duplicate TripCare /
  Blue Ribbon removed (kept the RM45 set); 4 additional activities one item each, cost RM0 until the TO rate is known; stale KB
  notes fixed (also the marketing note in pt-kb-house aceh/index.html, outside kbdata — a rebuild keeps it).
  Open with the TO (Asonanggroe): adult cost of dolphin RM150 / glass boat / snorkelling (not in the CR) and the 4 activities' cost.
  **Bali done (v63–v64, reference: PO sheet ~/Downloads/rnd bali.xlsx, block "BALI NEW TESTING – FEB 2026", FX in B1):** cost tables
  now in IDR (were MYR at the old fixed 0.0002224864, so live FX did nothing); Standard transport per pax = sheet (6 / 18 pax were
  higher); Honeymoon Std / Premium transport = sheet honeymoon formula (IDR 1,925,000 per couple); Honeymoon selling = catalog − RM200
  per couple (new per-package rules.sellingDiscount = 100/pax; others use settings RM200/pax); Premium costs: PO says hub values are
  right (sheet has no Feb 2026 Premium block); Standard 16–20 pax 897 / 817 / 767; vehicles = honeymoon catalog + KB (Avanza 2–4 ·
  Innova 5–6 · Hiace 7–12) also in the Standard catalog + KB; catalog add-ons: selling = catalog price, cost from the matching R&D
  item (duplicate removed) or the sheet; standard / honeymoon dinner items stay separate (their catalog group titles differ).
  kb-build {{dari:N}} = lowest adult within the catalog's printed pax range (Bali card "dari RM917"; Krabi cards now 1,297 / 1,497).
  Catalog prices unchanged (checked live). Open Bali items are flags: Banana Boat below cost, Pocket Wifi prices swapped,
  8 add-ons without cost, TripCare RM64 vs Aceh RM45 (tools/flags_open.json).
  **Bangkok done (v65, PO ezie 12 Oct; references: contracts/bkk Chiwanon CR 2026–2027 + Almas / Al-Meroz / Nouvo contracts, and Drive
  "PT BANGKOK R&D 2026.xlsx" (owner hakiimaffendy, shared) sheet COSTING BKK — 1–10 pax only, same costs as the hub):** vehicles = CR
  (SUV max 3, minivan max 9): SUV 1–3 · minivan 4–9 · 10+ minivan + SUV / minivan in Costing, catalog What to Expect and KB (transport tab, rate card,
  calculator bands, ext.paxPerVehicle 9); Almas FIT 1,250 THB (1–7 rooms) / group 1,100 (8+ rooms = 16+ pax); "Chaiyo Praya" RM18 =
  Chao Phraya boat (sheet; not the dinner cruise, not in the CR); add-ons: R&D Day 3 duplicates removed, catalog items selling = catalog,
  cost from the CR (Pattaya 30, Kanchanaburi 116, Safari World 121), Long Tail 244 / boat (max 6), Giraffe 122, new Chao Phraya Halal
  Dinner Cruise 121 / 150; KB Simple Calculator add-ons linked (kb.rnd.cost); package "Bangkok Standard 4D3N"; catalog text Driver (not
  Tour Guide), wet season June–October ("International Breakfast" kept, PO); KB long tail max 6, FAQ flight RM620–1,600; hideTabs → historyFrom 65.
  Catalog prices unchanged. Open (tools/flags_open.json): tipping not costed (ask Chiwanon), hotel contracts end 31 Oct 2026,
  Giraffe margin 9.6 %, 4★ upgrade ~9 %. v66: 11–30 pax prices = the 6–10 band (1,197 / 1,097 / 997; PO).
  **Beijing done (v67, PO ezie 12 Oct; references: contracts/pek Tourdechina CR 2026, source catalog PDF ~/Downloads/PT DESTINASI R&D
  REFORMAT/BEIJING/PT Beijing 5D4N 2026.pdf; PT_PEK_RD_reformatted.xlsx has no add-on costs):** costs = CR (fare bands + tipping RMB30 × 5,
  CNB 80 % fare) — checked; 2–3 pax margin 7.4 % / CWB 5.1 % accepted (tools/flags_ok.json); vehicles = CR (MPV 7-seat 2–4 · coach 14–17
  seat 5–9 · coach 37 seat 10+) in Add On (Small Bus / Van items removed) and KB (5–9 = bus rate RM1,700 / 650, 10+ quote manual);
  Universal peak RM850 (= KB); extra lunch / dinner cost RM61 (CR budget RMB100, 2–5 pax) → flagged "sold below cost" (RM60) until the
  PO sets a price; catalog: morning Day 2 / 3 titles were swapped (also in the source PDF), midnight Day 1 meals "-", Day 5 hotel "-",
  Wangfujing / Nanluoguxiang; "International Breakfast" kept (PO, also Bangkok); hideTabs → historyFrom 67. Catalog prices unchanged.
  "Upgrade to 4★ Premium +RM240/pax" (source PDF, R&D sheet, KB) stays out of the hub catalog (PO 12 Oct).
  **Danang – Hoi An (v68, PO ezie 12 Oct; Ibrahim CR 2027 = Downloads "IBRAHIM TRAVEL HARGA PACKAGE VIETNAM 2027…pdf", now in contracts/dadh):**
  Bismillah = default TO, Ibrahim = alternative in both packages (4D3N + 5D4N); separate "Ibrahim 5D4N · 3★" package removed; Ibrahim costs
  = CR 2027 (in force now until Dec 2027 — PO; bands 2 / 3–4 / 5–6 / 7–8 / 9–10 / 11–12 / 13–14 / 15–20 / 21–30 / 31+), new Ibrahim 4D3N; child cost per TO CR via the
  new `variants[].childRules` (app.js childRule; Ibrahim CWB 50 % / CNB free; Bismillah package rules CWB 75 % / CNB 50 %) — catalog age labels
  unchanged (PO); catalog content (Ibrahim-style itinerary, 3★ hotels) kept (PO, H(i)); package names without ★; duplicate TripCare (Area 2) /
  Blue Ribbon add-ons removed. Catalog prices and validity (31 Dec 2026) unchanged. v69: Danang Costing 2–20 pax only (21+ = quote manual); "Banding TO" → "TO Comparison" (margin per TO, all destinations). Open (flags): Ibrahim 2027 margins thin / negative
  (5D4N 2 pax −9.3 %, 4D3N 2/4/6 pax 6–8 %), Bismillah CR ends Dec 2026.
  **Hanoi – Sapa (v70, PO ezie 12 Oct):** Ibrahim costs = CR 2027 (now – Dec 2027): Hanoi-Sapa 4D3N = CR p.7 (cable car & train),
  Hanoi-Sapa-Halong 5D4N = p.6 overnight cruise; Costing 2–20 pax (CR has no 21–25 rate); reference packages Halong Bay 4D3N / Sapa 5D4N
  removed; Halong Day Cruise add-on = −RM100 (as KB); duplicate add-ons removed; KB single supplement = catalog (RM300 / RM700), 2027 travel
  surcharge removed from KB (PO). Margins 2027: 4D3N 14–35 %, 5D4N 19–35 %. Not in hub: CR p.8 "Hanoi Sapa Halongbay Day Trip 5D4N" (no cable car).
  **HCM – Dalat – Muine (v71, PO ezie 12 Oct):** Ibrahim costs = CR 2027 (now – Dec 2027; 4D3N p.2, 5D4N p.3, Alpine Coaster now included);
  Costing 2–20 pax; coaster add-on removed (hub + KB); duplicate add-ons removed; KB: new Dalat 4D3N (package card + calculator variant
  vdl4d3n, map → ibrahim-4d3n / catalog hcm-dalat-muine-4d3n), Jeep / ATV RM197 (= hub), group-FOC text removed (PO: FOC is for ARBA's tour
  leader, never quote it to customers), FAQ 2027 surcharge = catalog (Jan–Feb 2027 +RM120; calculator already matched). Margins 2027 18–35 %.
  Note: the Danang catalogs carry "Travel Date 2027 Jan–Feb +RM150/pax"; Hanoi catalogs carry none.
  v72: HCM 4D3N (Shopping Tour) removed — not sold any more (PO): catalog ho-chi-minh deleted (mirror removes the page / PDF), KB dalat card +
  calculator variant removed (texts now = the two Dalat variants), pt-kb-house catalogs.json nav link removed, HCM-only CR images removed.
  **Phu Quoc (v73, PO ezie 12 Oct):** Ibrahim costs = CR 2027 (now – Dec 2027; 4D3N p.10, 5D4N p.11); child cost per CR (CWB 50 % / CNB free,
  was 100 % / 75 % — that caused the "CWB below cost" flags); Costing 2–20 pax; Teddy Bear Museum = deduction −RM20 only (included in the
  package, PO); duplicate add-ons removed; catalogs: single supplement RM240 (4D3N) / RM320 (5D4N) instead of "quoted on request" (PO);
  KB: single texts = catalog, 2027 travel surcharge removed (not in the catalogs). Margins 2027: adult 17–33 %, CWB 55–63 %.
  All Ibrahim destinations are now on the 2027 CR (contracts/<code>/…IBRAHIM_TRAVEL_HARGA_PACKAGE_VIETNAM_2027.pdf).
  **Hokkaido (v74–v77, PO ezie 12 Oct; reference: contracts/cts WIF CR Jan–Dec 2026 only — R&D files not used):** cost tables now in JPY at the
  fixed FX 0.029 (were MYR, so FX did nothing); hotel in Costing (CR ¥12,000/pax/night × 4; catalog v3 includes accommodation — margins were
  33–55 % without it); airport transfer = CR one-way to city ¥30k / ¥35k (was the Noboribetsu rate); Charge WIF = CR Group Management Fee ¥6,000;
  guide 4 days × ¥27,500 (no guide Day 5); entrance ¥8,850 (Asahiyama ¥1,000 + Bibai Snowland pass ¥7,850, winter = highest; public prices,
  not in the CR); tipping RM0 (WIF charges none; "Tipping Fee" texts kept, PO); CWB 100 %, CNB = adult without hotel (rules.free hotel);
  vehicles 7-seater 2–4 · 10-seater 5–8 · 7 + 10-seater 9–10 (Costing + KB); Costing 2–10 pax (= catalog; 11+ quote manual). Margins adult
  17–19 %, CWB 12.5–16 %. Catalog: highlight "Driver + Tour Guide", single supplement RM1,200 (no range); prices unchanged. Add-ons (v75): hotel
  options / 4★ removed, "Hotel — Tolak 1 malam" −RM250, extra night RM400 and breakfast RM50 (Hokkaido only; Tokyo / Osaka keep RM300 / RM40),
  lunch / dinner cost RM58 sell RM65, car seat cost RM145, wifi 4G cost RM58, TripCare Couple / Family per pair / family. KB jepun: 2027 travel
  surcharge (+RM200) scoped to Tokyo / Osaka / Tokyo-Osaka (extraSurcharge.variants), Hokkaido peak Jun–Sep 2027 removed, single RM1,200 flat,
  surcharge heading = Hokkaido-Sapporo, room note 2–3 per room; calculator (v76) extra day RM2,800 / 3,000 / 4,800, free & easy −RM1,800 / −1,900
  / −3,000, airport removed −RM700 / −800 / −1,500 (2–4 / 5–8 / 9–10 pax; costs in rnd.cost) — tested live. Open: CR ends Dec 2026 while the
  catalog is valid to 31 Jan 2027 (PO: no new CR needed now); entrance / Bibai price to confirm with WIF.
  **Istanbul (v78, PO ezie 13 Oct; reference: contracts/istbur + istcap = the same MyTrip CR, USD per pax, no validity date, tip not included from 7 pax
  = $5/day/pax):** cost tables now in USD with live FX (were MYR at 3.97 Bursa / 4.0295 Cappadocia); Cappadocia = CR row 6D5N 3N IST + 2N CAP (checked);
  Cappadocia Self Tour 6D5N (ARBATO, no catalog, CNB below cost) removed; Cappadocia infant cost RM0; Bursa unticked hotels Erboy / Zultanite removed;
  add-ons: duplicates removed, catalog items keep the catalog price, cost from the MyTrip items, TripCare per pair / family, TripCare / Blue Ribbon / wifi
  also for Bursa; KB turki Travel Map hotel "My Cave Hotel / Suhan Cappadocia" (PO: both). Kept (PO): Costing 2–24 pax (CR goes to 24), catalog meals
  text, KB 2027 surcharge +RM300 for Cappadocia, KB 4★ upgrade +RM716 text. Margins (USD 4.085): Bursa adult 16.5–22.5 %, Cappadocia 18.9–26.4 %.
  On hold (PO): Bursa CR row (catalog 1N Bursa + 3N Istanbul; hub uses "5D4N 4N Istanbul" $980, CR has no such row — ask MyTrip; "6D5N 4N IST + 1N BUR"
  $1,030 would give ~12 % at 2 pax); KB quotation inclusions "{nights} breakfasts" vs catalog fullboard; child cost 100 % (Bursa CNB 6–10 %).
  Open: Uludag Snow Park cost (MyTrip); Etiqa TripCare zone for Turkey ("Area 2"?); catalog Bursa includes say 5x lunch but the itinerary has 3;
  KB Travel Map "Hotel Day 1" for Cappadocia lists the Cappadocia hotels although night 1 is in Istanbul (Viva Deluxe).
  **Jakarta - Bandung (v79, PO ezie 13 Oct):** costs = CTRANS CR by pax (WhatsApp screenshot, now in TO Contract Rate: fullboard 4D3N 2–10 pax,
  5 pax Avanza RM684 / Hiace RM757 = TO "CTRANS (Hiace van)"; 11–19 pax = 10 pax, PO) — checked; the "Katalog Penawaran 2026" PDF is CTRANS's public
  price list (not ARBA's rate). Adult margin 27–38 %. Tipping RM0 (CTRANS charges none; catalog / KB text kept, PO); Option A / B same price; child cost
  CWB 75 % / CNB 50 % (PO); Day 4 Jakarta stops stay "optional" (no refund if the flight is early, PO); vehicles Avanza 2–4 · Innova 5–6 · Hiace 7–12.
  Add-ons: Whoosh duplicates removed (catalog item RM157, cost RM154), TripCare = Etiqa Area 1 (= Aceh), Argo Executive RM220 (= KB). KB: 2027 travel
  surcharge (+RM50) removed, quotation meals = catalog, transport block Hiace 7–12. Costing 2–19 pax kept. Open: KB Jakarta Full Day Tour (Avanza)
  RM320 / transport is below the hub cost RM333.
  PT Quotation Hub prototype (Sales quotations, versions, PO notes; Beijing) is local only, ON HOLD (PO 12 Oct) — not in the repo.
- **Live FX not used by 11 destinations** (costs stored in MYR): TUR, ISTBUR, ISTCAP, LOP, JOG, MEL, PER, NSNZ, KMGDLS, PHU, SWS —
  convert each to its currency during its check (confirm the FX each table was made with first).
- **Next:** ask the PO which destination to verify next (same method: R&D hub × catalog × KB × CR, mirrors, live-text diff, "ok push").
- Done 9–10 Oct: v41 Info KB tidy · v42 Bangkok 4★/5★ removed · v43–v44 Bangkok Costing rate by rate (sheet COSTING BKK, no meals) ·
  v45 Bangkok Flags/History hidden (destinations[].hideTabs), Show calculation folds pax-only parts · v46 Beijing from the Tourdechina CR (RMB) ·
  v47 KB Accommodation from the hub + roomNote · v48 Beijing Flags/History hidden · v49 live FX for every destination except Jepun ·
  v50–v51 Simple Calculator (R&D): every Sales price in the KB calculator with cost (Costing / formula on Costing rates / add-on / RM, kb.rnd)
  and margin; Pakej folded & read-only; Tokyo / Osaka / Tokyo-Osaka formulas · TO Contract Rate tab after Costing · v52–v53 new destination
  KMGDL Yunnan 3 Wilayah (Tourdechina RMB, PT KMGDL R&D as reference), catalog linked · v54 Maldives 4 Star (Kaani Palm Beach CR, USD), catalog linked.
- **Logins done (11 Oct 2026, data stays v54)** — repo renamed `pt-calculator-hub` → `pt-rnd-hub`
  (live https://prod-at22.github.io/pt-rnd-hub/; old URLs 404; both mirror.yml check out prod-at22/pt-rnd-hub).
  data/users.json: `ezie` admin + editors `acap`, `aiman`, `thania`, `fyka`, `amirul` (every destination's PO has an account).
  Token (fine-grained, owner prod-at22, 1 year): Contents RW + Actions RW on pt-rnd-hub, pt-kb-house, catalog-pt-public —
  created and entered by the admin; Claude never sees it. POs change their temp password via Account on first login.
- **Rights**: editor = only destinations where destinations[].po = username (case-insensitive); admin = all + PO field + Account.
  Save refuses other POs' destinations; Restore only restores the editor's own. Page guard only (one shared token).
  Handover = admin changes the destination's PO. Forgotten password = admin Remove + Add (no reset button yet).
- **Fix (11 Oct)**: GitHub API calls use `cache: "no-store"` (API max-age=60 gave a stale head → "Update is not a
  fast forward" on a second save within a minute); users save retries. Tests start from an empty users.json.
- **Live FX**: fx entry `"live": "<ISO>"` → today's ECB rate (one request MYR → currencies, inverted) on page open; `value` = fallback.
- **Stay logged in (11 Oct)**: login carries over between destination pages in the same tab (sessionStorage `ptRndHub.session`:
  user + vault key + last activity, no token; token re-decrypted from users.json per page; cleared on tab close / Log out / 30 min idle).
  Tested live (forged / unreadable stored session rejected) and on localhost with test-only accounts (navigation HND → KIX → SEL → hub,
  rights, Account, idle, new tab, Log out). Fixes from that test: no Edit costs on the hub list / flags pages; unreadable session cleared.
- **Display name (11 Oct)**: "PT R&D Costing Hub" → "PT R&D Hub" in the hub (titles, header), kb-build text (KB lines "dari PT R&D Hub",
  135× in 28 KBs — only change, checked against a snapshot; CI 28/28 KB OK), READMEs and mirror.yml comments. catalog-build docstrings
  changed too, so the catalog mirror rebuilt all 67 PDFs: identical except the PDF CreationDate/ModDate stamps; .hub-sha = a61cc64.
- **New in the page (11 Oct)**: CWB / CNB tables show component columns per child when the package has a non-zero tipping
  component (rule % in the header, "(free)", "Less" for adult − RM; they add up to Cost/Pax) · TO box shows one choice when the
  package has one TO · **several TOs per package**: default (assign) vs alternatives (alsoVariants), Edit costs → Tour operators card
  (Add TO copying an existing TO's components + rates, Make default, Remove), TO Comparison table (margin per TO) · `tools/flags_ok.json` = flags checked
  and not an issue (left out, counted on /flags/) · `tools/flags_open.json` = open items a PO noted (shown as flags until removed) ·
  flags.py also flags add-ons sold below cost · destinations[].historyFrom clears a destination's History view.
- **Fixes (11 Oct)**: catalog-pt-public mirror.yml failed whenever specific catalogs changed (the last `[ -z ] &&` test was the step's
  exit code) → `if … fi`. Data edits made outside the page: build next data.json in Python (keeps the number format), changes from
  the page's own diff/describe (scratch vdiff.js, reverse-checked, null = absent), history entry, catalog hub_version / updated stamps.
  Git identity: the Mac's hostname changed — commit with `-c user.name="ezie ARBA" -c user.email="eziearba@ezies-MacBook-Air.local"`.
- Observation (no change): most destinations apply the child % to the whole adult cost, tipping included (e.g. Lake Toba CWB 85 %);
  ask the PO per destination whether tipping should be charged in full for children.
- Ideas not built (ask the PO first): admin "Reset password" + must-change-on-first-login, change role editor ↔ admin.
- Open for the PO: Maldives 4 Star CNB below cost (Kaani has no child rate) + estimates to confirm (lunch D3, 2nd excursion, green tax,
  tipping) + Peak 21 Dec–10 Jan not sold by Kaani; Beijing Jul–Aug +RMB400 / single supplement / FOC; Ho Chi Minh 4D3N removed (not sold, PO 12 Oct)
  (needs a CR); Simple Calculator formulas for other destinations; Hokkaido / Seoul rates missing in Rate reference.

## KB House from the hub (9 Oct 2026, v32) — Phase 2 in progress
- PO decision (9 Oct): the hub is the source of truth for PT KB House; KB pages mirror the hub; cosmetics (images,
  travel map, page design) stay in pt-kb-house; KB Bahasa Melayu text kept in the hub; variants without a Costing
  package kept as KB-only; aceh / korea stay bespoke; **hub wins** when a KB price differs from the hub.
- Step 1 done: data/kb/<slug>.json (28) + kb-build/build.py; pt-kb-house has mirror.yml + <slug>/assets.json.
  aceh / korea now read their content constants from an injected kbdata block (one-time edit, text identical).
- Step 3 done (v33): tabs **Info KB** + **Simple Calculator** on every destination page; Edit costs → Save writes
  data/kb/<slug>.json and dispatches pt-kb-house mirror.yml. Step 2 (tiers from Costing) is parked on local branch
  kb-step2-tiers — waiting for the PO's answers (Aceh 31+ pax, Lombok HNY 4★ / Phuket 4★ hub vs catalog surcharge, Aceh-Sabang CWB/CNB 16+).
- **Accommodation tab** (PO 9 Oct, v36): hotels moved out of 58 catalog files into data.json destinations[].hotels
  (152 hotels, 35 destinations); all 67 catalogs resolve identical. KB hotel cards merged (v37): cards link hotels by id, names
  from the list; 18 cards stay text (notes / multi-city catalog rows: KK 3★, Medan 4★, Korea Seoul Std & Seoul–Jeju).
- One source of truth (PO 9 Oct, v35): KB price tables, itineraries, includes / excludes are built from the Costing +
  Itinerary tabs (data/kb map.packages links each KB package to its catalog); the KB file keeps none of them. Package
  text uses {{dari:N}} {{2pax:N}} {{pasangan:N}}. Still KB text with prices: compare blocks + FAQ (~138 mentions) — next.
- Next (was): step 2 = calculator tiers + KB price text from Costing (show the PO the text diff per KB before it goes
  live; 8 conflicts in the Phase 1 report); step 3 = hub tabs Info KB + Simple Calculator, Save writes
  data/kb/ and dispatches pt-kb-house mirror.yml (token needs Actions: write on pt-kb-house too).
- Phase 1 report: https://claude.ai/code/artifact/76a209fd-7a4c-47cf-bc86-71f02a28793b

## Open — waiting on the PO
1. Tokyo (on hold by PO): catalog JSON Tokyo Standard (2 pax RM6,197) ≠ ProdReq "catalog v2" (RM6,997) — which is current?
   Qayyum open items: tolls/parking/fuel inside the rate? guide's own entrance? Iyashi entrance still on WIF FX 0.029.
2. Korea CR: Basic 16 pax 406,193 KRW looks wrong; no rate 26–30 pax (except Standard); CR seasonal ±RM150–300 not applied;
   2-pax margin thin on Seoul-Jeju / Jeju-Udo.
3. Maldives operator name unknown (TO box shows "Resort / TO" / "Resort package").
4. Confirm guessed package names: Lake Toba Emiya = Parapat, Baim = Samosir; Perhentian Basic = Shari-La, Standard = Mimpi.
5. One FX per currency (THB 0.131 vs 0.122; IDR; USD 3.97 vs 4.0295; RMB 0.65 vs 0.58; AUD).
6. Done (v29, 8 Oct): the catalog is the source for prices — Costing catalog prices of the 13 catalogs that differed were set to the published catalogs.
   /flags/ regenerated 7 Oct on data v25 (95 flags: 29 high · 37 medium · 29 low). New since v6: KK margin
   problems in 11 lines and Perhentian Shari-La under 10% / CWB below cost (both from Selling = Catalog − RM200),
   Seoul-Jeju 2 pax 6.8% and Jeju-Udo 3.8% margin, Korea 26–30 pax no cost, Qayyum FX 0.026 (HND) vs 0.0259 (KIX).
7. No costing in the hub yet: Yunnan 3 Wilayah, Maldives Standard (4★). Codes SNZ, NNZ, SUBM, KMGDL not on the hub.
8. Done (11 Oct): logins — admin ezie + 5 PO editors (see HANDOFF).
9. Uploaded only files named PT from the Drive "Production Team" folder; unlabelled CRs (Perhentian resorts,
   Semporna Legend, Perth K&N, NZ price list, Pak Jamal, KK / Krabi / Maldives folders) were not uploaded.

## Sources
- R&D workbooks (~/Downloads/PT DESTINASI R&D REFORMAT/): history only, not used by the hub.
- Catalog content: data/catalogs/ (this repo). Catalog PT build (mirror): ~/Library/CloudStorage/GoogleDrive-product@arbatravel.com/My Drive/Catalog PT (new)/
- Project PT sheet (codes, POs, catalog names): Drive file 10lru13aYbcbI888rhghOipOyiKm_6FYykfFu0xfoReQ
- TO CRs on Drive: "Production Team" folder 10Ez7h9hXXVsECV4UIGKKx7dnvZDGwOhC (one sub-folder per destination).
- ProdReq skills: /prodreqkorea, /prodreqjepun.

## Rebuild / check
```bash
python3 tools/build_sel.py && python3 tools/build_korea_cr.py      # only when the ATK CR xlsx changes
python3 tools/make_pages.py                                         # after any app.js / app.css / new destination
NODE_PATH=<jsdom dir> python3 tools/flags.py                        # regenerate /flags/
node tests/test_calc.js
```
