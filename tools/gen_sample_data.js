// gen_sample_data.js — generates a FULLY SYNTHETIC sample/sample_dashboard_data.json.
//
// No real customer data, no data connection, no tenant. Deterministic (seeded) so the
// output is byte-stable across runs. The shape mirrors the single `dashboard_data.json`
// contract that every visual's build_mock.js reshapes a slice of, so all visuals can be
// exercised against fake data. See DATA.md for the full contract.
//
// Run:  node tools/gen_sample_data.js
"use strict";
const fs = require("fs");
const path = require("path");

// --- tiny seeded PRNG (mulberry32) so the sample is reproducible ---
let _s = 20260817 >>> 0;
const rnd = () => { _s |= 0; _s = (_s + 0x6D2B79F5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const money = (a, b) => Math.round(ri(a, b) / 1000) * 1000;
const kmoney = (a, b) => ri(a, b); // "in $K" values used by territory grain
const delta = (a, b) => (rnd() < 0.35 ? 0 : Math.round(ri(a, b) / 1000) * 1000);

// --- calendar ---
const MONTHS = ["jul", "aug", "sep", "oct", "nov", "dec", "jan", "feb", "mar", "apr", "may", "jun"];
const MLABEL = { jul: "July", aug: "August", sep: "September", oct: "October", nov: "November", dec: "December", jan: "January", feb: "February", mar: "March", apr: "April", may: "May", jun: "June" };
const MDUE = { jul: "2026-07", aug: "2026-08", sep: "2026-09", oct: "2026-10", nov: "2026-11", dec: "2026-12", jan: "2027-01", feb: "2027-02", mar: "2027-03", apr: "2027-04", may: "2027-05", jun: "2027-06" };
const Q_MONTHS = { q1: ["jul", "aug", "sep"], q2: ["oct", "nov", "dec"], q3: ["jan", "feb", "mar"], q4: ["apr", "may", "jun"] };
const QS = ["q1", "q2", "q3", "q4"];
const QLABEL = { q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4" };
const monthQuarter = m => QS.find(q => Q_MONTHS[q].includes(m));

// --- fake dimensions (no real names) ---
const UNITS = [
  { label: "Contoso EC", code: "EC", groups: ["Retail", "Manufacturing"] },
  { label: "Northwind RCMC", code: "RCMC", groups: ["Financial Services", "Healthcare"] },
  { label: "Fabrikam PS", code: "PS", groups: ["Public Sector"] },
  { label: "Litware SDP", code: "SDP", groups: ["Digital Natives"] },
];
const SEGMENTS = ["Enterprise", "Corporate", "Strategic"];
const STAGES = ["Listen & Consult", "Inspire & Design", "Empower & Achieve", "Realize Value", "Manage & Optimize"];
const STATUSES = ["On Track", "At Risk", "Behind"];
const PILLARS = ["Migrate", "Innovate", "Secure"];
const SUPER = ["Cloud", "AI", "Data"];
const WORKLOADS = ["Infra", "App Innovation", "Data & AI", "Security"];
const ACR_TIERS = ["$0-100K", "$100K-500K", "$500K-1M", "$1M+"];
const REGIONS = ["West Europe", "North Europe", "UK South", "UK West"];
const CATS = ["Renewal", "New Workload", "Expansion", "Consumption"];
const HYG_CATS = [
  { key: "no_next_step", label: "No next step / stale" },
  { key: "past_due", label: "Past due close date" },
  { key: "no_amount", label: "Missing pipeline amount" },
  { key: "low_confidence", label: "Low confidence, high value" },
  { key: "no_solution", label: "No solution area set" },
];
const FAKE_ACCOUNTS = ["Alpine Logistics", "Borealis Foods", "Cedar Mutual", "Delta Pharma", "Evergreen Energy",
  "Falcon Retail", "Granite Bank", "Harbor Health", "Iris Media", "Juniper Telecom", "Kestrel Air",
  "Lumen Works", "Meridian Steel", "Nimbus Cloud", "Orchard Group", "Pinnacle Auto", "Quartz Mining",
  "Riverbend Utilities", "Summit Insurance", "Tideway Ports", "Umbra Games", "Vertex Chemical",
  "Willow Care", "Xenon Labs", "Yarrow Agri", "Zephyr Wind", "Aurora Textiles", "Basalt Construction",
  "Cobalt Devices", "Drift Marine", "Ember Foods", "Fjord Shipping", "Glacier Water", "Harvest Retail",
  "Ionic Telecom", "Jade Gaming", "Kelp Bio", "Larch Timber", "Mica Systems", "Onyx Finance"];
const FIRST = ["Alex", "Sam", "Jordan", "Riley", "Casey", "Morgan", "Taylor", "Jamie", "Drew", "Quinn", "Reese", "Skyler"];
const LAST = ["Carter", "Patel", "Nguyen", "Obrien", "Rossi", "Kowalski", "Haines", "Ferraro", "Singh", "Mendez", "Brooks", "Adeyemi"];

const ownerPool = [];
for (let i = 0; i < 14; i++) {
  const f = FIRST[i % FIRST.length], l = LAST[(i * 3) % LAST.length];
  ownerPool.push({ name: `${f} ${l}`, first: f, upn: `${f}.${l}@example.com`.toLowerCase(), mgr: `${pick(FIRST)} ${pick(LAST)}` });
}
const someOwner = () => pick(ownerPool);
const tpidSeq = (() => { let n = 1000000; return () => String(n += ri(137, 991)); })();
const lnkToken = () => "SYN-" + ri(100000, 999999).toString(36).toUpperCase() + "-" + ri(1000, 9999);
const LINK_BASE = "https://msx.example.com/main.aspx?etn=msp_engagementmilestone&pagetype=entityrecord";

function terrCode(unit, gi, ti) { return `${unit.code}.${String.fromCharCode(65 + gi)}${ti + 1}.UM.0${ti + 1}`; }

// ---------------------------------------------------------------------------
// Build unit -> group -> territory skeleton (shared by many slices)
// ---------------------------------------------------------------------------
const skeleton = []; // {unit, code, group, terr}
const territoryList = [];
for (const u of UNITS) {
  for (let gi = 0; gi < u.groups.length; gi++) {
    const g = u.groups[gi];
    const nTerr = ri(2, 3);
    for (let ti = 0; ti < nTerr; ti++) {
      const terr = terrCode(u, gi, ti);
      skeleton.push({ unit: u.label, code: u.code, group: g, terr });
      territoryList.push(terr);
    }
  }
}

// ---------------------------------------------------------------------------
// 1) territory_monthly  (units -> groups -> territories, per-month measures in $K)
// ---------------------------------------------------------------------------
const territory_monthly = { as_of: "2026-08-17", wow_label: "vs 7 days ago", source: "synthetic", units: [], unit_movement: {} };
for (const u of UNITS) {
  const unit = { label: u.label, code: u.code, tgt: {}, groups: [] };
  for (const m of MONTHS) unit.tgt[m] = money(300000, 1500000);
  for (const q of QS) unit.tgt[q] = Q_MONTHS[q].reduce((s, m) => s + unit.tgt[m], 0);
  for (let gi = 0; gi < u.groups.length; gi++) {
    const group = { name: u.groups[gi], territories: [] };
    const terrs = skeleton.filter(s => s.unit === u.label && s.group === u.groups[gi]).map(s => s.terr);
    for (const tname of terrs) {
      const t = { name: tname };
      for (const m of MONTHS) {
        t[m + "_cp"] = kmoney(30, 620);
        t[m + "_bl"] = kmoney(0, 90);
        t[m + "_ucp"] = kmoney(10, 400);
        t[m + "_nq"] = kmoney(0, 250);
        t[m + "_tgt"] = kmoney(60, 700);
        t[m + "_wow"] = delta(-40000, 60000) / 1000 | 0;
        t[m + "_wow_bl"] = delta(-20000, 30000) / 1000 | 0;
      }
      for (const q of QS) {
        for (const k of ["cp", "bl", "ucp", "nq", "tgt"]) t[q + "_" + k] = Q_MONTHS[q].reduce((s, m) => s + t[m + "_" + k], 0);
        t[q + "_wow"] = Q_MONTHS[q].reduce((s, m) => s + t[m + "_wow"], 0);
        t[q + "_wow_bl"] = Q_MONTHS[q].reduce((s, m) => s + t[m + "_wow_bl"], 0);
      }
      group.territories.push(t);
    }
    unit.groups.push(group);
  }
  territory_monthly.units.push(unit);
}
// unit_movement keyed by period label -> unit label
const ALL_PERIOD_LABELS = [];
for (const q of QS) { for (const m of Q_MONTHS[q]) ALL_PERIOD_LABELS.push(MLABEL[m]); ALL_PERIOD_LABELS.push(QLABEL[q]); }
for (const lbl of ALL_PERIOD_LABELS) {
  territory_monthly.unit_movement[lbl] = {};
  for (const u of UNITS) territory_monthly.unit_movement[lbl][u.label] = { dod: delta(-50000, 60000), wow: delta(-90000, 120000), dod_ucp: delta(-30000, 40000), wow_ucp: delta(-60000, 80000) };
}

// ---------------------------------------------------------------------------
// 2) nnr_progress  (official headline by period label)
// ---------------------------------------------------------------------------
const nnr_progress = { quarter_order: ["Q1", "Q2", "Q3", "Q4"], current_label: "Q1", quarters: {} };
for (const q of QS) {
  const periods = [];
  for (const m of Q_MONTHS[q]) {
    periods.push({
      label: MLABEL[m], target: money(1500000, 4500000),
      committed: money(800000, 3800000), blocked: money(0, 400000), uncommitted: money(300000, 2200000),
      nonqual: money(200000, 1800000),
      dod_committed: delta(-120000, 180000), wow_committed: delta(-260000, 360000),
      dod_uncommitted: delta(-90000, 120000), wow_uncommitted: delta(-160000, 200000),
      dod_nonqual: delta(-80000, 120000), wow_nonqual: delta(-140000, 180000), wow_blocked: delta(-60000, 90000),
    });
  }
  // quarter roll-up (label === quarter name)
  const roll = { label: QLABEL[q], target: 0, committed: 0, blocked: 0, uncommitted: 0, nonqual: 0, dod_committed: 0, wow_committed: 0, dod_uncommitted: 0, wow_uncommitted: 0, dod_nonqual: 0, wow_nonqual: 0, wow_blocked: 0 };
  for (const p of periods) for (const k of Object.keys(roll)) if (k !== "label") roll[k] += p[k];
  periods.push(roll);
  nnr_progress.quarters[QLABEL[q]] = { periods };
}

// ---------------------------------------------------------------------------
// 3) accounts[]  (NNRAccounts)
// ---------------------------------------------------------------------------
const accounts = [];
for (let i = 0; i < FAKE_ACCOUNTS.length; i++) {
  const sk = pick(skeleton);
  const a = {
    tpid: tpidSeq(), name: FAKE_ACCOUNTS[i], territory: sk.terr, atu: sk.group, segment: pick(SEGMENTS),
    unit_raw: sk.unit, unit: sk.unit, macc: rnd() < 0.4, high_consuming: rnd() < 0.55,
    msx_macc_flag: rnd() < 0.35, macc_curated: rnd() < 0.3, acr_tier: pick(ACR_TIERS), acr_monthly: money(5000, 900000),
    pillars: [pick(PILLARS), pick(PILLARS)].filter((v, j, s) => s.indexOf(v) === j).join(", "),
  };
  for (const m of MONTHS) {
    a[m + "_cp"] = money(0, 500000); a[m + "_ucp"] = money(0, 350000);
    a[m + "_cp_dod"] = delta(-40000, 60000); a[m + "_ucp_dod"] = delta(-30000, 45000);
    a[m + "_cp_wow"] = delta(-70000, 90000); a[m + "_ucp_wow"] = delta(-50000, 70000);
    a[m + "_cp_mom"] = delta(-90000, 120000); a[m + "_ucp_mom"] = delta(-70000, 90000);
  }
  for (const q of QS) {
    a[q + "_cp"] = Q_MONTHS[q].reduce((s, m) => s + a[m + "_cp"], 0);
    a[q + "_ucp"] = Q_MONTHS[q].reduce((s, m) => s + a[m + "_ucp"], 0);
    a[q + "_total"] = a[q + "_cp"] + a[q + "_ucp"];
    a[q + "_cp_dod"] = delta(-90000, 120000); a[q + "_ucp_dod"] = delta(-70000, 90000); a[q + "_total_dod"] = a[q + "_cp_dod"] + a[q + "_ucp_dod"];
    a[q + "_cp_wow"] = delta(-160000, 220000); a[q + "_ucp_wow"] = delta(-120000, 160000); a[q + "_total_wow"] = a[q + "_cp_wow"] + a[q + "_ucp_wow"];
    a[q + "_cp_mom"] = delta(-200000, 260000); a[q + "_ucp_mom"] = delta(-160000, 200000); a[q + "_total_mom"] = a[q + "_cp_mom"] + a[q + "_ucp_mom"];
  }
  accounts.push(a);
}

// ---------------------------------------------------------------------------
// 4) milestone_facts + departures  (NNRMilestones)
// ---------------------------------------------------------------------------
const milestoneRows = [];
for (let i = 0; i < 260; i++) {
  const acct = pick(accounts);
  const m = pick(MONTHS), q = monthQuarter(m);
  const o = someOwner();
  const cf = rnd() < 0.55 ? 1 : 0;
  const m_cp = cf ? money(0, 300000) : 0;
  const m_ucp = cf ? 0 : money(0, 220000);
  const m_amt = m_cp + m_ucp;
  const r = {
    id: "7-" + ri(100000000, 999999999), due: MDUE[m] + "-15", duemo: MDUE[m], pk: QLABEL[q], nonrec: rnd() < 0.8,
    tpid: acct.tpid, acct: acct.name, terr: acct.territory, atu: acct.atu, su: acct.unit, seg: acct.segment,
    own: o.name, mgr: o.mgr, grp: acct.atu, stage: pick(STAGES), st: pick(STATUSES), cat: pick(CATS), cf: cf,
    sp: pick(PILLARS), ssp: pick(SUPER), nm: acct.name, wl: pick(WORKLOADS), lnk: lnkToken(),
    macc: acct.macc, hc: acct.high_consuming, acr: acct.acr_tier,
    m_amt: m_amt, m_cp: m_cp, m_ucp: m_ucp, m_qp: m_cp + m_ucp, m_nq: money(0, 120000),
    q_amt: m_amt, q_cp: m_cp, q_ucp: m_ucp, q_qp: m_cp + m_ucp, q_nq: money(0, 120000),
    m_cp_dod: delta(-30000, 40000), m_cp_wow: delta(-50000, 60000), m_ucp_dod: delta(-20000, 30000), m_ucp_wow: delta(-35000, 45000),
    q_cp_dod: delta(-40000, 55000), q_cp_wow: delta(-70000, 90000), q_ucp_dod: delta(-30000, 40000), q_ucp_wow: delta(-55000, 70000),
    commitment_prev_dod: rnd() < 0.15 ? (cf ? "Uncommitted" : "Committed") : null,
    st_prev_dod: rnd() < 0.12 ? pick(STATUSES) : null, due_prev_dod: rnd() < 0.1 ? MDUE[pick(MONTHS)] + "-15" : null,
  };
  milestoneRows.push(r);
}
const milestone_facts = { as_of: "2026-08-17", link_base: LINK_BASE, count: milestoneRows.length, rows: milestoneRows,
  columns: [], mv_tpid: {}, wow_terr: {}, dod_terr: {}, mom_terr: {}, mv_period: {}, movements: {} };

const departureRows = [];
const DEP_REASONS = ["Slipped out of quarter", "Moved to Uncommitted", "Closed / Lost", "Re-scoped", "Duplicate removed"];
for (let i = 0; i < 18; i++) {
  const acct = pick(accounts); const m = pick(MONTHS), q = monthQuarter(m); const o = someOwner(); const cf = rnd() < 0.5 ? 1 : 0;
  departureRows.push({
    id: "7-" + ri(100000000, 999999999), acct: acct.name, tpid: acct.tpid, nm: acct.name, due: MDUE[m] + "-15", duemo: MDUE[m], pk: QLABEL[q],
    terr: acct.territory, atu: acct.atu, su: acct.unit, seg: acct.segment, own: o.name, mgr: o.mgr, grp: acct.atu,
    sp: pick(PILLARS), ssp: pick(SUPER), wl: pick(WORKLOADS), st: pick(STATUSES), reason: pick(DEP_REASONS),
    was: pick(["Committed", "Uncommitted"]), last_pipe: money(20000, 400000), pipe_prev: money(20000, 400000), cf: cf,
    commitment_prev_dod: pick(["Committed", "Uncommitted"]), st_prev_dod: pick(STATUSES), due_prev_dod: MDUE[pick(MONTHS)] + "-15",
    fromp: pick(["Q1", "Q2"]), fromm: MLABEL[pick(MONTHS)], lnk: lnkToken(), macc: acct.macc, hc: acct.high_consuming,
  });
}
const departures = { as_of: "2026-08-17", window_days: 7, count: departureRows.length, total: departureRows.reduce((s, r) => s + r.last_pipe, 0), rows: departureRows, source: "synthetic", columns: [] };

// ---------------------------------------------------------------------------
// 5) azure_daily + pipeline  (NNRAzure)
// ---------------------------------------------------------------------------
const azure_daily = { run_date_label: "17 Aug 2026", snap_date_label: "16 Aug 2026", dod_date: "2026-08-16", wow_date: "2026-08-10", stages_measured: true, targets: {}, periods: {}, movement: {}, stages: {}, stages_measured_note: "synthetic" };
const juneLbl = "June (FY26 Q4)";
azure_daily.targets[juneLbl] = money(1000000, 2500000);
azure_daily.periods[juneLbl] = { cp: money(500000, 2000000), bl: money(0, 200000), ucp: money(200000, 900000), qp: money(800000, 3000000) };
azure_daily.movement[juneLbl] = { dod: delta(-80000, 100000), wow: delta(-160000, 200000) };
for (const q of QS) for (const m of Q_MONTHS[q]) {
  const lbl = MLABEL[m];
  azure_daily.targets[lbl] = money(900000, 3000000);
  azure_daily.periods[lbl] = { cp: money(400000, 2400000), bl: money(0, 300000), ucp: money(200000, 1400000), qp: money(700000, 3600000) };
  azure_daily.movement[lbl] = { dod: delta(-90000, 120000), wow: delta(-180000, 240000) };
}
for (const q of QS) {
  azure_daily.stages[QLABEL[q]] = STAGES.map(s => ({ stage: s, cp: money(0, 900000), ucp: money(0, 600000), qp: money(0, 1200000) }));
}

const pipeline = { as_of: "2026-08-17", model: "synthetic", source: "synthetic", note: "fake", created_by_measure: "count", quarter_months: Q_MONTHS, owner_group: {}, created_by: {}, created_by_creation: {} };
const OWNER_GROUPS = ["SSP Cloud", "SSP Apps", "SSP Data & AI", "ATU Core"];
const CREATE_GRP = ["Seller-created", "Partner-created", "Marketing-sourced"];
for (const q of QS) {
  const pk = QLABEL[q];
  pipeline.owner_group[pk] = OWNER_GROUPS.map(g => ({ group: g, cp: money(100000, 1600000) }));
  pipeline.created_by[pk] = CREATE_GRP.map(g => ({ group: g, cp: money(80000, 1200000), bp: money(0, 200000), ucp: money(50000, 800000), qp: money(150000, 1800000) }));
  pipeline.created_by_creation[pk] = [];
  for (const g of CREATE_GRP) for (const crq of [pk, "Older"]) pipeline.created_by_creation[pk].push({ group: g, crq, crm: crq === "Older" ? "Older" : MLABEL[Q_MONTHS[q][0]], cp: money(20000, 600000), bp: money(0, 90000), ucp: money(10000, 400000), qp: money(40000, 900000) });
}

// ---------------------------------------------------------------------------
// 6) capacity  (NNRCapacity)
// ---------------------------------------------------------------------------
const capacityRows = [];
for (let i = 0; i < 40; i++) {
  const acct = pick(accounts); const o = someOwner(); const m = pick(MONTHS);
  capacityRows.push({ id: "7-" + ri(100000000, 999999999), account: acct.name, usage: money(5000, 400000), due: MLABEL[m] + " 2026", due_raw: MDUE[m] + "-20", owner: o.name, status: pick(["Capacity", "Service Availability", "Help Needed"]), committed: rnd() < 0.6, msx: LINK_BASE + "&id=" + lnkToken(), created_raw: "2026-0" + ri(1, 8) + "-12", region: pick(REGIONS) });
}
const capacity = { as_of: "2026-08-17", reference: "Flagged in MSX as Capacity/Service Availability or Help Needed = Azure Capacity", count: capacityRows.length, monthly_usage: capacityRows.reduce((s, r) => s + r.usage, 0), rows: capacityRows };

// ---------------------------------------------------------------------------
// 7) pipeline_hygiene  (NNRHygiene)
// ---------------------------------------------------------------------------
const owner_directory = {};
for (const o of ownerPool) owner_directory[o.name] = { name: o.name, first: o.first, upn: o.upn };
const hygCategories = HYG_CATS.map(c => {
  const rows = [];
  const n = ri(4, 12);
  for (let i = 0; i < n; i++) {
    const acct = pick(accounts); const o = someOwner(); const m = pick(MONTHS);
    rows.push({ id: "7-" + ri(100000000, 999999999), account: acct.name, due: MLABEL[m] + " 2026", due_raw: MDUE[m] + "-28", status: pick(STATUSES), owner: o.name, msx: LINK_BASE + "&id=" + lnkToken(), usage: money(0, 300000) });
  }
  return { key: c.key, label: c.label, rows };
});
const pipeline_hygiene = { as_of: "2026-08-17", source_file: "synthetic", note: "fake", reference: "weekly hygiene export", window_days: 7, categories: hygCategories, owner_directory };

// ---------------------------------------------------------------------------
// 8) territory_gaps  (NNRGaps) — flag a subset of real territory names
// ---------------------------------------------------------------------------
const gapSegments = UNITS.map(u => {
  const subsegments = u.groups.map(g => {
    const terrs = skeleton.filter(s => s.unit === u.label && s.group === g).map(s => s.terr);
    return { name: g, territories: terrs.filter(() => rnd() < 0.6).map(tn => ({ name: tn, jul_flag: rnd() < 0.5, q1_flag: rnd() < 0.5 })) };
  });
  return { name: u.label, subsegments };
});
const flaggedCount = gapSegments.reduce((s, sg) => s + sg.subsegments.reduce((n, ss) => n + ss.territories.filter(t => t.q1_flag || t.jul_flag).length, 0), 0);
const territory_gaps = { date: "2026-08-17", segments: gapSegments, flagged: flaggedCount, q1_threshold: 0.9, jul_threshold: 0.9, source: "synthetic" };

// ---------------------------------------------------------------------------
// 9) nnr_outlook  (NNROutlook)
// ---------------------------------------------------------------------------
const nnr_outlook = { source_file: "synthetic", segment_order: UNITS.map(u => u.label), quarters: {} };
for (const q of QS) {
  const sections = Q_MONTHS[q].map(m => {
    const rows = UNITS.map(u => ({ segment: u.label, budget: money(300000, 2000000), committed: money(100000, 1600000), uncommitted: money(50000, 900000), blocked: money(0, 200000) }));
    const sum = k => rows.reduce((s, r) => s + r[k], 0);
    return { label: MLABEL[m], official_target: money(1500000, 4500000), official_committed: sum("committed"), official_blocked: sum("blocked"), official_uncommitted: sum("uncommitted"), rows };
  });
  nnr_outlook.quarters[QLABEL[q]] = { sections };
}

// ---------------------------------------------------------------------------
// 10) movements  (NNRMovements — no build_mock; contract documented)
// ---------------------------------------------------------------------------
const MOVE_CATS = ["Newly committed", "Slipped in", "Slipped out", "Unblocked", "Moved to uncommitted", "Lost / cancelled", "Value up", "Value down", "New", "Deleted"];
const movements = {
  order: ["Q1", "Q2"], labels: { Q1: "FY27 Q1", Q2: "FY27 Q2" }, departure_cats: DEP_REASONS,
  periods: {}, entering: {}, leaving: {},
};
for (const pk of ["Q1", "Q2"]) {
  movements.periods[pk] = MOVE_CATS.map(c => ({ cat: c, value: delta(-400000, 600000), count: ri(0, 22) }));
  movements.entering[pk] = milestoneRows.slice(0, 6).map(r => ({ ms: r.id, nm: r.acct, lnk: LINK_BASE + "&id=" + r.lnk, value: r.m_amt, cat: pick(MOVE_CATS) }));
  movements.leaving[pk] = departureRows.slice(0, 5).map(r => ({ ms: r.id, nm: r.acct, lnk: LINK_BASE + "&id=" + r.lnk, value: r.last_pipe, cat: r.reason }));
}

// ---------------------------------------------------------------------------
// 11) frontier_macc  (NNRFrontier — chunked JSON blob; minimal valid structure)
// ---------------------------------------------------------------------------
const frontierAccounts = accounts.filter(a => a.macc || a.macc_curated).slice(0, 24).map(a => ({
  tpid: a.tpid, name: a.name, unit: a.unit, atu: a.atu, territory: a.territory,
  macc_pbo: money(200000, 4000000), macc_vtt: +(rnd() * 1.6).toFixed(2), cp: a.q1_cp, ucp: a.q1_ucp, qp: a.q1_cp + a.q1_ucp,
  unified_adoption: rnd() < 0.5, msx_plan: rnd() < 0.5 ? true : (rnd() < 0.5 ? false : null), industry: pick(["Retail", "FSI", "Manufacturing", "Public Sector", "Health"]),
}));
const frontier_macc = {
  as_of: "2026-08-17", pack_month: "August 2026", source: "synthetic",
  universe: "MACC-extended (synthetic)", product_pillars: PILLARS, service_pillars: SUPER,
  thresholds: { vtt_over: 1.0, high_acr: 100000 }, fabric_forward_placeholder: true,
  totals: { accounts: frontierAccounts.length, over: frontierAccounts.filter(a => a.macc_vtt >= 1).length, no_msx_plan: frontierAccounts.filter(a => a.msx_plan === false).length },
  atu_rollup: UNITS.map(u => ({ atu: u.groups[0], accounts: ri(2, 8), pbo: money(1000000, 8000000) })),
  stu_rollup: UNITS.map(u => ({ stu: u.label, accounts: ri(3, 10), pbo: money(2000000, 12000000) })),
  maccext_summary: { with_ext: ri(10, 20), unified_adopt: ri(4, 12), no_msx_plan: ri(2, 8), with_msx_plan: ri(6, 14) },
  prior_month: { totals: { accounts: frontierAccounts.length - ri(0, 3) } },
  accounts: frontierAccounts, pack_unmatched: [], pack_ambiguous: [], ou_prior: {}, malpen: { industries: [], units: [] },
};

// ---------------------------------------------------------------------------
// 12) summary  (NNRSummary — chunked JSON blob; minimal valid structure)
// ---------------------------------------------------------------------------
const summaryByPeriod = {};
for (const q of QS) {
  summaryByPeriod[QLABEL[q]] = {
    label: "FY27 " + QLABEL[q],
    committed: money(3000000, 12000000), uncommitted: money(1500000, 7000000), blocked: money(0, 900000), target: money(6000000, 18000000),
    topn: milestoneRows.filter(r => r.pk === QLABEL[q]).slice(0, 8).map(r => ({ acct: r.acct, nm: r.acct, lnk: LINK_BASE + "&id=" + r.lnk, amt: r.m_amt, own: r.own, stage: r.stage })),
  };
}
const summary = {
  period_order: ["Q1", "Q2", "Q3", "Q4"], periods_with_data: ["Q1", "Q2"],
  labels: { Q1: "FY27 Q1", Q2: "FY27 Q2", Q3: "FY27 Q3", Q4: "FY27 Q4" },
  topn: summaryByPeriod.Q1.topn, by_period: summaryByPeriod,
};

// ---------------------------------------------------------------------------
// Assemble + write
// ---------------------------------------------------------------------------
const out = {
  meta: {
    source_file: "SYNTHETIC (generated)", source_folder: "n/a", generated_utc: new Date().toISOString(),
    fiscal_quarter: "FY27 Q1", wow_snapshot_label: "vs 7 days ago", dod_date: "2026-08-16", wow_date: "2026-08-10",
    note: "Fully synthetic sample. No real accounts, people, tenants or amounts. See DATA.md.",
  },
  nnr_periods: { "June (FY26 Q4)": {}, July: {}, August: {}, September: {}, Q1: {} },
  nnr_progress, nnr_actuals: { available: false, closed_months: [], unit_actuals: {}, territories: [], as_of: "2026-08-17", source: "synthetic", meta: {} },
  territory_gaps, territory_monthly,
  territory_targets_meta: { source_file: "synthetic", currency: "USD", grain_collapsed: true, units: UNITS.map(u => u.label), territories: territoryList },
  nnr_outlook, accounts, azure_daily, macc: { count: frontierAccounts.length, kpis: {}, tier_counts: {} },
  frontier_macc, benchmarks: { units: [], periods: [], data: {}, benchmarks: [] }, levers: { units: [], periods: [], levers: [], data: {} },
  benchmark_page: { levers: {}, benchmarks: {}, generated_utc: new Date().toISOString() },
  pipeline_hygiene, capacity, pipeline, pillar_facts: { as_of: "2026-08-17", grain: "period", periods: [], count: 0, rows: [] },
  milestone_facts, movements, departures, summary,
};

const outPath = path.join(__dirname, "..", "sample", "sample_dashboard_data.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(`Wrote ${outPath} (${kb} KB)`);
console.log(`  accounts=${accounts.length} milestones=${milestoneRows.length} departures=${departureRows.length} territories=${territoryList.length}`);
console.log(`  capacity=${capacityRows.length} hygiene_cats=${hygCategories.length} frontier_accts=${frontierAccounts.length}`);
