import type { EmployeeRepository } from "../db/employee.repository.js";
import type { UsageEventRepository } from "../db/usageEvent.repository.js";

export interface DashboardSummary {
  optInRate: number;
  weeklyActiveUsers: number;
  totalEmployeesOnboarded: number;
  escalationCount: number;
  // null nur noch, wenn im Zeitraum keine einzige Rueckmeldung vorliegt.
  // Datengrundlage: WEEKLY_CHECKIN-Events (siehe coaching.service.ts,
  // sendWeeklyCheckins) -- vorher immer null, weil es keinen woechentlichen
  // Check-in gab (siehe Chat-Antwort, Luecke 4).
  averageSelfReportedImprovement: number | null;
}

// Mindestgruppengroesse fuer Abteilungs-Auswertungen (siehe DATENBANKSCHEMA.md,
// "Offene Fragen": "keine Anzeige, wenn Abteilung < 5 Personen hat" -- dort
// bereits als Beispielwert genannt, hier als konkrete Konstante uebernommen).
// Verhindert Rueckschluesse auf Einzelpersonen bei kleinen Abteilungen.
export const MIN_DEPARTMENT_GROUP_SIZE = 5;

export async function computeCompanySummary(
  employees: EmployeeRepository,
  usageEvents: UsageEventRepository,
  companyId: string,
  from?: Date,
  to?: Date
): Promise<DashboardSummary> {
  const companyEmployees = await employees.listByCompany(companyId);
  const events = await usageEvents.listByCompany(companyId, from, to);
  return summarize(companyEmployees.length, companyEmployees.filter((e) => e.consentGivenAt).length, events);
}

export interface DepartmentSummary {
  departmentId: string;
  summary: DashboardSummary | null; // null, wenn unter MIN_DEPARTMENT_GROUP_SIZE
}

export async function computeDepartmentSummaries(
  employees: EmployeeRepository,
  usageEvents: UsageEventRepository,
  companyId: string,
  from?: Date,
  to?: Date
): Promise<DepartmentSummary[]> {
  const companyEmployees = await employees.listByCompany(companyId);
  const events = await usageEvents.listByCompany(companyId, from, to);

  const departmentIds = new Set(
    companyEmployees.map((e) => e.departmentId).filter((id): id is string => Boolean(id))
  );

  return [...departmentIds].map((departmentId) => {
    const deptEmployees = companyEmployees.filter((e) => e.departmentId === departmentId);
    // Regel: unter Mindestgruppengroesse keine Auswertung ausgeben, um
    // Rueckschluesse auf Einzelpersonen zu verhindern (siehe DATENBANKSCHEMA.md).
    if (deptEmployees.length < MIN_DEPARTMENT_GROUP_SIZE) {
      return { departmentId, summary: null };
    }
    const deptEvents = events.filter((e) => e.departmentId === departmentId);
    return {
      departmentId,
      summary: summarize(deptEmployees.length, deptEmployees.filter((e) => e.consentGivenAt).length, deptEvents),
    };
  });
}

function summarize(
  totalEmployees: number,
  consentedEmployees: number,
  events: Awaited<ReturnType<UsageEventRepository["listByCompany"]>>
): DashboardSummary {
  const escalationCount = events.filter((e) => e.eventType === "ESCALATION_TRIGGERED").length;
  const completedCount = events.filter((e) => e.eventType === "ONBOARDING_COMPLETED").length;
  // Näherung, kein exakter "eindeutige aktive Nutzer"-Wert: UsageEvent hat
  // bewusst keinen Employee-Bezug (siehe DATENBANKSCHEMA.md, Anonymisierung),
  // daher zaehlen wir verschickte Uebungen im Zeitraum als Aktivitaets-Proxy.
  const weeklyActiveUsers = events.filter((e) => e.eventType === "EXERCISE_SENT").length;

  const checkinScores = events
    .filter((e) => e.eventType === "WEEKLY_CHECKIN" && typeof e.value === "number")
    .map((e) => e.value as number);
  const averageSelfReportedImprovement =
    checkinScores.length > 0
      ? Number((checkinScores.reduce((sum, v) => sum + v, 0) / checkinScores.length).toFixed(2))
      : null;

  return {
    optInRate: totalEmployees > 0 ? Number((consentedEmployees / totalEmployees).toFixed(2)) : 0,
    weeklyActiveUsers,
    totalEmployeesOnboarded: completedCount,
    escalationCount,
    averageSelfReportedImprovement,
  };
}
