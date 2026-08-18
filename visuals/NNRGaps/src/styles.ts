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

/* ---- Gaps additions ---- */
.attn-bar{background:#fdeaea;color:#c62828;border:1px solid #f5c2c2;border-radius:8px;padding:9px 14px;font-size:12.5px;font-weight:600;margin-bottom:14px;}
.gaps-kpis{grid-template-columns:repeat(3,1fr);width:auto;}
.gap-aligned{display:flex;flex-direction:column;width:fit-content;max-width:100%;}
.gap-aligned .tablewrap.gap-scroll{align-self:stretch;width:auto;}
.gap-aligned .gaps-tbl{width:100%;}
.gap-aligned .seg-tabs[data-tabs="seg"]{justify-content:space-between;}
.badge{display:inline-block;min-width:20px;padding:1px 7px;border-radius:11px;background:#0f3460;color:#fff;font-size:11px;font-weight:700;margin-left:6px;}
.seg-tab .badge{background:rgba(15,52,96,.12);color:#0f3460;}
.seg-tab.active .badge{background:rgba(255,255,255,.25);color:#fff;}
.gaps-tbl{min-width:0;width:auto;}
.gaps-tbl col.gc-terr{width:200px;}
.gaps-tbl col.gc-com{width:112px;}
.gaps-tbl col.gc-wow{width:78px;}
.gaps-tbl thead th[colspan]{text-align:center;border-left:1px solid #1c4a78;background:#0c2c52;}
.gap-grp{cursor:pointer;}
.gap-grp td{background:#f4f8fc;font-weight:700;color:#1c3a5e;border-bottom:1px solid #d7e2ee;}
.gap-grp:hover td{background:#eaf2fb;}
.grp-chev{display:inline-block;color:#1a4a7a;font-size:10px;width:12px;}
.gap-row.hidden{display:none;}
.gap-flag{color:#c62828;font-weight:700;}
.gap-mark{color:#e0a800;}

/* ---- gap full-year filter pills + freeze ---- */
.gap-filters{display:flex;flex-direction:column;gap:6px;margin:4px 0 14px;}
.gap-fset{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.gap-flbl{font-size:11px;font-weight:700;color:#6b7686;text-transform:uppercase;letter-spacing:.3px;min-width:64px;}
.gap-pill{padding:4px 10px;font-size:11.5px;}
.gap-scroll{max-height:520px;overflow:auto;}
.tablewrap.gap-scroll{width:fit-content;max-width:100%;}
/* Single-row sticky header (no two-row seam possible). Each Q1/Jul group is ONE cell: period name
   on top, Committed/WoW spaced evenly below, aligned over its two columns. */
.gaps-tbl thead th{position:sticky;top:0;z-index:5;box-sizing:border-box;background-clip:padding-box;}
.gaps-tbl thead th.grp-h{text-align:center;border-left:1px solid #1c4a78;background:#0c2c52;vertical-align:bottom;padding:7px 0 5px;}
.gaps-tbl thead th.grp-h .grp-top{display:block;text-align:center;margin-bottom:3px;}
.gaps-tbl thead th.grp-h .grp-sub{display:flex;}
.gaps-tbl thead th.grp-h .grp-sub > span{flex:none;text-align:right;padding-right:10px;box-sizing:border-box;font-weight:600;font-size:10px;opacity:.85;}
.gaps-tbl thead th.grp-h .grp-sub > span:nth-child(1){width:112px;}
.gaps-tbl thead th.grp-h .grp-sub > span:nth-child(2){width:78px;}
.gaps-tbl thead th.nm{left:0;z-index:6;background:#0f3460;color:#fff;}
.gaps-tbl td.nm{position:sticky;left:0;z-index:3;background:#fff;}
.muted{color:#c7ced8;}
`;
