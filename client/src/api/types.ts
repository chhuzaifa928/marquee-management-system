export interface Customer {
  id: number;
  code: string;
  name: string;
  careOf: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  cnicMasked: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSummary {
  customer: Customer;
  bookings: {
    id: number;
    bookingNo: string;
    hall: string;
    eventDate: string;
    slot: string;
    status: string;
    grandTotal: string;
    advanceTotal: string;
    due: string;
  }[];
  stats: {
    bookingsCount: number;
    activeCount: number;
    totalBusiness: string;
    totalPaid: string;
    totalDue: string;
  };
}

export interface Hall {
  id: number;
  name: string;
  slug: string;
  capacity: number | null;
}

export interface Settings {
  companyName: string;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  currency: string;
  gstRate: string;
  systemLocked: boolean;
}

export type Slot = "lunch" | "dinner";
export type BookingStatus = "tentative" | "booked" | "paid" | "cancelled";
export type ChargeType =
  | "hall_charges"
  | "ac_heating"
  | "dj"
  | "decor"
  | "cold_drinks"
  | "mineral_water"
  | "other_charges";

export interface BookingTotals {
  headchargeTotal: string;
  chargesTotal: string;
  subtotal: string;
  gstAmount: string;
  grandTotal: string;
  advanceTotal: string;
  due: string;
}

export interface BookingCharge {
  id: number;
  chargeType: ChargeType;
  description: string | null;
  quantity: string;
  unitPrice: string;
  amount: string;
}

export interface BookingFood {
  id: number;
  name: string;
  urduName: string | null;
  sort: number;
}

export interface Booking {
  id: number;
  bookingNo: string;
  customer: { id: number; code: string; name: string; phone: string | null };
  hall: { id: number; name: string };
  eventDate: string;
  bookingDate: string;
  slot: Slot;
  startTime: string | null;
  endTime: string | null;
  eventType: string | null;
  guests: number;
  rackRate: string;
  discountedRate: string;
  status: BookingStatus;
  isLocked: boolean;
  gstRate: string;
  remarks: string | null;
  arrangements: string | null;
  bulletinBoard: string | null;
  confirmedAt: string | null;
  eventClosedAt: string | null;
  charges: BookingCharge[];
  foods: BookingFood[];
  paymentSlips: { id: number; slipNo: string; amount: string; method: string; date: string }[];
  totals: BookingTotals;
}

export interface AvailabilityInfo {
  canConfirm: boolean;
  confirmedConflict: { id: number; bookingNo: string } | null;
  tentativeOverlaps: { id: number; bookingNo: string }[];
  tentativeOverlapCount: number;
}

export interface BookingListItem {
  id: number;
  bookingNo: string;
  customer: string;
  phone: string | null;
  hall: string;
  eventDate: string;
  slot: Slot;
  status: BookingStatus;
  guests: number;
  grandTotal: string;
  advanceTotal: string;
  due: string;
}

export const CHARGE_LABELS: Record<ChargeType, string> = {
  hall_charges: "Hall Charges",
  ac_heating: "AC / Heating",
  dj: "DJ",
  decor: "Decor",
  cold_drinks: "Cold Drinks",
  mineral_water: "Mineral Water",
  other_charges: "Other Charges",
};
