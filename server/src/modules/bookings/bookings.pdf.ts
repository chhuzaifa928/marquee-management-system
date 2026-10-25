import type { Settings } from "@prisma/client";
import { buildPdf, companyHeader, kvRows, money, table, type PDFDoc } from "../../lib/pdf";

// The booking shape is the DTO returned by BookingsService.getById.
type BookingDTO = Awaited<ReturnType<typeof import("./bookings.service").BookingsService.getById>>;

function company(s: Settings) {
  return {
    name: s.companyName,
    address: s.companyAddress,
    phone: s.companyPhone,
    email: s.companyEmail,
  };
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const CHARGE_LABELS: Record<string, string> = {
  hall_charges: "Hall Charges",
  ac_heating: "AC / Heating",
  dj: "DJ",
  decor: "Decor",
  cold_drinks: "Cold Drinks",
  mineral_water: "Mineral Water",
  other_charges: "Other Charges",
};

function headerInfo(doc: PDFDoc, b: BookingDTO) {
  kvRows(doc, [
    ["Booking No", b.bookingNo],
    ["Status", b.status.toUpperCase()],
    ["Host", `${b.customer.name}${b.customer.phone ? "  ·  " + b.customer.phone : ""}`],
    ["Hall", b.hall.name],
    ["Event Date", `${fmtDate(b.eventDate)}  (${b.slot})`],
    ["Timing", [b.startTime, b.endTime].filter(Boolean).join(" – ") || "—"],
    ["Event Type", b.eventType || "—"],
    ["Guests", String(b.guests)],
  ]);
}

function totalsBlock(doc: PDFDoc, b: BookingDTO) {
  doc.moveDown(0.5);
  const rightX = 330;
  const put = (label: string, value: string, bold = false) => {
    const y = doc.y;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor("#333");
    doc.text(label, rightX, y, { width: 130, align: "right" });
    doc.text(value, rightX + 130, y, { width: 95, align: "right" });
    doc.moveDown(0.25);
  };
  put("Head charge", money(b.totals.headchargeTotal));
  put("Other charges", money(b.totals.chargesTotal));
  put("Subtotal", money(b.totals.subtotal));
  put(`GST (${b.gstRate}%)`, money(b.totals.gstAmount));
  put("Grand Total", money(b.totals.grandTotal), true);
  put("Advance received", money(b.totals.advanceTotal));
  put("Balance due", money(b.totals.due), true);
}

/** Event Booking Sheet — full booking summary with charges + menu. */
export function eventBookingSheet(b: BookingDTO, s: Settings): Promise<Buffer> {
  return buildPdf((doc) => {
    companyHeader(doc, company(s), "Event Booking Sheet");
    headerInfo(doc, b);

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#343854").text("Charges");
    doc.moveDown(0.3);
    table(
      doc,
      [
        { label: "Item", width: 200 },
        { label: "Description", width: 175 },
        { label: "Qty", width: 50, align: "right" },
        { label: "Rate", width: 90, align: "right" },
      ],
      [
        [
          "Head Charge",
          `${b.guests} guests @ ${money(b.discountedRate)}`,
          String(b.guests),
          money(b.totals.headchargeTotal),
        ],
        ...b.charges.map((c) => [
          CHARGE_LABELS[c.chargeType] ?? c.chargeType,
          c.description ?? "",
          c.quantity,
          money(c.amount),
        ]),
      ],
    );

    if (b.foods.length) {
      doc.moveDown(0.4);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#343854").text("Menu");
      doc.moveDown(0.3);
      table(
        doc,
        [
          { label: "#", width: 40, align: "right" },
          { label: "Item (English)", width: 260 },
          { label: "Urdu", width: 215 },
        ],
        b.foods.map((f, i) => [String(i + 1), f.name, f.urduName ?? ""]),
      );
    }

    totalsBlock(doc, b);

    if (b.remarks || b.arrangements) {
      doc.moveDown(1);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#343854").text("Notes");
      doc.font("Helvetica").fontSize(9).fillColor("#000");
      if (b.arrangements) doc.text(`Arrangements: ${b.arrangements}`);
      if (b.remarks) doc.text(`Remarks: ${b.remarks}`);
    }

    doc.moveDown(2);
    signatures(doc, ["Host Signature", "For " + s.companyName]);
  });
}

/** Kitchen Voucher — menu + guest count for the kitchen (no pricing). */
export function kitchenVoucher(b: BookingDTO, s: Settings): Promise<Buffer> {
  return buildPdf((doc) => {
    companyHeader(doc, company(s), "Kitchen Voucher");
    kvRows(doc, [
      ["Booking No", b.bookingNo],
      ["Host", b.customer.name],
      ["Hall", b.hall.name],
      ["Event Date", `${fmtDate(b.eventDate)}  (${b.slot})`],
      ["Timing", [b.startTime, b.endTime].filter(Boolean).join(" – ") || "—"],
      ["Guests", String(b.guests)],
    ]);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#343854").text("Menu");
    doc.moveDown(0.3);
    table(
      doc,
      [
        { label: "#", width: 40, align: "right" },
        { label: "Item (English)", width: 300 },
        { label: "Urdu", width: 175 },
      ],
      b.foods.length
        ? b.foods.map((f, i) => [String(i + 1), f.name, f.urduName ?? ""])
        : [["—", "No menu items added", ""]],
    );
    if (b.arrangements) {
      doc.moveDown(0.6);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#343854").text("Arrangements");
      doc.font("Helvetica").fontSize(9).fillColor("#000").text(b.arrangements);
    }
  });
}

/** Final Invoice — priced document (completed further in Module 3/5). */
export function finalInvoice(b: BookingDTO, s: Settings): Promise<Buffer> {
  return buildPdf((doc) => {
    companyHeader(doc, company(s), "Invoice");
    headerInfo(doc, b);
    table(
      doc,
      [
        { label: "Description", width: 375 },
        { label: "Amount", width: 140, align: "right" },
      ],
      [
        [`Head charge — ${b.guests} @ ${money(b.discountedRate)}`, money(b.totals.headchargeTotal)],
        ...b.charges.map((c) => [
          `${CHARGE_LABELS[c.chargeType] ?? c.chargeType}${c.description ? " — " + c.description : ""}`,
          money(c.amount),
        ]),
      ],
    );
    totalsBlock(doc, b);
    doc.moveDown(2);
    signatures(doc, ["Received by", "For " + s.companyName]);
  });
}

/** Advance Receipt — lists the host's payment slips with a running total. */
export function advanceReceipt(b: BookingDTO, s: Settings): Promise<Buffer> {
  return buildPdf((doc) => {
    companyHeader(doc, company(s), "Advance Receipt");
    kvRows(doc, [
      ["Booking No", b.bookingNo],
      ["Host", b.customer.name],
      ["Hall", b.hall.name],
      ["Event Date", `${fmtDate(b.eventDate)}  (${b.slot})`],
    ]);
    let running = 0;
    const rows = b.paymentSlips.map((p) => {
      running += Number(p.amount);
      return [p.slipNo, fmtDate(p.date), p.method, money(p.amount), money(running)];
    });
    table(
      doc,
      [
        { label: "Slip No", width: 110 },
        { label: "Date", width: 95 },
        { label: "Method", width: 100 },
        { label: "Amount", width: 105, align: "right" },
        { label: "Running", width: 105, align: "right" },
      ],
      rows.length ? rows : [["—", "—", "—", money(0), money(0)]],
    );
    totalsBlock(doc, b);
  });
}

function signatures(doc: PDFDoc, labels: string[]) {
  const y = doc.y + 30;
  const width = 200;
  const gap = 115;
  labels.forEach((label, i) => {
    const x = 40 + i * (width + gap);
    doc.moveTo(x, y).lineTo(x + width, y).strokeColor("#999").stroke();
    doc.font("Helvetica").fontSize(9).fillColor("#555").text(label, x, y + 4, { width });
  });
}
