import { useState } from "react";
import {
  useAccounts,
  useGeneralLedger,
  usePostVoucher,
  useVouchers,
  useAccountMutation,
  type AccountRow,
} from "../../api/hooks";
import { useAuth } from "../../auth/AuthContext";
import { errorMessage } from "../../lib/api";
import { fmtDate, money } from "../../lib/format";
import { Button, Card, Field, inputClass, PageHeader } from "../../components/ui";

type Tab = "chart" | "vouchers" | "ledger" | "new";

export function AccountingPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const canPost = roles.includes("accounts") || roles.includes("super_admin");
  const canChart = roles.includes("admin") || roles.includes("super_admin");
  const [tab, setTab] = useState<Tab>("chart");

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "chart", label: "Chart of Accounts", show: true },
    { key: "vouchers", label: "Vouchers", show: true },
    { key: "ledger", label: "General Ledger", show: true },
    { key: "new", label: "New Voucher", show: canPost },
  ];

  return (
    <div>
      <PageHeader title="Accounting" icon="📒" />
      <div className="mb-4 flex gap-1 border-b border-pearl-200">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t.key ? "border-b-2 border-pearl-600 text-pearl-800" : "text-pearl-400 hover:text-pearl-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "chart" && <ChartTab canChart={canChart} />}
      {tab === "vouchers" && <VouchersTab />}
      {tab === "ledger" && <LedgerTab />}
      {tab === "new" && canPost && <NewVoucherTab />}
    </div>
  );
}

