import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useAvailability,
  useCreateBooking,
  useCustomers,
  useHalls,
  useSettings,
} from "../../api/hooks";
import { CHARGE_LABELS, type ChargeType, type Slot } from "../../api/types";
import { errorMessage } from "../../lib/api";
import { money } from "../../lib/format";
import { Button, Card, Field, inputClass, PageHeader } from "../../components/ui";

interface ChargeRow { chargeType: ChargeType; description: string; quantity: string; unitPrice: string }
interface FoodRow { name: string; urduName: string }

const CHARGE_TYPES = Object.keys(CHARGE_LABELS) as ChargeType[];

export function BookingCreatePage() {
  const navigate = useNavigate();
  const { data: halls } = useHalls();
  const { data: settings } = useSettings();
  const create = useCreateBooking();

  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const { data: customerResults } = useCustomers({ q: customerSearch || undefined });

  const [hallId, setHallId] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [slot, setSlot] = useState<Slot>("dinner");
  const [guests, setGuests] = useState("0");
  const [rackRate, setRackRate] = useState("0");
  const [discountedRate, setDiscountedRate] = useState("0");
  const [eventType, setEventType] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [remarks, setRemarks] = useState("");
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [foods, setFoods] = useState<FoodRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const availabilityEnabled = Boolean(hallId && eventDate && slot);
  const { data: availability } = useAvailability(
    { hallId: hallId ? Number(hallId) : undefined, date: eventDate || undefined, slot },
    availabilityEnabled,
  );

  const gstRate = Number(settings?.gstRate ?? 16);
  const totals = useMemo(() => {
    const headcharge = round2(Number(discountedRate) * Number(guests));
    const chargesTotal = round2(
      charges.reduce((a, c) => a + Number(c.quantity || 0) * Number(c.unitPrice || 0), 0),
    );
    const subtotal = round2(headcharge + chargesTotal);
    const gst = round2((subtotal * gstRate) / 100);
    const grand = round2(subtotal + gst);
    return { headcharge, chargesTotal, subtotal, gst, grand };
  }, [discountedRate, guests, charges, gstRate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!customerId) return setError("Select a customer first.");
    if (!hallId) return setError("Select a hall.");
    if (!eventDate) return setError("Pick an event date.");
    try {
      const res = await create.mutateAsync({
        customerId,
        hallId: Number(hallId),
        eventDate,
        slot,
        guests: Number(guests),
        rackRate: Number(rackRate),
        discountedRate: Number(discountedRate),
        eventType: eventType || null,
        startTime: startTime || null,
        endTime: endTime || null,
        remarks: remarks || null,
        charges: charges.map((c) => ({
          chargeType: c.chargeType,
          description: c.description || null,
          quantity: Number(c.quantity || 0),
          unitPrice: Number(c.unitPrice || 0),
        })),
        foods: foods.filter((f) => f.name.trim()).map((f, i) => ({ name: f.name, urduName: f.urduName || null, sort: i })),
      });
      navigate(`/bookings/${res.booking.id}`);
    } catch (err) {
      setError(errorMessage(err, "Could not create booking"));
    }
  };

  return (
    <div>
      <PageHeader title="New booking" icon="📅" />
      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <form onSubmit={submit} className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <h2 className="mb-3 font-semibold text-pearl-800">Event</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Customer *">
                <input
                  className={inputClass}
                  placeholder="Search name / phone…"
                  value={customerSearch}
                  onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId(null); }}
                />
                {customerSearch && !customerId && (
                  <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-pearl-100 bg-white text-sm">
                    {customerResults?.data.slice(0, 8).map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => { setCustomerId(c.id); setCustomerSearch(`${c.name} (${c.code})`); }}
                        className="block w-full px-3 py-1.5 text-left hover:bg-pearl-50"
                      >
                        {c.name} <span className="text-pearl-400">· {c.phone ?? c.code}</span>
                      </button>
                    ))}
                    {!customerResults?.data.length && <div className="px-3 py-1.5 text-pearl-400">No match</div>}
                  </div>
                )}
              </Field>
              <Field label="Hall *">
                <select className={inputClass} value={hallId} onChange={(e) => setHallId(e.target.value)}>
                  <option value="">Select hall…</option>
                  {halls?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </Field>
              <Field label="Event date *"><input type="date" className={inputClass} value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></Field>
              <Field label="Slot *">
                <select className={inputClass} value={slot} onChange={(e) => setSlot(e.target.value as Slot)}>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                </select>
              </Field>
              <Field label="Event type"><input className={inputClass} value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="Walima, Mehndi…" /></Field>
              <Field label="Guests"><input type="number" min={0} className={inputClass} value={guests} onChange={(e) => setGuests(e.target.value)} /></Field>
              <Field label="Rack rate / head"><input type="number" min={0} step="0.01" className={inputClass} value={rackRate} onChange={(e) => setRackRate(e.target.value)} /></Field>
              <Field label="Discounted rate / head"><input type="number" min={0} step="0.01" className={inputClass} value={discountedRate} onChange={(e) => setDiscountedRate(e.target.value)} /></Field>
              <Field label="Start time"><input className={inputClass} value={startTime} onChange={(e) => setStartTime(e.target.value)} placeholder="8:00 PM" /></Field>
              <Field label="End time"><input className={inputClass} value={endTime} onChange={(e) => setEndTime(e.target.value)} placeholder="12:00 AM" /></Field>
              <div className="sm:col-span-2">
                <Field label="Remarks">
                  <textarea className={inputClass} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any notes for this booking…" />
                </Field>
              </div>
            </div>
          </Card>

          <ChargesEditor charges={charges} setCharges={setCharges} />
          <FoodsEditor foods={foods} setFoods={setFoods} />
        </div>

        {/* Live totals + availability */}
        <div className="space-y-4">
          {availabilityEnabled && availability && (
            <Card className={availability.canConfirm ? "" : "ring-2 ring-red-200"}>
              <h2 className="mb-2 text-sm font-semibold uppercase text-pearl-400">Availability</h2>
              {availability.confirmedConflict ? (
                <p className="text-sm text-red-700">
                  ⚠ This slot is already <strong>confirmed</strong> by {availability.confirmedConflict.bookingNo}.
                  You can still save a tentative, but it cannot be confirmed.
                </p>
              ) : availability.tentativeOverlapCount > 0 ? (
                <p className="text-sm text-amber-700">
                  ⚠ {availability.tentativeOverlapCount} other tentative booking(s) overlap this slot.
                  First to pay wins.
                </p>
              ) : (
                <p className="text-sm text-green-700">✓ Slot is open.</p>
              )}
            </Card>
          )}

          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase text-pearl-400">Live totals</h2>
            <dl className="space-y-1.5 text-sm">
              <Line k="Head charge" v={money(totals.headcharge)} />
              <Line k="Other charges" v={money(totals.chargesTotal)} />
              <Line k="Subtotal" v={money(totals.subtotal)} />
              <Line k={`GST (${gstRate}%)`} v={money(totals.gst)} />
              <div className="my-2 border-t border-pearl-100" />
              <Line k="Grand total" v={money(totals.grand)} bold />
            </dl>
            <Button type="submit" className="mt-4 w-full" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create tentative booking"}
            </Button>
          </Card>
        </div>
      </form>
    </div>
  );
}

