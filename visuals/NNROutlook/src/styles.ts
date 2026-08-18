// Progress-view CSS (ported from the web app styles.css, vars folded to hex).
export const STYLES = `
*{box-sizing:border-box;}
.nnr-root{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;color:#1a2230;background:#f4f6f9;padding:14px 16px;}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px;}
.kpi{background:#fff;border:1px solid #e6e9ee;border-radius:10px;padding:16px 18px;box-shadow:0 1px 8px rgba(15,52,96,.05);}
.kpi .k-label{font-size:12px;color:#6b7686;font-weight:600;text-transform:uppercase;letter-spacing:.3px;}
.kpi .k-value{font-size:26px;font-weight:800;margin-top:6px;color:#0f3460;}
.kpi.attn .k-value{color:#8a5a00;}
.kpi .k-foot{font-size:12px;margin-top:4px;color:#6b7686;}
.wow{font-weight:600;}.wow.pos{color:#2e7d32;}.wow.neg{color:#c62828;}.wow.zero{color:#6b7686;}
.seg-tabs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:14px;}.seg-tabs.sub{margin-top:-6px;}.seg-tabs.inline{margin:0;gap:4px;}
.seg-tab{border:1px solid #e6e9ee;background:#fff;color:#0f3460;padding:8px 14px;font-size:13px;font-weight:600;border-radius:20px;cursor:pointer;}
.seg-tabs.sub .seg-tab,.seg-tabs.inline .seg-tab{padding:6px 12px;font-size:12.5px;}
.seg-tab.active{background:#0f3460;color:#fff;border-color:#0f3460;}
.section-h{display:flex;align-items:baseline;justify-content:space-between;margin:4px 0 12px;}
.section-h h2{font-size:16px;margin:0;color:#0f3460;}.section-h .note{font-size:12px;color:#6b7686;}
.su-toggle-row{display:flex;align-items:center;gap:12px;margin:6px 0 12px;flex-wrap:wrap;}
.su-toggle-lbl{font-size:12px;font-weight:700;color:#6b7686;text-transform:uppercase;letter-spacing:.3px;}
.tablewrap{background:#fff;border:1px solid #e6e9ee;border-radius:10px;overflow:hidden;box-shadow:0 1px 8px rgba(15,52,96,.05);}
.tablewrap.scrollx{overflow-x:auto;}
.prog-tbl{width:100%;border-collapse:collapse;font-size:12.5px;min-width:1180px;}
.prog-tbl thead th{position:sticky;top:0;z-index:3;background:#0f3460;color:#fff;padding:7px 10px;text-align:right;font-weight:700;font-size:11.5px;white-space:nowrap;vertical-align:bottom;border-bottom:2px solid #0b2747;}
.prog-tbl thead th.nm{text-align:left;left:0;z-index:4;}.prog-tbl thead th.nq{color:#ffe9b8;}
.prog-tbl thead th .th-sub{font-weight:500;opacity:.8;font-size:10px;}
.prog-tbl tbody td{padding:5px 10px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;border-bottom:1px solid #eef2f6;}
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

/* ---- Outlook additions ---- */
.edit-note{font-size:12px;color:#6b7686;margin:2px 0 8px;}
.legend{font-size:11px;color:#8a93a3;margin:10px 2px 0;line-height:1.5;}
.ol-tbl{min-width:1080px;}
.ol-tbl td.nm{font-weight:600;color:#1c3a5e;}
.ol-tbl tr.total td{font-weight:800;background:#e3edf7;border-top:2px solid #c3d6ea;}
.ol-tbl tr.total td.nm{background:#e3edf7;color:#0f3460;}
.cov-edit{width:62px;text-align:right;border:1px solid #cdd7e3;border-radius:6px;padding:3px 6px;font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums;background:#fff;color:#0f3460;outline:none;}
.cov-edit:focus{border-color:#0f3460;box-shadow:0 0 0 2px rgba(15,52,96,.15);}
.cov-edit.edited{background:#fff8e6;border-color:#e0b34d;}
.cov-edit.cov-good{color:#2e7d32;}.cov-edit.cov-warn{color:#8a5a00;}.cov-edit.cov-bad{color:#c62828;}
.ol-tbl td.outlook{font-weight:700;color:#0f3460;}
.ol-caret{display:inline-block;width:16px;cursor:pointer;color:#5a7ba0;font-size:11px;user-select:none;}
.ol-caret.leaf{cursor:default;color:transparent;}
.ol-tbl tr.lvl-unit td{background:#eef3f9;font-weight:700;}
.ol-tbl tr.lvl-unit td.nm{color:#0f3460;}
.ol-tbl tr.lvl-group td.nm{font-weight:600;color:#33506f;}
.ol-tbl tr.lvl-territory td.nm{font-weight:400;color:#5a6b80;}
.ol-tbl tr.lvl-territory td{font-weight:400;}
.ol-tbl tr.ol-row:hover td{background:#f5f9fd;}
.ol-tbl tr.lvl-unit:hover td{background:#e6eef7;}
.bridge-wrap{margin-top:22px;background:#fff;border:1px solid #e6e9ee;border-radius:10px;padding:16px 18px;box-shadow:0 1px 8px rgba(15,52,96,.05);}
.bridge-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;}
.bridge-head h3{font-size:15px;margin:0;color:#0f3460;}
.bridge-seg{display:flex;align-items:center;gap:8px;font-size:12px;color:#6b7686;}
.bridge-seg select{border:1px solid #cdd7e3;border-radius:6px;padding:5px 8px;font-size:12.5px;color:#0f3460;background:#fff;}
.bridge-sub{font-size:12.5px;color:#475569;margin:8px 0 14px;}
.bridge-sub .pos{color:#2e7d32;font-weight:700;}.bridge-sub .neg{color:#c62828;font-weight:700;}
.wf-row{display:flex;align-items:flex-end;gap:18px;padding-top:8px;}
.wf-col{flex:1;display:flex;flex-direction:column;align-items:center;}
.wf-ctrl{height:30px;margin-bottom:6px;}
.wf-pct{width:56px;text-align:center;border:1px solid #cdd7e3;border-radius:6px;padding:3px 4px;font-size:12px;font-weight:700;color:#0f3460;outline:none;}
.wf-pct:focus{border-color:#0f3460;box-shadow:0 0 0 2px rgba(15,52,96,.15);}
.wf-pct.wf-proj{border-style:dashed;}
.wf-plot{position:relative;width:100%;height:240px;border-bottom:2px solid #d7e2ee;}
.wf-bar{position:absolute;left:18%;width:64%;border-radius:3px 3px 0 0;}
.wf-bar.committed{background:#2e7d32;}
.wf-bar.blocked{background:#c0843a;}
.wf-bar.uncommitted{background:#5b8ac9;}
.wf-bar.outlook{background:#0f3460;}.wf-bar.outlook.neg{background:#c62828;}
.wf-bar.target{background:#9aa7b8;}
.wf-bar.vtt.pos{background:#27a567;}.wf-bar.vtt.neg{background:#d35454;}
.wf-val{position:absolute;left:0;width:100%;text-align:center;font-size:11px;font-weight:700;color:#324155;font-variant-numeric:tabular-nums;}
.wf-val.neg{color:#c62828;}
.wf-name{margin-top:8px;font-size:11.5px;font-weight:600;color:#6b7686;text-align:center;}
`;
