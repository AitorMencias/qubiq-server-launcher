import type { links as source } from '../es/links'
import type { Translation } from '../../types'

export const links: Translation<typeof source> = {
  'remote.order.forget': 'Remove itself',

  'link.add.button': 'Connect to another QubiQ',
  'link.add.title': 'Connect to another QubiQ',
  'link.add.intro':
    'Manage another QubiQ computer’s servers from here, with the same things the remote phone page allows: start, stop, restart, and see the console, the players and the history. Nothing of its settings or its files.',
  'link.add.before':
    'On the other computer, go to App settings → Remote access: turn it on, tick the servers you want to manage from here and generate a code.',
  'link.add.address': 'Address of the other computer',
  'link.add.addressHelp':
    'The one it shows under “Address to connect”, for example 192.168.1.20:8443. From outside its home, its public IP with the port open, or its Tailscale address.',
  'link.add.search': 'Look up',
  'link.add.searching': 'Looking up…',
  'link.add.found': 'There is a QubiQ at {address}.',
  'link.add.fingerprintTitle': 'Check the fingerprint',
  'link.add.fingerprintHelp':
    'It is the “Certificate fingerprint” the other computer shows in App settings → Remote access. Compare all of it: if it does not match, someone could be in the middle and you should not continue.',
  'link.add.fingerprintMatch': 'They match: it is that computer',
  'link.add.code': 'Pairing code',
  'link.add.name': 'Name of this computer over there',
  'link.add.nameHelp': 'This is how it will appear in its device list.',
  'link.add.defaultName': 'QubiQ on {pc}',
  'link.add.submit': 'Pair',
  'link.add.working': 'Pairing…',
  'link.add.back': 'Change the address',
  'link.add.noSecureStorage':
    'Windows does not allow encrypting this computer’s key, so it cannot be paired: the key would be stored in plain sight.',

  'link.group': 'On {host}',
  'link.state.connecting': 'Connecting…',
  'link.state.online': 'Connected',
  'link.state.offline': 'No connection',
  'link.state.revoked': 'No longer has access',
  'link.state.cert-changed': 'The fingerprint has changed',
  'link.state.key-lost': 'Unusable key',
  'link.statusUnknown': 'Status unknown',
  'link.noServers': 'No servers: tick them over there, in Remote access.',
  'link.retry': 'Retry',
  'link.lastContact': 'Last reply: {date}.',
  'link.offline.text':
    '{host} cannot be reached. Its servers may still be running: what you see is the last known state.',
  'link.revoked.text':
    '{host} no longer recognises this computer: it has been removed from its list. Remove the connection and pair again with a new code.',
  'link.keyLost.text':
    'This connection’s key does not work on this computer or with this Windows user (was the data copied from another PC?). Remove the connection and pair again.',
  'link.certChanged.text':
    '{host} shows a different certificate from the one checked when pairing. That happens if it was renewed or recreated there, but also if someone has got in the middle. Nothing is sent to it until you confirm.',
  'link.certChanged.old': 'Pinned fingerprint',
  'link.certChanged.new': 'Fingerprint it shows now',
  'link.certChanged.check': 'Compare it with the one the other computer shows in App settings → Remote access.',
  'link.certChanged.load': 'See the new fingerprint',
  'link.certChanged.trust': 'They match: trust the new one',

  'link.panel.details': 'Connection',
  'link.panel.address': 'Address',
  'link.panel.device': 'This computer over there',
  'link.panel.fingerprint': 'Pinned fingerprint',
  'link.panel.paired': 'Paired',
  'link.panel.permissions': 'What this computer can do',
  'link.panel.permissionsHelp': 'The owner of the other computer decides this, in their Remote access.',
  'link.panel.controlYes': 'Start, stop and restart: yes',
  'link.panel.controlNo': 'Start, stop and restart: no, only watch',
  'link.panel.console': 'Console: {level}',
  'link.panel.servers': 'Servers',
  'link.remove.title': 'Remove the connection',
  'link.remove.hint':
    'This computer’s key is deleted and the other one is asked to forget it. Connecting again will need a new code.',
  'link.remove.button': 'Remove the connection',
  'link.remove.confirm': 'Remove the connection to {host}?',
  'link.remove.working': 'Removing…',
  'link.remove.done': 'Connection to {host} removed.',
  'link.remove.notNotified':
    'Connection to {host} removed here, but it did not reply: “{device}” is still in its device list. Remove it in its Remote access.',

  'link.server.on': 'on {host}',
  'link.server.noControl':
    'This computer can only watch: the owner of {host} has not allowed it to start or stop.',
  'link.server.gone':
    'This server is no longer in {host}’s list: it was deleted or this computer’s permission was removed.',

  'link.error.offline':
    'That computer cannot be reached. Check the address, that remote access is on there and, from outside its home, that the port is open.',
  'link.error.cert-changed': 'The other computer’s certificate is not the one that was checked.',
  'link.error.key-lost': 'This connection’s key does not work on this computer.',
  'link.error.bad-address':
    'That address is not valid. Type the computer’s IP or name, and the port if it is not 8443.',
  'link.error.not-qubiq': 'What answers at that address is not QubiQ remote access.',
  'link.error.no-secure-storage': 'Windows does not allow encrypting this computer’s key.',
  'link.error.unknown-link': 'That connection no longer exists.'
}
