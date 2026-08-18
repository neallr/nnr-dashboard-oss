// NNRSummary — Executive Summary page for the UK&I NNR dashboard.
// Consumes the pre-ranked `summary` block (one JSON blob cell) built by build_data.build_summary:
// per-period KPIs, top-N gainers/decliners (ranked for BOTH wow & dod), unit movement, departures,
// and a per-period AI narrative. Period pill + WoW/DoD toggle re-slice client-side (no recompute).
// Slide-ready layout; milestone rows deep-link into MSX via host.launchUrl.
"use strict";

import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataView = powerbi.DataView;

import { STYLES } from "./styles";

type Num = number | null;

interface Mover { acct: string; tname: string; terr: string; wow: number; dod: number; cp: number; lnk: string | null; }
interface Unit { name: string; wow: number; dod: number; }
interface Dep { acct: string; reason: string; chg: string; fromp: string; top: string; val: number; lnk: string | null; }
interface KPIs {
    committed: Num; uncommitted: Num; blocked: Num; target: Num; coverage: Num; blocked_pct: Num;
    committed_dod: Num; committed_wow: Num; uncommitted_dod: Num; uncommitted_wow: Num;
    blocked_dod: Num; blocked_wow: Num;
    departures_n: number; departures_val: number;
}
interface Period {
    label: string; quarter: string; is_quarter: boolean; has_data: boolean;
    kpis: KPIs; gainers: { wow: Mover[]; dod: Mover[] }; decliners: { wow: Mover[]; dod: Mover[] };
    blocked_up: { wow: Mover[]; dod: Mover[] };
    units: Unit[]; departures: { n: number; val: number; top: Dep[] }; narrative: string;
}
interface Summary {
    period_order: string[]; periods_with_data: string[]; labels: Record<string, string>;
    topn: number; by_period: Record<string, Period>;
}

function money(v: Num): string {
    if (v === null || v === undefined) return "—";
    const a = Math.abs(v);
    const s = v < 0 ? "-" : "";
    if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return s + "$" + Math.round(a / 1e3).toLocaleString() + "K";
    return s + "$" + Math.round(a).toLocaleString();
}
function signed(v: Num): string {
    if (v === null || v === undefined) return "—";
    const a = Math.abs(v);
    const s = v < 0 ? "−" : "+";   // U+2212 minus for a clean signed look
    if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return s + "$" + Math.round(a / 1e3).toLocaleString() + "K";
    return s + "$" + Math.round(a).toLocaleString();
}
function pct(v: Num): string { return v === null || v === undefined ? "—" : Math.round(v * 100) + "%"; }
function esc(s: any): string {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]));
}
// Prettify the gname unit label for the exec panel (codes -> readable names).
const UNIT_LABELS: Record<string, string> = {
    "GLOBALBANKING": "Global Banking", "INSURANCE&INVESTMENTS": "Insurance & Investments",
    "MANUFACTURING&TRAVEL&TRANSPORT": "Manufacturing & T&T", "PROFESSIONAL&BUSINESSSERVICES": "Professional & Business Svcs",
    "RETAIL": "Retail", "CAPMKTS": "Capital Markets", "CONSUMERGOODS": "Consumer Goods",
    "HEALTHCARE&LIFESCIENCES": "Healthcare & Life Sciences", "PUBLICSECTOR": "Public Sector",
    "TELCO&MEDIA": "Telco & Media", "ENERGY": "Energy"
};
function unitLabel(name: string): string {
    if (!name) return "—";
    if (UNIT_LABELS[name]) return UNIT_LABELS[name];
    // fold BLOCK CAPS words to Title Case, keep code-ish tokens as-is
    if (/^[A-Z][A-Z&]+$/.test(name)) {
        return name.split("&").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" & ");
    }
    return name;
}
// Real departure reasons only (drop status-leak rows like "Capacity/Service Availability" / None).
const REAL_REASONS = new Set(["lost", "cancelled", "moved", "lost to competitor"]);
function depLabel(d: Dep): string {
    const r = (d.reason || d.chg || "").toString();
    const rl = r.toLowerCase();
    if (rl.includes("cancel")) return "Cancelled";
    if (rl.includes("lost")) return "Lost";
    if (rl === "moved" || (d.fromp && d.top && d.fromp !== d.top)) return "Slipped " + d.fromp + " → " + (d.top || "out");
    return r || "Departed";
}

