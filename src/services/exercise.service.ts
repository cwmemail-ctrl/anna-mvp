import { EXERCISE_LIBRARY } from "../data/exercises.data.js";
import type { Exercise, OutgoingMessage } from "../types/domain.js";

export function getExerciseLibrary(): readonly Exercise[] {
  return EXERCISE_LIBRARY.filter((e) => e.active);
}

// Gemeinsames Pattern fuer beide Auswahlfunktionen unten: letzte Uebung
// ausschliessen, aber nur wenn danach noch etwas im Pool uebrig bleibt.
// Exportiert, damit dieser Kern-Mechanismus unabhaengig von der aktuellen
// Bibliotheksgroesse getestet werden kann (siehe exercise.service.test.ts).
export function excludeLast(pool: readonly Exercise[], lastExerciseId?: string): readonly Exercise[] {
  const withoutLast = lastExerciseId ? pool.filter((e) => e.id !== lastExerciseId) : pool;
  return withoutLast.length > 0 ? withoutLast : pool;
}

// Einfacher Freitext-Abgleich: prueft, ob das vom Nutzer genannte Beschwerde-
// Stichwort (z. B. "Ruecken") in Name oder Beschreibung der Uebung vorkommt.
// Kein festes Kategorie-Feld an Exercise noetig (siehe Entfernung von
// targetArea) -- nutzt die ohnehin vorhandenen Texte.
function matchesComplaintLocation(exercise: Exercise, keyword: string): boolean {
  const text = `${exercise.name} ${exercise.description}`.toLowerCase();
  return text.includes(keyword);
}

// Fuer die Rueckfrage in onboarding.service.ts (COMPLAINT_LOCATION-Schritt):
// true, wenn mindestens eine Nicht-Stress-Uebung zum Stichwort passt. Leerer/
// undefined Wert gilt als "kein Problem" (true), da dann ohnehin keine
// Beschwerde angegeben wurde.
export function hasExerciseForComplaint(complaintLocation?: string): boolean {
  const keyword = complaintLocation?.trim().toLowerCase();
  if (!keyword) return true;
  return getExerciseLibrary().some((e) => !e.forStress && matchesComplaintLocation(e, keyword));
}

// Zufaellige, rotierende Auswahl, optional nach Beschwerde-Ort vorgefiltert
// (complaintLocation, Freitext aus dem Onboarding -- siehe
// Employee.complaintLocation). Ohne Treffer oder ohne Angabe: voller
// Nicht-Stress-Pool wie bisher. Stress-Uebungen (forStress) bleiben
// ausgeschlossen -- die werden separat ueber selectStressReliefExercise()
// gesteuert. lastExerciseId verhindert weiterhin eine direkte Wiederholung.
export function selectExerciseFor(lastExerciseId?: string, complaintLocation?: string): Exercise {
  const basePool = getExerciseLibrary().filter((e) => !e.forStress);
  let pool = basePool;
  const keyword = complaintLocation?.trim().toLowerCase();
  if (keyword) {
    const matches = basePool.filter((e) => matchesComplaintLocation(e, keyword));
    if (matches.length > 0) pool = matches;
  }
  const candidates = excludeLast(pool, lastExerciseId);
  const randomIndex = Math.floor(Math.random() * candidates.length);
  return candidates[randomIndex];
}

// Zusätzliche Übung für Mitarbeitende, die bei der Onboarding-Frage
// "Fühlst du dich aktuell eher gestresst?" mit Ja geantwortet haben (siehe
// Employee.feelsStressed). Unabhängig von primaryConcern/workType -- diese
// Übungen (Atemübung, Kurzmeditation, Vagusübung) passen unabhängig von
// Tätigkeit oder Körperbereich. Gibt undefined zurück, falls keine
// forStress-Übung in der Bibliothek aktiv ist (kein Fehlerfall).
export function selectStressReliefExercise(lastExerciseId?: string): Exercise | undefined {
  const pool = getExerciseLibrary().filter((e) => e.forStress);
  if (pool.length === 0) return undefined;
  const candidates = excludeLast(pool, lastExerciseId);
  const randomIndex = Math.floor(Math.random() * candidates.length);
  return candidates[randomIndex];
}

