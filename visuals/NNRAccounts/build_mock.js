const fs = require('fs');
const d = require("../../sample/sample_dashboard_data.json");
const months=["jul","aug","sep","oct","nov","dec","jan","feb","mar","apr","may","jun"];
const qs=["q1","q2","q3","q4"];
const ROLES=["name","tpid","unit","territory","atu","macc","high","acr","maccCurated"]
  .concat(months.map(m=>m+"cp")).concat(months.map(m=>m+"ucp"))
  .concat([].concat(...qs.map(q=>[q+"cp",q+"ucp",q+"total"])))
  .concat(months.map(m=>m+"cpdod"))
  .concat([].concat(...qs.map(q=>[q+"cpdod",q+"ucpdod",q+"totaldod"])))
  .concat(months.map(m=>m+"cpwow"))
  .concat([].concat(...qs.map(q=>[q+"cpwow",q+"ucpwow",q+"totalwow"])))
  .concat(["pillars"]);
const map = a => {
  const o={name:a.name,tpid:a.tpid,unit:a.unit,territory:a.territory,atu:a.atu,macc:!!a.macc,high:!!a.high_consuming,acr:a.acr_tier,maccCurated:!!a.macc_curated,pillars:a.pillars||""};
  months.forEach(m=>{o[m+"cp"]=a[m+"_cp"]??null;o[m+"ucp"]=a[m+"_ucp"]??null;o[m+"cpdod"]=a[m+"_cp_dod"]??null;o[m+"cpwow"]=a[m+"_cp_wow"]??null;});
  qs.forEach(q=>{o[q+"cp"]=a[q+"_cp"]??null;o[q+"ucp"]=a[q+"_ucp"]??null;o[q+"total"]=a[q+"_total"]??null;o[q+"cpdod"]=a[q+"_cp_dod"]??null;o[q+"ucpdod"]=a[q+"_ucp_dod"]??null;o[q+"totaldod"]=a[q+"_total_dod"]??null;o[q+"cpwow"]=a[q+"_cp_wow"]??null;o[q+"ucpwow"]=a[q+"_ucp_wow"]??null;o[q+"totalwow"]=a[q+"_total_wow"]??null;});
  return o;
};
const rows=(d.accounts||[]).map(map);
const columns=ROLES.map(r=>({roles:{[r]:true},displayName:r}));
const rowArrays=rows.map(r=>ROLES.map(role=>r[role]===undefined?null:r[role]));
fs.mkdirSync(__dirname+"/testbuild",{recursive:true});
fs.writeFileSync(__dirname+"/testbuild/mock.js","export const MOCK = "+JSON.stringify({columns,rows:rowArrays})+";");
console.log("accounts mock rows:",rows.length,"cols:",columns.length);
