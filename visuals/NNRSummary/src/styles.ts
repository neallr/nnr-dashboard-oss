// NNRSummary — Executive Summary styles (ported from the approved mock nnr_summary_mock.html).
export const STYLES = `
*{box-sizing:border-box;margin:0;padding:0;}
.nnr-root{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;color:#1a2230;background:#fff;padding:0 4px 8px;}
.hd{display:flex;align-items:flex-end;justify-content:space-between;padding:14px 22px 12px;background:linear-gradient(180deg,#f7fafd,#fff);border-bottom:1px solid #e6ecf3;}
.hd h1{font-size:22px;color:#0b2e52;font-weight:800;letter-spacing:-.3px;}
.hd .sub{font-size:12.5px;color:#5f7690;margin-top:3px;font-weight:500;}
.hd .actions{display:flex;gap:8px;align-items:center;}
.toggle{display:flex;background:#eaf0f6;border-radius:8px;padding:3px;font-size:11.5px;font-weight:700;}
.toggle span{padding:5px 12px;border-radius:6px;color:#5f7690;cursor:pointer;user-select:none;}
.toggle span.on{background:#0b6ad4;color:#fff;box-shadow:0 1px 4px rgba(11,106,212,.4);}
.pd-row{display:flex;align-items:center;flex-wrap:wrap;gap:5px;padding:11px 22px 3px;}
.pd-grp{font-size:10.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;margin-right:4px;color:#8a9bb0;}
.pd-sep{width:1px;height:18px;background:#e0e7ef;margin:0 8px;}
.pd-pill{font-size:12px;font-weight:700;color:#4a5b73;background:#eef2f7;border-radius:16px;padding:5px 12px;cursor:pointer;user-select:none;transition:.12s;}
.pd-pill:hover{background:#e0e9f3;}
.pd-pill.on{background:#0b2e52;color:#fff;box-shadow:0 1px 4px rgba(11,46,82,.35);}
.narr{margin:12px 22px 4px;padding:14px 18px;background:linear-gradient(120deg,#0b2e52,#134a82);border-radius:11px;color:#eaf3ff;position:relative;overflow:hidden;}
.narr::before{content:"AI SUMMARY";position:absolute;top:10px;right:15px;font-size:9.5px;font-weight:800;letter-spacing:1.4px;color:#7fc4ff;opacity:.9;}
.narr p{font-size:14px;line-height:1.6;font-weight:500;max-width:1050px;}
.narr.narr-empty{background:#eef2f7;color:#7a8ba3;}
.narr.narr-empty::before{color:#9fb2c8;}
.narr.narr-empty p{font-size:12.5px;font-style:italic;}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:14px 22px 4px;}
.kpi{background:#fff;border:1px solid #e6ecf3;border-radius:11px;padding:12px 15px;}
.kpi .k{font-size:11px;color:#7a8ba3;font-weight:700;text-transform:uppercase;letter-spacing:.4px;}
.kpi .v{font-size:25px;color:#0b2e52;font-weight:800;margin-top:3px;letter-spacing:-.5px;}
.kpi .d{font-size:12px;font-weight:700;margin-top:4px;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;}
.kpi .mv.up{color:#0f9d58;}.kpi .mv.dn{color:#d64541;}
.kpi .mv-o{color:#8a9bb0;font-weight:600;font-size:11px;}
.kpi .bar{height:5px;border-radius:3px;background:#eef2f7;margin-top:9px;overflow:hidden;}
.kpi .bar i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#0b6ad4,#38b6ff);}
.kpi .bar i.amber{background:linear-gradient(90deg,#e08a2b,#f2b45a);}
.kpi .bar i.red{background:linear-gradient(90deg,#d64541,#f08a86);}
.kpi .bar i.grey{background:linear-gradient(90deg,#8a94a6,#b8c1d0);}
.kpi .cov{font-size:10.5px;color:#7a8ba3;margin-top:5px;font-weight:600;}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:13px;padding:13px 22px 6px;}
.panel{border:1px solid #e6ecf3;border-radius:11px;overflow:hidden;}
.panel h3{font-size:12.5px;font-weight:800;color:#0b2e52;padding:10px 15px;background:#f4f8fc;border-bottom:1px solid #e6ecf3;display:flex;align-items:center;gap:8px;}
.panel h3 .pill{font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;margin-left:auto;}
.pill.g{background:#e3f6ec;color:#0f9d58;}.pill.r{background:#fdeaea;color:#d64541;}.pill.b{background:#e7f0fb;color:#0b6ad4;}
.row{display:flex;align-items:center;padding:8px 15px;border-bottom:1px solid #f0f4f8;font-size:12.5px;}
.row:last-of-type{border-bottom:none;}
.row.empty{color:#9aa8ba;font-style:italic;justify-content:center;padding:14px;}
.row .rk{width:20px;color:#adb9c8;font-weight:800;font-size:11px;}
.row .nm{flex:1;min-width:0;}
.row .nm b{color:#12325a;font-weight:700;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.row .nm span{color:#8092a8;font-size:11px;font-weight:500;}
.row .val{font-weight:800;font-size:13px;margin-left:10px;white-space:nowrap;}
.val.up{color:#0f9d58;}.val.dn{color:#d64541;}.val.b{color:#0b6ad4;}
.foot{font-size:10.5px;color:#93a2b6;padding:8px 15px;background:#fafcfe;font-weight:600;}
.legend{font-size:11px;color:#7a8ba3;padding:6px 22px 12px;font-weight:600;}
.msx-lnk{color:#1a6bb5;text-decoration:none;font-weight:700;cursor:pointer;border-radius:4px;padding:0 2px;transition:background .12s,color .12s;}
.msx-lnk:hover{text-decoration:underline;}
.msx-lnk.msx-opening{background:#1a6bb5;color:#fff;text-decoration:none;}
`;

