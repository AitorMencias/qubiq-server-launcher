# Hoja de ruta multijuego

Plan para que QubiQ gestione, además de Minecraft, los seis juegos que pasaron la criba de
[INVESTIGACION-JUEGOS.md](INVESTIGACION-JUEGOS.md): Satisfactory, Valheim, Factorio,
Project Zomboid, Enshrouded y Rust. Los juegos propuestos sin investigar quedan para más adelante (ver «Futuro», al final).

## Resumen

| Fase | Qué | Versión | Depende de |
|---|---|---|---|
| **0** | Preparar la app para varios juegos y llevar Minecraft a su subcarpeta | 0.4.0 | — |
| **1** | Cimientos comunes de Steam: SteamCMD, parada limpia, RCON, A2S, UDP | (sin release propia) | 0 |
| **2** | Satisfactory | 0.5.0 | 1 |
| **3** | Valheim | 0.6.0 | 1 (parada con Ctrl+Break, ya validada) |
| **4** | Factorio | 0.7.0 | 1 |
| **5** | Project Zomboid | 0.8.0 | 1 |
| **6** | Enshrouded | 0.9.0 | 3 |
| **7** | Rust | 0.10.0 | 1 |

**Por qué este orden:** primero lo que tienen en común todos los juegos, luego los juegos de menos
a más riesgo, y cada juego nuevo aprovechando lo que dejó el anterior.
- **Satisfactory va primero:** no depende del Ctrl+C y su API oficial pone a prueba la capa de
  Steam de principio a fin sin trucos.
- **Valheim:** estrena la parada por señal de consola (Ctrl+Break: Ctrl+C no llega, ver fase 1) y
  el crossplay como modo de exposición.
- **Factorio, adelantado:** es el juego que más interesa al autor, así que va justo después de
  Valheim aunque traiga su problema propio (el inicio de sesión con cuenta para descargar el
  servidor). La capa de la fase 1 ya está validada contra dos juegos, así que ese problema se
  afronta solo, sin mezclarlo con el trabajo de base.
- **Project Zomboid:** se parece mucho a Minecraft y aprovecha casi toda la gestión existente.
- **Enshrouded:** reutiliza la misma parada que Valheim (Ctrl+Break).
- **Rust, al final:** su borrado mensual obligatorio es el problema más raro de todos y cierra la
  hoja de ruta junto a la revisión general de la 0.10.0.

**Una regla para todas las fases:** Minecraft no puede empeorar. `smoke`, `e2e` y `e2e:restart`
tienen que seguir en verde al cerrar cada una, y los servidores que ya existen en
`%APPDATA%\qubiq-server-launcher` tienen que abrirse y funcionar igual que antes.

---

## Fase 0 — La app acepta varios juegos (Minecraft a su subcarpeta)

> **Estado: hecha y publicada** (commit v0.4.0; iconos propios en v0.4.1). Detalle, decisiones y verificación en
> [ANALISIS.md §19.13](ANALISIS.md). Cambios respecto a este plan:
> - `runtime/logParser.ts` no se ha partido: lo común era solo el tipo del evento, que vive en el
>   contrato. El parser entero está en `games/minecraft/logParser.ts`.
> - `extraResources` no hubo que tocarlo: ya copiaba `resources/` entera.
> - El contrato final tiene más piezas que la tabla de 0.1 (`prepareCreate`, `applyChanges`,
>   `restoreTargets`, `holdSaves`…) y todavía no tiene `ports` ni `players` por API: llegan con
>   Satisfactory, que es quien los necesita.
> - Los textos comunes que aún dicen «Minecraft» o «mundo» se generalizan en la fase 1.

**Objetivo:** que la arquitectura hable de *juegos* y no de *distribuciones de Minecraft*, sin
añadir todavía ningún juego. Al terminar, el usuario no debe notar **ningún cambio**: es una
refactorización y se juzga por eso.

### 0.1 Diseñar el contrato de un juego contra dos casos reales

El riesgo de esta fase es sacar una abstracción con forma de Minecraft que luego no sirva para
nada más. Para evitarlo, el contrato se diseña a la vez contra **Minecraft** y contra
**Satisfactory**, sobre papel, con los datos de la investigación. Si una pieza no tiene sentido
para los dos, no es común.

El contrato (`GameAdapter`) declara:

| Pieza | Minecraft | Satisfactory (para contrastar) |
|---|---|---|
| `install(instance)` | Descarga jar + Java | SteamCMD app 1690800 |
| `launch(instance)` | `java` + flags + `nogui` | `FactoryServer.exe -Port=… -ReliablePort=…` |
| `ports(instance)` | 1 TCP | 7777 TCP+UDP, 8888 TCP |
| `readiness` | Línea `Done (…)!` | `HealthCheck` de la API |
| `stop` | `stop` por stdin | Función `Shutdown` |
| `players` | Parseo del log | `QueryServerState` |
| `saveFolders(instance)` | Carpeta del mundo activo | `SaveGames/server` |
| `config` | `server.properties` | Opciones por API |
| `capabilities` | mundos, plugins/mods, plugins oficiales, memoria, moderación | partidas, moderación parcial |

