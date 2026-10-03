/**
 * QubiQ como cliente de otro QubiQ (0.13.0): conectar, la lista lateral con
 * sus servidores, la pantalla de la conexión y la de un servidor remoto.
 */
export const links = {
  'remote.order.forget': 'Quitarse',

  'link.add.button': 'Conectar con otro QubiQ',
  'link.add.title': 'Conectar con otro QubiQ',
  'link.add.intro':
    'Maneja desde aquí los servidores de otro equipo con QubiQ, con lo mismo que permite la página remota del móvil: arrancar, parar, reiniciar, ver la consola, los jugadores y el historial. Nada de su configuración ni de sus ficheros.',
  'link.add.before':
    'En el otro equipo, ve a Configuración de la app → Acceso remoto: actívalo, marca los servidores que quieras manejar desde aquí y genera un código.',
  'link.add.address': 'Dirección del otro equipo',
  'link.add.addressHelp':
    'La que enseña allí en «Dirección para entrar», por ejemplo 192.168.1.20:8443. Desde fuera de su casa, su IP pública con el puerto abierto, o su dirección de Tailscale.',
  'link.add.search': 'Buscar',
  'link.add.searching': 'Buscando…',
  'link.add.found': 'Hay un QubiQ en {address}.',
  'link.add.fingerprintTitle': 'Comprueba la huella',
  'link.add.fingerprintHelp':
    'Es la «Huella del certificado» que enseña el otro equipo en Configuración de la app → Acceso remoto. Compárala entera: si no coincide, alguien podría estar en medio y no debes seguir.',
  'link.add.fingerprintMatch': 'Coinciden: es ese equipo',
  'link.add.code': 'Código de emparejamiento',
  'link.add.name': 'Nombre de este equipo allí',
  'link.add.nameHelp': 'Así aparecerá en su lista de dispositivos.',
  'link.add.defaultName': 'QubiQ de {pc}',
  'link.add.submit': 'Emparejar',
  'link.add.working': 'Emparejando…',
  'link.add.back': 'Cambiar la dirección',
  'link.add.noSecureStorage':
    'Windows no deja cifrar la clave de este equipo, así que no se puede emparejar: quedaría guardada a la vista.',

  'link.group': 'En {host}',
  'link.state.connecting': 'Conectando…',
  'link.state.online': 'Conectado',
  'link.state.offline': 'Sin conexión',
  'link.state.revoked': 'Ya no tiene acceso',
  'link.state.cert-changed': 'La huella ha cambiado',
  'link.state.key-lost': 'Clave inservible',
  'link.statusUnknown': 'Estado desconocido',
  'link.noServers': 'Sin servidores: márcalos allí, en Acceso remoto.',
  'link.retry': 'Reintentar',
  'link.lastContact': 'Última respuesta: {date}.',
  'link.offline.text':
    'No se puede contactar con {host}. Sus servidores pueden seguir en marcha: lo que ves es lo último que se supo.',
  'link.revoked.text':
    '{host} ya no reconoce a este equipo: lo han quitado de su lista. Quita la conexión y vuelve a emparejar con un código nuevo.',
  'link.keyLost.text':
    'La clave de esta conexión no sirve en este equipo o con este usuario de Windows (¿se han copiado los datos de otro PC?). Quita la conexión y vuelve a emparejar.',
  'link.certChanged.text':
    '{host} enseña un certificado distinto del que se comprobó al emparejar. Pasa si allí se ha renovado o vuelto a crear, pero también si alguien se ha puesto en medio. Hasta que lo confirmes no se le manda nada.',
  'link.certChanged.old': 'Huella fijada',
  'link.certChanged.new': 'Huella que enseña ahora',
  'link.certChanged.check': 'Compárala con la que enseña el otro equipo en Configuración de la app → Acceso remoto.',
  'link.certChanged.load': 'Ver la huella nueva',
  'link.certChanged.trust': 'Coinciden: confiar en la nueva',

  'link.panel.details': 'Conexión',
  'link.panel.address': 'Dirección',
  'link.panel.device': 'Este equipo allí',
  'link.panel.fingerprint': 'Huella fijada',
  'link.panel.paired': 'Emparejado',
  'link.panel.permissions': 'Lo que puede hacer este equipo',
  'link.panel.permissionsHelp': 'Lo decide el dueño del otro equipo, en su Acceso remoto.',
  'link.panel.controlYes': 'Arrancar, parar y reiniciar: sí',
  'link.panel.controlNo': 'Arrancar, parar y reiniciar: no, solo mirar',
  'link.panel.console': 'Consola: {level}',
  'link.panel.servers': 'Servidores',
  'link.remove.title': 'Quitar la conexión',
  'link.remove.hint':
    'Se borra la clave de este equipo y se le pide al otro que lo olvide. Para volver a conectar hará falta un código nuevo.',
  'link.remove.button': 'Quitar la conexión',
  'link.remove.confirm': '¿Quitar la conexión con {host}?',
  'link.remove.working': 'Quitando…',
  'link.remove.done': 'Conexión con {host} quitada.',
  'link.remove.notNotified':
    'Conexión con {host} quitada aquí, pero no ha contestado: allí sigue «{device}» en la lista de dispositivos. Quítalo en su Acceso remoto.',

  'link.server.on': 'en {host}',
  'link.server.noControl':
    'Este equipo solo puede mirar: el dueño de {host} no le ha dado permiso para arrancar ni parar.',
  'link.server.gone':
    'Este servidor ya no está en la lista de {host}: lo han borrado o le han quitado el permiso a este equipo.',

  'link.error.offline':
    'No se puede contactar con ese equipo. Comprueba la dirección, que tenga el acceso remoto activado y, desde fuera de su casa, que el puerto esté abierto.',
  'link.error.cert-changed': 'El certificado del otro equipo no es el que se comprobó.',
  'link.error.key-lost': 'La clave de esta conexión no sirve en este equipo.',
  'link.error.bad-address':
    'Esa dirección no vale. Escribe la IP o el nombre del equipo, y el puerto si no es el 8443.',
  'link.error.not-qubiq': 'Lo que contesta en esa dirección no es el acceso remoto de QubiQ.',
  'link.error.no-secure-storage': 'Windows no deja cifrar la clave de este equipo.',
  'link.error.unknown-link': 'Esa conexión ya no existe.'
}
