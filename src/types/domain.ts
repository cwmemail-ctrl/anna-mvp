// Typen 1:1 aus DATENBANKSCHEMA.md abgeleitet.
// Bewusst hier zentral definiert, damit Service-Schicht und Repository-Implementierungen
// (aktuell in-memory, später ggf. Prisma/Postgres) dieselben Typen teilen.

export type OnboardingStatus = "NOT_STARTED" | "AWAITING_CONSENT" | "IN_PROGRESS" | "COMPLETED";
export type WorkType = "SITTING" | "STANDING" | "PHYSICAL" | "MIXED";

// Onboarding-Teilschritte, die über den generischen OnboardingStatus hinaus
// steuern, welche Frage als nächstes gestellt wird. Rein intern, kein DB-Feld
// aus DATENBANKSCHEMA.md, aber notwendig für die deterministische Frage-Reihenfolge.
export type OnboardingStep =
  | "CONSENT"
  | "WORK_TYPE"
  | "COMPLAINT_CHECK"
  | "COMPLAINT_LOCATION"
  | "COMPLAINT_NO_MATCH_CONFIRM"
  | "STRESS_CHECK"
  | "DONE";

export interface Employee {
  id: string;
  companyId: string;
  departmentId?: string;
  whatsappNumberHash: string;
  // Reversibel verschluesselte (nicht gehashte!) Telefonnummer -- siehe
  // whatsapp/numberCrypto.ts. Noetig, um spaeter aktiv Nachrichten zu
  // verschicken (Scheduler-Trigger); aus whatsappNumberHash allein liesse
  // sich die Nummer nie zurueckgewinnen, da der absichtlich irreversibel ist.
  // Steht weiterhin nie im Klartext in der Datenbank.
  whatsappNumberEncrypted: string;
  onboardingStatus: OnboardingStatus;
  onboardingStep: OnboardingStep;
  workType?: WorkType;
  // MVP-Ergänzung: Freitext-Antwort auf "Hast du körperliche Beschwerden?
  // Wenn ja, wo?". Wird in selectExerciseFor (exercise.service.ts) gegen
  // Name+Beschreibung der Übungen gematcht -- kein festes Kategorie-Feld an
  // Exercise mehr (siehe Entfernung von targetArea), daher reiner Textabgleich.
  // Leer/undefined, wenn keine Beschwerden angegeben wurden.
  complaintLocation?: string;
  // MVP-Ergänzung, nicht in DATENBANKSCHEMA.md enthalten: Antwort auf die
  // eigenständige Stress-Frage im Onboarding. Löst bei true eine zusätzliche
  // Stress-Übung nach der Hauptübung aus (siehe exercise.service.ts,
  // selectStressReliefExercise).
  feelsStressed?: boolean;
  // MVP-Ergänzung, ebenfalls nicht in DATENBANKSCHEMA.md: verhindert direkte
  // Wiederholung derselben Übung bei der naechsten Auswahl (siehe
  // exercise.service.ts, selectExerciseFor). Bei DB-Migration als Feld ergänzen.
  lastExerciseId?: string;
  // MVP-Ergänzung: true, sobald der Mitarbeiter sich abgemeldet hat (siehe
  // optOut.service.ts). Scheduler (coaching.service.ts, sendDailyReminders/
  // sendWeeklyCheckins) überspringt diese Mitarbeitenden. "start" schreiben
  // setzt es wieder auf false.
  optedOut?: boolean;
  // MVP-Ergänzung: Datum des letzten taeglichen Erinnerungs-Versands.
  // Verhindert doppelten Versand am selben Tag, falls der externe
  // Scheduler-Trigger (routes/jobs.ts) mehrfach am Tag aufgerufen wird.
  lastReminderSentAt?: Date;
  // MVP-Ergänzung: true, waehrend auf die Antwort (1-5) zur woechentlichen
  // Selbsteinschaetzung gewartet wird (siehe sendWeeklyCheckins,
  // continueCoachingDialog). Naechste eingehende Nachricht wird dann als
  // Check-in-Wert interpretiert statt als normaler Dialog/Feedback.
  awaitingWeeklyCheckin?: boolean;
  consentGivenAt?: Date;
  createdAt: Date;
}

export interface ConversationMessage {
  id: string;
  employeeId: string;
  role: "USER" | "ASSISTANT";
  content: string;
  escalationFlag: boolean;
  createdAt: Date;
}

// Allgemeine Gesundheitstipps (siehe Chat-Antwort) -- bewusst getrennt von
// Exercise, da inhaltlich etwas anderes (kein konkretes Bewegungsziel,
// keine Serien/Wiederholungen). Gleiches Freigabe-Prinzip wie bei Uebungen
// (GESCHAEFTSREGELN.md Regel 3, sinngemaess auch fuer Tipps): "active" ist
// bewusst der Schalter fuer die fachliche Freigabe -- alle hier entworfenen
// Tipps starten mit active:false, bis der Physiotherapeut sie geprueft hat.
export interface HealthTip {
  id: string;
  text: string;
  approvedBy: string;
  active: boolean;
}

// Achtsamkeitsspruch fuer die Guten-Morgen-Nachricht (siehe Chat-Antwort --
// ersetzt die vorherigen Motivationssprueche). Kommt bewusst von Anna, NICHT
// explizit vom Arbeitgeber zugeschrieben (GESCHAEFTSREGELN.md Regel 5:
// Machtgefaelle-Risiko, Vertrauen sinkt sonst). Gleiches Freigabe-Prinzip
// wie HealthTip -- Entwuerfe starten mit active:false.
export interface MindfulnessQuote {
  id: string;
  text: string;
  approvedBy: string;
  active: boolean;
}