Las **capacidades** son lo que decide qué pestañas de Configuración aparecen. Un juego sin plugins
no enseña la pestaña, igual que hoy Vanilla no enseña «Plugins».

### 0.2 Mover Minecraft a su subcarpeta

**Núcleo (`src/main/core`)**

| Hoy | Pasa a | Nota |
|---|---|---|
| `versions/*` | `games/minecraft/versions/` | Mojang, Paper, Fabric, Forge |
| `install/*` | `games/minecraft/install/` | Incluye `jvmArgs.ts` |
| `java/manager.ts` | `games/minecraft/java/` | Zomboid trae su propio Java: no es común |
| `config/properties.ts` | `games/minecraft/config/` | El **editor** clave=valor que preserva comentarios se extrae a `core/formats/` porque `servertest.ini` de Zomboid usa el mismo formato |
| `content/*` | `games/minecraft/content/` | Plugins, mods y plugins oficiales |
| `worlds/manager.ts` | `games/minecraft/worlds/` | |
| `runtime/logParser.ts` | Se parte | Estructura común en `runtime/`; los patrones de Minecraft a `games/minecraft/` |
| `net/network.ts` | Se parte | IPs, puerto libre y pasarela quedan comunes; **Server List Ping** y la comprobación con mcstatus.io van a `games/minecraft/` |
| `runtime/supervisor.ts` | Se queda, generalizado | Recibe ejecutable y argumentos (no `javaPath`) y una **estrategia de parada** en lugar de escribir `stop` a fuego |
| `backup/manager.ts` | Se queda, generalizado | Copia las carpetas que le diga el juego, no las de `worlds` |
| `instances`, `settings`, `paths`, `http`, `downloader`, `restartPolicy` | Se quedan | Comunes |
| `service.ts` | Se queda, adelgazado | Orquesta y delega en el juego. Lo exclusivo de Minecraft (mundos, plugins, propiedades) sale a `games/minecraft/service.ts` |
| — | **`games/types.ts`, `games/registry.ts`** | El contrato y el registro de juegos |

**Compartido (`src/shared`)**
- `types.ts` se parte: lo común (estado, copias, conexión) se queda y lo de Minecraft
  (`Distribution`, `PropertyDefinition`, mundos, contenido) pasa a `shared/games/minecraft/`.
- `officialPlugins.ts` pasa a `shared/games/minecraft/`.
- `ipc.ts`: los canales exclusivos de Minecraft llevan prefijo `minecraft:` (`minecraft:worlds:list`…).

**Interfaz (`src/renderer/src`)**
- **Comunes:** `App`, `ServerPanel` (el armazón con el botón grande), `PlayersPanel`,
  `ConsolePanel`, `BackupPanel`, `D20Loader`, `ConfirmDelete`, `ModeChooser` y las piezas de conexión.
- **Pasan a `games/minecraft/`:** `BasicWizard`, `CreateWizard`, `ConfigPanel`, `WorldsPanel`,
  `ContentPanel` y `OfficialPlugins`.
- **Nuevo:** `GameChooser`, el paso previo al asistente. Mientras Minecraft sea el único juego no se
  muestra, para no añadir un clic sin sentido.

**Recursos y scripts**
- `resources/plugins/` pasa a `resources/minecraft/plugins/`. Hay que actualizar a la vez
  `bundledPluginPath`, `extraResources` de `electron-builder.yml` y la sincronización de
  plantillas de `release.mjs`.
- `smoke.ts` se parte en comunes + Minecraft; `e2e.ts` pasa a `e2e/minecraft.ts`. Cada juego nuevo
  tendrá su `e2e/<juego>.ts`.

### 0.3 Manifiesto v2 y migración de los servidores existentes

Hoy el manifiesto (`schemaVersion: 1`) guarda `minecraftVersion`, `javaMajor` y `jvmArgs` como si
todo servidor fuera de Minecraft. La v2:

```ts
interface InstanceManifest {
  schemaVersion: 2
  id: string
  name: string
  game: GameId                 // 'minecraft' | 'satisfactory' | ...
  expectedPlayers?: number
  exposure?: ExposureSettings
  backup: BackupSettings
  autoRestart: boolean
  createdAt: string
  agreements: string[]         // EULA de Minecraft, acuerdo de Steam...
  data: MinecraftData | ...    // lo específico de cada juego
}
```

- **La migración es automática y al abrir la app:** un manifiesto v1 se convierte en
  `game: 'minecraft'` con sus campos dentro de `data`.
- **Antes de migrar se guarda una copia** del manifiesto original (`instance.v1.json`). Si algo sale
  mal, el servidor no se pierde.
- **Prueba obligatoria:** la migración se ejecuta contra una **copia** de los manifiestos reales
  (hc-lobby, hc-partida, los-tilted-hardcock), no solo contra ejemplos inventados.
