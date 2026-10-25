import { useState } from "react";
import {
  useAdminRoles,
  useAdminSettings,
  useAdminUsers,
  useAudits,
  useSystemLock,
  useUpdateSettings,
  useUserMutation,
  type AdminUser,
} from "../../api/hooks";
import { useAuth } from "../../auth/AuthContext";
import { errorMessage } from "../../lib/api";
import { Button, Card, Field, inputClass, PageHeader } from "../../components/ui";

type Tab = "settings" | "users" | "audit";

export function AdminPage() {
  const { user } = useAuth();
  const isSuper = user?.roles.includes("super_admin") ?? false;
  const [tab, setTab] = useState<Tab>("settings");

  return (
    <div>
      <PageHeader title="Administration" icon="⚙️" />
      <div className="mb-4 flex gap-1 border-b border-pearl-200">
        {([["settings", "Settings"], ["users", "Users & Roles"], ["audit", "Audit Log"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium ${tab === k ? "border-b-2 border-pearl-600 text-pearl-800" : "text-pearl-400 hover:text-pearl-600"}`}>{label}</button>
        ))}
      </div>
      {tab === "settings" && <SettingsTab isSuper={isSuper} />}
      {tab === "users" && <UsersTab isSuper={isSuper} />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

function SettingsTab({ isSuper }: { isSuper: boolean }) {
  const { data } = useAdminSettings();
  const update = useUpdateSettings();
  const lock = useSystemLock();
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!data) return <p className="text-pearl-500">Loading…</p>;
  const val = (k: keyof typeof data) => form[k] ?? (data[k] ?? "") as string;

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null); setError(null);
    try {
      await update.mutateAsync({
        companyName: val("companyName"), companyAddress: val("companyAddress") || null,
        companyPhone: val("companyPhone") || null, companyEmail: val("companyEmail") || null,
        currency: val("currency"), gstRate: Number(val("gstRate")),
      });
      setMsg("Settings saved."); setForm({});
    } catch (err) { setError(errorMessage(err)); }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <h2 className="mb-3 font-semibold text-pearl-800">Company & GST</h2>
        {msg && <div className="mb-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</div>}
        {error && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Company name"><input className={inputClass} value={val("companyName")} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></Field>
          <Field label="Phone"><input className={inputClass} value={val("companyPhone")} onChange={(e) => setForm({ ...form, companyPhone: e.target.value })} /></Field>
          <Field label="Email"><input className={inputClass} value={val("companyEmail")} onChange={(e) => setForm({ ...form, companyEmail: e.target.value })} /></Field>
          <Field label="Currency"><input className={inputClass} value={val("currency")} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Address"><input className={inputClass} value={val("companyAddress")} onChange={(e) => setForm({ ...form, companyAddress: e.target.value })} /></Field></div>
          <Field label="GST rate (%)"><input type="number" step="0.01" className={inputClass} value={val("gstRate")} onChange={(e) => setForm({ ...form, gstRate: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Button type="submit" disabled={update.isPending}>Save settings</Button></div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-pearl-800">System lock</h2>
        <p className="mb-3 text-sm text-pearl-500">
          While locked, only a Super Admin can log in. Used to enforce the maintenance agreement.
        </p>
        <div className="mb-3 text-sm">Status: <b className={data.systemLocked ? "text-red-600" : "text-green-600"}>{data.systemLocked ? "LOCKED" : "Open"}</b></div>
        {isSuper ? (
          <Button
            variant={data.systemLocked ? "primary" : "danger"}
            onClick={() => lock.mutate(!data.systemLocked)}
            disabled={lock.isPending}
          >
            {data.systemLocked ? "Unlock system" : "Lock system"}
          </Button>
        ) : (
          <p className="text-xs text-pearl-400">Only a Super Admin can change the lock.</p>
        )}
      </Card>
    </div>
  );
}

function UsersTab({ isSuper }: { isSuper: boolean }) {
  const { data: users } = useAdminUsers();
  const { data: roles } = useAdminRoles();
  const { create, update } = useUserMutation();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", roles: [] as string[] });
  const [error, setError] = useState<string | null>(null);

  const toggleRole = (r: string) => setForm((f) => ({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try { await create.mutateAsync(form); setShow(false); setForm({ name: "", email: "", password: "", roles: [] }); }
    catch (err) { setError(errorMessage(err)); }
  };

  const assignable = (roles ?? []).filter((r) => isSuper || r.name !== "super_admin");

  return (
    <div>
      <div className="mb-3"><Button variant="ghost" onClick={() => setShow((s) => !s)}>{show ? "Close" : "+ New user"}</Button></div>
      {show && (
        <Card className="mb-4">
          {error && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email"><input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Password"><input type="password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            <div>
              <span className="block text-sm font-medium text-pearl-700">Roles</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {assignable.map((r) => (
                  <button type="button" key={r.id} onClick={() => toggleRole(r.name)} className={`rounded-full px-3 py-1 text-xs ${form.roles.includes(r.name) ? "bg-pearl-600 text-white" : "bg-pearl-100 text-pearl-700"}`}>{r.label}</button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2"><Button type="submit" disabled={create.isPending}>Create user</Button></div>
          </form>
        </Card>
      )}
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-pearl-100 text-left text-pearl-500"><th className="py-2">Name</th><th>Email</th><th>Roles</th><th>Status</th><th /></tr></thead>
          <tbody>
            {users?.map((u) => <UserRow key={u.id} u={u} roles={assignable.map((r) => r.name)} onUpdate={(body) => update.mutate({ id: u.id, body })} />)}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function UserRow({ u, roles, onUpdate }: { u: AdminUser; roles: string[]; onUpdate: (body: Record<string, unknown>) => void }) {
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState<string[]>(u.roles);
  const toggle = (r: string) => setSel((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));
  return (
    <tr className="border-b border-pearl-50 align-top">
      <td className="py-2">{u.name}</td>
      <td>{u.email}</td>
      <td>
        {editing ? (
          <div className="flex flex-wrap gap-1">
            {roles.map((r) => <button key={r} onClick={() => toggle(r)} className={`rounded-full px-2 py-0.5 text-xs ${sel.includes(r) ? "bg-pearl-600 text-white" : "bg-pearl-100"}`}>{r}</button>)}
          </div>
        ) : (
          <span className="text-pearl-600">{u.roles.join(", ")}</span>
        )}
      </td>
      <td>
        <button onClick={() => onUpdate({ isActive: !u.isActive })} className={u.isActive ? "text-green-600" : "text-gray-400"}>{u.isActive ? "Active" : "Inactive"}</button>
      </td>
      <td className="text-right">
        {editing ? (
          <div className="flex gap-2">
            <button onClick={() => { onUpdate({ roles: sel }); setEditing(false); }} className="text-pearl-700">Save</button>
            <button onClick={() => { setSel(u.roles); setEditing(false); }} className="text-pearl-400">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="text-pearl-600 hover:underline">Edit roles</button>
        )}
      </td>
    </tr>
  );
}

function AuditTab() {
  const [model, setModel] = useState("");
  const { data } = useAudits(model ? { model } : {});
  const MODELS = ["", "Booking", "BookingCharge", "PaymentSlip", "Voucher", "Account", "User", "Settings"];
  return (
    <div>
      <Card className="mb-4">
        <select className={inputClass + " max-w-xs"} value={model} onChange={(e) => setModel(e.target.value)}>
          {MODELS.map((m) => <option key={m} value={m}>{m || "All models"}</option>)}
        </select>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-pearl-100 text-left text-pearl-500"><th className="py-2">When</th><th>User</th><th>Action</th><th>Model</th><th>Record</th></tr></thead>
          <tbody>
            {data?.data.map((a: any) => (
              <tr key={a.id} className="border-b border-pearl-50">
                <td className="py-1.5 text-pearl-500">{new Date(a.createdAt).toLocaleString("en-GB")}</td>
                <td>{a.user}</td>
                <td className="capitalize">{a.action}</td>
                <td>{a.model}</td>
                <td className="font-mono text-xs">#{a.modelId ?? "—"}</td>
              </tr>
            ))}
            {!data?.data.length && <tr><td colSpan={5} className="py-3 text-pearl-400">No audit entries.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
