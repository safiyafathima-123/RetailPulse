import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertBadge, Button, EmptyState, ErrorState, PageHeader, Spinner } from "../components/ui";
import { AlertType, api } from "../lib/api";
import { useFetch } from "../lib/useFetch";

const FILTERS: { key: "all" | AlertType; label: string }[] = [
  { key: "all", label: "All" }, { key: "out", label: "Out of stock" }, { key: "low", label: "Low stock" },
  { key: "slow", label: "Slow-moving" }, { key: "excess", label: "Excess" },
];

export default function Alerts() {
  const [filter, setFilter] = useState<"all" | AlertType>("all");
  const { data, error, loading, reload } = useFetch(() => api.alerts(), []);
  const counts = (k: string) => (k === "all" ? data?.length ?? 0 : data?.filter((a) => a.alert_type === k).length ?? 0);
  const rows = (data ?? []).filter((a) => filter === "all" || a.alert_type === filter);

  return (
    <>
      <PageHeader title="Stock Alerts" subtitle="Products at or below their reorder threshold, plus slow-moving or overstocked items where sales history supports it." />
      <div className="card">
        <div className="flex flex-wrap gap-2 border-b border-surface-line p-4" role="group" aria-label="Filter alerts">
          {FILTERS.map((f) => (
            <button key={f.key} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1 text-sm font-medium ${filter === f.key ? "border-navy-900 bg-navy-900 text-white" : "border-surface-line text-navy-700 hover:bg-surface-soft"}`}>
              {f.label} <span className={filter === f.key ? "text-navy-300" : "text-navy-400"}>{counts(f.key)}</span>
            </button>
          ))}
        </div>
        {loading && !data ? <Spinner /> : error ? <ErrorState message={error} onRetry={reload} /> :
          rows.length === 0 ? (
            <EmptyState title={filter === "all" ? "No alerts right now" : "Nothing in this category"}
              hint={filter === "all" ? "Every active product is above its reorder threshold." : "Try another filter."} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead><tr><th className="th">Product</th><th className="th">Alert</th><th className="th num">On hand</th><th className="th num">Threshold</th><th className="th">Why it’s flagged</th><th className="th" /></tr></thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.product_id}>
                      <td className="td"><p className="font-medium">{a.name}</p><p className="text-xs text-navy-500">{a.sku}{a.supplier_name ? ` · ${a.supplier_name}` : ""}</p></td>
                      <td className="td"><AlertBadge type={a.alert_type} /></td>
                      <td className="td num font-medium">{a.current_stock}</td>
                      <td className="td num">{a.reorder_threshold}</td>
                      <td className="td max-w-xs text-navy-700">{a.reason}</td>
                      <td className="td text-right whitespace-nowrap">
                        {(a.alert_type === "out" || a.alert_type === "low") && <Link to="/reorder"><Button size="sm">See reorder</Button></Link>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </>
  );
}
