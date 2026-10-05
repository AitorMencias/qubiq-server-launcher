import type { shell as source } from '../es/shell'
import type { Translation } from '../../types'

export const shell: Translation<typeof source> = {
  'common.cancel': 'Abbrechen',
  'common.quoted': '„{text}“',

  'main.quit.title': 'Es laufen Server',
  'main.quit.message': 'Du hast laufende Server.',
  'main.quit.detail':
    'Sie werden ordnungsgemäß beendet, damit die Welt keinen Schaden nimmt. Das kann ein paar Sekunden dauern, während sie den Spielstand speichern.',
  'main.quit.confirm': 'Server beenden und schließen',
  'main.quit.cancel': 'Abbrechen',
  'main.missing.title': 'Der Datenordner wurde nicht gefunden',
  'main.missing.message': 'Der QubiQ-Datenordner wurde nicht gefunden: {path}',
  'main.missing.detail':
    'Vielleicht liegt er auf einem Laufwerk, das gerade nicht angeschlossen ist. Schließe es an und klicke auf „Erneut versuchen“. Wenn du den Standardordner ({defaultPath}) wählst, startet die App ohne deine Server; der Inhalt des anderen Ordners bleibt unberührt.',
  'main.missing.retry': 'Erneut versuchen',
  'main.missing.useDefault': 'Standardordner verwenden',
  'main.missing.quit': 'Beenden',

  'app.noServersYet': 'Du hast noch keinen Server.',
  'app.createServer': '+ Server erstellen',
  'app.mode': 'Modus',
  'app.modeHint.basic': 'Das Wesentliche zum Spielen. Das Technische wählen wir für dich.',
  'app.modeHint.advanced': 'Derselbe Bildschirm, mit allen Einstellungen freigeschaltet.',
  'app.settings': 'App-Einstellungen',
  'app.loadError': 'Die Server konnten nicht geladen werden',
  'app.create.title': 'Neuen Server erstellen',
  'app.create.titleGame': 'Neuen {game}-Server erstellen',
  'app.create.modeBasic': 'Einfacher Modus',
  'app.create.modeAdvanced': 'Erweiterter Modus',
  'app.create.changeMode': 'Modus wechseln',
  'app.empty.title': 'Du hast noch keine Server',
  'app.empty.text': 'Erstelle den ersten und in wenigen Minuten spielt ihr.',
  'app.empty.button': 'Meinen ersten Server erstellen',

  'mode.basic': 'Einfach',
  'mode.advanced': 'Erweitert',
  'mode.basic.tagline': 'Wir führen dich Schritt für Schritt',
  'mode.basic.point1':
    'Eine Frage pro Bildschirm: der Name, wie viele ihr seid, was das Spiel braucht und wie ihr euch verbindet',
  'mode.basic.point2': 'Das Technische übernehmen wir: Version, Arbeitsspeicher und Port',
  'mode.basic.point3': 'Danach nur ein Knopf zum Ein- und Ausschalten, deine Spieler und die Konsole',
  'mode.basic.cta': 'Im einfachen Modus erstellen →',
  'mode.advanced.tagline': 'Du entscheidest alles',
  'mode.advanced.point1': 'Du wählst genaue Version, Arbeitsspeicher und Port',
  'mode.advanced.point2': 'Derselbe Bildschirm, mit der ganzen Konfiguration freigeschaltet und technischen Details',
  'mode.advanced.point3': 'Backups mit Intervall und Aufbewahrung, Seeds und alle Spieleinstellungen',
  'mode.advanced.cta': 'Im erweiterten Modus erstellen →',
  'mode.chooser.title': 'Wie möchtest du ihn erstellen?',
  'mode.chooser.text':
    'Du kannst den Modus jederzeit in der linken Leiste oder in den App-Einstellungen wechseln. Das betrifft nicht den Server, nur wie viel wir dich fragen.',
  'mode.recommended': 'Empfohlen',
  'mode.current': 'Dein aktueller Modus',

  'settings.title': 'App-Einstellungen',
  'settings.back': 'Zurück',
  'settings.language.title': 'Sprache',
  'settings.language.hint':
    'Die Sprache der gesamten Oberfläche. Spielnamen und Fachbegriffe (RCON, BepInEx…) werden nicht übersetzt. Einige Fehler- und Installationsmeldungen erscheinen noch auf Spanisch.',
  'settings.language.auto': 'Automatisch: wie Windows ({name})',
  'settings.mode.title': 'Modus',
  'settings.mode.hint':
    'Wie viel die App fragt und wie viele Einstellungen sie zeigt. An deinen Servern ändert sich nichts: Du kannst jederzeit wechseln.',
  'settings.mode.basicSub':
    'Das Wesentliche zum Spielen. Die App wählt Version, Arbeitsspeicher und Port für dich und führt dich beim Erstellen eines Servers Schritt für Schritt.',
  'settings.mode.advancedSub':
    'Alles im Blick: genaue Version, Arbeitsspeicher, Port, Backups mit Intervall und Aufbewahrung und alle Einstellungen jedes Spiels.',
  'settings.dataFolder.title': 'Datenordner',
  'settings.dataFolder.hint':
    'Hier speichert die App deine Server, ihre Backups, Java, SteamCMD und Downloads. Du kannst ihn auf ein anderes Laufwerk verschieben, wenn hier der Platz knapp wird.',
  'settings.dataFolder.current': 'Aktueller Speicherort',
  'settings.dataFolder.isDefault': 'Das ist der Standardordner.',
  'settings.dataFolder.notDefault': 'Der Standardordner ist {path}.',
  'settings.dataFolder.open': 'Ordner öffnen',
  'settings.dataFolder.change': 'Verschieben…',
  'settings.dataFolder.backToDefault': 'Zurück in den Standardordner',
  'settings.dataFolder.pickTitle': 'Wähle, wo die QubiQ-Daten gespeichert werden',
  'settings.dataFolder.checking': 'Ordner wird geprüft und die Größe deiner Daten gemessen…',
  'settings.dataFolder.checkFailed': 'Dieser Ordner konnte nicht geprüft werden',
  'settings.dataFolder.target': 'Die Daten kommen nach',
  'settings.dataFolder.subfolder':
    'Der gewählte Ordner enthält schon etwas, daher wird ein Ordner QubiQ angelegt, damit nichts vermischt wird.',
  'settings.dataFolder.sameDrive': 'Er liegt auf demselben Laufwerk: Das Verschieben geht sofort, ohne etwas zu kopieren.',
  'settings.dataFolder.otherDrive': 'Er liegt auf einem anderen Laufwerk: {size} müssen kopiert werden.',
  'settings.dataFolder.problemTitle': 'Dorthin kann nicht verschoben werden',
  'settings.dataFolder.problem.same': 'Die Daten liegen bereits in diesem Ordner.',
  'settings.dataFolder.problem.nested':
    'Der neue Ordner darf nicht im aktuellen liegen und der aktuelle nicht im neuen.',
  'settings.dataFolder.problem.spaces':
    'Der Pfad enthält Leerzeichen. Einige Server-Installer (etwa der von Forge) scheitern daran, deshalb sind sie nicht erlaubt. Wähle einen Ordner ohne Leerzeichen, zum Beispiel D:\\QubiQ.',
  'settings.dataFolder.problem.network':
    'Das ist ein Netzwerkordner. Bricht das Netzwerk bei laufendem Server ab, kann der Spielstand beschädigt werden, und SteamCMD installiert nicht dorthin. Wähle einen Ordner auf einem Laufwerk dieses Computers.',
  'settings.dataFolder.problem.occupied':
    'In diesem Ordner liegen bereits QubiQ-Daten ({entries}). Sie werden nicht mit deinen vermischt: Wähle einen anderen Ordner oder leere diesen.',
  'settings.dataFolder.problem.notWritable':
    'Windows erlaubt dort keine neuen Ordner. Wähle einen anderen, etwa in deinem Benutzerordner oder auf einem anderen Laufwerk.',
  'settings.dataFolder.problem.space':
    'Nicht genug Platz: Es werden {needed} benötigt (deine Daten plus 1 GB Reserve) und auf dem Laufwerk sind noch {free} frei.',
  'settings.dataFolder.problem.busy': {
    one: 'Zuerst muss der Server {servers} gestoppt werden: Solange er läuft oder installiert wird, sind seine Dateien geöffnet.',
    other:
      'Zuerst müssen diese Server gestoppt werden: {servers}. Solange sie laufen oder installiert werden, sind ihre Dateien geöffnet.'
  },
  'settings.dataFolder.problem.valheimPath': {
    one: 'Der Valheim-Server {servers} hat Mods, und dort wären seine Pfade {length} Zeichen lang (Windows erlaubt {max}). BepInEx würde nicht starten und der Server liefe ohne Warnung ohne Mods. Wähle einen kürzeren Pfad.',
    other:
      'Die Valheim-Server {servers} haben Mods, und dort wären ihre Pfade {length} Zeichen lang (Windows erlaubt {max}). BepInEx würde nicht starten und sie liefen ohne Warnung ohne Mods. Wähle einen kürzeren Pfad.'
  },
  'settings.dataFolder.problem.links':
    'In den Daten gibt es eine Verknüpfung zu einem anderen Ordner ({path}). Zwischen Laufwerken lässt sie sich nicht kopieren, ohne mitzunehmen, was auf der anderen Seite liegt. Entferne sie oder wähle einen Ordner auf demselben Laufwerk.',
  'settings.dataFolder.warning.firewallTitle': 'Die Windows-Firewall wird erneut fragen',
  'settings.dataFolder.warning.firewall':
    'Firewall-Freigaben hängen am Pfad jedes Programms, und die deiner Server ändern sich. Beim ersten Start jedes Servers nach dem Verschieben fragt Windows, ob er das Netzwerk nutzen darf: Stimme zu, sonst können deine Freunde nicht beitreten.',
  'settings.dataFolder.warning.copyTitle': 'Das dauert eine Weile',
  'settings.dataFolder.warning.copy':
    'Es müssen {size} kopiert werden. Auf einer SSD rechne mit etwa {minutes} Min.; auf einer Festplatte deutlich länger. Solange ist die App nicht nutzbar. Geht etwas schief, bleiben die Daten, wo sie sind: Der Originalordner wird erst gelöscht, wenn die Kopie vollständig und geprüft ist.',
  'settings.dataFolder.warning.cloudTitle': 'Dieser Ordner wird mit der Cloud synchronisiert',
  'settings.dataFolder.warning.cloud':
    'OneDrive und ähnliche Dienste laden alles hoch, was sich ändert, und sperren dabei die Dateien. Mit Servern darin wären das Gigabytes an Uploads und halb geschriebene Spielstände. Besser ein Ordner, der nicht synchronisiert wird.',
  'settings.dataFolder.warning.valheimPathTitle': 'Valheim kann keine Mods nutzen',
  'settings.dataFolder.warning.valheimPath': {
    one: 'In diesem Ordner wären die Pfade des Valheim-Servers {servers} {length} Zeichen lang (Windows erlaubt {max}). Er hat jetzt keine Mods und läuft weiter wie bisher, aber es lassen sich keine installieren.',
    other:
      'In diesem Ordner wären die Pfade der Valheim-Server {servers} {length} Zeichen lang (Windows erlaubt {max}). Sie haben jetzt keine Mods und laufen weiter wie bisher, aber es lassen sich keine installieren.'
  },
  'settings.dataFolder.howTitle': 'So läuft es ab',
  'settings.dataFolder.howText':
    'Wenn du auf {button} klickst, schließt sich die App und öffnet sich von selbst wieder, um die Daten zu verschieben, bevor irgendetwas startet. Du siehst den Fortschritt; danach ist alles wie jetzt, nur im neuen Ordner.',
  'settings.dataFolder.apply': 'Verschieben und neu starten',
  'settings.dataFolder.applying': 'Neustart…',

  'settings.about.title': 'Über',
  'settings.about.version': 'Version {version}',
  'settings.about.free':
    'Dieses Programm ist freie Software: Du kannst es unter den Bedingungen der GNU General Public License, Version 3 oder (nach deiner Wahl) jeder späteren Version, weitergeben und/oder verändern. Es wird in der Hoffnung verbreitet, dass es nützlich ist, aber OHNE JEDE GEWÄHRLEISTUNG – sogar ohne die implizite Gewährleistung der MARKTREIFE oder der EIGNUNG FÜR EINEN BESTIMMTEN ZWECK.',
  'settings.about.unofficial':
    'Inoffizielles Werkzeug: weder mit den Studios der verwalteten Spiele verbunden noch von ihnen genehmigt.',
  'settings.about.source': 'Quellcode',
  'settings.about.license': 'Lizenz',
  'settings.about.notices': 'Hinweise zu Drittanbietern',
  'settings.about.plugins':
    'Die App installiert diese eigenen Plugins, jedes mit seinem Quellcode und seiner Lizenz:',
  'settings.about.missingFile':
    '{file} wurde neben der App nicht gefunden. Bei einer Installation bitte neu installieren; in der Entwicklung erzeugt es „npm run build“.',

  'relocation.movingTitle': 'QubiQ-Daten werden verschoben',
  'relocation.movingHint':
    'Schließe die App nicht und schalte den Computer nicht aus. Wird es unterbrochen, geht nichts verloren: Es geht beim nächsten Öffnen weiter.',
  'relocation.from': 'Von',
  'relocation.to': 'Nach',
  'relocation.phase.measuring': 'Es wird gemessen, was verschoben werden muss…',
  'relocation.phase.moving': 'Wird verschoben…',
  'relocation.phase.copying': 'Kopieren: {copied} von {total}',
  'relocation.phase.verifying': 'Es wird geprüft, ob die Kopie identisch ist…',
  'relocation.phase.cleaning': 'Kopie geprüft. Der Originalordner wird gelöscht…',
  'relocation.doneTitle': 'Daten verschoben',
  'relocation.firewallTitle': 'Noch etwas',
  'relocation.firewall':
    'Beim ersten Start jedes Servers kann Windows fragen, ob er das Netzwerk nutzen darf. Stimme zu, sonst können deine Freunde nicht beitreten.',
  'relocation.leftoversTitle': 'Im alten Ordner sind Reste geblieben',
  'relocation.leftovers':
    'Deine Daten sind vollständig im neuen Ordner, aber einige Ordner in {path} konnten nicht gelöscht werden (instances, runtimes, tools oder cache). Du kannst sie von Hand löschen; lösche nicht den ganzen Ordner, denn er speichert, wo deine Daten jetzt liegen.',
  'relocation.failedTitle': 'Die Daten konnten nicht verschoben werden',
  'relocation.untouched': 'Deine Daten sind unverändert dort, wo sie waren',
  'relocation.error.locked':
    'Ein Programm hatte eine Datei der Daten geöffnet (ein Virenscanner, der Windows-Explorer oder ein außerhalb von QubiQ gestarteter Server). Schließe es und versuche es in den Einstellungen erneut.',
  'relocation.error.mismatch':
    'Die Kopie stimmte nicht mit dem Original überein (Dateien fehlten oder waren unterschiedlich groß), daher wurde nichts gelöscht. Prüfe, ob das Ziellaufwerk einwandfrei funktioniert, und versuche es erneut.',
  'relocation.error.links':
    'In den Daten gibt es eine Verknüpfung zu einem anderen Ordner ({path}), die sich nicht zwischen Laufwerken kopieren lässt. Entferne sie oder wähle einen Ordner auf demselben Laufwerk.',
  'relocation.error.missing': 'Der Quellordner wurde nicht gefunden oder der Zielordner ist nicht mehr verfügbar.',
  'relocation.error.other': 'Unerwarteter Fehler: {detail}',
  'relocation.continue': 'Weiter'
}
