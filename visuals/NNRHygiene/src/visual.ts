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

interface Row { id: string; account: string; usage: Num; due: string; dueRaw: string; status: string; owner: string; ownerName: string; ownerFirst: string; ownerUpn: string; msx: string; unit: string; ownerManager: string; ownerManagerName: string; tpid: string; territory: string; }
interface Cat { key: string; label: string; order: number; instruction: string; count: number; usage: number; rows: Row[]; }

const INSTR: Record<string, string> = {
    committed_7d: "Committed more than 7 days ago — hand it over to CSU, or move it back to uncommitted.",
    uncommitted_30d: "Due within 30 days but not committed — commit now if ready, or revise the date.",
    blocked_committed_30d: "Committed and due soon but blocked — escalate the blocker or reset the date.",
    blocked_committed_120d: "Long-standing blocked commitment — resolve the blocker, or cancel/close.",
    uncommitted_120d: "Aged and uncommitted — re-validate and recommit with a realistic date, or close out.",
    uncommitted_completed_30d: "Marked Completed but never committed (due within 90 days) — commit it now (or hand to CSU) so the win is recorded."
};

function money(v: Num): string {
    if (v === null || v === undefined) return "—";
    const n = Number(v) || 0;
    const a = Math.abs(n);
    if (a >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return "$" + Math.round(n / 1e3) + "K";
    return "$" + Math.round(n);
}
function esc(s: any): string {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]));
}

/* ---------- FY / Quarter / Month helpers (Microsoft FY starts in July) ---------- */
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fyOf(raw: string): number { const y = +raw.slice(0, 4), m = +raw.slice(5, 7); return m >= 7 ? y + 1 : y; }
function fyq(raw: string): { key: string; label: string; ord: number } {
    const m = +raw.slice(5, 7), fy = fyOf(raw);
    const q = m >= 7 && m <= 9 ? 1 : m >= 10 && m <= 12 ? 2 : m >= 1 && m <= 3 ? 3 : 4;
    return { key: `${fy}Q${q}`, label: `FY${String(fy).slice(2)} Q${q}`, ord: fy * 10 + q };
}
function monLabel(raw: string): string { return `${MON3[+raw.slice(5, 7) - 1]} ${raw.slice(0, 4)}`; }

/* ---------- Consolidated per-owner email (ported from the web app) ----------
   Clicking ✉ builds ONE rich-HTML draft consolidating ALL of that owner's milestones
   across every hygiene category, copies it to the clipboard (text/html + text/plain),
   and opens an addressed Outlook-web compose draft. The user pastes (Ctrl+V) once. */
interface EmailCat { key: string; label: string; colour: string; instruction: string; completed_note: string | null; }
const EMAIL_CATS: EmailCat[] = [
    { key: "committed_7d", label: "Committed >7 days", colour: "#1f3a5f",
      instruction: "This was committed more than 7 days ago — please hand it over to CSU, or move it back to uncommitted.",
      completed_note: "Note: Any milestone marked Completed below should be assigned to CSU." },
    { key: "uncommitted_30d", label: "Uncommitted, due in next 30 days", colour: "#e8a33d",
      instruction: "Due within 30 days but not yet committed — commit now if the customer is ready, or revise the estimated date.",
      completed_note: "Note: Any milestone marked Completed below should already have been committed." },
    { key: "blocked_committed_30d", label: "Blocked & committed, due in next 30 days", colour: "#c0392b",
      instruction: "Committed and due soon but blocked — escalate the blocker now or reset to a realistic date.",
      completed_note: null },
    { key: "blocked_committed_120d", label: "Blocked & committed, over 120 days old", colour: "#7b241c",
      instruction: "Long-standing blocked commitment — resolve the blocker, or cancel/close it out.",
      completed_note: null },
    { key: "uncommitted_120d", label: "Uncommitted, over 120 days old", colour: "#6b6b6b",
      instruction: "Aged and uncommitted — re-validate and recommit with a realistic date, or close it out.",
      completed_note: null },
    { key: "uncommitted_completed_30d", label: "Uncommitted & Completed, due in next 90 days", colour: "#2e7d5b",
      instruction: "Marked Completed but never committed (due within 90 days) — please commit it now (or hand it to CSU) so the win is properly recorded.",
      completed_note: "Note: These are marked Completed but were never committed — commit retroactively or assign to CSU." },
];

function hygUsd(v: Num): string { return "$" + Math.round(Number(v) || 0).toLocaleString(); }

function emailStatCards(nMs: number, total: number, nCat: number): string {
    const NAVY = "#1f3a5f", CARD_GREY = "#eef2f7", SUBTXT = "#6b7785";
    const cell = (big: string, lab: string) => `<td width="33%" bgcolor="${CARD_GREY}" align="center" style="padding:14px 8px;border-bottom:3px solid ${NAVY};">`
        + `<div style="font-size:26px;font-weight:bold;color:${NAVY};font-family:Segoe UI,Arial,sans-serif;">${big}</div>`
        + `<div style="font-size:11px;letter-spacing:1px;color:${SUBTXT};font-family:Segoe UI,Arial,sans-serif;padding-top:4px;">${lab}</div></td>`;
    const spacer = '<td width="12">&nbsp;</td>';
    return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin:18px 0;"><tr>`
        + `${cell(String(nMs), "MILESTONES")}${spacer}${cell(hygUsd(total), "MONTHLY USAGE")}${spacer}${cell(String(nCat), "CATEGORIES")}</tr></table>`;
}

