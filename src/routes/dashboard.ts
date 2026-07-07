import { Router } from "express";
import type { EmployeeRepository } from "../db/employee.repository.js";
import type { UsageEventRepository } from "../db/usageEvent.repository.js";
import { computeCompanySummary, computeDepartmentSummaries } from "../services/dashboard.service.js";
import { isAuthorized } from "../services/dashboardAuth.service.js";

// Einfacher, geteilter Token statt einzelner HR-Logins -- passend zum
// Piloten mit einem Unternehmen (siehe Chat-Antwort). DASHBOARD_API_TOKEN ist
// seit config/env.ts ein Pflichtfeld, der Server startet ohne gesetztes
// Token gar nicht erst (gleiches Muster wie WEBHOOK_HASH_SECRET).
export function createDashboardRouter(
  employees: EmployeeRepository,
  usageEvents: UsageEventRepository,
  dashboardApiToken: string
): Router {
  const router = Router();

  router.use((req, res, next) => {
    if (!isAuthorized(req.header("authorization"), dashboardApiToken)) {
      res.status(401).json({ error: "Nicht autorisiert -- Authorization: Bearer <token> erforderlich" });
      return;
    }
    next();
  });

  router.get("/dashboard/:companyId/summary", async (req, res) => {
    try {
      const { companyId } = req.params;
      const { from, to } = parseDateRange(req.query.from, req.query.to);
      const summary = await computeCompanySummary(employees, usageEvents, companyId, from, to);
      res.status(200).json(summary);
    } catch (error) {
      console.error("[dashboard] Fehler bei /summary:", error);
      res.status(500).json({ error: "Interner Fehler" });
    }
  });

  router.get("/dashboard/:companyId/departments", async (req, res) => {
    try {
      const { companyId } = req.params;
      const { from, to } = parseDateRange(req.query.from, req.query.to);
      const departments = await computeDepartmentSummaries(employees, usageEvents, companyId, from, to);
      res.status(200).json(departments);
    } catch (error) {
      console.error("[dashboard] Fehler bei /departments:", error);
      res.status(500).json({ error: "Interner Fehler" });
    }
  });

  return router;
}

// Query-Parameter aus API_DOKUMENTATION.md: from/to als ISO-Datum, beide optional.
function parseDateRange(fromRaw: unknown, toRaw: unknown): { from?: Date; to?: Date } {
  const from = typeof fromRaw === "string" && fromRaw ? new Date(fromRaw) : undefined;
  const to = typeof toRaw === "string" && toRaw ? new Date(toRaw) : undefined;
  return {
    from: from && !isNaN(from.getTime()) ? from : undefined,
    to: to && !isNaN(to.getTime()) ? to : undefined,
  };
}
