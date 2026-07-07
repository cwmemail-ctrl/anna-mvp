// Uebersetzt das reale 360dialog-Webhook-Format (Meta-Cloud-API-kompatibel)
// in unser einfaches internes { from, text }. Diese Schicht kennt bewusst
// keine Fachlogik (siehe ARCHITEKTURUEBERSICHT.md) -- sie extrahiert nur die
// zwei Felder, die coaching.service.ts braucht.
export interface ParsedIncomingWebhookMessage {
  from: string;
  text: string;
}

// Grobe, aber fuer unseren Zweck ausreichende Typisierung des echten
// Webhook-Payloads. Meta/360dialog liefern deutlich mehr Felder (Kontakte,
// Metadaten, Status-Updates fuer gesendete Nachrichten etc.) -- die
// interessieren uns hier nicht, wir picken uns nur "messages" heraus.
interface Dialog360WebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from?: string;
          type?: string;
          text?: { body?: string };
          interactive?: {
            type?: string;
            button_reply?: { title?: string };
            list_reply?: { title?: string };
          };
        }>;
      };
    }>;
  }>;
}

// Liefert null bei Status-Updates (z. B. "gelesen"-Haekchen) oder anderen
// Payloads ohne tatsaechliche Nutzer-Nachricht -- die werden im Webhook-
// Handler dann einfach ignoriert (siehe routes/whatsapp.webhook.ts).
export function parseDialog360Webhook(rawBody: unknown): ParsedIncomingWebhookMessage | null {
  const payload = rawBody as Dialog360WebhookPayload;
  const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message?.from) return null;

  if (message.type === "text" && message.text?.body) {
    return { from: message.from, text: message.text.body };
  }

  // Antwort auf einen Button (sendQuickReply mit <=3 Optionen, siehe
  // client.360dialog.ts) oder eine Liste (>3 Optionen) -- der Titel wird wie
  // eingetippter Freitext behandelt, damit die bestehende Fachlogik
  // (String-Vergleiche wie "Ja"/"Nein") unveraendert funktioniert.
  if (message.type === "interactive") {
    const title = message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title;
    if (title) return { from: message.from, text: title };
  }

  return null;
}
