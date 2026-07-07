import type { AIClient } from "../ai/client.js";
import type { BorderlineCaseRepository } from "../db/borderlineCase.repository.js";
import type { ConversationRepository } from "../db/conversation.repository.js";
import type { EmployeeRepository } from "../db/employee.repository.js";
import type { UsageEventRepository } from "../db/usageEvent.repository.js";
import type { Employee, IncomingMessage, OutgoingMessage, UsageEventType } from "../types/domain.js";
import { checkForEscalation, containsForbiddenMedicalLanguage, isBorderlinePainMention } from "./escalation.service.js";
import { buildExerciseOutgoingMessages, getExerciseLibrary, selectExerciseFor, selectStressReliefExercise } from "./exercise.service.js";
import { selectHealthTip } from "./healthTip.service.js";
import { selectMindfulnessQuote } from "./mindfulness.service.js";
import { nextOnboardingPrompt, processOnboardingAnswer } from "./onboarding.service.js";
import { isOptInCommand, isOptOutCommand, OPT_IN_REPLY, OPT_OUT_REPLY, OPTED_OUT_REMINDER } from "./optOut.service.js";

const DEFAULT_COMPANY_ID = "pilot-company"; // Pilot hat nur ein Unternehmen (siehe README.md)
const CONVERSATION_HISTORY_WINDOW = 10;

// Taeglich garantiert ein Gesundheitstipp (siehe sendForenoonHealthTip,
// separater Vormittags-Trigger).
function dailyHealthTipMessage(): OutgoingMessage[] {
  const tip = selectHealthTip();
  if (!tip) return [];
  return [{ type: "text", text: `💡 ${tip.text}` }];
}

// Guten-Morgen-Gruss + Achtsamkeitsspruch fuer die Frueh-Nachricht (siehe
// Chat-Antwort -- ersetzt die vorherigen Motivationssprueche). Ohne
// freigegebenen Spruch (mindfulnessQuotes.data.ts) gibt es trotzdem den
// Gruss, nur ohne Spruch dahinter.
function morningGreeting(): OutgoingMessage[] {
  const quote = selectMindfulnessQuote();
  const greeting = quote ? `Guten Morgen 😊\n\n${quote.text}` : "Guten Morgen 😊";
  return [{ type: "text", text: greeting }];
}

// Haeufige Bereiche als antippbare Vorschlaege bei der "Wo genau?"-Frage
// (siehe Chat-Antwort, Verbesserungsvorschlag 1) -- Freitext bleibt trotzdem
// moeglich, ein Chip-Tap fuellt nur denselben Textkanal wie manuelles Tippen,
// die Verarbeitung in onboarding.service.ts bleibt dieselbe.
const COMPLAINT_LOCATION_SUGGESTIONS = ["Rücken", "Nacken", "Schulter", "Knie", "Hüfte"];

const ESCALATION_REPLY =
  "Das klingt nach etwas, das ich als Coach nicht einschätzen kann. Bitte wende dich " +
  "damit an deinen Arzt, deine Physiotherapie oder den Betriebsarzt -- die können das " +
  "richtig beurteilen. Ich bin weiterhin für dich da, sobald es wieder um Prävention geht.";

const SAFE_FALLBACK_REPLY =
  "Entschuldige, dazu kann ich gerade keine passende Antwort geben. Magst du es nochmal " +
  "anders formulieren?";

// Antippbares Schnell-Feedback statt einer Text-Rückfrage nach jeder Übung.
// Reihenfolge der Optionen entspricht der Reihenfolge der Emoji-Zuordnung
// in FEEDBACK_EVENT_BY_EMOJI weiter unten.
const FEEDBACK_PROMPT_TEXT = "Wie war die Übung für dich?";
const FEEDBACK_OPTIONS = ["😄", "😐", "😢"];
const FEEDBACK_THANKS_REPLY = "Danke für dein Feedback! Bis morgen 😄";

