# Desarrollo de QubiQ Server Launcher

Todo lo que hace falta para compilar, probar y tocar el código. Lo que es para usar la app está en
el [README](../README.md); cómo colaborar, en [CONTRIBUTING.md](../CONTRIBUTING.md). El porqué de
cada decisión está en [ANALISIS.md](../ANALISIS.md) (§19 es el diario de desarrollo).

## Requisitos

- **Windows 10/11 x64** (el instalador solo se genera para x64: `electron-builder.yml`)
- **Node.js 24 o superior** (`.nvmrc` y `engines` de `package.json`)
- **Conexión a internet** la primera vez: `npm run plugins` baja los plugins oficiales de su
  repositorio, y el smoke habla con las APIs de verdad
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
| `release.bat` / `npm run release` | Genera una release: pide la versión, trae la última release de cada plugin oficial de su repositorio, pasa las pruebas y empaqueta en `release-nueva/`; solo si sale bien sustituye `release/` entera, que queda con la versión nueva y nada más. Si algo falla, deja la versión y la release anterior como estaban. Si la prueba de humo solo falla por no llegar a un servicio externo, pregunta si seguir. Acepta `0.3.0`, `--e2e`, `--no-e2e` y `--allow-offline` para no preguntar |
| `npm run plugins` | Trae los plugins oficiales de la release de su repositorio si faltan (`-- --update`: siempre la última). Corre solo antes de `dev`, `build`, `smoke` y `e2e` |
| `npm run build` | Compila a `out/` |
| `npm start` | Ejecuta lo compilado |
| `npm run typecheck` | Comprueba tipos de los tres lados (main, preload, renderer) |
| `npm run smoke` | 1500 comprobaciones. Comunes: que lo que llega de la interfaz no salga de la carpeta de datos (identificadores, nombres sueltos, copias), que las grabaciones no lleven el usuario, el nombre del equipo ni IPs públicas, migración del manifiesto, un juego falso que recorre el contrato entero (y lo que deja en el historial del servidor), el guardián de verdad (compilarlo, los argumentos igual que lanzando directo, soltar la conexión y reengancharse sin repetir lo ya visto, tildes y tabuladores, veinte mil líneas seguidas, salir con la app «cerrada» y que al volver se sepa el código, códigos negativos, matarlo y un ejecutable que no existe), frecuencia de las copias automáticas (límites y recomendación), reinicio, red y que no haya caracteres de control invisibles en el código. Historial: quién entra y sale comparando listas o solo el número, el fichero (líneas rotas, recorte por tamaño, no resucitar la carpeta de un servidor borrado), la moderación y los guardados que cuenta el registro de Minecraft y la línea de guardado de cada juego. Idiomas: que los diez tengan las mismas claves y **las mismas variables** que el español, los plurales que pide cada idioma, nada sin traducir, que ningún catálogo enseñe una clave sin texto (las montadas con plantillas) en ninguno de los diez, elegir idioma según Windows y guardarlo. Control remoto: lo que se rechaza (firma mala, repetida o caducada, servidor inventado o que no es de ese dispositivo, dispositivo quitado o sin permiso, comando fuera de la lista del nivel 2, campos de más, códigos adivinados), IP enmascaradas en la consola y en el historial, que un servidor borrado salga de todos los dispositivos (y uno nuevo con su nombre no herede el permiso), qué jugadores dice cada juego, límites y bloqueo, y una vuelta por HTTPS con el certificado de Windows (cabeceras, compresión y que no sale ningún fichero que no sea la página). Y QubiQ como cliente de otro, por HTTPS contra un anfitrión de verdad: direcciones, respuestas raras que no llegan rotas a la pantalla, **con una huella que no es la fijada no sale ni el código ni una orden**, la clave nunca en claro, `forget` solo desde «quitar», reloj desfasado, clave de otro usuario de Windows, huella que cambia y se confirma, dispositivo quitado allí, reemparejar y quitar con y sin conexión. Carpeta de datos: la comprobación previa (misma carpeta, anidadas, espacios, red, destino ocupado, servidores encendidos, ruta de los mods de Valheim) y el traslado renombrando y copiando, sin tocar lo de Electron ni lo que ya hubiera en el destino. De Steam, contra respuestas reales grabadas: SteamCMD (también el manifiesto instalado que Steam niega, §19.37), RCON, A2S, WebRCON, parada con Ctrl+Break, puertos UDP, Visual C++ y firmas. De Satisfactory, contra las respuestas reales grabadas de su API: reclamar, estado, partidas, ajustes, errores, argumentos de arranque y lectura de su registro; y sus mods de ficsit.app, contra el `.uplugin` y el registro reales de SML (elegir versión según la build del juego, descartar los mods de solo cliente y traducir la lista de lo que ha cargado), con una sección de contrato contra la API de verdad. De Valheim, contra las líneas reales de su registro y la consulta de Steam grabada de su servidor publicado: argumentos de arranque, catálogo de dificultad y modificadores, lectura del registro, A2S, parada, validaciones del asistente y listas de moderación; y sus mods de Thunderstore, contra el `LogOutput.log` real de BepInEx (dónde acaba cada fichero de un paquete, identificadores y dependencias, y no confundir los errores de vídeo del propio juego con problemas de mods), con una sección de contrato contra la API de verdad. De Factorio, contra las líneas reales de su registro con un cliente de verdad entrando y hablando: lectura del registro (entradas, salidas, chat, rechazos), diagnóstico de cierres, lo que se le escribe en `server-settings.json` y el interruptor de Space Age. De Project Zomboid, contra los ficheros reales de su servidor (su `servertest.ini` de 144 claves, su `SandboxVars.lua` de 300 opciones y su registro): aislamiento de la carpeta del usuario, Steam apagado, claves que gestiona la app, lectura del registro sin enseñar la IP de quien entra, editor de tablas Lua (ida y vuelta byte a byte, límites con coma decimal y nombres de cada valor), aplicar un preajuste de dificultad sobre el fichero comentado, que las reglas del modo básico existan de verdad en el juego, y los mods del taller (leer un `mod.info` real, la regla de las carpetas de versión medida contra el servidor, las tres claves que se le escriben y las salidas reales de SteamCMD al descargar, incluidas las que fallan con código 0). De Enshrouded, contra las grabaciones reales de su servidor: que **ninguna línea de la consola enseñe la IP pública** que él escribe en su registro, que tocar un ajuste obligue a poner el preajuste en «Custom» (con cualquier otro los ignora en silencio, y está medido), que la lista de vetados se escriba con el nombre que usa el servidor (`bannedAccounts`) y no con el que dice su propio README (`bans`), que los cuatro preajustes de dificultad digan ajuste a ajuste lo que el servidor aplica de verdad, que los 37 ajustes de la pantalla sean claves que el juego reconoce, su consulta de Steam, las dos reglas de los roles que el servidor trata como error interno, y la salida de su cargador de mods. De Rust, contra las grabaciones reales de su servidor (registro, consola remota, consulta de Steam y la ayuda de cada variable que da el propio servidor): que **ninguna línea enseñe la IP pública ni la contraseña de la consola remota**, que se tiren las líneas que el servidor escribe dos veces, que la consola remota recoja todas las respuestas de una orden y distinga el silencio de una orden que no existe, que **la sesión haga todas las órdenes por una sola conexión** (Rust admite cuatro por dirección y no suelta las cerradas), la línea de órdenes (consola remota en 127.0.0.1 y nada negativo), `server.cfg`, `users.cfg` y `bans.cfg`, que los valores de serie de los ajustes sean los del servidor, las fechas del borrado mensual con el cambio de hora, qué borra un borrado (los planos, solo si se pide), cuándo vale una Oxide para la build instalada y la cabecera y las dependencias de un plugin. De Minecraft: lógica pura, mundos, plugins oficiales, configuración de plugins y mods (editores de YAML, TOML, JSON, .properties y Lua, lectura de jars y el recorrido de buscar, leer y guardar), NeoForge (de qué Minecraft es cada versión y su catálogo), servidores a medida (reconocer la carpeta, carpetas que no se pueden traer, moverla sin perder nada, scripts de inicio, copia sin pausas y memoria en `user_jvm_args.txt`) y contrato con las APIs externas |
| `npm run e2e [dist]` | Ciclo completo con un servidor real: instalar, arrancar, ping, copia en caliente, parada limpia, restauración y borrado. `dist`: `paper` (por defecto), `vanilla`, `fabric`, `forge`, `neoforge` |
| `npm run e2e:custom` | Servidor a medida de verdad: monta un server pack de NeoForge 1.21.1 con su instalador oficial en una carpeta aparte, lo trae (comprueba que se **mueve**), arranca con su run.bat usando el Java de la app, pone la memoria en `user_jvm_args.txt`, para limpio sin quedarse en el `pause` y, con un script que se reinicia solo, comprueba que forzar el cierre mata también a Java |
| `npm run e2e:restart` | Reinicio a petición del servidor: comprueba que reinicia cuando el plugin lo pide y que **no** reinicia cuando la parada es manual |
| `npm run e2e:satisfactory` | **Con todos los servidores de Satisfactory parados** (solo puede haber uno a la vez). Satisfactory de verdad: instalar, reclamar el servidor sin abrir el juego, arrancar, detectar «listo» por su API, puertos, partidas, ajustes en caliente, copia con el servidor en marcha, parada limpia, **un mod real de ficsit.app que SML carga de verdad** (con su cargador, apagarlo, encenderlo y quitarlo), restauración y **comprobar que no se ha tocado `%LOCALAPPDATA%\FactoryGame`**. Reutiliza la instalación de `%LOCALAPPDATA%\qubiq-dev\steam\satisfactory` con un enlace; `-- --descargar` baja los 15,5 GB de cero |
| `npm run e2e:valheim` | Valheim de verdad: instalar, arrancar generando el mundo, puertos UDP, moderación, copia en caliente esperando a que el servidor guarde, parada con Ctrl+Break, parar mientras arranca, mundos, **un mod real de Thunderstore que BepInEx carga de verdad** (con su cargador, comprobando que la parada limpia sigue guardando el mundo con él puesto), restauración y **comprobar que no se ha tocado la carpeta de Valheim del usuario**. Reutiliza la instalación de `%LOCALAPPDATA%\qubiq-dev\steam\valheim` con un enlace; `-- --descargar` baja los 2 GB de cero. No publica el servidor: arranca con `-public 0` y sin crossplay |
| `npm run e2e:factorio` | Factorio de verdad: copiar el juego de una instalación del equipo y adelgazarlo (de 5,1 GB a ~246 MB), generar el mapa, arrancar, puerto UDP, moderación por RCON en caliente, copia con el servidor en marcha, parada con `/quit`, restauración y **comprobar que no se ha tocado `%APPDATA%\Factorio`**. `-- --rapido` usa la copia ya adelgazada del laboratorio; `-- --mods` prueba además buscar e instalar un mod real del portal, que necesita tu sesión de factorio.com. Son 34 comprobaciones. Termina con 2 si lo único que falla es que el portal no responde |
| `npm run e2e:zomboid` | Project Zomboid de verdad: instalar, primer arranque que escribe la configuración y genera el mundo, puerto UDP (y comprobar que el segundo **no** se abre sin Steam), jugadores por RCON, ajustes en caliente, cuentas y niveles de acceso, reglas de la partida con el servidor parado, copia en caliente, parada con `quit`, **un mod real del taller que el servidor carga de verdad**, restauración y **comprobar que no se ha tocado `%USERPROFILE%\Zomboid`**. Guarda una copia del juego en `%LOCALAPPDATA%\qubiq-dev\e2e-zomboid-juego` y la **mueve** dentro de la instancia: **no se puede enlazar**, porque Zomboid no arranca si llega a su carpeta por un `mklink /J`. `-- --descargar` baja los 6,7 GB de cero. Arranca sin Steam: no se anuncia en ningún sitio |
| `npm run e2e:enshrouded` | Enshrouded de verdad: instalar, comprobar el fichero de configuración que se le escribe, arrancar, un solo puerto UDP (y que **no** abre el siguiente), su consulta de Steam, **la trampa del preajuste medida en vivo** (se toca un ajuste, se arranca y el propio servidor dice por consola que aplica «Custom»), que un veto puesto desde el juego sobreviva a que la app reescriba el fichero, copia en caliente, parada con Ctrl+Break, parar mientras arranca, mundos, **un mod real que Shroudtopia carga de verdad** (con su cargador, apagarlo, encenderlo y quitarlo) y restauración. Reutiliza la instalación de `%LOCALAPPDATA%\qubiq-dev\steam\enshrouded` con un enlace; `-- --descargar` baja los 8,8 GB de cero. ⚠ **Esta prueba publica el servidor**: Enshrouded no se puede arrancar sin anunciarse |
| `npm run e2e:rust` | Rust de verdad, con un mapa de 1000 m para que no tarde: instalar, `server.cfg`, arrancar, **ni IP ni contraseña ni líneas dobladas en la consola**, puertos (la consola remota solo en 127.0.0.1, Rust+ cerrado), su consulta de Steam, la consola de la app, ajustes preguntados al servidor, **una sola conexión a la consola remota tras medio minuto de sondeo**, moderación en caliente y con el servidor parado, copia en caliente, parada con `quit`, parar mientras genera el mapa sin matarlo, **Oxide con un plugin de uMod, otro en caliente y quitarlo dejando los DLL idénticos a los de Steam**, borrado con el servidor en marcha y restaurar una copia de antes del borrado con su semilla. Reutiliza la instalación de `%LOCALAPPDATA%\qubiq-dev\steam\rust` con un enlace; `-- --descargar` baja los 5,5 GB de cero. ⚠ **Esta prueba publica el servidor**: Rust no se puede arrancar sin anunciarse |
| `npm run e2e:remote` | Control remoto contra un Paper de verdad, todo por HTTPS y con órdenes firmadas: emparejar dos dispositivos, arrancar (y que el de solo mirar no pueda), la consola en vivo, `list` sí y `op` no con el nivel 2, reiniciar con parada limpia, parar y el registro de actividad. Al final, **otro QubiQ como cliente** (el núcleo del cliente, con su carpeta) empareja, arranca, manda `list`, lee la respuesta, para, se ve en el historial con su nombre y se quita (`forget`). Escucha solo en 127.0.0.1 |
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
  fijada explícitamente en [`main/index.ts`](../src/main/index.ts) en vez de derivarse del nombre de la
  app (que cambia entre una y otra).

