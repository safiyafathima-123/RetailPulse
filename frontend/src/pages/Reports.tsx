import { useState } from "react";
import { Button, EmptyState, ErrorState, Field, PageHeader, Spinner } from "../components/ui";
import { api, ReportColumn } from "../lib/api";
import { daysAgoISO, fmtInt, fmtMoney, todayISO } from "../lib/format";
import { useFetch } from "../lib/useFetch";

const REPORTS = [
  { key: "inventory", label: "Inventory list", hint: "Every active product with stock level and status." },
  { key: "alerts", label: "Stock alerts", hint: "Products flagged today, with the reason." },
  { key: "valuation", label: "Inventory valuation", hint: "Stock value at cost and at selling price." },
  { key: "sales", label: "Sales summary", hint: "Units, revenue and gross profit per product for the dates you choose." },
];

const cell = (v: string | number, c: ReportColumn) =>
  c.kind === "money" ? fmtMoney(Number(v)) : c.kind === "int" ? fmtInt(Number(v)) : String(v);

export default function Reports() {
  const [key, setKey] = useState("inventory");
  const [start, setStart] = useState(daysAgoISO(29));
  const [end, setEnd] = useState(todayISO());
  const meta = REPORTS.find((r) => r.key === key)!;
  const dateError = start && end && start > end ? "Start date must be on or before the end date." : "";
  const { data, error, loading, reload } = useFetch(
    () => (dateError ? Promise.reject(new Error(dateError)) : api.report(key, start, end)), [key, start, end]);

  return (
    <>
      <PageHeader title="Reports" subtitle="Preview a report, then export exactly what you see as CSV." />
      <div className="card">
        <div className="flex flex-wrap items-end gap-4 border-b border-surface-line p-4">
          <div className="min-w-[220px]">
            <Field label="Report" htmlFor="rep" hint={meta.hint}>
              <select id="rep" className="input" value={key} onChange={(e) => setKey(e.target.value)}>
                {REPORTS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </Field>
          </div>
          {key === "sales" && (
            <>
              <Field label="From" htmlFor="from"><input id="from" type="date" className="input" value={start} max={end} onChange={(e) => setStart(e.target.value)} /></Field>
              <Field label="To" htmlFor="to" error={dateError}><input id="to" type="date" className="input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></Field>
            </>
          )}
          <div className="ml-auto">
            {data && !dateError ? (
              <a href={api.reportCsvUrl(key, start, end)} download>
                <Button variant="primary">Export CSV</Button>
              </a>
            ) : <Button variant="primary" disabled>Export CSV</Button>}
          </div>
        </div>

        {data && data.summary.length > 0 && (
          <dl className="flex flex-wrap gap-x-8 gap-y-2 border-b border-surface-line px-5 py-3">
            {data.summary.map((s) => (
              <div key={s.label}><dt className="text-xs text-navy-500">{s.label}</dt><dd className="text-base font-semibold tabular-nums">{s.kind === "money" ? fmtMoney(s.value) : fmtInt(s.value)}</dd></div>
            ))}
          </dl>
        )}

        {loading && !data ? <Spinner /> : error ? <ErrorState message={error} onRetry={reload} /> :
          data && data.rows.length === 0 ? (
            <EmptyState title="No data for this report" hint={key === "sales" ? "No sales were recorded between these dates. Try a wider range." : "Add products to see this report."} />
          ) : data && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead><tr>{data.columns.map((c) => <th key={c.key} className={`th ${c.kind !== "text" ? "num" : ""}`}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i}>{data.columns.map((c) => <td key={c.key} className={`td ${c.kind !== "text" ? "num" : ""} ${c.key === "reason" ? "min-w-[260px] text-navy-700" : ""}`}>{cell(r[c.key], c) || <span className="text-navy-300">—</span>}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </>
  );
}
