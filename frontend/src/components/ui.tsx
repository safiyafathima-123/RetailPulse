import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { AlertType, MovementType, StockStatus } from "../lib/api";

/* ---------- Button ---------- */
type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-teal-600 text-white hover:bg-teal-700 disabled:bg-teal-600/50",
  secondary: "border border-surface-line bg-white text-navy-900 hover:bg-surface-soft disabled:text-navy-400",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50",
  ghost: "text-navy-700 hover:bg-surface-soft disabled:text-navy-400",
};
export function Button({ variant = "secondary", size = "md", className = "", ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed
      ${size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm"} ${variants[variant]} ${className}`}
    />
  );
}

/* ---------- Badges ---------- */
const tone = {
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  grey: "bg-surface-soft text-navy-700 ring-surface-line",
  teal: "bg-teal-50 text-teal-700 ring-teal-100",
};
export function Badge({ children, color = "grey" }: { children: ReactNode; color?: keyof typeof tone }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone[color]}`}>{children}</span>;
}
export const StockBadge = ({ status }: { status: StockStatus }) =>
  status === "out" ? <Badge color="red">Out of stock</Badge> : status === "low" ? <Badge color="amber">Low stock</Badge> : <Badge color="green">In stock</Badge>;
export const AlertBadge = ({ type }: { type: AlertType }) => {
  const map = { out: ["red", "Out of stock"], low: ["amber", "Low stock"], slow: ["blue", "Slow-moving"], excess: ["blue", "Excess stock"] } as const;
  return <Badge color={map[type][0]}>{map[type][1]}</Badge>;
};
export const MovementBadge = ({ type }: { type: MovementType }) =>
  type === "sale" ? <Badge color="teal">Sale</Badge> : type === "restock" ? <Badge color="green">Restock</Badge> : <Badge color="grey">Adjustment</Badge>;

/* ---------- Layout bits ---------- */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-xl text-sm text-navy-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-navy-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
      {label}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="font-medium text-navy-900">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-navy-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="px-6 py-12 text-center">
      <p className="font-medium text-red-700">Couldn’t load this data</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-navy-500">{message}</p>
      {onRetry && <Button className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Banner({ kind, children }: { kind: "error" | "info"; children: ReactNode }) {
  return (
    <div role={kind === "error" ? "alert" : "status"}
      className={`rounded-md border px-3 py-2 text-sm ${kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-teal-100 bg-teal-50 text-teal-700"}`}>
      {children}
    </div>
  );
}

/* ---------- Form fields ---------- */
export function Field({ label, hint, error, children, htmlFor }:
  { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-navy-900">{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : hint ? <p className="mt-1 text-xs text-navy-500">{hint}</p> : null}
    </div>
  );
}

/* ---------- Modal + confirm ---------- */
export function Modal({ title, onClose, children, wide = false }:
  { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-xl sm:rounded-xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}>
        <div className="flex items-center justify-between border-b border-surface-line px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-navy-500 hover:bg-surface-soft">✕</button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, danger, busy, onConfirm, onCancel }:
  { title: string; message: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-navy-700">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</Button>
      </div>
    </Modal>
  );
}

/* ---------- Toasts ---------- */
type Toast = { id: number; kind: "success" | "error"; message: string };
const ToastCtx = createContext<(kind: Toast["kind"], message: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-lg ${t.kind === "success" ? "border-emerald-200 bg-white text-navy-900" : "border-red-200 bg-white text-red-800"}`}>
            <span className={`mr-2 font-semibold ${t.kind === "success" ? "text-emerald-600" : "text-red-600"}`}>{t.kind === "success" ? "Done" : "Error"}</span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Stat ---------- */
export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: "red" | "amber" }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-navy-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent === "red" ? "text-red-700" : accent === "amber" ? "text-amber-700" : "text-navy-950"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-navy-500">{sub}</p>}
    </div>
  );
}
