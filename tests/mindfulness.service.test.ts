import assert from "node:assert/strict";
import { test } from "node:test";
import { MINDFULNESS_QUOTES } from "../src/data/mindfulnessQuotes.data.js";
import { selectMindfulnessQuote } from "../src/services/mindfulness.service.js";

test("Alle 100 Achtsamkeitssprueche sind fachlich freigegeben (active:true)", () => {
  assert.equal(MINDFULNESS_QUOTES.length, 100);
  assert.ok(MINDFULNESS_QUOTES.every((q) => q.active === true));
  assert.ok(MINDFULNESS_QUOTES.every((q) => q.approvedBy.includes("Christian Walterscheid-Müller")));
});

test("Alle IDs sind eindeutig", () => {
  const ids = MINDFULNESS_QUOTES.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("selectMindfulnessQuote liefert einen der freigegebenen Sprueche", () => {
  const result = selectMindfulnessQuote();
  assert.ok(result);
  assert.equal(result?.active, true);
});

test("selectMindfulnessQuote liefert nie einen inaktiven Spruch, selbst wenn einer temporaer deaktiviert wird", () => {
  const target = MINDFULNESS_QUOTES[0];
  const originallyActive = target.active;
  target.active = false;
  try {
    for (let i = 0; i < 20; i++) {
      const result = selectMindfulnessQuote();
      assert.notEqual(result?.id, target.id);
    }
  } finally {
    target.active = originallyActive;
  }
});
