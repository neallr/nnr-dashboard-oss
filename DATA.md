# Data contract

Every visual is fed by a Power BI table whose columns match the **data roles** in that visual's
`capabilities.json`. In the reference dashboard those tables are produced by flattening a single
JSON object — call it `dashboard_data.json` — into per-visual tables. This file documents that
object so you can **produce it from your own source** (CRM / Dataverse / warehouse) and wire the
visuals to your data without anyone sharing theirs.

The synthetic `sample/sample_dashboard_data.json` (from `tools/gen_sample_data.js`) is a complete,
valid instance of this contract with fake values. Each visual's `build_mock.js` is the executable
spec for how its slice maps into Power BI field wells.

All money values are numbers (USD). Deltas (`*_dod` day-over-day, `*_wow` week-over-week,
`*_mom` month-over-month) are signed numbers. Months use lowercase keys
`jul,aug,sep,oct,nov,dec,jan,feb,mar,apr,may,jun`; quarters `q1..q4`. Period labels use
`"July".."June"` and roll-up labels `"Q1".."Q4"`.

---

## Top-level keys → consuming visual

| Key | Consumed by | Purpose |
| --- | --- | --- |
| `accounts[]` | NNRAccounts | per-account pipeline by month/quarter + deltas |
| `nnr_progress` | Progress, Azure, Outlook | official headline by period (committed/blocked/uncommitted/target) |
| `territory_monthly` | Progress, Gaps | unit→group→territory grain measures + targets + unit movement |
| `territory_gaps` | Gaps | which territories are flagged under-target |
| `nnr_outlook` | Outlook | committed/uncommitted vs official target, by segment/month |
| `azure_daily` + `pipeline` | Azure | Azure pipeline by period, stage, owner-group, creator |
| `capacity` | Capacity | capacity/service-availability flagged records |
| `pipeline_hygiene` | Hygiene | records failing quality checks + owner directory |
| `milestone_facts` + `departures` | Milestones | one row per milestone×period, plus pipeline departures |
| `movements` | Movements | milestone movement waterfall by bucket |
| `frontier_macc` | Frontier | MACC-extended coverage (loaded as a chunked JSON string) |
| `summary` | Summary | slide-ready roll-up (loaded as a chunked JSON string) |

---

## `accounts[]`  → **NNRAccounts**

One object per account. Fields the visual binds:

- Identity: `name`, `tpid`, `unit`, `territory`, `atu`, `segment`, `acr_tier`, `pillars` (string),
  booleans `macc`, `high_consuming`, `macc_curated`, `msx_macc_flag`, number `acr_monthly`.
- Per month `m`: `m_cp`, `m_ucp` (committed / uncommitted), plus `m_cp_dod`, `m_ucp_dod`,
  `m_cp_wow`, `m_ucp_wow`, `m_cp_mom`, `m_ucp_mom`.
- Per quarter `q`: `q_cp`, `q_ucp`, `q_total`, and `q_*_dod`, `q_*_wow`, `q_*_mom` for `cp/ucp/total`.

## `nnr_progress`  → **Progress / Azure / Outlook**

```
{ quarter_order:["Q1",…], current_label:"Q1",
  quarters: { "Q1": { periods: [ <period>, … , <quarter roll-up> ] }, … } }
```
Each `<period>` (the roll-up has `label === "Q1"`):
`label, target, committed, blocked, uncommitted, nonqual,
 dod_committed, wow_committed, dod_uncommitted, wow_uncommitted, dod_nonqual, wow_nonqual, wow_blocked`.

## `territory_monthly`  → **Progress / Gaps**

```
{ units:[ { label, code, tgt:{ jul…jun, q1…q4 },
            groups:[ { name, territories:[ <territory> ] } ] } ],
  unit_movement: { "<periodLabel>": { "<unitLabel>": { dod, wow, dod_ucp, wow_ucp } } } }
```
Each `<territory>` carries, per month `m` and per quarter `q`:
`<m>_cp, <m>_bl, <m>_ucp, <m>_nq, <m>_tgt, <m>_wow, <m>_wow_bl` (and the `q_` equivalents).
> Note: the Progress model multiplies territory `cp/bl/ucp/nq/wow` by 1000 (values are in $K);
> targets/unit-targets are absolute. Keep your grain consistent with this if you reuse the model.

## `territory_gaps`  → **Gaps**

```
{ date, q1_threshold, jul_threshold, flagged,
  segments:[ { name, subsegments:[ { name, territories:[ { name, jul_flag, q1_flag } ] } ] } ] }
```
Gaps joins to `territory_monthly` by **territory `name`**, so names must match across the two.

## `nnr_outlook`  → **Outlook**

