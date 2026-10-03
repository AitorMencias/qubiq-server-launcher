import type { games as source } from '../es/games'
import type { Translation } from '../../types'

export const games: Translation<typeof source> = {
  'games.subtitle': 'Des serveurs de jeux, sans prise de tête',
  'games.subtitleOne': 'Des serveurs {game}, sans prise de tête',
  'games.disclaimerAll':
    'QubiQ n’est un produit officiel d’aucun des jeux qu’il gère et n’est pas affilié à leurs studios.',
  'games.agreement.minecraft': 'le CLUF de Minecraft',
  'games.agreement.steam': 'le Contrat d’abonnement Steam',
  'games.tunnelExampleHost': 'quelquechose',
  'games.upTo': 'Jusqu’à {n}',
  'games.upToComfortably': 'Jusqu’à {n} confortablement',
  'games.alwaysPublic': 'Toujours visible dans la liste publique',

  'games.port.game': 'Jeu',
  'games.port.messaging': 'Messagerie du jeu',
  'games.port.playerData': 'Données des joueurs',
  'games.port.steamQuery': 'Requête Steam',
  'games.port.rustPlus': 'Rust+ (appli mobile)',
  'games.port.tcpUdp': 'TCP et UDP',
  'games.port.udpTcp': 'UDP et TCP',
  'games.summary.custom': 'sur mesure',
  'games.summary.rustMap': 'carte : {size}',

  'games.minecraft.tagline': 'Construire et survivre. Le classique, avec plugins ou mods.',
  'games.minecraft.players': 'Jusqu’à ~20',
  'games.minecraft.download': '≈ 1 Go',
  'games.minecraft.highlight1': 'Plugins et mods',
  'games.minecraft.startup': 'dépend des mods : de quelques secondes à quelques minutes',
  'games.minecraft.ports': 'un en TCP (25565)',
  'games.minecraft.extra': 'Java : l’application le télécharge toute seule',
  'games.minecraft.joinHint': 'Dans Minecraft : Multijoueur → Ajouter un serveur.',
  'games.minecraft.backupScope':
    'Le monde et la configuration sont sauvegardés. Les jars ne sont pas nécessaires : ils peuvent être retéléchargés.',

  'games.satisfactory.tagline': 'D’immenses usines construites en équipe.',
  'games.satisfactory.players': 'Jusqu’à 4 (extensible)',
  'games.satisfactory.download': '15,5 Go',
  'games.satisfactory.highlight1': 'Se configure sans ouvrir le jeu',
  'games.satisfactory.highlight2': 'Un seul à la fois',
  'games.satisfactory.startup': 'environ 6 secondes',
  'games.satisfactory.ports': 'le 7777 en TCP et UDP, et le 8888 en TCP',
  'games.satisfactory.disclaimer':
    'Outil non officiel. Non affilié à Coffee Stain Studios ni à Satisfactory.',
  'games.satisfactory.joinHint': 'Dans Satisfactory : Gestionnaire de serveurs → Ajouter un serveur, avec cette adresse.',
  'games.satisfactory.join1': 'Ouvrez Satisfactory et allez dans « Gestionnaire de serveurs » depuis le menu principal.',
  'games.satisfactory.join2': 'Cliquez sur « Ajouter un serveur » et collez-y l’adresse.',
  'games.satisfactory.join3':
    'Le jeu vous demandera le mot de passe administrateur (celui défini à la création du serveur) pour pouvoir le gérer.',
  'games.satisfactory.join4':
    'Le serveur reste dans votre liste : cliquez sur « Rejoindre » et, si vous avez défini un mot de passe d’accès, saisissez-le.',
  'games.satisfactory.joinWarning':
    'La connexion directe par IP ne fonctionne pas : le jeu exige une autorisation qu’on n’obtient qu’en ajoutant le serveur de cette façon. Si vous forcez, Satisfactory répond « Encryption token missing ».',
  'games.satisfactory.backupScope':
    'Les sauvegardes de partie et les réglages du serveur sont sauvegardés. Le jeu n’est pas nécessaire : il est retéléchargé depuis Steam.',
  'games.satisfactory.moderationHint':
    'Ce jeu ne permet pas d’expulser ni de bannir depuis l’extérieur. Rejoignez la partie avec votre mot de passe administrateur et faites-le depuis le menu du jeu. S’il faut couper court, arrêtez le serveur ou définissez un mot de passe d’accès dans Réglages.',

  'games.valheim.tagline': 'Survivre, construire et vaincre des boss dans un monde viking.',
  'games.valheim.download': '2 Go',
  'games.valheim.highlight1': 'Jouable de l’extérieur sans ouvrir de ports',
  'games.valheim.highlight2': 'Le plus léger de tous',
  'games.valheim.highlight3': 'Pas de modération à chaud',
  'games.valheim.startup': '35 s avec un nouveau monde, 12 s ensuite',
  'games.valheim.ports': 'deux en UDP (2456 et 2457), ou aucun avec le crossplay',
  'games.valheim.disclaimer': 'Outil non officiel. Non affilié à Iron Gate ni à Valheim.',
  'games.valheim.joinHint': 'Dans Valheim : Rejoindre une partie → Ajouter un serveur, avec cette adresse.',
  'games.valheim.join1': 'Ouvrez Valheim, choisissez votre personnage et allez dans « Rejoindre une partie ».',
  'games.valheim.join2': 'Cliquez sur « Ajouter un serveur » et collez-y l’adresse, port compris.',
  'games.valheim.join3': 'Saisissez le mot de passe du serveur quand il est demandé.',
  'games.valheim.join4': 'Le serveur reste dans vos favoris : la prochaine fois, il suffit de cliquer sur « Connexion ».',
  'games.valheim.crossplay2': 'Cliquez sur « Rejoindre avec un code » et saisissez le code à 6 chiffres fourni par l’application.',
  'games.valheim.crossplay4':
    'Le code change à chaque démarrage du serveur : il faudra le redonner.',
  'games.valheim.backupScope':
    'Les mondes et les listes de modération sont sauvegardés. Le jeu n’est pas nécessaire : il est retéléchargé depuis Steam.',
  'games.valheim.moderationHint':
    'Dans Valheim, on modère par identifiant Steam, pas par nom : le jeu n’indique pas le nom du personnage de chacun. Bannir quelqu’un l’expulse immédiatement, et les listes complètes (admins, bannis et autorisés) sont dans Configuration → Modération.',

  'games.factorio.tagline': 'Bâtir ensemble une immense usine, et la défendre.',
  'games.factorio.highlight1': 'Démarre en une seconde',
  'games.factorio.highlight2': 'Avec mods et Space Age',
  'games.factorio.highlight3': 'Il faut posséder le jeu',
  'games.factorio.startup': 'une seconde',
  'games.factorio.ports': 'un en UDP (34197)',
  'games.factorio.extra': 'posséder Factorio sur votre compte Steam',
  'games.factorio.disclaimer': 'Outil non officiel. Non affilié à Wube Software ni à Factorio.',
  'games.factorio.joinHint': 'Dans Factorio : Multijoueur → Se connecter à une adresse.',
  'games.factorio.join1': 'Ouvrez Factorio et allez dans « Multijoueur » depuis le menu principal.',
  'games.factorio.join2': 'Cliquez sur « Se connecter à une adresse » et collez-y l’adresse, port compris.',
  'games.factorio.join3': 'Saisissez le mot de passe du serveur quand il est demandé.',
  'games.factorio.join4': 'Vous devez tous avoir la même version du jeu et les mêmes mods que le serveur.',
  'games.factorio.joinWarning':
    'Si vous oubliez le mot de passe, Factorio coupe la connexion sans dire pourquoi (le serveur note « PasswordMissing »). Et si votre jeu n’est pas à la même version que le serveur, il ne vous laissera pas entrer : vérifiez la version dans la fiche du serveur.',
  'games.factorio.backupScope':
    'Les sauvegardes de partie, les mods et les listes de modération sont sauvegardés. Le jeu n’est pas nécessaire : il est retéléchargé depuis Steam.',
  'games.factorio.moderationHint':
    'Dans Factorio, on modère par nom de compte Factorio, celui qui apparaît dans le chat. Bannir quelqu’un l’expulse immédiatement.',

  'games.zomboid.tagline': 'Survivre à l’épidémie zombie le plus longtemps possible.',
  'games.zomboid.download': '6,7 Go',
  'games.zomboid.highlight1': 'Modération et commandes comme dans Minecraft',
  'games.zomboid.highlight2': 'Des centaines de règles de partie',
  'games.zomboid.highlight3': 'Met plus d’une minute à démarrer',
  'games.zomboid.startup': 'environ 40 secondes (une minute et demie la première fois)',
  'games.zomboid.ports': 'un en UDP (16261), deux avec Steam activé',
  'games.zomboid.disclaimer':
    'Outil non officiel. Non affilié à The Indie Stone ni à Project Zomboid.',
  'games.zomboid.joinHint': 'Dans Project Zomboid : Rejoindre → Favoris → Ajouter un serveur, avec cette adresse.',
  'games.zomboid.join1': 'Ouvrez Project Zomboid et allez dans « Rejoindre » depuis le menu principal.',
  'games.zomboid.join2': 'Allez dans l’onglet « Favoris » et cliquez sur « Ajouter un serveur » avec cette adresse et son port.',
  'games.zomboid.join3':
    'Saisissez le nom d’utilisateur et le mot de passe de votre choix : la première fois, le compte est créé automatiquement.',
  'games.zomboid.join4':
    'Si le serveur a un mot de passe, il va dans le champ « Mot de passe du serveur », distinct de celui de votre compte.',
  'games.zomboid.joinWarning':
    'Votre nom d’utilisateur et votre mot de passe appartiennent à ce serveur, pas à Steam : vous les inventez la première fois et ils vous ramènent au même personnage. Si vous vous trompez en les saisissant, le serveur indique que le mot de passe n’est pas valide au lieu de créer un autre compte.',
  'games.zomboid.backupScope':
    'La partie, les réglages et la base de comptes (qui est admin et qui est banni) sont sauvegardés. Le jeu n’est pas nécessaire : il est retéléchargé depuis Steam.',
  'games.zomboid.moderationHint':
    'Dans Zomboid, on modère par nom de compte du serveur, pas par Steam. Les commandes passent par la console distante, donc le serveur doit être démarré : arrêté, on voit qui est qui, mais on ne peut rien changer.',

  'games.enshrouded.tagline': 'Survivre, construire et explorer un monde englouti par la brume.',
  'games.enshrouded.download': '8,8 Go',
  'games.enshrouded.highlight1': 'Démarre en 3 secondes',
  'games.enshrouded.highlight2': 'Permissions par mot de passe',
  'games.enshrouded.startup': 'entre 2 et 4 secondes',
  'games.enshrouded.ports': 'un en UDP (15637)',
  'games.enshrouded.extra': 'toujours visible dans la liste publique du jeu',
  'games.enshrouded.disclaimer': 'Outil non officiel. Non affilié à Keen Games ni à Enshrouded.',
  'games.enshrouded.joinHint': 'Dans Enshrouded : Jouer → Serveurs → Ajouter un serveur, avec cette adresse.',
  'games.enshrouded.join1': 'Ouvrez Enshrouded et allez dans « Serveurs » depuis le menu Jouer.',
  'games.enshrouded.join2': 'Cliquez sur « Ajouter un serveur » et collez-y l’adresse, port compris.',
  'games.enshrouded.join3':
    'Saisissez le mot de passe du rôle qu’on vous a donné : c’est le mot de passe qui décide de ce que vous pouvez faire.',
  'games.enshrouded.join4':
    'Le serveur reste dans vos favoris, où il apparaît même si la liste publique tarde à se mettre à jour.',
  'games.enshrouded.joinWarning':
    'Dans Enshrouded, il n’y a pas un mot de passe de serveur mais un par rôle. Avec celui d’Administrateur, vous pouvez expulser et bannir ; avec celui d’Invité, vous ne pouvez même pas ouvrir les coffres. Si on vous donne le mauvais, vous entrerez quand même, mais avec d’autres permissions.',
  'games.enshrouded.backupScope':
    'Les mondes et la configuration, avec les rôles et les bannis, sont sauvegardés. Le jeu n’est pas nécessaire : il est retéléchargé depuis Steam. Serveur en marche, la sauvegarde est faite juste après l’un de ses enregistrements, qui ont lieu toutes les cinq minutes.',
  'games.enshrouded.moderationHint':
    'Enshrouded ne permet pas d’expulser qui que ce soit depuis l’extérieur du jeu : son propre serveur indique que l’expulsion sur un serveur dédié « n’est pas implémentée ». On peut en revanche lever un bannissement d’ici, et bannir depuis le jeu avec le mot de passe Administrateur (onglet Social).',

  'games.rust.tagline': 'Survivre, bâtir une base et la défendre. Chaque mois, une nouvelle carte.',
  'games.rust.players': 'Jusqu’à {n} sur un PC domestique',
  'games.rust.download': '5,5 Go',
  'games.rust.highlight1': 'Modération à chaud',
  'games.rust.highlight2': 'Plugins avec Oxide',
  'games.rust.highlight3': 'Nouvelle carte chaque mois',
  'games.rust.startup': 'de 2 à 5 minutes la première fois (génération de la carte), environ 13 s ensuite',
  'games.rust.ports': 'deux en UDP (28015 et 28017), plus un en TCP avec Rust+',
  'games.rust.extra': 'toujours visible dans la liste publique ; nouvelle carte chaque mois',
  'games.rust.disclaimer': 'Outil non officiel. Non affilié à Facepunch Studios ni à Rust.',
  'games.rust.joinHint': 'Dans Rust : appuyez sur F1 et tapez « client.connect » suivi de cette adresse.',
  'games.rust.join1': 'Ouvrez Rust et attendez d’être dans le menu principal.',
  'games.rust.join2': 'Appuyez sur F1 pour ouvrir la console du jeu.',
  'games.rust.join3':
    'Tapez « client.connect » puis l’adresse avec son port, par exemple : client.connect 192.168.1.20:28015',
  'games.rust.join4':
    'Appuyez sur Entrée. Ensuite, le serveur apparaît dans « Historique » de la liste des serveurs, pour la prochaine fois.',
  'games.rust.joinWarning':
    'Si le serveur vient de changer de mois et n’a pas été mis à jour, Rust ne vous laisse pas entrer : il indique que la version ne correspond pas. Cela arrive le premier jeudi de chaque mois ; voir Configuration → Wipe.',
  'games.rust.backupScope':
    'La carte avec toutes les constructions, les joueurs, les admins et les bannis, ainsi que les plugins et leur configuration sont sauvegardés. Le jeu n’est pas nécessaire : il est retéléchargé depuis Steam.',
  'games.rust.moderationHint':
    'Dans Rust, on modère par identifiant Steam, même si la liste affiche le nom. Expulsions et bannissements sont immédiats ; les admins et les bannis sont dans Configuration → Modération.'
}
