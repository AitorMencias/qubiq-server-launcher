# Hoja de ruta multijuego

Plan para que QubiQ gestione, además de Minecraft, los seis juegos que pasaron la criba de
[INVESTIGACION-JUEGOS.md](INVESTIGACION-JUEGOS.md): Satisfactory, Valheim, Project Zomboid,
Enshrouded, Rust y Factorio. Los juegos propuestos sin investigar quedan para más adelante (ver «Futuro», al final).

## Resumen

| Fase | Qué | Versión | Depende de |
|---|---|---|---|
| **0** | Preparar la app para varios juegos y llevar Minecraft a su subcarpeta | 0.4.0 | — |
| **1** | Cimientos comunes de Steam: SteamCMD, parada limpia, RCON, A2S, UDP | (sin release propia) | 0 |
| **2** | Satisfactory | 0.5.0 | 1 |
| **3** | Valheim | 0.6.0 | 1 (parada con Ctrl+Break, ya validada) |
| **4** | Project Zomboid | 0.7.0 | 1 |
| **5** | Enshrouded | 0.8.0 | 3 |
| **6** | Rust | 0.9.0 | 1 |
| **7** | Factorio | 0.10.0 | 1 |

**Por qué este orden:** primero lo que tienen en común todos los juegos, luego los juegos de menos
a más riesgo, y cada juego nuevo aprovechando lo que dejó el anterior.
- **Satisfactory va primero:** no depende del Ctrl+C y su API oficial pone a prueba la capa de
  Steam de principio a fin sin trucos.
- **Valheim:** estrena la parada por señal de consola (Ctrl+Break: Ctrl+C no llega, ver fase 1).
- **Enshrouded:** reutiliza esa misma parada (Ctrl+Break).
- **Project Zomboid:** se parece mucho a Minecraft y aprovecha casi toda la gestión existente.
- **Rust y Factorio, al final:** cada uno trae un problema propio (el borrado mensual obligatorio y
  el inicio de sesión con cuenta) que no conviene mezclar con el trabajo de base.

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
>   graban, como tarde, en sus fases (6 y 3).
> - Queda para cada juego: la interfaz de actualizaciones y de la comprobación con Steam. El núcleo
>   y el IPC ya existen; sin un juego que los use no tienen pantalla que enseñar.

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

Todas siguen la **misma plantilla**, para que ningún juego llegue a medias:

1. **Instalación y arranque** con la capa de la fase 1.
2. **Detección de «listo»** y **parada limpia** probadas contra el servidor real.
3. **Asistente básico:** qué preguntar en cada pantalla, con la misma regla que Minecraft (una
   pregunta, siempre con opción marcada, y el servidor queda configurado al terminar).
4. **Configuración avanzada:** lo que se desbloquea en modo avanzado.
5. **Copias de seguridad** de las carpetas de guardado del juego.
6. **Jugadores y moderación** hasta donde el juego lo permita, y **explicando lo que no se puede**
   en vez de esconderlo.
7. **Conexión:** puertos, protocolo y guía.
8. **`e2e/<juego>.ts`:** instalar, arrancar, esperar a «listo», comprobar jugadores, parar limpio y
   confirmar que se guardó.
9. **Icono:** ya está dibujado en `src/renderer/src/games/<juego>/icon.svg`. Basta con importarlo en
   la interfaz del juego (`GameUi.icon`): el componente `GameIcon` lo pone solo en el selector de
   juego, la lista de servidores, la cabecera del servidor y la del asistente. No se sustituye por un logo oficial (ANALISIS.md §13.1).
10. **Documentación** en ANALISIS.md y README.

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

### Fase 3 — Valheim (0.6.0)

- **Asistente:** nombre, contraseña (mínimo 5 caracteres, **a confirmar**), nombre del mundo,
  *preset* de dificultad, modificadores y conexión.
- **Crossplay como opción recomendada para quien no puede abrir puertos:** sin router y con código
  de 6 dígitos. La pantalla principal enseña ese **código** en lugar de la IP.
- **Parada:** Ctrl+Break (`ctrl-break`, fase 1; esperar a «Opened Steam server»). **Copias:** carpeta de mundos fijada con `-savedir` dentro de la
  instancia, para que la copia de seguridad sepa dónde está.
- **Moderación:** edición de `adminlist.txt`, `bannedlist.txt` y `permittedlist.txt`, explicando que
  hay que reiniciar para aplicar los cambios **(a confirmar)**.

### Fase 4 — Project Zomboid (0.7.0)

- **Asistente:** nombre, contraseña de administrador (se pasa por argumento para que el primer
  arranque no se quede esperando en la consola), jugadores, PvP, *preset* de dificultad y conexión.
- **Configuración:** `servertest.ini` con el editor clave=valor extraído en la fase 0.
  `SandboxVars.lua` necesita su propio editor: **elegir pocas opciones para el modo básico** y el
  resto en avanzado.
- **Memoria:** control de `-Xmx`, igual que la memoria de Minecraft.
- **Parada, jugadores y moderación:** consola por stdin y RCON. Es la experiencia más completa
  después de Minecraft.
- **A resolver:** puerto RCON por defecto y papel exacto del puerto 16262.

### Fase 5 — Enshrouded (0.8.0)

- **Asistente:** nombre, jugadores, *preset* de dificultad y **roles con contraseña** (Admin,
  Amigo, Invitado), que es su forma de gestionar permisos.
- **Configuración:** `enshrouded_server.json`. **La app pone `gameSettingsPreset: "Custom"` sola**
  al tocar cualquier ajuste, porque si no el servidor los ignora en silencio.
- **Parada:** Ctrl+Break, ya resuelto en Valheim. **Puerto:** un único UDP (`queryPort` 15637).
- **Moderación:** no hay desde fuera del juego. Se dice claramente en su pestaña.

### Fase 6 — Rust (0.9.0)

- **Asistente:** nombre, descripción, tamaño y semilla del mapa, jugadores y conexión. El asistente
  avisa del peso real: RAM, tiempo de arranque y disco **(a medir)**.
- **Control:** WebRCON para parar, guardar, ver jugadores, expulsar y banear.
- **El borrado mensual:** recordatorio del primer jueves de cada mes, actualización guiada y
  explicación de qué es un *wipe*. Opción de programarlo.
- **Fuera de alcance en esta versión:** Oxide/Carbon. Van al futuro junto a la gestión de plugins de Rust.

### Fase 7 — Factorio (0.10.0)

- **Obtener el servidor en Windows exige tener el juego.** La app ofrece, por este orden:
  1. Usar una instalación de Steam que ya exista en el equipo.
  2. Iniciar sesión en factorio.com para descargarlo.

  Nunca guarda la contraseña: solo el token que devuelva el servicio, y cifrado con la protección
  de datos de Windows **(a confirmar el mecanismo)**.
- **Asistente:** nombre, contraseña, jugadores, mapa (ajustes de generación), Space Age sí/no y conexión.
- **Configuración:** `server-settings.json`. **Parada y moderación:** stdin y RCON.
- **A resolver:** los problemas de Space Age en servidores de Windows y la descarga de mods del
  portal oficial, que también pide credenciales.
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
- **Plugins y mods** de los juegos nuevos: Oxide/Carbon en Rust, mods de Valheim (BepInEx), mods de
  Zomboid (Workshop) y el portal de Factorio.
