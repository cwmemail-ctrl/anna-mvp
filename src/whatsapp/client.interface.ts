// Diese Schicht kennt gemäss ARCHITEKTURUEBERSICHT.md keine Fachlogik --
// sie übersetzt nur zwischen BSP-Format und internem Nachrichtenformat.
// BSP-Wahl ist laut API_DOKUMENTATION.md ("Offene Punkte") noch offen,
// deshalb hier bewusst nur ein schmales Interface.
export interface WhatsAppClient {
  sendText(whatsappNumberHash: string, text: string): Promise<void>;
  // videoUrl/imageUrl müssen direkt abrufbare Mediendateien sein (siehe
  // Kommentar bei OutgoingMessage in types/domain.ts) -- keine Seiten-URL.
  sendVideo(whatsappNumberHash: string, videoUrl: string, caption?: string): Promise<void>;
  sendImage(whatsappNumberHash: string, imageUrl: string, caption?: string): Promise<void>;
  // Nachricht mit antippbaren Optionen (siehe OutgoingMessage "quickReply").
  sendQuickReply(whatsappNumberHash: string, text: string, options: string[]): Promise<void>;
}
