export interface AppConfig {
  port: number;
  whatsappMode: "mock" | "live";
  aiMode: "mock" | "live";
  anthropicApiKey?: string;
  webhookHashSecret: string;
  dashboardApiToken: string;
  jobTriggerToken: string;
}

export function loadConfig(): AppConfig {
  const whatsappMode = process.env.WHATSAPP_MODE === "live" ? "live" : "mock";
  const aiMode = process.env.AI_MODE === "live" ? "live" : "mock";

  if (aiMode === "live" && !process.env.ANTHROPIC_API_KEY) {
    throw new Error("AI_MODE=live erfordert ANTHROPIC_API_KEY (siehe .env.example)");
  }
  if (whatsappMode === "live") {
    throw new Error(
      "WHATSAPP_MODE=live ist noch nicht implementiert -- BSP-Wahl (360dialog/Twilio) ist offen, siehe API_DOKUMENTATION.md"
    );
  }
  if (!process.env.WEBHOOK_HASH_SECRET) {
    throw new Error(
      "WEBHOOK_HASH_SECRET ist nicht gesetzt. Ein Secret generieren, z. B. mit:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n" +
        "und das Ergebnis in der .env als WEBHOOK_HASH_SECRET=... eintragen (siehe .env.example)."
    );
  }
  if (!process.env.DASHBOARD_API_TOKEN) {
    throw new Error(
      "DASHBOARD_API_TOKEN ist nicht gesetzt. Schuetzt die Arbeitgeber-Dashboard-Routen " +
        "(siehe routes/dashboard.ts). Ein Token generieren, z. B. mit:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n" +
        "und das Ergebnis in der .env als DASHBOARD_API_TOKEN=... eintragen (siehe .env.example)."
    );
  }
  if (!process.env.JOB_TRIGGER_TOKEN) {
    throw new Error(
      "JOB_TRIGGER_TOKEN ist nicht gesetzt. Schuetzt die Scheduler-Endpunkte " +
        "(siehe routes/jobs.ts) vor Missbrauch durch Dritte. Ein Token generieren, z. B. mit:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n" +
        "und das Ergebnis in der .env als JOB_TRIGGER_TOKEN=... eintragen (siehe .env.example)."
    );
  }

  return {
    port: Number(process.env.PORT ?? 3000),
    whatsappMode,
    aiMode,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    webhookHashSecret: process.env.WEBHOOK_HASH_SECRET,
    dashboardApiToken: process.env.DASHBOARD_API_TOKEN,
    jobTriggerToken: process.env.JOB_TRIGGER_TOKEN,
  };
}
