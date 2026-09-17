# QubiQ Server Launcher

Crea y gestiona tu servidor de juegos en tres clics.

Aplicación de escritorio para Windows que descarga, configura, arranca y modera servidores de
**Minecraft**, **Satisfactory** y **Valheim** sin que el usuario tenga que instalar Java, editar
ficheros de configuración ni tocar la línea de comandos. Van llegando más juegos por fases.

> NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
> Herramienta no oficial: no está asociada a los estudios de los juegos que gestiona.

El análisis completo —decisiones, arquitectura, fuentes de datos y hoja de ruta— está en
[ANALISIS.md](ANALISIS.md). La ampliación a otros juegos está investigada en
[INVESTIGACION-JUEGOS.md](INVESTIGACION-JUEGOS.md) y planificada en
[HOJA-DE-RUTA-MULTIJUEGO.md](HOJA-DE-RUTA-MULTIJUEGO.md).

---

## Estado

MVP funcional. Tres juegos, con todas sus distribuciones instalándose, arrancando y parando:

| Juego | Instalación | Arranque | Notas |
|---|---|---|---|
| Minecraft original (vanilla) | ✅ | ✅ | Verificación SHA-1 |
| Minecraft · Plugins (Paper) | ✅ | ✅ | API v3, verificación SHA-256 |
| Minecraft · Mods (Fabric) | ✅ | ✅ | Descarga dependencias en el primer arranque |
| Minecraft · Mods (Forge) | ✅ | ✅ | Instalador en dos fases + argfile |
| Satisfactory | ✅ | ✅ | SteamCMD (15,5 GB); la app reclama el servidor y crea la partida sola |
| Valheim | ✅ | ✅ | SteamCMD (2 GB); crossplay con código, sin abrir puertos |

Funciones disponibles:

- **Dos modos** — al crear un servidor eliges entre **básico** (no pregunta versión, memoria ni puerto)
  y **avanzado** (todo). Cambiable después desde la barra lateral. En los dos, la pantalla del servidor
  es un botón grande INICIAR/PARAR, los jugadores y la consola; el resto está en *Configuración*, donde
  el avanzado desbloquea más opciones.
- **Crear** — en básico, un recorrido paso a paso (una pregunta por pantalla) por nombre, tipo,
  jugadores, modo de juego, dificultad, tipo de mundo, peleas entre jugadores y conexión, que acaba en
  un resumen editable y deja el servidor ya configurado; en avanzado, formulario completo. Java
  automático y EULA explícito en ambos
- **Lanzar** — arranque supervisado, consola en vivo, parada limpia
- **Configurar** — editor visual de `server.properties` con lenguaje llano y modo avanzado
- **Mundos** — varios mundos por servidor: crear, cambiar de uno a otro y borrar
- **Plugins y mods** — webs donde descargarlos, guía paso a paso, botón para abrir la carpeta y
  lista de lo instalado con activar/desactivar (solo en Paper, Fabric y Forge)
- **Plugins oficiales** — los nuestros viajan dentro de la app: se instalan con un botón y se
  configuran con un formulario, sin tocar ficheros YAML
- **Moderar** — quién está conectado, con las acciones que permita cada juego: en Minecraft expulsar,
  banear y dar OP por la consola; en Valheim, hacer administrador, invitar o vetar escribiendo en sus
  listas. Lo que un juego no deja hacer se dice, en vez de esconderlo
- **Borrar** — elimina el servidor con confirmación escribiendo su nombre
- **Copias de seguridad** — en caliente, restauración, retención y programadas
- **Conexión** — direcciones local y de red verificadas con el protocolo real de cada juego, y
  elección entre abrir puertos en el router o playit.gg, con guía paso a paso (por puerto y
  protocolo) y comprobación desde internet donde el juego lo permite
- **Varios juegos** — al crear se elige juego en una pantalla que compara jugadores, memoria frente a
  la del equipo, descarga y lo que cambia la decisión. Cada juego aporta su asistente y sus pestañas,
  y la app dice lo que ese juego **no** deja hacer en vez de esconderlo
- **Satisfactory** — se instala de Steam, se reclama solo (sin abrir el juego), y desde la app se
  gestionan sus partidas (crear, cargar, guardar, borrar) y sus ajustes en caliente por su API
- **Valheim** — se instala de Steam, se juega desde fuera **sin abrir puertos** con el crossplay del
  propio juego (la app enseña el código de 6 dígitos), varios mundos por servidor, dificultad y
  modificadores en cristiano, y moderación por las tres listas del juego

---

## Requisitos

