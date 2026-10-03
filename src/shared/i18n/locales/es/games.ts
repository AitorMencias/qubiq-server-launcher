import type { Plural } from '../../types'

/** El catálogo de juegos (`shared/games/index.ts`): tarjetas, condiciones, cómo entrar y puertos. */
export const games = {
  'games.subtitle': 'Servidores de juegos, sin complicaciones',
  'games.subtitleOne': 'Servidores de {game}, sin complicaciones',
  'games.disclaimerAll':
    'QubiQ no es un producto oficial de ninguno de los juegos que gestiona ni está asociado a sus estudios.',
  'games.agreement.minecraft': 'el EULA de Minecraft',
  'games.agreement.steam': 'el Acuerdo de Suscriptor de Steam',
  'games.tunnelExampleHost': 'algo',
  'games.upTo': 'Hasta {n}',
  'games.upToComfortably': 'Hasta {n} cómodamente',
  'games.alwaysPublic': 'Sale siempre en la lista pública',

  'games.port.game': 'Juego',
  'games.port.messaging': 'Mensajería del juego',
  'games.port.playerData': 'Datos de jugador',
  'games.port.steamQuery': 'Consulta de Steam',
  'games.port.rustPlus': 'Rust+ (app del móvil)',
  'games.port.tcpUdp': 'TCP y UDP',
  'games.port.udpTcp': 'UDP y TCP',
  'games.summary.custom': 'a medida',
  'games.summary.rustMap': 'mapa: {size}',

  'games.minecraft.tagline': 'Construir y sobrevivir. El de siempre, con plugins o mods.',
  'games.minecraft.players': 'Hasta ~20',
  'games.minecraft.download': '≈ 1 GB',
  'games.minecraft.highlight1': 'Plugins y mods',
  'games.minecraft.startup': 'depende de los mods: de segundos a un par de minutos',
  'games.minecraft.ports': 'uno TCP (25565)',
  'games.minecraft.extra': 'Java: lo baja la app sola',
  'games.minecraft.joinHint': 'En Minecraft: Multijugador → Añadir servidor.',
  'games.minecraft.backupScope':
    'Se guarda el mundo y la configuración. Los jars no hacen falta: se pueden volver a descargar.',

  'games.satisfactory.tagline': 'Fábricas enormes montadas en equipo.',
  'games.satisfactory.players': 'Hasta 4 (ampliable)',
  'games.satisfactory.download': '15,5 GB',
  'games.satisfactory.highlight1': 'Se configura sin abrir el juego',
  'games.satisfactory.highlight2': 'Solo uno a la vez',
  'games.satisfactory.startup': 'unos 6 segundos',
  'games.satisfactory.ports': 'el 7777 por TCP y UDP, y el 8888 por TCP',
  'games.satisfactory.disclaimer':
    'Herramienta no oficial. No está asociada a Coffee Stain Studios ni a Satisfactory.',
  'games.satisfactory.joinHint': 'En Satisfactory: Servidores → Añadir servidor, con esta dirección.',
  'games.satisfactory.join1': 'Abre Satisfactory y entra en «Servidores» desde el menú principal.',
  'games.satisfactory.join2': 'Pulsa «Añadir servidor» y pega ahí la dirección.',
  'games.satisfactory.join3':
    'Te pedirá la contraseña de administrador (la que pusiste al crear el servidor) para poder gestionarlo.',
  'games.satisfactory.join4':
    'El servidor queda en tu lista: pulsa «Unirse» y, si le pusiste contraseña para entrar, escríbela.',
  'games.satisfactory.joinWarning':
    'No vale la conexión directa por IP: el juego exige un permiso que solo se consigue añadiendo el servidor así. Si lo intentas por las bravas, Satisfactory contesta «Encryption token missing».',
  'games.satisfactory.backupScope':
    'Se guardan las partidas y los ajustes del servidor. El juego no hace falta: se vuelve a descargar de Steam.',
  'games.satisfactory.moderationHint':
    'Este juego no deja expulsar ni banear desde fuera. Entra tú a la partida con tu contraseña de administrador y hazlo desde el menú del propio juego. Si hace falta cortar de raíz, para el servidor o ponle una contraseña para entrar desde Ajustes.',

  'games.valheim.tagline': 'Sobrevivir, construir y matar jefes en un mundo vikingo.',
  'games.valheim.download': '2 GB',
  'games.valheim.highlight1': 'Se juega desde fuera sin abrir puertos',
  'games.valheim.highlight2': 'El más ligero de todos',
  'games.valheim.highlight3': 'No se modera en caliente',
  'games.valheim.startup': '35 s con un mundo nuevo, 12 s después',
  'games.valheim.ports': 'dos UDP (2456 y 2457), o ninguno con crossplay',
  'games.valheim.disclaimer': 'Herramienta no oficial. No está asociada a Iron Gate ni a Valheim.',
  'games.valheim.joinHint': 'En Valheim: Unirse a partida → Añadir servidor, con esta dirección.',
  'games.valheim.join1': 'Abre Valheim, elige tu personaje y entra en «Unirse a partida».',
  'games.valheim.join2': 'Pulsa «Añadir servidor» y pega ahí la dirección, con el puerto incluido.',
  'games.valheim.join3': 'Escribe la contraseña del servidor cuando te la pida.',
  'games.valheim.join4':
    'El servidor queda en tu lista de favoritos: la próxima vez basta con pulsar «Conectar».',
  'games.valheim.crossplay2':
    'Pulsa «Unirse con código» y escribe el código de 6 dígitos que da la app.',
  'games.valheim.crossplay4':
    'El código cambia cada vez que se arranca el servidor: habrá que pasarlo de nuevo.',
  'games.valheim.backupScope':
    'Se guardan los mundos y las listas de moderación. El juego no hace falta: se vuelve a descargar de Steam.',
  'games.valheim.moderationHint':
    'En Valheim se modera por identificador de Steam, no por nombre: el juego no dice cómo se llama el personaje de nadie. Vetar a alguien lo echa al momento, y las listas completas (administradores, vetados e invitados) están en Configuración → Moderación.',

  'games.factorio.tagline': 'Montar una fábrica enorme entre varios, y defenderla.',
  'games.factorio.highlight1': 'Arranca en un segundo',
  'games.factorio.highlight2': 'Con mods y con Space Age',
  'games.factorio.highlight3': 'Hace falta tener el juego',
  'games.factorio.startup': 'un segundo',
  'games.factorio.ports': 'uno UDP (34197)',
  'games.factorio.extra': 'tener Factorio en tu cuenta de Steam',
  'games.factorio.disclaimer':
    'Herramienta no oficial. No está asociada a Wube Software ni a Factorio.',
  'games.factorio.joinHint': 'En Factorio: Multijugador → Conectar a la dirección.',
  'games.factorio.join1': 'Abre Factorio y entra en «Multijugador» desde el menú principal.',
  'games.factorio.join2':
    'Pulsa «Conectar a la dirección» y pega ahí la dirección, con el puerto incluido.',
  'games.factorio.join3': 'Escribe la contraseña del servidor cuando te la pida.',
  'games.factorio.join4':
    'Tenéis que tener todos la misma versión del juego y los mismos mods que el servidor.',
  'games.factorio.joinWarning':
    'Si te saltas la contraseña, Factorio corta la conexión sin decir por qué (en el servidor queda como «PasswordMissing»). Y si tu juego no está en la misma versión que el servidor, no te dejará entrar: mira la versión en la ficha del servidor.',
  'games.factorio.backupScope':
    'Se guardan las partidas, los mods y las listas de moderación. El juego no hace falta: se vuelve a descargar de Steam.',
  'games.factorio.moderationHint':
    'En Factorio se modera por nombre de cuenta de Factorio, que es el que se ve en el chat. Vetar a alguien lo echa al momento.',

  'games.zomboid.tagline': 'Sobrevivir a la epidemia zombi todo lo que se pueda.',
  'games.zomboid.download': '6,7 GB',
  'games.zomboid.highlight1': 'Se modera y se manda como en Minecraft',
  'games.zomboid.highlight2': 'Cientos de reglas de partida',
  'games.zomboid.highlight3': 'Tarda un minuto largo en arrancar',
  'games.zomboid.startup': 'unos 40 segundos (minuto y medio la primera vez)',
  'games.zomboid.ports': 'uno UDP (16261), dos con Steam encendido',
  'games.zomboid.disclaimer':
    'Herramienta no oficial. No está asociada a The Indie Stone ni a Project Zomboid.',
  'games.zomboid.joinHint':
    'En Project Zomboid: Unirse → Favoritos → Añadir servidor, con esta dirección.',
  'games.zomboid.join1': 'Abre Project Zomboid y entra en «Unirse» desde el menú principal.',
  'games.zomboid.join2':
    'Ve a la pestaña «Favoritos» y pulsa «Añadir servidor» con esta dirección y su puerto.',
  'games.zomboid.join3':
    'Escribe el nombre de usuario y la contraseña que quieras: la primera vez se te crea la cuenta sola.',
  'games.zomboid.join4':
    'Si el servidor tiene contraseña, va en el campo «Contraseña del servidor», que es distinto al de tu cuenta.',
  'games.zomboid.joinWarning':
    'Tu usuario y tu contraseña son de este servidor, no de Steam: te los inventas tú la primera vez y con ellos vuelves a tu mismo personaje. Si te equivocas al escribirlos, el servidor te dice que la contraseña no es válida en vez de crearte otra cuenta.',
  'games.zomboid.backupScope':
    'Se guardan la partida, los ajustes y la base de datos de cuentas (quién es administrador y quién está vetado). El juego no hace falta: se vuelve a descargar de Steam.',
  'games.zomboid.moderationHint':
    'En Zomboid se modera por nombre de cuenta del servidor, no por Steam. Las órdenes viajan por la consola remota, así que hay que tener el servidor arrancado: con él parado se ve quién es quién, pero no se puede cambiar.',

  'games.enshrouded.tagline': 'Sobrevivir, construir y explorar un mundo tragado por la niebla.',
  'games.enshrouded.download': '8,8 GB',
  'games.enshrouded.highlight1': 'Arranca en 3 segundos',
  'games.enshrouded.highlight2': 'Permisos por contraseña',
  'games.enshrouded.startup': 'entre 2 y 4 segundos',
  'games.enshrouded.ports': 'uno UDP (15637)',
  'games.enshrouded.extra': 'sale siempre en la lista pública del juego',
  'games.enshrouded.disclaimer':
    'Herramienta no oficial. No está asociada a Keen Games ni a Enshrouded.',
  'games.enshrouded.joinHint':
    'En Enshrouded: Jugar → Servidores → Añadir servidor, con esta dirección.',
  'games.enshrouded.join1': 'Abre Enshrouded y entra en «Servidores» desde el menú de jugar.',
  'games.enshrouded.join2':
    'Pulsa «Añadir servidor» y pega ahí la dirección, con el puerto incluido.',
  'games.enshrouded.join3':
    'Escribe la contraseña del rol que te hayan dado: la contraseña decide qué puedes hacer dentro.',
  'games.enshrouded.join4':
    'El servidor queda en tus favoritos, que es donde sale aunque la lista pública tarde en refrescarse.',
  'games.enshrouded.joinWarning':
    'En Enshrouded no hay una contraseña del servidor, sino una por rol. Con la de Administrador puedes echar y vetar; con la de Invitado no puedes ni abrir cofres. Si te dan la que no es, entrarás igual pero con otros permisos.',
  'games.enshrouded.backupScope':
    'Se guardan los mundos y la configuración, con los roles y los vetados. El juego no hace falta: se vuelve a descargar de Steam. Con el servidor en marcha, la copia se hace justo después de uno de sus guardados, que son cada cinco minutos.',
  'games.enshrouded.moderationHint':
    'Enshrouded no deja echar a nadie desde fuera del juego: su propio servidor dice que el expulsar de un dedicado «no está implementado». Lo que sí se puede es quitar un veto desde aquí, y vetar desde dentro del juego con la contraseña de Administrador (pestaña Social).',

  'games.rust.tagline': 'Sobrevivir, construir una base y defenderla. Cada mes, mapa nuevo.',
  'games.rust.players': 'Hasta {n} en un PC de casa',
  'games.rust.download': '5,5 GB',
  'games.rust.highlight1': 'Se modera en caliente',
  'games.rust.highlight2': 'Plugins con Oxide',
  'games.rust.highlight3': 'Mapa nuevo cada mes',
  'games.rust.startup': 'de 2 a 5 minutos la primera vez (genera el mapa), unos 13 s después',
  'games.rust.ports': 'dos UDP (28015 y 28017), y uno TCP más con Rust+',
  'games.rust.extra': 'sale siempre en la lista pública; mapa nuevo cada mes',
  'games.rust.disclaimer':
    'Herramienta no oficial. No está asociada a Facepunch Studios ni a Rust.',
  'games.rust.joinHint': 'En Rust: pulsa F1 y escribe «client.connect» seguido de esta dirección.',
  'games.rust.join1': 'Abre Rust y espera a estar en el menú principal.',
  'games.rust.join2': 'Pulsa F1 para abrir la consola del juego.',
  'games.rust.join3':
    'Escribe «client.connect» y la dirección con su puerto, por ejemplo: client.connect 192.168.1.20:28015',
  'games.rust.join4':
    'Pulsa Intro. Después sale en «Historial» dentro de la lista de servidores, para la próxima vez.',
  'games.rust.joinWarning':
    'Si el servidor acaba de cambiar de mes y no se ha actualizado, Rust no te deja entrar: dice que la versión no coincide. Pasa el primer jueves de cada mes; mira Configuración → Borrado.',
  'games.rust.backupScope':
    'Se guardan el mapa con todo lo construido, los jugadores, los administradores y los vetados, y los plugins con su configuración. El juego no hace falta: se vuelve a descargar de Steam.',
  'games.rust.moderationHint':
    'En Rust se modera por el identificador de Steam, aunque la lista enseña el nombre. Echar y vetar surten efecto al momento; los administradores y los vetados están en Configuración → Moderación.'
} as const satisfies Record<string, string | Plural>
