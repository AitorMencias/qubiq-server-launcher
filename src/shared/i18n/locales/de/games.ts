import type { games as source } from '../es/games'
import type { Translation } from '../../types'

export const games: Translation<typeof source> = {
  'games.subtitle': 'Spieleserver ohne Kopfzerbrechen',
  'games.subtitleOne': '{game}-Server ohne Kopfzerbrechen',
  'games.disclaimerAll':
    'QubiQ ist kein offizielles Produkt der verwalteten Spiele und steht in keiner Verbindung zu ihren Studios.',
  'games.agreement.minecraft': 'die Minecraft-EULA',
  'games.agreement.steam': 'den Steam-Abonnementvertrag',
  'games.tunnelExampleHost': 'irgendwas',
  'games.upTo': 'Bis zu {n}',
  'games.upToComfortably': 'Bis zu {n} bequem',
  'games.alwaysPublic': 'Erscheint immer in der öffentlichen Liste',

  'games.port.game': 'Spiel',
  'games.port.messaging': 'Spielnachrichten',
  'games.port.playerData': 'Spielerdaten',
  'games.port.steamQuery': 'Steam-Abfrage',
  'games.port.rustPlus': 'Rust+ (Handy-App)',
  'games.port.tcpUdp': 'TCP und UDP',
  'games.port.udpTcp': 'UDP und TCP',
  'games.summary.custom': 'eigener',
  'games.summary.rustMap': 'Karte: {size}',

  'games.minecraft.tagline': 'Bauen und überleben. Der Klassiker, mit Plugins oder Mods.',
  'games.minecraft.players': 'Bis zu ~20',
  'games.minecraft.download': '≈ 1 GB',
  'games.minecraft.highlight1': 'Plugins und Mods',
  'games.minecraft.startup': 'hängt von den Mods ab: von Sekunden bis zu ein paar Minuten',
  'games.minecraft.ports': 'einer per TCP (25565)',
  'games.minecraft.extra': 'Java: lädt die App selbst herunter',
  'games.minecraft.joinHint': 'In Minecraft: Mehrspieler → Server hinzufügen.',
  'games.minecraft.backupScope':
    'Gesichert werden die Welt und die Konfiguration. Die JARs braucht es nicht: Sie lassen sich neu herunterladen.',

  'games.satisfactory.tagline': 'Riesige Fabriken, im Team gebaut.',
  'games.satisfactory.players': 'Bis zu 4 (erweiterbar)',
  'games.satisfactory.download': '15,5 GB',
  'games.satisfactory.highlight1': 'Einrichten, ohne das Spiel zu öffnen',
  'games.satisfactory.highlight2': 'Immer nur einer gleichzeitig',
  'games.satisfactory.startup': 'etwa 6 Sekunden',
  'games.satisfactory.ports': '7777 per TCP und UDP sowie 8888 per TCP',
  'games.satisfactory.disclaimer':
    'Inoffizielles Tool. Keine Verbindung zu Coffee Stain Studios oder Satisfactory.',
  'games.satisfactory.joinHint': 'In Satisfactory: Server-Manager → Server hinzufügen, mit dieser Adresse.',
  'games.satisfactory.join1': 'Öffne Satisfactory und gehe im Hauptmenü zu „Server-Manager“.',
  'games.satisfactory.join2': 'Klicke auf „Server hinzufügen“ und füge dort die Adresse ein.',
  'games.satisfactory.join3':
    'Es wird nach dem Administratorpasswort gefragt (dem, das du beim Erstellen des Servers festgelegt hast), damit du ihn verwalten kannst.',
  'games.satisfactory.join4':
    'Der Server bleibt in deiner Liste: Klicke auf „Beitreten“ und gib das Beitrittspasswort ein, falls du eines festgelegt hast.',
  'games.satisfactory.joinWarning':
    'Eine direkte Verbindung per IP funktioniert nicht: Das Spiel verlangt eine Berechtigung, die man nur bekommt, wenn man den Server so hinzufügt. Versuchst du es mit Gewalt, antwortet Satisfactory mit „Encryption token missing“.',
  'games.satisfactory.backupScope':
    'Gesichert werden die Spielstände und die Servereinstellungen. Das Spiel selbst nicht: Es wird erneut von Steam heruntergeladen.',
  'games.satisfactory.moderationHint':
    'In diesem Spiel kann man von außen weder kicken noch bannen. Tritt dem Spiel mit deinem Administratorpasswort bei und erledige es im Spielmenü. Wenn du alles sofort unterbinden musst, stoppe den Server oder lege unter Einstellungen ein Beitrittspasswort fest.',

  'games.valheim.tagline': 'Überleben, bauen und Bosse besiegen in einer Wikingerwelt.',
  'games.valheim.download': '2 GB',
  'games.valheim.highlight1': 'Von außen spielbar ohne Portfreigaben',
  'games.valheim.highlight2': 'Der sparsamste von allen',
  'games.valheim.highlight3': 'Keine Moderation im laufenden Betrieb',
  'games.valheim.startup': '35 s mit neuer Welt, danach 12 s',
  'games.valheim.ports': 'zwei per UDP (2456 und 2457) oder keiner mit Crossplay',
  'games.valheim.disclaimer': 'Inoffizielles Tool. Keine Verbindung zu Iron Gate oder Valheim.',
  'games.valheim.joinHint': 'In Valheim: Spiel beitreten → Server hinzufügen, mit dieser Adresse.',
  'games.valheim.join1': 'Öffne Valheim, wähle deinen Charakter und gehe zu „Spiel beitreten“.',
  'games.valheim.join2': 'Klicke auf „Server hinzufügen“ und füge die Adresse samt Port ein.',
  'games.valheim.join3': 'Gib das Serverpasswort ein, wenn danach gefragt wird.',
  'games.valheim.join4': 'Der Server bleibt in deinen Favoriten: Beim nächsten Mal genügt „Verbinden“.',
  'games.valheim.crossplay2': 'Klicke auf „Mit Code beitreten“ und gib den 6-stelligen Code aus der App ein.',
  'games.valheim.crossplay4':
    'Der Code ändert sich bei jedem Serverstart: Du musst ihn dann erneut weitergeben.',
  'games.valheim.backupScope':
    'Gesichert werden die Welten und die Moderationslisten. Das Spiel selbst nicht: Es wird erneut von Steam heruntergeladen.',
  'games.valheim.moderationHint':
    'In Valheim moderiert man über die Steam-ID, nicht über den Namen: Das Spiel verrät nicht, wie jemandes Charakter heißt. Ein Bann wirft den Spieler sofort hinaus, und die vollständigen Listen (Admins, Gebannte und Zugelassene) findest du unter Konfiguration → Moderation.',

  'games.factorio.tagline': 'Gemeinsam eine riesige Fabrik bauen und verteidigen.',
  'games.factorio.highlight1': 'Startet in einer Sekunde',
  'games.factorio.highlight2': 'Mit Mods und Space Age',
  'games.factorio.highlight3': 'Du musst das Spiel besitzen',
  'games.factorio.startup': 'eine Sekunde',
  'games.factorio.ports': 'einer per UDP (34197)',
  'games.factorio.extra': 'Factorio in deinem Steam-Konto',
  'games.factorio.disclaimer': 'Inoffizielles Tool. Keine Verbindung zu Wube Software oder Factorio.',
  'games.factorio.joinHint': 'In Factorio: Mehrspieler → Mit Adresse verbinden.',
  'games.factorio.join1': 'Öffne Factorio und gehe im Hauptmenü zu „Mehrspieler“.',
  'games.factorio.join2': 'Klicke auf „Mit Adresse verbinden“ und füge die Adresse samt Port ein.',
  'games.factorio.join3': 'Gib das Serverpasswort ein, wenn danach gefragt wird.',
  'games.factorio.join4': 'Ihr braucht alle dieselbe Spielversion und dieselben Mods wie der Server.',
  'games.factorio.joinWarning':
    'Lässt du das Passwort weg, trennt Factorio die Verbindung ohne Begründung (auf dem Server steht dann „PasswordMissing“). Und wenn dein Spiel nicht dieselbe Version wie der Server hat, kommst du nicht hinein: Die Version steht in den Serverdetails.',
  'games.factorio.backupScope':
    'Gesichert werden die Spielstände, die Mods und die Moderationslisten. Das Spiel selbst nicht: Es wird erneut von Steam heruntergeladen.',
  'games.factorio.moderationHint':
    'In Factorio moderiert man über den Namen des Factorio-Kontos, also den, der im Chat erscheint. Ein Bann wirft den Spieler sofort hinaus.',

  'games.zomboid.tagline': 'Die Zombie-Epidemie so lange wie möglich überleben.',
  'games.zomboid.download': '6,7 GB',
  'games.zomboid.highlight1': 'Moderation und Befehle wie in Minecraft',
  'games.zomboid.highlight2': 'Hunderte Spielregeln',
  'games.zomboid.highlight3': 'Braucht über eine Minute zum Starten',
  'games.zomboid.startup': 'etwa 40 Sekunden (beim ersten Mal anderthalb Minuten)',
  'games.zomboid.ports': 'einer per UDP (16261), zwei mit aktiviertem Steam',
  'games.zomboid.disclaimer':
    'Inoffizielles Tool. Keine Verbindung zu The Indie Stone oder Project Zomboid.',
  'games.zomboid.joinHint': 'In Project Zomboid: Beitreten → Favoriten → Server hinzufügen, mit dieser Adresse.',
  'games.zomboid.join1': 'Öffne Project Zomboid und gehe im Hauptmenü zu „Beitreten“.',
  'games.zomboid.join2': 'Wechsle zum Tab „Favoriten“ und klicke mit dieser Adresse und ihrem Port auf „Server hinzufügen“.',
  'games.zomboid.join3':
    'Gib einen beliebigen Benutzernamen und ein Passwort ein: Beim ersten Mal wird das Konto automatisch angelegt.',
  'games.zomboid.join4':
    'Hat der Server ein Passwort, gehört es in das Feld „Serverpasswort“, das sich von dem deines Kontos unterscheidet.',
  'games.zomboid.joinWarning':
    'Benutzername und Passwort gehören zu diesem Server, nicht zu Steam: Du denkst sie dir beim ersten Mal aus und kommst damit zu deinem Charakter zurück. Vertippst du dich, sagt der Server, das Passwort sei ungültig, statt ein neues Konto anzulegen.',
  'games.zomboid.backupScope':
    'Gesichert werden der Spielstand, die Einstellungen und die Kontodatenbank (wer Admin ist und wer gebannt). Das Spiel selbst nicht: Es wird erneut von Steam heruntergeladen.',
  'games.zomboid.moderationHint':
    'In Zomboid moderiert man über den Kontonamen auf dem Server, nicht über Steam. Befehle laufen über die Remote-Konsole, daher muss der Server laufen: Ist er gestoppt, sieht man, wer wer ist, kann aber nichts ändern.',

  'games.enshrouded.tagline': 'Überleben, bauen und eine vom Nebel verschluckte Welt erkunden.',
  'games.enshrouded.download': '8,8 GB',
  'games.enshrouded.highlight1': 'Startet in 3 Sekunden',
  'games.enshrouded.highlight2': 'Rechte per Passwort',
  'games.enshrouded.startup': 'zwischen 2 und 4 Sekunden',
  'games.enshrouded.ports': 'einer per UDP (15637)',
  'games.enshrouded.extra': 'erscheint immer in der öffentlichen Liste des Spiels',
  'games.enshrouded.disclaimer': 'Inoffizielles Tool. Keine Verbindung zu Keen Games oder Enshrouded.',
  'games.enshrouded.joinHint': 'In Enshrouded: Spielen → Server → Server hinzufügen, mit dieser Adresse.',
  'games.enshrouded.join1': 'Öffne Enshrouded und gehe im Spielen-Menü zu „Server“.',
  'games.enshrouded.join2': 'Klicke auf „Server hinzufügen“ und füge die Adresse samt Port ein.',
  'games.enshrouded.join3':
    'Gib das Passwort der Rolle ein, die man dir gegeben hat: Das Passwort bestimmt, was du im Spiel tun darfst.',
  'games.enshrouded.join4':
    'Der Server bleibt in deinen Favoriten und erscheint dort auch, wenn die öffentliche Liste etwas braucht, um sich zu aktualisieren.',
  'games.enshrouded.joinWarning':
    'In Enshrouded gibt es kein Serverpasswort, sondern eines pro Rolle. Mit dem Admin-Passwort kannst du kicken und bannen; mit dem Gast-Passwort kannst du nicht einmal Truhen öffnen. Bekommst du das falsche, kommst du trotzdem hinein, aber mit anderen Rechten.',
  'games.enshrouded.backupScope':
    'Gesichert werden die Welten und die Konfiguration samt Rollen und Banns. Das Spiel selbst nicht: Es wird erneut von Steam heruntergeladen. Bei laufendem Server wird das Backup direkt nach einem seiner Speichervorgänge erstellt, die alle fünf Minuten stattfinden.',
  'games.enshrouded.moderationHint':
    'Enshrouded lässt niemanden von außerhalb des Spiels kicken: Der eigene Server meldet, dass Kicken auf einem dedizierten Server „nicht implementiert“ ist. Möglich ist, hier einen Bann aufzuheben und im Spiel mit dem Admin-Passwort zu bannen (Tab „Soziales“).',

  'games.rust.tagline': 'Überleben, eine Basis bauen und verteidigen. Jeden Monat eine neue Karte.',
  'games.rust.players': 'Bis zu {n} auf einem Heim-PC',
  'games.rust.download': '5,5 GB',
  'games.rust.highlight1': 'Moderation im laufenden Betrieb',
  'games.rust.highlight2': 'Plugins mit Oxide',
  'games.rust.highlight3': 'Jeden Monat neue Karte',
  'games.rust.startup': 'beim ersten Mal 2 bis 5 Minuten (erzeugt die Karte), danach etwa 13 s',
  'games.rust.ports': 'zwei per UDP (28015 und 28017) und mit Rust+ ein weiterer per TCP',
  'games.rust.extra': 'erscheint immer in der öffentlichen Liste; jeden Monat neue Karte',
  'games.rust.disclaimer': 'Inoffizielles Tool. Keine Verbindung zu Facepunch Studios oder Rust.',
  'games.rust.joinHint': 'In Rust: Drücke F1 und gib „client.connect“ gefolgt von dieser Adresse ein.',
  'games.rust.join1': 'Öffne Rust und warte, bis du im Hauptmenü bist.',
  'games.rust.join2': 'Drücke F1, um die Spielkonsole zu öffnen.',
  'games.rust.join3':
    'Gib „client.connect“ und die Adresse mit Port ein, zum Beispiel: client.connect 192.168.1.20:28015',
  'games.rust.join4':
    'Drücke Enter. Danach erscheint der Server in der Serverliste unter „Verlauf“, für das nächste Mal.',
  'games.rust.joinWarning':
    'Hat gerade der Monat gewechselt und der Server wurde nicht aktualisiert, lässt Rust dich nicht hinein: Es meldet, dass die Version nicht übereinstimmt. Das passiert am ersten Donnerstag jedes Monats; siehe Konfiguration → Wipe.',
  'games.rust.backupScope':
    'Gesichert werden die Karte mit allem Gebauten, die Spieler, Admins und Banns sowie die Plugins mit ihrer Konfiguration. Das Spiel selbst nicht: Es wird erneut von Steam heruntergeladen.',
  'games.rust.moderationHint':
    'In Rust moderiert man über die Steam-ID, auch wenn die Liste den Namen zeigt. Kicks und Banns wirken sofort; Admins und Banns findest du unter Konfiguration → Moderation.'
}