- **Windows 10/11** (x64 o arm64)
- **Node.js 22 o superior** — para desarrollar
- Nada más. **Java lo gestiona la propia app**: descarga el JDK que exija cada versión de
  Minecraft desde Adoptium y lo guarda compartido entre instancias.

---

## Puesta en marcha

```bash
npm install
npm run dev
```

O simplemente haz doble clic en **`dev.bat`**: se planta en la carpeta del proyecto, instala lo
que falte la primera vez y arranca el modo desarrollo.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca la app en modo desarrollo con recarga en caliente |
| `dev.bat` | Lo mismo con doble clic, comprobando antes Node, las dependencias y el binario de Electron |
| `release.bat` / `npm run release` | Genera una release: pide la versión, sincroniza la plantilla de cada plugin oficial con su jar, pasa las pruebas y empaqueta en `release-nueva/`; solo si sale bien sustituye `release/` entera, que queda con la versión nueva y nada más. Si algo falla, deja la versión y la release anterior como estaban. Si la prueba de humo solo falla por no llegar a un servicio externo, pregunta si seguir. Acepta `0.3.0`, `--e2e`, `--no-e2e` y `--allow-offline` para no preguntar |
| `npm run build` | Compila a `out/` |
| `npm start` | Ejecuta lo compilado |
| `npm run typecheck` | Comprueba tipos de los tres lados (main, preload, renderer) |
| `npm run smoke` | 415 comprobaciones. Comunes: migración del manifiesto, un juego falso que recorre el contrato entero, reinicio, red y que no haya caracteres de control invisibles en el código. De Steam, contra respuestas reales grabadas: SteamCMD, RCON, A2S, WebRCON, parada con Ctrl+Break, puertos UDP, Visual C++ y firmas. De Satisfactory, contra las respuestas reales grabadas de su API: reclamar, estado, partidas, ajustes, errores, argumentos de arranque y lectura de su registro. De Valheim, contra las líneas reales de su registro y la consulta de Steam grabada de su servidor publicado: argumentos de arranque, catálogo de dificultad y modificadores, lectura del registro, A2S, parada, validaciones del asistente y listas de moderación. De Minecraft: lógica pura, mundos, plugins oficiales y contrato con las APIs externas |
| `npm run e2e [dist]` | Ciclo completo con un servidor real: instalar, arrancar, ping, copia en caliente, parada limpia, restauración y borrado. `dist`: `paper` (por defecto), `vanilla`, `fabric`, `forge` |
| `npm run e2e:restart` | Reinicio a petición del servidor: comprueba que reinicia cuando el plugin lo pide y que **no** reinicia cuando la parada es manual |
| `npm run e2e:satisfactory` | **Con todos los servidores de Satisfactory parados** (solo puede haber uno a la vez). Satisfactory de verdad: instalar, reclamar el servidor sin abrir el juego, arrancar, detectar «listo» por su API, puertos, partidas, ajustes en caliente, copia con el servidor en marcha, parada limpia, restauración y **comprobar que no se ha tocado `%LOCALAPPDATA%\FactoryGame`**. Reutiliza la instalación de `%LOCALAPPDATA%\qubiq-dev\steam\satisfactory` con un enlace; `-- --descargar` baja los 15,5 GB de cero |
| `npm run e2e:valheim` | Valheim de verdad: instalar, arrancar generando el mundo, puertos UDP, moderación, copia en caliente esperando a que el servidor guarde, parada con Ctrl+Break, parar mientras arranca, mundos, restauración y **comprobar que no se ha tocado la carpeta de Valheim del usuario**. Reutiliza la instalación de `%LOCALAPPDATA%\qubiq-dev\steam\valheim` con un enlace; `-- --descargar` baja los 2 GB de cero. No publica el servidor: arranca con `-public 0` y sin crossplay |
| `npm run e2e:steam` | Cimientos de Steam con servidores reales: descarga y firma de SteamCMD, instalación de Valheim (~2 GB) con progreso, segunda ejecución sin descarga, comprobación de actualizaciones, viaje de ida y vuelta a una rama anterior y parada con Ctrl+Break que guarda el mundo. Lo descargado se reutiliza entre ejecuciones (`%LOCALAPPDATA%\qubiq-dev\e2e-steam`); `-- --limpio` empieza de cero |

`npm run smoke` es el que avisa cuando una API de terceros cambia. La v2 de Paper murió de un día
para otro; sin esta prueba la app se rompería en silencio.

