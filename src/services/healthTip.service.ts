import { HEALTH_TIPS } from "../data/healthTips.data.js";
import type { HealthTip } from "../types/domain.js";

// Nur freigegebene Tipps (active:true) kommen in Frage -- solange alle
// Entwuerfe in healthTips.data.ts active:false haben, liefert diese Funktion
// konsequent undefined und es wird nichts verschickt (siehe coaching.service.ts).
export function selectHealthTip(): HealthTip | undefined {
  const activeTips = HEALTH_TIPS.filter((tip) => tip.active);
  if (activeTips.length === 0) return undefined;
  return activeTips[Math.floor(Math.random() * activeTips.length)];
}
