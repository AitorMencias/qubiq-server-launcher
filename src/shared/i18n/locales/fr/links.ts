import type { links as source } from '../es/links'
import type { Translation } from '../../types'

export const links: Translation<typeof source> = {
  'remote.order.forget': 'Se retirer',

  'link.add.button': 'Se connecter à un autre QubiQ',
  'link.add.title': 'Se connecter à un autre QubiQ',
  'link.add.intro':
    'Gérez d’ici les serveurs d’un autre ordinateur avec QubiQ, avec ce que permet la page à distance du téléphone : démarrer, arrêter, redémarrer, et voir la console, les joueurs et l’historique. Rien de sa configuration ni de ses fichiers.',
  'link.add.before':
    'Sur l’autre ordinateur, allez dans Paramètres de l’application → Accès à distance : activez-le, cochez les serveurs à gérer d’ici et générez un code.',
  'link.add.address': 'Adresse de l’autre ordinateur',
  'link.add.addressHelp':
    'Celle qu’il affiche dans « Adresse de connexion », par exemple 192.168.1.20:8443. Depuis l’extérieur de chez lui, son IP publique avec le port ouvert, ou son adresse Tailscale.',
  'link.add.search': 'Rechercher',
  'link.add.searching': 'Recherche…',
  'link.add.found': 'Il y a un QubiQ à {address}.',
  'link.add.fingerprintTitle': 'Vérifiez l’empreinte',
  'link.add.fingerprintHelp':
    'C’est l’« Empreinte du certificat » que l’autre ordinateur affiche dans Paramètres de l’application → Accès à distance. Comparez-la en entier : si elle ne correspond pas, quelqu’un pourrait être au milieu et vous ne devez pas continuer.',
  'link.add.fingerprintMatch': 'Elles correspondent : c’est bien cet ordinateur',
  'link.add.code': 'Code d’appairage',
  'link.add.name': 'Nom de cet ordinateur là-bas',
  'link.add.nameHelp': 'C’est ainsi qu’il apparaîtra dans sa liste d’appareils.',
  'link.add.defaultName': 'QubiQ de {pc}',
  'link.add.submit': 'Appairer',
  'link.add.working': 'Appairage…',
  'link.add.back': 'Changer l’adresse',
  'link.add.noSecureStorage':
    'Windows ne permet pas de chiffrer la clé de cet ordinateur, donc l’appairage est impossible : elle serait stockée en clair.',

  'link.group': 'Sur {host}',
  'link.state.connecting': 'Connexion…',
  'link.state.online': 'Connecté',
  'link.state.offline': 'Pas de connexion',
  'link.state.revoked': 'N’a plus accès',
  'link.state.cert-changed': 'L’empreinte a changé',
  'link.state.key-lost': 'Clé inutilisable',
  'link.statusUnknown': 'État inconnu',
  'link.noServers': 'Aucun serveur : cochez-les là-bas, dans Accès à distance.',
  'link.retry': 'Réessayer',
  'link.lastContact': 'Dernière réponse : {date}.',
  'link.offline.text':
    'Impossible de joindre {host}. Ses serveurs tournent peut-être encore : ce que vous voyez est le dernier état connu.',
  'link.revoked.text':
    '{host} ne reconnaît plus cet ordinateur : il a été retiré de sa liste. Retirez la connexion et appairez de nouveau avec un nouveau code.',
  'link.keyLost.text':
    'La clé de cette connexion ne fonctionne pas sur cet ordinateur ou avec cet utilisateur Windows (les données ont-elles été copiées depuis un autre PC ?). Retirez la connexion et appairez de nouveau.',
  'link.certChanged.text':
    '{host} présente un certificat différent de celui vérifié lors de l’appairage. Cela arrive s’il a été renouvelé ou recréé là-bas, mais aussi si quelqu’un s’est placé au milieu. Rien ne lui est envoyé tant que vous n’avez pas confirmé.',
  'link.certChanged.old': 'Empreinte enregistrée',
  'link.certChanged.new': 'Empreinte affichée maintenant',
  'link.certChanged.check': 'Comparez-la avec celle que l’autre ordinateur affiche dans Paramètres de l’application → Accès à distance.',
  'link.certChanged.load': 'Voir la nouvelle empreinte',
  'link.certChanged.trust': 'Elles correspondent : faire confiance à la nouvelle',

  'link.panel.details': 'Connexion',
  'link.panel.address': 'Adresse',
  'link.panel.device': 'Cet ordinateur là-bas',
  'link.panel.fingerprint': 'Empreinte enregistrée',
  'link.panel.paired': 'Appairé',
  'link.panel.permissions': 'Ce que cet ordinateur peut faire',
  'link.panel.permissionsHelp': 'C’est le propriétaire de l’autre ordinateur qui décide, dans son Accès à distance.',
  'link.panel.controlYes': 'Démarrer, arrêter et redémarrer : oui',
  'link.panel.controlNo': 'Démarrer, arrêter et redémarrer : non, seulement regarder',
  'link.panel.console': 'Console : {level}',
  'link.panel.servers': 'Serveurs',
  'link.remove.title': 'Retirer la connexion',
  'link.remove.hint':
    'La clé de cet ordinateur est supprimée et on demande à l’autre de l’oublier. Pour se reconnecter, il faudra un nouveau code.',
  'link.remove.button': 'Retirer la connexion',
  'link.remove.confirm': 'Retirer la connexion avec {host} ?',
  'link.remove.working': 'Retrait…',
  'link.remove.done': 'Connexion avec {host} retirée.',
  'link.remove.notNotified':
    'Connexion avec {host} retirée ici, mais il n’a pas répondu : « {device} » est toujours dans sa liste d’appareils. Retirez-le dans son Accès à distance.',

  'link.server.on': 'sur {host}',
  'link.server.noControl':
    'Cet ordinateur peut seulement regarder : le propriétaire de {host} ne lui a pas permis de démarrer ni d’arrêter.',
  'link.server.gone':
    'Ce serveur n’est plus dans la liste de {host} : il a été supprimé ou cet ordinateur n’y a plus droit.',

  'link.error.offline':
    'Impossible de joindre cet ordinateur. Vérifiez l’adresse, que l’accès à distance y est activé et, depuis l’extérieur de chez lui, que le port est ouvert.',
  'link.error.cert-changed': 'Le certificat de l’autre ordinateur n’est pas celui qui a été vérifié.',
  'link.error.key-lost': 'La clé de cette connexion ne fonctionne pas sur cet ordinateur.',
  'link.error.bad-address':
    'Cette adresse n’est pas valide. Saisissez l’IP ou le nom de l’ordinateur, et le port si ce n’est pas 8443.',
  'link.error.not-qubiq': 'Ce qui répond à cette adresse n’est pas l’accès à distance de QubiQ.',
  'link.error.no-secure-storage': 'Windows ne permet pas de chiffrer la clé de cet ordinateur.',
  'link.error.unknown-link': 'Cette connexion n’existe plus.'
}
