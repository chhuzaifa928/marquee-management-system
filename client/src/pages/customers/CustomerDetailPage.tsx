import { Link, useParams } from "react-router-dom";
import { useCustomerSummary } from "../../api/hooks";
import { fmtDate, money } from "../../lib/format";
import { Card, PageHeader, StatusBadge } from "../../components/ui";

export function CustomerDetailPage() {
  const { id } = useParams();
  const customerId = Number(id);
  const { data, isLoading } = useCustomerSummary(customerId);

  if (isLoading) return <p className="text-pearl-500">Loading…</p>;
  if (!data) return <p className="text-pearl-500">Customer not found.</p>;

  const { customer, stats, bookings } = data;

  return (
    <div>
      <PageHeader title={customer.name} icon="👤" actions={<Link to="/customers" className="text-sm text-pearl-600 hover:underline">← All customers</Link>} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-2 text-sm font-semibold uppercase text-pearl-400">Details</h2>
          <dl className="space-y-1 text-sm">
            <Row k="Code" v={customer.code} />
            <Row k="Care of" v={customer.careOf ?? "—"} />
            <Row k="Phone" v={customer.phone ?? "—"} />
            <Row k="CNIC" v={customer.cnicMasked ?? "—"} />
            <Row k="Email" v={customer.email ?? "—"} />
            <Row k="Address" v={customer.address ?? "—"} />
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase text-pearl-400">Total business</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Bookings" value={String(stats.bookingsCount)} />
            <Stat label="Total business" value={money(stats.totalBusiness)} />
            <Stat label="Paid" value={money(stats.totalPaid)} />
            <Stat label="Outstanding" value={money(stats.totalDue)} />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 text-sm font-semibold uppercase text-pearl-400">Bookings</h2>
        {!bookings.length ? (
          <p className="text-pearl-500">No bookings yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-pearl-100 text-left text-pearl-500">
                <th className="py-2">Booking</th><th>Hall</th><th>Date</th><th>Slot</th><th>Status</th>
                <th className="text-right">Total</th><th className="text-right">Due</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-b border-pearl-50 hover:bg-pearl-50">
                  <td className="py-2"><Link to={`/bookings/${b.id}`} className="font-mono text-xs text-pearl-700 hover:underline">{b.bookingNo}</Link></td>
                  <td>{b.hall}</td>
                  <td>{fmtDate(b.eventDate)}</td>
                  <td className="capitalize">{b.slot}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td className="text-right">{money(b.grandTotal)}</td>
                  <td className="text-right">{money(b.due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-pearl-400">{k}</dt>
      <dd className="text-right font-medium text-pearl-800">{v}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-pearl-50 p-3">
      <div className="text-xs text-pearl-400">{label}</div>
      <div className="mt-1 font-semibold text-pearl-900">{value}</div>
    </div>
  );
}
