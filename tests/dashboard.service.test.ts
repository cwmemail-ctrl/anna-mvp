import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryEmployeeRepository } from "../src/db/employee.repository.js";
import { InMemoryUsageEventRepository } from "../src/db/usageEvent.repository.js";
import { computeCompanySummary, computeDepartmentSummaries, MIN_DEPARTMENT_GROUP_SIZE } from "../src/services/dashboard.service.js";

test("computeCompanySummary: optInRate berechnet sich aus Anzahl mit consentGivenAt", async () => {
  const employees = new InMemoryEmployeeRepository();
  const usageEvents = new InMemoryUsageEventRepository();

  const e1 = await employees.create("hash1", "enc-test", "company-a");
  await employees.update({ ...e1, consentGivenAt: new Date() });
  await employees.create("hash2", "enc-test", "company-a"); // keine Einwilligung

  const summary = await computeCompanySummary(employees, usageEvents, "company-a");
  assert.equal(summary.optInRate, 0.5);
});

test("computeCompanySummary: liefert 0 optInRate ohne Absturz, wenn keine Mitarbeitenden vorhanden sind", async () => {
  const employees = new InMemoryEmployeeRepository();
  const usageEvents = new InMemoryUsageEventRepository();
  const summary = await computeCompanySummary(employees, usageEvents, "company-leer");
  assert.equal(summary.optInRate, 0);
  assert.equal(summary.totalEmployeesOnboarded, 0);
});

test("computeCompanySummary: zaehlt ESCALATION_TRIGGERED-Events korrekt", async () => {
  const employees = new InMemoryEmployeeRepository();
  const usageEvents = new InMemoryUsageEventRepository();
  await usageEvents.log("company-a", "ESCALATION_TRIGGERED");
  await usageEvents.log("company-a", "ESCALATION_TRIGGERED");
  await usageEvents.log("company-a", "EXERCISE_SENT");

  const summary = await computeCompanySummary(employees, usageEvents, "company-a");
  assert.equal(summary.escalationCount, 2);
  assert.equal(summary.weeklyActiveUsers, 1);
});

test("computeCompanySummary: averageSelfReportedImprovement ist null ohne Check-in-Daten", async () => {
  const employees = new InMemoryEmployeeRepository();
  const usageEvents = new InMemoryUsageEventRepository();
  const summary = await computeCompanySummary(employees, usageEvents, "company-a");
  assert.equal(summary.averageSelfReportedImprovement, null);
});

test("computeCompanySummary: averageSelfReportedImprovement berechnet den Durchschnitt aus WEEKLY_CHECKIN-Werten", async () => {
  const employees = new InMemoryEmployeeRepository();
  const usageEvents = new InMemoryUsageEventRepository();
  await usageEvents.log("company-a", "WEEKLY_CHECKIN", undefined, 4);
  await usageEvents.log("company-a", "WEEKLY_CHECKIN", undefined, 2);

  const summary = await computeCompanySummary(employees, usageEvents, "company-a");
  assert.equal(summary.averageSelfReportedImprovement, 3);
});

test("computeDepartmentSummaries: unter Mindestgruppengroesse liefert null statt Zahlen", async () => {
  const employees = new InMemoryEmployeeRepository();
  const usageEvents = new InMemoryUsageEventRepository();

  for (let i = 0; i < MIN_DEPARTMENT_GROUP_SIZE - 1; i++) {
    const e = await employees.create(`hash-${i}`, "enc-test", "company-a");
    await employees.update({ ...e, departmentId: "housekeeping" });
  }

  const result = await computeDepartmentSummaries(employees, usageEvents, "company-a");
  assert.equal(result.length, 1);
  assert.equal(result[0].departmentId, "housekeeping");
  assert.equal(result[0].summary, null);
});

test("computeDepartmentSummaries: ab Mindestgruppengroesse werden echte Zahlen geliefert", async () => {
  const employees = new InMemoryEmployeeRepository();
  const usageEvents = new InMemoryUsageEventRepository();

  for (let i = 0; i < MIN_DEPARTMENT_GROUP_SIZE; i++) {
    const e = await employees.create(`hash-${i}`, "enc-test", "company-a");
    await employees.update({ ...e, departmentId: "service" });
  }

  const result = await computeDepartmentSummaries(employees, usageEvents, "company-a");
  assert.equal(result.length, 1);
  assert.notEqual(result[0].summary, null);
});