- **Los datos en disco no se mueven:** `instances/<id>/server`, `backups` y `runtimes` siguen donde
  están. Se añade `tools/` para SteamCMD en la fase 1.

### Hecho cuando

- `smoke`, `e2e` y `e2e:restart` pasan igual que antes.
- Los tres servidores reales migran, arrancan, paran, hacen copia y conservan sus plugins oficiales.
- La interfaz es idéntica en los dos modos. Comprobado con el recorrido de Playwright usado hasta ahora.
- Existe un juego falso en las pruebas (`dummy`) que registra un segundo juego y demuestra que el
  contrato no depende de Minecraft.
- ANALISIS.md y README describen la nueva estructura.

---

## Fase 1 — Cimientos comunes de Steam

> **Estado: hecha** (sin release propia). Resultados y decisiones en [ANALISIS.md §19.14](ANALISIS.md).
> - **Punto de decisión:** Ctrl+C **no** funciona, pero **Ctrl+Break sí**, y Valheim guarda y sale
>   limpio. El orden de las fases se mantiene.
> - SteamCMD: progreso en vivo desde `console_log.txt` (la salida estándar llega al final).
> - Pendiente de grabar con servidor real: WebRCON (Rust) y A2S de Valheim. Los dos exigen publicar
>   el servidor en la lista de Steam con la IP del usuario, y eso se decide antes de hacerlo. Se
>   graban, como tarde, en sus fases (7 y 3).
> - ~~Queda para cada juego: la interfaz de actualizaciones y de la comprobación con Steam.~~
>   **Hecho** (ANALISIS.md §19.18): Configuración → Servidor tiene la tarjeta «Versión», común a
>   todos los juegos, con aviso de versión nueva en los dos modos y elección de versión o rama en
>   avanzado. Incluye volver a una anterior, con copia previa y confirmación.

**Objetivo:** construir una sola vez lo que necesitan cinco de los seis juegos. Empieza por los
dos prototipos de riesgo, porque su resultado puede reordenar las fases siguientes.

### 1.1 Prototipos de riesgo (primero)

1. **Parada con Ctrl+C en Windows.**
   - Lanzar el servidor de Valheim con consola propia y oculta.
   - Seguir leyendo su salida.
   - Enviarle Ctrl+C (`GenerateConsoleCtrlEvent`).
   - Comprobar que guarda el mundo.
   - Probar también una alternativa sin dependencia npm (un ejecutable auxiliar mínimo).
2. **SteamCMD con progreso.**
   - Instalar un servidor de forma anónima.
   - Interpretar la salida (`Update state … progress: …`) para la barra de progreso.
   - Averiguar sus códigos de salida, que no siempre significan lo que parecen.
   - Comprobar que la segunda ejecución solo actualiza.

**Punto de decisión:**
- **Si el Ctrl+C funciona,** el orden se mantiene.
- **Si no,** Valheim y Enshrouded pasan al final y se investiga otra vía (por ejemplo, forzar
  guardados con `-saveinterval` corto y parar justo después de uno) antes de decidir si entran.

### 1.2 Piezas comunes

| Pieza | Qué hace | Quién la usa |
|---|---|---|
| **Gestor de SteamCMD** | Descarga `steamcmd.zip` a `tools/steamcmd`, instala y actualiza apps, informa del progreso, maneja la autoactualización y los reintentos | Todos menos Minecraft |
| **Estrategias de parada** | stdin · Source RCON · WebRCON · API HTTP · Ctrl+C, con tiempo límite y muerte forzada solo como último recurso (igual que hoy) | Todos |
| **Cliente Source RCON** | TCP, escrito a mano | Project Zomboid, Factorio |
| **Cliente WebRCON** | WebSocket nativo de Electron | Rust |
| **Consulta Steam A2S** | UDP, escrita a mano: estado y jugadores | Valheim, Enshrouded, Rust, Zomboid |
| **Puertos múltiples y UDP** | El modelo de conexión pasa de «un puerto TCP» a una lista de `{ nombre, puerto, protocolo }` | Todos |
| **Guías del router y playit.gg por protocolo** | Qué puertos abrir, en qué protocolo, y un túnel por puerto en playit | Todos |
| **Comprobación desde internet genérica** | Alternativa a mcstatus.io para juegos de Steam (a investigar: registro del servidor en Steam para la IP pública) | Juegos de Steam |
| **Requisitos de Windows** | Detectar Visual C++ Redistributable y avisar con enlace oficial, si algún juego lo exige | Por confirmar |
| **Actualizaciones de servidor** | Comprobar si hay versión nueva en Steam, avisar y actualizar con el servidor parado | Todos, crítico en Rust |
| **Acuerdos por juego** | El EULA de Minecraft se generaliza: cada juego declara qué hay que aceptar (acuerdo de Steam, términos de Mojang…) | Todos |

### Hecho cuando

