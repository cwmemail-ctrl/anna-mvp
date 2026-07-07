import express from "express";
import { AnthropicAIClient, MockAIClient, type AIClient } from "./ai/client.js";
import { loadConfig } from "./config/env.js";
import { InMemoryBorderlineCaseRepository } from "./db/borderlineCase.repository.js";
import { InMemoryConversationRepository } from "./db/conversation.repository.js";
import { InMemoryEmployeeRepository } from "./db/employee.repository.js";
import { InMemoryUsageEventRepository } from "./db/usageEvent.repository.js";
import { createDashboardRouter } from "./routes/dashboard.js";
import { createJobsRouter } from "./routes/jobs.js";
import { createWhatsAppWebhookRouter } from "./routes/whatsapp.webhook.js";
import { CoachingService } from "./services/coaching.service.js";
import { Dialog360WhatsAppClient } from "./whatsapp/client.360dialog.js";
import type { WhatsAppClient } from "./whatsapp/client.interface.js";
import { MockWhatsAppClient } from "./whatsapp/client.mock.js";

const config = loadConfig();

// Composition Root: hier und nur hier werden konkrete Implementierungen
// gewählt. Services kennen nur die Interfaces (siehe CODING_GUIDELINES.md,
// "Geschäftslogik bleibt frei von Framework-Code").
const employees = new InMemoryEmployeeRepository();
const conversations = new InMemoryConversationRepository();
const usageEvents = new InMemoryUsageEventRepository();
const borderlineCases = new InMemoryBorderlineCaseRepository();

const aiClient: AIClient =
  config.aiMode === "live" ? new AnthropicAIClient(config.anthropicApiKey!) : new MockAIClient();

const whatsAppClient: WhatsAppClient =
  config.whatsappMode === "live"
    ? new Dialog360WhatsAppClient(config.dialog360ApiKey!, config.dialog360BaseUrl!)
    : new MockWhatsAppClient();

const coachingService = new CoachingService(employees, conversations, usageEvents, aiClient, borderlineCases);

const app = express();
app.use(express.json());
app.use("/api/v1", createWhatsAppWebhookRouter(coachingService, whatsAppClient, config.webhookHashSecret));
app.use("/api/v1", createDashboardRouter(employees, usageEvents, config.dashboardApiToken));
app.use("/api/v1", createJobsRouter(coachingService, whatsAppClient, config.jobTriggerToken, config.webhookHashSecret));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(config.port, () => {
  console.log(`Anna MVP läuft auf http://localhost:${config.port}`);
  console.log(`  WHATSAPP_MODE=${config.whatsappMode}  AI_MODE=${config.aiMode}`);
  console.log(`  Webhook: POST http://localhost:${config.port}/api/v1/webhook/whatsapp`);
  console.log(`  Scheduler-Trigger: POST /api/v1/jobs/daily-reminders, POST /api/v1/jobs/weekly-checkin`);
});
