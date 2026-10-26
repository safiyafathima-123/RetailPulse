import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../lib/api";

const NAV = [
  { to: "/", label: "Dashboard", icon: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" },
  { to: "/products", label: "Products", icon: "M21 8l-9-5-9 5v8l9 5 9-5V8zM3.3 7.7L12 12.5l8.7-4.8M12 12.5V21" },
  { to: "/inventory", label: "Inventory & Sales", icon: "M4 6h16M4 12h16M4 18h10" },
  { to: "/alerts", label: "Stock Alerts", icon: "M12 3l10 18H2L12 3zm0 7v5m0 3v.01" },
  { to: "/reorder", label: "Reorder Recommendations", icon: "M4 4v6h6M20 20v-6h-6M20 10A8 8 0 006.3 5.3L4 10m16 4l-2.3 4.7A8 8 0 014 14" },
  { to: "/reports", label: "Reports", icon: "M7 3h8l4 4v14H7V3zm8 0v4h4M10 13h6M10 17h6" },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#0F2A43" />
        <path d="M5 17h5l3-8 5 15 3-9 2 2h4" fill="none" stroke="#2DB8BA" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-base font-semibold tracking-tight text-navy-950">RetailPulse</span>
    </div>
  );
}

function SideNav({ onNavigate, sample }: { onNavigate?: () => void; sample: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5"><Logo /></div>
      <nav className="flex-1 space-y-0.5 px-3" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} onClick={onNavigate}
            className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? "bg-teal-50 text-teal-700" : "text-navy-700 hover:bg-surface-soft"}`}>
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={n.icon} /></svg>
            {n.label}
          </NavLink>
        ))}
      </nav>
      {sample && (
        <p className="m-3 rounded-md bg-surface-soft p-3 text-xs leading-relaxed text-navy-500">
          Sample data is loaded so you can explore. Items marked <b className="text-navy-700">Sample</b> are demo records.
        </p>
      )}
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const [sample, setSample] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => { api.products({ status: "all" }).then((p) => setSample(p.some((x) => (x as { is_sample?: boolean }).is_sample))).catch(() => {}); }, [pathname]);
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-surface-line bg-white lg:block">
        <SideNav sample={sample} />
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-surface-line bg-white px-4 py-3 lg:hidden">
        <Logo />
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-md border border-surface-line p-2 text-navy-700">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-navy-950/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white shadow-xl">
            <SideNav sample={sample} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-6xl"><Outlet /></div>
      </main>
    </div>
  );
}
