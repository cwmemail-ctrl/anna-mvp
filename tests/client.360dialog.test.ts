import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { Dialog360WhatsAppClient } from "../src/whatsapp/client.360dialog.js";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function mockFetch(capture: { url?: string; init?: RequestInit }, ok = true) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    capture.url = url;
    capture.init = init;
    return {
      ok,
      status: ok ? 200 : 400,
      text: async () => (ok ? "" : "Fehlerdetails vom Server"),
    } as Response;
  }) as typeof fetch;
}

test("sendText: sendet korrekte Payload an /messages mit API-Key-Header", async () => {
  const capture: { url?: string; init?: RequestInit } = {};
  mockFetch(capture);
  const client = new Dialog360WhatsAppClient("test-key", "https://waba-sandbox.360dialog.io/v1");

  await client.sendText("+43 670 3557333", "Hallo Anna");

  assert.equal(capture.url, "https://waba-sandbox.360dialog.io/v1/messages");
  const headers = capture.init?.headers as Record<string, string>;
  assert.equal(headers["D360-API-KEY"], "test-key");
  const body = JSON.parse(capture.init?.body as string);
  assert.equal(body.to, "436703557333"); // ohne +, Leerzeichen entfernt
  assert.equal(body.type, "text");
  assert.equal(body.text.body, "Hallo Anna");
});

test("sendVideo: baut korrekten video-Payload mit Caption", async () => {
  const capture: { url?: string; init?: RequestInit } = {};
  mockFetch(capture);
  const client = new Dialog360WhatsAppClient("test-key", "https://waba-sandbox.360dialog.io/v1");

  await client.sendVideo("436701234567", "https://example.com/video.mp4", "Testübung");

  const body = JSON.parse(capture.init?.body as string);
  assert.equal(body.type, "video");
  assert.equal(body.video.link, "https://example.com/video.mp4");
  assert.equal(body.video.caption, "Testübung");
});

test("sendQuickReply: bis zu 3 Optionen nutzen interaktive Buttons", async () => {
  const capture: { url?: string; init?: RequestInit } = {};
  mockFetch(capture);
  const client = new Dialog360WhatsAppClient("test-key", "https://waba-sandbox.360dialog.io/v1");

  await client.sendQuickReply("436701234567", "Wie war's?", ["😄", "😐", "😢"]);

  const body = JSON.parse(capture.init?.body as string);
  assert.equal(body.interactive.type, "button");
  assert.equal(body.interactive.action.buttons.length, 3);
  assert.equal(body.interactive.action.buttons[0].reply.title, "😄");
});

test("sendQuickReply: mehr als 3 Optionen nutzen eine Liste statt Buttons (WhatsApp-Limit)", async () => {
  const capture: { url?: string; init?: RequestInit } = {};
  mockFetch(capture);
  const client = new Dialog360WhatsAppClient("test-key", "https://waba-sandbox.360dialog.io/v1");

  await client.sendQuickReply("436701234567", "Wie geht es dir?", ["😢", "😟", "😐", "🙂", "😄"]);

  const body = JSON.parse(capture.init?.body as string);
  assert.equal(body.interactive.type, "list");
  assert.equal(body.interactive.action.sections[0].rows.length, 5);
});

test("wirft einen Fehler mit Statuscode und Serverdetails bei fehlgeschlagenem Versand", async () => {
  const capture: { url?: string; init?: RequestInit } = {};
  mockFetch(capture, false);
  const client = new Dialog360WhatsAppClient("test-key", "https://waba-sandbox.360dialog.io/v1");

  await assert.rejects(() => client.sendText("436701234567", "Hallo"), /400/);
});
