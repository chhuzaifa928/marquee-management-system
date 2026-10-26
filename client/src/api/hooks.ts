import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type {
  AvailabilityInfo,
  Booking,
  BookingListItem,
  Customer,
  CustomerSummary,
  Hall,
  Settings,
  Slot,
} from "./types";

// ── Reference ────────────────────────────────────────────────────────────────
export function useHalls() {
  return useQuery({
    queryKey: ["halls"],
    queryFn: async () => (await api.get<Hall[]>("/halls")).data,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get<Settings>("/settings")).data,
  });
}

// ── Customers ────────────────────────────────────────────────────────────────
export function useCustomers(params: { q?: string; cnic?: string }) {
  return useQuery({
    queryKey: ["customers", params],
    queryFn: async () =>
      (await api.get<{ data: Customer[]; total: number }>("/customers", { params })).data,
  });
}

export function useCustomerSummary(id: number | null) {
  return useQuery({
    queryKey: ["customer", id, "summary"],
    enabled: id != null,
    queryFn: async () => (await api.get<CustomerSummary>(`/customers/${id}/summary`)).data,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await api.post<Customer>("/customers", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      (await api.put<Customer>(`/customers/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

// ── Bookings ─────────────────────────────────────────────────────────────────
export function useBookings(params: Record<string, unknown>) {
  return useQuery({
    queryKey: ["bookings", params],
    queryFn: async () =>
      (await api.get<{ data: BookingListItem[]; total: number }>("/bookings", { params })).data,
  });
}

export function useBooking(id: number | null) {
  return useQuery({
    queryKey: ["booking", id],
    enabled: id != null,
    queryFn: async () => (await api.get<Booking>(`/bookings/${id}`)).data,
  });
}

export function useCalendar(hallId: number | null, month: string) {
  return useQuery({
    queryKey: ["calendar", hallId, month],
    enabled: hallId != null,
    queryFn: async () =>
      (
        await api.get<
          {
            id: number;
            bookingNo: string;
            customer: string;
            eventDate: string;
            slot: Slot;
            status: string;
            guests: number;
            grandTotal: string;
          }[]
        >("/bookings/calendar", { params: { hallId, month } })
      ).data,
  });
}

export function useAvailability(
  params: { hallId?: number; date?: string; slot?: Slot; ignoreId?: number },
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["availability", params],
    enabled,
    queryFn: async () =>
      (await api.get<AvailabilityInfo>("/bookings/availability", { params })).data,
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await api.post<{ booking: Booking; availability: AvailabilityInfo }>("/bookings", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
}

// ── Payments ─────────────────────────────────────────────────────────────────
export interface PaymentAccount {
  id: number;
  code: string;
  name: string;
  type: string;
}
export interface Slip {
  id: number;
  slipNo: string;
  bookingId: number;
  bookingNo: string;
  customer: string;
  account: string;
  amount: string;
  method: string;
  reference: string | null;
  voucherNo: string | null;
  date: string;
}

export function usePaymentAccounts() {
  return useQuery({
    queryKey: ["payment-accounts"],
    queryFn: async () => (await api.get<PaymentAccount[]>("/payments/accounts")).data,
  });
}

export function useSlips(bookingId: number | null) {
  return useQuery({
    queryKey: ["slips", bookingId],
    queryFn: async () =>
      (await api.get<{ data: Slip[]; total: number }>("/payments/slips", {
        params: bookingId ? { bookingId } : {},
      })).data,
  });
}

export function useCreateSlip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await api.post("/payments/slips", body)).data,
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["slips"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      const bid = (v as { bookingId?: number }).bookingId;
      if (bid) qc.invalidateQueries({ queryKey: ["booking", bid] });
    },
  });
}

export function useDeleteSlip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.delete(`/payments/slips/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["slips"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}

// ── Accounting ───────────────────────────────────────────────────────────────
export interface AccountRow {
  id: number;
  code: string;
  name: string;
  type: string;
  openingBalance: string;
  isActive: boolean;
  normalSide?: string;
  balance?: string;
}
export interface VoucherRow {
  id: number;
  voucherNo: string;
  type: string;
  date: string;
  category: string | null;
  remark: string | null;
  debit: string;
  credit: string;
  amount: string;
  createdBy: string | null;
  batchUid: string | null;
  source: { type: string; id: number | null } | null;
}

export function useAccounts(withBalances = false) {
  return useQuery({
    queryKey: ["accounts", withBalances],
    queryFn: async () =>
      (await api.get<AccountRow[]>("/accounting/accounts", { params: withBalances ? { balances: 1 } : {} })).data,
  });
}

export function useVouchers(params: Record<string, unknown>) {
  return useQuery({
    queryKey: ["vouchers", params],
    queryFn: async () =>
      (await api.get<{ data: VoucherRow[]; total: number }>("/accounting/vouchers", { params })).data,
  });
}

export function useGeneralLedger(accountId: number | null, from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: ["gl", accountId, from, to],
    enabled: enabled && accountId != null,
    queryFn: async () =>
      (await api.get(`/accounting/accounts/${accountId}/ledger`, { params: { from, to } })).data as {
        account: { id: number; code: string; name: string; type: string; normalSide: string };
        opening: string; movementDebit: string; movementCredit: string; closing: string;
        rows: { date: string; voucherNo: string; type: string; description: string; contra: string; debit: string; credit: string; balance: string }[];
      },
  });
}

export function usePostVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.post("/accounting/vouchers", body)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vouchers"] }); qc.invalidateQueries({ queryKey: ["accounts"] }); },
  });
}

export function useAccountMutation() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["accounts"] });
  return {
    create: useMutation({ mutationFn: async (b: Record<string, unknown>) => (await api.post("/accounting/accounts", b)).data, onSuccess: invalidate }),
    update: useMutation({ mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => (await api.put(`/accounting/accounts/${id}`, body)).data, onSuccess: invalidate }),
  };
}

