# Ampliar QubiQ a otros juegos — investigación

Septiembre de 2026. Qué hace falta para que la app cree, arranque y gestione servidores de otros
juegos además de Minecraft, qué dependencias añade y hasta qué punto es viable cada uno.

Todo lo que no se ha podido confirmar con una fuente está marcado como **(a confirmar en
prototipo)**. Las fuentes van al final.

---

## 1. Criba: ¿tiene servidor dedicado?

Antes de investigar a fondo, lo primero es si se puede montar un servidor propio.

| Juego | ¿Servidor dedicado propio? | Veredicto |
|---|---|---|
| Valheim | Sí, oficial y gratuito por SteamCMD | **Sigue** |
| Factorio | Sí, oficial (en Windows exige tener el juego) | **Sigue** |
| Project Zomboid | Sí, oficial y gratuito por SteamCMD | **Sigue** |
| Enshrouded | Sí, oficial y gratuito por SteamCMD | **Sigue** |
| Satisfactory | Sí, oficial y gratuito por SteamCMD | **Sigue** |
| Rust | Sí, oficial y gratuito por SteamCMD | **Sigue** |
| **Once Human** | **No.** NetEase solo ofrece «Custom Servers» alquilados en su propia infraestructura; no se publica software de servidor | **Descartado** |
| **Dyson Sphere Program** | **No.** Sin multijugador oficial, y los desarrolladores dicen que no lo planean. Solo existe el mod Nebula, que tiene modo headless | **Descartado** (ver nota) |

**Nota sobre Dyson Sphere Program.** Nebula permite un servidor headless, pero exige tener el juego
comprado, instalar BepInEx y el mod, y depende de que el mod siga el ritmo de las actualizaciones
del juego. No encaja con la promesa de la app («sin complicaciones»). Si algún día se quiere, sería
una integración experimental aparte.

---

## 2. Lo que cambia respecto a Minecraft

La app está hecha a la medida de Minecraft: descarga jars, gestiona Java, edita
`server.properties`, detecta el arranque por el log, se para escribiendo `stop` por stdin y
comprueba la conexión con el protocolo de Minecraft. Casi nada de eso vale tal cual para los
demás. Lo que hay que construir es común a todos y conviene hacerlo **una vez**:

### 2.1 Un modelo de «juego», por encima de las distribuciones

Hoy el eje es la *distribución* (vanilla, Paper, Fabric, Forge). Hay que subir un nivel: un
**juego** declara cómo se hace cada cosa y el núcleo lo ejecuta.

| Pieza | Minecraft hoy | Lo que tiene que admitir |
|---|---|---|
| Instalación | Descarga directa de jars | SteamCMD anónimo · SteamCMD con cuenta · descarga directa con cuenta |
| Arranque | `java -jar` con flags de JVM | Ejecutable propio con argumentos (y Java empaquetado en Zomboid) |
| Configuración | `server.properties` | Argumentos de línea de comandos · JSON · INI · Lua · API HTTP |
| «Ya está listo» | Línea `Done (…)!` del log | Patrón de log por juego · consulta Steam (A2S) · API |
| **Parada limpia** | `stop` por stdin | stdin · RCON · WebRCON · API HTTP · **Ctrl+C** |
| Jugadores | Parseo del log | Log · A2S · RCON · API |
| Moderación | Comandos por stdin | Muy desigual: desde RCON completo hasta nada |
| Copias | Carpetas del mundo | Rutas de guardado por juego, a veces fuera de la carpeta del servidor |
| Actualizaciones | El usuario elige versión | Rama de Steam (normalmente la última) y, en Rust, borrado mensual obligatorio |
| Puertos | 1 TCP | Varios, **casi siempre UDP**, a veces TCP y UDP a la vez |

### 2.2 Dependencias nuevas