// Woechentliche Selbsteinschaetzung (siehe PRODUKTANFORDERUNGEN.md,
// Erfolgskriterien). Emoji-Skala statt Zahlen (siehe Chat-Antwort) --
// intern weiterhin auf 1-5 gemappt, damit averageSelfReportedImprovement
// im Dashboard unveraendert funktioniert.
const WEEKLY_CHECKIN_PROMPT = "Kurzer wöchentlicher Check-in: Wie geht es dir diese Woche?";
const WEEKLY_CHECKIN_OPTIONS = ["😢", "😟", "😐", "🙂", "😄"];
const WEEKLY_CHECKIN_SCORE_BY_EMOJI: Record<string, number> = {
  "😢": 1,
  "😟": 2,
  "😐": 3,
  "🙂": 4,
  "😄": 5,
};
const WEEKLY_CHECKIN_THANKS = "Danke fürs Mitteilen! Bis nächste Woche.";
const WEEKLY_CHECKIN_INVALID = "Bitte tippe eines der Emojis an: 😢 😟 😐 🙂 😄";

// Anonymisierte Zaehlwerte statt Freitext (GESCHAEFTSREGELN.md Regel 5:
// Arbeitgeber sieht niemals Einzeldaten) -- ein Emoji-Tap wird zu genau
// einem der drei neuen UsageEventType-Werte.
const FEEDBACK_EVENT_BY_EMOJI: Record<string, UsageEventType> = {
  "😄": "EXERCISE_FEEDBACK_POSITIVE",
  "😐": "EXERCISE_FEEDBACK_NEUTRAL",
  "😢": "EXERCISE_FEEDBACK_NEGATIVE",
};

// Reine Klassifizierungsfunktion, exportiert fuer isolierte Tests (siehe
// coaching.service.test.ts) -- ordnet eine eingehende Nachricht ggf. einem
// Feedback-Event zu, ohne Seiteneffekte.
export function classifyFeedbackEmoji(text: string): UsageEventType | undefined {
  return FEEDBACK_EVENT_BY_EMOJI[text.trim()];
}

function feedbackQuickReply(): OutgoingMessage {
  return { type: "quickReply", text: FEEDBACK_PROMPT_TEXT, options: FEEDBACK_OPTIONS };
}

