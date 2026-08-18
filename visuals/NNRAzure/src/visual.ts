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

interface PeriodRec { target: Num; cp: Num; bl: Num; ucp: Num; qp: Num; dod: Num; wow: Num; }
interface StageRec { stage: string; cp: Num; ucp: Num; qp: Num; }
interface OwnerRec { group: string; cp: Num; }
interface CreatedRec { group: string; cp: Num; ucp: Num; bp: Num; qp: Num; }
interface Meta { run: string; snap: string; dodDate: string; wowDate: string; measured: boolean; }

const QDEFS = [
    { key: "q1", label: "Q1", months: ["July", "August", "September"] },
    { key: "q2", label: "Q2", months: ["October", "November", "December"] },
    { key: "q3", label: "Q3", months: ["January", "February", "March"] },
    { key: "q4", label: "Q4", months: ["April", "May", "June"] }
];
const M_STAGE: Record<string, string> = { July: "jul", August: "aug", September: "sep", October: "oct", November: "nov", December: "dec", January: "jan", February: "feb", March: "mar", April: "apr", May: "may", June: "jun" };
const ROLL_KEYS = new Set(["Q1", "Q2", "Q3", "Q4"]);
const MEAS: [string, string][] = [["cp", "Committed"], ["ucp", "Uncommitted"], ["qp", "All (qualified)"]];
// Milestone-creation FY-quarter buckets for the Pipeline Generation creation filter.
// Chronological (oldest → newest); last 6 quarters. Each expands to its months.
const CRQ_BUCKETS = ["FY25-Q3", "FY25-Q4", "FY26-Q1", "FY26-Q2", "FY26-Q3", "FY26-Q4"];
const MON_IX: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function monthSortKey(crm: string): number {
    const m = /^([A-Za-z]{3})\s+(\d{4})$/.exec(String(crm || "").trim());
    if (!m) return -1;
    return parseInt(m[2], 10) * 12 + (MON_IX[m[1]] ?? 0);
}

