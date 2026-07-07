import assert from "node:assert/strict";
import { test } from "node:test";
import { isOptInCommand, isOptOutCommand } from "../src/services/optOut.service.js";

test("isOptOutCommand: erkennt 'Stop'", () => {
  assert.equal(isOptOutCommand("Stop"), true);
  assert.equal(isOptOutCommand("stopp bitte"), true);
});

test("isOptOutCommand: erkennt 'keine Nachrichten mehr'", () => {
  assert.equal(isOptOutCommand("Ich möchte keine Nachrichten mehr bekommen"), true);
});

test("isOptOutCommand: erkennt 'abmelden' und 'Pause'", () => {
  assert.equal(isOptOutCommand("Kannst du mich abmelden?"), true);
  assert.equal(isOptOutCommand("Ich brauche gerade eine Pause"), true);
});

test("isOptOutCommand: false bei normaler Nachricht", () => {
  assert.equal(isOptOutCommand("Danke, hat gut geholfen!"), false);
});

test("isOptInCommand: erkennt 'Start'", () => {
  assert.equal(isOptInCommand("Start"), true);
  assert.equal(isOptInCommand("ich will wieder Start machen"), true);
});

test("isOptInCommand: false bei normaler Nachricht", () => {
  assert.equal(isOptInCommand("Wie geht's?"), false);
});
