import { useState } from "react";
import { useVendors, useVendorMutation } from "../../api/hooks";
import { useAuth } from "../../auth/AuthContext";
import { errorMessage } from "../../lib/api";
import { money } from "../../lib/format";
import { Button, Card, Field, inputClass, PageHeader } from "../../components/ui";

export function VendorsPage() {
  const { user } = useAuth();
  const canWrite = user?.roles.some((r) => ["admin", "super_admin"].includes(r)) ?? false;
  const { data } = useVendors();
  const { create } = useVendorMutation();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", phone: "", email: "", address: "", notes: "", openingBalance: "0" });
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try { await create.mutateAsync({ ...form, openingBalance: Number(form.openingBalance) }); setShow(false); setForm({ name: "", company: "", phone: "", email: "", address: "", notes: "", openingBalance: "0" }); }
    catch (err) { setError(errorMessage(err)); }
  };

  return (
    <div>
      <PageHeader title="Vendors & Suppliers" icon="🤝" actions={canWrite && <Button onClick={() => setShow((s) => !s)}>{show ? "Close" : "New vendor"}</Button>} />
      {show && (
        <Card className="mb-4">
          {error && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <p className="mb-3 text-xs text-pearl-400">A linked supplier payable account is created automatically.</p>
          <form onSubmit={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Name"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Company"><input className={inputClass} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
            <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email"><input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Opening balance"><input type="number" step="0.01" className={inputClass} value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} /></Field>
            <div className="col-span-full"><Field label="Address"><input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field></div>
            <div className="col-span-full"><Button type="submit">Save vendor</Button></div>
          </form>
        </Card>
      )}
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-pearl-100 text-left text-pearl-500"><th className="py-2">Name</th><th>Company</th><th>Phone</th><th>Account</th><th className="text-right">Balance owed</th></tr></thead>
          <tbody>
            {data?.map((v) => (
              <tr key={v.id} className="border-b border-pearl-50">
                <td className="py-1.5 font-medium">{v.name}</td><td>{v.company ?? "—"}</td><td>{v.phone ?? "—"}</td>
                <td className="font-mono text-xs text-pearl-500">{v.account ? `${v.account.code}` : "—"}</td>
                <td className="text-right font-medium">{v.balanceOwed != null ? money(v.balanceOwed) : "—"}</td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={5} className="py-3 text-pearl-400">No vendors.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
