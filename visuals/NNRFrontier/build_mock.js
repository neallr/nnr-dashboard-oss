// Build a CHUNKED mock dataView for NNRFrontier: the `frontier_macc` blob split into <32K
// chunks across rows (idx, chunk), exactly like the chunked FrontierJson model table feeds it.
const fs = require('fs');
const d = require("../../sample/sample_dashboard_data.json");
const blob = JSON.stringify(d.frontier_macc || {});
const SIZE = 30000;
const rows = [];
for (let i = 0, k = 0; i < blob.length || k === 0; i += SIZE, k++) rows.push([k, blob.substr(i, SIZE)]);
const table = { columns: [{ roles: { idx: true }, displayName: "idx" }, { roles: { chunk: true }, displayName: "chunk" }], rows };
if (!fs.existsSync(__dirname + "/testbuild")) fs.mkdirSync(__dirname + "/testbuild", { recursive: true });
fs.writeFileSync(__dirname + "/testbuild/mock.js", "module.exports.MOCK = " + JSON.stringify(table) + ";");
console.log("chunked mock: blob=" + blob.length + " chunks=" + rows.length);