export class CoachingService {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly conversations: ConversationRepository,
    private readonly usageEvents: UsageEventRepository,
    private readonly aiClient: AIClient,
    private readonly borderlineCases: BorderlineCaseRepository
  ) {}

  // Rückgabetyp bewusst eine Liste statt eines einzelnen Strings: eine
  // Antwort kann jetzt aus mehreren WhatsApp-Nachrichten bestehen (z. B.
  // Begleittext + Video als zwei separate Bubbles). Der Aufrufer
  // (routes/whatsapp.webhook.ts) sendet jede Nachricht einzeln über den
  // passenden WhatsAppClient-Methodenaufruf (sendText/sendVideo/...).
  async handleIncomingMessage(message: IncomingMessage): Promise<OutgoingMessage[]> {
    let employee = await this.employees.findByWhatsappHash(message.whatsappNumberHash);
    if (!employee) {
      employee = await this.employees.create(message.whatsappNumberHash, DEFAULT_COMPANY_ID);
    }

    // GESCHAEFTSREGELN.md Regel 2: Eskalation hat IMMER Vorrang -- unabhängig
    // davon, ob sich der Nutzer noch im Onboarding befindet oder nicht, und
    // auch vor einer moeglichen Feedback-Emoji-Antwort.
    const escalation = checkForEscalation(message.text);
    await this.conversations.append(employee.id, "USER", message.text, escalation.escalate);

    if (escalation.escalate) {
      await this.usageEvents.log(employee.companyId, "ESCALATION_TRIGGERED", employee.departmentId);
      await this.conversations.append(employee.id, "ASSISTANT", ESCALATION_REPLY, true);
      return [{ type: "text", text: ESCALATION_REPLY }];
    }

    // Grenzfaelle protokollieren: Nachricht erwaehnt Schmerzen, hat aber kein
    // echtes Warnsignal ausgeloest. Dient NICHT der automatischen Eskalation
    // (siehe isBorderlinePainMention-Kommentar) -- nur der spaeteren fachlichen
    // Durchsicht, ob die Schlüsselwortliste in escalation.service.ts noch
    // Luecken hat (siehe Chat-Antwort, Verbesserungsvorschlag 3).
    if (isBorderlinePainMention(message.text)) {
      await this.borderlineCases.log(employee.companyId, message.text);
    }

    // Opt-out/Opt-in hat Vorrang vor Onboarding und Coaching-Dialog -- ein
    // verlaesslicher, sofort wirksamer Befehl, unabhaengig vom Gespraechsstatus
    // (siehe Chat-Antwort, Luecke 3). Deterministisch geprueft, nicht ueber
    // die KI, aus demselben Grund wie bei der Eskalation (Regel 2).
    if (isOptOutCommand(message.text)) {
      await this.employees.update({ ...employee, optedOut: true });
      await this.conversations.append(employee.id, "ASSISTANT", OPT_OUT_REPLY, false);
      return [{ type: "text", text: OPT_OUT_REPLY }];
    }
    if (employee.optedOut) {
      if (isOptInCommand(message.text)) {
        await this.employees.update({ ...employee, optedOut: false });
        await this.conversations.append(employee.id, "ASSISTANT", OPT_IN_REPLY, false);
        return [{ type: "text", text: OPT_IN_REPLY }];
      }
      // Abgemeldete Mitarbeitende bekommen nur den Hinweis, keinen normalen
      // Dialog/Onboarding -- verhindert, dass Anna nach einer Abmeldung
      // trotzdem weiter Uebungen/Fragen schickt.
      await this.conversations.append(employee.id, "ASSISTANT", OPTED_OUT_REMINDER, false);
      return [{ type: "text", text: OPTED_OUT_REMINDER }];
    }

    if (employee.onboardingStatus !== "COMPLETED") {
      return this.continueOnboarding(employee, message.text);
    }

    return this.continueCoachingDialog(employee, message.text);
  }

  private async continueOnboarding(employee: Employee, answerText: string): Promise<OutgoingMessage[]> {
    // Erstkontakt: onboardingStatus NOT_STARTED -> direkt die erste Frage
    // (Begrüssung + Einwilligung) zeigen, ohne die Nachricht als "Antwort" zu werten.
    if (employee.onboardingStatus === "NOT_STARTED") {
      const updated = { ...employee, onboardingStatus: "AWAITING_CONSENT" as const };
      await this.employees.update(updated);
      const prompt = nextOnboardingPrompt("CONSENT");
      await this.conversations.append(employee.id, "ASSISTANT", prompt, false);
      return [{ type: "text", text: prompt }];
    }

    const outcome = processOnboardingAnswer(employee, answerText);
    await this.employees.update(outcome.employee);
    await this.conversations.append(outcome.employee.id, "ASSISTANT", outcome.replyText, false);

    if (!outcome.completedJustNow) {
      if (outcome.employee.onboardingStep === "COMPLAINT_LOCATION") {
        return [{ type: "quickReply", text: outcome.replyText, options: COMPLAINT_LOCATION_SUGGESTIONS }];
      }
      return [{ type: "text", text: outcome.replyText }];
    }

    // Onboarding gerade abgeschlossen: Willkommenstext + erste passende Übung
    // (als eigene Nachricht -- Video, Bild oder Text, siehe buildExerciseOutgoingMessages).
    await this.usageEvents.log(outcome.employee.companyId, "ONBOARDING_COMPLETED", outcome.employee.departmentId);
    const exercise = selectExerciseFor(outcome.employee.lastExerciseId, outcome.employee.complaintLocation);
    const exerciseMessages = buildExerciseOutgoingMessages(exercise);
    await this.usageEvents.log(outcome.employee.companyId, "EXERCISE_SENT", outcome.employee.departmentId);
    // lastExerciseId aktualisieren, damit die naechste Auswahl (z. B. beim
    // naechsten Scheduler-Lauf) dieselbe Uebung ausschliesst.
    await this.employees.update({ ...outcome.employee, lastExerciseId: exercise.id });
    // Conversation-Verlauf speichert weiterhin eine Text-Repräsentation, unabhängig
    // vom tatsächlichen Versandtyp (Video-/Bild-Caption oder reiner Text).
    const firstMessage = exerciseMessages[0];
    const exerciseCaption =
      firstMessage.type === "text" ? firstMessage.text : firstMessage.caption ?? "";
    await this.conversations.append(outcome.employee.id, "ASSISTANT", exerciseCaption, false);

    // Zusätzliche Stress-Übung (Atemübung/Kurzmeditation/Vagusübung), falls
    // bei der Onboarding-Frage "gestresst" mit Ja geantwortet wurde.
    let stressMessages: OutgoingMessage[] = [];
    if (outcome.employee.feelsStressed) {
      const stressExercise = selectStressReliefExercise();
      if (stressExercise) {
        stressMessages = buildExerciseOutgoingMessages(stressExercise);
        await this.usageEvents.log(outcome.employee.companyId, "EXERCISE_SENT", outcome.employee.departmentId);
        const stressFirst = stressMessages[0];
        const stressCaption = stressFirst.type === "text" ? stressFirst.text : stressFirst.caption ?? "";
        await this.conversations.append(outcome.employee.id, "ASSISTANT", stressCaption, false);
      }
    }

    // Kein Gesundheitstipp mehr sofort hier (siehe Chat-Antwort) -- kommt
    // stattdessen wie im taeglichen Ablauf ueber den separaten Vormittags-
    // Scheduler-Trigger (sendForenoonHealthTip), sobald dieser als naechstes
    // laeuft. Der Mitarbeiter hat ab hier onboardingStatus COMPLETED und
    // wird von diesem Trigger automatisch beruecksichtigt.

    // Smiley-Feedback nach JEDER gesendeten Übung, auch der allerersten
    // (siehe Chat-Antwort) -- eigene Nachricht nach den Übungs-Nachrichten.
    await this.conversations.append(outcome.employee.id, "ASSISTANT", FEEDBACK_PROMPT_TEXT, false);

    return [
      { type: "text", text: outcome.replyText },
      ...exerciseMessages,
      ...stressMessages,
      feedbackQuickReply(),
    ];
  }

  private async continueCoachingDialog(employee: Employee, incomingText: string): Promise<OutgoingMessage[]> {
    // Antwort auf den woechentlichen Check-in abfangen, falls gerade eine
    // Frage dazu offen ist (siehe sendWeeklyCheckins). Hat Vorrang vor
    // Feedback-Smileys/KI-Dialog, da die naechste Nachricht sonst
    // faelschlich als normale Konversation interpretiert wuerde.
    if (employee.awaitingWeeklyCheckin) {
      const score = WEEKLY_CHECKIN_SCORE_BY_EMOJI[incomingText.trim()];
      if (score === undefined) {
        return [{ type: "text", text: WEEKLY_CHECKIN_INVALID }];
      }
      await this.usageEvents.log(employee.companyId, "WEEKLY_CHECKIN", employee.departmentId, score);
      await this.employees.update({ ...employee, awaitingWeeklyCheckin: false });
      await this.conversations.append(employee.id, "ASSISTANT", WEEKLY_CHECKIN_THANKS, false);
      return [{ type: "text", text: WEEKLY_CHECKIN_THANKS }];
    }

    // Smiley-Feedback abfangen, bevor die AI ueberhaupt konsultiert wird --
    // anonymisiert geloggt (siehe FEEDBACK_EVENT_BY_EMOJI), keine Freitext-
    // Speicherung. Kein AI-Call noetig, spart Kosten und ist deterministisch.
    const feedbackEvent = classifyFeedbackEmoji(incomingText);
    if (feedbackEvent) {
      await this.usageEvents.log(employee.companyId, feedbackEvent, employee.departmentId);
      await this.conversations.append(employee.id, "ASSISTANT", FEEDBACK_THANKS_REPLY, false);
      return [{ type: "text", text: FEEDBACK_THANKS_REPLY }];
    }

    const history = await this.conversations.recentByEmployee(employee.id, CONVERSATION_HISTORY_WINDOW);
    const library = getExerciseLibrary();

    let reply = await this.aiClient.generateReply(history, library);

    // Zweite, server-seitige Sicherheitsebene für AI-Antworten (siehe
    // escalation.service.ts / API_DOKUMENTATION.md): verbotene Begriffe
    // dürfen den Nutzer nie erreichen.
    if (containsForbiddenMedicalLanguage(reply)) {
      reply = SAFE_FALLBACK_REPLY;
    }

    await this.conversations.append(employee.id, "ASSISTANT", reply, false);
    return [{ type: "text", text: reply }];
  }

  // Externer Scheduler-Trigger (siehe routes/jobs.ts, Chat-Antwort Luecke 1+2:
  // "kein Scheduler" / "Erinnerung ist leere Zusage"). Wird taeglich von
  // aussen aufgerufen (z. B. Render Cron Job), NICHT durch einen In-Process-
  // Timer -- so funktioniert es zuverlaessig auch dann, wenn der Server
  // zwischenzeitlich (Render Free-Tier) im Ruhezustand war.
  //
  // lastReminderSentAt verhindert Doppel-Versand am selben Tag, falls der
  // externe Trigger mehrfach aufgerufen wird. Uebersprungen werden: nicht
  // abgeschlossenes Onboarding, abgemeldete Mitarbeitende (optedOut) und
  // Mitarbeitende, die heute schon eine Erinnerung bekommen haben.
  async sendDailyReminders(): Promise<Array<{ whatsappNumberHash: string; messages: OutgoingMessage[] }>> {
    const companyEmployees = await this.employees.listByCompany(DEFAULT_COMPANY_ID);
    const results: Array<{ whatsappNumberHash: string; messages: OutgoingMessage[] }> = [];

    for (const employee of companyEmployees) {
      if (employee.onboardingStatus !== "COMPLETED") continue;
      if (employee.optedOut) continue;
      if (employee.lastReminderSentAt && isSameDay(employee.lastReminderSentAt, new Date())) continue;

      const exercise = selectExerciseFor(employee.lastExerciseId, employee.complaintLocation);
      const exerciseMessages = buildExerciseOutgoingMessages(exercise);
      await this.usageEvents.log(employee.companyId, "EXERCISE_SENT", employee.departmentId);
      await this.employees.update({ ...employee, lastExerciseId: exercise.id, lastReminderSentAt: new Date() });

      const firstMessage = exerciseMessages[0];
      const caption = firstMessage.type === "text" ? firstMessage.text : firstMessage.caption ?? "";
      await this.conversations.append(employee.id, "ASSISTANT", caption, false);

      // Guten-Morgen-Gruss + Motivations-/Achtsamkeitsspruch (siehe
      // Chat-Antwort) -- Motivation zieht damit aus dem separaten
      // Mittags-Trigger (entfaellt, siehe sendMidDayMotivation weiter unten)
      // in die Frueh-Nachricht. morningGreeting() liefert [] ohne
      // freigegebenen Spruch -- kein Fehlerfall, nur der Gruss fehlt dann.
      results.push({
        whatsappNumberHash: employee.whatsappNumberHash,
        messages: [...morningGreeting(), ...exerciseMessages, feedbackQuickReply()],
      });
    }

    return results;
  }

  // Externer Scheduler-Trigger fuer die woechentliche Selbsteinschaetzung
  // (Luecke 4). Setzt awaitingWeeklyCheckin, damit die naechste eingehende
  // Nachricht in continueCoachingDialog als Check-in-Wert interpretiert wird.
  async sendWeeklyCheckins(): Promise<Array<{ whatsappNumberHash: string; messages: OutgoingMessage[] }>> {
    const companyEmployees = await this.employees.listByCompany(DEFAULT_COMPANY_ID);
    const results: Array<{ whatsappNumberHash: string; messages: OutgoingMessage[] }> = [];

    for (const employee of companyEmployees) {
      if (employee.onboardingStatus !== "COMPLETED") continue;
      if (employee.optedOut) continue;

      await this.employees.update({ ...employee, awaitingWeeklyCheckin: true });
      await this.conversations.append(employee.id, "ASSISTANT", WEEKLY_CHECKIN_PROMPT, false);

      results.push({
        whatsappNumberHash: employee.whatsappNumberHash,
        messages: [{ type: "quickReply", text: WEEKLY_CHECKIN_PROMPT, options: WEEKLY_CHECKIN_OPTIONS }],
      });
    }

    return results;
  }

  // Externer Scheduler-Trigger fuer den Gesundheitstipp am Vormittag (siehe
  // Chat-Antwort) -- bewusst getrennt von der Frueh-Uebung, eigener,
  // spaeterer Zeitpunkt (z. B. 10 Uhr). Liefert eine leere Liste, solange
  // kein Tipp in healthTips.data.ts freigegeben ist.
  async sendForenoonHealthTip(): Promise<Array<{ whatsappNumberHash: string; messages: OutgoingMessage[] }>> {
    const companyEmployees = await this.employees.listByCompany(DEFAULT_COMPANY_ID);
    const results: Array<{ whatsappNumberHash: string; messages: OutgoingMessage[] }> = [];
    const tipMessages = dailyHealthTipMessage();
    if (tipMessages.length === 0) return results;

    for (const employee of companyEmployees) {
      if (employee.onboardingStatus !== "COMPLETED") continue;
      if (employee.optedOut) continue;

      const firstTip = tipMessages[0];
      const text = firstTip.type === "text" ? firstTip.text : "";
      await this.conversations.append(employee.id, "ASSISTANT", text, false);
      results.push({ whatsappNumberHash: employee.whatsappNumberHash, messages: tipMessages });
    }

    return results;
  }
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
