import type { links as source } from '../es/links'
import type { Translation } from '../../types'

export const links: Translation<typeof source> = {
  'remote.order.forget': 'Sich entfernen',

  'link.add.button': 'Mit anderem QubiQ verbinden',
  'link.add.title': 'Mit einem anderen QubiQ verbinden',
  'link.add.intro':
    'Verwalte von hier aus die Server eines anderen Computers mit QubiQ, mit genau dem, was die Fernseite auf dem Handy erlaubt: starten, stoppen, neu starten und Konsole, Spieler und Verlauf ansehen. Nichts von seinen Einstellungen oder Dateien.',
  'link.add.before':
    'Gehe auf dem anderen Computer zu App-Einstellungen → Fernzugriff: schalte ihn ein, markiere die Server, die du von hier verwalten willst, und erzeuge einen Code.',
  'link.add.address': 'Adresse des anderen Computers',
  'link.add.addressHelp':
    'Die, die dort unter „Adresse zum Verbinden“ steht, zum Beispiel 192.168.1.20:8443. Von außerhalb seines Zuhauses seine öffentliche IP mit geöffnetem Port oder seine Tailscale-Adresse.',
  'link.add.search': 'Suchen',
  'link.add.searching': 'Suche…',
  'link.add.found': 'Unter {address} gibt es ein QubiQ.',
  'link.add.fingerprintTitle': 'Prüfe den Fingerabdruck',
  'link.add.fingerprintHelp':
    'Es ist der „Fingerabdruck des Zertifikats“, den der andere Computer unter App-Einstellungen → Fernzugriff zeigt. Vergleiche ihn ganz: Stimmt er nicht überein, könnte jemand dazwischen sein, und du solltest nicht weitermachen.',
  'link.add.fingerprintMatch': 'Sie stimmen überein: Es ist dieser Computer',
  'link.add.code': 'Kopplungscode',
  'link.add.name': 'Name dieses Computers dort',
  'link.add.nameHelp': 'So erscheint er in seiner Geräteliste.',
  'link.add.defaultName': 'QubiQ auf {pc}',
  'link.add.submit': 'Koppeln',
  'link.add.working': 'Wird gekoppelt…',
  'link.add.back': 'Adresse ändern',
  'link.add.noSecureStorage':
    'Windows erlaubt nicht, den Schlüssel dieses Computers zu verschlüsseln, daher kann nicht gekoppelt werden: Er läge offen auf der Festplatte.',

  'link.group': 'Auf {host}',
  'link.state.connecting': 'Verbinde…',
  'link.state.online': 'Verbunden',
  'link.state.offline': 'Keine Verbindung',
  'link.state.revoked': 'Kein Zugriff mehr',
  'link.state.cert-changed': 'Der Fingerabdruck hat sich geändert',
  'link.state.key-lost': 'Schlüssel unbrauchbar',
  'link.statusUnknown': 'Status unbekannt',
  'link.noServers': 'Keine Server: markiere sie dort, unter Fernzugriff.',
  'link.retry': 'Erneut versuchen',
  'link.lastContact': 'Letzte Antwort: {date}.',
  'link.offline.text':
    '{host} ist nicht erreichbar. Seine Server können weiterlaufen: Was du siehst, ist der letzte bekannte Stand.',
  'link.revoked.text':
    '{host} erkennt diesen Computer nicht mehr: Er wurde aus seiner Liste entfernt. Entferne die Verbindung und kopple neu mit einem neuen Code.',
  'link.keyLost.text':
    'Der Schlüssel dieser Verbindung funktioniert auf diesem Computer oder mit diesem Windows-Benutzer nicht (wurden die Daten von einem anderen PC kopiert?). Entferne die Verbindung und kopple neu.',
  'link.certChanged.text':
    '{host} zeigt ein anderes Zertifikat als das beim Koppeln geprüfte. Das passiert, wenn es dort erneuert oder neu erstellt wurde, aber auch, wenn sich jemand dazwischengeschaltet hat. Bis du es bestätigst, wird nichts gesendet.',
  'link.certChanged.old': 'Festgelegter Fingerabdruck',
  'link.certChanged.new': 'Aktuell gezeigter Fingerabdruck',
  'link.certChanged.check': 'Vergleiche ihn mit dem, den der andere Computer unter App-Einstellungen → Fernzugriff zeigt.',
  'link.certChanged.load': 'Neuen Fingerabdruck ansehen',
  'link.certChanged.trust': 'Sie stimmen überein: dem neuen vertrauen',

  'link.panel.details': 'Verbindung',
  'link.panel.address': 'Adresse',
  'link.panel.device': 'Dieser Computer dort',
  'link.panel.fingerprint': 'Festgelegter Fingerabdruck',
  'link.panel.paired': 'Gekoppelt',
  'link.panel.permissions': 'Was dieser Computer darf',
  'link.panel.permissionsHelp': 'Das entscheidet der Besitzer des anderen Computers in seinem Fernzugriff.',
  'link.panel.controlYes': 'Starten, stoppen und neu starten: ja',
  'link.panel.controlNo': 'Starten, stoppen und neu starten: nein, nur zusehen',
  'link.panel.console': 'Konsole: {level}',
  'link.panel.servers': 'Server',
  'link.remove.title': 'Verbindung entfernen',
  'link.remove.hint':
    'Der Schlüssel dieses Computers wird gelöscht und der andere gebeten, ihn zu vergessen. Für eine neue Verbindung braucht es einen neuen Code.',
  'link.remove.button': 'Verbindung entfernen',
  'link.remove.confirm': 'Verbindung zu {host} entfernen?',
  'link.remove.working': 'Wird entfernt…',
  'link.remove.done': 'Verbindung zu {host} entfernt.',
  'link.remove.notNotified':
    'Verbindung zu {host} hier entfernt, aber es kam keine Antwort: „{device}“ steht dort noch in der Geräteliste. Entferne es in seinem Fernzugriff.',

  'link.server.on': 'auf {host}',
  'link.server.noControl':
    'Dieser Computer kann nur zusehen: Der Besitzer von {host} hat ihm Starten und Stoppen nicht erlaubt.',
  'link.server.gone':
    'Dieser Server steht nicht mehr in der Liste von {host}: Er wurde gelöscht oder diesem Computer wurde die Berechtigung entzogen.',

  'link.error.offline':
    'Dieser Computer ist nicht erreichbar. Prüfe die Adresse, ob dort der Fernzugriff eingeschaltet ist und, von außerhalb seines Zuhauses, ob der Port offen ist.',
  'link.error.cert-changed': 'Das Zertifikat des anderen Computers ist nicht das geprüfte.',
  'link.error.key-lost': 'Der Schlüssel dieser Verbindung funktioniert auf diesem Computer nicht.',
  'link.error.bad-address':
    'Diese Adresse ist ungültig. Gib die IP oder den Namen des Computers ein und den Port, falls es nicht 8443 ist.',
  'link.error.not-qubiq': 'Was unter dieser Adresse antwortet, ist nicht der Fernzugriff von QubiQ.',
  'link.error.no-secure-storage': 'Windows erlaubt nicht, den Schlüssel dieses Computers zu verschlüsseln.',
  'link.error.unknown-link': 'Diese Verbindung gibt es nicht mehr.'
}
