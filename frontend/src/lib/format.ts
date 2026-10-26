const CURRENCY = (import.meta.env.VITE_CURRENCY as string | undefined) ?? "INR";
const LOCALE = (import.meta.env.VITE_LOCALE as string | undefined) ?? "en-IN";

const money = new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY, maximumFractionDigits: 2 });
const moneyWhole = new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY, maximumFractionDigits: 0 });
const int = new Intl.NumberFormat(LOCALE);

export const fmtMoney = (n: number, whole = false) => (whole ? moneyWhole : money).format(n);
export const fmtInt = (n: number) => int.format(n);
export const fmtDemand = (n: number) => n.toLocaleString(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const fmtDateTime = (iso: string) =>
  new Date(iso + "Z").toLocaleString(LOCALE, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const fmtDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const daysAgoISO = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
