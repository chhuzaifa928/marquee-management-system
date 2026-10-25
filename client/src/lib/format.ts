export function money(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return `Rs ${n.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  return d.toISOString().slice(0, 10);
}

export const STATUS_COLORS: Record<string, string> = {
  tentative: "bg-amber-100 text-amber-800",
  booked: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  cancelled: "bg-gray-200 text-gray-600 line-through",
};
