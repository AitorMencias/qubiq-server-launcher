import type { Plural } from '../../types'

/**
 * La estructura de la app: diálogos del proceso principal, barra lateral,
 * elección de modo, configuración de la app y traslado de la carpeta de datos.
 *
 * El español es la referencia: las claves de aquí son las que tienen que
 * existir en los demás idiomas (lo comprueba `npm run typecheck`).
 */
export const shell = {
  'common.cancel': 'Cancelar',
  /** Un nombre citado dentro de una frase, con las comillas de cada idioma. */
  'common.quoted': '«{text}»',

  'main.quit.title': 'Hay servidores arrancados',
  'main.quit.message': 'Tienes servidores en marcha.',
  'main.quit.detail':
    'Se cerrarán correctamente para no dañar el mundo. Puede tardar unos segundos mientras guardan la partida.',
  'main.quit.confirm': 'Cerrar servidores y salir',
  'main.quit.cancel': 'Cancelar',
  'main.missing.title': 'No se encuentra la carpeta de datos',
  'main.missing.message': 'No se encuentra la carpeta de datos de QubiQ: {path}',
  'main.missing.detail':
    'Puede que esté en un disco que ahora no está conectado. Conéctalo y pulsa «Reintentar». Si eliges la carpeta de siempre ({defaultPath}), la app arrancará sin tus servidores; lo que hay en la otra carpeta no se toca.',
  'main.missing.retry': 'Reintentar',
  'main.missing.useDefault': 'Usar la carpeta de siempre',
  'main.missing.quit': 'Salir',

  'app.noServersYet': 'Todavía no tienes ningún servidor.',
  'app.createServer': '+ Crear servidor',
  'app.mode': 'Modo',
  'app.modeHint.basic': 'Lo esencial para jugar. Elegimos por ti lo técnico.',
  'app.modeHint.advanced': 'La misma pantalla, con todos los ajustes desbloqueados.',
  'app.settings': 'Configuración de la app',
  'app.loadError': 'No se pudieron cargar los servidores',
  'app.create.title': 'Crear un servidor nuevo',
  'app.create.titleGame': 'Crear un servidor nuevo de {game}',
  'app.create.modeBasic': 'Modo básico',
  'app.create.modeAdvanced': 'Modo avanzado',
  'app.create.changeMode': 'Cambiar de modo',
  'app.empty.title': 'Aún no tienes servidores',
  'app.empty.text': 'Crea el primero y estarás jugando en unos minutos.',
  'app.empty.button': 'Crear mi primer servidor',

  'mode.basic': 'Básico',
  'mode.advanced': 'Avanzado',
  'mode.basic.tagline': 'Te guiamos paso a paso',
  'mode.basic.point1':
    'Una pregunta por pantalla: el nombre, cuánta gente sois, lo que pida el juego y cómo os conectáis',
  'mode.basic.point2': 'Lo técnico lo ponemos nosotros: versión, memoria y puerto',
  'mode.basic.point3': 'Después, solo un botón para encender y apagar, tus jugadores y la consola',
  'mode.basic.cta': 'Crear en modo básico →',
  'mode.advanced.tagline': 'Tú decides todo',
  'mode.advanced.point1': 'Eliges versión concreta, memoria y puerto',
  'mode.advanced.point2':
    'La misma pantalla, con toda la configuración desbloqueada y ficha técnica',
  'mode.advanced.point3': 'Copias con intervalo y retención, semillas y todos los ajustes del juego',
  'mode.advanced.cta': 'Crear en modo avanzado →',
  'mode.chooser.title': '¿Cómo quieres crearlo?',
  'mode.chooser.text':
    'Puedes cambiar de modo cuando quieras desde la barra de la izquierda o desde la configuración de la app. No afecta al servidor, solo a cuánto te preguntamos.',
  'mode.recommended': 'Recomendado',
  'mode.current': 'Tu modo actual',

  'settings.title': 'Configuración de la app',
  'settings.back': 'Volver',
  'settings.language.title': 'Idioma',
  'settings.language.hint':
    'El de toda la interfaz. Los nombres de los juegos y los términos técnicos (RCON, BepInEx…) no se traducen. Algunos mensajes de error y de instalación todavía salen en español.',
  'settings.language.auto': 'Automático: el de Windows ({name})',
  'settings.mode.title': 'Modo',
  'settings.mode.hint':
    'Cuánto te pregunta la app y cuántos ajustes enseña. No cambia nada de tus servidores: puedes pasar de uno a otro cuando quieras.',
  'settings.mode.basicSub':
    'Lo esencial para jugar. La app elige por ti versión, memoria y puerto, y te guía paso a paso al crear un servidor.',
  'settings.mode.advancedSub':
    'Todo a la vista: versión concreta, memoria, puerto, copias con intervalo y retención, y todos los ajustes de cada juego.',
  'settings.dataFolder.title': 'Carpeta de datos',
  'settings.dataFolder.hint':
    'Aquí guarda la app tus servidores, sus copias de seguridad, Java, SteamCMD y las descargas. Puedes llevarla a otro disco si en este te falta sitio.',
  'settings.dataFolder.current': 'Ubicación actual',
  'settings.dataFolder.isDefault': 'Es la carpeta de siempre.',
  'settings.dataFolder.notDefault': 'La carpeta de siempre es {path}.',
  'settings.dataFolder.open': 'Abrir carpeta',
  'settings.dataFolder.change': 'Cambiar de sitio…',
  'settings.dataFolder.backToDefault': 'Volver a la carpeta de siempre',
  'settings.dataFolder.pickTitle': 'Elige dónde guardar los datos de QubiQ',
  'settings.dataFolder.checking': 'Comprobando la carpeta y midiendo lo que ocupan tus datos…',
  'settings.dataFolder.checkFailed': 'No se pudo comprobar esa carpeta',
  'settings.dataFolder.target': 'Los datos irán a',
  'settings.dataFolder.subfolder':
    'La carpeta que elegiste ya tiene cosas dentro, así que se crea una carpeta QubiQ para no mezclarlas.',
  'settings.dataFolder.sameDrive': 'Está en el mismo disco: se mueve al instante, sin copiar nada.',
  'settings.dataFolder.otherDrive': 'Está en otro disco: hay que copiar {size}.',
  'settings.dataFolder.problemTitle': 'No se puede mover ahí',
  'settings.dataFolder.problem.same': 'Los datos ya están en esa carpeta.',
  'settings.dataFolder.problem.nested':
    'La carpeta nueva no puede estar dentro de la actual, ni la actual dentro de la nueva.',
  'settings.dataFolder.problem.spaces':
    'La ruta tiene espacios. Algunos instaladores de servidores (el de Forge, por ejemplo) fallan con ellos, así que no se permiten. Elige una carpeta sin espacios, como D:\\QubiQ.',
  'settings.dataFolder.problem.network':
    'Es una carpeta de red. Si la red se corta con un servidor encendido se puede estropear la partida, y SteamCMD no instala en ellas. Elige una carpeta de un disco de este equipo.',
  'settings.dataFolder.problem.occupied':
    'En esa carpeta ya hay datos de QubiQ ({entries}). No se mezclan con los tuyos: elige otra carpeta o vacía esa.',
  'settings.dataFolder.problem.notWritable':
    'Windows no deja crear carpetas ahí. Elige otra, por ejemplo dentro de tu carpeta de usuario o en otro disco.',
  'settings.dataFolder.problem.space':
    'No hay sitio: hacen falta {needed} (tus datos y un margen de 1 GB) y en ese disco quedan {free}.',
  'settings.dataFolder.problem.busy': {
    one: 'Hay que parar primero el servidor {servers}: mientras está encendido o instalándose tiene sus ficheros abiertos.',
    other:
      'Hay que parar primero estos servidores: {servers}. Mientras están encendidos o instalándose tienen sus ficheros abiertos.'
  },
  'settings.dataFolder.problem.valheimPath': {
    one: 'El servidor de Valheim {servers} tiene mods, y ahí sus rutas llegarían a {length} caracteres (Windows admite {max}). BepInEx no arrancaría y el servidor se quedaría sin mods sin avisar. Elige una ruta más corta.',
    other:
      'Los servidores de Valheim {servers} tienen mods, y ahí sus rutas llegarían a {length} caracteres (Windows admite {max}). BepInEx no arrancaría y se quedarían sin mods sin avisar. Elige una ruta más corta.'
  },
  'settings.dataFolder.problem.links':
    'Dentro de los datos hay un enlace a otra carpeta ({path}). Entre discos no se puede copiar sin arrastrar lo que hay al otro lado. Quítalo o elige una carpeta en el mismo disco.',
  'settings.dataFolder.warning.firewallTitle': 'El cortafuegos de Windows volverá a preguntar',
  'settings.dataFolder.warning.firewall':
    'Los permisos del cortafuegos van por la ruta de cada programa, y los de tus servidores cambian de sitio. La primera vez que arranques cada servidor después de moverla, Windows preguntará si le dejas usar la red: acepta, o tus amigos no podrán entrar.',
  'settings.dataFolder.warning.copyTitle': 'Va a tardar un rato',
  'settings.dataFolder.warning.copy':
    'Hay que copiar {size}. En un SSD calcula unos {minutes} min; en un disco duro, bastante más. Mientras tanto la app no se puede usar. Si algo falla, los datos se quedan donde están: la carpeta original solo se borra cuando la copia está completa y comprobada.',
  'settings.dataFolder.warning.cloudTitle': 'Es una carpeta que se sincroniza con la nube',
  'settings.dataFolder.warning.cloud':
    'OneDrive y servicios parecidos suben todo lo que cambia y bloquean los ficheros mientras lo hacen. Con servidores dentro serían GB de subida y partidas a medio escribir. Mejor una carpeta que no se sincronice.',
  'settings.dataFolder.warning.valheimPathTitle': 'Valheim no podrá llevar mods',
  'settings.dataFolder.warning.valheimPath': {
    one: 'En esa carpeta, las rutas del servidor de Valheim {servers} llegarían a {length} caracteres (Windows admite {max}). Ahora no tiene mods y seguirá funcionando igual, pero no se le podrán poner.',
    other:
      'En esa carpeta, las rutas de los servidores de Valheim {servers} llegarían a {length} caracteres (Windows admite {max}). Ahora no tienen mods y seguirán funcionando igual, pero no se les podrán poner.'
  },
  'settings.dataFolder.howTitle': 'Cómo se hace',
  'settings.dataFolder.howText':
    'Al pulsar {button}, la app se cierra y se vuelve a abrir sola para mover los datos antes de arrancar nada. Verás el progreso; al terminar, todo sigue igual que ahora, pero en la carpeta nueva.',
  'settings.dataFolder.apply': 'Mover y reiniciar',
  'settings.dataFolder.applying': 'Reiniciando…',

  'relocation.movingTitle': 'Moviendo los datos de QubiQ',
  'relocation.movingHint':
    'No cierres la app ni apagues el equipo. Si se corta, no se pierde nada: se retoma al volver a abrirla.',
  'relocation.from': 'Desde',
  'relocation.to': 'A',
  'relocation.phase.measuring': 'Midiendo lo que hay que mover…',
  'relocation.phase.moving': 'Moviendo…',
  'relocation.phase.copying': 'Copiando: {copied} de {total}',
  'relocation.phase.verifying': 'Comprobando que la copia es idéntica…',
  'relocation.phase.cleaning': 'Copia comprobada. Borrando la carpeta original…',
  'relocation.doneTitle': 'Datos movidos',
  'relocation.firewallTitle': 'Una cosa más',
  'relocation.firewall':
    'La primera vez que arranques cada servidor, Windows puede preguntar si le dejas usar la red. Acepta, o tus amigos no podrán entrar.',
  'relocation.leftoversTitle': 'Han quedado restos en la carpeta anterior',
  'relocation.leftovers':
    'Tus datos ya están enteros en la carpeta nueva, pero no se pudieron borrar algunas carpetas de {path} (instances, runtimes, tools o cache). Puedes borrar esas carpetas a mano; no borres la carpeta entera, que guarda dónde están ahora tus datos.',
  'relocation.failedTitle': 'No se han podido mover los datos',
  'relocation.untouched': 'Tus datos siguen donde estaban, sin cambios',
  'relocation.error.locked':
    'Algún programa tenía abierto un fichero de los datos (un antivirus, el explorador de Windows o un servidor abierto fuera de QubiQ). Ciérralo y vuelve a intentarlo desde la configuración.',
  'relocation.error.mismatch':
    'La copia no salió igual que el original (faltaban ficheros o no ocupaban lo mismo), así que no se ha borrado nada. Comprueba que el disco de destino funciona bien y vuelve a intentarlo.',
  'relocation.error.links':
    'Dentro de los datos hay un enlace a otra carpeta ({path}) y no se puede copiar entre discos. Quítalo o elige una carpeta en el mismo disco.',
  'relocation.error.missing':
    'No se encontró la carpeta de origen, o la de destino dejó de estar disponible.',
  'relocation.error.other': 'Error inesperado: {detail}',
  'relocation.continue': 'Continuar'
} as const satisfies Record<string, string | Plural>
