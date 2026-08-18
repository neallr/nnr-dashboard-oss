// Build a mock Power BI table dataView from the real dashboard_data.json, exactly as the
// model would feed the visual (territory grain + official-by-period columns), write to mock.js.
const fs = require('fs');
const d = require("../../sample/sample_dashboard_data.json");

const ROLES = ["period","periodOrder","quarter","su","grp","territory",
  "tCommitted","tBlocked","tUncommitted","tNonqual","tTarget","tSuTarget","tWow",
  "tSuDodC","tSuWowC","tSuDodU","tSuWowU","tSuWowB",
  "offTarget","offCommitted","offBlocked","offUncommitted","offDodC","offWowC","offDodU","offWowU","offDodN","offWowN","offWowB"];

const months = [
  {p:"July",o:1,q:"Q1",k:"jul"},{p:"August",o:2,q:"Q1",k:"aug"},{p:"September",o:3,q:"Q1",k:"sep"},
  {p:"October",o:4,q:"Q2",k:"oct"},{p:"November",o:5,q:"Q2",k:"nov"},{p:"December",o:6,q:"Q2",k:"dec"},
  {p:"January",o:7,q:"Q3",k:"jan"},{p:"February",o:8,q:"Q3",k:"feb"},{p:"March",o:9,q:"Q3",k:"mar"},
  {p:"April",o:10,q:"Q4",k:"apr"},{p:"May",o:11,q:"Q4",k:"may"},{p:"June",o:12,q:"Q4",k:"jun"},
  {p:"Q1",o:99,q:"Q1",k:"q1"},{p:"Q2",o:99,q:"Q2",k:"q2"},{p:"Q3",o:99,q:"Q3",k:"q3"},{p:"Q4",o:99,q:"Q4",k:"q4"}
];
const mul = (x) => x == null ? null : x * 1000;

// official by period label (from nnr_progress). Also add quarter roll-up periods (label == Q).
const off = {}; // label -> {target,committed,blocked,uncommitted,dodC,wowC,dodU,wowU,quarter,order}
const qrec = d.nnr_progress.quarters;
for (const qn of Object.keys(qrec)) {
  for (const p of qrec[qn].periods) {
    const isRoll = p.label === qn;
    off[p.label] = { quarter: qn, target:p.target, committed:p.committed, blocked:p.blocked, uncommitted:p.uncommitted,
      dodC:p.dod_committed, wowC:p.wow_committed, dodU:p.dod_uncommitted, wowU:p.wow_uncommitted, dodN:p.dod_nonqual, wowN:p.wow_nonqual, wowB:p.wow_blocked, isRoll };
  }
}

const rows = [];
// territory-grain rows (per unit/group/territory/month)
for (const u of d.territory_monthly.units) {
  const utgt = u.tgt || {};
  for (const g of (u.groups||[])) {
    for (const t of (g.territories||[])) {
      for (const m of months) {
        const o = off[m.p] || {};
        const umvU = ((d.territory_monthly.unit_movement||{})[m.p]||{})[u.label]||{};
        rows.push({
          period:m.p, periodOrder:m.o, quarter:m.q, su:u.label, grp:g.name, territory:t.name,
          tCommitted:mul(t[m.k+"_cp"]), tBlocked:mul(t[m.k+"_bl"]), tUncommitted:mul(t[m.k+"_ucp"]),
          tNonqual:mul(t[m.k+"_nq"]), tTarget:(t[m.k+"_tgt"]==null?null:t[m.k+"_tgt"]),
          tSuTarget:(utgt[m.k]==null?null:utgt[m.k]), tWow:mul(t[m.k+"_wow"]),
          tSuDodC:(umvU.dod==null?null:umvU.dod), tSuWowC:(umvU.wow==null?null:umvU.wow),
          tSuDodU:(umvU.dod_ucp==null?null:umvU.dod_ucp), tSuWowU:(umvU.wow_ucp==null?null:umvU.wow_ucp),
          tSuWowB:(t[m.k+"_wow_bl"]==null?null:t[m.k+"_wow_bl"]),
          offTarget:o.target, offCommitted:o.committed, offBlocked:o.blocked, offUncommitted:o.uncommitted,
          offDodC:o.dodC, offWowC:o.wowC, offDodU:o.dodU, offWowU:o.wowU, offDodN:o.dodN, offWowN:o.wowN, offWowB:o.wowB
        });
      }
    }
  }
}
// roll-up period rows (label == quarter) — quarter labels now come from territory rows, so skip them here
for (const lbl of Object.keys(off)) {
  const o = off[lbl];
  if (!o.isRoll) continue;
  if (["Q1","Q2","Q3","Q4"].includes(lbl)) continue;
  rows.push({
    period:lbl, periodOrder:99, quarter:o.quarter, su:null, grp:null, territory:null,
    tCommitted:null,tBlocked:null,tUncommitted:null,tNonqual:null,tTarget:null,tSuTarget:null,tWow:null,
    tSuDodC:null,tSuWowC:null,tSuDodU:null,tSuWowU:null,tSuWowB:null,
    offTarget:o.target, offCommitted:o.committed, offBlocked:o.blocked, offUncommitted:o.uncommitted,
    offDodC:o.dodC, offWowC:o.wowC, offDodU:o.dodU, offWowU:o.wowU, offDodN:o.dodN, offWowN:o.wowN, offWowB:o.wowB
  });
}

const columns = ROLES.map(r => ({ roles: { [r]: true }, displayName: r }));
const rowArrays = rows.map(r => ROLES.map(role => r[role] === undefined ? null : r[role]));
const table = { columns, rows: rowArrays };

fs.mkdirSync(__dirname + "/testbuild", { recursive: true });
fs.writeFileSync(__dirname + "/testbuild/mock.js",
  "export const MOCK = " + JSON.stringify(table) + ";");
console.log("mock rows:", rows.length, "cols:", columns.length);