| Dependencia | Para qué | Coste |
|---|---|---|
| **SteamCMD** | Instalar y actualizar 5 de los 6 juegos | Ejecutable de Valve (`steamcmd.zip`). La primera vez se autoactualiza. Sin npm. Hay que interpretar su salida para mostrar el progreso **(a confirmar en prototipo)**. |
| **Enviar Ctrl+C a un proceso** | Parada limpia de Valheim y Enshrouded | **El riesgo técnico número uno**, ver 2.3 |
| Cliente **Source RCON** (TCP) | Project Zomboid y Factorio | Protocolo sencillo, se escribe a mano como se hizo con el Server List Ping |
| Cliente **WebRCON** (WebSocket) | Rust | Electron 44 ya trae `WebSocket` nativo. Sin dependencias. |
| Consulta **Steam A2S** (UDP) | Estado y jugadores de los juegos de Steam | Protocolo sencillo y documentado, a mano |
| Cliente **HTTPS con certificado autofirmado** | API de Satisfactory | `fetch` con un agente que acepte ese certificado solo para esa conexión |
| Visual C++ Redistributable / DirectX | Algunos servidores de Windows lo exigen | **(a confirmar en prototipo)** qué juegos y cómo detectarlo |

Ninguna exige una librería pesada. La única candidata a paquete npm es la del Ctrl+C.

### 2.3 El problema de la parada limpia en Windows

Es lo que puede decidir la viabilidad de algunos juegos, así que va aparte.

Windows no tiene señales: en Node, `child.kill()` **siempre mata el proceso de golpe**, sin darle
opción a guardar. Minecraft se libraba porque acepta `stop` por stdin. Pero:

- **Valheim** no tiene consola de comandos ni RCON. Solo guarda al cerrarse con **Ctrl+C** (o cada
  30 minutos por defecto). Matarlo pierde hasta media hora de partida.
- **Enshrouded** tampoco tiene RCON y también escribe el guardado al cerrarse bien. Matarlo es,
  según los propios hosts, la causa principal de pérdida de datos.

La solución conocida es `GenerateConsoleCtrlEvent` de la API de Windows. Existen paquetes npm que
lo hacen (`ctrlc-windows`, `generate-ctrl-c-event`), pero hay una trampa: el proceso tiene que
tener **su propia consola** para poder recibir el evento, y la app lanza hoy los servidores sin
consola y con la salida redirigida. **Hay que prototiparlo antes de comprometer ningún juego que
dependa de ello:** lanzar Valheim con consola propia y oculta, seguir leyendo su salida, mandarle
Ctrl+C y comprobar que guarda.

Los demás no tienen este problema: Zomboid y Factorio aceptan comandos por stdin o RCON, Rust tiene
WebRCON y Satisfactory tiene una función `Shutdown` en su API.

### 2.4 Conexión: UDP y puertos múltiples

La pantalla de conexión y sus guías dan por hecho **un puerto TCP**. Cinco de los seis juegos usan
**UDP**, y Satisfactory usa **TCP y UDP en el mismo puerto más un segundo TCP**. Consecuencias:

- Las guías del router tienen que decir el protocolo correcto, y listar varios puertos cuando haga falta.
- playit.gg admite túneles UDP, pero hará falta **un túnel por puerto** **(a confirmar en prototipo)**.
- La **comprobación desde internet** usa hoy un servicio que solo entiende Minecraft (mcstatus.io).
  Para los juegos de Steam habrá que buscar otra vía **(a confirmar en prototipo)**; una candidata
  es consultar si el servidor aparece registrado en Steam para la IP pública.
- **Buena noticia para quien tiene CGNAT:** Valheim con `-crossplay` funciona **sin abrir puertos**:
  pasa por los relés de PlayFab y los jugadores entran con un código de 6 dígitos.

---

## 3. Juego a juego

### Valheim — viabilidad **alta** (condicionada al Ctrl+C)

