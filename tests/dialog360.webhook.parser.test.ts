import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDialog360Webhook } from "../src/whatsapp/dialog360.webhook.parser.js";

function textPayload(from: string, body: string) {
  return {
    entry: [{ changes: [{ value: { messages: [{ from, type: "text", text: { body } }] } }] }],
  };
}

test("parseDialog360Webhook: extrahiert normale Text-Nachricht", () => {
  const result = parseDialog360Webhook(textPayload("436701234567", "Hallo"));
  assert.deepEqual(result, { from: "436701234567", text: "Hallo" });
});

test("parseDialog360Webhook: extrahiert Button-Antwort als Text", () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { from: "436701234567", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "opt_0", title: "Ja" } } },
              ],
            },
          },
        ],
      },
    ],
  };
  const result = parseDialog360Webhook(payload);
  assert.deepEqual(result, { from: "436701234567", text: "Ja" });
});

test("parseDialog360Webhook: extrahiert Listen-Antwort als Text", () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { from: "436701234567", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "opt_2", title: "😐" } } },
              ],
            },
          },
        ],
      },
    ],
  };
  const result = parseDialog360Webhook(payload);
  assert.deepEqual(result, { from: "436701234567", text: "😐" });
});

test("parseDialog360Webhook: liefert null bei fehlenden Nachrichten (z.B. reine Status-Updates)", () => {
  const payload = { entry: [{ changes: [{ value: {} }] }] };
  assert.equal(parseDialog360Webhook(payload), null);
});

test("parseDialog360Webhook: liefert null bei komplett leerem/fremdem Payload", () => {
  assert.equal(parseDialog360Webhook({}), null);
  assert.equal(parseDialog360Webhook(null), null);
  assert.equal(parseDialog360Webhook("irgendein string"), null);
});
