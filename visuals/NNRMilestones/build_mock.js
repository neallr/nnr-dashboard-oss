const fs = require('fs');
const SRC = require('path').join(__dirname,'..','..','sample','sample_dashboard_data.json');
const d = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const mf = d.milestone_facts;
const base = mf.link_base;
// roles must match capabilities.json dataRoles (and reshape() reads by role name)
const ROLES = ["id","due","duemo","pk","nonrec","tpid","acct","terr","atu","su","seg","own","mgr","grp",
  "stage","st","cat","cf","commitment","sp","ssp","nm","wl","link","macc","hc","acr",
  "m_amt","m_cp","m_ucp","m_qp","m_nq","q_amt","q_cp","q_ucp","q_qp","q_nq","m_cp_dod","m_cp_wow","m_ucp_dod","m_ucp_wow","q_cp_dod","q_cp_wow","q_ucp_dod","q_ucp_wow","commitment_prev_dod","st_prev_dod","due_prev_dod",
  "sec","was","reason","last_pipe","pipe_prev","fromp","fromm"];
const map = r => {
  const o = {};
  ROLES.forEach(k => { o[k] = (r[k] === undefined ? null : r[k]); });
  o.commitment = r.cf === 1 ? "Committed" : "Uncommitted";
  o.link = r.lnk ? base + "&id=" + r.lnk : null;
  o.macc = r.macc === true ? "MACC" : (r.macc === false ? "" : r.macc);
  o.hc = r.hc === true ? "HC" : (r.hc === false ? "" : r.hc);
  return o;
};
const rows = (mf.rows || []).map(map);
// Departures (sec="dep") are Table.Combine'd into MilestoneFacts by the model; mirror that here so the
// harness can render the Pipeline Departures panel. Carry the was-pill fields + pipe_prev.
const DEP = d.departures && d.departures.rows ? d.departures.rows : [];
const depRows = DEP.map(r => {
  const o = {};
  ROLES.forEach(k => { o[k] = null; });
  o.id = r.id; o.acct = r.acct; o.tpid = r.tpid; o.nm = r.nm; o.due = r.due; o.duemo = r.duemo; o.pk = r.pk;
  o.terr = r.terr; o.atu = r.atu; o.su = r.su; o.seg = r.seg; o.own = r.own; o.mgr = r.mgr; o.grp = r.grp;
  o.sp = r.sp; o.ssp = r.ssp; o.wl = r.wl; o.st = r.st; o.reason = r.reason; o.was = r.was;
  o.last_pipe = r.last_pipe; o.pipe_prev = r.pipe_prev; o.cf = r.cf;
  o.commitment = r.cf === 1 ? "Committed" : (r.cf === 0 ? "Uncommitted" : "");
  o.commitment_prev_dod = r.commitment_prev_dod; o.st_prev_dod = r.st_prev_dod; o.due_prev_dod = r.due_prev_dod;
  o.fromp = r.fromp; o.fromm = r.fromm;
  o.link = r.lnk ? base + "&id=" + r.lnk : null;
  o.macc = r.macc === true ? "MACC" : ""; o.hc = r.hc === true ? "HC" : "";
  o.sec = "dep";
  return o;
});
const allRows = rows.concat(depRows);
const columns = ROLES.map(r => ({ roles: { [r]: true }, displayName: r }));
const rowArrays = allRows.map(r => ROLES.map(role => r[role] === undefined ? null : r[role]));
fs.mkdirSync(__dirname + "/testbuild", { recursive: true });
fs.writeFileSync(__dirname + "/testbuild/mock.js", "export const MOCK = " + JSON.stringify({ columns, rows: rowArrays }) + ";");
console.log("milestone mock rows:", rows.length, "+ dep:", depRows.length, "cols:", columns.length);