export interface Exercise {
  id: string;
  name: string;
  // Optional: nur noch als Kontext-Info fuer die KI im freien Coaching-Dialog
  // genutzt (siehe ai/prompts/system.prompt.v1.ts). Fuer die deterministische
  // Uebungsauswahl (exercise.service.ts) nicht mehr relevant -- muss bei
  // neuen Uebungen nicht mehr zwingend angegeben werden.
  situation?: string;
  // Optional: nur fuer forStress-Uebungen gedacht (fester Zeitablauf, z. B.
  // "4 Sek. einatmen..."). Isometrische Uebungen nutzen stattdessen
  // holdSeconds, dynamische Uebungen brauchen gar keine Dauer (siehe
  // formatExerciseMessage in exercise.service.ts).
  durationSeconds?: number;
  description: string;
  videoUrl?: string;
  imageUrl?: string;
  approvedBy: string;
  active: boolean;
  // Zusatzmarkierung, unabhaengig von targetArea: wird bei feelsStressed=true
  // (siehe Employee) als zusaetzliche Uebung nach der Hauptuebung verschickt.
  forStress?: boolean;
  // Isometrische Uebung (Halten statt Wiederholen) -- steuert den Trainings-
  // Hinweistext in formatExerciseMessage() (exercise.service.ts).
  isometric?: boolean;
  // Wiederholungen pro Serie (dynamische Uebungen). Ohne Angabe: 10 (Standard).
  repetitions?: number;
  // Serien insgesamt, gilt fuer dynamische UND isometrische Uebungen.
  // Ohne Angabe: 5 (Standard).
  sets?: number;
  // Haltedauer in Sekunden pro Serie (nur isometrische Uebungen).
  // Ohne Angabe: 45 (Standard).
  holdSeconds?: number;
}

export type UsageEventType =
  | "ONBOARDING_COMPLETED"
  | "EXERCISE_SENT"
  | "WEEKLY_CHECKIN"
  | "ESCALATION_TRIGGERED"
  | "EXERCISE_FEEDBACK_POSITIVE"
  | "EXERCISE_FEEDBACK_NEUTRAL"
  | "EXERCISE_FEEDBACK_NEGATIVE";

export interface UsageEvent {
  id: string;
  companyId: string;
  departmentId?: string;
  eventType: UsageEventType;
  weekOf: Date;
  // Nur fuer WEEKLY_CHECKIN belegt (Selbsteinschaetzung 1-5, siehe
  // PRODUKTANFORDERUNGEN.md, Erfolgskriterien). Fuer alle anderen
  // eventType-Werte undefined -- reine Zaehlereignisse ohne Zahlenwert.
  value?: number;
}

// Eingehende Nachricht, bereits vom BSP-spezifischen Format entkoppelt.
// Die /whatsapp-Schicht kennt laut ARCHITEKTURUEBERSICHT.md keine Fachlogik
// und übersetzt nur dorthin.
export interface IncomingMessage {
  whatsappNumberHash: string;
  // Reversibel verschluesselte Nummer (siehe whatsapp/numberCrypto.ts) --
  // wird nur bei Employee-Neuanlage gespeichert, danach nicht mehr gebraucht.
  whatsappNumberEncrypted: string;
  text: string;
  receivedAt: Date;
}

// Grenzfall-Protokoll (siehe escalation.service.ts, isBorderlinePainMention):
// Nachrichten, die Schmerz-Wörter enthalten, aber KEIN Warnsignal aus
// GESCHAEFTSREGELN.md Regel 2 ausgelöst haben. Dient ausschliesslich der
// fachlichen Durchsicht durch den Physiotherapeuten (Qualitätssicherung der
// Schlüsselwortliste), NICHT dem Arbeitgeber-Dashboard -- daher bewusst mit
// Klartext-Nachricht, anders als UsageEvent. Aufbewahrungsfrist noch offen
// (gleiche offene DSGVO-Frage wie bei ConversationMessage, siehe
// DATENBANKSCHEMA.md).
export interface BorderlineCase {
  id: string;
  companyId: string;
  messageText: string;
  createdAt: Date;
}

// Ausgehende Nachricht, ebenfalls BSP-agnostisch. Eine Antwort kann aus
// mehreren solchen Nachrichten bestehen (z. B. Begleittext + Video/Bild als
// zwei separate WhatsApp-Bubbles). "video"/"image" erfordern laut
// API_DOKUMENTATION.md eine öffentlich erreichbare, direkt abrufbare
// Media-URL (echte Datei -- KEINE Seiten-URL wie ein YouTube-Watch-Link,
// die liefert keine rohen Mediendaten und funktioniert für native
// WhatsApp-Medien-Nachrichten nicht).
// "quickReply" bildet eine Nachricht mit antippbaren Optionen ab (z. B.
// Smiley-Feedback). Entspricht später den nativen "Interactive Reply
// Buttons" der WhatsApp Business API -- die konkrete BSP-Anbindung ist wie
// bei video/image bewusst noch offen (siehe API_DOKUMENTATION.md).
export type OutgoingMessage =
  | { type: "text"; text: string }
  | { type: "video"; videoUrl: string; caption?: string }
  | { type: "image"; imageUrl: string; caption?: string }
  | { type: "quickReply"; text: string; options: string[] };