Si no consigue **llegar** a un servicio, no lo cuenta como fallo sino como **SIN CONEXIÓN**, y sale con
código 2 en vez de 1: no poder conectar no dice nada de si la API ha cambiado. Pasa de verdad: los
operadores españoles bloquean IPs compartidas de Cloudflare durante los partidos de LaLiga, y con
ellas cae `meta.fabricmc.net`.

`npm run e2e` descarga de verdad (Java ~200 MB + servidor) y tarda unos minutos la primera vez.

---

## Generar el ejecutable

```bash
npm run dist
```

Deja en `release/` dos ejecutables de ~106 MB:

| Fichero | Para qué |
|---|---|
| `QubiQ-Server-Launcher-Setup-<versión>.exe` | Instalador. Se instala **para el usuario actual**, sin pedir permisos de administrador, y crea accesos directos. |
| `QubiQ-Server-Launcher-<versión>-portable.exe` | Un solo fichero, sin instalar. Cómodo para llevarlo en un USB o probarlo. |

`npm run dist:dir` genera solo la carpeta descomprimida en `release/win-unpacked`, sin instalador:
es mucho más rápido para comprobar un cambio.

La primera compilación descarga las herramientas de empaquetado (Electron, NSIS): unos minutos.

### Al ejecutarlo por primera vez saldrá un aviso

Como el ejecutable **no está firmado** (decisión de proyecto, §13.3 del análisis), Windows
SmartScreen mostrará *"Windows protegió su PC"*. Hay que pulsar **Más información → Ejecutar de
todas formas**. No es un fallo: le pasa a cualquier programa sin certificado y sin reputación
acumulada.

### Dónde quedan los datos

Los servidores, mundos, copias y runtimes de Java viven en `%APPDATA%\qubiq-server-launcher`,
**fuera de la carpeta de instalación**. Consecuencias buenas:

- Desinstalar no se lleva por delante las partidas.
- La versión de desarrollo y la instalada comparten los mismos servidores, porque la ruta está
  fijada explícitamente en [`main/index.ts`](src/main/index.ts) en vez de derivarse del nombre de la
  app (que cambia entre una y otra).

---

## Arquitectura

El núcleo **no conoce Electron**. Se comunica con la interfaz mediante comandos y eventos, lo que
permite ejecutarlo y probarlo fuera de la app (es justo lo que hacen `smoke` y `e2e`) y deja la
puerta abierta a una CLI o un panel web sin reescribir nada.

```
src/
├── shared/                  Tipos y contrato IPC (los usan ambos lados)
│   ├── types.ts             Lo común: manifiesto v2, estado, copias, conexión
│   └── games/               Catálogo de juegos (nombre, condiciones, capacidades)
│       └── minecraft/       Tipos de Minecraft y catálogo de plugins oficiales
├── main/
│   ├── index.ts             Proceso principal: ventana, cierre limpio, antisuspensión
│   ├── ipc/                 Puente comandos/eventos: común + canales `minecraft:`
│   └── core/                EL NÚCLEO — sin dependencias de Electron
│       ├── paths.ts         Rutas en disco (todo lo específico de Windows vive aquí)
│       ├── net/             HTTP con caché degradable, descargas verificadas, IPs y puertos
│       │                    (TCP y UDP), RCON, WebRCON, consulta A2S y servidores de Steam
│       ├── formats/         Clave=valor que preserva comentarios y VDF de Valve (solo lectura)
│       ├── runtime/         Supervisor de proceso, estrategias de parada y política de reinicio
│       ├── tools/           SteamCMD: instalación, progreso en vivo y actualizaciones
│       ├── system/          PowerShell seguro, Ctrl+Break a una consola, Visual C++ y firmas
│       ├── backup/          Copias en ZIP de lo que diga el juego, restauración y retención
│       ├── instances/       Ciclo de vida de las instancias y migraciones del manifiesto
│       ├── games/
│       │   ├── types.ts     El contrato de un juego (GameAdapter)
│       │   ├── registry.ts  Registro de juegos
│       │   ├── minecraft/   Todo lo de Minecraft:
│       │       ├── adapter.ts   Implementación del contrato
│       │       ├── service.ts   Mundos, plugins/mods y server.properties
│       │       ├── versions/    Mojang, Paper, Fabric, Forge + catálogo unificado
│       │       ├── java/        Descarga y gestión de JDK (Adoptium)
│       │       ├── install/     Una estrategia por distribución + flags de JVM
│       │       ├── config/      Catálogo de opciones humanas de server.properties
│       │       ├── content/     Plugins y mods: carpeta, listado y los oficiales
│       │       ├── worlds/      Varios mundos por servidor (level-name)
│       │       ├── logParser.ts Formatos de log y diagnósticos
│       │       └── ping.ts      Server List Ping y comprobación desde internet
│       │   ├── satisfactory/ Todo lo de Satisfactory:
│       │       ├── adapter.ts   Contrato: SteamCMD, reclamar, arrancar, sondear y parar por API
│       │       ├── api.ts       Su API HTTPS, con el certificado autofirmado
│       │       └── service.ts   Partidas y ajustes, todo por API
│       │   └── valheim/      Todo lo de Valheim:
│       │       ├── adapter.ts   Contrato: SteamCMD, línea de órdenes, registro y Ctrl+Break
│       │       └── service.ts   Mundos y listas de moderación (ficheros, servidor parado)
│       └── service.ts       Orquestador: lo común, y delega en el juego
├── preload/                 Superficie expuesta al renderer (nada de Node)
└── renderer/src/            Interfaz React
    ├── App.tsx, ServerPanel.tsx…   Armazón común (botón grande, jugadores, consola, copias)
    ├── GameChooser.tsx, WizardParts.tsx  Elegir juego y las piezas del asistente básico
    └── games/
        ├── types.ts         Lo que aporta cada juego a la interfaz (GameUi)
        ├── minecraft/       Asistentes, Ajustes, Mundos, Plugins/Mods, plugins oficiales
        ├── satisfactory/    Asistentes, Ajustes y Partidas
        ├── valheim/         Asistentes, Ajustes, Mundos y Moderación
        └── <juego>/icon.svg Icono propio de cada juego, ya dibujado para su fase

resources/<juego>/           Ficheros que se empaquetan por juego (resources/minecraft/plugins/)
scripts/smoke/               Prueba de humo: common.ts + un fichero por juego
scripts/e2e/                 Ciclo completo con servidores reales, un fichero por juego
```

