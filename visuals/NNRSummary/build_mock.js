// Build a CHUNKED mock dataView for NNRSummary: the `summary` blob split into <32K chunks across
// rows (idx, chunk), exactly like the chunked SummaryJson model table feeds it.
const fs = require('fs');
const d = require("../../sample/sample_dashboard_data.json");
const blob = JSON.stringify(d.summary || {});
const SIZE = 30000;
const rows = [];
for (let i = 0, k = 0; i < blob.length || k === 0; i += SIZE, k++) rows.push([k, blob.substr(i, SIZE)]);
const table = { columns: [{ roles: { idx: true }, displayName: "idx" }, { roles: { chunk: true }, displayName: "chunk" }], rows };
fs.mkdirSync(__dirname + "/testbuild", { recursive: true });
fs.writeFileSync(__dirname + "/testbuild/mock.js", "export const MOCK = " + JSON.stringify(table) + ";");
console.log("chunked mock: blob=" + blob.length + " chunks=" + rows.length);
