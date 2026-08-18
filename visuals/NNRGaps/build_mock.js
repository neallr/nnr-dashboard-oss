const fs = require('fs');
const d = require("../../sample/sample_dashboard_data.json");
const ROLES = ["segment", "subsegment", "territory", "julk", "augk", "sepk", "octk", "novk", "deck", "jank", "febk", "mark", "aprk", "mayk", "junk", "q1k", "q2k", "q3k", "q4k", "julwow", "augwow", "sepwow", "octwow", "novwow", "decwow", "janwow", "febwow", "marwow", "aprwow", "maywow", "junwow", "q1wow", "q2wow", "q3wow", "q4wow", "jult", "augt", "sept", "octt", "novt", "dect", "jant", "febt", "mart", "aprt", "mayt", "junt", "q1t", "q2t", "q3t", "q4t", "julflag", "q1flag"];
const units = d.territory_monthly.units, gapsegs = d.territory_gaps.segments;
const flagRec = {};
gapsegs.forEach(sg => sg.subsegments.forEach(ss => (ss.territories || []).forEach(tr => {
  flagRec[tr.name] = { jul_flag: tr.jul_flag, q1_flag: tr.q1_flag };
})));
const rows = [];
units.forEach(u => u.groups.forEach(g => g.territories.forEach(t => {
  const fr = flagRec[t.name], inGap = !!fr;
  if (!inGap) return;
  const M = (k) => (t[k] == null ? null : t[k]);
  rows.push({
    segment: u.label, subsegment: g.name, territory: t.name,
    julk: M("jul_cp"), augk: M("aug_cp"), sepk: M("sep_cp"), octk: M("oct_cp"), novk: M("nov_cp"), deck: M("dec_cp"),
    jank: M("jan_cp"), febk: M("feb_cp"), mark: M("mar_cp"), aprk: M("apr_cp"), mayk: M("may_cp"), junk: M("jun_cp"),
    q1k: M("q1_cp"), q2k: M("q2_cp"), q3k: M("q3_cp"), q4k: M("q4_cp"),
    julwow: M("jul_wow"), augwow: null, sepwow: null, octwow: null, novwow: null, decwow: null,
    janwow: null, febwow: null, marwow: null, aprwow: null, maywow: null, junwow: null,
    q1wow: M("q1_wow"), q2wow: null, q3wow: null, q4wow: null,
    jult: M("jul_tgt"), augt: M("aug_tgt"), sept: M("sep_tgt"), octt: M("oct_tgt"), novt: M("nov_tgt"), dect: M("dec_tgt"),
    jant: M("jan_tgt"), febt: M("feb_tgt"), mart: M("mar_tgt"), aprt: M("apr_tgt"), mayt: M("may_tgt"), junt: M("jun_tgt"),
    q1t: M("q1_tgt"), q2t: M("q2_tgt"), q3t: M("q3_tgt"), q4t: M("q4_tgt"),
    julflag: inGap ? !!fr.jul_flag : false, q1flag: inGap ? !!fr.q1_flag : false
  });
})));
const columns = ROLES.map(r => ({ roles: { [r]: true }, displayName: r }));
const rowArrays = rows.map(r => ROLES.map(role => r[role] === undefined ? null : r[role]));
fs.mkdirSync(__dirname + "/testbuild", { recursive: true });
fs.writeFileSync(__dirname + "/testbuild/mock.js", "export const MOCK = " + JSON.stringify({ columns, rows: rowArrays }) + ";");
console.log("gaps grain mock rows:", rows.length, "cols:", columns.length);
