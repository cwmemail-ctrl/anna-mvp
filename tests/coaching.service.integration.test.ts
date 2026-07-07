import assert from "node:assert/strict";
import { test } from "node:test";
import { CoachingService } from "../src/services/coaching.service.js";
import { InMemoryEmployeeRepository } from "../src/db/employee.repository.js";
import { InMemoryConversationRepository } from "../src/db/conversation.repository.js";
import { InMemoryUsageEventRepository } from "../src/db/usageEvent.repository.js";
import { InMemoryBorderlineCaseRepository } from "../src/db/borderlineCase.repository.js";
import { MockAIClient } from "../src/ai/client.js";
import { HEALTH_TIPS } from "../src/data/healthTips.data.js";

function freshService() {
  const employees = new InMemoryEmployeeRepository();
  const conversations = new InMemoryConversationRepository();
  const usageEvents = new InMemoryUsageEventRepository();
  const borderlineCases = new InMemoryBorderlineCaseRepository();
  const service = new CoachingService(employees, conversations, usageEvents, new MockAIClient(), borderlineCases);
  return { service, employees, usageEvents };
}

async function completeOnboarding(service: CoachingService, hash: string) {
  await service.handleIncomingMessage({ whatsappNumberHash: hash, whatsappNumberEncrypted: "enc-test", text: "Hallo", receivedAt: new Date() });
  await service.handleIncomingMessage({ whatsappNumberHash: hash, whatsappNumberEncrypted: "enc-test", text: "Ja", receivedAt: new Date() });
  await service.handleIncomingMessage({ whatsappNumberHash: hash, whatsappNumberEncrypted: "enc-test", text: "1", receivedAt: new Date() });
  await service.handleIncomingMessage({ whatsappNumberHash: hash, whatsappNumberEncrypted: "enc-test", text: "Nein", receivedAt: new Date() }); // keine Beschwerden
  // Letzte Antwort (Stress-Frage) schliesst das Onboarding ab und enthaelt
  // die eigentlichen Uebungs-/Tipp-Nachrichten -- Rueckgabewert daher wichtig.
  return service.handleIncomingMessage({ whatsappNumberHash: hash, whatsappNumberEncrypted: "enc-test", text: "Nein", receivedAt: new Date() }); // nicht gestresst
}

test("Opt-out: 'Stop' setzt optedOut und stoppt weitere Coaching-Antworten", async () => {
  const { service, employees } = freshService();
  await completeOnboarding(service, "h1");

  const r1 = await service.handleIncomingMessage({ whatsappNumberHash: "h1", whatsappNumberEncrypted: "enc-test", text: "Stop", receivedAt: new Date() });
  assert.ok(r1[0].type === "text" && r1[0].text.includes("nicht mehr"));

  const employee = await employees.findByWhatsappHash("h1");
  assert.equal(employee?.optedOut, true);

  const r2 = await service.handleIncomingMessage({ whatsappNumberHash: "h1", whatsappNumberEncrypted: "enc-test", text: "Wie geht's?", receivedAt: new Date() });
  assert.ok(r2[0].type === "text" && r2[0].text.includes("abgemeldet"));
});

test("Opt-in: 'Start' nach Abmeldung setzt optedOut wieder zurueck", async () => {
  const { service, employees } = freshService();
  await completeOnboarding(service, "h1");
  await service.handleIncomingMessage({ whatsappNumberHash: "h1", whatsappNumberEncrypted: "enc-test", text: "Stop", receivedAt: new Date() });

  const r = await service.handleIncomingMessage({ whatsappNumberHash: "h1", whatsappNumberEncrypted: "enc-test", text: "Start", receivedAt: new Date() });
  assert.ok(r[0].type === "text" && r[0].text.includes("zurück"));

  const employee = await employees.findByWhatsappHash("h1");
  assert.equal(employee?.optedOut, false);
});

test("Eskalation funktioniert weiterhin, auch nach Abmeldung (Sicherheit hat Vorrang)", async () => {
  const { service } = freshService();
  await completeOnboarding(service, "h1");
  await service.handleIncomingMessage({ whatsappNumberHash: "h1", whatsappNumberEncrypted: "enc-test", text: "Stop", receivedAt: new Date() });

  const r = await service.handleIncomingMessage({
    whatsappNumberHash: "h1",
    whatsappNumberEncrypted: "enc-test",
    text: "Die Schmerzen strahlen jetzt ins Bein aus",
    receivedAt: new Date(),
  });
  assert.ok(r[0].type === "text" && r[0].text.includes("Arzt"));
});

