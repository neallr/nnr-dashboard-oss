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

interface PillarRow { sup: string; strat: string; cp: number; ucp: number; nqp: number; bl: number; }

function parsePillars(blob: string): Record<string, PillarRow[]> {
    const out: Record<string, PillarRow[]> = {};
    if (!blob) return out;
    for (const block of String(blob).split(";")) {
        const eq = block.indexOf("=");
        if (eq < 0) continue;
        const per = block.slice(0, eq);
        const rows: PillarRow[] = [];
        for (const rs of block.slice(eq + 1).split("~")) {
            const p = rs.split("|");
            if (p.length < 6) continue;
            rows.push({ sup: p[0], strat: p[1], cp: +p[2] || 0, ucp: +p[3] || 0, nqp: +p[4] || 0, bl: +p[5] || 0 });
        }
        out[per] = rows;
    }
    return out;
}

interface Acct {
    name: string; tpid: string; unit: string; territory: string; atu: string;
    macc: boolean; high: boolean; acr: string;
    [k: string]: any;
}

function money(v: Num): string {
    if (v === null || v === undefined) return "—";
    const a = Math.abs(v);
    if (a >= 1e6) return (v < 0 ? "-" : "") + "$" + (a / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return (v < 0 ? "-" : "") + "$" + Math.round(a / 1e3).toLocaleString() + "K";
    return (v < 0 ? "-" : "") + "$" + Math.round(a).toLocaleString();
}
function compactUSD(v: number): string {
    const a = Math.abs(v);
    if (a >= 1e6) return "$" + (a / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return "$" + Math.round(a / 1e3).toLocaleString() + "K";
    return "$" + Math.round(a).toLocaleString();
}
function pct(v: Num): string { return v === null || v === undefined ? "—" : (v * 100).toFixed(0) + "%"; }
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

const PERIODS: any = {
    Q1: { months: [["julcp", "Jul"], ["augcp", "Aug"], ["sepcp", "Sep"]], cp: "q1cp", ucp: "q1ucp", total: "q1total", q: "Q1" },
    Q2: { months: [["octcp", "Oct"], ["novcp", "Nov"], ["deccp", "Dec"]], cp: "q2cp", ucp: "q2ucp", total: "q2total", q: "Q2" },
    Q3: { months: [["jancp", "Jan"], ["febcp", "Feb"], ["marcp", "Mar"]], cp: "q3cp", ucp: "q3ucp", total: "q3total", q: "Q3" },
    Q4: { months: [["aprcp", "Apr"], ["maycp", "May"], ["juncp", "Jun"]], cp: "q4cp", ucp: "q4ucp", total: "q4total", q: "Q4" }
};

// MACC gap card: quarter context -> quarter roll-up + its 3 months (like the table selector).
const GAP_QUARTERS: { q: string; opts: { key: string; label: string }[] }[] = [
    { q: "Q1", opts: [{ key: "q1cp", label: "Q1" }, { key: "julcp", label: "Jul" }, { key: "augcp", label: "Aug" }, { key: "sepcp", label: "Sep" }] },
    { q: "Q2", opts: [{ key: "q2cp", label: "Q2" }, { key: "octcp", label: "Oct" }, { key: "novcp", label: "Nov" }, { key: "deccp", label: "Dec" }] },
    { q: "Q3", opts: [{ key: "q3cp", label: "Q3" }, { key: "jancp", label: "Jan" }, { key: "febcp", label: "Feb" }, { key: "marcp", label: "Mar" }] },
    { q: "Q4", opts: [{ key: "q4cp", label: "Q4" }, { key: "aprcp", label: "Apr" }, { key: "maycp", label: "May" }, { key: "juncp", label: "Jun" }] }
];
function gapLabel(key: string): string {
    for (const q of GAP_QUARTERS) for (const o of q.opts) if (o.key === key) return o.label;
    return key;
}

export class Visual implements IVisual {
    private root: HTMLElement;
    private host!: IVisualHost;
    private events: any = null;
    private errEl!: HTMLElement;
    private bodyEl!: HTMLElement;
    private hasRendered = false;

    private rows: Acct[] = [];
    private units: string[] = [];
    private supSet = new Set<string>();    // selected super pillars (empty = all)
    private stratSet = new Set<string>();  // selected strategic pillars (empty = all)
    private terrSet = new Set<string>();   // selected territories (empty = all)
    private _persistLast = "";
    private _skipEcho = false;              // cancels the single async update() echo that persistProperties fires
    private pillarOpen = "";                // which dropdown is open: "sup" | "strat" | "terr" | ""
    private mode: "full" | "accounts" | "maccgap" = "full";  // per-instance section to render
    private state = {
        period: "Q1", month: "all", sortKey: "q1cp", sortDir: -1,
        search: "", unit: "", maccOnly: false, highOnly: false,
        thMetric: "cp", thOp: ">=", thVal: "", terrSearch: "",
        gapQ: "Q1", gapA: "q1cp", gapB: "julcp"
    };

    // The pillar-data period label for the current view: a quarter ("Q1") when month="all",
    // else the month's full name ("July") — pillar_facts carries both (monthly grain).
    private pillarPeriod(): string {
        if (this.state.month === "all") return this.state.period;
        const M: any = { jul: "July", aug: "August", sep: "September", oct: "October",
            nov: "November", dec: "December", jan: "January", feb: "February", mar: "March",
            apr: "April", may: "May", jun: "June" };
        return M[this.state.month] || this.state.period;
    }
    // Pillar rows for an account in the CURRENT period (quarter or month), after applying the
    // super/strategic pillar selection. Returns [] if the account has none.
    private acctPillarRows(a: Acct): PillarRow[] {
        const per = this.pillarPeriod();
        const rows: PillarRow[] = (a._pillars && a._pillars[per]) || [];
        if (!this.supSet.size && !this.stratSet.size) return rows;
        return rows.filter(r =>
            (!this.supSet.size || this.supSet.has(r.sup)) &&
            (!this.stratSet.size || this.stratSet.has(r.strat)));
    }
    private hasPillarSel(): boolean { return this.supSet.size > 0 || this.stratSet.size > 0; }
    // Distinct territories across all accounts (respects the selected segment so the list narrows
    // to that segment), sorted alphanumerically by territory code for easy navigation.
    private territoryOptions(): { key: string; cp: number }[] {
        const m = new Map<string, number>();
        const cpk = PERIODS[this.state.period].cp;
        for (const a of this.rows) {
            if (!a.territory) continue;
            if (this.state.unit && a.unit !== this.state.unit) continue;
            m.set(a.territory, (m.get(a.territory) || 0) + (a[cpk] || 0));
        }
        return Array.from(m.entries()).map(([key, cp]) => ({ key, cp }))
            .sort((x, y) => x.key.localeCompare(y.key, undefined, { numeric: true, sensitivity: "base" }));
    }
    // Distinct super pillars across all accounts (current period), with $ for sort.
    private superOptions(): { key: string; cp: number }[] {
        const per = this.pillarPeriod();
        const m = new Map<string, number>();
        for (const a of this.rows) for (const r of (a._pillars[per] || []))
            m.set(r.sup, (m.get(r.sup) || 0) + r.cp);
        return Array.from(m.entries()).map(([key, cp]) => ({ key, cp }))
            .sort((x, y) => y.cp - x.cp || (x.key < y.key ? -1 : 1));
    }
    // Strategic pillars — constrained to the selected super(s) if any.
    private stratOptions(): { key: string; sup: string; cp: number }[] {
        const per = this.pillarPeriod();
        const m = new Map<string, { sup: string; cp: number }>();
        for (const a of this.rows) for (const r of (a._pillars[per] || [])) {
            if (this.supSet.size && !this.supSet.has(r.sup)) continue;
            const e = m.get(r.strat) || { sup: r.sup, cp: 0 };
            e.cp += r.cp; m.set(r.strat, e);
        }
        return Array.from(m.entries()).map(([key, v]) => ({ key, sup: v.sup, cp: v.cp }))
            .sort((x, y) => y.cp - x.cp || (x.key < y.key ? -1 : 1));
    }

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
        // persistProperties() (called at the end of every render) makes the host fire ONE more update()
        // as an echo. That echo carries no new data or state — but if we re-render on it, it tears down
        // the search <input> asynchronously, between keystrokes, which is exactly what makes the cursor
        // jump and typed characters vanish. Cancel that one self-induced echo; everything else renders
        // normally. (Deterministic — does not depend on which element has focus in the sandboxed iframe.)
        if (this._skipEcho) {
            this._skipEcho = false;
            try { if (this.events && this.events.renderingFinished) this.events.renderingFinished(options); } catch (e) { /* noop */ }
            return;
        }
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
            // Per-instance display mode (full | accounts | maccgap) from the format pane / report.json.
            try {
                const objs: any = dv && dv.metadata && (dv.metadata as any).objects;
                const mv = objs && objs.display && objs.display.mode;
                this.mode = (mv === "accounts" || mv === "maccgap" || mv === "full") ? mv
                    : (mv && mv.toString ? String(mv) : this.mode);
                if (this.mode !== "accounts" && this.mode !== "maccgap") this.mode = "full";
            } catch (e) { /* keep current mode */ }
            if (!this.rows.length) {
                if (!this.hasRendered) this.bodyEl.innerHTML = this.attn("No accounts parsed.");
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
        const bool = (row: any[], role: string): boolean => { const v = g(row, role); return v === true || v === 1 || v === "true"; };

        this.rows = [];
        const uset = new Set<string>();
        for (const row of t.rows as any[][]) {
            const name = g(row, "name"); if (name == null) continue;
            const unit = g(row, "unit");
            if (unit != null) uset.add(unit);
            this.rows.push({
                name, tpid: g(row, "tpid"), unit, territory: g(row, "territory"), atu: g(row, "atu"),
                macc: bool(row, "macc"), high: bool(row, "high"), acr: g(row, "acr"),
                maccCurated: bool(row, "maccCurated"),
                julcp: n(row, "julcp"), augcp: n(row, "augcp"), sepcp: n(row, "sepcp"),
                octcp: n(row, "octcp"), novcp: n(row, "novcp"), deccp: n(row, "deccp"),
                jancp: n(row, "jancp"), febcp: n(row, "febcp"), marcp: n(row, "marcp"),
                aprcp: n(row, "aprcp"), maycp: n(row, "maycp"), juncp: n(row, "juncp"),
                julucp: n(row, "julucp"), augucp: n(row, "augucp"), sepucp: n(row, "sepucp"),
                octucp: n(row, "octucp"), novucp: n(row, "novucp"), decucp: n(row, "decucp"),
                janucp: n(row, "janucp"), febucp: n(row, "febucp"), marucp: n(row, "marucp"),
                aprucp: n(row, "aprucp"), mayucp: n(row, "mayucp"), junucp: n(row, "junucp"),
                q1cp: n(row, "q1cp"), q1ucp: n(row, "q1ucp"), q1total: n(row, "q1total"),
                q2cp: n(row, "q2cp"), q2ucp: n(row, "q2ucp"), q2total: n(row, "q2total"),
                q3cp: n(row, "q3cp"), q3ucp: n(row, "q3ucp"), q3total: n(row, "q3total"),
                q4cp: n(row, "q4cp"), q4ucp: n(row, "q4ucp"), q4total: n(row, "q4total"),
                julcp_dod: n(row, "julcpdod"), augcp_dod: n(row, "augcpdod"), sepcp_dod: n(row, "sepcpdod"),
                octcp_dod: n(row, "octcpdod"), novcp_dod: n(row, "novcpdod"), deccp_dod: n(row, "deccpdod"),
                jancp_dod: n(row, "jancpdod"), febcp_dod: n(row, "febcpdod"), marcp_dod: n(row, "marcpdod"),
                aprcp_dod: n(row, "aprcpdod"), maycp_dod: n(row, "maycpdod"), juncp_dod: n(row, "juncpdod"),
                q1cp_dod: n(row, "q1cpdod"), q1ucp_dod: n(row, "q1ucpdod"), q1total_dod: n(row, "q1totaldod"),
                q2cp_dod: n(row, "q2cpdod"), q2ucp_dod: n(row, "q2ucpdod"), q2total_dod: n(row, "q2totaldod"),
                q3cp_dod: n(row, "q3cpdod"), q3ucp_dod: n(row, "q3ucpdod"), q3total_dod: n(row, "q3totaldod"),
                q4cp_dod: n(row, "q4cpdod"), q4ucp_dod: n(row, "q4ucpdod"), q4total_dod: n(row, "q4totaldod"),
                julcp_wow: n(row, "julcpwow"), augcp_wow: n(row, "augcpwow"), sepcp_wow: n(row, "sepcpwow"),
                octcp_wow: n(row, "octcpwow"), novcp_wow: n(row, "novcpwow"), deccp_wow: n(row, "deccpwow"),
                jancp_wow: n(row, "jancpwow"), febcp_wow: n(row, "febcpwow"), marcp_wow: n(row, "marcpwow"),
                aprcp_wow: n(row, "aprcpwow"), maycp_wow: n(row, "maycpwow"), juncp_wow: n(row, "juncpwow"),
                q1cp_wow: n(row, "q1cpwow"), q1ucp_wow: n(row, "q1ucpwow"), q1total_wow: n(row, "q1totalwow"),
                q2cp_wow: n(row, "q2cpwow"), q2ucp_wow: n(row, "q2ucpwow"), q2total_wow: n(row, "q2totalwow"),
                q3cp_wow: n(row, "q3cpwow"), q3ucp_wow: n(row, "q3ucpwow"), q3total_wow: n(row, "q3totalwow"),
                q4cp_wow: n(row, "q4cpwow"), q4ucp_wow: n(row, "q4ucpwow"), q4total_wow: n(row, "q4totalwow"),
                _pillars: parsePillars(g(row, "pillars") || "")
            });
        }
        this.units = Array.from(uset).sort();
    }

    private acctMonths(): { key: string; label: string }[] {
        const cfg = PERIODS[this.state.period];
        return [{ key: "all", label: "All" }].concat(cfg.months.map(([k, lbl]: any) => ({ key: k.replace("cp", ""), label: lbl })));
    }
    private acctMetric(): { cp: string; ucp: string; total: (a: Acct) => number; label: string } {
        const cfg = PERIODS[this.state.period];
        if (this.state.month === "all") return { cp: cfg.cp, ucp: cfg.ucp, total: (a) => a[cfg.total] || 0, label: cfg.q };
        const b = this.state.month;
        return { cp: b + "cp", ucp: b + "ucp", total: (a) => (a[b + "cp"] || 0) + (a[b + "ucp"] || 0), label: b.charAt(0).toUpperCase() + b.slice(1) };
    }
    // Pillar-scoped CP/UCP for an account in the current quarter (Q1=B semantics): when a pillar
    // is selected, the displayed pipeline is ONLY the selected-pillar slice. Else null (use raw).
    private scopedCP(a: Acct): number | null {
        if (!this.hasPillarSel()) return null;
        return this.acctPillarRows(a).reduce((s, r) => s + r.cp, 0);
    }
    private scopedUCP(a: Acct): number | null {
        if (!this.hasPillarSel()) return null;
        return this.acctPillarRows(a).reduce((s, r) => s + r.ucp, 0);
    }
    private accountCols(): [string, string, boolean][] {
        const cfg = PERIODS[this.state.period];
        return [
            ["name", "Account", false], ["tpid", "TPID", true], ["unit", "Segment", false],
            ["territory", "Territory", false], ["macc", "MACC", false], ["acr", "ACR", false],
            ...cfg.months.map(([k, lbl]: any) => [k, lbl + " CP", true] as [string, string, boolean]),
            [cfg.cp, cfg.q + " CP", true],
            ...cfg.months.map(([k, lbl]: any) => [k.replace("cp", "ucp"), lbl + " UCP", true] as [string, string, boolean]),
            [cfg.ucp, cfg.q + " UCP", true], [cfg.total, cfg.q + " Total", true]
        ];
    }
    // Scoped value for a CP/UCP column key when a pillar is selected (else the raw value).
    // Keys look like "julcp"/"q1cp"/"q1ucp"/"q1total"; pillar data is keyed by period label.
    private scopedCol(a: Acct, key: string): number {
        if (!this.hasPillarSel()) return a[key] || 0;
        const M: any = { jul: "July", aug: "August", sep: "September", oct: "October",
            nov: "November", dec: "December", jan: "January", feb: "February", mar: "March",
            apr: "April", may: "May", jun: "June", q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4" };
        const mm = key.match(/^(jul|aug|sep|oct|nov|dec|jan|feb|mar|apr|may|jun|q1|q2|q3|q4)(cp|ucp|total)$/);
        if (!mm) return a[key] || 0;
        const per = M[mm[1]], kind = mm[2];
        const rows: PillarRow[] = (a._pillars && a._pillars[per]) || [];
        const sel = rows.filter(r =>
            (!this.supSet.size || this.supSet.has(r.sup)) &&
            (!this.stratSet.size || this.stratSet.has(r.strat)));
        if (kind === "cp") return sel.reduce((s, r) => s + r.cp, 0);
        if (kind === "ucp") return sel.reduce((s, r) => s + r.ucp, 0);
        return sel.reduce((s, r) => s + r.cp + r.ucp, 0);  // total
    }
    private deltaKeys(): Set<string> {
        const cfg = PERIODS[this.state.period];
        return new Set([...cfg.months.map(([k]: any) => k), cfg.cp, cfg.ucp, cfg.total]);
    }
    private delta(v: Num, lbl: string): string {
        if (v === null || v === undefined) return `<span class="dlt na">—<i>${lbl}</i></span>`;
        if (Math.round(v) === 0) return `<span class="dlt zero">0<i>${lbl}</i></span>`;
        const cls = v > 0 ? "pos" : "neg";
        return `<span class="dlt ${cls}">${v > 0 ? "▲" : "▼"}${compactUSD(v)}<i>${lbl}</i></span>`;
    }
    private metricCell(dod: Num, wow: Num, valHtml: string): string {
        return `<td class="mcell"><span class="mval">${valHtml}</span><span class="dsub">${this.delta(dod, "d")} ${this.delta(wow, "w")}</span></td>`;
    }

    private filtered(): Acct[] {
        const q = this.state.search.trim().toLowerCase();
        const thVal = parseThreshold(this.state.thVal);
        const m = this.acctMetric();
        const thGet = this.state.thMetric === "cp" ? (a: Acct) => a[m.cp] || 0
            : this.state.thMetric === "ucp" ? (a: Acct) => a[m.ucp] || 0 : (a: Acct) => m.total(a);
        const passTh = (a: Acct) => {
            if (thVal === null) return true;
            const v = thGet(a);
            switch (this.state.thOp) {
                case ">=": return v >= thVal; case "<=": return v <= thVal;
                case ">": return v > thVal; case "<": return v < thVal; case "=": return v === thVal;
            }
            return true;
        };
        let rows = this.rows.filter(a => {
            if (this.state.unit && a.unit !== this.state.unit) return false;
            if (this.terrSet.size && !this.terrSet.has(a.territory)) return false;
            if (this.state.maccOnly && !a.macc) return false;
            if (this.state.highOnly && !a.high) return false;
            if (!passTh(a)) return false;
            if (q && !((String(a.name || "") + " " + String(a.tpid || "")).toLowerCase().includes(q))) return false;
            if (this.hasPillarSel() && this.acctPillarRows(a).length === 0) return false;
            return true;
        });
        const k = this.state.sortKey, dir = this.state.sortDir;
        rows.sort((a, b) => {
            let va: any = a[k], vb: any = b[k];
            if (typeof va === "number" || typeof vb === "number") return ((va || 0) - (vb || 0)) * dir;
            va = String(va == null ? "" : va).toLowerCase(); vb = String(vb == null ? "" : vb).toLowerCase();
            return va < vb ? -dir : va > vb ? dir : 0;
        });
        return rows;
    }

    private ncpPctCls(p: number): string {
        return p === 0 ? "ncp-pz" : p >= 50 ? "ncp-pr" : p >= 32 ? "ncp-po" : "ncp-pg";
    }

    private gapQOpts(): { key: string; label: string }[] {
        const q = GAP_QUARTERS.filter(x => x.q === this.state.gapQ)[0] || GAP_QUARTERS[0];
        return q.opts;
    }

    private noCpCard(): string {
        const A = { cp: this.state.gapA, label: gapLabel(this.state.gapA) };
        const B = { cp: this.state.gapB, label: gapLabel(this.state.gapB) };
        const U: Record<string, { macc: number[]; hc: number[] }> = {};
        const ens = (u: string) => U[u] || (U[u] = { macc: [0, 0, 0], hc: [0, 0, 0] });
        for (const a of this.rows) {
            const u = a.unit || "(unmapped)";
            const noA = !((a[A.cp] || 0) > 0), noB = !((a[B.cp] || 0) > 0);
            if (a.maccCurated) { const o = ens(u).macc; o[0]++; if (noA) o[1]++; if (noB) o[2]++; }
            if (a.high) { const o = ens(u).hc; o[0]++; if (noA) o[1]++; if (noB) o[2]++; }
        }
        const names = Object.keys(U).sort();
        const T = { macc: [0, 0, 0], hc: [0, 0, 0] };
        names.forEach(n => (["macc", "hc"] as const).forEach(k => [0, 1, 2].forEach(i => T[k][i] += (U[n] as any)[k][i])));
        const cell = (no: number, tot: number, sep: boolean) => {
            const p = tot ? Math.round((no / tot) * 100) : 0;
            return `<td class="ncp-n${sep ? " ncp-sep" : ""}">${no}</td><td class="ncp-p ${this.ncpPctCls(p)}">${tot ? p + "%" : "—"}</td>`;
        };
        const rowHtml = (label: string, m: number[], h: number[], tot: boolean) => `
          <tr class="${tot ? "ncp-tot" : ""}">
            <td class="ncp-u">${esc(label)}</td>
            <td class="ncp-n ncp-pop">${m[0]}</td>${cell(m[1], m[0], false)}${cell(m[2], m[0], false)}
            <td class="ncp-n ncp-pop ncp-sep">${h[0]}</td>${cell(h[1], h[0], false)}${cell(h[2], h[0], false)}
          </tr>`;
        const body = names.map(n => rowHtml(n, U[n].macc, U[n].hc, false)).join("");
        const qRow = GAP_QUARTERS.map(q => `<button class="seg-tab gap-q ${q.q === this.state.gapQ ? "active" : ""}" data-gapq="${q.q}">${q.q}</button>`).join("");
        const opts = this.gapQOpts();
        const pillRow = (which: string, sel: string) => opts
            .map(p => `<button class="seg-tab gap-pill ${p.key === sel ? "active" : ""}" data-gap="${which}" data-key="${p.key}">${esc(p.label)}</button>`).join("");
        return `<div class="ncp-card">
          <div class="ncp-eyebrow">MACC COVERAGE GAP</div>
          <h2 class="ncp-title">MACC &amp; &gt;$100K ACR accounts with no CP, by Sales Unit</h2>
          <div class="seg-tabs inline" data-tabs="gapQ">${qRow}</div>
          <div class="gap-filters">
            <div class="gap-fset"><span class="gap-flbl">Column A</span><div class="seg-tabs inline sub" data-tabs="gapA">${pillRow("A", this.state.gapA)}</div></div>
            <div class="gap-fset"><span class="gap-flbl">Column B</span><div class="seg-tabs inline sub" data-tabs="gapB">${pillRow("B", this.state.gapB)}</div></div>
          </div>
          <div class="tablewrap scrollx"><table class="ncp-tbl">
            <thead>
              <tr class="ncp-grphdr"><th></th><th class="ncp-blk" colspan="5">MACC</th><th class="ncp-blk ncp-sep" colspan="5">&gt;$100K ACR</th></tr>
              <tr><th class="ncp-u">SALES UNIT</th>
                <th class="ncp-n">MACC</th><th class="ncp-n">#${esc(A.label)}</th><th class="ncp-p">%${esc(A.label)}</th><th class="ncp-n">#${esc(B.label)}</th><th class="ncp-p">%${esc(B.label)}</th>
                <th class="ncp-n ncp-sep">&gt;$100K</th><th class="ncp-n">#${esc(A.label)}</th><th class="ncp-p">%${esc(A.label)}</th><th class="ncp-n">#${esc(B.label)}</th><th class="ncp-p">%${esc(B.label)}</th></tr>
            </thead>
            <tbody>${body}${rowHtml("UK&I Total", T.macc, T.hc, true)}</tbody>
          </table></div>
          <span class="note ncp-foot">No CP = zero committed pipeline. Columns A &amp; B are each selectable to any quarter or month above.</span>
        </div>`;
    }

    // Row-2 pillar tiles: CP / UCP / Total broken down by strategic pillar for the filtered
    // set (current quarter, pillar-scoped), + a DoD/WoW movement tile (account-level — there is
    // no per-pillar history store yet, so movement reflects the filtered set's CP/UCP delta).
    private pillarTiles(rows: Acct[], m: { cp: string; ucp: string; label: string }): string {
        // Aggregate pillar rows across the filtered accounts (respecting pillar selection).
        const agg = new Map<string, { cp: number; ucp: number; nqp: number }>();
        let tCp = 0, tUcp = 0, tNqp = 0;
        for (const a of rows) for (const r of this.acctPillarRows(a)) {
            const e = agg.get(r.strat) || { cp: 0, ucp: 0, nqp: 0 };
            e.cp += r.cp; e.ucp += r.ucp; e.nqp += r.nqp; agg.set(r.strat, e);
            tCp += r.cp; tUcp += r.ucp; tNqp += r.nqp;
        }
        const items = Array.from(agg.entries()).map(([strat, v]) => ({ strat, ...v }));
        const tile = (title: string, sub: string, pick: (x: { cp: number; ucp: number; nqp: number }) => number, tot: number) => {
            const top = items.map(it => ({ strat: it.strat, v: pick(it) }))
                .filter(x => x.v !== 0).sort((a, b) => b.v - a.v).slice(0, 7);
            const max = top.reduce((mx, x) => Math.max(mx, Math.abs(x.v)), 0) || 1;
            const bars = top.length ? top.map(x => `
                <div class="pl-row"><span class="pl-name" title="${esc(x.strat)}">${esc(x.strat)}</span>
                  <span class="pl-bar"><i style="width:${Math.round(Math.abs(x.v) / max * 100)}%"></i></span>
                  <span class="pl-val">${money(x.v)}</span></div>`).join("")
                : `<div class="pl-empty">no pillar pipeline</div>`;
            return `<div class="kpi pl-tile"><div class="k-label">${title} <span class="pl-by">by pillar</span></div>
              <div class="k-value pl-tot">${money(tot)}</div><div class="pl-sub">${sub}</div>${bars}</div>`;
        };
        // Tile 4: SUPER-pillar breakdown — Committed + Uncommitted columns (current period).
        const sup = new Map<string, { cp: number; ucp: number }>();
        for (const a of rows) for (const r of this.acctPillarRows(a)) {
            const e = sup.get(r.sup) || { cp: 0, ucp: 0 };
            e.cp += r.cp; e.ucp += r.ucp; sup.set(r.sup, e);
        }
        const supRows = Array.from(sup.entries()).map(([s, v]) => ({ s, ...v }))
            .sort((a, b) => (b.cp + b.ucp) - (a.cp + a.ucp));
        const supBody = supRows.length ? supRows.map(x => `
            <div class="pl-srow"><span class="pl-sname" title="${esc(x.s)}">${esc(x.s)}</span>
              <span class="pl-sval">${money(x.cp)}</span><span class="pl-sval">${money(x.ucp)}</span></div>`).join("")
            : `<div class="pl-empty">no pillar pipeline</div>`;
        const moveTile = `<div class="kpi pl-tile pl-super"><div class="k-label">Super Strategic Pillar</div>
          <div class="pl-shead"><span class="pl-sname"></span><span class="pl-sval">Committed</span><span class="pl-sval">Uncommitted</span></div>
          <div class="pl-slist">${supBody}</div></div>`;

        return `<div class="kpis kpis-live pl-tiles" id="acKpisLive">
          ${moveTile}
          ${tile(this.state.period + " Committed", `${items.length} strategic pillars`, x => x.cp, tCp)}
          ${tile(this.state.period + " Uncommitted", "conversion headroom", x => x.ucp, tUcp)}
          ${tile(this.state.period + " Total", "committed + uncommitted", x => x.cp + x.ucp, tCp + tUcp)}
        </div>`;
    }

    // Multi-select pillar dropdown (button + checkbox panel). id = "sup" | "strat" | "terr".
    // If searchVal is provided, render a search box at the top of the panel that filters items
    // (used for Territory, which can have many options).
    private pillarDropdown(id: string, label: string, opts: { key: string; label: string }[], sel: Set<string>, searchVal?: string): string {
        const btn = sel.size ? `${sel.size} selected` : label;
        const open = this.pillarOpen === id;
        const searchable = searchVal !== undefined;
        const q = (searchVal || "").trim().toLowerCase();
        const shown = q ? opts.filter(o => o.label.toLowerCase().includes(q)) : opts;
        const searchBox = searchable
            ? `<input type="search" class="pl-dd-search" id="acTerrSearch" placeholder="Search ${esc(label.toLowerCase())}…" value="${esc(searchVal || "")}" />`
            : "";
        const items = shown.map(o => `<label><input type="checkbox" value="${esc(o.key)}"${sel.has(o.key) ? " checked" : ""}> ${esc(o.label)}</label>`).join("")
            || `<div class="pl-empty" style="padding:6px 10px">none</div>`;
        return `<div class="pl-dd" id="pdd_${id}">
          <button type="button" class="pl-dd-btn${sel.size ? " on" : ""}" data-dd="${id}">${esc(btn)} ▾</button>
          <div class="pl-dd-panel"${open ? "" : " hidden"} data-ddp="${id}">${searchBox}${items}</div>
        </div>`;
    }

    private render() {
        const m = this.acctMetric();
        const q = this.state.period.toLowerCase();
        const allRows = this.rows;
        const rows = this.filtered();
        const cols = this.accountCols();
        const dKeys = this.deltaKeys();

        // ---- Row 1: 4 unified tiles. Big number = FILTERED; subline = all-accounts total. ----
        // When a pillar is selected (Q1=B), CP/UCP are the pillar-scoped slice.
        const cpOf = (a: Acct) => { const s = this.scopedCP(a); return s !== null ? s : (a[m.cp] || 0); };
        const ucpOf = (a: Acct) => { const s = this.scopedUCP(a); return s !== null ? s : (a[m.ucp] || 0); };
        const totOf = (a: Acct) => this.hasPillarSel() ? cpOf(a) + ucpOf(a) : m.total(a);
        const sum = (set: Acct[], f: (a: Acct) => number) => set.reduce((s, a) => s + f(a), 0);
        const fCp = sum(rows, cpOf), fUcp = sum(rows, ucpOf), fTot = sum(rows, totOf);
        const aCp = sum(allRows, cpOf), aUcp = sum(allRows, ucpOf), aTot = sum(allRows, totOf);
        const scope = [this.state.maccOnly ? "MACC" : null, this.state.highOnly ? "high-consuming" : null,
            this.state.unit || null, this.hasPillarSel() ? "pillar" : null].filter(Boolean).join(" · ") || "all accounts";
        const topKpis = `<div class="kpis" id="acKpisTop">
          <div class="kpi live"><div class="k-label">Accounts (filtered)</div><div class="k-value">${rows.length.toLocaleString()}</div><div class="k-foot">${esc(scope)} · of ${allRows.length.toLocaleString()}</div></div>
          <div class="kpi live"><div class="k-label">${esc(m.label)} Committed</div><div class="k-value">${money(fCp)}</div><div class="k-foot">all: ${money(aCp)}</div></div>
          <div class="kpi live"><div class="k-label">${esc(m.label)} Uncommitted</div><div class="k-value">${money(fUcp)}</div><div class="k-foot">all: ${money(aUcp)}</div></div>
          <div class="kpi live"><div class="k-label">${esc(m.label)} Total</div><div class="k-value">${money(fTot)}</div><div class="k-foot">all: ${money(aTot)}</div></div>
        </div>`;

        // ---- Row 2: pillar breakdown for the filtered set (pillar-scoped $, current quarter). ----
        const liveKpis = this.pillarTiles(rows, m);

        const sortMode = (base: string): string => {
            // value sort -> arrow after label; delta sort -> arrow on the active d/w chip.
            const dir = this.state.sortDir < 0 ? "▼" : "▲";
            const valArrow = this.state.sortKey === base ? ` ${dir}` : "";
            const dOn = this.state.sortKey === base + "_dod";
            const wOn = this.state.sortKey === base + "_wow";
            const chips = `<span class="dsort${dOn ? " on" : ""}" data-dsort="${esc(base + "_dod")}">d${dOn ? dir : ""}</span>`
                + `<span class="dsort${wOn ? " on" : ""}" data-dsort="${esc(base + "_wow")}">w${wOn ? dir : ""}</span>`;
            return `<span class="sarrow">${valArrow}</span><span class="dsortwrap">${chips}</span>`;
        };
        const head = cols.map(([k, lbl, num]) => {
            const deltaCol = dKeys.has(k);
            const inner = deltaCol
                ? `${esc(lbl)}${sortMode(k)}`
                : `${esc(lbl)}<span class="sarrow">${k === this.state.sortKey ? (this.state.sortDir < 0 ? " ▼" : " ▲") : ""}</span>`;
            return `<th class="sortable ${num && k !== "tpid" ? "" : "lft"}" data-key="${esc(k)}">${inner}</th>`;
        }).join("");

        const body = rows.slice(0, 400).map(a => "<tr>" + cols.map(([key, , ]) => {
            if (key === "name") return `<td class="lft" title="${esc(a.atu || "")}">${esc(a.name)}${a.high ? ' <span class="tag hot">HC</span>' : ""}</td>`;
            if (key === "tpid") return `<td class="lft tpid-cell">${esc(a.tpid)}</td>`;
            if (key === "unit") return `<td class="lft seg-cell">${esc(a.unit)}</td>`;
            if (key === "territory") return `<td class="lft small">${esc(a.territory)}</td>`;
            if (key === "macc") return `<td>${a.macc ? '<span class="tag macc">MACC</span>' : '<span class="muted">—</span>'}</td>`;
            if (key === "acr") return `<td class="lft">${a.acr ? esc(a.acr) : '<span class="muted">—</span>'}</td>`;
            if (dKeys.has(key)) return this.metricCell(a[key + "_dod"], a[key + "_wow"], money(this.scopedCol(a, key)));
            return `<td>${money(this.scopedCol(a, key))}</td>`;
        }).join("") + "</tr>").join("");

        const sumRow = (set: Acct[], label: string, cls: string) => {
            const cells = cols.map(([key, , num], i) => {
                if (i === 0) return `<td class="lft">${esc(label)}</td>`;
                if (!num || key === "tpid") return `<td></td>`;
                const tot = set.reduce((s, a) => s + this.scopedCol(a, key), 0);
                if (dKeys.has(key)) {
                    const hasW = set.some(a => a[key + "_wow"] != null);
                    const dod = set.reduce((s, a) => s + (a[key + "_dod"] || 0), 0);
                    const wow = hasW ? set.reduce((s, a) => s + (a[key + "_wow"] || 0), 0) : null;
                    return this.metricCell(dod, wow, money(tot));
                }
                return `<td>${money(tot)}</td>`;
            }).join("");
            return `<tr class="${cls}">${cells}</tr>`;
        };
        const foot = sumRow(this.rows, `All accounts (${this.rows.length})`, "ftot") + sumRow(rows, `Filtered (${rows.length})`, "ffilt");

        const monthTabs = this.acctMonths().map(mm => `<button class="seg-tab ${mm.key === this.state.month ? "active" : ""}" data-m="${esc(mm.key)}">${esc(mm.label)}</button>`).join("");
        const unitOpts = this.units.map(u => `<option ${u === this.state.unit ? "selected" : ""}>${esc(u)}</option>`).join("");
        const countNote = `${rows.length.toLocaleString()} of ${this.rows.length.toLocaleString()} accounts` + (rows.length > 400 ? " (table shows top 400; totals cover all matches)" : "");

        const html = `
        <div class="nnr-root">
          ${this.mode === "maccgap" ? this.noCpCard() : `
          ${topKpis}
          ${liveKpis}
          <div class="section-h"><h2>Accounts — MACC &amp; pipeline</h2>
            <span class="note">MSX account pipeline · each CP/UCP/Total shows Δ vs prior day (d) and prior week (w) · second tile row reflects the filters below</span></div>
          <div class="filters">
            <div class="seg-tabs inline" data-tabs="period">
              ${Object.keys(PERIODS).map(p => `<button class="seg-tab ${this.state.period === p ? "active" : ""}" data-p="${p}">${p}</button>`).join("")}
            </div>
            <div class="seg-tabs inline month" data-tabs="month">${monthTabs}</div>
            <input id="acSearch" type="search" placeholder="Search account or TPID…" value="${esc(this.state.search)}" />
            <select id="acUnit" class="seg-narrow"><option value="">All segments</option>${unitOpts}</select>
            ${this.pillarDropdown("terr", "Territory", this.territoryOptions().map(o => ({ key: o.key, label: o.key })), this.terrSet, this.state.terrSearch)}
            ${this.terrSet.size ? `<button id="acTerrClear" class="lnk">clear</button>` : ""}
          </div>
          <div class="filters th-row">
            <span class="th-lbl">Threshold:</span>
            <select id="acThMetric"><option value="cp" ${this.state.thMetric === "cp" ? "selected" : ""}>Committed</option><option value="ucp" ${this.state.thMetric === "ucp" ? "selected" : ""}>Uncommitted</option><option value="total" ${this.state.thMetric === "total" ? "selected" : ""}>Total</option></select>
            <select id="acThOp">${["&gt;=:>=", "&lt;=:<=", "&gt;:>", "&lt;:<", "=:="].map(o => { const [lbl, val] = o.split(":"); return `<option value="${val}" ${this.state.thOp === val ? "selected" : ""}>${lbl}</option>`; }).join("")}</select>
            <input id="acThVal" type="text" placeholder="e.g. 1M, 500K, 250000" value="${esc(this.state.thVal)}" />
            <button id="acThClear" class="lnk">clear</button>
            ${this.pillarDropdown("sup", "Super pillar", this.superOptions().map(o => ({ key: o.key, label: o.key })), this.supSet)}
            ${this.pillarDropdown("strat", "Strategic pillar", this.stratOptions().map(o => ({ key: o.key, label: o.key })), this.stratSet)}
            ${this.hasPillarSel() ? `<button id="acPillarClear" class="lnk">clear pillars</button>` : ""}
            <label class="chk"><input type="checkbox" id="acMacc" ${this.state.maccOnly ? "checked" : ""}/> MACC only</label>
            <label class="chk"><input type="checkbox" id="acHigh" ${this.state.highOnly ? "checked" : ""}/> High consuming</label>
          </div>
          <div class="tablewrap scrollx acct-scroll"><table id="acTable" class="prog-tbl acct-tbl">
            <thead><tr id="acHead">${head}</tr></thead>
            <tbody id="acBody">${body || `<tr><td colspan="${cols.length}" class="lft muted" style="padding:18px">No accounts match these filters.</td></tr>`}</tbody>
            <tfoot id="acFoot">${foot}</tfoot>
          </table></div>
          ${this.mode === "full" ? this.noCpCard() : ""}
          `}
        </div>`;
        // Preserve focus + caret on text inputs across the full re-render (so typing
        // a multi-digit threshold or a search term doesn't lose focus after each key).
        const active = document.activeElement as HTMLInputElement;
        let focusId: string | null = null, caret = 0;
        if (active && active.id && (active.id === "acThVal" || active.id === "acSearch" || active.id === "acTerrSearch")) {
            focusId = active.id;
            caret = active.selectionStart || 0;
        }
        this.bodyEl.innerHTML = `<style>${STYLES}</style>${html}`;
        this.wire();
        if (focusId) {
            const el = this.root.querySelector("#" + focusId) as HTMLInputElement;
            if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) { /* noop */ } }
        }
        this.persistState();
    }

    /* ---- session state persistence (survives page navigation via host.persistProperties) ----
       Serializes the pillar/territory filter sets + view state (period/month/sort/search/threshold/
       gap columns) into a report object property so update() can rehydrate it when Power BI destroys/
       recreates the visual on page switch. Persists per visual instance (each Accounts/MACC tile keeps
       its own). Session-scoped in reading view; also captured by bookmarks. Guarded by _persistLast so
       the persist-triggered update never loops or clobbers active edits. */
    private serializeState(): string {
        return JSON.stringify({
            v: 1,
            sup: Array.from(this.supSet), strat: Array.from(this.stratSet), terr: Array.from(this.terrSet),
            state: this.state
        });
    }
    private applyPersisted(s: string) {
        try {
            const o: any = JSON.parse(s);
            if (!o) return;
            const L = (set: Set<string>, arr: any) => { set.clear(); if (Array.isArray(arr)) for (const v of arr) set.add(String(v)); };
            L(this.supSet, o.sup); L(this.stratSet, o.strat); L(this.terrSet, o.terr);
            if (o.state && typeof o.state === "object") Object.assign(this.state, o.state);
        } catch (e) { /* noop */ }
    }
    private persistState() {
        const s = this.serializeState();
        if (s === this._persistLast) return;
        this._persistLast = s;
        try {
            this._skipEcho = true;   // the next host update() is this call's echo — skip re-rendering on it
            (this.host as any).persistProperties({ merge: [{ objectName: "persist", selector: null, properties: { s } }] });
        } catch (e) { this._skipEcho = false; }
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
        this.root.querySelectorAll('[data-tabs="period"] .seg-tab').forEach(b =>
            b.addEventListener("click", () => { this.state.period = (b as HTMLElement).dataset.p as string; this.state.month = "all"; this.state.sortKey = PERIODS[this.state.period].cp; this.state.sortDir = -1; rerender(); }));
        this.root.querySelectorAll('[data-tabs="month"] .seg-tab').forEach(b =>
            b.addEventListener("click", () => { this.state.month = (b as HTMLElement).dataset.m as string; rerender(); }));
        const bind = (id: string, ev: string, fn: (el: any) => void) => {
            const el = this.root.querySelector("#" + id) as HTMLInputElement;
            if (el) el.addEventListener(ev, () => fn(el));
        };
        bind("acSearch", "input", el => { this.state.search = el.value; rerender(); });
        bind("acUnit", "change", el => {
            this.state.unit = el.value;
            // Prune territory picks no longer valid for the selected segment.
            if (this.terrSet.size) {
                const valid = new Set(this.territoryOptions().map(o => o.key));
                Array.from(this.terrSet).forEach(k => { if (!valid.has(k)) this.terrSet.delete(k); });
            }
            rerender();
        });
        bind("acMacc", "change", el => { this.state.maccOnly = el.checked; rerender(); });
        bind("acHigh", "change", el => { this.state.highOnly = el.checked; rerender(); });
        bind("acThMetric", "change", el => { this.state.thMetric = el.value; rerender(); });
        bind("acThOp", "change", el => { this.state.thOp = el.value; rerender(); });
        bind("acThVal", "input", el => { this.state.thVal = el.value; rerender(); });
        bind("acThClear", "click", () => { this.state.thVal = ""; rerender(); });
        // Pillar multi-selects (Super + Strategic)
        this.root.querySelectorAll(".pl-dd-btn").forEach(b =>
            b.addEventListener("click", (e: any) => {
                e.stopPropagation();
                const id = (b as HTMLElement).dataset.dd as string;
                this.pillarOpen = this.pillarOpen === id ? "" : id;
                rerender();
            }));
        this.root.querySelectorAll(".pl-dd-panel").forEach(p =>
            p.addEventListener("change", (e: any) => {
                const cb = e.target as HTMLInputElement;
                if (!cb || cb.type !== "checkbox") return;
                const id = (p as HTMLElement).dataset.ddp as string;
                const sel = id === "sup" ? this.supSet : id === "strat" ? this.stratSet : this.terrSet;
                if (cb.checked) sel.add(cb.value); else sel.delete(cb.value);
                // If a super is deselected, drop now-invalid strategic picks.
                if (id === "sup" && this.supSet.size) {
                    const valid = new Set(this.stratOptions().map(o => o.key));
                    Array.from(this.stratSet).forEach(k => { if (!valid.has(k)) this.stratSet.delete(k); });
                }
                rerender();
            }));
        this.root.querySelectorAll(".pl-dd-panel").forEach(p =>
            p.addEventListener("click", (e: any) => e.stopPropagation()));
        bind("acPillarClear", "click", () => { this.supSet.clear(); this.stratSet.clear(); this.pillarOpen = ""; rerender(); });
        bind("acTerrClear", "click", () => { this.terrSet.clear(); this.state.terrSearch = ""; this.pillarOpen = ""; rerender(); });
        bind("acTerrSearch", "input", el => { this.state.terrSearch = el.value; this.pillarOpen = "terr"; rerender(); });
        this.root.querySelectorAll(".gap-q").forEach(b =>
            b.addEventListener("click", () => {
                this.state.gapQ = (b as HTMLElement).dataset.gapq as string;
                const opts = this.gapQOpts();
                this.state.gapA = opts[0].key;   // quarter roll-up
                this.state.gapB = opts[1].key;   // first month
                rerender();
            }));
        this.root.querySelectorAll(".gap-pill").forEach(b =>
            b.addEventListener("click", () => {
                const el = b as HTMLElement;
                if (el.dataset.gap === "A") this.state.gapA = el.dataset.key as string;
                else this.state.gapB = el.dataset.key as string;
                rerender();
            }));
        this.root.querySelectorAll("#acTable th.sortable").forEach(th =>
            th.addEventListener("click", () => {
                const k = (th as HTMLElement).dataset.key as string;
                const numeric = ["name", "unit", "territory", "acr", "macc"].indexOf(k) < 0;
                if (this.state.sortKey === k) this.state.sortDir *= -1;
                else { this.state.sortKey = k; this.state.sortDir = numeric ? -1 : 1; }
                this.render();
            }));
        // DoD / WoW sort chips in the metric column headers (sort by the delta, not the value).
        this.root.querySelectorAll("#acTable .dsort").forEach(el =>
            el.addEventListener("click", (ev) => {
                ev.stopPropagation();   // don't trigger the column's value-sort
                const k = (el as HTMLElement).dataset.dsort as string;
                if (this.state.sortKey === k) this.state.sortDir *= -1;
                else { this.state.sortKey = k; this.state.sortDir = -1; }
                this.render();
            }));
    }
}