| | |
|---|---|
| Instalación | SteamCMD, app **896660**, `login anonymous` |
| Ramas | `public` y **seis antiguas con descripción del estudio**: `default_old` («Previous stable»), `default_pre1_0`, `default_preal` (antes de Ashlands), `default_prebw` (Bog Witch), `default_precta` (Call to Arms), `default_preml` (Mistlands). Ninguna pide contraseña |
| Sistema | Windows y Linux nativos |
| Puertos | UDP 2456–2458 (el de juego y el siguiente). Con `-crossplay`, ninguno |
| Configuración | Solo argumentos: `-name -port -world -password -public -crossplay -saveinterval -preset -modifier -backups -savedir` |
| Mundos | Carpeta `worlds` (movible con `-savedir`) |
| Parada limpia | **Ctrl+C** (ver 2.3) |
| Moderación | Listas de texto con SteamID: `adminlist.txt`, `bannedlist.txt`, `permittedlist.txt`. Sin RCON |
| Jugadores | A2S y log **(a confirmar en prototipo)** |
| Mods | **Thunderstore** (comunidad `valheim`), con **BepInEx** de cargador. Comprobado contra el servidor real (ANALISIS §19.23): el cargador se engancha con el `winhttp.dll` de al lado del ejecutable, sin tocar la línea de órdenes, y la parada con Ctrl+Break sigue guardando el mundo. ⚠ Se cae con `Could not run preloader!` si la ruta del servidor pasa de los 260 caracteres de Windows |

**Por qué encaja:** la configuración cabe entera en el asistente básico. Nombre, contraseña,
mundo, *preset* de dificultad (normal, casual, difícil, inmersivo…) y modificadores son justo el
tipo de pregunta de una pantalla que ya hace la app. Y el crossplay resuelve el CGNAT sin tocar nada.

**Pega:** depende por completo de resolver la parada limpia en Windows. La moderación se reduce a
editar listas; no se puede expulsar a alguien en caliente desde fuera del juego **(a confirmar)**.

### Satisfactory — viabilidad **alta**

| | |
|---|---|
| Instalación | SteamCMD, app **1690800**, `login anonymous` |
| Ramas | `public` y `experimental` (en septiembre de 2026, con la misma build). Ninguna pide contraseña |
| Sistema | Windows y Linux nativos |
| Puertos | **7777 TCP y UDP** (juego y API) + **8888 TCP** (mensajería fiable) |
| Requisitos | 8 GB de RAM; 16 GB para partidas grandes o más de 4 jugadores |
| Configuración y control | **API HTTPS oficial** en el propio puerto 7777 |
| Guardados (Windows) | `%LocalAppData%\FactoryGame\Saved\SaveGames\server` |
| Parada limpia | Función `Shutdown` de la API |
| Mods | **ficsit.app** (SMR), con **SML** de cargador. Comprobado contra el servidor real (ANALISIS §19.23): van a `FactoryGame/Mods/<referencia>/` y el servidor los carga sin tocar la línea de órdenes. Cada versión publica varias «dianas» y un servidor necesita la **`WindowsServer`**: hay mods que solo publican la de cliente. SML guarda su configuración en `FactoryGame/Configs`, no bajo `-UserDir` |

**Por qué encaja:** es el más «programable» de todos. La API trae `HealthCheck` (sin
autenticación), `QueryServerState` (jugadores conectados, tick rate, fase de la partida),
`SaveGame`, `LoadGame`, `DownloadSaveGame`, `CreateNewGame`, `ApplyServerOptions` y `Shutdown`.

**Detalle importante:** un servidor recién instalado hay que **reclamarlo** (ponerle nombre y
contraseña de administrador), y normalmente se hace desde el menú del juego. Pero la API tiene
`PasswordlessLogin` + `ClaimServer`, así que **la app puede reclamarlo sola durante el asistente**
y el usuario no tiene ni que abrir el juego para configurarlo.

**Pega:** es el más pesado en RAM de la lista junto a Rust, y la API usa un certificado
autofirmado que hay que aceptar de forma controlada.

### Project Zomboid — viabilidad **alta**

| | |
|---|---|
| Instalación | SteamCMD, app **380870**, `login anonymous` |
| Versión | **Build 42 estable desde el 29 de julio de 2026** (42.20), con multijugador en la rama por defecto |
| Sistema | Windows y Linux nativos; **Java viene incluido** |
| Puertos | UDP 16261 y 16262 |
| Configuración | `Zomboid/Server/servertest.ini` (servidor) + `servertest_SandboxVars.lua` (reglas de la partida) |
| Memoria | Flag `-Xmx` de la JVM; Build 42 pide más margen que la 41 |
| Parada limpia | `quit` por la consola del servidor, o RCON |
| Moderación | Completa: comandos de consola y RCON (expulsar, banear, dar acceso…) |