**Añadir un juego** es escribir su adaptador en `core/games/<juego>/`, registrarlo en
`registry.ts`, darlo de alta en `shared/games/index.ts` (nombre, condiciones y capacidades) y aportar
su interfaz en `renderer/src/games/<juego>/`. El armazón común no se toca: las pestañas de
Configuración salen de lo que declare el juego. El plan completo está en
[HOJA-DE-RUTA-MULTIJUEGO.md](HOJA-DE-RUTA-MULTIJUEGO.md).

Los datos del usuario viven fuera del proyecto, en `%APPDATA%/qubiq-server-launcher/`:

```
runtimes/          JDKs compartidos (jdk-21, jdk-25...)
tools/steamcmd/    SteamCMD, compartido por los juegos de Steam
cache/             Manifiestos e instaladores
instances/
  <id>/
    instance.json  Manifiesto v2: la INTENCIÓN del usuario (juego, condiciones y `data` del juego)
    instance.v1.json  Copia del manifiesto antiguo, si se migró (no se borra sola)
    server/        Directorio real del servidor (mundo, jars, config)
    backups/
    launcher.log   Log de la app, separado del del servidor
```

---

## Cosas que conviene saber antes de tocar el código

**No compares versiones de Minecraft como strings.** Conviven el versionado por año (`26.2`) y el
histórico (`1.21.8`), y `26.2` es *más nueva* que `1.21.11`. El orden autoritativo es el índice del
manifiesto de Mojang. Usa `compareVersions` y el tipo `VersionId`.

**La versión más nueva del catálogo no es la recomendada.** Paper publica builds alpha de una
versión de Minecraft recién salida durante días antes del primer estable. Esas versiones se ofrecen
marcadas con `DistributionVersion.experimental`, y la recomendada es la primera que *no* lo está
(§19.17 de ANALISIS.md). Coge siempre la que trae `recommended`, nunca `versions[0]`, y si el
usuario elige una en pruebas hay que mandar `allowExperimental` al crear o la instalación se niega.

**En un juego de Steam, «versión» es una rama.** No se puede instalar una build suelta: se elige
`public`, `experimental` o una de las antiguas que mantenga el estudio, y Steam pone la última de
esa rama. Dos trampas comprobadas (§19.18): pasar `-beta public` a algo que **ya** está en la
pública hace que SteamCMD acabe en `state is 0x6` y código 8, así que la bandera solo se pone
cuando cambia algo de verdad; y al cambiar de rama hay que añadir `validate`, o Steam da por buenos
los ficheros que ya están y el servidor queda mezclado. La rama instalada se lee del
`appmanifest_<appId>.acf` (`UserConfig.BetaKey`), no del manifiesto de la app.