- Los dos prototipos tienen resultado documentado en ANALISIS.md y el orden está confirmado.
- Las piezas tienen pruebas en `smoke` contra respuestas grabadas: RCON, A2S y la salida de SteamCMD.
- Minecraft usa ya la estrategia de parada genérica (stdin) sin cambios visibles.

---

## Fases 2 a 7 — Un juego cada vez

Todas siguen la **misma plantilla**, para que ningún juego llegue a medias. Y **a medias
significa también sin mods**: un juego se da por hecho cuando se puede jugar con él como juega la
gente, y en casi todos estos juegos eso incluye mods. Que después salgan mejoras es normal; empezar
la fase siguiente dejando un juego sin su forma de añadir contenido, no.

1. **Instalación y arranque** con la capa de la fase 1.
2. **Detección de «listo»** y **parada limpia** probadas contra el servidor real.
3. **Asistente básico:** qué preguntar en cada pantalla, con la misma regla que Minecraft (una
   pregunta, siempre con opción marcada, y el servidor queda configurado al terminar).
4. **Configuración avanzada:** lo que se desbloquea en modo avanzado.
5. **Copias de seguridad** de las carpetas de guardado del juego.
6. **Mods o contenido añadido.** Si el juego tiene una forma establecida de ampliarlo (un taller,
   un portal, un cargador), la fase la deja **hecha**: buscar o pegar la referencia, instalar,
   activar y quitar, avisar de actualizaciones, y que lo instalado llegue al servidor como el juego
   lo espera. Si el juego **no** tiene ninguna, se dice en su pantalla —como se hace con la
   moderación que no existe— y se anota por qué. Lo que no vale es dejarlo para más adelante.
7. **Jugadores y moderación** hasta donde el juego lo permita, y **explicando lo que no se puede**
   en vez de esconderlo.
8. **Conexión:** puertos, protocolo y guía.
9. **`e2e/<juego>.ts`:** instalar, arrancar, esperar a «listo», comprobar jugadores, parar limpio y
   confirmar que se guardó.
10. **Icono:** ya está dibujado en `src/renderer/src/games/<juego>/icon.svg`. Basta con importarlo en
    la interfaz del juego (`GameUi.icon`): el componente `GameIcon` lo pone solo en el selector de
    juego, la lista de servidores, la cabecera del servidor y la del asistente. No se sustituye por un logo oficial (ANALISIS.md §13.1).
11. **Documentación** en ANALISIS.md y README.

**Deuda de las fases cerradas antes de esta regla: saldada.** Las fases 2 y 3 se dieron por hechas
sin la parte de mods; ya la tienen:

| Juego | Cómo se amplía | Estado |
|---|---|---|
| Satisfactory (fase 2) | ficsit.app, con SML de cargador | **Hecho** (ANALISIS §19.23) |
| Valheim (fase 3) | Thunderstore, con BepInEx de cargador | **Hecho** (ANALISIS §19.23) |
| Factorio (fase 4) | Portal de mods oficial | Hecho en su fase |
| Project Zomboid (fase 5) | Steam Workshop | Hecho (ANALISIS §19.22) |
| Enshrouded (fase 6) | Nexus Mods, con Shroudtopia de cargador | Hecho en su fase (ANALISIS §19.24) |

Los cinco tienen buscar, pegar la referencia o traer el fichero, instalar con lo que el mod
necesite, encender y apagar, avisar de versiones nuevas y quitar. Satisfactory y Valheim comparten
pantalla (`CatalogModsPanel`) porque comparten forma —cargador y catálogo con buscador—; los otros
tres no, porque uno va por enlaces del taller de Steam, otro pide cuenta para descargar y el tercero
(Enshrouded) tiene cargador pero **ningún catálogo que se pueda consultar**: Nexus Mods no deja
descargar sin cuenta de pago, así que el fichero lo trae el usuario.

### Fase 2 — Satisfactory (0.5.0)

> **Estado: hecha** (pendiente de publicar como 0.5.0). Detalle, hallazgos del servidor real,
> decisiones y verificación en [ANALISIS.md §19.15](ANALISIS.md). Cambios respecto a este plan:
> - **Se lanza `FactoryServer-Win64-Shipping-Cmd.exe`, no `FactoryServer.exe`**, que es solo un
>   lanzador: con él, ni el PID ni la salida son los del servidor.
> - **Aislar los guardados exige `-UserDir` + `-SavesUseProjectSavedDir`.** Con el primero solo, el
>   servidor escribe en la carpeta del juego del usuario. Es la misma trampa que Project Zomboid.
> - **Solo puede haber un servidor de Satisfactory a la vez:** el puerto 8888 de su mensajería no
>   sigue al del juego (comprobado).
> - **El límite de jugadores** se sube con `-ini:Engine:[SystemSettings]:net.MaxPlayersOverride=N`.
> - El contrato gana dos piezas que ya se preveían: `poll()` (estado por API, porque este juego no
>   cuenta nada por el registro) y `hidden` en las líneas del registro (el suyo es ruido casi
>   entero). `checkFromInternet` pasa a ser opcional.
> - **Decisión de flujo resuelta:** se mantiene preguntar el modo tras elegir juego (opción A).
> - **La moderación no existe** desde fuera del juego, y la API da cuántos jugadores hay pero no
>   quiénes: las capacidades `moderation`, `playerNames`, `commands` y `externalCheck` lo declaran y
>   cada pantalla lo explica.
> - **No se entra por IP directa:** el juego pide un token que solo se consigue añadiendo el servidor
>   desde su menú, y si no da «Encryption token missing». La pantalla de conexión enseña los pasos
>   (`joinSteps`) y la consola traduce el rechazo.

