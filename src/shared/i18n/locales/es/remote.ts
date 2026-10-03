/**
 * Control remoto por órdenes (§19.31): la sección de Configuración, la bandeja
 * del sistema y la página que se abre desde el móvil u otro PC.
 */
export const remote = {
  'remote.tray.tooltip': 'QubiQ: acceso remoto activado',
  'remote.tray.open': 'Abrir QubiQ',
  'remote.tray.quit': 'Salir',
  'remote.tray.hiddenTitle': 'QubiQ sigue abierto',
  'remote.tray.hiddenText':
    'El acceso remoto está activado, así que QubiQ se queda en la bandeja para seguir recibiendo órdenes. Para cerrarlo del todo, usa «Salir» en su icono.',

  'remote.title': 'Acceso remoto',
  'remote.hint':
    'Maneja tus servidores desde el móvil u otro PC: arrancar, parar, reiniciar y ver la consola. Solo eso: desde fuera nadie puede tocar la configuración, los ficheros ni el resto del equipo.',
  'remote.enable': 'Activar el acceso remoto',
  'remote.disable': 'Desactivar',
  'remote.state.off': 'Desactivado.',
  'remote.state.starting': 'Preparando el certificado y abriendo el puerto…',
  'remote.state.listening': 'Activado. Escuchando en el puerto {port}.',
  'remote.state.portInUse': 'El puerto {port} lo está usando otro programa. Elige otro.',
  'remote.state.certFailed': 'No se pudo crear el certificado de seguridad.',
  'remote.state.failed': 'No se pudo abrir el acceso remoto.',
  'remote.port.label': 'Puerto',
  'remote.port.help':
    'Es el que tendrás que abrir en el router (TCP) para entrar desde fuera de casa.',
  'remote.port.save': 'Cambiar',
  'remote.port.invalid': 'Tiene que ser un número entre 1024 y 65535.',
  'remote.address.title': 'Dirección para entrar',
  'remote.address.home': 'Desde tu casa',
  'remote.address.outside':
    'Desde fuera: https://<tu IP pública>:{port}, con el puerto {port} (TCP) abierto en el router. Si no puedes abrirlo, Tailscale también sirve.',
  'remote.fingerprint.label': 'Huella del certificado',
  'remote.fingerprint.help':
    'La primera vez, el navegador avisará de que el certificado no es de confianza: es normal, lo ha creado este equipo. Si quieres asegurarte, compara esta huella con la que enseña el navegador en los detalles del certificado.',
  'remote.trayNote':
    'Mientras esté activado, cerrar la ventana no cierra QubiQ: se queda en la bandeja del sistema para seguir recibiendo órdenes.',
  'remote.firewallNote':
    'Windows puede preguntar si dejas a QubiQ usar la red. Di que sí, o no llegará ninguna conexión.',

  'remote.invite.title': 'Añadir un dispositivo',
  'remote.invite.hint':
    'Elige qué podrá hacer y genera un código. Después abre la dirección en el dispositivo y escribe el código: vale una sola vez y durante 10 minutos.',
  'remote.invite.needOn': 'Activa el acceso remoto para poder añadir dispositivos.',
  'remote.invite.create': 'Generar código',
  'remote.invite.code': 'Código de emparejamiento',
  'remote.invite.expiresIn': 'Caduca en {time}',
  'remote.invite.cancel': 'Anular el código',
  'remote.perm.control': 'Arrancar, parar y reiniciar',
  'remote.perm.console': 'Consola',
  'remote.console.1': 'Solo ver',
  'remote.console.2': 'Comandos básicos',
  'remote.console.3': 'Libre',
  'remote.console.1.help': 'Ve la consola, pero no puede escribir en ella.',
  'remote.console.2.help':
    'Puede hablar, ver quién está, expulsar y guardar. Nada que dé permisos ni cambie el mundo.',
  'remote.console.3.help':
    'Como si estuviera delante de la app: cualquier comando, también los que dan poderes de administrador en el juego o cambian el mundo. Dalo solo a quien confíes del todo.',

  'remote.devices.title': 'Dispositivos emparejados',
  'remote.devices.none': 'Todavía no hay ninguno.',
  'remote.devices.lastSeen': 'Última vez: {date}, desde {address}',
  'remote.devices.paired': 'Emparejado el {date}',
  'remote.devices.revoke': 'Quitar',
  'remote.devices.revokeConfirm': '¿Quitar {name}? Tendrá que volver a emparejarse para entrar.',

  'remote.activity.title': 'Actividad reciente',
  'remote.activity.none': 'Sin actividad todavía.',
  'remote.activity.unknownDevice': 'Desconocido',
  'remote.order.pair': 'Emparejar',
  'remote.order.list': 'Ver servidores',
  'remote.order.start': 'Arrancar',
  'remote.order.stop': 'Parar',
  'remote.order.restart': 'Reiniciar',
  'remote.order.console': 'Ver consola',
  'remote.order.journal': 'Ver historial',
  'remote.order.send': 'Comando',
  'remote.result.ok': 'Hecho',

  'remote.error.bad-request': 'Petición no válida.',
  'remote.error.unknown-client': 'Este dispositivo no está emparejado, o lo han quitado.',
  'remote.error.bad-signature': 'La firma no es válida.',
  'remote.error.expired': 'La hora del dispositivo no coincide con la del equipo.',
  'remote.error.replayed': 'Orden repetida.',
  'remote.error.forbidden': 'Este dispositivo no tiene permiso para eso.',
  'remote.error.unknown-server': 'Ese servidor no existe.',
  'remote.error.rate-limited': 'Demasiadas órdenes seguidas. Espera un poco.',
  'remote.error.blocked':
    'Demasiados intentos fallidos desde esta dirección. Prueba dentro de 15 minutos.',
  'remote.error.not-running': 'El servidor no está arrancado.',
  'remote.error.already-running': 'El servidor ya está arrancado.',
  'remote.error.busy': 'El servidor está ocupado: instalándose o cerrándose.',
  'remote.error.no-console': 'Este juego no tiene consola de comandos.',
  'remote.error.command-not-allowed': 'Este dispositivo no puede usar ese comando.',
  'remote.error.bad-code': 'El código no es correcto o ha caducado.',
  'remote.error.failed': 'No se pudo hacer.',

  'remote.web.title': 'QubiQ remoto',
  'remote.web.unsupported':
    'Este navegador no puede crear claves seguras. Usa una versión reciente de Chrome, Edge, Firefox o Safari, y entra por https.',
  'remote.web.storageFailed':
    'El navegador no deja guardar la clave de este dispositivo (¿modo privado?). Sin ella no se puede emparejar.',
  'remote.web.pair.title': 'Emparejar este dispositivo',
  'remote.web.pair.hint':
    'En el equipo con QubiQ, ve a Configuración de la app → Acceso remoto y genera un código.',
  'remote.web.pair.code': 'Código',
  'remote.web.pair.name': 'Nombre de este dispositivo',
  'remote.web.pair.namePlaceholder': 'Mi móvil',
  'remote.web.pair.submit': 'Emparejar',
  'remote.web.pair.working': 'Emparejando…',
  'remote.web.connectedTo': '{host} · {device}',
  'remote.web.offline': 'No se puede contactar con el equipo. Reintentando…',
  'remote.web.noServers': 'Este dispositivo no tiene acceso a ningún servidor. Pídelo en el equipo con QubiQ.',
  'remote.web.players': { one: '{count} jugador', other: '{count} jugadores' },
  'remote.web.console': 'Consola',
  'remote.web.back': 'Volver',
  'remote.web.confirm': 'Sí, hazlo',
  'remote.web.confirmStop':
    '¿Parar {name}? Se guarda la partida y quien esté jugando se desconecta.',
  'remote.web.confirmRestart':
    '¿Reiniciar {name}? Quien esté jugando se desconectará un momento.',
  'remote.web.sent': 'Orden enviada.',
  'remote.web.noControl': 'Este dispositivo solo puede mirar.',
  'remote.web.consoleEmpty':
    'La consola está vacía. Las líneas aparecen cuando el servidor está en marcha.',
  'remote.web.consoleReadOnly':
    'Solo lectura: este dispositivo puede ver la consola, pero no escribir en ella.',
  'remote.web.consoleAllowed': 'Comandos permitidos: {commands}',
  'remote.web.noCommands': 'Este juego no acepta comandos desde la consola.',
  'remote.web.commandPlaceholder': 'Escribe un comando…',
  'remote.web.send': 'Enviar',
  'remote.web.forget': 'Olvidar este dispositivo',
  'remote.web.forgetConfirm':
    '¿Olvidar este dispositivo? Para volver a entrar habrá que emparejarlo con un código nuevo.',
  'remote.web.revoked': 'El equipo ya no reconoce este dispositivo. Vuelve a emparejarlo.',

  'remote.perm.servers': 'Servidores',
  'remote.perm.serversHelp': 'Solo verá y manejará los que marques. Los servidores que crees después no se añaden solos.',
  'remote.perm.noServersYet': 'Todavía no hay servidores.',
  'remote.invite.needServer': 'Marca al menos un servidor.',
  'remote.devices.noServers': 'No tiene ningún servidor marcado: no verá nada.',
  'remote.web.playersTitle': 'Jugadores',
  'remote.web.playersStopped': 'El servidor no está en marcha.',
  'remote.web.playersNone': 'No hay nadie conectado.',
  'remote.web.playersIds': 'Este juego da identificadores de Steam, no nombres.',
  'remote.web.playersCountOnly': 'Este juego dice cuántos hay, pero no quiénes.'
}
