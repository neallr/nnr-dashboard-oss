// Hygiene-view CSS (ported from the web app styles.css, vars folded to hex).
export const STYLES = `
*{box-sizing:border-box;}
.nnr-root{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;color:#1a2230;background:#f4f6f9;padding:14px 16px;}
.section-h{display:flex;align-items:baseline;justify-content:space-between;margin:4px 0 12px;gap:12px;flex-wrap:wrap;}
.section-h h2{font-size:16px;margin:0;color:#0f3460;}
.section-h .note{font-size:12px;color:#6b7686;}
.attn-bar{background:#eef3f9;color:#0f3460;border:1px solid #cdddf0;border-radius:8px;padding:9px 14px;font-size:12.5px;font-weight:600;margin-bottom:14px;}
.legend{font-size:11.5px;color:#6b7686;margin-top:10px;line-height:1.5;}

/* ---- Hygiene cards ---- */
.hyg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;}
.hyg-card{background:#fff;border:1px solid #e6e9ee;border-radius:10px;padding:16px 18px;box-shadow:0 1px 8px rgba(15,52,96,.05);}
.hyg-card.click{cursor:pointer;transition:border-color .12s,box-shadow .12s,transform .08s;}
.hyg-card.click:hover{border-color:#1a4a7a;box-shadow:0 2px 14px rgba(15,52,96,.12);}
.hyg-card.sel{border-color:#1a4a7a;box-shadow:0 0 0 2px rgba(26,91,158,.25);}
.hyg-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;}
.hyg-label{font-size:14px;font-weight:700;color:#0f3460;}
.hyg-count{font-size:24px;font-weight:800;min-width:36px;text-align:right;font-variant-numeric:tabular-nums;}
.hyg-count.hot{color:#c62828;}
.hyg-count.ok{color:#2e7d32;}
.hyg-count.na{color:#6b7686;}
.hyg-instr{font-size:12.5px;color:#4a5765;margin-top:8px;line-height:1.5;}
.hyg-sub{font-size:12px;color:#1a4a7a;font-weight:600;margin-top:8px;font-variant-numeric:tabular-nums;}

/* ---- Drill table ---- */
.drill-wrap{margin-top:18px;}
.drill-h h3{margin:0 0 10px;font-size:14.5px;color:#0f3460;}
.drill-h .note{font-weight:500;font-size:12.5px;color:#6b7686;}
.tablewrap{background:#fff;border:1px solid #e6e9ee;border-radius:10px;overflow:hidden;box-shadow:0 1px 8px rgba(15,52,96,.05);}
.tablewrap.scrollx{overflow-x:auto;}
.drill-tbl{width:100%;border-collapse:collapse;font-size:12.5px;min-width:880px;}
.drill-tbl thead th{position:sticky;top:0;z-index:3;background:#0f3460;color:#fff;padding:9px 12px;text-align:left;font-weight:700;font-size:11.5px;white-space:nowrap;border-bottom:2px solid #0b2747;}
.drill-tbl thead th.sortable{cursor:pointer;user-select:none;}
.drill-tbl thead th.sortable:hover{background:#1a4a7a;}
.drill-tbl tbody td{padding:9px 12px;text-align:left;border-top:1px solid #eef2f6;color:#243b53;vertical-align:top;}
.drill-tbl tbody tr:hover td{background:#f6faff;}
.drill-tbl td.mono{font-family:ui-monospace,'Cascadia Code',Menlo,monospace;font-size:12px;white-space:nowrap;}
.drill-tbl td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
.lnk{border:0;background:transparent;color:#1a4a7a;cursor:pointer;font-size:12.5px;text-decoration:underline;font-weight:600;padding:0 0 0 6px;}
.eml-btn{display:inline-block;color:#1a4a7a;text-decoration:none;font-weight:700;cursor:pointer;margin-right:4px;}
.hyg-cap{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:10px;background:#fdecea;color:#c0392b;border:1px solid #f1b7b1;font-size:11px;font-weight:700;white-space:nowrap;vertical-align:middle;}
.capctl{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:14px 0 6px;}
.cap-multi{position:relative;display:inline-block;}
.cap-multi-btn{padding:7px 12px;border:1px solid #e6e9ee;border-radius:8px;font-size:13px;background:#fff;color:#0f3460;cursor:pointer;min-width:132px;text-align:left;}
.cap-multi-btn:hover{border-color:#1a5b9e;}
.cap-multi-panel{position:absolute;z-index:30;top:calc(100% + 4px);left:0;min-width:200px;background:#fff;border:1px solid #e6e9ee;border-radius:8px;box-shadow:0 8px 24px rgba(20,40,70,.16);padding:6px;max-height:280px;overflow-y:auto;}
.cap-multi-panel label{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;font-size:13px;color:#0f3460;cursor:pointer;white-space:nowrap;}
.cap-multi-panel label:hover{background:#f2f6fb;}
.cap-multi-panel input{accent-color:#1a5b9e;}
.cap-multi-search{width:100%;box-sizing:border-box;padding:6px 8px;margin:0 0 6px 0;border:1px solid #e6e9ee;border-radius:6px;font-size:12.5px;color:#0f3460;position:sticky;top:0;}
.cap-multi-search:focus{outline:none;border-color:#1a5b9e;}
.cap-multi-list{max-height:230px;overflow-y:auto;}
.cap-empty{padding:8px;font-size:12px;color:#8a93a3;text-align:center;}
.capfilter{width:100%;max-width:360px;padding:8px 12px;border:1px solid #e6e9ee;border-radius:8px;font-size:13px;}
.capfilter:focus{outline:none;border-color:#1a5b9e;box-shadow:0 0 0 2px rgba(26,91,158,.18);}
.cap-clear{padding:7px 12px;border:1px solid #e6e9ee;border-radius:8px;font-size:12.5px;font-weight:600;background:#fff;color:#5a6470;cursor:pointer;}
.cap-clear:hover{border-color:#1a5b9e;color:#0f3460;}
.cap-fnote{font-size:12px;color:#1a5b9e;font-weight:600;margin-left:2px;font-variant-numeric:tabular-nums;}
`;
