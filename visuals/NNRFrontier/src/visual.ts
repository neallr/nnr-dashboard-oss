// NNRFrontier — UK&I Frontier MACC view.
// Consumes the `frontier_macc` blob (chunked idx/chunk, reassembled + parsed) built by
// build_data -> frontier_macc.build_frontier_macc: per-account agentic maturity (actuals
// from the monthly Frontier MACC Data Pack via a swappable provider) fused with per-pillar
// forward pipeline (Q current + Q+1) from the live pillar_facts. Two tabs:
//   • Industry (ATU roll-up: maturity-tier mix, >=60% count, per-pillar forward pipeline)
//   • Accounts (per-account pillar dots + maturity + MoM delta + per-pillar forward pipeline)
// MACC universe = all UK&I MACC accounts; pack-scored accounts show maturity, the rest are
// "not yet measured" (forward pipeline only). Client-side tab/filter (no recompute).
"use strict";

import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataView = powerbi.DataView;

import { STYLES } from "./styles";

type Num = number | null;

interface Cell { cp: number; ucp: number; nqp: number; }
interface Fwd { q1: Cell; q2: Cell; q3: Cell; q4: Cell; }
type WlMap = Record<string, Record<string, Cell>>;  // workload -> {q1..q4 -> Cell}
interface MaccExt {
    unified_adopt?: boolean | null; unified_attach?: boolean | null; min_adopt?: boolean | null;
    msx_plan?: boolean | null; draft_plan?: boolean | null; expiry?: string | null;
    rem_days?: number | null; vtt?: number | null; vtt_pct?: number | null;
    over_consuming?: boolean | null; isd?: boolean | null; isd_applicable?: boolean | null;
    tcv_band?: string | null; tcv_rank?: number | null;
    start_date?: string | null; end_date?: string | null; shortfall?: boolean | null;
}
interface Pipe { cp: number; ucp: number; qp: number; q1_cp: number; q1_ucp: number; }
interface Acct {
    tpid: string; name: string; unit: string; atu: string | null; terr?: string | null; acr_tier: string | null;
    scored: boolean; maturity: Num; met_count: Num;
    pillars_met: Record<string, boolean>;
    vals: Record<string, Num>; services: Record<string, boolean>;
    factory_nom?: number;
    maccext?: MaccExt; pipe?: Pipe;
    forward: Record<string, Fwd>; forward_wl?: Record<string, WlMap>; activation: Record<string, string>;
    maturity_prior: Num; maturity_delta: Num; crossed: string | null;
}
interface AtuRow {
    unit: string; n: number; scored: number; ge60: number;
    tiers: Record<string, number>;
}
interface StuRow {
    unit: string; n: number; r12: number | null; ucp: number; cp: number; qp: number; no_cp: number;
}
interface MaccExtSummary {
    with_ext: number; unified_adopt: number; no_msx_plan: number; with_msx_plan: number;
    over_consuming: number; under_consuming: number;
}
interface Totals {
    accounts: number; scored: number; unscored: number; ge60: number; share_ge60: Num;
}
interface Bundle {
    as_of: string; pack_month: string | null; prior_month: string | null; source: string;
    product_pillars: string[]; service_pillars: string[];
    thresholds: Record<string, number>; fabric_forward_placeholder: boolean;
    totals: Totals; atu_rollup: AtuRow[]; accounts: Acct[];
    stu_rollup?: StuRow[]; maccext_summary?: MaccExtSummary;
    pack_unmatched: string[]; ou_prior: any;
    malpen?: MalPen;
}
// MALpen (MACC penetration of MAL) — UK+I enterprise. Nested in the frontier_macc feed by
// build_data (from capture_malpen.py). Optional: absent on older feeds, so the tab self-hides.
interface MalRow { code: string; name: string; mal: number; macc: number; }
interface MalDim { label: string; rows: MalRow[]; }
interface MalAcct { tpid: string; name: string; summseg: string; segment: string; subseg: string; unit: string; atu: string; territory: string; industry: string; subind: string; macc: boolean; }
interface MalPen {
    scope: string; macc_def: string; macc_source?: string;
    totals: { mal: number; macc: number; pen: Num; whitespace: number };
    dim_order?: string[]; dim_labels?: Record<string, string>;
    dims: Record<string, MalDim>;
    accounts?: MalAcct[];
}

const ZERO_CELL: Cell = { cp: 0, ucp: 0, nqp: 0 };
// Defensive quarter-cell accessor: tolerates a missing pillar, missing quarter, or an OLD
// forward shape (feed/visual sync-window mismatch) without throwing.
function qcell(f: any, qk: string): Cell {
    const c = f && f[qk];
    if (!c || typeof c !== "object") return ZERO_CELL;
    return { cp: +c.cp || 0, ucp: +c.ucp || 0, nqp: +c.nqp || 0 };
}
function fwTotal(f: any): number {
    return ["q1", "q2", "q3", "q4"].reduce((s, qk) => {
        const c = qcell(f, qk); return s + c.cp + c.ucp + c.nqp;
    }, 0);
}

const PILLAR_LABEL: Record<string, string> = {
    foundry: "Foundry", ghcp: "GHCP", databases: "Databases", fabric: "Fabric", security: "Security",
};
const UNIT_LABEL: Record<string, string> = {
    EC: "Enterprise Commercial", RCMC: "RCMC", FSI: "Financial Services", PS: "Public Sector",
    SDP: "SDP / Digital", Ireland: "Ireland", CAPMKTS: "Capital Markets", "Digital Natives": "Digital Natives",
};
const TIERS = [0, 20, 40, 60, 80, 100];
// MACC TCV tranche bands (order matches capture_frontier_maccext.tcv_band rank 0..3).
const TCV_BANDS = ["<$10M", "$10M–$40M", "$40M–$100M", ">$100M"];

function esc(s: any): string {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
        (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]));
}
function money(v: number): string {
    if (!v) return "—";
    const a = Math.abs(v), s = v < 0 ? "-" : "";
    if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return s + "$" + Math.round(a / 1e3) + "K";
    return s + "$" + Math.round(a);
}
function pct(v: Num, dp = 0): string {
    return v === null || v === undefined ? "—" : (v * 100).toFixed(dp) + "%";
}
// Format a contract-end date (e.g. "6/30/2030" or "2030-06-30") as "Jun 2030"; "—" if absent.
function fmtMonthYear(s: any): string {
    if (!s) return "—";
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const str = String(s).trim();
    let y = 0, m = 0;
    let mt = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);        // M/D/YYYY
    if (mt) { m = +mt[1]; y = +mt[3]; }
    else { mt = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (mt) { y = +mt[1]; m = +mt[2]; } }  // ISO
    if (!y || m < 1 || m > 12) return esc(str);
    return `${MON[m - 1]} ${y}`;
}
// Inline SVG icon per Frontier criterion (reliable in the embedded browser, unlike emoji).
function critIcon(key: string): string {
    const w = `width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0b2e52" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
    const P: Record<string, string> = {
        // Foundry (AI spark)
        foundry: `<path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 15.6l-1.8-4.4L6 9.4l4.2-1.8z"/><circle cx="18" cy="17" r="1.6"/><circle cx="7" cy="18" r="1.2"/>`,
        // GHCP (keyboard)
        ghcp: `<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M7 11h.01M11 11h.01M15 11h.01M8 14.5h8"/>`,
        // Databases (cylinder)
        databases: `<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6"/><path d="M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6"/>`,
        // Fabric (diamond)
        fabric: `<path d="M12 3l4.5 4.5L12 12 7.5 7.5z"/><path d="M7.5 12L12 16.5 16.5 12"/><path d="M7.5 16.5L12 21l4.5-4.5"/>`,
        // Security (shield)
        security: `<path d="M12 3l7 3v5c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6z"/><path d="M9.5 12l1.8 1.8L15 10"/>`,
        // Unified (link)
        unified: `<path d="M9 15l6-6"/><path d="M11 6.5l1.5-1.5a3.5 3.5 0 015 5L16 11.5"/><path d="M13 17.5L11.5 19a3.5 3.5 0 01-5-5L8 12.5"/>`,
        // Factory (building)
        factory: `<path d="M3 21V10l6 4V10l6 4V6l6 4v11z"/><path d="M3 21h18"/>`,
        // ISD (rocket / delivery)
        isd: `<path d="M12 3c3 1 5 4 5 8l-2.5 2.5h-5L7 11c0-4 2-7 5-8z"/><circle cx="12" cy="9" r="1.4"/><path d="M9.5 15.5L8 20l3-1.5M14.5 15.5L16 20l-3-1.5"/>`,
    };
    return `<span class="fm-ckic"><svg ${w}>${P[key] || `<circle cx="12" cy="12" r="8"/>`}</svg></span>`;
}
function tier(m: Num): number {
    if (m === null || m === undefined) return -1;
    const p = m * 100;
    return TIERS.reduce((b, t) => Math.abs(t - p) < Math.abs(b - p) ? t : b, 0);
}

export class Visual implements IVisual {
    private root: HTMLElement;
    private host!: IVisualHost;
    private events: any = null;
    private errEl!: HTMLElement;
    private bodyEl!: HTMLElement;
    private hasRendered = false;

    private data: Bundle | null = null;
    private state = { tab: "industry" as "industry" | "accounts" | "forward" | "malpen", view: "" as "" | "atu" | "stu" | "csu", unit: "", search: "", scope: "all" as "all" | "scored", fwFilter: "all" as "all" | "opps" | "gaps", fwPillar: "", fwExpanded: [] as string[], csuUnderExp: false, csuOverExp: false, stuDrill: "" as string, atuDrill: "" as string, csuBand: "" as string, stuBand: "" as string, scopeUnit: "", scopeTerr: [] as string[], scopeOpen: false, malDim: "segment", malFilters: {} as Record<string, string>, malMulti: {} as Record<string, string[]>, malOpen: "", malAcct: "all" as "all" | "white" | "macc", malAcctSearch: "" };
    private _persistLast = "";
    private _malScroll = 0;

    constructor(options: VisualConstructorOptions) {
        this.root = options.element;
        try {
            this.host = options.host;
            this.events = (options.host as any) ? (options.host as any).eventService : null;
            this.root.style.cssText = "width:100%;height:100%;overflow:auto;position:relative;";
            this.root.innerHTML =
                '<div id="nnrerr" style="font-family:Consolas,monospace;font-size:11px;color:#fff;background:#c62828;white-space:pre-wrap;padding:0;"></div>' +
                '<div id="nnrbody"></div>';
            this.errEl = this.root.querySelector("#nnrerr") as HTMLElement;
            this.bodyEl = this.root.querySelector("#nnrbody") as HTMLElement;
            const self = this;
            window.addEventListener("error", (ev: any) => {
                self.showErr("WINDOW.ERROR: " + (ev && ev.message ? ev.message : ev) +
                    (ev && ev.error && ev.error.stack ? "\n" + ev.error.stack : ""));
            });
        } catch (e: any) {
            this.root.innerHTML = '<pre style="color:#c00;white-space:pre-wrap;font:11px monospace;padding:10px;">CTOR ERROR: ' +
                (e && e.stack ? e.stack : String(e)) + '</pre>';
        }
    }

    private showErr(msg: string) {
        if (this.errEl) { this.errEl.style.padding = "8px 10px"; this.errEl.textContent = String(msg).slice(0, 2000); }
    }
    private attn(msg: string): string {
        return `<div style="font-family:'Segoe UI',monospace;padding:14px;color:#8a5a00;background:#fff4e5;border:1px solid #f0c47a;border-radius:8px;margin:10px;white-space:pre-wrap;font-size:12px;">${esc(msg)}</div>`;
    }
    // Power BI caps a single text cell at 32,766 chars — the blob is CHUNKED across (idx, chunk)
    // rows. Reassemble in idx order into the full JSON string before parsing.
    private reassemble(t: any): string {
        try {
            const cols: any[] = t.columns || [];
            let iIdx = -1, iChunk = -1;
            cols.forEach((c: any, i: number) => {
                const r = c.roles || {};
                if (r.idx) iIdx = i;
                if (r.chunk) iChunk = i;
            });
            const rows: any[] = t.rows || [];
            if (!rows.length) return "";
            if (iChunk < 0) return rows[0] && rows[0][0] != null ? String(rows[0][0]) : "";
            const pairs = rows.map((row: any[]) => ({
                i: iIdx >= 0 ? Number(row[iIdx]) : 0,
                c: row[iChunk] == null ? "" : String(row[iChunk]),
            }));
            pairs.sort((a, b) => a.i - b.i);
            return pairs.map(p => p.c).join("");
        } catch (e) { return ""; }
    }

