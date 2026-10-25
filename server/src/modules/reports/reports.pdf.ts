import type { Settings } from "@prisma/client";
import { buildPdf, companyHeader, money, table, type PDFDoc } from "../../lib/pdf";
import type { ReportsService } from "./reports.service";
import type { AccountingService } from "../accounting/accounting.service";

type Cash = Awaited<ReturnType<typeof ReportsService.cashClosing>>;
type Supplier = Awaited<ReturnType<typeof ReportsService.supplierSummary>>;
type Master = Awaited<ReturnType<typeof ReportsService.bookingsMaster>>;
type PnL = Awaited<ReturnType<typeof ReportsService.profitAndLoss>>;
type GL = Awaited<ReturnType<typeof AccountingService.generalLedger>>;

function company(s: Settings) {
  return { name: s.companyName, address: s.companyAddress, phone: s.companyPhone, email: s.companyEmail };
}
function fmt(d: Date | string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function periodLine(doc: PDFDoc, from: string, to: string) {
  doc.fontSize(9).fillColor("#555").font("Helvetica");
  doc.text(`Period: ${fmt(from)} – ${fmt(to)}`, { continued: true });
  doc.text(`     Generated: ${new Date().toLocaleString("en-GB")}`);
  doc.moveDown(0.6);
  doc.fillColor("#000");
}

export function cashClosingPdf(data: Cash, s: Settings): Promise<Buffer> {
  return buildPdf((doc) => {
    companyHeader(doc, company(s), "Cash Closing Sheet");
    periodLine(doc, data.range.from, data.range.to);
    for (const sec of data.sections) {
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#343854").text(`${sec.account.code} ${sec.account.name}`);
      doc.font("Helvetica").fontSize(9).fillColor("#555").text(`Opening: ${money(sec.opening)}`);
      doc.moveDown(0.2);
      table(
        doc,
        [
          { label: "Date", width: 80 },
          { label: "Voucher", width: 90 },
          { label: "Remark", width: 185 },
          { label: "In", width: 80, align: "right" },
          { label: "Out", width: 80, align: "right" },
        ],
        sec.lines.length
          ? sec.lines.map((l) => [fmt(l.date), l.voucherNo, l.remark, Number(l.debit) ? money(l.debit) : "", Number(l.credit) ? money(l.credit) : ""])
          : [["—", "—", "No movement", "", ""]],
      );
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111")
        .text(`Collections ${money(sec.totalIn)}   ·   Payments ${money(sec.totalOut)}   ·   Closing ${money(sec.closing)}`, { align: "right" });
      doc.moveDown(0.8);
      doc.fillColor("#000").font("Helvetica");
    }
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#343854")
      .text(`GRAND TOTALS — Opening ${money(data.totals.opening)} · In ${money(data.totals.totalIn)} · Out ${money(data.totals.totalOut)} · Closing ${money(data.totals.closing)}`);
  });
}

export function supplierSummaryPdf(data: Supplier, s: Settings): Promise<Buffer> {
  return buildPdf((doc) => {
    companyHeader(doc, company(s), "Supplier Summary");
    periodLine(doc, data.range.from, data.range.to);
    table(
      doc,
      [
        { label: "Code", width: 60 },
        { label: "Supplier", width: 215 },
        { label: "Opening", width: 80, align: "right" },
        { label: "Receivings", width: 80, align: "right" },
        { label: "Payments", width: 80, align: "right" },
      ],
      data.rows.map((r) => [r.code, r.name, money(r.opening), money(r.receivings), money(r.payments)]),
    );
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111").text(
      `Totals — Opening ${money(data.totals.opening)} · Receivings ${money(data.totals.receivings)} · Payments ${money(data.totals.payments)} · Balance owed ${money(data.totals.balance)}`,
      { align: "right" },
    );
  });
}

export function bookingsMasterPdf(data: Master, s: Settings): Promise<Buffer> {
  return buildPdf((doc) => {
    companyHeader(doc, company(s), "Bookings Master Report");
    periodLine(doc, data.range.from, data.range.to);
    table(
      doc,
      [
        { label: "Ref", width: 70 },
        { label: "Date", width: 68 },
        { label: "Host", width: 95 },
        { label: "Hall", width: 70 },
        { label: "Guests", width: 45, align: "right" },
        { label: "Total", width: 70, align: "right" },
        { label: "Paid", width: 65, align: "right" },
        { label: "Balance", width: 65, align: "right" },
        { label: "Profit", width: 67, align: "right" },
      ],
      data.rows.map((r) => [r.bookingNo, fmt(r.eventDate), r.host, r.hall, String(r.guests), money(r.total), money(r.payments), money(r.balance), money(r.netProfit)]),
    );
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111").text(
      `${data.count} events — Total ${money(data.totals.total)} · Paid ${money(data.totals.payments)} · Balance ${money(data.totals.balance)} · Expense ${money(data.totals.expense)} · Net Profit ${money(data.totals.netProfit)}`,
      { align: "right" },
    );
  });
}

export function profitLossPdf(data: PnL, s: Settings): Promise<Buffer> {
  return buildPdf((doc) => {
    companyHeader(doc, company(s), "Profit & Loss Statement");
    periodLine(doc, data.range.from, data.range.to);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#343854").text("Income");
    table(doc, [{ label: "Head", width: 375 }, { label: "Amount", width: 140, align: "right" }],
      data.income.map((i) => [`${i.code} ${i.name}`, money(i.amount)]));
    doc.font("Helvetica-Bold").fontSize(10).text(`Total Income ${money(data.totals.income)}`, { align: "right" });
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#343854").text("Expenses");
    table(doc, [{ label: "Head", width: 375 }, { label: "Amount", width: 140, align: "right" }],
      data.expense.map((e) => [`${e.code} ${e.name}`, money(e.amount)]));
    doc.font("Helvetica-Bold").fontSize(10).text(`Total Expense ${money(data.totals.expense)}`, { align: "right" });
    doc.moveDown(0.6);
    const net = Number(data.totals.netProfit);
    doc.fontSize(13).fillColor(net >= 0 ? "#166534" : "#991b1b")
      .text(`NET ${net >= 0 ? "PROFIT" : "LOSS"}: ${net >= 0 ? money(data.totals.netProfit) : `(${money(Math.abs(net))})`}`, { align: "right" });
  });
}

export function generalLedgerPdf(data: GL, s: Settings): Promise<Buffer> {
  return buildPdf((doc) => {
    companyHeader(doc, company(s), `General Ledger — ${data.account.code} ${data.account.name}`);
    periodLine(doc, data.range.from, data.range.to);
    doc.font("Helvetica").fontSize(9).text(`Opening balance: ${money(data.opening)}`);
    doc.moveDown(0.3);
    table(
      doc,
      [
        { label: "Date", width: 70 },
        { label: "Voucher", width: 80 },
        { label: "Description", width: 150 },
        { label: "Contra", width: 100 },
        { label: "Dr", width: 55, align: "right" },
        { label: "Cr", width: 55, align: "right" },
      ],
      data.rows.map((r) => [fmt(r.date), r.voucherNo, r.description, r.contra, Number(r.debit) ? money(r.debit) : "", Number(r.credit) ? money(r.credit) : ""]),
    );
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111")
      .text(`Closing balance: ${money(data.closing)}`, { align: "right" });
  });
}
