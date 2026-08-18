// NNRFrontier — UK&I Frontier MACC (industry + account maturity & forward pipeline) styles.
export const STYLES = `
*{box-sizing:border-box;margin:0;padding:0;}
.fm-root{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;color:#0d0e10;background:#fbfbfc;padding:0 0 14px;}
.fm-hd{display:flex;align-items:flex-end;justify-content:space-between;padding:14px 22px 12px;background:linear-gradient(180deg,#f7fafd,#fff);border-bottom:1px solid #e6ecf3;}
.fm-hd h1{font-size:21px;color:#0b2e52;font-weight:800;letter-spacing:-.3px;}
.fm-hd .sub{font-size:12.5px;color:#5f7690;margin-top:3px;font-weight:500;}
.fm-hd .sub b{color:#0b2e52;}
.fm-tabs{display:flex;background:#eaf0f6;border-radius:9px;padding:3px;font-size:12px;font-weight:700;}
.fm-tabs span{padding:6px 14px;border-radius:7px;color:#5f7690;cursor:pointer;user-select:none;}
.fm-tabs span.on{background:#0b6ad4;color:#fff;box-shadow:0 1px 4px rgba(11,106,212,.35);}
.fm-hd-r{display:flex;flex-direction:column;align-items:flex-end;gap:8px;}
/* Independent MACC toggle views (ATU/STU/CSU): light pills, distinct from the solid main tabs. */
.fm-vtoggle{display:flex;align-items:center;gap:6px;}
.fm-vtoggle .vl{font-size:10px;font-weight:700;color:#8a99ac;text-transform:uppercase;letter-spacing:.05em;margin-right:2px;}
.fm-vtoggle button{border:1px solid #cfe0f2;background:#fff;color:#3f5b7a;padding:5px 13px;border-radius:16px;font-size:11.5px;font-weight:700;cursor:pointer;user-select:none;}
.fm-vtoggle button:hover{background:#eef6ff;}
.fm-vtoggle button.on{background:#0b6ad4;color:#fff;border-color:#0b6ad4;box-shadow:0 1px 4px rgba(11,106,212,.3);}
/* ATU toggle view — ONE combined table: maturity rows + forward-pillar columns after Within Reach.
   The base .fm-atu grid is 5 cols (name | bar | AtFrontier | Share | WithinReach); the ATU view adds
   the 5 product-pillar columns. fm-atu-w widens to fit + shrinks the maturity block so pillars fit. */
.fm-atv-comb{margin:22px 22px 0;}
.fm-atv-comb .fm-panel{padding:0;overflow-x:auto;}
.fm-atu.fm-atu-w{grid-template-columns:150px minmax(260px,1fr) 78px 52px 82px repeat(5,minmax(96px,1fr));gap:12px;min-width:1120px;}
.fm-atu.fm-atu-w .fm-mix{height:24px;}
.fm-atv-comb .fm-insight{margin:12px 22px 0;}
.fm-atv-comb .fm-tierleg{margin:9px 22px 0;}
.fm-atv-comb .fm-legend{margin:10px 22px 0;}
/* forward-pillar cell inside an ATU row */
.fm-fwc{text-align:right;font-size:11.5px;font-variant-numeric:tabular-nums;color:#0b2e52;font-weight:600;white-space:nowrap;}
.fm-fwc .cp{color:#0b2e52;font-weight:700;} .fm-fwc .ucp{color:#8a8f98;font-weight:600;}
.fm-fwc.fm-na{color:#c8ccd2;font-weight:600;text-align:center;}
.fm-atuhdr.fm-atu-w .hh2{white-space:nowrap;}
/* STU/CSU tables — numeric + yes/no cells. */
.fm-tbl td.num{text-align:right;font-variant-numeric:tabular-nums;}
.fm-tbl td.ctr{text-align:center;}
.fm-tbl td.dim{color:#8a8f98;}
.fm-tbl td.num.warn{color:#c0392b;font-weight:700;}
.fm-tbl td.num.pos{color:#1a7f43;font-weight:700;}
.fm-tbl td.warn{color:#c0392b;font-weight:700;}
.fm-tbl td.ucp span,.fm-tbl .ucp{color:#8a8f98;}
.fm-tbl td.yn{font-weight:700;}
.fm-tbl td.yn.yes{color:#1a7f43;} .fm-tbl td.yn.no{color:#c0392b;}
.fm-tbl tr.fm-gt td{background:#f4f7fb;font-weight:800;color:#0b2e52;border-top:2px solid #dbe4ee;}
.fm-empty{text-align:center;color:#9aa8bc;padding:14px;font-style:italic;}
/* MACC TCV tranche band pill (raw $ never shown — only the band). */
.tcv-band{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:20px;white-space:nowrap;}
.tcv-b0{background:#eef1f5;color:#5f7690;}
.tcv-b1{background:#e7f0fb;color:#0b6ad4;}
.tcv-b2{background:#e7f5ee;color:#1a7f43;}
.tcv-b3{background:#fbf1e3;color:#b8860b;}
/* MACC TCV tranche filter bar (STU + CSU) */
.fm-bandbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 10px;}
.fm-bandbar .bl{font-size:10px;font-weight:700;color:#8a99ac;text-transform:uppercase;letter-spacing:.05em;margin-right:2px;}
.fm-bandbar .tcvf{display:inline-flex;align-items:center;gap:6px;border:1px solid #d4deeb;background:#fff;color:#3f5b7a;padding:4px 11px;border-radius:16px;font-size:11px;font-weight:700;cursor:pointer;user-select:none;}
.fm-bandbar .tcvf:hover{background:#eef6ff;}
.fm-bandbar .tcvf.on{background:#0b6ad4;color:#fff;border-color:#0b6ad4;box-shadow:0 1px 4px rgba(11,106,212,.3);}
.fm-bandbar .tcvf .c{font-size:9.5px;font-weight:700;background:rgba(120,140,170,.16);color:inherit;padding:1px 6px;border-radius:10px;}
.fm-bandbar .tcvf.on .c{background:rgba(255,255,255,.28);}
/* CSU scrollable body under sticky header + expand/collapse bar. */
.fm-csu-scroll{max-height:430px;overflow-y:auto;overflow-x:auto;}
.fm-csu-scroll thead th{position:sticky;top:0;z-index:2;}
.fm-morebar{margin:8px 0 0;text-align:center;font-size:11.5px;font-weight:700;color:#0b6ad4;cursor:pointer;user-select:none;padding:7px;background:#f4f8fd;border:1px solid #dbe8f6;border-radius:8px;}
.fm-morebar:hover{background:#e9f2fc;}
/* STU drill: clickable "# w/o CP" cell + detail panel. */
.fm-tbl td.stu-nocp{cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px;white-space:nowrap;}
.fm-tbl td.stu-nocp:hover{background:#fdecea;}
.fm-tbl td.stu-nocp.on{background:#c0392b;color:#fff;}
/* ATU no-qualified-pipeline clickable count cell */
.fm-tbl td.atu-nq{cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px;white-space:nowrap;}
.fm-tbl td.atu-nq:hover{background:#fdecea;}
.fm-tbl td.atu-nq.on{background:#c0392b;color:#fff;}
.fm-tbl .nqp{color:#8a8f98;font-variant-numeric:tabular-nums;}
/* CSU shortfall-risk badge */
.sf-badge{display:inline-block;font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;}
.sf-badge.sf-yes{background:#fbecea;color:#c0392b;}
.sf-badge.sf-no{background:#e7f5ee;color:#1a7f43;}
.fm-legend .fm-hint{color:#0b6ad4;font-weight:600;}
.stu-drill{margin-top:16px;}
.stu-close{margin-left:10px;border:1px solid #d9c2c0;background:#fbecea;color:#c0392b;font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:14px;cursor:pointer;}
.stu-close:hover{background:#f6dcd8;}
/* MALpen tile — MACC-extended sub-counts. */
.mal-kext{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:6px;font-size:10.5px;color:#5f7690;font-weight:600;}
.mal-kext b{color:#0b2e52;font-weight:800;}

/* hero KPI strip */
.fm-hero{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#e6ecf3;border:1px solid #e6ecf3;margin:14px 22px 0;border-radius:12px;overflow:hidden;}
.fm-hc{background:#fff;padding:15px 18px 14px;}
.fm-hc .l{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:#8a8f98;font-weight:700;}
.fm-hc .v{font-size:30px;font-weight:700;letter-spacing:-.03em;color:#0b2e52;margin-top:8px;line-height:1;display:flex;align-items:baseline;gap:9px;}
.fm-hc .v .ar{font-size:18px;color:#8a8f98;}
.fm-hc .v .from{color:#b3b8c0;font-weight:600;}
.fm-hc .m{font-size:12px;color:#5f7690;margin-top:8px;line-height:1.4;}
.fm-chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;padding:3px 9px;border-radius:7px;margin-top:9px;}
.fm-chip.up{color:#1a7f43;background:#e7f5ec;}
.fm-chip.dn{color:#d5383d;background:#fbecec;}
.fm-chip.flat{color:#5f7690;background:#eef1f5;}

/* section head */
.fm-sec{margin:22px 22px 0;}
.fm-sh{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:9px;}
.fm-sh h2{font-size:12.5px;font-weight:700;color:#0b2e52;letter-spacing:.01em;}
.fm-sh .n{font-size:11px;color:#8a8f98;font-weight:600;}
.fm-panel{background:#fff;border:1px solid #e6ecf3;border-radius:12px;box-shadow:0 1px 2px rgba(13,14,16,.03),0 3px 12px rgba(13,14,16,.04);overflow:hidden;}

/* insight + legend */
.fm-insight{margin:2px 22px 10px;font-size:13px;color:#33383f;background:#f4f7fb;border:1px solid #e6ecf3;border-radius:9px;padding:9px 14px;}
.fm-insight b{color:#0b2e52;}
.fm-tierleg{display:flex;align-items:center;gap:11px;flex-wrap:wrap;margin:0 22px 8px;font-size:11px;color:#5f7690;font-weight:600;}
.fm-tierleg .ll{color:#8a8f98;text-transform:uppercase;letter-spacing:.05em;font-size:10px;}
.fm-tierleg span{display:inline-flex;align-items:center;gap:5px;}
.fm-tierleg .sw{width:14px;height:12px;border-radius:3px;display:inline-block;}
.fm-tierleg .brk{color:#0b6ad4;font-weight:700;}
.fm-tierleg .sep{margin-left:6px;padding-left:12px;border-left:1px solid #dbe1ea;}

/* ATU rows (5-col: name | bar | atFrontier | share | withinReach) */
.fm-atu{display:grid;grid-template-columns:168px 1fr 96px 62px 96px;align-items:center;gap:16px;padding:12px 18px;border-bottom:1px solid #eef1f5;cursor:pointer;}
.fm-atu:last-child{border-bottom:none;}
.fm-atu:hover{background:#f7fafd;}
.fm-atu.on{background:#eef4fb;}
.fm-atuhdr{cursor:default;background:#f4f7fb;padding:8px 18px;}
.fm-atuhdr:hover{background:#f4f7fb;}
.fm-atuhdr .nm,.fm-atuhdr .hh,.fm-atuhdr .hh2{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#8a8f98;font-weight:700;}
.fm-atuhdr .hh2{text-align:center;}
.fm-atu .nm{font-size:13.5px;font-weight:700;color:#1a2230;}
.fm-atu .nm small{display:block;font-size:10px;color:#8a8f98;font-weight:600;margin-top:1px;}
.fm-mix{position:relative;display:flex;height:22px;border-radius:5px;overflow:hidden;background:#eef1f5;}
.fm-mix i{height:100%;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:11px;font-weight:700;color:#20303f;overflow:visible;white-space:nowrap;min-width:0;}
.fm-mix i.fm-t80,.fm-mix i.fm-t100{color:#fff;}
.fm-div{position:absolute;top:-2px;bottom:-2px;width:0;border-left:2px dashed #0b6ad4;z-index:3;}
.fm-t0{background:#dfe3ea;}.fm-t20{background:#f6c9a8;}.fm-t40{background:#f4d06a;}
.fm-t60{background:#9fd6b0;}.fm-t80{background:#5cb87f;}.fm-t100{background:#1a7f43;}
.fm-unsc{background:repeating-linear-gradient(45deg,#eef1f5,#eef1f5 5px,#e2e6ec 5px,#e2e6ec 10px);color:#9aa0aa!important;font-size:10px!important;font-weight:600!important;letter-spacing:.03em;}
.fm-ge{text-align:center;line-height:1.1;}
.fm-ge b{color:#1a7f43;font-size:19px;font-weight:800;}
.fm-ge .of{color:#b3b8c0;font-size:12px;font-weight:600;margin-left:2px;}
.fm-ge small{display:block;font-size:9px;color:#8a8f98;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-top:1px;}
.fm-share{text-align:center;font-size:14px;font-weight:800;}
.fm-share.up{color:#1a7f43;}.fm-share.mid{color:#b8860b;}.fm-share.dn{color:#d5383d;}.fm-share.flat{color:#b3b8c0;}
.fm-near{text-align:center;line-height:1.1;font-size:12px;color:#5f7690;}
.fm-near b{color:#b8860b;font-size:16px;font-weight:800;}
.fm-near small{display:block;font-size:9px;color:#8a8f98;font-weight:600;margin-top:1px;}
.fm-near .fm-nz{color:#c8ccd2;}

/* account table */
.fm-tblwrap{overflow-x:auto;}
table.fm-tbl{width:auto;border-collapse:collapse;font-size:12.5px;}
.fm-tbl th{position:sticky;top:0;background:#f4f7fb;color:#5f7690;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;font-weight:700;text-align:center;padding:9px 8px;border-bottom:1px solid #e6ecf3;white-space:nowrap;}
.fm-tbl th.l,.fm-tbl td.l{text-align:left;}
.fm-tbl td{padding:8px 8px;border-bottom:1px solid #f1f3f6;text-align:center;color:#33383f;}
.fm-tbl tr:hover td{background:#f9fbfd;}
.fm-tbl td.acct{font-weight:700;color:#1a2230;text-align:left;width:240px;max-width:240px;}
.fm-tbl td.acct small{display:block;font-size:10px;color:#8a8f98;font-weight:600;}
.fm-dot{display:inline-block;width:13px;height:13px;border-radius:50%;}
.fm-met{background:#1a7f43;}
.fm-cp{background:#f4d06a;box-shadow:inset 0 0 0 2px #e0ac2b;}
.fm-ucp{background:#fff;box-shadow:inset 0 0 0 2px #b7c0cc;}
.fm-gap{background:#fff;box-shadow:inset 0 0 0 1.5px #e2e3e8;}
.fm-na{color:#c8ccd2;font-weight:600;}
.fm-mat{font-weight:700;color:#0b2e52;}
.fm-pill{display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;}
.fm-pill.sc{background:#e7f0fb;color:#0b6ad4;}
.fm-pill.un{background:#f1f3f6;color:#9aa0aa;}
.fm-svc0{border-left:2px solid #dfe6ef;}
.fm-yy{color:#1a9e63;font-weight:800;}
.fm-nn{color:#b7bec8;font-weight:800;}
.fm-svcpct{color:#33383f;font-variant-numeric:tabular-nums;}
/* ---- Checklist account table (mockup adoption) ------------------------------------ */
.fm-ckt td.fm-tpid{color:#8a8f98;font-variant-numeric:tabular-nums;font-size:11.5px;}
.fm-ckt td.fm-macc{font-weight:700;color:#1a2230;white-space:nowrap;}
.fm-ckt td.fm-cend{color:#5f7690;white-space:nowrap;}
.fm-ckt th.fm-score,.fm-ckt td.fm-score{border-left:2px solid #dfe6ef;border-right:2px solid #dfe6ef;font-weight:800;}
.fm-ckt td.fm-score{color:#0b2e52;}
.fm-ckt td.fm-score.sg{color:#1a7f43;} .fm-ckt td.fm-score.sa{color:#c98a00;} .fm-ckt td.fm-score.sr{color:#c0392b;}
.fm-ckh{display:flex;flex-direction:column;align-items:center;gap:1px;line-height:1.1;}
.fm-ckh .fm-ckic{display:inline-flex;align-items:center;justify-content:center;height:16px;}
.fm-ckh b{font-size:10.5px;color:#0b2e52;text-transform:none;letter-spacing:0;}
.fm-ckh small{font-size:8.5px;color:#7c8ba0;text-transform:none;letter-spacing:0;font-weight:600;white-space:nowrap;}
td.fm-ck{padding:6px 8px;text-align:center;}
td.fm-ckdrill{cursor:pointer;}
td.fm-ckdrill:hover .fm-ckbox{filter:brightness(0.94);transform:scale(1.08);transition:transform .1s;}
/* checkbox-style badge (mockup): rounded square, light tint + coloured border/glyph; cell stays white */
.fm-ckbox{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:5px;font-size:12.5px;font-weight:900;line-height:1;}
.fm-ckbox.met{background:#e7f6ec;border:1.5px solid #1a7f43;color:#1a7f43;}
.fm-ckbox.warn{background:#fff5e0;border:1.5px solid #d99400;color:#c98a00;}
.fm-ckbox.gap{background:#fdeceb;border:1.5px solid #d0402f;color:#d0402f;}
.fm-ckbox.pend{background:#f4f6f8;border:1.5px solid #c4ccd5;color:#aab2bd;}
.fm-ck-sw{display:inline-block;width:12px;height:12px;border-radius:3px;}
.fm-ck-sw.met{background:#e7f6ec;box-shadow:inset 0 0 0 1.5px #1a7f43;}
.fm-ck-sw.cp,.fm-ck-sw.ucp{background:#fff5e0;box-shadow:inset 0 0 0 1.5px #d99400;}
.fm-ck-sw.gap{background:#fdeceb;box-shadow:inset 0 0 0 1.5px #d0402f;}
.fm-ck-sw.pend{background:#f4f6f8;box-shadow:inset 0 0 0 1.5px #c4ccd5;}
.fm-ck-sw.pend{background:#eef1f4;box-shadow:inset 0 0 0 1.5px #aab2bd;}
/* pin the Account column so the identity stays visible when scrolling the criteria */
.fm-ckt th.fm-pin,.fm-ckt td.fm-pin{position:sticky;left:0;z-index:3;background:#fff;box-shadow:1px 0 0 #e6ecf3;}
.fm-ckt thead th.fm-pin{z-index:4;background:#f4f7fb;}
.fm-ckt tr:hover td.fm-pin{background:#f9fbfd;}
.fm-d{font-size:11.5px;font-weight:700;}
.fm-d.up{color:#1a7f43;}.fm-d.dn{color:#d5383d;}.fm-d.flat{color:#b3b8c0;}

/* forward pipeline cells */
.fm-fw{font-family:'Segoe UI';font-size:11.5px;color:#33383f;white-space:nowrap;}
.fm-fw .cp{color:#0b2e52;font-weight:700;}
.fm-fw .ucp{color:#8a8f98;}

/* controls */
.fm-ctl{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 22px 2px;}
.fm-seg{display:flex;background:#eef1f5;border-radius:7px;padding:2px;font-size:11px;font-weight:700;}
.fm-seg button{border:none;background:none;padding:5px 11px;border-radius:5px;color:#5f7690;cursor:pointer;}
.fm-seg button.on{background:#fff;color:#0b2e52;box-shadow:0 1px 3px rgba(13,14,16,.12);}
.fm-search{flex:1;max-width:240px;padding:6px 11px;border:1px solid #dbe1ea;border-radius:7px;font-size:12px;color:#1a2230;}
.fm-legend{display:flex;gap:16px;flex-wrap:wrap;padding:10px 22px 0;font-size:11px;color:#5f7690;}
.fm-legend span{display:inline-flex;align-items:center;gap:6px;}

/* the retained coverage-gap note anchor at the very bottom */
.fm-foot{margin:20px 22px 0;font-size:11px;color:#8a8f98;line-height:1.5;}

/* Forward Pipeline tab */
.fm-fwtbl{width:auto;table-layout:auto;}
.fm-fwtbl td.acct{width:250px;max-width:250px;}
.fm-fwtbl th.l{width:250px;}
.fm-fwtbl td.acct.x{cursor:pointer;user-select:none;}
.fm-fwtbl td.acct .caret{display:inline-block;width:12px;color:#8a8f98;font-size:9px;transition:transform .12s;}
.fm-fwtbl td.acct.open .caret{transform:rotate(90deg);}
.fm-fwtbl td.acct .caret.nc{color:transparent;}
.fm-fwtbl th.fwp{text-align:center;border-left:1px solid #e6ecf3;}
.fm-fwtbl th.fwtot{text-align:right;padding-right:14px;}
.fm-fwtbl .qhh{display:flex;margin-top:4px;}
.fm-fwtbl .qhh .qh{flex:1;font-size:8.5px;color:#a2a8b2;font-weight:700;letter-spacing:.03em;}
.fm-fwtbl td.fwc{border-left:1px solid #f1f3f6;vertical-align:middle;padding:5px 4px;min-width:210px;}
.fm-fwtbl td.acct{min-width:150px;}
.fm-fwtbl td.fwtot{text-align:right;padding-right:14px;font-weight:800;color:#0b2e52;min-width:84px;}
.qgrid{display:flex;gap:0;}
.qc{flex:1;display:flex;flex-direction:column;align-items:flex-start;gap:1px;padding:0 6px;border-right:1px dotted #eaeef3;font-size:10.5px;line-height:1.25;}
.qc:last-child{border-right:none;}
.qc.empty{color:#d3d7dd;align-items:center;}
.qc .dot{display:none;}
.cellcp{color:#0b2e52;font-weight:700;}
.cellucp{color:#7a8496;}
.cellnqp{color:#b8860b;}
.qc .lbl{font-style:normal;font-size:8px;font-weight:800;letter-spacing:.03em;opacity:.7;margin-right:2px;}
.lbl{font-style:normal;}
.fw-chip{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;}
.fw-chip.met{background:#e7f5ec;color:#1a7f43;}
.fw-chip.gap{background:#fdf0e6;color:#c26a1b;}
.fwc.met,.fwc.gap{text-align:center;}
/* workload sub-rows */
.fm-fwtbl tr.fwwl{background:#fbfcfe;}
.fm-fwtbl tr.fwwl td{border-bottom:1px solid #f4f6f9;}
.fm-fwtbl tr.fwwl td.wlname{text-align:left;padding-left:34px;font-weight:600;color:#5f7690;font-size:11.5px;}
.fm-fwtbl tr.fwwl td.wlname .wico{display:inline-block;width:14px;color:#c8cdd6;}
.fm-fwtbl tr.fwwl td.fwc{background:#fbfcfe;}
.fm-fwtbl tr.fwwl td.fwtot{color:#5f7690;font-weight:700;}
.fm-fwtbl tr.fwacct.open td{border-bottom-color:#eef1f5;}
/* ---- Scope filter (Sales Unit -> Territory) ---- */
.fm-scope{position:relative;display:inline-block;}
.fm-scopebtn{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;padding:6px 11px;border:1px solid #cdd6e0;background:#fff;color:#6b7684;border-radius:7px;cursor:pointer;}
.fm-scopebtn .pin{width:6px;height:6px;border-radius:50%;background:#b9c4d0;}
.fm-scopebtn .ca{font-size:10px;opacity:.7;}
.fm-scopebtn.on{border-color:#0a6cff;background:#eef5ff;color:#0a6cff;}
.fm-scopebtn.on .pin{background:#0a6cff;}
.fm-scopebtn .cnt{background:#0a6cff;color:#fff;border-radius:10px;font-size:10.5px;padding:1px 7px;font-weight:700;}
.fm-scopepanel{position:absolute;right:0;top:34px;width:440px;background:#fff;border:1px solid #cdd6e0;border-radius:11px;box-shadow:0 12px 34px rgba(16,40,70,.20);z-index:40;overflow:hidden;}
.fm-scopepanel .ph{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid #e3e8ee;background:#fafbfd;}
.fm-scopepanel .ph b{font-size:12.5px;color:#0b2e52;}
.fm-scopepanel .ph .x{font-size:15px;color:#6b7684;cursor:pointer;line-height:1;}
.sc-cascade{display:grid;grid-template-columns:158px 1fr;}
.sc-u{border-right:1px solid #e3e8ee;background:#fafbfd;max-height:280px;overflow:auto;}
.sc-u .u{font-size:12px;padding:9px 13px;color:#1a2733;cursor:pointer;border-left:3px solid transparent;display:flex;justify-content:space-between;align-items:center;}
.sc-u .u small{color:#6b7684;font-size:10.5px;}
.sc-u .u:hover{background:#f1f5fa;}
.sc-u .u.on{background:#eef5ff;border-left-color:#0a6cff;font-weight:700;color:#0b2e52;}
.sc-t{max-height:280px;overflow:auto;padding:4px 4px 8px;}
.sc-t .th{display:flex;justify-content:space-between;align-items:center;padding:8px 12px 5px;position:sticky;top:0;background:#fff;}
.sc-t .th span{font-size:10.5px;color:#6b7684;text-transform:uppercase;letter-spacing:.4px;font-weight:700;}
.sc-t .th .ta a{font-size:11px;color:#0a6cff;cursor:pointer;font-weight:600;}
.sc-t .terr{display:flex;align-items:center;gap:9px;padding:6px 12px;font-size:12px;cursor:pointer;border-radius:6px;}
.sc-t .terr:hover{background:#f1f5fa;}
.sc-t .terr .box{width:15px;height:15px;border:1.5px solid #b9c4d0;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;flex:0 0 auto;}
.sc-t .terr.ck .box{background:#0a6cff;border-color:#0a6cff;}
.sc-t .terr .nm{flex:1;}
.sc-t .terr .mc{color:#6b7684;font-size:10.5px;}
.sc-empty{font-size:11.5px;color:#8a94a2;padding:18px 14px;text-align:center;}
.sc-pf{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-top:1px solid #e3e8ee;background:#fafbfd;}
.sc-pf .clr{font-size:11.5px;color:#6b7684;cursor:pointer;}
.sc-pf .done{background:#0a6cff;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:700;padding:7px 16px;cursor:pointer;}
.fm-scopechips{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:9px 2px 2px;}
.fm-scopechips .lab{font-size:11px;color:#6b7684;font-weight:700;text-transform:uppercase;letter-spacing:.4px;}
.fm-scopechips .sc-chip{display:inline-flex;align-items:center;gap:6px;background:#eef5ff;border:1px solid #cfe0fb;color:#0b2e52;border-radius:14px;font-size:11.5px;padding:3px 9px;font-weight:600;}
.fm-scopechips .sc-chip b{color:#0a6cff;font-weight:800;}
.fm-scopechips .sc-chip.u{background:#0a6cff;color:#fff;}
.fm-scopechips .sc-chip.u b{color:#fff;}
.fm-scopechips .sc-chip .x{color:#7f92a8;cursor:pointer;}
.fm-scopechips .sc-chip.u .x{color:#cfe0fb;}
.fm-scopechips .sc-note{font-size:11px;color:#8a94a2;font-style:italic;}
.fm-scopechips .clrall{font-size:11px;color:#0a6cff;cursor:pointer;font-weight:600;}
`;
