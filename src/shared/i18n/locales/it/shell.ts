import type { shell as source } from '../es/shell'
import type { Translation } from '../../types'

export const shell: Translation<typeof source> = {
  'common.cancel': 'Annulla',
  'common.quoted': '«{text}»',

  'main.quit.title': 'Ci sono server avviati',
  'main.quit.message': 'Hai dei server in esecuzione.',
  'main.quit.detail':
    'Verranno chiusi correttamente per non danneggiare il mondo. Può richiedere qualche secondo mentre salvano la partita.',
  'main.quit.confirm': 'Chiudi i server ed esci',
  'main.quit.cancel': 'Annulla',
  'main.missing.title': 'Impossibile trovare la cartella dei dati',
  'main.missing.message': 'Impossibile trovare la cartella dei dati di QubiQ: {path}',
  'main.missing.detail':
    'Potrebbe trovarsi su un disco che ora non è collegato. Collegalo e premi «Riprova». Se scegli la cartella predefinita ({defaultPath}), l’app si avvierà senza i tuoi server; il contenuto dell’altra cartella non viene toccato.',
  'main.missing.retry': 'Riprova',
  'main.missing.useDefault': 'Usa la cartella predefinita',
  'main.missing.quit': 'Esci',

  'app.noServersYet': 'Non hai ancora nessun server.',
  'app.createServer': '+ Crea server',
  'app.mode': 'Modalità',
  'app.modeHint.basic': 'L’essenziale per giocare. Alla parte tecnica pensiamo noi.',
  'app.modeHint.advanced': 'La stessa schermata, con tutte le impostazioni sbloccate.',
  'app.settings': 'Impostazioni dell’app',
  'app.loadError': 'Impossibile caricare i server',
  'app.create.title': 'Crea un nuovo server',
  'app.create.titleGame': 'Crea un nuovo server di {game}',
  'app.create.modeBasic': 'Modalità base',
  'app.create.modeAdvanced': 'Modalità avanzata',
  'app.create.changeMode': 'Cambia modalità',
  'app.empty.title': 'Non hai ancora server',
  'app.empty.text': 'Crea il primo e in pochi minuti starete giocando.',
  'app.empty.button': 'Crea il mio primo server',

  'mode.basic': 'Base',
  'mode.advanced': 'Avanzata',
  'mode.basic.tagline': 'Ti guidiamo passo dopo passo',
  'mode.basic.point1':
    'Una domanda per schermata: il nome, quanti siete, ciò che richiede il gioco e come vi collegate',
  'mode.basic.point2': 'Alla parte tecnica pensiamo noi: versione, memoria e porta',
  'mode.basic.point3': 'Poi, solo un pulsante per accendere e spegnere, i tuoi giocatori e la console',
  'mode.basic.cta': 'Crea in modalità base →',
  'mode.advanced.tagline': 'Decidi tutto tu',
  'mode.advanced.point1': 'Scegli versione precisa, memoria e porta',
  'mode.advanced.point2': 'La stessa schermata, con tutta la configurazione sbloccata e la scheda tecnica',
  'mode.advanced.point3': 'Backup con intervallo e conservazione, seed e tutte le impostazioni del gioco',
  'mode.advanced.cta': 'Crea in modalità avanzata →',
  'mode.chooser.title': 'Come vuoi crearlo?',
  'mode.chooser.text':
    'Puoi cambiare modalità quando vuoi dalla barra a sinistra o dalle impostazioni dell’app. Non influisce sul server, solo su quante domande ti facciamo.',
  'mode.recommended': 'Consigliata',
  'mode.current': 'La tua modalità attuale',

  'settings.title': 'Impostazioni dell’app',
  'settings.back': 'Indietro',
  'settings.language.title': 'Lingua',
  'settings.language.hint':
    'Quella di tutta l’interfaccia. I nomi dei giochi e i termini tecnici (RCON, BepInEx…) non vengono tradotti. Alcuni messaggi di errore e di installazione compaiono ancora in spagnolo.',
  'settings.language.auto': 'Automatica: quella di Windows ({name})',
  'settings.mode.title': 'Modalità',
  'settings.mode.hint':
    'Quante domande fa l’app e quante impostazioni mostra. Non cambia nulla dei tuoi server: puoi passare dall’una all’altra quando vuoi.',
  'settings.mode.basicSub':
    'L’essenziale per giocare. L’app sceglie per te versione, memoria e porta e ti guida passo dopo passo nella creazione di un server.',
  'settings.mode.advancedSub':
    'Tutto in vista: versione precisa, memoria, porta, backup con intervallo e conservazione, e tutte le impostazioni di ogni gioco.',
  'settings.dataFolder.title': 'Cartella dei dati',
  'settings.dataFolder.hint':
    'Qui l’app conserva i tuoi server, i loro backup, Java, SteamCMD e i download. Puoi spostarla su un altro disco se su questo manca spazio.',
  'settings.dataFolder.current': 'Posizione attuale',
  'settings.dataFolder.isDefault': 'È la cartella predefinita.',
  'settings.dataFolder.notDefault': 'La cartella predefinita è {path}.',
  'settings.dataFolder.open': 'Apri cartella',
  'settings.dataFolder.change': 'Sposta…',
  'settings.dataFolder.backToDefault': 'Torna alla cartella predefinita',
  'settings.dataFolder.pickTitle': 'Scegli dove salvare i dati di QubiQ',
  'settings.dataFolder.checking': 'Controllo della cartella e misurazione dello spazio occupato dai tuoi dati…',
  'settings.dataFolder.checkFailed': 'Impossibile controllare quella cartella',
  'settings.dataFolder.target': 'I dati andranno in',
  'settings.dataFolder.subfolder':
    'La cartella scelta contiene già dei file, quindi viene creata una cartella QubiQ per non mescolarli.',
  'settings.dataFolder.sameDrive': 'È sullo stesso disco: lo spostamento è immediato, senza copiare nulla.',
  'settings.dataFolder.otherDrive': 'È su un altro disco: bisogna copiare {size}.',
  'settings.dataFolder.problemTitle': 'Non si può spostare lì',
  'settings.dataFolder.problem.same': 'I dati sono già in quella cartella.',
  'settings.dataFolder.problem.nested':
    'La nuova cartella non può essere dentro quella attuale, né quella attuale dentro la nuova.',
  'settings.dataFolder.problem.spaces':
    'Il percorso contiene spazi. Alcuni installer di server (quello di Forge, per esempio) falliscono con gli spazi, quindi non sono ammessi. Scegli una cartella senza spazi, come D:\\QubiQ.',
  'settings.dataFolder.problem.network':
    'È una cartella di rete. Se la rete cade con un server acceso la partita si può rovinare, e SteamCMD non installa in queste cartelle. Scegli una cartella su un disco di questo computer.',
  'settings.dataFolder.problem.occupied':
    'In quella cartella ci sono già dati di QubiQ ({entries}). Non vengono mescolati con i tuoi: scegli un’altra cartella o svuota quella.',
  'settings.dataFolder.problem.notWritable':
    'Windows non permette di creare cartelle lì. Scegline un’altra, per esempio nella tua cartella utente o su un altro disco.',
  'settings.dataFolder.problem.space':
    'Spazio insufficiente: servono {needed} (i tuoi dati più un margine di 1 GB) e su quel disco restano {free}.',
  'settings.dataFolder.problem.busy': {
    one: 'Prima bisogna fermare il server {servers}: mentre è acceso o in installazione ha i suoi file aperti.',
    other:
      'Prima bisogna fermare questi server: {servers}. Mentre sono accesi o in installazione hanno i loro file aperti.'
  },
  'settings.dataFolder.problem.valheimPath': {
    one: 'Il server di Valheim {servers} ha delle mod, e lì i suoi percorsi arriverebbero a {length} caratteri (Windows ne ammette {max}). BepInEx non partirebbe e il server resterebbe senza mod senza avvisare. Scegli un percorso più corto.',
    other:
      'I server di Valheim {servers} hanno delle mod, e lì i loro percorsi arriverebbero a {length} caratteri (Windows ne ammette {max}). BepInEx non partirebbe e resterebbero senza mod senza avvisare. Scegli un percorso più corto.'
  },
  'settings.dataFolder.problem.links':
    'Nei dati c’è un collegamento a un’altra cartella ({path}). Tra dischi diversi non si può copiare senza trascinare ciò che c’è dall’altra parte. Rimuovilo o scegli una cartella sullo stesso disco.',
  'settings.dataFolder.warning.firewallTitle': 'Il firewall di Windows chiederà di nuovo',
  'settings.dataFolder.warning.firewall':
    'I permessi del firewall dipendono dal percorso di ogni programma, e quelli dei tuoi server cambiano. La prima volta che avvii ogni server dopo lo spostamento, Windows chiederà se consentirgli di usare la rete: accetta, o i tuoi amici non potranno entrare.',
  'settings.dataFolder.warning.copyTitle': 'Ci vorrà un po’',
  'settings.dataFolder.warning.copy':
    'Bisogna copiare {size}. Su un SSD calcola circa {minutes} min; su un disco rigido, parecchio di più. Nel frattempo l’app non si può usare. Se qualcosa va storto, i dati restano dove sono: la cartella originale viene cancellata solo quando la copia è completa e verificata.',
  'settings.dataFolder.warning.cloudTitle': 'È una cartella sincronizzata con il cloud',
  'settings.dataFolder.warning.cloud':
    'OneDrive e servizi simili caricano tutto ciò che cambia e bloccano i file mentre lo fanno. Con dei server dentro sarebbero GB di upload e salvataggi scritti a metà. Meglio una cartella non sincronizzata.',
  'settings.dataFolder.warning.valheimPathTitle': 'Valheim non potrà usare mod',
  'settings.dataFolder.warning.valheimPath': {
    one: 'In quella cartella, i percorsi del server di Valheim {servers} arriverebbero a {length} caratteri (Windows ne ammette {max}). Ora non ha mod e continuerà a funzionare come prima, ma non se ne potranno installare.',
    other:
      'In quella cartella, i percorsi dei server di Valheim {servers} arriverebbero a {length} caratteri (Windows ne ammette {max}). Ora non hanno mod e continueranno a funzionare come prima, ma non se ne potranno installare.'
  },
  'settings.dataFolder.howTitle': 'Come funziona',
  'settings.dataFolder.howText':
    'Premendo {button}, l’app si chiude e si riapre da sola per spostare i dati prima di avviare qualsiasi cosa. Vedrai l’avanzamento; al termine tutto resta come ora, ma nella nuova cartella.',
  'settings.dataFolder.apply': 'Sposta e riavvia',
  'settings.dataFolder.applying': 'Riavvio…',

  'relocation.movingTitle': 'Spostamento dei dati di QubiQ',
  'relocation.movingHint':
    'Non chiudere l’app e non spegnere il computer. Se si interrompe non si perde nulla: riprende quando la riapri.',
  'relocation.from': 'Da',
  'relocation.to': 'A',
  'relocation.phase.measuring': 'Misurazione di ciò che va spostato…',
  'relocation.phase.moving': 'Spostamento…',
  'relocation.phase.copying': 'Copia: {copied} di {total}',
  'relocation.phase.verifying': 'Verifica che la copia sia identica…',
  'relocation.phase.cleaning': 'Copia verificata. Eliminazione della cartella originale…',
  'relocation.doneTitle': 'Dati spostati',
  'relocation.firewallTitle': 'Un’ultima cosa',
  'relocation.firewall':
    'La prima volta che avvii ogni server, Windows potrebbe chiedere se consentirgli di usare la rete. Accetta, o i tuoi amici non potranno entrare.',
  'relocation.leftoversTitle': 'Sono rimasti dei residui nella cartella precedente',
  'relocation.leftovers':
    'I tuoi dati sono completi nella nuova cartella, ma non è stato possibile eliminare alcune cartelle in {path} (instances, runtimes, tools o cache). Puoi eliminarle a mano; non eliminare l’intera cartella, perché registra dove si trovano ora i tuoi dati.',
  'relocation.failedTitle': 'Impossibile spostare i dati',
  'relocation.untouched': 'I tuoi dati sono ancora dov’erano, senza modifiche',
  'relocation.error.locked':
    'Un programma aveva aperto un file dei dati (un antivirus, Esplora file di Windows o un server avviato fuori da QubiQ). Chiudilo e riprova dalle impostazioni.',
  'relocation.error.mismatch':
    'La copia non è risultata uguale all’originale (mancavano file o avevano dimensioni diverse), quindi non è stato eliminato nulla. Controlla che il disco di destinazione funzioni bene e riprova.',
  'relocation.error.links':
    'Nei dati c’è un collegamento a un’altra cartella ({path}) e non si può copiare tra dischi diversi. Rimuovilo o scegli una cartella sullo stesso disco.',
  'relocation.error.missing': 'Cartella di origine non trovata, oppure quella di destinazione non è più disponibile.',
  'relocation.error.other': 'Errore imprevisto: {detail}',
  'relocation.continue': 'Continua'
}
