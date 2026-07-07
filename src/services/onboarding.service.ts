import { hasExerciseForComplaint } from "./exercise.service.js";
import type { Employee, OnboardingStep, WorkType } from "../types/domain.js";

// Deterministische Frage-Führung (kein AI-Call nötig) -- so bleibt der
// kritischste Teil (Einwilligung + Erstkontakt) unabhängig von Modell-
// Verhalten. Reihenfolge gemäss PRODUKTANFORDERUNGEN.md: kurze Fragen
// nacheinander, nicht alle auf einmal.

export interface OnboardingOutcome {
  employee: Employee;
  replyText: string;
  completedJustNow: boolean;
}

const WELCOME_AND_CONSENT =
  "Hallo! Ich bin Anna, dein digitaler Gesundheitscoach für den Alltag. " +
  "Ich bin kein Arzt und stelle keine Diagnosen -- ich zeige dir kurze Übungen " +
  "und erinnere dich daran, sie auch zu machen.\n\n" +
  "Dafür verarbeite ich ein paar Angaben zu deinen Beschwerden. Das mache ich nur, " +
  "wenn du zustimmst. Bist du einverstanden?\n\n1) Ja\n2) Nein";

const ASK_WORK_TYPE =
  "Danke! Wie sieht deine Tätigkeit überwiegend aus?\n\n" +
  "1) Sitzend\n2) Stehend\n3) Körperlich (heben, tragen, bücken)\n4) Gemischt";

const ASK_COMPLAINT_CHECK = "Hast du aktuell körperliche Beschwerden?\n\n1) Ja\n2) Nein";

const ASK_COMPLAINT_LOCATION = "Wo genau?";

function askComplaintNoMatchConfirm(complaintLocation: string): string {
  return (
    `Ich habe leider keine Übung speziell für "${complaintLocation}" -- ` +
    "soll ich dir trotzdem eine allgemeine Übung schicken?\n\n1) Ja\n2) Nein"
  );
}

const ASK_STRESS_CHECK = "Fühlst du dich aktuell eher gestresst?\n\n1) Ja\n2) Nein";

export function nextOnboardingPrompt(step: OnboardingStep): string {
  switch (step) {
    case "CONSENT":
      return WELCOME_AND_CONSENT;
    case "WORK_TYPE":
      return ASK_WORK_TYPE;
    case "COMPLAINT_CHECK":
      return ASK_COMPLAINT_CHECK;
    case "COMPLAINT_LOCATION":
      return ASK_COMPLAINT_LOCATION;
    case "COMPLAINT_NO_MATCH_CONFIRM":
      // Wird in der Praxis nie ueber diesen generischen Pfad ausgegeben --
      // die tatsaechliche, personalisierte Frage (mit dem genannten Ort)
      // kommt immer aus processOnboardingAnswer()'s replyText. Nur fuer
      // Vollstaendigkeit des Switches (TypeScript) vorhanden.
      return "Soll ich dir trotzdem eine allgemeine Übung schicken?\n\n1) Ja\n2) Nein";
    case "STRESS_CHECK":
      return ASK_STRESS_CHECK;
    case "DONE":
      return "";
  }
}

