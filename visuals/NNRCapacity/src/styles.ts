// Capacity-view CSS (ported from the web app styles.css, vars folded to hex).
export const STYLES = `
*{box-sizing:border-box;}
.nnr-root{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;color:#1a2230;background:#f4f6f9;padding:14px 16px;}
.section-h{display:flex;align-items:baseline;justify-content:space-between;margin:4px 0 12px;}
.section-h h2{font-size:16px;margin:0;color:#0f3460;}
.section-h .note{font-size:12px;color:#6b7686;}

/* ---- attn bar ---- */
.attn-bar{background:#fff4e5;border:1px solid #f0c47a;color:#8a5a00;padding:10px 16px;border-radius:8px;font-weight:600;margin-bottom:16px;}

/* ---- hygiene cards ---- */
.hyg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;}
.hyg-card{background:#fff;border:1px solid #e6e9ee;border-radius:10px;padding:16px 18px;box-shadow:0 1px 8px rgba(15,52,96,.05);}
.hyg-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;}
.hyg-label{font-size:14px;font-weight:700;color:#0f3460;}
.hyg-count{font-size:24px;font-weight:800;min-width:36px;text-align:right;}
.hyg-count.hot{color:#c62828;}
.hyg-instr{font-size:12.5px;color:#4a5765;margin-top:8px;line-height:1.5;}
.cap-subrow{margin-top:10px;padding-top:8px;border-top:1px dashed #e6e9ee;font-size:12.5px;color:#1a5b9e;min-height:14px;font-variant-numeric:tabular-nums;}
.cap-subrow b{color:#0f3460;}
.cap-sublabel{display:inline-block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#8a94a0;margin-right:4px;}

/* ---- controls ---- */
.capctl{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:14px 0 6px;}
.cap-toggle{display:inline-flex;border:1px solid #e6e9ee;border-radius:8px;overflow:hidden;}
.cap-toggle button{border:0;background:#fff;color:#4a5765;font-size:12.5px;font-weight:600;padding:7px 14px;cursor:pointer;border-right:1px solid #e6e9ee;}
.cap-toggle button:last-child{border-right:0;}
.cap-toggle button.on{background:#1a5b9e;color:#fff;}
.capfilter{width:100%;max-width:420px;padding:8px 12px;border:1px solid #e6e9ee;border-radius:8px;font-size:13px;}
.capfilter:focus{outline:none;border-color:#1a5b9e;box-shadow:0 0 0 2px rgba(26,91,158,.18);}
.cap-multi{position:relative;display:inline-block;}
.cap-multi-btn{padding:7px 12px;border:1px solid #e6e9ee;border-radius:8px;font-size:13px;background:#fff;color:#0f3460;cursor:pointer;min-width:132px;text-align:left;}
.cap-multi-btn:hover{border-color:#1a5b9e;}
.cap-multi-panel{position:absolute;z-index:30;top:calc(100% + 4px);left:0;min-width:200px;background:#fff;border:1px solid #e6e9ee;border-radius:8px;box-shadow:0 8px 24px rgba(20,40,70,.16);padding:6px;max-height:280px;overflow-y:auto;}
.cap-multi-panel label{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;font-size:13px;color:#0f3460;cursor:pointer;white-space:nowrap;}
.cap-multi-panel label:hover{background:#f2f6fb;}
.cap-multi-panel input{accent-color:#1a5b9e;}
.cap-clear{padding:7px 12px;border:1px solid #e6e9ee;border-radius:8px;font-size:12.5px;font-weight:600;background:#fff;color:#5a6470;cursor:pointer;}
.cap-clear:hover{border-color:#1a5b9e;color:#0f3460;}

/* ---- pills ---- */
.cap-pill{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700;white-space:nowrap;}
.cap-pill.cm{background:#e8f3ec;color:#1e7e44;border:1px solid #bfe0cb;}
.cap-pill.un{background:#f1f3f5;color:#5a6470;border:1px solid #d8dde2;}
.hyg-cap{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:10px;background:#fdecea;color:#c0392b;border:1px solid #f1b7b1;font-size:11px;font-weight:700;white-space:nowrap;vertical-align:middle;}

/* ---- table ---- */
.drill-h{margin-top:6px;}
.drill-h h3{margin:0 0 10px;font-size:14.5px;color:#0f3460;}
.drill-h .note{font-weight:500;color:#6b7686;font-size:12px;}
.tablewrap{background:#fff;border:1px solid #e6e9ee;border-radius:10px;overflow:hidden;box-shadow:0 1px 8px rgba(15,52,96,.05);}
.tablewrap.scrollx{overflow-x:auto;}
.drill-tbl{width:100%;border-collapse:collapse;font-size:12.5px;min-width:960px;}
.drill-tbl thead th{position:sticky;top:0;z-index:3;background:#0f3460;color:#fff;padding:9px 12px;text-align:right;font-weight:700;font-size:11.5px;white-space:nowrap;border-bottom:2px solid #0b2747;}
.drill-tbl thead th:first-child{text-align:left;}
.drill-tbl thead th:nth-child(2){text-align:left;}
.drill-tbl tbody td{padding:8px 12px;text-align:right;font-variant-numeric:tabular-nums;border-bottom:1px solid #eef2f6;white-space:nowrap;}
.drill-tbl tbody td:first-child{text-align:left;}
.drill-tbl tbody td:nth-child(2){text-align:left;font-weight:600;color:#243b53;}
.drill-tbl tbody td:nth-child(4),.drill-tbl tbody td:nth-child(5),.drill-tbl tbody td:nth-child(6),.drill-tbl tbody td:nth-child(7){text-align:left;}
.drill-tbl tbody tr:nth-child(even){background:#fafbfd;}
.drill-tbl tbody tr:hover td{background:#f6faff;}
.drill-tbl td.mono{font-family:ui-monospace,"Cascadia Code",Menlo,monospace;font-size:12px;white-space:nowrap;text-align:left;}
.drill-tbl td.num{text-align:right;font-variant-numeric:tabular-nums;}
.drill-tbl td .lnk{margin-left:6px;color:#0b6bcb;text-decoration:none;}
.drill-tbl td .lnk:hover{text-decoration:underline;}
.drill-tbl th.sortable{cursor:pointer;user-select:none;white-space:nowrap;}
.drill-tbl th.sortable:hover{color:#9fc0e8;}
.cre-panel{min-width:230px;}
.cre-head{display:flex;align-items:center;gap:6px;padding:2px 4px 8px;border-bottom:1px solid #eef2f7;margin-bottom:4px;}
.cre-mini{border:1px solid #e6e9ee;background:#f7f9fc;color:#0f3460;padding:3px 10px;font-size:11px;font-weight:600;border-radius:14px;cursor:pointer;}
.cre-mini:hover{border-color:#9bb6d6;}
.cre-title{font-size:10.5px;color:#9aa6b5;margin-left:auto;text-transform:uppercase;letter-spacing:.3px;}
.cre-qgroup{border-bottom:1px solid #f4f7fb;}
.cre-qrow{display:flex;align-items:center;justify-content:space-between;padding:2px 4px;}
.cre-qlabel{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#0f3460;cursor:pointer;flex:1;white-space:nowrap;}
.cre-qlabel input,.cre-mrow input{accent-color:#1a5b9e;cursor:pointer;margin:0;}
.cre-caret{border:none;background:none;color:#6b7686;cursor:pointer;font-size:11px;padding:2px 6px;border-radius:6px;}
.cre-caret:hover{background:#eef3f9;color:#0f3460;}
.cre-mlist{padding:2px 0 6px 22px;}
.cre-mrow{display:flex;align-items:center;gap:8px;padding:4px 6px;font-size:12.5px;color:#243b53;cursor:pointer;white-space:nowrap;border-radius:6px;}
.cre-mrow:hover{background:#f2f6fb;}
`;