function emailCatBlock(rows: Row[], cat: EmailCat): string {
    if (!rows || !rows.length) return "";
    const NAVY = "#1f3a5f", HEAD_GREY = "#f2f2f2", AMBER_BG = "#fdf3e3", AMBER_BAR = "#e0a32e",
        GREEN = "#1e7d34", BORDER = "#d7dee8", TXT = "#333333", SUBTXT = "#6b7785", LINK_BLUE = "#0b6bcb";
    const colour = cat.colour;
    const hasCompleted = rows.some((r) => (r.status || "").toLowerCase() === "completed");
    const head = `<table width="100%" cellpadding="0" cellspacing="0"><tr>`
        + `<td width="4" bgcolor="${colour}"></td>`
        + `<td style="padding:2px 0 2px 12px;">`
        + `<div style="font-size:16px;font-weight:bold;color:${NAVY};font-family:Segoe UI,Arial,sans-serif;">${esc(cat.label)}</div>`
        + `<div style="font-size:13px;color:${SUBTXT};font-family:Segoe UI,Arial,sans-serif;padding-top:2px;">${esc(cat.instruction)}</div>`
        + `</td></tr></table>`;
    let note = "";
    if (hasCompleted && cat.completed_note) {
        note = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0;"><tr>`
            + `<td bgcolor="${AMBER_BG}" style="border-left:4px solid ${AMBER_BAR};padding:8px 12px;font-size:12px;color:#7a5a18;font-family:Segoe UI,Arial,sans-serif;">`
            + `${esc(cat.completed_note).replace("Completed", "<b>Completed</b>")}</td></tr></table>`;
    }
    const th = (al: string, t: string) => `<td bgcolor="${HEAD_GREY}" align="${al}" style="padding:9px 12px;font-size:12px;font-weight:bold;color:${NAVY};font-family:Segoe UI,Arial,sans-serif;border-bottom:2px solid ${colour};">${t}</td>`;
    const header = `<tr>${th("left", "Milestone ID")}${th("center", "MSX")}${th("left", "Account")}${th("right", "Monthly Est. Usage")}${th("center", "Est. Due Date")}</tr>`;
    let body = "";
    rows.forEach((r) => {
        const completed = (r.status || "").toLowerCase() === "completed";
        const badge = completed ? ` <span style="color:${GREEN};font-size:12px;font-weight:bold;">✓ Completed</span>` : "";
        const td = (al: string, colr: string, v: string) => `<td align="${al}" style="padding:9px 12px;font-size:13px;color:${colr};font-family:Segoe UI,Arial,sans-serif;border-bottom:1px solid ${BORDER};">${v}</td>`;
        const msx = r.msx || "";
        const openCell = (msx && String(msx).startsWith("http")) ? `<a href="${esc(msx)}" style="color:${LINK_BLUE};text-decoration:none;font-weight:bold;">Open</a>` : "";
        body += `<tr>`
            + td("left", NAVY, `${esc(r.id || "")}${badge}`)
            + td("center", TXT, openCell)
            + td("left", TXT, esc(r.account || ""))
            + td("right", TXT, hygUsd(r.usage || 0))
            + td("center", TXT, esc(r.due || ""))
            + `</tr>`;
    });
    return head + note + `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:6px 0 18px;">${header}${body}</table>`;
}

function emailOwnerHtml(alias: string, name: string, first: string, catRows: Array<[EmailCat, Row[]]>, totalUsage: number): string {
    const NAVY = "#1f3a5f", TXT = "#333333";
    const RUN_DATE = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    const fullName = (name || "").trim() || alias;
    const fst = (first || "").trim() || (fullName.split(" ")[0] || "there");
    const nMs = catRows.reduce((s, x) => s + x[1].length, 0);
    const nCat = catRows.reduce((s, x) => s + (x[1].length ? 1 : 0), 0);
    const BANNER_BG = "#e8eef6", BANNER_TITLE = "#1f3a5f", BANNER_SUB = "#5a6b80";
    const banner = `<table width="100%" cellpadding="0" cellspacing="0" bgcolor="${BANNER_BG}" style="background-color:${BANNER_BG};border-bottom:3px solid ${NAVY};"><tr>`
        + `<td style="padding:22px 26px;">`
        + `<div style="font-size:22px;font-weight:bold;color:${BANNER_TITLE};font-family:Segoe UI,Arial,sans-serif;">Pipeline Hygiene — Action Required</div>`
        + `<div style="font-size:13px;color:${BANNER_SUB};font-family:Segoe UI,Arial,sans-serif;padding-top:6px;">Milestone review for ${esc(fullName)} &nbsp;&middot;&nbsp; ${RUN_DATE}</div>`
        + `</td></tr></table>`;
    const intro = `<p style="font-size:14px;color:${TXT};font-family:Segoe UI,Arial,sans-serif;">Hi ${esc(fst)},</p>`
        + `<p style="font-size:14px;color:${TXT};font-family:Segoe UI,Arial,sans-serif;line-height:1.5;">`
        + `As part of our weekly pipeline hygiene review, the milestones below need a quick action from you. `
        + `They\u2019re grouped by category, each with a one-line instruction and a direct MSX link. `
        + `Please action by <b>end of week</b>.</p>`;
    const sections = catRows.map((x) => (x[1].length ? emailCatBlock(x[1], x[0]) : "")).join("");
    const inner = `<div style="padding:0 26px 22px;">${intro}${emailStatCards(nMs, totalUsage, nCat)}${sections}</div>`;
    return `<html><head><meta charset="UTF-8"></head>`
        + `<body style="margin:0;padding:0;background-color:#ffffff;">`
        + `<div style="background-color:#ffffff;font-family:Segoe UI,Arial,sans-serif;">${banner}${inner}</div>`
        + `</body></html>`;
}

