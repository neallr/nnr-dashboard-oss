// NNRMovements styles — premium facelift matching the approved NNRSummary design language.
export const STYLES = `
*{box-sizing:border-box;}
#nnrbody{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;
  color:#1a2230;background:#f4f7fb;padding:14px 16px 26px;
  --navy:#0b2e52;--navy2:#134a82;--blue:#0b6ad4;--sky:#38b6ff;--ink:#1a2230;--mut:#5f7690;
  --mut2:#8a9bb0;--line:#e6ecf3;--up:#0f9d58;--dn:#d64541;--pos:#2b88d8;--neg:#e0736e;
  --shadow:0 1px 3px rgba(13,40,74,.06),0 6px 18px rgba(13,40,74,.06);
  --shadow-lg:0 2px 6px rgba(13,40,74,.08),0 14px 40px rgba(13,40,74,.10);}
.mv-attn{font-family:'Segoe UI',sans-serif;padding:16px 18px;color:#8a5a00;background:#fff4e5;
  border:1px solid #f0c47a;border-radius:12px;margin:12px 0;white-space:pre-wrap;font-size:12.5px;line-height:1.5;}

/* Header hero */
.mv-head{display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px;
  background:linear-gradient(120deg,var(--navy),var(--navy2));border-radius:14px;padding:16px 22px;
  color:#fff;box-shadow:var(--shadow-lg);position:relative;overflow:hidden;}
.mv-head::after{content:"";position:absolute;right:-40px;top:-60px;width:230px;height:230px;
  background:radial-gradient(circle,rgba(56,182,255,.28),transparent 70%);pointer-events:none;}
.mv-title{font-size:22px;font-weight:800;letter-spacing:-.3px;display:flex;align-items:center;gap:11px;z-index:1;}
.mv-title .mv-ic{width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,.14);
  display:grid;place-items:center;font-size:16px;}
.mv-title .mv-sub{display:block;font-size:12px;font-weight:500;color:#bcd6f2;margin-top:4px;letter-spacing:.2px;}
.mv-toggle{display:flex;background:rgba(255,255,255,.13);border-radius:9px;padding:3px;
  font:700 11.5px 'Segoe UI';z-index:1;}
.mv-tg{padding:6px 15px;border-radius:6px;color:#cfe1f6;cursor:pointer;border:none;background:transparent;transition:.15s;}
.mv-tg.on{background:#fff;color:var(--navy);box-shadow:0 1px 5px rgba(0,0,0,.18);}
.mv-tg.dis{opacity:.38;cursor:not-allowed;}

/* KPI cards */
.mv-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px;}
.mv-kpi{background:#fff;border:1px solid var(--line);border-radius:13px;padding:14px 18px;
  box-shadow:var(--shadow);position:relative;overflow:hidden;}
.mv-kpi .mv-acc{position:absolute;left:0;top:0;bottom:0;width:4px;
  background:linear-gradient(180deg,var(--blue),var(--sky));}
.mv-kpi.up .mv-acc{background:linear-gradient(180deg,var(--up),#5fce9b);}
.mv-kpi.dn .mv-acc{background:linear-gradient(180deg,var(--dn),#f0908c);}
.mv-kpi span{display:block;font-size:10.5px;color:var(--mut2);font-weight:800;text-transform:uppercase;letter-spacing:.6px;}
.mv-kpi b{display:block;font-size:27px;font-weight:800;margin-top:4px;letter-spacing:-.6px;color:var(--navy);}
.mv-kpi.up b{color:var(--up);}.mv-kpi.dn b{color:var(--dn);}
.mv-kpi .mv-cap{font-size:11px;color:var(--mut);margin-top:3px;font-weight:600;}
.mv-kpi .mv-spark{position:absolute;right:14px;top:13px;font-size:11px;font-weight:800;padding:3px 9px;border-radius:20px;}
.mv-kpi.up .mv-spark{background:#e7f6ee;color:var(--up);}
.mv-kpi.dn .mv-spark{background:#fbeceb;color:var(--dn);}

/* Panel */
.mv-panel{background:#fff;border:1px solid var(--line);border-radius:14px;margin-top:16px;
  box-shadow:var(--shadow);overflow:hidden;}
.mv-ph{display:flex;align-items:center;justify-content:space-between;padding:13px 20px;
  background:linear-gradient(180deg,#f7fafd,#eef4fa);border-bottom:1px solid var(--line);}
.mv-ph h3{font-size:13px;font-weight:800;color:var(--navy);letter-spacing:.2px;display:flex;align-items:center;gap:9px;margin:0;}
.mv-ph h3 .mv-pd{width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg,var(--blue),var(--sky));}
.mv-ph .mv-hint{font-size:11px;color:var(--mut2);font-weight:600;}

/* Bridge */
.mv-bridge{padding:16px 20px;overflow-x:auto;}
.mv-svg{width:100%;min-width:820px;height:330px;display:block;}
.mv-bar rect{transition:opacity .12s;}
.mv-bar.b-tot rect{fill:url(#gTot);}
.mv-bar.b-up rect{fill:url(#gUp);}
.mv-bar.b-dn rect{fill:url(#gDn);}
.mv-bar[data-cat]{cursor:pointer;}
.mv-bar[data-cat]:hover rect{opacity:.82;}
.mv-bar.active rect{stroke:var(--navy);stroke-width:2.5;}
.mv-bval{font:700 10.5px 'Segoe UI';fill:#33475f;text-anchor:middle;}
.mv-blab{font:600 10px 'Segoe UI';fill:var(--mut);text-anchor:middle;}
.mv-gl{stroke:#eef2f7;stroke-width:1;}

/* Filters — custom dropdowns (stay open until choose / outside-click) */
.mv-filters{display:flex;align-items:flex-end;gap:12px 16px;flex-wrap:wrap;padding:13px 20px;
  background:#fafcfe;border-top:1px solid var(--line);border-bottom:1px solid var(--line);position:relative;z-index:5;}
.mv-fl{display:flex;flex-direction:column;gap:4px;}
.mv-fl>span{font-size:9.5px;font-weight:800;color:var(--mut2);text-transform:uppercase;letter-spacing:.5px;}
.mv-dd{position:relative;}
.mv-dd-btn{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:150px;max-width:220px;
  font:600 12.5px 'Segoe UI';padding:7px 11px;border:1px solid #d3deea;border-radius:8px;background:#fff;
  color:var(--ink);cursor:pointer;box-shadow:0 1px 2px rgba(13,40,74,.04);}
.mv-dd-btn:hover{border-color:#b9cbe0;}
.mv-dd.open .mv-dd-btn{border-color:var(--blue);box-shadow:0 0 0 3px rgba(11,106,212,.12);}
.mv-dd-btn>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mv-caret{color:var(--mut2);font-size:10px;transition:transform .15s;}
.mv-dd.open .mv-caret{transform:rotate(180deg);}
.mv-dd-panel{position:absolute;top:calc(100% + 5px);left:0;z-index:30;min-width:100%;max-width:260px;
  max-height:240px;overflow-y:auto;background:#fff;border:1px solid #d3deea;border-radius:10px;
  box-shadow:var(--shadow-lg);padding:5px;}
.mv-opt{font:500 12.5px 'Segoe UI';color:#2b3648;padding:7px 10px;border-radius:6px;cursor:pointer;
  white-space:nowrap;display:flex;align-items:center;gap:8px;}
.mv-opt:hover{background:#eef6ff;}
.mv-opt.on{background:#e7f1fb;color:var(--blue);font-weight:700;}
.mv-opt-ck .mv-ck{width:15px;height:15px;border:1.5px solid #c2d0e0;border-radius:4px;display:inline-block;flex:0 0 auto;}
.mv-opt-ck.on .mv-ck{background:var(--blue);border-color:var(--blue);position:relative;}
.mv-opt-ck.on .mv-ck::after{content:"";position:absolute;left:4px;top:1px;width:4px;height:8px;
  border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg);}
.mv-active{margin-left:auto;display:flex;align-items:center;gap:10px;}
.mv-clear{font:700 11.5px 'Segoe UI';color:var(--dn);background:#fff;border:1px solid #f0c3c1;
  border-radius:16px;padding:6px 13px;cursor:pointer;box-shadow:0 1px 2px rgba(13,40,74,.04);}
.mv-clear:hover{background:#fbeceb;}
.mv-chip{display:inline-flex;align-items:center;gap:8px;font:700 11.5px 'Segoe UI';color:#fff;
  background:linear-gradient(120deg,var(--navy),var(--navy2));border-radius:16px;padding:6px 13px;
  box-shadow:0 2px 6px rgba(11,46,82,.28);}
.mv-chip b{cursor:pointer;opacity:.8;}

/* Table */
.mv-table{overflow-x:auto;}
.mv-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;}
.mv-tbl thead th{position:sticky;top:0;text-align:left;font:800 11px 'Segoe UI';letter-spacing:.4px;
  text-transform:uppercase;color:#eaf3ff;background:linear-gradient(180deg,var(--navy),var(--navy2));
  padding:12px 12px;white-space:nowrap;border-bottom:2px solid #0a2544;}
.mv-tbl thead th:first-child{padding-left:20px;}
.mv-tbl tbody td{padding:10px 12px;border-bottom:1px solid #eef2f7;vertical-align:top;color:#2b3648;text-align:left;}
.mv-tbl tbody td:first-child{padding-left:20px;}
.mv-tbl tbody tr:nth-child(even){background:#fafcfe;}
.mv-tbl tbody tr:hover{background:#eef6ff;}
.mv-c-cat{white-space:nowrap;}
.mv-tag{display:inline-flex;align-items:center;gap:7px;font-weight:700;white-space:nowrap;}
.mv-dot{width:8px;height:8px;border-radius:3px;display:inline-block;}
.mv-dot.pos{background:var(--pos);}.mv-dot.neg{background:var(--neg);}
.mv-c-amt{text-align:left;font-variant-numeric:tabular-nums;font-weight:800;white-space:nowrap;}
.mv-c-amt.pos{color:var(--up);}.mv-c-amt.neg{color:var(--dn);}
.mv-acct{font-weight:700;color:var(--navy);}
.mv-c-id{font-variant-numeric:tabular-nums;white-space:nowrap;}
.msx-lnk{color:var(--blue);text-decoration:none;cursor:pointer;font-weight:600;}
.msx-lnk:hover{text-decoration:underline;}
.mv-c-move{white-space:nowrap;color:var(--mut);font-size:11.5px;}
.mv-badge{font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;letter-spacing:.3px;white-space:nowrap;}
.mv-badge.committed,.mv-badge.uncommitted{background:#e7f1fb;color:#0b6ad4;}
.mv-badge.on-track{background:#e7f6ee;color:var(--up);}
.mv-badge.at-risk{background:#fdf0e3;color:#d98218;}
.mv-badge.blocked{background:#fbeceb;color:var(--dn);}
.mv-badge.completed{background:#eef2f7;color:#5f7690;}
.mv-cellstack{display:inline-flex;flex-direction:column;align-items:flex-start;gap:3px;}
.mv-was{font-size:9.5px;font-weight:700;color:#8a97a6;background:#f0f3f7;border:1px solid #e2e8f0;
  padding:1px 6px;border-radius:10px;white-space:nowrap;letter-spacing:.2px;}
.mv-tbl tfoot td{font:800 12.5px 'Segoe UI';color:var(--navy);background:#f4f8fc;
  border-top:2px solid var(--line);padding:11px 12px;}
.mv-tbl tfoot td:first-child{padding-left:20px;}
.mv-empty{text-align:center;color:#8a97a6;padding:18px;}
.mv-more{font-size:11px;color:#8a97a6;padding:8px 20px;}
`;
