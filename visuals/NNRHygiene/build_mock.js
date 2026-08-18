const fs = require('fs');
const d = require("../../sample/sample_dashboard_data.json");
const ROLES = ["category", "categoryKey", "categoryOrder", "id", "account", "due", "dueRaw", "status", "owner", "ownerName", "ownerFirst", "ownerUpn", "msx", "usage"];
const h = d.pipeline_hygiene || {};
const odRaw = h.owner_directory || {};
const ownerDir = {};
Object.keys(odRaw).forEach(k => { ownerDir[k.toLowerCase()] = odRaw[k]; });
const cats = h.categories || [];
const rows = [];
cats.forEach((c, order) => {
  (c.rows || []).forEach(r => {
    const a = (r.owner || "").trim();
    const up = a ? a.toLowerCase() : "";
    const rec = (up && ownerDir[up]) ? ownerDir[up] : null;
    const ownerName = rec && rec.name ? rec.name : a;
    const ownerFirst = rec && rec.first ? rec.first : a;
    const ownerUpn = rec && rec.upn ? rec.upn : (a ? a.toLowerCase().replace(/\s+/g, ".") + "@example.com" : "");
    rows.push({
      category: c.label, categoryKey: c.key, categoryOrder: order,
      id: r.id, account: r.account, due: r.due, dueRaw: r.due_raw, status: r.status,
      owner: a, ownerName, ownerFirst, ownerUpn, msx: r.msx, usage: r.usage
    });
  });
});
const columns = ROLES.map(r => ({ roles: { [r]: true }, displayName: r }));
const rowArrays = rows.map(r => ROLES.map(role => r[role] === undefined ? null : r[role]));
fs.mkdirSync(__dirname + "/testbuild", { recursive: true });
fs.writeFileSync(__dirname + "/testbuild/mock.js", "export const MOCK = " + JSON.stringify({ columns, rows: rowArrays }) + ";");
console.log("hygiene mock rows:", rows.length, "cols:", columns.length, "cats:", cats.length);