export class Visual implements IVisual {
    private root: HTMLElement;
    private host!: IVisualHost;
    private events: any = null;
    private errEl!: HTMLElement;
    private bodyEl!: HTMLElement;
    private hasRendered = false;
    private _linksWired = false;

    private summary: Summary | null = null;
    private state = { period: "", mode: "wow" as "wow" | "dod" };
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
    // Power BI caps a single text cell at 32,766 chars, so the summary JSON is stored CHUNKED across
    // rows (idx, chunk). Reassemble in idx order into the full JSON string before parsing.
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
            // Fallback: single unnamed column (legacy single-blob) -> just use it.
            if (iChunk < 0) return rows[0] && rows[0][0] != null ? String(rows[0][0]) : "";
            const pairs = rows.map((row: any[]) => ({
                i: iIdx >= 0 ? Number(row[iIdx]) : 0,
                c: row[iChunk] == null ? "" : String(row[iChunk])
            }));
            pairs.sort((a, b) => a.i - b.i);
            return pairs.map(p => p.c).join("");
        } catch (e) { return ""; }
    }
    private attn(msg: string): string {
        return `<div style="font-family:'Segoe UI',monospace;padding:14px;color:#8a5a00;background:#fff4e5;border:1px solid #f0c47a;border-radius:8px;margin:10px;white-space:pre-wrap;font-size:12px;line-height:1.4;">${esc(msg)}</div>`;
    }

    public update(options: VisualUpdateOptions) {
        try { if (this.events && this.events.renderingStarted) this.events.renderingStarted(options); } catch (e) { /* noop */ }
        try {
            const dv: DataView = options.dataViews && options.dataViews[0];
            const t = dv && dv.table;
            const blob = t ? this.reassemble(t) : "";
            if (!blob) {
                if (!this.hasRendered) this.bodyEl.innerHTML = this.attn("Waiting for data… (no summary blob)");
                try { if (this.events && this.events.renderingFinished) this.events.renderingFinished(options); } catch (e) { /* noop */ }
                return;
            }
            try { this.summary = JSON.parse(blob); } catch (e: any) {
                this.showErr("SUMMARY PARSE ERROR: " + (e && e.message ? e.message : String(e)) + " (blob len=" + blob.length + ")");
                return;
            }
            const s = this.summary as Summary;
            const avail = (s.periods_with_data && s.periods_with_data.length ? s.periods_with_data : s.period_order) || [];
            if (!avail.length) {
                if (!this.hasRendered) this.bodyEl.innerHTML = this.attn("No summary periods available.");
                return;
            }
            this.restoreState(dv);
            // Default landing = Q1 (the current fiscal quarter), not the first month in period order.
            const dflt = avail.indexOf("q1") >= 0 ? "q1" : avail[0];
            if (!this.state.period || avail.indexOf(this.state.period) < 0) this.state.period = dflt;
            this.render();
            this.hasRendered = true;
            if (this.errEl) { this.errEl.textContent = ""; this.errEl.style.padding = "0"; }
            try { if (this.events && this.events.renderingFinished) this.events.renderingFinished(options); } catch (e) { /* noop */ }
        } catch (e: any) {
            this.showErr("UPDATE EXCEPTION: " + (e && e.message ? e.message : String(e)) + "\n" + (e && e.stack ? String(e.stack) : ""));
            try { if (this.events && this.events.renderingFailed) this.events.renderingFailed(options, String(e && e.message ? e.message : e)); } catch (e2) { /* noop */ }
        }
    }

    // ---- period ordering for the pill row (quarters + their months, in fiscal order) --------------
    private orderedPeriods(): string[] {
        const s = this.summary as Summary;
        const avail = new Set(s.periods_with_data && s.periods_with_data.length ? s.periods_with_data : s.period_order);
        return (s.period_order || []).filter(pk => avail.has(pk));
    }

    private render() {
        const s = this.summary as Summary;
        const pk = this.state.period;
        const p = s.by_period[pk];
        if (!p) { this.bodyEl.innerHTML = this.attn("Period " + esc(pk) + " not found."); return; }
        const mode = this.state.mode;
        const modeUp = mode.toUpperCase();
        const k = p.kpis;

        // period pills — 4 quarters always; months are DYNAMIC to the selected quarter (only the 3
        // months of the active quarter show), so the row stays compact (max 4 + 3 pills).
        const order = this.orderedPeriods();
        const qs = order.filter(x => s.by_period[x] && s.by_period[x].is_quarter);
        const activeQ = p.quarter;   // the quarter the selected period belongs to (itself if a quarter)
        const ms = order.filter(x => s.by_period[x] && !s.by_period[x].is_quarter && s.by_period[x].quarter === activeQ);
        const pill = (x: string) => `<span class="pd-pill${x === pk ? " on" : ""}" data-pd="${esc(x)}">${esc(s.by_period[x].label)}</span>`;
        const monthsHtml = ms.length ? `<span class="pd-sep"></span><span class="pd-grp">${esc(activeQ)} months</span>${ms.map(pill).join("")}` : "";
        const pillRow = `<div class="pd-row"><span class="pd-grp">Quarter</span>${qs.map(pill).join("")}${monthsHtml}</div>`;

        // narrative (per-period; hidden when empty)
        const narr = (p.narrative || "").trim();
        const narrHtml = narr
            ? `<div class="narr"><p>${esc(narr)}</p></div>`
            : `<div class="narr narr-empty"><p>AI narrative for ${esc(p.label)} will appear after the next morning refresh.</p></div>`;

        // KPI tiles — the toggled movement leads, the other is muted alongside.
        // `invert` flips the good/bad colour (used for Blocked, where a RISE is bad = red).
        const mv = (wow: Num, dod: Num, invert = false) => {
            const lead = mode === "wow" ? wow : dod;
            const other = mode === "wow" ? dod : wow;
            const otherLbl = mode === "wow" ? "DoD" : "WoW";
            const up = lead === null ? false : (lead as number) >= 0;
            const cls = lead === null ? "" : ((invert ? !up : up) ? "up" : "dn");
            return `<span class="mv ${cls}">${lead === null ? "—" : (up ? "▲ " : "▼ ") + signed(lead).replace(/^[+−]/, "") + "  " + modeUp}</span>` +
                `<span class="mv-o">${other === null ? "" : signed(other) + " " + otherLbl}</span>`;
        };
        const covPct = k.coverage === null ? 0 : Math.max(0, Math.min(1, k.coverage as number)) * 100;
        const blkPct = k.blocked_pct === null ? 0 : Math.max(0, Math.min(1, k.blocked_pct as number)) * 100;
        const kpis = `<div class="kpis">
          <div class="kpi"><div class="k">${esc(p.label)} Committed</div><div class="v">${money(k.committed)}</div>
            <div class="d">${mv(k.committed_wow, k.committed_dod)}</div>
            <div class="bar"><i style="width:${covPct.toFixed(0)}%"></i></div><div class="cov">${pct(k.coverage)} of ${money(k.target)} target</div></div>
          <div class="kpi"><div class="k">Uncommitted</div><div class="v">${money(k.uncommitted)}</div>
            <div class="d">${mv(k.uncommitted_wow, k.uncommitted_dod)}</div>
            <div class="bar"><i class="amber" style="width:${k.committed ? Math.min(100, (k.uncommitted as number) / (k.committed as number) * 100).toFixed(0) : 0}%"></i></div><div class="cov">upside coverage</div></div>
          <div class="kpi"><div class="k">Blocked</div><div class="v">${money(k.blocked)}</div>
            <div class="d">${mv(k.blocked_wow == null ? null : k.blocked_wow, k.blocked_dod == null ? null : k.blocked_dod, true)}</div>
            <div class="bar"><i class="red" style="width:${blkPct.toFixed(0)}%"></i></div><div class="cov">${pct(k.blocked_pct)} of committed · needs unblocking</div></div>
          <div class="kpi"><div class="k">Departures (7d)</div><div class="v">${k.departures_n}</div>
            <div class="d"><span class="mv dn">▼ ${p.is_quarter ? "left " + esc(p.label) : "due " + esc(p.label)}</span></div>
            <div class="bar"><i class="grey" style="width:40%"></i></div><div class="cov">${money(k.departures_val)} pipeline</div></div>
        </div>`;

        // mover rows
        const moverRows = (arr: Mover[], dir: "up" | "dn") => {
            if (!arr || !arr.length) return `<div class="row empty">No ${dir === "up" ? "gainers" : "decliners"} in ${esc(p.label)}.</div>`;
            return arr.map((m, i) => {
                const val = mode === "wow" ? m.wow : m.dod;
                const nm = m.lnk
                    ? `<a class="msx-lnk" data-msx="${esc(m.lnk)}" role="link" tabindex="0" title="Open in MSX">${esc(m.acct)} ↗</a>`
                    : esc(m.acct);
                return `<div class="row"><span class="rk">${i + 1}</span><span class="nm"><b>${nm}</b><span>${esc(m.tname || m.terr || "")}</span></span><span class="val ${dir}">${signed(val)}</span></div>`;
            }).join("");
        };
        const gainers = mode === "wow" ? p.gainers.wow : p.gainers.dod;
        const decliners = mode === "wow" ? p.decliners.wow : p.decliners.dod;
        const gNet = gainers.reduce((a, m) => a + (mode === "wow" ? m.wow : m.dod), 0);
        const dNet = decliners.reduce((a, m) => a + (mode === "wow" ? m.wow : m.dod), 0);

        // Largest increase in blocked — accounts whose blocked pipeline rose most this window,
        // each deep-linking the driving milestone. A RISE in blocked is bad, so rows render red.
        // DEFENSIVE: the published model may still carry an OLDER summary block without `blocked_up`
        // (e.g. before the next refresh bakes it). Fall back to empty so the page still loads and the
        // panel lights up automatically once the new feed lands — never throw.
        const bu = p.blocked_up || ({ wow: [], dod: [] } as { wow: Mover[]; dod: Mover[] });
        const blockedUp = (mode === "wow" ? bu.wow : bu.dod) || [];
        const bNet = blockedUp.reduce((a, m) => a + (mode === "wow" ? (m.wow as number) : (m.dod as number)), 0);
        const blockedRows = blockedUp.length ? blockedUp.map((m, i) => {
            const val = mode === "wow" ? m.wow : m.dod;
            const nm = m.lnk
                ? `<a class="msx-lnk" data-msx="${esc(m.lnk)}" role="link" tabindex="0" title="Open driving milestone in MSX">${esc(m.acct)} ↗</a>`
                : esc(m.acct);
            return `<div class="row"><span class="rk">${i + 1}</span><span class="nm"><b>${nm}</b><span>${esc(m.tname || m.terr || "")}</span></span><span class="val dn">${signed(val)}</span></div>`;
        }).join("") : `<div class="row empty">No blocked increase in ${esc(p.label)}.</div>`;

        const deps = (p.departures.top || []).filter(d => {
            const rl = (d.reason || d.chg || "").toString().toLowerCase();
            return REAL_REASONS.has(rl) || (d.fromp && d.top && d.fromp !== d.top);
        });
        const depRows = deps.length ? deps.map((d, i) => {
            const nm = d.lnk
                ? `<a class="msx-lnk" data-msx="${esc(d.lnk)}" role="link" tabindex="0" title="Open in MSX">${esc(d.acct)} ↗</a>`
                : esc(d.acct);
            return `<div class="row"><span class="rk">${i + 1}</span><span class="nm"><b>${nm}</b><span>${esc(depLabel(d))}</span></span><span class="val dn">${d.val ? "−" + money(d.val).replace(/^-/, "") : ""}</span></div>`;
        }).join("") : `<div class="row empty">No lost/cancelled/slipped milestones in ${esc(p.label)}.</div>`;

        const grid = `<div class="grid">
          <div class="panel"><h3>▲ Top gainers · committed ${modeUp} <span class="pill g">${signed(gNet)} top ${gainers.length}</span></h3>${moverRows(gainers, "up")}
            <div class="foot">click an account to open the milestone in MSX ↗</div></div>
          <div class="panel"><h3>▼ Top decliners · committed ${modeUp} <span class="pill r">${signed(dNet)} top ${decliners.length}</span></h3>${moverRows(decliners, "dn")}
            <div class="foot">largest committed reductions</div></div>
          <div class="panel"><h3>▲ Largest blocked increase · ${modeUp} <span class="pill r">${signed(bNet)} top ${blockedUp.length}</span></h3>${blockedRows}
            <div class="foot">biggest ${mode === "wow" ? "week-over-week" : "day-over-day"} rise in blocked · click to open the driving milestone in MSX ↗</div></div>
          <div class="panel"><h3>⊗ Notable departures (7d) <span class="pill r">${p.departures.n} total</span></h3>${depRows}
            <div class="foot">lost &amp; cancelled leave the pipeline · slipped move to a later period</div></div>
        </div>`;

        const header = `<div class="hd">
          <div><h1>Executive Summary — FY27 ${esc(p.label)}</h1>
            <div class="sub">Net New Revenue · UK &amp; Ireland · ${mode === "wow" ? "week-over-week" : "day-over-day"} movement</div></div>
          <div class="actions">
            <div class="toggle" data-toggle="mode"><span class="${mode === "wow" ? "on" : ""}" data-mode="wow">WoW</span><span class="${mode === "dod" ? "on" : ""}" data-mode="dod">DoD</span></div>
          </div></div>`;

        const legend = `<div class="legend">Movement = today's snapshot − prior snapshot (${mode === "wow" ? "≥7 days" : "prior day"}); entries &amp; departures fully counted · figures ${p.is_quarter ? "quarter carry-forward" : "month"} committed unless noted · toggle affects the whole page</div>`;

        this.bodyEl.innerHTML = `<style>${STYLES}</style><div class="nnr-root">${header}${pillRow}${narrHtml}${kpis}${grid}${legend}</div>`;
        this.wire();
        this.persistState();
    }

    private wire() {
        const rerender = () => this.render();
        this.root.querySelectorAll(".pd-pill").forEach(el =>
            el.addEventListener("click", () => { this.state.period = (el as HTMLElement).dataset.pd || this.state.period; rerender(); }));
        this.root.querySelectorAll("[data-toggle='mode'] span").forEach(el =>
            el.addEventListener("click", () => { this.state.mode = ((el as HTMLElement).dataset.mode as any) || "wow"; rerender(); }));
        // MSX deep-link (launchUrl; <a target=_blank> blocked in the visual sandbox)
        const launch = (a: HTMLElement) => {
            const url = a.getAttribute("data-msx");
            if (!url) return;
            try { this.host.launchUrl(url); } catch (_) { /* noop */ }
            a.classList.add("msx-opening");
            window.setTimeout(() => a.classList.remove("msx-opening"), 1200);
        };
        const bodyEl = this.bodyEl;
        // Delegated MSX-link handlers must attach EXACTLY ONCE. bodyEl is created in the constructor and
        // persists across renders (innerHTML only swaps its children), so binding here unguarded would
        // stack one more listener every render() — after N renders a single click fired launchUrl N times
        // (the "link opens ~13 times" bug). The pill/toggle listeners above are safe: they re-query the
        // freshly-rebuilt child elements each render.
        if (!this._linksWired) {
            this._linksWired = true;
            bodyEl.addEventListener("click", (e: any) => {
                const a = (e.target as HTMLElement).closest("a.msx-lnk[data-msx]") as HTMLElement;
                if (!a) return;
                e.preventDefault(); e.stopPropagation(); launch(a);
            });
            bodyEl.addEventListener("keydown", (e: any) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                const a = (e.target as HTMLElement).closest("a.msx-lnk[data-msx]") as HTMLElement;
                if (!a) return;
                e.preventDefault(); launch(a);
            });
        }
    }

    // ---- session state persistence (survives page navigation) ------------------------------------
    private serializeState(): string { return JSON.stringify({ v: 1, state: this.state }); }
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
