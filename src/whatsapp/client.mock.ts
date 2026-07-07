import type { WhatsAppClient } from "./client.interface.js";

// Für WHATSAPP_MODE=mock (siehe .env.example). Loggt statt zu senden.
// Sobald der BSP feststeht (360dialog vs. Twilio, siehe API_DOKUMENTATION.md
// "Offene Punkte"), kommt eine zweite Implementierung dieses Interfaces dazu --
// der Rest des Systems (Routen, Services) ändert sich dadurch nicht.
export class MockWhatsAppClient implements WhatsAppClient {
  async sendText(whatsappNumber: string, text: string): Promise<void> {
    console.log(`[MockWhatsAppClient] -> ${whatsappNumber}:\n${text}\n`);
  }

  async sendVideo(whatsappNumber: string, videoUrl: string, caption?: string): Promise<void> {
    console.log(
      `[MockWhatsAppClient] -> ${whatsappNumber} [VIDEO]:\n${videoUrl}${caption ? `\nCaption: ${caption}` : ""}\n`
    );
  }

  async sendImage(whatsappNumber: string, imageUrl: string, caption?: string): Promise<void> {
    console.log(
      `[MockWhatsAppClient] -> ${whatsappNumber} [IMAGE]:\n${imageUrl}${caption ? `\nCaption: ${caption}` : ""}\n`
    );
  }

  async sendQuickReply(whatsappNumber: string, text: string, options: string[]): Promise<void> {
    console.log(`[MockWhatsAppClient] -> ${whatsappNumber} [QUICK_REPLY]:\n${text}\nOptionen: ${options.join(" | ")}\n`);
  }
}