function emailOwnerPlain(fullName: string, first: string, catRows: Array<[EmailCat, Row[]]>): string {
    const fst = (first || "").trim() || (fullName.split(" ")[0] || "there");
    let out = "Hi " + fst + ",\n\nAs part of our weekly pipeline hygiene review, the milestones below need a quick action from you. Please action by end of week.\n";
    catRows.forEach(([cat, rows]) => {
        if (!rows.length) return;
        out += "\n" + cat.label + "\n" + cat.instruction + "\n";
        rows.forEach((r) => {
            out += "  • " + (r.id || "") + " | " + (r.account || "") + " | " + hygUsd(r.usage || 0) + "/mo | due " + (r.due || "") + "\n";
        });
    });
    return out;
}

export class Visual implements IVisual {
    private root: HTMLElement;
    private host!: IVisualHost;
    private events: any = null;
    private errEl!: HTMLElement;
    private bodyEl!: HTMLElement;
    private hasRendered = false;

    private cats: Cat[] = [];
    private asOf: string = "";
    private totalMs = 0;
    private state = { cat: 0, sort: "desc" as "desc" | "asc" };
    private fySel = new Set<string>();
    private quarterSel = new Set<string>();
    private monthSel = new Set<string>();
    private unitSel = new Set<string>();
    private mgrSel = new Set<string>();
    private mgrSearch = "";
    private mgrOpen = false;
    private filterTxt = "";
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
            if (!this.cats.length) {
                if (!this.hasRendered) this.bodyEl.innerHTML = this.attn("No hygiene data parsed.");
                try { if (this.events && this.events.renderingFinished) this.events.renderingFinished(options); } catch (e) { /* noop */ }
                return;
            }
            this.restoreState(dv);
            if (this.state.cat >= this.cats.length) this.state.cat = this.firstWithRows();
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
        const s = (row: any[], role: string): string => { const v = g(row, role); return v === null || v === undefined ? "" : String(v); };

