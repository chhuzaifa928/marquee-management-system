import { useState } from "react";
import { Link } from "react-router-dom";
import { useCustomers, useCreateCustomer } from "../../api/hooks";
import { errorMessage } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { Button, Card, Field, inputClass, PageHeader } from "../../components/ui";

export function CustomersPage() {
  const [q, setQ] = useState("");
  const [cnic, setCnic] = useState("");
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading } = useCustomers({ q: q || undefined, cnic: cnic || undefined });

  return (
    <div>
      <PageHeader
        title="Customers"
        icon="👤"
        actions={<Button onClick={() => setShowForm((s) => !s)}>{showForm ? "Close" : "New customer"}</Button>}
      />

      {showForm && <NewCustomerForm onDone={() => setShowForm(false)} />}

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Search (name / phone / code)">
            <input className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" />
          </Field>
          <Field label="Exact CNIC (full 13 digits)">
            <input className={inputClass} value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="Exact match only" />
          </Field>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <p className="text-pearl-500">Loading…</p>
        ) : !data?.data.length ? (
          <p className="text-pearl-500">No customers found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-pearl-100 text-left text-pearl-500">
                <th className="py-2">Code</th>
                <th>Name</th>
                <th>Phone</th>
                <th>CNIC</th>
                <th>Since</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((c) => (
                <tr key={c.id} className="border-b border-pearl-50 hover:bg-pearl-50">
                  <td className="py-2 font-mono text-xs">{c.code}</td>
                  <td>
                    <Link to={`/customers/${c.id}`} className="font-medium text-pearl-700 hover:underline">
                      {c.name}
                    </Link>
                    {c.careOf && <span className="text-pearl-400"> · {c.careOf}</span>}
                  </td>
                  <td>{c.phone ?? "—"}</td>
                  <td className="font-mono text-xs">{c.cnicMasked ?? "—"}</td>
                  <td className="text-pearl-500">{fmtDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function NewCustomerForm({ onDone }: { onDone: () => void }) {
  const create = useCreateCustomer();
  const [form, setForm] = useState({ name: "", careOf: "", phone: "", cnic: "", email: "", address: "" });
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({
        name: form.name,
        careOf: form.careOf || null,
        phone: form.phone || null,
        cnic: form.cnic || null,
        email: form.email || null,
        address: form.address || null,
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err, "Could not create customer"));
    }
  };

  return (
    <Card className="mb-4">
      <h2 className="mb-3 font-semibold text-pearl-800">New customer</h2>
      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name *"><input className={inputClass} required value={form.name} onChange={set("name")} /></Field>
        <Field label="Care of (s/o, d/o, w/o)"><input className={inputClass} value={form.careOf} onChange={set("careOf")} /></Field>
        <Field label="Phone"><input className={inputClass} value={form.phone} onChange={set("phone")} /></Field>
        <Field label="CNIC (13 digits)"><input className={inputClass} value={form.cnic} onChange={set("cnic")} placeholder="35202-1234567-1" /></Field>
        <Field label="Email"><input className={inputClass} type="email" value={form.email} onChange={set("email")} /></Field>
        <Field label="Address"><input className={inputClass} value={form.address} onChange={set("address")} /></Field>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>{create.isPending ? "Saving…" : "Save customer"}</Button>
        </div>
      </form>
    </Card>
  );
}
