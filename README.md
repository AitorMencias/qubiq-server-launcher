# QubiQ Server Launcher

Crea y gestiona tu servidor de Minecraft en tres clics.

Aplicación de escritorio para Windows que descarga, configura, arranca y modera servidores de
Minecraft sin que el usuario tenga que instalar Java, editar ficheros de configuración ni tocar
la línea de comandos.

> NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.

El análisis completo —decisiones, arquitectura, fuentes de datos y hoja de ruta— está en
[ANALISIS.md](ANALISIS.md).

---

## Estado

MVP funcional. Las cuatro distribuciones se instalan, arrancan y paran correctamente:

| Distribución | Instalación | Arranque | Notas |
|---|---|---|---|
| Minecraft original (vanilla) | ✅ | ✅ | Verificación SHA-1 |
| Plugins (Paper) | ✅ | ✅ | API v3, verificación SHA-256 |
| Mods (Fabric) | ✅ | ✅ | Descarga dependencias en el primer arranque |
| Mods (Forge) | ✅ | ✅ | Instalador en dos fases + argfile |

Funciones disponibles:

- **Dos modos** — al crear un servidor eliges entre **básico** (no pregunta versión, memoria ni puerto)
  y **avanzado** (todo). Cambiable después desde la barra lateral.
- **Crear** — en básico, asistente paso a paso (una pregunta por pantalla) que acaba en un resumen
  editable; en avanzado, formulario completo. Java automático y EULA explícito en ambos
- **Lanzar** — arranque supervisado, consola en vivo, parada limpia
- **Configurar** — editor visual de `server.properties` con lenguaje llano y modo avanzado
- **Mundos** — varios mundos por servidor: crear, cambiar de uno a otro y borrar
- **Plugins y mods** — webs donde descargarlos, guía paso a paso, botón para abrir la carpeta y
  lista de lo instalado con activar/desactivar (solo en Paper, Fabric y Forge)
- **Plugins oficiales** — los nuestros viajan dentro de la app: se instalan con un botón y se
  configuran con un formulario, sin tocar ficheros YAML
- **Moderar** — jugadores conectados con expulsar, banear y dar OP
- **Borrar** — elimina el servidor con confirmación escribiendo su nombre
- **Copias de seguridad** — en caliente, restauración, retención y programadas
- **Conexión** — direcciones local y de red verificadas con Server List Ping real, y elección entre
  abrir puerto en el router o playit.gg, con guía paso a paso y comprobación desde internet

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
| `npm run build` | Compila a `out/` |
| `npm start` | Ejecuta lo compilado |
| `npm run typecheck` | Comprueba tipos de los tres lados (main, preload, renderer) |
| `npm run smoke` | 120 comprobaciones: lógica pura, mundos, red, plugins oficiales y contrato con las APIs externas |
| `npm run e2e [dist]` | Ciclo completo con un servidor real: instalar, arrancar, ping, copia en caliente, parada limpia, restauración y borrado. `dist`: `paper` (por defecto), `vanilla`, `fabric`, `forge` |
| `npm run e2e:restart` | Reinicio a petición del servidor: comprueba que reinicia cuando el plugin lo pide y que **no** reinicia cuando la parada es manual |

`npm run smoke` es el que avisa cuando una API de terceros cambia. La v2 de Paper murió de un día
para otro; sin esta prueba la app se rompería en silencio.

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
├── shared/              Tipos y contrato IPC (los usan ambos lados)
├── main/
│   ├── index.ts         Proceso principal: ventana, cierre limpio, antisuspensión
│   ├── ipc.ts           Puente comandos/eventos
│   └── core/            EL NÚCLEO — sin dependencias de Electron
│       ├── paths.ts     Rutas en disco (todo lo específico de Windows vive aquí)
│       ├── net/         HTTP con caché degradable, descargas verificadas y
│       │                Server List Ping (network.ts)
│       ├── versions/    Mojang, Paper, Fabric, Forge + catálogo unificado
│       ├── java/        Descarga y gestión de JDK (Adoptium)
│       ├── install/     Una estrategia por distribución + flags de JVM
│       ├── runtime/     Supervisor de proceso y parseo de log
│       ├── config/      server.properties con catálogo de opciones humanas
│       ├── content/     Plugins y mods: carpeta, listado y los oficiales
│       ├── backup/      Copias en ZIP, restauración y retención
│       ├── worlds/      Varios mundos por servidor (level-name)
│       ├── instances/   Ciclo de vida de las instancias
│       └── service.ts   Orquestador
├── preload/             Superficie expuesta al renderer (nada de Node)
└── renderer/            Interfaz React
```

Los datos del usuario viven fuera del proyecto, en `%APPDATA%/qubiq-server-launcher/`:

```
runtimes/          JDKs compartidos (jdk-21, jdk-25...)
cache/             Manifiestos e instaladores
instances/
  <id>/
    instance.json  Manifiesto: la INTENCIÓN del usuario
    server/        Directorio real del servidor (mundo, jars, config)
    backups/
    launcher.log   Log de la app, separado del del servidor
```

---

## Cosas que conviene saber antes de tocar el código

**No compares versiones de Minecraft como strings.** Conviven el versionado por año (`26.2`) y el
histórico (`1.21.8`), y `26.2` es *más nueva* que `1.21.11`. El orden autoritativo es el índice del
manifiesto de Mojang. Usa `compareVersions` y el tipo `VersionId`.

**Nunca mates el proceso del servidor.** Windows no tiene `SIGTERM`. La única parada segura es
escribir `stop` en `stdin` y esperar; matarlo corrompe chunks. El `kill` solo entra tras 60 s de
gracia y avisando.

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

**Al guardar `server.properties`, manda solo las claves que han cambiado.** Enviar el objeto entero
reescribe con datos viejos lo que haya cambiado fuera del panel mientras estaba abierto — un plugin
puede mover `level-name` entre medias, y guardar el antiguo apunta a una carpeta borrada y se lleva
por delante la partida.

**Los plugins oficiales van empaquetados en `resources/plugins/<id>/`**, con su jar y su plantilla de
`config.yml`. Se copian fuera del asar (`extraResources`) porque hay que ponerlos como ficheros de
verdad en la carpeta del servidor. Actualizar uno = copiar el jar nuevo ahí y recompilar la app.
Si añades un campo al catálogo de [`shared/officialPlugins.ts`](src/shared/officialPlugins.ts), el
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
[`core/net/network.ts`](src/main/core/net/network.ts).

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
[`ConfigPanel.tsx`](src/renderer/src/ConfigPanel.tsx). Además el juego fuerza la dificultad a Difícil,
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
