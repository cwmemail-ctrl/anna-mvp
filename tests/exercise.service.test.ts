import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildExerciseOutgoingMessages,
  excludeLast,
  formatExerciseMessage,
  hasExerciseForComplaint,
  selectExerciseFor,
  selectStressReliefExercise,
} from "../src/services/exercise.service.js";
import type { Exercise } from "../src/types/domain.js";

function baseExercise(overrides: Partial<Exercise>): Exercise {
  return {
    id: "t1",
    name: "Test-Übung",
    situation: "sitzend",
    durationSeconds: 60,
    description: "Testbeschreibung.",
    approvedBy: "TEST",
    active: true,
    ...overrides,
  };
}

test("direkte mp4-URL wird als Video versendet", () => {
  const messages = buildExerciseOutgoingMessages(baseExercise({ videoUrl: "https://example.com/uebung.mp4" }));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "video");
});

test("youtu.be-Link wird NICHT als Video versendet, sondern als Text mit Link", () => {
  const messages = buildExerciseOutgoingMessages(baseExercise({ videoUrl: "https://youtu.be/MerXb9LnikA" }));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "text");
  if (messages[0].type === "text") {
    assert.ok(messages[0].text.includes("https://youtu.be/MerXb9LnikA"));
  }
});

test("youtube.com/watch-Link wird ebenfalls als Text behandelt", () => {
  const messages = buildExerciseOutgoingMessages(
    baseExercise({ videoUrl: "https://www.youtube.com/watch?v=MerXb9LnikA" })
  );
  assert.equal(messages[0].type, "text");
});

test("nur imageUrl gesetzt -> Bild-Nachricht", () => {
  const messages = buildExerciseOutgoingMessages(baseExercise({ imageUrl: "https://example.com/bild.jpg" }));
  assert.equal(messages[0].type, "image");
});

test("weder videoUrl noch imageUrl -> Text-Fallback", () => {
  const messages = buildExerciseOutgoingMessages(baseExercise({}));
  assert.equal(messages[0].type, "text");
});

test("selectExerciseFor liefert eine Nicht-Stress-Uebung", () => {
  const result = selectExerciseFor();
  assert.ok(result);
  assert.notEqual(result.forStress, true);
});

test("selectExerciseFor schliesst lastExerciseId aus, wenn Alternative im Pool vorhanden", () => {
  const first = selectExerciseFor();
  const second = selectExerciseFor(first.id);
  assert.notEqual(second.id, first.id);
});

test("excludeLast liefert trotzdem ein Ergebnis, wenn nur eine Uebung im Pool ist", () => {
  // Synthetischer 1-Elemente-Pool statt echter Bibliotheksdaten -- bleibt
  // unabhaengig davon korrekt, wie viele Uebungen die Bibliothek gerade hat
  // (das aendert sich ohnehin bald mit den 90 Videos).
  const singleItemPool = [baseExercise({ id: "only-one" })];
  const result = excludeLast(singleItemPool, "only-one");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "only-one");
});

test("selectStressReliefExercise liefert eine der drei forStress-Uebungen", () => {
  const result = selectStressReliefExercise();
  assert.ok(result);
  assert.equal(result?.forStress, true);
});

test("selectStressReliefExercise schliesst lastExerciseId aus", () => {
  const first = selectStressReliefExercise();
  const second = selectStressReliefExercise(first?.id);
  assert.notEqual(second?.id, first?.id);
});

test("formatExerciseMessage: dynamische Uebung bekommt Serien/Wiederholungs-Hinweis", () => {
  const text = formatExerciseMessage(baseExercise({}));
  assert.ok(text.includes("4 Serien mit je 10 Wiederholungen"));
});

test("formatExerciseMessage: isometrische Uebung bekommt Halte-Hinweis statt Wiederholungen", () => {
  const text = formatExerciseMessage(baseExercise({ isometric: true }));
  assert.ok(text.includes("Halte die Position 45 Sek."));
  assert.ok(!text.includes("Wiederholungen"));
});

test("formatExerciseMessage: Stress-Uebung bekommt keinen Trainings-Hinweis, auch wenn isometric gesetzt waere", () => {
  const text = formatExerciseMessage(baseExercise({ forStress: true, isometric: true }));
  assert.ok(!text.includes("Halte die Position"));
  assert.ok(!text.includes("Wiederholungen"));
});

test("formatExerciseMessage: individuelle sets/repetitions ueberschreiben die Standardwerte 4/10", () => {
  const text = formatExerciseMessage(baseExercise({ sets: 6, repetitions: 12 }));
  assert.ok(text.includes("6 Serien mit je 12 Wiederholungen"));
  assert.ok(!text.includes("4 Serien"));
});

test("formatExerciseMessage: individuelle sets/holdSeconds bei isometrischen Uebungen ueberschreiben 4/45", () => {
  const text = formatExerciseMessage(baseExercise({ isometric: true, sets: 3, holdSeconds: 30 }));
  assert.ok(text.includes("Halte die Position 30 Sek., 3 Serien"));
});

test("selectExerciseFor beruecksichtigt complaintLocation per Textabgleich", () => {
  // "ruecken" kommt in mehreren echten Bibliothekstexten vor (z. B. bei
  // Superman-Varianten) -- Ergebnis muss das Wort in Name/Beschreibung enthalten.
  const result = selectExerciseFor(undefined, "rücken");
  const text = `${result.name} ${result.description}`.toLowerCase();
  assert.ok(text.includes("rücken"));
});

test("selectExerciseFor faellt bei unbekanntem Stichwort auf den vollen Pool zurueck", () => {
  // Erfundenes Wort, das in keiner Beschreibung vorkommt -- darf nicht crashen,
  // liefert stattdessen irgendeine gueltige Uebung.
  const result = selectExerciseFor(undefined, "xyzzynonexistent");
  assert.ok(result);
  assert.notEqual(result.forStress, true);
});

test("hasExerciseForComplaint: true bei bekanntem Stichwort (ruecken)", () => {
  assert.equal(hasExerciseForComplaint("rücken"), true);
});

test("hasExerciseForComplaint: false bei erfundenem Stichwort", () => {
  assert.equal(hasExerciseForComplaint("ellenbogen"), false);
});

test("hasExerciseForComplaint: true ohne Angabe (keine Beschwerde -- kein Problem)", () => {
  assert.equal(hasExerciseForComplaint(undefined), true);
  assert.equal(hasExerciseForComplaint(""), true);
});
