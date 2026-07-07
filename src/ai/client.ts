import Anthropic from "@anthropic-ai/sdk";
import type { ConversationMessage, Exercise } from "../types/domain.js";
import { buildSystemPromptV1 } from "./prompts/system.prompt.v1.js";

export interface AIClient {
  generateReply(history: ConversationMessage[], exerciseLibrary: readonly Exercise[]): Promise<string>;
}

// Für den lokalen MVP-Betrieb ohne Anthropic-API-Key (siehe .env.example, AI_MODE=mock).
// Liefert eine einfache, aber realistische Antwort, damit der komplette Fluss
// end-to-end testbar ist, ohne Kosten oder Netzwerkzugriff.
export class MockAIClient implements AIClient {
  async generateReply(history: ConversationMessage[]): Promise<string> {
    const lastUserMessage = [...history].reverse().find((m) => m.role === "USER");
    return (
      "Danke für deine Nachricht! (Mock-Antwort, kein echter API-Call)\n" +
      `Du hast geschrieben: "${lastUserMessage?.content ?? ""}"`
    );
  }
}

export class AnthropicAIClient implements AIClient {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateReply(history: ConversationMessage[], exerciseLibrary: readonly Exercise[]): Promise<string> {
    const system = buildSystemPromptV1(exerciseLibrary);

    const response = await this.client.messages.create({
      model: "claude-sonnet-5", // ggf. gegen docs.claude.com prüfen, falls sich Modell-Strings ändern
      max_tokens: 400,
      system,
      messages: history.map((m) => ({
        role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      })),
    });

    const textBlock = response.content.find((block) => block.type === "text");
    return textBlock && textBlock.type === "text" ? textBlock.text : "";
  }
}