- **Selector de juego:** es la primera fase con dos juegos, así que estrena la pantalla de elegir
  juego según el boceto aprobado: tarjeta con qué es el juego, jugadores, memoria comparada con la
  del equipo, tamaño de descarga, etiquetas para lo que cambia la decisión y el icono propio. El
  de Minecraft ya está integrado (lista de servidores, cabeceras y selector); aquí se añade el de
  Satisfactory en `satisfactoryUi.icon`. **Decidido:** tras elegir juego se sigue preguntando el
  modo (opción A), porque esa pantalla es donde se explican el básico y el avanzado.

- **Asistente:** nombre, contraseña de administrador, contraseña para jugadores, jugadores esperados
  y conexión. **La app reclama el servidor sola** por la API (`PasswordlessLogin` + `ClaimServer`),
  así que no hace falta abrir el juego para configurarlo.
- **Partidas:** crear, cargar y descargar por la API (`CreateNewGame`, `LoadGame`, `DownloadSaveGame`).
  La pestaña Mundos se convierte en «Partidas».
- **Parada:** `Shutdown` por la API. **Listo:** `HealthCheck`. **Jugadores:** `QueryServerState`.
- **Aviso de RAM:** 8 GB mínimo, 16 GB con partidas grandes o más de 4 jugadores.
- **A resolver:** aceptar el certificado autofirmado solo para esa conexión, y hasta dónde llega la
  moderación en la API.
- **Mods (añadido después, ANALISIS §19.23):** ficsit.app con SML de cargador. Buscar, instalar con
  sus dependencias, encender, apagar, actualizar y quitar. Solo se instalan los que publican versión
  `WindowsServer`; los de cliente se marcan como tales en el buscador.

### Fase 3 — Valheim (0.6.0)

> **Estado: hecha** (pendiente de publicar como 0.6.0). Detalle, hallazgos del servidor real,
> decisiones y verificación en [ANALISIS.md §19.16](ANALISIS.md). Cambios respecto a este plan:
> - **Las reglas de sí/no no van por `-modifier`, sino por `-setkey`** (`nomap`, `nobuildcost`,
>   `passivemobs`, `playerevents`, `noportals`). El servidor rechaza la otra forma con una línea de
>   registro y arranca igual, así que el ajuste no se aplicaría y nadie se enteraría.
> - **La contraseña mínima de 5 caracteres la comprueba la app, no el servidor:** el servidor 1.0.12
>   arranca con cuatro (probado). Lo mismo con la contraseña metida en el nombre del servidor.
> - **El crossplay se ha modelado como un modo de exposición** (`ExposureMode` gana `crossplay`), no
>   como un ajuste del juego: es la forma de jugar desde fuera sin tocar el router, igual que
>   playit.gg, y así la pantalla de conexión y su ayuda salen por el sitio de siempre.
> - **Se añade la pestaña Mundos** (crear, cambiar y borrar), que no estaba en este plan: el modelo
>   de Valheim es el mismo que el de Minecraft y `-savedir` ya lo dejaba servido.
> - **Con `-public 0` el servidor no contesta al A2S**, ni desde el propio equipo: sin publicarlo no
>   hay forma de preguntarle el estado ni los jugadores, y la app lo dice en vez de fingir que sí.
> - El contrato gana `ParsedEvent.joinCode` (el código de crossplay solo se sabe por el registro) y
>   `StopStrategy.retryEveryMs` (Ctrl+Break se ignora mientras se genera el mundo, así que se repite).
> - **El A2S está grabado** con el servidor publicado medio minuto y parado justo después: solo
>   contesta en el puerto de consulta, el mundo no viaja en la respuesta y la versión buena está en
>   las palabras clave, no en `version`.
> - **Vetar echa al jugador que está dentro** (comprobado por el usuario jugando), así que la
>   moderación es una capacidad de verdad y sus botones están en la pantalla principal, junto a
>   quién está conectado. Las capacidades se parten en `playerIds` y `playerNames`.
> - **El crossplay está probado** de punta a punta. Y de ahí salió el fallo más gordo de la fase:
>   con `-crossplay` **no aparece «Opened Steam server»**, que era la señal de «listo», sino
>   «Opened PlayFab server». Sin eso, un servidor con crossplay se quedaba «Arrancando» para
>   siempre. Además el servidor escribe la IP pública del equipo, que la app esconde.
> - **Sin grabar** quedan solo las dos líneas de conexión de jugadores, cuyo comportamiento sí
>   está comprobado (`scripts/smoke/fixtures/valheim/sinteticas.txt`).

