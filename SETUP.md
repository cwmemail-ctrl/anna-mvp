# Anna – Kern-MVP: Setup

## Was hier drin ist

Webhook → Onboarding (mit DSGVO-Einwilligung) → Eskalationsprüfung → Coaching-Dialog,
inklusive Arbeitgeber-Dashboard, taeglichem Erinnerungs-Scheduler, woechentlichem
Check-in und Opt-out/Opt-in. **Weiterhin bewusst nicht enthalten:** echte BSP-Anbindung
(360dialog/Twilio ist noch offen).

Läuft komplett lokal ohne echte Zugangsdaten: `WHATSAPP_MODE=mock` loggt Nachrichten
in die Konsole statt sie zu versenden, `AI_MODE=mock` liefert deterministische
Test-Antworten statt echte Anthropic-API-Calls.

## Installation

```bash
npm install
cp .env.example .env
npm run dev
```

Server läuft dann auf `http://localhost:3000`. Health-Check: `GET /health`.

## Testen ohne echtes WhatsApp

```bash
curl -X POST http://localhost:3000/api/v1/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"from": "+43000000000", "text": "Hallo"}'
```

Antwort erscheint als Log-Zeile im Server-Terminal (`[MockWhatsAppClient] -> ...`),
nicht im HTTP-Response-Body – das entspricht dem echten WhatsApp-Webhook-Verhalten
(siehe `API_DOKUMENTATION.md`: schnelle 200-Bestätigung, Antwort geht asynchron
über die BSP-API raus).

Schick einfach nacheinander weitere Nachrichten mit derselben `from`-Nummer, um durch
Einwilligung → Tätigkeitsart → Beschwerden-Frage → Stress-Frage → erste Übung zu gehen.
Danach landest du im freien Coaching-Dialog. Eine Nachricht mit einem Warnsignal
(z. B. "die Schmerzen strahlen ins Bein aus") löst sofort die Eskalationsantwort aus,
unabhängig vom Gesprächsstatus.

## Tests

```bash
npm test
```

80 Tests, Fokus auf Eskalationslogik (echte Warnsignal-Formulierungen, wie in
`CODING_GUIDELINES.md` gefordert), Onboarding-Reihenfolge/Einwilligung, Übungsauswahl,
Dashboard-Aggregation, Opt-out/Opt-in und die Scheduler-Methoden.

## Backend hosten (z. B. Render)

Damit ein BSP den Webhook überhaupt erreichen kann, braucht es eine öffentliche
HTTPS-URL -- lokal (`localhost`) reicht dafür nicht. Render passt gut, weil es
Node-Projekte ohne Docker/Config-Aufwand deployt:

