// Diese Schicht kennt gemäss ARCHITEKTURUEBERSICHT.md keine Fachlogik --
// sie übersetzt nur zwischen BSP-Format und internem Nachrichtenformat.
// WICHTIG: Der Parameter ist die ECHTE Telefonnummer, nicht der irreversible
// whatsappNumberHash aus dem Employee-Datensatz (siehe
// whatsapp/numberCrypto.ts fuer die Herleitung aus whatsappNumberEncrypted).
export interface WhatsAppClient {
  sendText(whatsappNumber: string, text: string): Promise<void>;
  // videoUrl/imageUrl müssen direkt abrufbare Mediendateien sein (siehe
  // Kommentar bei OutgoingMessage in types/domain.ts) -- keine Seiten-URL.
  sendVideo(whatsappNumber: string, videoUrl: string, caption?: string): Promise<void>;
  sendImage(whatsappNumber: string, imageUrl: string, caption?: string): Promise<void>;
  // Nachricht mit antippbaren Optionen (siehe OutgoingMessage "quickReply").
  sendQuickReply(whatsappNumber: string, text: string, options: string[]): Promise<void>;
}
