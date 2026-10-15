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
- Hub: one row per catalog package (name · PO · last update). 38 destinations.
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
  maldives-standard (no calculator package).
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

## HANDOFF (15 Oct 2026) — v109 live · Aceh + Bali + Bangkok + Beijing + Hokkaido + Istanbul + Jakarta-Bandung + Jeju + Jeju-Udo + Jogja + KK-Kundasang + Krabi + Yunnan 3 / 4 Wilayah + Turki Klasik + Tokyo + Lombok + Maldives + Medan-Lake Toba + Melbourne + New Zealand + Osaka + Padang-Bukittinggi + Perhentian + Perth + Phuket + Semporna + Surabaya + Switzerland verified, Vietnam (Danang, Hanoi-Sapa, HCM-Dalat, Phu Quoc) on Ibrahim CR 2027 · next: ask the PO
- Live: hub v109, pt-kb-house and catalog-pt-public mirrored (CI "28/28 KB OK"), all verified.
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
  **Jeju + Jeju - Udo (v80–v81, PO ezie 13 Oct; ATK CR 2026 Korea xlsx + terms, KRW × live FX):** costs = CR rows "PT&GT JEJU 4D3N No Meal" and
  "PT&GT-BSC, STD JEJU UDO 5D4N" (checked); the Udo row is Full board while the catalog is breakfast only — kept (PO), so Udo adult margin stays thin
  at 2–3 / 10 pax (2.3–8.1 %, flag left open, PO); Jeju adult 22–45 %. CR terms: child under 7 twin 100 % / extra bed 75 % / no bed 50 % (= hub CWB 75 % /
  CNB 50 %), tipping $5/day included, 2–8 Carnival · 9–16 Solati, note says "valid until Dec 2025". Costing 2–25 pax (= CR) both; Jeju Self Tour 4D3N
  removed (tests/test_calc.js updated); add-ons: duplicates removed, catalog items with costs (Udo ferry cost unknown), K-ETA Re-Application RM70 (= catalog),
  TripCare per pair / family; catalogs: driving guide 2–8 pax, driver + guide 9+ (= CR vehicles); KB korea: 2027 travel surcharge (+RM100) now Seoul /
  Seoul-Jeju only (extraSurcharge.variants), Apr / May / Oct 2027 peak windows removed for Jeju / Udo. Open: ATK Udo "No Meal" rate; Udo ferry cost.
  **Jogjakarta (v82, PO ezie 13 Oct; Pak Jamal CR = PDF from Downloads, now in TO Contract Rate — Jogja 3D2N/4D3N/5D4N Luxury 3★ + transport and The 101
  Malioboro 4★, plus Surabaya rates):** Cost TO = CR 4D3N (545 / 490 / 460 / 415 / 385; 16–20 = 11–15, PO); Jeep Timang / entrance / L&D stay separate components (from the
  R&D, CR is hotel + transport only); Costing 2–20 pax; child cost kept CWB 50 % / CNB 0 % (PO). Adult margin 29–37 %. Add-ons: catalog prices kept, cost from PT JOG R&D
  asal (Jeep Gumuk Pasir 200, ATV 100, Gondola 65, Borobudur 135, Horse Carriage 16) — 3 sell below that cost (flag, PO); the latest R&D Add-On sheet is copied from
  Lombok (not reliable). KB jogja: add-on prices = catalog (child 60 %), quotation without travel insurance / with meals, Hiace 7–12 · Bus 13+. Open: Goa Pindul /
  Gamplong cost; CR 4★ (The 101 Malioboro) vs catalog The 101 Tugu, upgrade RM100–120 vs CR difference RM88–110 per night.
  **KK - Kundasang (v83, PO ezie 13 Oct; source of truth = ~/Downloads/PT KK-KUNDASANG R&D 2026.xlsx, tabs KKK COSTING + RAW DATA only — PO):** Basic 3D2N /
  Standard 4D3N cost = KKK COSTING in components (transport per group ÷ pax 750 / 1,000 / 1,400 and 950 / 1,200 / 1,800 for 1–4 / 5–8 / 9–16 pax; Ming Garden 220 and KPR 225 per
  room ÷ 2; meals 34 / 69; entrance 51 / 119) — the old costs were RM93–180 too high, so the thin-margin flags were false; Costing 1–10 pax (= catalog, 1 pax costed). Adult
  margin 3D2N 25–36 % (1 pax 14.5 %), 4D3N 20–28 % (1 pax 7.9 % = sheet). Honeymoon 4D3N = sheet (couple RM1,165.5, selling − RM100/pax, no hub catalog); Guesthouse 3D2N /
  4D3N and Honeymoon 3D2N removed (PO). Add-ons: catalog items cost from RAW DATA, selling = catalog; Poring + Canopy (20 / 15) and Mari-Mari swap (150 / 120) below cost
  (flag); TripCare Area 2 / second Blue Ribbon set removed. KB: guesthouse texts removed, single 4D3N RM450, last-minute text removed (not in the catalog), upgrade 3.5★
  +RM80 / 4★ +RM150, Van 8-seater 5–8. Child cost kept CWB 85 % / CNB 65 %. CR folder "CR KK Kundasang" in the R&D dir not used (not opened).
  **Krabi (v84–v85, PO ezie 14 Oct; KTT CR 2026 = Drive "CR PT 2026 (CENTRALIZE)/CR KRABI" (High 11 Jan–30 Apr, Low 1 May–31 Oct 2026) + KTT 2027 (6 PDFs from
  Telegram, 11 Jan–30 Apr 2027)):** 88 of 110 hub rates = CR 2026 exactly (Normal = Low, High = High highest range); 22 honeymoon High rates have no CR (copied Normal, flag).
  Day 3 Phi Phi sells +RM100 (catalog) via new app.js field variants[].sellingUpgrade (also in TO Comparison; test added); Honeymoon 4★ upgrade RM225/pax = RM450/couple
  (catalog; 4★+ 525); Costing 2–10 pax; add-ons: Kayaking / 7-Islands catalog items with cost, TripCare Area 1, visa row removed; KB: Standard year-end peak from 1 Nov,
  FAQ upgrade / CNB fixed. Flags: 2027 rates not in Costing (PO decision), no KTT 4D3N rate 1 Nov 2026–10 Jan 2027, CR 2026 typos. TO Contract Rate (v85): Low 2026
  (6) + 2027 (6) PDFs; the 3 High 2026 PDFs removed (PO); 2027 PDFs compressed 5.3 → 1.4 MB (whole Segoe UI Emoji font was embedded; subset with fontTools via
  PyMuPDF, every page renders identical). Pushing 51 MB needed `git -c http.postBuffer=524288000 push`; the removed / old blobs stay in git history (v84).
  **Yunnan 3 + 4 Wilayah (v86, PO ezie 14 Oct; Tourdechina CRs: 3W 7D5N = PO PDF, now in TO Contract Rate kmgdl; 4W 8D6N .doc; both valid Oct 2025 – Dec 2026; R&D folders not used):**
  3W tour fare = CR (6,800 / 4,900 / 4,250 / 3,300 RMB) — checked; tipping × 6 days kept (CR text says × 7, looks copied from 4W → flag); 4W cost now RMB × live FX from the CR
  (8,000 / 5,800 / 5,200 / 4,400 + tipping RMB30 × 7; was MYR at fixed 0.58), CNB 80 % of tour fare only (CR), nights 6; Costing 2–30 pax both (CR stops at 14 → 15–30 cost = 10–14 rate;
  3W 15–30 prices = 4W pattern −RM100 per band: 3,097 / 2,997 / 2,897); catalogs still print 2–14 (unchanged). Add-ons: 3W set added (= KB prices + TripCare / Blue Ribbon), 4W duplicate
  TripCare / Blue Ribbon removed, extra lunch / dinner cost RM61 (CR meal budget 2–3 pax, sells RM60 → flag), Tolak Lunch / Dinner −RM30 (cost −RM31) both. KB yunnan: 2027 surcharges
  removed (not in catalogs), 'Upgrade hotel 4-star +RM240' removed (packages are 4★), FAQ answer changed. Kept (PO): 'Driving Guide' highlight, KB flight times (AK102), International Breakfast.
  On hold (PO): KB Transport tab 10–15 / 16+ pax rows (CR / catalog stop at 14). Margins (FX 0.6104): 3W adult 11–29 %, CWB 7.3 % at 2–3 pax; 4W adult 8.8 % at 2–3 pax, 26–30 pax
  adult 9.1 % / CWB 2.9 % (flag). Open (flags_open): 4W single RM700 vs CR RMB1,120 ≈ RM684; add-on costs unknown (airport, train upgrades, luggage van, Indian/Arabic, day tour); 3W tipping days.
  Catalogs unchanged (mirror: nothing to render); Flags / History from v86.
  **Turki Klasik (v87, PO ezie 14 Oct; MyTrip CR = contracts/tur (same file as istbur and R&D TURKEY 'PT MyTrip Turki CR.pdf'); R&D TURKEY folder read with PO OK):**
  cost now USD × live FX (was MYR at fixed 3.97): Standard = CR row '8D7N Classic Turki Tour' ($1,550 … $550, 11 bands) — checked; Basic = CR − $200/pax (ARBA estimate since R&D v1, not in the CR → flag;
  v88 itemised: Topkapi −$61 ≈ RM250 + 6L/7D meals & Istanbul hotel −$139 estimate); tipping $5 × 8 days from 7 pax (CR TNI; 2–6 pax TI); Costing 2–24 pax (= CR; catalogs print 2–9); child cost 100 % kept (ARBA May 2026, CR has
  no child rate → flag: Basic CNB ≈0–4 % at 10–24 pax, Std CNB 4–6 % at 2–6 pax); nights 7; package names 'Turki Klasik Standard / Basic 8D7N' (names.json). Add-ons: catalog items
  take the MyTrip costs (= Istanbul), duplicates removed, TripCare per pair / family; Istanbul-Bursa Uludag cost 723 / 570 / 494 (catalog item = 2 pax + new 3 / 4+ pax items;
  label unchanged so the catalog stays identical; open flag removed). KB turki: Klasik peaks 21–24 Aug / 20 Dec–1 Jan and 2027 +RM300 removed (Cappadocia keeps 2027),
  Std quotation meals 7B·6L·7D, '4★ upgrade +~RM1,800' note removed. Margins (USD 4.085): Std adult 9.5–24.6 %, Basic 9.6–22.2 %. Open (flags_open): Basic rate, child rates,
  single supplement, KB transport rate card amounts (Istanbul ↔ Ankara Sprinter 'RM37,000' — currency?). Catalogs unchanged; Flags / History from v87.
  **Tokyo Basic + Standard (v89–v90, PO ezie 14 Oct; WIF CR 2026 + Qayyum internal rate sheet; R&D TOKYO folder read with PO OK):** catalog v1 is current (Std 2 pax
  RM6,197; unpublished 'v2' tables removed from the local ProdReq Jepun skill + stored KB tiers, v89 — the anthropic-skills plugin copy may still hold v2). WIF / Qayyum rates
  checked; big groups now on WIF CR vehicles (K2): airport Coaster ¥80k (9/10–18) / Bus ¥130k (19+) — the R&D ¥37k / ¥25k had no CR source; Std tours 14-seater 10–14,
  Coaster 15–18, Bus 19–30; Costing 2–30 (K3); Basic includes the guide's highway bus + ropeway (K13); accommodation RM250 kept (ARBA books it, K4); catalog add-ons
  costed per band (catalog item = first band + extra band items, K5); Disneyland ticket RM300/pax = catalog D4 (cost ≈RM316 → flag, K9); meal cost = WIF CR, Tolak meals
  removed (K7); TripCare pair / family, wifi ¥2,000/day (K10); hotel-night add-ons kept (K8); Self Tour kept for reference (K11). Flags: R&D add-ons with doubtful costs
  (K6), 2–4 pax margins (K12), Std 15–21 pax margin 3.7–8 % / CWB below cost at 15 & 19 (catalog 13–30 prices are extrapolated). tests/test_calc.js rate codes updated.
  Catalogs and KB unchanged. **On hold (PO 14 Oct, flags only):** KB jepun 2027 peak windows + 'Travel date 2027 +RM200' (not in any Japan catalog; ProdReq §4C
  says no 2027 projection — removal prepared, all Japan except Hokkaido) and Tokyo 13–30 pax prices below the ProdReq rule (Std 15–21 3.7–13.7 %).
  **Lombok (v91, PO ezie 14 Oct; Pak Anang rate card image (PO) + Drive 'PT LOP R&D' Sheet3 (file 1kJAu8d06SrU5pTzId5v7tqx83NF4fIsXwpcvU4GYW0Y) — both in TO Contract Rate lop):**
  cost now IDR × live FX = Sheet3 (Cost TO Anang 2.55m / 2.35m / 2.15m / 1.95m / 1.65m per band, Pink Beach per group, Tips 200k; was MYR at 0.0002273265) — checked;
  Honeymoon 3★ / 4★ removed from hub + KB (PO; Sheet3 had 2,497 / 2,697 per couple vs hub 2,697 / 3,057); nights 3; Costing 2–30 kept; adult margin 35–50 %.
  Add-ons: rate-card transport (airport / half / full day × Avanza / Innova / Hiace) with cost, deductions = rate card cost (also in KB: full −137/−194/−274,
  half −91/−126/−194, airport −57/−80/−137, Pink Beach boat −285, entrance −11), boats (Teluk Nare, slow boat, SIC, Pink Beach), Cidomo cost RM91 sell RM120
  (hub + KB), extra night sells = KB (3★ RM85, 4★ RM120; 4★ cost RM86), extra hour 150k IDR per vehicle. KB compare tab = Standard 3★ vs 4★. Catalog unchanged.
  Open: 3★ extra-night cost (old RM120 > sell RM85) — ask Pak Anang. Info only: Sembalun 3★ hotels 650k, weekend +150k, peak +200k (in LOP note).
  **Maldives (v92, PO ezie 14 Oct; CRs from R&D MALDIVES/_extracted + Kaani 2027 agreements (PO, Desktop) — 12 files in TO Contract Rate mle, large PDFs rasterised to
  ≤4.3 MB):** Basic = ICOM Blue Seaview contract (1 Jan 2026 – 1 Apr 2027) USD × live FX: room $110 low / $150 high ÷ 2 × 3 + speedboat $50 + green tax $18 + Fish Tank $70
  (hub had PC 8 % + TGST 17 % on top of tax-inclusive rates and green tax once) → low RM1,238 / high-peak RM1,483; child = hotel $30/night (pct on hotel), infant FOC.
  Combo = Island Life 4CASH-A3 − DTA RM200 (3,180 / 3,580 / 3,350 / 3,250; was 3,000 / 3,740 / 3,500 / 3,350); Water Villa = OBLU − DTA RM250 (checked); child / infant per
  Island Life (infant RM500 / 550 vs catalog RM100 → flag). 4 Star = Kaani package 2027 ($378 / $416 = 2025 = hub) + Real Break $90 + green $12 (estimates flagged); no
  child rate → CWB / CNB below cost (flag, PO: flag only). TO names ICOM / Island Life (operator-name open item done). Add-ons costed from ICOM / Velana / Kaani;
  Kaani Full Day + Real Break removed from the 4 Star catalog add-ons (included); R&D duplicates removed; Arena costs open (image-only PDF). KB: 2027 +RM200 and
  Basic 2025 window removed, Combo Super Peak from 1 Nov (= catalog), upgrade RM400 only, Combo / WV last-minute row removed. Costing 2–30 kept (PO).
  **Medan - Lake Toba (v93, PO ezie 14 Oct; CRs already in TO Contract Rate ltoba):** Option A (Parapat) = Emiya Parapat CR (checked, 2–20 pax); Option B (Samosir) default TO
  now **Emiya Samosir** (CR 855 / 700 / 615 / 585 / 630 … 520, full meals, Samosir Villa; 14+ held at the 13-pax rate) with Baim as alternative (alsoVariants; 3 / 4 pax fixed to CR
  650 / 600; breakfast only + L&D estimate RM120) → Option B margin 25–40 % (was 21–32 %). +RM25 in both Emiya costs = Sibayak 4★ Berastagi (KB Free Gift promo). TO hotel
  labels fixed; duplicate Emerald hotel removed; nights 3; add-on duplicates removed, meal cost RM15 (CR L&D −RM90), TripCare pair / family; KB 8–15 Mar 2027 +RM90 removed.
  Not added (PO): Emiya optional programs (Sibayak hike, Tero-Tero rafting, Sikulikap). Open: CR validity (Dec 2026 vs catalog Jan 2027), single / peak costs.
  **Melbourne (v94, PO ezie 14 Oct; source = Google Sheet 'PT MEL R&D' 1OI4P02SoelT2fPFk5zolNbY96M_If3U3x_eNjxX4slE (V3, 12 Mar 2026) — PO: R&D is the source; its
  Costing (BASIC / STANDARD) + entrance table compiled into contracts/mel 'WAE MELBOURNE COSTING RATE 2026.pdf' = the WAE CR):** hub cost was the sheet's 'Costing' tab AUD × fixed 2.85 (checked,
  every pax 2–10); now AUD × live FX in components: Car Rental (5-seater 2–3 · 8-seater 4–6 · 12-seater 7–10, AUD140 / 200 / 300 × 5 days ÷ pax), Driver-Guide day charges per group (Basic
  230 + 580 + 480 + 197, Std 230 + 686 + 746 + 197), Online Guide (OG) AUD80/pax, hotel AUD360 / 460 (Std with breakfast), entrance per CR (Maru 33 + Churchill 18 [+ Penguin 34]), visa
  assistance RM80 (MYR). Costing 2–10 pax (= catalog; 11+ quote manual — the 11–12 pax 5 % flag is gone); nights 4; child CWB 90 % / CNB 80 % (R&D). Margins (AUD 2.85177): adult 18.6–27.1 %.
  Add-ons: ticket costs = CR table (RM at 2.832), Puffing Billy / Enchanted sell = catalog RM190 / RM120 (Enchanted below cost → flag, PO); Maru / Churchill = deductions only −RM93 / −RM51,
  Penguin deduction −RM96 (Std), Penguin add-on RM110 (Basic); TripCare Area 3 kept (Area 2 removed), duplicate Blue Ribbon / header row / ETA visa RM70 (assistance is in the cost) /
  R&D car-rental rows 'Private Day Tour 5 / 7-8 / 12-seater' removed; Pocket Wifi prices swapped back (3GB 140, 6GB 200); new 'Hotel 3★ tambah 1 malam' cost AUD100 (sell 300 / peak 450),
  linked in KB rnd.cost (vnight) with the ticket / deduction add-ons. KB melbourne: Travel Date 2027 +RM100 removed, Late Booking RM50 kept (PO), rate card 12-seater 7–10 / 21-seater 11–18
  (= R&D), deductions = CR, TripCare from RM72, wifi swapped, ETA row removed. Catalogs unchanged (mirror: nothing to render); Flags / History from v94.
  Open (flags_open): the 5 catalog private day tours have no cost (City Full Day RM1,500 and GOR 12-seater sell below the CR car + day-charge estimate; no CR rate for Half Day /
  Puffing Billy / Mornington / Snow); child ticket costs. R&D sheet still says validity 30 Jun 2026 (catalog 31 Mar 2027 kept).
  **New Zealand (v97, PO ezie 14 Oct; source = ~/Downloads/'PT NSNZ R&D-ACAP PUNYA.xlsx' (PO Acap), tab Costing, compiled into contracts/nsnz 'ARBA NZ COSTING RATE 2026.pdf'):**
  ST North Island 6D5N removed (catalog nz-north-only deleted — mirror removed page / PDF, 404 checked; KB variant stni + card + texts; 6 North add-ons; pt-kb-house catalogs.json nav; names.json,
  flags.py, tools/catalogs.json, app.js CATALOG_ROUTE) and PT North 6D5N (no catalog) removed. PT 10D9N / South 8D7N cost = sheet (hub was the same sheet at NZD 2.327): own Malaysian
  driving guide per group (int. flight 5,500, dom. 800 (10D9N), hotel 3,000 / 2,400, wifi 250, insurance 250, wages 3,500 / 2,800 RM + NZeTA NZD123), vehicle + petrol + parking NZD per trip
  (4-seater 2–3 · 5-seater 4 · 8-seater 5–6 · 10-seater 7–8: 2,500 / 3,150 / 4,800 / 5,240 and South 1,900 / 2,300 / 3,550 / 3,600), hotel RM3,150 / 2,450, dom. flight RM800, meals NZD60,
  NZeTA NZD123 — NZD × live FX; 9–10 pax = sheet flat estimate RM3,800 / 3,500 and 3,100 / 2,800 per pax (flag). Margins (NZD 2.29331): 10D9N adult 12.3–21.1 % (2 pax lowest),
  South 15.7–29.7 %. ST 9D8N 3★ / Apartment costs kept (no source in the sheet, ~22.6 % at every pax → flag). Costing 2–10 pax. Add-ons: catalog items costed from the sheet
  (duplicates removed), TripCare Area 3 = sheet (+ 11–18 day couple / family / senior), Area 2 / Blue Ribbon duplicates / header row removed. Catalogs: typos (Dunedin, Souvenir,
  Accommodation, Access), 'Larnach Castle (Optional)'. KB new-zealand: late booking RM50 → 0 (Last Minute per catalog only), rate-card 'Sahkan dengan PO' notes removed, Taupo free
  gift removed; 2027 travel add-on +RM150 KEPT (PO exception). Hub list shows 'New Zealand North & South (3-Star Hotel)' (PO). Open (flags_open): 9–10 pax estimate, ST costs,
  add-ons without cost (Agrodome, Hamilton Garden, Shotover, Fruit Picking — prints Shotover's prices, Milford ex-Te Anau, child prices).
  **Raw costing (v100, PO):** MEL and NSNZ PT 10D9N / South 8D7N cost tables replaced by raw rates + formulas (d.rates, R.* with band(pax,…)) — Show rate reference / Show
  calculation now work there like Tokyo; costs unchanged. NB: other sessions pushed v95 / v96 / v98 / v99 (Competitor Analysis) in parallel — always pull before building a version.
  **Osaka (v102, PO ezie 14 Oct; sources = contracts/osk WIF CR 2026 + Google Sheet 'PT Japan R&D 2024' (1RAAurSLF2S9ILdl898sQDD3xWARdzifZT0y4EXlgdks) tabs COSTING - OSK BSC /
  COSTING - OSK STD, compiled block by block into contracts/osk 'OSAKA COSTING RATE WIF UCOP 2026.pdf'):** rates renamed (kix7 … ucopStd …). Basic = public pass ¥1,500 × N + JR Osaka–Kyoto
  ¥580 each way (was RM200/way — the sheet's Tokyo–Kyoto shinkansen rate) + Kintetsu ¥1,900 + hotel RM250 + guide 4 days per CR (+ own Kyoto / Nara fares) + WIF ¥6,000; airport Kansai per CR
  (7-seater 1–4 ¥20k · 10-seater 5–8 ¥25k · 14-seater 9–14 ¥30k · Coaster 15–18 ¥80k · Bus 19+ ¥130k; sheet blocks used Haneda rates; OS3 not answered by the PO — applied with OS4).
  Standard 2–7 Ucop Vellfire (¥18k × 2 + ¥215k) and new variant UCOP-HIACE 8–9 (¥80k + ¥275k) at Ucop FX 0.029 (sheet; was 0.0259), apartment RM250 (PO, sheet has 300); 10+ WIF 14-seater /
  Coaster / Bus per CR (2× city + Kyoto + Nara) + guide + WIF. Costing 2–30 kept (PO). Margins: Basic 18.7–40.1 %, Std 2–14 22.6–38.1 %, Std 15–30 −1.5 to 18.4 % (flag high: 13–30
  prices are extrapolated). Add-ons: catalog upgrade / public / private transport items costed per band (Tokyo pattern; private transport = sheet ADD ON table), R&D duplicates +
  Tokyo+Ghibli removed, meals = WIF CR, Tolak 1 malam −RM250, wifi ¥2,000/day, USJ cost RM249.4 (flag), TripCare pair / family. KB jepun rnd cost formulas for Osaka follow the new
  rates. tests/test_calc.js: Osaka calc string now 'A × 2 × W|…' and the osk / kix check boots a fresh mock repo (step 6 restores an older version). Catalogs / KB pages unchanged.
  Open: Std 15–30 below cost, USJ / 5G wifi, KB jepun breakfast RM40 < CR RM43.5; Wagyu cost kept at the CR ¥6,000 (sheet says RM255.2).
  **Padang - Bukittinggi (v103, PO ezie 14 Oct; CR = Pak Herman WhatsApp in contracts/pdg):** cost = CR per pax 2–4 RM550 · 5–10 525 · 11–15 500 · 16–19 485 (checked) + RM25/pax
  '4★ upgrade Berastagi' kept (PO: real cost — note Berastagi is in the Medan itinerary, not Padang); Costing 2–19 (CR max 19) and catalog / KB band 16–20 → 16–19 (PO); 4★ package (no
  catalog, cost = selling) removed, upgrade +RM80/night stays in catalog / KB; nights 3; Holbung / Aek Manik (Lake Toba items) removed, TripCare Area 2 + Blue Ribbon duplicates removed
  (Area 1 kept); child CWB 85 % / CNB 70 % kept. Adult margin 38.7–47.6 %. Open (flags_open): CR inclusions, 4★ upgrade / peak costs, add-ons without cost.
  **Perhentian (v104, PO ezie 14 Oct; source = ~/Desktop/'PT PERHENTIAN R&D.xlsx', tabs RAW DATA PHT + CALCULATOR PHT only — no CR in TO Contract Rate):** cost = CALCULATOR PHT
  (checked): Shari-La Fullboard Standard Twin low RM458 / Deluxe Triple 435, Mimpi Free & Easy Hill View twin 1,060 / triple 960 / single 1,590, + boat RM60 + snorkel RM60 per pax;
  Costing 1–10 pax (1 pax costed; 11–30 removed); child CWB / CNB = resort child rate Shari-La RM256 / Mimpi RM610 (flag); nights 2; catalog add-ons costed from the duplicates,
  duplicates / TripCare Area 2 / Blue Ribbon / header removed. Margins: Basic 17.6 % (1 pax), 27.5–38.1 %; Std 14.4–22.7 %. Open (flags, PO): boat / snorkel possibly double counted
  (Shari-La 578 → 458 if so), airport transfer 'Return RM65' vs one-way cost RM60, Fun Dive RM120 < cost 177, private boat / marine park, catalogs valid to 15 Oct 2026 (2027 season
  needed), KB Shari-La peak '21 Mac 2025' (should be 2026).
  **Perth (v105, PO ezie 14 Oct; source = ~/Desktop/'PT PER R&D.xlsx' tab Raw Costing → contracts/per 'PERTH COSTING RATE KN 2026.pdf'):** costs = K&N coach rates + ARBA components in
  AUD × live FX (were MYR at 2.853746): Std 12-Seater 2× airport AUD250 + 2× 8 h AUD800; Prem 2× airport + 6 h + 8 h + 5 h + Pinnacles AUD1,000 (= AUD3,400; R&D 3,416); accommodation by room
  config (table); lunch / entrance / tipping / K&N charge AUD100 / driver meals per R&D. NB the hub's old Premium meals-entrance-tipping was AUD268 vs R&D 395 → Premium cost +≈RM350/pax
  (2 pax adult 4.6 %, = R&D). Costing 2–10; child per R&D CWB 100 %, CNB = adult − accommodation (rules free) → CWB 2–3 pax ≈2–7 %. Add-ons: catalog items costed from R&D duplicates
  (Mandurah RM140 < cost 141, flag). KB: late booking RM50/booking (catalog); 2027 travel-date +RM100 kept (PO); Autumn & Winter peak already in the calculator. Open (flags): Premium
  2–5 pax margin, CWB, tipping / K&N charge / driver meals, transport tolak / tambah costs vs K&N, single supplement cost.
  **Phuket (v106, PO ezie 15 Oct; basis = ~/Desktop/'PT R&D Phuket 2026.xlsx' (= KTT 2026 package PDFs in contracts/phu) → contracts/phu 'PHUKET COSTING RATE KTT RND 2026.pdf'):** 10 season / hotel
  packages → 2 catalog packages (ids ktt-ibis-standard-lowseason / ktt-ibis-budget-phi-phi-lowseason kept); options = alternative TOs with sellingUpgrade (Std Marina 4★ +300, peak Jan–Apr
  +250 / +550, Nov–Dec +300 / +600; Basic default Day 3 James Bond THB6,700 at catalog RM1,397 (PO), Phi Phi +100, Marina +300 / +400); cost = KTT THB per person × live FX (was MYR
  at 0.122); Costing 2–10; nights 3. Catalog Standard peak now 1 Nov 2026 – 10 Jan 2027 +RM300 (was from 21 Dec; KTT high season starts 1 Nov) + KB calculator. Margins 31.8–42.2 % per TO.
  tests/test_calc.js names threshold ≥185 (8 packages removed). Open (flags): no KTT rate after 20 Dec 2026 / 2027 (R&D 2027: Ibis unavailable, Tony Resort), Basic 4★ +250 (R&D) vs +300,
  Banana / Parasailing low-end prices below cost, day-tour transport at cost, single supplement.
  **Semporna (v107, PO ezie 15 Oct; source = ~/Downloads/'PT SEMPORNA R&D 2023 (1).xlsx' tabs COSTING SEM (PO: latest calculation) + RAW DATA → contracts/sem 'SEMPORNA COSTING RATE RND.pdf'):**
  cost = airport 2× RM30 + boat RM30 + accommodation by room config (Basic 2 pax RM540 / 3+ 640 per pax, Std 700) + meals 85 / 155 + island hopping RM157 → Basic 2 pax RM872 / 3–10 972,
  Std 1,102, 1 pax 1,412 / 1,802 (old 'Legend' costs had no CR); 8 packages → 2 catalog packages, water-chalet upgrades as alternative TOs (catalog +150 / 450 / 600, cost RAW − Nusakuya
  +70 / 300 / 450); 3★ and honeymoon packages removed; Costing 1–10; add-ons costed per R&D. Margins Basic 18.8–27.2 %, Std 21.1 % (= R&D). tests names threshold ≥180. Open (flag): 2023
  workbook / unnamed hotels behind 'Accomm', upgrades vs Lato-Lato at / below cost, 3★ and honeymoon not costed, child CWB 85 % / CNB 65 % (RAW child 50 %).
  **Surabaya - Bromo - Malang (v108, PO ezie 15 Oct; sources = Pak Jamal CRs in contracts/subb: 'PAKEJ SURABAYA' hotel + transport (same PDF as JOG) + 'Contract Rate Pak Jamal.pdf'
  2026 from R&D SURABAYA BROMO MALANG (entrance IDR, Jeep Bromo IDR1m / max 5, transport only RM/day); R&D read with PO OK):** the hub cost was the PT_SUBB_RD_reformatted 'CR' tab formula
  (hotel RM50/night, meals RM20×6 although L&D are excluded, jeep RM300 — no source) → Bromo = CR package 830 / 780 / 730 / 650 (2 / 3 / 4–5 / 6–10) + ceil(pax/5) × jeep + entrance
  Bromo / Santerra / apple / Coban IDR435k, IDR × live FX (2 pax RM1,210 → 1,044); 11–15 held at the 6–10 rate (no CR, flag); Surabaya–Malang has no CR → package rate as proxy + entrance
  incl. Museum Angkut + Jatim Park 2 IDR140k (R&D asal) (flag); tipping RM0 (= Jogja); nights 3; Costing Bromo 2–15 / S-M 2–10 (= catalogs). Margins adult Bromo 18.6–31.0 %, S-M 26.1–31.7 %;
  CWB / CNB no longer below cost (CNB 7–15 pax 4.6–7.5 %, child CWB 100 % / CNB −RM150 kept). Add-ons: duplicates a01–a07 removed; guide Tumpak Sewu RM57, Ijen RM88 / Semeru RM137 (2-pax
  costs) from the CR; one hotel 'Aston Inn Batu'. Catalogs: expired peak windows removed (20 Dec 2026 – 5 Jan 2027 kept), note 'Upgrade to 4 Star Hotel +RM240/person' (source PDF banner;
  table still Add RM85/night), typos, S-M code SUBB, kb_url / PO. KB: 2027 'no surcharge' texts removed, peak windows = catalog, Hiace 5–12 / 2× Hiace 13–15, FAQ flight / IDR / 16+ pax.
  Not changed (PO left open): Day 1 'Hotel or Homestay', 'valid until 31 Jan 2027' note (CR ends Dec 2026). Open (flags_open): S-M / 11–15 / child / single / peak / 4★ rates, add-ons
  without cost, KB transport rate card at / below cost (Avanza 1 day RM300 < CR 335; Hiace RM900 vs CR 500).
  **Switzerland (v109, PO ezie 15 Oct; sources = Musafir Eropah CR image + R&D SWITZERLAND 'PT SWS R&D - reformatupload.xlsx' (read with PO OK) → contracts/sws
  'SWITZERLAND COSTING RATE RND.pdf'):** the hub cost was the R&D CR tab in MYR at fixed CHF 5.0589: hotel RM500 × 6 + van RM20,000 per trip (no source) + city tax CHF20 + insurance RM58
  + 'visa' RM150 / 54. Now raw rates: hotel RM500/pax/night × N (R&D estimate, flag) + Musafir van + driver-guide × 7 days (1 van 2–7, 2 vans 8–14) by CR season — default TO Mid RM3,250/day,
  alternative TOs Low 3,000 / Peak 3,500 / Special 3,750 (TO Comparison; names.json) — + city tax CHF20 + Blausee CHF11; Self Tour = hotel + Swiss Travel Pass 8 days CHF419 (catalog D1–D7) + Blausee;
  insurance / visa removed (catalog excludes insurance, no Schengen visa), ST city tax removed (customer pays); CHF × live FX; nights 6. Margins adult PT Mid 1.8 % (2 pax) – 17.9 %, ST 10.2 % —
  catalog prices unchanged, flagged high (PO: flag only; Peak / Special below cost at 2 / 3 / 9 / 11 pax; catalog peak windows ≠ CR seasons). Add-ons: 46 duplicates removed, catalog items costed in CHF
  (child ticket costs unknown), wifi 3GB / 6GB swapped back, TripCare couple / family per pair / family (Area 2 for Europe to confirm). Catalogs: expired peak windows removed, typos, ST basis
  'Ground Only', PO Thania, kb_url. KB: single = quoted upon request (was RM2,800), Travel Map night 6 = Bern, wifi, FAQ CHF ≈ RM4.90 / 2027 +RM370. Not done: Self Tour variant in the KB (flag).
  PT Quotation Hub prototype (Sales quotations, versions, PO notes; Beijing) is local only, ON HOLD (PO 12 Oct) — not in the repo.
- **Live FX not used by 2 destinations** (costs stored in MYR): JOG, MLE (PER v105, PHU v106, SUBB v108, SWS v109 done) (MEL v94, NSNZ v97 done; NSNZ ST 9D8N still MYR, no source) —
  convert each to its currency during its check (confirm the FX each table was made with first).
- **Next:** ask the PO which destination to verify next (Osaka done v102; Tokyo-Osaka KIX shares the Japan rates and still uses Ucop 0.0259 — check next; Melbourne done v94; Perth / New Zealand share the PO Acap and AUD/NZD FX work; Tokyo v90 with two items flagged on hold; Lombok v91; Maldives v92; Lake Toba v93; Surabaya v108; Switzerland v109).
- **Method notes (13–14 Oct):** tools/vdiff.js = the changes list (app.js diff / describe in jsdom, reverse-checked, null = absent; keep catalog and KB BEFORE copies in
  separate base/cat and base/kb dirs — same slug names collide, e.g. jakarta-bandung); tools/textdiff.py = live-text diff of rebuilt HTML / PDF vs snapshot (PDFs built on a
  Mac show ligature differences, the CI build does not). Write data / KB files only after every text assertion passed. zsh does not split "$VAR" lists — pass slugs
  explicitly. Large CR uploads: `git -c http.postBuffer=524288000 push`; check PDFs for embedded whole fonts (Krabi 2027: Segoe UI Emoji 8 MB) and subset them (PyMuPDF +
  fontTools) before uploading. New app.js field (v84): variants[].sellingUpgrade (RM/pax added to the catalog price for that TO). PO asks for open items to go into
  tools/flags_open.json (use area "Cost", not "Margin", for items without a package — Margin items are merged per package). Removed packages need tests/test_calc.js updates.
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
1. Tokyo: RESOLVED (PO 14 Oct, v89) — catalog v1 (Tokyo Standard 2 pax RM6,197) is current; the unpublished "v2" price tables were removed from
   the local ProdReq Jepun skill (§10 + SKILL.md) and from the stored KB jepun tiers. Tokyo check in progress (K1–K13 on hold by PO).
   Qayyum open items: tolls/parking/fuel inside the rate? guide's own entrance? Iyashi entrance still on WIF FX 0.029.
2. Korea CR: Basic 16 pax 406,193 KRW looks wrong; no rate 26–30 pax (except Standard); CR seasonal ±RM150–300 not applied;
   2-pax margin thin on Seoul-Jeju / Jeju-Udo.
3. Done (v92): Maldives TO names ICOM / Island Life / Kaani Palm Beach.
4. Lake Toba names confirmed by the CRs (Emiya Parapat / Emiya Samosir / Baim Samosir, v93). Still to confirm: Perhentian Basic = Shari-La, Standard = Mimpi.
5. One FX per currency (THB 0.131 vs 0.122; IDR; USD 3.97 vs 4.0295; RMB 0.65 vs 0.58; AUD).
6. Done (v29, 8 Oct): the catalog is the source for prices — Costing catalog prices of the 13 catalogs that differed were set to the published catalogs.
   /flags/ regenerated 7 Oct on data v25 (95 flags: 29 high · 37 medium · 29 low). New since v6: KK margin
   problems in 11 lines and Perhentian Shari-La under 10% / CWB below cost (both from Selling = Catalog − RM200),
   Seoul-Jeju 2 pax 6.8% and Jeju-Udo 3.8% margin, Korea 26–30 pax no cost, Qayyum FX 0.026 (HND) vs 0.0259 (KIX).
7. Done: Yunnan 3 Wilayah (KMGDL, v52–v53, verified v86) and Maldives 4 Star (v54) have Costing. Codes SNZ, NNZ, SUBM not on the hub.
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