export function useCloseEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: number) => (await api.post(`/accounting/bookings/${bookingId}/close`)).data,
    onSuccess: (_d, id) => { qc.invalidateQueries({ queryKey: ["booking", id] }); qc.invalidateQueries({ queryKey: ["vouchers"] }); },
  });
}

// ── Inventory / Assets / Decor / Vendors / Event costs ──────────────────────
export function useInventory(lowStock = false) {
  return useQuery({ queryKey: ["inventory", lowStock], queryFn: async () => (await api.get<any[]>("/inventory/items", { params: lowStock ? { lowStock: 1 } : {} })).data });
}
export function useInventoryItem(id: number | null) {
  return useQuery({ queryKey: ["inventory-item", id], enabled: id != null, queryFn: async () => (await api.get(`/inventory/items/${id}`)).data as { item: any; movements: any[] } });
}
export function useInventoryMutation() {
  const qc = useQueryClient();
  const inv = () => { qc.invalidateQueries({ queryKey: ["inventory"] }); qc.invalidateQueries({ queryKey: ["inventory-item"] }); };
  return {
    create: useMutation({ mutationFn: async (b: Record<string, unknown>) => (await api.post("/inventory/items", b)).data, onSuccess: inv }),
    update: useMutation({ mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => (await api.put(`/inventory/items/${id}`, body)).data, onSuccess: inv }),
    addMovement: useMutation({ mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => (await api.post(`/inventory/items/${id}/movements`, body)).data, onSuccess: inv }),
    deleteMovement: useMutation({ mutationFn: async (mid: number) => (await api.delete(`/inventory/movements/${mid}`)).data, onSuccess: inv }),
  };
}

export function useAssets() { return useQuery({ queryKey: ["assets"], queryFn: async () => (await api.get<any[]>("/assets")).data }); }
export function useAssetMutation() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ["assets"] });
  return {
    create: useMutation({ mutationFn: async (b: Record<string, unknown>) => (await api.post("/assets", b)).data, onSuccess: inv }),
    update: useMutation({ mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => (await api.put(`/assets/${id}`, body)).data, onSuccess: inv }),
    remove: useMutation({ mutationFn: async (id: number) => (await api.delete(`/assets/${id}`)).data, onSuccess: inv }),
  };
}

export function useDecor() { return useQuery({ queryKey: ["decor"], queryFn: async () => (await api.get<any[]>("/decor")).data }); }
export function useDecorMutation() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ["decor"] });
  return {
    create: useMutation({ mutationFn: async (b: Record<string, unknown>) => (await api.post("/decor", b)).data, onSuccess: inv }),
    update: useMutation({ mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => (await api.put(`/decor/${id}`, body)).data, onSuccess: inv }),
    remove: useMutation({ mutationFn: async (id: number) => (await api.delete(`/decor/${id}`)).data, onSuccess: inv }),
  };
}

export function useVendors() { return useQuery({ queryKey: ["vendors"], queryFn: async () => (await api.get<any[]>("/vendors")).data }); }
export function useVendorMutation() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ["vendors"] });
  return {
    create: useMutation({ mutationFn: async (b: Record<string, unknown>) => (await api.post("/vendors", b)).data, onSuccess: inv }),
    remove: useMutation({ mutationFn: async (id: number) => (await api.delete(`/vendors/${id}`)).data, onSuccess: inv }),
  };
}