test("sendDailyReminders: verschickt an abgeschlossene, nicht abgemeldete Mitarbeitende", async () => {
  const { service, usageEvents } = freshService();
  await completeOnboarding(service, "h1");

  const batches = await service.sendDailyReminders();
  assert.equal(batches.length, 1);
  assert.equal(batches[0].whatsappNumberEncrypted, "enc-test");

  const events = await usageEvents.listByCompany("pilot-company");
  const exerciseSentCount = events.filter((e) => e.eventType === "EXERCISE_SENT").length;
  assert.ok(exerciseSentCount >= 2); // Onboarding-Uebung + Erinnerung
});

test("sendDailyReminders: ueberspringt abgemeldete Mitarbeitende", async () => {
  const { service } = freshService();
  await completeOnboarding(service, "h1");
  await service.handleIncomingMessage({ whatsappNumberHash: "h1", whatsappNumberEncrypted: "enc-test", text: "Stop", receivedAt: new Date() });

  const batches = await service.sendDailyReminders();
  assert.equal(batches.length, 0);
});

test("sendDailyReminders: verschickt nicht zweimal am selben Tag", async () => {
  const { service } = freshService();
  await completeOnboarding(service, "h1");

  const first = await service.sendDailyReminders();
  assert.equal(first.length, 1);
  const second = await service.sendDailyReminders();
  assert.equal(second.length, 0);
});

test("sendWeeklyCheckins setzt awaitingWeeklyCheckin, Emoji-Antwort wird korrekt verarbeitet", async () => {
  const { service, employees, usageEvents } = freshService();
  await completeOnboarding(service, "h1");

  const batches = await service.sendWeeklyCheckins();
  assert.equal(batches.length, 1);

  const employee = await employees.findByWhatsappHash("h1");
  assert.equal(employee?.awaitingWeeklyCheckin, true);

  const r = await service.handleIncomingMessage({ whatsappNumberHash: "h1", whatsappNumberEncrypted: "enc-test", text: "🙂", receivedAt: new Date() });
  assert.ok(r[0].type === "text" && r[0].text.includes("Danke"));

  const updated = await employees.findByWhatsappHash("h1");
  assert.equal(updated?.awaitingWeeklyCheckin, false);

  const events = await usageEvents.listByCompany("pilot-company");
  const checkin = events.find((e) => e.eventType === "WEEKLY_CHECKIN");
  assert.equal(checkin?.value, 4); // 🙂 entspricht Score 4
});

test("Wochen-Check-in: ungueltige Antwort wird abgelehnt, awaitingWeeklyCheckin bleibt true", async () => {
  const { service, employees } = freshService();
  await completeOnboarding(service, "h1");
  await service.sendWeeklyCheckins();

  const r = await service.handleIncomingMessage({ whatsappNumberHash: "h1", whatsappNumberEncrypted: "enc-test", text: "sechs", receivedAt: new Date() });
  assert.ok(r[0].type === "text" && r[0].text.includes("😢"));

  const employee = await employees.findByWhatsappHash("h1");
  assert.equal(employee?.awaitingWeeklyCheckin, true);
});

test("Onboarding-Abschluss enthaelt keinen Gesundheitstipp mehr (kommt stattdessen ueber sendForenoonHealthTip)", async () => {
  const { service } = freshService();
  const messages = await completeOnboarding(service, "h1");
  const allText = messages.map((m) => (m.type === "text" ? m.text : "")).join(" ");
  assert.ok(!allText.includes("💡"));
});

test("sendDailyReminders enthaelt Guten-Morgen-Gruss (Achtsamkeitsspruch optional), aber keinen Gesundheitstipp mehr", async () => {
  const { service } = freshService();
  await completeOnboarding(service, "h1");
  const daily = await service.sendDailyReminders();
  const text = daily[0]?.messages.map((m) => (m.type === "text" ? m.text : "")).join(" ") ?? "";
  assert.ok(text.includes("Guten Morgen"));
  assert.ok(!text.includes("💡"));
});

test("sendForenoonHealthTip verschickt den Gesundheitstipp separat an abgeschlossene, nicht abgemeldete Mitarbeitende", async () => {
  const { service } = freshService();
  await completeOnboarding(service, "h1");
  const batches = await service.sendForenoonHealthTip();
  assert.equal(batches.length, 1);
  const text = batches[0].messages.map((m) => (m.type === "text" ? m.text : "")).join(" ");
  assert.ok(text.includes("💡"));
});

test("sendForenoonHealthTip verschickt nichts, wenn kein Tipp freigegeben ist", async () => {
  const originalStates = HEALTH_TIPS.map((t) => t.active);
  HEALTH_TIPS.forEach((t) => (t.active = false));
  try {
    const { service } = freshService();
    await completeOnboarding(service, "h1");
    const batches = await service.sendForenoonHealthTip();
    assert.equal(batches.length, 0);
  } finally {
    HEALTH_TIPS.forEach((t, i) => (t.active = originalStates[i]));
  }
});