```
{ segment_order:[…],
  quarters:{ "Q1":{ sections:[ { label,
      official_target, official_committed, official_blocked, official_uncommitted,
      rows:[ { segment, budget, committed, uncommitted, blocked } ] } ] } } }
```

## `azure_daily` + `pipeline`  → **Azure**

```
azure_daily = { run_date_label, snap_date_label, dod_date, wow_date, stages_measured,
  targets:{ "<label>": n }, periods:{ "<label>": { cp, bl, ucp, qp } },
  movement:{ "<label>": { dod, wow } },
  stages:{ "<periodKey>": [ { stage, cp, ucp, qp } ] } }
pipeline = { owner_group:{ "<pk>": [ { group, cp } ] },
  created_by:{ "<pk>": [ { group, cp, bp, ucp, qp } ] },
  created_by_creation:{ "<pk>": [ { group, crq, crm, cp, bp, ucp, qp } ] } }
```
Azure reuses `nnr_progress` period committed/blocked/uncommitted and overlays `azure_daily` qp/movement,
plus a special `"June (FY26 Q4)"` period taken straight from `azure_daily`.

## `capacity`  → **Capacity**

`rows:[ { id, account, usage, due, due_raw, owner, status, committed, msx, created_raw, region } ]`
(`msx` is a deep-link URL for the row; `status` e.g. Capacity / Service Availability / Help Needed.)

## `pipeline_hygiene`  → **Hygiene**

```
{ categories:[ { key, label, rows:[ { id, account, due, due_raw, status, owner, msx, usage } ] } ],
  owner_directory:{ "<owner name>": { name, first, upn } } }
```
`owner_directory` resolves each row's `owner` to a display name / first name / UPN for the email
grouping. Provide an entry per owner so no fallback address is synthesised.

## `milestone_facts` + `departures`  → **Milestones**

```
milestone_facts = { link_base:"<url>", rows:[ <milestone> ] }
```
Each `<milestone>` (the field wells): `id, due, duemo, pk, nonrec, tpid, acct, terr, atu, su, seg,
own, mgr, grp, stage, st, cat, cf (1=Committed/0=Uncommitted), sp, ssp, nm, wl, lnk, macc(bool),
hc(bool), acr, m_amt, m_cp, m_ucp, m_qp, m_nq, q_amt, q_cp, q_ucp, q_qp, q_nq,
m_cp_dod, m_cp_wow, m_ucp_dod, m_ucp_wow, q_cp_dod, q_cp_wow, q_ucp_dod, q_ucp_wow,
commitment_prev_dod, st_prev_dod, due_prev_dod`.
The row's deep-link is `link_base + "&id=" + lnk`. `departures.rows[]` mirror these fields plus
`reason, was, last_pipe, pipe_prev, fromp, fromm` and are shown in the Pipeline Departures panel
(marked `sec="dep"`).

## `movements`  → **Movements**

```
{ order:["Q1",…], labels:{ Q1:"FY27 Q1" }, departure_cats:[…],
  periods:{ "<pk>":[ { cat, value, count } ] },
  entering:{ "<pk>":[ { ms, nm, lnk, value, cat } ] },
  leaving:{  "<pk>":[ { ms, nm, lnk, value, cat } ] } }
```

## `frontier_macc`  → **Frontier**  (chunked)

Loaded by the model as one JSON **string** split into `< 32K` chunks across rows `(idx, chunk)`;
the visual re-assembles and parses it. Provide an object with (at least):
`as_of, pack_month, thresholds, totals, atu_rollup[], stu_rollup[], maccext_summary, accounts[]`
where each account has `tpid, name, unit, atu, territory, macc_pbo, macc_vtt, cp, ucp, qp,
unified_adoption, msx_plan, industry`.

## `summary`  → **Summary**  (chunked)

Same chunked-string mechanism. Provide:
`period_order[], periods_with_data[], labels{}, topn[], by_period{ "<pk>": { label, committed,
uncommitted, blocked, target, topn:[ { acct, nm, lnk, amt, own, stage } ] } }`.

---

## Producing your own instance

1. Query your source for pipeline at the grains above (account, territory×month, milestone×period).
2. Emit a single JSON object with these keys (start from the synthetic sample and replace values).
3. Load into Power BI. For the flat tables, expose columns named like the roles; for `frontier_macc`
   and `summary`, feed the chunked `(idx, chunk)` table (see `NNRFrontier/build_mock.js` and
   `NNRSummary/build_mock.js`).
4. Bind field wells per visual. Run `node tools/gen_sample_data.js` + `npm run mock` in any visual to
   validate your understanding of the shape end-to-end.
