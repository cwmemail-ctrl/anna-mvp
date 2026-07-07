// Server-seitige Eskalationsprüfung -- UNABHÄNGIG von der AI.
// GESCHAEFTSREGELN.md Regel 2: "Sich allein auf das Sprachmodell zu verlassen,
// ist nicht ausreichend." Diese Funktion läuft deshalb auf JEDER eingehenden
// Nachricht, bevor Onboarding-Logik oder AI überhaupt konsultiert werden.
//
// Prinzip: Ein Fehler in Richtung "zu vorsichtig eskalieren" ist immer
// akzeptabler als eine übersehene Warnsignal-Situation. Die Liste ist
// deshalb bewusst breit und Substring-basiert (kein Versuch von cleverer,
// aber fehleranfälliger NLP für den MVP).

export interface EscalationResult {
  escalate: boolean;
  matchedSignals: string[];
}

interface WarningSignal {
  label: string;
  patterns: RegExp[];
}

// Jede Kategorie entspricht einem in GESCHAEFTSREGELN.md genannten Warnsignal.
// Bei Erweiterung: Kategorie hinzufügen + Testfall in escalation.service.test.ts.
const WARNING_SIGNALS: WarningSignal[] = [
  {
    label: "starke_zunehmende_ausstrahlende_schmerzen",
    patterns: [/stark/i, /zunehmend/i, /immer schlimmer/i, /ausstrahl/i, /strahl\w*.*aus/i, /schlimmer gewor/i],
  },
  {
    label: "taubheit_kribbeln",
    patterns: [/taub/i, /kribbel/i, /gef[uü]hllos/i],
  },
  {
    label: "schwaeche",
    patterns: [/schw[aä]che/i, /kraftlos/i, /kann (den|das|die) arm nicht/i, /kann (den|das|die) bein nicht/i],
  },
  {
    label: "unfall_sturz",
    patterns: [/unfall/i, /gest[uü]rzt/i, /sturz/i, /hingefallen/i],
  },
  {
    label: "fieber_mit_schmerzen",
    patterns: [/fieber/i],
  },
  {
    label: "explizite_bitte_medizinischer_rat",
    patterns: [
      /was hab ich/i,
      /ist das schlimm/i,
      /soll ich zum arzt/i,
      /brauche ich einen arzt/i,
      /kannst du mir sagen was das ist/i,
      /diagnos/i,
    ],
  },
];

export function checkForEscalation(messageText: string): EscalationResult {
  const matched = WARNING_SIGNALS.filter((signal) =>
    signal.patterns.some((pattern) => pattern.test(messageText))
  ).map((signal) => signal.label);

  return {
    escalate: matched.length > 0,
    matchedSignals: matched,
  };
}

// Zweite, unabhängige Sicherheitsebene für AI-generierte Antworten:
// GESCHAEFTSREGELN.md Regel 1 verbietet Wörter wie "Diagnose", "Therapie",
// "Behandlung" in JEDER AI-Antwort. Diese Prüfung läuft NACH dem AI-Call,
// bevor eine Antwort versendet wird (siehe API_DOKUMENTATION.md: "die
// AI-Antwort allein ist nicht die letzte Instanz").
const FORBIDDEN_MEDICAL_TERMS = [/diagnos/i, /therapie/i, /behandl/i];

export function containsForbiddenMedicalLanguage(text: string): boolean {
  return FORBIDDEN_MEDICAL_TERMS.some((pattern) => pattern.test(text));
}

// Grenzfall-Erkennung fuer coaching.service.ts (siehe BorderlineCase in
// types/domain.ts): erwaehnt die Nachricht ueberhaupt Schmerzen, unabhaengig
// davon, ob eines der echten Warnsignale oben zutrifft? Bewusst breiter/
// unschaerfer als WARNING_SIGNALS und hat KEINEN Einfluss auf checkForEscalation
// -- dient nur dazu, dem Physiotherapeuten Formulierungen zur Durchsicht
// vorzulegen, bei denen die Warnsignal-Liste eventuell noch Luecken hat.
const BORDERLINE_PAIN_INDICATORS = [/schmerz/i, /\bweh\b/i, /\baua\b/i];

export function isBorderlinePainMention(messageText: string): boolean {
  return BORDERLINE_PAIN_INDICATORS.some((pattern) => pattern.test(messageText));
}