Se pueden llevar a otra carpeta desde *Configuración de la app → Carpeta de datos*. La de siempre
sigue guardando la configuración de Electron y `data-location.json`, que dice dónde están los datos.

---

## Arquitectura

El núcleo **no conoce Electron**. Se comunica con la interfaz mediante comandos y eventos, lo que
permite ejecutarlo y probarlo fuera de la app (es justo lo que hacen `smoke` y `e2e`) y deja la
puerta abierta a una CLI o un panel web sin reescribir nada.

```
src/
├── shared/                  Tipos y contrato IPC (los usan ambos lados)
│   ├── types.ts             Lo común: manifiesto v2, estado, copias, conexión
│   ├── i18n/                Idiomas: t(), plurales y formatos; locales/<idioma>/<área>.ts
│   ├── dataFolder.ts        Carpeta de datos y su traslado, en códigos (la interfaz los dice)
│   ├── remote.ts            Control remoto: órdenes, texto que se firma, niveles de consola, IP fuera
│   ├── journal.ts           Historial de cada servidor: qué se apunta (datos, no frases)
│   └── games/               Catálogo de juegos (nombre, condiciones, capacidades)
│       └── minecraft/       Tipos de Minecraft y catálogo de plugins oficiales
├── main/
│   ├── index.ts             Proceso principal: ventana, cierre limpio, antisuspensión
│   ├── dataFolder.ts        Dónde están los datos y el traslado pendiente, al arrancar
│   ├── ipc/                 Puente comandos/eventos: común + canales `minecraft:`
│   └── core/                EL NÚCLEO — sin dependencias de Electron
│       ├── paths.ts         Rutas en disco (todo lo específico de Windows vive aquí)
│       ├── dataFolder/      Comprobar y hacer el traslado de la carpeta de datos
│       ├── remote/          Control remoto: servidor HTTPS, certificado, firmas, defensas y la
│       │                    tabla de órdenes (lo único que se puede hacer desde fuera); y el
│       │                    cliente de otros QubiQ (links.ts, client.ts, sanitize.ts)
│       ├── net/             HTTP con caché degradable, descargas verificadas, IPs y puertos
│       │                    (TCP y UDP), RCON, WebRCON, consulta A2S y servidores de Steam
│       ├── formats/         Clave=valor que preserva comentarios y VDF de Valve (solo lectura)
│       │   └── editable/    YAML, TOML, JSON y .properties ajenos, editados por líneas
│       ├── runtime/         Supervisor de proceso, estrategias de parada y política de reinicio
│       │   └── guardian/    El guardián: el proceso que se queda con las tuberías del servidor
│       │                    para poder recuperarlo si la app se cierra de golpe (C#, se compila
│       │                    con el csc de Windows)
│       ├── journal/         Historial de cada servidor: el fichero y quién entra y sale
│       ├── tools/           SteamCMD: instalación, progreso en vivo y actualizaciones
│       ├── system/          PowerShell seguro, Ctrl+Break a una consola, Visual C++ y firmas
│       ├── backup/          Copias en ZIP de lo que diga el juego, restauración y retención
│       ├── instances/       Ciclo de vida de las instancias y migraciones del manifiesto
│       ├── games/
│       │   ├── types.ts     El contrato de un juego (GameAdapter)
│       │   ├── registry.ts  Registro de juegos
│       │   ├── modFiles.ts  Descomprimir y repartir mods, y apuntar qué es de cada uno
│       │   ├── minecraft/   Todo lo de Minecraft:
│       │       ├── adapter.ts   Implementación del contrato
│       │       ├── service.ts   Mundos, plugins/mods y server.properties
│       │       ├── versions/    Mojang, Paper, Fabric, Forge, NeoForge + catálogo unificado
│       │       ├── java/        Descarga y gestión de JDK (Adoptium)
│       │       ├── install/     Una estrategia por distribución + flags de JVM
│       │       ├── custom/      Servidores a medida: reconocer, mover la carpeta y arrancar su script
│       │       ├── config/      Catálogo de opciones humanas de server.properties
│       │       ├── content/     Plugins y mods: carpeta, listado, los oficiales y su configuración
│       │       ├── worlds/      Varios mundos por servidor (level-name)
│       │       ├── logParser.ts Formatos de log y diagnósticos
│       │       └── ping.ts      Server List Ping y comprobación desde internet
│       │   ├── satisfactory/ Todo lo de Satisfactory:
│       │       ├── adapter.ts   Contrato: SteamCMD, reclamar, arrancar, sondear y parar por API
│       │       ├── api.ts       Su API HTTPS, con el certificado autofirmado
│       │       ├── mods.ts      ficsit.app y SML: buscar, resolver dependencias e instalar
│       │       └── service.ts   Partidas, ajustes y mods
│       │   ├── valheim/      Todo lo de Valheim:
│       │       ├── adapter.ts   Contrato: SteamCMD, línea de órdenes, registro y Ctrl+Break
│       │       ├── mods.ts      Thunderstore y BepInEx: catálogo, cargador y su registro
│       │       └── service.ts   Mundos, listas de moderación y mods (ficheros, servidor parado)
│       │   ├── enshrouded/   Todo lo de Enshrouded:
│       │       ├── adapter.ts   Contrato: SteamCMD, registro, Ctrl+Break y consulta de Steam
│       │       ├── config.ts    Su JSON: se genera entero y se conservan los vetados del juego
│       │       ├── mods.ts      Shroudtopia desde GitHub y los mods que trae el usuario
│       │       └── service.ts   Ajustes, roles, mundos, vetados y mods (servidor parado)
│       │   └── rust/         Todo lo de Rust:
│       │       ├── adapter.ts   Contrato: SteamCMD, línea de órdenes, registro y parada por WebRCON
│       │       ├── config.ts    server.cfg (solo el bloque de la app), users.cfg y bans.cfg
│       │       ├── rcon.ts      La sesión WebRCON de cada servidor y cómo leer lo que contesta
│       │       ├── wipe.ts      Qué ficheros son el mapa y qué borra un borrado
│       │       ├── mods.ts      Oxide (poner, reponer tras actualizar, quitar) y plugins de uMod
│       │       └── service.ts   Ajustes, borrado (y su vigilante), moderación, Oxide y plugins
│       └── service.ts       Orquestador: lo común, y delega en el juego
├── preload/                 Superficie expuesta al renderer (nada de Node)
└── renderer/src/            Interfaz React
    ├── App.tsx, ServerPanel.tsx…   Armazón común (botón grande, jugadores, consola, copias)
    ├── GameChooser.tsx, WizardParts.tsx  Elegir juego y las piezas del asistente básico
    ├── CatalogModsPanel.tsx  Pestaña de mods de los juegos con cargador y catálogo
    ├── RemoteAccessCard.tsx  Configuración → Acceso remoto
    ├── LinkWizard.tsx, RemoteLinkPanel.tsx, RemoteServerPanel.tsx  Servidores de otro QubiQ
    ├── remote/          La página remota (remote.html): emparejar, servidores y consola
    └── games/
        ├── types.ts         Lo que aporta cada juego a la interfaz (GameUi)
        ├── minecraft/       Asistentes, Ajustes, Mundos, Plugins/Mods, plugins oficiales
        ├── satisfactory/    Asistentes, Ajustes, Partidas y Mods
        ├── valheim/         Asistentes, Ajustes, Mundos, Moderación y Mods
        ├── enshrouded/      Asistentes, Ajustes, Roles, Mundos, Vetados y Mods
        ├── rust/            Asistentes, Ajustes, Borrado (y su aviso), Moderación y Plugins
        └── <juego>/icon.svg Icono propio de cada juego, ya dibujado para su fase

resources/<juego>/           Ficheros que se empaquetan por juego (resources/minecraft/plugins/)
scripts/smoke/               Prueba de humo: common.ts + un fichero por juego
scripts/e2e/                 Ciclo completo con servidores reales, un fichero por juego
```

