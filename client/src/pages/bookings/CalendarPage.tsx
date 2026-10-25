import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCalendar, useHalls } from "../../api/hooks";
import { STATUS_COLORS } from "../../lib/format";
import { Button, Card, inputClass, PageHeader } from "../../components/ui";

export function CalendarPage() {
  const { data: halls } = useHalls();
  const [hallId, setHallId] = useState<number | null>(null);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
  });

  const effectiveHall = hallId ?? halls?.[0]?.id ?? null;
  const monthIso = cursor.toISOString();
  const { data: events } = useCalendar(effectiveHall, monthIso);

  const byDay = useMemo(() => {
    const map = new Map<string, typeof events>();
    for (const e of events ?? []) {
      const key = new Date(e.eventDate).toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  const cells = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const monthLabel = cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  const shift = (delta: number) =>
    setCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + delta, 1)));

  return (
    <div>
      <PageHeader
        title="Calendar"
        icon="📅"
        actions={<Link to="/bookings" className="text-sm text-pearl-600 hover:underline">← List view</Link>}
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            className={inputClass + " max-w-xs"}
            value={effectiveHall ?? ""}
            onChange={(e) => setHallId(Number(e.target.value))}
          >
            {halls?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={() => shift(-1)}>←</Button>
            <span className="min-w-[160px] text-center font-medium text-pearl-800">{monthLabel}</span>
            <Button variant="ghost" onClick={() => shift(1)}>→</Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-7 gap-px bg-pearl-100 text-center text-xs font-medium text-pearl-500">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="bg-white py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-pearl-100">
          {cells.map((cell, i) => {
            const key = cell?.toISOString().slice(0, 10);
            const dayEvents = key ? byDay.get(key) ?? [] : [];
            return (
              <div key={i} className="min-h-[96px] bg-white p-1.5 align-top">
                {cell && (
                  <>
                    <div className="mb-1 text-xs text-pearl-400">{cell.getUTCDate()}</div>
                    <div className="space-y-1">
                      {dayEvents.map((e) => (
                        <Link
                          key={e.id}
                          to={`/bookings/${e.id}`}
                          className={`block truncate rounded px-1.5 py-0.5 text-[11px] ${STATUS_COLORS[e.status] ?? "bg-gray-100"}`}
                          title={`${e.customer} · ${e.slot} · ${e.guests} guests`}
                        >
                          {e.slot === "lunch" ? "☀" : "🌙"} {e.customer}
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function buildMonthGrid(monthStart: Date): (Date | null)[] {
  const year = monthStart.getUTCFullYear();
  const month = monthStart.getUTCMonth();
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(Date.UTC(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
