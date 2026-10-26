import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Banner, Button, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHeader, Spinner, StockBadge, useToast } from "../components/ui";
import { api, ApiError, Product, ProductInput } from "../lib/api";
import { fmtMoney } from "../lib/format";
import { useFetch } from "../lib/useFetch";

type FormState = Record<"name" | "sku" | "category" | "cost_price" | "selling_price" | "current_stock" | "reorder_threshold" |
  "safety_stock" | "lead_time_days" | "manual_daily_demand" | "supplier_name" | "supplier_contact", string>;

const blank: FormState = { name: "", sku: "", category: "", cost_price: "", selling_price: "", current_stock: "0",
  reorder_threshold: "10", safety_stock: "5", lead_time_days: "5", manual_daily_demand: "", supplier_name: "", supplier_contact: "" };

const toForm = (p: Product): FormState => ({
  name: p.name, sku: p.sku, category: p.category, cost_price: String(p.cost_price), selling_price: String(p.selling_price),
  current_stock: String(p.current_stock), reorder_threshold: String(p.reorder_threshold), safety_stock: String(p.safety_stock),
  lead_time_days: String(p.lead_time_days), manual_daily_demand: p.manual_daily_demand == null ? "" : String(p.manual_daily_demand),
  supplier_name: p.supplier_name ?? "", supplier_contact: p.supplier_contact ?? "",
});

function ProductForm({ product, categories, onDone, onClose }: { product: Product | null; categories: string[]; onDone: () => void; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<FormState>(product ? toForm(product) : blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    const num = (k: keyof FormState, label: string, int = false) => {
      const raw = f[k].trim();
      if (raw === "") { local[k] = `${label} is required.`; return 0; }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) local[k] = `${label} must be 0 or more.`;
      else if (int && !Number.isInteger(n)) local[k] = `${label} must be a whole number.`;
      return n;
    };
    if (!f.name.trim()) local.name = "Name is required.";
    if (!f.sku.trim()) local.sku = "SKU is required.";
    const body: ProductInput = {
      name: f.name, sku: f.sku, category: f.category.trim() || "General",
      cost_price: num("cost_price", "Cost price"), selling_price: num("selling_price", "Selling price"),
      reorder_threshold: num("reorder_threshold", "Reorder threshold", true), safety_stock: num("safety_stock", "Safety stock", true),
      lead_time_days: num("lead_time_days", "Lead time", true),
      manual_daily_demand: f.manual_daily_demand.trim() === "" ? null : num("manual_daily_demand", "Daily demand"),
      supplier_name: f.supplier_name.trim() || null, supplier_contact: f.supplier_contact.trim() || null,
    };
    if (!product) body.current_stock = num("current_stock", "Opening stock", true);
    setErrors(local); setFormError("");
    if (Object.keys(local).length) return;

    setBusy(true);
    try {
      if (product) await api.updateProduct(product.id, body); else await api.createProduct(body);
      toast("success", product ? `Saved changes to ${f.name.trim()}.` : `Added ${f.name.trim()}.`);
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        if (err.status === 409) setErrors({ sku: err.message });
        else setErrors(err.fields);
      } else setFormError("Something went wrong. Please try again.");
    } finally { setBusy(false); }
  };

  const text = (k: keyof FormState, label: string, extra: { hint?: string; type?: string; list?: string; placeholder?: string } = {}) => (
    <Field label={label} htmlFor={`f-${k}`} error={errors[k]} hint={extra.hint}>
      <input id={`f-${k}`} className={`input ${errors[k] ? "input-error" : ""}`} value={f[k]} onChange={set(k)}
        type={extra.type ?? "text"} inputMode={extra.type === "number" ? "decimal" : undefined} step={extra.type === "number" ? "any" : undefined}
        list={extra.list} placeholder={extra.placeholder} aria-invalid={!!errors[k]} />
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {formError && !errors.sku && <Banner kind="error">{formError}</Banner>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">{text("name", "Product name")}</div>
        {text("sku", "SKU", { hint: "Unique. Spaces are trimmed and letters upper-cased." })}
        <div>
          {text("category", "Category", { list: "categories", placeholder: "General" })}
          <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        {text("cost_price", "Cost price", { type: "number" })}
        {text("selling_price", "Selling price", { type: "number" })}
        {product ? (
          <Field label="Current stock" hint="Change stock from Inventory & Sales so it appears in the history.">
            <div className="input bg-surface-soft tabular-nums">{product.current_stock} units</div>
          </Field>
        ) : text("current_stock", "Opening stock (units)", { type: "number" })}
        {text("reorder_threshold", "Reorder threshold", { type: "number", hint: "Flag as low stock at or below this." })}
        {text("safety_stock", "Safety stock", { type: "number", hint: "Buffer added to the reorder target." })}
        {text("lead_time_days", "Supplier lead time (days)", { type: "number" })}
        <div className="sm:col-span-2">
          {text("manual_daily_demand", "Daily demand estimate (optional)", { type: "number", hint: "Used only when there isn’t enough recorded sales history." })}
        </div>
        {text("supplier_name", "Supplier (optional)")}
        {text("supplier_contact", "Supplier contact (optional)")}
      </div>
      <div className="flex justify-end gap-2 border-t border-surface-line pt-4">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? "Saving…" : product ? "Save changes" : "Add product"}</Button>
      </div>
    </form>
  );
}

