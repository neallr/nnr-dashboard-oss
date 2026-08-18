// NNRMovements — Movements page for the UK&I NNR dashboard.
// Consumes the `movements` block (one CHUNKED JSON blob) built by build_data.build_movements:
// per period, per lens (dod/wow/mom): start/end/net, 11 movement buckets, and a per-milestone item
// ledger. Renders a clickable Microsoft-blue WATERFALL BRIDGE (start -> entering -> leaving -> end)
// that filters the movers/departures table below; plus a DoD/WoW/MoM toggle, a period selector, and
// standard filters (Commitment, Sales Stage, Sales Unit, Territory, Segment) in the proper order.
// Milestone rows deep-link into MSX via host.launchUrl.
"use strict";

import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataView = powerbi.DataView;

import { STYLES } from "./styles";

type Lens = "dod" | "wow" | "mom";

interface Item {
    ms: string; cat: string; amt: number; acct: string; tpid: string | null;
    terr: string | null; tname: string | null; unit: string | null; grp: string | null;
    own: string | null; mgr: string | null; own_grp: string | null;
    stage: string | null; seg: string | null;
    macc: boolean; hc: boolean; old: string | null; new: string | null;
    status: string | null; commit: string | null; nm: string | null; lnk: string | null;
    was_due: string | null; was_commit: string | null; was_status: string | null;
    departure: boolean; sv: number; ev: number;
}
interface Held {
    commit: string | null; own_grp: string | null; stage: string | null; unit: string | null;
    grp: string | null; tname: string | null; seg: string | null; sv: number; ev: number; n: number;
}
interface LensBlock {
    start: number; end: number; net: number;
    buckets: Record<string, { amt: number; n: number }>;
    items: Item[]; n_items: number; held: Held[];
}
interface Movements {
    order: string[]; labels: Record<string, string>;
    entering: string[]; leaving: string[]; departure_cats: string[];
    periods: Record<string, Partial<Record<Lens, LensBlock>>>;
}

const PERIOD_ORDER = ["q1", "aug", "sep", "q2", "oct", "nov", "dec", "q3", "jan", "feb", "mar",
    "q4", "apr", "may", "jun"];
const PERIOD_LABEL: Record<string, string> = {
    q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4",
    jul: "Jul", aug: "Aug", sep: "Sep", oct: "Oct", nov: "Nov", dec: "Dec",
    jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", may: "May", jun: "Jun"
};
const LENS_LABEL: Record<Lens, string> = { dod: "DoD", wow: "WoW", mom: "MoM" };
// Filters, in the requested order. Each maps to an item field; "commit" first.
const FILTERS: { key: keyof Item; label: string }[] = [
    { key: "commit", label: "Commitment" },
    { key: "own_grp", label: "Ownership Group" },
    { key: "stage", label: "Sales Stage" },
    { key: "unit", label: "Sales Unit" },
    { key: "grp", label: "ATU Group" },
    { key: "tname", label: "Territory" },
    { key: "seg", label: "Segment" }
];

function money(v: number | null): string {
    if (v === null || v === undefined || isNaN(v as number)) return "—";
    const a = Math.abs(v); const s = v < 0 ? "-" : "";
    if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return s + "$" + Math.round(a / 1e3).toLocaleString() + "K";
    return s + "$" + Math.round(a).toLocaleString();
}
function signed(v: number | null): string {
    if (v === null || v === undefined || isNaN(v as number)) return "—";
    const a = Math.abs(v); const s = v < 0 ? "−" : "+";
    if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return s + "$" + Math.round(a / 1e3).toLocaleString() + "K";
    return s + "$" + Math.round(a).toLocaleString();
}
function esc(s: any): string {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]));
}
function monthYear(d: string | null): string {
    if (!d || d.length < 7) return "—";
    const y = d.slice(0, 4); const m = parseInt(d.slice(5, 7), 10);
    const nm = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m] || "";
    return nm + " " + y;
}

export class Visual implements IVisual {
    private root: HTMLElement;
    private host!: IVisualHost;
    private events: any = null;
    private errEl!: HTMLElement;
    private bodyEl!: HTMLElement;
    private hasRendered = false;
    private _linksWired = false;