**Cambiar de versión es reinstalar, y se hace desde el núcleo.** `service.changeVersion` guarda una
copia **antes** de apuntar la versión nueva —si no, la copia quedaría etiquetada con una versión
que ese servidor nunca tuvo— y llama a `install` con `skipBackup`. Un juego entra en esto
implementando `listVersions` y `prepareVersionChange`; sin ellos, su tarjeta solo informa.

**Para parar un juego que no lee stdin, Ctrl+Break, nunca Ctrl+C.** El servidor hereda de la app la
orden de ignorar Ctrl+C y Windows la respeta: el evento se genera sin error y no llega nunca. Ctrl+Break
no se puede ignorar así, y Valheim lo trata igual (guarda y sale). Lo manda
[`core/system/consoleSignal.ts`](src/main/core/system/consoleSignal.ts) con un PowerShell auxiliar.
Y no antes de que el mundo termine de cargarse: durante la generación se ignora.

**No leas el progreso de SteamCMD por su salida estándar.** Por una tubería, SteamCMD no vacía el
búfer y lo suelta todo al final. Las mismas líneas se escriben cada 2 s en `logs/console_log.txt`,
que es de donde se leen. Tampoco interpretes sus frases: salen traducidas al idioma de Windows. Solo
`Update state`, `Success!` y `ERROR!` salen siempre en inglés. Y el código de salida no basta: 8
vale igual para un fallo pasajero que para uno permanente, y 7 es "me he autoactualizado".

**En Satisfactory, lanza el ejecutable de `Engine\Binaries`, no `FactoryServer.exe`.** Ese es solo
un lanzador: abre `FactoryServer-Win64-Shipping-Cmd.exe` y se queda de padre. Si supervisas el
lanzador, el PID no es el del servidor (matarlo dejaría el servidor vivo) y no te llega ni una línea
de su registro. Lanzando el de verdad, la salida llega en vivo por la tubería como en Minecraft.

**Y nunca sin `-SavesUseProjectSavedDir`.** `-UserDir` mueve la configuración y el registro del
servidor a donde le digas, pero **los guardados no**: se van igual a
`%LOCALAPPDATA%\FactoryGame\Saved\SaveGames`, que es la carpeta del juego del usuario, junto a sus
partidas de un jugador. Los dos argumentos van siempre juntos; el smoke tiene una comprobación
dedicada a que no desaparezca ninguno, y la `e2e` mira al terminar que esa carpeta no ha cambiado.

**Solo puede haber un servidor de Satisfactory a la vez.** El puerto del juego se elige, pero el de
la mensajería fiable es siempre el **8888**: comprobado lanzándolo con `-Port=7788`, seguía abriendo
el 8888. Por eso el diagnóstico de "puerto ocupado" menciona al otro servidor: es la causa más
probable.

**Antes de arrancar un servidor de Satisfactory, comprueba que sus puertos son suyos.** Toda su
gestión va por `127.0.0.1:<puerto>` y su API no dice de quién es: si otro servidor ya tiene el
puerto, el nuestro no lo consigue y **las órdenes se las lleva el otro** (reclamarlo, crearle una
partida encima, pararlo). Pasó de verdad ejecutando la `e2e` con un servidor real en marcha. Por eso
`launch()` y la instalación empiezan por `ensurePortsFree`, y la prueba `e2e:satisfactory` se niega a
arrancar si el 8888 está ocupado.

**A un servidor de Satisfactory no se entra por IP directa.** El juego exige un *encryption token*
que el cliente solo consigue añadiendo el servidor desde su menú (**Servidores → Añadir servidor**),
que es cuando habla con el panel del servidor y se lo dan. Quien lo intente a pelo ve un
«Encryption token missing» que no explica nada, y en el registro del servidor aparece
`No EncryptionToken specified, disconnecting`. Por eso la pantalla de conexión enseña los pasos
(`GameInfo.joinSteps`) y la consola traduce ese rechazo en vez de soltar la línea del motor.

**La API de Satisfactory devuelve errores con código 200.** Lo que dice si algo ha fallado es el
campo `errorCode` del cuerpo, no el estado HTTP. Y `PasswordlessLogin` —con el que la app reclama el
servidor sola— solo funciona antes de que el servidor tenga dueño: después hay que entrar con la
contraseña de administrador.

