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
    name: string;
    k: Record<string, Num>;        // committed $K per period key
    t: Record<string, Num>;        // target (raw $) per period key
    wow: Record<string, Num>;      // wow per period key (jul/q1 only)
}
interface Group { label: string; territories: Terr[]; }
interface Seg { label: string; groups: Group[]; }

// Quarter-type periods flag below 65% coverage; month-type below 80%.
const QUARTER_KEYS = new Set(["q1", "q2", "q3", "q4"]);
function isFlagged(committedK: Num, targetRaw: Num, key: string): boolean {
    if (committedK === null || targetRaw === null || targetRaw === 0) return false;
    const cov = (committedK * 1000) / targetRaw;
    return cov < (QUARTER_KEYS.has(key) ? 0.65 : 0.80);
}

// Quarter -> its quarter-roll-up + 3 month keys (with labels).
const QUARTERS: { q: string; opts: { key: string; label: string }[] }[] = [
    { q: "Q1", opts: [{ key: "q1", label: "Q1" }, { key: "jul", label: "Jul" }, { key: "aug", label: "Aug" }, { key: "sep", label: "Sep" }] },
    { q: "Q2", opts: [{ key: "q2", label: "Q2" }, { key: "oct", label: "Oct" }, { key: "nov", label: "Nov" }, { key: "dec", label: "Dec" }] },
    { q: "Q3", opts: [{ key: "q3", label: "Q3" }, { key: "jan", label: "Jan" }, { key: "feb", label: "Feb" }, { key: "mar", label: "Mar" }] },
    { q: "Q4", opts: [{ key: "q4", label: "Q4" }, { key: "apr", label: "Apr" }, { key: "may", label: "May" }, { key: "jun", label: "Jun" }] }
];

function compactUSD(v: Num): string {
    if (v === null || v === undefined) return "—";
    const a = Math.abs(v);
    if (a >= 1e6) return "$" + (a / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return "$" + Math.round(a / 1e3).toLocaleString() + "K";
    return "$" + Math.round(a).toLocaleString();
}
function moveMK(v: Num): string {
    if (v === 0 || v === null || v === undefined) return '<span class="wow zero">+$0</span>';
    const cls = v > 0 ? "pos" : "neg";
    return `<span class="wow ${cls}">${v > 0 ? "+" : "-"}${compactUSD(Math.abs(v))}</span>`;
}
function esc(s: any): string {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]));
}

export class Visual implements IVisual {
    private root: HTMLElement;
    private host!: IVisualHost;
    private events: any = null;
    private errEl!: HTMLElement;
    private bodyEl!: HTMLElement;
    private hasRendered = false;

    private segs: Seg[] = [];
    private state = { seg: 0, collapsed: new Set<string>(), q: "Q1", colA: "q1", colB: "jul" };
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
            if (!this.segs.length) {
                if (!this.hasRendered) this.bodyEl.innerHTML = this.attn("No gaps data parsed.");
                try { if (this.events && this.events.renderingFinished) this.events.renderingFinished(options); } catch (e) { /* noop */ }
                return;
            }
            if (this.state.seg > this.segs.length) this.state.seg = 0;
            this.restoreState(dv);
            if (this.state.seg > this.segs.length) this.state.seg = 0;
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
        const n = (row: any[], role: string): Num => { const v = g(row, role); return v === null || v === undefined ? null : Number(v); };
        const bool = (row: any[], role: string): boolean => { const v = g(row, role); return v === true || v === 1 || v === "true"; };

        const kRole: Record<string, string> = { q1: "q1k", q2: "q2k", q3: "q3k", q4: "q4k", jul: "julk", aug: "augk", sep: "sepk", oct: "octk", nov: "novk", dec: "deck", jan: "jank", feb: "febk", mar: "mark", apr: "aprk", may: "mayk", jun: "junk" };
        const tRole: Record<string, string> = { q1: "q1t", q2: "q2t", q3: "q3t", q4: "q4t", jul: "jult", aug: "augt", sep: "sept", oct: "octt", nov: "novt", dec: "dect", jan: "jant", feb: "febt", mar: "mart", apr: "aprt", may: "mayt", jun: "junt" };

