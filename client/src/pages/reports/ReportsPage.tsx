import { useState } from "react";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../auth/AuthContext";
import { useAccounts } from "../../api/hooks";
import { fmtDate, money } from "../../lib/format";
import { Button, Card, inputClass, PageHeader } from "../../components/ui";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

type ReportKey = "bookings-master" | "cash-closing" | "supplier-summary" | "profit-loss" | "general-ledger";

const REPORTS: { key: ReportKey; label: string; financial: boolean }[] = [
  { key: "bookings-master", label: "Bookings Master", financial: false },
  { key: "cash-closing", label: "Cash Closing Sheet", financial: true },
  { key: "general-ledger", label: "General Ledger", financial: true },
  { key: "supplier-summary", label: "Supplier Summary", financial: true },
  { key: "profit-loss", label: "Profit & Loss", financial: true },
];

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

export function ReportsPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const canFinancial = roles.some((r) => ["accounts", "admin", "super_admin"].includes(r));
  const available = REPORTS.filter((r) => !r.financial || canFinancial);

  const [report, setReport] = useState<ReportKey>("bookings-master");
  const init = monthRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [accountId, setAccountId] = useState<string>("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: accounts } = useAccounts(false);

  const run = async () => {
    setLoading(true); setError(null); setData(null);
    try {
      const params: Record<string, string> = { from, to };
      if (report === "general-ledger") params.accountId = accountId;
      const res = await api.get(`/reports/${report}`, { params });
      setData(res.data);
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  };

  const pdfUrl = () => {
    const q = new URLSearchParams({ from, to, format: "pdf" });
    if (report === "general-ledger") q.set("accountId", accountId);
    return `${API_BASE}/reports/${report}?${q.toString()}`;
  };

  return (
    <div>
      <PageHeader title="Reports" icon="📈" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card>
          <h2 className="mb-2 text-sm font-semibold uppercase text-pearl-400">Report</h2>
          <div className="space-y-1">
            {available.map((r) => (
              <button
                key={r.key}
                onClick={() => { setReport(r.key); setData(null); }}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm ${report === r.key ? "bg-pearl-100 font-medium text-pearl-800" : "text-pearl-600 hover:bg-pearl-50"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </Card>

        <div className="lg:col-span-3">
          <Card className="mb-4">
            <div className="flex flex-wrap items-end gap-3">
              {report === "general-ledger" && (
                <label className="text-sm">
                  <span className="block text-pearl-700">Account</span>
                  <select className={inputClass + " mt-1 max-w-xs"} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    <option value="">Select…</option>
                    {accounts?.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                  </select>
                </label>
              )}
              <label className="text-sm"><span className="block text-pearl-700">From</span><input type="date" className={inputClass + " mt-1"} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="text-sm"><span className="block text-pearl-700">To</span><input type="date" className={inputClass + " mt-1"} value={to} onChange={(e) => setTo(e.target.value)} /></label>
              <Button onClick={run} disabled={loading}>{loading ? "Running…" : "View"}</Button>
              <a href={pdfUrl()} target="_blank" rel="noreferrer"><Button variant="ghost">Download PDF</Button></a>
            </div>
            {error && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          </Card>

          {data && <ReportView report={report} data={data} />}
        </div>
      </div>
    </div>
  );
}

function ReportView({ report, data }: { report: ReportKey; data: any }) {
  if (report === "bookings-master") {
    return (
      <Card>
        <Table head={["Ref", "Date", "Host", "Hall", "Guests", "Total", "Paid", "Balance", "Profit"]}
          rows={data.rows.map((r: any) => [r.bookingNo, fmtDate(r.eventDate), r.host, r.hall, r.guests, money(r.total), money(r.payments), money(r.balance), money(r.netProfit)])} />
        <Totals text={`${data.count} events · Total ${money(data.totals.total)} · Paid ${money(data.totals.payments)} · Balance ${money(data.totals.balance)} · Net Profit ${money(data.totals.netProfit)}`} />
      </Card>
    );
  }
  if (report === "profit-loss") {
    return (
      <Card>
        <h3 className="mb-1 font-semibold text-pearl-800">Income</h3>
        <Table head={["Head", "Amount"]} rows={data.income.map((i: any) => [`${i.code} ${i.name}`, money(i.amount)])} right={[1]} />
        <Totals text={`Total income ${money(data.totals.income)}`} />
        <h3 className="mb-1 mt-4 font-semibold text-pearl-800">Expenses</h3>
        <Table head={["Head", "Amount"]} rows={data.expense.map((e: any) => [`${e.code} ${e.name}`, money(e.amount)])} right={[1]} />
        <Totals text={`Total expense ${money(data.totals.expense)}`} />
        <div className={`mt-3 text-right text-lg font-bold ${Number(data.totals.netProfit) >= 0 ? "text-green-700" : "text-red-700"}`}>
          Net {Number(data.totals.netProfit) >= 0 ? "Profit" : "Loss"}: {money(data.totals.netProfit)}
        </div>
      </Card>
    );
  }
  if (report === "supplier-summary") {
    return (
      <Card>
        <Table head={["Code", "Supplier", "Opening", "Receivings", "Payments", "Balance"]}
          rows={data.rows.map((r: any) => [r.code, r.name, money(r.opening), money(r.receivings), money(r.payments), money(r.balance)])} right={[2, 3, 4, 5]} />
        <Totals text={`Balance owed ${money(data.totals.balance)}`} />
      </Card>
    );
  }
  if (report === "general-ledger") {
    return (
      <Card>
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-semibold text-pearl-800">{data.account.code} {data.account.name}</span>
          <span className="text-pearl-500">Opening {money(data.opening)} · Closing <b>{money(data.closing)}</b></span>
        </div>
        <Table head={["Date", "Voucher", "Description", "Contra", "Dr", "Cr", "Balance"]}
          rows={data.rows.map((r: any) => [fmtDate(r.date), r.voucherNo, r.description, r.contra, Number(r.debit) ? money(r.debit) : "", Number(r.credit) ? money(r.credit) : "", money(r.balance)])} right={[4, 5, 6]} />
      </Card>
    );
  }
  // cash-closing
  return (
    <div className="space-y-4">
      {data.sections.map((s: any) => (
        <Card key={s.account.id}>
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-semibold text-pearl-800">{s.account.code} {s.account.name}</span>
            <span className="text-pearl-500">Opening {money(s.opening)} · Closing <b>{money(s.closing)}</b></span>
          </div>
          <Table head={["Date", "Voucher", "Remark", "In", "Out"]}
            rows={s.lines.map((l: any) => [fmtDate(l.date), l.voucherNo, l.remark, Number(l.debit) ? money(l.debit) : "", Number(l.credit) ? money(l.credit) : ""])} right={[3, 4]} />
          <Totals text={`Collections ${money(s.totalIn)} · Payments ${money(s.totalOut)}`} />
        </Card>
      ))}
      <div className="text-right text-sm font-semibold text-pearl-800">
        Grand closing: {money(data.totals.closing)}
      </div>
    </div>
  );
}

function Table({ head, rows, right = [] }: { head: string[]; rows: (string | number)[][]; right?: number[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-pearl-100 text-left text-pearl-500">
          {head.map((h, i) => <th key={i} className={`py-2 ${right.includes(i) ? "text-right" : ""}`}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.length ? rows.map((r, i) => (
          <tr key={i} className="border-b border-pearl-50">
            {r.map((c, j) => <td key={j} className={`py-1.5 ${right.includes(j) ? "text-right" : ""}`}>{c}</td>)}
          </tr>
        )) : <tr><td colSpan={head.length} className="py-3 text-pearl-400">No data in range.</td></tr>}
      </tbody>
    </table>
  );
}

function Totals({ text }: { text: string }) {
  return <div className="mt-2 text-right text-sm font-semibold text-pearl-800">{text}</div>;
}
