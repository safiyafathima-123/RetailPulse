import { useEffect, useRef, useState } from "react";
import { Badge, Button, EmptyState, ErrorState, Field, PageHeader, Spinner, StockBadge } from "../components/ui";
import { api, Recommendation, Simulation } from "../lib/api";
import { fmtDemand } from "../lib/format";
import { useFetch } from "../lib/useFetch";

function Simulator({ recs, selectedId, onSelect }: { recs: Recommendation[]; selectedId: number | null; onSelect: (id: number | null) => void }) {
  const base = recs.find((r) => r.product_id === selectedId) ?? null;
  const [demand, setDemand] = useState(""); const [lead, setLead] = useState(""); const [safety, setSafety] = useState("");
  const [sim, setSim] = useState<Simulation | null>(null);
  const [error, setError] = useState("");

  // Start from the real values whenever a different product is chosen.
  useEffect(() => {
    if (base) { setDemand(String(base.daily_demand)); setLead(String(base.lead_time_days)); setSafety(String(base.safety_stock)); }
    setSim(null); setError("");
  }, [base?.product_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const seq = useRef(0);
  useEffect(() => {
    if (!base) return;
    const d = Number(demand), l = Number(lead), s = Number(safety);
    const bad = [demand, lead, safety].some((v) => v.trim() === "") || ![d, l, s].every((n) => Number.isFinite(n) && n >= 0) || !Number.isInteger(l) || !Number.isInteger(s);
    if (bad) { setError("Demand must be 0 or more; lead time and safety stock must be whole numbers, 0 or more."); return; }
    setError("");
    const mine = ++seq.current;
    const t = setTimeout(() => {
      api.simulate({ product_id: base.product_id, daily_demand: d, lead_time_days: l, safety_stock: s })
        .then((r) => mine === seq.current && setSim(r))
        .catch((e) => mine === seq.current && setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [base?.product_id, demand, lead, safety]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => { if (base) { setDemand(String(base.daily_demand)); setLead(String(base.lead_time_days)); setSafety(String(base.safety_stock)); } };
  const delta = (n: number) => (n === 0 ? "no change" : `${n > 0 ? "+" : "−"}${Math.abs(n)} vs baseline`);

  return (
    <section id="simulator" className="card mt-8 scroll-mt-6" aria-label="What-if simulator">
      <div className="border-b border-surface-line px-5 py-4">
        <h2 className="text-base font-semibold">What-if simulator</h2>
        <p className="mt-1 text-sm text-navy-500">Try different demand, lead time or safety stock. Results here are temporary — your products and stock are never changed.</p>
      </div>
      <div className="p-5">
        <div className="max-w-sm">
          <Field label="Product" htmlFor="sim-product">
            <select id="sim-product" className="input" value={selectedId ?? ""} onChange={(e) => onSelect(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Choose a product</option>
              {recs.map((r) => <option key={r.product_id} value={r.product_id}>{r.name}</option>)}
            </select>
          </Field>
        </div>

        {!base ? <p className="mt-4 text-sm text-navy-500">Choose a product, or press “Simulate” on any row above.</p> : (
          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="Expected daily demand (units/day)" htmlFor="sim-d" hint={`Baseline: ${fmtDemand(base.daily_demand)}`}>
                <input id="sim-d" className="input" type="number" min={0} step="any" value={demand} onChange={(e) => setDemand(e.target.value)} />
              </Field>
              <Field label="Supplier lead time (days)" htmlFor="sim-l" hint={`Baseline: ${base.lead_time_days}`}>
                <input id="sim-l" className="input" type="number" min={0} step={1} value={lead} onChange={(e) => setLead(e.target.value)} />
              </Field>
              <Field label="Safety stock (units)" htmlFor="sim-s" hint={`Baseline: ${base.safety_stock}`}>
                <input id="sim-s" className="input" type="number" min={0} step={1} value={safety} onChange={(e) => setSafety(e.target.value)} />
              </Field>
              <Button onClick={reset}>Reset to baseline</Button>
            </div>

            <div>
              {error && <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-surface-line p-4">
                  <p className="text-xs font-medium text-navy-500">Baseline</p>
                  <p className="mt-2 text-sm text-navy-500">Reorder target</p><p className="text-xl font-semibold tabular-nums">{base.target}</p>
                  <p className="mt-2 text-sm text-navy-500">Suggested order</p><p className="text-xl font-semibold tabular-nums">{base.suggested_quantity}</p>
                  <p className="mt-2 text-xs tabular-nums text-navy-500">{base.formula}</p>
                </div>
                <div className="rounded-lg border-2 border-teal-500 bg-teal-50/50 p-4">
                  <p className="text-xs font-medium text-teal-700">Scenario (not saved)</p>
                  {sim && !error ? (
                    <>
                      <p className="mt-2 text-sm text-navy-500">Reorder target</p>
                      <p className="text-xl font-semibold tabular-nums">{sim.scenario.target} <span className="text-xs font-normal text-navy-500">{delta(sim.delta_target)}</span></p>
                      <p className="mt-2 text-sm text-navy-500">Suggested order</p>
                      <p className="text-xl font-semibold tabular-nums">{sim.scenario.suggested_quantity} <span className="text-xs font-normal text-navy-500">{delta(sim.delta_suggested)}</span></p>
                      <p className="mt-2 text-xs tabular-nums text-navy-700">{sim.scenario.formula}</p>
                    </>
                  ) : <p className="mt-3 text-sm text-navy-500">{error ? "Fix the inputs to see a result." : "Calculating…"}</p>}
                </div>
              </div>
              <p className="mt-3 text-xs text-navy-500">Suggested order = max(0, target − {base.available_stock} on hand).</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function Reorder() {
  const [onlyNeeded, setOnlyNeeded] = useState(true);
  const [simId, setSimId] = useState<number | null>(null);
  const { data, error, loading, reload } = useFetch(() => api.recommendations(), []);
  const rows = (data ?? []).filter((r) => !onlyNeeded || r.needs_order);

  const simulate = (id: number) => { setSimId(id); setTimeout(() => document.getElementById("simulator")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };

  return (
    <>
      <PageHeader title="Reorder Recommendations" subtitle="Reorder target = (daily demand × lead time) + safety stock. Suggested order = target − stock on hand. You decide whether to order."
        actions={
          <div className="inline-flex rounded-md border border-surface-line bg-white p-0.5" role="group" aria-label="Show">
            {[[true, "Needs ordering"], [false, "All products"]].map(([v, l]) => (
              <button key={String(l)} aria-pressed={onlyNeeded === v} onClick={() => setOnlyNeeded(v as boolean)}
                className={`rounded px-3 py-1.5 text-sm font-medium ${onlyNeeded === v ? "bg-navy-900 text-white" : "text-navy-700 hover:bg-surface-soft"}`}>{l as string}</button>
            ))}
          </div>
        } />

      <div className="card">
        {loading && !data ? <Spinner /> : error ? <ErrorState message={error} onRetry={reload} /> :
          rows.length === 0 ? <EmptyState title={onlyNeeded ? "Nothing to reorder" : "No products yet"}
            hint={onlyNeeded ? "Every product has enough stock to cover its reorder target." : "Add products to see recommendations."}
            action={onlyNeeded && (data?.length ?? 0) > 0 ? <Button onClick={() => setOnlyNeeded(false)}>Show all products</Button> : undefined} /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse">
                <thead><tr>
                  <th className="th">Product</th><th className="th num">On hand</th><th className="th num">Daily demand</th>
                  <th className="th num">Lead time</th><th className="th num">Safety</th><th className="th">Calculation</th>
                  <th className="th num">Suggested order</th><th className="th" />
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.product_id} className={simId === r.product_id ? "bg-teal-50/40" : ""}>
                      <td className="td">
                        <p className="font-medium">{r.name}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-navy-500">{r.sku}{r.supplier_name ? ` · ${r.supplier_name}` : ""}</div>
                        <div className="mt-1"><StockBadge status={r.stock_status} /></div>
                      </td>
                      <td className="td num">{r.available_stock}</td>
                      <td className="td num">
                        {fmtDemand(r.daily_demand)}
                        <p className="mt-0.5 max-w-[150px] whitespace-normal text-left text-[11px] leading-tight text-navy-500 sm:text-right">
                          {r.demand_source === "sales_history" ? `${r.units_sold_window} units sold in ${r.window_days} days` : r.demand_source_label}
                        </p>
                        {r.demand_source !== "sales_history" && <Badge color="blue">Estimate</Badge>}
                      </td>
                      <td className="td num">{r.lead_time_days} d</td>
                      <td className="td num">{r.safety_stock}</td>
                      <td className="td max-w-[260px]">
                        <p className="tabular-nums">{r.formula}</p>
                        <p className="mt-0.5 text-xs text-navy-500">{r.reason}</p>
                      </td>
                      <td className="td num">
                        <span className={`text-lg font-semibold ${r.needs_order ? "text-teal-700" : "text-navy-400"}`}>{r.suggested_quantity}</span>
                      </td>
                      <td className="td text-right"><Button size="sm" onClick={() => simulate(r.product_id)}>Simulate</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {data && data.length > 0 && <Simulator recs={data} selectedId={simId} onSelect={setSimId} />}
    </>
  );
}