**Por qué encaja:** es lo más parecido a Minecraft de la lista. Tiene consola por stdin, RCON,
ficheros de texto editables y memoria configurable, así que la experiencia de gestión de la app se
reutiliza casi entera, incluidos la moderación y el control de memoria.

**Pegas:**
- En el primer arranque **pide la contraseña de administrador por consola** y se queda esperando.
  Hay que pasarla por argumento (`-adminpassword`) para que no se cuelgue **(a confirmar en prototipo)**.
- El fichero de reglas (`SandboxVars.lua`) es enorme: el modo básico tendrá que elegir bien qué
  pocas opciones enseñar.
- El puerto por defecto de RCON y el papel exacto del 16262 varían según la fuente
  **(a confirmar en prototipo)**.

### Enshrouded — viabilidad **media-alta**

| | |
|---|---|
| Instalación | SteamCMD, app **2278520**, `login anonymous` |
| Sistema | **Solo Windows** (en Linux, con Wine). Para esta app no es problema |
| Puertos | **Un único puerto UDP**, `queryPort` 15637. Desde el Content Update #2 ya no hay `gamePort` aparte |
| Configuración | `enshrouded_server.json` (se crea en el primer arranque) |
| Roles | `userGroups`: cada rol (Admin, Friend, Guest…) tiene su contraseña y sus permisos; la contraseña con la que entras decide tu rol |
| Parada limpia | Cerrar bien (guarda al salir); matarlo pierde datos → **Ctrl+C** (ver 2.3) **(a confirmar en prototipo)** |
| Moderación | Sin RCON |

**Trampa conocida del JSON:** si `gameSettingsPreset` no es `"Custom"`, el servidor **ignora en
silencio** todos los valores de `gameSettings`. La app tiene que poner `Custom` ella misma al
cambiar cualquier ajuste, o el usuario verá que no pasa nada.

**Pega:** comparte el problema del Ctrl+C con Valheim y no tiene moderación desde fuera. Su
configuración es buena para el asistente (dificultad, roles con contraseña).

### Rust — viabilidad **media**

| | |
|---|---|
| Instalación | SteamCMD, app **258550**, `login anonymous` |
| Sistema | Windows y Linux nativos |
| Puertos | **28015 UDP** (juego) · **28016 TCP** (RCON) · **28017 TCP** (consulta de Steam) |
| Requisitos | 8 GB de RAM para grupos pequeños; 10–12 GB con mapas grandes o muchos jugadores |
| Control | **WebRCON** (`+rcon.web 1`): parada, guardado, jugadores, expulsar y banear |
| Mods | Oxide / Carbon (terceros) |

**El factor que lo complica: el borrado mensual obligatorio.** Facepunch publica un parche el
**primer jueves de cada mes**. Al actualizarse el cliente, un servidor sin actualizar deja de ser
accesible, y el parche fuerza un mapa nuevo. La app tendría que avisar, actualizar y explicar el
*wipe*, que para alguien nuevo es lo menos intuitivo del juego.

**Pega:** es el más pesado, el más lento en arrancar (genera el mapa) y el público de Rust suele ser
más técnico. Encaja peor con la promesa del modo básico, aunque técnicamente es de los más cómodos
gracias a WebRCON.

### Factorio — viabilidad **media** (técnicamente excelente, comercialmente con condiciones)

| | |
|---|---|
| Instalación | **Linux:** servidor headless oficial y gratuito en factorio.com (incluye Space Age). **Windows:** no hay headless; se usa el ejecutable del propio juego con `--start-server`, y **eso exige tener el juego** |
| Puerto | **34197 UDP** |
| Configuración | `server-settings.json` (+ ajustes de generación del mapa) |
| Control | Consola por stdin y RCON |
| Mods | Portal oficial de mods, que exige credenciales de factorio.com para descargar |