function ChargesEditor({ charges, setCharges }: { charges: ChargeRow[]; setCharges: React.Dispatch<React.SetStateAction<ChargeRow[]>> }) {
  const add = () => setCharges((c) => [...c, { chargeType: "hall_charges", description: "", quantity: "1", unitPrice: "0" }]);
  const update = (i: number, k: keyof ChargeRow, v: string) =>
    setCharges((rows) => rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const remove = (i: number) => setCharges((rows) => rows.filter((_, idx) => idx !== i));

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-pearl-800">Charges</h2>
        <Button type="button" variant="ghost" onClick={add}>+ Add charge</Button>
      </div>
      {!charges.length ? (
        <p className="text-sm text-pearl-400">No extra charges.</p>
      ) : (
        <div className="space-y-2">
          {charges.map((c, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <select className={inputClass + " col-span-3"} value={c.chargeType} onChange={(e) => update(i, "chargeType", e.target.value)}>
                {CHARGE_TYPES.map((t) => <option key={t} value={t}>{CHARGE_LABELS[t]}</option>)}
              </select>
              <input className={inputClass + " col-span-4"} placeholder="Description" value={c.description} onChange={(e) => update(i, "description", e.target.value)} />
              <input className={inputClass + " col-span-2"} type="number" min={0} placeholder="Qty" value={c.quantity} onChange={(e) => update(i, "quantity", e.target.value)} />
              <input className={inputClass + " col-span-2"} type="number" min={0} step="0.01" placeholder="Rate" value={c.unitPrice} onChange={(e) => update(i, "unitPrice", e.target.value)} />
              <button type="button" onClick={() => remove(i)} className="col-span-1 text-red-500 hover:text-red-700">✕</button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function FoodsEditor({ foods, setFoods }: { foods: FoodRow[]; setFoods: React.Dispatch<React.SetStateAction<FoodRow[]>> }) {
  const add = () => setFoods((f) => [...f, { name: "", urduName: "" }]);
  const update = (i: number, k: keyof FoodRow, v: string) =>
    setFoods((rows) => rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const remove = (i: number) => setFoods((rows) => rows.filter((_, idx) => idx !== i));

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-pearl-800">Menu (kitchen)</h2>
        <Button type="button" variant="ghost" onClick={add}>+ Add item</Button>
      </div>
      {!foods.length ? (
        <p className="text-sm text-pearl-400">No menu items.</p>
      ) : (
        <div className="space-y-2">
          {foods.map((f, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <input className={inputClass + " col-span-6"} placeholder="Item (English)" value={f.name} onChange={(e) => update(i, "name", e.target.value)} />
              <input className={inputClass + " col-span-5"} dir="rtl" placeholder="اردو نام" value={f.urduName} onChange={(e) => update(i, "urduName", e.target.value)} />
              <button type="button" onClick={() => remove(i)} className="col-span-1 text-red-500 hover:text-red-700">✕</button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Line({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-pearl-900" : "text-pearl-600"}`}>
      <span>{k}</span><span>{v}</span>
    </div>
  );
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
