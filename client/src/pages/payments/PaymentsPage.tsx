import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useBooking,
  useBookings,
  useCreateSlip,
  useDeleteSlip,
  usePaymentAccounts,
  useSlips,
} from "../../api/hooks";
import { useAuth } from "../../auth/AuthContext";
import { errorMessage } from "../../lib/api";
import { fmtDate, money } from "../../lib/format";
import { Button, Card, Field, inputClass, PageHeader, StatusBadge } from "../../components/ui";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

export function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const preselected = params.get("bookingId");
  const [bookingId, setBookingId] = useState<number | null>(
    preselected ? Number(preselected) : null,
  );
  const [search, setSearch] = useState("");
  const { data: bookingList } = useBookings({ take: 20 });
  const { data: booking } = useBooking(bookingId);

  const filtered = useMemo(() => {
    const rows = bookingList?.data ?? [];
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (b) => b.bookingNo.toLowerCase().includes(q) || b.customer.toLowerCase().includes(q),
    );
  }, [bookingList, search]);

  return (
    <div>
      <PageHeader title="Payments" icon="💳" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase text-pearl-400">Choose booking</h2>
          <input
            className={inputClass}
            placeholder="Search booking no / host…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="mt-2 max-h-80 space-y-1 overflow-y-auto">
            {filtered.map((b) => (
              <button
                key={b.id}
                onClick={() => { setBookingId(b.id); setParams({ bookingId: String(b.id) }); }}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-pearl-50 ${
                  bookingId === b.id ? "bg-pearl-100" : ""
                }`}
              >
                <div className="flex justify-between">
                  <span className="font-mono text-xs">{b.bookingNo}</span>
                  <StatusBadge status={b.status} />
                </div>
                <div className="text-pearl-600">{b.customer}</div>
                <div className="text-xs text-pearl-400">Due {money(b.due)}</div>
              </button>
            ))}
            {!filtered.length && <p className="text-sm text-pearl-400">No bookings.</p>}
          </div>
        </Card>

        <div className="lg:col-span-2">
          {!bookingId || !booking ? (
            <Card><p className="text-pearl-500">Select a booking to record a payment.</p></Card>
          ) : (
            <PaymentPanel bookingId={bookingId} />
          )}
        </div>
      </div>
    </div>
  );
}

function PaymentPanel({ bookingId }: { bookingId: number }) {
  const { user } = useAuth();
  const isSuper = user?.roles.includes("super_admin");
  const { data: booking } = useBooking(bookingId);
  const { data: accounts } = usePaymentAccounts();
  const { data: slips } = useSlips(bookingId);
  const createSlip = useCreateSlip();

  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!booking) return null;
  const locked = booking.status === "paid" || booking.isLocked;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!accountId) return setError("Pick the account the money was received into.");
    try {
      await createSlip.mutateAsync({
        bookingId,
        accountId: Number(accountId),
        amount: Number(amount),
        method,
        reference: reference || null,
      });
      setAmount(""); setReference("");
    } catch (err) {
      setError(errorMessage(err, "Could not record payment"));
    }
  };

  let running = 0;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-sm text-pearl-500">{booking.bookingNo}</div>
            <div className="text-lg font-semibold text-pearl-900">{booking.customer.name}</div>
          </div>
          <StatusBadge status={booking.status} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <Stat label="Grand total" value={money(booking.totals.grandTotal)} />
          <Stat label="Advance" value={money(booking.totals.advanceTotal)} />
          <Stat label="Balance due" value={money(booking.totals.due)} highlight />
        </div>
      </Card>

      {!locked ? (
        <Card>
          <h2 className="mb-3 font-semibold text-pearl-800">Record payment</h2>
          {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Amount *"><input className={inputClass} type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
            <Field label="Received into *">
              <select className={inputClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Select account…</option>
                {accounts?.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </select>
            </Field>
            <Field label="Method">
              <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cheque">Cheque</option>
                <option value="card">Card</option>
              </select>
            </Field>
            <Field label="Reference"><input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque no, txn id…" /></Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={createSlip.isPending}>
                {createSlip.isPending ? "Posting…" : "Record payment"}
              </Button>
              <span className="ml-3 text-xs text-pearl-400">Posts a Receipt Voucher (RV) automatically.</span>
            </div>
          </form>
        </Card>
      ) : (
        <Card><p className="text-sm text-green-700">✓ This booking is fully paid and locked.</p></Card>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-pearl-800">Payment slips</h2>
          <a href={`${API_BASE}/bookings/${bookingId}/pdf/advance-receipt`} target="_blank" rel="noreferrer">
            <Button variant="ghost">Advance Receipt PDF</Button>
          </a>
        </div>
        {!slips?.data.length ? (
          <p className="text-sm text-pearl-400">No payments yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-pearl-100 text-left text-pearl-500">
                <th className="py-2">Slip</th><th>Date</th><th>Method</th><th>Voucher</th>
                <th className="text-right">Amount</th><th className="text-right">Running</th>
                {isSuper && <th />}
              </tr>
            </thead>
            <tbody>
              {slips.data.map((s) => {
                running += Number(s.amount);
                return (
                  <tr key={s.id} className="border-b border-pearl-50">
                    <td className="py-1.5 font-mono text-xs">{s.slipNo}</td>
                    <td>{fmtDate(s.date)}</td>
                    <td className="capitalize">{s.method.replace("_", " ")}</td>
                    <td className="font-mono text-xs text-pearl-500">{s.voucherNo}</td>
                    <td className="text-right">{money(s.amount)}</td>
                    <td className="text-right font-medium">{money(running)}</td>
                    {isSuper && <td className="text-right"><DeleteSlip id={s.id} /></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function DeleteSlip({ id }: { id: number }) {
  const del = useDeleteSlip();
  return (
    <button
      onClick={() => { if (confirm("Delete this slip? This reverses its voucher.")) del.mutate(id); }}
      className="text-red-500 hover:text-red-700"
      title="Delete (super admin)"
    >
      ✕
    </button>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-pearl-100" : "bg-pearl-50"}`}>
      <div className="text-xs text-pearl-400">{label}</div>
      <div className="mt-1 font-semibold text-pearl-900">{value}</div>
    </div>
  );
}
