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

interface Row {
    unit: string; group: string; territory: string; raw: string;
    budget: number; unitBudget: number; committed: number; uncommitted: number; blocked: number;
    segment?: string;   // unit-rollup label (bridge consumes this)
}
interface Section { label: string; rows: Row[]; official: { target: Num; committed: Num; blocked: Num; uncommitted: Num }; }
interface QData { sections: Section[]; }

function compactUSD(v: Num): string {
    if (v === null || v === undefined) return "—";
    const a = Math.abs(v);
    if (a >= 1e6) return "$" + (a / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return "$" + Math.round(a / 1e3).toLocaleString() + "K";
    return "$" + Math.round(a).toLocaleString();
}
function money(v: Num): string {
    if (v === null || v === undefined) return "—";
    const a = Math.abs(v);
    if (a >= 1e6) return (v < 0 ? "-" : "") + "$" + (a / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return (v < 0 ? "-" : "") + "$" + Math.round(a / 1e3).toLocaleString() + "K";
    return (v < 0 ? "-" : "") + "$" + Math.round(a).toLocaleString();
}
function pct(v: Num): string { return v === null || v === undefined ? "—" : (v * 100).toFixed(0) + "%"; }
function covClass(p: Num): string {
    if (p === null || p === undefined) return "";
    if (p >= 0.9) return "cov-good"; if (p >= 0.65) return "cov-warn"; return "cov-bad";
}
function esc(s: any): string {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]));
}

interface RowCalc { C: number; E: number; J: number; K: number; cov: Num; gap75: number; gap100: number; u2cNeed: Num; outlook: number; projCov: Num; overridden: boolean; }

interface CalcNode {
    level: "unit" | "group" | "territory" | "total";
    key: string;        // override key `${q}|${m}|${level}|${id}`
    id: string;
    label: string;
    depth: number;
    C: number; E: number; J: number; K: number;   // target, committed, uncommitted, blocked
    conv: number;       // effective Proj Conv (override or derived)
    convDerived: number;
    overridden: boolean;
    outlook: number;
    cov: Num; gap75: number; gap100: number; u2cNeed: Num;
    children?: CalcNode[];
    expandable?: boolean;
}

// Carry-forward weights for the quarter rollup: a month-1 (July-type) non-recurring milestone's
// converted uncommitted carries forward through the quarter (~3×), month-2 ~2×, month-3 ~1×.
// Verified against live data (3·Jul+2·Aug+1·Sep ≈ the authoritative quarter to within recurring noise).
const CARRY = [3, 2, 1];

// Default ("derived") projected conversion for a cell = the uncommitted-to-commit rate implied to hit
// target (U2C need), clamped 0..1. Month-1 aims at 100% coverage, later months at 75% (the existing
// threshold convention). This SEEDS Proj Conv; managers override per territory-month.
function defaultConv(C: number, E: number, J: number, isM1: boolean): number {
    if (!J) return 0;
    const gap = isM1 ? (C - E) : (0.75 * C - E);
    return Math.max(0, Math.min(1, gap / J));
}

function calcOutlookRow(C: number, E: number, J: number, K: number, isM1: boolean, override?: number): RowCalc {
    const cov = C ? E / C : null;
    const gap75 = C * 0.75 - E;
    const gap100 = C - E;
    const u2c75 = J ? gap75 / J : null;
    const u2c100 = J ? gap100 / J : null;
    const defRate = isM1 ? u2c100 : u2c75;
    let rate: Num, N: number, O: number, P: Num;
    if (override !== null && override !== undefined) {
        P = override; O = P * C; N = O - E; rate = J ? N / J : null;
    } else {
        const rateClamped = defRate === null || defRate === undefined ? 0 : Math.max(0, Math.min(1, defRate));
        N = J * rateClamped; O = E + N; P = C ? O / C : null; rate = defRate;
    }
    return { C, E, J, K, cov, gap75, gap100, u2cNeed: rate, outlook: O, projCov: P, overridden: override !== null && override !== undefined };
}

export class Visual implements IVisual {
    private root: HTMLElement;
    private host!: IVisualHost;
    private events: any = null;
    private errEl!: HTMLElement;
    private bodyEl!: HTMLElement;
    private hasRendered = false;

    private quarters: Record<string, QData> = {};
    private qkeys: string[] = [];
    private segOrder: string[] = [];
    private conf = { c: 0.95, b: 0.10, u: 0.32 };
    private state = {
        q: "", m: 0,
        // Proj Conv overrides, keyed `${q}|${m}|${level}|${id}` (level: t|g|u|T) — persistence-ready
        // (each key maps 1:1 to a Dataverse override row: quarter, month_index, level, key, proj_conv).
        overrides: {} as Record<string, number>,
        expand: {} as Record<string, boolean>,   // drill state per unit/group node key
        bSeg: "All",
        bProjOv: {} as Record<string, number>
    };
    private _persistLast = "";

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

