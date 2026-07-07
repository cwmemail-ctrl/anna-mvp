import { randomUUID } from "node:crypto";
import type { BorderlineCase } from "../types/domain.js";

export interface BorderlineCaseRepository {
  log(companyId: string, messageText: string): Promise<BorderlineCase>;
  // Fuer die fachliche Durchsicht durch den Physiotherapeuten (siehe
  // types/domain.ts, BorderlineCase-Kommentar). Aktuell ueber KEINE Route
  // erreichbar (rein intern genutzt) -- falls dafuer spaeter ein Endpunkt
  // entsteht, braucht der denselben Token-Schutz wie routes/dashboard.ts
  // (siehe services/dashboardAuth.service.ts).
  listAll(): Promise<BorderlineCase[]>;
}

// In-Memory-Implementierung fuer den lokalen MVP-Betrieb. Anders als
// UsageEventRepository bewusst MIT Klartext-Nachricht -- der Zweck ist ja
// gerade, die genaue Formulierung pruefen zu koennen, um die
// Warnsignal-Schluesselwortliste in escalation.service.ts zu verbessern.
export class InMemoryBorderlineCaseRepository implements BorderlineCaseRepository {
  private readonly cases: BorderlineCase[] = [];

  async log(companyId: string, messageText: string): Promise<BorderlineCase> {
    const borderlineCase: BorderlineCase = {
      id: randomUUID(),
      companyId,
      messageText,
      createdAt: new Date(),
    };
    this.cases.push(borderlineCase);
    return borderlineCase;
  }

  async listAll(): Promise<BorderlineCase[]> {
    return [...this.cases];
  }
}