        const map: Record<string, Cat> = {};
        for (const row of t.rows as any[][]) {
            const key = s(row, "categoryKey") || s(row, "category");
            if (!key) continue;
            if (!map[key]) {
                const ord = n(row, "categoryOrder");
                map[key] = {
                    key,
                    label: s(row, "category") || key,
                    order: ord == null ? 999 : ord,
                    instruction: INSTR[key] || "",
                    count: 0, usage: 0, rows: []
                };
            }
            const c = map[key];
            const id = s(row, "id");
            // skip blank padding rows
            if (!id && g(row, "account") == null && g(row, "usage") == null) continue;
            const u = n(row, "usage");
            c.rows.push({
                id, account: s(row, "account"), usage: u, due: s(row, "due"), dueRaw: s(row, "dueRaw"),
                status: s(row, "status"), owner: s(row, "owner"),
                ownerName: s(row, "ownerName"), ownerFirst: s(row, "ownerFirst"), ownerUpn: s(row, "ownerUpn"),
                msx: s(row, "msx"), unit: s(row, "unit"),
                ownerManager: s(row, "ownerManager"), ownerManagerName: s(row, "ownerManagerName"),
                tpid: s(row, "tpid"), territory: s(row, "territory")
            });
            c.count += 1;
            c.usage += (u || 0);
        }
        this.cats = Object.keys(map).map(k => map[k]).sort((a, b) => a.order - b.order);
        this.totalMs = this.cats.reduce((a, c) => a + c.count, 0);
    }

    private firstWithRows(): number {
        const i = this.cats.findIndex(c => c.rows && c.rows.length);
        return i < 0 ? 0 : i;
    }

    private periodMatch(r: Row): boolean {
        if (this.fySel.size || this.quarterSel.size || this.monthSel.size) {
            const raw = r.dueRaw || "";
            if (!raw) return false;
            if (this.fySel.size && !this.fySel.has(String(fyOf(raw)))) return false;
            if (this.quarterSel.size && !this.quarterSel.has(fyq(raw).key)) return false;
            if (this.monthSel.size && !this.monthSel.has(raw.slice(0, 7))) return false;
        }
        if (this.unitSel.size && !this.unitSel.has(r.unit || "")) return false;
        if (this.mgrSel.size && !this.mgrSel.has((r.ownerManager || "").toLowerCase())) return false;
        if (this.filterTxt) {
            const q = this.filterTxt.toLowerCase();
            if (!((r.account || "").toLowerCase().includes(q) ||
                  (r.owner || "").toLowerCase().includes(q) ||
                  (r.ownerName || "").toLowerCase().includes(q) ||
                  (r.id || "").toLowerCase().includes(q))) return false;
        }
        return true;
    }

    private isFiltered(): boolean {
        return this.fySel.size > 0 || this.quarterSel.size > 0 || this.monthSel.size > 0 || this.unitSel.size > 0 || this.mgrSel.size > 0 || !!this.filterTxt;
    }

    // Distinct owner managers across all categories' rows, resolved to display name where known,
    // sorted alphabetically by display name. key = lowercased manager alias (stable join key).
    private managerOptions(): Array<{ key: string; label: string }> {
        const m = new Map<string, string>();   // key -> best display label
        for (const c of this.cats) for (const r of c.rows) {
            const alias = (r.ownerManager || "").trim();
            if (!alias) continue;
            const key = alias.toLowerCase();
            const label = (r.ownerManagerName || "").trim() || alias;
            if (!m.has(key)) m.set(key, label);
        }
        return Array.from(m.entries()).map(([key, label]) => ({ key, label }))
            .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
    }

    // Distinct sales units across all categories' rows, sorted by milestone count (busiest first).
    private unitOptions(): Array<{ key: string; label: string }> {
        const m = new Map<string, number>();
        for (const c of this.cats) for (const r of c.rows) {
            const u = (r.unit || "").trim();
            if (!u) continue;
            m.set(u, (m.get(u) || 0) + 1);
        }
        return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
            .map(([key]) => ({ key, label: key }));
    }

    private drill(idx: number): string {
        const c = this.cats[idx];
        if (!c || !c.rows || !c.rows.length) {
            return `<div class="legend">No milestone detail available for this category in this build.</div>`;
        }
        let rows = c.rows.slice().filter(r => this.periodMatch(r));
        if (this.state.sort === "desc") rows.sort((a, b) => (b.usage || 0) - (a.usage || 0));
        else rows.sort((a, b) => (a.usage || 0) - (b.usage || 0));
        const arrow = this.state.sort === "desc" ? " ▼" : " ▲";
        const shownUsage = rows.reduce((s, r) => s + (r.usage || 0), 0);
        const filt = this.isFiltered();
        const noteTxt = filt
            ? `${rows.length} of ${c.rows.length} shown · ${money(shownUsage)} est. monthly usage`
            : `${c.rows.length} milestone${c.rows.length === 1 ? "" : "s"} · ${money(c.usage)} est. monthly usage`;
        const body = rows.map(r => `
            <tr>
              <td class="mono">${esc(r.id || "")}${r.msx ? ` <a class="lnk launch" data-url="${esc(r.msx)}" role="button">Open ↗</a>` : ""}</td>
              <td>${esc(r.account || "")}</td>
              <td class="num">${money(r.usage)}</td>
              <td>${esc(r.due || "")}</td>
              <td>${esc(r.status || "")}</td>
              <td>${(() => {
                  const disp = r.ownerName || r.owner || "";
                  if (!disp) return "";
                  return `<a class="eml-btn eml-draft" data-owner="${esc(r.owner)}" role="button" title="Build consolidated hygiene draft for ${esc(disp)}">✉</a> ${esc(disp)}`;
              })()}</td>
            </tr>`).join("");
        return `
            <div class="drill-h"><h3>${esc(c.label)} <span class="note">${noteTxt}</span></h3></div>
            ${rows.length ? "" : `<div class="legend">No milestones match the current filters.</div>`}
            <div class="tablewrap scrollx"><table class="drill-tbl">
              <thead><tr><th>Milestone</th><th>Account</th><th class="sortable" data-sort="usage" title="Click to sort">Monthly Usage${arrow}</th><th>Est. Due Date</th><th>Status</th><th>Owner</th></tr></thead>
              <tbody>${body}</tbody>
            </table></div>`;
    }

    /* Build FY / Quarter / Month option lists from ALL milestones across categories. */
    private periodOptions(): { fys: Array<{ key: string; label: string }>; quarters: Array<{ key: string; label: string }>; months: Array<{ key: string; label: string }> } {
        const fyM = new Map<string, { key: string; label: string; ord: number }>();
        const qM = new Map<string, { key: string; label: string; ord: number }>();
        const mM = new Map<string, { key: string; label: string }>();
        for (const c of this.cats) {
            for (const r of c.rows) {
                const raw = r.dueRaw || "";
                if (!raw) continue;
                const fy = fyOf(raw);
                fyM.set(String(fy), { key: String(fy), label: `FY${String(fy).slice(2)}`, ord: fy });
                const q = fyq(raw); qM.set(q.key, q);
                mM.set(raw.slice(0, 7), { key: raw.slice(0, 7), label: monLabel(raw) });
            }
        }
        const fys = Array.from(fyM.values()).sort((a, b) => a.ord - b.ord).map(x => ({ key: x.key, label: x.label }));
        const quarters = Array.from(qM.values()).sort((a, b) => a.ord - b.ord).map(x => ({ key: x.key, label: x.label }));
        const months = Array.from(mM.values()).sort((a, b) => a.key < b.key ? -1 : 1);
        return { fys, quarters, months };
    }

    private msHtml(id: string, allLabel: string, items: Array<{ key: string; label: string }>, sel: Set<string>): string {
        return `<div class="cap-multi" id="${id}Wrap">`
            + `<button type="button" class="cap-multi-btn" id="${id}Btn">${sel.size ? sel.size + " selected" : allLabel} ▾</button>`
            + `<div class="cap-multi-panel" id="${id}Panel" hidden>`
            + items.map(it => `<label><input type="checkbox" value="${esc(it.key)}"${sel.has(it.key) ? " checked" : ""}> ${esc(it.label)}</label>`).join("")
            + `</div></div>`;
    }

    // Searchable multi-select (for long, alphabetised lists like owner managers). The search box
    // stays inside the panel; the checkbox list filters live as you type.
    private msHtmlSearch(id: string, allLabel: string, items: Array<{ key: string; label: string }>,
                         sel: Set<string>, search: string, open: boolean): string {
        const q = search.trim().toLowerCase();
        const shown = q ? items.filter(it => it.label.toLowerCase().includes(q) || it.key.toLowerCase().includes(q)) : items;
        const list = shown.length
            ? shown.map(it => `<label><input type="checkbox" value="${esc(it.key)}"${sel.has(it.key) ? " checked" : ""}> ${esc(it.label)}</label>`).join("")
            : `<div class="cap-empty">no matches</div>`;
        return `<div class="cap-multi" id="${id}Wrap">`
            + `<button type="button" class="cap-multi-btn" id="${id}Btn">${sel.size ? sel.size + " selected" : allLabel} ▾</button>`
            + `<div class="cap-multi-panel${open ? "" : ""}" id="${id}Panel"${open ? "" : " hidden"}>`
            + `<input type="search" class="cap-multi-search" id="${id}Search" placeholder="Search ${esc(allLabel.toLowerCase())}…" value="${esc(search)}" />`
            + `<div class="cap-multi-list" id="${id}List">${list}</div>`
            + `</div></div>`;
    }

    private render() {
        if (this.state.cat >= this.cats.length || !this.cats[this.state.cat].rows.length) {
            this.state.cat = this.firstWithRows();
        }
        const cards = this.cats.map((c, i) => `
            <div class="hyg-card${c.rows && c.rows.length ? " click" : ""}${i === this.state.cat ? " sel" : ""}" data-cat="${i}">
              <div class="hyg-top">
                <div class="hyg-label">${esc(c.label)}</div>
                <div class="hyg-count ${c.count == null ? "na" : (c.count > 0 ? "hot" : "ok")}">${c.count == null ? "—" : c.count}</div>
              </div>
              <div class="hyg-instr">${esc(c.instruction)}</div>
              ${c.usage != null ? `<div class="hyg-sub">${money(c.usage)} est. monthly usage</div>` : ""}
            </div>`).join("");

        const html = `
        <div class="nnr-root">
          <div class="section-h">
            <h2>Hygiene — action categories</h2>
            <span class="note">${this.asOf ? "live MSX snapshot · as of " + esc(this.asOf) : "counts populate from the weekly hygiene run"}</span>
          </div>
          <div class="attn-bar" id="hygAttn">${this.totalMs.toLocaleString()} milestones flagged across the ${this.cats.length} categories (Monthly Est. Usage ≥ $10k, due in next 90 days). Click a tile for the milestone list.</div>
          <div class="hyg-grid">${cards}</div>
          ${(() => {
              const o = this.periodOptions();
              return `<div class="capctl">`
                  + this.msHtml("hygFy", "All FYs", o.fys, this.fySel)
                  + this.msHtml("hygQuarter", "All quarters", o.quarters, this.quarterSel)
                  + this.msHtml("hygMonth", "All months", o.months, this.monthSel)
                  + this.msHtml("hygUnit", "All sales units", this.unitOptions(), this.unitSel)
                  + this.msHtmlSearch("hygMgr", "All owner managers", this.managerOptions(), this.mgrSel, this.mgrSearch, this.mgrOpen)
                  + `<input id="hygFilter" class="capfilter" type="text" placeholder="Filter by account, owner or ID…" value="${esc(this.filterTxt)}" />`
                  + `<button type="button" class="cap-clear" id="hygClear">Clear</button>`
                  + `</div>`;
          })()}
          <div id="hygDrill" class="drill-wrap">${this.drill(this.state.cat)}</div>
        </div>`;
        this.bodyEl.innerHTML = `<style>${STYLES}</style>${html}`;
        this.wire();
        // Tiles are rendered from the UNFILTERED c.count; re-apply the active filter so a full
        // re-render (e.g. clicking a tile to change category) keeps the tile counts filter-aware
        // instead of reverting to the unfiltered totals. recalcTiles is a no-op visually when no
        // filter is active (shows c.count) so this is safe on every render.
        this.recalcTiles();
        this.persistState();
    }

    private wireLaunch() {
        const self = this;
        this.root.querySelectorAll("a.launch").forEach(a =>
            a.addEventListener("click", (ev) => {
                ev.preventDefault(); ev.stopPropagation();
                const url = (a as HTMLElement).dataset.url;
                if (url && self.host && (self.host as any).launchUrl) (self.host as any).launchUrl(url);
            }));
    }

    /* Group ALL of one owner's milestones across every category. */
    private ownerRows(owner: string): Row[] {
        const key = (owner || "").trim().toLowerCase();
        const out: Row[] = [];
        for (const c of this.cats) {
            for (const r of c.rows) {
                if ((r.owner || "").trim().toLowerCase() === key) out.push(r);
            }
        }
        return out;
    }

    /* Build subject + rich-HTML + plain-text + recipient for an owner. */
    private buildOwnerEmail(owner: string): { to: string; subject: string; html: string; plain: string; name: string; count: number } | null {
        const rows = this.ownerRows(owner);
        if (!rows.length) return null;
        const f = rows[0];
        const name = (f.ownerName || "").trim() || owner;
        const first = (f.ownerFirst || "").trim();
        const to = (f.ownerUpn || "").trim() || (owner.toLowerCase().replace(/\s+/g, ".") + "@example.com");
        const total = rows.reduce((s, r) => s + (r.usage || 0), 0);
        const byKey: Record<string, Row[]> = {};
        for (const c of this.cats) {
            for (const r of c.rows) {
                if ((r.owner || "").trim().toLowerCase() !== owner.trim().toLowerCase()) continue;
                (byKey[c.key] || (byKey[c.key] = [])).push(r);
            }
        }
        const catRows: Array<[EmailCat, Row[]]> = EMAIL_CATS.map((c) => [c, byKey[c.key] || []]);
        const html = emailOwnerHtml(owner, name, first, catRows, total);
        const plain = emailOwnerPlain(name, first, catRows);
        const n = rows.length;
        const subject = `Pipeline Hygiene — Action Required: ${n} milestone${n > 1 ? "s" : ""} (${hygUsd(total)}/mo)`;
        return { to, subject, html, plain, name, count: n };
    }

    /* Copy rich HTML (+ plain fallback) to clipboard. Returns a promise<boolean>. */
    private copyHtml(html: string, plain: string): Promise<boolean> {
        try {
            const nav: any = navigator as any;
            if (nav && nav.clipboard && typeof (window as any).ClipboardItem === "function" && nav.clipboard.write) {
                const item = new (window as any).ClipboardItem({
                    "text/html": new Blob([html], { type: "text/html" }),
                    "text/plain": new Blob([plain], { type: "text/plain" }),
                });
                return nav.clipboard.write([item]).then(() => true).catch(() => this.copyHtmlFallback(html));
            }
        } catch (e) { /* fall through */ }
        return Promise.resolve(this.copyHtmlFallback(html));
    }

    /* execCommand fallback: select a hidden rich node and copy. */
    private copyHtmlFallback(html: string): boolean {
        try {
            const holder = document.createElement("div");
            holder.setAttribute("contenteditable", "true");
            holder.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;white-space:pre-wrap;";
            holder.innerHTML = html;
            document.body.appendChild(holder);
            const range = document.createRange();
            range.selectNodeContents(holder);
            const sel = window.getSelection();
            if (sel) { sel.removeAllRanges(); sel.addRange(range); }
            const ok = document.execCommand("copy");
            if (sel) sel.removeAllRanges();
            holder.remove();
            return !!ok;
        } catch (e) { return false; }
    }

    private showToast(msg: string, ok: boolean) {
        let t = this.root.querySelector("#hygToast") as HTMLElement;
        if (!t) {
            t = document.createElement("div");
            t.id = "hygToast";
            this.root.appendChild(t);
        }
        t.style.cssText = "position:fixed;left:50%;top:14px;transform:translateX(-50%);max-width:600px;width:calc(100% - 32px);"
            + "padding:14px 44px 14px 18px;border-radius:10px;font-family:'Segoe UI',Arial,sans-serif;font-size:13.5px;"
            + "line-height:1.5;color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.32);z-index:99999;text-align:left;"
            + "opacity:1;pointer-events:auto;background:" + (ok ? "#1f3a5f" : "#b3372b") + ";"
            + "border:1px solid " + (ok ? "#33527a" : "#cf4a3d") + ";";
        t.innerHTML = msg
            + '<span id="hygToastX" role="button" title="Dismiss" style="position:absolute;top:8px;right:12px;'
            + 'cursor:pointer;font-size:18px;line-height:1;font-weight:700;opacity:.85;">&times;</span>';
        const x = t.querySelector("#hygToastX") as HTMLElement;
        if (x) x.addEventListener("click", () => { t.style.display = "none"; });
        t.style.display = "block";
        // auto-dismiss after a generous 20s, but it stays until then or until ✕
        window.clearTimeout((t as any)._hide);
        (t as any)._hide = window.setTimeout(() => { t.style.display = "none"; }, 20000);
    }

    private wireEmail() {
        const self = this;
        this.root.querySelectorAll("a.eml-draft").forEach(a =>
            a.addEventListener("click", (ev) => {
                ev.preventDefault(); ev.stopPropagation();
                const owner = (a as HTMLElement).dataset.owner || "";
                const pkg = self.buildOwnerEmail(owner);
                if (!pkg) { self.showToast("No milestones found for this owner.", false); return; }
                const url = "https://outlook.office.com/mail/deeplink/compose?to=" + encodeURIComponent(pkg.to)
                    + "&subject=" + encodeURIComponent(pkg.subject);
                // 1) copy rich HTML to clipboard (within the user gesture)
                self.copyHtml(pkg.html, pkg.plain).then((copied) => {
                    // 2) open the addressed draft
                    if (self.host && (self.host as any).launchUrl) (self.host as any).launchUrl(url);
                    // 3) notify
                    if (copied) {
                        self.showToast("✉ <b>Draft for " + esc(pkg.name) + "</b> (" + pkg.count + " milestone" + (pkg.count > 1 ? "s" : "")
                            + ") is opening in Outlook web.<br><br>📋 The full formatted email is on your clipboard. <b>Click in the message body and press Ctrl + V</b> to paste it, then review &amp; send.", true);
                    } else {
                        self.showToast("⚠ Draft for <b>" + esc(pkg.name) + "</b> is opening, but the formatted email could <b>not</b> be copied to your clipboard "
                            + "(blocked by the report sandbox). Use the pipeline-hygiene-emails skill for the full styled draft.", false);
                    }
                });
            }));
    }

    private repaintDrill() {
        const dh = this.root.querySelector("#hygDrill") as HTMLElement;
        if (dh) { dh.innerHTML = this.drill(this.state.cat); this.wireDrill(); }
    }

    /* Recompute each category tile's count + usage (and the total banner) for the
       current filters, updating the DOM in place so open dropdowns/text focus survive. */
    private recalcTiles() {
        const filt = this.isFiltered();
        let total = 0;
        this.cats.forEach((c, i) => {
            const fr = c.rows.filter(r => this.periodMatch(r));
            const cnt = fr.length;
            const usage = fr.reduce((s, r) => s + (r.usage || 0), 0);
            total += cnt;
            const card = this.root.querySelector('.hyg-card[data-cat="' + i + '"]') as HTMLElement;
            if (!card) return;
            const cntEl = card.querySelector(".hyg-count") as HTMLElement;
            const subEl = card.querySelector(".hyg-sub") as HTMLElement;
            const showCnt = filt ? cnt : c.count;
            const showUsage = filt ? usage : c.usage;
            if (cntEl) { cntEl.textContent = String(showCnt); cntEl.className = "hyg-count " + (showCnt > 0 ? "hot" : "ok"); }
            if (subEl) subEl.textContent = money(showUsage) + " est. monthly usage";
        });
        const attn = this.root.querySelector("#hygAttn") as HTMLElement;
        if (attn) {
            attn.textContent = filt
                ? `${total.toLocaleString()} of ${this.totalMs.toLocaleString()} milestones match the current filters across the ${this.cats.length} categories. Click a tile for the milestone list.`
                : `${this.totalMs.toLocaleString()} milestones flagged across the ${this.cats.length} categories (Monthly Est. Usage ≥ $10k, due in next 90 days). Click a tile for the milestone list.`;
        }
    }

    private applyFilters() {
        this.recalcTiles();
        this.repaintDrill();
        this.persistState();
    }

    /* ---- session state persistence (survives page navigation via host.persistProperties) ----
       Serializes the user's filter selections + view state into a report object property so that
       when Power BI destroys/recreates the visual on page switch, update() can rehydrate it.
       Session-scoped in reading view; also captured by bookmarks. Guarded by _persistLast so the
       persist-triggered update() never loops and never clobbers active edits. */
    private serializeState(): string {
        return JSON.stringify({
            v: 1,
            fy: Array.from(this.fySel), q: Array.from(this.quarterSel), mo: Array.from(this.monthSel),
            u: Array.from(this.unitSel), mgr: Array.from(this.mgrSel),
            txt: this.filterTxt, cat: this.state.cat, sort: this.state.sort
        });
    }
    private applyPersisted(s: string) {
        try {
            const o: any = JSON.parse(s);
            if (!o) return;
            const load = (set: Set<string>, arr: any) => { set.clear(); if (Array.isArray(arr)) for (const v of arr) set.add(String(v)); };
            load(this.fySel, o.fy); load(this.quarterSel, o.q); load(this.monthSel, o.mo);
            load(this.unitSel, o.u); load(this.mgrSel, o.mgr);
            if (typeof o.txt === "string") this.filterTxt = o.txt;
            if (typeof o.cat === "number") this.state.cat = o.cat;
            if (o.sort === "asc" || o.sort === "desc") this.state.sort = o.sort;
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

    private wireDrill() {
        const sh = this.root.querySelector('.drill-tbl th[data-sort="usage"]');
        if (sh) sh.addEventListener("click", () => {
            this.state.sort = this.state.sort === "desc" ? "asc" : "desc";
            this.repaintDrill();
            this.persistState();
        });
        this.wireLaunch();
        this.wireEmail();
    }

    private wireMulti(id: string, allLabel: string, sel: Set<string>) {
        const wrap = this.root.querySelector("#" + id + "Wrap") as HTMLElement;
        const btn = this.root.querySelector("#" + id + "Btn") as HTMLElement;
        const panel = this.root.querySelector("#" + id + "Panel") as HTMLElement;
        if (!wrap || !btn || !panel) return;
        const setLabel = () => { btn.textContent = (sel.size ? `${sel.size} selected ▾` : `${allLabel} ▾`); };
        btn.addEventListener("click", (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; });
        document.addEventListener("click", (e) => { if (!wrap.contains(e.target as Node)) panel.hidden = true; });
        panel.addEventListener("change", (e) => {
            const cb = e.target as HTMLInputElement;
            if (!cb || cb.type !== "checkbox") return;
            if (cb.checked) sel.add(cb.value); else sel.delete(cb.value);
            setLabel();
            this.applyFilters();
        });
    }

    private wireFilters() {
        this.wireMulti("hygFy", "All FYs", this.fySel);
        this.wireMulti("hygQuarter", "All quarters", this.quarterSel);
        this.wireMulti("hygMonth", "All months", this.monthSel);
        this.wireMulti("hygUnit", "All sales units", this.unitSel);
        this.wireMgr();
        const txt = this.root.querySelector("#hygFilter") as HTMLInputElement;
        if (txt) txt.addEventListener("input", () => { this.filterTxt = txt.value; this.applyFilters(); });
        const clr = this.root.querySelector("#hygClear");
        if (clr) clr.addEventListener("click", () => {
            this.fySel.clear(); this.quarterSel.clear(); this.monthSel.clear(); this.unitSel.clear();
            this.mgrSel.clear(); this.mgrSearch = ""; this.mgrOpen = false; this.filterTxt = "";
            this.render();
        });
    }

    // Searchable owner-manager dropdown. Live-search re-renders the panel in place so the open
    // state + search text + focus survive; checkbox toggles update the filter without a full render.
    private wireMgr() {
        const wrap = this.root.querySelector("#hygMgrWrap") as HTMLElement;
        const btn = this.root.querySelector("#hygMgrBtn") as HTMLElement;
        const panel = this.root.querySelector("#hygMgrPanel") as HTMLElement;
        if (!wrap || !btn || !panel) return;
        const setLabel = () => { btn.textContent = (this.mgrSel.size ? `${this.mgrSel.size} selected ▾` : "All owner managers ▾"); };
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.mgrOpen = panel.hidden;          // about to toggle
            panel.hidden = !panel.hidden;
            if (this.mgrOpen) {
                const sb = this.root.querySelector("#hygMgrSearch") as HTMLInputElement;
                if (sb) sb.focus();
            }
        });
        document.addEventListener("click", (e) => { if (!wrap.contains(e.target as Node)) { panel.hidden = true; this.mgrOpen = false; } });
        panel.addEventListener("change", (e) => {
            const cb = e.target as HTMLInputElement;
            if (!cb || cb.type !== "checkbox") return;
            if (cb.checked) this.mgrSel.add(cb.value); else this.mgrSel.delete(cb.value);
            setLabel();
            this.applyFilters();
        });
        const search = this.root.querySelector("#hygMgrSearch") as HTMLInputElement;
        const listEl = this.root.querySelector("#hygMgrList") as HTMLElement;
        if (search && listEl) {
            search.addEventListener("input", () => {
                this.mgrSearch = search.value;
                const q = this.mgrSearch.trim().toLowerCase();
                const items = this.managerOptions();
                const shown = q ? items.filter(it => it.label.toLowerCase().includes(q) || it.key.toLowerCase().includes(q)) : items;
                listEl.innerHTML = shown.length
                    ? shown.map(it => `<label><input type="checkbox" value="${esc(it.key)}"${this.mgrSel.has(it.key) ? " checked" : ""}> ${esc(it.label)}</label>`).join("")
                    : `<div class="cap-empty">no matches</div>`;
            });
            search.addEventListener("click", (e) => e.stopPropagation());
        }
    }

    private wire() {
        this.root.querySelectorAll(".hyg-card.click").forEach(card =>
            card.addEventListener("click", () => {
                this.state.cat = Number((card as HTMLElement).dataset.cat);
                this.render();
            }));
        this.wireFilters();
        this.wireDrill();
    }
}
