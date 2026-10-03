import type { games as source } from '../es/games'
import type { Translation } from '../../types'

export const games: Translation<typeof source> = {
  'games.subtitle': 'Server di gioco, senza complicazioni',
  'games.subtitleOne': 'Server di {game}, senza complicazioni',
  'games.disclaimerAll':
    'QubiQ non è un prodotto ufficiale di nessuno dei giochi che gestisce né è affiliato ai loro studi.',
  'games.agreement.minecraft': 'l’EULA di Minecraft',
  'games.agreement.steam': 'il Contratto di sottoscrizione di Steam',
  'games.tunnelExampleHost': 'qualcosa',
  'games.upTo': 'Fino a {n}',
  'games.upToComfortably': 'Fino a {n} comodamente',
  'games.alwaysPublic': 'Compare sempre nella lista pubblica',

  'games.port.game': 'Gioco',
  'games.port.messaging': 'Messaggistica del gioco',
  'games.port.playerData': 'Dati dei giocatori',
  'games.port.steamQuery': 'Query di Steam',
  'games.port.rustPlus': 'Rust+ (app per smartphone)',
  'games.port.tcpUdp': 'TCP e UDP',
  'games.port.udpTcp': 'UDP e TCP',
  'games.summary.custom': 'personalizzato',
  'games.summary.rustMap': 'mappa: {size}',

  'games.minecraft.tagline': 'Costruire e sopravvivere. Il classico, con plugin o mod.',
  'games.minecraft.players': 'Fino a ~20',
  'games.minecraft.download': '≈ 1 GB',
  'games.minecraft.highlight1': 'Plugin e mod',
  'games.minecraft.startup': 'dipende dalle mod: da pochi secondi a un paio di minuti',
  'games.minecraft.ports': 'una TCP (25565)',
  'games.minecraft.extra': 'Java: lo scarica l’app da sola',
  'games.minecraft.joinHint': 'In Minecraft: Multigiocatore → Aggiungi server.',
  'games.minecraft.backupScope':
    'Vengono salvati il mondo e la configurazione. I jar non servono: si possono riscaricare.',

  'games.satisfactory.tagline': 'Fabbriche enormi costruite in squadra.',
  'games.satisfactory.players': 'Fino a 4 (ampliabile)',
  'games.satisfactory.download': '15,5 GB',
  'games.satisfactory.highlight1': 'Si configura senza aprire il gioco',
  'games.satisfactory.highlight2': 'Solo uno alla volta',
  'games.satisfactory.startup': 'circa 6 secondi',
  'games.satisfactory.ports': 'la 7777 su TCP e UDP, e la 8888 su TCP',
  'games.satisfactory.disclaimer':
    'Strumento non ufficiale. Non affiliato a Coffee Stain Studios né a Satisfactory.',
  'games.satisfactory.joinHint': 'In Satisfactory: Gestione server → Aggiungi server, con questo indirizzo.',
  'games.satisfactory.join1': 'Apri Satisfactory ed entra in «Gestione server» dal menu principale.',
  'games.satisfactory.join2': 'Premi «Aggiungi server» e incolla lì l’indirizzo.',
  'games.satisfactory.join3':
    'Ti chiederà la password da amministratore (quella impostata alla creazione del server) per poterlo gestire.',
  'games.satisfactory.join4':
    'Il server resta nella tua lista: premi «Unisciti» e, se hai impostato una password d’accesso, scrivila.',
  'games.satisfactory.joinWarning':
    'La connessione diretta via IP non funziona: il gioco richiede un permesso che si ottiene solo aggiungendo il server in questo modo. Se provi a forzarla, Satisfactory risponde «Encryption token missing».',
  'games.satisfactory.backupScope':
    'Vengono salvati i salvataggi e le impostazioni del server. Il gioco non serve: si riscarica da Steam.',
  'games.satisfactory.moderationHint':
    'Questo gioco non permette di espellere o bannare dall’esterno. Entra in partita con la tua password da amministratore e fallo dal menu del gioco. Se devi tagliare corto, ferma il server o imposta una password d’accesso da Impostazioni.',

  'games.valheim.tagline': 'Sopravvivere, costruire e abbattere boss in un mondo vichingo.',
  'games.valheim.download': '2 GB',
  'games.valheim.highlight1': 'Si gioca da fuori senza aprire porte',
  'games.valheim.highlight2': 'Il più leggero di tutti',
  'games.valheim.highlight3': 'Niente moderazione a caldo',
  'games.valheim.startup': '35 s con un mondo nuovo, poi 12 s',
  'games.valheim.ports': 'due UDP (2456 e 2457), o nessuna con il crossplay',
  'games.valheim.disclaimer': 'Strumento non ufficiale. Non affiliato a Iron Gate né a Valheim.',
  'games.valheim.joinHint': 'In Valheim: Unisciti alla partita → Aggiungi server, con questo indirizzo.',
  'games.valheim.join1': 'Apri Valheim, scegli il tuo personaggio ed entra in «Unisciti alla partita».',
  'games.valheim.join2': 'Premi «Aggiungi server» e incolla lì l’indirizzo, porta inclusa.',
  'games.valheim.join3': 'Scrivi la password del server quando te la chiede.',
  'games.valheim.join4': 'Il server resta nei preferiti: la prossima volta basta premere «Connetti».',
  'games.valheim.crossplay2': 'Premi «Unisciti con codice» e scrivi il codice a 6 cifre che ti dà l’app.',
  'games.valheim.crossplay4':
    'Il codice cambia a ogni avvio del server: bisognerà ricondividerlo.',
  'games.valheim.backupScope':
    'Vengono salvati i mondi e le liste di moderazione. Il gioco non serve: si riscarica da Steam.',
  'games.valheim.moderationHint':
    'In Valheim si modera tramite ID di Steam, non per nome: il gioco non dice come si chiama il personaggio di nessuno. Bannare qualcuno lo espelle subito, e le liste complete (amministratori, bannati e ammessi) sono in Configurazione → Moderazione.',

  'games.factorio.tagline': 'Costruire insieme una fabbrica enorme, e difenderla.',
  'games.factorio.highlight1': 'Si avvia in un secondo',
  'games.factorio.highlight2': 'Con mod e con Space Age',
  'games.factorio.highlight3': 'Serve possedere il gioco',
  'games.factorio.startup': 'un secondo',
  'games.factorio.ports': 'una UDP (34197)',
  'games.factorio.extra': 'avere Factorio sul tuo account Steam',
  'games.factorio.disclaimer': 'Strumento non ufficiale. Non affiliato a Wube Software né a Factorio.',
  'games.factorio.joinHint': 'In Factorio: Multigiocatore → Connetti a un indirizzo.',
  'games.factorio.join1': 'Apri Factorio ed entra in «Multigiocatore» dal menu principale.',
  'games.factorio.join2': 'Premi «Connetti a un indirizzo» e incolla lì l’indirizzo, porta inclusa.',
  'games.factorio.join3': 'Scrivi la password del server quando te la chiede.',
  'games.factorio.join4': 'Dovete avere tutti la stessa versione del gioco e le stesse mod del server.',
  'games.factorio.joinWarning':
    'Se salti la password, Factorio chiude la connessione senza dire perché (sul server risulta «PasswordMissing»). E se il tuo gioco non ha la stessa versione del server, non ti farà entrare: controlla la versione nella scheda del server.',
  'games.factorio.backupScope':
    'Vengono salvati i salvataggi, le mod e le liste di moderazione. Il gioco non serve: si riscarica da Steam.',
  'games.factorio.moderationHint':
    'In Factorio si modera tramite il nome dell’account Factorio, quello che compare in chat. Bannare qualcuno lo espelle subito.',

  'games.zomboid.tagline': 'Sopravvivere all’epidemia zombie il più a lungo possibile.',
  'games.zomboid.download': '6,7 GB',
  'games.zomboid.highlight1': 'Si modera e si comanda come in Minecraft',
  'games.zomboid.highlight2': 'Centinaia di regole di partita',
  'games.zomboid.highlight3': 'Ci mette più di un minuto ad avviarsi',
  'games.zomboid.startup': 'circa 40 secondi (un minuto e mezzo la prima volta)',
  'games.zomboid.ports': 'una UDP (16261), due con Steam attivo',
  'games.zomboid.disclaimer':
    'Strumento non ufficiale. Non affiliato a The Indie Stone né a Project Zomboid.',
  'games.zomboid.joinHint': 'In Project Zomboid: Unisciti → Preferiti → Aggiungi server, con questo indirizzo.',
  'games.zomboid.join1': 'Apri Project Zomboid ed entra in «Unisciti» dal menu principale.',
  'games.zomboid.join2': 'Vai alla scheda «Preferiti» e premi «Aggiungi server» con questo indirizzo e la sua porta.',
  'games.zomboid.join3':
    'Scrivi il nome utente e la password che vuoi: la prima volta l’account si crea da solo.',
  'games.zomboid.join4':
    'Se il server ha una password, va nel campo «Password del server», diverso da quello del tuo account.',
  'games.zomboid.joinWarning':
    'Il tuo utente e la tua password sono di questo server, non di Steam: li inventi tu la prima volta e con quelli torni al tuo personaggio. Se sbagli a scriverli, il server dice che la password non è valida invece di crearti un altro account.',
  'games.zomboid.backupScope':
    'Vengono salvati la partita, le impostazioni e il database degli account (chi è amministratore e chi è bannato). Il gioco non serve: si riscarica da Steam.',
  'games.zomboid.moderationHint':
    'In Zomboid si modera tramite il nome dell’account del server, non di Steam. I comandi passano per la console remota, quindi il server deve essere avviato: da fermo si vede chi è chi, ma non si può cambiare nulla.',

  'games.enshrouded.tagline': 'Sopravvivere, costruire ed esplorare un mondo inghiottito dalla nebbia.',
  'games.enshrouded.download': '8,8 GB',
  'games.enshrouded.highlight1': 'Si avvia in 3 secondi',
  'games.enshrouded.highlight2': 'Permessi tramite password',
  'games.enshrouded.startup': 'tra 2 e 4 secondi',
  'games.enshrouded.ports': 'una UDP (15637)',
  'games.enshrouded.extra': 'compare sempre nella lista pubblica del gioco',
  'games.enshrouded.disclaimer': 'Strumento non ufficiale. Non affiliato a Keen Games né a Enshrouded.',
  'games.enshrouded.joinHint': 'In Enshrouded: Gioca → Server → Aggiungi server, con questo indirizzo.',
  'games.enshrouded.join1': 'Apri Enshrouded ed entra in «Server» dal menu di gioco.',
  'games.enshrouded.join2': 'Premi «Aggiungi server» e incolla lì l’indirizzo, porta inclusa.',
  'games.enshrouded.join3':
    'Scrivi la password del ruolo che ti hanno dato: la password decide cosa puoi fare dentro.',
  'games.enshrouded.join4':
    'Il server resta nei preferiti, dove compare anche se la lista pubblica tarda ad aggiornarsi.',
  'games.enshrouded.joinWarning':
    'In Enshrouded non c’è una password del server, ma una per ruolo. Con quella da Amministratore puoi espellere e bannare; con quella da Ospite non puoi nemmeno aprire i forzieri. Se ti danno quella sbagliata, entri comunque ma con altri permessi.',
  'games.enshrouded.backupScope':
    'Vengono salvati i mondi e la configurazione, con i ruoli e i bannati. Il gioco non serve: si riscarica da Steam. Con il server acceso, il backup si fa subito dopo uno dei suoi salvataggi, che avvengono ogni cinque minuti.',
  'games.enshrouded.moderationHint':
    'Enshrouded non permette di espellere nessuno dall’esterno del gioco: il suo stesso server dice che l’espulsione su un dedicato «non è implementata». Si può invece revocare un ban da qui, e bannare dall’interno del gioco con la password da Amministratore (scheda Social).',

  'games.rust.tagline': 'Sopravvivere, costruire una base e difenderla. Ogni mese, mappa nuova.',
  'games.rust.players': 'Fino a {n} su un PC di casa',
  'games.rust.download': '5,5 GB',
  'games.rust.highlight1': 'Moderazione a caldo',
  'games.rust.highlight2': 'Plugin con Oxide',
  'games.rust.highlight3': 'Mappa nuova ogni mese',
  'games.rust.startup': 'da 2 a 5 minuti la prima volta (genera la mappa), poi circa 13 s',
  'games.rust.ports': 'due UDP (28015 e 28017), più una TCP con Rust+',
  'games.rust.extra': 'compare sempre nella lista pubblica; mappa nuova ogni mese',
  'games.rust.disclaimer': 'Strumento non ufficiale. Non affiliato a Facepunch Studios né a Rust.',
  'games.rust.joinHint': 'In Rust: premi F1 e scrivi «client.connect» seguito da questo indirizzo.',
  'games.rust.join1': 'Apri Rust e aspetta di essere nel menu principale.',
  'games.rust.join2': 'Premi F1 per aprire la console del gioco.',
  'games.rust.join3':
    'Scrivi «client.connect» e l’indirizzo con la porta, per esempio: client.connect 192.168.1.20:28015',
  'games.rust.join4':
    'Premi Invio. Poi il server compare in «Cronologia» nella lista dei server, per la prossima volta.',
  'games.rust.joinWarning':
    'Se il server ha appena cambiato mese e non è stato aggiornato, Rust non ti fa entrare: dice che la versione non corrisponde. Succede il primo giovedì di ogni mese; vedi Configurazione → Wipe.',
  'games.rust.backupScope':
    'Vengono salvati la mappa con tutto ciò che è stato costruito, i giocatori, gli amministratori e i bannati, e i plugin con la loro configurazione. Il gioco non serve: si riscarica da Steam.',
  'games.rust.moderationHint':
    'In Rust si modera tramite ID di Steam, anche se la lista mostra il nome. Espulsioni e ban hanno effetto subito; amministratori e bannati sono in Configurazione → Moderazione.'
}
