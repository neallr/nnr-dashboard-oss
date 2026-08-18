const fs = require('fs');
const d = require("../../sample/sample_dashboard_data.json");
const ROLES = ["section","label","stage","runLabel","snapLabel","dodDate","wowDate","measured","target","cp","bl","ucp","qp","dod","wow"];
const a = d.azure_daily || {};
const periods = a.periods || {}, targets = a.targets || {}, mv = a.movement || {}, stages = a.stages || {};
const meta = { runLabel: a.run_date_label, snapLabel: a.snap_date_label, dodDate: a.dod_date, wowDate: a.wow_date, measured: !!a.stages_measured };
const rows = [];

// Period section — full year from nnr_progress.quarters (azure_daily.periods only has Q1).
// Keep the special "June (FY26 Q4)" row from azure_daily, and prefer azure qp/movement.
const prog = (d.nnr_progress || {}).quarters || {};
const juneLbl = "June (FY26 Q4)";
const jS = periods[juneLbl] || {}, jM = mv[juneLbl] || {};
rows.push(Object.assign({
  section: "period", label: juneLbl, stage: null,
  target: targets[juneLbl] == null ? null : targets[juneLbl],
  cp: jS.cp == null ? null : jS.cp, bl: jS.bl == null ? null : jS.bl,
  ucp: jS.ucp == null ? null : jS.ucp, qp: jS.qp == null ? null : jS.qp,
  dod: jM.dod == null ? null : jM.dod, wow: jM.wow == null ? null : jM.wow
}, meta));
Object.keys(prog).forEach(qk => {
  (prog[qk].periods || []).forEach(r => {
    const lbl = r.label;
    const azp = periods[lbl] || {}, azm = mv[lbl] || {};
    const cpv = r.committed == null ? null : r.committed;
    const blv = r.blocked == null ? null : r.blocked;
    const ucpv = r.uncommitted == null ? null : r.uncommitted;
    const qpAz = azp.qp == null ? null : azp.qp;
    const sumv = (cpv || 0) + (blv || 0) + (ucpv || 0);
    const qpv = qpAz != null ? qpAz : (cpv == null && blv == null && ucpv == null ? null : sumv);
    rows.push(Object.assign({
      section: "period", label: lbl, stage: null,
      target: r.target == null ? null : r.target,
      cp: cpv, bl: blv, ucp: ucpv, qp: qpv,
      dod: azm.dod == null ? null : azm.dod, wow: azm.wow == null ? null : azm.wow
    }, meta));
  });
});

// Stage section — one row per (period_key, stage).
Object.keys(stages).forEach(pk => {
  (stages[pk] || []).forEach(r => {
    rows.push(Object.assign({
      section: "stage", label: pk, stage: r.stage,
      target: null, cp: r.cp == null ? null : r.cp, bl: null,
      ucp: r.ucp == null ? null : r.ucp, qp: r.qp == null ? null : r.qp,
      dod: null, wow: null
    }, meta));
  });
});

// Owner-group section — section="owner", label=period, stage=group, cp=committed.
const og = (d.pipeline || {}).owner_group || {};
Object.keys(og).forEach(pk => {
  (og[pk] || []).forEach(r => {
    rows.push(Object.assign({
      section: "owner", label: pk, stage: r.group,
      target: null, cp: r.cp == null ? null : r.cp, bl: null, ucp: null, qp: null, dod: null, wow: null
    }, meta));
  });
});

// Created-by section — section="created", label=period, stage=group, cp/ucp/bl(=bp)/qp.
const cb = (d.pipeline || {}).created_by || {};
Object.keys(cb).forEach(pk => {
  (cb[pk] || []).forEach(r => {
    rows.push(Object.assign({
      section: "created", label: pk, stage: r.group,
      target: null, cp: r.cp == null ? null : r.cp, bl: r.bp == null ? null : r.bp,
      ucp: r.ucp == null ? null : r.ucp, qp: r.qp == null ? null : r.qp, dod: null, wow: null
    }, meta));
  });
});

// Created-by creation section — section="created_cre", stage="group::crq::crm".
const cbc = (d.pipeline || {}).created_by_creation || {};
Object.keys(cbc).forEach(pk => {
  (cbc[pk] || []).forEach(r => {
    rows.push(Object.assign({
      section: "created_cre", label: pk,
      stage: (r.group || "") + "::" + (r.crq || "Older") + "::" + (r.crm || "Older"),
      target: null, cp: r.cp == null ? null : r.cp, bl: r.bp == null ? null : r.bp,
      ucp: r.ucp == null ? null : r.ucp, qp: r.qp == null ? null : r.qp, dod: null, wow: null
    }, meta));
  });
});

const columns = ROLES.map(r => ({ roles: { [r]: true }, displayName: r }));
const rowArrays = rows.map(r => ROLES.map(role => r[role] === undefined ? null : r[role]));
fs.mkdirSync(__dirname + "/testbuild", { recursive: true });
fs.writeFileSync(__dirname + "/testbuild/mock.js", "export const MOCK = " + JSON.stringify({ columns, rows: rowArrays }) + ";");
console.log("azure mock rows:", rows.length, "periods:", Object.keys(targets).length, "stage rows:", rows.length - Object.keys(targets).length, "cols:", columns.length);
