import type { shell as source } from '../es/shell'
import type { Translation } from '../../types'

export const shell: Translation<typeof source> = {
  'common.cancel': 'Annuler',
  'common.quoted': '« {text} »',

  'main.quit.title': 'Des serveurs sont lancés',
  'main.quit.message': 'Vous avez des serveurs en cours d’exécution.',
  'main.quit.detail':
    'Ils seront arrêtés proprement pour ne pas endommager le monde. Cela peut prendre quelques secondes, le temps qu’ils sauvegardent la partie.',
  'main.quit.confirm': 'Arrêter les serveurs et quitter',
  'main.quit.cancel': 'Annuler',
  'main.missing.title': 'Dossier de données introuvable',
  'main.missing.message': 'Le dossier de données de QubiQ est introuvable : {path}',
  'main.missing.detail':
    'Il se trouve peut-être sur un disque qui n’est pas branché en ce moment. Branchez-le et cliquez sur « Réessayer ». Si vous choisissez le dossier par défaut ({defaultPath}), l’application démarrera sans vos serveurs ; le contenu de l’autre dossier n’est pas touché.',
  'main.missing.retry': 'Réessayer',
  'main.missing.useDefault': 'Utiliser le dossier par défaut',
  'main.missing.quit': 'Quitter',

  'app.noServersYet': 'Vous n’avez encore aucun serveur.',
  'app.createServer': '+ Créer un serveur',
  'app.mode': 'Mode',
  'app.modeHint.basic': 'L’essentiel pour jouer. On s’occupe de la partie technique.',
  'app.modeHint.advanced': 'Le même écran, avec tous les réglages débloqués.',
  'app.settings': 'Paramètres de l’application',
  'app.loadError': 'Impossible de charger les serveurs',
  'app.create.title': 'Créer un nouveau serveur',
  'app.create.titleGame': 'Créer un nouveau serveur {game}',
  'app.create.modeBasic': 'Mode simple',
  'app.create.modeAdvanced': 'Mode avancé',
  'app.create.changeMode': 'Changer de mode',
  'app.empty.title': 'Vous n’avez pas encore de serveur',
  'app.empty.text': 'Créez le premier et vous jouerez dans quelques minutes.',
  'app.empty.button': 'Créer mon premier serveur',

  'mode.basic': 'Simple',
  'mode.advanced': 'Avancé',
  'mode.basic.tagline': 'On vous guide pas à pas',
  'mode.basic.point1':
    'Une question par écran : le nom, combien vous êtes, ce que demande le jeu et comment vous vous connectez',
  'mode.basic.point2': 'On s’occupe de la technique : version, mémoire et port',
  'mode.basic.point3': 'Ensuite, un seul bouton pour allumer et éteindre, vos joueurs et la console',
  'mode.basic.cta': 'Créer en mode simple →',
  'mode.advanced.tagline': 'Vous décidez de tout',
  'mode.advanced.point1': 'Vous choisissez la version exacte, la mémoire et le port',
  'mode.advanced.point2': 'Le même écran, avec toute la configuration débloquée et une fiche technique',
  'mode.advanced.point3': 'Sauvegardes avec intervalle et conservation, graines et tous les réglages du jeu',
  'mode.advanced.cta': 'Créer en mode avancé →',
  'mode.chooser.title': 'Comment voulez-vous le créer ?',
  'mode.chooser.text':
    'Vous pouvez changer de mode quand vous voulez depuis la barre de gauche ou les paramètres de l’application. Cela n’affecte pas le serveur, seulement le nombre de questions qu’on vous pose.',
  'mode.recommended': 'Recommandé',
  'mode.current': 'Votre mode actuel',

  'settings.title': 'Paramètres de l’application',
  'settings.back': 'Retour',
  'settings.language.title': 'Langue',
  'settings.language.hint':
    'Celle de toute l’interface. Les noms des jeux et les termes techniques (RCON, BepInEx…) ne sont pas traduits. Certains messages d’erreur et d’installation s’affichent encore en espagnol.',
  'settings.language.auto': 'Automatique : celle de Windows ({name})',
  'settings.mode.title': 'Mode',
  'settings.mode.hint':
    'Combien de questions pose l’application et combien de réglages elle affiche. Rien ne change sur vos serveurs : vous pouvez passer de l’un à l’autre quand vous voulez.',
  'settings.mode.basicSub':
    'L’essentiel pour jouer. L’application choisit pour vous la version, la mémoire et le port, et vous guide pas à pas pour créer un serveur.',
  'settings.mode.advancedSub':
    'Tout est visible : version exacte, mémoire, port, sauvegardes avec intervalle et conservation, et tous les réglages de chaque jeu.',
  'settings.dataFolder.title': 'Dossier de données',
  'settings.dataFolder.hint':
    'C’est ici que l’application garde vos serveurs, leurs sauvegardes, Java, SteamCMD et les téléchargements. Vous pouvez le déplacer sur un autre disque si celui-ci manque de place.',
  'settings.dataFolder.current': 'Emplacement actuel',
  'settings.dataFolder.isDefault': 'C’est le dossier par défaut.',
  'settings.dataFolder.notDefault': 'Le dossier par défaut est {path}.',
  'settings.dataFolder.open': 'Ouvrir le dossier',
  'settings.dataFolder.change': 'Déplacer…',
  'settings.dataFolder.backToDefault': 'Revenir au dossier par défaut',
  'settings.dataFolder.pickTitle': 'Choisissez où enregistrer les données de QubiQ',
  'settings.dataFolder.checking': 'Vérification du dossier et mesure de la taille de vos données…',
  'settings.dataFolder.checkFailed': 'Impossible de vérifier ce dossier',
  'settings.dataFolder.target': 'Les données iront dans',
  'settings.dataFolder.subfolder':
    'Le dossier choisi contient déjà des éléments, donc un dossier QubiQ est créé pour ne pas les mélanger.',
  'settings.dataFolder.sameDrive': 'Il est sur le même disque : le déplacement est instantané, sans rien copier.',
  'settings.dataFolder.otherDrive': 'Il est sur un autre disque : il faut copier {size}.',
  'settings.dataFolder.problemTitle': 'Impossible de déplacer ici',
  'settings.dataFolder.problem.same': 'Les données sont déjà dans ce dossier.',
  'settings.dataFolder.problem.nested':
    'Le nouveau dossier ne peut pas être dans l’actuel, ni l’actuel dans le nouveau.',
  'settings.dataFolder.problem.spaces':
    'Le chemin contient des espaces. Certains installateurs de serveurs (celui de Forge, par exemple) échouent avec, donc ils ne sont pas autorisés. Choisissez un dossier sans espaces, comme D:\\QubiQ.',
  'settings.dataFolder.problem.network':
    'C’est un dossier réseau. Si le réseau coupe pendant qu’un serveur tourne, la partie peut être abîmée, et SteamCMD n’installe pas dans ces dossiers. Choisissez un dossier sur un disque de cet ordinateur.',
  'settings.dataFolder.problem.occupied':
    'Ce dossier contient déjà des données de QubiQ ({entries}). Elles ne sont pas mélangées avec les vôtres : choisissez un autre dossier ou videz celui-ci.',
  'settings.dataFolder.problem.notWritable':
    'Windows ne permet pas d’y créer des dossiers. Choisissez-en un autre, par exemple dans votre dossier utilisateur ou sur un autre disque.',
  'settings.dataFolder.problem.space':
    'Pas assez de place : il faut {needed} (vos données plus une marge de 1 Go) et il reste {free} sur ce disque.',
  'settings.dataFolder.problem.busy': {
    one: 'Il faut d’abord arrêter le serveur {servers} : tant qu’il tourne ou s’installe, ses fichiers sont ouverts.',
    other:
      'Il faut d’abord arrêter ces serveurs : {servers}. Tant qu’ils tournent ou s’installent, leurs fichiers sont ouverts.'
  },
  'settings.dataFolder.problem.valheimPath': {
    one: 'Le serveur Valheim {servers} a des mods, et à cet endroit ses chemins atteindraient {length} caractères (Windows en accepte {max}). BepInEx ne démarrerait pas et le serveur perdrait ses mods sans prévenir. Choisissez un chemin plus court.',
    other:
      'Les serveurs Valheim {servers} ont des mods, et à cet endroit leurs chemins atteindraient {length} caractères (Windows en accepte {max}). BepInEx ne démarrerait pas et ils perdraient leurs mods sans prévenir. Choisissez un chemin plus court.'
  },
  'settings.dataFolder.problem.links':
    'Les données contiennent un lien vers un autre dossier ({path}). Entre deux disques, on ne peut pas le copier sans emporter ce qu’il y a de l’autre côté. Supprimez-le ou choisissez un dossier sur le même disque.',
  'settings.dataFolder.warning.firewallTitle': 'Le pare-feu Windows redemandera',
  'settings.dataFolder.warning.firewall':
    'Les autorisations du pare-feu dépendent du chemin de chaque programme, et ceux de vos serveurs changent. La première fois que vous lancerez chaque serveur après le déplacement, Windows demandera s’il peut utiliser le réseau : acceptez, sinon vos amis ne pourront pas se connecter.',
  'settings.dataFolder.warning.copyTitle': 'Cela va prendre un moment',
  'settings.dataFolder.warning.copy':
    'Il faut copier {size}. Sur un SSD, comptez environ {minutes} min ; sur un disque dur, nettement plus. Pendant ce temps, l’application est inutilisable. En cas de problème, les données restent où elles sont : le dossier d’origine n’est supprimé qu’une fois la copie terminée et vérifiée.',
  'settings.dataFolder.warning.cloudTitle': 'Ce dossier est synchronisé avec le cloud',
  'settings.dataFolder.warning.cloud':
    'OneDrive et les services similaires envoient tout ce qui change et verrouillent les fichiers pendant ce temps. Avec des serveurs dedans, ce seraient des Go d’envoi et des sauvegardes à moitié écrites. Mieux vaut un dossier non synchronisé.',
  'settings.dataFolder.warning.valheimPathTitle': 'Valheim ne pourra pas avoir de mods',
  'settings.dataFolder.warning.valheimPath': {
    one: 'Dans ce dossier, les chemins du serveur Valheim {servers} atteindraient {length} caractères (Windows en accepte {max}). Il n’a pas de mods pour l’instant et fonctionnera comme avant, mais on ne pourra pas lui en ajouter.',
    other:
      'Dans ce dossier, les chemins des serveurs Valheim {servers} atteindraient {length} caractères (Windows en accepte {max}). Ils n’ont pas de mods pour l’instant et fonctionneront comme avant, mais on ne pourra pas leur en ajouter.'
  },
  'settings.dataFolder.howTitle': 'Comment ça se passe',
  'settings.dataFolder.howText':
    'Quand vous cliquez sur {button}, l’application se ferme et se rouvre toute seule pour déplacer les données avant de lancer quoi que ce soit. Vous verrez la progression ; à la fin, tout reste comme maintenant, mais dans le nouveau dossier.',
  'settings.dataFolder.apply': 'Déplacer et redémarrer',
  'settings.dataFolder.applying': 'Redémarrage…',

  'relocation.movingTitle': 'Déplacement des données de QubiQ',
  'relocation.movingHint':
    'Ne fermez pas l’application et n’éteignez pas l’ordinateur. En cas d’interruption, rien n’est perdu : l’opération reprend à la prochaine ouverture.',
  'relocation.from': 'De',
  'relocation.to': 'Vers',
  'relocation.phase.measuring': 'Mesure de ce qu’il faut déplacer…',
  'relocation.phase.moving': 'Déplacement…',
  'relocation.phase.copying': 'Copie : {copied} sur {total}',
  'relocation.phase.verifying': 'Vérification que la copie est identique…',
  'relocation.phase.cleaning': 'Copie vérifiée. Suppression du dossier d’origine…',
  'relocation.doneTitle': 'Données déplacées',
  'relocation.firewallTitle': 'Encore une chose',
  'relocation.firewall':
    'La première fois que vous lancerez chaque serveur, Windows peut demander s’il peut utiliser le réseau. Acceptez, sinon vos amis ne pourront pas se connecter.',
  'relocation.leftoversTitle': 'Des restes sont restés dans l’ancien dossier',
  'relocation.leftovers':
    'Vos données sont complètes dans le nouveau dossier, mais certains dossiers de {path} n’ont pas pu être supprimés (instances, runtimes, tools ou cache). Vous pouvez les supprimer à la main ; ne supprimez pas le dossier entier, il indique où se trouvent désormais vos données.',
  'relocation.failedTitle': 'Impossible de déplacer les données',
  'relocation.untouched': 'Vos données sont toujours au même endroit, sans changement',
  'relocation.error.locked':
    'Un programme avait ouvert un fichier des données (un antivirus, l’Explorateur Windows ou un serveur lancé en dehors de QubiQ). Fermez-le et réessayez depuis les paramètres.',
  'relocation.error.mismatch':
    'La copie ne correspondait pas à l’original (fichiers manquants ou de taille différente), donc rien n’a été supprimé. Vérifiez que le disque de destination fonctionne bien et réessayez.',
  'relocation.error.links':
    'Les données contiennent un lien vers un autre dossier ({path}) qui ne peut pas être copié entre disques. Supprimez-le ou choisissez un dossier sur le même disque.',
  'relocation.error.missing': 'Le dossier source est introuvable, ou le dossier de destination n’est plus disponible.',
  'relocation.error.other': 'Erreur inattendue : {detail}',
  'relocation.continue': 'Continuer'
}
