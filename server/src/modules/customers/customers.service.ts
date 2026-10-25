import { Prisma, type Customer } from "@prisma/client";
import { prisma } from "../../prisma";
import { AppError } from "../../lib/errors";
import {
  cnicBlindIndex,
  decryptCnic,
  encryptCnic,
  maskCnic,
  normalizeCnic,
} from "../../lib/crypto";
import { NumberSequenceService, SEQ } from "../../services/numberSequence";

export interface CustomerDTO {
  id: number;
  code: string;
  name: string;
  careOf: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  cnicMasked: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toCustomerDTO(c: Customer): CustomerDTO {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    careOf: c.careOf,
    phone: c.phone,
    email: c.email,
    address: c.address,
    cnicMasked: c.cnicEnc ? maskCnic(decryptCnic(c.cnicEnc)) : null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export interface CustomerInput {
  name: string;
  careOf?: string | null;
  phone?: string | null;
  cnic?: string | null;
  email?: string | null;
  address?: string | null;
}

function cnicFields(cnic?: string | null) {
  if (cnic === undefined) return {}; // leave unchanged
  if (cnic === null || cnic.trim() === "") {
    return { cnicEnc: null, cnicIndex: null };
  }
  const normalized = normalizeCnic(cnic);
  if (normalized.length !== 13) {
    throw AppError.badRequest("CNIC must be 13 digits");
  }
  return { cnicEnc: encryptCnic(normalized), cnicIndex: cnicBlindIndex(normalized) };
}

export const CustomersService = {
  async create(input: CustomerInput): Promise<CustomerDTO> {
    const customer = await prisma.$transaction(async (tx) => {
      const code = await NumberSequenceService.next(
        SEQ.customer.key,
        SEQ.customer.prefix,
        4,
        tx,
      );
      return tx.customer.create({
        data: {
          code,
          name: input.name.trim(),
          careOf: input.careOf ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          address: input.address ?? null,
          ...cnicFields(input.cnic),
        },
      });
    });
    return toCustomerDTO(customer);
  },

  async update(id: number, input: Partial<CustomerInput>): Promise<CustomerDTO> {
    const data: Prisma.CustomerUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.careOf !== undefined) data.careOf = input.careOf;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.email !== undefined) data.email = input.email;
    if (input.address !== undefined) data.address = input.address;
    Object.assign(data, cnicFields(input.cnic));

    const customer = await prisma.customer.update({ where: { id }, data });
    return toCustomerDTO(customer);
  },

  async getById(id: number): Promise<CustomerDTO> {
    const c = await prisma.customer.findUnique({ where: { id } });
    if (!c) throw AppError.notFound("Customer not found");
    return toCustomerDTO(c);
  },

  /**
   * List customers. `q` matches name/phone (partial, case-insensitive). CNIC is
   * handled separately via `cnic` (exact-match only, through the blind index) —
   * partial CNIC search is impossible by design.
   */
  async list(params: { q?: string; cnic?: string; take?: number; skip?: number }) {
    const where: Prisma.CustomerWhereInput = {};

    if (params.cnic && params.cnic.trim() !== "") {
      where.cnicIndex = cnicBlindIndex(params.cnic);
    }
    if (params.q && params.q.trim() !== "") {
      const q = params.q.trim();
      where.OR = [
        { name: { contains: q } },
        { phone: { contains: q } },
        { code: { contains: q } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: params.take ?? 50,
        skip: params.skip ?? 0,
      }),
      prisma.customer.count({ where }),
    ]);

    return { data: rows.map(toCustomerDTO), total };
  },

  /** Customer's bookings + aggregate "total business". */
  async summary(id: number) {
    const customer = await this.getById(id);

    const bookings = await prisma.booking.findMany({
      where: { customerId: id, deletedAt: null },
      orderBy: { eventDate: "desc" },
      include: { hall: { select: { name: true } } },
    });

    const active = bookings.filter((b) => b.status !== "cancelled");
    const totalBusiness = active.reduce(
      (acc, b) => acc.plus(b.grandTotal),
      new Prisma.Decimal(0),
    );
    const totalPaid = active.reduce(
      (acc, b) => acc.plus(b.advanceTotal),
      new Prisma.Decimal(0),
    );

    return {
      customer,
      bookings: bookings.map((b) => ({
        id: b.id,
        bookingNo: b.bookingNo,
        hall: b.hall.name,
        eventDate: b.eventDate,
        slot: b.slot,
        status: b.status,
        grandTotal: b.grandTotal.toFixed(2),
        advanceTotal: b.advanceTotal.toFixed(2),
        due: b.due.toFixed(2),
      })),
      stats: {
        bookingsCount: bookings.length,
        activeCount: active.length,
        totalBusiness: totalBusiness.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        totalDue: totalBusiness.minus(totalPaid).toFixed(2),
      },
    };
  },

  async remove(id: number): Promise<void> {
    const count = await prisma.booking.count({ where: { customerId: id } });
    if (count > 0) {
      throw AppError.conflict(
        "Cannot delete a customer who has bookings. Edit the customer instead.",
      );
    }
    await prisma.customer.delete({ where: { id } });
  },
};