**En Valheim, las reglas de sí o no NO son modificadores.** `-modifier combat veryhard` funciona,
pero `-modifier nobuildcost true` **no**: `nobuildcost`, `nomap`, `passivemobs`, `playerevents` y
`noportals` son *claves globales* del mundo y se ponen con `-setkey`. Lo peor es cómo falla: el
servidor escribe una línea («Could not parse 'nobuildcost' … as a world modifier») y arranca tan
tranquilo, así que el ajuste no se aplica y nadie se entera. El smoke comprueba las dos formas.

**Y el servidor de Valheim no valida la contraseña.** El `.bat` oficial dice que el mínimo son 5
caracteres y que no puede estar dentro del nombre del servidor, pero el servidor arranca igual con
cuatro (probado con el 1.0.12). Las dos reglas las comprueba la app **antes de crear nada**, que es
donde se puede explicar en cristiano.

**Un servidor de Valheim sin publicar no contesta a nadie.** Con `-public 0` abre su puerto de
consulta pero **no responde al A2S**, ni siquiera desde el propio equipo. Por eso «¿responde el
servidor?» se contesta de dos formas distintas según esté publicado o no, y cuando no lo está se
dice exactamente lo que se ha mirado (que tiene el puerto abierto), sin prometer que se pueda entrar.

**Valheim solo dice el SteamID de quien entra, no su nombre.** En el registro salen
`Got connection SteamID …` y `Closing socket …`, y nada más. Por eso las capacidades distinguen
`playerIds` («el juego dice quién está dentro») de `playerNames` («y con un nombre que se
reconoce»): Valheim tiene la primera y no la segunda, así que se lista a la gente pero con su
identificador por delante y explicando qué es. **Vetar a alguien lo echa al momento**: el servidor
relee sus listas al vuelo.

**La pantalla de jugadores no sabe de ningún juego.** Los botones de moderar los pone cada juego en
`GameUi.playerActions` —Minecraft manda `kick`/`ban`/`op` por la consola, Valheim escribe en sus
listas de texto— y el armazón común solo los coloca. Si añades un juego que modere de otra forma,
no hay que tocar `PlayersPanel`.

**La consulta de Steam de Valheim solo responde en el puerto de consulta.** Ni publicado contesta
en el de juego. Y no te fíes de su campo `version`, que dice siempre «1.0.0.0»: la versión de
verdad viaja en las palabras clave (`g=1.0.12,n=40`). El nombre del mundo no viaja en la respuesta:
`map` repite el nombre del servidor.

**Con crossplay, Valheim no dice «Opened Steam server».** Dice **«Opened PlayFab server»**, y la
de Steam no llega nunca (comprobado esperando tres minutos). Como esa línea es la señal de
«listo», buscando solo la de Steam un servidor con crossplay se queda «Arrancando» para siempre.

**Y con crossplay el servidor escribe tu IP pública en el registro**, cuatro veces, porque es la
que registra en PlayFab. La consola se enseña y se copia y se pega, así que `parseLine` esconde
esas líneas y le quita la dirección hasta al texto que guarda. Si tocas ese parser, esa regla va
la primera de todas.

**Cuidado con los caracteres invisibles al editar desde Git Bash.** Costó una tarde: donde tenía
que haber un `\b` se coló un **retroceso de verdad** (0x08) dentro de una expresión regular. El
fichero se veía perfecto, TypeScript compilaba y la regla no casaba nunca. El smoke revisa ahora
todo el código y falla si aparece cualquier carácter de control.

**Si un juego traduce una línea del registro, `waitForLog` ve la traducción.** El supervisor busca
el patrón en el texto que ya ha pasado por `parseLine`, no en la línea original. La copia en
caliente de Valheim espera a «Mundo guardado.», no a «World save (5/5) done»; la constante la
comparten las dos partes para que no puedan divergir.

**Un puerto UDP "reservable" no es un puerto libre.** Si un servidor abre el suyo permitiendo
compartirlo (Valheim), Windows deja reservarlo encima sin error. `isUdpPortInUse` lo confirma con
`netstat`.

**Nunca mates el proceso del servidor.** Windows no tiene `SIGTERM`. La única parada segura es
escribir `stop` en `stdin` y esperar; matarlo corrompe chunks. El `kill` solo entra tras 60 s de
gracia y avisando. Y cuando entra, `stop()` **espera a que el proceso muera de verdad** antes de
devolver: matar no es instantáneo, Windows tarda en soltar los ficheros, y quien para un servidor
suele querer borrarlo o restaurar una copia justo después (si no, falla con `EBUSY`).

**No edites `ops.json`, `whitelist.json` ni `banned-players.json` con el servidor arrancado.** Los
mantiene en memoria y los reescribe al cerrarse, descartando cambios externos. Con el servidor en
marcha se actúa por comando.

