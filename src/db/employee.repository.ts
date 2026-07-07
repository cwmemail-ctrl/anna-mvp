import { randomUUID } from "node:crypto";
import type { Employee } from "../types/domain.js";

export interface EmployeeRepository {
  findByWhatsappHash(whatsappNumberHash: string): Promise<Employee | undefined>;
  create(whatsappNumberHash: string, companyId: string): Promise<Employee>;
  update(employee: Employee): Promise<Employee>;
  // Fuer Dashboard-Aggregation (siehe dashboard.service.ts) -- liefert nur
  // die Mitarbeitenden eines Unternehmens, keine Einzeldaten-Ausgabe direkt
  // an HR (das uebernimmt die Aggregation in dashboard.service.ts).
  listByCompany(companyId: string): Promise<Employee[]>;
}

// In-Memory-Implementierung für den lokalen MVP-Betrieb ohne echte Infra.
// Wichtig: Kein Klartext-Bezug zur Telefonnummer wird gespeichert (siehe
// DATENBANKSCHEMA.md) -- das Hashing passiert bereits in der /whatsapp-Schicht,
// bevor diese Klasse überhaupt aufgerufen wird.
export class InMemoryEmployeeRepository implements EmployeeRepository {
  private readonly byId = new Map<string, Employee>();
  private readonly idByHash = new Map<string, string>();

  async findByWhatsappHash(whatsappNumberHash: string): Promise<Employee | undefined> {
    const id = this.idByHash.get(whatsappNumberHash);
    return id ? this.byId.get(id) : undefined;
  }

  async create(whatsappNumberHash: string, companyId: string): Promise<Employee> {
    const employee: Employee = {
      id: randomUUID(),
      companyId,
      whatsappNumberHash,
      onboardingStatus: "NOT_STARTED",
      onboardingStep: "CONSENT",
      createdAt: new Date(),
    };
    this.byId.set(employee.id, employee);
    this.idByHash.set(whatsappNumberHash, employee.id);
    return employee;
  }

  async update(employee: Employee): Promise<Employee> {
    this.byId.set(employee.id, employee);
    return employee;
  }

  async listByCompany(companyId: string): Promise<Employee[]> {
    return [...this.byId.values()].filter((e) => e.companyId === companyId);
  }
}