export function useEventCosts(bookingId: number | null) {
  return useQuery({ queryKey: ["event-costs", bookingId], enabled: bookingId != null, queryFn: async () => (await api.get(`/event-costs/bookings/${bookingId}`)).data as any });
}
export function useEventCostMutation() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ["event-costs"] });
  return {
    create: useMutation({ mutationFn: async ({ bookingId, body }: { bookingId: number; body: Record<string, unknown> }) => (await api.post(`/event-costs/bookings/${bookingId}`, body)).data, onSuccess: inv }),
    remove: useMutation({ mutationFn: async (costId: number) => (await api.delete(`/event-costs/${costId}`)).data, onSuccess: inv }),
  };
}

export function useDashboard() {
  return useQuery({ queryKey: ["dashboard"], queryFn: async () => (await api.get("/dashboard")).data as any });
}

// ── Admin ────────────────────────────────────────────────────────────────────
export interface AdminSettings {
  gstRate: string; systemLocked: boolean;
  companyName: string; companyAddress: string | null; companyPhone: string | null; companyEmail: string | null; currency: string; logoPath: string | null;
}
export interface AdminUser {
  id: number; name: string; email: string; isActive: boolean; roles: string[]; createdAt: string;
}

export function useAdminSettings() {
  return useQuery({ queryKey: ["admin-settings"], queryFn: async () => (await api.get<AdminSettings>("/admin/settings")).data });
}
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.put("/admin/settings", body)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-settings"] }); qc.invalidateQueries({ queryKey: ["settings"] }); },
  });
}
export function useSystemLock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (locked: boolean) => (await api.post("/admin/system-lock", { locked })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-settings"] }),
  });
}
export function useAdminUsers() {
  return useQuery({ queryKey: ["admin-users"], queryFn: async () => (await api.get<AdminUser[]>("/admin/users")).data });
}
export function useAdminRoles() {
  return useQuery({ queryKey: ["admin-roles"], queryFn: async () => (await api.get<{ id: number; name: string; label: string }[]>("/admin/roles")).data });
}
export function useUserMutation() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-users"] });
  return {
    create: useMutation({ mutationFn: async (b: Record<string, unknown>) => (await api.post("/admin/users", b)).data, onSuccess: invalidate }),
    update: useMutation({ mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => (await api.put(`/admin/users/${id}`, body)).data, onSuccess: invalidate }),
  };
}
export function useAudits(params: Record<string, unknown>) {
  return useQuery({ queryKey: ["audits", params], queryFn: async () => (await api.get<{ data: any[]; total: number }>("/admin/audits", { params })).data });
}

export function useBookingMutation() {
  const qc = useQueryClient();
  const invalidate = (id?: number) => {
    qc.invalidateQueries({ queryKey: ["bookings"] });
    if (id) qc.invalidateQueries({ queryKey: ["booking", id] });
  };
  return {
    addCharge: useMutation({
      mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        (await api.post<Booking>(`/bookings/${id}/charges`, body)).data,
      onSuccess: (_d, v) => invalidate(v.id),
    }),
    removeCharge: useMutation({
      mutationFn: async ({ id, chargeId }: { id: number; chargeId: number }) =>
        (await api.delete<Booking>(`/bookings/${id}/charges/${chargeId}`)).data,
      onSuccess: (_d, v) => invalidate(v.id),
    }),
    setFoods: useMutation({
      mutationFn: async ({ id, foods }: { id: number; foods: unknown[] }) =>
        (await api.put<Booking>(`/bookings/${id}/foods`, { foods })).data,
      onSuccess: (_d, v) => invalidate(v.id),
    }),
    cancel: useMutation({
      mutationFn: async (id: number) => (await api.post<Booking>(`/bookings/${id}/cancel`)).data,
      onSuccess: (_d, id) => invalidate(id),
    }),
    addDecorItem: useMutation({
      mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        (await api.post<Booking>(`/bookings/${id}/decor-items`, body)).data,
      onSuccess: (_d, v) => invalidate(v.id),
    }),
    removeDecorItem: useMutation({
      mutationFn: async ({ id, chargeId }: { id: number; chargeId: number }) =>
        (await api.delete<Booking>(`/bookings/${id}/decor-items/${chargeId}`)).data,
      onSuccess: (_d, v) => invalidate(v.id),
    }),
  };
}
