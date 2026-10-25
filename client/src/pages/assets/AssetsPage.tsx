import { useState } from "react";
import { useAssets, useAssetMutation } from "../../api/hooks";
import { useAuth } from "../../auth/AuthContext";
import { errorMessage } from "../../lib/api";
import { fmtDate, money } from "../../lib/format";
import { Button, Card, Field, inputClass, PageHeader } from "../../components/ui";

export function AssetsPage() {
  const { user } = useAuth();
  const canWrite = user?.roles.some((r) => ["admin", "super_admin"].includes(r)) ?? false;
  const { data } = useAssets();
  const { create } = useAssetMutation();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", category: "", quantity: "1", condition: "good", status: "available" });
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try { await create.mutateAsync({ ...form, quantity: Number(form.quantity) }); setShow(false); setForm({ code: "", name: "", category: "", quantity: "1", condition: "good", status: "available" }); }
    catch (err) { setError(errorMessage(err)); }
  };

  return (
    <div>
      <PageHeader title="Assets" icon="🏗️" actions={canWrite && <Button onClick={() => setShow((s) => !s)}>{show ? "Close" : "New asset"}</Button>} />
      {show && (
        <Card className="mb-4">
          {error && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form onSubmit={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Code"><input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Name"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Category"><input className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
            <Field label="Quantity"><input type="number" className={inputClass} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
            <Field label="Condition"><select className={inputClass} value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>{["new", "good", "fair", "poor"].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Status"><select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{["available", "in_use", "retired"].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <div className="col-span-full"><Button type="submit">Save asset</Button></div>
          </form>
        </Card>
      )}
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-pearl-100 text-left text-pearl-500"><th className="py-2">Code</th><th>Name</th><th>Category</th><th className="text-right">Qty</th><th>Condition</th><th>Status</th><th className="text-right">Cost</th></tr></thead>
          <tbody>
            {data?.map((a) => (
              <tr key={a.id} className="border-b border-pearl-50">
                <td className="py-1.5 font-mono text-xs">{a.code}</td><td>{a.name}</td><td>{a.category ?? "—"}</td>
                <td className="text-right">{a.quantity}</td><td className="capitalize">{a.condition}</td>
                <td className="capitalize">{String(a.status).replace("_", " ")}</td>
                <td className="text-right">{a.purchaseCost ? money(a.purchaseCost) : "—"}{a.purchaseDate && <span className="block text-xs text-pearl-400">{fmtDate(a.purchaseDate)}</span>}</td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={7} className="py-3 text-pearl-400">No assets.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