export function formatExerciseMessage(exercise: Exercise): string {
  const sets = exercise.sets ?? 4;
  // Kopfzeilen-Dauer je nach Uebungsart: Stress-Uebungen haben einen fest
  // beschriebenen Zeitablauf (durationSeconds), isometrische Uebungen zeigen
  // ihre Haltedauer, dynamische (Wiederholungs-)Uebungen haben keine sinnvolle
  // Zeitangabe -- da zaehlen Wiederholungen, keine Sekunden.
  let displaySeconds: number | undefined;
  if (exercise.forStress) {
    displaySeconds = exercise.durationSeconds;
  } else if (exercise.isometric) {
    displaySeconds = exercise.holdSeconds ?? 45;
  } else {
    displaySeconds = undefined;
  }
  const durationLabel = displaySeconds ? ` (${Math.round(displaySeconds / 60) || 1} Min.)` : "";

  // Hinweis nur bei Dehn-/Kraeftigungsuebungen sinnvoll. Stress-Uebungen
  // (Atmung/Meditation/Summen, siehe forStress) haben einen festen Rhythmus --
  // kein Serien-Schema. Isometrische Uebungen (Halten) bekommen einen eigenen
  // Text statt des Wiederholungs-Schemas.
  let trainingHint = "";
  if (exercise.forStress) {
    trainingHint = "";
  } else if (exercise.isometric) {
    const holdSeconds = exercise.holdSeconds ?? 45;
    trainingHint =
      `\n\nHalte die Position ${holdSeconds} Sek., ${sets} Serien, mit 30 Sek. Pause zwischen den Serien. ` +
      `Schaffst du die ${holdSeconds} Sek. nicht, halte einfach so lange, wie du kannst.`;
  } else {
    const repetitions = exercise.repetitions ?? 10;
    trainingHint =
      `\n\nFühre ${sets} Serien mit je ${repetitions} Wiederholungen aus, mit 30 Sek. Pause zwischen den Serien. ` +
      `Schaffst du nicht alle Wiederholungen oder Serien, mach einfach so viele, wie du kannst.`;
  }
  return `*${exercise.name}*${durationLabel}\n\n${exercise.description}${trainingHint}`;
}

// YouTube-Seiten liefern keine rohe Mediendatei -- eine WhatsApp-Video-Nachricht
// (sendVideo) wuerde damit fehlschlagen (siehe Kommentar bei OutgoingMessage in
// types/domain.ts). Solche Links werden deshalb IMMER als Text mit klickbarem
// Link behandelt, nie als "video"-Nachricht, unabhaengig vom Inhalt.
function isNonDownloadableVideoPageUrl(url: string): boolean {
  return /(?:youtube\.com\/(?:watch|shorts)|youtu\.be\/)/i.test(url);
}

// Entscheidet Video- vs. Bild- vs. Text-Versand: videoUrl geht vor imageUrl
// geht vor reinem Text. Beide Medientypen bekommen den gleichen Begleittext
// als Caption (bewusste Entscheidung trotz des Risikos, dass die Beschreibung
// mit verschwindet, falls der Medienversand selbst fehlschlaegt -- siehe
// Chat-Antwort). YouTube-artige Seiten-Links werden trotz gesetzter videoUrl
// als Text mit Link behandelt (siehe isNonDownloadableVideoPageUrl).
export function buildExerciseOutgoingMessages(exercise: Exercise): OutgoingMessage[] {
  const caption = formatExerciseMessage(exercise);
  if (exercise.videoUrl && !isNonDownloadableVideoPageUrl(exercise.videoUrl)) {
    return [{ type: "video", videoUrl: exercise.videoUrl, caption }];
  }
  if (exercise.videoUrl) {
    return [{ type: "text", text: `${caption}\n\n${exercise.videoUrl}` }];
  }
  if (exercise.imageUrl) {
    return [{ type: "image", imageUrl: exercise.imageUrl, caption }];
  }
  return [{ type: "text", text: caption }];
}
