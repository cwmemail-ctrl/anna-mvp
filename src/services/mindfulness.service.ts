import { MINDFULNESS_QUOTES } from "../data/mindfulnessQuotes.data.js";
import type { MindfulnessQuote } from "../types/domain.js";

// Nur freigegebene Sprueche (active:true) kommen in Frage -- solange alle
// Entwuerfe in mindfulnessQuotes.data.ts active:false haben, liefert diese
// Funktion konsequent undefined (siehe coaching.service.ts).
export function selectMindfulnessQuote(): MindfulnessQuote | undefined {
  const activeQuotes = MINDFULNESS_QUOTES.filter((q) => q.active);
  if (activeQuotes.length === 0) return undefined;
  return activeQuotes[Math.floor(Math.random() * activeQuotes.length)];
}
