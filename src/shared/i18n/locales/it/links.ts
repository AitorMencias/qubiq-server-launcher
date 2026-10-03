import type { links as source } from '../es/links'
import type { Translation } from '../../types'

export const links: Translation<typeof source> = {
  'remote.order.forget': 'Rimuoversi',

  'link.add.button': 'Collegati a un altro QubiQ',
  'link.add.title': 'Collegati a un altro QubiQ',
  'link.add.intro':
    'Gestisci da qui i server di un altro computer con QubiQ, con ciò che permette la pagina remota del telefono: avviare, fermare, riavviare e vedere la console, i giocatori e la cronologia. Niente della sua configurazione né dei suoi file.',
  'link.add.before':
    'Sull’altro computer, vai in Impostazioni dell’app → Accesso remoto: attivalo, seleziona i server da gestire da qui e genera un codice.',
  'link.add.address': 'Indirizzo dell’altro computer',
  'link.add.addressHelp':
    'Quello che mostra in «Indirizzo per collegarsi», per esempio 192.168.1.20:8443. Da fuori casa sua, il suo IP pubblico con la porta aperta, o il suo indirizzo Tailscale.',
  'link.add.search': 'Cerca',
  'link.add.searching': 'Ricerca…',
  'link.add.found': 'C’è un QubiQ a {address}.',
  'link.add.fingerprintTitle': 'Controlla l’impronta',
  'link.add.fingerprintHelp':
    'È l’«Impronta del certificato» che l’altro computer mostra in Impostazioni dell’app → Accesso remoto. Confrontala tutta: se non coincide, qualcuno potrebbe essere in mezzo e non devi continuare.',
  'link.add.fingerprintMatch': 'Coincidono: è quel computer',
  'link.add.code': 'Codice di abbinamento',
  'link.add.name': 'Nome di questo computer laggiù',
  'link.add.nameHelp': 'Comparirà così nel suo elenco di dispositivi.',
  'link.add.defaultName': 'QubiQ di {pc}',
  'link.add.submit': 'Abbina',
  'link.add.working': 'Abbinamento…',
  'link.add.back': 'Cambia indirizzo',
  'link.add.noSecureStorage':
    'Windows non permette di cifrare la chiave di questo computer, quindi non si può abbinare: resterebbe salvata in chiaro.',

  'link.group': 'Su {host}',
  'link.state.connecting': 'Connessione…',
  'link.state.online': 'Connesso',
  'link.state.offline': 'Nessuna connessione',
  'link.state.revoked': 'Non ha più accesso',
  'link.state.cert-changed': 'L’impronta è cambiata',
  'link.state.key-lost': 'Chiave inutilizzabile',
  'link.statusUnknown': 'Stato sconosciuto',
  'link.noServers': 'Nessun server: selezionali laggiù, in Accesso remoto.',
  'link.retry': 'Riprova',
  'link.lastContact': 'Ultima risposta: {date}.',
  'link.offline.text':
    'Impossibile contattare {host}. I suoi server potrebbero essere ancora in funzione: quello che vedi è l’ultimo stato noto.',
  'link.revoked.text':
    '{host} non riconosce più questo computer: è stato rimosso dal suo elenco. Rimuovi la connessione e abbina di nuovo con un nuovo codice.',
  'link.keyLost.text':
    'La chiave di questa connessione non funziona su questo computer o con questo utente di Windows (i dati sono stati copiati da un altro PC?). Rimuovi la connessione e abbina di nuovo.',
  'link.certChanged.text':
    '{host} mostra un certificato diverso da quello controllato durante l’abbinamento. Succede se è stato rinnovato o ricreato laggiù, ma anche se qualcuno si è messo in mezzo. Non gli si invia nulla finché non confermi.',
  'link.certChanged.old': 'Impronta fissata',
  'link.certChanged.new': 'Impronta mostrata ora',
  'link.certChanged.check': 'Confrontala con quella che l’altro computer mostra in Impostazioni dell’app → Accesso remoto.',
  'link.certChanged.load': 'Vedi la nuova impronta',
  'link.certChanged.trust': 'Coincidono: fidati della nuova',

  'link.panel.details': 'Connessione',
  'link.panel.address': 'Indirizzo',
  'link.panel.device': 'Questo computer laggiù',
  'link.panel.fingerprint': 'Impronta fissata',
  'link.panel.paired': 'Abbinato',
  'link.panel.permissions': 'Cosa può fare questo computer',
  'link.panel.permissionsHelp': 'Lo decide il proprietario dell’altro computer, nel suo Accesso remoto.',
  'link.panel.controlYes': 'Avviare, fermare e riavviare: sì',
  'link.panel.controlNo': 'Avviare, fermare e riavviare: no, solo guardare',
  'link.panel.console': 'Console: {level}',
  'link.panel.servers': 'Server',
  'link.remove.title': 'Rimuovi la connessione',
  'link.remove.hint':
    'La chiave di questo computer viene eliminata e all’altro si chiede di dimenticarlo. Per ricollegarsi servirà un nuovo codice.',
  'link.remove.button': 'Rimuovi la connessione',
  'link.remove.confirm': 'Rimuovere la connessione con {host}?',
  'link.remove.working': 'Rimozione…',
  'link.remove.done': 'Connessione con {host} rimossa.',
  'link.remove.notNotified':
    'Connessione con {host} rimossa qui, ma non ha risposto: «{device}» è ancora nel suo elenco di dispositivi. Rimuovilo nel suo Accesso remoto.',

  'link.server.on': 'su {host}',
  'link.server.noControl':
    'Questo computer può solo guardare: il proprietario di {host} non gli ha dato il permesso di avviare né fermare.',
  'link.server.gone':
    'Questo server non è più nell’elenco di {host}: è stato eliminato o a questo computer è stato tolto il permesso.',

  'link.error.offline':
    'Impossibile contattare quel computer. Controlla l’indirizzo, che abbia l’accesso remoto attivo e, da fuori casa sua, che la porta sia aperta.',
  'link.error.cert-changed': 'Il certificato dell’altro computer non è quello controllato.',
  'link.error.key-lost': 'La chiave di questa connessione non funziona su questo computer.',
  'link.error.bad-address':
    'Quell’indirizzo non è valido. Scrivi l’IP o il nome del computer, e la porta se non è la 8443.',
  'link.error.not-qubiq': 'Ciò che risponde a quell’indirizzo non è l’accesso remoto di QubiQ.',
  'link.error.no-secure-storage': 'Windows non permette di cifrare la chiave di questo computer.',
  'link.error.unknown-link': 'Quella connessione non esiste più.'
}
