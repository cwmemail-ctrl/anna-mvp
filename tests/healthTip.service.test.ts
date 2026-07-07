import assert from "node:assert/strict";
import { test } from "node:test";
import { HEALTH_TIPS } from "../src/data/healthTips.data.js";
import { selectHealthTip } from "../src/services/healthTip.service.js";

test("55 Tipps sind fachlich freigegeben (active:true), nach Pruefung durch den Physiotherapeuten", () => {
  const activeTips = HEALTH_TIPS.filter((tip) => tip.active);
  assert.equal(activeTips.length, 55);
  assert.ok(activeTips.every((tip) => tip.approvedBy.includes("Christian Walterscheid-Müller")));
});

test("selectHealthTip liefert einen der freigegebenen Tipps", () => {
  const result = selectHealthTip();
  assert.ok(result);
  assert.equal(result?.active, true);
});

test("selectHealthTip liefert nie einen inaktiven Tipp, selbst wenn einer temporaer deaktiviert wird", () => {
  const target = HEALTH_TIPS[0];
  const originallyActive = target.active;
  target.active = false;
  try {
    for (let i = 0; i < 20; i++) {
      const result = selectHealthTip();
      assert.notEqual(result?.id, target.id);
    }
  } finally {
    target.active = originallyActive; // Testzustand zuruecksetzen
  }
});