function money(v: Num): string {
    if (v === null || v === undefined) return "—";
    return "$" + (v / 1e6).toFixed(1) + "M";
}
function compactUSD(v: number): string {
    const a = Math.abs(v);
    if (a >= 1e6) return "$" + (a / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return "$" + Math.round(a / 1e3).toLocaleString() + "K";
    return "$" + Math.round(a).toLocaleString();
}
function pct(v: Num): string {
    if (v === null || v === undefined) return "—";
    return (v * 100).toFixed(0) + "%";
}
function moveMK(v: Num): string {
    if (v === 0 || v === null || v === undefined) return '<span class="wow zero">+$0</span>';
    const cls = v > 0 ? "pos" : "neg";
    return `<span class="wow ${cls}">${v > 0 ? "+" : "-"}${compactUSD(Math.abs(v))}</span>`;
}
function covClass(p: Num): string {
    if (p === null || p === undefined) return "";
    if (p >= 0.9) return "cov-good";
    if (p >= 0.65) return "cov-warn";
    return "cov-bad";
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

    private periods: Record<string, PeriodRec> = {};
    private targets: Record<string, Num> = {};
    private stages: Record<string, StageRec[]> = {};
    private owner: Record<string, OwnerRec[]> = {};
    private created: Record<string, CreatedRec[]> = {};
    // createdCre[completionQ][group][crm] = totals for that creation month ("Older" = catch-all).
    private createdCre: Record<string, Record<string, Record<string, CreatedRec>>> = {};
    // crm -> its FY-quarter bucket (for the expandable quarter pills). "Older" excluded.
    private creMonthQ: Record<string, string> = {};
    private hasOlder = false;
    private meta: Meta = { run: "", snap: "", dodDate: "", wowDate: "", measured: true };

    // creSel = selected creation leaves (crm month labels + "Older"); null = all selected.
    private state: { quarters: string[]; measure: string; creSel: Set<string> | null } = { quarters: ["q1"], measure: "cp", creSel: null };
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
            const np = Object.keys(this.periods).length, ns = Object.keys(this.stages).length, no = Object.keys(this.owner).length, nc = Object.keys(this.created).length;
            if (!np && !ns && !no && !nc) {
                if (!this.hasRendered) this.bodyEl.innerHTML = this.attn("No Azure data parsed.");
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
        const n = (row: any[], role: string): Num => { const v = g(row, role); return v === null || v === undefined ? null : Number(v); };

        this.periods = {}; this.targets = {}; this.stages = {}; this.owner = {}; this.created = {}; this.createdCre = {}; this.creMonthQ = {}; this.hasOlder = false;
        let metaSet = false;

        for (const row of t.rows as any[][]) {
            if (!metaSet) {
                const run = g(row, "runLabel"), snap = g(row, "snapLabel"), dd = g(row, "dodDate"), wd = g(row, "wowDate"), ms = g(row, "measured");
                if (run != null || snap != null || dd != null || wd != null || ms != null) {
                    this.meta = {
                        run: run == null ? this.meta.run : String(run),
                        snap: snap == null ? this.meta.snap : String(snap),
                        dodDate: dd == null ? this.meta.dodDate : String(dd),
                        wowDate: wd == null ? this.meta.wowDate : String(wd),
                        measured: ms == null ? this.meta.measured : (ms === true || ms === 1 || String(ms).toLowerCase() === "true")
                    };
                    metaSet = true;
                }
            }
            const section = String(g(row, "section") || "").toLowerCase();
            const label = g(row, "label");
            if (label == null) continue;
            if (section === "stage") {
                const k = label.toLowerCase();
                const arr = this.stages[k] || (this.stages[k] = []);
                arr.push({ stage: String(g(row, "stage") || ""), cp: n(row, "cp"), ucp: n(row, "ucp"), qp: n(row, "qp") });
            } else if (section === "owner") {
                const arr = this.owner[label] || (this.owner[label] = []);
                arr.push({ group: String(g(row, "stage") || ""), cp: n(row, "cp") });
            } else if (section === "created") {
                const arr = this.created[label] || (this.created[label] = []);
                arr.push({ group: String(g(row, "stage") || ""), cp: n(row, "cp"), ucp: n(row, "ucp"), bp: n(row, "bl"), qp: n(row, "qp") });
            } else if (section === "created_cre") {
                // stage packs "group::crqBucket::crm" (crm = month label or "Older")
                const parts = String(g(row, "stage") || "").split("::");
                const group = parts[0] || "";
                const crq = parts[1] || "Older";
                const crm = parts[2] || "Older";
                const byGrp = this.createdCre[label] || (this.createdCre[label] = {});
                const byLeaf = byGrp[group] || (byGrp[group] = {});
                byLeaf[crm] = { group, cp: n(row, "cp"), ucp: n(row, "ucp"), bp: n(row, "bl"), qp: n(row, "qp") };
                if (crm === "Older" || crq === "Older") this.hasOlder = true;
                else this.creMonthQ[crm] = crq;
            } else {
                this.periods[label] = { target: n(row, "target"), cp: n(row, "cp"), bl: n(row, "bl"), ucp: n(row, "ucp"), qp: n(row, "qp"), dod: n(row, "dod"), wow: n(row, "wow") };
                this.targets[label] = n(row, "target");
            }
        }
    }

    private selOrder(): string[] {
        return QDEFS.filter(q => this.state.quarters.indexOf(q.key) >= 0).map(q => q.key);
    }

    private periodRows(sel: string[]): string {
        const seq: string[] = [];
        for (const q of QDEFS) if (sel.indexOf(q.key) >= 0) seq.push(...q.months, q.label);
        let rows = "";
        for (const key of seq) {
            const p = this.periods[key]; if (!p) continue;
            const tgt = this.targets[key];
            const cov = (tgt != null && tgt !== 0) ? (p.cp || 0) / tgt : null;
            const isTotal = ROLL_KEYS.has(key);
            rows += `
                <tr class="${isTotal ? "period total" : "period"}">
                  <td class="nm">${esc(isTotal ? `FY27 ${key} (roll-up)` : key)}</td>
                  <td>${money(tgt)}</td><td>${money(p.cp)}</td><td>${money(p.bl)}</td>
                  <td>${money(p.ucp)}</td><td>${money(p.qp)}</td>
                  <td><span class="cov-pill ${covClass(cov)}">${pct(cov)}</span></td>
                  <td>${moveMK(p.dod)}</td><td>${moveMK(p.wow)}</td>
                </tr>`;
        }
        return rows;
    }

    private sVal(s: StageRec, m: string): number {
        const v = (s as any)[m];
        return v == null ? 0 : Number(v);
    }

    private stageBlock(title: string, arr: StageRec[] | undefined, m: string): string {
        if (!arr || !arr.length) return "";
        const vals = arr.map(s => this.sVal(s, m));
        const max = Math.max(...vals.map(v => Math.abs(v))) || 1;
        const bars = arr.map(s => {
            const v = this.sVal(s, m);
            return `<div class="stage"><div class="stage-l">${esc(s.stage)}</div>
               <div class="stage-bar"><div class="stage-fill ${v < 0 ? "neg" : ""}" style="width:${Math.max(2, (Math.abs(v) / max) * 100)}%"></div></div>
               <div class="stage-v">${money(v)}</div></div>`;
        }).join("");
        return `<div class="stagewrap"><h3>${esc(title)}</h3>${bars}</div>`;
    }

    private stagesGrid(m: string, sel: string[]): string {
        let html = "";
        for (const q of QDEFS) {
            if (sel.indexOf(q.key) < 0) continue;
            html += this.stageBlock(`FY27 ${q.label}`, this.stages[q.key], m);
            for (const mo of q.months) html += this.stageBlock(mo, this.stages[M_STAGE[mo]], m);
        }
        return html || `<div class="muted-note">Select a quarter to see the stage breakdown.</div>`;
    }

    private ownerCard(title: string, arr: OwnerRec[] | undefined): string {
        if (!arr || !arr.length) return "";
        const rows = arr.slice().sort((a, b) => (Number(b.cp) || 0) - (Number(a.cp) || 0));
        const total = rows.reduce((s, r) => s + (Number(r.cp) || 0), 0);
        const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(Number(r.cp) || 0)), 0) || 1;
        const bars = rows.map(r => {
            const v = Number(r.cp) || 0;
            const w = Math.max(2, Math.round((Math.abs(v) / maxAbs) * 100));
            const p = total ? Math.round((v / total) * 100) : 0;
            return `<div class="pbar-row"><div class="pbar-lbl">${esc(r.group)}</div>
               <div class="pbar-track"><div class="pbar-fill pf-commit ${v < 0 ? "pbar-neg" : ""}" style="width:${w}%"></div></div>
               <div class="pbar-val">${compactUSD(v)} · ${p}%</div></div>`;
        }).join("");
        return `<div class="pcard"><h3>${esc(title)}</h3>${bars}
            <div class="pbar-row pbar-tot"><div class="pbar-lbl">UK&amp;I</div><div class="pbar-track"></div><div class="pbar-val">${compactUSD(total)}</div></div></div>`;
    }

    private ownerGrid(sel: string[]): string {
        let html = "";
        for (const q of QDEFS) {
            if (sel.indexOf(q.key) < 0) continue;
            html += this.ownerCard(`FY27 ${q.label}`, this.owner[q.label]);
            for (const mo of q.months) html += this.ownerCard(mo, this.owner[mo]);
        }
        return html || `<div class="muted-note">Select a quarter to see committed pipeline by owner group.</div>`;
    }

    private createdCard(title: string, arr: CreatedRec[] | undefined, note?: string): string {
        if (!arr || !arr.length) return "";
        const rows = arr.slice().sort((a, b) => (Number(b.qp) || 0) - (Number(a.qp) || 0));
        const base = rows.reduce((s, r) => s + Math.abs(Number(r.qp) || 0), 0) || 1;
        const totCp = rows.reduce((s, r) => s + Math.abs(Number(r.cp) || 0), 0) || 1;
        const totUcp = rows.reduce((s, r) => s + Math.abs(Number(r.ucp) || 0), 0) || 1;
        const totBp = rows.reduce((s, r) => s + Math.abs(Number(r.bp) || 0), 0) || 1;
        const seg = (v: Num, cls: string) => {
            const val = Number(v) || 0;
            const w = val === 0 ? 0 : Math.max(1, Math.round((Math.abs(val) / base) * 100));
            return w ? `<div class="pcl-seg ${cls}" style="width:${w}%"></div>` : "";
        };
        const grps = rows.map(r => {
            const qp = Number(r.qp) || 0;
            const share = Math.round((qp / base) * 100);
            const cp = Number(r.cp) || 0, ucp = Number(r.ucp) || 0, bp = Number(r.bp) || 0;
            const pc = Math.round((Math.abs(cp) / totCp) * 100), pu = Math.round((Math.abs(ucp) / totUcp) * 100), pb = Math.round((Math.abs(bp) / totBp) * 100);
            const tip = `${esc(r.group)} — Committed ${compactUSD(cp)} (${pc}%) · Uncommitted ${compactUSD(ucp)} (${pu}%) · Blocked ${compactUSD(bp)} (${pb}%)`;
            return `<div class="pcl-grp">
                <div class="pcl-grp-h"><span class="pcl-grp-nm">${esc(r.group)}</span><span class="pcl-qp">${compactUSD(qp)} · ${share}%</span></div>
                <div class="pcl-stack" title="${tip}">${seg(r.cp, "pf-commit")}${seg(r.ucp, "pf-uncommit")}${seg(r.bp, "pf-block")}</div>
              </div>`;
        }).join("");
        const noteHtml = note ? `<div class="pcard-note">${esc(note)}</div>` : "";
        return `<div class="pcard"><h3>${esc(title)}</h3>${noteHtml}${grps}</div>`;
    }

    // Ordered structure for the creation pills: recent quarters (each with its months) + Older.
    private creStructure(): { quarters: { crq: string; months: string[] }[]; hasOlder: boolean } {
        const byQ: Record<string, string[]> = {};
        for (const crm of Object.keys(this.creMonthQ)) {
            const q = this.creMonthQ[crm];
            (byQ[q] || (byQ[q] = [])).push(crm);
        }
        const quarters = CRQ_BUCKETS
            .filter(q => byQ[q] && byQ[q].length)
            .map(q => ({ crq: q, months: byQ[q].slice().sort((a, b) => monthSortKey(a) - monthSortKey(b)) }));
        return { quarters, hasOlder: this.hasOlder };
    }

    // All selectable creation leaves (month labels + "Older").
    private creAllLeaves(): string[] {
        const leaves = Object.keys(this.creMonthQ);
        if (this.hasOlder) leaves.push("Older");
        return leaves;
    }

    private crqAllSelected(): boolean {
        if (this.state.creSel === null) return true;
        return this.state.creSel.size >= this.creAllLeaves().length;
    }

    private isLeafOn(crm: string): boolean {
        return this.state.creSel === null || this.state.creSel.has(crm);
    }

    // Quarter pill state: "on" (all months selected), "off", or "part".
    private quarterState(months: string[]): "on" | "off" | "part" {
        const on = months.filter(m => this.isLeafOn(m)).length;
        if (on === 0) return "off";
        if (on === months.length) return "on";
        return "part";
    }

    // Sum the selected creation leaves per group for a completion quarter -> CreatedRec[].
    private createdFiltered(qLabel: string): CreatedRec[] {
        const byGrp = this.createdCre[qLabel];
        if (!byGrp) return [];
        const out: CreatedRec[] = [];
        for (const group of Object.keys(byGrp)) {
            const leaves = byGrp[group];
            let cp = 0, ucp = 0, bp = 0, qp = 0;
            for (const crm of Object.keys(leaves)) {
                if (!this.isLeafOn(crm)) continue;
                const rec = leaves[crm];
                cp += Number(rec.cp) || 0; ucp += Number(rec.ucp) || 0;
                bp += Number(rec.bp) || 0; qp += Number(rec.qp) || 0;
            }
            if (qp !== 0 || cp !== 0 || ucp !== 0 || bp !== 0) out.push({ group, cp, ucp, bp, qp });
        }
        return out;
    }

    private createdGrid(sel: string[]): string {
        let html = "";
        for (const q of QDEFS) {
            if (sel.indexOf(q.key) < 0) continue;
            // Always source from the creation cube (last-6-Q scope). "All" = all 6 quarters.
            // Both the quarter card and its month cards reflect the selected creation leaves.
            html += this.createdCard(`FY27 ${q.label}`, this.createdFiltered(q.label));
            for (const mo of q.months) {
                html += this.createdCard(mo, this.createdFiltered(mo));
            }
        }
        return html || `<div class="muted-note">Select a quarter to see pipeline by created-by group.</div>`;
    }

    // Summary label for the dropdown button.
    private creSummary(): string {
        if (this.crqAllSelected()) return "All";
        const sel = this.state.creSel;
        if (!sel) return "All";
        // count selected quarters fully on, else count months
        const struct = this.creStructure();
        const fullQ = struct.quarters.filter(q => q.months.length && q.months.every(m => sel.has(m)));
        const partialMonths = struct.quarters
            .filter(q => !(q.months.length && q.months.every(m => sel.has(m))))
            .reduce((acc, q) => acc + q.months.filter(m => sel.has(m)).length, 0);
        const parts: string[] = [];
        if (fullQ.length) parts.push(`${fullQ.length} qtr${fullQ.length > 1 ? "s" : ""}`);
        if (partialMonths) parts.push(`${partialMonths} mo`);
        return parts.length ? parts.join(" + ") : "None";
    }

    private crqPills(): string {
        const struct = this.creStructure();
        if (!struct.quarters.length) return "";
        const all = this.crqAllSelected();
        const qRows = struct.quarters.map(q => {
            const st = this.quarterState(q.months);
            const monthRows = q.months.map(m => {
                const on = this.isLeafOn(m);
                const short = m.replace(/ 20/, " '");
                return `<label class="crq-mrow"><input type="checkbox" class="crq-mchk" data-crm="${esc(m)}" ${on ? "checked" : ""}><span>${esc(short)}</span></label>`;
            }).join("");
            const box = st === "on" ? "checked" : "";
            const indet = st === "part" ? ' data-indet="1"' : "";
            return `<div class="crq-qgroup">
                <div class="crq-qrow">
                  <label class="crq-qlabel"><input type="checkbox" class="crq-qchk" data-crq="${esc(q.crq)}" ${box}${indet}><span>${esc(q.crq)}</span></label>
                  <button class="crq-caret" data-crqexp="${esc(q.crq)}" aria-label="Show months">▸</button>
                </div>
                <div class="crq-mlist" data-crqmonths="${esc(q.crq)}" style="display:none">${monthRows}</div>
              </div>`;
        }).join("");
        return `<div class="crq-dd" data-az="crqbar">
            <span class="crq-lbl">Created in</span>
            <button class="crq-ddbtn" data-crqtoggle="1" aria-haspopup="true">
              <span class="crq-ddval" data-crqsummary>${esc(this.creSummary())}</span><span class="crq-ddcaret">▾</span>
            </button>
            <div class="crq-ddpanel" data-crqpanel style="display:none">
              <div class="crq-ddhead">
                <button class="crq-mini" data-crqall="1">All</button>
                <button class="crq-mini" data-crqnone="1">Clear</button>
                <span class="crq-ddtitle">Milestone created</span>
              </div>
              ${qRows}
            </div>
          </div>`;
    }

    private render() {
        const measured = this.meta.measured;
        const meas = measured ? this.state.measure : "qp";
        const sel0 = this.selOrder();

        const qSel = `<div class="qsel" data-az="qsel">` +
            `<span class="qsel-lbl">Quarters</span>` +
            QDEFS.map(q => `<label class="qchip ${this.state.quarters.indexOf(q.key) >= 0 ? "on" : ""}">
                <input type="checkbox" data-q="${q.key}" ${this.state.quarters.indexOf(q.key) >= 0 ? "checked" : ""}><span>${esc(q.label)}</span>
              </label>`).join("") +
            `</div>`;

        const toggle = measured
            ? `<div class="seg-tabs inline" data-az="meas">` +
              MEAS.map(([k, lbl]) => `<button class="seg-tab ${this.state.measure === k ? "active" : ""}" data-meas="${k}">${esc(lbl)}</button>`).join("") +
              `</div>`
            : "";

        const html = `
        <div class="nnr-root">
          <div class="section-h">
            <h2>Azure Daily — MSX pipeline by period</h2>
          </div>
          ${qSel}
          <div class="tablewrap scrollx">
            <table class="prog-tbl az-tbl">
              <thead><tr>
                <th class="nm">Period</th><th>Target</th><th>Committed</th><th>Blocked</th><th>Uncommitted</th>
                <th>Qualified</th><th>Coverage</th><th>DoD</th><th>WoW</th>
              </tr></thead>
              <tbody data-az="body">${this.periodRows(sel0)}</tbody>
            </table>
          </div>
          <div class="section-h" style="margin-top:22px"><h2>Sales-stage breakdown</h2><span class="note">${measured ? "split by Committed / Uncommitted / All" : "qualified pipeline by stage"}</span></div>
          ${toggle}
          <div class="stages-grid grid4" data-az="grid">${this.stagesGrid(meas, sel0)}</div>
          <div class="section-h" style="margin-top:22px"><h2>By owner group</h2><span class="note">Committed Pipeline · Production only</span></div>
          <div class="stages-grid grid4" data-az="ownergrid">${this.ownerGrid(sel0)}</div>
          <div class="section-h" style="margin-top:22px"><h2>Pipeline Generation</h2><span class="note">Pipeline Generated · % = share of quarter qualified pipeline · Tip: hover a bar for the Committed / Uncommitted / Blocked split</span></div>
          <div class="pcl-legend">
            <span><span class="pbar-swatch pf-commit"></span>Committed (excl. blocked)</span>
            <span><span class="pbar-swatch pf-uncommit"></span>Uncommitted</span>
            <span><span class="pbar-swatch pf-block"></span>Blocked</span>
          </div>
          ${this.crqPills()}
          <div class="stages-grid grid4" data-az="createdgrid">${this.createdGrid(sel0)}</div>
        </div>`;
        this.bodyEl.innerHTML = `<style>${STYLES}</style>${html}`;
        this.wire();
        this.persistState();
    }

    /* ---- session state persistence (survives page navigation via host.persistProperties) ----
       Serializes the selected quarters, measure and created-month filter into a report object
       property so update() can rehydrate it when Power BI destroys/recreates the visual on page
       switch. Session-scoped in reading view; also captured by bookmarks. Guarded by _persistLast
       so the persist-triggered update never loops or clobbers active edits. */
    private serializeState(): string {
        const st = this.state;
        return JSON.stringify({
            v: 1, quarters: st.quarters, measure: st.measure,
            creSel: st.creSel ? Array.from(st.creSel) : null
        });
    }
    private applyPersisted(s: string) {
        try {
            const o: any = JSON.parse(s);
            if (!o) return;
            const st = this.state;
            if (Array.isArray(o.quarters)) st.quarters = o.quarters.map((x: any) => String(x));
            if (typeof o.measure === "string") st.measure = o.measure;
            if (o.creSel === null || o.creSel === undefined) st.creSel = null;
            else if (Array.isArray(o.creSel)) st.creSel = new Set(o.creSel.map((x: any) => String(x)));
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
        const body = this.root.querySelector('[data-az="body"]') as HTMLElement;
        const grid = this.root.querySelector('[data-az="grid"]') as HTMLElement;
        const ownergrid = this.root.querySelector('[data-az="ownergrid"]') as HTMLElement;
        const createdgrid = this.root.querySelector('[data-az="createdgrid"]') as HTMLElement;
        const redraw = () => {
            const sel = this.selOrder();
            const meas = this.meta.measured ? this.state.measure : "qp";
            if (body) body.innerHTML = this.periodRows(sel);
            if (grid) grid.innerHTML = this.stagesGrid(meas, sel);
            if (ownergrid) ownergrid.innerHTML = this.ownerGrid(sel);
            if (createdgrid) createdgrid.innerHTML = this.createdGrid(sel);
        };
        this.root.querySelectorAll('[data-az="qsel"] input[data-q]').forEach(cbEl => {
            const cb = cbEl as HTMLInputElement;
            cb.addEventListener("change", () => {
                const k = cb.dataset.q as string;
                if (cb.checked) { if (this.state.quarters.indexOf(k) < 0) this.state.quarters.push(k); }
                else this.state.quarters = this.state.quarters.filter(x => x !== k);
                const chip = cb.closest(".qchip"); if (chip) chip.classList.toggle("on", cb.checked);
                redraw();
            });
        });
        if (this.meta.measured) {
            this.root.querySelectorAll('[data-az="meas"] .seg-tab').forEach(btnEl => {
                const btn = btnEl as HTMLElement;
                btn.addEventListener("click", () => {
                    this.state.measure = btn.dataset.meas as string;
                    this.root.querySelectorAll('[data-az="meas"] .seg-tab').forEach(b => b.classList.toggle("active", b === btn));
                    if (grid) grid.innerHTML = this.stagesGrid(this.state.measure, this.selOrder());
                });
            });
        }
        // Creation dropdown (Pipeline Generation only) — quarters chronological, months nested.
        const ensureSel = (): Set<string> => {
            if (this.state.creSel === null) this.state.creSel = new Set(this.creAllLeaves());
            return this.state.creSel;
        };
        const normalizeSel = () => {
            const leaves = this.creAllLeaves();
            const s = this.state.creSel;
            if (s === null) return;
            if (s.size >= leaves.length) this.state.creSel = null; // full → All (empty stays empty = None)
        };
        const bar = this.root.querySelector('[data-az="crqbar"]') as HTMLElement;
        const refreshCrq = () => {
            if (bar) {
                const summ = bar.querySelector('[data-crqsummary]'); if (summ) summ.textContent = this.creSummary();
                bar.querySelectorAll('.crq-mchk').forEach(mEl => {
                    const m = mEl as HTMLInputElement; m.checked = this.isLeafOn(m.dataset.crm as string);
                });
                this.creStructure().quarters.forEach(q => {
                    const qChk = bar.querySelector(`.crq-qchk[data-crq="${q.crq}"]`) as HTMLInputElement;
                    if (qChk) { const st = this.quarterState(q.months); qChk.checked = st === "on"; qChk.indeterminate = st === "part"; }
                });
            }
            if (createdgrid) createdgrid.innerHTML = this.createdGrid(this.selOrder());
        };
        if (bar) {
            const panel = bar.querySelector('[data-crqpanel]') as HTMLElement;
            const closePanel = () => { if (panel) panel.style.display = "none"; };
            // Toggle dropdown open/close
            const ddBtn = bar.querySelector('[data-crqtoggle]');
            if (ddBtn) ddBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
            });
            // Clicks inside the panel shouldn't close it
            if (panel) panel.addEventListener("click", (e) => e.stopPropagation());
            // Outside click closes
            this.root.addEventListener("click", closePanel);
            // All / Clear
            bar.querySelectorAll('[data-crqall]').forEach(el => el.addEventListener("click", () => { this.state.creSel = null; refreshCrq(); }));
            bar.querySelectorAll('[data-crqnone]').forEach(el => el.addEventListener("click", () => { this.state.creSel = new Set(); refreshCrq(); }));
            // Quarter checkbox = toggle all its months
            bar.querySelectorAll('.crq-qchk[data-crq]').forEach(el => el.addEventListener("change", () => {
                const crq = (el as HTMLElement).dataset.crq as string;
                const months = (this.creStructure().quarters.find(q => q.crq === crq) || { months: [] }).months;
                const sel = ensureSel();
                const allOn = months.every(m => sel.has(m));
                if (allOn) months.forEach(m => sel.delete(m)); else months.forEach(m => sel.add(m));
                normalizeSel(); refreshCrq();
            }));
            // Month checkbox
            bar.querySelectorAll('.crq-mchk[data-crm]').forEach(el => el.addEventListener("change", () => {
                const crm = (el as HTMLElement).dataset.crm as string;
                const sel = ensureSel();
                if (sel.has(crm)) sel.delete(crm); else sel.add(crm);
                normalizeSel(); refreshCrq();
            }));
            // Expand/collapse a quarter's months
            bar.querySelectorAll('[data-crqexp]').forEach(el => el.addEventListener("click", (e) => {
                e.preventDefault();
                const crq = (el as HTMLElement).dataset.crqexp as string;
                const ml = bar.querySelector(`[data-crqmonths="${crq}"]`) as HTMLElement;
                if (ml) {
                    const show = ml.style.display === "none";
                    ml.style.display = show ? "block" : "none";
                    (el as HTMLElement).textContent = show ? "▾" : "▸";
                }
            }));
        }
    }
}
