import { useState } from "react";
import { Link } from "react-router-dom";
import { useBookings, useHalls } from "../../api/hooks";
import { fmtDate, money } from "../../lib/format";
import { Button, Card, inputClass, PageHeader, StatusBadge } from "../../components/ui";

const STATUSES = ["", "tentative", "booked", "paid", "cancelled"];

export function BookingsPage() {
  const [hallId, setHallId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const { data: halls } = useHalls();
  const { data, isLoading } = useBookings({
    hallId: hallId || undefined,
    status: status || undefined,
  });

  return (
    <div>
      <PageHeader
        title="Bookings"
        icon="📅"
        actions={
          <div className="flex gap-2">
            <Link to="/bookings/calendar"><Button variant="ghost">Calendar</Button></Link>
            <Link to="/bookings/new"><Button>New booking</Button></Link>
          </div>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap gap-3">
          <select className={inputClass + " max-w-xs"} value={hallId} onChange={(e) => setHallId(e.target.value)}>
            <option value="">All halls</option>
            {halls?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <select className={inputClass + " max-w-xs"} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s === "" ? "All statuses" : s}</option>)}
          </select>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <p className="text-pearl-500">Loading…</p>
        ) : !data?.data.length ? (
          <p className="text-pearl-500">No bookings.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-pearl-100 text-left text-pearl-500">
                <th className="py-2">Booking</th><th>Host</th><th>Hall</th><th>Date</th><th>Slot</th>
                <th className="text-right">Guests</th><th>Status</th>
                <th className="text-right">Total</th><th className="text-right">Due</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((b) => (
                <tr key={b.id} className="border-b border-pearl-50 hover:bg-pearl-50">
                  <td className="py-2"><Link to={`/bookings/${b.id}`} className="font-mono text-xs text-pearl-700 hover:underline">{b.bookingNo}</Link></td>
                  <td>{b.customer}</td>
                  <td>{b.hall}</td>
                  <td>{fmtDate(b.eventDate)}</td>
                  <td className="capitalize">{b.slot}</td>
                  <td className="text-right">{b.guests}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td className="text-right">{money(b.grandTotal)}</td>
                  <td className="text-right font-medium">{money(b.due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
