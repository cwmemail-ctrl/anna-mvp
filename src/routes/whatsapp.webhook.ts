import { createHmac } from "node:crypto";
import { Router } from "express";
import type { CoachingService } from "../services/coaching.service.js";
import type { WhatsAppClient } from "../whatsapp/client.interface.js";

// Minimaler, BSP-agnostischer Payload-Vertrag: solange der BSP nicht feststeht
// (siehe API_DOKUMENTATION.md "Offene Punkte"), akzeptiert dieser MVP ein
// generisches { from, text } -- ein späterer BSP-Adapter übersetzt zwischen
// dem echten Provider-Format und diesem einfachen Format.
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

    const payload = req.body as Partial<GenericWebhookPayload>;
    if (!payload?.from || !payload?.text) {
      console.warn("[webhook] Ungültiger Payload, wird ignoriert:", payload);
      return;
    }

    try {
      const whatsappNumberHash = hashNumber(payload.from, hashSecret);
      const outgoing = await coachingService.handleIncomingMessage({
        whatsappNumberHash,
        text: payload.text,
        receivedAt: new Date(),
      });
      for (const message of outgoing) {
        if (message.type === "text") {
          if (message.text) {
            await whatsAppClient.sendText(whatsappNumberHash, message.text);
          }
        } else if (message.type === "video") {
          await whatsAppClient.sendVideo(whatsappNumberHash, message.videoUrl, message.caption);
        } else if (message.type === "image") {
          await whatsAppClient.sendImage(whatsappNumberHash, message.imageUrl, message.caption);
        } else {
          await whatsAppClient.sendQuickReply(whatsappNumberHash, message.text, message.options);
        }
      }
    } catch (error) {
      console.error("[webhook] Fehler bei der Verarbeitung:", error);
    }
  });

  return router;
}

// DATENBANKSCHEMA.md: kein Klartext-Telefonnummer wird gespeichert.
// HMAC statt reinem SHA-256, damit die Nummer bei der begrenzten Zahl
// möglicher Telefonnummern nicht durch simples Ausprobieren (Rainbow-Table)
// rückgerechnet werden kann -- das Secret kommt aus der Konfiguration
// (siehe config/env.ts, WEBHOOK_HASH_SECRET).
function hashNumber(rawNumber: string, secret: string): string {
  return createHmac("sha256", secret).update(rawNumber).digest("hex");
}
