import PDFDocument from "pdfkit";
import type { Response } from "express";

export type PDFDoc = PDFKit.PDFDocument;

/** Build a PDF into a Buffer via a draw callback. */
export function buildPdf(draw: (doc: PDFDoc) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      draw(doc);
      doc.end();
    } catch (e) {
      reject(e as Error);
    }
  });
}

export function sendPdf(res: Response, buffer: Buffer, filename: string) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.setHeader("Content-Length", String(buffer.length));
  res.end(buffer);
}

// ── Small drawing helpers shared by all documents ───────────────────────────

const PKR = (n: string | number) =>
  `Rs ${Number(n).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const money = PKR;

export function companyHeader(
  doc: PDFDoc,
  company: { name: string; address?: string | null; phone?: string | null; email?: string | null },
  docTitle: string,
) {
  doc
    .fontSize(20)
    .fillColor("#343854")
    .font("Helvetica-Bold")
    .text(company.name, { align: "left" });
  doc.fontSize(9).fillColor("#555").font("Helvetica");
  const lines = [company.address, company.phone, company.email].filter(Boolean);
  if (lines.length) doc.text(lines.join("  ·  "));
  doc.moveDown(0.5);
  doc
    .fontSize(13)
    .fillColor("#111")
    .font("Helvetica-Bold")
    .text(docTitle.toUpperCase());
  doc
    .moveTo(doc.x, doc.y + 2)
    .lineTo(555, doc.y + 2)
    .strokeColor("#b0bbd8")
    .stroke();
  doc.moveDown(0.8);
  doc.fillColor("#000").font("Helvetica");
}

/** Two-column key/value block. Returns the y after drawing. */
export function kvRows(doc: PDFDoc, rows: [string, string][], startX = 40) {
  const labelW = 120;
  doc.fontSize(10);
  for (const [k, v] of rows) {
    const y = doc.y;
    doc.font("Helvetica-Bold").fillColor("#555").text(k, startX, y, { width: labelW });
    doc.font("Helvetica").fillColor("#000").text(v, startX + labelW, y);
    doc.moveDown(0.2);
  }
  doc.moveDown(0.4);
}

/** Simple table with header + rows. columns: {label,width,align?}. */
export function table(
  doc: PDFDoc,
  columns: { label: string; width: number; align?: "left" | "right" | "center" }[],
  rows: string[][],
) {
  const startX = 40;
  let y = doc.y;
  const rowH = 20;

  // Header
  doc.rect(startX, y, columns.reduce((a, c) => a + c.width, 0), rowH).fill("#eceef6");
  let x = startX;
  doc.fillColor("#343854").font("Helvetica-Bold").fontSize(9);
  for (const col of columns) {
    doc.text(col.label, x + 4, y + 6, { width: col.width - 8, align: col.align ?? "left" });
    x += col.width;
  }
  y += rowH;

  // Rows
  doc.font("Helvetica").fillColor("#000").fontSize(9);
  for (const row of rows) {
    if (y > 760) {
      doc.addPage();
      y = 40;
    }
    x = startX;
    row.forEach((cell, i) => {
      const col = columns[i]!;
      doc.text(cell, x + 4, y + 6, { width: col.width - 8, align: col.align ?? "left" });
      x += col.width;
    });
    doc
      .moveTo(startX, y + rowH)
      .lineTo(startX + columns.reduce((a, c) => a + c.width, 0), y + rowH)
      .strokeColor("#e5e7eb")
      .stroke();
    y += rowH;
  }
  doc.y = y + 6;
  doc.x = startX;
}
