import { useState } from "react";
import { useInventory, useInventoryItem, useInventoryMutation } from "../../api/hooks";
import { useAuth } from "../../auth/AuthContext";
import { errorMessage } from "../../lib/api";
import { fmtDate, money } from "../../lib/format";
import { Button, Card, Field, inputClass, PageHeader } from "../../components/ui";

export function InventoryPage() {
  const { user } = useAuth();
  const canWrite = user?.roles.some((r) => ["inventory", "admin", "super_admin"].includes(r)) ?? false;
  const [lowOnly, setLowOnly] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const { data: items } = useInventory(lowOnly);

  return (
    <div>
      <PageHeader title="Inventory" icon="📦" actions={canWrite && <Button onClick={() => setShowNew((s) => !s)}>{showNew ? "Close" : "New item"}</Button>} />
      {showNew && <NewItemForm onDone={() => setShowNew(false)} />}
      <label className="mb-3 flex items-center gap-2 text-sm text-pearl-600">
        <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Show low-stock only
      </label>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-pearl-100 text-left text-pearl-500"><th className="py-2">Code</th><th>Name</th><th className="text-right">On hand</th><th className="text-right">Reorder</th><th className="text-right">Value</th></tr></thead>
            <tbody>
              {items?.map((i) => (
                <tr key={i.id} className={`cursor-pointer border-b border-pearl-50 hover:bg-pearl-50 ${selected === i.id ? "bg-pearl-50" : ""}`} onClick={() => setSelected(i.id)}>
                  <td className="py-1.5 font-mono text-xs">{i.code}</td>
                  <td>{i.name}{i.lowStock && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-700">low</span>}</td>
                  <td className="text-right">{i.qtyOnHand} {i.unit}</td>
                  <td className="text-right text-pearl-400">{i.reorderLevel}</td>
                  <td className="text-right">{money(i.stockValue)}</td>
                </tr>
              ))}
              {!items?.length && <tr><td colSpan={5} className="py-3 text-pearl-400">No items.</td></tr>}
            </tbody>
          </table>
        </Card>
        <div className="lg:col-span-2">
          {selected ? <ItemDetail id={selected} canWrite={canWrite} /> : <Card><p className="text-pearl-500">Select an item to view stock movements.</p></Card>}
        </div>
      </div>
    </div>
  );
}

function NewItemForm({ onDone }: { onDone: () => void }) {
  const { create } = useInventoryMutation();
  const [form, setForm] = useState({ code: "", name: "", category: "", unit: "", reorderLevel: "0", unitCost: "0" });
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try { await create.mutateAsync({ ...form, reorderLevel: Number(form.reorderLevel), unitCost: Number(form.unitCost) }); onDone(); }
    catch (err) { setError(errorMessage(err)); }
  };
  return (
    <Card className="mb-4">
      {error && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <form onSubmit={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Code"><input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
        <Field label="Name"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Category"><input className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
        <Field label="Unit"><input className={inputClass} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="kg, pcs…" /></Field>
        <Field label="Reorder level"><input type="number" className={inputClass} value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} /></Field>
        <Field label="Unit cost"><input type="number" step="0.01" className={inputClass} value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} /></Field>
        <div className="col-span-full"><Button type="submit">Save item</Button></div>
      </form>
    </Card>
  );
}

function ItemDetail({ id, canWrite }: { id: number; canWrite: boolean }) {
  const { data } = useInventoryItem(id);
  const { addMovement } = useInventoryMutation();
  const [type, setType] = useState("in");
  const [quantity, setQuantity] = useState("");
  if (!data) return <Card><p className="text-pearl-500">Loading…</p></Card>;
  return (
    <Card>
      <h3 className="font-semibold text-pearl-800">{data.item.name}</h3>
      <div className="mb-3 text-sm text-pearl-500">On hand: <b className="text-pearl-800">{data.item.qtyOnHand} {data.item.unit}</b></div>
      {canWrite && (
        <div className="mb-3 flex gap-2">
          <select className={inputClass + " max-w-[120px]"} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="in">In</option><option value="out">Out</option><option value="adjustment">Adjust</option>
          </select>
          <input className={inputClass} type="number" placeholder="Qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <Button onClick={() => { if (quantity) { addMovement.mutate({ id, body: { type, quantity: Number(quantity) } }); setQuantity(""); } }}>Add</Button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead><tr className="border-b border-pearl-100 text-left text-pearl-500"><th className="py-1">Date</th><th>Type</th><th className="text-right">Qty</th></tr></thead>
        <tbody>
          {data.movements.map((m) => (
            <tr key={m.id} className="border-b border-pearl-50"><td className="py-1">{fmtDate(m.date)}</td><td className="capitalize">{m.type}</td><td className="text-right">{m.quantity}</td></tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
