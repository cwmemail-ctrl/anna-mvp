import { createHmac } from "node:crypto";
import { Router } from "express";
import type { CoachingService } from "../services/coaching.service.js";
import { parseDialog360Webhook } from "../whatsapp/dialog360.webhook.parser.js";
import type { WhatsAppClient } from "../whatsapp/client.interface.js";
import { encryptNumber } from "../whatsapp/numberCrypto.js";

// Minimaler Test-Payload fuer lokale curl-Tests (siehe SETUP.md) -- der
// echte 360dialog-Payload wird zuerst versucht (parseDialog360Webhook),
// dieser einfache Fallback greift nur, wenn das nicht passt.
interface GenericWebhookPayload {
  from: string;
  text: string;
}

export function createWhatsAppWebhookRouter(
  coachingService: CoachingService,
  whatsAppClient: WhatsAppClient,
  hashSecret: string
): Router {
  const router = Router();

  router.post("/webhook/whatsapp", async (req, res) => {
    // WhatsApp erwartet eine schnelle 200-Bestätigung (siehe API_DOKUMENTATION.md).
    // Wir bestätigen sofort und verarbeiten synchron im Hintergrund weiter --
    // für den MVP ohne Queue, da das Nachrichtenvolumen im Pilot gering ist.
    res.status(200).end();

    const parsed = parseDialog360Webhook(req.body) ?? parseGenericPayload(req.body);
    if (!parsed) {
      console.warn("[webhook] Ungültiger oder nicht relevanter Payload, wird ignoriert:", JSON.stringify(req.body, null, 2));
      return;
    }

    try {
      const whatsappNumberHash = hashNumber(parsed.from, hashSecret);
      const whatsappNumberEncrypted = encryptNumber(parsed.from, hashSecret);
      const outgoing = await coachingService.handleIncomingMessage({
        whatsappNumberHash,
        whatsappNumberEncrypted,
        text: parsed.text,
        receivedAt: new Date(),
      });
      // Direkter Antwortversand innerhalb desselben Requests: die echte
      // Nummer (parsed.from) ist hier ohnehin schon vorhanden, daher keine
      // Notwendigkeit, ueber whatsappNumberEncrypted zu entschluesseln (das
      // ist nur fuer spaeteren, unabhaengigen Scheduler-Versand noetig,
      // siehe routes/jobs.ts).
      //
      // Jede Nachricht einzeln try/catch: ein fehlgeschlagenes Video (z. B.
      // wenn WhatsApp die Datei nicht laden kann) darf nicht die restlichen
      // Nachrichten derselben Antwort (z. B. Feedback-Buttons) verhindern.
      for (const message of outgoing) {
        try {
          if (message.type === "text") {
            if (message.text) {
              await whatsAppClient.sendText(parsed.from, message.text);
            }
          } else if (message.type === "video") {
            await whatsAppClient.sendVideo(parsed.from, message.videoUrl, message.caption);
          } else if (message.type === "image") {
            await whatsAppClient.sendImage(parsed.from, message.imageUrl, message.caption);
          } else {
            await whatsAppClient.sendQuickReply(parsed.from, message.text, message.options);
          }
        } catch (sendError) {
          console.error(`[webhook] Versand einer ${message.type}-Nachricht fehlgeschlagen:`, sendError);
        }
      }
    } catch (error) {
      console.error("[webhook] Fehler bei der Verarbeitung:", error);
    }
  });

  return router;
}

function parseGenericPayload(rawBody: unknown): { from: string; text: string } | null {
  const payload = rawBody as Partial<GenericWebhookPayload>;
  if (!payload?.from || !payload?.text) return null;
  return { from: payload.from, text: payload.text };
}

// DATENBANKSCHEMA.md: kein Klartext-Telefonnummer wird gespeichert.
// HMAC statt reinem SHA-256, damit die Nummer bei der begrenzten Zahl
// möglicher Telefonnummern nicht durch simples Ausprobieren (Rainbow-Table)
// rückgerechnet werden kann -- das Secret kommt aus der Konfiguration
// (siehe config/env.ts, WEBHOOK_HASH_SECRET). Bewusst irreversibel, dient
// nur dem Datenbank-Lookup/der Wiedererkennung -- fuer aktives Versenden
// wird stattdessen die reversibel verschluesselte Nummer verwendet (siehe
// whatsapp/numberCrypto.ts).
function hashNumber(rawNumber: string, secret: string): string {
  return createHmac("sha256", secret).update(rawNumber).digest("hex");
}
