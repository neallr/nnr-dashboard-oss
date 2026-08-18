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

interface MS {
    id: string; due: string; duemo: string; pk: string; nonrec: string;
    tpid: string; acct: string; terr: string; atu: string; su: string; seg: string;
    own: string; mgr: string; grp: string; stage: string; st: string; cat: string;
    cf: number; commitment: string; sp: string; ssp: string; nm: string; wl: string;
    link: string; macc: boolean; hc: boolean; acr: string;
    m_amt: number; m_cp: number; m_bl: number; m_ucp: number; m_qp: number; m_nq: number;
    q_amt: number; q_cp: number; q_bl: number; q_ucp: number; q_qp: number; q_nq: number;
    m_cp_dod: number | null; m_cp_wow: number | null; m_ucp_dod: number | null; m_ucp_wow: number | null;
    q_cp_dod: number | null; q_cp_wow: number | null; q_ucp_dod: number | null; q_ucp_wow: number | null;
    m_bl_dod: number | null; m_bl_wow: number | null; q_bl_dod: number | null; q_bl_wow: number | null;
    commitment_prev_dod: string | null; st_prev_dod: string | null; due_prev_dod: string | null;
    isNonQual: boolean;
    [k: string]: any;
}

// Restricted raw territories: customer identity masked in the milestone table (all cells hidden,
// not searchable by name) but STILL counted in every aggregation. Mirrors the source-side redaction
// in build_data (_is_restricted_tname): the PSNS sub-unit + the specific NIGov.01.UM.ACC.01 territory.
function isRestrictedTerr(terr: any): boolean {
    const t = String(terr || "");
    return t.startsWith("UK.PS.PSNS") || t.startsWith("IE.PS.NIGov.01.UM.ACC.01");
}

function money(v: Num): string {
    if (v === null || v === undefined) return "—";
    const a = Math.abs(v);
    if (a >= 1e6) return (v < 0 ? "-" : "") + "$" + (a / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return (v < 0 ? "-" : "") + "$" + Math.round(a / 1e3).toLocaleString() + "K";
    return (v < 0 ? "-" : "") + "$" + Math.round(a).toLocaleString();
}
function esc(s: any): string {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]));
}
function parseThreshold(s: string): number | null {
    if (s == null) return null;
    let t = String(s).trim().replace(/[$,\s]/g, "");
    if (!t) return null;
    let mult = 1; const last = t.slice(-1).toLowerCase();
    if (last === "m") { mult = 1e6; t = t.slice(0, -1); }
    else if (last === "k") { mult = 1e3; t = t.slice(0, -1); }
    const n = parseFloat(t);
    return isNaN(n) ? null : n * mult;
}

// Quarter -> its three fiscal months (key = duemo "YYYY-MM" suffix, label = short month).
const PERIODS: any = {
    q1: { label: "Q1", months: [["2026-07", "Jul"], ["2026-08", "Aug"], ["2026-09", "Sep"]] },
    q2: { label: "Q2", months: [["2026-10", "Oct"], ["2026-11", "Nov"], ["2026-12", "Dec"]] },
    q3: { label: "Q3", months: [["2027-01", "Jan"], ["2027-02", "Feb"], ["2027-03", "Mar"]] },
    q4: { label: "Q4", months: [["2027-04", "Apr"], ["2027-05", "May"], ["2027-06", "Jun"]] }
};

// The 16 display columns: [data key, header, numeric?]. Pipeline Amount is virtual ("amt").
// Sales-stage funnel order (top to bottom): LC, ID, EA, RV, MO.
const STAGE_ORDER = ["Listen & Consult", "Inspire & Design", "Empower & Achieve", "Realize Value", "Manage & Optimize"];

const COLS: [string, string, boolean][] = [
    ["acct", "Account", false],
    ["tpid", "TPID", false],
    ["id", "Milestone Id", false],
    ["nm", "Milestone", false],
    ["amt", "Pipeline Amount", true],
    ["commitment", "Commitment", false],
    ["st", "Status", false],
    ["due", "Est. Due", false],
    ["stage", "Sales Stage", false],
    ["ssp", "Super Pillar", false],
    ["sp", "Strategic Pillar", false],
    ["wl", "Workload", false],
    ["own", "Owner", false],
    ["mgr", "Owner Manager", false],
    ["grp", "Owner Group", false]
];

export class Visual implements IVisual {
    private root: HTMLElement;
    private host!: IVisualHost;
    private events: any = null;
    private errEl!: HTMLElement;
    private bodyEl!: HTMLElement;
    private hasRendered = false;
    private reveal = false;   // PSNS-team instance: show restricted identities unmasked (display.reveal)

    private rows: MS[] = [];
    private deps: any[] = [];
    private units: string[] = [];
    // multi-select filter sets (empty = all)
    private statusSet = new Set<string>();
    private stageSet = new Set<string>();
    private commitSet = new Set<string>();
    private wlSet = new Set<string>();
    private mgrSet = new Set<string>();
    private grpSet = new Set<string>();
    private terrSet = new Set<string>();
    private ownSet = new Set<string>();
    private sspSet = new Set<string>();
    private spSet = new Set<string>();
    private suSet = new Set<string>();
    private ddOpen = "";   // which dropdown panel is open
    private ddSearch: Record<string, string> = {};   // per-dropdown search text
    private _persistLast = "";

