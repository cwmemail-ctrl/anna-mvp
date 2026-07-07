import assert from "node:assert/strict";
import { test } from "node:test";
import { processOnboardingAnswer } from "../src/services/onboarding.service.js";
import type { Employee } from "../src/types/domain.js";

function freshEmployee(): Employee {
  return {
    id: "e1",
    companyId: "c1",
    whatsappNumberHash: "hash",
    whatsappNumberEncrypted: "enc-test",
    onboardingStatus: "AWAITING_CONSENT",
    onboardingStep: "CONSENT",
    createdAt: new Date(),
  };
}

test("ohne Einwilligung wird kein consentGivenAt gesetzt und keine Gesundheitsfrage gestellt", () => {
  const outcome = processOnboardingAnswer(freshEmployee(), "Nein");
  assert.equal(outcome.employee.consentGivenAt, undefined);
  assert.equal(outcome.employee.onboardingStep, "CONSENT");
});

test("mit Einwilligung wird consentGivenAt gesetzt und die nächste Frage ist Tätigkeitsart", () => {
  const outcome = processOnboardingAnswer(freshEmployee(), "Ja");
  assert.ok(outcome.employee.consentGivenAt instanceof Date);
  assert.equal(outcome.employee.onboardingStep, "WORK_TYPE");
});

test("Taetigkeitsfrage fuehrt zur Beschwerden-Ja/Nein-Frage", () => {
  const employee: Employee = { ...freshEmployee(), onboardingStep: "WORK_TYPE", onboardingStatus: "IN_PROGRESS" };
  const outcome = processOnboardingAnswer(employee, "1"); // sitzend
  assert.equal(outcome.employee.workType, "SITTING");
  assert.equal(outcome.employee.onboardingStep, "COMPLAINT_CHECK");
});

test("Beschwerden-Frage mit Nein ueberspringt die Ort-Frage direkt zu Stress", () => {
  const employee: Employee = { ...freshEmployee(), onboardingStep: "COMPLAINT_CHECK", onboardingStatus: "IN_PROGRESS" };
  const outcome = processOnboardingAnswer(employee, "Nein");
  assert.equal(outcome.employee.onboardingStep, "STRESS_CHECK");
  assert.equal(outcome.employee.complaintLocation, undefined);
});

test("Beschwerden-Frage mit Ja fuehrt zur Freitext-Ort-Frage", () => {
  const employee: Employee = { ...freshEmployee(), onboardingStep: "COMPLAINT_CHECK", onboardingStatus: "IN_PROGRESS" };
  const outcome = processOnboardingAnswer(employee, "Ja");
  assert.equal(outcome.employee.onboardingStep, "COMPLAINT_LOCATION");
});

test("Freitext-Ort wird gespeichert und fuehrt weiter zur Stress-Frage", () => {
  const employee: Employee = { ...freshEmployee(), onboardingStep: "COMPLAINT_LOCATION", onboardingStatus: "IN_PROGRESS" };
  const outcome = processOnboardingAnswer(employee, "Rücken");
  assert.equal(outcome.employee.complaintLocation, "Rücken");
  assert.equal(outcome.employee.onboardingStep, "STRESS_CHECK");
});

test("Ort ohne passende Uebung fuehrt zur Rueckfrage statt direkt zu Stress", () => {
  const employee: Employee = { ...freshEmployee(), onboardingStep: "COMPLAINT_LOCATION", onboardingStatus: "IN_PROGRESS" };
  const outcome = processOnboardingAnswer(employee, "Ellenbogen");
  assert.equal(outcome.employee.onboardingStep, "COMPLAINT_NO_MATCH_CONFIRM");
  assert.equal(outcome.employee.complaintLocation, "Ellenbogen"); // schon gespeichert, falls "Ja"
  assert.ok(outcome.replyText.includes("Ellenbogen"));
});

test("Rueckfrage mit Ja behaelt complaintLocation und geht weiter zu Stress", () => {
  const employee: Employee = {
    ...freshEmployee(),
    onboardingStep: "COMPLAINT_NO_MATCH_CONFIRM",
    onboardingStatus: "IN_PROGRESS",
    complaintLocation: "Ellenbogen",
  };
  const outcome = processOnboardingAnswer(employee, "Ja");
  assert.equal(outcome.employee.complaintLocation, "Ellenbogen");
  assert.equal(outcome.employee.onboardingStep, "STRESS_CHECK");
});

test("Rueckfrage mit Nein loescht complaintLocation wieder", () => {
  const employee: Employee = {
    ...freshEmployee(),
    onboardingStep: "COMPLAINT_NO_MATCH_CONFIRM",
    onboardingStatus: "IN_PROGRESS",
    complaintLocation: "Ellenbogen",
  };
  const outcome = processOnboardingAnswer(employee, "Nein");
  assert.equal(outcome.employee.complaintLocation, undefined);
  assert.equal(outcome.employee.onboardingStep, "STRESS_CHECK");
});

test("vollständiger Durchlauf (ohne Beschwerden) setzt workType, feelsStressed und COMPLETED", () => {
  let employee = freshEmployee();
  employee = processOnboardingAnswer(employee, "Ja").employee;
  employee = processOnboardingAnswer(employee, "1").employee; // sitzend
  employee = processOnboardingAnswer(employee, "Nein").employee; // keine Beschwerden
  const finalOutcome = processOnboardingAnswer(employee, "Ja"); // gestresst: ja -- schliesst direkt ab

  assert.equal(finalOutcome.employee.workType, "SITTING");
  assert.equal(finalOutcome.employee.complaintLocation, undefined);
  assert.equal(finalOutcome.employee.feelsStressed, true);
  assert.equal(finalOutcome.employee.onboardingStatus, "COMPLETED");
  assert.equal(finalOutcome.completedJustNow, true);
});

test("vollständiger Durchlauf (mit Beschwerden) speichert complaintLocation", () => {
  let employee = freshEmployee();
  employee = processOnboardingAnswer(employee, "Ja").employee;
  employee = processOnboardingAnswer(employee, "1").employee; // sitzend
  employee = processOnboardingAnswer(employee, "Ja").employee; // hat Beschwerden
  employee = processOnboardingAnswer(employee, "Knie").employee; // wo?
  const finalOutcome = processOnboardingAnswer(employee, "Nein"); // nicht gestresst

  assert.equal(finalOutcome.employee.complaintLocation, "Knie");
  assert.equal(finalOutcome.employee.onboardingStatus, "COMPLETED");
});

test("Stress-Frage setzt feelsStressed=true bei Ja und schliesst das Onboarding ab", () => {
  const employee: Employee = {
    ...freshEmployee(),
    onboardingStep: "STRESS_CHECK",
    onboardingStatus: "IN_PROGRESS",
    workType: "SITTING",
  };
  const outcome = processOnboardingAnswer(employee, "Ja");
  assert.equal(outcome.employee.feelsStressed, true);
  assert.equal(outcome.employee.onboardingStep, "DONE");
  assert.equal(outcome.employee.onboardingStatus, "COMPLETED");
  assert.equal(outcome.completedJustNow, true);
});

test("Stress-Frage setzt feelsStressed=false bei Nein", () => {
  const employee: Employee = {
    ...freshEmployee(),
    onboardingStep: "STRESS_CHECK",
    onboardingStatus: "IN_PROGRESS",
    workType: "SITTING",
  };
  const outcome = processOnboardingAnswer(employee, "Nein");
  assert.equal(outcome.employee.feelsStressed, false);
});