    private mv: Movements | null = null;
    private state = {
        periods: ["q1"] as string[], lens: "mom" as Lens, cat: "" as string,
        filters: {} as Record<string, string>, openDD: "" as string
    };
    private _persistLast = "";

    constructor(options: VisualConstructorOptions) {
        this.root = options.element;
        try {
            this.host = options.host;
            this.events = (options.host as any) ? (options.host as any).eventService : null;
            this.root.style.cssText = "width:100%;height:100%;overflow:auto;position:relative;background:#f4f7fb;";
            const style = document.createElement("style");
            style.textContent = STYLES;
            this.root.appendChild(style);
            const err = document.createElement("div");
            err.id = "nnrerr";
            err.style.cssText = "font-family:Consolas,monospace;font-size:11px;color:#fff;background:#c62828;white-space:pre-wrap;padding:0;";
            const body = document.createElement("div");
            body.id = "nnrbody";
            this.root.appendChild(err); this.root.appendChild(body);
            this.errEl = err; this.bodyEl = body;
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
    // Power BI caps a single text cell at 32,766 chars, so the JSON is CHUNKED across rows (idx, chunk).
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
                c: row[iChunk] == null ? "" : String(row[iChunk])
            }));
            pairs.sort((a, b) => a.i - b.i);
            return pairs.map(p => p.c).join("");
        } catch (e) { return ""; }
    }
    private attn(msg: string): string {
        return `<div class="mv-attn">${esc(msg)}</div>`;
    }

    public update(options: VisualUpdateOptions) {
        try { if (this.events && this.events.renderingStarted) this.events.renderingStarted(options); } catch (e) { /* noop */ }
        try {
            const dv: DataView = options.dataViews && options.dataViews[0];
            const t = dv && dv.table;
            const blob = t ? this.reassemble(t) : "";
            if (!blob) {
                if (!this.hasRendered) this.bodyEl.innerHTML = this.attn("Waiting for data… (no movements blob)");
                try { if (this.events && this.events.renderingFinished) this.events.renderingFinished(options); } catch (e) { /* noop */ }
                return;
            }
            try { this.mv = JSON.parse(blob); } catch (e: any) {
                this.showErr("MOVEMENTS PARSE ERROR: " + (e && e.message ? e.message : String(e)) + " (blob len=" + blob.length + ")");
                return;
            }
            this.restoreState(dv);
            const mv = this.mv as Movements;
            const periods = PERIOD_ORDER.filter(p => mv.periods[p]);
            if (!periods.length) {
                if (!this.hasRendered) this.bodyEl.innerHTML = this.attn("No movements available yet — DoD/WoW/MoM fill in as snapshot history accrues.");
                try { if (this.events && this.events.renderingFinished) this.events.renderingFinished(options); } catch (e) { /* noop */ }
                return;
            }
            // keep only selected periods that still exist; default to Q1 (or first available)
            this.state.periods = (this.state.periods || []).filter(p => mv.periods[p]);
            if (!this.state.periods.length) {
                this.state.periods = [periods.indexOf("q1") >= 0 ? "q1" : periods[0]];
            }
            this.render();
            this.hasRendered = true;
            this.persistState();
        } catch (e: any) {
            this.showErr("UPDATE ERROR: " + (e && e.stack ? e.stack : String(e)));
        }
        try { if (this.events && this.events.renderingFinished) this.events.renderingFinished(options); } catch (e) { /* noop */ }
    }

    // Lenses that have data across the currently-selected periods (for enabling/disabling toggles).
    private lensHasData(l: Lens): boolean {
        const mv = this.mv as Movements;
        return this.state.periods.some(p => (mv.periods[p] || {})[l] !== undefined);
    }

    // Combined block across all selected periods for the current lens (sum start/end/net/buckets;
    // concat items). Single-period selection returns that period's block directly.
    private curBlock(): LensBlock | null {
        const mv = this.mv as Movements;
        const S = this.state;
        if (!this.lensHasData(S.lens)) {
            const alt = (["mom", "wow", "dod"] as Lens[]).find(l => this.lensHasData(l));
            if (alt) S.lens = alt; else return null;
        }
        const blocks = S.periods
            .map(p => (mv.periods[p] || {})[S.lens])
            .filter((b): b is LensBlock => !!b);
        if (!blocks.length) return null;
        if (blocks.length === 1) return blocks[0];
        const out: LensBlock = { start: 0, end: 0, net: 0, buckets: {}, items: [], n_items: 0, held: [] };
        blocks.forEach(b => {
            out.start += b.start; out.end += b.end; out.net += b.net; out.n_items += b.n_items;
            for (const k in b.buckets) {
                const c = out.buckets[k] || (out.buckets[k] = { amt: 0, n: 0 });
                c.amt += b.buckets[k].amt; c.n += b.buckets[k].n;
            }
            out.items = out.items.concat(b.items);
            out.held = out.held.concat(b.held || []);
        });
        out.items.sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt));
        return out;
    }

    private periodsLabel(): string {
        const S = this.state;
        if (!S.periods.length) return "—";
        if (S.periods.length === 1) return PERIOD_LABEL[S.periods[0]] || S.periods[0];
        return S.periods.length + " periods";
    }

    private render() {
        const mv = this.mv as Movements;
        const periods = PERIOD_ORDER.filter(p => mv.periods[p]);
        const block = this.curBlock();
        const S = this.state;

        // lens toggle — ALWAYS show all three; disable ones with no data yet (fill in as history accrues)
        const toggle = (["dod", "wow", "mom"] as Lens[]).map(l => {
            const has = this.lensHasData(l);
            const on = l === S.lens ? " on" : "";
            const dis = has ? "" : " dis";
            const title = has ? "" : ` title="No ${LENS_LABEL[l]} history yet — fills in as daily snapshots accrue"`;
            return `<button class="mv-tg${on}${dis}" data-lens="${l}"${title}>${LENS_LABEL[l]}</button>`;
        }).join("");

        const head =
            `<div class="mv-head">
                <div class="mv-title"><span class="mv-ic">⇄</span><span>Pipeline Movements
                    <span class="mv-sub">FY27 · ${esc(this.periodsLabel())} committed pipeline bridge · ${LENS_LABEL[S.lens]}</span></span></div>
                <div class="mv-toggle">${toggle}</div>
             </div>`;

        if (!block) {
            this.bodyEl.innerHTML = head + this.attn(`No ${LENS_LABEL[S.lens]} movement for the selected period(s) yet.`);
            this.wire();
            return;
        }

        // Standard-filtered movers drive BOTH the bridge and the table (so both respect the filters).
        const stdItems = this.applyStd(block.items);
        const view = this.bridgeView(block, stdItems);          // {start,end,buckets} — filter-aware
        const bridge = this.bridgeSVG(view);
        const items = this.applyFilters(block.items);           // + category (bar-click) filter, for the table
        const table = this.tableHTML(items);
        const activeCat = S.cat ? `<span class="mv-chip">${esc(mv.labels[S.cat] || S.cat)} <b data-clearcat="1">✕</b></span>` : "";

        // Custom dropdown filters (stay open on click, unlike native <select> in the visual sandbox).
        const periodPanel = periods.map(p =>
            `<div class="mv-opt mv-opt-ck${S.periods.indexOf(p) >= 0 ? " on" : ""}" data-period-opt="${p}">
                <span class="mv-ck"></span>${esc(PERIOD_LABEL[p] || p)}</div>`
        ).join("");
        const periodFilter = this.dd("__period", "Time Period", this.periodsLabel(), periodPanel);
        const stdFilters = FILTERS.map(f => {
            const opts = this.distinct(block.items, f.key);
            const cur = S.filters[f.key as string] || "";
            const panel =
                `<div class="mv-opt${!cur ? " on" : ""}" data-opt="${String(f.key)}" data-val="">All</div>` +
                opts.map(o => `<div class="mv-opt${o === cur ? " on" : ""}" data-opt="${String(f.key)}" data-val="${esc(o)}">${esc(o)}</div>`).join("");
            return this.dd(String(f.key), f.label, cur || "All", panel);
        }).join("");

        const net = view.end - view.start;
        const netCls = net >= 0 ? "up" : "dn";
        const anyFilter = this.hasStdFilter() || !!S.cat;
        const clearBtn = anyFilter
            ? `<button class="mv-clear" data-clear="1">Clear filters ✕</button>` : "";
        const filterNote = this.hasStdFilter()
            ? `<div class="mv-hint">Filtered — Start/End reflect the selected slice</div>`
            : `<div class="mv-hint">Click a driver to filter the movements below</div>`;
        this.bodyEl.innerHTML =
            head +
            `<div class="mv-kpis">
                <div class="mv-kpi"><div class="mv-acc"></div><span>Start</span><b>${money(view.start)}</b><div class="mv-cap">Committed pipeline at period open</div></div>
                <div class="mv-kpi"><div class="mv-acc"></div><span>End · live</span><b>${money(view.end)}</b><div class="mv-cap">Committed pipeline today</div></div>
                <div class="mv-kpi ${netCls}"><div class="mv-acc"></div><span class="mv-spark">${signed(net)}</span><span>Net movement · ${LENS_LABEL[S.lens]}</span><b>${signed(net)}</b><div class="mv-cap">Reconciles to the milestone drivers below</div></div>
             </div>
             <div class="mv-panel">
                <div class="mv-ph"><h3><span class="mv-pd"></span>Committed pipeline bridge</h3>${filterNote}</div>
                <div class="mv-bridge">${bridge}</div>
                <div class="mv-filters">${periodFilter}${stdFilters}<div class="mv-active">${clearBtn}${activeCat}</div></div>
                <div class="mv-table">${table}</div>
             </div>`;
        this.wire();
    }

    // Custom dropdown: label + a button showing the current value + a panel that stays open until an
    // option is chosen or the user clicks outside. `id` matches state.openDD to keep the right one open.
    private dd(id: string, label: string, value: string, panelHtml: string): string {
        const open = this.state.openDD === id;
        return `<div class="mv-fl"><span>${esc(label)}</span>
            <div class="mv-dd${open ? " open" : ""}" data-dd="${esc(id)}">
                <button class="mv-dd-btn" data-dd-btn="${esc(id)}"><span>${esc(value)}</span><span class="mv-caret">▾</span></button>
                <div class="mv-dd-panel"${open ? "" : " hidden"}>${panelHtml}</div>
            </div></div>`;
    }

    // ---- waterfall bridge (SVG). start bar, entering (+) steps, leaving (−) steps, end bar. Click a
    //      bucket to filter the table; the active bucket is highlighted. Microsoft-blue palette.
    //      Labels are HORIZONTAL, centered under each bar, wrapping onto stacked lines. No connectors. ----
    private bridgeSVG(b: { start: number; end: number; buckets: Record<string, { amt: number; n: number }> }): string {
        const mv = this.mv as Movements;
        const steps: { key: string; label: string; amt: number; kind: "start" | "up" | "dn" | "end" }[] = [];
        steps.push({ key: "__start", label: "Start", amt: b.start, kind: "start" });
        mv.order.forEach(k => {
            const cell = b.buckets[k];
            if (cell && Math.round(cell.amt) !== 0) {
                steps.push({ key: k, label: mv.labels[k] || k, amt: cell.amt, kind: cell.amt >= 0 ? "up" : "dn" });
            }
        });
        steps.push({ key: "__end", label: "End", amt: b.end, kind: "end" });

        const W = Math.max(760, steps.length * 104);
        const H = 320, padT = 26, padB = 104, plotH = H - padT - padB;
        const vals = [b.start, b.end];
        let run = b.start; steps.forEach(s => { if (s.kind === "up" || s.kind === "dn") { run += s.amt; vals.push(run); } });
        const maxV = Math.max(...vals, 1), minV = Math.min(...vals, 0);
        const span = (maxV - minV) || 1;
        const y = (v: number) => padT + plotH * (1 - (v - minV) / span);
        const bw = Math.min(66, (W - 40) / steps.length - 12);
        const gap = (W - 40) / steps.length;
        const labelBaseY = H - padB + 16;

        // wrap a label into <=3 short centered lines (~11 chars each)
        const wrap = (label: string): string[] => {
            const words = label.split(" ");
            const lines: string[] = []; let cur = "";
            words.forEach(w => {
                if ((cur + " " + w).trim().length > 12 && cur) { lines.push(cur); cur = w; }
                else cur = (cur + " " + w).trim();
            });
            if (cur) lines.push(cur);
            return lines.slice(0, 3);
        };

        let running = 0;
        const bars: string[] = [];
        const grid: string[] = [];
        for (let i = 0; i <= 4; i++) {
            const gy = padT + plotH * i / 4;
            grid.push(`<line class="mv-gl" x1="20" y1="${gy.toFixed(1)}" x2="${(W - 20).toFixed(1)}" y2="${gy.toFixed(1)}"></line>`);
        }
        steps.forEach((s, i) => {
            const x = 20 + i * gap + (gap - bw) / 2;
            const cx = x + bw / 2;
            let top: number, h: number, cls: string;
            if (s.kind === "start" || s.kind === "end") {
                const base = y(Math.min(s.amt, 0)), tp = y(Math.max(s.amt, 0));
                top = tp; h = Math.max(2, base - tp); cls = "b-tot";
                running = s.amt;
            } else {
                const from = running, to = running + s.amt;
                top = y(Math.max(from, to)); h = Math.max(2, Math.abs(y(from) - y(to)));
                cls = s.amt >= 0 ? "b-up" : "b-dn";
                running = to;
            }
            const active = this.state.cat === s.key ? " active" : "";
            const clickable = (s.kind === "up" || s.kind === "dn") ? ` data-cat="${esc(s.key)}" role="button" tabindex="0"` : "";
            const lbls = wrap(s.label).map((ln, k) =>
                `<tspan x="${cx.toFixed(1)}" dy="${k === 0 ? 0 : 11}">${esc(ln)}</tspan>`
            ).join("");
            bars.push(
                `<g class="mv-bar ${cls}${active}"${clickable}>
                    <rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3"></rect>
                    <text class="mv-bval" x="${cx.toFixed(1)}" y="${(top - 6).toFixed(1)}">${s.kind === "start" || s.kind === "end" ? money(s.amt) : signed(s.amt)}</text>
                    <text class="mv-blab" x="${cx.toFixed(1)}" y="${labelBaseY.toFixed(1)}">${lbls}</text>
                 </g>`);
        });
        const defs = `<defs>
            <linearGradient id="gTot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#123f6e"/><stop offset="1" stop-color="#0b2e52"/></linearGradient>
            <linearGradient id="gUp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38b6ff"/><stop offset="1" stop-color="#0b6ad4"/></linearGradient>
            <linearGradient id="gDn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0908c"/><stop offset="1" stop-color="#d64541"/></linearGradient>
          </defs>`;
        return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet" class="mv-svg">${defs}${grid.join("")}${bars.join("")}</svg>`;
    }

    private distinct(items: Item[], key: keyof Item): string[] {
        const s = new Set<string>();
        items.forEach(it => { const v = it[key]; if (v != null && v !== "") s.add(String(v)); });
        return Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    }

    // Standard filters only (Commitment/Ownership/Stage/Unit/ATU/Territory/Segment) — used by BOTH the
    // bridge and the table so both respect the filters. The category (bar-click) filter is applied
    // ONLY to the table (the bridge always shows every bucket so you can pick a different one).
    private applyStd(items: Item[]): Item[] {
        const S = this.state;
        return items.filter(it => {
            for (const f of FILTERS) {
                const want = S.filters[f.key as string];
                if (want && String(it[f.key] == null ? "" : it[f.key]) !== want) return false;
            }
            return true;
        });
    }

    private hasStdFilter(): boolean {
        return FILTERS.some(f => !!this.state.filters[f.key as string]);
    }

    // Recompute the bridge view (start/end/buckets) from the standard-filtered movers AND the static
    // (held) pipeline. When no standard filter is active, use the block's authoritative totals. When a
    // filter is active, Start=Σsv / End=Σev over the matching movers + held rows, so the bars are the
    // movement and the Start/End reflect the FULL filtered pipeline (base + movement), not just movers.
    private bridgeView(block: LensBlock, stdItems: Item[]): { start: number; end: number; buckets: Record<string, { amt: number; n: number }> } {
        if (!this.hasStdFilter()) return { start: block.start, end: block.end, buckets: block.buckets };
        let start = 0, end = 0;
        const buckets: Record<string, { amt: number; n: number }> = {};
        stdItems.forEach(it => {
            start += it.sv || 0; end += it.ev || 0;
            const b = buckets[it.cat] || (buckets[it.cat] = { amt: 0, n: 0 });
            b.amt += it.amt; b.n++;
        });
        // static (non-moving) pipeline that matches the active standard filters — adds to Start & End
        (block.held || []).forEach(h => {
            for (const f of FILTERS) {
                const want = this.state.filters[f.key as string];
                if (want && String((h as any)[f.key] == null ? "" : (h as any)[f.key]) !== want) return;
            }
            start += h.sv || 0; end += h.ev || 0;
        });
        return { start: Math.round(start), end: Math.round(end), buckets };
    }

    private applyFilters(items: Item[]): Item[] {
        // table = standard filters + the category (bar-click) filter
        const S = this.state;
        return this.applyStd(items).filter(it => !S.cat || it.cat === S.cat);
    }

    private tableHTML(items: Item[]): string {
        const mv = this.mv as Movements;
        const rows = items.slice().sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt));
        const cap = 250;
        const shown = rows.slice(0, cap);
        const body = shown.map(it => {
            const name = esc(it.nm || "—");
            const idCell = it.lnk
                ? `<a class="msx-lnk" data-msx="${esc(it.lnk)}" href="#" title="Open ${esc(it.ms)} in MSX">${esc(it.ms)}</a>`
                : esc(it.ms);
            const move = (it.old || it.new) ? `${monthYear(it.old)} → ${monthYear(it.new)}` : "—";
            const stCls = String(it.status || "").toLowerCase().replace(/[^a-z]+/g, "-");
            const wasChip = (label: string, v: string | null) =>
                v ? `<span class="mv-was" title="Was ${esc(label)}: ${esc(v)}">was ${esc(v)}</span>` : "";
            const statusBadge = it.status ? `<span class="mv-badge ${stCls}">${esc(it.status)}</span>` : "—";
            const commitBadge = it.commit
                ? `<span class="mv-badge ${String(it.commit).toLowerCase()}">${esc(it.commit)}</span>` : "—";
            return `<tr>
                <td class="mv-c-cat"><span class="mv-tag"><span class="mv-dot ${it.amt >= 0 ? "pos" : "neg"}"></span>${esc(mv.labels[it.cat] || it.cat)}</span></td>
                <td class="mv-c-amt ${it.amt >= 0 ? "pos" : "neg"}">${signed(it.amt)}</td>
                <td class="mv-acct">${esc(it.acct || "—")}</td>
                <td>${name}</td>
                <td class="mv-c-id">${idCell}</td>
                <td>${esc(it.own_grp || "—")}</td>
                <td>${esc(it.unit || "—")}</td>
                <td>${esc(it.tname || "—")}</td>
                <td>${esc(it.stage || "—")}</td>
                <td><span class="mv-cellstack">${commitBadge}${wasChip("commitment", it.was_commit)}</span></td>
                <td><span class="mv-cellstack">${statusBadge}${wasChip("status", it.was_status)}</span></td>
                <td class="mv-c-move">${move}</td>
            </tr>`;
        }).join("");
        const more = rows.length > cap ? `<div class="mv-more">Showing top ${cap} of ${rows.length} movements (by size).</div>` : "";
        const totF = items.reduce((s, it) => s + it.amt, 0);
        return `<table class="mv-tbl">
            <thead><tr>
                <th>Movement</th><th class="mv-c-amt">Pipeline Δ</th><th>Account</th><th>Milestone</th>
                <th>Milestone ID</th><th>Ownership Group</th><th>Sales Unit</th><th>Territory</th><th>Sales Stage</th>
                <th>Commitment</th><th>Status</th><th>Due move</th>
            </tr></thead>
            <tbody>${body || `<tr><td colspan="12" class="mv-empty">No movements match the current filter.</td></tr>`}</tbody>
            <tfoot><tr><td>Filtered total (${items.length})</td><td class="mv-c-amt ${totF >= 0 ? "pos" : "neg"}">${signed(totF)}</td><td colspan="10"></td></tr></tfoot>
        </table>${more}`;
    }

    private wire() {
        const b = this.bodyEl;
        // Lens toggle
        b.querySelectorAll("[data-lens]").forEach(el => el.addEventListener("click", () => {
            if ((el as HTMLElement).classList.contains("dis")) return;   // no data yet
            this.state.lens = ((el as HTMLElement).dataset.lens as Lens) || this.state.lens;
            this.state.openDD = "";
            this.render(); this.persistState();
        }));
        // Bridge bucket click -> table category filter
        b.querySelectorAll("[data-cat]").forEach(el => {
            const go = () => {
                const c = (el as HTMLElement).dataset.cat || "";
                this.state.cat = (this.state.cat === c) ? "" : c;
                this.state.openDD = "";
                this.render(); this.persistState();
            };
            el.addEventListener("click", go);
            el.addEventListener("keydown", (e: any) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
        });
        const clr = b.querySelector("[data-clearcat]");
        if (clr) clr.addEventListener("click", () => { this.state.cat = ""; this.render(); this.persistState(); });
        const clrAll = b.querySelector("[data-clear]");
        if (clrAll) clrAll.addEventListener("click", () => {
            this.state.filters = {}; this.state.cat = ""; this.state.openDD = "";
            this.render(); this.persistState();
        });

        // Custom dropdowns: toggle open on button, select on option (single closes; period multi stays open)
        b.querySelectorAll("[data-dd-btn]").forEach(el => el.addEventListener("click", (e: any) => {
            e.stopPropagation();
            const id = (el as HTMLElement).dataset.ddBtn || "";
            this.state.openDD = (this.state.openDD === id) ? "" : id;
            this.render(); this.persistState();
        }));
        b.querySelectorAll("[data-opt]").forEach(el => el.addEventListener("click", (e: any) => {
            e.stopPropagation();
            const k = (el as HTMLElement).dataset.opt as string;
            const v = (el as HTMLElement).dataset.val || "";
            if (v) this.state.filters[k] = v; else delete this.state.filters[k];
            this.state.openDD = "";           // single-select closes after choosing
            this.render(); this.persistState();
        }));
        b.querySelectorAll("[data-period-opt]").forEach(el => el.addEventListener("click", (e: any) => {
            e.stopPropagation();
            const p = (el as HTMLElement).dataset.periodOpt || "";
            const set = new Set(this.state.periods);
            if (set.has(p)) { if (set.size > 1) set.delete(p); } else set.add(p);   // keep >=1
            this.state.periods = PERIOD_ORDER.filter(x => set.has(x));
            this.state.cat = "";
            this.state.openDD = "__period";   // multi-select stays open
            this.render(); this.persistState();
        }));

        // Outside-click closes any open dropdown (bind once on the persistent bodyEl)
        if (!this._linksWired) {
            this._linksWired = true;
            const launch = (a: HTMLElement) => {
                const url = a.getAttribute("data-msx"); if (!url) return;
                try { this.host.launchUrl(url); } catch (_) { /* noop */ }
            };
            b.addEventListener("click", (e: any) => {
                const a = (e.target as HTMLElement).closest("a.msx-lnk[data-msx]") as HTMLElement;
                if (a) { e.preventDefault(); e.stopPropagation(); launch(a); return; }
                // clicked outside any dropdown -> close
                if (this.state.openDD && !(e.target as HTMLElement).closest(".mv-dd")) {
                    this.state.openDD = ""; this.render(); this.persistState();
                }
            });
        }
    }

    // ---- session state persistence ---------------------------------------------------------------
    private serializeState(): string { return JSON.stringify({ v: 1, state: this.state }); }
    private applyPersisted(str: string) {
        try {
            const o: any = JSON.parse(str);
            if (o && o.state) { Object.assign(this.state, o.state); this.state.openDD = ""; }
        } catch (e) { /* noop */ }
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
