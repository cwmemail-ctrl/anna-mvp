import { Router } from "express";
import type { CoachingService } from "../services/coaching.service.js";
import { isAuthorized } from "../services/dashboardAuth.service.js";
import type { WhatsAppClient } from "../whatsapp/client.interface.js";
import { decryptNumber } from "../whatsapp/numberCrypto.js";

// Fuer einen externen Trigger gedacht (z. B. Render Cron Job oder ein
// Dienst wie cron-job.org), NICHT fuer einen In-Process-Timer -- siehe
// Kommentar bei CoachingService.sendDailyReminders(). Der aufrufende Dienst
// entscheidet, WANN (z. B. taeglich 8 Uhr), diese Route entscheidet nur WAS
// passiert, wenn sie aufgerufen wird.
export function createJobsRouter(
  coachingService: CoachingService,
  whatsAppClient: WhatsAppClient,
  jobTriggerToken: string,
  hashSecret: string
): Router {
  const router = Router();

  router.use((req, res, next) => {
    if (!isAuthorized(req.header("authorization"), jobTriggerToken)) {
      res.status(401).json({ error: "Nicht autorisiert -- Authorization: Bearer <token> erforderlich" });
      return;
    }
    next();
  });

  router.post("/jobs/daily-reminders", async (_req, res) => {
    try {
      const batches = await coachingService.sendDailyReminders();
      await sendAllBatches(whatsAppClient, batches, hashSecret);
      res.status(200).json({ sent: batches.length });
    } catch (error) {
      console.error("[jobs] Fehler bei /daily-reminders:", error);
      res.status(500).json({ error: "Interner Fehler" });
    }
  });

  router.post("/jobs/weekly-checkin", async (_req, res) => {
    try {
      const batches = await coachingService.sendWeeklyCheckins();
      await sendAllBatches(whatsAppClient, batches, hashSecret);
      res.status(200).json({ sent: batches.length });
    } catch (error) {
      console.error("[jobs] Fehler bei /weekly-checkin:", error);
      res.status(500).json({ error: "Interner Fehler" });
    }
  });

  router.post("/jobs/forenoon-health-tip", async (_req, res) => {
    try {
      const batches = await coachingService.sendForenoonHealthTip();
      await sendAllBatches(whatsAppClient, batches, hashSecret);
      res.status(200).json({ sent: batches.length });
    } catch (error) {
      console.error("[jobs] Fehler bei /forenoon-health-tip:", error);
      res.status(500).json({ error: "Interner Fehler" });
    }
  });

  return router;
}

// Gleiches Versand-Prinzip wie routes/whatsapp.webhook.ts, aber mit einem
// zusaetzlichen Schritt: hier liegt (anders als beim Webhook, wo die Rohnummer
// noch im selben Request verfuegbar ist) keine Rohnummer vor -- nur die beim
// Employee gespeicherte, reversibel verschluesselte Nummer. Die wird hier
// entschluesselt, unmittelbar bevor tatsaechlich gesendet wird.
async function sendAllBatches(
  whatsAppClient: WhatsAppClient,
  batches: Array<{ whatsappNumberEncrypted: string; messages: import("../types/domain.js").OutgoingMessage[] }>,
  hashSecret: string
): Promise<void> {
  for (const batch of batches) {
    const whatsappNumber = decryptNumber(batch.whatsappNumberEncrypted, hashSecret);
    for (const message of batch.messages) {
      try {
        if (message.type === "text") await whatsAppClient.sendText(whatsappNumber, message.text);
        else if (message.type === "video") await whatsAppClient.sendVideo(whatsappNumber, message.videoUrl, message.caption);
        else if (message.type === "image") await whatsAppClient.sendImage(whatsappNumber, message.imageUrl, message.caption);
        else if (message.type === "quickReply") await whatsAppClient.sendQuickReply(whatsappNumber, message.text, message.options);
      } catch (sendError) {
        console.error(`[jobs] Versand einer ${message.type}-Nachricht fehlgeschlagen:`, sendError);
      }
    }
  }
}