function ChartTab({ canChart }: { canChart: boolean }) {
  const { data } = useAccounts(true);
  const { create } = useAccountMutation();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", type: "expense", openingBalance: "0" });
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ code: form.code, name: form.name, type: form.type, openingBalance: Number(form.openingBalance) });
      setShow(false); setForm({ code: "", name: "", type: "expense", openingBalance: "0" });
    } catch (err) { setError(errorMessage(err)); }
  };

  const groups = groupByType(data ?? []);
  return (
    <div>
      {canChart && (
        <div className="mb-3">
          <Button variant="ghost" onClick={() => setShow((s) => !s)}>{show ? "Close" : "+ New account"}</Button>
        </div>
      )}
      {show && (
        <Card className="mb-4">
          {error && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Code"><input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Name"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Type">
              <select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {["cash", "bank", "staff", "asset", "liability", "supplier", "income", "expense", "equity"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Opening balance"><input className={inputClass} type="number" step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} /></Field>
            <div className="sm:col-span-4"><Button type="submit">Save account</Button></div>
          </form>
        </Card>
      )}
      <Card>
        {Object.entries(groups).map(([type, rows]) => (
          <div key={type} className="mb-4">
            <h3 className="mb-1 text-xs font-semibold uppercase text-pearl-400">{type}</h3>
            <table className="w-full text-sm">
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-pearl-50">
                    <td className="py-1.5 font-mono text-xs text-pearl-500">{a.code}</td>
                    <td>{a.name}</td>
                    <td className="text-right font-medium">{money(a.balance ?? a.openingBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Card>
    </div>
  );
}

function VouchersTab() {
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data } = useVouchers({ type: type || undefined, from: from || undefined, to: to || undefined });
  return (
    <div>
      <Card className="mb-4">
        <div className="flex flex-wrap gap-3">
          <select className={inputClass + " max-w-[160px]"} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {["RV", "EV", "PV", "JV"].map((t) => <option key={t}>{t}</option>)}
          </select>
          <input type="date" className={inputClass + " max-w-[180px]"} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className={inputClass + " max-w-[180px]"} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-pearl-100 text-left text-pearl-500">
              <th className="py-2">Voucher</th><th>Date</th><th>Dr</th><th>Cr</th><th>Remark</th><th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data?.data.map((v) => (
              <tr key={v.id} className="border-b border-pearl-50">
                <td className="py-1.5 font-mono text-xs">{v.voucherNo}</td>
                <td>{fmtDate(v.date)}</td>
                <td className="text-xs">{v.debit}</td>
                <td className="text-xs">{v.credit}</td>
                <td className="text-pearl-500">{v.remark ?? v.category}</td>
                <td className="text-right font-medium">{money(v.amount)}</td>
              </tr>
            ))}
            {!data?.data.length && <tr><td colSpan={6} className="py-3 text-pearl-400">No vouchers.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function LedgerTab() {
  const { data: accounts } = useAccounts(false);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const enabled = Boolean(accountId && from && to);
  const { data: gl } = useGeneralLedger(accountId, from, to, enabled);

  return (
    <div>
      <Card className="mb-4">
        <div className="flex flex-wrap gap-3">
          <select className={inputClass + " max-w-xs"} value={accountId ?? ""} onChange={(e) => setAccountId(Number(e.target.value))}>
            <option value="">Select account…</option>
            {accounts?.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
          <input type="date" className={inputClass + " max-w-[180px]"} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className={inputClass + " max-w-[180px]"} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Card>
      {gl && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-pearl-800">{gl.account.code} {gl.account.name}</h3>
            <div className="text-sm text-pearl-500">Opening {money(gl.opening)} · Closing <span className="font-semibold text-pearl-800">{money(gl.closing)}</span></div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-pearl-100 text-left text-pearl-500">
                <th className="py-2">Date</th><th>Voucher</th><th>Description</th><th>Contra</th>
                <th className="text-right">Dr</th><th className="text-right">Cr</th><th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {gl.rows.map((r, i) => (
                <tr key={i} className="border-b border-pearl-50">
                  <td className="py-1.5">{fmtDate(r.date)}</td>
                  <td className="font-mono text-xs">{r.voucherNo}</td>
                  <td className="text-pearl-500">{r.description}</td>
                  <td className="text-xs">{r.contra}</td>
                  <td className="text-right">{Number(r.debit) ? money(r.debit) : ""}</td>
                  <td className="text-right">{Number(r.credit) ? money(r.credit) : ""}</td>
                  <td className="text-right font-medium">{money(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function NewVoucherTab() {
  const { data: accounts } = useAccounts(false);
  const post = usePostVoucher();
  const [form, setForm] = useState({ type: "EV", debitAccountId: "", creditAccountId: "", amount: "", category: "", remark: "", date: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setMsg(null);
    try {
      const v = await post.mutateAsync({
        type: form.type, debitAccountId: Number(form.debitAccountId), creditAccountId: Number(form.creditAccountId),
        amount: Number(form.amount), category: form.category || null, remark: form.remark || null, date: form.date || undefined,
      });
      setMsg(`Posted ${(v as { voucherNo: string }).voucherNo}`);
      setForm({ ...form, amount: "", remark: "", category: "" });
    } catch (err) { setError(errorMessage(err)); }
  };

  return (
    <Card>
      <h3 className="mb-3 font-semibold text-pearl-800">Post manual voucher (EV / PV / JV)</h3>
      {msg && <div className="mb-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</div>}
      {error && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Type">
          <select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="EV">EV — Expense</option>
            <option value="PV">PV — Payment / Transfer</option>
            <option value="JV">JV — Journal</option>
          </select>
        </Field>
        <Field label="Date"><input type="date" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Debit account">
          <select className={inputClass} value={form.debitAccountId} onChange={(e) => setForm({ ...form, debitAccountId: e.target.value })}>
            <option value="">Select…</option>
            {accounts?.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </Field>
        <Field label="Credit account">
          <select className={inputClass} value={form.creditAccountId} onChange={(e) => setForm({ ...form, creditAccountId: e.target.value })}>
            <option value="">Select…</option>
            {accounts?.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </Field>
        <Field label="Amount"><input type="number" step="0.01" className={inputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
        <Field label="Category"><input className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Kitchen Daily Expense…" /></Field>
        <div className="sm:col-span-2">
          <Field label="Remark"><input className={inputClass} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} /></Field>
        </div>
        <div className="sm:col-span-2"><Button type="submit" disabled={post.isPending}>Post voucher</Button></div>
      </form>
    </Card>
  );
}

function groupByType(rows: AccountRow[]): Record<string, AccountRow[]> {
  const order = ["cash", "bank", "staff", "asset", "liability", "supplier", "equity", "income", "expense"];
  const out: Record<string, AccountRow[]> = {};
  for (const t of order) {
    const g = rows.filter((r) => r.type === t);
    if (g.length) out[t] = g;
  }
  return out;
}
