import assert from "node:assert/strict";
import { test } from "node:test";
import { checkForEscalation, containsForbiddenMedicalLanguage, isBorderlinePainMention } from "../src/services/escalation.service.js";

test("erkennt starke, zunehmende Schmerzen", () => {
  const result = checkForEscalation("Die Schmerzen im Rücken werden seit gestern immer schlimmer");
  assert.equal(result.escalate, true);
});

test("erkennt ausstrahlende Schmerzen", () => {
  const result = checkForEscalation("Mein Rücken tut weh und es strahlt bis ins Bein aus");
  assert.equal(result.escalate, true);
});

test("erkennt Taubheit", () => {
  const result = checkForEscalation("Mein Arm fühlt sich taub an");
  assert.equal(result.escalate, true);
});

test("erkennt Kribbeln", () => {
  const result = checkForEscalation("Ich habe ein Kribbeln in den Fingern");
  assert.equal(result.escalate, true);
});

test("erkennt Schwäche", () => {
  const result = checkForEscalation("Ich habe Schwäche im Bein und kann kaum stehen");
  assert.equal(result.escalate, true);
});

test("erkennt Schmerzen nach Sturz", () => {
  const result = checkForEscalation("Ich bin gestern gestürzt und jetzt tut alles weh");
  assert.equal(result.escalate, true);
});

test("erkennt Schmerzen mit Fieber", () => {
  const result = checkForEscalation("Ich habe Rückenschmerzen und Fieber seit heute Morgen");
  assert.equal(result.escalate, true);
});

test("erkennt explizite Bitte um medizinischen Rat", () => {
  const result = checkForEscalation("Was hab ich da wohl, soll ich zum Arzt gehen?");
  assert.equal(result.escalate, true);
});

test("eskaliert NICHT bei normaler, leichter Verspannung", () => {
  const result = checkForEscalation("Mein Nacken ist heute ein bisschen verspannt vom Sitzen");
  assert.equal(result.escalate, false);
});

test("eskaliert NICHT bei allgemeinem Feedback zur Übung", () => {
  const result = checkForEscalation("Die Übung von gestern hat mir gut getan, danke!");
  assert.equal(result.escalate, false);
});

test("erkennt verbotene Begriffe in AI-Antworten (Diagnose)", () => {
  assert.equal(containsForbiddenMedicalLanguage("Das klingt nach einer möglichen Diagnose von..."), true);
});

test("erkennt verbotene Begriffe in AI-Antworten (Behandlung)", () => {
  assert.equal(containsForbiddenMedicalLanguage("Ich empfehle folgende Behandlung:"), true);
});

test("erlaubt normale Coaching-Sprache", () => {
  assert.equal(containsForbiddenMedicalLanguage("Hier ist eine kurze Übung für dich."), false);
});

test("isBorderlinePainMention: erkennt Schmerz-Erwaehnung ohne echtes Warnsignal", () => {
  assert.equal(isBorderlinePainMention("Mein Ellenbogen tut ein bisschen weh"), true);
  assert.equal(checkForEscalation("Mein Ellenbogen tut ein bisschen weh").escalate, false);
});

test("isBorderlinePainMention: liefert false bei Nachrichten ohne Schmerz-Bezug", () => {
  assert.equal(isBorderlinePainMention("Danke, hat gut geholfen!"), false);
});