        const segMap: Record<string, Record<string, Terr[]>> = {};
        const segOrder: string[] = [];
        for (const row of t.rows as any[][]) {
            const seg = g(row, "segment"); if (seg == null) continue;
            const sub = g(row, "subsegment"); const name = g(row, "territory");
            if (name == null) continue;
            if (segOrder.indexOf(seg) < 0) segOrder.push(seg);
            segMap[seg] = segMap[seg] || {};
            segMap[seg][sub] = segMap[seg][sub] || [];
            const k: Record<string, Num> = {};
            Object.keys(kRole).forEach(pk => { k[pk] = n(row, kRole[pk]); });
            const tg: Record<string, Num> = {};
            Object.keys(tRole).forEach(pk => { tg[pk] = n(row, tRole[pk]); });
            segMap[seg][sub].push({
                name, k, t: tg,
                wow: {
                    jul: n(row, "julwow"), aug: n(row, "augwow"), sep: n(row, "sepwow"),
                    oct: n(row, "octwow"), nov: n(row, "novwow"), dec: n(row, "decwow"),
                    jan: n(row, "janwow"), feb: n(row, "febwow"), mar: n(row, "marwow"),
                    apr: n(row, "aprwow"), may: n(row, "maywow"), jun: n(row, "junwow"),
                    q1: n(row, "q1wow"), q2: n(row, "q2wow"), q3: n(row, "q3wow"), q4: n(row, "q4wow")
                }
            });
        }
        this.segs = segOrder.map(s => ({
            label: s,
            groups: Object.keys(segMap[s]).map(sub => ({ label: sub, territories: segMap[s][sub] }))
        }));
    }

    private allGroupsAcross(): Group[] {
        const out: Group[] = [];
        for (const s of this.segs) for (const grp of s.groups) out.push({ label: `${s.label} · ${grp.label}`, territories: grp.territories });
        return out;
    }

    private quarterOpts(): { key: string; label: string }[] {
        const q = QUARTERS.filter(x => x.q === this.state.q)[0] || QUARTERS[0];
        return q.opts;
    }
    private pLabel(key: string): string {
        for (const q of QUARTERS) for (const o of q.opts) if (o.key === key) return o.label;
        return key;
    }

    private render() {
        const tabs: { label: string; groups: Group[] }[] = [{ label: "All", groups: this.allGroupsAcross() }]
            .concat(this.segs.map(s => ({ label: s.label, groups: s.groups })));
        if (this.state.seg >= tabs.length) this.state.seg = 0;
        const active = tabs[this.state.seg];
        const A = this.state.colA, B = this.state.colB;
        const aLab = this.pLabel(A), bLab = this.pLabel(B);
        const aThr = QUARTER_KEYS.has(A) ? "65%" : "80%";
        const bThr = QUARTER_KEYS.has(B) ? "65%" : "80%";

        // A territory counts as flagged in the current view if it's below threshold in
        // EITHER selected period (column A or B). Counts + table react to the selection.
        const flaggedInView = (t: Terr) => isFlagged(t.k[A], t.t[A], A) || isFlagged(t.k[B], t.t[B], B);

        const allTerr = active.groups.reduce((a, grp) => a.concat(grp.territories.filter(flaggedInView)), [] as Terr[]);
        const segCount = allTerr.length;
        const aTotal = allTerr.reduce((s, t) => s + (t.k[A] || 0), 0) * 1000;
        const bTotal = allTerr.reduce((s, t) => s + (t.k[B] || 0), 0) * 1000;
        const totalFlagged = this.allGroupsAcross().reduce((a, g) => a + g.territories.filter(flaggedInView).length, 0);

        let tabHtml = "";
        tabs.forEach((tb, i) => {
            const cnt = tb.groups.reduce((a, g) => a + g.territories.filter(flaggedInView).length, 0);
            tabHtml += `<button class="seg-tab ${i === this.state.seg ? "active" : ""}" data-seg="${i}">${esc(tb.label)} <span class="badge">${cnt}</span></button>`;
        });

        // quarter context row
        const qRow = QUARTERS.map(q => `<button class="seg-tab ${q.q === this.state.q ? "active" : ""}" data-q="${q.q}">${q.q}</button>`).join("");
        // A / B selectors limited to current quarter's options
        const opts = this.quarterOpts();
        const selRow = (which: string, sel: string) => opts
            .map(o => `<button class="seg-tab gap-pill ${o.key === sel ? "active" : ""}" data-col="${which}" data-key="${o.key}">${esc(o.label)}</button>`).join("");

        let body = "";
        active.groups.forEach((grp, gi) => {
            const flaggedTerrs = grp.territories.filter(flaggedInView);
            if (!flaggedTerrs.length) return;
            const key = `${this.state.seg}-${gi}`;
            const collapsed = this.state.collapsed.has(key);
            body += `<tr class="lv-grp gap-grp${collapsed ? " collapsed" : ""}" data-grp="${esc(key)}">
              <td class="nm" colspan="5"><span class="grp-chev">${collapsed ? "▸" : "▾"}</span> ${esc(grp.label)}
              <span class="badge" style="background:#eef3f9;color:#0f3460">${flaggedTerrs.length}</span></td></tr>`;
            flaggedTerrs.forEach(t => {
                const aFlag = isFlagged(t.k[A], t.t[A], A);
                const bFlag = isFlagged(t.k[B], t.t[B], B);
                const aMark = aFlag ? '<span class="gap-mark">⚠</span> ' : "";
                const bMark = bFlag ? '<span class="gap-mark">⚠</span> ' : "";
                const wowCell = (v: Num) => v === null || v === undefined ? `<td class="muted">—</td>` : `<td>${moveMK(v * 1000)}</td>`;
                const aWowCell = wowCell(t.wow[A]);
                const bWowCell = wowCell(t.wow[B]);
                body += `<tr class="prg lv-terr gap-row${collapsed ? " hidden" : ""}" data-grp="${esc(key)}">
                  <td class="nm">${esc(t.name)}</td>
                  <td class="${aFlag ? "gap-flag" : ""}">${aMark}${compactUSD((t.k[A] || 0) * 1000)}</td>
                  ${aWowCell}
                  <td class="${bFlag ? "gap-flag" : ""}">${bMark}${compactUSD((t.k[B] || 0) * 1000)}</td>
                  ${bWowCell}
                </tr>`;
            });
        });

        const html = `
        <div class="nnr-root">
          <div class="attn-bar">⚠ ${totalFlagged} territories flagged below ${esc(aLab)} (&lt;${aThr}) and/or ${esc(bLab)} (&lt;${bThr}) threshold</div>
          <div class="seg-tabs" data-tabs="q">${qRow}</div>
          <div class="gap-filters">
            <div class="gap-fset"><span class="gap-flbl">Column A</span><div class="seg-tabs inline sub" data-tabs="colA">${selRow("A", A)}</div></div>
            <div class="gap-fset"><span class="gap-flbl">Column B</span><div class="seg-tabs inline sub" data-tabs="colB">${selRow("B", B)}</div></div>
          </div>
          <div class="gap-aligned">
          <div class="kpis gaps-kpis">
            <div class="kpi"><div class="k-label">${esc(active.label)} flagged territories</div>
              <div class="k-value">${segCount}</div><div class="k-foot">in this segment view</div></div>
            <div class="kpi"><div class="k-label">${esc(aLab)} committed</div>
              <div class="k-value">${compactUSD(aTotal)}</div><div class="k-foot">total across flagged territories</div></div>
            <div class="kpi"><div class="k-label">${esc(bLab)} committed</div>
              <div class="k-value">${compactUSD(bTotal)}</div><div class="k-foot">total across flagged territories</div></div>
          </div>
          <div class="seg-tabs" data-tabs="seg">${tabHtml}</div>
          <div class="tablewrap scrollx gap-scroll"><table class="prog-tbl gaps-tbl">
            <colgroup><col class="gc-terr"><col class="gc-com"><col class="gc-wow"><col class="gc-com"><col class="gc-wow"></colgroup>
            <thead>
              <tr>
                <th class="nm">Territory</th>
                <th colspan="2" class="grp-h"><span class="grp-top">${esc(aLab)}</span><span class="grp-sub"><span>Committed</span><span>WoW</span></span></th>
                <th colspan="2" class="grp-h"><span class="grp-top">${esc(bLab)}</span><span class="grp-sub"><span>Committed</span><span>WoW</span></span></th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table></div>
          </div>
        </div>`;
        this.bodyEl.innerHTML = `<style>${STYLES}</style>${html}`;
        this.wire();
        this.persistState();
    }

    /* ---- session state persistence (survives page navigation via host.persistProperties) ----
       Serializes the segment tab, collapsed nodes and column selections into a report object
       property so update() can rehydrate it when Power BI destroys/recreates the visual on page
       switch. Session-scoped in reading view; also captured by bookmarks. Guarded by _persistLast
       so the persist-triggered update never loops or clobbers active edits. */
    private serializeState(): string {
        const st = this.state;
        return JSON.stringify({
            v: 1, seg: st.seg, collapsed: Array.from(st.collapsed), q: st.q, colA: st.colA, colB: st.colB
        });
    }
    private applyPersisted(s: string) {
        try {
            const o: any = JSON.parse(s);
            if (!o) return;
            const st = this.state;
            if (typeof o.seg === "number") st.seg = o.seg;
            if (typeof o.q === "string") st.q = o.q;
            if (typeof o.colA === "string") st.colA = o.colA;
            if (typeof o.colB === "string") st.colB = o.colB;
            st.collapsed.clear();
            if (Array.isArray(o.collapsed)) for (const v of o.collapsed) st.collapsed.add(String(v));
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
        this.root.querySelectorAll('[data-tabs="q"] .seg-tab').forEach(b =>
            b.addEventListener("click", () => {
                this.state.q = (b as HTMLElement).dataset.q as string;
                const opts = this.quarterOpts();
                this.state.colA = opts[0].key;      // quarter roll-up
                this.state.colB = opts[1].key;      // first month
                this.render();
            }));
        this.root.querySelectorAll(".gap-pill").forEach(b =>
            b.addEventListener("click", () => {
                const el = b as HTMLElement;
                if (el.dataset.col === "A") this.state.colA = el.dataset.key as string;
                else this.state.colB = el.dataset.key as string;
                this.render();
            }));
        this.root.querySelectorAll('[data-tabs="seg"] .seg-tab').forEach(b =>
            b.addEventListener("click", () => { this.state.seg = Number((b as HTMLElement).dataset.seg); this.state.collapsed.clear(); this.render(); }));
        this.root.querySelectorAll("tr.gap-grp").forEach(tr =>
            tr.addEventListener("click", () => {
                const key = (tr as HTMLElement).dataset.grp as string;
                if (this.state.collapsed.has(key)) this.state.collapsed.delete(key); else this.state.collapsed.add(key);
                this.render();
            }));
    }
}
