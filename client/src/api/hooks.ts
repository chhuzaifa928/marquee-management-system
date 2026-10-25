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
  };
}
