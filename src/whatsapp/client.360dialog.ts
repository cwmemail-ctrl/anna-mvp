import type { WhatsAppClient } from "./client.interface.js";

// Echte Implementierung fuer WHATSAPP_MODE=live (siehe config/env.ts).
// Nutzt die 360dialog Direct API (Cloud-API-kompatibel, siehe
// API_DOKUMENTATION.md). baseUrl ist bewusst konfigurierbar statt fest
// einprogrammiert -- Sandbox ("waba-sandbox.360dialog.io") und Produktion
// haben unterschiedliche Adressen, das soll ohne Code-Aenderung umstellbar
// bleiben (siehe .env.example, DIALOG360_BASE_URL).
export class Dialog360WhatsAppClient implements WhatsAppClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string
  ) {}

  async sendText(whatsappNumber: string, text: string): Promise<void> {
    await this.post({
      messaging_product: "whatsapp",
      to: normalizeNumber(whatsappNumber),
      type: "text",
      text: { body: text },
    });
  }

  async sendVideo(whatsappNumber: string, videoUrl: string, caption?: string): Promise<void> {
    await this.post({
      messaging_product: "whatsapp",
      to: normalizeNumber(whatsappNumber),
      type: "video",
      video: { link: videoUrl, caption },
    });
  }

  async sendImage(whatsappNumber: string, imageUrl: string, caption?: string): Promise<void> {
    await this.post({
      messaging_product: "whatsapp",
      to: normalizeNumber(whatsappNumber),
      type: "image",
      image: { link: imageUrl, caption },
    });
  }

  // WhatsApp erlaubt bei interaktiven "button"-Nachrichten maximal 3 Buttons
  // (harte Plattform-Grenze, keine Design-Entscheidung von uns). Bei mehr
  // Optionen (z. B. die 5 Achtsamkeits-Check-in-Emojis) wird stattdessen eine
  // "list"-Nachricht verwendet (Dropdown-artig, bis zu 10 Zeilen erlaubt).
  async sendQuickReply(whatsappNumber: string, text: string, options: string[]): Promise<void> {
    const to = normalizeNumber(whatsappNumber);

    if (options.length <= 3) {
      await this.post({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text },
          action: {
            buttons: options.map((label, i) => ({
              type: "reply",
              reply: { id: `opt_${i}`, title: label.slice(0, 20) }, // WhatsApp-Limit: 20 Zeichen/Button
            })),
          },
        },
      });
      return;
    }

    await this.post({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text },
        action: {
          button: "Auswählen",
          sections: [
            {
              rows: options.slice(0, 10).map((label, i) => ({
                id: `opt_${i}`,
                title: label.slice(0, 24), // WhatsApp-Limit: 24 Zeichen/Zeile
              })),
            },
          ],
        },
      },
    });
  }

  private async post(body: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "D360-API-KEY": this.apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`360dialog-Versand fehlgeschlagen (${response.status}): ${errorBody}`);
    }
  }
}

// 360dialog/Meta Cloud API erwartet Telefonnummern rein numerisch, ohne "+"
// oder Leerzeichen.
function normalizeNumber(rawNumber: string): string {
  return rawNumber.replace(/[^\d]/g, "");
}