- **Asistente:** nombre, contraseña (mínimo 5 caracteres, **confirmado: lo exige la app**), nombre
  del mundo, *preset* de dificultad, modificadores y conexión.
- **Crossplay como opción recomendada para quien no puede abrir puertos:** sin router y con código
  de 6 dígitos. La pantalla principal enseña ese **código** en lugar de la IP.
- **Parada:** Ctrl+Break (`ctrl-break`, fase 1; esperar a «Opened Steam server»). **Copias:** carpeta de mundos fijada con `-savedir` dentro de la
  instancia, para que la copia de seguridad sepa dónde está.
- **Moderación:** edición de `adminlist.txt`, `bannedlist.txt` y `permittedlist.txt`. El servidor
  las relee al vuelo, así que **vetar echa al jugador al momento**; los botones están en la
  pantalla principal, junto a quién está conectado.
- **Mods (añadido después, ANALISIS §19.23):** Thunderstore con BepInEx de cargador. El cargador se
  engancha con el `winhttp.dll` de al lado del ejecutable, sin tocar la línea de órdenes, y la
  parada limpia con Ctrl+Break sigue funcionando con él puesto (comprobado). ⚠ La carpeta de datos
  de la app no puede estar muy metida en el disco: BepInEx se queda en los 260 caracteres de Windows.

### Fase 4 — Factorio (0.7.0)

> **Estado: hecha** (pendiente de publicar como 0.7.0). Detalle, hallazgos del juego real,
> decisiones y verificación en [ANALISIS.md §19.19](ANALISIS.md). Cambios respecto a este plan:
> - **En Windows no hay control por stdin.** `factorio.exe` es un binario de subsistema GUI y no
>   tiene entrada estándar utilizable, así que **todo va por RCON**, que la app pone sola y ata a
>   `127.0.0.1`. Ctrl+Break tampoco vale.
> - **Factorio ignora el paquete terminador de RCON**, que el cliente de la app esperaba siempre:
>   había que arreglar el cliente común para que funcione con los dos comportamientos.
> - **El servidor se adelgaza:** sin imágenes ni sonidos, la copia pasa de 5,1 GB a 246 MB con los
>   mismos checksums de prototipos. Cada servidor tiene la suya.
> - **La descarga no se guarda:** va a una carpeta temporal, se copia adelgazada y se borra (0 GB
>   fijos). Cambiar de versión vuelve a descargar, porque Steam no sabe actualizar sobre una
>   instalación recortada.
> - **La estable (2.0.77) no termina de cerrarse** tras guardar. Como la partida ya está en disco,
>   agotar el plazo y cerrar el proceso es seguro.
> - **Los mods del portal están hechos y probados** (buscar, instalar, activar y quitar). La API del
>   portal no sabe buscar por texto, así que la app se trae el índice entero (13 MB), lo cachea y
>   filtra en local.

- **Obtener el servidor en Windows exige tener el juego.** La app ofrece, por este orden:
  1. Copiar una instalación que ya exista en el equipo (no descarga nada).
  2. Descargarlo de Steam con la cuenta del usuario, que es la que lo tiene comprado.

  Nunca guarda la contraseña: se le pasa a SteamCMD por la entrada estándar, se usa una vez y
  después valen las credenciales que Steam deja en su caché. Lo único que se guarda es el nombre de
  usuario. Lo de iniciar sesión en factorio.com se quedó solo para el portal de mods.
- **Asistente:** de dónde sale el juego, nombre, contraseña, Space Age sí/no, mapa (preset) y
  conexión. En avanzado, además: jugadores, semilla, autoguardado, comandos y verificación de cuentas.
- **Configuración:** `server-settings.json`, reescrito en cada arranque desde el manifiesto.
  **Parada y moderación:** RCON, con los ficheros `server-adminlist.json` y `server-banlist.json`
  como respaldo para quien no está conectado.
- **Space Age:** se decide al crear y no se puede cambiar, porque el mapa se genera con esos mods.
  Solo se ofrece si el juego que llega lo trae: con SteamCMD solo baja si la cuenta lo tiene.
- **Verificación de cuentas:** encendida por defecto. Impide que alguien entre con el nombre de
  otro, a cambio de que el servidor consulte a `auth.factorio.com` al arrancar, y se dice.

### Fase 5 — Project Zomboid (0.8.0)