    private state = {
        period: "q1", month: "all", sortKey: "amt", sortDir: -1,
        search: "", unit: "", maccOnly: false, highOnly: false,
        thMetric: "cp", thOp: ">=", thVal: ""
    };

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
                self.showErr("WINDOW.ERROR: " + (ev && ev.message ? ev.message : ev) + (ev && ev.error && ev.error.stack ? "\n" + ev.error.stack : ""));
            });
        } catch (e: any) {
            this.root.innerHTML = '<pre style="color:#c00;white-space:pre-wrap;font:11px monospace;padding:10px;">CTOR ERROR: ' + (e && e.stack ? e.stack : String(e)) + '</pre>';
        }
    }

    private showErr(msg: string) {
        if (this.errEl) { this.errEl.style.padding = "8px 10px"; this.errEl.textContent = String(msg).slice(0, 2000); }
    }

    public update(options: VisualUpdateOptions) {
        try { if (this.events && this.events.renderingStarted) this.events.renderingStarted(options); } catch (e) { /* noop */ }
        try {
            const dv: DataView = options.dataViews && options.dataViews[0];
            const hasTable = !!(dv && dv.table);
            const nrows = hasTable && dv.table.rows ? dv.table.rows.length : 0;
            const ncols = hasTable && dv.table.columns ? dv.table.columns.length : 0;
            if (!hasTable || nrows === 0 || ncols === 0) {
                if (!this.hasRendered) this.bodyEl.innerHTML = this.attn("Waiting for data… (rows=" + nrows + " cols=" + ncols + ")");
                try { if (this.events && this.events.renderingFinished) this.events.renderingFinished(options); } catch (e) { /* noop */ }
                return;
            }
            this.reshape(dv.table);
            // Default period scope from format pane (q1..q4); only applied before first render.
            if (!this.hasRendered) {
                try {
                    const objs: any = dv && dv.metadata && (dv.metadata as any).objects;
                    const sv = objs && objs.display && objs.display.scope;
                    const s = sv && sv.toString ? String(sv) : "";
                    if (PERIODS[s]) { this.state.period = s; }
                } catch (e) { /* keep default */ }
            }
            // Reveal-restricted flag (per-instance): the PSNS-team dashboard sets display.reveal=true so
            // PSNS/NIGov rows render unmasked. Read every update (cheap) so it also reflects live edits.
            try {
                const objs: any = dv && dv.metadata && (dv.metadata as any).objects;
                this.reveal = !!(objs && objs.display && objs.display.reveal);
            } catch (e) { /* default masked */ }
            if (!this.rows.length) {
                if (!this.hasRendered) this.bodyEl.innerHTML = this.attn("No milestones parsed.");
                try { if (this.events && this.events.renderingFinished) this.events.renderingFinished(options); } catch (e) { /* noop */ }
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

    private attn(msg: string): string {
        return `<div style="font-family:'Segoe UI',monospace;padding:14px;color:#8a5a00;background:#fff4e5;border:1px solid #f0c47a;border-radius:8px;margin:10px;white-space:pre-wrap;font-size:12px;line-height:1.4;">${esc(msg)}</div>`;
    }

    private reshape(t: DataViewTable) {
        const col: Record<string, number> = {};
        t.columns.forEach((c, i) => { const r: any = c.roles || {}; Object.keys(r).forEach(k => { if (r[k]) col[k] = i; }); });
        const g = (row: any[], role: string): any => { const i = col[role]; return i === undefined ? null : row[i]; };
        const n = (row: any[], role: string): number => { const v = g(row, role); return v === null || v === undefined ? 0 : Number(v); };
        const gN = (row: any[], role: string): number | null => { const v = g(row, role); return v === null || v === undefined ? null : Number(v); };
        const gS = (row: any[], role: string): string | null => { const v = g(row, role); return v === null || v === undefined || v === "" ? null : String(v); };
        const s = (row: any[], role: string): string => { const v = g(row, role); return v === null || v === undefined ? "" : String(v); };
        const bool = (row: any[], role: string): boolean => { const v = g(row, role); return v === true || v === 1 || v === "true" || v === "MACC" || v === "HC"; };

        this.rows = [];
        this.deps = [];
        const uset = new Set<string>();
        for (const row of t.rows as any[][]) {
            const id = g(row, "id"); if (id == null) continue;
            // Pipeline Departures rows (sec="dep") are a separate grain (milestones that LEFT the open
            // pipeline). Route them to this.deps and render in the panel below the table — never mixed
            // into the milestone rows/aggregations.
            if (s(row, "sec") === "dep") {
                this.deps.push({
                    id: String(id), acct: s(row, "acct"), tpid: s(row, "tpid"), nm: s(row, "nm"),
                    link: s(row, "link"),
                    due: s(row, "due"), duemo: s(row, "duemo"), pk: s(row, "pk"),
                    terr: s(row, "terr"), atu: s(row, "atu"), su: s(row, "su"), seg: s(row, "seg"),
                    own: s(row, "own"), mgr: s(row, "mgr"), grp: s(row, "grp"),
                    sp: s(row, "sp"), ssp: s(row, "ssp"), wl: s(row, "wl"),
                    st: s(row, "st"), was: s(row, "was"), reason: s(row, "reason"),
                    last_pipe: n(row, "last_pipe"), macc: bool(row, "macc"), hc: bool(row, "hc"),
                    // was: pills — same fields the milestone table uses, so wasPill() just works.
                    commitment: s(row, "commitment") || (n(row, "cf") === 1 ? "Committed" : (s(row, "cf") ? "Uncommitted" : "")),
                    commitment_prev_dod: gS(row, "commitment_prev_dod"),
                    st_prev_dod: gS(row, "st_prev_dod"), due_prev_dod: gS(row, "due_prev_dod"),
                    pipe_prev: gN(row, "pipe_prev"),
                    // period the milestone WAS due in (what it left) — drives period-relative filtering.
                    fromp: s(row, "fromp"), fromm: s(row, "fromm")
                });
                continue;
            }
            const su = s(row, "su");
            if (su) uset.add(su);
            this.rows.push({
                id: String(id), due: s(row, "due"), duemo: s(row, "duemo"), pk: s(row, "pk"), nonrec: s(row, "nonrec"),
                tpid: s(row, "tpid"), acct: s(row, "acct"), terr: s(row, "terr"), atu: s(row, "atu"),
                su, seg: s(row, "seg"), own: s(row, "own"), mgr: s(row, "mgr"), grp: s(row, "grp"),
                stage: s(row, "stage"), st: s(row, "st"), cat: s(row, "cat"), cf: n(row, "cf"),
                commitment: s(row, "commitment") || (n(row, "cf") === 1 ? "Committed" : "Uncommitted"),
                sp: s(row, "sp"), ssp: s(row, "ssp"), nm: s(row, "nm"), wl: s(row, "wl"),
                link: s(row, "link"), macc: bool(row, "macc"), hc: bool(row, "hc"), acr: s(row, "acr"),
                m_amt: n(row, "m_amt"), m_cp: n(row, "m_cp"), m_bl: n(row, "m_bl"), m_ucp: n(row, "m_ucp"), m_qp: n(row, "m_qp"), m_nq: n(row, "m_nq"),
                q_amt: n(row, "q_amt"), q_cp: n(row, "q_cp"), q_bl: n(row, "q_bl"), q_ucp: n(row, "q_ucp"), q_qp: n(row, "q_qp"), q_nq: n(row, "q_nq"),
                m_cp_dod: gN(row, "m_cp_dod"), m_cp_wow: gN(row, "m_cp_wow"),
                m_ucp_dod: gN(row, "m_ucp_dod"), m_ucp_wow: gN(row, "m_ucp_wow"),
                q_cp_dod: gN(row, "q_cp_dod"), q_cp_wow: gN(row, "q_cp_wow"),
                q_ucp_dod: gN(row, "q_ucp_dod"), q_ucp_wow: gN(row, "q_ucp_wow"),
                m_bl_dod: gN(row, "m_bl_dod"), m_bl_wow: gN(row, "m_bl_wow"),
                q_bl_dod: gN(row, "q_bl_dod"), q_bl_wow: gN(row, "q_bl_wow"),
                commitment_prev_dod: gS(row, "commitment_prev_dod"),
                st_prev_dod: gS(row, "st_prev_dod"), due_prev_dod: gS(row, "due_prev_dod"),
                isNonQual: false
            });
            // Non-Qualified: Listen & Consult with no committed/uncommitted pipeline (any lens) — its
            // value lives only in the non-qualified (nq) measure. Shown as "Non-Qualified" in the
            // commitment column with the nq value as pipeline amount; EXCLUDED from all cp/ucp/total maths.
            const last = this.rows[this.rows.length - 1];
            last.isNonQual = last.stage === "Listen & Consult" && last.m_cp === 0 && last.m_ucp === 0 && last.q_cp === 0 && last.q_ucp === 0;
        }
        this.units = Array.from(uset).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
        this.applyDefaultFilters();
    }

    // Default sales-stage filter EXCLUDES Listen & Consult (non-qualified noise) on first load.
    private _filtersDefaulted = false;
    private applyDefaultFilters() {
        if (this._filtersDefaulted || !this.rows.length) return;
        this.stageSet = new Set(this.rows.map(r => r.stage).filter(s => s && s !== "Listen & Consult"));
        this._filtersDefaulted = true;
    }

    // ---- period / lens helpers ----
    // The Pipeline Amount (and cp/ucp) shown depends on the selected period:
    //  - month selected -> the milestone's MONTH (diagonal) value, but only if it is DUE that month.
    //  - quarter ("all") -> the milestone's QUARTER (carry-forward) value, for milestones in that quarter.
    private isMonth(): boolean { return this.state.month !== "all"; }
    // Restricted territories: rows shown MASKED in the milestone table (all cells hidden) but STILL
    // counted in every aggregation (KPIs, account roll-up, pillar tiles, totals).
    private isRestricted(r: MS): boolean {
        if (this.reveal) return false;   // PSNS-team dashboard: reveal restricted identities unmasked
        return isRestrictedTerr(r.terr);
    }
    private inScope(r: MS): boolean {
        if (this.isMonth()) return r.duemo === this.state.month;
        return r.pk === this.state.period;
    }
    private amt(r: MS): number { return this.isMonth() ? r.m_amt : r.q_amt; }
    private cpOf(r: MS): number { return this.isMonth() ? r.m_cp : r.q_cp; }
    private blOf(r: MS): number { return (this.isMonth() ? r.m_bl : r.q_bl) || 0; }
    private ucpOf(r: MS): number { return this.isMonth() ? r.m_ucp : r.q_ucp; }
    private nqOf(r: MS): number { return this.isMonth() ? r.m_nq : r.q_nq; }
    // Displayed pipeline amount: nq for Non-Qualified rows, else cp+ucp. Used for sort/threshold/cell
    // display only — the maths (KPI/rollup/pillar sums) always use amt()/cpOf()/ucpOf() which are 0 for NQ.
    private displayAmt(r: MS): number { return r.isNonQual ? this.nqOf(r) : this.amt(r); }
    // Displayed commitment: Non-Qualified milestones (LC, no cp/ucp) show "Non-Qualified", else their cf label.
    private displayCommitment(r: MS): string { return r.isNonQual ? "Non-Qualified" : r.commitment; }
    private periodLabel(): string {
        if (!this.isMonth()) return PERIODS[this.state.period].label;
        const m = (PERIODS[this.state.period].months as any[]).find(x => x[0] === this.state.month);
        return m ? m[1] : PERIODS[this.state.period].label;
    }

    // distinct option list for a multi-select dropdown, scoped to current period + sales unit.
    // sort: "value" ($-ranked) | "alpha" (A-Z) | "alphanum" (territory codes) | "stage" (funnel order).
    private optionsFor(field: keyof MS, sort: "value" | "alpha" | "alphanum" | "stage" = "value"): { key: string; cp: number }[] {
        const m = new Map<string, number>();
        for (const r of this.rows) {
            if (!this.inScope(r)) continue;
            // scope options by the selected sales unit(s) — except when building the su list itself
            if (field !== "su" && this.suSet.size && !this.suSet.has(r.su)) continue;
            const k = field === "commitment" ? this.displayCommitment(r) : String(r[field] || "");
            if (!k) continue;
            m.set(k, (m.get(k) || 0) + this.amt(r));
        }
        const arr = Array.from(m.entries()).map(([key, cp]) => ({ key, cp }));
        if (sort === "alpha") arr.sort((x, y) => x.key.localeCompare(y.key, undefined, { sensitivity: "base" }));
        else if (sort === "alphanum") arr.sort((x, y) => x.key.localeCompare(y.key, undefined, { numeric: true, sensitivity: "base" }));
        else if (sort === "stage") arr.sort((x, y) => STAGE_ORDER.indexOf(x.key) - STAGE_ORDER.indexOf(y.key));
        else arr.sort((x, y) => y.cp - x.cp || x.key.localeCompare(y.key));
        return arr;
    }

    private filtered(): MS[] {
        const q = this.state.search.trim().toLowerCase();
        let rows = this.rows.filter(r => {
            if (!this.inScope(r)) return false;
            if (this.suSet.size && !this.suSet.has(r.su)) return false;
            if (this.state.maccOnly && !r.macc) return false;
            if (this.state.highOnly && !r.hc) return false;
            if (this.statusSet.size && !this.statusSet.has(r.st)) return false;
            if (this.stageSet.size && !this.stageSet.has(r.stage)) return false;
            if (this.commitSet.size && !this.commitSet.has(this.displayCommitment(r))) return false;
            if (this.wlSet.size && !this.wlSet.has(r.wl)) return false;
            if (this.sspSet.size && !this.sspSet.has(r.ssp)) return false;
            if (this.spSet.size && !this.spSet.has(r.sp)) return false;
            if (this.terrSet.size && !this.terrSet.has(r.terr)) return false;
            if (this.ownSet.size && !this.ownSet.has(r.own)) return false;
            if (this.mgrSet.size && !this.mgrSet.has(r.mgr)) return false;
            if (this.grpSet.size && !this.grpSet.has(r.grp)) return false;
            // Restricted rows: don't let the masked name/account/owner be a search vector.
            if (q) {
                const hay = this.isRestricted(r) ? (r.tpid || "") : (r.acct + " " + r.tpid + " " + r.nm + " " + r.own);
                if (!hay.toLowerCase().includes(q)) return false;
            }
            return true;
        });
        // ACCOUNT-LEVEL pipeline threshold. The threshold gates whole ACCOUNTS by their
        // rolled-up metric (Committed / Uncommitted / Total, in the current period lens),
        // then keeps EVERY milestone of the surviving accounts. So e.g. "Committed < 0"
        // reduces the account list to accounts whose committed roll-up is < 0 — accounts
        // that still have positive uncommitted pipeline remain visible — and the milestone
        // table below is simply those accounts' milestones, still honouring every other
        // filter applied above. (Aggregated over the already-filtered rows so it composes
        // with the other selectors.) cp/ucp/amt mirror the account-table columns exactly.
        const thVal = parseThreshold(this.state.thVal);
        if (thVal !== null) {
            const metricOf = (r: MS) => this.state.thMetric === "cp" ? this.cpOf(r)
                : this.state.thMetric === "ucp" ? this.ucpOf(r) : this.amt(r);
            const agg = new Map<string, number>();
            for (const r of rows) {
                const key = r.tpid || r.acct;
                agg.set(key, (agg.get(key) || 0) + metricOf(r));
            }
            const passVal = (v: number): boolean => {
                switch (this.state.thOp) {
                    case ">=": return v >= thVal; case "<=": return v <= thVal;
                    case ">": return v > thVal; case "<": return v < thVal; case "=": return v === thVal;
                }
                return true;
            };
            const keep = new Set<string>();
            agg.forEach((v, k) => { if (passVal(v)) keep.add(k); });
            rows = rows.filter(r => keep.has(r.tpid || r.acct));
        }
        const k = this.state.sortKey, dir = this.state.sortDir;
        const val = (r: MS): any => k === "amt" ? this.displayAmt(r) : r[k];
        rows.sort((a, b) => {
            let va: any = val(a), vb: any = val(b);
            if (typeof va === "number" || typeof vb === "number") return ((va || 0) - (vb || 0)) * dir;
            va = String(va == null ? "" : va).toLowerCase(); vb = String(vb == null ? "" : vb).toLowerCase();
            return va < vb ? -dir : va > vb ? dir : 0;
        });
        return rows;
    }

    private hasFilterSel(): boolean {
        return this.statusSet.size > 0 || this.stageSet.size > 0 || this.commitSet.size > 0 ||
            this.wlSet.size > 0 || this.mgrSet.size > 0 || this.grpSet.size > 0 ||
            this.terrSet.size > 0 || this.ownSet.size > 0 || this.sspSet.size > 0 || this.spSet.size > 0;
    }

    private monthTabs(): { key: string; label: string }[] {
        return [{ key: "all", label: "All" }].concat((PERIODS[this.state.period].months as any[]).map(m => ({ key: m[0], label: m[1] })));
    }

    // Single-select "Est. Due Date" dropdown: each quarter (selectable = whole quarter) with its three
    // months nested+indented (selectable = that month). value encoding "<period>|<month|all>".
    private dueDropdown(): string {
        const open = this.ddOpen === "due";
        const cur = this.isMonth() ? `${this.state.period}|${this.state.month}` : `${this.state.period}|all`;
        const btnLabel = this.isMonth()
            ? `${PERIODS[this.state.period].label} · ${this.periodLabel()}`
            : PERIODS[this.state.period].label;
        let items = "";
        for (const p of Object.keys(PERIODS)) {
            const qVal = `${p}|all`;
            items += `<label class="due-opt due-qrow"><input type="radio" name="duesel" value="${qVal}"${cur === qVal ? " checked" : ""}> ${PERIODS[p].label} <span class="due-all">(whole quarter)</span></label>`;
            for (const [mo, ml] of PERIODS[p].months as any[]) {
                const mVal = `${p}|${mo}`;
                items += `<label class="due-opt due-mo"><input type="radio" name="duesel" value="${mVal}"${cur === mVal ? " checked" : ""}> ${ml}</label>`;
            }
        }
        return `<div class="pl-dd due-dd" id="dd_due">
          <button type="button" class="pl-dd-btn on" data-dd="due">Est. Due Date: ${esc(btnLabel)} ▾</button>
          <div class="pl-dd-panel"${open ? "" : " hidden"} data-ddp="due">${items}</div>
        </div>`;
    }

    private dropdown(id: string, label: string, field: keyof MS, sel: Set<string>,
                     opts: { searchable?: boolean; sort?: "value" | "alpha" | "alphanum" | "stage" } = {}): string {
        const all = this.optionsFor(field, opts.sort || "value");
        const btn = sel.size ? `${sel.size} selected` : label;
        const open = this.ddOpen === id;
        const q = (this.ddSearch[id] || "").trim().toLowerCase();
        const shown = q ? all.filter(o => o.key.toLowerCase().includes(q)) : all;
        const searchBox = opts.searchable
            ? `<input type="search" class="pl-dd-search" id="ddsearch_${id}" placeholder="Search ${esc(label.toLowerCase())}…" value="${esc(this.ddSearch[id] || "")}" />`
            : "";
        const items = shown.map(o => `<label><input type="checkbox" value="${esc(o.key)}"${sel.has(o.key) ? " checked" : ""}> ${esc(o.key)}</label>`).join("")
            || `<div class="pl-empty" style="padding:6px 10px">none</div>`;
        return `<div class="pl-dd" id="dd_${id}">
          <button type="button" class="pl-dd-btn${sel.size ? " on" : ""}" data-dd="${id}">${esc(btn)} ▾</button>
          <div class="pl-dd-panel"${open ? "" : " hidden"} data-ddp="${id}">${searchBox}${items}</div>
        </div>`;
    }

    // Lightweight SINGLE-select dropdown reusing the .pl-dd panel. Native <select> popups
    // mis-position (open sideways/upward, detached) inside the Power BI sandbox iframe; this
    // CSS-anchored panel behaves like every other filter here. options = [value, label][].
    private singleSelect(id: string, current: string, options: [string, string][], narrow = false): string {
        const open = this.ddOpen === id;
        const cur = options.find(o => o[0] === current) || options[0];
        const items = options.map(([val, lbl]) =>
            `<div class="pl-opt${val === current ? " sel" : ""}" data-ss="${id}" data-val="${esc(val)}">${esc(lbl)}</div>`).join("");
        return `<div class="pl-dd ss-dd${narrow ? " ss-narrow" : ""}" id="dd_${id}">
          <button type="button" class="pl-dd-btn ss-btn" data-dd="${id}">${esc(cur[1])} ▾</button>
          <div class="pl-dd-panel"${open ? "" : " hidden"} data-ddp="${id}">${items}</div>
        </div>`;
    }

    // ---- PILLAR TILES (row 2): super-pillar table + 3 "by strategic pillar" bar tiles ------------
    // Built from the SAME filtered milestone rows (ssp = super pillar, sp = strategic pillar), using
    // the current period lens (q_ when a quarter is selected, m_ when a month is). Mirrors the web app.
    private pillarTiles(rows: MS[]): string {
        const lbl = this.periodLabel();
        const cp = (r: MS) => this.cpOf(r), ucp = (r: MS) => this.ucpOf(r);
        // strategic-pillar aggregation for the 3 bar tiles
        const agg = new Map<string, { cp: number; ucp: number }>();
        let tCp = 0, tUcp = 0;
        for (const r of rows) {
            const k = r.sp || "UNKNOWN";
            const e = agg.get(k) || { cp: 0, ucp: 0 };
            e.cp += cp(r); e.ucp += ucp(r); agg.set(k, e);
            tCp += cp(r); tUcp += ucp(r);
        }
        const items = Array.from(agg.entries()).map(([strat, v]) => ({ strat, ...v }));
        const tile = (title: string, sub: string, pick: (x: { cp: number; ucp: number }) => number, tot: number) => {
            const top = items.map(it => ({ strat: it.strat, v: pick(it) }))
                .filter(x => x.v !== 0).sort((a, b) => b.v - a.v).slice(0, 7);
            const max = top.reduce((mx, x) => Math.max(mx, Math.abs(x.v)), 0) || 1;
            const bars = top.length ? top.map(x => `
                <div class="pl-row"><span class="pl-name" title="${esc(x.strat)}">${esc(x.strat)}</span>
                  <span class="pl-bar"><i style="width:${Math.round(Math.abs(x.v) / max * 100)}%"></i></span>
                  <span class="pl-val">${money(x.v)}</span></div>`).join("")
                : `<div class="pl-empty">no pillar pipeline</div>`;
            return `<div class="kpi pl-tile"><div class="k-label">${esc(title)} <span class="pl-by">by pillar</span></div>
              <div class="k-value pl-tot">${money(tot)}</div><div class="pl-sub">${esc(sub)}</div>${bars}</div>`;
        };
        // super-pillar table (Committed + Uncommitted columns)
        const sup = new Map<string, { cp: number; ucp: number }>();
        for (const r of rows) {
            const k = r.ssp || "UNKNOWN";
            const e = sup.get(k) || { cp: 0, ucp: 0 };
            e.cp += cp(r); e.ucp += ucp(r); sup.set(k, e);
        }
        const supRows = Array.from(sup.entries()).map(([s, v]) => ({ s, ...v }))
            .sort((a, b) => (b.cp + b.ucp) - (a.cp + a.ucp));
        const supBody = supRows.length ? supRows.map(x => `
            <div class="pl-srow"><span class="pl-sname" title="${esc(x.s)}">${esc(x.s)}</span>
              <span class="pl-sval">${money(x.cp)}</span><span class="pl-sval">${money(x.ucp)}</span></div>`).join("")
            : `<div class="pl-empty">no pillar pipeline</div>`;
        const superTile = `<div class="kpi pl-tile pl-super"><div class="k-label">Super Strategic Pillar</div>
          <div class="pl-shead"><span class="pl-sname"></span><span class="pl-sval">Committed</span><span class="pl-sval">Uncommitted</span></div>
          <div class="pl-slist">${supBody}</div></div>`;
        return `<div class="kpis kpis-live pl-tiles">
          ${superTile}
          ${tile(lbl + " Committed", `${items.length} strategic pillars`, x => x.cp, tCp)}
          ${tile(lbl + " Uncommitted", "conversion headroom", x => x.ucp, tUcp)}
          ${tile(lbl + " Total", "committed + uncommitted", x => x.cp + x.ucp, tCp + tUcp)}
        </div>`;
    }

    // ---- ACCOUNT ROLL-UP (the upper table) -------------------------------------------------------
    // The account summary is a pure roll-up of the SAME filtered milestone rows: group by TPID, then
    // month columns = DIAGONAL (m_cp where duemo==month) and quarter column = CARRY (q_cp). DoD/WoW =
    // sum of the per-milestone deltas (null until the snapshot store has a comparable prior). One
    // filter bar therefore governs both tables by construction; both reconcile to the Accounts feed.
    private aggregateAccounts(rows: MS[]): any[] {
        const months: string[] = (PERIODS[this.state.period].months as any[]).map(m => m[0]);
        const map = new Map<string, any>();
        const addD = (o: any, k: string, v: number | null) => {
            if (v === null || v === undefined) return;          // absent -> stays null (renders —)
            o[k] = (o[k] || 0) + v; o["_has_" + k] = true;
        };
        for (const r of rows) {
            const key = r.tpid || r.acct || r.id;
            let a = map.get(key);
            if (!a) {
                a = { tpid: r.tpid, acct: r.acct, su: r.su, terr: r.terr, macc: r.macc, hc: r.hc, acr: r.acr,
                      months: {}, q_cp: 0, q_ucp: 0 };
                for (const mo of months) a.months[mo] = { cp: 0, ucp: 0 };
                map.set(key, a);
            }
            a.q_cp += r.q_cp + (r.q_bl || 0); a.q_ucp += r.q_ucp;
            addD(a, "q_cp_dod", r.q_cp_dod); addD(a, "q_cp_wow", r.q_cp_wow);
            addD(a, "q_ucp_dod", r.q_ucp_dod); addD(a, "q_ucp_wow", r.q_ucp_wow);
            // month lens (diagonal): the milestone contributes to its own due-month bucket
            const mb = a.months[r.duemo];
            if (mb) {
                mb.cp += r.m_cp + (r.m_bl || 0); mb.ucp += r.m_ucp;
                addD(mb, "cp_dod", r.m_cp_dod); addD(mb, "cp_wow", r.m_cp_wow);
                addD(mb, "ucp_dod", r.m_ucp_dod); addD(mb, "ucp_wow", r.m_ucp_wow);
            }
        }
        return Array.from(map.values());
    }

    // account table columns for the current period/month selection: [key, header, isMonthBucket?]
    private acctCols(): { key: string; lbl: string; mo?: string; metric: "cp" | "ucp" | "total"; q?: boolean }[] {
        const cfg = PERIODS[this.state.period];
        const out: any[] = [];
        if (this.isMonth()) {
            const mo = this.state.month, lbl = this.periodLabel();
            out.push({ key: mo + "_cp", lbl: lbl + " CP", mo, metric: "cp" });
            out.push({ key: mo + "_ucp", lbl: lbl + " UCP", mo, metric: "ucp" });
            out.push({ key: mo + "_total", lbl: lbl + " Total", mo, metric: "total" });
        } else {
            for (const [mo, ml] of cfg.months) out.push({ key: mo + "_cp", lbl: ml + " CP", mo, metric: "cp" });
            out.push({ key: "q_cp", lbl: cfg.label + " CP", metric: "cp", q: true });
            for (const [mo, ml] of cfg.months) out.push({ key: mo + "_ucp", lbl: ml + " UCP", mo, metric: "ucp" });
            out.push({ key: "q_ucp", lbl: cfg.label + " UCP", metric: "ucp", q: true });
            out.push({ key: "q_total", lbl: cfg.label + " Total", metric: "total", q: true });
        }
        return out;
    }

    // value + DoD/WoW for one account cell (handles month buckets and quarter carry, cp/ucp/total).
    private acctCell(a: any, c: any): { val: number; dod: number | null; wow: number | null } {
        if (c.q) {
            if (c.metric === "cp") return { val: a.q_cp, dod: a._has_q_cp_dod ? a.q_cp_dod : null, wow: a._has_q_cp_wow ? a.q_cp_wow : null };
            if (c.metric === "ucp") return { val: a.q_ucp, dod: a._has_q_ucp_dod ? a.q_ucp_dod : null, wow: a._has_q_ucp_wow ? a.q_ucp_wow : null };
            const dod = (a._has_q_cp_dod || a._has_q_ucp_dod) ? (a.q_cp_dod || 0) + (a.q_ucp_dod || 0) : null;
            const wow = (a._has_q_cp_wow || a._has_q_ucp_wow) ? (a.q_cp_wow || 0) + (a.q_ucp_wow || 0) : null;
            return { val: a.q_cp + a.q_ucp, dod, wow };
        }
        const mb = a.months[c.mo] || {};
        if (c.metric === "cp") return { val: mb.cp || 0, dod: mb._has_cp_dod ? mb.cp_dod : null, wow: mb._has_cp_wow ? mb.cp_wow : null };
        if (c.metric === "ucp") return { val: mb.ucp || 0, dod: mb._has_ucp_dod ? mb.ucp_dod : null, wow: mb._has_ucp_wow ? mb.ucp_wow : null };
        const dod = (mb._has_cp_dod || mb._has_ucp_dod) ? (mb.cp_dod || 0) + (mb.ucp_dod || 0) : null;
        const wow = (mb._has_cp_wow || mb._has_ucp_wow) ? (mb.cp_wow || 0) + (mb.ucp_wow || 0) : null;
        return { val: (mb.cp || 0) + (mb.ucp || 0), dod, wow };
    }

    private delta(v: number | null, lbl: string): string {
        if (v === null || v === undefined) return `<span class="dlt na">—<i>${lbl}</i></span>`;
        if (Math.round(v) === 0) return `<span class="dlt zero">0<i>${lbl}</i></span>`;
        const cls = v > 0 ? "pos" : "neg";
        return `<span class="dlt ${cls}">${v > 0 ? "▲" : "▼"}${money(Math.abs(v))}<i>${lbl}</i></span>`;
    }
    private metricCell(dod: number | null, wow: number | null, valHtml: string): string {
        return `<td class="mcell"><span class="mval">${valHtml}</span><span class="dsub">${this.delta(dod, "d")} ${this.delta(wow, "w")}</span></td>`;
    }
    // combined Pipeline-Amount delta for a milestone (cp+bl+ucp, current lens). null only if ALL absent.
    private msAmtDelta(r: MS, kind: "dod" | "wow"): number | null {
        const cpk = (this.isMonth() ? "m_cp_" : "q_cp_") + kind;
        const blk = (this.isMonth() ? "m_bl_" : "q_bl_") + kind;
        const ucpk = (this.isMonth() ? "m_ucp_" : "q_ucp_") + kind;
        const cp = (r as any)[cpk], bl = (r as any)[blk], ucp = (r as any)[ucpk];
        if ((cp === null || cp === undefined) && (bl === null || bl === undefined) && (ucp === null || ucp === undefined)) return null;
        return (cp || 0) + (bl || 0) + (ucp || 0);
    }

    private accountTable(rows: MS[]): string {
        const accts = this.aggregateAccounts(rows);
        const cols = this.acctCols();
        // sort: by the quarter CP (or selected month CP) desc
        const sortVal = (a: any) => this.isMonth() ? (a.months[this.state.month]?.cp || 0) : a.q_cp;
        accts.sort((x, y) => sortVal(y) - sortVal(x));
        const head = `<th class="sortable lft">Account</th><th class="lft">TPID</th><th class="lft">Sales Unit</th>`
            + `<th class="lft">Territory</th><th>MACC</th><th class="lft">ACR</th>`
            + cols.map(c => `<th>${esc(c.lbl)}</th>`).join("");
        const body = accts.slice(0, 300).map(a => {
            // Mask the account identity (name + tpid) for restricted rows when NOT revealing — mirrors
            // the feed redaction the standard dashboard relies on. Territory code is kept (as today).
            const masked = !this.reveal && isRestrictedTerr(a.terr);
            const lead = `<td class="lft${masked ? " restricted" : ""}" title="${esc(a.terr || "")}">${masked ? '<span class="lock">🔒</span> Restricted' : esc(a.acct) + (a.hc ? ' <span class="tag hot">HC</span>' : "")}</td>`
                + `<td class="lft tpid-cell">${masked ? "—" : esc(a.tpid)}</td><td class="lft seg-cell">${esc(a.su)}</td>`
                + `<td class="lft small">${esc(a.terr)}</td>`
                + `<td>${a.macc ? '<span class="tag macc">MACC</span>' : '<span class="muted">—</span>'}</td>`
                + `<td class="lft">${a.acr ? esc(a.acr) : '<span class="muted">—</span>'}</td>`;
            const cells = cols.map(c => { const r = this.acctCell(a, c); return this.metricCell(r.dod, r.wow, money(r.val)); }).join("");
            return `<tr${masked ? ' class="restricted-row"' : ""}>${lead}${cells}</tr>`;
        }).join("");
        // totals
        const tot = cols.map(c => {
            let v = 0, dod = 0, wow = 0, hasDod = false, hasWow = false;
            for (const a of accts) { const r = this.acctCell(a, c); v += r.val; if (r.dod !== null) { dod += r.dod; hasDod = true; } if (r.wow !== null) { wow += r.wow; hasWow = true; } }
            return this.metricCell(hasDod ? dod : null, hasWow ? wow : null, money(v));
        }).join("");
        const foot = `<tr class="ffilt"><td class="lft">Filtered (${accts.length} accounts)</td><td></td><td></td><td></td><td></td><td></td>${tot}</tr>`;
        const note = accts.length > 300 ? `<div class="count-note">Showing top 300 of ${accts.length} accounts; totals cover all.</div>` : "";
        return `<div class="tablewrap scrollx acct-scroll"><table id="acTable" class="prog-tbl acct-tbl">
            <thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length + 6}" class="lft muted" style="padding:18px">No accounts match these filters.</td></tr>`}</tbody>
            <tfoot>${foot}</tfoot></table></div>${note}`;
    }

    // Pipeline Departures — milestones that LEFT the open pipeline (Lost to Competitor / Cancelled).
    // Respect EVERY page-level filter EXCEPT Commitment & Status (a departed milestone has no current
    // commitment, and its status is Lost/Cancelled by definition). Sales-stage is also not applied —
    // departures carry no sales stage. Period (Est Due) + all dimensional filters DO apply.
    private depInScope(d: any): boolean {
        // Departures are period-relative on the period they LEFT (fromp/fromm), NOT their current due
        // date. A milestone that WAS due in Q2 and slipped to FY28-Q3 belongs to the Q2 view (it left Q2).
        // Match ONLY on fromp/fromm (now always delivered via the model + tile binding) — never fall back
        // to pk/duemo (the current due), which would place a slipped milestone under its new period.
        if (this.isMonth()) return d.fromm === this.state.month;
        return String(d.fromp || "").toLowerCase() === this.state.period;
    }
    private depFiltered(): any[] {
        const q = this.state.search.trim().toLowerCase();
        return this.deps.filter(d => {
            if (!this.depInScope(d)) return false;
            if (this.suSet.size && !this.suSet.has(d.su)) return false;
            if (this.state.maccOnly && !d.macc) return false;
            if (this.state.highOnly && !d.hc) return false;
            if (this.wlSet.size && !this.wlSet.has(d.wl)) return false;
            if (this.sspSet.size && !this.sspSet.has(d.ssp)) return false;
            if (this.spSet.size && !this.spSet.has(d.sp)) return false;
            if (this.terrSet.size && !this.terrSet.has(d.terr)) return false;
            if (this.ownSet.size && !this.ownSet.has(d.own)) return false;
            if (this.mgrSet.size && !this.mgrSet.has(d.mgr)) return false;
            if (this.grpSet.size && !this.grpSet.has(d.grp)) return false;
            if (q) {
                const restricted = !this.reveal && isRestrictedTerr(d.terr);
                const hay = restricted ? (d.tpid || "") : (d.acct + " " + d.tpid + " " + d.nm + " " + d.own);
                if (!hay.toLowerCase().includes(q)) return false;
            }
            return true;
        }).sort((a, b) => (b.last_pipe || 0) - (a.last_pipe || 0));
    }
    private renderDepartures(): string {
        if (!this.deps.length) return "";
        const rows = this.depFiltered();
        const prettyDue = (iso: string): string => {
            if (!iso || iso.length < 7) return "—";
            const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const p = iso.split("-");
            return `${parseInt(p[2] || "1", 10)} ${MON[parseInt(p[1], 10) - 1]} ${p[0]}`;
        };
        // "was: X" pill — mirrors the milestone table (a status/commitment/due/amount change before the
        // milestone left is a discrete event; show the prior value inline under the current one).
        const pill = (prev: string): string =>
            prev ? `<span class="was-chip" title="Was ${esc(prev)}">was ${esc(prev)}</span>` : "";
        const total = rows.reduce((s, d) => s + (d.last_pipe || 0), 0);
        const body = rows.map(d => {
            // Defense-in-depth: mask a restricted departure's identity cells when this instance is NOT
            // revealing, even if the feed carries real values (standard dashboard = redacted feed anyway;
            // PSNS dashboard = reveal on). Keeps departures consistent with the milestone table.
            const masked = !this.reveal && isRestrictedTerr(d.terr);
            const nm = esc(d.nm || "—");
            const nmCell = masked ? '<span class="muted">—</span>' : (d.link
                ? `<a class="msx-lnk" data-msx="${esc(d.link)}" title="Open record in MSX" role="link" tabindex="0">${nm} ↗</a>`
                : nm);
            const dc = d.commitment || "—";
            const cc = dc === "Committed" ? "good" : dc === "Uncommitted" ? "warn" : "";
            const amtPrev = (d.pipe_prev != null && d.pipe_prev !== d.last_pipe) ? pill(money(d.pipe_prev)) : "";
            const duePrev = d.due_prev_dod ? pill(prettyDue(d.due_prev_dod)) : "";
            return `<tr${masked ? ' class="restricted-row"' : ""}>
            <td class="lft${masked ? " restricted" : ""}">${masked ? '<span class="lock">🔒</span> Restricted' : esc(d.acct || "—")}</td>
            <td class="lft">${masked ? "—" : esc(d.tpid || "—")}</td>
            <td class="lft tpid-cell">${masked ? "—" : esc(d.id || "—")}</td>
            <td class="lft nm-cell">${nmCell}</td>
            <td><span class="cellstack">${money(d.last_pipe)}${amtPrev}</span></td>
            <td class="lft"><span class="cellstack">${cc ? `<span class="pill ${cc}">${esc(dc)}</span>` : "—"}${pill(d.commitment_prev_dod)}</span></td>
            <td class="lft"><span class="cellstack"><span class="dep-now">${esc(d.st || "—")}</span>${pill(d.st_prev_dod)}</span></td>
            <td class="lft"><span class="cellstack">${esc(prettyDue(d.due))}${duePrev}</span></td>
            <td class="lft">${esc(d.reason || "—")}</td>
          </tr>`;
        }).join("");
        const foot = `<tr class="dep-foot"><td class="lft" colspan="4">Total departed (${rows.length})</td>
            <td>${money(total)}</td><td colspan="4"></td></tr>`;
        return `<div class="section-h dep-h" style="margin-top:18px"><h2>Pipeline Departures</h2></div>
          <div class="tablewrap scrollx acct-scroll"><table id="depTable" class="prog-tbl acct-tbl dep-tbl">
            <thead><tr>
              <th class="lft">Account</th><th class="lft">TPID</th><th class="lft">Milestone Id</th><th class="lft">Milestone</th>
              <th>Pipeline Amount</th><th class="lft">Commitment</th><th class="lft">Status</th>
              <th class="lft">Est. Due</th><th class="lft">Reason</th>
            </tr></thead>
            <tbody>${body || `<tr><td colspan="9" class="lft muted" style="padding:14px">No departures match these filters.</td></tr>`}</tbody>
            <tfoot>${foot}</tfoot>
          </table></div>`;
    }

    private render() {
        const allInScope = this.rows.filter(r => this.inScope(r));
        const rows = this.filtered();
        const lbl = this.periodLabel();

        const sum = (set: MS[], f: (r: MS) => number) => set.reduce((s, r) => s + f(r), 0);
        const fCp = sum(rows, r => this.cpOf(r)), fBl = sum(rows, r => this.blOf(r)), fUcp = sum(rows, r => this.ucpOf(r)), fAmt = sum(rows, r => this.amt(r));
        const acctCount = new Set(rows.map(r => r.tpid || r.acct)).size;
        const allAcctCount = new Set(this.rows.filter(r => this.inScope(r)).map(r => r.tpid || r.acct)).size;
        const scope = [this.state.maccOnly ? "MACC" : null, this.state.highOnly ? "high-consuming" : null,
            this.suSet.size ? "filtered" : null, this.hasFilterSel() ? "filtered" : null].filter(Boolean).join(" · ") || "all accounts";

        const kpis = `<div class="kpis">
          <div class="kpi live"><div class="k-label">Accounts (filtered)</div><div class="k-value">${acctCount.toLocaleString()}</div><div class="k-foot">${esc(scope)} · of ${allAcctCount.toLocaleString()}</div></div>
          <div class="kpi live"><div class="k-label">${esc(lbl)} Committed</div><div class="k-value">${money(fCp)} <span class="xbl-foot">excl. blocked</span></div><div class="k-foot">All: ${money(fCp + fBl)}</div></div>
          <div class="kpi live"><div class="k-label">${esc(lbl)} Uncommitted</div><div class="k-value">${money(fUcp)}</div></div>
          <div class="kpi live"><div class="k-label">${esc(lbl)} Total</div><div class="k-value">${money(fAmt)}</div></div>
        </div>`;
        const pillarKpis = this.pillarTiles(rows);

        const dir = this.state.sortDir < 0 ? " ▼" : " ▲";
        const head = COLS.map(([k, label, num]) => {
            const arrow = k === this.state.sortKey ? dir : "";
            return `<th class="sortable ${num && k !== "tpid" ? "" : "lft"}" data-key="${esc(k)}">${esc(label)}<span class="sarrow">${arrow}</span></th>`;
        }).join("");

        // "Was: X" change pill for a categorical field — DAY-over-day only (a commitment/status/due
        // change is a discrete event, so the meaningful comparison is vs yesterday, never WoW).
        const wasPill = (r: MS, field: "commitment" | "st" | "due"): string => {
            const prev = (r as any)[field + "_prev_dod"];
            if (!prev) return "";
            return `<span class="was-chip" title="Was ${esc(prev)} yesterday">was ${esc(prev)}</span>`;
        };
        const cell = (r: MS, key: string): string => {
            if (key === "amt") {
                // Non-Qualified rows display their nq value (no DoD/WoW subline — nq isn't snapshotted).
                if (r.isNonQual) return `<td class="nq-amt">${money(this.nqOf(r))}</td>`;
                return this.metricCell(this.msAmtDelta(r, "dod"), this.msAmtDelta(r, "wow"), money(this.amt(r)));
            }
            if (key === "acct") return `<td class="lft" title="${esc(r.terr || "")}">${esc(r.acct)}${r.macc ? ' <span class="tag macc">MACC</span>' : ""}${r.hc ? ' <span class="tag hot">HC</span>' : ""}</td>`;
            if (key === "tpid") return `<td class="lft tpid-cell">${esc(r.tpid)}</td>`;
            if (key === "nm") {
                const name = esc(r.nm || "(unnamed)");
                const link = r.link ? `<a class="msx-lnk" data-msx="${esc(r.link)}" title="Open record in MSX" role="link" tabindex="0">${name} ↗</a>` : name;
                return `<td class="lft nm-cell">${link}</td>`;
            }
            if (key === "commitment") {
                const dc = this.displayCommitment(r);
                const c = dc === "Committed" ? "good" : dc === "Non-Qualified" ? "nq" : "warn";
                return `<td class="lft"><span class="cellstack"><span class="pill ${c}">${esc(dc)}</span>${wasPill(r, "commitment")}</span></td>`;
            }
            if (key === "st") return `<td class="lft small"><span class="cellstack">${esc(r.st) || '<span class="muted">—</span>'}${wasPill(r, "st")}</span></td>`;
            if (key === "due") return `<td class="lft small"><span class="cellstack">${esc(r.due) || '<span class="muted">—</span>'}${wasPill(r, "due")}</span></td>`;
            const v = (r as any)[key];
            return `<td class="lft small">${v ? esc(v) : '<span class="muted">—</span>'}</td>`;
        };

        const maskedRow = (): string => COLS.map(([k], i) => {
            if (i === 0) return `<td class="lft restricted"><span class="lock">🔒</span> Restricted</td>`;
            if (k === "amt") return `<td class="restricted">—</td>`;
            return `<td class="lft restricted muted">—</td>`;
        }).join("");
        const body = rows.slice(0, 500).map(r =>
            `<tr${this.isRestricted(r) ? ' class="restricted-row"' : ""}>`
            + (this.isRestricted(r) ? maskedRow() : COLS.map(([k]) => cell(r, k)).join(""))
            + "</tr>").join("");

        const footAmt = sum(rows, r => this.amt(r));
        const foot = `<tr class="ffilt"><td class="lft">Filtered (${rows.length})</td><td></td><td></td><td></td><td>${money(footAmt)}</td>` +
            COLS.slice(5).map(() => "<td></td>").join("") + "</tr>";

        const countNote = `${rows.length.toLocaleString()} of ${allInScope.length.toLocaleString()} in-scope milestones` + (rows.length > 500 ? " (table shows top 500; totals cover all matches)" : "");

        const html = `
        <div class="nnr-root">
          ${kpis}
          ${pillarKpis}
          <div class="filters">
            ${this.dueDropdown()}
            ${this.dropdown("commit", "Commitment", "commitment", this.commitSet)}
            ${this.dropdown("status", "Status", "st", this.statusSet)}
            ${this.dropdown("stage", "Sales stage", "stage", this.stageSet, { sort: "stage" })}
          </div>
          <div class="filters th-row">
            ${this.dropdown("su", "Sales unit", "su", this.suSet, { searchable: true, sort: "alphanum" })}
            ${this.dropdown("terr", "Territory", "terr", this.terrSet, { searchable: true, sort: "alphanum" })}
            <input id="msSearch" type="search" placeholder="Search account, TPID, milestone, owner…" value="${esc(this.state.search)}" />
            ${this.dropdown("grp", "Owner group", "grp", this.grpSet)}
            ${this.dropdown("mgr", "Owner manager", "mgr", this.mgrSet, { searchable: true, sort: "alpha" })}
            ${this.dropdown("own", "Owner", "own", this.ownSet, { searchable: true, sort: "alpha" })}
          </div>
          <div class="filters th-row">
            ${this.dropdown("ssp", "Super strategic pillar", "ssp", this.sspSet, { searchable: true, sort: "alpha" })}
            ${this.dropdown("sp", "Strategic pillar", "sp", this.spSet, { searchable: true, sort: "alpha" })}
            ${this.dropdown("wl", "Workload", "wl", this.wlSet, { searchable: true, sort: "alpha" })}
            <span class="th-lbl">Accounts:</span>
            ${this.singleSelect("msThMetric", this.state.thMetric, [["cp", "Committed"], ["ucp", "Uncommitted"], ["total", "Qualified"]])}
            ${this.singleSelect("msThOp", this.state.thOp, [[">=", ">="], ["<=", "<="], [">", ">"], ["<", "<"], ["=", "="]], true)}
            <input id="msThVal" type="text" placeholder="e.g. 1M, 500K, 10000" value="${esc(this.state.thVal)}" />
            <div class="chk-stack">
              <label class="chk"><input type="checkbox" id="msMacc" ${this.state.maccOnly ? "checked" : ""}/> MACC only</label>
              <label class="chk"><input type="checkbox" id="msHigh" ${this.state.highOnly ? "checked" : ""}/> High consuming</label>
            </div>
            <button id="msFiltClear" class="lnk">clear all filters</button>
          </div>

          <div class="section-h"><h2>Accounts</h2>
            <span class="note">Roll-up of the milestones below · each CP/UCP/Total shows Δ vs prior day (d) and prior week (w) · one filter set drives both tables</span></div>
          ${this.accountTable(rows)}

          <div class="section-h" style="margin-top:18px"><h2>Milestone detail</h2>
            <span class="note">${esc(countNote)} · Δ vs prior day (d) and prior week (w) · click a milestone to open it in MSX</span></div>
          <div class="tablewrap scrollx acct-scroll"><table id="msTable" class="prog-tbl acct-tbl">
            <thead><tr id="msHead">${head}</tr></thead>
            <tbody id="msBody">${body || `<tr><td colspan="${COLS.length}" class="lft muted" style="padding:18px">No milestones match these filters.</td></tr>`}</tbody>
            <tfoot id="msFoot">${foot}</tfoot>
          </table></div>
          ${this.renderDepartures()}
        </div>`;

        const active = document.activeElement as HTMLInputElement;
        let focusId: string | null = null, caret = 0;
        if (active && active.id && (active.id === "msThVal" || active.id === "msSearch" || active.id.indexOf("ddsearch_") === 0)) {
            focusId = active.id; caret = active.selectionStart || 0;
        }
        // Preserve the open dropdown panel's scroll position so ticking a box doesn't jump to the top.
        let ddScroll = 0;
        if (this.ddOpen) {
            const openPanel = this.root.querySelector(`.pl-dd-panel[data-ddp="${this.ddOpen}"]`) as HTMLElement;
            if (openPanel) ddScroll = openPanel.scrollTop;
        }
        this.bodyEl.innerHTML = `<style>${STYLES}${EXTRA}</style>${html}`;
        this.wire();
        if (this.ddOpen && ddScroll) {
            const np = this.root.querySelector(`.pl-dd-panel[data-ddp="${this.ddOpen}"]`) as HTMLElement;
            if (np) np.scrollTop = ddScroll;
        }
        if (focusId) {
            const el = this.root.querySelector("#" + focusId) as HTMLInputElement;
            if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) { /* noop */ } }
        }
        this.persistState();
    }

    /* ---- session state persistence (survives page navigation via host.persistProperties) ----
       Serializes the user's filter sets + view state into a report object property so update() can
       rehydrate it when Power BI destroys/recreates the visual on page switch. Session-scoped in
       reading view; also captured by bookmarks. Guarded by _persistLast so the persist-triggered
       update never loops and never clobbers active edits. */
    private serializeState(): string {
        const A = (s: Set<string>) => Array.from(s);
        return JSON.stringify({
            v: 1,
            status: A(this.statusSet), stage: A(this.stageSet), commit: A(this.commitSet),
            wl: A(this.wlSet), mgr: A(this.mgrSet), grp: A(this.grpSet), terr: A(this.terrSet),
            own: A(this.ownSet), ssp: A(this.sspSet), sp: A(this.spSet), su: A(this.suSet),
            state: this.state
        });
    }
    private applyPersisted(s: string) {
        try {
            const o: any = JSON.parse(s);
            if (!o) return;
            const L = (set: Set<string>, arr: any) => { set.clear(); if (Array.isArray(arr)) for (const v of arr) set.add(String(v)); };
            L(this.statusSet, o.status); L(this.stageSet, o.stage); L(this.commitSet, o.commit);
            L(this.wlSet, o.wl); L(this.mgrSet, o.mgr); L(this.grpSet, o.grp); L(this.terrSet, o.terr);
            L(this.ownSet, o.own); L(this.sspSet, o.ssp); L(this.spSet, o.sp); L(this.suSet, o.su);
            if (o.state && typeof o.state === "object") Object.assign(this.state, o.state);
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

    private wire() {
        const rerender = () => this.render();
        // Est. Due Date single-select dropdown (quarter or nested month). value = "<period>|<month|all>".
        this.root.querySelectorAll('.due-dd input[name="duesel"]').forEach(r =>
            r.addEventListener("change", (e: any) => {
                const v = String((e.target as HTMLInputElement).value || "");
                const [p, mo] = v.split("|");
                if (PERIODS[p]) {
                    this.state.period = p; this.state.month = mo || "all";
                    this.state.sortKey = "amt"; this.state.sortDir = -1;
                    this.ddOpen = ""; this.pruneSelections(); rerender();
                }
            }));
        const bind = (id: string, ev: string, fn: (el: any) => void) => {
            const el = this.root.querySelector("#" + id) as HTMLInputElement;
            if (el) el.addEventListener(ev, () => fn(el));
        };
        bind("msSearch", "input", el => { this.state.search = el.value; rerender(); });
        bind("msMacc", "change", el => { this.state.maccOnly = el.checked; rerender(); });
        bind("msHigh", "change", el => { this.state.highOnly = el.checked; rerender(); });
        bind("msThVal", "input", el => { this.state.thVal = el.value; rerender(); });
        // single-select dropdown option pick (metric + operator) — see singleSelect()
        this.root.querySelectorAll(".pl-opt").forEach(o =>
            o.addEventListener("click", (e: any) => {
                e.stopPropagation();
                const el = e.currentTarget as HTMLElement;
                const id = el.dataset.ss, val = el.dataset.val || "";
                if (id === "msThMetric") this.state.thMetric = val;
                else if (id === "msThOp") this.state.thOp = val;
                this.ddOpen = ""; rerender();
            }));
        bind("msFiltClear", "click", () => {
            this.statusSet.clear(); this.stageSet.clear(); this.commitSet.clear();
            this.wlSet.clear(); this.mgrSet.clear(); this.grpSet.clear();
            this.terrSet.clear(); this.ownSet.clear(); this.sspSet.clear(); this.spSet.clear(); this.suSet.clear();
            this.state.search = ""; this.state.thVal = "";
            this.state.thMetric = "cp"; this.state.thOp = ">=";
            this.state.maccOnly = false; this.state.highOnly = false;
            // reset the Est. Due Date single-select back to its default lens (whole Q1)
            this.state.period = "q1"; this.state.month = "all";
            // re-apply the default sales-stage exclusion (Listen & Consult stays out)
            this.stageSet = new Set(this.rows.map(r => r.stage).filter(s => s && s !== "Listen & Consult"));
            this.ddSearch = {}; this.ddOpen = ""; rerender();
        });
        // multi-select dropdowns
        this.root.querySelectorAll(".pl-dd-btn").forEach(b =>
            b.addEventListener("click", (e: any) => {
                e.stopPropagation();
                const id = (b as HTMLElement).dataset.dd as string;
                this.ddOpen = this.ddOpen === id ? "" : id;
                rerender();
            }));
        this.root.querySelectorAll(".pl-dd-panel").forEach(p =>
            p.addEventListener("change", (e: any) => {
                const cb = e.target as HTMLInputElement;
                if (!cb || cb.type !== "checkbox") return;
                const id = (p as HTMLElement).dataset.ddp as string;
                const sel = this.setFor(id);
                if (!sel) return;
                if (cb.checked) sel.add(cb.value); else sel.delete(cb.value);
                rerender();
            }));
        this.root.querySelectorAll(".pl-dd-panel").forEach(p =>
            p.addEventListener("click", (e: any) => e.stopPropagation()));
        // searchable-dropdown filter boxes
        this.root.querySelectorAll(".pl-dd-search").forEach(inp =>
            inp.addEventListener("input", (e: any) => {
                const el = e.target as HTMLInputElement;
                const id = el.id.replace("ddsearch_", "");
                this.ddSearch[id] = el.value; this.ddOpen = id; rerender();
            }));
        // single-click MSX open via host.launchUrl (sandbox-safe; <a target=_blank> is blocked).
        // Bind to BOTH the milestone table body (#msBody) AND the Pipeline Departures table
        // (#depTable) — the departures table is a sibling outside #msBody, so it needs the handler too.
        const launch = (a: HTMLElement) => {
            const url = a.getAttribute("data-msx");
            if (!url) return;
            try { this.host.launchUrl(url); } catch (_) { }
            a.classList.add("msx-opening");
            window.setTimeout(() => a.classList.remove("msx-opening"), 1300);
        };
        const linkContainers = [this.root.querySelector("#msBody"), this.root.querySelector("#depTable")]
            .filter(Boolean) as HTMLElement[];
        linkContainers.forEach(c => {
            c.addEventListener("click", (e: any) => {
                const a = (e.target as HTMLElement).closest("a.msx-lnk[data-msx]") as HTMLElement;
                if (!a) return;
                e.preventDefault();
                e.stopPropagation();
                launch(a);
            });
            c.addEventListener("keydown", (e: any) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                const a = (e.target as HTMLElement).closest("a.msx-lnk[data-msx]") as HTMLElement;
                if (!a) return;
                e.preventDefault();
                launch(a);
            });
        });
        this.root.querySelectorAll("#msTable th.sortable").forEach(th =>
            th.addEventListener("click", () => {
                const k = (th as HTMLElement).dataset.key as string;
                const numeric = k === "amt";
                if (this.state.sortKey === k) this.state.sortDir *= -1;
                else { this.state.sortKey = k; this.state.sortDir = numeric ? -1 : 1; }
                this.render();
            }));
        // close any open dropdown when clicking elsewhere
        this.root.querySelectorAll(".nnr-root").forEach(rootEl =>
            rootEl.addEventListener("click", () => { if (this.ddOpen) { this.ddOpen = ""; this.render(); } }));
    }

    private setFor(id: string): Set<string> | null {
        switch (id) {
            case "status": return this.statusSet;
            case "stage": return this.stageSet;
            case "commit": return this.commitSet;
            case "wl": return this.wlSet;
            case "ssp": return this.sspSet;
            case "sp": return this.spSet;
            case "su": return this.suSet;
            case "terr": return this.terrSet;
            case "own": return this.ownSet;
            case "mgr": return this.mgrSet;
            case "grp": return this.grpSet;
        }
        return null;
    }

    // After a period/sales-unit change, drop selected dropdown values that are no longer valid.
    private pruneSelections() {
        const valid = (field: keyof MS) => new Set(this.optionsFor(field).map(o => o.key));
        const prune = (sel: Set<string>, field: keyof MS) => {
            if (!sel.size) return;
            const v = valid(field);
            Array.from(sel).forEach(k => { if (!v.has(k)) sel.delete(k); });
        };
        prune(this.statusSet, "st"); prune(this.stageSet, "stage"); prune(this.commitSet, "commitment");
        prune(this.wlSet, "wl"); prune(this.sspSet, "ssp"); prune(this.spSet, "sp");
        prune(this.terrSet, "terr"); prune(this.ownSet, "own");
        prune(this.mgrSet, "mgr"); prune(this.grpSet, "grp");
    }
}

// Milestone-specific CSS additions (pill / msx link / count note) layered over the shared STYLES.
const EXTRA = `
.section-h.dep-h h2{color:#7a1f2b;}
.dep-tbl thead th{background:#7a1f2b;color:#fff;border-color:#641722;}
.dep-tbl thead th:first-child{background:#7a1f2b;}
.dep-tbl .dep-now{display:inline-block;padding:2px 8px;border-radius:11px;font-size:11px;font-weight:700;background:#fbe3e6;color:#7a1f2b;}
.dep-tbl tr.dep-foot td{font-weight:700;background:#fbe3e6;color:#7a1f2b;border-top:2px solid #e7b9c0;}
.dep-tbl tr.dep-foot td:first-child{background:#fbe3e6;}
.dep-tbl td{font-variant-numeric:tabular-nums;}
.pill{display:inline-block;padding:2px 8px;border-radius:11px;font-size:11px;font-weight:700;}
.pill.good{background:#e7f4e8;color:#2e7d32;}
.pill.warn{background:#fff4e5;color:#8a5a00;}
.pill.nq{background:#eef0f4;color:#5a6675;}
.prog-tbl td.nq-amt{text-align:right;color:#5a6675;font-style:italic;font-variant-numeric:tabular-nums;}
.nqp-foot{color:#5a6675;font-weight:600;}
.xbl-foot{color:#5a6675;font-weight:600;font-size:11px;}
.msx-lnk{color:#1a6bb5;text-decoration:none;font-weight:600;cursor:pointer;border-radius:4px;padding:0 2px;transition:background .12s,color .12s;}
.msx-lnk:hover{text-decoration:underline;}
.msx-lnk.msx-opening{background:#1a6bb5;color:#fff;text-decoration:none;animation:msxpulse .6s ease-in-out;}
@keyframes msxpulse{0%{box-shadow:0 0 0 0 rgba(26,107,181,.45);}100%{box-shadow:0 0 0 6px rgba(26,107,181,0);}}
.nm-cell{max-width:280px;overflow:hidden;text-overflow:ellipsis;}
.count-note{font-size:11.5px;color:#6b7686;margin:2px 2px 8px;}
.prog-tbl tr.ffilt td{font-weight:700;background:#e3edf7;border-top:2px solid #d7e2ee;}
.filters .th-lbl{font-size:12px;color:#6b7686;font-weight:600;text-transform:uppercase;letter-spacing:.3px;margin-left:6px;}
.due-dd .pl-dd-btn{font-weight:700;}
.due-opt{display:flex;align-items:center;gap:7px;padding:4px 8px;font-size:12.5px;cursor:pointer;border-radius:5px;}
.due-opt:hover{background:#f4f8fc;}
.due-qrow{font-weight:700;color:#0f3460;border-top:1px solid #eef2f6;margin-top:2px;}
.due-qrow:first-child{border-top:none;margin-top:0;}
.due-all{font-weight:500;color:#9aa4b2;font-size:11px;}
.due-mo{padding-left:24px;color:#1c3a5e;}
.prog-tbl td.mcell{text-align:right;}
.prog-tbl td.mcell .mval{display:block;font-variant-numeric:tabular-nums;}
.prog-tbl td.mcell .dsub{display:block;font-size:9.5px;line-height:1.2;margin-top:1px;white-space:nowrap;}
.prog-tbl td.mcell .dlt.na{color:#7a8595;}
.prog-tbl td.mcell .dlt.zero{color:#5a6675;}
.prog-tbl td.mcell .dlt i{opacity:.75;}
.prog-tbl tr.restricted-row td.restricted{color:#9aa7b8;font-style:italic;background:#f7f8fa;}
.prog-tbl tr.restricted-row td.restricted .lock{font-style:normal;margin-right:3px;}
.prog-tbl tr.restricted-row:hover td{filter:none;}
.was-chip{display:inline-block;margin-top:2px;padding:0 5px;border-radius:6px;font-size:8.5px;font-weight:600;line-height:1.45;background:#fbeee0;color:#9a5212;border:1px solid #f0d6b8;white-space:nowrap;letter-spacing:.1px;}
.cellstack{display:inline-flex;flex-direction:column;align-items:flex-start;gap:0;}
`;
