// Verlaessliche Opt-out/Opt-in-Erkennung, unabhaengig vom freien KI-Dialog
// (siehe Chat-Antwort, Luecke 3: "kein Opt-out/Pause-Mechanismus"). Bewusst
// deterministisch wie escalation.service.ts -- ein Machtgefaelle-sensibles
// Gesundheitsprodukt (GESCHAEFTSREGELN.md Regel 5) darf sich beim Abmelden
// nicht auf ein KI-Modell verlassen, das Anweisungen vergessen koennte.

const OPT_OUT_PATTERNS = [/\bstopp?\b/i, /keine nachrichten mehr/i, /abmelden/i, /\bpause\b/i];
const OPT_IN_PATTERNS = [/\bstart\b/i, /wieder anmelden/i, /reaktivier/i];

export function isOptOutCommand(text: string): boolean {
  return OPT_OUT_PATTERNS.some((pattern) => pattern.test(text));
}

export function isOptInCommand(text: string): boolean {
  return OPT_IN_PATTERNS.some((pattern) => pattern.test(text));
}

export const OPT_OUT_REPLY =
  "Alles klar, ich melde mich nicht mehr bei dir. Schreib jederzeit wieder \"Start\", " +
  "wenn du es dir anders überlegst.";

export const OPT_IN_REPLY = "Willkommen zurück! Ich melde mich wieder mit deiner nächsten Übung.";

export const OPTED_OUT_REMINDER =
  "Du hast dich abgemeldet -- ich schicke dir gerade keine Übungen. Schreib \"Start\", " +
  "um wieder Nachrichten zu erhalten.";
