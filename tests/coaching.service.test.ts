import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyFeedbackEmoji } from "../src/services/coaching.service.js";

test("erkennt positives Feedback-Emoji", () => {
  assert.equal(classifyFeedbackEmoji("😄"), "EXERCISE_FEEDBACK_POSITIVE");
});

test("erkennt neutrales Feedback-Emoji", () => {
  assert.equal(classifyFeedbackEmoji("😐"), "EXERCISE_FEEDBACK_NEUTRAL");
});

test("erkennt negatives Feedback-Emoji", () => {
  assert.equal(classifyFeedbackEmoji("😢"), "EXERCISE_FEEDBACK_NEGATIVE");
});

test("toleriert Leerzeichen um das Emoji", () => {
  assert.equal(classifyFeedbackEmoji("  😄  "), "EXERCISE_FEEDBACK_POSITIVE");
});

test("liefert undefined fuer normalen Chat-Text", () => {
  assert.equal(classifyFeedbackEmoji("Danke, hat geholfen!"), undefined);
});

test("liefert undefined fuer leeren Text", () => {
  assert.equal(classifyFeedbackEmoji(""), undefined);
});
