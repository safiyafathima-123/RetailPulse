import { useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertBadge, Button, EmptyState, ErrorState, PageHeader, Spinner, Stat } from "../components/ui";
import { api } from "../lib/api";
import { fmtDay, fmtInt, fmtMoney } from "../lib/format";
import { useFetch } from "../lib/useFetch";

const PERIODS = [7, 30, 90];

export default function Dashboard() {
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useFetch(() => api.dashboard(days), [days]);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="What needs attention today, and how sales are trending."
        actions={
          <>
            <Link to="/inventory?action=sale"><Button variant="primary">Record sale</Button></Link>
            <Link to="/products?action=new"><Button>Add product</Button></Link>
            <Link to="/reorder"><Button>Review reorders</Button></Link>
          </>
        } />

      {loading && !data ? <Spinner /> : error ? <div className="card"><ErrorState message={error} onRetry={reload} /></div> : data && (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Key metrics">
            <Stat label="Inventory value" value={fmtMoney(data.inventory_value, true)}
              sub={`${fmtInt(data.units_on_hand)} units across ${data.active_products} active products`} />
            <Stat label={`Sales, last ${days} days`} value={fmtMoney(data.sales.revenue, true)}
              sub={`${fmtInt(data.sales.units)} units in ${fmtInt(data.sales.count)} sales`} />
            <Stat label="Low stock" value={data.low_stock_count} accent={data.low_stock_count ? "amber" : undefined} sub="At or below threshold" />
            <Stat label="Out of stock" value={data.out_of_stock_count} accent={data.out_of_stock_count ? "red" : undefined} sub="Zero units on hand" />
          </section>

          <div className="grid gap-6 lg:grid-cols-5">
            <section className="card p-5 lg:col-span-3" aria-label="Sales trend">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">Daily sales</h2>
                <div className="inline-flex rounded-md border border-surface-line p-0.5" role="group" aria-label="Period">
                  {PERIODS.map((p) => (
                    <button key={p} onClick={() => setDays(p)} aria-pressed={days === p}
                      className={`rounded px-2.5 py-1 text-xs font-medium ${days === p ? "bg-navy-900 text-white" : "text-navy-700 hover:bg-surface-soft"}`}>{p} days</button>
                  ))}
                </div>
              </div>
              {data.sales.count === 0 ? (
                <EmptyState title="No sales in this period" hint="Record a sale and the trend will appear here." />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#14999B" stopOpacity={0.18} />
                          <stop offset="100%" stopColor="#14999B" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#E3E8EE" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: "#5B7188" }} tickLine={false} axisLine={false} minTickGap={32} />
                      <YAxis tick={{ fontSize: 11, fill: "#5B7188" }} tickLine={false} axisLine={false} width={52}
                        tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                      <Tooltip formatter={(v: number) => [fmtMoney(v), "Sales"]} labelFormatter={(l: string) => fmtDay(l)}
                        contentStyle={{ borderRadius: 8, border: "1px solid #E3E8EE", fontSize: 12 }} />
                      <Area type="monotone" dataKey="revenue" stroke="#0F8588" strokeWidth={2} fill="url(#rev)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="card lg:col-span-2" aria-label="Urgent items">
              <div className="flex items-center justify-between border-b border-surface-line px-5 py-3.5">
                <h2 className="text-sm font-semibold">Needs attention</h2>
                <Link to="/alerts" className="text-xs font-medium text-teal-700 hover:underline">All alerts</Link>
              </div>
              {data.urgent.length === 0 ? (
                <EmptyState title="Everything is stocked" hint="Items at or below their reorder threshold will show up here." />
              ) : (
                <ul className="divide-y divide-surface-line">
                  {data.urgent.map((a) => (
                    <li key={a.product_id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        <p className="text-xs text-navy-500">{a.current_stock} on hand · threshold {a.reorder_threshold}</p>
                      </div>
                      <AlertBadge type={a.alert_type} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
