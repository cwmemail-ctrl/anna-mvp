import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptNumber, encryptNumber } from "../src/whatsapp/numberCrypto.js";

const SECRET = "test-secret-fuer-verschluesselung";

test("encryptNumber/decryptNumber: Roundtrip liefert die urspruengliche Nummer zurueck", () => {
  const original = "+436703557333";
  const encrypted = encryptNumber(original, SECRET);
  assert.notEqual(encrypted, original); // tatsaechlich verschluesselt, kein Klartext
  assert.equal(decryptNumber(encrypted, SECRET), original);
});

test("encryptNumber: gleiche Nummer erzeugt unterschiedliche Ciphertexte (zufaelliger IV)", () => {
  const a = encryptNumber("+436703557333", SECRET);
  const b = encryptNumber("+436703557333", SECRET);
  assert.notEqual(a, b);
});

test("decryptNumber: falsches Secret schlaegt fehl statt falsches Ergebnis zu liefern", () => {
  const encrypted = encryptNumber("+436703557333", SECRET);
  assert.throws(() => decryptNumber(encrypted, "falsches-secret"));
});

test("decryptNumber: ungueltiges Format wirft einen klaren Fehler", () => {
  assert.throws(() => decryptNumber("kein-gueltiges-format", SECRET), /Ungültiges verschlüsseltes Format/);
});
