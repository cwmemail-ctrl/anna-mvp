import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Getrennt von der irreversiblen HMAC-Pruefsumme (whatsappNumberHash, siehe
// routes/whatsapp.webhook.ts) -- die dient nur der Wiedererkennung/dem
// Datenbank-Lookup und darf bewusst NICHT rueckrechenbar sein. Diese Datei
// loest ein anderes Problem: Um spaeter aktiv eine Nachricht zu verschicken
// (z. B. taeglicher Erinnerungs-Scheduler), muss die ECHTE Nummer wieder
// verfuegbar sein -- aus einem Hash laesst sich niemals zurueckrechnen, aus
// einer Verschluesselung mit bekanntem Schluessel schon. Die Nummer steht
// dabei weiterhin nie im Klartext in der Datenbank (DATENBANKSCHEMA.md).
const ALGORITHM = "aes-256-gcm";

function deriveKey(secret: string): Buffer {
  // WEBHOOK_HASH_SECRET beliebiger Laenge auf die von AES-256 geforderten
  // 32 Byte bringen.
  return createHash("sha256").update(secret).digest();
}

export function encryptNumber(rawNumber: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12); // GCM-Standard: 12 Byte IV
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(rawNumber, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv:authTag:ciphertext, jeweils hex-kodiert, durch Doppelpunkt getrennt
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptNumber(encrypted: string, secret: string): string {
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Ungültiges verschlüsseltes Format -- erwartet iv:authTag:ciphertext");
  }
  const key = deriveKey(secret);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
}