export function processOnboardingAnswer(employee: Employee, answerText: string): OnboardingOutcome {
  const answer = answerText.trim().toLowerCase();

  switch (employee.onboardingStep) {
    case "CONSENT": {
      if (isNegative(answer)) {
        return {
          employee,
          replyText:
            "Alles klar, kein Problem. Ich speichere nichts von dir. Wenn du es dir " +
            "anders überlegst, schreib mir einfach wieder.",
          completedJustNow: false,
        };
      }
      if (!isAffirmative(answer)) {
        return { employee, replyText: "Bitte antworte mit 1 (Ja) oder 2 (Nein).\n\n" + WELCOME_AND_CONSENT, completedJustNow: false };
      }
      const updated: Employee = {
        ...employee,
        onboardingStatus: "IN_PROGRESS",
        onboardingStep: "WORK_TYPE",
        consentGivenAt: new Date(),
      };
      return { employee: updated, replyText: ASK_WORK_TYPE, completedJustNow: false };
    }

    case "WORK_TYPE": {
      const workType = parseWorkType(answer);
      if (!workType) {
        return { employee, replyText: "Bitte wähle 1-4.\n\n" + ASK_WORK_TYPE, completedJustNow: false };
      }
      const updated: Employee = { ...employee, workType, onboardingStep: "COMPLAINT_CHECK" };
      return { employee: updated, replyText: ASK_COMPLAINT_CHECK, completedJustNow: false };
    }

    case "COMPLAINT_CHECK": {
      if (isNegative(answer)) {
        const updated: Employee = { ...employee, onboardingStep: "STRESS_CHECK" };
        return { employee: updated, replyText: ASK_STRESS_CHECK, completedJustNow: false };
      }
      if (!isAffirmative(answer)) {
        return { employee, replyText: "Bitte antworte mit 1 (Ja) oder 2 (Nein).\n\n" + ASK_COMPLAINT_CHECK, completedJustNow: false };
      }
      const updated: Employee = { ...employee, onboardingStep: "COMPLAINT_LOCATION" };
      return { employee: updated, replyText: ASK_COMPLAINT_LOCATION, completedJustNow: false };
    }

    case "COMPLAINT_LOCATION": {
      if (answer.length === 0) {
        return { employee, replyText: ASK_COMPLAINT_LOCATION, completedJustNow: false };
      }
      const complaintLocation = answerText.trim();
      if (!hasExerciseForComplaint(complaintLocation)) {
        // Rueckfrage statt stillem Zufalls-Fallback (siehe Chat-Antwort) --
        // complaintLocation wird trotzdem schon gespeichert, damit sie fuer
        // kuenftig ergaenzte Uebungen nutzbar bleibt, falls "Ja" geantwortet wird.
        const updated: Employee = { ...employee, complaintLocation, onboardingStep: "COMPLAINT_NO_MATCH_CONFIRM" };
        return { employee: updated, replyText: askComplaintNoMatchConfirm(complaintLocation), completedJustNow: false };
      }
      const updated: Employee = { ...employee, complaintLocation, onboardingStep: "STRESS_CHECK" };
      return { employee: updated, replyText: ASK_STRESS_CHECK, completedJustNow: false };
    }

    case "COMPLAINT_NO_MATCH_CONFIRM": {
      if (!isAffirmative(answer) && !isNegative(answer)) {
        return {
          employee,
          replyText: "Bitte antworte mit 1 (Ja) oder 2 (Nein).\n\n" + askComplaintNoMatchConfirm(employee.complaintLocation ?? ""),
          completedJustNow: false,
        };
      }
      // Bei "Nein" complaintLocation wieder loeschen, damit die Uebungsauswahl
      // sauber auf den vollen Zufalls-Pool zurueckfaellt, ohne spaeter erneut
      // (erfolglos) danach zu filtern.
      const updated: Employee = {
        ...employee,
        complaintLocation: isAffirmative(answer) ? employee.complaintLocation : undefined,
        onboardingStep: "STRESS_CHECK",
      };
      return { employee: updated, replyText: ASK_STRESS_CHECK, completedJustNow: false };
    }

    case "STRESS_CHECK": {
      if (!isAffirmative(answer) && !isNegative(answer)) {
        return { employee, replyText: "Bitte antworte mit 1 (Ja) oder 2 (Nein).\n\n" + ASK_STRESS_CHECK, completedJustNow: false };
      }
      const updated: Employee = {
        ...employee,
        feelsStressed: isAffirmative(answer),
        onboardingStep: "DONE",
        onboardingStatus: "COMPLETED",
      };
      return {
        employee: updated,
        replyText:
          "Ich schicke dir jeden Morgen eine Übung, die dich jeden Tag etwas fitter macht. " +
          "Falls eine Übung zu schwierig ist oder du während der Übung Schmerzen hast, schreib mir einfach.\n\n" +
          "Hier ist gleich die erste kurze Übung:",
        completedJustNow: true,
      };
    }

    case "DONE":
      return { employee, replyText: "", completedJustNow: false };
  }
}

function isAffirmative(answer: string): boolean {
  return ["1", "ja", "j", "yes"].includes(answer) || answer.includes("ja");
}
function isNegative(answer: string): boolean {
  return ["2", "nein", "n", "no"].includes(answer) || answer.includes("nein");
}

function parseWorkType(answer: string): WorkType | undefined {
  if (answer === "1" || answer.includes("sitz")) return "SITTING";
  if (answer === "2" || answer.includes("steh")) return "STANDING";
  if (answer === "3" || answer.includes("koerper") || answer.includes("körper")) return "PHYSICAL";
  if (answer === "4" || answer.includes("gemischt")) return "MIXED";
  return undefined;
}
