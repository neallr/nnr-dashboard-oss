// Azure-view CSS (ported from the web app styles.css, vars folded to hex).
export const STYLES = `
*{box-sizing:border-box;}
.nnr-root{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;color:#1a2230;background:#f4f6f9;padding:14px 16px;}
.wow{font-weight:600;}.wow.pos{color:#2e7d32;}.wow.neg{color:#c62828;}.wow.zero{color:#6b7686;}
.seg-tabs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:14px;}.seg-tabs.inline{margin:0 0 12px;gap:4px;}
.seg-tab{border:1px solid #e6e9ee;background:#fff;color:#0f3460;padding:8px 14px;font-size:13px;font-weight:600;border-radius:20px;cursor:pointer;}
.seg-tabs.inline .seg-tab{padding:6px 12px;font-size:12.5px;}
.seg-tab.active{background:#0f3460;color:#fff;border-color:#0f3460;}
.section-h{display:flex;align-items:baseline;justify-content:space-between;margin:4px 0 12px;flex-wrap:wrap;gap:8px;}
.section-h h2{font-size:16px;margin:0;color:#0f3460;}.section-h .note{font-size:12px;color:#6b7686;}
.tablewrap{background:#fff;border:1px solid #e6e9ee;border-radius:10px;overflow:hidden;box-shadow:0 1px 8px rgba(15,52,96,.05);}
.tablewrap.scrollx{overflow-x:auto;}
.prog-tbl{width:100%;border-collapse:collapse;font-size:12.5px;min-width:900px;}
.prog-tbl thead th{position:sticky;top:0;z-index:3;background:#0f3460;color:#fff;padding:7px 10px;text-align:right;font-weight:700;font-size:11.5px;white-space:nowrap;vertical-align:bottom;border-bottom:2px solid #0b2747;}
.prog-tbl thead th.nm{text-align:left;left:0;z-index:4;}
.prog-tbl tbody td{padding:5px 10px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;border-bottom:1px solid #eef2f6;}
.prog-tbl td.nm{text-align:left;position:sticky;left:0;z-index:2;background:#fff;max-width:320px;overflow:hidden;text-overflow:ellipsis;}
.prog-tbl tr.period td{font-weight:700;background:#eef3f9;border-bottom:1px solid #d7e2ee;}
.prog-tbl tr.period td.nm{background:#eef3f9;color:#0f3460;}
.prog-tbl tr.period.total td{background:#e3edf7;}
.prog-tbl tr.period.total td.nm{background:#e3edf7;}
.cov-pill{display:inline-block;min-width:54px;padding:2px 8px;border-radius:20px;font-weight:700;font-size:12.5px;}
.cov-good{background:#e7f4e8;color:#2e7d32;}.cov-warn{background:#fff4e5;color:#8a5a00;}.cov-bad{background:#fdeaea;color:#c62828;}

/* ---- Azure additions ---- */
.az-tbl{min-width:840px;}
.qsel{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:2px 0 14px;}
.qsel-lbl{font-size:12px;font-weight:700;color:#6b7686;text-transform:uppercase;letter-spacing:.3px;}
.qchip{display:inline-flex;align-items:center;gap:6px;border:1px solid #e6e9ee;background:#fff;color:#0f3460;padding:5px 12px;font-size:12.5px;font-weight:600;border-radius:20px;cursor:pointer;user-select:none;}
.qchip input{accent-color:#0f3460;cursor:pointer;margin:0;}
.qchip.on{background:#0f3460;color:#fff;border-color:#0f3460;}
.stages-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin-top:6px;}
.stagewrap{background:#fff;border:1px solid #e6e9ee;border-radius:10px;padding:12px 14px;box-shadow:0 1px 8px rgba(15,52,96,.05);}
.stagewrap h3{font-size:13px;margin:0 0 10px;color:#0f3460;font-weight:700;}
.stage{display:grid;grid-template-columns:120px 1fr 70px;align-items:center;gap:8px;margin-bottom:7px;}
.stage-l{font-size:12px;color:#486581;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.stage-bar{background:#eef2f6;border-radius:6px;height:14px;overflow:hidden;}
.stage-fill{background:#0f3460;height:100%;border-radius:6px;}
.stage-fill.neg{background:#c62828;}
.stage-v{font-size:12px;text-align:right;font-variant-numeric:tabular-nums;color:#243b53;font-weight:600;}
.muted-note{font-size:12.5px;color:#6b7686;padding:14px;background:#fff;border:1px solid #e6e9ee;border-radius:10px;}
.stages-grid.grid4{grid-template-columns:repeat(4,minmax(0,1fr));}
.pcard{background:#fff;border:1px solid #e6e9ee;border-radius:10px;padding:12px 14px;box-shadow:0 1px 8px rgba(15,52,96,.05);}
.pcard h3{font-size:13px;margin:0 0 10px;color:#0f3460;font-weight:700;}
.pbar-row{display:grid;grid-template-columns:54px 1fr auto;align-items:center;gap:8px;margin-bottom:7px;}
.pbar-lbl{font-size:12px;color:#486581;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pbar-track{background:#eef2f6;border-radius:6px;height:14px;overflow:hidden;}
.pbar-fill{height:100%;border-radius:6px;}
.pbar-fill.pf-commit{background:#2e7d32;}
.pbar-fill.pbar-neg{background:#c62828;}
.pbar-val{font-size:11.5px;text-align:right;font-variant-numeric:tabular-nums;color:#243b53;font-weight:600;white-space:nowrap;}
.pbar-row.pbar-tot{border-top:1px dashed #e6e9ee;margin-top:8px;padding-top:8px;}
.pbar-row.pbar-tot .pbar-lbl{font-weight:700;color:#0f3460;}
.pcl-grp{margin-bottom:9px;}
.pcl-grp-h{display:flex;justify-content:space-between;align-items:baseline;gap:6px;margin-bottom:3px;}
.pcl-grp-nm{font-size:12px;color:#243b53;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pcl-qp{font-size:11px;color:#486581;font-variant-numeric:tabular-nums;white-space:nowrap;}
.pcl-stack{display:flex;height:13px;background:#eef2f6;border-radius:6px;overflow:hidden;}
.pcl-seg{height:100%;}
.pcl-seg.pf-commit{background:#2e7d32;}
.pcl-seg.pf-uncommit{background:#e8a33d;}
.pcl-seg.pf-block{background:#6b7280;}
.pcl-legend{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin:8px 0 2px;font-size:11.5px;color:#486581;}
.pcl-legend span{display:inline-flex;align-items:center;gap:5px;}
.pbar-swatch{display:inline-block;width:11px;height:11px;border-radius:3px;}
.pbar-swatch.pf-commit{background:#2e7d32;}
.pbar-swatch.pf-uncommit{background:#e8a33d;}
.pbar-swatch.pf-block{background:#6b7280;}
.crq-dd{display:flex;align-items:center;gap:8px;margin:0 0 14px;position:relative;}
.crq-lbl{font-size:11px;font-weight:700;color:#6b7686;text-transform:uppercase;letter-spacing:.3px;}
.crq-ddbtn{display:inline-flex;align-items:center;gap:8px;border:1px solid #cdd6e2;background:#fff;color:#0f3460;padding:6px 12px;font-size:12.5px;font-weight:600;border-radius:8px;cursor:pointer;min-width:120px;justify-content:space-between;}
.crq-ddbtn:hover{border-color:#9bb6d6;}
.crq-ddval{color:#0f3460;}
.crq-ddcaret{color:#6b7686;font-size:10px;}
.crq-ddpanel{position:absolute;top:34px;left:84px;z-index:50;background:#fff;border:1px solid #cdd6e2;border-radius:10px;box-shadow:0 6px 24px rgba(15,52,96,.16);padding:8px;min-width:230px;max-height:340px;overflow:auto;}
.crq-ddhead{display:flex;align-items:center;gap:6px;padding:2px 4px 8px;border-bottom:1px solid #eef2f7;margin-bottom:6px;}
.crq-mini{border:1px solid #e6e9ee;background:#f7f9fc;color:#0f3460;padding:3px 10px;font-size:11px;font-weight:600;border-radius:14px;cursor:pointer;}
.crq-mini:hover{border-color:#9bb6d6;}
.crq-ddtitle{font-size:10.5px;color:#9aa6b5;margin-left:auto;text-transform:uppercase;letter-spacing:.3px;}
.crq-qgroup{border-bottom:1px solid #f4f7fb;}
.crq-qrow{display:flex;align-items:center;justify-content:space-between;padding:3px 4px;}
.crq-qlabel{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;color:#243b53;cursor:pointer;flex:1;}
.crq-qlabel input,.crq-mrow input{accent-color:#0f3460;cursor:pointer;margin:0;width:14px;height:14px;}
.crq-caret{border:none;background:none;color:#6b7686;cursor:pointer;font-size:11px;padding:2px 6px;border-radius:6px;}
.crq-caret:hover{background:#eef3f9;color:#0f3460;}
.crq-mlist{padding:2px 0 6px 24px;}
.crq-mrow{display:flex;align-items:center;gap:8px;padding:3px 4px;font-size:12px;color:#3a4a5e;cursor:pointer;}
.crq-mrow:hover{background:#f7f9fc;border-radius:6px;}
`;
