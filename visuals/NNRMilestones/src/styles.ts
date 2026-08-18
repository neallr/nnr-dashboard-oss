// Progress-view CSS (ported from the web app styles.css, vars folded to hex).
export const STYLES = `
*{box-sizing:border-box;}
.nnr-root{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;color:#1a2230;background:#f4f6f9;padding:14px 16px;}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:22px;}
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
.gaps-kpis{grid-template-columns:repeat(3,1fr);}
.badge{display:inline-block;min-width:20px;padding:1px 7px;border-radius:11px;background:#0f3460;color:#fff;font-size:11px;font-weight:700;margin-left:6px;}
.seg-tab .badge{background:rgba(15,52,96,.12);color:#0f3460;}
.seg-tab.active .badge{background:rgba(255,255,255,.25);color:#fff;}
.gaps-tbl{min-width:760px;}
.gaps-tbl col.gc-terr{width:38%;}
.gaps-tbl thead th[colspan]{text-align:center;border-left:1px solid #1c4a78;background:#0c2c52;}
.gap-grp{cursor:pointer;}
.gap-grp td{background:#f4f8fc;font-weight:700;color:#1c3a5e;border-bottom:1px solid #d7e2ee;}
.gap-grp:hover td{background:#eaf2fb;}
.grp-chev{display:inline-block;color:#1a4a7a;font-size:10px;width:12px;}
.gap-row.hidden{display:none;}
.gap-flag{color:#c62828;font-weight:700;}
.gap-mark{color:#e0a800;}

/* ---- Accounts additions ---- */
.kpis-live{margin-top:-8px;}
.kpi.live{background:#f0f6fc;border-color:#cfe0f0;}
.filters{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:6px 0 10px;}
.filters .seg-tabs.inline{margin:0;}
.filters input[type=search],.filters input[type=text]{border:1px solid #cdd7e3;border-radius:7px;padding:6px 10px;font-size:12.5px;min-width:180px;outline:none;}
.filters select{border:1px solid #cdd7e3;border-radius:7px;padding:6px 8px;font-size:12.5px;background:#fff;color:#0f3460;}
.filters .chk{font-size:12.5px;color:#475569;display:flex;align-items:center;gap:5px;cursor:pointer;}
.filters .chk-stack{display:flex;flex-direction:column;gap:3px;}
.filters.th-row{margin-top:-4px;}
.th-lbl{font-size:12px;font-weight:700;color:#6b7686;text-transform:uppercase;letter-spacing:.3px;}
.lnk{background:none;border:none;color:#1a6bb5;font-size:12px;cursor:pointer;text-decoration:underline;}
.acct-tbl{min-width:1100px;font-size:12px;}
.acct-tbl th.sortable{cursor:pointer;user-select:none;}
.acct-tbl th.sortable:hover{background:#0c2c52;}
.acct-tbl th .dsortwrap{display:inline-block;margin-left:5px;}
.acct-tbl th .dsort{display:inline-block;cursor:pointer;font-size:9.5px;font-weight:700;line-height:1;padding:1px 3px;margin-left:2px;border-radius:3px;background:rgba(255,255,255,.14);color:#cdd9ea;}
.acct-tbl th .dsort:hover{background:rgba(255,255,255,.30);color:#fff;}
.acct-tbl th .dsort.on{background:#1a6bb5;color:#fff;}
.acct-tbl th.lft,.acct-tbl td.lft{text-align:left;}
.acct-tbl td.num{text-align:right;font-variant-numeric:tabular-nums;color:#6b7686;}
.acct-tbl td.small{font-size:11px;color:#6b7686;}
.acct-tbl td.mcell{text-align:right;}
.acct-tbl .mval{display:block;font-variant-numeric:tabular-nums;}
.acct-tbl .dsub{display:block;font-size:9.5px;margin-top:1px;white-space:nowrap;}
.dlt{display:inline-block;margin-left:4px;}
.dlt i{font-style:normal;opacity:.5;margin-left:1px;}
.dlt.pos{color:#2e7d32;}.dlt.neg{color:#c62828;}.dlt.zero{color:#9aa7b8;}.dlt.na{color:#c7ced8;}
.tag{display:inline-block;padding:1px 6px;border-radius:10px;font-size:10px;font-weight:700;}
.tag.macc{background:#e7f0fb;color:#1a4a7a;}
.tag.hot{background:#fde8d7;color:#b5520f;margin-left:4px;}
.muted{color:#c7ced8;}
.acct-tbl tr.ftot td,.acct-tbl tr.ffilt td{font-weight:700;background:#eef3f9;border-top:2px solid #d7e2ee;}
.acct-tbl tr.ffilt td{background:#e3edf7;}

/* ---- MACC coverage gap card ---- */
.ncp-card{margin-top:22px;background:#fff;border:1px solid #e6e9ee;border-radius:10px;padding:16px 18px;box-shadow:0 1px 8px rgba(15,52,96,.05);}
.ncp-eyebrow{font-size:11px;font-weight:700;color:#b5520f;letter-spacing:.6px;}
.ncp-title{font-size:15px;margin:2px 0 12px;color:#0f3460;}
.ncp-tbl{width:100%;border-collapse:collapse;font-size:12px;}
.ncp-tbl th{background:#0f3460;color:#fff;padding:6px 9px;font-size:11px;font-weight:700;text-align:right;white-space:nowrap;}
.ncp-tbl th.ncp-u{text-align:left;}
.ncp-grphdr th{background:#0c2c52;text-align:center;}
.ncp-tbl th.ncp-blk{text-align:center;}
.ncp-tbl td{padding:5px 9px;text-align:right;font-variant-numeric:tabular-nums;border-bottom:1px solid #eef2f6;}
.ncp-tbl td.ncp-u{text-align:left;font-weight:600;color:#1c3a5e;}
.ncp-pop{font-weight:700;color:#0f3460;}
.ncp-sep{border-left:2px solid #d7e2ee;}
.ncp-p.ncp-pz{color:#2e7d32;}
.ncp-p.ncp-pg{color:#5a8a3a;}
.ncp-p.ncp-po{color:#b5740f;}
.ncp-p.ncp-pr{color:#c62828;font-weight:700;}
.ncp-tbl tr.ncp-tot td{font-weight:800;background:#e3edf7;border-top:2px solid #c3d6ea;}
.ncp-foot{display:block;margin-top:8px;font-size:11px;color:#8a93a3;}

/* ---- gap filter pills ---- */
.gap-filters{display:flex;flex-direction:column;gap:6px;margin:6px 0 12px;}
.gap-fset{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.gap-flbl{font-size:11px;font-weight:700;color:#6b7686;text-transform:uppercase;letter-spacing:.3px;min-width:64px;}
.gap-pill{padding:4px 10px;font-size:11.5px;}

/* ---- Accounts column width + freeze pane ---- */
.acct-scroll{max-height:540px;overflow:auto;}
.acct-tbl{min-width:980px;table-layout:auto;}
.acct-tbl thead th{position:sticky;top:0;z-index:5;}
.acct-tbl th:first-child,.acct-tbl td:first-child{position:sticky;left:0;z-index:4;width:200px;min-width:160px;max-width:220px;background:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.acct-tbl thead th:first-child{z-index:6;background:#0f3460;}
.acct-tbl tr.ftot td:first-child{background:#eef3f9;}
.acct-tbl tr.ffilt td:first-child{background:#e3edf7;}
.acct-tbl td,.acct-tbl th{padding-left:8px;padding-right:8px;}
.acct-tbl td.mcell,.acct-tbl th{white-space:nowrap;}
/* left-justified id/segment columns, sized to content */
.acct-tbl td.tpid-cell{color:#6b7686;font-variant-numeric:tabular-nums;}
.acct-tbl th[data-key="tpid"],.acct-tbl th[data-key="unit"],
.acct-tbl td.tpid-cell,.acct-tbl td.seg-cell{width:1%;white-space:nowrap;}
/* ---- pillar multi-select dropdowns ---- */
.pl-dd{position:relative;display:inline-block;}
.pl-dd-btn{border:1px solid #cdd7e3;border-radius:7px;padding:6px 10px;font-size:12.5px;background:#fff;color:#0f3460;cursor:pointer;}
.pl-dd-btn.on{background:#0f3460;color:#fff;border-color:#0f3460;}
.pl-dd-panel{position:absolute;top:110%;left:0;z-index:30;background:#fff;border:1px solid #cdd7e3;border-radius:8px;box-shadow:0 4px 16px rgba(15,52,96,.18);padding:6px;max-height:260px;overflow:auto;min-width:200px;}
.pl-dd-panel label{display:flex;align-items:center;gap:7px;padding:4px 8px;font-size:12.5px;color:#1c3a5e;white-space:nowrap;border-radius:5px;cursor:pointer;}
.pl-dd-panel label:hover{background:#f4f8fc;}
.pl-dd-search{display:block;width:100%;border:1px solid #cdd7e3;border-radius:6px;padding:5px 8px;font-size:12px;margin-bottom:5px;outline:none;}
.pl-dd-panel .pl-opt{padding:5px 10px;font-size:12.5px;color:#1c3a5e;white-space:nowrap;border-radius:5px;cursor:pointer;}
.pl-dd-panel .pl-opt:hover{background:#f4f8fc;}
.pl-dd-panel .pl-opt.sel{background:#0f3460;color:#fff;}
.ss-btn{min-width:128px;text-align:left;font-weight:600;}
.ss-narrow .ss-btn{min-width:52px;text-align:center;}
.ss-narrow .pl-dd-panel{min-width:52px;}
.seg-narrow{min-width:118px !important;max-width:150px;}
.filters select.seg-narrow{width:140px;}
/* ---- pillar tiles (row 2) ---- */
.kpis.pl-tiles{grid-template-columns:repeat(4,minmax(0,1fr));}
/* Row 1 tiles compact; pillar tiles taller to show more pillars at once. */
#acKpisTop.kpis{margin-bottom:10px;}
#acKpisTop .kpi{padding:8px 14px;}
#acKpisTop .kpi .k-value{font-size:22px;margin-top:2px;}
#acKpisTop .kpi .k-foot{margin-top:2px;}
.kpi.pl-tile{padding:12px 14px;min-height:208px;}
.pl-tile .pl-by{font-size:10px;font-weight:600;color:#9aa4b2;text-transform:none;letter-spacing:0;}
.pl-tile .pl-tot{font-size:21px;margin-top:2px;}
.pl-tile .pl-sub{font-size:11px;color:#6b7686;margin:2px 0 6px;}
.pl-row{display:flex;align-items:center;gap:6px;font-size:11px;margin:3px 0;}
.pl-name{flex:0 0 38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#243b53;}
.pl-bar{flex:1;height:7px;background:#eef2f6;border-radius:4px;overflow:hidden;}
.pl-bar i{display:block;height:100%;background:#1a4a7a;}
.pl-val{flex:0 0 auto;font-variant-numeric:tabular-nums;color:#0f3460;font-weight:600;}
.pl-empty{font-size:11px;color:#9aa4b2;font-style:italic;}
/* super-pillar table tile (tile 4) */
.pl-super .pl-shead,.pl-srow{display:flex;align-items:center;gap:6px;}
.pl-shead{font-size:9.5px;font-weight:700;color:#9aa4b2;text-transform:uppercase;letter-spacing:.3px;margin:4px 0 2px;}
.pl-slist{display:flex;flex-direction:column;}
.pl-srow{font-size:11px;margin:2px 0;}
.pl-sname{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#243b53;}
.pl-sval{flex:0 0 72px;text-align:right;font-variant-numeric:tabular-nums;color:#0f3460;font-weight:600;}
.pl-shead .pl-sval{color:#9aa4b2;font-weight:700;}
`;
