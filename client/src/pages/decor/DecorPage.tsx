import { useState } from "react";
import { useDecor, useDecorMutation } from "../../api/hooks";
import { useAuth } from "../../auth/AuthContext";
import { errorMessage } from "../../lib/api";
import { money } from "../../lib/format";
import { Button, Card, Field, inputClass, PageHeader } from "../../components/ui";

export function DecorPage() {
  const { user } = useAuth();
  const canWrite = user?.roles.some((r) => ["decor", "admin", "super_admin"].includes(r)) ?? false;
  const { data } = useDecor();
  const { create } = useDecorMutation();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", description: "", quantity: "1", rate: "0", status: "available" });
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try { await create.mutateAsync({ ...form, quantity: Number(form.quantity), rate: Number(form.rate) }); setShow(false); setForm({ code: "", name: "", description: "", quantity: "1", rate: "0", status: "available" }); }
    catch (err) { setError(errorMessage(err)); }
  };

  return (
    <div>
      <PageHeader title="Decor" icon="🎀" actions={canWrite && <Button onClick={() => setShow((s) => !s)}>{show ? "Close" : "New decor item"}</Button>} />
      {show && (
        <Card className="mb-4">
          {error && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form onSubmit={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Code"><input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Name"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Quantity"><input type="number" className={inputClass} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
            <Field label="Rate"><input type="number" step="0.01" className={inputClass} value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></Field>
            <Field label="Status"><select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{["available", "in_use", "retired"].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <div className="col-span-full"><Field label="Description"><input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div>
            <div className="col-span-full"><Button type="submit">Save decor item</Button></div>
          </form>
        </Card>
      )}
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-pearl-100 text-left text-pearl-500"><th className="py-2">Code</th><th>Name</th><th>Description</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th>Status</th></tr></thead>
          <tbody>
            {data?.map((dci) => (
              <tr key={dci.id} className="border-b border-pearl-50">
                <td className="py-1.5 font-mono text-xs">{dci.code}</td><td>{dci.name}</td><td className="text-pearl-500">{dci.description ?? "—"}</td>
                <td className="text-right">{dci.quantity}</td><td className="text-right">{dci.rate ? money(dci.rate) : "—"}</td>
                <td className="capitalize">{String(dci.status).replace("_", " ")}</td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={6} className="py-3 text-pearl-400">No decor items.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
