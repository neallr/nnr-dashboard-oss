// Build a mock Power BI table dataView for the Outlook visual from real dashboard_data.json.
const fs = require('fs');
const d = require("../../sample/sample_dashboard_data.json");

const ROLES = ["quarter","monthIndex","monthLabel","segment",
  "budget","committed","uncommitted","blocked",
  "offTarget","offCommitted","offBlocked","offUncommitted"];

const ol = d.nnr_outlook;
const rows = [];
for (const q of Object.keys(ol.quarters)) {
  const secs = ol.quarters[q].sections || [];
  secs.forEach((sec, i) => {
    (sec.rows || []).forEach(r => {
      rows.push({
        quarter:q, monthIndex:i, monthLabel:sec.label, segment:r.segment,
        budget:r.budget||0, committed:r.committed||0, uncommitted:r.uncommitted||0, blocked:r.blocked||0,
        offTarget: (sec.official_target==null?null:sec.official_target), offCommitted: (sec.official_committed==null?null:sec.official_committed),
        offBlocked: (sec.official_blocked==null?null:sec.official_blocked), offUncommitted: (sec.official_uncommitted==null?null:sec.official_uncommitted)
      });
    });
  });
}
const columns = ROLES.map(r => ({ roles: { [r]: true }, displayName: r }));
const rowArrays = rows.map(r => ROLES.map(role => r[role] === undefined ? null : r[role]));
const table = { columns, rows: rowArrays };
fs.mkdirSync(__dirname + "/testbuild", { recursive: true });
fs.writeFileSync(__dirname + "/testbuild/mock.js", "export const MOCK = " + JSON.stringify(table) + ";");
console.log("outlook mock rows:", rows.length, "cols:", columns.length);