> **Estado: hecha** (pendiente de publicar como 0.8.0). Detalle, hallazgos del servidor real,
> decisiones y verificación en [ANALISIS.md §19.22](ANALISIS.md). Cambios respecto a este plan:
> - **Las dos incógnitas, resueltas:** el puerto de RCON por defecto es el **27015**, y el 16262 es
>   el segundo puerto UDP de datos de jugador (`UDPPort`). **Sin Steam ni siquiera se abre**: el
>   servidor escucha solo en el de juego, así que solo se pide abrir uno.
> - **El servidor arranca sin Steam** (`-Dzomboid.steam=0`), que no estaba en el plan y cambia
>   bastante: con Steam, el servidor **sale en el navegador de servidores de Steam aunque
>   `Public=false`**, y eso publica la dirección del usuario. Encenderlo es una casilla del modo
>   avanzado, con el aviso al lado.
> - **Sin Steam el servidor no contesta al A2S** en ningún puerto, así que «¿responde?» y «cuánta
>   gente hay» van por **RCON**. Y sin contraseña de RCON el servidor ni abre el puerto, así que la
>   app genera una siempre.
> - **La instalación incluye un primer arranque** de minuto y medio: los ficheros de configuración
>   —y sus explicaciones— los escribe el propio servidor, y escribirlos la app sería inventárselos.
>   Antes de ese arranque se siembra un `.ini` con el puerto y el RCON, que el servidor completa.
> - **Los jugadores no salen del registro, sino de RCON.** El contrato gana `LiveStatus.players`:
>   la lista entera, que manda sobre la que se venía armando con el registro.
> - **El editor de `SandboxVars.lua` es un formato más de `formats/editable/`**, no un editor
>   aparte: saca de los comentarios del juego la explicación, los límites y **el nombre de cada
>   valor**. `ConfigOption` gana `allowedLabels`.
> - **La dificultad son los seis preajustes del propio juego**, aplicados sobre el fichero comentado
>   en vez de copiados encima.
> - **Project Zomboid no arranca si llega a su carpeta por un enlace** (`mklink /J`): la `e2e` no
>   puede enlazar la instalación compartida como hacen las de Valheim y Satisfactory, y mueve una
>   copia de verdad.
> - **Moderar exige el servidor arrancado:** las cuentas viven en un SQLite que él tiene abierto.
>   Leerlo se puede siempre, y la pantalla lo explica en vez de esconder los botones.
> - **Mods del taller de Steam, hechos** (se añadieron al cambiar la regla de la plantilla). Se
>   descargan **sin cuenta** con SteamCMD, se copian a `Zomboid/mods` y la app rellena sola las tres
>   claves que el servidor necesita. Dos trampas medidas: la Build 42 **exige la carpeta de versión**
>   dentro del mod (uno al estilo antiguo no se encuentra), y manda la **serie mayor**, no «la más
>   alta que no pase». Lo que no se puede arreglar y se dice: sin Steam, **cada jugador tiene que
>   suscribirse él** a los mismos mods.

- **Asistente:** nombre, contraseña de administrador (se pasa por argumento para que el primer
  arranque no se quede esperando en la consola), jugadores, PvP, *preset* de dificultad y conexión.
- **Configuración:** `servertest.ini` con el editor clave=valor extraído en la fase 0.
  `SandboxVars.lua` necesita su propio editor: **elegir pocas opciones para el modo básico** y el
  resto en avanzado.
- **Memoria:** control de `-Xmx`, igual que la memoria de Minecraft.
- **Parada, jugadores y moderación:** consola por stdin y RCON. Es la experiencia más completa
  después de Minecraft.
- **Mods:** el taller de Steam, pegando el enlace del mod. Instalar, encender y apagar, ordenar,
  avisar de actualizaciones y quitar.

### Fase 6 — Enshrouded (0.9.0)

> **Estado: hecha** (pendiente de publicar como 0.9.0). Detalle, hallazgos del servidor real,
> decisiones y verificación en [ANALISIS.md §19.24](ANALISIS.md). Cambios respecto a este plan:
> - **Enshrouded no se puede dejar de publicar.** No hay `-public 0` ni casilla: en cuanto arranca
>   se registra en Steam y sale en la lista del juego con la IP de casa. Es el caso de Rust, no el
>   de Valheim, y se dice en la tarjeta del juego, en el asistente y antes de abrir el router. Lo
>   único que impide que entre cualquiera son las contraseñas de los roles, así que **los cuatro
>   nacen con una**.
> - **El README oficial del servidor documenta mal su propio fichero.** La lista de vetados se llama
>   `bannedAccounts` y no `bans`, el identificador es `accountId` (un número, no un hash) y la fecha
>   va dentro de un objeto. Con los nombres del README el servidor borra la lista al reescribir y la
>   moderación no haría nada, sin un solo mensaje.
> - **La trampa del preajuste, confirmada y medida**: con cualquiera que no sea `Custom`, el
>   servidor ignora los `gameSettings` **y el fichero se queda con ellos puestos**, así que parece
>   que están aplicados. La app pone `Custom` sola en cuanto algo se aparta del preajuste.
> - **Y el servidor vuelca por consola los ajustes que de verdad aplica**, lo que permitió medir los
>   cuatro preajustes arrancándolo una vez con cada uno, en vez de copiarlos de una wiki.
> - **Sí hay moderación, aunque poca**: quitar un veto. Echar no se puede ni desde dentro de la app
>   ni por fichero («Dedicated server kick not implemented», en su propio ejecutable): se hace desde
>   el juego con la contraseña de Administrador.
> - **Ctrl+Break vale tal cual**, y es el juego que más rápido arranca y para de toda la app (3 s y
>   0,5 s). Pero mandado **antes** de que esté listo mata el proceso con `0xC000013A` sin guardar,
>   así que hace falta el mismo reintento que en Valheim.
> - **Un solo puerto UDP**, medido con netstat: no abre el siguiente.
> - **Se añade la pestaña Mundos**, que no estaba en este plan, igual que pasó en Valheim.
> - **Los jugadores se cuentan, no se listan**: el número sale de la consulta de Steam, que contesta
>   siempre porque el servidor siempre está publicado.

