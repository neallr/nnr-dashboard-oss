// Progress-view CSS (ported from the web app styles.css, vars folded to hex).
export const STYLES = `
*{box-sizing:border-box;}
.nnr-root{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;color:#1a2230;background:#f4f6f9;padding:14px 16px;}
.kpis{display:grid;grid-template-columns:0.92fr 1.22fr 0.72fr 1.22fr 1.22fr;gap:12px;margin-bottom:22px;}
.kpi{background:#fff;border:1px solid #e6e9ee;border-radius:10px;padding:14px 15px;box-shadow:0 1px 8px rgba(15,52,96,.05);}
.kpi .k-label{font-size:12px;color:#6b7686;font-weight:600;text-transform:uppercase;letter-spacing:.3px;}
.kpi .k-value{font-size:26px;font-weight:800;margin-top:6px;color:#0f3460;}
.kpi.attn .k-value{color:#8a5a00;}
.kpi .k-foot{font-size:12px;margin-top:4px;color:#6b7686;}
.kpi .k-uc2c{margin-top:8px;padding-top:7px;border-top:1px dashed #e0e5ec;display:flex;align-items:baseline;justify-content:space-between;gap:8px;}
.kpi .k-uc2c-l{font-size:11px;color:#6b7686;font-weight:600;text-transform:uppercase;letter-spacing:.3px;}
.kpi .k-uc2c-v{font-size:17px;font-weight:800;color:#0f3460;font-variant-numeric:tabular-nums;}
.kpi.has-ph .k-main{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}
.kpi.has-ph .k-side{display:flex;flex-direction:column;gap:1px;align-items:flex-end;text-align:right;margin-top:8px;}
.kpi.has-ph .k-side .ks-row{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;}
.kpi.has-ph .k-side .ks-row.up{color:#7bbf99;}
.kpi.has-ph .k-side .ks-row.dn{color:#d79ea0;}
.kpi.has-ph .k-side .ks-v{color:#9aa4b2;}
.kpi.has-ph .k-split{font-size:11px;color:#9aa4b2;margin-top:4px;display:flex;gap:12px;flex-wrap:wrap;font-variant-numeric:tabular-nums;}
.kpi.has-ph .k-split .up{color:#7bbf99;font-style:normal;}
.kpi.has-ph .k-split .dn{color:#d79ea0;font-style:normal;}
.wow{font-weight:600;}.wow.pos{color:#2e7d32;}.wow.neg{color:#c62828;}.wow.zero{color:#6b7686;}
.seg-tabs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:14px;}.seg-tabs.sub{margin-top:-6px;}.seg-tabs.inline{margin:0;gap:4px;}
.seg-tab{border:1px solid #e6e9ee;background:#fff;color:#0f3460;padding:8px 14px;font-size:13px;font-weight:600;border-radius:20px;cursor:pointer;}
.seg-tabs.sub .seg-tab,.seg-tabs.inline .seg-tab{padding:6px 12px;font-size:12.5px;}
.seg-tab.active{background:#0f3460;color:#fff;border-color:#0f3460;}
.section-h{display:flex;align-items:baseline;justify-content:space-between;margin:4px 0 12px;}
.section-h h2{font-size:16px;margin:0;color:#0f3460;}.section-h .note{font-size:12px;color:#6b7686;}
.su-toggle-row{display:flex;align-items:center;gap:12px;margin:6px 0 12px;flex-wrap:wrap;}
.su-toggle-lbl{font-size:12px;font-weight:700;color:#6b7686;text-transform:uppercase;letter-spacing:.3px;}
.lnk{background:none;border:none;color:#1a6bb5;font-size:12px;cursor:pointer;text-decoration:underline;}
.view-toggles{margin-left:auto;display:inline-flex;gap:4px;}
.view-toggles .vt{font-size:10px;color:#aab2bd;background:transparent;border:1px solid #e2e6ea;border-radius:5px;padding:2px 7px;cursor:pointer;font-weight:600;letter-spacing:.4px;line-height:1.4;}
.view-toggles .vt:hover{color:#5a6472;border-color:#c4ccd4;}
.view-toggles .vt.on{background:#0f3460;color:#fff;border-color:#0f3460;}
.pl-dd{position:relative;display:inline-block;}
.pl-dd-btn{border:1px solid #cdd7e3;border-radius:7px;padding:7px 12px;font-size:12.5px;background:#fff;color:#0f3460;cursor:pointer;font-weight:600;}
.pl-dd-btn.on{background:#0f3460;color:#fff;border-color:#0f3460;}
.pl-dd-panel{position:absolute;top:110%;left:0;z-index:30;background:#fff;border:1px solid #cdd7e3;border-radius:8px;box-shadow:0 4px 16px rgba(15,52,96,.18);padding:6px;max-height:280px;overflow:auto;min-width:230px;}
.pl-dd-panel label{display:flex;align-items:center;gap:7px;padding:4px 8px;font-size:12.5px;color:#1c3a5e;white-space:nowrap;border-radius:5px;cursor:pointer;}
.pl-dd-panel label:hover{background:#f4f8fc;}
.pl-dd-search{display:block;width:100%;border:1px solid #cdd7e3;border-radius:6px;padding:5px 8px;font-size:12px;margin-bottom:5px;outline:none;}
.pl-empty{font-size:11px;color:#9aa4b2;font-style:italic;padding:6px 10px;}
.pl-dd-panel .pl-opt{padding:5px 9px;font-size:12.5px;color:#1c3a5e;white-space:nowrap;border-radius:5px;cursor:pointer;}
.pl-dd-panel .pl-opt:hover{background:#f4f8fc;}
.pl-dd-panel .pl-opt.sel{background:#0f3460;color:#fff;}
.pl-dd-panel .prg-qrow{font-weight:700;color:#0f3460;border-top:1px solid #eef2f6;margin-top:2px;}
.pl-dd-panel .prg-qrow:first-child{border-top:none;margin-top:0;}
.pl-dd-panel .prg-qrow.sel{color:#fff;}
.pl-dd-panel .prg-mrow{padding-left:22px;font-size:12px;}
.due-all{font-weight:500;color:#9aa4b2;font-size:11px;}
.prg-period .pl-dd-btn{font-weight:700;}
.prg-search{border:1px solid #cdd7e3;border-radius:7px;padding:6px 10px;font-size:12.5px;color:#0f3460;min-width:190px;outline:none;}
.prg-search:focus{border-color:#0f3460;}
.ms-tbl{min-width:1040px;}
/* Milestone table: headers left-justified + vertically consistent (override the prog-tbl
   right-align / vertical-align:bottom via higher specificity .prog-tbl.ms-tbl). Account col slim. */
.prog-tbl.ms-tbl thead th{text-align:left;vertical-align:middle;}
.prog-tbl.ms-tbl thead th.amt{text-align:right;}
.ms-tbl td.num{text-align:right;}
.ms-tbl th.acct,.ms-tbl td.acct{max-width:150px;width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ms-tbl td.lft,.ms-tbl th.nm,.ms-tbl th:first-child{text-align:left;}
.ms-tbl td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:600;}
.ms-tbl td.num .ms-amt-v{display:block;}
.ms-tbl td.num .ms-amt-sub{display:block;font-size:9.5px;font-weight:500;opacity:.85;white-space:nowrap;margin-top:1px;}
.ms-tbl td.small{font-size:11.5px;color:#3a4a5e;}
.ms-tbl td.tpid{color:#6b7686;font-variant-numeric:tabular-nums;}
.ms-tbl td.nm{max-width:300px;overflow:hidden;text-overflow:ellipsis;}
.ms-tbl td.muted{color:#9aa4b2;}
.ms-tbl .pill{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700;}
.ms-tbl .pill.good{background:#e3f4ea;color:#1d7a46;}
.ms-tbl .pill.warn{background:#fdf1dd;color:#8a5a00;}
.ms-tbl .pill.nq{background:#eef0f3;color:#6b7686;}
.ms-tbl .msx-lnk{color:#1a6bb5;cursor:pointer;text-decoration:none;}
.ms-tbl .msx-lnk:hover{text-decoration:underline;}
.ms-tbl .cellstack{display:inline-flex;flex-direction:column;align-items:flex-start;gap:0;}
.ms-tbl .was-chip{display:inline-block;margin-top:2px;padding:0 5px;border-radius:6px;font-size:8.5px;font-weight:600;line-height:1.45;background:#fbeee0;color:#9a5212;border:1px solid #f0d6b8;white-space:nowrap;letter-spacing:.1px;}
.tablewrap{background:#fff;border:1px solid #e6e9ee;border-radius:10px;overflow:hidden;box-shadow:0 1px 8px rgba(15,52,96,.05);}
.tablewrap.scrollx{overflow-x:auto;}
.tablewrap.frz{overflow:auto;max-height:560px;}
.prog-tbl{width:100%;border-collapse:collapse;font-size:12px;min-width:1180px;}
/* Deck views show few columns — size the table to content so the Period column doesn't absorb the
   1180px slack (which produced a huge empty first column). nm gets a sensible fixed width. */
.prog-tbl.vmode{width:auto;min-width:0;}
.prog-tbl.vmode td.nm,.prog-tbl.vmode th.nm{width:280px;max-width:280px;}
.prog-tbl thead th{position:sticky;top:0;z-index:3;background:#0f3460;color:#fff;padding:6px 7px;text-align:right;font-weight:700;font-size:11px;white-space:nowrap;vertical-align:bottom;border-bottom:2px solid #0b2747;}
.prog-tbl thead th.grp-h{text-align:center;border-left:1px solid #2a4a6e;vertical-align:bottom;padding:7px 0 5px;}
.prog-tbl thead th.grp-h .grp-top{display:block;text-align:center;margin-bottom:3px;}
.prog-tbl thead th.grp-h .grp-sub{display:flex;}
.prog-tbl thead th.grp-h .grp-sub > span{flex:1;text-align:center;font-weight:600;font-size:10px;opacity:.85;}
.prog-tbl thead th.nm{text-align:left;left:0;z-index:4;}.prog-tbl thead th.nq{color:#ffe9b8;}
.prog-tbl thead th .th-sub{font-weight:500;opacity:.8;font-size:10px;}
.prog-tbl tbody td{padding:5px 7px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;border-bottom:1px solid #eef2f6;}
.prog-tbl td.nm{text-align:left;position:sticky;left:0;z-index:2;background:#fff;max-width:320px;overflow:hidden;text-overflow:ellipsis;}
.prog-tbl td.nq{color:#7a6a3a;}
.prog-tbl tr.xp{cursor:pointer;}
.prog-tbl tr.xp:hover td{filter:brightness(.985);}
.prog-tbl .caret{display:inline-block;color:#1a4a7a;transition:transform .12s;font-size:10px;}
.prog-tbl .caret.open{transform:rotate(90deg);}
.prog-tbl tr.period td{font-weight:700;background:#eef3f9;border-bottom:1px solid #d7e2ee;}
.prog-tbl tr.period td.nm{background:#eef3f9;color:#0f3460;}
.prog-tbl tr.period.total td{background:#e3edf7;}
.prog-tbl tr.period.total td.nm{background:#e3edf7;}
.prog-tbl tr.lv-su td{background:#f4f8fc;font-weight:700;color:#1c3a5e;}
.prog-tbl tr.lv-su td.nm{background:#f4f8fc;}
.prog-tbl tr.lv-grp td{background:#f9fbfd;font-weight:600;color:#1c3a5e;}
.prog-tbl tr.lv-grp td.nm{background:#f9fbfd;}
.prog-tbl tr.lv-terr td{background:#fff;color:#243b53;font-weight:400;}
.prog-tbl tr.lv-terr td.nm{color:#486581;}
.prog-tbl tr.lv-terr:hover td{background:#f6faff;}
.prog-tbl tr.lv-terr:hover td.nm{background:#f6faff;}
.cov-pill{display:inline-block;min-width:54px;padding:2px 8px;border-radius:20px;font-weight:700;font-size:12.5px;}
.cov-good{background:#e7f4e8;color:#2e7d32;}.cov-warn{background:#fff4e5;color:#8a5a00;}.cov-bad{background:#fdeaea;color:#c62828;}
.kpi .k-value.cov-val{color:#0f3460;}.kpi .k-value.cov-val .cov-pill{font-size:26px;min-width:0;padding:3px 14px;line-height:1.12;font-weight:800;}
`;
