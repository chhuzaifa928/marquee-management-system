import type { ReactNode } from "react";
import { STATUS_COLORS } from "../lib/format";

export function PageHeader({
  title,
  icon,
  actions,
}: {
  title: string;
  icon?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <h1 className="flex items-center gap-2 text-2xl font-semibold text-pearl-900">
        {icon && <span aria-hidden>{icon}</span>}
        {title}
      </h1>
      {actions}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-white p-5 shadow-sm ring-1 ring-pearl-100 ${className}`}>
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  const styles = {
    primary: "bg-pearl-600 text-white hover:bg-pearl-700",
    ghost: "bg-pearl-100 text-pearl-800 hover:bg-pearl-200",
    danger: "bg-red-600 text-white hover:bg-red-700",
  }[variant];
  return (
    <button
      {...props}
      className={`rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${styles} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-pearl-700">{label}</span>
      <div className="mt-1">{children}</div>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-pearl-200 px-3 py-2 text-sm focus:border-pearl-500 focus:outline-none";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium capitalize ${
        STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {status}
    </span>
  );
}