**Lo que lo frena:** en Windows, la app no puede descargar el servidor de forma anónima. Hay tres
salidas y todas piden algo al usuario:
1. Iniciar sesión con su cuenta de factorio.com para descargar el juego.
2. Usar su instalación de Steam ya existente.
3. SteamCMD con **su** cuenta de Steam, no anónima.

Además, Space Age en un servidor de Windows tiene sus complicaciones: la descarga zip de Windows no
trae los módulos de Space Age activados y hay informes de fallos con la lista de mods.

**A favor:** es el mejor servidor de la lista para automatizar (stdin, RCON, JSON limpio), y cada
jugador tiene el juego de todas formas.

---

### Las ramas de Steam, en general

Un juego de Steam no deja instalar una build suelta: se elige una **rama** y Steam pone la última
de esa rama. Salen de `app_info_print`, bajo `branches`, con `buildid`, `description` (solo las que
no son `public`), `timeupdated` y, si la piden, `pwdrequired`. Es lo que la app usa para cambiar de
versión hacia delante y hacia atrás (ANALISIS.md §19.18).

Project Zomboid, que aún no está implementado, tiene también `legacy41` («Build 41.78.21») y
`42.19` («Build 42.19.2»): cuando entre, su pantalla de versión funcionará sin tocar nada.

## 4. Resumen de viabilidad y orden recomendado

| | Instalación | Parada limpia | Moderación | Encaje con el modo básico | Viabilidad |
|---|---|---|---|---|---|
| **Satisfactory** | Anónima | API | Parcial **(a confirmar)** | Muy bueno (la app lo reclama sola) | **Alta** |
| **Project Zomboid** | Anónima | stdin / RCON | Completa | Bueno (muchas reglas que filtrar) | **Alta** |
| **Valheim** | Anónima | **Ctrl+C** | Listas de texto | Excelente (y crossplay sin puertos) | **Alta*** |
| **Enshrouded** | Anónima | **Ctrl+C** | Ninguna externa | Bueno | **Media-alta*** |
| **Rust** | Anónima | WebRCON | Completa | Flojo (wipes, peso, público técnico) | **Media** |
| **Factorio** | **Con cuenta** | stdin / RCON | Completa | Bueno, pero pide credenciales | **Media** |
| Once Human | — | — | — | — | Descartado |
| Dyson Sphere Program | — | — | — | — | Descartado |

\* Condicionado a que funcione el envío de Ctrl+C (2.3).

**Orden recomendado:**

1. **Dos prototipos de riesgo, antes de nada:**
   - Instalar un servidor con **SteamCMD** mostrando el progreso.
   - **Parar Valheim con Ctrl+C** en Windows y comprobar que guarda.

   Son un par de días y deciden si Valheim y Enshrouded entran o no.
2. **La capa multijuego** (2.1), refactorizando Minecraft para que sea el primer «juego» del
   modelo nuevo. Si Minecraft sigue pasando `smoke` y `e2e` después, la capa está bien hecha.
3. **Primer juego nuevo: Satisfactory o Valheim.**
   - **Satisfactory** si el Ctrl+C da guerra: no lo necesita y su API lo hace el más limpio.
   - **Valheim** si el prototipo sale bien: es el más sencillo de configurar y su crossplay es un
     argumento de venta.
4. **Project Zomboid**, que reutiliza casi toda la gestión existente.
5. **Enshrouded**, con la parada ya resuelta.
6. **Rust y Factorio**, cuando lo anterior esté asentado.

---

## 5. Otros juegos a considerar (sin investigar)

Propuestos por tener, **según su reputación**, servidor dedicado propio. Ninguno se ha comprobado
todavía; habría que pasarles la misma criba del apartado 1.

**Supervivencia y construcción, mismo público que Valheim o Enshrouded**
- Palworld
- V Rising
- 7 Days to Die
- ARK: Survival Ascended
- Conan Exiles
- Sons of the Forest
- Soulmask
- Icarus
- Abiotic Factor

**Cooperativos y sandbox**
- Terraria (vanilla y tModLoader)
- Core Keeper
- Don't Starve Together
- Necesse
- Vintage Story
- Stationeers
- Space Engineers

