const fs = require('fs');
const d = require("../../sample/sample_dashboard_data.json");
const ROLES = ["id","account","usage","due","due_raw","owner","status","committed","msx","created_raw","region"];
const cap = d.capacity || {};
const rows = (cap.rows || []).map(r => ({
  id: r.id, account: r.account, usage: r.usage, due: r.due, due_raw: r.due_raw,
  owner: r.owner, status: r.status, committed: !!r.committed, msx: r.msx, created_raw: r.created_raw, region: r.region
}));
const columns = ROLES.map(r => ({ roles: { [r]: true }, displayName: r }));
const rowArrays = rows.map(r => ROLES.map(role => r[role] === undefined ? null : r[role]));
fs.mkdirSync(__dirname + "/testbuild", { recursive: true });
fs.writeFileSync(__dirname + "/testbuild/mock.js", "export const MOCK = " + JSON.stringify({columns, rows: rowArrays}) + ";");
console.log("capacity mock rows:", rows.length, "cols:", columns.length);
