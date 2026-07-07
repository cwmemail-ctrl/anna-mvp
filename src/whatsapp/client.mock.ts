import type { WhatsAppClient } from "./client.interface.js";

// Für WHATSAPP_MODE=mock (siehe .env.example). Loggt statt zu senden.
// Sobald der BSP feststeht (360dialog vs. Twilio, siehe API_DOKUMENTATION.md
// "Offene Punkte"), kommt eine zweite Implementierung dieses Interfaces dazu --
// der Rest des Systems (Routen, Services) ändert sich dadurch nicht.
export class MockWhatsAppClient implements WhatsAppClient {
  async sendText(whatsappNumberHash: string, text: string): Promise<void> {
    console.log(`[MockWhatsAppClient] -> ${whatsappNumberHash}:\n${text}\n`);
  }

  async sendVideo(whatsappNumberHash: string, videoUrl: string, caption?: string): Promise<void> {
    console.log(
      `[MockWhatsAppClient] -> ${whatsappNumberHash} [VIDEO]:\n${videoUrl}${caption ? `\nCaption: ${caption}` : ""}\n`
    );
  }

  async sendImage(whatsappNumberHash: string, imageUrl: string, caption?: string): Promise<void> {
    console.log(
      `[MockWhatsAppClient] -> ${whatsappNumberHash} [IMAGE]:\n${imageUrl}${caption ? `\nCaption: ${caption}` : ""}\n`
    );
  }

  async sendQuickReply(whatsappNumberHash: string, text: string, options: string[]): Promise<void> {
    console.log(`[MockWhatsAppClient] -> ${whatsappNumberHash} [QUICK_REPLY]:\n${text}\nOptionen: ${options.join(" | ")}\n`);
  }
}
