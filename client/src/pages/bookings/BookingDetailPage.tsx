import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useBooking, useBookingMutation } from "../../api/hooks";
import { CHARGE_LABELS, type ChargeType } from "../../api/types";
import { fmtDate, money } from "../../lib/format";
import { Button, Card, inputClass, PageHeader, StatusBadge } from "../../components/ui";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const CHARGE_TYPES = Object.keys(CHARGE_LABELS) as ChargeType[];

const PDF_DOCS: { key: string; label: string }[] = [
  { key: "booking-sheet", label: "Booking Sheet" },
  { key: "kitchen-voucher", label: "Kitchen Voucher" },
  { key: "invoice", label: "Invoice" },
  { key: "advance-receipt", label: "Advance Receipt" },
];

export function BookingDetailPage() {
  const { id } = useParams();
  const bookingId = Number(id);
  const { data: b, isLoading } = useBooking(bookingId);
  const { addCharge, removeCharge, setFoods, cancel } = useBookingMutation();

  if (isLoading) return <p className="text-pearl-500">Loading…</p>;
  if (!b) return <p className="text-pearl-500">Booking not found.</p>;

  const editable = !b.isLocked && (b.status === "tentative" || b.status === "booked");

  return (
    <div>
      <PageHeader
        title={b.bookingNo}
        icon="📅"
        actions={<Link to="/bookings" className="text-sm text-pearl-600 hover:underline">← All bookings</Link>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold text-pearl-900">{b.customer.name}</div>
                <div className="text-sm text-pearl-500">{b.customer.phone ?? b.customer.code}</div>
              </div>
              <StatusBadge status={b.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Info k="Hall" v={b.hall.name} />
              <Info k="Date" v={`${fmtDate(b.eventDate)} (${b.slot})`} />
              <Info k="Timing" v={[b.startTime, b.endTime].filter(Boolean).join(" – ") || "—"} />
              <Info k="Event type" v={b.eventType ?? "—"} />
              <Info k="Guests" v={String(b.guests)} />
              <Info k="Rate / head" v={money(b.discountedRate)} />
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-pearl-800">Charges</h2>
            </div>
            {b.charges.length ? (
              <table className="w-full text-sm">
                <tbody>
                  {b.charges.map((c) => (
                    <tr key={c.id} className="border-b border-pearl-50">
                      <td className="py-1.5">{CHARGE_LABELS[c.chargeType]}</td>
                      <td className="text-pearl-500">{c.description}</td>
                      <td className="text-right">{c.quantity} × {money(c.unitPrice)}</td>
                      <td className="text-right font-medium">{money(c.amount)}</td>
                      <td className="w-8 text-right">
                        {editable && (
                          <button onClick={() => removeCharge.mutate({ id: b.id, chargeId: c.id })} className="text-red-500 hover:text-red-700">✕</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-pearl-400">No charges.</p>
            )}
            {editable && <AddChargeInline bookingId={b.id} onAdd={(body) => addCharge.mutate({ id: b.id, body })} />}
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold text-pearl-800">Menu</h2>
            {b.foods.length ? (
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {b.foods.map((f) => (
                  <li key={f.id}>
                    {f.name}{f.urduName && <span dir="rtl" className="text-pearl-500"> — {f.urduName}</span>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-pearl-400">No menu items.</p>
            )}
            {editable && <EditFoodsInline current={b.foods} onSave={(foods) => setFoods.mutate({ id: b.id, foods })} />}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase text-pearl-400">Totals</h2>
            <dl className="space-y-1.5 text-sm">
              <Line k="Head charge" v={money(b.totals.headchargeTotal)} />
              <Line k="Other charges" v={money(b.totals.chargesTotal)} />
              <Line k="Subtotal" v={money(b.totals.subtotal)} />
              <Line k={`GST (${b.gstRate}%)`} v={money(b.totals.gstAmount)} />
              <div className="my-1 border-t border-pearl-100" />
              <Line k="Grand total" v={money(b.totals.grandTotal)} bold />
              <Line k="Advance" v={money(b.totals.advanceTotal)} />
              <Line k="Balance due" v={money(b.totals.due)} bold />
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase text-pearl-400">Documents</h2>
            <div className="grid grid-cols-2 gap-2">
              {PDF_DOCS.map((d) => (
                <a key={d.key} href={`${API_BASE}/bookings/${b.id}/pdf/${d.key}`} target="_blank" rel="noreferrer">
                  <Button variant="ghost" className="w-full">{d.label}</Button>
                </a>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase text-pearl-400">Actions</h2>
            <Link to={`/payments?bookingId=${b.id}`}>
              <Button className="mb-2 w-full">Record payment</Button>
            </Link>
            {editable && (
              <Button
                variant="danger"
                className="w-full"
                onClick={() => { if (confirm("Cancel this booking?")) cancel.mutate(b.id); }}
              >
                Cancel booking
              </Button>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function AddChargeInline({ onAdd }: { bookingId: number; onAdd: (body: Record<string, unknown>) => void }) {
  const [chargeType, setChargeType] = useState<ChargeType>("hall_charges");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("0");
  return (
    <div className="mt-3 grid grid-cols-12 gap-2 border-t border-pearl-100 pt-3">
      <select className={inputClass + " col-span-3"} value={chargeType} onChange={(e) => setChargeType(e.target.value as ChargeType)}>
        {CHARGE_TYPES.map((t) => <option key={t} value={t}>{CHARGE_LABELS[t]}</option>)}
      </select>
      <input className={inputClass + " col-span-3"} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
      <input className={inputClass + " col-span-2"} type="number" placeholder="Qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      <input className={inputClass + " col-span-2"} type="number" step="0.01" placeholder="Rate" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
      <Button
        type="button"
        className="col-span-2"
        onClick={() => onAdd({ chargeType, description: description || null, quantity: Number(quantity), unitPrice: Number(unitPrice) })}
      >
        Add
      </Button>
    </div>
  );
}

function EditFoodsInline({ current, onSave }: { current: { name: string; urduName: string | null }[]; onSave: (foods: unknown[]) => void }) {
  const [rows, setRows] = useState(current.map((f) => ({ name: f.name, urduName: f.urduName ?? "" })));
  const add = () => setRows((r) => [...r, { name: "", urduName: "" }]);
  const update = (i: number, k: "name" | "urduName", v: string) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));
  const remove = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  return (
    <div className="mt-3 border-t border-pearl-100 pt-3">
      <div className="space-y-2">
        {rows.map((f, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <input className={inputClass + " col-span-6"} placeholder="Item (English)" value={f.name} onChange={(e) => update(i, "name", e.target.value)} />
            <input className={inputClass + " col-span-5"} dir="rtl" placeholder="اردو نام" value={f.urduName} onChange={(e) => update(i, "urduName", e.target.value)} />
            <button type="button" onClick={() => remove(i)} className="col-span-1 text-red-500">✕</button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Button type="button" variant="ghost" onClick={add}>+ Item</Button>
        <Button type="button" onClick={() => onSave(rows.filter((r) => r.name.trim()).map((r, i) => ({ name: r.name, urduName: r.urduName || null, sort: i })))}>
          Save menu
        </Button>
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-pearl-400">{k}</div>
      <div className="font-medium text-pearl-800">{v}</div>
    </div>
  );
}

function Line({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-pearl-900" : "text-pearl-600"}`}>
      <span>{k}</span><span>{v}</span>
    </div>
  );
}