1. Projekt zu einem Git-Repository machen (GitHub/GitLab), falls noch nicht geschehen
2. Bei [render.com](https://render.com) einloggen → **New** → **Web Service** → Repository verbinden
3. Einstellungen:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Node Version:** wird über das `engines`-Feld in `package.json` erkannt (>=22)
4. **Environment Variables** im Render-Dashboard eintragen (Inhalte aus deiner lokalen `.env`):
   - `WEBHOOK_HASH_SECRET` (Pflicht -- der Server startet sonst nicht, siehe unten)
   - `DASHBOARD_API_TOKEN` (Pflicht -- schützt die Arbeitgeber-Dashboard-Routen, siehe unten)
   - `WHATSAPP_MODE`, `AI_MODE`, ggf. `ANTHROPIC_API_KEY`
5. Deploy abwarten, dann ist der Webhook unter
   `https://<dein-service>.onrender.com/api/v1/webhook/whatsapp` erreichbar -- diese
   URL später beim BSP (360dialog) als Webhook-Ziel hinterlegen

**Wichtig:** `WEBHOOK_HASH_SECRET` und `DASHBOARD_API_TOKEN` sind Pflichtfelder (kein
automatischer Zufalls-Fallback) -- ohne gesetzte Werte wirft der Server beim Start einen
klaren Fehler. Beide einmalig generieren (gleicher Befehl, unterschiedliche Werte):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
und sowohl lokal in `.env` als auch im Hosting-Dashboard eintragen (gleicher Wert an
beiden Stellen ist nicht nötig, aber jede Umgebung braucht ihre eigenen gesetzten Werte).

**Dashboard-Abfrage testen** (mit dem `DASHBOARD_API_TOKEN`-Wert aus deiner `.env`):
```bash
curl http://localhost:3000/api/v1/dashboard/pilot-company/summary \
  -H "Authorization: Bearer <dein DASHBOARD_API_TOKEN>"
```
Ohne oder mit falschem Header liefert die Route `401 Nicht autorisiert`.

## Täglicher Scheduler & wöchentlicher Check-in

Zwei Endpunkte, gedacht für einen **externen** Trigger (z. B. Render Cron Job oder
[cron-job.org](https://cron-job.org)) -- absichtlich kein In-Process-Timer, da Render im
kostenlosen Tarif nach Inaktivität schläft und ein interner Timer dann nicht zuverlässig
"jeden Morgen" feuern würde. Der externe Dienst entscheidet, WANN aufgerufen wird
(z. B. täglich 8 Uhr) -- die Route entscheidet nur, WAS beim Aufruf passiert.

Geschützt mit `JOB_TRIGGER_TOKEN` (eigener Token, getrennt vom Dashboard-Token, da ein
Cron-Dienst und ein HR-Nutzer unterschiedliche Aufrufer sind):

```bash
# Taegliche Erinnerung: Guten-Morgen-Gruss + Achtsamkeitsspruch
# (kommt von Anna, nicht vom Arbeitgeber -- siehe GESCHAEFTSREGELN.md Regel 5)
# + Uebung mit Beschreibung, an alle abgeschlossenen, nicht abgemeldeten
# Mitarbeitenden.
curl -X POST http://localhost:3000/api/v1/jobs/daily-reminders \
  -H "Authorization: Bearer <dein JOB_TRIGGER_TOKEN>"

# Woechentlicher Check-in (Emoji-Skala 😢😟😐🙂😄)
curl -X POST http://localhost:3000/api/v1/jobs/weekly-checkin \
  -H "Authorization: Bearer <dein JOB_TRIGGER_TOKEN>"

# Gesundheitstipp am Vormittag, bewusst getrennt von der Frueh-Uebung.
# Verschickt nichts, solange kein Tipp in healthTips.data.ts freigegeben ist.
curl -X POST http://localhost:3000/api/v1/jobs/forenoon-health-tip \
  -H "Authorization: Bearer <dein JOB_TRIGGER_TOKEN>"
```

Bei Render: **Dashboard → Cron Jobs → New Cron Job**, Ziel-URL wie oben, Zeitplan z. B.
`0 8 * * *` (täglich 8 Uhr) für die Erinnerung, `0 9 * * 1` (montags 9 Uhr) für den Check-in,
`0 10 * * *` (täglich 10 Uhr) für den Gesundheitstipp am Vormittag.

## Opt-out / Opt-in

Mitarbeitende können jederzeit mit **"Stop"**, **"Pause"** oder **"abmelden"** die
Nachrichten stoppen -- unabhängig vom Gesprächsstatus, deterministisch erkannt (nicht über
die KI). **"Start"** meldet wieder an. Eskalationsprüfung funktioniert auch bei
abgemeldeten Mitarbeitenden weiter (Sicherheit hat Vorrang, siehe `GESCHAEFTSREGELN.md`
Regel 2).

## Auf echte Infrastruktur umstellen (später)

- **BSP:** `src/whatsapp/client.interface.ts` implementieren (z. B. `client.360dialog.ts`),
  in `src/server.ts` statt `MockWhatsAppClient` einsetzen, `WHATSAPP_MODE=live` erlauben
  (aktuell wirft `loadConfig()` bewusst einen Fehler, da die BSP-Wahl noch offen ist).
- **AI:** `AI_MODE=live` + `ANTHROPIC_API_KEY` in `.env` setzen – die echte Implementierung
  (`AnthropicAIClient`) existiert bereits.
- **DB:** Die drei Repository-Interfaces in `src/db/*.repository.ts` gegen eine
  Prisma/Postgres-Implementierung austauschen (Felder sind 1:1 aus `DATENBANKSCHEMA.md`
  übernommen). Service-Schicht muss dafür nicht angefasst werden.