    public update(options: VisualUpdateOptions) {
        try { if (this.events && this.events.renderingStarted) this.events.renderingStarted(options); } catch (e) { /* noop */ }
        try {
            const dv: DataView = options.dataViews && options.dataViews[0];
            const t = dv && dv.table;
            const blob = t ? this.reassemble(t) : "";
            if (!blob || blob === "{}") {
                if (!this.hasRendered) this.bodyEl.innerHTML = this.attn("Waiting for data… (no frontier_macc blob)");
                return;
            }
            try { this.data = JSON.parse(blob); } catch (e: any) {
                this.showErr("FRONTIER PARSE ERROR: " + (e && e.message ? e.message : String(e)) + " (len=" + blob.length + ")");
                return;
            }
            if (!this.data || !this.data.accounts || !this.data.accounts.length) {
                if (!this.hasRendered) this.bodyEl.innerHTML = this.attn("No Frontier MACC accounts available.");
                return;
            }
            this.restoreState(dv);
            this.render();
            this.hasRendered = true;
            if (this.errEl) { this.errEl.textContent = ""; this.errEl.style.padding = "0"; }
            try { if (this.events && this.events.renderingFinished) this.events.renderingFinished(options); } catch (e) { /* noop */ }
        } catch (e: any) {
            this.showErr("UPDATE EXCEPTION: " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
            try { if (this.events && this.events.renderingFailed) this.events.renderingFailed(options, String(e && e.message ? e.message : e)); } catch (e2) { /* noop */ }
        }
    }

    // ---- render -----------------------------------------------------------------------------------
    private render() {
        const d = this.data as Bundle;
        const header = this.header(d);
        const hasMal = !!(d.malpen && d.malpen.dims);
        if (this.state.tab === "malpen" && !hasMal) this.state.tab = "industry";
        const tabs = `<div class="fm-tabs" data-tabs="tab">
            <span class="${this.state.tab === "industry" ? "on" : ""}" data-tab="industry">Industry · ATU</span>
            <span class="${this.state.tab === "accounts" ? "on" : ""}" data-tab="accounts">Accounts</span>
            <span class="${this.state.tab === "forward" ? "on" : ""}" data-tab="forward">Forward Pipeline</span>
            ${hasMal ? `<span class="${this.state.tab === "malpen" ? "on" : ""}" data-tab="malpen">MALpen</span>` : ""}
          </div>`;
        // Independent MACC toggle views (ATU / STU / CSU). These OVERLAY the main tabs and do not
        // change them — clicking an active pill (or any main tab) returns to the dashboard.
        const hasExt = !!(d.maccext_summary || d.stu_rollup);
        const vt = this.state.view;
        const vtoggle = hasExt ? `<div class="fm-vtoggle" data-vtoggle="1"
            title="MACC toggle views — independent of the tabs above">
            <span class="vl">MACC views</span>
            <button class="${vt === "atu" ? "on" : ""}" data-view="atu">ATU</button>
            <button class="${vt === "stu" ? "on" : ""}" data-view="stu">STU</button>
            <button class="${vt === "csu" ? "on" : ""}" data-view="csu">CSU</button>
          </div>` : "";
        const isMal = this.state.tab === "malpen" && hasMal;
        const inToggle = vt === "atu" || vt === "stu" || vt === "csu";
        // Scope (Sales Unit -> Territory) applies to the toggle views AND the Accounts / Forward tabs.
        const scopeApplies = inToggle || (!vt && (this.state.tab === "accounts" || this.state.tab === "forward"));
        let body: string;
        let foot: string;
        if (vt === "atu") { body = this.viewATU(d); foot = this.viewFoot("atu"); }
        else if (vt === "stu") { body = this.viewSTU(d); foot = this.viewFoot("stu"); }
        else if (vt === "csu") { body = this.viewCSU(d); foot = this.viewFoot("csu"); }
        else {
            body = isMal ? this.malpen(d)
                : this.state.tab === "industry" ? this.industry(d)
                : this.state.tab === "forward" ? this.forward(d) : this.accounts(d);
            foot = isMal ? "" : this.footer(d);
        }
        const sub = isMal
            ? `MACC penetration of the Managed Account List · <b>${esc((d.malpen as MalPen).scope)}</b>`
            : `Agentic maturity &amp; per-pillar forward pipeline across <b>${d.totals.accounts}</b> UK&amp;I MACC accounts · ${d.source && d.source.indexOf("live") >= 0 ? "actuals <b>live</b> from MSIT Prod models (ACR pillars from MACC Finance)" : "actuals from the <b>" + esc(d.pack_month || "—") + " Close</b> data pack"}`;
        const scopeUI = scopeApplies ? this.scopeButton() : "";
        const scopeChips = scopeApplies ? this.scopeChips() : "";
        this.bodyEl.innerHTML = `<style>${STYLES}</style><div class="fm-root">
            <div class="fm-hd"><div><h1>Frontier MACC — UK&amp;I</h1>
              <div class="sub">${sub}</div></div>
              <div class="fm-hd-r">${tabs}${vtoggle}${scopeUI}</div></div>
            ${scopeChips}${body}${foot}</div>`;
        this.wire();
        this.persistState();
    }

    private viewFoot(kind: string): string {
        const txt = kind === "atu"
            ? "ATU view — agentic maturity tier-mix and per-pillar forward pipeline, side by side, by sales unit (ATU)."
            : kind === "stu"
            ? "STU view — MACC Frontier-pillar pipeline by sales unit. R12 target-pipe column pending source. Committed = FY Frontier-pillar committed; # w/o CP = accounts with no Frontier-pillar committed pipeline."
            : "CSU view — under- vs over-consuming MACC accounts by MACC PBO VTT% (≥100% = over). Committed / Qualified Pipeline are Frontier-pillar only. VTT / expiry / consumption-plan / unified from MACCtoACR (live); ISD from MSXi.";
        return `<div class="fm-foot">${esc(txt)}</div>`;
    }

    private header(d: Bundle): string {
        const t = d.totals;
        const shareTxt = t.share_ge60 === null ? "—" : pct(t.share_ge60);
        return `<div class="fm-hero">
          <div class="fm-hc"><div class="l">Accounts ≥60% maturity</div>
            <div class="v">${t.ge60}<span class="from">/ ${t.scored}</span></div>
            <div class="m">of ${t.scored} scored MACC accounts (3+ of 5 pillars met)</div></div>
          <div class="fm-hc"><div class="l">Share of scored</div>
            <div class="v">${shareTxt}</div>
            <div class="m">clear the Frontier ≥60% bar</div></div>
          <div class="fm-hc"><div class="l">MACC universe</div>
            <div class="v">${t.accounts}</div>
            <div class="m"><b>${t.scored}</b> scored · <b>${t.unscored}</b> not yet measured</div></div>
          <div class="fm-hc"><div class="l">Pack month</div>
            <div class="v" style="font-size:22px;">${esc(d.pack_month || "—")}</div>
            <div class="m">${d.prior_month ? "prior: " + esc(d.prior_month) : "baseline month (per-account Δ from next pack)"}</div></div>
        </div>`;
    }

    // ---- Industry (ATU) tab -----------------------------------------------------------------------
    private industry(d: Bundle): string {
        const rows = d.atu_rollup.filter(u => u.n > 0);
        const pills = d.product_pillars;
        const fwd = this.forwardByUnit(d, false);   // main tab = Q + Q+1
        const atuRows = rows.map(u => {
            const denom = u.scored || 1;
            // stacked tier mix (scored accounts only). The count sits INSIDE its segment (same style
            // as every other tier); overflow is visible so a narrow segment's number still shows on
            // the bar rather than being clipped. Count correlates with width, so large numbers are
            // never in narrow segments.
            const seg = TIERS.map(tt => {
                const c = u.tiers[String(tt)] || 0;
                if (!c) return "";
                const w = (c / denom) * 100;
                return `<i class="fm-t${tt}" style="width:${w.toFixed(1)}%" title="${tt}% tier: ${c} account${c === 1 ? "" : "s"}"><b>${c}</b></i>`;
            }).join("");
            // 60% Frontier line sits after the 0/20/40 (below-bar) tiers.
            const below = ((u.tiers["0"] || 0) + (u.tiers["20"] || 0) + (u.tiers["40"] || 0));
            const divLeft = (below / denom) * 100;
            const label = UNIT_LABEL[u.unit] || u.unit;
            const near = u.tiers["40"] || 0;   // one pillar away from the bar
            // bar: real tier mix when scored, else an explicit "not scored" hatched track.
            const bar = u.scored
                ? `<div class="fm-mix">${seg}<span class="fm-div" style="left:${divLeft.toFixed(1)}%"></span></div>`
                : `<div class="fm-mix"><i class="fm-unsc" style="width:100%">not scored</i></div>`;
            const sub = `${u.n} MACC · ${u.scored} scored${u.n - u.scored ? " · " + (u.n - u.scored) + " unscored" : ""}`;
            const share = u.scored ? Math.round((u.ge60 / u.scored) * 100) : null;
            return `<div class="fm-atu ${this.state.unit === u.unit ? "on" : ""}" data-unit="${esc(u.unit)}">
                <div class="nm">${esc(label)}<small>${sub}</small></div>
                ${bar}
                <div class="fm-ge"><b>${u.ge60}</b><span class="of">/ ${u.scored}</span><small>≥60% Frontier</small></div>
                <div class="fm-share ${share === null ? "flat" : share >= 50 ? "up" : share >= 25 ? "mid" : "dn"}">${share === null ? "—" : share + "%"}</div>
                <div class="fm-near">${near ? "<b>" + near + "</b> near<small>1 pillar away</small>" : "<span class='fm-nz'>—</span>"}</div>
              </div>`;
        }).join("");

        // panel header row + tier legend so the bar reads without guessing.
        const legend = `<div class="fm-tierleg">
            <span class="ll">Maturity tier →</span>
            <span><i class="sw fm-t0"></i>0%</span><span><i class="sw fm-t20"></i>20%</span>
            <span><i class="sw fm-t40"></i>40%</span>
            <span class="brk">┊ ≥60% Frontier bar ┊</span>
            <span><i class="sw fm-t60"></i>60%</span><span><i class="sw fm-t80"></i>80%</span>
            <span><i class="sw fm-t100"></i>100%</span>
            <span class="sep"><i class="sw fm-unsc"></i>not scored (no pack data)</span>
          </div>`;
        const atuHdr = `<div class="fm-atu fm-atuhdr">
            <div class="nm">ATU</div>
            <div class="hh">Maturity-tier mix of scored accounts · dashed line = ≥60% Frontier bar</div>
            <div class="hh2">At Frontier</div><div class="hh2">Share</div>
            <div class="hh2">Within reach</div></div>`;
        const t = d.totals;
        const insight = `<div class="fm-insight"><b>${t.ge60}</b> of <b>${t.scored}</b> scored UK&amp;I MACC accounts (${t.share_ge60 === null ? "—" : pct(t.share_ge60)}) sit at the <b>≥60% Frontier bar</b>. <b>${t.unscored}</b> of ${t.accounts} MACC accounts have no pack score yet.</div>`;

        const fwdHead = pills.map(p => `<th>${esc(PILLAR_LABEL[p])}</th>`).join("");
        const fwdRows = rows.map(u => {
            const f = fwd[u.unit] || {};
            const cells = pills.map(p => {
                const x = f[p] || { cp: 0, ucp: 0 };
                return `<td class="fm-fw"><span class="cp">${money(x.cp)}</span> · <span class="ucp">${money(x.ucp)}</span></td>`;
            }).join("");
            return `<tr><td class="acct">${esc(UNIT_LABEL[u.unit] || u.unit)}</td>${cells}</tr>`;
        }).join("");

        const matSec = `<div class="fm-sec"><div class="fm-sh"><h2>MATURITY BY ATU</h2><span class="n">May tier mix · accounts at the ≥60% Frontier bar</span></div>
                ${insight}${legend}
                <div class="fm-panel">${atuHdr}${atuRows}</div></div>`;
        const fwdSec = `<div class="fm-sec"><div class="fm-sh"><h2>FORWARD PIPELINE TO ACTIVATE · per pillar</h2><span class="n">Q + Q+1 · committed · uncommitted</span></div>
            <div class="fm-panel fm-tblwrap"><table class="fm-tbl"><thead><tr><th class="l">ATU</th>${fwdHead}</tr></thead>
              <tbody>${fwdRows}</tbody></table></div>
            <div class="fm-legend"><span><b style="color:#0b2e52">$ committed</b></span><span><b style="color:#8a8f98">$ uncommitted (QP)</b></span></div>
          </div>`;
        return matSec + fwdSec;
    }

    private forwardByUnit(d: Bundle, fullYear = false): Record<string, Record<string, { cp: number; ucp: number }>> {
        const out: Record<string, Record<string, { cp: number; ucp: number }>> = {};
        const qs = fullYear ? ["q1", "q2", "q3", "q4"] : ["q1", "q2"];
        for (const a of d.accounts) {
            const u = out[a.unit] || (out[a.unit] = {});
            for (const p of d.product_pillars) {
                const o = u[p] || (u[p] = { cp: 0, ucp: 0 });
                for (const qk of qs) {
                    const c = qcell(a.forward[p], qk);
                    o.cp += c.cp; o.ucp += c.ucp;
                }
            }
        }
        return out;
    }

    // Full-year QUALIFIED (CP+UCP) Frontier-pillar pipeline for one account+pillar.
    private acctPillarQP(a: Acct, pillar: string): number {
        let v = 0;
        for (const qk of ["q1", "q2", "q3", "q4"]) {
            const c = qcell(a.forward[pillar], qk);
            v += c.cp + c.ucp;
        }
        return v;
    }
    private acctPillarNQP(a: Acct, pillar: string): number {
        let v = 0;
        for (const qk of ["q1", "q2", "q3", "q4"]) {
            v += qcell(a.forward[pillar], qk).nqp;
        }
        return v;
    }

    // ---- ATU / STU / CSU independent toggle views -------------------------------------------------
    // ATU: per-pillar-by-sales-unit COUNT of MACC accounts with NO qualified (CP+UCP) Frontier
    // pipeline for that pillar (full year). Click a count to list those accounts below.
    private viewATU(d: Bundle): string {
        const pills = d.product_pillars;
        const su = this.state.scopeUnit;
        const units = (su ? [su] : Array.from(new Set(d.accounts.map(a => a.unit))))
            .sort((x, y) => (UNIT_LABEL[x] || x).localeCompare(UNIT_LABEL[y] || y));
        // count[unit][pillar] = # accounts with QP<=0 for that pillar
        const count: Record<string, Record<string, number>> = {};
        const uTot: Record<string, number> = {};
        for (const u of units) { count[u] = {}; uTot[u] = 0; pills.forEach(p => count[u][p] = 0); }
        for (const a of d.accounts) {
            if (!this.scopePass(a) || !count[a.unit]) continue;
            uTot[a.unit] = (uTot[a.unit] || 0) + 1;
            for (const p of pills) if (this.acctPillarQP(a, p) <= 0) count[a.unit][p]++;
        }
        const scopedTotal = units.reduce((s, u) => s + (uTot[u] || 0), 0);
        const cell = (unit: string, p: string, n: number) => {
            if (!n) return `<td class="num">0</td>`;
            const open = this.state.atuDrill === unit + "|" + p;
            return `<td class="num warn atu-nq ${open ? "on" : ""}" data-atunq="${esc(unit)}|${esc(p)}"
                title="List the ${n} MACC account${n === 1 ? "" : "s"} in ${esc(UNIT_LABEL[unit] || unit)} with no qualified ${esc(PILLAR_LABEL[p])} pipeline">${n} ▸</td>`;
        };
        const body = units.map(u => `<tr>
            <td class="acct">${esc(UNIT_LABEL[u] || u)}<small>${uTot[u]} MACC</small></td>
            ${pills.map(p => cell(u, p, count[u][p])).join("")}
          </tr>`).join("");
        const gTot: Record<string, number> = {};
        pills.forEach(p => gTot[p] = units.reduce((s, u) => s + count[u][p], 0));
        const grand = `<tr class="fm-gt">
            <td class="acct">Grand Total<small>${scopedTotal} MACC</small></td>
            ${pills.map(p => {
                const n = gTot[p]; const open = this.state.atuDrill === "__all|" + p;
                return n ? `<td class="num warn atu-nq ${open ? "on" : ""}" data-atunq="__all|${esc(p)}">${n} ▸</td>` : `<td class="num">0</td>`;
            }).join("")}
          </tr>`;
        const head = pills.map(p => `<th>${esc(PILLAR_LABEL[p])}</th>`).join("");
        return `<div class="fm-sec"><div class="fm-sh"><h2>ACCOUNTS WITHOUT QUALIFIED FRONTIER PIPELINE · per pillar</h2>
            <span class="n">${scopedTotal} MACC accounts · count with no full-year qualified (committed + uncommitted) pipeline for each Frontier pillar</span></div>
          <div class="fm-panel fm-tblwrap"><table class="fm-tbl fm-atunq"><thead><tr>
            <th class="l">Sales Unit</th>${head}
          </tr></thead><tbody>${body}${grand}</tbody></table></div>
          <div class="fm-legend"><span>Qualified pipeline = committed + uncommitted (full year)</span>
            <span class="fm-hint">▸ click a count to list those accounts</span></div>
          ${this.atuDrillTable(d)}
        </div>`;
    }

    // Drill-down for the ATU no-qualified-pipeline table: accounts in the clicked unit (or all) with
    // no qualified pipeline for the clicked pillar. Account-level detail for quick follow-up.
    private atuDrillTable(d: Bundle): string {
        const sel = this.state.atuDrill;
        if (!sel) return "";
        const [unit, pillar] = sel.split("|");
        const all = unit === "__all";
        const uLabel = all ? "all sales units" : (UNIT_LABEL[unit] || unit);
        const pLabel = PILLAR_LABEL[pillar] || pillar;
        const accts = d.accounts
            .filter(a => (all || a.unit === unit) && this.scopePass(a) && this.acctPillarQP(a, pillar) <= 0)
            .sort((a, b) => (this.acctPillarNQP(b, pillar) - this.acctPillarNQP(a, pillar)) || String(a.name).localeCompare(String(b.name)));
        const yn = (v: boolean | null | undefined) => v === true ? "Yes" : v === false ? "No" : "—";
        const ynCls = (v: boolean | null | undefined) => v === true ? "yes" : v === false ? "no" : "";
        const cvpill = (m?: MaccExt) => (m && m.tcv_band)
            ? `<span class="tcv-band tcv-b${m.tcv_rank == null ? 0 : m.tcv_rank}">${esc(m.tcv_band)}</span>` : `<span class="fm-na">—</span>`;
        const rows = accts.map(a => {
            const m = a.maccext || ({} as MaccExt);
            const nqp = this.acctPillarNQP(a, pillar);
            const mat = a.maturity == null ? "—" : Math.round(a.maturity * 100) + "%";
            return `<tr>
                <td class="acct">${esc(a.name)}</td>
                <td class="l dim">${esc(a.tpid)}</td>
                ${all ? `<td class="l dim">${esc(UNIT_LABEL[a.unit] || a.unit)}</td>` : ""}
                <td class="l dim">${esc(a.atu || "—")}</td>
                <td class="ctr">${cvpill(m)}</td>
                <td class="num">${nqp > 0 ? "<span class=\"nqp\">" + money(nqp) + "</span>" : "<span class=\"fm-na\">—</span>"}</td>
                <td class="ctr">${mat}</td>
                <td class="ctr yn ${ynCls(m.unified_adopt)}">${yn(m.unified_adopt)}</td>
                <td class="ctr yn ${ynCls(m.isd)}">${yn(m.isd)}</td>
              </tr>`;
        }).join("");
        return `<div class="fm-sec stu-drill"><div class="fm-sh">
            <h2>NO QUALIFIED ${esc(String(pLabel).toUpperCase())} PIPELINE — ${esc(String(uLabel).toUpperCase())}</h2>
            <span class="n">${accts.length} MACC account${accts.length === 1 ? "" : "s"} · sorted by non-qualified ${esc(pLabel)} pipeline
              <button class="stu-close" data-atuclose="1">✕ close</button></span></div>
          <div class="fm-panel fm-tblwrap"><table class="fm-tbl"><thead><tr>
            <th class="l">MACC Account</th><th class="l">TPID</th>${all ? `<th class="l">Sales Unit</th>` : ""}<th class="l">ATU</th>
            <th>MACC TCV</th><th>Non-Qual ${esc(pLabel)} Pipe</th><th>Maturity</th>
            <th>Unified Adoption</th><th>ISD Engaged</th>
          </tr></thead><tbody>${rows || `<tr><td colspan="9" class="fm-empty">None</td></tr>`}</tbody></table></div>
        </div>`;
    }

    // ---- Scope filter (Sales Unit → multi-select Territory) --------------------------------------
    // Single-unit select drives a multi-select territory checklist. Applies to the ATU/STU/CSU
    // toggle views only. Client-side; a compact popover + chip strip keeps the header uncluttered.
    private scopePass(a: Acct): boolean {
        if (!this.state.scopeUnit) return true;
        if (a.unit !== this.state.scopeUnit) return false;
        if (this.state.scopeTerr.length && this.state.scopeTerr.indexOf(a.terr || "") < 0) return false;
        return true;
    }
    // Strip the region.unit prefix from a raw territory path for a compact, readable label.
    private terrLabel(terr: string | null | undefined): string {
        const s = String(terr || "");
        const parts = s.split(".");
        return parts.length > 2 ? parts.slice(2).join(".") : s;
    }
    private scopeButton(): string {
        const u = this.state.scopeUnit;
        const nT = this.state.scopeTerr.length;
        const lab = !u ? "Scope: All" : `Scope: ${esc(u)}`;
        const badge = u && nT ? `<span class="cnt">${nT}</span>` : "";
        return `<div class="fm-scope"><button class="fm-scopebtn ${u ? "on" : ""}" data-scopetoggle="1"
              title="Filter the view to a Sales Unit and its territories"><span class="pin"></span>${lab} ${badge}<span class="ca">▾</span></button>${this.state.scopeOpen ? this.scopePanel() : ""}</div>`;
    }
    // Territories for a unit — ONLY those that contain a MACC account (managers scope to where they
    // actually have MACCs). Each carries its MACC count. Sorted alphanumerically (numeric-aware).
    private scopeTerrList(d: Bundle, unit: string): { terr: string; label: string; macc: number }[] {
        const macc: Record<string, number> = {};
        for (const a of d.accounts) if (a.unit === unit && a.terr) macc[a.terr] = (macc[a.terr] || 0) + 1;
        return Object.keys(macc)
            .map(t => ({ terr: t, label: this.terrLabel(t), macc: macc[t] }))
            .sort((x, y) => x.label.localeCompare(y.label, undefined, { numeric: true, sensitivity: "base" }));
    }
    private scopePanel(): string {
        const d = this.data as Bundle;
        const unitMap: Record<string, number> = {};
        for (const a of d.accounts) unitMap[a.unit] = (unitMap[a.unit] || 0) + 1;
        const units = Object.keys(unitMap).sort((x, y) => (UNIT_LABEL[x] || x).localeCompare(UNIT_LABEL[y] || y));
        const selU = this.state.scopeUnit;
        const uCol = units.map(u => `<div class="u ${selU === u ? "on" : ""}" data-scopeunit="${esc(u)}">${esc(UNIT_LABEL[u] || u)}<small>${unitMap[u]}</small></div>`).join("");
        let tCol = `<div class="sc-empty">Select a Sales Unit to choose its territories</div>`;
        if (selU) {
            const terrs = this.scopeTerrList(d, selU);
            const sel = this.state.scopeTerr;
            const rows = terrs.map(t => {
                const ck = sel.indexOf(t.terr) >= 0;
                return `<div class="terr ${ck ? "ck" : ""}" data-scopeterr="${esc(t.terr)}"><span class="box">${ck ? "✓" : ""}</span><span class="nm">${esc(t.label)}</span><span class="mc">${t.macc} MACC</span></div>`;
            }).join("") || `<div class="sc-empty">No territories for this unit</div>`;
            tCol = `<div class="th"><span>Territories in ${esc(UNIT_LABEL[selU] || selU)} · ${terrs.length}</span><span class="ta"><a data-scopeall="1">Select all</a> · <a data-scopeclr="1">Clear</a></span></div>${rows}`;
        }
        return `<div class="fm-scopepanel">
          <div class="ph"><b>Filter scope — Sales Unit → Territory</b><span class="x" data-scopeclose="1">✕</span></div>
          <div class="sc-cascade"><div class="sc-u">${uCol}</div><div class="sc-t">${tCol}</div></div>
          <div class="sc-pf"><span class="clr" data-scopereset="1">Clear all</span><button class="done" data-scopeclose="1">Done</button></div>
        </div>`;
    }
    private scopeChips(): string {
        const u = this.state.scopeUnit;
        if (!u) return "";
        const sel = this.state.scopeTerr;
        const uChip = `<span class="lab">Scope</span><span class="sc-chip u"><b>${esc(UNIT_LABEL[u] || u)}</b> <span class="x" data-scopeclearu="1">✕</span></span>`;
        const tChips = sel.map(t => `<span class="sc-chip"><b>${esc(u)}</b> · ${esc(this.terrLabel(t))} <span class="x" data-scopeclearterr="${esc(t)}">✕</span></span>`).join("");
        const note = sel.length ? "" : `<span class="sc-note">all territories</span>`;
        return `<div class="fm-scopechips">${uChip}${tChips}${note}<span class="clrall" data-scopereset="1">Clear all ✕</span></div>`;
    }

    // Shared MACC TCV tranche filter bar (All + the 4 bands). `which` = data-attr key (stu|csu),
    // `sel` = currently selected band ("" = all). Counts are shown next to each band.
    private tcvFilterBar(d: Bundle, which: string, sel: string): string {
        const counts: Record<string, number> = {};
        for (const a of d.accounts) {
            const b = a.maccext && a.maccext.tcv_band;
            if (b) counts[b] = (counts[b] || 0) + 1;
        }
        const total = Object.values(counts).reduce((s, n) => s + n, 0);
        const pill = (val: string, label: string, n: number) =>
            `<button class="tcvf ${sel === val ? "on" : ""}" data-tcvband="${which}" data-band="${esc(val)}">${esc(label)}<span class="c">${n}</span></button>`;
        const bands = TCV_BANDS.map((b, i) => pill(b, b, counts[b] || 0)).join("");
        return `<div class="fm-bandbar" data-bandbar="${which}">
            <span class="bl">MACC TCV</span>${pill("", "All", total)}${bands}</div>`;
    }

    // Does an account pass the active TCV band filter? ("" = all pass; accounts w/o a band are
    // excluded only when a specific band is selected.)
    private bandPass(a: Acct, sel: string): boolean {
        if (!sel) return true;
        return !!(a.maccext && a.maccext.tcv_band === sel);
    }

    // STU: MACC pipeline table by sales unit. Rollup computed CLIENT-SIDE from accounts so the MACC
    // TCV tranche filter can scope it. Total MACCs | R12 (blank) | Uncommitted | Committed | # w/o CP.
    private viewSTU(d: Bundle): string {
        const band = this.state.stuBand;
        const acctsF = d.accounts.filter(a => this.bandPass(a, band) && this.scopePass(a));
        // client-side rollup by unit (respects the band filter)
        const um: Record<string, { unit: string; n: number; ucp: number; cp: number; qp: number; no_cp: number }> = {};
        for (const a of acctsF) {
            const u = a.unit || "(unmapped)";
            const r = um[u] || (um[u] = { unit: u, n: 0, ucp: 0, cp: 0, qp: 0, no_cp: 0 });
            const p = a.pipe || ({} as Pipe);
            r.n += 1; r.ucp += p.ucp || 0; r.cp += p.cp || 0; r.qp += p.qp || 0;
            if ((p.cp || 0) <= 0) r.no_cp += 1;
        }
        const rows = Object.values(um).sort((a, b) => (b.n - a.n) || a.unit.localeCompare(b.unit));
        if (!rows.length && !d.accounts.length) return this.attn("No STU data in this feed (refresh the model).");
        const gt = rows.reduce((g, r) => {
            g.n += r.n; g.ucp += r.ucp; g.cp += r.cp; g.qp += r.qp; g.no_cp += r.no_cp; return g;
        }, { n: 0, ucp: 0, cp: 0, qp: 0, no_cp: 0 });
        const body = rows.map(r => `<tr>
            <td class="acct">${esc(UNIT_LABEL[r.unit] || r.unit)}</td>
            <td class="num">${r.n}</td>
            <td class="num fm-na">—</td>
            <td class="num"><span class="ucp">${money(r.ucp)}</span></td>
            <td class="num">${money(r.cp)}</td>
            ${this.stuNoCpCell(r.no_cp, r.unit, this.state.stuDrill === r.unit)}
          </tr>`).join("");
        const grand = `<tr class="fm-gt">
            <td class="acct">Grand Total</td>
            <td class="num">${gt.n}</td>
            <td class="num fm-na">—</td>
            <td class="num"><span class="ucp">${money(gt.ucp)}</span></td>
            <td class="num">${money(gt.cp)}</td>
            ${this.stuNoCpCell(gt.no_cp, "__all", this.state.stuDrill === "__all")}
          </tr>`;
        const bandNote = band ? ` · <b>MACC TCV ${esc(band)}</b>` : "";
        return `<div class="fm-sec"><div class="fm-sh"><h2>MACC PIPELINE BY SALES UNIT</h2>
            <span class="n">${gt.n} MACC accounts · full-year Frontier-pillar committed &amp; uncommitted pipeline${bandNote}</span></div>
          ${this.tcvFilterBar(d, "stu", band)}
          <div class="fm-panel fm-tblwrap"><table class="fm-tbl fm-stu"><thead><tr>
            <th class="l">Sales Unit</th><th>Total MACCs</th><th># w/ Target R12 Pipe</th>
            <th>MACC Uncommitted Pipeline</th><th>MACC Committed Pipeline</th><th># MACCs w/o Committed Pipeline</th>
          </tr></thead><tbody>${body}${grand}</tbody></table></div>
          <div class="fm-legend"><span><b style="color:#8a8f98">$ uncommitted</b></span>
            <span><b style="color:#0b2e52">$ committed</b></span>
            <span>Frontier-pillar pipeline only (Foundry / GHCP / Databases / Fabric / Security)</span>
            <span>Target R12 pipe — pending source (blank for now)</span>
            <span class="fm-hint">▸ click a <b>“# MACCs w/o Committed Pipeline”</b> count to list those accounts</span></div>
          ${this.stuDrillTable(d)}
        </div>`;
    }

    // Clickable "# MACCs w/o Committed Pipeline" cell — opens the account list below (or closes it).
    private stuNoCpCell(n: number, unit: string, open: boolean): string {
        if (!n) return `<td class="num">0</td>`;
        return `<td class="num warn stu-nocp ${open ? "on" : ""}" data-stunocp="${esc(unit)}"
            title="Click to list the ${n} MACC account${n === 1 ? "" : "s"} with no Frontier-pillar committed pipeline">${n} ▸</td>`;
    }

    // Drill-down: MACC accounts with no Frontier-pillar committed pipeline in the clicked unit
    // (or all units for the Grand Total row), with the details useful for a coverage conversation.
    private stuDrillTable(d: Bundle): string {
        const sel = this.state.stuDrill;
        if (!sel) return "";
        const all = sel === "__all";
        const band = this.state.stuBand;
        const label = all ? "all sales units" : (UNIT_LABEL[sel] || sel);
        const accts = d.accounts
            .filter(a => (all || a.unit === sel) && this.bandPass(a, band) && this.scopePass(a) && ((a.pipe && a.pipe.cp) || 0) <= 0)
            .sort((a, b) => (((b.pipe && b.pipe.ucp) || 0) - ((a.pipe && a.pipe.ucp) || 0)));
        const yn = (v: boolean | null | undefined) => v === true ? "Yes" : v === false ? "No" : "—";
        const ynCls = (v: boolean | null | undefined) => v === true ? "yes" : v === false ? "no" : "";
        const vtt = (m?: MaccExt) => {
            if (!m || m.vtt_pct == null) return "—";
            const p = m.vtt_pct * 100;
            return (p > 0 ? "+" : "") + p.toFixed(0) + "%";
        };
        const cvpill = (m?: MaccExt) => (m && m.tcv_band)
            ? `<span class="tcv-band tcv-b${m.tcv_rank == null ? 0 : m.tcv_rank}">${esc(m.tcv_band)}</span>` : `<span class="fm-na">—</span>`;
        const rows = accts.map(a => {
            const m = a.maccext || ({} as MaccExt); const p = a.pipe || ({} as Pipe);
            const mat = a.maturity == null ? "—" : Math.round(a.maturity * 100) + "%";
            return `<tr>
                <td class="acct">${esc(a.name)}</td>
                ${all ? `<td class="l dim">${esc(UNIT_LABEL[a.unit] || a.unit)}</td>` : ""}
                <td class="l dim">${esc(a.atu || "—")}</td>
                <td class="num"><span class="ucp">${money(p.ucp || 0)}</span></td>
                <td class="num">${vtt(m)}</td>
                <td class="ctr">${cvpill(m)}</td>
                <td class="ctr">${mat}</td>
                <td class="ctr yn ${ynCls(m.unified_adopt)}">${yn(m.unified_adopt)}</td>
                <td class="ctr yn ${ynCls(m.isd)}">${yn(m.isd)}</td>
                <td class="ctr dim">${esc(m.expiry || "—")}</td>
              </tr>`;
        }).join("");
        const bandNote = band ? ` · MACC TCV ${esc(band)}` : "";
        return `<div class="fm-sec stu-drill"><div class="fm-sh">
            <h2>MACC ACCOUNTS WITH NO FRONTIER-PILLAR COMMITTED PIPELINE — ${esc(label.toString().toUpperCase())}</h2>
            <span class="n">${accts.length} account${accts.length === 1 ? "" : "s"} · sorted by uncommitted pipeline${esc(bandNote)}
              <button class="stu-close" data-stuclose="1">✕ close</button></span></div>
          <div class="fm-panel fm-tblwrap"><table class="fm-tbl"><thead><tr>
            <th class="l">MACC Account</th>${all ? `<th class="l">Sales Unit</th>` : ""}<th class="l">ATU</th>
            <th>Uncommitted Pipeline</th><th>VTT</th><th>MACC TCV</th><th>Maturity</th>
            <th>Unified Adoption</th><th>ISD Engaged</th><th>MACC Expiry</th>
          </tr></thead><tbody>${rows || `<tr><td colspan="10" class="fm-empty">None</td></tr>`}</tbody></table></div>
        </div>`;
    }

    // CSU: under- vs over-consuming MACC accounts, split by MACC PBO VTT% (≥100% over, <100% under).
    private viewCSU(d: Bundle): string {
        const yn = (v: boolean | null | undefined) => v === true ? "Yes" : v === false ? "No" : "—";
        const ynCls = (v: boolean | null | undefined) => v === true ? "yes" : v === false ? "no" : "";
        const vttTxt = (m: MaccExt) => {
            if (m.vtt_pct === null || m.vtt_pct === undefined) return "—";
            const p = m.vtt_pct * 100;
            return (p > 0 ? "+" : "") + p.toFixed(0) + "%";
        };
        const band = this.state.csuBand;
        const withExt = d.accounts.filter(a => a.maccext && a.maccext.vtt_pct !== null && a.maccext.vtt_pct !== undefined && this.bandPass(a, band) && this.scopePass(a));
        const under = withExt.filter(a => (a.maccext as MaccExt).over_consuming === false)
            .sort((a, b) => ((a.maccext as MaccExt).vtt_pct as number) - ((b.maccext as MaccExt).vtt_pct as number));
        const over = withExt.filter(a => (a.maccext as MaccExt).over_consuming === true)
            .sort((a, b) => ((b.maccext as MaccExt).vtt_pct as number) - ((a.maccext as MaccExt).vtt_pct as number));

        const cv = (m: MaccExt) => {
            if (!m.tcv_band) return `<span class="fm-na">—</span>`;
            const r = m.tcv_rank == null ? 0 : m.tcv_rank;
            return `<span class="tcv-band tcv-b${r}">${esc(m.tcv_band)}</span>`;
        };
        const sfBadge = (m: MaccExt) => {
            if (m.shortfall === true) return `<span class="sf-badge sf-yes">Yes</span>`;
            if (m.shortfall === false) return `<span class="sf-badge sf-no">No</span>`;
            return `<span class="fm-na">—</span>`;
        };
        const underRows = under.map(a => {
            const m = a.maccext as MaccExt; const p = a.pipe || ({} as Pipe);
            return `<tr>
                <td class="acct">${esc(a.name)}</td>
                <td class="l dim">${esc(a.atu || "—")}</td>
                <td class="num warn">${vttTxt(m)}</td>
                <td class="ctr">${cv(m)}</td>
                <td class="num">${money(p.cp || 0)}</td>
                <td class="num">${money(p.qp || 0)}</td>
                <td class="ctr">${sfBadge(m)}</td>
                <td class="ctr dim">${esc(m.start_date || "—")}</td>
                <td class="ctr dim">${esc(m.end_date || m.expiry || "—")}</td>
                <td class="ctr yn ${ynCls(m.unified_adopt)}">${yn(m.unified_adopt)}</td>
                <td class="ctr yn ${ynCls(m.isd)}">${yn(m.isd)}</td>
              </tr>`;
        });
        const overRows = over.map(a => {
            const m = a.maccext as MaccExt; const p = a.pipe || ({} as Pipe);
            return `<tr>
                <td class="acct">${esc(a.name)}</td>
                <td class="l dim">${esc(a.atu || "—")}</td>
                <td class="num pos">${vttTxt(m)}</td>
                <td class="ctr">${cv(m)}</td>
                <td class="num">${money(p.cp || 0)}</td>
                <td class="num">${money(p.qp || 0)}</td>
                <td class="ctr dim">${esc(m.expiry || "—")}</td>
                <td class="ctr fm-na">—</td>
              </tr>`;
        });

        // Collapse to the first 10 rows by default (expandable). When expanded, the body scrolls
        // under the sticky header so any row is reachable.
        const CAP = 10;
        const tbl = (title: string, sub: string, head: string, rowsArr: string[], key: string, expanded: boolean) => {
            const ncol = (head.match(/<th/g) || []).length || 8;
            const many = rowsArr.length > CAP;
            const shown = (many && !expanded) ? rowsArr.slice(0, CAP) : rowsArr;
            const body = shown.length ? shown.join("") : `<tr><td colspan="${ncol}" class="fm-empty">None</td></tr>`;
            const more = many
                ? `<div class="fm-morebar" data-csumore="${key}">${expanded ? "▲ Show first " + CAP : "▼ Show all " + rowsArr.length + " (" + (rowsArr.length - CAP) + " more)"}</div>`
                : "";
            return `<div class="fm-sec"><div class="fm-sh"><h2>${title}</h2><span class="n">${sub}</span></div>
              <div class="fm-panel fm-tblwrap fm-csu-scroll"><table class="fm-tbl fm-csu"><thead><tr>${head}</tr></thead>
                <tbody>${body}</tbody></table></div>${more}</div>`;
        };
        const underHead = `<th class="l">MACC Account</th><th class="l">ATU</th><th>VTT</th>
            <th>MACC TCV</th><th>Committed Pipeline</th><th>Qualified Pipeline</th><th>Shortfall Risk</th><th>Contract Start</th><th>Contract End</th><th>Unified Min Adoption</th><th>ISD Engaged</th>`;
        const overHead = `<th class="l">MACC Account</th><th class="l">ATU</th><th>VTT</th>
            <th>MACC TCV</th><th>Committed Pipeline</th><th>Qualified Pipeline</th><th>Expiry Date</th><th>New Billed Opportunity?</th>`;
        return this.tcvFilterBar(d, "csu", band)
            + tbl("UNDER-CONSUMING", under.length + " accounts · MACC PBO VTT below 100%", underHead, underRows, "under", this.state.csuUnderExp)
            + tbl("OVER-CONSUMING", over.length + " accounts · MACC PBO VTT at/above 100%", overHead, overRows, "over", this.state.csuOverExp);
    }

    // ---- Accounts tab -----------------------------------------------------------------------------
    private accounts(d: Bundle): string {
        const scopeSeg = `<div class="fm-seg" data-seg="scope">
            <button class="${this.state.scope === "all" ? "on" : ""}" data-scope="all">All MACC</button>
            <button class="${this.state.scope === "scored" ? "on" : ""}" data-scope="scored">Scored only</button>
          </div>`;
        const ctl = `<div class="fm-ctl">${scopeSeg}
            <input class="fm-search" id="fmSearch" placeholder="Search account…" value="${esc(this.state.search)}"/></div>`;

        const q = this.state.search.trim().toLowerCase();
        let rows = d.accounts.slice();
        rows = rows.filter(a => this.scopePass(a));
        if (this.state.scope === "scored") rows = rows.filter(a => a.scored);
        if (q) rows = rows.filter(a => (a.name || "").toLowerCase().indexOf(q) >= 0);
        // scored first, then by maturity desc, then name.
        rows.sort((a, b) =>
            (Number(b.scored) - Number(a.scored)) ||
            ((b.maturity || 0) - (a.maturity || 0)) ||
            (a.name || "").localeCompare(b.name || ""));

        // FY27 Frontier checklist per the "Frontier MACC" slide: the 5 PRODUCT pillars
        // (Foundry, GHCP, Databases, Fabric, Security) + the 3 SERVICES from the FY27 MACC
        // quality framework (Unified, Factory, ISD) = 8 criteria. Nothing else.
        const pills = d.product_pillars;
        const thr = d.thresholds || {};
        const criteria = [...pills, "unified", "factory", "isd"];
        const CRIT_LABEL: Record<string, string> = {
            ...PILLAR_LABEL, unified: "Unified", factory: "Factory", isd: "ISD",
        };
        const CRIT_SUB: Record<string, string> = {
            foundry: "3+ Pillars", ghcp: "≥100 seats · ≥50% att",
            databases: `ACR mix ≥${Math.round((thr.databases ?? 0.2) * 100)}%`,
            fabric: "F SKU ≥$100k/mo",
            security: `ACR mix ≥${Math.round((thr.security ?? 0.1) * 100)}%`,
            unified: "Base + ES ≥1% ACV", factory: "Active nomination", isd: "MACC TCV ≥$30m",
        };
        const critHead = criteria.map(p =>
            `<th class="fm-ck"><div class="fm-ckh">${critIcon(p)}` +
            `<b>${esc(CRIT_LABEL[p] || p)}</b><small>${esc(CRIT_SUB[p] || "")}</small></div></th>`).join("");
        const body = rows.map(a => this.acctRow(a, criteria)).join("");
        const legend = `<div class="fm-legend">
            <span><i class="fm-ck-sw met"></i> met (actuals clear threshold)</span>
            <span><i class="fm-ck-sw cp"></i> not met · committed pipeline could activate</span>
            <span><i class="fm-ck-sw ucp"></i> not met · uncommitted (QP) only</span>
            <span><i class="fm-ck-sw gap"></i> not met · no pipeline</span>
            <span><i class="fm-ck-sw pend"></i> pending live source</span>
            <span class="sep">MACC Value = confidential TCV band · Contract End from MACCtoACR</span>
          </div>`;
        return `${ctl}<div class="fm-sec" style="margin-top:6px;"><div class="fm-panel fm-tblwrap">
            <table class="fm-tbl fm-ckt"><thead><tr>
              <th class="l fm-pin">Account</th><th>TPID</th><th>MACC Value</th><th>Contract End</th><th class="fm-score">Frontier Score</th>${critHead}<th>Δ MoM</th>
            </tr></thead><tbody>${body || `<tr><td colspan="${criteria.length + 6}" class="fm-na" style="padding:18px;">No accounts match.</td></tr>`}</tbody></table>
          </div>${legend}</div>`;
    }

    // Y/N badge (✓ / –) or "—" when the metric is absent (no pack data for this account).
    private ynCell(v: any, first = false): string {
        const cls = first ? " fm-svc0" : "";
        if (v === true) return `<td class="${cls}"><span class="fm-yy">✓</span></td>`;
        if (v === false) return `<td class="${cls}"><span class="fm-nn">–</span></td>`;
        return `<td class="fm-na${cls}">—</td>`;
    }
    // Percent cell (0..1 -> N%), or "—" when absent.
    private pcCell(v: Num): string {
        return (v === null || v === undefined) ? `<td class="fm-na">—</td>` : `<td class="fm-svcpct">${pct(v)}</td>`;
    }

    // Checklist cell (mockup style): a small rounded "checkbox" BADGE inside a mostly-white cell —
    // NOT a full-cell colour fill. ✓ green (met) / ⚠ amber (pipeline could activate) / ✗ red (gap) /
    // — grey (n/a or pending). Product pillars use pillars_met + activation; services below.
    // The 5 PRODUCT pillars are click-to-drill into the Forward Pipeline tab (data-ckdrill), matching
    // the old behaviour — services (unified/factory/isd) are not pipeline-backed, so they don't drill.
    private ckCell(a: Acct, key: string): string {
        const box = (cls: string, glyph: string, tip: string, drill = "") =>
            `<td class="fm-ck${drill ? " fm-ckdrill" : ""}"${drill ? ` data-ckdrill="${drill}" data-ckacct="${esc(a.name)}"` : ""} title="${tip}"><span class="fm-ckbox ${cls}">${glyph}</span></td>`;
        if (key === "unified") {
            return (a.services && a.services.unified)
                ? box("met", "✓", "Unified support attached")
                : box("gap", "✗", "No Unified support");
        }
        if (key === "isd") {
            const mx = a.maccext || {};
            // ISD is a required service ONLY when MACC TCV >= $30m (FY27 slide). Below that -> N/A.
            if (!mx.isd_applicable) return box("pend", "—", "ISD n/a — MACC TCV < $30m");
            return mx.isd ? box("met", "✓", "ISD engaged (MACC TCV ≥ $30m)")
                          : box("gap", "✗", "ISD required (MACC TCV ≥ $30m) — not engaged");
        }
        if (key === "factory") {
            const n = a.factory_nom || 0;
            return n > 0
                ? box("met", "✓", `Active factory nomination${n > 1 ? "s: " + n : ""}`)
                : box("gap", "✗", "No active factory nomination");
        }
        // product pillar (drillable)
        if (a.scored && a.pillars_met[key]) return box("met", "✓", "met — actuals clear the threshold · click for pipeline", key);
        const act = a.activation[key] || "gap";
        if (act === "has_cp") return box("warn", "⚠", "not met · committed pipeline could activate · click for pipeline", key);
        if (act === "has_ucp") return box("warn", "⚠", "not met · uncommitted (QP) pipeline only · click for pipeline", key);
        return box("gap", "✗", "not met · no pipeline", key);
    }

    private acctRow(a: Acct, criteria: string[]): string {
        const cks = criteria.map(p => this.ckCell(a, p)).join("");
        // Frontier Score — maturity %, RAG-coloured (≥60% green, ≥40% amber, else red).
        const m = a.maturity;
        const score = a.scored
            ? `<td class="fm-score ${(m ?? 0) >= 0.6 ? "sg" : (m ?? 0) >= 0.4 ? "sa" : "sr"}">${pct(m)}</td>`
            : `<td class="fm-score"><span class="fm-pill un">unscored</span></td>`;
        // Account Details: MACC Value (confidential TCV BAND, not raw $) + Contract End.
        const mx = a.maccext || {};
        const maccVal = mx.tcv_band ? esc(mx.tcv_band) : "—";
        const cend = fmtMonthYear(mx.end_date || mx.expiry);
        let delta = `<td class="fm-d flat">—</td>`;
        if (a.scored && a.maturity_delta !== null && a.maturity_delta !== undefined) {
            const dv = a.maturity_delta;
            const cls = dv > 0 ? "up" : dv < 0 ? "dn" : "flat";
            const arrow = dv > 0 ? "▲" : dv < 0 ? "▼" : "▪";
            const cr = a.crossed === "in" ? " ⬆bar" : a.crossed === "out" ? " ⬇bar" : "";
            delta = `<td class="fm-d ${cls}">${arrow} ${pct(Math.abs(dv))}${cr}</td>`;
        }
        return `<tr>
            <td class="acct fm-pin">${esc(a.name)}<small>${esc(a.unit)}${a.acr_tier ? " · " + esc(a.acr_tier) : ""}</small></td>
            <td class="fm-tpid">${esc(a.tpid)}</td>
            <td class="fm-macc">${maccVal}</td>
            <td class="fm-cend">${cend}</td>
            ${score}${cks}${delta}
          </tr>`;
    }

    // ---- Forward Pipeline tab (account x pillar, per-quarter CP/UCP/NQP) ---------------------------
    private forward(d: Bundle): string {
        const pills = d.product_pillars;
        const pillarSeg = `<div class="fm-seg" data-seg="fwpillar">
            <button class="${this.state.fwPillar === "" ? "on" : ""}" data-fwp="">All pillars</button>
            ${pills.map(p => `<button class="${this.state.fwPillar === p ? "on" : ""}" data-fwp="${p}">${esc(PILLAR_LABEL[p])}</button>`).join("")}
          </div>`;
        const viewSeg = `<div class="fm-seg" data-seg="fwfilter">
            <button class="${this.state.fwFilter === "all" ? "on" : ""}" data-fwf="all">All</button>
            <button class="${this.state.fwFilter === "opps" ? "on" : ""}" data-fwf="opps">Opportunities</button>
            <button class="${this.state.fwFilter === "gaps" ? "on" : ""}" data-fwf="gaps">Whitespace gaps</button>
          </div>`;
        const ctl = `<div class="fm-ctl">${pillarSeg}${viewSeg}
            <input class="fm-search" id="fwSearch" placeholder="Search account…" value="${esc(this.state.search)}"/></div>`;

        const focus = pills.filter(p => !this.state.fwPillar || p === this.state.fwPillar);
        const q = this.state.search.trim().toLowerCase();
        let rows = d.accounts.slice();
        rows = rows.filter(a => this.scopePass(a));
        if (q) rows = rows.filter(a => (a.name || "").toLowerCase().indexOf(q) >= 0);

        // classify each account against the focused pillars; keep those matching the view filter.
        const classify = (a: Acct, p: string): "met" | "opp" | "gap" => {
            if (a.pillars_met[p]) return "met";
            return fwTotal(a.forward[p]) > 0 ? "opp" : "gap";
        };
        rows = rows.filter(a => {
            const cls = focus.map(p => classify(a, p));
            if (this.state.fwFilter === "opps") return cls.indexOf("opp") >= 0;
            if (this.state.fwFilter === "gaps") return cls.indexOf("gap") >= 0;
            return true;
        });
        // sort: most opportunity $ (near-term) first.
        const near$ = (a: Acct) => focus.reduce((s, p) => {
            if (a.pillars_met[p]) return s;
            const q1 = qcell(a.forward[p], "q1"), q2 = qcell(a.forward[p], "q2");
            return s + q1.cp + q1.ucp + q2.cp + q2.ucp;
        }, 0);
        rows.sort((a, b) => near$(b) - near$(a) || (a.name || "").localeCompare(b.name || ""));

        const single = focus.length === 1;
        const qhead = `<span class="qh q1">Q1</span><span class="qh q2">Q2</span><span class="qh q3">Q3</span><span class="qh q4">Q4</span>`;
        const head = `<tr><th class="l">Account</th><th>ATU</th>${focus.map(p =>
            `<th class="fwp">${esc(PILLAR_LABEL[p])}<div class="qhh">${qhead}</div></th>`).join("")}${single ? '<th class="fwtot">Total</th>' : ""}</tr>`;
        const body = rows.slice(0, 400).map(a => this.fwRow(a, focus, single)).join("");

        // headline: opportunity vs gap counts + total forward $ across ALL quarters.
        let opp = 0, gap = 0, oppTot = 0;
        for (const a of rows) for (const p of focus) {
            const c = classify(a, p);
            if (c === "opp") { opp++; oppTot += fwTotal(a.forward[p]); }
            else if (c === "gap") gap++;
        }
        const insight = `<div class="fm-insight">Across ${rows.length} account${rows.length === 1 ? "" : "s"}${this.state.fwPillar ? " · " + esc(PILLAR_LABEL[this.state.fwPillar]) : ""}: <b>${opp}</b> pillar opportunities with pipeline (<b>${money(oppTot)}</b> total across Q1–Q4) · <b>${gap}</b> whitespace gaps to create.${single ? " Click a row ▸ for workload components." : " Pick a pillar for workload detail."}</div>`;
        const legend = `<div class="fm-legend">
            <span><span class="fw-chip met">✓</span> pillar met</span>
            <span><span class="fw-chip gap">gap</span> not met · no pipeline</span>
            <span><i class="lbl cellcp">CP</i>/<i class="lbl cellucp">UC</i>/<i class="lbl cellnqp">NQ</i> per quarter</span>
          </div>`;
        const cols = focus.length + 2 + (single ? 1 : 0);
        return `${ctl}${insight}<div class="fm-sec" style="margin-top:2px;">
            <div class="fm-panel fm-tblwrap"><table class="fm-tbl fm-fwtbl${single ? " single" : ""}"><thead>${head}</thead>
              <tbody>${body || `<tr><td colspan="${cols}" class="fm-na" style="padding:18px;">No accounts match.</td></tr>`}</tbody></table></div>
            ${legend}${rows.length > 400 ? '<div class="fm-foot">Showing first 400 of ' + rows.length + ' — filter by ATU/pillar to narrow.</div>' : ""}
          </div>`;
    }

    private fwCell(a: Acct, p: string): string {
        if (a.pillars_met[p]) return `<td class="fwc met"><span class="fw-chip met">✓</span></td>`;
        return this.qgridCell(a.forward[p], true);
    }

    // Render one pillar's Q1-Q4 grid cell (used for account rows and workload sub-rows).
    private qgridCell(f: any, gapChip: boolean): string {
        const qs: [string, Cell][] = [["q1", qcell(f, "q1")], ["q2", qcell(f, "q2")], ["q3", qcell(f, "q3")], ["q4", qcell(f, "q4")]];
        const tot = qs.reduce((s, [, c]) => s + c.cp + c.ucp + c.nqp, 0);
        if (tot <= 0) return gapChip ? `<td class="fwc gap"><span class="fw-chip gap">gap</span></td>` : `<td class="fwc"></td>`;
        const qcells = qs.map(([qk, c]) => {
            const has = c.cp + c.ucp + c.nqp > 0;
            if (!has) return `<span class="qc ${qk} empty">·</span>`;
            const parts = [
                c.cp > 0 ? `<span class="cellcp"><i class="lbl">CP</i>${money(c.cp)}</span>` : "",
                c.ucp > 0 ? `<span class="cellucp"><i class="lbl">UC</i>${money(c.ucp)}</span>` : "",
                c.nqp > 0 ? `<span class="cellnqp"><i class="lbl">NQ</i>${money(c.nqp)}</span>` : "",
            ].filter(Boolean).join("");
            return `<span class="qc ${qk}" title="${qk.toUpperCase()} committed ${money(c.cp)} · uncommitted ${money(c.ucp)} · non-qual ${money(c.nqp)}">${parts}</span>`;
        }).join("");
        return `<td class="fwc opp"><div class="qgrid">${qcells}</div></td>`;
    }

    private fwRow(a: Acct, focus: string[], single: boolean): string {
        const cells = focus.map(p => this.fwCell(a, p)).join("");
        if (!single) {
            return `<tr><td class="acct">${esc(a.name)}<small>${a.scored ? "maturity " + pct(a.maturity) : "unscored"}${a.acr_tier ? " · " + esc(a.acr_tier) : ""}</small></td>
                <td>${esc(a.unit)}</td>${cells}</tr>`;
        }
        // single-pillar: add Total + expandable workload sub-rows.
        const p = focus[0];
        const total = fwTotal(a.forward[p]);
        const wl = (a.forward_wl && a.forward_wl[p]) || {};
        const wlNames = Object.keys(wl);
        const expandable = wlNames.length > 0;
        const isOpen = this.state.fwExpanded.indexOf(a.tpid) >= 0;
        const caret = expandable ? `<span class="caret">▶</span>` : `<span class="caret nc"></span>`;
        const acctCls = "acct" + (expandable ? " x" : "") + (isOpen ? " open" : "");
        const rowMain = `<tr class="fwacct${isOpen ? " open" : ""}" data-tp="${esc(a.tpid)}"><td class="${acctCls}" data-tp="${esc(a.tpid)}">${caret}${esc(a.name)}<small>${a.scored ? "maturity " + pct(a.maturity) : "unscored"} · ${esc(PILLAR_LABEL[p])}</small></td>
            <td>${esc(a.unit)}</td>${cells}<td class="fwtot">${total > 0 ? money(total) : "—"}</td></tr>`;
        if (!expandable || !isOpen) return rowMain;
        // workload sub-rows, sorted by their own total desc.
        const subs = wlNames.map(w => ({ w, t: fwTotal(wl[w]) })).sort((x, y) => y.t - x.t).map(({ w }) => {
            const grid = this.qgridCell(wl[w], false);
            return `<tr class="fwwl"><td class="wlname"><span class="wico">└</span>${esc(w)}</td><td></td>${grid}<td class="fwtot">${money(fwTotal(wl[w]))}</td></tr>`;
        }).join("");
        return rowMain + subs;
    }

    // ---- MALpen tab: MACC penetration of the Managed Account List (UK+I enterprise) --------------
    // Cross-filtering model: a filter bar of dimension dropdowns (Summary Segment → Segment →
    // Sub-Segment → Sales Unit → ATU → Territory → Industry → Sub-Industry) that all respect and
    // interact with each other; a "break down by" penetration table over the filtered roster; and a
    // VERTICAL account list (Account / TPID / Sales Unit / Segment / Industry / MACC) so columns can
    // be added later. Everything recomputes from the single account roster, so it can never disagree.
    private malpen(d: Bundle): string {
        const mp = d.malpen as MalPen;
        const DEF_ORDER = ["summseg", "segment", "subseg", "unit", "atu", "territory", "industry", "subind"];
        const roster = mp.accounts || [];
        const filters = this.state.malFilters || (this.state.malFilters = {});
        const multi = this.state.malMulti || (this.state.malMulti = {});
        // ATU Group + Territory are MULTI-select; all other MALpen filter dims stay single-select.
        const MULTI: Record<string, boolean> = { atu: true, territory: true };
        const selOf = (dim: string) => multi[dim] || [];
        const fval = (a: MalAcct, dim: string) => String((a as any)[dim] || "—");
        const dimActive = (dim: string) => MULTI[dim] ? selOf(dim).length > 0 : !!filters[dim];
        const matchDim = (a: MalAcct, dim: string) => {
            if (MULTI[dim]) { const s = selOf(dim); return s.length === 0 || s.indexOf(fval(a, dim)) >= 0; }
            return !filters[dim] || fval(a, dim) === filters[dim];
        };
        // Only keep dimensions the loaded roster can actually populate (≥1 real value). This makes the
        // filter bar robust to a data/binary sync window: if the model still holds an older roster that
        // lacks e.g. the segment fields, those dims are hidden rather than shown as a blank "—" filter.
        const hasVal = (dim: string) => roster.some(a => { const v = (a as any)[dim]; return v !== undefined && v !== null && String(v).trim() !== "" && String(v) !== "—"; });
        const order = ((mp.dim_order && mp.dim_order.length) ? mp.dim_order : DEF_ORDER).filter(hasVal);
        const labels: Record<string, string> = mp.dim_labels || {
            summseg: "Summary Segment", segment: "Segment", subseg: "Sub-Segment", unit: "Sales Unit",
            atu: "ATU Group", territory: "Territory", industry: "Industry", subind: "Sub-Industry",
        };
        const shortLabel: Record<string, string> = {
            summseg: "Summary Segment", segment: "Segment", subseg: "Sub-Segment", unit: "Sales Unit",
            atu: "ATU Group", territory: "Territory", industry: "Industry", subind: "Sub-Industry",
        };
        // clear any active filter on a now-unavailable dim, and re-home the break-down selection.
        for (const k of Object.keys(filters)) if (!order.includes(k)) delete filters[k];
        for (const k of Object.keys(multi)) if (!order.includes(k)) delete multi[k];
        if (!order.includes(this.state.malDim)) this.state.malDim = order.indexOf("segment") >= 0 ? "segment" : (order[0] || "unit");

        // Roster filtered by all active filters, optionally excluding one dimension (for that dim's own
        // dropdown options, so a select still lists its alternatives given the OTHER active filters).
        const filterRoster = (except?: string) => roster.filter(a =>
            order.every(dim => dim === except || matchDim(a, dim)));

        const filtered = filterRoster();
        const mal = filtered.length;
        const macc = filtered.filter(a => a.macc).length;
        const penPct = mal ? Math.round(macc / mal * 100) : 0;
        const ws = mal - macc;
        const anyFilter = order.some(dim => dimActive(dim));
        // Join live MACC-extended fields (unified adoption, MSX plan) onto the MAL roster by TPID so
        // the KPI counts + per-account badges respect the active filters. maccext lives on the
        // frontier accounts, not the malpen roster, hence the lookup.
        const mxByTp: Record<string, MaccExt> = {};
        for (const a of d.accounts) if (a.tpid && a.maccext) mxByTp[String(a.tpid)] = a.maccext;
        const mxOf = (a: MalAcct): MaccExt | undefined => a.macc ? mxByTp[String(a.tpid)] : undefined;
        const unifiedN = filtered.reduce((n, a) => { const m = mxOf(a); return n + (m && m.unified_adopt === true ? 1 : 0); }, 0);
        const noPlanN = filtered.reduce((n, a) => { const m = mxOf(a); return n + (m && m.msx_plan === false ? 1 : 0); }, 0);
        const maccColor = (p: number) => p >= 30 ? "#1a9e63" : (p >= 15 ? "#c98a1a" : "#c0392b");
        const bandTag = (p: number) => p >= 30 ? ["mg", "strong"] : (p >= 15 ? ["ma", "build"] : ["mr", "gap"]);

        // ---- filter bar: one dropdown per dimension (cross-filtered) ----
        const filterBar = order.map(dim => {
            const scope = filterRoster(dim);
            const agg: Record<string, { mal: number; macc: number }> = {};
            for (const a of scope) {
                const v = fval(a, dim);
                (agg[v] = agg[v] || { mal: 0, macc: 0 }).mal++;
                if (a.macc) agg[v].macc++;
            }
            const cur = filters[dim] || "";
            // MULTI dims (ATU Group + Territory) sort alphanumeric (numeric-aware); single dims keep
            // biggest-first so the most-populated option is on top.
            const opts = Object.keys(agg).sort((x, y) => MULTI[dim]
                ? x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" })
                : agg[y].mal - agg[x].mal);
            // MULTI dims: a custom checklist popover that STAYS OPEN across ticks (a native <select>
            // closes after each pick). Button shows the count; the panel is a scrollable checkbox list.
            if (MULTI[dim]) {
                const sel = selOf(dim);
                const head = sel.length ? `${sel.length} selected` : `All · ${scope.length}`;
                const isOpen = this.state.malOpen === dim;
                const list = opts.map(v => {
                    const ck = sel.indexOf(v) >= 0;
                    return `<div class="mal-msopt ${ck ? "ck" : ""}" data-malmsopt="${esc(dim)}||${esc(v)}"><span class="box">${ck ? "✓" : ""}</span><span class="nm">${esc(v)}</span><span class="mc">${agg[v].macc}/${agg[v].mal}</span></div>`;
                }).join("");
                const panel = isOpen ? `<div class="mal-mspanel">
                    <div class="mal-mshead"><a data-malmsall="${esc(dim)}">Select all</a> · <a data-malmsclr="${esc(dim)}">Clear</a><span class="x" data-malmsclose="1">✕</span></div>
                    <div class="mal-mslist">${list}</div></div>` : "";
                // NOTE: a real <label> forwards any inner click to its first <button>, which would
                // re-toggle the menu button and slam the panel shut on every option tick. Use a <div>
                // wrapper here (same .mal-fl styling) so ticking options never triggers the button.
                return `<div class="mal-fl"><span>${esc(shortLabel[dim] || labels[dim])}</span>` +
                    `<div class="mal-ms"><button class="mal-msbtn ${sel.length ? "on" : ""} ${isOpen ? "open" : ""}" data-malmsbtn="${esc(dim)}">${esc(head)}<span class="ca">▾</span></button>${panel}</div></div>`;
            }
            const optHtml = [`<option value="">All · ${scope.length}</option>`].concat(
                opts.map(v => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(v)} (${agg[v].macc}/${agg[v].mal})</option>`)
            ).join("");
            return `<label class="mal-fl"><span>${esc(shortLabel[dim] || labels[dim])}</span>` +
                `<select data-malfilter="${dim}" class="${cur ? "on" : ""}">${optHtml}</select></label>`;
        }).join("");

        // ---- break-down pills + penetration table over the filtered roster ----
        const pills = order.map(k =>
            `<button class="mal-pill ${this.state.malDim === k ? "on" : ""}" data-maldim="${k}">${esc(shortLabel[k] || labels[k])}</button>`).join("");
        const grp: Record<string, { mal: number; macc: number }> = {};
        for (const a of filtered) {
            const v = fval(a, this.state.malDim);
            (grp[v] = grp[v] || { mal: 0, macc: 0 }).mal++;
            if (a.macc) grp[v].macc++;
        }
        const brows = Object.keys(grp).map(v => ({ code: v, mal: grp[v].mal, macc: grp[v].macc }))
            .sort((a, b) => (b.macc / b.mal) - (a.macc / a.mal));
        const mx = Math.max(1, ...brows.map(r => r.mal));
        const bkBody = brows.map(r => {
            const pen = r.mal ? (r.macc / r.mal * 100) : 0;
            const malW = r.mal / mx * 100;
            const [cls, word] = bandTag(pen);
            const active = MULTI[this.state.malDim] ? selOf(this.state.malDim).indexOf(r.code) >= 0 : filters[this.state.malDim] === r.code;
            return `<tr class="mal-click ${active ? "mal-open" : ""}" data-malrow="${esc(r.code)}">
              <td class="mal-l"><span class="mal-chev">${active ? "✓" : "▸"}</span><span class="mal-nm">${esc(r.code)}</span></td>
              <td class="mal-num">${r.mal}</td>
              <td class="mal-num" style="color:#1a9e63;font-weight:700">${r.macc}</td>
              <td class="mal-barcell"><div class="mal-bar" style="width:${malW.toFixed(1)}%">
                <div class="mal-malbar"></div>
                <div class="mal-maccbar" style="width:${pen.toFixed(1)}%;background:${maccColor(pen)}"></div></div></td>
              <td class="mal-num"><span class="mal-pct" style="color:${maccColor(pen)}">${pen.toFixed(0)}%</span></td>
              <td><span class="mal-tag ${cls}">${word}</span></td>
            </tr>`;
        }).join("") || `<tr><td colspan="6" class="mal-empty">No accounts match the current filters.</td></tr>`;

        // ---- vertical account list (respects filters) ----
        let accts = filtered.slice();
        if (this.state.malAcct === "white") accts = accts.filter(a => !a.macc);
        else if (this.state.malAcct === "macc") accts = accts.filter(a => a.macc);
        const q = (this.state.malAcctSearch || "").trim().toLowerCase();
        if (q) accts = accts.filter(a => (a.name || "").toLowerCase().indexOf(q) >= 0 || (a.tpid || "").indexOf(q) >= 0);
        // MACC accounts sort FIRST so they're always visible in "All" (there are ~839 white-space
        // accounts, which would otherwise fill the 400-row cap and hide every MACC account).
        accts.sort((x, y) => (Number(y.macc) - Number(x.macc)) || (x.name || "").localeCompare(y.name || ""));
        const CAP = 400;
        const shown = accts.slice(0, CAP);
        const acctRows = shown.map(a => {
            const m = mxOf(a);
            let badges: string;
            if (a.macc) {
                const uni = m && m.unified_adopt === true ? '<span class="mal-badge mu">✓ Unified</span>' : "";
                const plan = m && m.msx_plan === true ? '<span class="mal-badge mg">✓ MSX Plan</span>'
                    : (m && m.msx_plan === false ? '<span class="mal-badge mp">⚠ No MSX Plan</span>' : "");
                badges = '<span class="mal-badge mg">✓ MACC</span>' + uni + plan;
            } else {
                badges = '<span class="mal-badge mr">◇ white-space</span>';
            }
            return `<tr>
            <td class="mal-l"><span class="mal-nm">${esc(a.name || a.tpid)}</span></td>
            <td class="mal-tp2">${esc(a.tpid)}</td>
            <td class="mal-l">${esc(a.unit)}</td>
            <td class="mal-l">${esc(a.segment)}</td>
            <td class="mal-l">${esc(a.industry)}</td>
            <td class="mal-badges">${badges}</td>
          </tr>`;
        }).join("") || `<tr><td colspan="6" class="mal-empty">No accounts match the current filters.</td></tr>`;

        const chipParts: string[] = [];
        for (const dim of order) {
            if (MULTI[dim]) {
                for (const v of selOf(dim)) chipParts.push(`<span class="mal-chip" data-malclearv="${esc(dim)}||${esc(v)}">${esc(shortLabel[dim] || labels[dim])}: <b>${esc(v)}</b> ✕</span>`);
            } else if (filters[dim]) {
                chipParts.push(`<span class="mal-chip" data-malclear="${dim}">${esc(shortLabel[dim] || labels[dim])}: <b>${esc(filters[dim])}</b> ✕</span>`);
            }
        }
        const chips = anyFilter ? chipParts.join("")
            + `<button class="mal-clearall" data-malclear="__all">Clear all</button>` : "";

        return `
        <style>
          .mal-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:14px 0 4px}
          .mal-k{background:#fff;border:1px solid #e6ebf2;border-radius:11px;padding:13px 15px;position:relative}
          .mal-k .kk{font-size:10.5px;letter-spacing:.6px;color:#6b7a90;text-transform:uppercase;font-weight:700}
          .mal-k .kv{font-size:28px;font-weight:800;color:#0f2d52;margin-top:3px;line-height:1}
          .mal-k .kd{font-size:11.5px;color:#6b7a90;margin-top:5px}
          .mal-ring{position:relative;width:52px;height:52px;border-radius:50%;float:right;margin-top:-40px;
            background:conic-gradient(#1a9e63 calc(var(--p)*1%), #e9eef5 0)}
          .mal-ring::after{content:'';position:absolute;inset:7px;border-radius:50%;background:#fff}
          .mal-ring b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#1a9e63;z-index:2}
          .mal-filterbar{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;padding:12px 0 2px}
          .mal-fl{display:flex;flex-direction:column;gap:3px}
          .mal-fl span{font-size:9.5px;letter-spacing:.4px;color:#6b7a90;text-transform:uppercase;font-weight:700}
          .mal-fl select{border:1px solid #d4deeb;background:#fff;color:#24405f;border-radius:7px;padding:6px 8px;font-size:11.5px;font-weight:600;max-width:100%}
          .mal-fl select.on{border-color:#0f2d52;background:#eef4fb;color:#0f2d52}
          .mal-ms{position:relative}
          .mal-msbtn{width:100%;text-align:left;border:1px solid #d4deeb;background:#fff;color:#24405f;border-radius:7px;padding:6px 8px;font-size:11.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:space-between}
          .mal-msbtn.on{border-color:#0f2d52;background:#eef4fb;color:#0f2d52}
          .mal-msbtn .ca{font-size:9px;opacity:.7;margin-left:6px}
          .mal-msbtn.open{border-color:#0a6cff;box-shadow:0 0 0 2px rgba(10,108,255,.12)}
          .mal-mspanel{position:absolute;left:0;top:calc(100% + 4px);width:300px;max-width:88vw;background:#fff;border:1px solid #cdd6e0;border-radius:9px;box-shadow:0 12px 30px rgba(16,40,70,.20);z-index:50;overflow:hidden}
          .mal-mshead{display:flex;align-items:center;gap:8px;padding:8px 11px;border-bottom:1px solid #e6ebf2;background:#fafbfd;font-size:11px}
          .mal-mshead a{color:#0a6cff;cursor:pointer;font-weight:600}
          .mal-mshead .x{margin-left:auto;color:#6b7684;cursor:pointer;font-size:13px}
          .mal-mslist{max-height:260px;overflow:auto;padding:4px}
          .mal-msopt{display:flex;align-items:center;gap:8px;padding:6px 9px;font-size:11.5px;cursor:pointer;border-radius:6px;color:#24405f}
          .mal-msopt:hover{background:#f1f5fa}
          .mal-msopt .box{width:15px;height:15px;border:1.5px solid #b9c4d0;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;flex:0 0 auto}
          .mal-msopt.ck .box{background:#0a6cff;border-color:#0a6cff}
          .mal-msopt .nm{flex:1;font-weight:600}
          .mal-msopt .mc{color:#8a94a2;font-size:10.5px}
          .mal-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 0 2px;min-height:6px}
          .mal-chip{font-size:11px;background:#0f2d52;color:#fff;border-radius:16px;padding:4px 10px;cursor:pointer}
          .mal-chip b{font-weight:700}
          .mal-clearall{font-size:11px;background:#fff;border:1px solid #d4deeb;color:#c0392b;border-radius:16px;padding:4px 11px;cursor:pointer;font-weight:600}
          .mal-dimrow{display:flex;align-items:center;gap:8px;padding:12px 0 4px;flex-wrap:wrap}
          .mal-dimrow .dl{font-size:10.5px;color:#6b7a90;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-right:3px}
          .mal-pill{border:1px solid #d4deeb;background:#f7fafd;color:#345;border-radius:18px;padding:6px 13px;font-size:11.5px;font-weight:600;cursor:pointer}
          .mal-pill.on{background:#0f2d52;color:#fff;border-color:#0f2d52}
          .mal-tbl{width:100%;border-collapse:collapse;margin-top:6px}
          .mal-tbl th{font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:#6b7a90;text-align:right;padding:4px 8px;font-weight:700;border-bottom:1px solid #e6ebf2}
          .mal-tbl th.tl{text-align:left}
          .mal-tbl td{padding:6px 8px;font-size:12.5px;border-bottom:1px solid #f2f5f9;vertical-align:middle}
          .mal-l{text-align:left}
          .mal-nm{font-weight:600;color:#1d3a5c}
          .mal-num{text-align:right;font-variant-numeric:tabular-nums;color:#3a4a60}
          .mal-tp2{text-align:left;color:#9aa8bc;font-size:11px;font-variant-numeric:tabular-nums}
          .mal-barcell{width:30%} .mal-bar{position:relative;height:15px;background:#eef2f7;border-radius:5px;overflow:hidden}
          .mal-malbar{position:absolute;inset:0;background:#dbe6f4}
          .mal-maccbar{position:absolute;left:0;top:0;bottom:0;border-radius:5px}
          .mal-pct{font-weight:800;font-variant-numeric:tabular-nums;min-width:44px;display:inline-block;text-align:right}
          .mal-tag{font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:20px}
          .mal-tag.mg{background:#e7f5ee;color:#1a9e63} .mal-tag.ma{background:#fcf3e2;color:#c98a1a} .mal-tag.mr{background:#fbecea;color:#c0392b}
          .mal-empty{text-align:center;color:#8493a7;padding:16px}
          .mal-legend{display:flex;gap:14px;font-size:11px;color:#6b7a90;align-items:center;margin-left:auto}
          .mal-sw{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:4px;vertical-align:-1px}
          .mal-ttl{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#26405f;margin:14px 0 2px}
          .mal-cnt{font-size:11px;color:#6b7a90;font-weight:600}
          .mal-click{cursor:pointer} .mal-click:hover{background:#f6f9fd}
          .mal-open{background:#eef7f1} .mal-chev{color:#8493a7;display:inline-block;width:14px;font-size:11px}
          .mal-badge{font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:20px}
          .mal-badge.mg{background:#e7f5ee;color:#1a9e63} .mal-badge.mr{background:#fbecea;color:#c0392b}
          .mal-badge.mu{background:#e6f0fb;color:#1667c2} .mal-badge.mp{background:#fdf1e3;color:#b4690e}
          .mal-badges{white-space:nowrap} .mal-badges .mal-badge{margin-right:4px}
          .mal-actrl{display:flex;align-items:center;gap:8px;margin-left:auto}
          .mal-seg{display:inline-flex;background:#eef2f8;border-radius:8px;padding:2px}
          .mal-seg button{border:0;background:transparent;padding:5px 11px;border-radius:6px;font-size:11px;font-weight:600;color:#5a6b82;cursor:pointer}
          .mal-seg button.on{background:#fff;color:#0f2d52;box-shadow:0 1px 2px rgba(16,40,80,.15)}
          .mal-search{border:1px solid #d4deeb;border-radius:7px;padding:5px 9px;font-size:11.5px;width:150px}
        </style>
        <div class="mal-kpis">
          <div class="mal-k"><div class="kk">MAL — Managed Accounts</div><div class="kv">${mal}</div><div class="kd">${anyFilter ? "filtered" : "UK+I enterprise book"}</div></div>
          <div class="mal-k"><div class="kk">Accounts with MACC</div><div class="kv" style="color:#1a9e63">${macc}</div>
            <div class="kd">${esc(mp.macc_source || mp.macc_def)}</div>${macc ? `<div class="mal-kext">
              <span><b>${unifiedN}</b> w/ unified adoption</span>
              <span><b>${noPlanN}</b> w/o MSX plan</span>
            </div>` : ""}</div>
          <div class="mal-k"><div class="kk">MALpen</div><div class="kv" style="color:#1a9e63">${penPct}%</div>
            <div class="mal-ring" style="--p:${penPct}"><b>${penPct}%</b></div><div class="kd">MACC ÷ MAL</div></div>
          <div class="mal-k"><div class="kk">White-space</div><div class="kv" style="color:#c0392b">${ws}</div><div class="kd">managed, no MACC — target list</div></div>
        </div>
        <div class="mal-filterbar">${filterBar}</div>
        <div class="mal-chips">${chips}</div>
        <div class="mal-dimrow"><span class="dl">Break down by</span>${pills}</div>
        <div class="mal-ttl">MACC penetration by ${esc(labels[this.state.malDim])}
          <span class="mal-cnt">${brows.length} groups · ${mal} MAL · ${macc} MACC · click a row to filter</span>
          <span class="mal-legend"><span><span class="mal-sw" style="background:#dbe6f4"></span>MAL</span>
            <span><span class="mal-sw" style="background:#1a9e63"></span>MACC</span></span>
        </div>
        <table class="mal-tbl"><thead><tr>
          <th class="tl">${esc(labels[this.state.malDim])}</th><th>MAL</th><th>MACC</th><th class="tl mal-barcell">Penetration</th><th>MALpen</th><th></th>
        </tr></thead><tbody>${bkBody}</tbody></table>
        <div class="mal-ttl">Accounts
          <span class="mal-cnt">${accts.length} shown${accts.length > CAP ? " (first " + CAP + ")" : ""}</span>
          <span class="mal-actrl">
            <input id="malSearch" class="mal-search" placeholder="Search name / TPID" value="${esc(this.state.malAcctSearch || "")}"/>
            <span class="mal-seg" data-malseg="1">
              <button class="${this.state.malAcct === "all" ? "on" : ""}" data-malacct="all">All</button>
              <button class="${this.state.malAcct === "white" ? "on" : ""}" data-malacct="white">White-space</button>
              <button class="${this.state.malAcct === "macc" ? "on" : ""}" data-malacct="macc">MACC</button>
            </span>
          </span>
        </div>
        <table class="mal-tbl"><thead><tr>
          <th class="tl">Account</th><th class="tl">TPID</th><th class="tl">Sales Unit</th><th class="tl">Segment</th><th class="tl">Industry</th><th class="tl">MACC · Unified · MSX Plan</th>
        </tr></thead><tbody>${acctRows}</tbody></table>
        <div class="fm-foot">MALpen = accounts with a MACC ÷ total Managed Accounts (MAL), ${esc(mp.scope)}.
          Filters interact — each dropdown is scoped by the others. MACC roster: ${esc(mp.macc_source || mp.macc_def)}.</div>`;
    }


    private footer(d: Bundle): string {
        const unmatched = (d.pack_unmatched || []).length;
        return `<div class="fm-foot">
            Maturity = product pillars met ÷ 5; ≥60% (3 of 5) = the Frontier bar. Actuals are live —
            ACR pillars (Databases / Fabric / Security) from MACC Finance, Foundry + GHCP from their
            MSIT Prod models (${d.totals.scored} of ${d.totals.accounts}
            UK&amp;I MACC accounts scored). Forward pipeline is live per-pillar Committed + Uncommitted across
            the full fiscal year (Foundry / GHCP / Databases / Fabric / Security).${unmatched ? " " + unmatched + " pack row(s) unmatched." : ""}
            <br/>The MACC coverage-gap table (accounts with no committed pipeline) remains below.
          </div>`;
    }

    // ---- events -----------------------------------------------------------------------------------
    private wire() {
        const rerender = () => this.render();
        this.root.querySelectorAll("[data-tabs='tab'] span").forEach(el =>
            el.addEventListener("click", () => { this.state.tab = ((el as HTMLElement).dataset.tab as any) || "industry"; this.state.view = ""; this.state.scopeOpen = false; rerender(); }));
        // Independent MACC toggle views (ATU/STU/CSU): click toggles the overlay; click active to close.
        this.root.querySelectorAll("[data-vtoggle='1'] button").forEach(el =>
            el.addEventListener("click", () => {
                const v = ((el as HTMLElement).dataset.view as any) || "";
                this.state.view = (this.state.view === v ? "" : v);
                this.state.scopeOpen = false;
                rerender();
            }));
        // Scope filter (Sales Unit -> Territory) popover + chips. Any scope change clears open drills
        // so a stale cross-unit drill (e.g. a Digital Natives drill left open) can't linger.
        const clearDrills = () => { this.state.atuDrill = ""; this.state.stuDrill = ""; };
        this.root.querySelectorAll("[data-scopetoggle]").forEach(el =>
            el.addEventListener("click", () => { this.state.scopeOpen = !this.state.scopeOpen; rerender(); }));
        this.root.querySelectorAll("[data-scopeclose]").forEach(el =>
            el.addEventListener("click", () => { this.state.scopeOpen = false; rerender(); }));
        this.root.querySelectorAll("[data-scopeunit]").forEach(el =>
            el.addEventListener("click", () => {
                const u = (el as HTMLElement).dataset.scopeunit || "";
                if (this.state.scopeUnit !== u) { this.state.scopeUnit = u; this.state.scopeTerr = []; clearDrills(); }
                rerender();
            }));
        this.root.querySelectorAll("[data-scopeterr]").forEach(el =>
            el.addEventListener("click", () => {
                const t = (el as HTMLElement).dataset.scopeterr || "";
                const i = this.state.scopeTerr.indexOf(t);
                if (i >= 0) this.state.scopeTerr.splice(i, 1); else this.state.scopeTerr.push(t);
                clearDrills(); rerender();
            }));
        this.root.querySelectorAll("[data-scopeall]").forEach(el =>
            el.addEventListener("click", () => {
                const u = this.state.scopeUnit; if (!u) return;
                this.state.scopeTerr = this.scopeTerrList(this.data as Bundle, u).map(t => t.terr);
                clearDrills(); rerender();
            }));
        this.root.querySelectorAll("[data-scopeclr]").forEach(el =>
            el.addEventListener("click", () => { this.state.scopeTerr = []; clearDrills(); rerender(); }));
        this.root.querySelectorAll("[data-scopereset]").forEach(el =>
            el.addEventListener("click", () => { this.state.scopeUnit = ""; this.state.scopeTerr = []; clearDrills(); rerender(); }));
        this.root.querySelectorAll("[data-scopeclearu]").forEach(el =>
            el.addEventListener("click", () => { this.state.scopeUnit = ""; this.state.scopeTerr = []; clearDrills(); rerender(); }));
        this.root.querySelectorAll("[data-scopeclearterr]").forEach(el =>
            el.addEventListener("click", () => {
                const t = (el as HTMLElement).dataset.scopeclearterr || "";
                const i = this.state.scopeTerr.indexOf(t); if (i >= 0) this.state.scopeTerr.splice(i, 1);
                clearDrills(); rerender();
            }));
        // CSU under/over expand-collapse (first 10 -> all).
        this.root.querySelectorAll("[data-csumore]").forEach(el =>
            el.addEventListener("click", () => {
                const k = (el as HTMLElement).dataset.csumore || "";
                if (k === "under") this.state.csuUnderExp = !this.state.csuUnderExp;
                else if (k === "over") this.state.csuOverExp = !this.state.csuOverExp;
                rerender();
            }));
        // STU: click a "# MACCs w/o Committed Pipeline" count to open/close the account list below.
        this.root.querySelectorAll("[data-stunocp]").forEach(el =>
            el.addEventListener("click", () => {
                const u = (el as HTMLElement).dataset.stunocp || "";
                this.state.stuDrill = (this.state.stuDrill === u ? "" : u);
                rerender();
            }));
        this.root.querySelectorAll("[data-stuclose]").forEach(el =>
            el.addEventListener("click", () => { this.state.stuDrill = ""; rerender(); }));
        // ATU: click a per-pillar "no qualified pipeline" count to open/close the account list below.
        this.root.querySelectorAll("[data-atunq]").forEach(el =>
            el.addEventListener("click", () => {
                const k = (el as HTMLElement).dataset.atunq || "";
                this.state.atuDrill = (this.state.atuDrill === k ? "" : k);
                rerender();
            }));
        this.root.querySelectorAll("[data-atuclose]").forEach(el =>
            el.addEventListener("click", () => { this.state.atuDrill = ""; rerender(); }));
        // MACC TCV tranche filter (STU + CSU): click a band to filter, click active to clear.
        this.root.querySelectorAll("[data-tcvband]").forEach(el =>
            el.addEventListener("click", () => {
                const which = (el as HTMLElement).dataset.tcvband || "";
                const b = (el as HTMLElement).dataset.band || "";
                if (which === "stu") { this.state.stuBand = (this.state.stuBand === b ? "" : b); this.state.stuDrill = ""; }
                else if (which === "csu") { this.state.csuBand = (this.state.csuBand === b ? "" : b); }
                rerender();
            }));
        this.root.querySelectorAll(".fm-atu").forEach(el =>
            el.addEventListener("click", () => {
                const u = (el as HTMLElement).dataset.unit || "";
                this.state.scopeUnit = u; this.state.scopeTerr = []; this.state.atuDrill = ""; this.state.stuDrill = "";
                this.state.tab = "accounts"; this.state.view = ""; rerender();
            }));
        this.root.querySelectorAll("[data-seg='unit'] button").forEach(el =>
            el.addEventListener("click", () => { this.state.unit = (el as HTMLElement).dataset.unit || ""; rerender(); }));
        this.root.querySelectorAll("[data-seg='scope'] button").forEach(el =>
            el.addEventListener("click", () => { this.state.scope = ((el as HTMLElement).dataset.scope as any) || "all"; rerender(); }));
        // Forward Pipeline tab controls
        this.root.querySelectorAll("[data-seg='fwunit'] button").forEach(el =>
            el.addEventListener("click", () => { this.state.unit = (el as HTMLElement).dataset.unit || ""; rerender(); }));
        this.root.querySelectorAll("[data-seg='fwpillar'] button").forEach(el =>
            el.addEventListener("click", () => { this.state.fwPillar = (el as HTMLElement).dataset.fwp || ""; rerender(); }));
        // Accounts checklist: click a PRODUCT-pillar cell -> jump to the Forward Pipeline tab, filtered
        // to that pillar and pre-searched to the account (restores the old drill behaviour).
        this.root.querySelectorAll("[data-ckdrill]").forEach(el =>
            el.addEventListener("click", () => {
                const t = el as HTMLElement;
                this.state.fwPillar = t.dataset.ckdrill || "";
                this.state.search = t.dataset.ckacct || "";
                this.state.fwFilter = "all";
                this.state.tab = "forward";
                rerender();
            }));
        this.root.querySelectorAll("[data-seg='fwfilter'] button").forEach(el =>
            el.addEventListener("click", () => { this.state.fwFilter = ((el as HTMLElement).dataset.fwf as any) || "all"; rerender(); }));
        // MALpen — break-down pills (set the penetration-table grouping)
        this.root.querySelectorAll("[data-maldim]").forEach(el =>
            el.addEventListener("click", () => { this.state.malDim = (el as HTMLElement).dataset.maldim || "segment"; rerender(); }));
        // Restore the open multi-select list's scroll position after any re-render (incl. the
        // persistProperties round-trip's second render) so ticking near the bottom doesn't jump up.
        const mlist = this.root.querySelector(".mal-mslist") as HTMLElement;
        if (mlist) mlist.scrollTop = this._malScroll || 0;
        // MALpen — cross-filter dropdowns (single-select dims only; ATU/Territory are custom multi).
        this.root.querySelectorAll("select[data-malfilter]").forEach(el =>
            el.addEventListener("change", () => {
                const dim = (el as HTMLElement).dataset.malfilter || "";
                const v = (el as HTMLSelectElement).value;
                if (v) this.state.malFilters[dim] = v; else delete this.state.malFilters[dim];
                rerender();
            }));
        // MALpen — multi-select checklist (ATU Group + Territory): stays open across ticks.
        this.root.querySelectorAll("[data-malmsbtn]").forEach(el =>
            el.addEventListener("click", () => {
                const dim = (el as HTMLElement).dataset.malmsbtn || "";
                this.state.malOpen = (this.state.malOpen === dim ? "" : dim);
                rerender();
            }));
        this.root.querySelectorAll("[data-malmsclose]").forEach(el =>
            el.addEventListener("click", () => { this.state.malOpen = ""; rerender(); }));
        this.root.querySelectorAll("[data-malmsopt]").forEach(el =>
            el.addEventListener("click", (ev) => {
                ev.stopPropagation(); ev.preventDefault();
                const parts = ((el as HTMLElement).dataset.malmsopt || "").split("||");
                const dim = parts[0], v = parts[1];
                const m = this.state.malMulti || (this.state.malMulti = {});
                const arr = m[dim] || (m[dim] = []);
                const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v);
                if (!arr.length) delete m[dim];
                // Remember the list scroll so the re-render doesn't jump it back to the top.
                const list = (el.closest(".mal-mslist") as HTMLElement); this._malScroll = list ? list.scrollTop : 0;
                rerender();
            }));
        this.root.querySelectorAll("[data-malmsall]").forEach(el =>
            el.addEventListener("click", (ev) => {
                ev.stopPropagation(); ev.preventDefault();
                const dim = (el as HTMLElement).dataset.malmsall || "";
                const opts = Array.from(this.root.querySelectorAll(`[data-malmsopt^="${dim}||"]`))
                    .map(o => ((o as HTMLElement).dataset.malmsopt || "").split("||")[1]);
                const m = this.state.malMulti || (this.state.malMulti = {});
                m[dim] = opts.slice();
                if (!m[dim].length) delete m[dim];
                rerender();
            }));
        this.root.querySelectorAll("[data-malmsclr]").forEach(el =>
            el.addEventListener("click", (ev) => {
                ev.stopPropagation(); ev.preventDefault();
                const dim = (el as HTMLElement).dataset.malmsclr || "";
                const m = this.state.malMulti || {}; delete m[dim]; rerender();
            }));
        // MALpen — breakdown row click toggles a filter on the current break-down dimension
        this.root.querySelectorAll("[data-malrow]").forEach(el =>
            el.addEventListener("click", () => {
                const v = (el as HTMLElement).dataset.malrow || "";
                const dim = this.state.malDim;
                if (dim === "atu" || dim === "territory") {
                    const m = this.state.malMulti || (this.state.malMulti = {});
                    const arr = m[dim] || (m[dim] = []);
                    const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v);
                    if (!arr.length) delete m[dim];
                } else {
                    if (this.state.malFilters[dim] === v) delete this.state.malFilters[dim];
                    else this.state.malFilters[dim] = v;
                }
                rerender();
            }));
        // MALpen — filter chips: clear one / clear one multi-value / clear all
        this.root.querySelectorAll("[data-malclear]").forEach(el =>
            el.addEventListener("click", () => {
                const c = (el as HTMLElement).dataset.malclear || "";
                if (c === "__all") { this.state.malFilters = {}; this.state.malMulti = {}; }
                else delete this.state.malFilters[c];
                rerender();
            }));
        this.root.querySelectorAll("[data-malclearv]").forEach(el =>
            el.addEventListener("click", () => {
                const parts = ((el as HTMLElement).dataset.malclearv || "").split("||");
                const dim = parts[0], v = parts[1];
                const m = this.state.malMulti || {};
                const arr = m[dim];
                if (arr) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); if (!arr.length) delete m[dim]; }
                rerender();
            }));
        // MALpen — account list scope toggle
        this.root.querySelectorAll("[data-malacct]").forEach(el =>
            el.addEventListener("click", () => { this.state.malAcct = ((el as HTMLElement).dataset.malacct as any) || "all"; rerender(); }));
        // MALpen — account search (preserve focus/caret)
        const malSrch = this.root.querySelector("#malSearch") as HTMLInputElement;
        if (malSrch) malSrch.addEventListener("input", () => {
            this.state.malAcctSearch = malSrch.value;
            const v = malSrch.value; this.render();
            const s2 = this.root.querySelector("#malSearch") as HTMLInputElement;
            if (s2) { s2.focus(); s2.setSelectionRange(v.length, v.length); }
        });
        // expand/collapse an account's workload sub-rows (single-pillar mode)
        this.root.querySelectorAll("td.acct.x").forEach(el =>
            el.addEventListener("click", () => {
                const tp = (el as HTMLElement).dataset.tp || "";
                const i = this.state.fwExpanded.indexOf(tp);
                if (i >= 0) this.state.fwExpanded.splice(i, 1); else this.state.fwExpanded.push(tp);
                rerender();
            }));
        const fwsrch = this.root.querySelector("#fwSearch") as HTMLInputElement;
        if (fwsrch) fwsrch.addEventListener("input", () => {
            this.state.search = fwsrch.value;
            const v = fwsrch.value; this.render();
            const s2 = this.root.querySelector("#fwSearch") as HTMLInputElement;
            if (s2) { s2.focus(); s2.setSelectionRange(v.length, v.length); }
        });
        const srch = this.root.querySelector("#fmSearch") as HTMLInputElement;
        if (srch) srch.addEventListener("input", () => {
            this.state.search = srch.value;
            // re-filter without losing focus: re-render then restore caret at end.
            const v = srch.value; this.render();
            const s2 = this.root.querySelector("#fmSearch") as HTMLInputElement;
            if (s2) { s2.focus(); s2.setSelectionRange(v.length, v.length); }
        });
    }

    // ---- session state persistence ----------------------------------------------------------------
    // TRANSIENT UI state (which popover is open, list scroll) is deliberately EXCLUDED from the
    // persisted string: Power BI's persistProperties round-trips an update() that can re-apply a
    // stale persisted snapshot, which would otherwise slam an open multi-select popover shut after
    // each tick. Keeping these fields in-memory-only means the round-trip can never reset them.
    private serializeState(): string {
        const { malOpen, scopeOpen, ...persist } = this.state as any;
        return JSON.stringify({ v: 1, state: persist });
    }
    private applyPersisted(str: string) {
        try { const o: any = JSON.parse(str); if (o && o.state) Object.assign(this.state, o.state); } catch (e) { /* noop */ }
    }
    private persistState() {
        const str = this.serializeState();
        if (str === this._persistLast) return;
        this._persistLast = str;
        try { (this.host as any).persistProperties({ merge: [{ objectName: "persist", selector: null, properties: { s: str } }] }); } catch (e) { /* noop */ }
    }
    private restoreState(dv: DataView) {
        try {
            const o: any = dv && dv.metadata && dv.metadata.objects;
            const raw = o && o.persist ? o.persist.s : undefined;
            if (raw === undefined || raw === null) return;
            const str = String(raw);
            if (str === this._persistLast) return;
            this._persistLast = str;
            this.applyPersisted(str);
        } catch (e) { /* noop */ }
    }
}