**Añadir un juego** es escribir su adaptador en `core/games/<juego>/`, registrarlo en
`registry.ts`, darlo de alta en `shared/games/index.ts` (nombre, condiciones y capacidades) y aportar
su interfaz en `renderer/src/games/<juego>/`. El armazón común no se toca: las pestañas de
Configuración salen de lo que declare el juego. El plan completo está en
[HOJA-DE-RUTA-MULTIJUEGO.md](../HOJA-DE-RUTA-MULTIJUEGO.md).

Los datos del usuario viven fuera del proyecto, en `%APPDATA%/qubiq-server-launcher/`:

```
runtimes/          JDKs compartidos (jdk-21, jdk-25...)
tools/steamcmd/    SteamCMD, compartido por los juegos de Steam
cache/             Manifiestos e instaladores
remote/            Acceso remoto: config.json (dispositivos), certificado y actividad; y
                   links.json (otros QubiQ, con la clave cifrada por DPAPI)
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

**Los servidores no son hijos directos de la app: van a través del guardián.** Si QubiQ se cierra
de golpe (un fallo, «Finalizar tarea»), un hijo directo seguiría vivo pero sin tuberías: ni órdenes
ni parada limpia, y al volver saldría como parado. El guardián
([`core/runtime/guardian`](../src/main/core/runtime/guardian/index.ts)) es un ejecutable pequeño que
lanza el servidor, se queda con sus tuberías y las ofrece por una tubería con nombre de Windows; al
abrirse, `service.initialize` se reengancha a los que siguen en marcha (ANALISIS.md §19.34). Reglas:
- **Su código es C# 5** (`guardian/source.ts`): lo compila en el equipo el `csc.exe` de .NET
  Framework que trae Windows, que no entiende nada más moderno. El ejecutable lleva la huella del
  código en el nombre, así que cambiarlo lo vuelve a compilar solo. Si no se puede, el servidor se
  lanza directo como antes (`supervisor.start`), y se apunta en el registro de la app.
- **La línea de órdenes la arma `commandLine.ts` igual que Node** (las reglas de libuv). El smoke
  compara los argumentos lanzando directo y a través del guardián: si tocas las comillas, que siga
  pasando.
- La tubería con nombre va en **modo asíncrono**: en uno síncrono Windows pone la escritura detrás de
  la lectura pendiente y la salida del servidor solo llegaba cuando la app mandaba algo.
- El guardián trabaja en su carpeta, no en la del servidor (si no, no se podría borrar ni restaurar
  justo después de parar).
- **Al reengancharse se repasan las líneas que la app ya vio**: van a la consola, pero no al
  historial ni a `launcher.log` (`supervisor.replaying`). Hasta dónde se vio, y el estado (listo,
  jugadores, código para entrar), se guarda en `guardian.json` cada vez que se apunta algo en el
  historial y cada 5 s. Si añades algo que se apunte a partir del registro, respeta `replaying`.
- Si el servidor sale con la app cerrada, el guardián deja `guardian-exit.txt` con el código y sus
  últimas líneas; al abrir se apunta la parada o el cierre con la hora de verdad.
- **Cerrar la app con la X pregunta en el `close` de la ventana**, no en `before-quit`: cuando
  llega `before-quit` la ventana ya se ha cerrado, y al cancelar la app se quedaba viva y sin
  ventana, con los servidores dentro.

**El control remoto es una lista cerrada de órdenes, no un panel.** Lo que se puede hacer desde fuera
está entero en el `switch` de [`core/remote/orders.ts`](../src/main/core/remote/orders.ts): listar,
arrancar, parar, reiniciar, ver la consola, enviar a la consola y ver el historial. **Ninguna orden puede aceptar
rutas, ficheros, mods ni configuración**: un plugin, un mod o el `.bat` de un servidor a medida
corren con los permisos del usuario de Windows, y eso convertiría el acceso a la app en acceso al PC
(ANALISIS.md §19.31). Más reglas:
- El texto que se firma lo montan los dos lados con `orderMessage` de `shared/remote.ts`. Si añades
  un argumento, va ahí y en `parseOrder`, que rechaza cualquier campo que no conozca.
- La lista del nivel 2 (`LEVEL2_COMMANDS`) es solo de hablar, listar, expulsar y guardar. Nada que dé
  permisos ni cambie el mundo, y nada encadenado.
- Lo que sale por la consola remota pasa por `maskAddresses`: las IP de los jugadores no salen. En
  el historial (`journal`), lo mismo con lo que es texto libre: órdenes y motivos.
- El historial se pinta con `JournalList`, el mismo componente en la app y en la página. Por eso no
  puede usar `window.qubiq` ni las piezas de cada juego (`uiFor`): todo le llega por props.
- La página (`remote.html`) se compila con la interfaz y la sirve el anfitrión. No usa
  `window.qubiq`: todo va por `renderer/src/remote/api.ts`, firmado. En `npm run dev` no hay
  `out/renderer`, así que la página remota solo se sirve tras `npm run build`.
- Las pruebas escuchan en `127.0.0.1` (`listenHost`; en los recorridos de interfaz,
  `QUBIQ_REMOTE_LISTEN=127.0.0.1`) para no abrirse a la red de casa.
- **Cada dispositivo ve solo sus servidores** (`permissions.servers`, ninguno de serie). Uno que
  existe pero no es suyo da `unknown-server`, igual que uno inventado. El id de un servidor sale de
  su nombre, así que **al borrar uno se quita de todos los dispositivos** (`service` emite
  `removed`; al arrancar también se limpian los que ya no existen): si no, otro nuevo con el mismo
  nombre heredaría el permiso.
- **Hay una sola copia de la app** (`requestSingleInstanceLock`): con el acceso remoto encendido,
  cerrar la ventana la esconde en la bandeja. Al salir, el acceso remoto se cierra **síncrono** en
  `will-quit` (`shutdownNow`). No se cancela la salida para esperar a nada: un segundo `app.quit()`
  no hace nada, y `app.exit()` dejaba a veces procesos de Chromium huérfanos.
- **QubiQ como cliente de otro** (`core/remote/links.ts`) es un dispositivo más, con los mismos
  poderes que la página. Reglas:
  - **La huella se comprueba antes de escribir nada** (`client.ts`: `tls.connect`, comparar, y solo
    entonces la petición por `createConnection`). No uses `https.request` con `rejectUnauthorized:
    false` a secas: escribiría la orden antes de mirar el certificado.
  - La clave privada va cifrada con `safeStorage` (DPAPI), que se inyecta como `SecretBox` porque el
    núcleo no conoce Electron. Sin cifrado disponible no se empareja: nunca se guarda en claro.
  - Todo lo que contesta el otro equipo pasa por `sanitize.ts` antes de llegar a la interfaz: puede
    ser una versión más nueva (un juego que esta no conoce) o estar roto.
  - `forget` (el dispositivo se borra a sí mismo en el anfitrión) solo sale de `remove`; la interfaz
    no puede pedirlo por `order`.
  - La lista de cada equipo se pide cada 5 s **solo con la ventana a la vista**; la consola y el
    historial, solo desde la pantalla abierta.

**Idiomas: ningún texto de la interfaz a pelo.** Todo pasa por `t('clave', vars)` de
`src/shared/i18n` (en la interfaz, desde `renderer/src/i18n.tsx`). Una clave nueva se añade en
`locales/es/<área>.ts` y en los otros nueve idiomas: el español es la referencia de tipos, así que
el typecheck falla si falta en alguno, y el smoke si una traducción no usa las mismas `{variables}`.
Más reglas que ya han mordido (ANALISIS.md §19.29):
- Los textos de un catálogo (ajustes, preajustes, roles, tamaños de mapa) son **getters**
  (`labelled`, `choice`, `get label()`), para que salgan en el idioma del momento. Lo que se manda
  por IPC se copia antes (`localizedCatalog`): el clon estructurado no lleva getters.
- Una clave montada con plantilla (`` `mc.prop.${key}.label` ``) que no existe se enseña tal cual;
  el smoke recorre los catálogos en los diez idiomas buscando textos con forma de clave.
- Plurales con `{ one, other }` (el ruso además `few` y `many`; chino y japonés solo `other`), no con
  `count === 1 ? … : …`. Listas con `formatList`, comillas con `quote`, tamaños con `formatSize`,
  `formatBytes` y `unitLabel` (ГБ en ruso, Go en francés), fechas con `formatDate*`.
- Un número dentro de una frase se interpola sin separador de miles (son puertos y semillas). Si es
  una cantidad, se pasa ya formateada con `formatNumber`.
- Trozos que no son texto (`<strong>`, `<code>`) con `<Rich k="clave" values={…} />`, nunca
  partiendo la frase en varias claves: el orden de las palabras cambia de un idioma a otro.
- El núcleo todavía devuelve frases en español. Lo nuevo que tenga que contar algo a la interfaz
  debería devolver un código con datos, como `shared/dataFolder.ts`.

**La carpeta de datos se puede mover.** Lo que se mueve es la lista cerrada `DATA_ENTRIES` de
`paths.ts`: si creas algo nuevo directamente en la raíz de datos, añádelo ahí o se quedará atrás.
Nunca uses `app.getPath('userData')` para datos de la app: usa `dataRoot()`. El traslado se hace al
arrancar, antes que el núcleo (`main/dataFolder.ts`); Chromium guarda lo suyo aparte, en
`userData\electron` (`sessionData`), porque su `Cache` y nuestra `cache` eran la misma carpeta.

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

**El intervalo de copia se guarda en horas, pero con fracciones.** `backup.intervalHours` vale
`5 / 60` para cinco minutos: se dejó el campo así para no migrar el manifiesto y que una versión
anterior de la app lo siga entendiendo. No lo leas directamente: usa `intervalMinutes()` y el resto
de [`shared/backup.ts`](../src/shared/backup.ts), donde están el mínimo (5 minutos), la validación que
aplica el núcleo y la frecuencia recomendada. Esa recomendación sale del peso del mundo y, en los
juegos que no guardan cuando se les pide (Valheim, Enshrouded), nunca baja de su propio guardado:
la copia lo espera, así que más a menudo solo saldrían copias repetidas.

**Cambiar de versión es reinstalar, y se hace desde el núcleo.** `service.changeVersion` guarda una
copia **antes** de apuntar la versión nueva —si no, la copia quedaría etiquetada con una versión
que ese servidor nunca tuvo— y llama a `install` con `skipBackup`. Un juego entra en esto
implementando `listVersions` y `prepareVersionChange`; sin ellos, su tarjeta solo informa.

**Para parar un juego que no lee stdin, Ctrl+Break, nunca Ctrl+C.** El servidor hereda de la app la
orden de ignorar Ctrl+C y Windows la respeta: el evento se genera sin error y no llega nunca. Ctrl+Break
no se puede ignorar así, y Valheim lo trata igual (guarda y sale). Lo manda
[`core/system/consoleSignal.ts`](../src/main/core/system/consoleSignal.ts) con un PowerShell auxiliar.
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

**Cada juego se amplía a su manera, y solo dos comparten pantalla.** Satisfactory (ficsit.app, con
SML) y Valheim (Thunderstore, con BepInEx) tienen la misma forma —un **cargador** que el juego base
no trae y un **catálogo con buscador**—, así que comparten `CatalogModsPanel` y los tipos de
`shared/games/mods.ts`. Project Zomboid y Factorio **no** están ahí: uno va pegando enlaces del
taller de Steam y el otro pide cuenta para descargar. Si añades un juego con mods, mira primero si
encaja de verdad en ese molde; forzarlo es peor que darle su pantalla.

**Apagar un mod no es renombrarlo.** Los dos cargadores buscan por contenido, no por nombre: BepInEx
recorre `BepInEx/plugins` entero buscando `.dll` y el servidor de Satisfactory mira todas las
carpetas de `FactoryGame/Mods`. Un mod apagado tiene que **salir** de ahí, así que se aparta a
`mods-apagados/` dentro de la instancia (fuera de la carpeta del servidor) y vuelve a su sitio al
encenderlo. Por eso cada mod guarda en el manifiesto **qué rutas son suyas**: sin eso no se sabría
qué apartar ni qué borrar.

**La carpeta de datos de la app no puede estar muy metida en el disco, o Valheim se queda sin
mods.** BepInEx carga las bibliotecas de Unity con las API de Mono, que se quedan en los 260
caracteres de Windows. Con una ruta larga contesta `Could not run preloader!` en un
`preloader_<fecha>.log` que nadie lee y **el servidor arranca sin un solo mod**, funcionando
perfectamente por lo demás: es el peor fallo posible, el que no se nota. Se mide antes de instalar
nada (`assertPathFits`) y se explica. Comprobado: el mismo servidor, movido a una ruta corta, carga
sin tocar nada más.

**El cargador de Valheim no cuenta por la consola qué mods ha cargado.** Por la tubería del proceso
solo llegan las líneas del *preloader*; la lista (`Loading [PlantEverything 1.21.2]`) está solo en
`BepInEx/LogOutput.log`, que la pestaña de mods lee. ⚠ Y ese fichero recoge **también** el registro
del juego: un servidor sin pantalla escribe de serie quince errores de vídeo y de shaders, así que
solo cuentan como problemas los de BepInEx y los de los propios mods, nunca los de `Unity Log`.
SML, en Satisfactory, sí lo dice por la consola y no necesita nada de esto.

**Los paneles de un juego se montan con las piezas de siempre, no con las tuyas.** Todo va dentro
de `div.panel`, cada bloque en un `div.card` con su `h3`, cada campo en un `div.field` (etiqueta,
control y `.help`) y cada casilla en un `label.row` con su texto y, si hace falta, una `.help`
dentro. Ojo con dos trampas: `.help` **solo tiene estilo** dentro de `.field`, de un paso del
asistente o de una casilla —suelta en una tarjeta sale a tamaño normal; ahí la nota va con
`p.hint`—, y `.alert strong` es de bloque, así que un `<strong>` dentro del párrafo de un aviso lo
parte en dos. Una clase que no existe en `styles.css` (`agree`, `list`, `tag`, `alert ok`…) no da
error: simplemente descuadra la pantalla. Así salieron los primeros paneles de Factorio.

**El historial de un servidor lo apunta el núcleo, y cada cosa desde un sitio.** Vive en
`instances/<id>/journal.jsonl`, una entrada por línea y con datos, no frases (`shared/journal.ts`):
la pestaña «Historial» las monta en el idioma del momento. Quién apunta qué:
- **Entradas y salidas**, el servicio comparando la lista que manda el supervisor con la anterior.
  Al parar, el supervisor vacía la lista: eso no se apunta como salidas, ya está la parada.
- **Guardados**, el `parseLine` de cada juego con `saved: true` en la línea que lo confirma (medida
  en su registro real). Los que llegan seguidos se juntan, y **los de mientras arranca no cuentan**:
  Minecraft guarda al generar el mundo y saldría siempre pegado a «arrancado».
- **Moderación**: en Minecraft, `parseLine` con `moderation` («Kicked…», «Made … a server
  operator»), que recoge también la de la consola y la de un operador dentro del juego. En los demás,
  el servicio del juego con `host.journal(...)` al moderar por RCON o escribiendo sus listas. **Si
  añades una forma de moderar, apúntala ahí**: si no, no sale.
- **Órdenes**, `service.sendCommand`. Un botón que modera mandando una orden (Minecraft) pasa
  `journal: false`: lo que haga ya lo cuenta el registro, y no es algo escrito en la consola. Lo que
  manda la propia app (`save-off`, `save-all`) va directo al supervisor y no se apunta.
- Lo pedido desde el **control remoto** lleva el nombre del dispositivo (`by`).

Se escribe síncrono (la parada al cerrar la app tiene que llegar a disco) y se recorta solo pasado
1 MB. No guarda direcciones: un veto por IP no se apunta.

**La pantalla de jugadores no sabe de ningún juego.** Los botones de moderar los pone cada juego en
`GameUi.playerActions` —Minecraft manda `kick`/`ban`/`op` por la consola, Valheim escribe en sus
listas de texto— y el armazón común solo los coloca. Si añades un juego que modere de otra forma,
no hay que tocar `PlayersPanel`.

**El servidor de Factorio es el juego, y por eso hace falta tenerlo.** No hay servidor dedicado para
Windows: se lanza `factorio.exe --start-server`. La app lo copia de una instalación del equipo o lo
descarga de Steam **con la cuenta del usuario**, que es el único caso en toda la app donde SteamCMD
no entra de forma anónima. La contraseña se le pasa por la entrada estándar nada más arrancarlo
—nunca en la línea de órdenes— y no se guarda: después valen las credenciales que Steam deja en
caché, y a la app le basta el nombre de usuario.

**A Factorio no se le habla por stdin: es un binario GUI.** `factorio.exe` es de subsistema 2
(gráfico), así que no tiene entrada estándar y escribir en ella da EPIPE. Parar el servidor, moderar
y mandar comandos va **todo por RCON**, que la app crea sola con contraseña aleatoria y ata a
`127.0.0.1` con `--rcon-bind`. Con `--rcon-port` escucharía en `0.0.0.0`, o sea, en toda la red de
casa.

**Factorio no devuelve el eco del paquete terminador de RCON.** El truco estándar —mandar detrás del
comando un paquete vacío y esperar su eco— funciona en Minecraft y en Zomboid, pero aquí el
terminador se ignora y la respuesta se queda esperando para siempre. Para eso está
`RconOptions.terminatorEcho: false`: recoge trozos hasta que deja de llegar nada. Si añades un juego
con RCON, compruébalo antes de darlo por hecho.

**Al servidor de Factorio se le quitan las imágenes y los sonidos.** La copia de cada servidor pasa
de 5,1 GB a 246 MB borrando `.png` y `.ogg`, y los **checksums de prototipos no cambian**, así que
los clientes entran igual (probado con un jugador real). Lo que no se puede borrar son los `.lua`
que viven dentro de `graphics/`: sin ellos no carga ni el mod base. Ojo: Steam no sabe actualizar
sobre una instalación recortada (falla con `state is 0x426`), y por eso la descarga va a una
carpeta aparte que se borra al terminar.

**Space Age se decide al crear el servidor y no se puede cambiar.** Es un `mod-list.json` con cuatro
mods, y el mapa se genera con ellos dentro: apagarlos después no convierte la partida en una de
Factorio base. Si tocas ese fichero desde otro sitio (los mods del portal lo hacen), conserva lo que
ya hubiera en vez de reescribirlo entero.

**La versión estable de Factorio (2.0.77) no termina de cerrarse.** Guarda la partida al 100 % con
`/quit` y el proceso se queda vivo; la 2.1.19 cierra en 0,4 s. No es un fallo de la app: cerrar el
proceso al agotar el plazo es seguro **porque la partida ya está en disco**, y así lo hace el
supervisor.

**El portal de mods de Factorio no sabe buscar.** Los parámetros `q`, `query` y `search` de su API
se ignoran —contestan con los 23.000 mods en orden alfabético— y `namelist` da un 500. Por eso
`searchMods` se trae el índice completo (13 MB, segundo y medio), lo cachea una hora y filtra en
local. Y descargar sí pide credenciales: sin `username` y `token` redirige al login y contesta 403.
La app usa la sesión que el propio juego guarda en `player-data.json`, **solo cuando el usuario lo
pide**, y no escribe el token en ningún fichero.

**Nombrar administrador en Factorio no siempre funciona en caliente.** `/promote` no hace nada con
quien no ha entrado nunca al servidor. Por eso la moderación hace las dos cosas: manda la orden por
RCON (así, vetar echa al momento a quien esté dentro) **y** escribe el fichero, que sobrevive a la
parada y se aplica al siguiente arranque. Y cuidado al comparar nombres: el servidor los guarda en
minúsculas.

**Un servidor de Zomboid con Steam sale en la lista pública de Steam, ponga lo que ponga `Public`.**
Lo avisa su propio `servertest.ini`: «los servidores habilitados para Steam siempre son visibles en
el navegador de servidores de Steam». Por eso la app arranca con `-Dzomboid.steam=0` salvo que el
usuario encienda Steam a mano. El precio de apagarlo: sin Steam el servidor **no contesta al A2S en
ningún puerto** (comprobado en 16261 y 16262) y solo abre el de juego, así que «¿responde?» y
«cuánta gente hay» van por RCON, y solo se pide abrir un puerto.

**Y sin contraseña de RCON, Zomboid no abre el puerto de RCON.** Viene vacía de serie, así que la
app genera una siempre. Ojo: **Zomboid no deja elegir en qué dirección escucha** (Factorio sí, con
`--rcon-bind`): lo abre en 0.0.0.0, o sea, en toda la red local. De ahí que la contraseña sea larga
y aleatoria y que ese puerto no se liste nunca entre los que hay que abrir en el router.

**Zomboid reescribe su `servertest.ini` al arrancar, pero acepta uno a medias.** Al arrancar
conserva los valores y borra las claves que no son suyas y los comentarios que no ha puesto él, así
que no guardes nada tuyo ahí. A cambio, si le dejas un `.ini` con cuatro claves, lo completa con sus
otras 140 y sus explicaciones: es lo que permite fijar el puerto **antes** del primer arranque, en
vez de dejar que ese arranque use el 16261 aunque el usuario hubiera elegido otro.

**Project Zomboid no arranca si llega a su carpeta por un enlace.** Con un `mklink /J` se cae
generando el mundo, porque no carga su Lua de servidor («attempted index: biomes of non-table»);
con la ruta real arranca en 39 s. Se lleva por delante el truco que usan las pruebas de Valheim y
Satisfactory para no descargar: la `e2e:zomboid` guarda una copia de verdad y la **mueve** dentro de
la instancia, que en el mismo disco es instantáneo.

**En Zomboid, quién está dentro se le pregunta; no se deduce del registro.** El adaptador
implementa `poll()` y le manda `players` por RCON, que devuelve la lista entera. Para eso el
contrato tiene `LiveStatus.players`: ir sumando y restando nombres según el registro significa que
basta perder una línea para que la lista quede mal hasta el siguiente arranque.

**Los ajustes de Zomboid no caben en una pestaña, así que tiene buscador.** Son 414 repartidos
entre el `SandboxVars.lua` (270) y el `servertest.ini` (144), y buscar «refugio» encuentra 1 en uno y
13 en el otro. La barra la pone el juego (`GameUi.ConfigSearch`), va encima de las pestañas de
Configuración y busca por el nombre de la opción y por la explicación que escribe el juego. Es el
único juego que la implementa: los demás tienen pocos ajustes y el hueco del contrato es opcional.

**Los mods de Zomboid necesitan la carpeta de versión, y la regla no es la que parece.** Un mod con
el `mod.info` en la raíz no lo encuentra la Build 42: solo deja un «required mod not found» perdido
en el registro. Y manda la **serie mayor**, no «la versión más alta que no pase»: medido en un
servidor 42.20.4, un mod con carpeta `41` **no** carga, uno con `43` tampoco, y con `42` y `42.20` a
la vez cogió la `42`. `common` vale siempre. Está en `bestVersion()`, con la tabla de lo medido.

**Y un objeto del taller no es un mod.** Puede traer varios, y lo que va en `Mods=` es el `id` de
cada `mod.info`, no el número del taller. Además hay que rellenar `Map=` —con el mapa del juego **al
final**— y dejar `WorkshopItems=` vacío, porque el servidor arranca sin Steam y los mods ya están
copiados. Esas tres claves las escribe la app en cada arranque.

**Zomboid dice «World saved» antes de haber terminado de guardar.** Si copias justo después, tar
falla con un «(null)» que no dice nada, porque los ficheros cambian de tamaño mientras los lee. La
copia en caliente espera a que la carpeta de la partida deje de moverse.

**Y sus órdenes de moderación son quisquillosas.** Por RCON, `banuser fulano -r dupear items` (razón
de dos palabras) contesta con la **ayuda del comando** y no veta a nadie, aunque ese ejemplo salga en
su propia ayuda; con una sola palabra sí. Y las **comillas** rompen los comandos. Peor: el servidor
**no falla** cuando no entiende una orden —contesta con su ayuda—, así que hay que mirar la respuesta
o la app dirá que ha vetado a alguien que sigue jugando.

**Y sus cuentas viven en un SQLite que el servidor tiene abierto.** No hay listas de texto ni
ficheros JSON: `db/servertest.db`, con la tabla `whitelist` y los siete niveles de acceso. Se lee en
solo lectura con `node:sqlite` (así la pantalla enseña quién es quién esté el servidor como esté),
pero **cambiar algo va siempre por RCON**, y eso exige el servidor arrancado. La pantalla lo dice en
vez de esconder los botones.

**Enshrouded no se puede dejar de publicar, y eso cambia cómo se presenta.** No tiene `-public 0`
ni casilla equivalente: en cuanto el servidor arranca se conecta a Steam, se registra y sale en la
lista del juego con la IP pública del equipo. Es el caso de Rust, no el de Valheim. Como no se puede
arreglar, se dice: en la tarjeta del selector de juego, en el paso de conexión del asistente y antes
de abrir el router. Y de ahí sale la regla de que **los cuatro roles nazcan con contraseña**: un rol
sin contraseña es el que le toca a quien entre sin escribir ninguna, o sea, a cualquiera.

**Y escribe tu IP pública en su registro** (`[online] Public ipv4: …`), igual que Valheim con
crossplay. `parseLine` la esconde y se la borra hasta al texto que guarda, y esa regla va la primera
de todas. El smoke comprueba contra el registro real que ninguna línea enseña una dirección.

**En Enshrouded, un ajuste de partida con el preajuste puesto NO se aplica, y el fichero no lo
dice.** Con `gameSettingsPreset` en cualquier cosa que no sea `"Custom"`, el servidor ignora todos
los valores de `gameSettings`… pero el fichero se queda con ellos puestos, así que mirándolo parece
que están aplicados. Medido: con el preajuste `Default` y `playerHealthFactor: 2`, el servidor aplica
1. Por eso la app **pone `Custom` ella misma** en cuanto algo se aparta del preajuste, y lo hace en
el servicio, no solo al escribir el fichero, para que lo que enseña la pantalla y lo que se aplica no
puedan divergir.

**El servidor de Enshrouded vuelca por consola los ajustes que de verdad aplica.** `[server] Game
Settings 'Hard'` y un JSON detrás. Con eso se midieron los cuatro preajustes arrancándolo una vez
con cada uno (`EFFECTIVE_PRESETS`), en vez de copiarlos de una wiki, y el smoke los compara ajuste a
ajuste contra la grabación. Ojo con el formato: los decimales salen en **hexadecimal IEEE-754**
cuando no son exactos (`3fc00000` = 1,5) y las duraciones son objetos `{value}` en nanosegundos.

**El README oficial del servidor de Enshrouded se equivoca con los vetados.** Dice que la lista se
llama `bans` y que el identificador es `accountIDHash`; el servidor real escribe **`bannedAccounts`**
con **`accountId`** (un número) y la fecha dentro de un objeto. Con los nombres del README, el
servidor borra la lista entera al reescribir el fichero y la moderación no hace nada, sin un solo
mensaje. Lo que manda no es su documentación: es lo que el servidor deja escrito al arrancar.

**Enshrouded reescribe su `enshrouded_server.json` al arrancar, así que la app lo genera entero…
menos los vetados.** El servidor conserva lo que entiende, completa lo que falta y borra las claves
que no conoce, o sea que no tiene sentido guardar nada propio ahí. Pero hay algo que escribe él y la
app no sabe: la lista de vetados, que se llena desde dentro del juego. Por eso `writeConfig` **lee el
fichero antes de generarlo** y conserva `bannedAccounts` tal cual venga. Sin eso, arrancar el
servidor borraría los vetos puestos jugando.

**Ctrl+Break en Enshrouded, pero no antes de que esté listo.** Guarda y sale con código 0 en medio
segundo, que es lo más rápido de toda la app. Mandado mientras arranca, el proceso muere con
`0xC000013A` sin guardar: todavía no tiene manejador puesto. Por eso se repite la señal, como en
Valheim, y `diagnoseExit` traduce ese código en vez de soltar un número.

**De Enshrouded no se puede echar a nadie desde fuera.** Lo dice su propio ejecutable: `Dedicated
server kick not implemented`. Vetar tampoco: se hace desde dentro del juego, con la contraseña de
Administrador, en la pestaña Social. Lo único que se puede hacer desde la app es **quitar un veto**,
y con el servidor parado. La pantalla lo explica en vez de esconder los botones.

**El cargador de mods de Enshrouded sí habla por la consola.** Shroudtopia escribe `Registered mod`,
`Loading mod` y `Activating` por la salida estándar, al revés que BepInEx en Valheim, que solo lo
deja en su fichero. Lo que importa de verdad es su línea de error: se engancha a direcciones de
memoria del juego, así que una actualización de Enshrouded puede dejar un mod a medias **sin tumbar
el servidor** (`class NoResourceCostAddress not found`). Esa línea se traduce a «el mod X no encaja
con esta versión»; sin ella, el fallo no se notaría.

**Y apagar un mod de Enshrouded tampoco es tocar su configuración.** Poner `"active": false` en
`shroudtopia.json` **no** impide que el cargador lo cargue: medido, sigue saliendo `Loading mod` y
solo se salta `Activating`, así que el `Load()` del mod ya ha corrido. Hay que sacar el fichero de
`mods/`, la misma regla que en Satisfactory y Valheim.

**A la consola remota de Rust, una sola conexión por servidor, siempre.** Rust admite cuatro
conexiones WebRCON por dirección y **no suelta las cerradas** (medido: cuatro minutos después se
seguían rechazando). Conectar para cada orden, como hacía el cliente de la fase 1, lo dejaba sin
consola —y sin parada— en medio minuto. Todo va por `WebRconSession` (`rustRcon` en
`games/rust/rcon.ts`). Y **no compruebes el puerto de la consola con una conexión de prueba**
(`isPortInUse`) con el servidor en marcha: también ocupa sitio. Para saber si escucha, `netstat`.

**Rust no lee la entrada estándar, y su línea de órdenes se come el guion.** Todo lo que se le
manda va por WebRCON. Y `+app.port -1` llega como `1`: lo negativo va en `server.cfg`, en el bloque
de la app, que es lo único que la app escribe ahí. Todo lo demás va en la línea de órdenes, que
manda sobre `server.cfg` (medido).

**Rust escribe un tercio de sus líneas dos veces.** Es suyo, no de la tubería (en su `-logfile`
pasa igual). `LaunchSpec.dropEchoes` las filtra en el supervisor; cada línea absorbe un solo eco,
así que lo que se repite de verdad sigue saliendo.

**La IP pública y la contraseña de RCON salen en el registro de Rust.** La primera en «IP address
from external API»; la segunda, en su «Command Line» (el propio Rust la tapa, pero la regla está
por si deja de hacerlo). `parseLine` las borra hasta del texto guardado, y con cuidado de no tomar
por dirección una versión de cuatro números («v1.0.32.0»).

**El borrado mensual de Rust lo hace el juego, no la app.** El parche sube la versión de guardado
que va en el nombre del mapa (`proceduralmap.3000.12345.288.sav`) y el servidor actualizado ya no
lo encuentra. La app avisa, guarda la copia, actualiza y borra lo mismo que borraría el parche;
los planos (`player.blueprints.17.db`) llevan otra versión y solo se van si se pide. Si cambias qué
se borra, cambia también el smoke, que lo comprueba con los nombres reales.

**Oxide tiene que ser de la build exacta de Rust, y cada actualización lo quita.** Sustituye siete
DLL del juego. Vale si salió **después** de la build instalada, mirando `timebuildupdated` de
Steam y no `timeupdated`, que Facepunch retoca horas después. Quitarlo es borrar lo que añadió y
validar con SteamCMD, que devuelve los DLL originales (sha1 comprobado en la e2e).

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

**Todo lo que llega de la interfaz se trata como si viniera de fuera** (ANALISIS.md §19.36). La
ventana no puede navegar fuera de la app ni abrir otras (`src/main/security.ts`), pero si algo se
colara, el núcleo es el último límite:
- Los identificadores de servidor pasan por `instanceDir`, que exige la forma de `slugify`. No
  construyas la ruta de un servidor de otra forma.
- Un nombre suelto que llega de la interfaz (un mundo, una partida, un fichero) va con
  `childPath(carpeta, nombre)`, nunca con `join` a pelo.
- `shell.openPath` abre con el programa de Windows: con un `.exe` o un `.bat`, lo **ejecuta**. Solo
  para carpetas y ficheros que sabes que son de datos.
- Si añades un permiso del navegador (cámara, notificaciones…), va en la lista de `security.ts`.

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
[`core/runtime/restartPolicy.ts`](../src/main/core/runtime/restartPolicy.ts) como función pura, para
poder probarlo sin levantar servidores.

**El manifiesto tiene versión de esquema y se migra solo, nunca a mano.** Cada cambio de forma sube
`schemaVersion` y añade un paso puro en
[`core/instances/migrations.ts`](../src/main/core/instances/migrations.ts), probado en el smoke. Al leer
un manifiesto antiguo se guarda antes una copia (`instance.v1.json`) que no se pisa nunca, y uno de un
esquema más nuevo que la app no se toca: se rechaza. Lo específico de un juego va en `data`, no en la
raíz.

**Al guardar `server.properties`, manda solo las claves que han cambiado.** Enviar el objeto entero
reescribe con datos viejos lo que haya cambiado fuera del panel mientras estaba abierto — un plugin
puede mover `level-name` entre medias, y guardar el antiguo apunta a una carpeta borrada y se lleva
por delante la partida.

**Los plugins oficiales no están en este repositorio: se bajan de la release de el suyo.**
`npm run plugins` ([`scripts/official-plugins.mjs`](../scripts/official-plugins.mjs)) trae la última
release de cada uno a `resources/minecraft/plugins/<id>/` (ignorada por git): el jar, verificado con
el SHA-256 que publica GitHub; la plantilla `config.yml`, sacada de dentro del jar para que nunca se
quede de otra versión; y `plugin.json` con la versión, el nombre del jar, la licencia y el
repositorio, que es lo que lee la app (`content/official.ts`), «Acerca de» y los avisos de terceros.
Corre solo antes de `dev`, `build`, `smoke`, `e2e` y `e2e:custom`, y solo baja lo que falta (sin red
si ya está). La release usa `--update`: **sale siempre con la última release de cada plugin**, y
publicar una versión nueva del plugin no exige tocar nada aquí. Para probar otra en desarrollo,
`npm run plugins -- --update`. La release tiene que traer **un solo** jar que encaje con el patrón,
con su `plugin.yml` diciendo la misma versión que la etiqueta; si no, se para. Los repositorios están en
el script y en `repository` del catálogo; el smoke comprueba que coinciden.
Van fuera del asar (`extraResources`) porque hay que ponerlos como ficheros de verdad en la carpeta
del servidor.
Si añades un campo al catálogo de [`shared/games/minecraft/officialPlugins.ts`](../src/shared/games/minecraft/officialPlugins.ts), el
smoke comprueba que esa ruta existe en el YAML real, así que no puede quedarse un control que no
guarde nada.

**La configuración de plugins y mods ajenos se edita por líneas, nunca reescribiendo el fichero.**
Los editores de `core/formats/editable/` sustituyen solo el trozo del valor. Así los comentarios, que
son las explicaciones que enseña la ventana, sobreviven. Si añades un caso, pásalo por el banco de
`%LOCALAPPDATA%\qubiq-dev\ui\muestras-config` (73 ficheros reales). Leer y escribir sin cambios tiene
que dar los mismos bytes, y escribir el mismo valor no puede tocar nada. Lo que no sepas editar
sin riesgo, márcalo como solo lectura con su motivo; no lo adivines. Y no quites la comprobación de
huella al guardar: el plugin puede haber reescrito el fichero al arrancar (§19.20).

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
[`core/games/minecraft/ping.ts`](../src/main/core/games/minecraft/ping.ts), y tiene que resolverse
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
[`ConfigPanel.tsx`](../src/renderer/src/games/minecraft/ConfigPanel.tsx). Además el juego fuerza la dificultad a Difícil,
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
y poner la memoria en `user_jvm_args.txt`, no en la línea de comandos. NeoForge igual (lo común
está en `install/argfile.ts`), pero su versión **no lleva la de Minecraft delante**: se deduce
(`21.1.77` → 1.21.1, `21.0.x` → 1.21, `26.2.0.88` → 26.2, `26.1.2.109` → 26.1.2). Su catálogo trae
betas y experimentos de abril (`0.25w14craftmine`); ver `versions/neoforge.ts`.

**Un servidor a medida se arranca con cmd, y cmd tiene tres trampas** (`custom/launch.ts`):
- el run.bat de Forge y NeoForge termina en `pause`: sin consola, cmd se queda esperando una tecla
  y la app lo daría por arrancado. Se arranca una copia sin pausas (`qubiq-<nombre>.bat`) junto al
  original, que no se toca;
- el proceso que ve la app es cmd, no Java: forzar el cierre tiene que matar el árbol entero
  (`LaunchSpec.killTree`, con `taskkill /T`), o Java se queda vivo con el puerto y el mundo;
- con `NoDefaultCurrentDirectoryInExePath` (equipos endurecidos, y el entorno de estas
  herramientas) cmd no busca en la carpeta actual: hay que llamar a `.\run.bat`, no a `run.bat`.
  Y las comillas van con `/d /s /c ""...""` y `verbatimArguments`, el mismo patrón que usa Node.

**Traer un servidor a medida es MOVER la carpeta del usuario** (lo decidió él). En el mismo disco
es un renombrado; entre discos se copia a `server.importando`, se comprueba y solo entonces se
borra la original. Nunca se mueve encima de una carpeta con contenido, y `folderProblems` rechaza
la carpeta del usuario, las de sistema, las personales (Escritorio, Documentos...), un disco entero
y lo que ya es de QubiQ. El núcleo lo vuelve a comprobar en `prepareCreate` aunque la interfaz ya
lo haya hecho.

**`ELECTRON_RUN_AS_NODE`:** VS Code exporta esta variable a su terminal integrada. Si llega a
`electron.exe`, arranca como Node normal y la app muere con
`Cannot read properties of undefined (reading 'whenReady')`, un error que no apunta a la causa.
Por eso `npm run dev` pasa por `scripts/run-electron-vite.mjs`, que la elimina.

---

## Licencia y avisos

El proyecto es GPL-3.0-or-later ([LICENSE](../LICENSE)).

- **Dentro de la app**, Configuración → «Acerca de» enseña la versión, el copyright, el aviso de la
  licencia y los enlaces al código, a la licencia y a los avisos de terceros, como pide la GPLv3 a
  una interfaz interactiva (§0 y §5d). Esos datos están en `src/shared/about.ts`: si cambia la
  dirección del repositorio, se cambia ahí.
- **Avisos de terceros:** `npm run build` genera `out/THIRD-PARTY-NOTICES.txt` con la licencia de
  cada paquete de npm que entra **de verdad** en el bundle (`scripts/third-party-notices.ts`, a
  partir de los módulos que deja Rollup), y electron-builder lo copia junto al ejecutable con
  `LICENSE.txt`. Si un paquete nuevo no trae fichero de licencia, la compilación se para. Electron y
  Chromium dejan las suyas en la carpeta de instalación (`LICENSE.electron.txt`,
  `LICENSES.chromium.html`).
- **Código de cada versión publicada:** la etiqueta `vX.Y.Z` del repositorio es exactamente el código
  del que sale su instalador. Se compila con Node 24 (`.nvmrc`): `npm ci` y `npm run dist`.