**En modo básico, cuidado con qué dirección enseñas.** No es siempre la IP local: si el usuario ha
elegido abrir el puerto del router, sus amigos necesitan la **IP pública**, y mostrarles una
`192.168.x` hace que no puedan entrar sin entender por qué. La lógica está en `BasicConnection` y
depende de `exposure.mode`.

**Si tocas la API del preload, reinicia la app entera.** La recarga en caliente actualiza el
renderer pero no el puente: quedan desincronizados y la ventana sale en blanco, porque el renderer
llama a algo que aún no existe.

**Un servidor puede pedir que lo reinicies.** Si al terminar deja `hardcore-restart.request` en su
directorio de trabajo, el launcher lo vuelve a arrancar a los 3 s. Dos reglas que no se pueden
relajar: **la parada manual siempre gana** (Parar, cerrar la app o borrar la instancia cancelan la
petición), y **el fichero se borra antes de decidir nada**, porque si sobrevive a un arranque fallido
se entra en bucle. El límite anti-bucle vive en
[`core/runtime/restartPolicy.ts`](src/main/core/runtime/restartPolicy.ts) como función pura, para
poder probarlo sin levantar servidores.

**El manifiesto tiene versión de esquema y se migra solo, nunca a mano.** Cada cambio de forma sube
`schemaVersion` y añade un paso puro en
[`core/instances/migrations.ts`](src/main/core/instances/migrations.ts), probado en el smoke. Al leer
un manifiesto antiguo se guarda antes una copia (`instance.v1.json`) que no se pisa nunca, y uno de un
esquema más nuevo que la app no se toca: se rechaza. Lo específico de un juego va en `data`, no en la
raíz.

**Al guardar `server.properties`, manda solo las claves que han cambiado.** Enviar el objeto entero
reescribe con datos viejos lo que haya cambiado fuera del panel mientras estaba abierto — un plugin
puede mover `level-name` entre medias, y guardar el antiguo apunta a una carpeta borrada y se lleva
por delante la partida.

**Los plugins oficiales van empaquetados en `resources/minecraft/plugins/<id>/`**, con su jar y su plantilla de
`config.yml`. Se copian fuera del asar (`extraResources`) porque hay que ponerlos como ficheros de
verdad en la carpeta del servidor. Actualizar uno = copiar el jar nuevo ahí y recompilar la app.
Si añades un campo al catálogo de [`shared/games/minecraft/officialPlugins.ts`](src/shared/games/minecraft/officialPlugins.ts), el
smoke comprueba que esa ruta existe en el YAML real, así que no puede quedarse un control que no
guarde nada.

**Un plugin oficial puede exigir ajustes de `server.properties`** (HardcoreUtility necesita
`accepts-transfers`, porque el lobby y la partida se pasan a los jugadores entre sí). Se declaran en
el catálogo, no en el instalador, y los resuelve una sola función —`serverPropertiesFor()`— que usan
igual la pantalla y el proceso principal, para que lo que se avisa y lo que se escribe no puedan
divergir. Toda clave que pongas ahí tiene que existir en `PROPERTY_CATALOG`, y el smoke lo exige: un
ajuste que la app cambia sola y que no sale en ninguna pantalla no hay quien lo encuentre.

**Nunca llames a `tar.exe` a secas: usa `systemTarPath()`.** Git para Windows y MSYS2 ponen un tar de
GNU en el PATH que entiende `C:\...` como una máquina remota y falla con `Cannot connect to C:
resolve failed`. Se llevaría por delante las copias de seguridad y la instalación de Java, solo en
los equipos que tengan esas herramientas.

**El `config.yml` de un plugin se edita por líneas, nunca con un serializador de YAML.** Está lleno
de comentarios que explican cada opción y volcarlo los borraría todos. `PluginConfigFile` solo cambia
valores de claves que ya existen; no crea nada.

**Cuando un plugin estrena opciones, hay que fusionarlas en las instalaciones que ya existen.** El
`config.yml` del usuario es de la versión vieja y no tiene esas claves; como el editor no las crea,
el campo saldría en el formulario y al guardarlo no pasaría nada. De eso se encarga
`addMissingFrom(plantilla)` al instalar, al pulsar **Actualizar** y **también al guardar**: copia de
la plantilla oficial lo que falte —con sus comentarios y en su sección— sin pisar ningún valor que el
usuario ya tuviera. Que esté en guardar no es redundante: una opción que se ve en pantalla tiene que
poder guardarse siempre, sin que el usuario sepa que antes tenía que pulsar otro botón. Y si aun así
alguna clave no cabe en el fichero, se avisa nombrándola, aunque el resto sí se haya guardado.

