import { randomUUID } from "node:crypto";
import type { ConversationMessage } from "../types/domain.js";

export interface ConversationRepository {
  append(
    employeeId: string,
    role: ConversationMessage["role"],
    content: string,
    escalationFlag: boolean
  ): Promise<ConversationMessage>;
  // Letzte N Nachrichten für Konversationskontext (siehe API_DOKUMENTATION.md,
  // "Wie viel Verlauf wird an die AI mitgeschickt" ist als offene Entscheidung
  // markiert -- für den MVP fest auf ein kleines Fenster begrenzt).
  recentByEmployee(employeeId: string, limit: number): Promise<ConversationMessage[]>;
}

// Zugriff ist gemäss ARCHITEKTURUEBERSICHT.md ausschliesslich dem
// Coaching-Service vorbehalten -- es gibt bewusst keine Dashboard-Route,
// die dieses Repository nutzt.
export class InMemoryConversationRepository implements ConversationRepository {
  private readonly messages: ConversationMessage[] = [];

  async append(
    employeeId: string,
    role: ConversationMessage["role"],
    content: string,
    escalationFlag: boolean
  ): Promise<ConversationMessage> {
    const message: ConversationMessage = {
      id: randomUUID(),
      employeeId,
      role,
      content,
      escalationFlag,
      createdAt: new Date(),
    };
    this.messages.push(message);
    return message;
  }

  async recentByEmployee(employeeId: string, limit: number): Promise<ConversationMessage[]> {
    return this.messages
      .filter((m) => m.employeeId === employeeId)
      .slice(-limit);
  }
}