    public update(options: VisualUpdateOptions) {
        try { if (this.events && this.events.renderingStarted) this.events.renderingStarted(options); } catch (e) { /* noop */ }
        try {
            const dv: DataView = options.dataViews && options.dataViews[0];
            const hasTable = !!(dv && dv.table);
            const nrows = hasTable && dv.table.rows ? dv.table.rows.length : 0;
            const ncols = hasTable && dv.table.columns ? dv.table.columns.length : 0;
            this.readSettings(dv);
            if (!hasTable || nrows === 0 || ncols === 0) {
                if (!this.hasRendered) this.bodyEl.innerHTML = this.attn("Waiting for data… (rows=" + nrows + " cols=" + ncols + ")");
                try { if (this.events && this.events.renderingFinished) this.events.renderingFinished(options); } catch (e) { /* noop */ }
                return;
            }
            this.reshape(dv.table);
            if (!this.qkeys.length) {
                if (!this.hasRendered) this.bodyEl.innerHTML = this.attn("No outlook data parsed.");
                try { if (this.events && this.events.renderingFinished) this.events.renderingFinished(options); } catch (e) { /* noop */ }
                return;
            }
            if (this.qkeys.indexOf(this.state.q) < 0) { this.state.q = this.qkeys[0]; this.state.m = 0; }
            this.restoreState(dv);
            if (this.qkeys.indexOf(this.state.q) < 0) { this.state.q = this.qkeys[0]; this.state.m = 0; }
            this.render();
            this.hasRendered = true;
            if (this.errEl) { this.errEl.textContent = ""; this.errEl.style.padding = "0"; }
            try { if (this.events && this.events.renderingFinished) this.events.renderingFinished(options); } catch (e) { /* noop */ }
        } catch (e: any) {
            this.showErr("UPDATE EXCEPTION: " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
            try { if (this.events && this.events.renderingFailed) this.events.renderingFailed(options, String(e && e.message ? e.message : e)); } catch (e2) { /* noop */ }
        }
    }

    private readSettings(dv: DataView) {
        try {
            const objs: any = dv && dv.metadata && (dv.metadata as any).objects;
            const b = objs && objs.bridge;
            if (b) {
                if (typeof b.confCommitted === "number") this.conf.c = b.confCommitted / 100;
                if (typeof b.confBlocked === "number") this.conf.b = b.confBlocked / 100;
                if (typeof b.confUncommitted === "number") this.conf.u = b.confUncommitted / 100;
            }
        } catch (e) { /* noop */ }
    }

    private attn(msg: string): string {
        return `<div style="font-family:'Segoe UI',monospace;padding:14px;color:#8a5a00;background:#fff4e5;border:1px solid #f0c47a;border-radius:8px;margin:10px;white-space:pre-wrap;font-size:12px;line-height:1.4;">${esc(msg)}</div>`;
    }

    private reshape(t: DataViewTable) {
        const col: Record<string, number> = {};
        t.columns.forEach((c, i) => { const r: any = c.roles || {}; Object.keys(r).forEach(k => { if (r[k]) col[k] = i; }); });
        const g = (row: any[], role: string): any => { const i = col[role]; return i === undefined ? null : row[i]; };
        const n = (row: any[], role: string): number => { const v = g(row, role); return v === null || v === undefined ? 0 : Number(v); };

        const qmap: Record<string, Record<number, Section>> = {};
        const segSeen: string[] = [];
        const qorder: string[] = [];
        for (const row of t.rows as any[][]) {
            const quarter = g(row, "quarter"); if (quarter == null) continue;
            const mi = Number(g(row, "monthIndex"));
            const mlabel = g(row, "monthLabel");
            const segment = g(row, "segment");
            if (qorder.indexOf(quarter) < 0) qorder.push(quarter);
            qmap[quarter] = qmap[quarter] || {};
            if (!qmap[quarter][mi]) {
                qmap[quarter][mi] = {
                    label: mlabel == null ? ("Slice " + (mi + 1)) : mlabel, rows: [],
                    official: { target: g(row, "offTarget"), committed: g(row, "offCommitted"), blocked: g(row, "offBlocked"), uncommitted: g(row, "offUncommitted") }
                };
            }
            if (segment != null) {
                if (segSeen.indexOf(segment) < 0) segSeen.push(segment);
                qmap[quarter][mi].rows.push({
                    unit: g(row, "unit") || segment, group: g(row, "group") || "", territory: g(row, "territory") || "",
                    raw: g(row, "territory") || segment,
                    budget: n(row, "budget"), unitBudget: n(row, "unitBudget"),
                    committed: n(row, "committed"), uncommitted: n(row, "uncommitted"), blocked: n(row, "blocked")
                });
            }
        }
        this.quarters = {};
        const ordered = ["Q1", "Q2", "Q3", "Q4"].filter(q => qorder.indexOf(q) >= 0).concat(qorder.filter(q => ["Q1", "Q2", "Q3", "Q4"].indexOf(q) < 0));
        this.qkeys = ordered;
        for (const q of ordered) {
            const byM = qmap[q];
            const sections = Object.keys(byM).map(k => Number(k)).sort((a, b) => a - b).map(k => byM[k]);
            this.quarters[q] = { sections };
        }
        this.segOrder = segSeen;
    }

    private currentSection(): { sec: Section; isM1: boolean } {
        const qd = this.quarters[this.state.q] || { sections: [] };
        if (this.state.m >= qd.sections.length) this.state.m = 0;
        const sec = qd.sections[this.state.m] || { label: "", rows: [], official: { target: null, committed: null, blocked: null, uncommitted: null } };
        return { sec, isM1: this.state.m === 0 };
    }

    // Unit-level rollup of a section's territory rows — used by the bridge (segment grain).
    private orderedRows(sec: Section): Row[] {
        const byUnit: Record<string, Row> = {};
        for (const r of sec.rows) {
            const u = r.unit || r.segment;
            if (!byUnit[u]) byUnit[u] = { unit: u, group: "", territory: "", raw: u, segment: u, budget: 0, unitBudget: r.unitBudget || 0, committed: 0, uncommitted: 0, blocked: 0 } as any;
            byUnit[u].budget += r.budget; byUnit[u].committed += r.committed;
            byUnit[u].uncommitted += r.uncommitted; byUnit[u].blocked += r.blocked;
            byUnit[u].unitBudget = r.unitBudget || byUnit[u].unitBudget;
        }
        const present = this.segOrder.filter(s => byUnit[s]);
        const extra = Object.keys(byUnit).filter(s => present.indexOf(s) < 0);
        return present.concat(extra).map(s => ({ ...byUnit[s], segment: s } as any));
    }

    private ctx(C: number, E: number, J: number, K: number): { cov: Num; gap75: number; gap100: number; u2cNeed: Num } {
        const cov = C ? E / C : null;
        const gap75 = C * 0.75 - E, gap100 = C - E;
        const u2cNeed = J ? Math.max(0, gap75 / J) : null;
        return { cov, gap75, gap100, u2cNeed };
    }

    // Effective conversion for a territory cell in a given month section (override or derived seed).
    private terrConv(q: string, m: number, r: Row, isM1: boolean): number {
        const key = `${q}|${m}|t|${r.raw}`;
        const ov = this.state.overrides[key];
        return (ov !== undefined && ov !== null) ? ov : defaultConv(r.budget, r.committed, r.uncommitted, isM1);
    }

    // Quarter carry-forward derived conversion for a territory: carry-weight (3/2/1) the monthly
    // converted uncommitted, normalised, so a month-1 entry lands ~3× at the quarter. Falls back to the
    // quarter's own U2C-need when there is no monthly uncommitted to weight.
    private quarterTerrConv(q: string, raw: string, qC: number, qE: number, qJ: number): number {
        const qd = this.quarters[q]; if (!qd) return defaultConv(qC, qE, qJ, false);
        let wConv = 0, wBase = 0;
        for (let mm = 0; mm < 3 && mm < qd.sections.length; mm++) {
            const mr = qd.sections[mm].rows.filter(x => x.raw === raw)[0];
            if (!mr || !mr.uncommitted) continue;
            const conv = this.terrConv(q, mm, mr, mm === 0);
            wConv += CARRY[mm] * mr.uncommitted * conv;
            wBase += CARRY[mm] * mr.uncommitted;
        }
        return wBase > 0 ? wConv / wBase : defaultConv(qC, qE, qJ, false);
    }

    // Build the Unit→Group→Territory tree (+ TOTAL) with outlook + derived/override Proj Conv.
    private buildTree(q: string, m: number, sec: Section): { units: CalcNode[]; total: CalcNode } {
        const isM1 = m === 0, isQ = m === 3;
        // group rows: unit -> group -> [Row]
        const byU: Record<string, Record<string, Row[]>> = {};
        const unitOrder: string[] = [], unitBudget: Record<string, number> = {};
        for (const r of sec.rows) {
            const u = r.unit || r.segment, gp = r.group || "(none)";
            if (!byU[u]) { byU[u] = {}; unitOrder.push(u); }
            unitBudget[u] = r.unitBudget || unitBudget[u] || 0;
            (byU[u][gp] = byU[u][gp] || []).push(r);
        }
        const ordUnits = this.segOrder.filter(u => byU[u]).concat(unitOrder.filter(u => this.segOrder.indexOf(u) < 0));

        const ovNode = (key: string, E: number, J: number, childOutlook: number): { conv: number; convDerived: number; overridden: boolean; outlook: number } => {
            const convDerived = J ? (childOutlook - E) / J : 0;
            const ov = this.state.overrides[key];
            if (ov !== undefined && ov !== null) return { conv: ov, convDerived, overridden: true, outlook: E + J * ov };
            return { conv: convDerived, convDerived, overridden: false, outlook: childOutlook };
        };

        const units: CalcNode[] = [];
        for (const u of ordUnits) {
            const groups: CalcNode[] = [];
            for (const gp of Object.keys(byU[u])) {
                const terrs: CalcNode[] = [];
                for (const r of byU[u][gp]) {
                    const key = `${q}|${m}|t|${r.raw}`;
                    const ov = this.state.overrides[key];
                    let conv: number, convDerived: number;
                    if (isQ) { convDerived = this.quarterTerrConv(q, r.raw, r.budget, r.committed, r.uncommitted); }
                    else { convDerived = defaultConv(r.budget, r.committed, r.uncommitted, isM1); }
                    const overridden = ov !== undefined && ov !== null;
                    conv = overridden ? ov : convDerived;
                    const outlook = r.committed + r.uncommitted * conv;
                    terrs.push({
                        level: "territory", key, id: r.raw, label: r.territory || r.raw, depth: 2,
                        C: r.budget, E: r.committed, J: r.uncommitted, K: r.blocked,
                        conv, convDerived, overridden, outlook, ...this.ctx(r.budget, r.committed, r.uncommitted, r.blocked)
                    });
                }
                terrs.sort((a, b) => b.E - a.E);
                const gE = terrs.reduce((s, t) => s + t.E, 0), gJ = terrs.reduce((s, t) => s + t.J, 0);
                const gC = terrs.reduce((s, t) => s + t.C, 0), gK = terrs.reduce((s, t) => s + t.K, 0);
                const gChildO = terrs.reduce((s, t) => s + t.outlook, 0);
                const gKey = `${q}|${m}|g|${u}>${gp}`;
                const gov = ovNode(gKey, gE, gJ, gChildO);
                groups.push({
                    level: "group", key: gKey, id: `${u}>${gp}`, label: gp, depth: 1,
                    C: gC, E: gE, J: gJ, K: gK, conv: gov.conv, convDerived: gov.convDerived,
                    overridden: gov.overridden, outlook: gov.outlook, children: terrs, expandable: true,
                    ...this.ctx(gC, gE, gJ, gK)
                });
            }
            groups.sort((a, b) => b.E - a.E);
            const uE = groups.reduce((s, g) => s + g.E, 0), uJ = groups.reduce((s, g) => s + g.J, 0);
            const uK = groups.reduce((s, g) => s + g.K, 0);
            const uC = unitBudget[u] || groups.reduce((s, g) => s + g.C, 0);   // authoritative SU target
            const uChildO = groups.reduce((s, g) => s + g.outlook, 0);
            const uKey = `${q}|${m}|u|${u}`;
            const uov = ovNode(uKey, uE, uJ, uChildO);
            units.push({
                level: "unit", key: uKey, id: u, label: u, depth: 0,
                C: uC, E: uE, J: uJ, K: uK, conv: uov.conv, convDerived: uov.convDerived,
                overridden: uov.overridden, outlook: uov.outlook, children: groups, expandable: true,
                ...this.ctx(uC, uE, uJ, uK)
            });
        }
        const off = sec.official;
        const tE = (off.committed != null ? off.committed : units.reduce((s, u) => s + u.E, 0)) as number;
        const tJ = (off.uncommitted != null ? off.uncommitted : units.reduce((s, u) => s + u.J, 0)) as number;
        const tK = (off.blocked != null ? off.blocked : units.reduce((s, u) => s + u.K, 0)) as number;
        const tC = (off.target != null ? off.target : units.reduce((s, u) => s + u.C, 0)) as number;
        const tChildO = units.reduce((s, u) => s + u.outlook, 0);
        const tKey = `${q}|${m}|T|`;
        const tov = ovNode(tKey, tE, tJ, tChildO);
        const total: CalcNode = {
            level: "total", key: tKey, id: "", label: "TOTAL", depth: 0,
            C: tC, E: tE, J: tJ, K: tK, conv: tov.conv, convDerived: tov.convDerived,
            overridden: tov.overridden, outlook: tov.outlook, ...this.ctx(tC, tE, tJ, tK)
        };
        return { units, total };
    }

    private render() {
        const { sec } = this.currentSection();
        const { units, total } = this.buildTree(this.state.q, this.state.m, sec);

        let body = "";
        for (const u of units) {
            body += this.nodeHtml(u);
            if (this.state.expand[u.key]) {
                for (const g of (u.children || [])) {
                    body += this.nodeHtml(g);
                    if (this.state.expand[g.key]) {
                        for (const t of (g.children || [])) body += this.nodeHtml(t);
                    }
                }
            }
        }
        body += this.nodeHtml(total);

        const html = `
        <div class="nnr-root">
          <div class="section-h"><h2>NNR Outlook — coverage &amp; projected conversion</h2>
            <span class="note">source: MSX/i pipeline · drill Unit → Group → Territory · Outlook = Committed + Uncommitted × Proj Conv</span></div>
          ${this.quarterTabs()}
          ${this.monthTabs()}
          <p class="edit-note">✎ Edit <strong>Proj Conv</strong> at any level. Territory-month entries roll up (quarter carries ~3×/2×/1×); rollup &amp; quarter Proj Conv are derived but editable to override the node. Clear to revert.</p>
          <div class="tablewrap scrollx"><table class="prog-tbl ol-tbl">
            <thead><tr>
              <th class="nm">Unit / Group / Territory</th><th>Target</th><th>Committed</th><th>Coverage</th><th>Blocked</th><th>Uncommitted</th>
              <th>Proj Conv</th><th>Gap→75%</th><th>Gap→100%</th><th>U2C need</th><th>Outlook</th><th>Outlook Cov</th>
            </tr></thead>
            <tbody>${body}</tbody>
          </table></div>
          <div class="legend">Outlook = Committed + Uncommitted × Proj Conv. Proj Conv defaults to the conversion implied to hit target (U2C need); territory-month edits roll up to Group → Unit → Total and carry-forward to the quarter (~3/2/1). Coverage / Gap / U2C are read-only context.</div>
          ${this.bridgeHtml()}
        </div>`;
        const active = document.activeElement as HTMLInputElement;
        const focusKey = (active && active.classList && active.classList.contains("cov-edit")) ? active.getAttribute("data-key") : null;
        this.bodyEl.innerHTML = `<style>${STYLES}</style>${html}`;
        this.wire();
        this.paintBridge();
        if (focusKey) {
            const el = this.root.querySelector(`.cov-edit[data-key="${focusKey}"]`) as HTMLInputElement;
            if (el) { el.focus(); const v = el.value; el.value = ""; el.value = v; }
        }
        this.persistState();
    }

    /* ---- session state persistence (survives page navigation via host.persistProperties) ----
       Serializes the whole view state (quarter/month tab, drill expand, Proj Conv overrides, bridge
       segment) into a report object property so update() can rehydrate it when Power BI destroys/
       recreates the visual on page switch. Session-scoped in reading view; also captured by bookmarks.
       Guarded by _persistLast so the persist-triggered update never loops or clobbers active edits.
       NOTE: this is session/bookmark persistence only — the durable Dataverse override write-back (P3)
       is a separate seam in setOverride/clearOverride. */
    private serializeState(): string {
        return JSON.stringify({ v: 1, state: this.state });
    }
    private applyPersisted(s: string) {
        try {
            const o: any = JSON.parse(s);
            if (o && o.state && typeof o.state === "object") Object.assign(this.state, o.state);
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

    private nodeHtml(c: CalcNode): string {
        const indent = c.depth * 16;
        const exp = this.state.expand[c.key];
        const caret = c.expandable ? `<span class="ol-caret" data-exp="${esc(c.key)}">${exp ? "▾" : "▸"}</span>` : (c.level === "territory" ? '<span class="ol-caret leaf"></span>' : "");
        const convVal = c.conv == null ? "" : (c.conv * 100).toFixed(0) + "%";
        const convInput = `<input class="cov-edit ${covClass(c.cov)}${c.overridden ? " edited" : ""}" data-key="${esc(c.key)}" value="${convVal}" inputmode="decimal" title="Proj Conv — edit to override this ${c.level}; clear to revert to derived">`;
        const outCov = c.C ? c.outlook / c.C : null;
        return `<tr class="ol-row lvl-${c.level}${c.level === "total" ? " total" : ""}" data-key="${esc(c.key)}">
          <td class="nm"><span style="padding-left:${indent}px">${caret}${esc(c.label)}</span></td>
          <td>${money(c.C)}</td><td>${money(c.E)}</td>
          <td><span class="cov-pill ${covClass(c.cov)}">${pct(c.cov)}</span></td>
          <td>${money(c.K)}</td><td>${money(c.J)}</td>
          <td class="projcov">${convInput}</td>
          <td>${c.gap75 > 0 ? compactUSD(c.gap75) : '<span class="wow zero">met</span>'}</td>
          <td>${c.gap100 > 0 ? compactUSD(c.gap100) : '<span class="wow zero">met</span>'}</td>
          <td class="u2c">${c.u2cNeed === null || c.u2cNeed === undefined ? "—" : pct(Math.max(0, c.u2cNeed))}</td>
          <td class="outlook">${money(c.outlook)}</td>
          <td><span class="cov-pill ${covClass(outCov)}">${pct(outCov)}</span></td>
        </tr>`;
    }

    private quarterTabs(): string {
        return `<div class="seg-tabs" data-tabs="q">` +
            this.qkeys.map(qk => `<button class="seg-tab ${qk === this.state.q ? "active" : ""}" data-q="${esc(qk)}">${esc(qk)}</button>`).join("") +
            `</div>`;
    }
    private monthTabs(): string {
        const qd = this.quarters[this.state.q] || { sections: [] };
        return `<div class="seg-tabs sub" data-tabs="m">` +
            qd.sections.map((s, i) => `<button class="seg-tab ${i === this.state.m ? "active" : ""}" data-m="${i}">${esc(s.label)}</button>`).join("") +
            `</div>`;
    }

    private bridgeSegData(): { Cm: number; Bl: number; Un: number; T: number; O: number; projCov: Num; present: string[] } {
        const { sec, isM1 } = this.currentSection();
        const rows = this.orderedRows(sec);
        const present = rows.map(r => r.segment || r.unit);
        const seg = this.state.bSeg;
        let Cm = 0, Bl = 0, Un = 0, T = 0, O = 0; let projCov: Num = null;
        if (seg === "All" || present.indexOf(seg) < 0) {
            const off = sec.official;
            let tb = 0, tc = 0, tu = 0, tk = 0, to = 0;
            for (const r of rows) {
                tb += r.budget; tc += r.committed; tu += r.uncommitted; tk += r.blocked;
                const key = `${this.state.q}|${this.state.m}|${r.segment}`;
                const c = calcOutlookRow(r.budget, r.committed, r.uncommitted, r.blocked, isM1, this.state.overrides[key]);
                to += c.outlook;
            }
            Cm = (off.committed != null ? off.committed : tc) as number;
            Bl = (off.blocked != null ? off.blocked : tk) as number;
            Un = (off.uncommitted != null ? off.uncommitted : tu) as number;
            T = (off.target != null ? off.target : tb) as number;
            O = to;
            projCov = T ? O / T : null;
        } else {
            const r = rows.filter(x => x.segment === seg)[0];
            const key = `${this.state.q}|${this.state.m}|${seg}`;
            const c = calcOutlookRow(r.budget, r.committed, r.uncommitted, r.blocked, isM1, this.state.overrides[key]);
            Cm = r.committed; Bl = r.blocked; Un = r.uncommitted; T = r.budget; O = c.outlook; projCov = c.projCov;
        }
        if (this.state.bProjOv[seg] != null) { projCov = this.state.bProjOv[seg]; O = projCov! * T; }
        return { Cm, Bl, Un, T, O, projCov, present };
    }

    private bridgeHtml(): string {
        const d = this.bridgeSegData();
        const segOpts = ["All"].concat(d.present)
            .map(s => `<option value="${esc(s)}"${s === this.state.bSeg ? " selected" : ""}>${s === "All" ? "All segments (TOTAL)" : esc(s)}</option>`).join("");
        const fp = (v: number) => Math.round(v * 100) + "%";
        const p = this.conf;
        return `<div class="bridge-wrap">
          <div class="bridge-head"><h3>Bridge to target — confidence-weighted waterfall</h3>
            <div class="bridge-seg"><label for="wfSeg">Segment</label><select id="wfSeg">${segOpts}</select></div></div>
          <div class="bridge-sub" id="wfSub"></div>
          <div class="wf-row">
            <div class="wf-col"><div class="wf-ctrl"><input class="wf-pct" id="wfC" data-k="c" value="${fp(p.c)}" inputmode="decimal" title="Committed confidence %"></div>
              <div class="wf-plot"><div class="wf-bar committed" id="barC"></div><div class="wf-val" id="valC"></div></div><div class="wf-name">Committed</div></div>
            <div class="wf-col"><div class="wf-ctrl"><input class="wf-pct" id="wfB" data-k="b" value="${fp(p.b)}" inputmode="decimal" title="Blocked confidence %"></div>
              <div class="wf-plot"><div class="wf-bar blocked" id="barB"></div><div class="wf-val" id="valB"></div></div><div class="wf-name">Blocked</div></div>
            <div class="wf-col"><div class="wf-ctrl"><input class="wf-pct" id="wfU" data-k="u" value="${fp(p.u)}" inputmode="decimal" title="Uncommitted confidence %"></div>
              <div class="wf-plot"><div class="wf-bar uncommitted" id="barU"></div><div class="wf-val" id="valU"></div></div><div class="wf-name">Uncommitted</div></div>
            <div class="wf-col"><div class="wf-ctrl"><input class="wf-pct wf-proj" id="wfP" data-k="p" value="" inputmode="decimal" title="Proj Cov % — pulled from the table above; editing here is session-only"></div>
              <div class="wf-plot"><div class="wf-bar outlook" id="barO"></div><div class="wf-val" id="valO"></div></div><div class="wf-name">Call</div></div>
            <div class="wf-col"><div class="wf-ctrl"></div><div class="wf-plot"><div class="wf-bar target" id="barT"></div><div class="wf-val" id="valT"></div></div><div class="wf-name">Target</div></div>
            <div class="wf-col"><div class="wf-ctrl"></div><div class="wf-plot"><div class="wf-bar vtt" id="barV"></div><div class="wf-val" id="valV"></div></div><div class="wf-name">VTT</div></div>
          </div></div>`;
    }

    private setProjPlaceholder() {
        const pEl = this.root.querySelector("#wfP") as HTMLInputElement;
        if (!pEl || pEl === document.activeElement) return;
        const seg = this.state.bSeg;
        if (this.state.bProjOv[seg] != null) { pEl.value = Math.round(this.state.bProjOv[seg] * 100) + "%"; return; }
        const d = this.bridgeSegData();
        pEl.value = d.projCov == null ? "" : Math.round(d.projCov * 100) + "%";
    }

    private paintBridge() {
        if (!this.root.querySelector(".bridge-wrap")) return;
        this.setProjPlaceholder();
        const d = this.bridgeSegData();
        const p = this.conf;
        const bC = d.Cm * p.c, bB = d.Bl * p.b, bU = d.Un * p.u, bO = d.O - d.Cm;
        let run = 0;
        const s1 = { s: 0, e: bC }; run = bC;
        const s2 = { s: run, e: run + bB }; run += bB;
        const s3 = { s: run, e: run + bU }; run += bU;
        const s4 = { s: run, e: run + bO }; run += bO;
        const projected = run, tgt = d.T, vtt = projected - tgt;
        const tops = [bC, bC + bB, bC + bB + bU, projected, tgt, 0].map(x => Math.abs(x));
        const plotMax = (Math.max.apply(null, tops) * 1.12) || 1;
        const H = 210;
        const place = (barId: string, valId: string, seg: { s: number; e: number }, cls: string, valStr: string, neg: boolean) => {
            const bar = this.root.querySelector("#" + barId) as HTMLElement, val = this.root.querySelector("#" + valId) as HTMLElement;
            if (!bar || !val) return;
            const a = Math.min(seg.s, seg.e), b = Math.max(seg.s, seg.e);
            const bottom = (a / plotMax) * H, height = Math.max(2, ((b - a) / plotMax) * H);
            bar.style.bottom = bottom + "px"; bar.style.height = height + "px"; bar.className = "wf-bar " + cls;
            val.style.bottom = (bottom + height + 3) + "px"; val.textContent = valStr;
            val.className = "wf-val" + (neg ? " neg" : "");
        };
        place("barC", "valC", s1, "committed", compactUSD(bC), false);
        place("barB", "valB", s2, "blocked", compactUSD(bB), false);
        place("barU", "valU", s3, "uncommitted", compactUSD(bU), false);
        place("barO", "valO", s4, "outlook" + (bO < 0 ? " neg" : ""), (bO < 0 ? "-" : "+") + compactUSD(bO), bO < 0);
        place("barT", "valT", { s: 0, e: tgt }, "target", compactUSD(tgt), false);
        place("barV", "valV", { s: Math.min(tgt, projected), e: Math.max(tgt, projected) }, "vtt " + (vtt >= 0 ? "pos" : "neg"), (vtt >= 0 ? "+" : "-") + compactUSD(vtt), vtt < 0);
        const sub = this.root.querySelector("#wfSub") as HTMLElement;
        if (sub) {
            const vcls = vtt >= 0 ? "pos" : "neg";
            sub.innerHTML = `Confidence-weighted projection <b>${compactUSD(projected)}</b> vs target <b>${compactUSD(tgt)}</b> · VTT <span class="${vcls}">${vtt >= 0 ? "+" : "-"}${compactUSD(vtt)}</span>`;
        }
    }

    private wire() {
        this.root.querySelectorAll('[data-tabs="q"] .seg-tab').forEach(b =>
            b.addEventListener("click", () => { this.state.q = (b as HTMLElement).dataset.q as string; this.state.m = 0; this.render(); }));
        this.root.querySelectorAll('[data-tabs="m"] .seg-tab').forEach(b =>
            b.addEventListener("click", () => { this.state.m = Number((b as HTMLElement).dataset.m); this.render(); }));

        const self = this;
        // Drill caret toggles
        this.root.querySelectorAll(".ol-caret[data-exp]").forEach(c =>
            c.addEventListener("click", () => {
                const k = (c as HTMLElement).dataset.exp as string;
                self.state.expand[k] = !self.state.expand[k];
                self.render();
            }));
        // Proj Conv editing — any level. Store override on `data-key`, then re-render so the whole
        // hierarchy + carry-forward quarter recompute. Persistence seam: setOverride/clearOverride.
        this.root.querySelectorAll(".cov-edit").forEach(elx => {
            const el = elx as HTMLInputElement;
            const commit = () => {
                const key = el.getAttribute("data-key") as string;
                const raw = el.value.replace(/%/g, "").trim();
                if (raw === "" || isNaN(parseFloat(raw))) self.clearOverride(key);
                else self.setOverride(key, parseFloat(raw) / 100);
                self.render();
            };
            el.addEventListener("change", commit);
            el.addEventListener("focus", () => { el.value = el.value.replace(/%/g, ""); });
        });

        ["wfC", "wfB", "wfU"].forEach(id => {
            const el = this.root.querySelector("#" + id) as HTMLInputElement;
            if (!el) return;
            const apply = () => {
                const v = parseFloat(el.value.replace(/%/g, "").trim());
                if (!isNaN(v)) { (this.conf as any)[el.dataset.k!] = v / 100; }
                this.paintBridge();
            };
            el.addEventListener("input", apply);
            el.addEventListener("change", apply);
            el.addEventListener("focus", () => { el.value = el.value.replace(/%/g, ""); });
            el.addEventListener("blur", () => { const raw = el.value.replace(/%/g, "").trim(); el.value = isNaN(parseFloat(raw)) ? "" : Math.round(parseFloat(raw)) + "%"; });
        });
        const pEl = this.root.querySelector("#wfP") as HTMLInputElement;
        if (pEl) {
            const applyP = () => {
                const raw = pEl.value.replace(/%/g, "").trim(); const v = parseFloat(raw);
                if (raw === "" || isNaN(v)) delete this.state.bProjOv[this.state.bSeg];
                else this.state.bProjOv[this.state.bSeg] = v / 100;
                this.paintBridge();
            };
            pEl.addEventListener("input", applyP);
            pEl.addEventListener("change", applyP);
            pEl.addEventListener("focus", () => { pEl.value = pEl.value.replace(/%/g, ""); });
            pEl.addEventListener("blur", () => { const raw = pEl.value.replace(/%/g, "").trim(); pEl.value = isNaN(parseFloat(raw)) ? "" : Math.round(parseFloat(raw)) + "%"; });
        }
        const segEl = this.root.querySelector("#wfSeg") as HTMLSelectElement;
        if (segEl) segEl.addEventListener("change", () => { this.state.bSeg = segEl.value; this.setProjPlaceholder(); this.paintBridge(); });
    }

    // ---- Proj Conv override store (PERSISTENCE SEAM) ----------------------------------------------
    // All overrides flow through these two methods. Today they mutate session state only; the Dataverse
    // write-back (P3) hooks in here: setOverride → POST/PATCH the override row, clearOverride → DELETE.
    // Key = `${quarter}|${month_index}|${level}|${id}` (level t|g|u|T) maps 1:1 to a Dataverse row.
    private setOverride(key: string, conv: number) {
        this.state.overrides[key] = conv;
        // P3: this.writeOverride(key, conv);
    }
    private clearOverride(key: string) {
        delete this.state.overrides[key];
        // P3: this.deleteOverride(key);
    }
}
