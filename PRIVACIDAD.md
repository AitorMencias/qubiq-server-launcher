# Privacidad: qué sale de tu equipo

QubiQ Server Launcher **no tiene servidores propios, no envía telemetría, estadísticas de uso ni
informes de errores, y no tiene cuentas de usuario.** Todo lo que guarda se queda en tu equipo, en
`%APPDATA%\qubiq-server-launcher` (o en la carpeta a la que la hayas movido).

Lo que sí hace es conectarse a servicios de terceros cuando hace falta para lo que le pides. Esta
página dice cuáles, cuándo y qué les llega. Como en cualquier conexión a internet, todos ellos ven
tu **IP pública**.

## Descargas

Cuando creas, actualizas o cambias de versión un servidor, la app descarga de las fuentes
oficiales. A estos servicios solo les llega la petición del fichero:

| Para qué | Servicio |
|---|---|
| Versiones y servidor de Minecraft | Mojang (`piston-meta.mojang.com` y sus servidores de descarga) |
| Paper, Fabric, Forge y NeoForge | `fill.papermc.io`, `meta.fabricmc.net`, `files.minecraftforge.net` / `maven.minecraftforge.net`, `maven.neoforged.net` |
| Java para Minecraft | Adoptium (`api.adoptium.net`) |
| SteamCMD y los servidores de Satisfactory, Valheim, Project Zomboid, Enshrouded y Rust | Valve (`steamcdn-a.akamaihd.net` y la red de Steam). Se entra de forma **anónima** |
| Componentes de Visual C++ que piden algunos servidores | Microsoft (`aka.ms`) |

## Mods y plugins

Solo cuando los buscas o instalas desde la app. Les llega lo que buscas y lo que descargas:

| Juego | Servicio |
|---|---|
| Satisfactory | ficsit.app (`api.ficsit.app`) |
| Valheim | Thunderstore (`thunderstore.io`) |
| Factorio | Portal de mods de Factorio (`mods.factorio.com`), ver [Tu cuenta](#tus-cuentas) |
| Project Zomboid | API del Taller de Steam (`api.steampowered.com`, con los números de los mods) y SteamCMD |
| Enshrouded | GitHub, para el cargador Shroudtopia (`api.github.com`) |
| Rust | uMod (`umod.org`, `assets.umod.org`) y GitHub, para Oxide |

Para Minecraft, la app abre en tu navegador las webs de Modrinth, Hangar, CurseForge o SpigotMC;
desde la app no se les envía nada.

## Tu IP pública y la conexión desde fuera

- **Al elegir abrir puertos en el router**, la app pregunta tu IP pública a `api.ipify.org` para
  enseñarte la dirección que tienes que dar a tus amigos. No se consulta con las otras formas de
  conexión.
- **Al pulsar «Comprobar desde internet»**, la app pide a un servicio de fuera que intente
  conectarse a tu servidor, y para eso le da tu IP pública y el puerto:
  - Minecraft: `api.mcstatus.io`.
  - Valheim, Enshrouded y Rust: la API pública de Steam (`api.steampowered.com`), que dice si tu
    servidor está registrado en su lista.

  Solo pasa cuando pulsas el botón.

## Servidores que se anuncian en listas públicas

Algunos juegos publican tu servidor (nombre, IP y puerto) en su lista de servidores, y eso lo hace
**el propio servidor del juego**, no la app:

- **Rust y Enshrouded se anuncian siempre.** El juego no tiene forma de evitarlo, y la app lo dice
  al elegirlos.
- **Valheim** solo si lo marcas como público en sus ajustes. Si eliges el crossplay para que
  entren desde fuera, el juego registra el servidor en su servicio de crossplay para darte el
  código de 6 dígitos.
- **Factorio**: la app lo deja siempre fuera de la lista pública.
- **Project Zomboid** arranca sin Steam y no se anuncia en ningún sitio.

Además, cada servidor de juego habla con los servicios de su juego mientras está en marcha (por
ejemplo, para comprobar las cuentas de quien entra). Eso depende de cada juego, no de la app.

## Tus cuentas

- **Factorio de Steam.** Si eliges bajar Factorio con tu cuenta de Steam, la contraseña y el
  código de Steam Guard se le pasan a SteamCMD, que entra en Steam como lo haría el cliente. La app
  guarda el nombre de usuario en la configuración del servidor (para poder actualizarlo), pero no
  la contraseña; SteamCMD guarda su sesión en su carpeta, dentro de los datos de la app.
- **Mods de Factorio.** El portal pide tu usuario y un token de factorio.com. La app puede leerlos
  de la sesión del juego instalado (`%APPDATA%\Factorio\player-data.json`), **solo cuando lo pides
  desde la pestaña de mods**, o pedirte usuario y contraseña. La contraseña se envía una vez a
  `auth.factorio.com` para conseguir el token y no se guarda. El token solo se mantiene mientras
  tienes abierta la pestaña.

## Control remoto

Está **desactivado de serie**. Si lo activas:

- La app abre un puerto en tu equipo y sirve por HTTPS la página del control remoto. Se puede
  entrar desde tu red de casa; desde fuera, solo si abres ese puerto en tu router.
- Cada dispositivo se empareja con un código, firma cada orden y solo ve los servidores a los que
  le hayas dado permiso. Las IPs que aparecen en la consola y el historial se enmascaran antes de
  mandarlos al dispositivo.
- **Conectar con otro QubiQ** hace que esta app se conecte a la dirección del otro equipo que tú
  escribas, y a ninguna otra.

## Lo que no hace

- No sube tus mundos, configuraciones, copias de seguridad ni registros a ningún sitio.
- No se actualiza sola ni comprueba si hay versiones nuevas de la app.
- No incluye anuncios ni rastreadores.

Si encuentras alguna conexión que no esté en esta lista, es un fallo: avísanos en un
[issue](https://github.com/AitorMencias/qubiq-server-launcher/issues).
