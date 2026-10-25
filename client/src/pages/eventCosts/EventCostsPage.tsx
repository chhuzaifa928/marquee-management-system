import { useState } from "react";
import {
  useAccounts,
  useBookings,
  useEventCostMutation,
  useEventCosts,
  useInventory,
  usePaymentAccounts,
  useVendors,
} from "../../api/hooks";
import { useAuth } from "../../auth/AuthContext";
import { errorMessage } from "../../lib/api";
import { money } from "../../lib/format";
import { Button, Card, Field, inputClass, PageHeader } from "../../components/ui";

export function EventCostsPage() {
  const { user } = useAuth();
  const canEnter = user?.roles.some((r) => ["accounts", "super_admin"].includes(r)) ?? false;
  const isSuper = user?.roles.includes("super_admin") ?? false;
  const [bookingId, setBookingId] = useState<number | null>(null);
  const { data: bookings } = useBookings({ status: "paid", take: 50 });
  const { data: summary } = useEventCosts(bookingId);
  const { create, remove } = useEventCostMutation();

  return (
    <div>
      <PageHeader title="Event Costs & Profitability" icon="🧾" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-2 text-sm font-semibold uppercase text-pearl-400">Paid events</h2>
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {bookings?.data.map((b) => (
              <button key={b.id} onClick={() => setBookingId(b.id)} className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-pearl-50 ${bookingId === b.id ? "bg-pearl-100" : ""}`}>
                <span className="font-mono text-xs">{b.bookingNo}</span> · {b.customer}
              </button>
            ))}
            {!bookings?.data.length && <p className="text-sm text-pearl-400">No fully-paid bookings yet.</p>}
          </div>
        </Card>

        <div className="lg:col-span-2">
          {!summary ? (
            <Card><p className="text-pearl-500">Select a paid event to record costs and see net profit.</p></Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <Stat label="Grand total (income)" value={money(summary.grandTotal)} />
                  <Stat label="Total cost" value={money(summary.totalCost)} />
                  <Stat label="Net profit" value={money(summary.netProfit)} highlight />
                </div>
              </Card>

              {canEnter && <AddCostForm bookingId={summary.bookingId} onAdd={(body) => create.mutate({ bookingId: summary.bookingId, body })} />}

              <Card>
                <h2 className="mb-3 font-semibold text-pearl-800">Recorded costs</h2>
                {!summary.costs.length ? <p className="text-sm text-pearl-400">No costs yet.</p> : (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-pearl-100 text-left text-pearl-500"><th className="py-2">Type</th><th>Detail</th><th>Voucher</th><th className="text-right">Amount</th>{isSuper && <th />}</tr></thead>
                    <tbody>
                      {summary.costs.map((c: any) => (
                        <tr key={c.id} className="border-b border-pearl-50">
                          <td className="py-1.5 capitalize">{c.costType}</td>
                          <td>{c.vendor ?? c.inventoryItem ?? c.description ?? "—"}{c.quantity && <span className="text-pearl-400"> × {c.quantity}</span>}</td>
                          <td className="font-mono text-xs text-pearl-500">{c.voucherNo}</td>
                          <td className="text-right font-medium">{money(c.amount)}</td>
                          {isSuper && <td className="text-right"><button onClick={() => { if (confirm("Delete this cost? Reverses its voucher.")) remove.mutate(c.id); }} className="text-red-500">✕</button></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddCostForm({ onAdd }: { bookingId: number; onAdd: (body: Record<string, unknown>) => void }) {
  const [costType, setCostType] = useState<"vendor" | "inventory" | "misc">("vendor");
  const [form, setForm] = useState<Record<string, string>>({ amount: "", description: "", vendorId: "", paidFromAccountId: "", expenseAccountId: "", inventoryItemId: "", quantity: "" });
  const [error, setError] = useState<string | null>(null);
  const { data: vendors } = useVendors();
  const { data: items } = useInventory(false);
  const { data: cashBank } = usePaymentAccounts();
  const { data: accounts } = useAccounts(false);
  const expenseAccounts = (accounts ?? []).filter((a) => a.type === "expense");

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    const body: Record<string, unknown> = { costType, description: form.description || null };
    try {
      if (costType === "vendor") { body.vendorId = Number(form.vendorId); body.expenseAccountId = form.expenseAccountId ? Number(form.expenseAccountId) : undefined; body.amount = Number(form.amount); }
      else if (costType === "misc") { body.paidFromAccountId = Number(form.paidFromAccountId); body.expenseAccountId = form.expenseAccountId ? Number(form.expenseAccountId) : undefined; body.amount = Number(form.amount); }
      else { body.inventoryItemId = Number(form.inventoryItemId); body.quantity = Number(form.quantity); if (form.amount) body.amount = Number(form.amount); }
      onAdd(body);
      setForm({ amount: "", description: "", vendorId: "", paidFromAccountId: "", expenseAccountId: "", inventoryItemId: "", quantity: "" });
    } catch (err) { setError(errorMessage(err)); }
  };

  return (
    <Card>
      <h2 className="mb-3 font-semibold text-pearl-800">Add cost</h2>
      {error && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mb-3 flex gap-2">
        {(["vendor", "inventory", "misc"] as const).map((t) => (
          <button key={t} onClick={() => setCostType(t)} className={`rounded-full px-3 py-1 text-xs capitalize ${costType === t ? "bg-pearl-600 text-white" : "bg-pearl-100 text-pearl-700"}`}>{t}</button>
        ))}
      </div>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {costType === "vendor" && (
          <>
            <Field label="Vendor"><select className={inputClass} value={form.vendorId} onChange={(e) => set("vendorId", e.target.value)}><option value="">Select…</option>{vendors?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
            <Field label="Expense head"><select className={inputClass} value={form.expenseAccountId} onChange={(e) => set("expenseAccountId", e.target.value)}><option value="">Event Consumables (default)</option>{expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></Field>
            <Field label="Amount"><input type="number" step="0.01" className={inputClass} value={form.amount} onChange={(e) => set("amount", e.target.value)} /></Field>
          </>
        )}
        {costType === "misc" && (
          <>
            <Field label="Paid from"><select className={inputClass} value={form.paidFromAccountId} onChange={(e) => set("paidFromAccountId", e.target.value)}><option value="">Select…</option>{cashBank?.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></Field>
            <Field label="Expense head"><select className={inputClass} value={form.expenseAccountId} onChange={(e) => set("expenseAccountId", e.target.value)}><option value="">Event Consumables (default)</option>{expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></Field>
            <Field label="Amount"><input type="number" step="0.01" className={inputClass} value={form.amount} onChange={(e) => set("amount", e.target.value)} /></Field>
          </>
        )}
        {costType === "inventory" && (
          <>
            <Field label="Item"><select className={inputClass} value={form.inventoryItemId} onChange={(e) => set("inventoryItemId", e.target.value)}><option value="">Select…</option>{items?.map((i) => <option key={i.id} value={i.id}>{i.code} {i.name} ({i.qtyOnHand})</option>)}</select></Field>
            <Field label="Quantity consumed"><input type="number" step="0.01" className={inputClass} value={form.quantity} onChange={(e) => set("quantity", e.target.value)} /></Field>
            <Field label="Amount (blank = qty × unit cost)"><input type="number" step="0.01" className={inputClass} value={form.amount} onChange={(e) => set("amount", e.target.value)} /></Field>
          </>
        )}
        <div className="sm:col-span-2"><Field label="Description"><input className={inputClass} value={form.description} onChange={(e) => set("description", e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Button type="submit">Add cost (posts voucher)</Button></div>
      </form>
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return <div className={`rounded-lg p-3 ${highlight ? "bg-pearl-100" : "bg-pearl-50"}`}><div className="text-xs text-pearl-400">{label}</div><div className="mt-1 font-semibold text-pearl-900">{value}</div></div>;
}