**El mundo no siempre se llama `world`.** Lo dice `level-name` en `server.properties`, y el usuario
puede tener varios mundos y cambiar entre ellos. Nunca escribas `'world'` en el código: usa
`worlds.activeWorldName()` / `worlds.foldersForWorld()`. Este error ya estuvo en las copias de
seguridad y habría hecho que guardaran el mundo equivocado en silencio.

**En MC 26.x las tres dimensiones van dentro de la carpeta del mundo**
(`<mundo>/dimensions/minecraft/{overworld,the_nether,the_end}`) — comprobado ejecutando vanilla y
Paper. Las carpetas sueltas `<mundo>_nether` y `<mundo>_the_end` son del esquema antiguo de
Bukkit/Spigot: se contemplan solo por si llega un mundo importado de un servidor viejo.

**Nunca copies el mundo sin volcarlo antes.** La secuencia es `save-off` → `save-all flush` →
**esperar la confirmación en el log** → copiar → `save-on`. Si la confirmación no llega, hay que
reanudar el autoguardado y abortar la copia: dejar `save-off` puesto es mucho peor que quedarse sin
copia, porque el mundo dejaría de guardarse sin que nadie se entere. Además hay que excluir
`session.lock`, que el servidor mantiene bloqueado y hace fallar la compresión entera.

**Para comprobar si un servidor acepta conexiones, usa Server List Ping, no un connect TCP.** El
puerto está abierto desde que la JVM lo reserva, mucho antes de que se pueda entrar: un sondeo TCP
diría "todo bien" mientras el usuario recibe un error. Está implementado en
[`core/games/minecraft/ping.ts`](src/main/core/games/minecraft/ping.ts), y tiene que resolverse
siempre: si el servidor corta sin responder (pasa justo al terminar de arrancar) no llega ni error ni
tiempo agotado, y sin escuchar el cierre la promesa se quedaba colgada para siempre.

**Y para saber si se puede entrar DESDE FUERA, hay que preguntar desde fuera.** Comprobarlo desde
esta máquina no dice nada: el servidor siempre se ve desde dentro, esté o no expuesto. Por eso
`checkFromInternet` consulta la IP pública y delega el sondeo en un servicio externo. Como sale de la
máquina del usuario, solo se ejecuta cuando este pulsa el botón, nunca de fondo. Esos servicios
cachean ~1 minuto: muestra siempre la hora de la comprobación.

**Al guardar `server.properties`, preserva las claves desconocidas.** Los plugins y las versiones
nuevas añaden las suyas; borrarlas es un bug silencioso y destructivo. De eso se encarga
`PropertiesFile`.

**Hardcore no es un modo de juego.** `gamemode` solo acepta
`survival` / `creative` / `adventure` / `spectator`; el modo extremo es la clave booleana
**`hardcore`**, aparte (comprobado leyendo las 65 claves que genera un servidor real). Añadirlo como
quinto valor de `gamemode` haría que el servidor lo rechazara. En la interfaz se presenta como una
opción más del selector, pero escribe dos claves — ver `GameModeField` en
[`ConfigPanel.tsx`](src/renderer/src/games/minecraft/ConfigPanel.tsx). Además el juego fuerza la dificultad a Difícil,
así que el selector de dificultad se bloquea al activarlo.

**Cada distribución imprime el log en un formato distinto.** Verificado ejecutando los tres:

```
Vanilla:  [12:39:44] [Server thread/INFO]: mensaje
Paper:    [12:39:44 INFO]: mensaje
Forge:    [12:41:26] [main/INFO] [cp.mo.mo.Launcher/MODLAUNCHER]: mensaje
```

Si el parser solo entiende uno, la app se queda ciega en las otras: no detecta el arranque ni las
entradas de jugadores. Hay tests de regresión en `npm run smoke`.

**Forge no genera un jar ejecutable** desde 1.17. Hay que leer el argfile que produce su instalador
y poner la memoria en `user_jvm_args.txt`, no en la línea de comandos.

**`ELECTRON_RUN_AS_NODE`:** VS Code exporta esta variable a su terminal integrada. Si llega a
`electron.exe`, arranca como Node normal y la app muere con
`Cannot read properties of undefined (reading 'whenReady')`, un error que no apunta a la causa.
Por eso `npm run dev` pasa por `scripts/run-electron-vite.mjs`, que la elimina.

---

## Licencia

[GPLv3](LICENSE).
