"use strict";

import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataView = powerbi.DataView;
import DataViewTable = powerbi.DataViewTable;

import { STYLES } from "./styles";

type Num = number | null;

interface Terr {
    territory: string; su: string; grp: string;
    committed: Num; blocked: Num; uncommitted: Num; nonqual: Num; target: Num; suTarget: Num; wow: Num;
    dodC: Num; wowC: Num; dodU: Num; wowU: Num; dodN: Num; wowN: Num; wowB: Num;
    cab: Num; cabt: Num;   // closed-month NNR actuals basis (raw, carry-forward-weighted) + its target
}
interface PeriodInfo {
    label: string; order: number; quarter: string;
    off: { target: Num; committed: Num; blocked: Num; uncommitted: Num; dodC: Num; wowC: Num; dodU: Num; wowU: Num; dodN: Num; wowN: Num; wowB: Num; };
}
// Milestone-grain row (section="milestone"). Lift-and-shift of the Accounts/Milestones metrics:
// month lens (m_*) vs quarter lens (q_*); amt = cp+ucp; nq = non-qualified (Listen & Consult, no cp/ucp).
interface MSRow {
    id: string; acct: string; tpid: string; nm: string; link: string; cf: number;
    st: string; due: string; stage: string; seg: string; pk: string; duemo: string;
    u: string; gname: string; tname: string;
    commit_prev: string; st_prev: string; due_prev: string;
    m_cp: number; m_bl: number; m_ucp: number; m_qp: number; m_nq: number;
    q_cp: number; q_bl: number; q_ucp: number; q_qp: number; q_nq: number;
    m_cp_dod: number; m_ucp_dod: number; q_cp_dod: number; q_ucp_dod: number;
    m_cp_wow: number; m_ucp_wow: number; q_cp_wow: number; q_ucp_wow: number;
    m_nq_dod: number; m_nq_wow: number; q_nq_dod: number; q_nq_wow: number;
    m_bl_dod: number; m_bl_wow: number; q_bl_dod: number; q_bl_wow: number;
    isNonQual: boolean;
    [k: string]: any;
}

