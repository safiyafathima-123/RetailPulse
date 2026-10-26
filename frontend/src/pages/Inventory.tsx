import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Banner, Button, EmptyState, ErrorState, Field, MovementBadge, PageHeader, Spinner, useToast } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { fmtDateTime, fmtMoney } from "../lib/format";
import { useFetch } from "../lib/useFetch";

type Mode = "sale" | "restock" | "adjustment";
const MODES: { key: Mode; label: string }[] = [{ key: "sale", label: "Record sale" }, { key: "restock", label: "Restock" }, { key: "adjustment", label: "Adjust stock" }];

export default function Inventory() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get("action") === "restock" ? "restock" : "sale");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [text, setText] = useState("");
  const [direction, setDirection] = useState<"add" | "remove">("remove");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  const products = useFetch(() => api.products(), []);
  const moves = useFetch(() => api.movements({ movement_type: filter, limit: 40 }), [filter]);
  const selected = products.data?.find((p) => String(p.id) === productId);

  useEffect(() => { setError(""); }, [mode, productId, qty]);
  useEffect(() => { if (mode === "sale" && selected) setPrice(String(selected.selling_price)); }, [selected?.id, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return setError("Choose a product.");
    const n = Number(qty);
    if (qty.trim() === "" || !Number.isInteger(n) || n <= 0) return setError("Enter a whole number of units greater than 0.");
    if (mode === "adjustment" && text.trim().length < 3) return setError("A reason is required for manual adjustments (at least 3 characters).");
    if (mode === "sale" && (price.trim() === "" || Number(price) < 0 || !Number.isFinite(Number(price)))) return setError("Enter a unit price of 0 or more.");
    setBusy(true);
    try {
      if (mode === "sale") {
        await api.recordSale({ product_id: selected.id, quantity: n, unit_price: Number(price), note: text.trim() || undefined });
        toast("success", `Sale recorded: ${n} × ${selected.name}.`);
      } else if (mode === "restock") {
        await api.recordRestock({ product_id: selected.id, quantity: n, reason: text.trim() || undefined });
        toast("success", `Restocked ${n} × ${selected.name}.`);
      } else {
        await api.recordAdjustment({ product_id: selected.id, quantity_change: direction === "add" ? n : -n, reason: text.trim() });
        toast("success", `Stock adjusted by ${direction === "add" ? "+" : "−"}${n} for ${selected.name}.`);
      }
      setQty(""); setText("");
      void products.reload(); void moves.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  };

  const afterStock = selected && Number(qty) > 0
    ? selected.current_stock + (mode === "restock" || (mode === "adjustment" && direction === "add") ? Number(qty) : -Number(qty))
    : null;

  return (
    <>
      <PageHeader title="Inventory & Sales" subtitle="Record what sold, what arrived, or what needs correcting. Every change is logged." />
      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card h-fit min-w-0 lg:col-span-2" aria-label="Record stock change">
          <div className="flex border-b border-surface-line" role="tablist">
            {MODES.map((m) => (
              <button key={m.key} role="tab" aria-selected={mode === m.key} onClick={() => setMode(m.key)}
                className={`flex-1 border-b-2 px-3 py-3 text-sm font-medium ${mode === m.key ? "border-teal-600 text-teal-700" : "border-transparent text-navy-500 hover:text-navy-900"}`}>{m.label}</button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-4 p-5" noValidate>
            {error && <Banner kind="error">{error}</Banner>}
            <Field label="Product" htmlFor="inv-product">
              <select id="inv-product" className="input" value={productId} onChange={(e) => setProductId(e.target.value)} disabled={products.loading}>
                <option value="">{products.loading ? "Loading…" : "Choose a product"}</option>
                {(products.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku}) — {p.current_stock} in stock</option>)}
              </select>
            </Field>
            {mode === "adjustment" && (
              <Field label="Change">
                <div className="inline-flex rounded-md border border-surface-line p-0.5" role="group">
                  {(["remove", "add"] as const).map((d) => (
                    <button type="button" key={d} aria-pressed={direction === d} onClick={() => setDirection(d)}
                      className={`rounded px-3 py-1.5 text-sm font-medium ${direction === d ? "bg-navy-900 text-white" : "text-navy-700 hover:bg-surface-soft"}`}>{d === "remove" ? "Remove stock" : "Add stock"}</button>
                  ))}
                </div>
              </Field>
            )}
            <div className={mode === "sale" ? "grid grid-cols-2 gap-4" : ""}>
              <Field label="Quantity (units)" htmlFor="inv-qty">
                <input id="inv-qty" className="input" type="number" min={1} step={1} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
              </Field>
              {mode === "sale" && (
                <Field label="Unit price" htmlFor="inv-price">
                  <input id="inv-price" className="input" type="number" min={0} step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
                </Field>
              )}
            </div>
            <Field label={mode === "adjustment" ? "Reason (required)" : mode === "sale" ? "Note (optional)" : "Reference (optional)"} htmlFor="inv-text"
              hint={mode === "adjustment" ? "For example: damaged, miscount, expired." : mode === "restock" ? "For example: supplier invoice number." : undefined}>
              <input id="inv-text" className="input" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            {selected && afterStock !== null && (
              <p className={`rounded-md px-3 py-2 text-sm ${afterStock < 0 ? "bg-red-50 text-red-700" : "bg-surface-soft text-navy-700"}`}>
                {selected.current_stock} on hand → <b className="tabular-nums">{afterStock}</b> after this change
                {mode === "sale" && Number(price) >= 0 && <span className="text-navy-500"> · total {fmtMoney(Number(qty) * Number(price))}</span>}
              </p>
            )}
            <Button type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy ? "Saving…" : mode === "sale" ? "Record sale" : mode === "restock" ? "Record restock" : "Save adjustment"}
            </Button>
          </form>
        </section>

        <section className="card min-w-0 lg:col-span-3" aria-label="Recent stock movements">
          <div className="flex items-center justify-between gap-3 border-b border-surface-line px-5 py-3">
            <h2 className="text-sm font-semibold">Recent movements</h2>
            <select className="input !w-auto" aria-label="Movement type" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All types</option><option value="sale">Sales</option><option value="restock">Restocks</option><option value="adjustment">Adjustments</option>
            </select>
          </div>
          {moves.loading && !moves.data ? <Spinner /> : moves.error ? <ErrorState message={moves.error} onRetry={moves.reload} /> :
            moves.data && moves.data.length === 0 ? <EmptyState title="No movements yet" hint="Sales, restocks and adjustments will be listed here." /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse">
                  <thead><tr><th className="th">When</th><th className="th">Product</th><th className="th">Type</th><th className="th num">Change</th><th className="th num">Stock after</th></tr></thead>
                  <tbody>
                    {moves.data!.map((m) => (
                      <tr key={m.id}>
                        <td className="td whitespace-nowrap text-navy-500">{fmtDateTime(m.created_at)}</td>
                        <td className="td"><p className="font-medium">{m.product_name}</p>{m.reason && <p className="max-w-[220px] truncate text-xs text-navy-500" title={m.reason}>{m.reason}</p>}</td>
                        <td className="td"><MovementBadge type={m.movement_type} /></td>
                        <td className={`td num font-medium ${m.quantity_change < 0 ? "text-navy-900" : "text-emerald-700"}`}>{m.quantity_change > 0 ? "+" : "−"}{Math.abs(m.quantity_change)}</td>
                        <td className="td num">{m.stock_after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </section>
      </div>
    </>
  );
}