export default function Products() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("active");
  const [stock, setStock] = useState("");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [confirm, setConfirm] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(t); }, [search]);
  useEffect(() => { if (params.get("action") === "new") { setEditing("new"); setParams({}, { replace: true }); } }, [params, setParams]);

  const list = useFetch(() => api.products({ search: debounced, category, status, stock }), [debounced, category, status, stock]);
  const cats = useFetch(() => api.categories(), []);
  const refresh = () => { void list.reload(); void cats.reload(); };
  const filtered = !!(debounced || category || stock || status !== "active");

  const archiveOrRestore = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.is_active) await api.archiveProduct(confirm.id); else await api.restoreProduct(confirm.id);
      toast("success", confirm.is_active ? `Archived ${confirm.name}.` : `Restored ${confirm.name}.`);
      setConfirm(null); refresh();
    } catch (e) { toast("error", e instanceof Error ? e.message : "Couldn’t update the product."); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Products" subtitle="Your catalogue, with prices, stock levels and supplier details."
        actions={<Button variant="primary" onClick={() => setEditing("new")}>Add product</Button>} />

      <div className="card">
        <div className="grid gap-3 border-b border-surface-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          <input className="input" type="search" placeholder="Search name, SKU or supplier" aria-label="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {(cats.data ?? []).map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="input" aria-label="Stock level" value={stock} onChange={(e) => setStock(e.target.value)}>
            <option value="">Any stock level</option><option value="ok">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option>
          </select>
          <select className="input" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active products</option><option value="archived">Archived</option><option value="all">Active and archived</option>
          </select>
        </div>

        {list.loading && !list.data ? <Spinner /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> :
          list.data && list.data.length === 0 ? (
            filtered ? <EmptyState title="No products match these filters" hint="Try a different search or clear the filters."
              action={<Button onClick={() => { setSearch(""); setCategory(""); setStock(""); setStatus("active"); }}>Clear filters</Button>} />
              : <EmptyState title="No products yet" hint="Add your first product to start tracking stock." action={<Button variant="primary" onClick={() => setEditing("new")}>Add product</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse">
                <thead><tr>
                  <th className="th">Product</th><th className="th">Category</th><th className="th num">Stock</th>
                  <th className="th">Status</th><th className="th num">Threshold</th><th className="th num">Cost / Price</th>
                  <th className="th">Supplier</th><th className="th" aria-label="Actions" />
                </tr></thead>
                <tbody>
                  {list.data!.map((p) => (
                    <tr key={p.id} className={p.is_active ? "" : "bg-surface-soft/60 text-navy-500"}>
                      <td className="td"><p className="font-medium">{p.name} {p.is_sample && <Badge color="grey">Sample</Badge>}</p><p className="text-xs text-navy-500">{p.sku}</p></td>
                      <td className="td">{p.category}</td>
                      <td className="td num font-medium">{p.current_stock}</td>
                      <td className="td">{p.is_active ? <StockBadge status={p.stock_status} /> : <Badge>Archived</Badge>}</td>
                      <td className="td num">{p.reorder_threshold}</td>
                      <td className="td num whitespace-nowrap">{fmtMoney(p.cost_price)} / {fmtMoney(p.selling_price)}</td>
                      <td className="td">{p.supplier_name ?? <span className="text-navy-400">—</span>}</td>
                      <td className="td whitespace-nowrap text-right">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirm(p)}>{p.is_active ? "Archive" : "Restore"}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {editing && (
        <Modal wide title={editing === "new" ? "Add product" : `Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <ProductForm product={editing === "new" ? null : editing} categories={cats.data ?? []}
            onClose={() => setEditing(null)} onDone={() => { setEditing(null); refresh(); }} />
        </Modal>
      )}
      {confirm && (
        <ConfirmDialog danger={confirm.is_active} busy={busy} onCancel={() => setConfirm(null)} onConfirm={archiveOrRestore}
          title={confirm.is_active ? "Archive product?" : "Restore product?"} confirmLabel={confirm.is_active ? "Archive" : "Restore"}
          message={confirm.is_active
            ? <>“{confirm.name}” will be hidden from stock alerts, reorders and reports. Its history is kept and you can restore it any time.</>
            : <>“{confirm.name}” will return to your active catalogue.</>} />
      )}
    </>
  );
}