function compactUSD(v: Num): string {
    if (v === null || v === undefined) return "—";
    const a = Math.abs(v); const sgn = v < 0 ? "-" : "";
    if (a >= 1e6) return sgn + "$" + (a / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return sgn + "$" + Math.round(a / 1e3).toLocaleString() + "K";
    return sgn + "$" + Math.round(a).toLocaleString();
}
function pct(v: Num): string { return v === null || v === undefined ? "—" : (v * 100).toFixed(0) + "%"; }
function moneySigned(v: Num): string {
    if (v === null || v === undefined) return "—";
    const a = Math.abs(v); const sgn = v < 0 ? "-" : "";
    if (a >= 1e6) return sgn + "$" + (a / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return sgn + "$" + Math.round(a / 1e3).toLocaleString() + "K";
    return sgn + "$" + Math.round(a).toLocaleString();
}
function moveMK(v: Num): string {
    if (v === null || v === undefined) return '<span class="wow zero">—</span>';
    if (v === 0) return '<span class="wow zero">+$0</span>';
    const cls = v > 0 ? "pos" : "neg";
    return `<span class="wow ${cls}">${v > 0 ? "+" : "-"}${compactUSD(Math.abs(v))}</span>`;
}
// Inverted polarity: for metrics where UP is BAD (e.g. Blocked pipeline). Increasing = red, decreasing = green.
function moveMKInv(v: Num): string {
    if (v === null || v === undefined) return '<span class="wow zero">—</span>';
    if (v === 0) return '<span class="wow zero">+$0</span>';
    const cls = v > 0 ? "neg" : "pos";
    return `<span class="wow ${cls}">${v > 0 ? "+" : "-"}${compactUSD(Math.abs(v))}</span>`;
}
function covClass(p: Num): string {
    if (p === null || p === undefined) return "";
    if (p >= 0.9) return "cov-good"; if (p >= 0.65) return "cov-warn"; return "cov-bad";
}
function esc(s: any): string {
    return String(s == null ? "" : s).replace(/[&<>]/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;" } as any)[c]));
}
// Quarter -> its months as [duemo (milestone form), territory period label]. Drives the unified
// Period (Quarter/Month) dropdown: a whole quarter or a single month scopes BOTH grains.
const QMONTHS: Record<string, [string, string][]> = {
    Q1: [["2026-07", "July"], ["2026-08", "August"], ["2026-09", "September"]],
    Q2: [["2026-10", "October"], ["2026-11", "November"], ["2026-12", "December"]],
    Q3: [["2027-01", "January"], ["2027-02", "February"], ["2027-03", "March"]],
    Q4: [["2027-04", "April"], ["2027-05", "May"], ["2027-06", "June"]]
};

export class Visual implements IVisual {
    private root: HTMLElement;
    private host!: IVisualHost;
    private events: any = null;
    private errEl!: HTMLElement;
    private bodyEl!: HTMLElement;
    private callN = 0;
    private hasRendered = false;
    private viewportH = 0;
    private state = { q: "Q1", month: "all", open: {} as Record<string, boolean>, openKeys: new Set<string>() };
    private suSet = new Set<string>();      // selected sales units (empty = all)
    private terrSet = new Set<string>();    // selected territories (empty = all)
    private grpSet = new Set<string>();     // selected ATU groups (empty = all) — unified plane
    private segSet = new Set<string>();     // selected segments (milestone dim)
    private terrSeg = new Map<string, string>();  // territory(tname) -> its segment (each territory = one segment)
    private stageSet = new Set<string>();   // selected sales stages (milestone dim)
    private viewMode = "";                   // "" | "atu" | "stu" | "csu" — deck column presets (period table)
    private _persistLast = "";
    private msSearch = "";                  // account / TPID search (milestone table)
    private ddOpen = "";                     // which dropdown is open
    private terrSearch = "";                 // territory dropdown search text
    // progressSource: which grain feeds the KPIs / period roll-up. "territory" today; flip to
    // "milestone" once the milestone snapshot store matures (the rails this build lays).
    private progressSource: "territory" | "milestone" = "territory";
    private ms: MSRow[] = [];                // milestone-grain rows (section="milestone")
    private periods: Record<string, PeriodInfo> = {};
    private tree: Record<string, Record<string, Record<string, Terr[]>>> = {};
    private quarters: string[] = [];
    private units: string[] = [];

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
            window.addEventListener("unhandledrejection", (ev: any) => {
                self.showErr("UNHANDLED REJECTION: " + (ev && ev.reason ? (ev.reason.stack || ev.reason.message || ev.reason) : ev));
            });
        } catch (e: any) {
            this.root.innerHTML = '<pre style="color:#c00;white-space:pre-wrap;font:11px monospace;padding:10px;">CTOR ERROR: ' +
                (e && e.stack ? e.stack : String(e)) + '</pre>';
        }
    }

    private showErr(msg: string) {
        if (this.errEl) { this.errEl.style.padding = "8px 10px"; this.errEl.textContent = String(msg).slice(0, 2000); }
    }

    private log(line: string) { /* diagnostics disabled */ }

    public update(options: VisualUpdateOptions) {
        this.callN++;
        const ut = options && (options as any).type;
        try {
            const vp = options && (options as any).viewport;
            if (vp && vp.height) this.viewportH = Math.floor(vp.height);
        } catch (e) { /* noop */ }
        try { if (this.events && this.events.renderingStarted) this.events.renderingStarted(options); } catch (e) { /* noop */ }
        try {
            const dv: DataView = options.dataViews && options.dataViews[0];
            const hasTable = !!(dv && dv.table);
            const nrows = hasTable && dv.table.rows ? dv.table.rows.length : 0;
            const ncols = hasTable && dv.table.columns ? dv.table.columns.length : 0;
            if (!hasTable || nrows === 0 || ncols === 0) {
                this.log("#" + this.callN + " type=" + ut + " : empty (table=" + hasTable + " rows=" + nrows + " cols=" + ncols + ") -> keep last render=" + this.hasRendered);
                if (!this.hasRendered) this.bodyEl.innerHTML = this.attn("Waiting for data… (table=" + hasTable + " rows=" + nrows + " cols=" + ncols + ")");
                try { if (this.events && this.events.renderingFinished) this.events.renderingFinished(options); } catch (e) { /* noop */ }
                return;
            }
            const roles: string[] = [];
            (dv.table.columns || []).forEach((c: any) => { const r = c.roles || {}; Object.keys(r).forEach(k => { if (r[k]) roles.push(k); }); });
            this.reshape(dv.table);
            this.log("#" + this.callN + " type=" + ut + " rows=" + nrows + " cols=" + ncols +
                " quarters=[" + this.quarters.join(",") + "] units=" + this.units.length + " roles=[" + roles.join(",") + "]");
            if (!this.quarters.length) {
                if (!this.hasRendered) {
                    const r0 = (dv.table.rows && dv.table.rows[0]) ? JSON.stringify(dv.table.rows[0]) : "(no rows)";
                    this.bodyEl.innerHTML = this.attn("No period data. row0=" + esc(r0).slice(0, 800));
                }
                try { if (this.events && this.events.renderingFinished) this.events.renderingFinished(options); } catch (e) { /* noop */ }
                return;
            }
            if (this.quarters.indexOf(this.state.q) < 0) this.state.q = this.quarters[0];
            this.restoreState(dv);
            if (this.quarters.indexOf(this.state.q) < 0) this.state.q = this.quarters[0];
            this.render();
            this.hasRendered = true;
            if (this.errEl) { this.errEl.textContent = ""; this.errEl.style.padding = "0"; }
            try { if (this.events && this.events.renderingFinished) this.events.renderingFinished(options); } catch (e) { /* noop */ }
        } catch (e: any) {
            this.log("#" + this.callN + " EXCEPTION: " + (e && e.message ? e.message : String(e)));
            this.showErr("UPDATE EXCEPTION: " + (e && e.message ? e.message : String(e)) +
                "\n" + (e && e.stack ? String(e.stack) : ""));
            try { if (this.events && this.events.renderingFailed) this.events.renderingFailed(options, String(e && e.message ? e.message : e)); } catch (e2) { /* noop */ }
        }
    }

    private attn(msg: string): string {
        return `<div style="font-family:'Segoe UI',monospace;padding:14px;color:#8a5a00;background:#fff4e5;border:1px solid #f0c47a;border-radius:8px;margin:10px;white-space:pre-wrap;font-size:12px;line-height:1.4;">${esc(msg)}</div>`;
    }

    private reshape(t: DataViewTable) {
        const col: Record<string, number> = {};
        t.columns.forEach((c, i) => { const r: any = c.roles || {}; Object.keys(r).forEach(k => { if (r[k]) col[k] = i; }); });
        const g = (row: any[], role: string): any => { const i = col[role]; return i === undefined ? null : row[i]; };
        const n = (row: any[], role: string): Num => { const v = g(row, role); return v === null || v === undefined ? null : Number(v); };

        this.periods = {}; this.tree = {}; this.ms = [];
        const qset = new Set<string>(); const uset = new Set<string>();
        for (const row of t.rows as any[][]) {
            const section = g(row, "section");
            if (section === "milestone") {
                const mcp = Number(g(row, "ms_m_cp") || 0), mucp = Number(g(row, "ms_m_ucp") || 0);
                const qcp = Number(g(row, "ms_q_cp") || 0), qucp = Number(g(row, "ms_q_ucp") || 0);
                const stage = g(row, "ms_stage");
                const m: MSRow = {
                    id: g(row, "ms_id"), acct: g(row, "ms_acct"), tpid: g(row, "ms_tpid"),
                    nm: g(row, "ms_nm"), link: g(row, "ms_link"), cf: Number(g(row, "ms_cf") || 0),
                    st: g(row, "ms_st"), due: g(row, "ms_due"), stage: stage, seg: g(row, "ms_seg"),
                    pk: g(row, "ms_pk"), duemo: g(row, "ms_duemo"),
                    u: g(row, "ms_u"), gname: g(row, "ms_gname"), tname: g(row, "ms_tname"),
                    commit_prev: g(row, "ms_commit_prev"), st_prev: g(row, "ms_st_prev"), due_prev: g(row, "ms_due_prev"),
                    m_cp: mcp, m_bl: Number(g(row, "ms_m_bl") || 0), m_ucp: mucp, m_qp: Number(g(row, "ms_m_qp") || 0), m_nq: Number(g(row, "ms_m_nq") || 0),
                    q_cp: qcp, q_bl: Number(g(row, "ms_q_bl") || 0), q_ucp: qucp, q_qp: Number(g(row, "ms_q_qp") || 0), q_nq: Number(g(row, "ms_q_nq") || 0),
                    m_cp_dod: Number(g(row, "ms_m_cp_dod") || 0), m_ucp_dod: Number(g(row, "ms_m_ucp_dod") || 0),
                    q_cp_dod: Number(g(row, "ms_q_cp_dod") || 0), q_ucp_dod: Number(g(row, "ms_q_ucp_dod") || 0),
                    m_cp_wow: Number(g(row, "ms_m_cp_wow") || 0), m_ucp_wow: Number(g(row, "ms_m_ucp_wow") || 0),
                    q_cp_wow: Number(g(row, "ms_q_cp_wow") || 0), q_ucp_wow: Number(g(row, "ms_q_ucp_wow") || 0),
                    m_nq_dod: Number(g(row, "ms_m_nq_dod") || 0), m_nq_wow: Number(g(row, "ms_m_nq_wow") || 0),
                    q_nq_dod: Number(g(row, "ms_q_nq_dod") || 0), q_nq_wow: Number(g(row, "ms_q_nq_wow") || 0),
                    m_bl_dod: Number(g(row, "ms_m_bl_dod") || 0), m_bl_wow: Number(g(row, "ms_m_bl_wow") || 0),
                    q_bl_dod: Number(g(row, "ms_q_bl_dod") || 0), q_bl_wow: Number(g(row, "ms_q_bl_wow") || 0),
                    isNonQual: stage === "Listen & Consult" && mcp === 0 && mucp === 0 && qcp === 0 && qucp === 0
                };
                this.ms.push(m);
                if (m.tname && m.seg && !this.terrSeg.has(m.tname)) this.terrSeg.set(m.tname, m.seg);
                continue;
            }
            const period = g(row, "period"); if (period == null) continue;
            const quarter = g(row, "quarter");
            const su = g(row, "su"); const grp = g(row, "grp"); const territory = g(row, "territory");
            qset.add(quarter);
            if (su != null) uset.add(su);
            if (!this.periods[period]) {
                const ord = n(row, "periodOrder");
                this.periods[period] = {
                    label: period, order: ord == null ? 99 : ord, quarter,
                    off: { target: n(row, "offTarget"), committed: n(row, "offCommitted"), blocked: n(row, "offBlocked"),
                        uncommitted: n(row, "offUncommitted"), dodC: n(row, "offDodC"), wowC: n(row, "offWowC"),
                        dodU: n(row, "offDodU"), wowU: n(row, "offWowU"), dodN: n(row, "offDodN"), wowN: n(row, "offWowN"),
                        wowB: n(row, "offWowB") }
                };
            }
            if (su != null && grp != null && territory != null) {
                this.tree[period] = this.tree[period] || {};
                this.tree[period][su] = this.tree[period][su] || {};
                this.tree[period][su][grp] = this.tree[period][su][grp] || [];
                this.tree[period][su][grp].push({
                    territory, su, grp,
                    committed: n(row, "tCommitted"), blocked: n(row, "tBlocked"), uncommitted: n(row, "tUncommitted"),
                    nonqual: n(row, "tNonqual"), target: n(row, "tTarget"), suTarget: n(row, "tSuTarget"), wow: n(row, "tWow"),
                    dodC: n(row, "tSuDodC"), wowC: n(row, "tSuWowC"), dodU: n(row, "tSuDodU"), wowU: n(row, "tSuWowU"),
                    dodN: n(row, "tSuDodN"), wowN: n(row, "tSuWowN"), wowB: n(row, "tSuWowB"),
                    cab: n(row, "tCab"), cabt: n(row, "tCabt")
                });
            }
        }
        this.quarters = ["Q1", "Q2", "Q3", "Q4"].filter(q => qset.has(q));
        this.units = Array.from(uset);
        this.applyDefaultStage();
    }

    // All territory rows for a period, optionally restricted to a single unit (used by the table body).
    private allTerrsForPeriod(period: string, su?: string): Terr[] {
        const out: Terr[] = []; const byU = this.tree[period] || {};
        for (const u of Object.keys(byU)) { if (su && u !== su) continue; for (const grp of Object.keys(byU[u])) out.push(...byU[u][grp]); }
        return out;
    }
    // Territory rows for a period AFTER applying the Sales Unit + Territory multi-selects (empty = all).
    private filteredTerrs(period: string): Terr[] {
        const out: Terr[] = []; const byU = this.tree[period] || {};
        for (const u of Object.keys(byU)) {
            if (this.suSet.size && !this.suSet.has(u)) continue;
            for (const grp of Object.keys(byU[u])) {
                if (this.grpSet.size && !this.grpSet.has(grp)) continue;
                for (const t of byU[u][grp]) {
                    if (this.terrSet.size && !this.terrSet.has(t.territory)) continue;
                    out.push(t);
                }
            }
        }
        return out;
    }
    // The period's OWN filtered rows; for a quarter roll-up with no materialized rows, fall back to its months.
    private aggTerrs(period: string): Terr[] {
        const own = this.filteredTerrs(period);
        const p = this.periods[period];
        if (own.length || !(p && p.label === p.quarter)) return own;
        const out: Terr[] = [];
        for (const k of Object.keys(this.periods)) {
            const pp = this.periods[k];
            if (pp.quarter === p.quarter && pp.label !== pp.quarter) out.push(...this.filteredTerrs(k));
        }
        return out;
    }
    private noFilter(): boolean { return this.suSet.size === 0 && this.terrSet.size === 0 && this.grpSet.size === 0 && this.segSet.size === 0; }
    // Bridge until the milestone swap: each territory belongs to exactly one segment, so a Segment
    // filter scopes territory-sourced targets by including only territories in the selected segment(s).
    private terrInSeg(territory: string): boolean { return !this.segSet.size || this.segSet.has(this.terrSeg.get(territory) || ""); }
    // Distinct units present (current quarter) for the Sales Unit dropdown, sorted by committed.
    private unitOptions(): { key: string; cp: number }[] {
        const m = new Map<string, number>();
        const q = this.state.q;
        for (const pk of Object.keys(this.periods)) {
            if (this.periods[pk].quarter !== q || this.periods[pk].label !== q) continue;  // quarter roll-up rows
            const byU = this.tree[pk] || {};
            for (const u of Object.keys(byU)) for (const grp of Object.keys(byU[u]))
                for (const t of byU[u][grp]) m.set(u, (m.get(u) || 0) + (t.committed || 0));
        }
        // fall back to the unit list if no quarter rows yet
        if (!m.size) this.units.forEach(u => m.set(u, 0));
        return Array.from(m.entries()).map(([key, cp]) => ({ key, cp })).sort((a, b) => b.cp - a.cp || (a.key < b.key ? -1 : 1));
    }
    // Distinct territories (current quarter), constrained to the selected unit(s) AND ATU group(s),
    // sorted alphanumerically by territory code (e.g. UK.EC.PBS.02.UM.01) for easy navigation.
    private territoryOptions(): { key: string; unit: string; cp: number }[] {
        const m = new Map<string, { unit: string; cp: number }>();
        const q = this.state.q;
        for (const pk of Object.keys(this.periods)) {
            if (this.periods[pk].quarter !== q || this.periods[pk].label !== q) continue;
            const byU = this.tree[pk] || {};
            for (const u of Object.keys(byU)) {
                if (this.suSet.size && !this.suSet.has(u)) continue;
                for (const grp of Object.keys(byU[u])) {
                    if (this.grpSet.size && !this.grpSet.has(grp)) continue;
                    for (const t of byU[u][grp]) {
                        const e = m.get(t.territory) || { unit: u, cp: 0 };
                        e.cp += t.committed || 0; m.set(t.territory, e);
                    }
                }
            }
        }
        return Array.from(m.entries()).map(([key, v]) => ({ key, unit: v.unit, cp: v.cp }))
            .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: "base" }));
    }

    // ===== MILESTONE GRAIN (section="milestone") — lift-and-shift metrics from the Accounts page =====
    // The unified filter plane (period Q/M dropdown + su + ATU group + territory + segment + search +
    // sales stage) drives BOTH grains: su/grp/terr use the HARMONIZED milestone dims (u/gname/tname)
    // so the same selection sets apply to the territory table and the milestone table identically.
    private isMonth(): boolean { return this.state.month !== "all"; }
    private msInScope(m: MSRow): boolean {
        return this.isMonth() ? m.duemo === this.state.month : m.pk === this.state.q.toLowerCase();
    }
    private msCp(m: MSRow): number { return this.isMonth() ? m.m_cp : m.q_cp; }
    private msUcp(m: MSRow): number { return this.isMonth() ? m.m_ucp : m.q_ucp; }
    private msNq(m: MSRow): number { return this.isMonth() ? m.m_nq : m.q_nq; }
    private msAmt(m: MSRow): number { return this.msCp(m) + this.msUcp(m); }
    // Displayed Pipeline Amount: nq for Non-Qualified rows, else cp+ucp (matches NNRMilestones).
    private msDisplayAmt(m: MSRow): number { return m.isNonQual ? this.msNq(m) : this.msAmt(m); }
    // Per-milestone Pipeline-Amount DoD/WoW. For NQ rows the displayed amount is the nq value, so the
    // chip must read the nq deltas (m_nq_dod/wow, q_nq_dod/wow); for the rest it's cp+bl+ucp. 0 when
    // no comparable prior yet.
    private msAmtMove(m: MSRow, kind: "dod" | "wow"): number {
        if (m.isNonQual) {
            return this.isMonth()
                ? (kind === "dod" ? m.m_nq_dod : m.m_nq_wow)
                : (kind === "dod" ? m.q_nq_dod : m.q_nq_wow);
        }
        return this.isMonth()
            ? (kind === "dod" ? m.m_cp_dod + m.m_bl_dod + m.m_ucp_dod : m.m_cp_wow + m.m_bl_wow + m.m_ucp_wow)
            : (kind === "dod" ? m.q_cp_dod + m.q_bl_dod + m.q_ucp_dod : m.q_cp_wow + m.q_bl_wow + m.q_ucp_wow);
    }
    private msDisplayCommitment(m: MSRow): string { return m.isNonQual ? "Non-Qualified" : (m.cf === 1 ? "Committed" : "Uncommitted"); }
    // Shared dimension filters (su/grp/territory) + milestone-only (segment/stage/search) + period scope.
    private msPassShared(m: MSRow): boolean {
        if (this.suSet.size && !this.suSet.has(m.u)) return false;
        if (this.grpSet.size && !this.grpSet.has(m.gname)) return false;
        if (this.terrSet.size && !this.terrSet.has(m.tname)) return false;
        return true;
    }
    private filteredMs(): MSRow[] {
        const q = this.msSearch.trim().toLowerCase();
        return this.ms.filter(m => {
            if (!this.msInScope(m)) return false;
            if (!this.msPassShared(m)) return false;
            if (this.segSet.size && !this.segSet.has(m.seg)) return false;
            if (this.stageSet.size && !this.stageSet.has(m.stage)) return false;
            if (q) {
                const hay = m.acct + " " + m.tpid;
                if (!hay.toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }
    // Right-side tile +/-: gross positive vs gross negative milestone $ for cp or ucp (the displayed
    // committed/uncommitted total nets these). Respects every active filter. cp+ucp lens follows period.
    private msPosNeg(metric: "cp" | "ucp"): { pos: number; neg: number } {
        let pos = 0, neg = 0;
        for (const m of this.filteredMs()) {
            if (m.isNonQual) continue;                       // NQ excluded from cp/ucp maths
            const v = metric === "cp" ? this.msCp(m) : this.msUcp(m);
            if (v > 0) pos += v; else if (v < 0) neg += v;
        }
        return { pos, neg };
    }
    // Non-Qual gross +/- (levels): mirrors msPosNeg but counts ONLY NonQual milestones (the inverse
    // filter), since NQ is a distinct pipeline (uncommitted Stage-1 L&C with no cp/ucp).
    private msNqPosNeg(): { pos: number; neg: number } {
        let pos = 0, neg = 0;
        for (const m of this.filteredMs()) {
            if (!m.isNonQual) continue;
            const v = this.msNq(m);
            if (v > 0) pos += v; else if (v < 0) neg += v;
        }
        return { pos, neg };
    }
    // Per-milestone DoD / WoW move for cp / ucp / nq (current period lens). Mirrors msAmtMove per metric.
    private msMetricMove(m: MSRow, metric: "cp" | "ucp" | "nq", kind: "dod" | "wow"): number {
        if (metric === "nq") {
            if (!m.isNonQual) return 0;
            if (this.isMonth()) return kind === "dod" ? m.m_nq_dod : m.m_nq_wow;
            return kind === "dod" ? m.q_nq_dod : m.q_nq_wow;
        }
        if (m.isNonQual) return 0;
        if (this.isMonth()) {
            if (metric === "cp") return kind === "dod" ? m.m_cp_dod : m.m_cp_wow;
            return kind === "dod" ? m.m_ucp_dod : m.m_ucp_wow;
        }
        if (metric === "cp") return kind === "dod" ? m.q_cp_dod : m.q_cp_wow;
        return kind === "dod" ? m.q_ucp_dod : m.q_ucp_wow;
    }
    // Split the period's DoD (or WoW) move into gross risers (▲) vs fallers (▼) for cp / ucp / nq.
    private msMovePosNeg(metric: "cp" | "ucp" | "nq", kind: "dod" | "wow"): { pos: number; neg: number } {
        let pos = 0, neg = 0;
        for (const m of this.filteredMs()) {
            if (metric === "nq" ? !m.isNonQual : m.isNonQual) continue;
            const v = this.msMetricMove(m, metric, kind);
            if (v > 0) pos += v; else if (v < 0) neg += v;
        }
        return { pos, neg };
    }
    // Gross ▲/▼ split that reconciles to the EXACT net movement (`net`, which includes DEPARTED
    // milestones the client can't see). Gross positive = every positive per-milestone move (entries +
    // survivors that rose) — all in today's rows, so the client sum is exact. Gross negative = net -
    // positive, so departures (a negative move absent from today's rows) land in ▼. When `net` is null
    // (no comparable prior yet) both are null -> renders "—".
    private moveSplit(metric: "cp" | "ucp" | "nq", kind: "dod" | "wow", net: Num): { pos: number; neg: number } | null {
        if (net === null || net === undefined) return null;
        const pos = this.msMovePosNeg(metric, kind).pos;   // gross positive is complete client-side
        return { pos, neg: (net as number) - pos };        // net includes departures -> neg does too
    }
    // Render one "▲ +$ ▼ -$" gross split (or "▲ — ▼ —" when the split is null / zero).
    private splitPair(s: { pos: number; neg: number } | null): string {
        const up = s && s.pos ? moneySigned(s.pos) : "—";
        const dn = s && s.neg ? moneySigned(s.neg) : "—";
        return `<i class="up">▲ ${up}</i> <i class="dn">▼ ${dn}</i>`;
    }
    // Milestone-sourced levels + DoD for a given period label (quarter "Q1" or a month like "July")
    // and optional su/grp/terr scope. Applies every NON-period filter (su/grp/terr/segment/stage/search)
    // so the upper period table respects all filters incl. the milestone-only dims. WoW + Target stay
    // territory-sourced. Reconciles to the territory roll-up when no milestone-only filter is active.
    private msPeriodSpec(label: string, scope?: { su?: string; grp?: string; terr?: string }):
        { committed: number; blocked: number; uncommitted: number; nonqual: number; dodC: number; dodU: number; wowC: number; wowU: number; dodN: number; wowN: number } {
        const isQ = /^Q[1-4]$/.test(label);
        let monthKey = "";
        if (!isQ) {
            for (const qq of Object.keys(QMONTHS)) {
                const f = (QMONTHS[qq] || []).find(x => x[1] === label);
                if (f) { monthKey = f[0]; break; }
            }
        }
        const search = this.msSearch.trim().toLowerCase();
        let committed = 0, blocked = 0, uncommitted = 0, nonqual = 0, dodC = 0, dodU = 0, wowC = 0, wowU = 0, dodN = 0, wowN = 0;
        for (const m of this.ms) {
            if (isQ ? m.pk !== label.toLowerCase() : m.duemo !== monthKey) continue;
            if (!this.msPassShared(m)) continue;
            if (this.segSet.size && !this.segSet.has(m.seg)) continue;
            if (search) {
                const hay = m.acct + " " + m.tpid;
                if (!hay.toLowerCase().includes(search)) continue;
            }
            if (scope) {
                if (scope.su && m.u !== scope.su) continue;
                if (scope.grp && m.gname !== scope.grp) continue;
                if (scope.terr && m.tname !== scope.terr) continue;
            }
            // NQ MOVEMENT is summed across ALL in-scope rows regardless of today's classification, so a
            // milestone that QUALIFIED OUT of Non-Qual (was Listen & Consult, now Committed/Uncommitted)
            // still contributes its negative m_nq_dod here, and one that qualified IN contributes its
            // positive — exactly mirroring how cp/ucp deltas track a milestone across a commitment change.
            // NQ ignores the Sales-Stage filter (the Non-Qual column is always on).
            dodN += isQ ? m.q_nq_dod : m.m_nq_dod;
            wowN += isQ ? m.q_nq_wow : m.m_nq_wow;
            // Non-Qual LEVEL is only the rows that ARE Non-Qual today.
            if (m.isNonQual) {
                nonqual += isQ ? m.q_nq : m.m_nq;
                continue;
            }
            if (this.stageSet.size && !this.stageSet.has(m.stage)) continue;
            committed += isQ ? m.q_cp : m.m_cp;
            blocked += isQ ? m.q_bl : m.m_bl;
            uncommitted += isQ ? m.q_ucp : m.m_ucp;
            dodC += isQ ? m.q_cp_dod : m.m_cp_dod;
            dodU += isQ ? m.q_ucp_dod : m.m_ucp_dod;
            // WoW is the IDENTICAL roll-up to DoD, only reading the _wow deltas (7-day-back prior).
            wowC += isQ ? m.q_cp_wow : m.m_cp_wow;
            wowU += isQ ? m.q_ucp_wow : m.m_ucp_wow;
        }
        return { committed, blocked, uncommitted, nonqual, dodC, dodU, wowC, wowU, dodN, wowN };
    }
    // Blend territory-sourced target + LEVELS from the milestone grain (today's rows, exact, respects
    // every filter incl. milestone-only dims) with MOVEMENT from the ACCOUNT-grain per-territory
    // subtraction (terrSpec dodC/dodU/wowC/wowU/dodN/wowN = t_su_dod_c/_u/_n + t_su_wow_c/_u/_n).
    // ALL movement (Committed, Uncommitted AND Non-Qual) now comes from the territory grain, because the
    // milestone grain only sees TODAY's rows and cannot attribute a DEPARTED milestone's negative (a
    // milestone lost/cancelled or slipped out of the period has no row today, so its full prior value is
    // invisible to a today-only sum). The territory grain is snapshot-subtraction (today - prior over the
    // union of grains), so departures accrue at every tier and the drill rows reconcile UP to the
    // account-grain parent period row (p.off.* / mv_period). NB: because movement is territory-sourced it
    // is NOT scoped by the milestone-only filters (stage/search) — same accepted trade-off NQ already had;
    // the LEVELS above still respect all filters.
    private blendMs(label: string, scope: { su?: string; grp?: string; terr?: string }, terrSpec: any): any {
        const ms = this.msPeriodSpec(label, scope);
        return { target: terrSpec.target, committed: ms.committed, blocked: ms.blocked,
            uncommitted: ms.uncommitted, nonqual: ms.nonqual, dodC: terrSpec.dodC, dodU: terrSpec.dodU,
            wowC: terrSpec.wowC, wowU: terrSpec.wowU, dodN: terrSpec.dodN, wowN: terrSpec.wowN,
            wowB: terrSpec.wowB, cab: terrSpec.cab, cabt: terrSpec.cabt };
    }
    private msSegOptions(): { key: string; cp: number }[] {
        const m = new Map<string, number>();
        for (const r of this.ms) { if (!this.msInScope(r) || !r.seg) continue; m.set(r.seg, (m.get(r.seg) || 0) + this.msCp(r)); }
        return Array.from(m.entries()).map(([key, cp]) => ({ key, cp })).sort((a, b) => b.cp - a.cp || a.key.localeCompare(b.key));
    }
    private msStageOptions(): { key: string; cp: number }[] {
        const ORDER = ["Listen & Consult", "Inspire & Design", "Empower & Achieve", "Realize Value", "Manage & Optimize"];
        const set = new Set<string>();
        for (const r of this.ms) { if (this.msInScope(r) && r.stage) set.add(r.stage); }
        return Array.from(set).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).map(key => ({ key, cp: 0 }));
    }
    // ATU Group options (unified) — from the territory grain hierarchy (current quarter).
    private groupOptions(): { key: string; cp: number }[] {
        const m = new Map<string, number>();
        const q = this.state.q;
        for (const pk of Object.keys(this.periods)) {
            if (this.periods[pk].quarter !== q || this.periods[pk].label !== q) continue;
            const byU = this.tree[pk] || {};
            for (const u of Object.keys(byU)) {
                if (this.suSet.size && !this.suSet.has(u)) continue;
                for (const grp of Object.keys(byU[u])) {
                    let cp = 0; for (const t of byU[u][grp]) cp += t.committed || 0;
                    m.set(grp, (m.get(grp) || 0) + cp);
                }
            }
        }
        return Array.from(m.entries()).map(([key, cp]) => ({ key, cp })).sort((a, b) => b.cp - a.cp || a.key.localeCompare(b.key));
    }
    private _stageDefaulted = false;
    private applyDefaultStage() {
        // Default = ALL stages (incl. Listen & Consult) so the Non-Qual tile/column populate on load.
        if (this._stageDefaulted || !this.ms.length) return;
        this.stageSet = new Set();   // empty = no stage filter = all stages
        this._stageDefaulted = true;
    }
    private sumTerrs(terrs: Terr[]): any {
        const a = { committed: 0, blocked: 0, uncommitted: 0, nonqual: 0, target: 0, wow: 0,
            dodC: 0, wowC: 0, dodU: 0, wowU: 0, dodN: 0, wowN: 0, wowB: 0, cab: 0, cabt: 0 };
        let tAny = false, wAny = false;
        let dcAny = false, wcAny = false, duAny = false, wuAny = false, dnAny = false, wnAny = false, wbAny = false;
        let abAny = false;
        for (const t of terrs) {
            if (t.committed != null) a.committed += t.committed;
            if (t.blocked != null) a.blocked += t.blocked;
            if (t.uncommitted != null) a.uncommitted += t.uncommitted;
            if (t.nonqual != null) a.nonqual += t.nonqual;
            if (t.target != null) { a.target += t.target; tAny = true; }
            if (t.wow != null) { a.wow += t.wow; wAny = true; }
            // Closed-month actuals basis (raw carry-forward-weighted actual + its target) — summed so a
            // scope's banked = min(Σcab, Σcabt) can be capped at the scope grain (surplus neutralises).
            if (t.cab != null || t.cabt != null) { a.cab += (t.cab || 0); a.cabt += (t.cabt || 0); abAny = true; }
            // Movement cascades by summation: a group/unit/period is the sum of its territories'
            // account-sourced DoD/WoW. A tier shows a value only when >=1 territory contributed.
            if (t.dodC != null) { a.dodC += t.dodC; dcAny = true; }
            if (t.wowC != null) { a.wowC += t.wowC; wcAny = true; }
            if (t.dodU != null) { a.dodU += t.dodU; duAny = true; }
            if (t.wowU != null) { a.wowU += t.wowU; wuAny = true; }
            if (t.dodN != null) { a.dodN += t.dodN; dnAny = true; }
            if (t.wowN != null) { a.wowN += t.wowN; wnAny = true; }
            if (t.wowB != null) { a.wowB += t.wowB; wbAny = true; }
        }
        return { committed: a.committed, blocked: a.blocked, uncommitted: a.uncommitted, nonqual: a.nonqual,
            target: tAny ? a.target : null, wow: wAny ? a.wow : null,
            cab: abAny ? a.cab : null, cabt: abAny ? a.cabt : null,
            dodC: dcAny ? a.dodC : null, wowC: wcAny ? a.wowC : null,
            dodU: duAny ? a.dodU : null, wowU: wuAny ? a.wowU : null,
            dodN: dnAny ? a.dodN : null, wowN: wnAny ? a.wowN : null,
            wowB: wbAny ? a.wowB : null };
    }
    private periodNonQual(period: string): Num {
        const terrs = this.aggTerrs(period);
        let s = 0, any = false;
        for (const t of terrs) if (t.nonqual != null) { s += t.nonqual; any = true; }
        return any ? s : null;
    }

    // Selected period label: the month's territory label when a month is picked, else the quarter.
    private selectedPeriodLabel(): string {
        if (this.state.month === "all") return this.state.q;
        const m = (QMONTHS[this.state.q] || []).find(x => x[0] === this.state.month);
        return m ? m[1] : this.state.q;
    }

    private render() {
        const q = this.state.q;
        const isAll = this.noFilter();
        const plabel = this.selectedPeriodLabel();            // quarter, or the selected month's label
        const monthMode = this.state.month !== "all";
        // When a month is picked, both the KPI cards and the period table scope to that month;
        // otherwise the whole quarter (today's behavior — default view is byte-identical).
        const periodsOfQ = monthMode
            ? Object.keys(this.periods).map(k => this.periods[k]).filter(p => p.label === plabel)
            : Object.keys(this.periods).map(k => this.periods[k]).filter(p => p.quarter === q).sort((a, b) => a.order - b.order);
        const rollSpec = this.periodSpec(plabel, isAll);
        // Right-side tile +/-: gross positive vs gross negative milestone $ (cp / ucp), nets to the
        // displayed total; respects every active filter. Milestone-sourced (levels, not deltas).
        const pnC = this.msPosNeg("cp"), pnU = this.msPosNeg("ucp"), pnN = this.msNqPosNeg();
        // DoD + WoW move split into GROSS risers (▲) vs fallers (▼). The gross POSITIVE is every positive
        // per-milestone move (entries + survivors that rose) — all present in today's rows, so the
        // client sum is exact. The gross NEGATIVE = net − positive, where net (rollSpec) is the exact
        // period movement INCLUDING departed milestones (which the client can't see directly). So a
        // departure correctly lands in the ▼ negative. Each pair sums to the net on the line above.
        const dnC = this.moveSplit("cp", "dod", rollSpec.dodC), dnU = this.moveSplit("ucp", "dod", rollSpec.dodU);
        const wnC = this.moveSplit("cp", "wow", rollSpec.wowC), wnU = this.moveSplit("ucp", "wow", rollSpec.wowU);
        const dnN = this.moveSplit("nq", "dod", rollSpec.dodN), wnN = this.moveSplit("nq", "wow", rollSpec.wowN);
        // Headline committed/uncommitted come from the milestone net so they respect the milestone-only
        // dims (segment/stage) too; the milestone grain reconciles exactly to the territory roll-up.
        const msCommitted = pnC.pos + pnC.neg, msUncommitted = pnU.pos + pnU.neg, msNonqual = pnN.pos + pnN.neg;
        // Closed-month banked NNR actuals count toward coverage + additional-needed exactly like pipeline.
        const effCommitted = msCommitted + this.banked(rollSpec);
        const cov = rollSpec.target ? (effCommitted / (rollSpec.target as number)) : null;
        // UC2C Needed = Add'l Committed Needed ÷ Uncommitted (rollup totals; respects all filters via
        // rollSpec/msCommitted). Same needCom() the table's addlC uses. Tile shows title + % only.
        const nCTot = this.needCom(rollSpec.target, effCommitted);
        const uc2c = (nCTot != null && msUncommitted > 0) ? (nCTot as number) / msUncommitted : null;

        const html = `
        <div class="nnr-root">
          <div class="kpis">
            <div class="kpi"><div class="k-label">FY27 ${esc(plabel)} Target</div>
              <div class="k-value">${compactUSD(rollSpec.target)}</div>
              <div class="k-foot">NNR target (committed excl. blocked)</div></div>
            <div class="kpi has-ph"><div class="k-label">${esc(plabel)} Committed</div>
              <div class="k-main"><div class="k-value">${compactUSD(msCommitted)}</div>
                <div class="k-side"><div class="ks-row up">▲ <span class="ks-v">${moneySigned(pnC.pos)}</span></div><div class="ks-row dn">▼ <span class="ks-v">${moneySigned(pnC.neg)}</span></div></div></div>
              <div class="k-foot">${this.wowSpan(rollSpec.wowC)} WoW · ${moveMK(rollSpec.dodC)} DoD</div>
              <div class="k-split"><span class="ksp">WoW ${this.splitPair(wnC)}</span><span class="ksp">DoD ${this.splitPair(dnC)}</span></div></div>
            <div class="kpi"><div class="k-label">${esc(plabel)} Coverage</div>
              <div class="k-value cov-val">${cov == null ? "—" : `<span class="cov-pill ${covClass(cov)}">${pct(cov)}</span>`}</div><div class="k-foot">committed ÷ target</div>
              <div class="k-uc2c"><span class="k-uc2c-l">UC2C Needed</span><span class="k-uc2c-v">${pct(uc2c)}</span></div></div>
            <div class="kpi has-ph"><div class="k-label">${esc(plabel)} Uncommitted</div>
              <div class="k-main"><div class="k-value">${compactUSD(msUncommitted)}</div>
                <div class="k-side"><div class="ks-row up">▲ <span class="ks-v">${moneySigned(pnU.pos)}</span></div><div class="ks-row dn">▼ <span class="ks-v">${moneySigned(pnU.neg)}</span></div></div></div>
              <div class="k-foot">${this.wowSpan(rollSpec.wowU)} WoW · ${moveMK(rollSpec.dodU)} DoD</div>
              <div class="k-split"><span class="ksp">WoW ${this.splitPair(wnU)}</span><span class="ksp">DoD ${this.splitPair(dnU)}</span></div></div>
            <div class="kpi has-ph"><div class="k-label">${esc(plabel)} Non-Qual</div>
              <div class="k-main"><div class="k-value">${compactUSD(msNonqual)}</div>
                <div class="k-side"><div class="ks-row up">▲ <span class="ks-v">${moneySigned(pnN.pos)}</span></div><div class="ks-row dn">▼ <span class="ks-v">${moneySigned(pnN.neg)}</span></div></div></div>
              <div class="k-foot">${this.wowSpan(rollSpec.wowN)} WoW · ${moveMK(rollSpec.dodN)} DoD</div>
              <div class="k-split"><span class="ksp">WoW ${this.splitPair(wnN)}</span><span class="ksp">DoD ${this.splitPair(dnN)}</span></div></div>
          </div>
          <div class="section-h"><h2>NNR Progress by period</h2>
            <span class="note">FY27 ${esc(plabel)} targets · DoD/WoW cascade from daily account snapshots (territory → group → unit)</span></div>
          ${this.filterControls()}
          <div class="tablewrap scrollx frz" style="${this.tableWrapStyle()}"><table class="prog-tbl${this.viewMode ? " vmode" : ""}">
            ${this.tableHead()}
            <tbody>${this.bodyRows(periodsOfQ, q, isAll)}</tbody>
          </table></div>
          ${this.milestoneSection()}
        </div>`;
        const active = document.activeElement as HTMLInputElement;
        const focusId = active && (active.id === "prgTerrSearch" || active.id === "prgMsSearch") ? active.id : "";
        const caret = focusId ? (active.selectionStart || 0) : 0;
        this.bodyEl.innerHTML = `<style>${STYLES}</style>${html}`;
        this.wire();
        if (focusId) {
            const el = this.root.querySelector("#" + focusId) as HTMLInputElement;
            if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) { /* noop */ } }
        }
        this.persistState();
    }

    /* ---- session state persistence (survives page navigation via host.persistProperties) ----
       Serializes the period tab, drill-open nodes and all filter sets (sales unit/territory/group/
       segment/stage + account search) into a report object property so update() can rehydrate it
       when Power BI destroys/recreates the visual on page switch. Session-scoped in reading view;
       also captured by bookmarks. Guarded by _persistLast so the persist-triggered update never
       loops or clobbers active edits. */
    private serializeState(): string {
        const st = this.state;
        return JSON.stringify({
            v: 2,
            q: st.q, month: st.month, open: st.open, openKeys: Array.from(st.openKeys),
            su: Array.from(this.suSet), terr: Array.from(this.terrSet), grp: Array.from(this.grpSet),
            seg: Array.from(this.segSet), stage: Array.from(this.stageSet), msSearch: this.msSearch, view: this.viewMode
        });
    }
    private applyPersisted(s: string) {
        try {
            const o: any = JSON.parse(s);
            if (!o) return;
            const st = this.state;
            if (typeof o.q === "string") st.q = o.q;
            if (typeof o.month === "string") st.month = o.month;
            if (o.open && typeof o.open === "object") st.open = o.open;
            st.openKeys.clear();
            if (Array.isArray(o.openKeys)) for (const v of o.openKeys) st.openKeys.add(String(v));
            const L = (set: Set<string>, arr: any) => { set.clear(); if (Array.isArray(arr)) for (const v of arr) set.add(String(v)); };
            L(this.suSet, o.su); L(this.terrSet, o.terr); L(this.grpSet, o.grp); L(this.segSet, o.seg);
            // Stage default changed to ALL (empty). Only honor a persisted stage set from v2+ blobs;
            // ignore legacy v1 blobs so a stale 4-stage selection never overrides the new all-stages default.
            if (typeof o.v === "number" && o.v >= 2) L(this.stageSet, o.stage);
            else this.stageSet = new Set();
            if (typeof o.msSearch === "string") this.msSearch = o.msSearch;
            this.viewMode = (o.view === "atu" || o.view === "stu" || o.view === "csu") ? o.view : "";
        } catch (e) { /* noop */ }
    }
    private persistState() {
        const s = this.serializeState();
        if (s === this._persistLast) return;
        this._persistLast = s;
        try {
            (this.host as any).persistProperties({ merge: [{ objectName: "persist", selector: null, properties: { s } }] });
        } catch (e) { /* noop */ }
    }
    private restoreState(dv: DataView) {
        try {
            const o: any = dv && dv.metadata && dv.metadata.objects;
            const raw = o && o.persist ? o.persist.s : undefined;
            if (raw === undefined || raw === null) return;
            const s = String(raw);
            if (s === this._persistLast) return;
            this._persistLast = s;
            this.applyPersisted(s);
        } catch (e) { /* noop */ }
    }
    // ===== Milestone detail table (bottom of the page) — reduced columns, unified filter plane. =====
    private milestoneSection(): string {
        const rows = this.filteredMs().slice()
            .sort((a, b) => this.msDisplayAmt(b) - this.msDisplayAmt(a));
        const total = rows.length;
        const shown = rows.slice(0, 500);
        const linkCell = (m: MSRow): string => {
            const name = esc(m.nm || "(unnamed)");
            return m.link
                ? `<a class="msx-lnk" data-msx="${esc(m.link)}" role="link" tabindex="0" title="Open in MSX">${name} ↗</a>`
                : name;
        };
        // "Was: X" change pill — DAY-over-day only (a commitment/status/due change is a discrete
        // event, meaningful vs yesterday). Lifted verbatim from the Accounts/Milestones table.
        const wasPill = (prev: string): string =>
            prev ? `<span class="was-chip" title="Was ${esc(prev)} yesterday">was ${esc(prev)}</span>` : "";
        const body = shown.map(m => {
            const dc = this.msDisplayCommitment(m);
            const cc = dc === "Committed" ? "good" : dc === "Non-Qualified" ? "nq" : "warn";
            return `<tr>
              <td class="lft acct" title="${esc(m.acct)}">${esc(m.acct)}</td>
              <td class="lft tpid">${esc(m.tpid)}</td>
              <td class="lft small">${esc(m.id)}</td>
              <td class="lft nm">${linkCell(m)}</td>
              <td class="num"><span class="ms-amt-v">${moneySigned(this.msDisplayAmt(m))}</span><span class="ms-amt-sub">${moveMK(this.msAmtMove(m, "dod"))} d · ${moveMK(this.msAmtMove(m, "wow"))} w</span></td>
              <td class="lft"><span class="cellstack"><span class="pill ${cc}">${esc(dc)}</span>${wasPill(m.commit_prev)}</span></td>
              <td class="lft small"><span class="cellstack">${esc(m.st) || '<span class="muted">—</span>'}${wasPill(m.st_prev)}</span></td>
              <td class="lft small"><span class="cellstack">${esc(m.due) || '<span class="muted">—</span>'}${wasPill(m.due_prev)}</span></td>
              <td class="lft small">${esc(m.stage) || "—"}</td>
            </tr>`;
        }).join("") || `<tr><td colspan="9" class="lft muted" style="padding:16px">No milestones match these filters.</td></tr>`;
        const note = `${total.toLocaleString()} milestone${total === 1 ? "" : "s"}`
            + (total > 500 ? " (showing top 500 by pipeline)" : "") + " · click a milestone to open it in MSX";
        return `<div class="section-h" style="margin-top:20px"><h2>Milestone detail</h2><span class="note">${esc(note)}</span></div>
          <div class="tablewrap scrollx"><table class="prog-tbl ms-tbl">
            <thead><tr>
              <th class="acct">Account</th><th>TPID</th><th>Milestone Id</th><th class="nm">Milestone</th>
              <th class="amt">Pipeline Amount</th><th>Commitment</th><th>Status</th><th>Est Due</th><th>Sales Stage</th>
            </tr></thead>
            <tbody id="prgMsBody">${body}</tbody>
          </table></div>`;
    }

    private periodSpec(label: string, isAll: boolean): any {
        const p = this.periods[label];
        if (!p) return { target: null, committed: null, blocked: null, uncommitted: null, nq: null, dodC: null, wowC: null, dodU: null, wowU: null, dodN: null, wowN: null, wowB: null };
        if (isAll) {
            // Default (unfiltered) view: levels come from the milestone grain (all present today, so
            // exact), but MOVEMENT (DoD/WoW) reads the model's exact period total (p.off = mv_period =
            // sum(today)-sum(prior)), so it counts NEW and DEPARTED milestones. Client-side milestone
            // sums (ms.dodC) can't see departures (a departed milestone has no row), so we must not use
            // them for the headline movement.
            const ms = this.msPeriodSpec(label);
            const _ab = this.sumTerrs(this.aggTerrs(label));
            return { target: p.off.target, committed: ms.committed, blocked: ms.blocked, uncommitted: ms.uncommitted,
                nq: ms.nonqual, dodC: p.off.dodC, wowC: p.off.wowC, dodU: p.off.dodU, wowU: p.off.wowU,
                dodN: p.off.dodN, wowN: p.off.wowN, wowB: p.off.wowB, cab: _ab.cab, cabt: _ab.cabt };
        }
        // Filtered (Sales Unit and/or Territory selected): committed/blocked/uncommitted/non-qual are
        // summed from the FILTERED territory rows of this period. Target is filter-scoped:
        //   - Territory selected  -> sum each selected territory's OWN per-territory target (t_target).
        //   - Sales Unit only      -> sum ONE official su-target per selected unit (NOT per territory,
        //                             NOT summed monthly — uses the period's own rows, so the quarter
        //                             roll-up takes the official quarter su-target e.g. FSI Q1 $8.6M).
        const own = this.filteredTerrs(label);     // this period's own filtered rows
        const agg = this.aggTerrs(label);          // own, or month-fallback for an unmaterialised roll-up
        const s = this.sumTerrs(agg);
        const tgtRows = own.length ? own : agg;
        let target: Num = null;
        if (this.terrSet.size || this.grpSet.size || this.segSet.size) {
            const seen = new Set<string>(); let acc = 0, any = false;
            for (const t of tgtRows) {
                if (!this.terrInSeg(t.territory)) continue;
                if (seen.has(t.territory)) continue; seen.add(t.territory);
                if (t.target != null) { acc += t.target; any = true; }
            }
            target = any ? acc : null;
        } else {
            const perU: Record<string, Num> = {};
            for (const t of tgtRows) if (!(t.su in perU)) perU[t.su] = t.suTarget;
            let acc = 0, any = false;
            for (const u in perU) if (perU[u] != null) { acc += perU[u] as number; any = true; }
            target = any ? acc : null;
        }
        // Levels from the milestone grain (respects su/grp/terr/segment/stage/search). MOVEMENT
        // (Committed/Uncommitted/Non-Qual DoD+WoW) from the account-grain per-territory subtraction
        // (sumTerrs of the filtered rows) so DEPARTED milestones accrue and this filtered parent
        // reconciles with its drill children (which also use the territory grain via blendMs). Target
        // stays territory-sourced.
        const ms = this.msPeriodSpec(label);
        return { target, committed: ms.committed, blocked: ms.blocked, uncommitted: ms.uncommitted,
            nq: ms.nonqual, dodC: s.dodC, wowC: s.wowC, dodU: s.dodU, wowU: s.wowU,
            dodN: s.dodN, wowN: s.wowN, wowB: s.wowB, cab: s.cab, cabt: s.cabt };
    }

    private needCom(tgt: Num, com: Num): Num { return tgt == null || com == null ? null : Math.max(0, tgt - com * 0.95); }

    // Closed-month NNR actuals, banked as committed-equivalent and treated EXACTLY like pipeline in the
    // coverage / additional-needed calc. banked = min(Σcab, Σcabt): a deficit (actual < target) carries
    // into the quarter need; a surplus (actual > target) is capped at target (no quarter relief). Applied
    // at the DISPLAYED ROW's grain (min is non-linear, so cab/cabt are summed raw, capped only here).
    private banked(s: any): number {
        if (!s) return 0;
        const cabt = s.cabt != null ? Number(s.cabt) : 0;
        if (!cabt) return 0;                       // no closed-month basis in this scope
        const cab = s.cab != null ? Number(s.cab) : 0;
        return Math.min(cab, cabt);
    }
    private effCom(s: any): Num {
        if (s == null || s.committed == null) return s ? s.committed : null;
        return (s.committed as number) + this.banked(s);
    }
    // A CLOSED fiscal month (has an actuals-target basis but no live pipeline) can't take more pipeline,
    // so its own Add'l-needed is suppressed — the deficit is carried by its quarter row instead.
    private isClosedRow(s: any): boolean {
        return !!(s && (s.cabt || 0) > 0 && (s.committed == null || (s.committed as number) <= 0));
    }

    // Size the period table's nested scroll region to the actual visual viewport (minus the KPI cards +
    // section header + filter row above it) so it fills the tile and collapsed month rows scroll away
    // cleanly — removing the fixed 560px cap that trapped scrolling. Empty when no viewport reported yet.
    // Size the period table's nested scroll region to the actual visual viewport (minus the KPI cards +
    // section header + filter row above it) so it fills the tile. ALSO add scroll-past-end space at the
    // bottom (padding-bottom ~= one viewport) so ANY row — e.g. the FY27 Q1 roll-up — can be scrolled all
    // the way to the top and the month rows above it scroll fully out of view. Without this the scroll
    // stops as soon as the last row hits the bottom, trapping the months on screen. Empty when no
    // viewport reported yet (falls back to the .frz max-height:560px default).
    private tableWrapStyle(): string {
        const CHROME = 320;   // approx px of KPIs + section header + filter controls above the table
        if (!this.viewportH) return "";
        const h = Math.max(320, this.viewportH - CHROME);
        const pad = Math.max(160, h - 120);   // scroll-past-end room to lift any row to the top
        return `max-height:${h}px;padding-bottom:${pad}px;`;
    }

    // Deck column presets. The three views (ATU/STU/CSU) isolate a fixed column set for snapshotting
    // into the SBU Focus-Topic deck; movement is WoW-only in every view (the meeting standard). The
    // special columns Committed-total (ctot) and U2C appear ONLY in the views, never the default table.
    private static readonly MOVE_KEYS = new Set(["dodC", "wowC", "dodU", "wowU", "dodN", "wowN", "wowB"]);
    private tableCols(): string[] {
        switch (this.viewMode) {
            case "atu": return ["nm", "target", "ctot", "uncommitted", "nonqual", "addlU", "wowC", "wowU", "wowN"];
            case "stu": return ["nm", "target", "committed", "blocked", "ctot", "uncommitted", "coverage", "addlC", "u2c", "wowC"];
            case "csu": return ["nm", "target", "committed", "blocked", "ctot", "wowC", "wowB"];
            default:    return ["nm", "target", "committed", "blocked", "uncommitted", "nonqual", "coverage",
                                "addlC", "addlU", "dodC", "wowC", "dodU", "wowU", "dodN", "wowN"];
        }
    }
    private thFor(k: string): string {
        switch (k) {
            case "nm": return `<th class="nm">Period</th>`;
            case "target": return `<th>Target</th>`;
            case "committed": return `<th>Committed</th>`;
            case "blocked": return `<th>Blocked</th>`;
            case "ctot": return `<th>Committed<br><span class="th-sub">total</span></th>`;
            case "uncommitted": return `<th>Uncommitted</th>`;
            case "nonqual": return `<th class="nq">Non-Qual</th>`;
            case "coverage": return `<th>Coverage</th>`;
            case "addlC": return `<th>Add'l Committed<br><span class="th-sub">needed</span></th>`;
            case "addlU": return `<th>Add'l Uncommitted<br><span class="th-sub">needed</span></th>`;
            case "u2c": return `<th>U2C<br><span class="th-sub">add'l ÷ uncomm.</span></th>`;
            case "wowC": return `<th>Committed<br><span class="th-sub">WoW</span></th>`;
            case "wowU": return `<th>Uncommitted<br><span class="th-sub">WoW</span></th>`;
            case "wowN": return `<th>Non-Qual<br><span class="th-sub">WoW</span></th>`;
            case "wowB": return `<th>Blocked<br><span class="th-sub">WoW</span></th>`;
            default: return `<th></th>`;
        }
    }
    private tableHead(): string {
        const cols = this.tableCols();
        const nonMove = cols.filter(k => !Visual.MOVE_KEYS.has(k));
        let th = nonMove.map(k => this.thFor(k)).join("");
        if (this.viewMode === "") {
            // Default: keep the grouped DoD/WoW header (one grouped cell per metric, colspan 2).
            th += `<th colspan="2" class="grp-h"><span class="grp-top">Committed</span><span class="grp-sub"><span>DoD</span><span>WoW</span></span></th>`
                + `<th colspan="2" class="grp-h"><span class="grp-top">Uncommitted</span><span class="grp-sub"><span>DoD</span><span>WoW</span></span></th>`
                + `<th colspan="2" class="grp-h"><span class="grp-top">Non-Qual</span><span class="grp-sub"><span>DoD</span><span>WoW</span></span></th>`;
        } else {
            // Views: WoW-only, flat single columns.
            th += cols.filter(k => Visual.MOVE_KEYS.has(k)).map(k => this.thFor(k)).join("");
        }
        return `<thead><tr>${th}</tr></thead>`;
    }

    private rowCells(o: { name: string; lvl: number; expandable: boolean; openState: boolean; s: any; }): string {
        const s = o.s;
        const eff = this.effCom(s);
        const closed = this.isClosedRow(s);
        const cov = (s.target && eff != null) ? (eff as number) / s.target : null;
        const nC = closed ? null : this.needCom(s.target, eff);
        const nU = nC == null ? null : nC / 0.32;
        const nqVal = s.nq != null ? s.nq : s.nonqual;
        const ctot = (s.committed == null && s.blocked == null) ? null : (s.committed || 0) + (s.blocked || 0);
        const u2c = (nC != null && s.uncommitted) ? nC / (s.uncommitted as number) : null;
        const caret = o.expandable ? `<span class="caret ${o.openState ? "open" : ""}">▸</span> ` : "";
        const pad = 10 + o.lvl * 16;
        const cell = (k: string): string => {
            switch (k) {
                case "nm": return `<td class="nm" style="padding-left:${pad}px">${caret}${esc(o.name)}</td>`;
                case "target": return `<td>${compactUSD(s.target)}</td>`;
                case "committed": return `<td>${compactUSD(s.committed)}</td>`;
                case "blocked": return `<td>${compactUSD(s.blocked)}</td>`;
                case "ctot": return `<td>${compactUSD(ctot)}</td>`;
                case "uncommitted": return `<td>${compactUSD(s.uncommitted)}</td>`;
                case "nonqual": return `<td class="nq">${compactUSD(nqVal)}</td>`;
                case "coverage": return `<td>${cov == null ? "—" : `<span class="cov-pill ${covClass(cov)}">${pct(cov)}</span>`}</td>`;
                case "addlC": return `<td>${compactUSD(nC)}</td>`;
                case "addlU": return `<td>${compactUSD(nU)}</td>`;
                case "u2c": return `<td>${u2c == null ? "—" : pct(u2c)}</td>`;
                case "dodC": return `<td>${moveMK(s.dodC)}</td>`;
                case "wowC": return `<td>${moveMK(s.wowC)}</td>`;
                case "wowB": return `<td>${moveMKInv(s.wowB)}</td>`;
                case "dodU": return `<td>${moveMK(s.dodU)}</td>`;
                case "wowU": return `<td>${moveMK(s.wowU)}</td>`;
                case "dodN": return `<td>${moveMK(s.dodN)}</td>`;
                case "wowN": return `<td>${moveMK(s.wowN)}</td>`;
                default: return `<td></td>`;
            }
        };
        return this.tableCols().map(cell).join("");
    }

    private rowTr(o: { name: string; lvl: number; expandable: boolean; openState: boolean; type: string; key: string; cls: string; s: any; }): string {
        return `<tr class="prg lv${o.lvl} ${o.cls}${o.expandable ? " xp" : ""}" data-type="${o.type}" data-key="${esc(o.key)}">${this.rowCells(o)}</tr>`;
    }

    private bodyRows(periodsOfQ: PeriodInfo[], q: string, isAll: boolean): string {
        let rows = "";
        for (const p of periodsOfQ) {
            const isTotal = p.label === q;
            const pOpen = !!this.state.open[p.label];
            const spec = this.periodSpec(p.label, isAll);
            rows += this.rowTr({ name: isTotal ? "FY27 " + q + " (roll-up)" : p.label, lvl: 0, expandable: true, openState: pOpen,
                type: "period", key: p.label, cls: "period" + (isTotal ? " total" : "") + (pOpen ? " open" : ""), s: spec });
            if (!pOpen) continue;
            const byU = this.tree[p.label] || {};
            // Territories pass the active Territory + ATU Group + Segment filters (empty = all).
            const terrOk = (t: Terr) => (!this.terrSet.size || this.terrSet.has(t.territory))
                && (!this.grpSet.size || this.grpSet.has(t.grp))
                && this.terrInSeg(t.territory);
            const renderGroups = (su: string, baseLvl: number) => {
                const groups = byU[su] || {};
                Object.keys(groups)
                    .map(gn => ({ gn, terrs: groups[gn].filter(terrOk) }))
                    .filter(x => x.terrs.length)
                    .map(x => ({ gn: x.gn, terrs: x.terrs, spec: this.sumTerrs(x.terrs) }))
                    .sort((a, b) => (b.spec.committed || 0) - (a.spec.committed || 0))
                    .forEach(({ gn, terrs, spec }) => {
                        const gKey = `${p.label}|grp|${su}|${gn}`;
                        const gOpen = this.state.openKeys.has(gKey);
                        rows += this.rowTr({ name: gn, lvl: baseLvl, expandable: true, openState: gOpen, type: "acc", key: gKey,
                            cls: "lv-grp" + (gOpen ? " open" : ""), s: this.blendMs(p.label, { su, grp: gn }, spec) });
                        if (!gOpen) return;
                        terrs.slice().sort((a, b) => (b.committed || 0) - (a.committed || 0)).forEach(t =>
                            rows += this.rowTr({ name: t.territory, lvl: baseLvl + 1, expandable: false, openState: false, type: "terr", key: "",
                                cls: "lv-terr", s: this.blendMs(p.label, { su, grp: gn, terr: t.territory }, t) }));
                    });
            };
            // Units to break out: the selected Sales Units (if any), else every unit present.
            const unitList = Object.keys(byU).filter(u => !this.suSet.size || this.suSet.has(u));
            unitList.map(u => {
                const terrs0 = this.allTerrsForPeriod(p.label, u).filter(terrOk);
                return { u, terrs0, spec: this.sumTerrs(terrs0) };
            })
                .filter(x => x.terrs0.length)
                .sort((a, b) => (b.spec.committed || 0) - (a.spec.committed || 0))
                .forEach(({ u, terrs0, spec }) => {
                    const suKey = `${p.label}|su|${u}`;
                    const suOpen = this.state.openKeys.has(suKey);
                    // Target on the unit row: per-territory sum when a Territory filter is active, else
                    // the unit's official su-target (taken once).
                    const tgt = (this.terrSet.size || this.grpSet.size || this.segSet.size)
                        ? terrs0.reduce((acc, t) => acc + (t.target || 0), 0)
                        : (terrs0.length ? terrs0[0].suTarget : null);
                    // Movement on the SU row is the sum of its territories' account-sourced DoD/WoW
                    // (already aggregated in `spec`), so SU -> group -> territory all reconcile.
                    const specWithTgt = { committed: spec.committed, blocked: spec.blocked, uncommitted: spec.uncommitted,
                        nonqual: spec.nonqual, wow: spec.wow, target: tgt,
                        dodC: spec.dodC, wowC: spec.wowC, dodU: spec.dodU, wowU: spec.wowU,
                        dodN: spec.dodN, wowN: spec.wowN, wowB: spec.wowB, cab: spec.cab, cabt: spec.cabt };
                    rows += this.rowTr({ name: u, lvl: 1, expandable: true, openState: suOpen, type: "acc", key: suKey,
                        cls: "lv-su" + (suOpen ? " open" : ""), s: this.blendMs(p.label, { su: u }, specWithTgt) });
                    if (suOpen) renderGroups(u, 2);
                });
        }
        return rows;
    }

    private quarterTabs(active: string): string {
        return `<div class="seg-tabs" data-tabs="q">` +
            this.quarters.map(qk => `<button class="seg-tab ${qk === active ? "active" : ""}" data-q="${qk}">${qk}</button>`).join("") +
            `</div>`;
    }
    private multiDropdown(id: string, label: string, opts: { key: string; label: string }[], sel: Set<string>, searchVal?: string): string {
        const btn = sel.size ? `${sel.size} selected` : label;
        const open = this.ddOpen === id;
        const searchable = searchVal !== undefined;
        const qq = (searchVal || "").trim().toLowerCase();
        const shown = qq ? opts.filter(o => o.label.toLowerCase().includes(qq)) : opts;
        const searchBox = searchable
            ? `<input type="search" class="pl-dd-search" id="prgTerrSearch" placeholder="Search ${esc(label.toLowerCase())}…" value="${esc(searchVal || "")}" />`
            : "";
        const items = shown.map(o => `<label><input type="checkbox" value="${esc(o.key)}"${sel.has(o.key) ? " checked" : ""}> ${esc(o.label)}</label>`).join("")
            || `<div class="pl-empty">none</div>`;
        return `<div class="pl-dd" id="pdd_${id}">
          <button type="button" class="pl-dd-btn${sel.size ? " on" : ""}" data-dd="${id}">${esc(btn)} ▾</button>
          <div class="pl-dd-panel"${open ? "" : " hidden"} data-ddp="${id}">${searchBox}${items}</div>
        </div>`;
    }
    private filterControls(): string {
        const suOpts = this.unitOptions().map(o => ({ key: o.key, label: o.key }));
        const grpOpts = this.groupOptions().map(o => ({ key: o.key, label: o.key }));
        const terrOpts = this.territoryOptions().map(o => ({ key: o.key, label: o.key }));
        const segOpts = this.msSegOptions().map(o => ({ key: o.key, label: o.key }));
        const stageOpts = this.msStageOptions().map(o => ({ key: o.key, label: o.key }));
        return `<div class="su-toggle-row">
            <span class="su-toggle-lbl">Filter</span>
            ${this.periodDropdown()}
            ${this.multiDropdown("su", "All sales units", suOpts, this.suSet)}
            ${this.multiDropdown("grp", "All groups", grpOpts, this.grpSet)}
            ${this.multiDropdown("terr", "All territories", terrOpts, this.terrSet, this.terrSearch)}
            ${this.multiDropdown("seg", "All segments", segOpts, this.segSet)}
            ${this.multiDropdown("stage", "All stages", stageOpts, this.stageSet)}
            <button id="prgFilterClear" class="lnk">clear all filters</button>
            <span class="view-toggles" id="prgViews">
              <button class="vt${this.viewMode === "atu" ? " on" : ""}" data-view="atu" title="ATU deck view (Create & Qualify)">ATU</button>
              <button class="vt${this.viewMode === "stu" ? " on" : ""}" data-view="stu" title="STU deck view (Accelerate & Commit)">STU</button>
              <button class="vt${this.viewMode === "csu" ? " on" : ""}" data-view="csu" title="CSU deck view (Close & Consume)">CSU</button>
            </span>
          </div>`;
    }
    // Unified Period control: pick a whole quarter OR a single month (scopes BOTH grains).
    private periodDropdown(): string {
        const open = this.ddOpen === "period";
        const cur = this.selectedPeriodLabel();
        const btn = this.state.month === "all" ? `Period: ${this.state.q}` : `Period: ${cur}`;
        let items = "";
        for (const qq of (this.quarters.length ? this.quarters : ["Q1", "Q2", "Q3", "Q4"])) {
            const qSel = this.state.q === qq && this.state.month === "all";
            items += `<div class="pl-opt prg-qrow${qSel ? " sel" : ""}" data-period="${qq}|all">${qq} <span class="due-all">(whole quarter)</span></div>`;
            for (const [duemo, mlabel] of (QMONTHS[qq] || [])) {
                const mSel = this.state.q === qq && this.state.month === duemo;
                items += `<div class="pl-opt prg-mrow${mSel ? " sel" : ""}" data-period="${qq}|${duemo}">${esc(mlabel)}</div>`;
            }
        }
        return `<div class="pl-dd prg-period" id="pdd_period">
          <button type="button" class="pl-dd-btn on" data-dd="period">${esc(btn)} ▾</button>
          <div class="pl-dd-panel"${open ? "" : " hidden"} data-ddp="period">${items}</div>
        </div>`;
    }
    private setFor(id: string): Set<string> | null {
        return id === "su" ? this.suSet : id === "grp" ? this.grpSet : id === "terr" ? this.terrSet
            : id === "seg" ? this.segSet : id === "stage" ? this.stageSet : null;
    }
    private wowSpan(v: Num): string {
        if (v === 0 || v === null || v === undefined) return '<span class="wow zero">+$0</span>';
        const cls = v > 0 ? "pos" : "neg";
        return `<span class="wow ${cls}">${v > 0 ? "+" : "-"}${compactUSD(Math.abs(v))}</span>`;
    }

    private wire() {
        const rerender = () => this.render();
        // Period (Quarter/Month) single-select
        this.root.querySelectorAll(".prg-period .pl-opt[data-period]").forEach(o =>
            o.addEventListener("click", (e: any) => {
                e.stopPropagation();
                const v = String((o as HTMLElement).dataset.period || "");
                const [qq, mo] = v.split("|");
                this.state.q = qq; this.state.month = mo || "all";
                this.state.open = {}; this.state.openKeys.clear(); this.ddOpen = "";
                this.terrSet.clear(); this.terrSearch = "";
                rerender();
            }));
        // Filter dropdown toggles (period + all multi-selects)
        this.root.querySelectorAll(".pl-dd-btn").forEach(b =>
            b.addEventListener("click", (e: any) => {
                e.stopPropagation();
                const id = (b as HTMLElement).dataset.dd as string;
                this.ddOpen = this.ddOpen === id ? "" : id;
                rerender();
            }));
        // Multi-select panels (su / grp / terr / seg / stage)
        this.root.querySelectorAll(".pl-dd-panel").forEach(p => {
            p.addEventListener("click", (e: any) => e.stopPropagation());
            p.addEventListener("change", (e: any) => {
                const cb = e.target as HTMLInputElement;
                if (!cb || cb.type !== "checkbox") return;
                const id = (p as HTMLElement).dataset.ddp as string;
                const sel = this.setFor(id);
                if (!sel) return;
                if (cb.checked) sel.add(cb.value); else sel.delete(cb.value);
                // If a Sales Unit is deselected, drop territory/group picks that no longer belong.
                if (id === "su") {
                    if (this.terrSet.size) {
                        const validT = new Set(this.territoryOptions().map(o => o.key));
                        Array.from(this.terrSet).forEach(k => { if (!validT.has(k)) this.terrSet.delete(k); });
                    }
                    if (this.grpSet.size) {
                        const validG = new Set(this.groupOptions().map(o => o.key));
                        Array.from(this.grpSet).forEach(k => { if (!validG.has(k)) this.grpSet.delete(k); });
                    }
                }
                // If an ATU Group is changed, drop territory picks no longer in scope (Territory
                // options now respect the group selection too).
                if (id === "grp" && this.terrSet.size) {
                    const validT = new Set(this.territoryOptions().map(o => o.key));
                    Array.from(this.terrSet).forEach(k => { if (!validT.has(k)) this.terrSet.delete(k); });
                }
                const scrollTop = (p as HTMLElement).scrollTop;
                rerender();
                const np = this.root.querySelector(`.pl-dd-panel[data-ddp="${id}"]`) as HTMLElement;
                if (np) np.scrollTop = scrollTop;
            });
        });
        const ts = this.root.querySelector("#prgTerrSearch") as HTMLInputElement;
        if (ts) ts.addEventListener("input", () => { this.terrSearch = ts.value; this.ddOpen = "terr"; rerender(); });
        const ms = this.root.querySelector("#prgMsSearch") as HTMLInputElement;
        if (ms) ms.addEventListener("input", () => { this.msSearch = ms.value; rerender(); });
        const fc = this.root.querySelector("#prgFilterClear");
        if (fc) fc.addEventListener("click", () => {
            this.suSet.clear(); this.grpSet.clear(); this.terrSet.clear(); this.segSet.clear();
            this.terrSearch = ""; this.msSearch = ""; this.ddOpen = "";
            // restore default sales-stage filter = ALL stages (Non-Qual visible)
            this.stageSet = new Set();
            rerender();
        });
        // Deck view toggles (ATU/STU/CSU): click to isolate that view's columns; click the active one
        // again to return to the full default table. Mutually exclusive.
        const vw = this.root.querySelector("#prgViews");
        if (vw) vw.addEventListener("click", (e: any) => {
            const btn = e.target && (e.target as HTMLElement).closest ? (e.target as HTMLElement).closest("[data-view]") : null;
            if (!btn) return;
            const v = (btn as HTMLElement).getAttribute("data-view") || "";
            this.viewMode = this.viewMode === v ? "" : v;
            rerender();
        });
        // MSX deep-link on the milestone name (launchUrl; <a target=_blank> blocked in sandbox)
        const msBody = this.root.querySelector("#prgMsBody") as HTMLElement;
        if (msBody) msBody.addEventListener("click", (e: any) => {
            const a = (e.target as HTMLElement).closest("a.msx-lnk[data-msx]") as HTMLElement;
            if (!a) return;
            e.preventDefault(); e.stopPropagation();
            const url = a.getAttribute("data-msx");
            if (url) { try { this.host.launchUrl(url); } catch (_) { /* noop */ } }
        });
        // Expand/collapse rows in the territory table
        this.root.querySelectorAll("tr.xp").forEach(tr =>
            tr.addEventListener("click", () => {
                const el = tr as HTMLElement; const type = el.dataset.type;
                if (type === "period") { const l = el.dataset.key as string; if (this.state.open[l]) delete this.state.open[l]; else this.state.open[l] = true; }
                else { const k = el.dataset.key as string; if (this.state.openKeys.has(k)) this.state.openKeys.delete(k); else this.state.openKeys.add(k); }
                rerender();
            }));
    }
}