- **Asistente:** nombre, mundo, jugadores, **dos contraseñas de rol** (Administrador y Amigo),
  *preset* de dificultad y conexión. Los otros dos roles, en avanzado.
- **Configuración:** `enshrouded_server.json`. **La app pone `gameSettingsPreset: "Custom"` sola**
  al tocar cualquier ajuste, porque si no el servidor los ignora en silencio. Y conserva la lista de
  vetados que haya, porque esa la escribe el servidor desde el juego.
- **Parada:** Ctrl+Break, ya resuelto en Valheim. **Puerto:** un único UDP (`queryPort` 15637).
- **Moderación:** lo único que hay desde fuera es **quitar un veto**. Se dice lo que no se puede.
- **Mods: era la incógnita de la fase, y sí hay forma.** **Shroudtopia** de cargador (MIT, binarios
  en GitHub, se engancha con un `winmm.dll` como BepInEx en Valheim, funciona en dedicado y lo
  cuenta todo por la consola). Los mods viven en **Nexus Mods**, que no deja descargar sin cuenta de
  pago: no hay buscador y se dice, el usuario trae el fichero y la app hace todo lo demás. Apagar un
  mod es sacarlo de `mods/`: poner `"active": false` no basta (medido).

### Fase 7 — Rust (0.10.0)

- **Asistente:** nombre, descripción, tamaño y semilla del mapa, jugadores y conexión. El asistente
  avisa del peso real: RAM, tiempo de arranque y disco **(a medir)**.
- **Control:** WebRCON para parar, guardar, ver jugadores, expulsar y banear.
- **El borrado mensual:** recordatorio del primer jueves de cada mes, actualización guiada y
  explicación de qué es un *wipe*. Opción de programarlo.
- **Mods:** Oxide/Carbon, que es como se amplía Rust. Entra en la fase, como en todos los demás:
  instalar el cargador sobre el servidor, gestionar los plugins que se dejan caer en su carpeta y
  avisar de que un *wipe* o una actualización del juego pueden romperlos.
- **0.10.0:** con los seis juegos, revisión general de textos que todavía digan «Minecraft» donde no
  toca, rendimiento con varios servidores a la vez y guía de requisitos por juego.

---

## Riesgos que cruzan todas las fases

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El Ctrl+C no funciona de forma fiable | Valheim y Enshrouded pueden perder partida al parar | **Resuelto en la fase 1:** Ctrl+C no llega, Ctrl+Break sí y guarda |
| Abstracción con forma de Minecraft | Cada juego nuevo obliga a rehacer la capa | Contrato diseñado contra dos juegos a la vez y juego `dummy` en las pruebas |
| Migración del manifiesto | Servidores existentes que no abren | Copia `instance.v1.json`, prueba contra copias reales, migración idempotente |
| Pruebas `e2e` que descargan varios GB | Pruebas lentísimas | `e2e` por juego y bajo demanda, con caché de instalación entre ejecuciones |
| Varios servidores pesados en el mismo PC | Equipo sin RAM | Aviso de RAM por juego y de lo que ya está en marcha antes de arrancar otro |
| Parches de los juegos que cambian ficheros o puertos | Configuración que deja de aplicarse | `smoke` de contrato por juego, como ya se hace con las APIs de Minecraft |
| Antivirus que bloquean SteamCMD | La instalación falla sin explicación | Diagnóstico con mensaje claro, como los de Minecraft |
| Marcas registradas | Problemas de imagen o de avisos legales | Aviso «no oficial» por juego, igual que el de Mojang, y sin logos oficiales |

---

## Futuro (fuera de esta hoja de ruta)

- **Juegos propuestos sin investigar** (lista en INVESTIGACION-JUEGOS.md §5): pasarán la misma criba
  y, si entran, seguirán la plantilla de las fases 2 a 7.
- **Dyson Sphere Program con el mod Nebula,** como integración experimental, si hay demanda.
- **Los mods ya no viven aquí:** son parte de la fase de cada juego (punto 6 de la plantilla). Lo
  que queda para más adelante son las mejoras sobre lo que cada fase deje hecho —catálogos con
  buscador propio, dependencias resueltas solas, perfiles de mods—, no la función en sí.
