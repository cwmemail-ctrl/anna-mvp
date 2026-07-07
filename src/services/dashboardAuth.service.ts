// Reine Pruef-Funktion, kein Express-Bezug -- so laesst sie sich isoliert
// testen (siehe tests/dashboard.auth.test.ts) und ist unabhaengig davon
// wiederverwendbar, welches HTTP-Framework die Route letztlich nutzt.
// Erwartet "Authorization: Bearer <token>".
export function isAuthorized(authorizationHeader: string | undefined, expectedToken: string): boolean {
  if (!authorizationHeader) return false;
  const [scheme, token] = authorizationHeader.split(" ");
  return scheme === "Bearer" && Boolean(token) && token === expectedToken;
}
