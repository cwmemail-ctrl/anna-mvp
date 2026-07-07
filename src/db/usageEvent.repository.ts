import { randomUUID } from "node:crypto";
import type { UsageEvent, UsageEventType } from "../types/domain.js";

export interface UsageEventRepository {
  log(companyId: string, eventType: UsageEventType, departmentId?: string, value?: number): Promise<UsageEvent>;
  // Fuer Dashboard-Aggregation (siehe dashboard.service.ts). Liefert nur
  // anonymisierte Zaehlereignisse zurueck -- kein Employee-Bezug moeglich,
  // das ist bewusst so (siehe Kommentar unten). Optionaler Zeitraum-Filter
  // ueber weekOf, passend zu den from/to-Query-Parametern in
  // API_DOKUMENTATION.md.
  listByCompany(companyId: string, from?: Date, to?: Date): Promise<UsageEvent[]>;
}

// Bewusst ohne Fremdschlüssel auf Employee (siehe DATENBANKSCHEMA.md) --
// das ist die strukturelle Absicherung gegen Re-Identifizierung, kein reines
// Zugriffsdetail. Diese Tabelle ist die einzige Grundlage für das Dashboard
// (siehe routes/dashboard.ts, services/dashboard.service.ts).
export class InMemoryUsageEventRepository implements UsageEventRepository {
  private readonly events: UsageEvent[] = [];

  async log(companyId: string, eventType: UsageEventType, departmentId?: string, value?: number): Promise<UsageEvent> {
    const event: UsageEvent = {
      id: randomUUID(),
      companyId,
      departmentId,
      eventType,
      weekOf: startOfWeek(new Date()),
      value,
    };
    this.events.push(event);
    return event;
  }

  async listByCompany(companyId: string, from?: Date, to?: Date): Promise<UsageEvent[]> {
    return this.events.filter((e) => {
      if (e.companyId !== companyId) return false;
      if (from && e.weekOf < from) return false;
      if (to && e.weekOf > to) return false;
      return true;
    });
  }
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Montag = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
