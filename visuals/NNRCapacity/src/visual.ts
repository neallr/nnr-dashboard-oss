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

interface CapRow {
    id: string;
    account: string;
    usage: Num;
    due: string;
    due_raw: string;
    owner: string;
    status: string;
    committed: boolean;
    msx: string;
    uat: string;
    hasaction: boolean;
    created_raw: string;
    region: string;
    tpid: string;
    territory: string;
}

function money(v: Num): string {
    if (v === null || v === undefined) return "—";
    const a = Math.abs(v);
    const sign = v < 0 ? "-" : "";
    if (a >= 1e6) return sign + "$" + (a / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return sign + "$" + Math.round(a / 1e3) + "K";
    return sign + "$" + Math.round(a);
}
function esc(s: any): string {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]));
}

interface Opt { key: string; label: string; ord?: number; }

export class Visual implements IVisual {
    private root: HTMLElement;
    private host!: IVisualHost;
    private events: any = null;
    private errEl!: HTMLElement;
    private bodyEl!: HTMLElement;
    private hasRendered = false;

    private rows: CapRow[] = [];
    private asOf = "";
    private count = 0;
    private monthlyUsage: Num = null;

    private state = {
        sortDir: "desc" as "desc" | "asc",
        filterTxt: "",
        commitSel: "all" as "all" | "committed" | "uncommitted",
        statusSel: new Set<string>(),
        fySel: new Set<string>(),
        quarterSel: new Set<string>(),
        monthSel: new Set<string>(),
        createdSel: new Set<string>(),  // selected created month_keys "YYYY-MM"; empty = all
        regionSel: new Set<string>(),   // selected Azure regions; empty = all
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
            if (!this.rows.length) {
                if (!this.hasRendered) this.bodyEl.innerHTML = this.attn("No capacity data parsed.");
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
        const s = (row: any[], role: string): string => { const v = g(row, role); return v === null || v === undefined ? "" : String(v); };
        const n = (row: any[], role: string): Num => { const v = g(row, role); return v === null || v === undefined || v === "" ? null : Number(v); };
        const bool = (row: any[], role: string): boolean => { const v = g(row, role); return v === true || v === 1 || v === "true" || v === "True"; };

        const out: CapRow[] = [];
        for (const row of t.rows as any[][]) {
            const id = s(row, "id");
            const account = s(row, "account");
            if (!id && !account) continue;
            out.push({
                id, account, usage: n(row, "usage"), due: s(row, "due"), due_raw: s(row, "due_raw"),
                owner: s(row, "owner"), status: s(row, "status"), committed: bool(row, "committed"), msx: s(row, "msx"),
                uat: s(row, "uat"), hasaction: bool(row, "hasaction"),
                created_raw: s(row, "created_raw"),
                region: (v => v === "None" ? "" : v)(s(row, "region")),
                tpid: s(row, "tpid"), territory: s(row, "territory")
            });
        }
        this.rows = out;
        this.count = out.length;
        this.monthlyUsage = out.reduce((a, r) => a + (r.usage || 0), 0);
    }

    private fyOf(raw: string): number { const y = +raw.slice(0, 4), m = +raw.slice(5, 7); return m >= 7 ? y + 1 : y; }
    private fyq(raw: string): Opt {
        const m = +raw.slice(5, 7);
        const fy = this.fyOf(raw);
        const q = m >= 7 && m <= 9 ? 1 : m >= 10 && m <= 12 ? 2 : m >= 1 && m <= 3 ? 3 : 4;
        return { key: `${fy}Q${q}`, label: `FY${String(fy).slice(2)} Q${q}`, ord: fy * 10 + q };
    }
    private monLabel(raw: string): string {
        const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${MON[+raw.slice(5, 7) - 1]} ${raw.slice(0, 4)}`;
    }

    private statuses(): string[] {
        return Array.from(new Set(this.rows.map(r => r.status).filter(Boolean))).sort();
    }
    private regions(): Opt[] {
        const cnt = new Map<string, number>();
        this.rows.forEach(r => { if (r.region) cnt.set(r.region, (cnt.get(r.region) || 0) + 1); });
        return Array.from(cnt.entries())
            .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))   // most-used first, then alpha
            .map(([k, c]) => ({ key: k, label: `${k} (${c})` }));
    }
    private fyears(): Opt[] {
        const m = new Map<string, Opt>();
        this.rows.forEach(r => { if (r.due_raw) { const fy = this.fyOf(r.due_raw); m.set(String(fy), { key: String(fy), label: `FY${String(fy).slice(2)}`, ord: fy }); } });
        return Array.from(m.values()).sort((a, b) => (a.ord || 0) - (b.ord || 0));
    }
    private quarters(): Opt[] {
        const m = new Map<string, Opt>();
        this.rows.forEach(r => { if (r.due_raw) { const q = this.fyq(r.due_raw); m.set(q.key, q); } });
        return Array.from(m.values()).sort((a, b) => (a.ord || 0) - (b.ord || 0));
    }
    private months(): Opt[] {
        const m = new Map<string, Opt>();
        this.rows.forEach(r => { if (r.due_raw) m.set(r.due_raw.slice(0, 7), { key: r.due_raw.slice(0, 7), label: this.monLabel(r.due_raw) }); });
        return Array.from(m.values()).sort((a, b) => a.key < b.key ? -1 : 1);
    }

    // Creation-date filter buckets: the last 6 fiscal quarters present in the data,
    // each expandable to its months. Bucketed by created_raw ("YYYY-MM-DD").
    private createdFyq(raw: string): Opt {
        const m = +raw.slice(5, 7);
        const fy = this.fyOf(raw);
        const q = m >= 7 && m <= 9 ? 1 : m >= 10 && m <= 12 ? 2 : m >= 1 && m <= 3 ? 3 : 4;
        return { key: `FY${String(fy).slice(2)}-Q${q}`, label: `FY${String(fy).slice(2)}-Q${q}`, ord: fy * 10 + q };
    }
    private createdBuckets(): { qkey: string; qlabel: string; ord: number; months: Opt[] }[] {
        const qmap = new Map<string, { qkey: string; qlabel: string; ord: number; months: Map<string, Opt> }>();
        for (const r of this.rows) {
            if (!r.created_raw || r.created_raw.length < 7) continue;
            const q = this.createdFyq(r.created_raw);
            const mk = r.created_raw.slice(0, 7);
            let e = qmap.get(q.key);
            if (!e) { e = { qkey: q.key, qlabel: q.label, ord: q.ord || 0, months: new Map() }; qmap.set(q.key, e); }
            e.months.set(mk, { key: mk, label: this.monLabel(r.created_raw) });
        }
        const all = Array.from(qmap.values()).sort((a, b) => b.ord - a.ord); // newest first
        const last6 = all.slice(0, 6);
        return last6.map(e => ({
            qkey: e.qkey, qlabel: e.qlabel, ord: e.ord,
            months: Array.from(e.months.values()).sort((a, b) => a.key < b.key ? -1 : 1)
        }));
    }
    // All selectable created month-keys (within the last-6-quarter window).
    private createdLeaves(): string[] {
        const out: string[] = [];
        for (const b of this.createdBuckets()) for (const m of b.months) out.push(m.key);
        return out;
    }
    private createdSummary(): string {
        const sel = this.state.createdSel;
        if (!sel.size) return "All";
        const buckets = this.createdBuckets();
        const fullQ = buckets.filter(b => b.months.length && b.months.every(m => sel.has(m.key)));
        const fullKeys = new Set<string>();
        fullQ.forEach(b => b.months.forEach(m => fullKeys.add(m.key)));
        const partialMonths = Array.from(sel).filter(k => !fullKeys.has(k)).length;
        const parts: string[] = [];
        if (fullQ.length) parts.push(`${fullQ.length} qtr${fullQ.length > 1 ? "s" : ""}`);
        if (partialMonths) parts.push(`${partialMonths} mo`);
        return parts.length ? parts.join(" + ") : "All";
    }
    private quarterCreatedState(months: Opt[]): "on" | "off" | "part" {
        const sel = this.state.createdSel;
        const on = months.filter(m => sel.has(m.key)).length;
        if (on === 0) return "off";
        if (on === months.length) return "on";
        return "part";
    }

    private filtered(): CapRow[] {
        const st = this.state;
        let rows = this.rows.slice();
        if (st.commitSel === "committed") rows = rows.filter(r => r.committed);
        else if (st.commitSel === "uncommitted") rows = rows.filter(r => !r.committed);
        if (st.statusSel.size) rows = rows.filter(r => st.statusSel.has(r.status));
        if (st.fySel.size) rows = rows.filter(r => r.due_raw && st.fySel.has(String(this.fyOf(r.due_raw))));
        if (st.quarterSel.size) rows = rows.filter(r => r.due_raw && st.quarterSel.has(this.fyq(r.due_raw).key));
        if (st.monthSel.size) rows = rows.filter(r => r.due_raw && st.monthSel.has(r.due_raw.slice(0, 7)));
        if (st.createdSel.size) rows = rows.filter(r => r.created_raw && r.created_raw.length >= 7 && st.createdSel.has(r.created_raw.slice(0, 7)));
        if (st.regionSel.size) rows = rows.filter(r => r.region && st.regionSel.has(r.region));
        if (st.filterTxt) {
            const q = st.filterTxt.toLowerCase();
            rows = rows.filter(r =>
                (r.account || "").toLowerCase().includes(q) ||
                (r.owner || "").toLowerCase().includes(q) ||
                (r.region || "").toLowerCase().includes(q) ||
                (r.id || "").toLowerCase().includes(q));
        }
        return rows;
    }
    private isFiltered(): boolean {
        const st = this.state;
        return st.commitSel !== "all" || st.statusSel.size > 0 || st.fySel.size > 0 || st.quarterSel.size > 0 || st.monthSel.size > 0 || st.createdSel.size > 0 || st.regionSel.size > 0 || !!st.filterTxt;
    }

    private msHtml(id: string, allLabel: string, items: Opt[], sel: Set<string>): string {
        return `
        <div class="cap-multi" id="${id}Wrap">
          <button type="button" class="cap-multi-btn" id="${id}Btn">${sel.size ? sel.size + " selected" : allLabel} ▾</button>
          <div class="cap-multi-panel" id="${id}Panel" hidden>
            ${items.map(it => `<label><input type="checkbox" value="${esc(it.key)}"${sel.has(it.key) ? " checked" : ""}> ${esc(it.label)}</label>`).join("")}
          </div>
        </div>`;
    }

    // "Created in" nested dropdown — last 6 fiscal quarters, each expandable to its months.
    private createdDropdownHtml(): string {
        const buckets = this.createdBuckets();
        if (!buckets.length) return "";
        const sel = this.state.createdSel;
        const qBlocks = buckets.map(b => {
            const st = this.quarterCreatedState(b.months);
            const mrows = b.months.map(m => {
                const short = m.label.replace(/ 20/, " '");
                return `<label class="cre-mrow"><input type="checkbox" class="cre-mchk" value="${esc(m.key)}"${sel.has(m.key) ? " checked" : ""}><span>${esc(short)}</span></label>`;
            }).join("");
            return `<div class="cre-qgroup">
                <div class="cre-qrow">
                  <label class="cre-qlabel"><input type="checkbox" class="cre-qchk" data-q="${esc(b.qkey)}"${st === "on" ? " checked" : ""}${st === "part" ? ' data-indet="1"' : ""}><span>${esc(b.qlabel)}</span></label>
                  <button type="button" class="cre-caret" data-exp="${esc(b.qkey)}" aria-label="Show months">▸</button>
                </div>
                <div class="cre-mlist" data-months="${esc(b.qkey)}" hidden>${mrows}</div>
              </div>`;
        }).join("");
        return `
        <div class="cap-multi cre-dd" id="capCreWrap">
          <button type="button" class="cap-multi-btn" id="capCreBtn">Created: ${esc(this.createdSummary())} ▾</button>
          <div class="cap-multi-panel cre-panel" id="capCrePanel" hidden>
            <div class="cre-head">
              <button type="button" class="cre-mini" id="capCreAll">All</button>
              <button type="button" class="cre-mini" id="capCreNone">Clear</button>
              <span class="cre-title">Milestone created</span>
            </div>
            ${qBlocks}
          </div>
        </div>`;
    }

    private tableHtml(): string {
        const st = this.state;
        let rows = this.filtered();
        rows.sort((a, b) => st.sortDir === "desc" ? (b.usage || 0) - (a.usage || 0) : (a.usage || 0) - (b.usage || 0));
        const arrow = st.sortDir === "desc" ? " ▼" : " ▲";
        const shownUsage = rows.reduce((s, r) => s + (r.usage || 0), 0);
        const body = rows.map(r => `
          <tr>
            <td class="mono">${esc(r.id || "")}${r.msx ? ` <a class="lnk launch" data-url="${esc(r.msx)}" role="button">Open ↗</a>` : ""} <span class="hyg-cap">✕ Capacity</span></td>
            <td>${esc(r.account || "")}</td>
            <td>${r.region ? esc(r.region) : '<span class="cap-dim">—</span>'}</td>
            <td class="num">${money(r.usage)}</td>
            <td>${esc(r.due || "")}</td>
            <td>${esc(r.status || "")}</td>
            <td>${r.committed ? `<span class="cap-pill cm">Committed</span>` : `<span class="cap-pill un">Uncommitted</span>`}</td>
            <td>${esc(r.owner || "")}</td>
            <td>${r.uat ? `<a class="lnk launch" data-url="${esc(r.uat)}" role="button" title="View active UAT action">UAT ↗</a>` : '<span class="cap-dim">—</span>'}</td>
          </tr>`).join("");
        return `
          <div class="drill-h"><h3>Capacity-flagged milestones <span class="note">${rows.length} shown · ${money(shownUsage)} est. monthly usage</span></h3></div>
          <div class="tablewrap scrollx"><table class="drill-tbl">
            <thead><tr><th>Milestone</th><th>Account</th><th>Azure Region</th><th class="sortable" id="capSortUsage" title="Click to sort">Monthly Usage${arrow}</th><th>Est. Due Date</th><th>Status</th><th>Commitment</th><th>Owner</th><th>UAT</th></tr></thead>
            <tbody>${body}</tbody>
          </table></div>`;
    }

    private tileSub(): { cnt: number; usd: number; show: boolean } {
        const rows = this.filtered();
        return { cnt: rows.length, usd: rows.reduce((s, r) => s + (r.usage || 0), 0), show: this.isFiltered() };
    }

    private render() {
        const st = this.state;
        const statuses = this.statuses();
        const fyears = this.fyears();
        const quarters = this.quarters();
        const months = this.months();
        const regions = this.regions();

        const html = `
        <div class="nnr-root">
          <div class="section-h">
            <h2>Azure Capacity</h2>
            <span class="note">${this.asOf ? "live MSX snapshot · as of " + esc(this.asOf) : ""}</span>
          </div>
          <div class="hyg-grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr));margin-bottom:14px">
            <div class="hyg-card"><div class="hyg-top"><div class="hyg-label">Milestones</div><div class="hyg-count hot">${(this.count || 0).toLocaleString()}</div></div>
              <div class="hyg-instr">Flagged in MSX as <b>Capacity/Service Availability</b> or <b>Help Needed = Azure Capacity</b>.</div>
              <div class="cap-subrow" id="capSubCount"></div></div>
            <div class="hyg-card"><div class="hyg-top"><div class="hyg-label">Total monthly usage</div><div class="hyg-count">${money(this.monthlyUsage)}</div></div>
              <div class="hyg-instr">Sum of estimated monthly usage across all flagged milestones.</div>
              <div class="cap-subrow" id="capSubUsage"></div></div>
          </div>
          <div class="attn-bar" style="background:#fdecea;border-color:#f5c6c2;color:#922b21">These milestones span several hygiene categories — they are blocked or at risk on Azure capacity / service availability. UK/IE ENT, due after FY floor, Monthly Est. Usage ≥ $10k.</div>
          <div class="capctl">
            <div class="cap-toggle" id="capToggle">
              <button data-c="all"${st.commitSel === "all" ? ' class="on"' : ""}>All</button>
              <button data-c="committed"${st.commitSel === "committed" ? ' class="on"' : ""}>Committed</button>
              <button data-c="uncommitted"${st.commitSel === "uncommitted" ? ' class="on"' : ""}>Uncommitted</button>
            </div>
            ${this.msHtml("capStatus", "All statuses", statuses.map(s => ({ key: s, label: s })), st.statusSel)}
            ${this.msHtml("capFy", "All FYs", fyears, st.fySel)}
            ${this.msHtml("capQuarter", "All quarters", quarters, st.quarterSel)}
            ${this.msHtml("capMonth", "All months", months, st.monthSel)}
            ${this.msHtml("capRegion", "All regions", regions, st.regionSel)}
            ${this.createdDropdownHtml()}
            <input id="capFilter" class="capfilter" type="text" placeholder="Filter by account or owner…" value="${esc(st.filterTxt)}" />
            <button type="button" class="cap-clear" id="capClear">Clear</button>
          </div>
          <div id="capTable">${this.tableHtml()}</div>
        </div>`;
        this.bodyEl.innerHTML = `<style>${STYLES}</style>${html}`;
        this.wire();
    }

    private repaint() {
        const tableHost = this.bodyEl.querySelector("#capTable") as HTMLElement;
        if (!tableHost) return;
        tableHost.innerHTML = this.tableHtml();
        const sh = tableHost.querySelector("#capSortUsage");
        if (sh) sh.addEventListener("click", () => { this.state.sortDir = this.state.sortDir === "desc" ? "asc" : "desc"; this.repaint(); });
        const self = this;
        this.bodyEl.querySelectorAll("a.launch").forEach(a =>
            a.addEventListener("click", (ev) => {
                ev.preventDefault(); ev.stopPropagation();
                const url = (a as HTMLElement).dataset.url;
                if (url && self.host && (self.host as any).launchUrl) (self.host as any).launchUrl(url);
            }));
        this.paintSub();
        this.persistState();
    }

    /* ---- session state persistence (survives page navigation via host.persistProperties) ----
       Serializes filter selections + sort/view state into a report object property so update() can
       rehydrate it when Power BI destroys/recreates the visual on page switch. Session-scoped in
       reading view; also captured by bookmarks. Guarded by _persistLast so the persist-triggered
       update never loops or clobbers active edits. */
    private serializeState(): string {
        const st = this.state;
        return JSON.stringify({
            v: 1,
            sortDir: st.sortDir, filterTxt: st.filterTxt, commitSel: st.commitSel,
            statusSel: Array.from(st.statusSel), fySel: Array.from(st.fySel),
            quarterSel: Array.from(st.quarterSel), monthSel: Array.from(st.monthSel),
            createdSel: Array.from(st.createdSel), regionSel: Array.from(st.regionSel)
        });
    }
    private applyPersisted(s: string) {
        try {
            const o: any = JSON.parse(s);
            if (!o) return;
            const st = this.state;
            if (o.sortDir === "asc" || o.sortDir === "desc") st.sortDir = o.sortDir;
            if (typeof o.filterTxt === "string") st.filterTxt = o.filterTxt;
            if (o.commitSel === "all" || o.commitSel === "committed" || o.commitSel === "uncommitted") st.commitSel = o.commitSel;
            const L = (set: Set<string>, arr: any) => { set.clear(); if (Array.isArray(arr)) for (const v of arr) set.add(String(v)); };
            L(st.statusSel, o.statusSel); L(st.fySel, o.fySel); L(st.quarterSel, o.quarterSel);
            L(st.monthSel, o.monthSel); L(st.createdSel, o.createdSel); L(st.regionSel, o.regionSel);
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

    private paintSub() {
        const subCount = this.bodyEl.querySelector("#capSubCount") as HTMLElement;
        const subUsage = this.bodyEl.querySelector("#capSubUsage") as HTMLElement;
        if (!subCount || !subUsage) return;
        const s = this.tileSub();
        if (!s.show) { subCount.innerHTML = ""; subUsage.innerHTML = ""; return; }
        subCount.innerHTML = `<span class="cap-sublabel">Filtered</span> <b>${s.cnt.toLocaleString()}</b> milestone${s.cnt === 1 ? "" : "s"}`;
        subUsage.innerHTML = `<span class="cap-sublabel">Filtered</span> <b>${money(s.usd)}</b> est. monthly usage`;
    }

    private wire() {
        const host = this.bodyEl;
        const st = this.state;

        this.repaint();

        const toggle = host.querySelector("#capToggle") as HTMLElement;
        if (toggle) toggle.addEventListener("click", (e: any) => {
            const b = (e.target as HTMLElement).closest("button[data-c]") as HTMLElement;
            if (!b) return;
            st.commitSel = b.dataset.c as any;
            host.querySelectorAll("#capToggle button").forEach(x => (x as HTMLElement).classList.toggle("on", x === b));
            this.repaint();
        });

        const resets: (() => void)[] = [];
        const wireMulti = (id: string, allLabel: string, sel: Set<string>, onChange?: () => void) => {
            const wrap = host.querySelector("#" + id + "Wrap") as HTMLElement;
            const btn = host.querySelector("#" + id + "Btn") as HTMLElement;
            const panel = host.querySelector("#" + id + "Panel") as HTMLElement;
            const setLabel = () => { btn.textContent = (sel.size ? `${sel.size} selected ▾` : `${allLabel} ▾`); };
            btn.addEventListener("click", (e: any) => { e.stopPropagation(); (panel as any).hidden = !(panel as any).hidden; });
            document.addEventListener("click", (e: any) => { if (wrap && !wrap.contains(e.target)) (panel as any).hidden = true; });
            panel.addEventListener("change", (e: any) => {
                const cb = e.target as HTMLInputElement;
                if (!cb || cb.type !== "checkbox") return;
                if (cb.checked) sel.add(cb.value); else sel.delete(cb.value);
                setLabel();
                if (onChange) onChange();
                this.repaint();
            });
            const reset = () => { sel.clear(); panel.querySelectorAll("input[type=checkbox]").forEach(cb => { (cb as HTMLInputElement).checked = false; }); setLabel(); };
            resets.push(reset);
            return { sel, panel, setLabel };
        };

        type Handle = { sel: Set<string>; panel: HTMLElement; setLabel: () => void };
        const availQuarters = () => this.quarters().filter(q => st.fySel.size === 0 || st.fySel.has(q.key.split("Q")[0]));
        const availMonths = () => this.months().filter(m => {
            const d = m.key + "-01";
            return (st.fySel.size === 0 || st.fySel.has(String(this.fyOf(d)))) &&
                   (st.quarterSel.size === 0 || st.quarterSel.has(this.fyq(d).key));
        });
        const rebuildPanel = (handle: Handle, items: Opt[]) => {
            Array.from(handle.sel).forEach(k => { if (!items.some(it => it.key === k)) handle.sel.delete(k); });
            handle.panel.innerHTML = items.map(it => `<label><input type="checkbox" value="${esc(it.key)}"${handle.sel.has(it.key) ? " checked" : ""}> ${esc(it.label)}</label>`).join("");
            handle.setLabel();
        };

        wireMulti("capStatus", "All statuses", st.statusSel);
        wireMulti("capRegion", "All regions", st.regionSel);
        const hFy = wireMulti("capFy", "All FYs", st.fySel, () => { rebuildPanel(hQ, availQuarters()); rebuildPanel(hM, availMonths()); });
        const hQ = wireMulti("capQuarter", "All quarters", st.quarterSel, () => { rebuildPanel(hM, availMonths()); });
        const hM = wireMulti("capMonth", "All months", st.monthSel);
        void hFy;
        rebuildPanel(hQ, availQuarters());
        rebuildPanel(hM, availMonths());

        const fi = host.querySelector("#capFilter") as HTMLInputElement;
        if (fi) fi.addEventListener("input", () => { st.filterTxt = fi.value.trim(); this.repaint(); });

        // "Created in" nested dropdown
        const creWrap = host.querySelector("#capCreWrap") as HTMLElement;
        const creBtn = host.querySelector("#capCreBtn") as HTMLElement;
        const crePanel = host.querySelector("#capCrePanel") as HTMLElement;
        const setCreLabel = () => { if (creBtn) creBtn.textContent = `Created: ${this.createdSummary()} ▾`; };
        const syncCreChecks = () => {
            if (!crePanel) return;
            crePanel.querySelectorAll(".cre-mchk").forEach(el => { const c = el as HTMLInputElement; c.checked = st.createdSel.has(c.value); });
            this.createdBuckets().forEach(b => {
                const qc = crePanel.querySelector(`.cre-qchk[data-q="${b.qkey}"]`) as HTMLInputElement;
                if (qc) { const s = this.quarterCreatedState(b.months); qc.checked = s === "on"; qc.indeterminate = s === "part"; }
            });
            setCreLabel();
        };
        if (creBtn && crePanel && creWrap) {
            creBtn.addEventListener("click", (e: any) => { e.stopPropagation(); (crePanel as any).hidden = !(crePanel as any).hidden; });
            document.addEventListener("click", (e: any) => { if (creWrap && !creWrap.contains(e.target)) (crePanel as any).hidden = true; });
            crePanel.addEventListener("click", (e: any) => e.stopPropagation());
            // All / Clear
            const allBtn = host.querySelector("#capCreAll") as HTMLElement;
            const noneBtn = host.querySelector("#capCreNone") as HTMLElement;
            if (allBtn) allBtn.addEventListener("click", () => { st.createdSel = new Set(this.createdLeaves()); syncCreChecks(); this.repaint(); });
            if (noneBtn) noneBtn.addEventListener("click", () => { st.createdSel.clear(); syncCreChecks(); this.repaint(); });
            // Quarter checkbox = toggle its months
            crePanel.querySelectorAll(".cre-qchk").forEach(el => el.addEventListener("change", () => {
                const qkey = (el as HTMLElement).dataset.q as string;
                const b = this.createdBuckets().find(x => x.qkey === qkey);
                if (!b) return;
                const allOn = b.months.every(m => st.createdSel.has(m.key));
                if (allOn) b.months.forEach(m => st.createdSel.delete(m.key)); else b.months.forEach(m => st.createdSel.add(m.key));
                syncCreChecks(); this.repaint();
            }));
            // Month checkbox
            crePanel.querySelectorAll(".cre-mchk").forEach(el => el.addEventListener("change", () => {
                const k = (el as HTMLInputElement).value;
                if (st.createdSel.has(k)) st.createdSel.delete(k); else st.createdSel.add(k);
                syncCreChecks(); this.repaint();
            }));
            // Expand/collapse months
            crePanel.querySelectorAll("[data-exp]").forEach(el => el.addEventListener("click", (e: any) => {
                e.preventDefault();
                const qkey = (el as HTMLElement).dataset.exp as string;
                const ml = crePanel.querySelector(`[data-months="${qkey}"]`) as HTMLElement;
                if (ml) { const show = (ml as any).hidden; (ml as any).hidden = !show; (el as HTMLElement).textContent = show ? "▾" : "▸"; }
            }));
        }

        const clear = host.querySelector("#capClear") as HTMLElement;
        if (clear) clear.addEventListener("click", () => {
            st.commitSel = "all"; st.filterTxt = "";
            host.querySelectorAll("#capToggle button").forEach(x => (x as HTMLElement).classList.toggle("on", (x as HTMLElement).dataset.c === "all"));
            resets.forEach(reset => reset());
            st.createdSel.clear();
            syncCreChecks();
            rebuildPanel(hQ, availQuarters());
            rebuildPanel(hM, availMonths());
            if (fi) fi.value = "";
            this.repaint();
        });
    }
}
