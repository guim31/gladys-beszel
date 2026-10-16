# Beszel

[Beszel](https://beszel.dev) ist ein schlankes Werkzeug zur Serverüberwachung:
Ein kleiner Agent auf jeder Maschine meldet seine Werte an einen **Hub**, der
den Verlauf speichert, das Dashboard zeigt und Alarme auslöst. Diese
Integration liest deinen Beszel-Hub und bringt deine Systeme in Gladys: ein
Gerät pro System, mit seinem Online-Zustand, Prozessor, Arbeitsspeicher,
Datenträger, höchster Temperatur, Netzwerkverkehr, Last, Laufzeit,
fehlgeschlagenen Diensten und den ausgelösten Beszel-Alarmen. Szenen können
reagieren, wenn ein System offline geht oder zurückkommt und wenn ein
Beszel-Alarm ausgelöst oder behoben wird; ein Dashboard-Widget zeigt deine
Systeme auf einen Blick. Alles bleibt in deinem lokalen Netzwerk.

Getestet mit einem echten Beszel-0.21.0-Hub und -Agenten (Docker), mit einem
angehaltenen und neu gestarteten System und ausgelösten und behobenen Alarmen.
Noch nicht auf jeder Installation: Rückmeldungen sind willkommen in
[den Issues](https://github.com/guim31/gladys-beszel/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Einen Beszel-Hub (0.12 oder neuer, 0.21 getestet), erreichbar von der
  Gladys-Maschine (standardmäßig Port 8090), mit bereits hinzugefügten
  Agenten.
- E-Mail und Passwort eines Beszel-Benutzers. Am besten: ein eigener Benutzer
  für Gladys mit der Rolle **Nur lesen**.

Die Integration liest nur: In Beszel und auf deinen Maschinen ändert sie nie
etwas.

## Erste Schritte

### 1. Einen Beszel-Benutzer für Gladys anlegen

Die Integration sieht genau das, was ihr Benutzer sieht: die mit ihm geteilten
Systeme und **seine eigenen Alarme**.

1. Öffne das Admin-Panel von PocketBase unter `http://<hub>:8090/_/`
   (Beszel-Menü → **Users** in neueren Versionen) und lege in der Sammlung
   `users` einen Benutzer an: eine E-Mail, ein Passwort, die Rolle
   `readonly`, `verified` angehakt.
2. Teile die Systeme mit ihm: Entweder startest du den Hub mit der
   Umgebungsvariablen `SHARE_ALL_SYSTEMS=true` (jeder Benutzer sieht alle
   Systeme), oder du fügst den Benutzer im selben Panel dem Feld `users`
   jedes Systems hinzu.
3. Beszel-Alarme gehören einem Benutzer: Melde dich mit diesem Benutzer bei
   Beszel an und lege die Alarme an, die die Szenen kennen sollen
   (Glockensymbol eines Systems). Ein Benutzer mit Lesezugriff darf seine
   eigenen Alarme verwalten.

Du kannst auch dein eigenes Beszel-Konto verwenden: Die Integration sieht dann
deine Systeme und deine Alarme.

### 2. Die Integration konfigurieren

Im Tab **Konfiguration** der Integration:

- **Beszel-Adresse**: die Adresse des Hubs, wie du sie im Browser öffnest:
  `192.168.1.20` (Port 8090 wird ergänzt), `nas.lan:8090` oder
  `https://beszel.example.com`.
- **E-Mail des Beszel-Benutzers** und **Passwort**.
- **Aktualisierungsintervall**: standardmäßig 30 Sekunden. Der Hub liest seine
  Agenten selbst einmal pro Minute: Ein kürzeres Intervall bringt nichts.
- **Selbstsignierte Zertifikate akzeptieren**: nur für eine
  `https://`-Adresse, deren Zertifikat auch dein Browser nicht anerkennt.
- **Sprache der Namen**: Sprache der Funktionsnamen, beim Hinzufügen eines
  Geräts festgelegt, und der Texte für die Szenen.

Speichere und klicke dann auf **Verbindung testen**: Es zeigt die
Beszel-Version, wie viele Systeme online sind und wie viele Alarme ausgelöst
sind.

### 3. Die Systeme hinzufügen

Öffne den Tab **Entdecken**: Jedes System des Benutzers ist dort aufgeführt.
Füge die hinzu, die du verfolgen willst. Die Szenen-Auslöser funktionieren für
alle Systeme, ob hinzugefügt oder nicht.

## Die Geräte

Jedes System ist ein Gerät mit seinem Namen aus Beszel. Seine Funktionen:

- **Online**: 1, solange Beszel das System als online markiert, 0, wenn es
  offline ist. Ein pausiertes System sendet nichts.
- **Prozessor**, **Arbeitsspeicher** und **Datenträger**: die Auslastung in %
  von Prozessor, Arbeitsspeicher und Systemlaufwerk.
- **Höchste Temperatur**: die Temperatur, die Beszel im Dashboard zeigt (der
  heißeste Sensor), in °C, wenn das System Sensoren hat.
- **Netzwerkverkehr**: Senden und Empfangen zusammen, in Mbit/s.
- **Last (1 Min.)**, **Last (5 Min.)**, **Last (15 Min.)**: die
  durchschnittliche Last.
- **Laufzeit**: in Tagen.
- **Fehlgeschlagene Dienste**: die fehlgeschlagenen systemd-Dienste, wenn der
  Agent sie überwacht.
- **Ausgelöste Alarme**: wie viele Beszel-Alarme des Benutzers auf diesem
  System ausgelöst sind.

Die Werte, die sich ständig ändern (Prozessor, Arbeitsspeicher, Last,
Netzwerk, Temperatur), gehen höchstens einmal pro Minute an Gladys, die
anderen, wenn sie sich ändern. Solange ein System offline ist, werden nur
**Online** und **Ausgelöste Alarme** aktualisiert: Die letzten Werte bleiben.

## Dashboard

Füge das Widget **Beszel-Systeme** einem Dashboard hinzu:

- Ohne gewähltes System in seinen Einstellungen zeigt es, wie viele Systeme
  online und offline sind und wie viele Alarme ausgelöst sind, dann eine Zeile
  pro System, rot, wenn es offline ist, orange mit einem ausgelösten Alarm;
- mit einem gewählten System zeigt es seine Anzeigen für Prozessor,
  Arbeitsspeicher und Datenträger, seine Temperatur, seine ausgelösten Alarme,
  seine Last und seine Laufzeit.

Die Schaltfläche **Aktualisieren** liest Beszel sofort neu.

## Szenen

### Auslöser

- **Beszel-System offline oder zurück**: Beszel markiert ein System als
  offline (sein Agent antwortet nicht mehr) oder wieder als online. Filter:
  das System und der neue Zustand (**Offline**, **Wieder online**). Die
  Aktionen können den Systemnamen und den neuen Zustand verwenden. Beszel
  entscheidet, wann ein System offline ist; ein pausiertes System löst nichts
  aus.
- **Beszel-Alarm**: Ein Beszel-Alarm des Benutzers wird ausgelöst oder
  behoben. Filter: das System, der Alarm (**Prozessor**, **Arbeitsspeicher**,
  **Datenträger**, **Temperatur**, **Status** …) und der neue Zustand
  (**Ausgelöst**, **Behoben**). Die Aktionen können den Systemnamen, den
  Alarm, den Alarm mit seiner Schwelle (`Prozessor > 80 %`), den neuen Zustand
  und die Schwelle verwenden.

Schwellen und Dauern der Alarme werden in Beszel eingestellt, nicht in Gladys.
Die beim Start der Integration gefundenen Zustände sind ihr Ausgangspunkt: Nur
die Änderungen danach lösen eine Szene aus, auch über einen Neustart von
Gladys hinweg.

### Aktionen

- **Zustand eines Beszel-Systems**: liest ein System und gibt den nächsten
  Aktionen seine Werte (online, Prozessor, Arbeitsspeicher, Datenträger,
  Temperatur, Netzwerk, Last, Laufzeit, ausgelöste Alarme) und eine fertige
  Zusammenfassung, zum Beispiel
  `nas: Prozessor 12 %, Arbeitsspeicher 45 %, Datenträger 78 %, 48 °C, kein ausgelöster Alarm`.
- **Zustand aller Beszel-Systeme**: zählt die Systeme online und offline und
  die ausgelösten Alarme, mit einer Zusammenfassung zum Senden, zum Beispiel
  `Offline: pi` und dann `nas: 1 ausgelöste(r) Alarm(e) (Datenträger > 90 %)`.

### Szenen-Ideen

- **Beszel-System offline oder zurück**, Zustand **Offline** → die Nachricht
  `{{triggerEvent.data.system_name}} ist offline` senden.
- **Beszel-Alarm**, Alarm **Temperatur**, Zustand **Ausgelöst** → den Lüfter
  im Technikraum einschalten.
- Jeden Morgen um 8:00 → **Zustand aller Beszel-Systeme** → die
  Zusammenfassung senden.

## Fehlerbehebung

- **„antwortet nicht“**: Prüfe Adresse und Port im Browser; eine Firewall kann
  Port 8090 blockieren.
- **„E-Mail oder Passwort abgelehnt“**: Melde dich damit bei Beszel an, um sie
  zu prüfen. Ein PocketBase-Superuser (das Admin-Konto von `/_/`) ist kein
  Beszel-Benutzer: Nimm ein Konto der Sammlung `users`.
- **„Verbunden, aber dieser Beszel-Benutzer sieht kein System“**: Teile die
  Systeme mit dem Benutzer (Schritt 1) oder setze `SHARE_ALL_SYSTEMS=true`.
- **Nie wird ein Alarm ausgelöst**: Die Alarme gehören dem Benutzer, mit dem
  sich die Integration anmeldet: Lege sie in Beszel mit diesem Benutzer an.
- **„kein Beszel-Hub unter dieser Adresse“**: Unter dieser Adresse antwortet
  ein anderer Dienst (eine andere Anwendung, ein Reverse-Proxy ohne Beszel
  dahinter).
- **Keine Temperatur**: Der Agent liest keinen Sensor (eine virtuelle Maschine
  oder ein Agent in Docker ohne Zugriff auf die Sensoren).
- Mehr Details mit der Umgebungsvariablen `LOG_LEVEL=debug` an der
  Integration.

## Grenzen

- Ein Beszel-Hub pro Installation, höchstens 100 Systeme.
- Nur die Zusammenfassung jedes Systems: Container, zusätzliche Datenträger,
  GPU und der Verlauf von Beszel werden nicht gelesen.
- Nur die Alarme des konfigurierten Benutzers sind sichtbar.
- Gelesen alle 30 Sekunden bis 5 Minuten, nicht in Echtzeit: Der Hub selbst
  aktualisiert ein System einmal pro Minute.
- Keine Verbindung zu Beszel oder seinen Autoren.