**Otros con comunidad de servidores propios**
- Unturned
- Barotrauma
- Arma Reforger
- Garry's Mod

---

## Fuentes

**Criba**
- NetEase — [Once Human: lanzamiento de Custom Servers](https://www.neteasegames.com/news/20250620/37000_1242171.html) · [Avance de la actualización de junio](https://www.oncehuman.game/news/update/20250530/40780_1237869.html) · [GHOSTCAP: no se pueden autoalojar](https://www.ghostcap.com/how-to-make-a-once-human-custom-server)
- Dyson Sphere Program — [Hilo de Steam sobre el multijugador](https://steamcommunity.com/app/1366540/discussions/0/687490776811292028/) · [Nebula: servidor headless](https://github.com/NebulaModTeam/nebula/wiki/Setup-Headless-Server)

**Valheim**
- [Wiki: servidores dedicados](https://valheim.fandom.com/wiki/Dedicated_servers) · [Guía oficial de Iron Gate](https://www.valheimgame.com/support/a-guide-to-dedicated-servers/) · [Parámetros de arranque](https://www.survivalservers.com/wiki/Valheim_Server_Settings)
- [Crossplay y códigos de acceso](https://connecthosting.net/help/games/valheim/valheim-crossplay-join-code) · [SteamDB 896660](https://steamdb.info/app/896660/info/)
- Mods: [BepInExPack para Valheim](https://thunderstore.io/c/valheim/p/denikson/BepInExPack_Valheim/) · [API de Thunderstore](https://thunderstore.io/api/docs/)

**Satisfactory**
- [Wiki oficial: servidores dedicados](https://satisfactory.wiki.gg/wiki/Dedicated_servers) · [Wiki oficial: API HTTPS](https://satisfactory.wiki.gg/wiki/Dedicated_servers/HTTPS_API)
- Mods: [ficsit.app](https://ficsit.app/) · [Documentación de modding y su API](https://docs.ficsit.app/)

**Project Zomboid**
- [Build 42.20 publicada](https://projectzomboid.com/blog/news/2026/07/project-zomboid-build-42-20-released/) · [Estado del multijugador B42](https://hostedgg.com/blog/project-zomboid-build-42-multiplayer-status)
- [Configuración, mods y RCON](https://mantascope.com/guides/project-zomboid-server-setup) · [RCON](https://supercraft.host/wiki/project-zomboid/rcon/)

**Enshrouded**
- [Keen Games: configuración del servidor](https://enshrouded.zendesk.com/hc/en-us/articles/16055441447709-Dedicated-Server-Configuration) · [Keen Games: roles](https://enshrouded.zendesk.com/hc/en-us/articles/19191581489309-Server-Roles-Configuration)
- [Sin build nativo para Linux](https://pimylifeup.com/ubuntu-enshrouded-server/) · [Copias y parada limpia](https://www.gameserverkings.com/knowledge-base/enshrouded/backing-up-and-restoring-your-world/) · [Discusión sobre parada limpia](https://github.com/jsknnr/enshrouded-server/issues/65)

**Rust**
- [Requisitos y puertos](https://rust.runonflux.com/server-requirements) · [WebRCON, administración y wipes](https://mantascope.com/guides/rust-server-admin-guide) · [SteamDB 258550](https://steamdb.info/app/258550/info/)

**Factorio**
- [Wiki: multijugador](https://wiki.factorio.com/Multiplayer) · [Foro: headless para Windows](https://forums.factorio.com/viewtopic.php?t=129877) · [Foro: servidor Space Age en Windows](https://forums.factorio.com/viewtopic.php?p=646562&t=123106) · [Foro: servidor desde la versión de Steam](https://forums.factorio.com/viewtopic.php?t=61216)

**Técnica**
- [ctrlc-windows](https://github.com/thefrontside/ctrlc-windows) · [generate-ctrl-c-event](https://www.npmjs.com/package/generate-ctrl-c-event) · [SteamCMD en Windows](https://github.com/modcommunity/how-to-download-and-run-steamcmd)
