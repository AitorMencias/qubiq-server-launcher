# QubiQ Server Launcher — Análisis técnico y funcional

> Aplicación de escritorio para **crear, lanzar, configurar y moderar** servidores de Minecraft,
> dirigida a usuarios **no técnicos**.
>
> Fecha del análisis: **2026-09-10**. Todos los endpoints de la sección 4 fueron verificados
> con peticiones reales en esa fecha.

> *NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.*
> — aviso obligatorio según las directrices de Mojang (§13.1). Debe aparecer también en la app,
> el instalador, el README y la web.

**Decisiones de partida (todas cerradas):**

| | |
|---|---|
| **Nombre** | **QubiQ Server Launcher.** Cumple las directrices de marca; dominio `qubiq.gg` libre (§13.1). |
| **Licencia** | **GPLv3.** Fichero `LICENSE` ya en la raíz (§13.2). |
| **Stack** | **Electron + React + TypeScript** (no Tauri: no había cadena de Rust y corría prisa) (§14.2). |
| **Estado** | **MVP en marcha.** Las 4 distribuciones instalan, arrancan y paran limpiamente (§19). |
| **Firma de código** | **Sin certificado de pago.** Sin firmar al lanzar, SignPath Foundation (gratis) cuando haya tracción (§13.3). |
| **Plataforma** | **Solo Windows** en v1. Sin macOS ni Linux por ahora (§14.1). |
| **Modelo** | **Gratuita para la comunidad.** Sin versión de pago, sin funciones bloqueadas (§13.4). |
| **Alcance del MVP** | Vanilla + Paper + Fabric + **Forge**, este último el primero en implementarse (§15.1). |
| **Túnel** | playit.gg como último recurso del diagnóstico de red, **no empaquetado** (§10.1). |
| **Bedrock** | Geyser + Floodgate, un solo interruptor, en v2 (§11). |

---

## 1. Resumen ejecutivo

El objetivo es sustituir el flujo actual de un usuario doméstico —buscar un `.jar`, instalar Java,
editar `server.properties` a mano, arrancar un `.bat`, abrir puertos en el router— por una aplicación
donde crear un servidor jugable sean **tres clics**.

Cuatro decisiones marcan toda la arquitectura:

1. **Java gestionado por la app.** El usuario nunca instala Java. La app descarga el JDK/JRE correcto
   por instancia desde Adoptium. Es el mayor punto de fricción actual y el que más soporte genera.
2. **Paper como "Bukkit/Spigot" por defecto.** Spigot y CraftBukkit **no son redistribuibles** por
   motivos legales; solo pueden compilarse en la máquina del usuario con BuildTools. Paper implementa
   la misma API de plugins, es redistribuible y tiene mejor rendimiento. Spigot queda como ruta avanzada.
3. **Instancias aisladas.** Cada servidor es una carpeta autocontenida (mundo, jars, Java, config,
   backups). Se puede copiar, mover, duplicar y borrar sin efectos colaterales.
4. **Moderación en tiempo real vía consola.** Panel de jugadores con acciones (kick, ban, op, tp) que
   se traducen a comandos por `stdin` del proceso, no a ediciones de JSON en caliente.

Riesgo principal detectado: **el ecosistema de versiones ha cambiado de formato**. Minecraft ha
pasado a versionado por año (`26.2`, `26.1.2`) conviviendo con el histórico semántico (`1.21.8`).
Cualquier ordenación o comparación ingenua de versiones se romperá. Ver §4.6.

---

## 2. Alcance

### Dentro del alcance (v1)

| Área | Contenido |
|---|---|
| Creación | Asistente de 3 pasos, plantillas, todas las versiones, 6 distribuciones |
| Ejecución | Arranque/parada supervisada, consola en vivo, métricas de RAM/TPS/jugadores |
| Configuración | Editor visual de `server.properties`, RAM, flags de JVM, mundo |
| Moderación | Lista de jugadores, kick/ban/op/whitelist, chat, log de auditoría |
| Contenido | Instalación de plugins y mods desde Modrinth y Hangar |
| Red | Detección de IP, UPnP, diagnóstico de puerto, túnel para quien no puede abrirlo |
| Datos | Copias de seguridad automáticas y restauración |

### Fuera del alcance (explícito)

- **macOS y Linux.** Solo Windows en v1 (decisión tomada). Ver §14.1 sobre cómo no cerrarse la puerta.
- Hosting en la nube o panel web remoto (posible v3).
- Cliente de Minecraft / launcher de juego. Esto es solo servidor.
- Servidor Bedrock nativo. El soporte a móvil/consola se hace con **Geyser**, traduciendo sobre el
  servidor Java (§11), no manteniendo un segundo tipo de servidor.
- Cuentas no oficiales o bypass de autenticación. La app respeta `online-mode` pero no facilita piratería.
- Funciones de pago, suscripciones o telemetría comercial. El proyecto es gratuito (§13.4).

---

## 3. Usuario objetivo

**Perfil primario — "Padre/amigo organizador".** Quiere un mundo privado para 4-8 personas conocidas.
No sabe qué es un JAR, un puerto o la RAM. Su métrica de éxito es que sus amigos entren esta tarde.

**Perfil secundario — "Creador de comunidad".** Quiere un servidor con plugins, permisos, whitelist
y moderación. Entiende conceptos básicos pero no quiere editar YAML.

**Perfil terciario — "Modder".** Quiere Forge/NeoForge/Fabric con 150 mods. Necesita control de
memoria, flags y gestión de conflictos. Es el que más probablemente use el "modo avanzado".

Diseñamos para el primario, **sin bloquear** al terciario: toda la potencia existe, pero detrás de
un interruptor "Avanzado" que está apagado por defecto.

### Recorridos clave

1. **Primera vez → jugando en < 5 min.** Abrir app → "Crear servidor" → elegir plantilla → aceptar
   EULA → esperar descarga → "Iniciar" → copiar dirección → pegar en el juego.
2. **Un amigo no puede entrar.** Panel de red con diagnóstico: ¿está el servidor arrancado?
   ¿el puerto responde desde fuera? ¿la whitelist lo bloquea? Cada fallo con una solución accionable.
3. **Alguien está molestando.** Pestaña Jugadores → clic derecho sobre el nombre → Expulsar / Banear.
4. **Se ha roto el mundo.** Copias de seguridad → elegir punto → Restaurar.

---

## 4. Fuentes de datos (verificadas el 2026-09-10)

### 4.1 Vanilla (Mojang)

```
Manifiesto:  https://piston-meta.mojang.com/mc/game/version_manifest_v2.json
Metadatos:   <url del manifiesto por versión>   -> downloads.server.url + sha1 + javaVersion
Descarga:    https://piston-data.mojang.com/v1/objects/<sha1>/server.jar
```

Comprobado: release más reciente **`26.2`**, snapshot `26.3-pre-3`.
El JSON de `26.2` declara `javaVersion: { component: "java-runtime-epsilon", majorVersion: 25 }`
y un `server.jar` de ~58 MB con SHA-1 publicado.

**Dato de oro:** el propio manifiesto de cada versión indica el `majorVersion` de Java requerido.
Es la fuente de verdad para elegir el runtime — no hace falta mantener una tabla manual.
El campo `sha1` permite verificar toda descarga.

Las versiones muy antiguas (alpha/beta, y anteriores a 1.2.5) no incluyen `downloads.server`;
la app debe filtrarlas o marcarlas como no disponibles en vez de fallar.

### 4.2 Paper (recomendado como Bukkit/Spigot)

```
Proyecto:  https://fill.papermc.io/v3/projects/paper
Build:     https://fill.papermc.io/v3/projects/paper/versions/<ver>/builds/latest
```

> **La API v2 (`api.papermc.io/v2`) devuelve HTTP 410 Gone. Está retirada.** Cualquier tutorial o
> código que la use ya no funciona. Hay que usar **v3 en `fill.papermc.io`**.

La respuesta v3 entrega directamente `downloads["server:default"]` con `url`, `size`, `name` y
`checksums.sha256`. El canal (`STABLE` / `RECOMMENDED` / `ALPHA` / `BETA`) viene en el campo
`channel`. Cuando sale una versión de Minecraft, Paper publica builds `ALPHA` para ella durante
días antes del primer estable: esas versiones se ofrecen **marcadas como en pruebas**, nunca como
recomendadas, y solo se instalan si el usuario lo aceptó en el asistente (§19.17).

Mismo host para los proyectos hermanos: `velocity` (proxy), `folia` (multihilo), `waterfall` (obsoleto).

### 4.3 Spigot y CraftBukkit — caso especial legal

**No existe descarga directa legítima.** Contienen código de Mojang descompilado, y su distribución
no está permitida. La única vía lícita es compilar en la máquina del usuario:

```
https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar
java -jar BuildTools.jar --rev <version> [--compile craftbukkit]
```

Implicaciones prácticas, todas malas para un usuario no técnico:

- Requiere **Git instalado** además de un JDK (no basta un JRE).
- Tarda **5–20 minutos** y descarga cientos de MB.
- Falla con relativa frecuencia (red, antivirus, rutas con espacios o acentos — muy común en Windows
  con `C:\Users\<nombre>\Desktop\...`).

**Decisión de producto:** en la interfaz, la opción se llama **"Plugins (Bukkit/Spigot)"** y usa
**Paper**, que implementa la misma API y ejecuta los mismos plugins. Spigot/CraftBukkit "puros"
aparecen solo en modo avanzado, con aviso explícito del tiempo de compilación y de los requisitos.

### 4.4 Forge y NeoForge

```
Forge — promociones:  https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json
Forge — catálogo:     https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml
Forge — instalador:   https://maven.minecraftforge.net/net/minecraftforge/forge/<mcver>-<forgever>/forge-<mcver>-<forgever>-installer.jar
NeoForge — catálogo:  https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge
```

> Ojo: `promotions_slim.json` **solo responde en `files.minecraftforge.net`**; en
> `maven.minecraftforge.net` devuelve 404. Es un error fácil de cometer.

Forge sigue vivo y publica para las versiones nuevas: el `maven-metadata.xml` incluye `26.2-65.1.3`
junto a `1.21.8-58.1.22` y `1.20.1-47.4.23`.

Ambos requieren un **paso de instalación**, no basta con descargar un jar:
`java -jar forge-installer.jar --installServer`. Genera un launcher y una carpeta `libraries/`.
Las versiones modernas producen scripts `run.sh` / `run.bat` y un `user_jvm_args.txt`; la app debe
**leer los argumentos del `@argfile` generado** en lugar de asumir un `-jar server.jar`.

NeoForge usa versionado propio derivado de la versión de MC (`21.1.x` -> MC 1.21.1). Su catálogo mezcla
versiones `-beta` y experimentos (`0.25w14craftmine.3-beta`), que hay que filtrar.

### 4.5 Fabric

La opción más limpia de integrar. Tiene un endpoint que **genera el jar de servidor al vuelo**:

```
Versiones de juego:  https://meta.fabricmc.net/v2/versions/game
Loader:              https://meta.fabricmc.net/v2/versions/loader
Instalador:          https://meta.fabricmc.net/v2/versions/installer
Jar de servidor:     https://meta.fabricmc.net/v2/versions/loader/<mc>/<loader>/<installer>/server/jar
```

Verificado: loader estable **0.19.5**, instalador **1.1.2**, y el endpoint de jar devuelve 200 con un
launcher de ~180 KB (descarga sus dependencias al primer arranque, lo que requiere conexión la
primera vez — hay que avisarlo).

Quilt (`meta.quiltmc.org`) es un fork con la misma forma de API; candidato barato para v2.

### 4.6 ⚠ El problema del versionado

Minecraft ha migrado a **versionado por año**. Conviven en el mismo catálogo:

```
26.3-pre-3   26.2   26.1.2   1.21.11   1.21.8   1.20.1   1.16.5   1.8.9
```

Consecuencias que hay que resolver desde el día uno:

- **`semver` estándar no sirve.** `26.2` es *más nueva* que `1.21.11`, pero cualquier comparador
  lexicográfico o semántico dirá lo contrario.
- **No ordenar por número.** La única ordenación fiable es el **índice del manifiesto de Mojang**,
  que ya viene en orden cronológico descendente, o el campo `releaseTime`.
- **Detección de tipo por nombre.** `-pre`, `-rc`, `w` (snapshots semanales) marcan versiones
  inestables; el manifiesto ya lo dice en `type`, úsalo en vez de parsear el string.
- **Mapear versión de MC ↔ versión de loader** debe hacerse por tabla de la API correspondiente,
  nunca por aritmética de versiones.

Recomendación: un módulo `VersionId` propio que guarde `{ id, releaseTime, type, orderIndex }` y
**prohíba** comparar por string en el resto del código.

### 4.7 Java (Adoptium)

```
Disponibles:  https://api.adoptium.net/v3/info/available_releases
Binarios:     https://api.adoptium.net/v3/binary/latest/<major>/ga/<os>/<arch>/jdk/hotspot/normal/eclipse
```

Verificado: LTS disponibles **8, 11, 17, 21 y 25**. Java 25 ya es LTS, que es justo el que pide MC 26.x.

| Versión de Minecraft | Java requerido |
|---|---|
| ≤ 1.16.5 | 8 |
| 1.17.x | 16 (sirve 17) |
| 1.18 – 1.20.4 | 17 |
| 1.20.5 – 1.21.x | 21 |
| 26.x en adelante | **25** |

La tabla es solo orientativa para la interfaz: **la fuente real es `javaVersion.majorVersion`** del
metadato de cada versión (§4.1). Para Forge/Fabric se usa el de su versión base de Minecraft.

Los runtimes se guardan **compartidos** en el directorio de datos de la app (`runtimes/jdk-25/`),
no por instancia: son ~180 MB cada uno y varias instancias comparten el mismo.

### 4.8 Plugins y mods

| Fuente | Endpoint | Cobertura | Nota |
|---|---|---|---|
| **Modrinth** | `api.modrinth.com/v2` (200 ✓) | Mods, plugins, datapacks, shaders | API abierta, sin clave, filtros por loader y versión. **Fuente principal.** |
| **Hangar** | `hangar.papermc.io/api/v1` (200 ✓) | Plugins de Paper/Velocity | Oficial de PaperMC. Complemento natural. |
| CurseForge | `api.curseforge.com` | Mods (catálogo enorme) | Requiere clave de API y aprobación; muchos autores bloquean la descarga por terceros. Evaluar en v2. |
| SpigotMC | Spiget (no oficial) | Plugins legacy | Muchos recursos son enlaces externos, no descargables. Solo búsqueda, no instalación automática. |

Modrinth expone en cada versión de un proyecto sus `game_versions` y `loaders`, lo que permite
**filtrar automáticamente por la instancia activa** y no mostrar nunca algo incompatible. Ese filtrado
es la diferencia entre "instalar plugins" y "que el servidor no arranque y el usuario no sepa por qué".

---

## 5. Arquitectura propuesta

```
┌──────────────────────────────────────────────────────────┐
│  UI  (React + TypeScript)                                │
│  Biblioteca · Asistente · Consola · Jugadores · Ajustes   │
└───────────────────────────┬──────────────────────────────┘
                            │  IPC tipado (comandos + eventos)
┌───────────────────────────┴──────────────────────────────┐
│  Núcleo                                                  │
│                                                          │
│  VersionCatalog     agrega y cachea las 6 fuentes        │
│  Downloader         cola, reintentos, verificación hash  │
│  JavaManager        resuelve, descarga y cachea runtimes │
│  InstanceManager    CRUD de instancias, plantillas       │
│  Installer          estrategia por distribución (§6)     │
│  ProcessSupervisor  arranque, parada limpia, crash loop  │
│  ConsoleBridge      stdout -> eventos; stdin -> comandos │
│  ServerState        jugadores, TPS, RAM, estado          │
│  ConfigService      server.properties, ops, whitelist    │
│  ContentManager     Modrinth / Hangar                    │
│  BackupService      snapshots + retención                │
│  NetworkService     UPnP, IP pública, sondeo de puerto   │
└──────────────────────────────────────────────────────────┘
```

Regla de diseño: **el núcleo no conoce la interfaz**. Todo se expone como comandos y un flujo de
eventos. Eso permite reutilizarlo tal cual si en v3 se añade un panel web o una CLI.

### 5.1 Estructura en disco de una instancia

```
<datos-app>/
├── runtimes/                 JDKs compartidos
│   ├── jdk-21/
│   └── jdk-25/
├── cache/                    manifiestos e instaladores descargados
└── instances/
    └── survival-amigos/
        ├── instance.json     manifiesto de la app (ver abajo)
        ├── server/           <- directorio real de trabajo del servidor
        │   ├── server.jar | libraries/ | run.bat
        │   ├── server.properties, eula.txt, ops.json, whitelist.json
        │   ├── world/ world_nether/ world_the_end/
        │   ├── plugins/ | mods/
        │   └── logs/
        ├── backups/
        │   └── 2026-09-10_18-30.zip
        └── launcher.log      log propio de la app, separado del del servidor
```

`instance.json` describe **intención**, no estado derivado. Desde la v0.4 (esquema 2, §19.13) lo
común va en la raíz y lo propio del juego dentro de `data`:

```json
{
  "schemaVersion": 2,
  "id": "survival-amigos",
  "name": "Survival con amigos",
  "game": "minecraft",
  "port": 25565,
  "autoRestart": true,
  "backup": { "enabled": true, "intervalHours": 6, "keep": 10 },
  "createdAt": "2026-09-10T18:00:00Z",
  "agreements": ["minecraft-eula"],
  "data": {
    "distribution": "paper",
    "minecraftVersion": "26.2",
    "build": "123",
    "javaMajor": 25,
    "memoryMb": 4096,
    "jvmArgs": ["-XX:+UseG1GC"]
  }
}
```

Separar `instance.json` de `server/` permite duplicar una instancia, borrar el mundo sin perder la
configuración, y que un fallo de la app nunca corrompa datos del servidor.

---

## 6. Instalación por distribución

Cada distribución es una **estrategia** con la misma interfaz
(`resolveVersions`, `install`, `buildLaunchCommand`):

| Distribución | Instalación | Comando de arranque |
|---|---|---|
| Vanilla | Descarga directa + verificación SHA-1 | `java <flags> -jar server.jar nogui` |
| Paper | Descarga directa + verificación SHA-256 | `java <flags> -jar paper-<v>-<build>.jar nogui` |
| Fabric | Descarga del launcher generado por meta | `java <flags> -jar fabric-server-launch.jar nogui` |
| Forge | `java -jar installer.jar --installServer` | argfile generado (`@libraries/.../win_args.txt`) |
| NeoForge | Igual que Forge | argfile generado |
| Spigot/CraftBukkit | BuildTools local (avanzado) | `java <flags> -jar spigot-<v>.jar nogui` |

Puntos donde esto se rompe en la práctica y hay que blindar:

- **Forge/NeoForge modernos no producen un jar ejecutable.** Hay que localizar el argfile por SO.
  Asumir `-jar` funciona en 1.16 y falla en todo lo posterior.
- **Fabric descarga dependencias en el primer arranque.** Si la instalación se hizo con red y el primer
  arranque no la tiene, falla de forma confusa. Conviene forzar un primer arranque de validación.
- **`eula.txt`.** El servidor se cierra al primer arranque hasta aceptarlo. La app debe presentar el
  **enlace al EULA y una casilla explícita**. Escribirlo automáticamente sin consentimiento es
  jurídicamente discutible y hay que evitarlo.
- **Rutas con espacios o acentos.** El escritorio típico en Windows es
  `C:\Users\José Antonio\Desktop\...`. Todo comando debe ir con argumentos entrecomillados; BuildTools
  en particular es sensible a esto.

### 6.1 Argumentos de JVM

Valor por defecto sensato (basado en los flags de Aikar, estándar de facto para G1GC en servidores):

```
-Xms<mem>M -Xmx<mem>M
-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200
-XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch
-XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M
-XX:G1ReservePercent=20 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15
-XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5
-XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1
```

`Xms = Xmx` es intencional en servidores. La RAM sugerida se calcula sobre la **memoria física
disponible**, nunca la total: proponer `min(RAM_total - 4 GB, 8 GB)` y **avisar** si el usuario supera
ese margen, que es el error clásico que congela el PC del anfitrión.

---

## 7. Ejecución y consola

**Supervisión del proceso**

- Arranque con `stdio` en tuberías; el directorio de trabajo es `server/`.
- **Parada limpia:** enviar `stop` por `stdin` y esperar hasta 60 s. Solo matar el proceso si expira.
  Matar un servidor de Minecraft sin `stop` corrompe chunks — es la causa nº 1 de mundos rotos.
- **Al cerrar la app** con servidores activos: preguntar y ejecutar la parada limpia. Nunca cerrar
  a lo bruto.
- **Detección de bucle de fallos:** si el proceso muere 3 veces en 5 minutos, desactivar el
  reinicio automático y mostrar el error extraído del log en vez de reintentar en bucle.

**Parseo del log.** El formato es estable (`[HH:mm:ss] [Server thread/INFO]: ...`), pero **frágil como
API**. Se usa para:

- `Done (12.345s)! For help, type "help"` -> servidor listo (evento clave para la UI).
- `<jugador> joined the game` / `left the game` -> presencia.
- `<jugador>` en chat -> moderación automática.
- `FAILED TO BIND TO PORT` -> puerto ocupado (con diagnóstico y sugerencia de cambio).
- `java.lang.OutOfMemoryError` -> RAM insuficiente (con sugerencia concreta de subirla).

Cada patrón conocido se traduce a un **mensaje humano con acción**, no a un volcado de log. El log
crudo sigue disponible en una pestaña, pero no es lo primero que ve el usuario.

**Errores traducidos** (catálogo mínimo):

| Síntoma técnico | Lo que ve el usuario |
|---|---|
| `FAILED TO BIND TO PORT` | "El puerto 25565 ya está en uso. ¿Usar el 25566?" [Cambiar] |
| `UnsupportedClassVersionError` | "Esta versión necesita Java 25. Descargando…" (automático) |
| `OutOfMemoryError` | "El servidor se quedó sin memoria. Recomendamos subir a 6 GB." [Aplicar] |
| `You need to agree to the EULA` | Diálogo de EULA con enlace y casilla |
| Salida con código ≠ 0 sin patrón | "El servidor se cerró inesperadamente." [Ver detalles] [Copiar informe] |

**Consola.** Salida en vivo con búsqueda, filtro por nivel y autocompletado de comandos frecuentes.
Visible siempre, pero **no es la pantalla principal**: la principal es el estado del servidor.

---

## 8. Configuración

`server.properties` tiene ~60 claves con nombres crípticos. La estrategia es un **catálogo de opciones
tipado** que envuelve cada clave con: etiqueta en castellano, explicación en una frase, tipo (bool /
enum / rango / texto), valor por defecto, y nivel (`básico` / `avanzado`).

Ejemplo del contraste:

| Clave real | Cómo se presenta |
|---|---|
| `pvp=true` | **Los jugadores pueden pelearse entre sí** · Desactívalo para un mundo pacífico |
| `difficulty=easy` | **Dificultad** · Pacífico / Fácil / Normal / Difícil |
| `view-distance=10` | **Distancia de visión** · 10 chunks · *Bajarlo mejora el rendimiento* |
| `spawn-protection=16` | **Zona protegida alrededor del punto de aparición** |
| `enforce-secure-profile` | (avanzado) |

Reglas de implementación:

- **Preservar comentarios y claves desconocidas** al reescribir el fichero. Los plugins y las versiones
  nuevas añaden claves; perderlas al guardar es un bug silencioso y destructivo.
- **Bloquear la edición con el servidor arrancado**, o avisar de que requiere reinicio. El servidor
  reescribe `server.properties` al parar y machacaría los cambios.
- Cambios que **destruyen el mundo** (`level-seed`, `level-type`, `world` distinto) exigen confirmación
  explícita y ofrecen copia de seguridad previa.

---

## 9. Moderación

Módulo diferenciador: es lo que hoy obliga a usar consola o plugins.

**Jugadores conectados** — lista en vivo con avatar (`mc-heads.net` / `crafatar.com` por UUID), tiempo
conectado, ping. Acciones por jugador:

| Acción | Comando emitido |
|---|---|
| Expulsar | `kick <jugador> <motivo>` |
| Banear (con duración) | `ban <jugador> <motivo>` (temporal requiere plugin) |
| Banear IP | `ban-ip <ip>` |
| Dar/quitar operador | `op` / `deop` |
| Whitelist | `whitelist add` / `remove` |
| Teletransportar / traer | `tp` |
| Cambiar modo de juego | `gamemode <modo> <jugador>` |

> **Regla crítica:** con el servidor **arrancado**, actuar **siempre por comando**, nunca editando
> `ops.json`, `whitelist.json` o `banned-players.json` en disco. El servidor mantiene esos ficheros en
> memoria y los reescribe al parar, descartando los cambios externos. Solo se editan directamente con
> el servidor detenido (útil para preparar una whitelist antes del primer arranque).

**Resolución de nombres.** Para whitelist/ban previos al arranque hace falta el UUID:
`api.mojang.com/users/profiles/minecraft/<nombre>` (limitado por tasa -> cachear en un `usercache`
propio). En `online-mode=false` el UUID es determinista (MD5 v3 de `OfflinePlayer:<nombre>`).

**Chat y auditoría.** Vista de chat extraída del log, con posibilidad de enviar mensajes como consola
(`say`). Todas las acciones de moderación se registran en un log de auditoría local (quién, qué,
cuándo, motivo) — necesario para comunidades con varios moderadores.

**Automoderación (v2).** Reglas simples y explicables: lista de palabras prohibidas, antispam por
frecuencia de mensajes, límite de conexiones por IP. Cada regla con acción configurable
(avisar / silenciar / expulsar) y siempre visible en el log de auditoría.

---

## 10. Red y conectividad

El segundo mayor motivo de abandono, después de Java: **el servidor arranca pero nadie puede entrar.**

La app ofrece un panel de conexión con tres direcciones diferenciadas y explicadas:

1. **Este equipo:** `localhost:25565`
2. **Misma casa / red local:** `192.168.x.x:25565` (detectada automáticamente)
3. **Desde internet:** `<IP pública>:25565` — con verificación real de accesibilidad

**Diagnóstico automatizado**, en este orden:

1. ¿El proceso está vivo y el puerto escuchando en local?
2. ¿Responde al **Server List Ping** (protocolo de handshake del propio Minecraft)? Esto valida el
   servidor de verdad, mejor que un simple TCP connect.
3. ¿Es accesible desde fuera? (servicio externo de sondeo, con consentimiento del usuario).
4. Si falla el paso 3 -> intentar **UPnP/NAT-PMP** para mapear el puerto automáticamente.
5. Si UPnP está desactivado en el router -> ofrecer **túnel** (playit.gg o similar), que da una
   dirección pública sin tocar el router. Es la salida realista para CGNAT, muy común hoy.

Cada paso fallido muestra qué significa y qué hacer, no un código de error.

**Nota de privacidad:** consultar la IP pública y sondear el puerto implica contactar con un servicio
externo. Debe pedirse consentimiento la primera vez y poder desactivarse.

### 10.1 El túnel (playit.gg) — qué es y por qué hace falta

**El problema.** Para que alguien entre desde internet, el router debe aceptar conexiones *entrantes*
y reenviarlas al PC. Eso falla por dos motivos, y el segundo no tiene arreglo local:

1. **Abrir puertos manualmente** exige entrar en el router, conocer la contraseña de administrador y
   encontrar el menú correcto — distinto en cada marca y operador. Para el perfil primario es un muro.
2. **CGNAT.** Muchos operadores ya no asignan una IP pública por cliente, sino una compartida entre
   cientos. En ese caso **no existe ningún puerto que abrir**: es imposible por diseño, haga lo que
   haga el usuario. Es habitual en fibra de bajo coste, 4G/5G y operadores móviles.

**Cómo lo resuelve un túnel.** Invirtiendo el sentido de la conexión. Un pequeño programa (*agente*)
corre en el PC del usuario y abre una conexión **saliente** al proveedor — y las salientes no las
bloquea nadie, igual que no hay que configurar nada para navegar. El proveedor entrega una dirección
pública y reenvía el tráfico por ese túnel ya establecido:

```
Jugador  →  nodo de playit.gg  →  [túnel ya abierto]  →  agente en el PC  →  Minecraft :25565
```

El router nunca ve una conexión entrante. No hay nada que configurar, y funciona bajo CGNAT.

**Qué es playit.gg.** Un servicio de túneles orientado a servidores de juego. Nivel gratuito
suficiente, subdominio estable (`algo.joinmc.link`), y soporte de **TCP (Java) y UDP (Bedrock)** —
esto último importa para Geyser (§11). Su agente es de código abierto.

| Alternativa | Veredicto |
|---|---|
| **playit.gg** | **Elegida.** Gratuito, orientado a Minecraft, dirección estable, TCP + UDP. |
| ngrok | Genérico; en el plan gratuito el puerto cambia en cada arranque. Inservible para "pásale esta dirección a tus amigos". |
| Cloudflare Tunnel | No enruta TCP arbitrario fuera de HTTP salvo con Spectrum (plan de empresa). No sirve para Java. |
| Tailscale / ZeroTier | Red privada: **cada amigo instala también el programa**. Excelente para un grupo cerrado y fijo, malo para invitar a alguien nuevo. Candidato a segunda opción en v2. |

**Contrapartidas que la interfaz debe declarar, no esconder:**

- El tráfico pasa por un tercero → **más latencia**, según la región del nodo asignado.
- Dependencia de un servicio externo gratuito que puede cambiar condiciones o caer.
- **Todos los jugadores llegan con la misma IP** (la del túnel). Consecuencias directas:
  `ban-ip` deja de servir, los límites de conexiones por IP se vuelven contraproducentes, y
  **`prevent-proxy-connections` debe ponerse a `false`** o el servidor rechazará conexiones legítimas.
  La app debe ajustarlo automáticamente al activar el túnel y explicar por qué.

**Decisión de integración: no empaquetar el binario.** Se ofrece como **último paso del diagnóstico**
(§10, paso 5), solo cuando UPnP ha fallado y hay indicios de CGNAT, descargando el agente oficial con
consentimiento explícito. Razones: evita arrastrar un ejecutable de terceros en el instalador (con sus
falsos positivos de antivirus, su ciclo de actualización y su licencia), y mantiene la app utilizable
si el servicio desaparece. La app gestiona el ciclo de vida del agente como un proceso hijo más,
igual que el servidor.

---

## 11. Jugadores de móvil y consola (Bedrock / Geyser)

**El contexto.** Minecraft son en realidad **dos juegos con protocolos incompatibles**:

- **Java Edition** — PC, la de siempre, la de estos servidores.
- **Bedrock Edition** — móvil, tablet, Xbox, PlayStation, Switch y la versión "Minecraft for Windows"
  de la Microsoft Store.

Por defecto **un jugador de Bedrock no puede entrar en un servidor Java**. Es, con diferencia, la
duda de soporte más frecuente en servidores familiares: *"mi hijo lo tiene en la tablet y no entra"*.
Resolverlo bien es un diferenciador grande para el perfil primario.

**Qué hace Geyser.** Es un **traductor de protocolo en tiempo real**. Se instala en el servidor Java
(plugin de Paper, mod de Fabric/NeoForge, o proceso independiente) y hace que el servidor aparezca
*además* como servidor Bedrock, traduciendo cada paquete en ambos sentidos.

**Qué hace Floodgate.** Complemento imprescindible de Geyser: permite que el jugador de Bedrock entre
con su **cuenta de Xbox/Microsoft normal**, sin necesitar además una cuenta de Java. Los identifica
con un prefijo (`.Nombre` por defecto) para que no colisionen con nombres de Java. Sin Floodgate, la
alternativa sería `online-mode=false`, que abre la puerta a suplantaciones — inaceptable.

**Límites reales, a declarar en la interfaz:**

| Límite | Detalle |
|---|---|
| **Puerto distinto** | Bedrock usa **UDP 19132**, no el TCP 25565 de Java. Son **dos** puertos a abrir/mapear. El diagnóstico de red (§10) debe cubrir ambos, y el túnel debe soportar UDP — playit.gg lo hace. |
| **Mods de contenido** | Funciona bien en vanilla y con plugins. **No funciona con Forge/Fabric que añadan bloques o items**: el cliente Bedrock no los conoce. En instancias modded, el interruptor debe aparecer deshabilitado con la explicación. |
| **Consolas** | Xbox, PlayStation y Switch **no permiten escribir una dirección de servidor arbitraria**. Requiere cambiar el DNS de la consola (BedrockConnect). La app puede **documentarlo paso a paso**, pero no automatizarlo. Móvil, tablet y Windows sí son directos. |
| **Paridad de versiones** | Geyser soporta un rango concreto de versiones de Java y de Bedrock. Hay que consultar su compatibilidad antes de ofrecer el interruptor, no asumirla. |

**Diseño propuesto.** Un único interruptor en la configuración de la instancia:
**"Permitir jugadores de móvil y consola"**. Al activarlo, la app instala Geyser y Floodgate, ajusta
el puerto UDP, lo añade al diagnóstico y muestra en el panel de conexión **una dirección Bedrock
separada** (dirección + puerto 19132), junto a un enlace a la guía de consolas. Al desactivarlo,
retira ambos limpiamente.

---

## 12. Copias de seguridad

- **Secuencia correcta con el servidor arrancado:** `save-off` -> `save-all flush` -> esperar
  confirmación en el log -> copiar -> `save-on`. Copiar sin esto produce backups corruptos.
- Formato ZIP (compatible sin herramientas) con opción de ZSTD para mundos grandes.
- Retención configurable (por número y por antigüedad), con estimación de espacio en disco.
- Programadas por intervalo y **automáticas antes de operaciones de riesgo**: cambio de versión,
  cambio de distribución, instalación masiva de mods, edición de opciones destructivas.
- Restauración con vista previa (fecha, tamaño, versión) y copia de seguridad del estado actual
  antes de sobrescribir.

---

## 13. Seguridad, legal y privacidad

| Asunto | Postura |
|---|---|
| **EULA de Minecraft** | Consentimiento explícito del usuario por instancia. Nunca escribir `eula=true` de forma automática. |
| **Spigot/CraftBukkit** | No redistribuir. Solo compilación local con BuildTools. |
| **Verificación de descargas** | Comprobar SHA-1 (Mojang) y SHA-256 (Paper) siempre. Rechazar y reintentar si no cuadra. HTTPS obligatorio, sin excepciones para certificados. |
| **Ejecución de código** | Plugins y mods son código arbitrario con permisos completos. Advertir claramente al instalar desde fuentes no verificadas. |
| **Privilegios** | La app **no** requiere administrador. Si UPnP falla, se explica; no se escala privilegios. |
| **RCON** | Protocolo **sin cifrar**. Desactivado por defecto. Si se activa: contraseña fuerte obligatoria y aviso de no exponerlo a internet. Para el servidor local se usa `stdin`, que no necesita RCON. |
| **Datos personales** | Nombres y UUID se guardan solo en local. Telemetría opcional, desactivada por defecto y anónima. |
| **Antivirus en Windows** | Descargar y ejecutar JARs dispara falsos positivos y Defender puede bloquear silenciosamente. Firmar el ejecutable y documentar la exclusión de carpeta. |
| **Servicios de terceros** | El agente de túnel (§10.1) y Geyser/Floodgate (§11) se descargan de sus fuentes oficiales, con consentimiento y verificación de hash. Nunca se redistribuyen dentro del instalador. |

### 13.1 Nombre del producto y directrices de marca de Mojang

> Verificado el 2026-09-10 contra las *Minecraft Usage Guidelines* oficiales
> (`minecraft.net/usage-guidelines`).

Las directrices son explícitas y afectan directamente a cómo se puede llamar la app:

> *"You may not use the Minecraft name as the primary or dominant name or title."*
>
> Se permite usarlo *"as a secondary name, secondary title, or description"*, siempre que ese elemento
> *"is not the dominant element or the distinctive part of the complete name or title"*.

Por eso se descartó *"Minecraft Server Launcher"*: "Minecraft" sería la primera palabra y el elemento
dominante. Es el mismo criterio que aplican a publicaciones, donde dicen literalmente que el nombre
*"can't be the first word or dominant part of the title"*.

#### Nombre elegido: **QubiQ Server Launcher**

**Cumple sin reservas.** No contiene la palabra "Minecraft" en ninguna posición, así que la restricción
del nombre dominante no llega ni a aplicarse. "QubiQ" es la marca distintiva y "Server Launcher" un
descriptor genérico. Minecraft queda relegado a la descripción, que es justo el uso permitido:

```
QubiQ Server Launcher
Crea y gestiona tu servidor de Minecraft en tres clics
```

**Dominios** (consultado por DNS el 2026-09-10 — conviene reconfirmar en un registrador, porque un
dominio puede estar registrado sin tener DNS activo):

| Dominio | Estado |
|---|---|
| **`qubiq.gg`** | **Libre.** `.gg` es el TLD de referencia en gaming — encaje perfecto. **Recomendado.** |
| `qubiqlauncher.com` | Libre. Alternativa de respaldo. |
| `qubiq.com` / `.io` / `.app` / `.dev` / `.es` | Registrados por terceros. |

**Aviso menor:** que `qubiq.com`, `.io`, `.app`, `.dev` y `.es` estén todos tomados sugiere que existen
otras entidades usando el nombre. Para un proyecto libre sin actividad comercial el riesgo es bajo,
pero conviene una búsqueda de marcas en la categoría de software antes de invertir en identidad visual.

**Obligaciones adicionales que la app debe cumplir**, con o sin nombre propio:

| Requisito | Dónde aplicarlo |
|---|---|
| **Aviso obligatorio y visible**: `NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT` | Pantalla "Acerca de", pie del instalador, README y web. |
| No usar logos, fuentes, texturas ni assets de Minecraft | El icono y la identidad visual deben ser originales. Nada de bloques de tierra ni Creepers en el logo. |
| No parecer oficial ni sugerir asociación | Ni en el nombre, ni en el dominio, ni en las capturas. |
| No redistribuir el juego ni sus ficheros | Ya cubierto por el diseño: la app **descarga** de las fuentes oficiales, no empaqueta nada (§4, §6). |

El nombre interno del repositorio y de la carpeta (`minecraft-server-launcher`) es descriptivo y de bajo
riesgo; lo que hay que resolver es el **nombre de producto visible**.

#### Iconos de los juegos

**Decisión (2026-09-16): iconos propios, no los logos oficiales.** Aunque la app no sea comercial:

- **Minecraft lo prohíbe expresamente** (tabla anterior: nada de logos ni assets).
- **Los logos no pueden ir bajo GPLv3:** el repositorio entero se publica con esa licencia y un logo
  ajeno no se puede licenciar así.
- No ser comercial no exime ni de la marca registrada ni de los derechos de autor del dibujo.

Los ejecutables de algunos servidores traen su icono oficial (Valheim, Satisfactory y Rust sí;
Enshrouded y Minecraft no). Leerlo del servidor instalado no sería redistribuir, pero solo existe
tras instalar, es de 32 px y no cubre a todos. Se descartó.

**Criterio de parecido:** se evoca el **juego**, nunca el **logo**. Vale el color con el que se asocia
y un objeto de su mundo, dibujados desde cero. No valen los símbolos que el estudio usa como marca ni
nada calcado o modificado a partir del original.

| Juego | Icono | Se evita |
|---|---|---|
| Minecraft | Pico en pixel art propio, verde | Bloque de hierba, Creeper, texturas, tipografía |
| Satisfactory | Cinta transportadora con piezas, verde industrial y naranja | La «S» sobre placa metálica, FICSIT |
| Valheim | Casco con cuernos y brasas, azul acero | La «V» rúnica con fuego |
| Project Zomboid | Ventana tapiada con ojos en la oscuridad, rojo oscuro | Rótulo e ilustración de portada |
| Enshrouded | Linterna sobre niebla, violeta | Rótulo y emblema |
| Rust | Hacha de piedra, rojo óxido | Emblema de tres aspas sobre rojo, rótulo |
| Factorio | Engranaje con brazo mecánico, ámbar | Rótulo |

Todos comparten azulejo, trazo blanco y los puntos de luz del icono de QubiQ. Que se lean como una
familia de la app, y no como logos sueltos, es la mejor garantía de que ninguno se confunda con el
oficial. El de Minecraft ya se muestra en la app (lista de servidores, cabeceras y selector de juego). Están en `src/renderer/src/games/<juego>/icon.svg` y los genera `scripts/generate-game-icons.mjs` con coordenadas
calculadas (los píxeles del pico, los dientes del engranaje), no dibujados a ojo.

### 13.2 Licencia del código — ¿hace falta?

Depende de si el código se publica. Los tres escenarios:

| Escenario | ¿Necesitas licencia propia? |
|---|---|
| **No publicas el código**, solo el instalador | No hace falta licencia propia. **Pero sigues obligado** a cumplir las de tus dependencias. |
| **Publicas en GitHub sin fichero de licencia** | Por defecto queda como **"todos los derechos reservados"**: nadie puede contribuir, forkear ni redistribuir legalmente. Es lo contrario de un proyecto comunitario, y pasa por omisión. |
| **Publicas con licencia** | Es el caso deseado. Cuesta un fichero de texto. |

**Obligación que existe en los tres casos:** Tauri y los *crates* de Rust son MIT/Apache-2.0 y exigen
**incluir sus avisos de copyright en la distribución**, también en una app cerrada. Tauri tiene un
plugin que genera ese fichero de atribuciones automáticamente. Es media hora de trabajo y no es opcional.

**Lo que NO es la licencia:** no tiene ninguna relación con el **certificado de firma de código**
(§18.2). Se llaman parecido y se confunden constantemente. La licencia es un fichero de texto gratuito
que define derechos de uso; el certificado es un gasto anual que evita la advertencia de SmartScreen.

#### ✅ Licencia elegida: **GPLv3**

El fichero `LICENSE` ya está en la raíz del repositorio (texto oficial de la FSF).

El motivo es específico de este ecosistema: los launchers de Minecraft arrastran un historial largo de
forks reempaquetados con adware y mineros de criptomonedas. Con MIT, cualquiera podría coger la app,
añadirle publicidad, cerrar el código y republicarla sin devolver nada. GPLv3 obliga a que todo
derivado publique su código, lo que dificulta esconder ese tipo de manipulación y da base legal para
actuar. Encaja con la premisa de "gratuita para la comunidad".

**Efecto secundario muy relevante:** GPLv3 es una licencia **aprobada por la OSI**, y eso es
precisamente el requisito de entrada de **SignPath Foundation**, que firma binarios de proyectos
libres **gratis**. Es decir, esta decisión **desbloquea la vía gratuita de firma de código** descrita
en §13.3. Con una licencia propietaria o con doble licencia comercial, esa puerta quedaría cerrada.

**Tareas derivadas:**

- Añadir la cabecera de GPLv3 en los ficheros fuente principales.
- Generar el fichero de atribuciones de dependencias (plugin de Tauri) e incluirlo en el instalador
  y en la pantalla "Acerca de".
- Verificar que ninguna dependencia tenga licencia incompatible con GPLv3 antes de publicar.

### 13.3 Firma de código: ¿es realmente necesaria?

**Respuesta corta: no es obligatoria, y no tiene nada que ver con que el proyecto sea gratuito.**
La app funciona perfectamente sin firmar. Lo que está en juego es otra cosa: la **fricción de
instalación** para el perfil de usuario al que va dirigida.

**Qué pasa exactamente sin firma.** Windows SmartScreen muestra una pantalla azul —
*"Windows protegió su PC"*— con un único botón visible: **No ejecutar**. Para instalar hay que pulsar
"Más información" y luego "Ejecutar de todas formas". Un usuario técnico lo hace sin pestañear; el
perfil primario de §3 **cierra la ventana y desinstala mentalmente el proyecto**. Ese es el coste real,
y cae justo sobre el público objetivo.

**Tres datos que suelen desconocerse antes de gastar dinero:**

1. **Un certificado barato NO elimina la advertencia de inmediato.** SmartScreen funciona por
   *reputación del editor*, que se acumula con las descargas. Con un certificado OV normal puedes pagar
   y seguir viendo el aviso durante semanas.
2. **Solo los certificados EV dan reputación instantánea**, y son bastante más caros.
3. **Desde 2023 todos los certificados exigen almacenamiento en HSM o token físico.** Ya no existen los
   certificados baratos en fichero; el precio subió para todos.

**Opciones reales, ordenadas para un proyecto gratuito:**

| Opción | Coste | Valoración |
|---|---|---|
| **SignPath Foundation** | **Gratis** | **La vía recomendada.** Firma binarios de proyectos libres sin coste. Requiere licencia aprobada por la OSI (GPLv3 ✅), sin componentes propietarios, MFA obligatorio en GitHub y en SignPath, y compilación automatizada desde el repositorio. **Pega importante:** para ejecutables exigen *"a certain verifiable reputation"* — un proyecto recién creado y sin usuarios puede ser rechazado, así que es una opción para **cuando el proyecto tenga algo de tracción**, no para el día uno. |
| **Azure Trusted Signing** | Muy bajo (del orden de 10 $/mes; **confirmar precio y requisitos actuales**) | Firma gestionada por Microsoft, con opción para particulares. Requiere validación de identidad. La alternativa más barata si SignPath rechaza el proyecto. |
| **Microsoft Store** | Cuota única baja de cuenta de desarrollador | Publicar en la Store elimina SmartScreen por completo, porque firma Microsoft. **A investigar:** exige empaquetado MSIX, y hay que comprobar que no estorbe a una app que lanza procesos Java y escribe en carpetas arbitrarias. |
| **Certificado OV/EV propio** | Cientos de € al año | Descartado: contradice la premisa de proyecto gratuito y ni siquiera resuelve el problema de inmediato en su versión OV. |
| **No firmar y documentarlo** | Gratis | Viable como punto de partida. Ver plan abajo. |

**Plan recomendado en dos fases:**

1. **Lanzamiento (v0.1): sin firmar.** Es el coste honesto de empezar gratis. Para mitigarlo:
   - Página de descarga con **captura de la pantalla de SmartScreen** y los dos clics necesarios,
     explicando *por qué* aparece — un proyecto nuevo sin reputación, no un virus.
   - Publicar los **hashes SHA-256** de cada instalador junto a la descarga.
   - Compilaciones reproducibles desde GitHub Actions, para que cualquiera pueda verificar el binario.
   - Ofrecer también instalación por **winget**, que evita el diálogo a quien sepa usarlo.
2. **Cuando haya tracción: solicitar SignPath Foundation.** Gratis, y GPLv3 ya cumple el requisito
   de licencia. A partir de ahí desaparecen las advertencias sin que el proyecto deje de ser gratuito.

**Conclusión:** no hace falta pagar. Hace falta **asumir fricción al principio** y tener el camino
preparado para eliminarla después sin coste.

### 13.4 Consecuencias de ser gratuita

Que el proyecto sea **gratuito y para la comunidad** no es solo una decisión comercial; elimina o
simplifica varios problemas del análisis original:

- **Desaparece la duda del EULA de Minecraft.** La prohibición de cobrar afecta al software del
  servidor; al no cobrar por nada, el asunto queda cerrado sin necesidad de validación jurídica.
- **Sin funciones bloqueadas ni cuentas.** No hay login, ni servidor propio de licencias, ni backend
  que mantener. La app es 100 % local salvo las descargas y el diagnóstico de red opcional.
- **Sin telemetría comercial.** Si se mide algo (§17), que sea anónimo, opcional y desactivado por
  defecto — o directamente nada. En una herramienta comunitaria, la confianza vale más que las métricas.

**Lo que queda por resolver:**

- **Sostenibilidad.** Con la firma resuelta por la vía gratuita (§13.3), el proyecto puede funcionar con
  **coste cero recurrente**: GitHub Actions para compilar, GitHub Releases para distribuir, y solo el
  dominio como gasto simbólico anual. Si en algún momento hacen falta donaciones (GitHub Sponsors,
  Ko-fi), que sean **sin contrapartida funcional**: nunca funciones a cambio de dinero, eso rompería
  la premisa del proyecto.
- **Mantenimiento a largo plazo.** El riesgo real de un proyecto gratuito no es el dinero, es el
  abandono. Las APIs de §4 cambian (Paper v2 ya murió) y una app sin mantener deja de funcionar en
  meses. Mitigación: adaptadores aislados por fuente, tests de contrato en CI que avisen cuando una
  API cambie, y documentación suficiente para que otra persona pueda recoger el testigo — que es
  precisamente para lo que sirve tener licencia GPLv3 y el código publicado.

---

## 14. Stack tecnológico

> **Decisión tomada: Electron + React + TypeScript.** El análisis de abajo sigue siendo válido y
> recomendaba Tauri, pero la condición de escape que él mismo contemplaba se cumplió al arrancar el
> desarrollo. El razonamiento completo está en §14.2.

**Recomendación original: Tauri 2 + React + TypeScript (núcleo en Rust).**

| Criterio | Tauri 2 | Electron |
|---|---|---|
| Tamaño del instalador | ~10 MB | ~120 MB |
| RAM en reposo | ~60 MB | ~250 MB |
| Gestión de procesos hijo | Nativa, robusta | Correcta |
| Ecosistema JS listo | Parcial | Total |
| Curva de aprendizaje | Rust en el núcleo | Ninguna si ya sabes JS |

El argumento decisivo es el contexto de uso: la app convive en la **misma máquina** que un servidor de
Minecraft que ya consume 4-8 GB. Regalar 250 MB al launcher perjudica directamente el producto, y con
frecuencia el anfitrión juega en ese mismo equipo.

**Cuándo elegir Electron en su lugar:** si el equipo no domina Rust y la prioridad es llegar al MVP
rápido. La arquitectura de §5 (núcleo desacoplado de la UI) hace que la decisión sea reversible con
coste moderado, siempre que el núcleo no dependa de APIs de Node.

**Componentes auxiliares**

- Distribución: **NSIS o MSI, solo Windows** (x64 y arm64).
- Actualizaciones automáticas firmadas (actualizador de Tauri).
- Persistencia: SQLite para catálogos y auditoría; JSON para `instance.json` (editable a mano y
  legible en control de versiones).
- i18n desde el primer día: castellano e inglés. La UI de servidores está dominada por el inglés y
  una app en castellano es en sí misma un diferenciador.

### 14.1 Solo Windows — qué simplifica y qué no hay que romper

**Lo que se simplifica de verdad:**

- Un único instalador, un único formato de firma, una única matriz de pruebas.
- Rutas y datos de app en un solo sitio: `%LOCALAPPDATA%` y `%APPDATA%`.
- Descargas de Adoptium: un solo `os=windows` (con `x64` y `aarch64`).
- Forge/NeoForge: basta con localizar el argfile de Windows (`win_args.txt`) y `run.bat`.

**Lo que hay que resolver igualmente, porque es específico de Windows:**

| Asunto | Detalle |
|---|---|
| **Rutas con espacios y acentos** | `C:\Users\José Antonio\Desktop\...` es el caso normal, no el raro. Todo argumento entrecomillado. BuildTools es especialmente frágil aquí. |
| **Límite de 260 caracteres** | Instancias con muchos mods anidados lo alcanzan. Usar rutas largas habilitadas o instalar en una raíz corta. |
| **Windows Defender** | Descargar y ejecutar JARs dispara falsos positivos y puede bloquear en silencio. Firma de código + guía de exclusión de carpeta. |
| **Cierre de procesos** | No hay `SIGTERM`. La parada limpia depende **por completo** de escribir `stop` en `stdin` (§7). Un `taskkill` corrompe el mundo. |
| **Firewall de Windows** | Al primer arranque salta el diálogo de permitir Java en la red. Si el usuario le da a "Cancelar", nadie podrá conectarse ni en LAN. Debe estar contemplado en el diagnóstico de red (§10) como causa candidata. |
| **Suspensión del equipo** | El PC anfitrión se suspende y tira el servidor. Ofrecer "mantener el equipo despierto mientras haya un servidor arrancado". |

**Cómo no cerrarse la puerta a macOS/Linux** sin gastar esfuerzo ahora: mantener todo lo específico de
sistema operativo detrás de una interfaz estrecha en el núcleo (rutas de datos, detección de arquitectura,
argfile de Forge, mapeo UPnP, "mantener despierto"). Son 5 o 6 funciones. Mientras el resto del núcleo no
llame directamente a APIs de Windows, portarlo más adelante es cuestión de días, no de una reescritura.

### 14.2 Decisión final: Electron

Al empezar el desarrollo se comprobó el equipo y **no había cadena de Rust instalada** (ni `cargo`, ni
`rustc`, ni las Build Tools de MSVC que Tauri necesita en Windows). Sí estaban Node 24, npm 11, Git y
Java 21.

Ir por Tauri implicaba varios GB de descarga y una instalación larga —posiblemente con permisos de
administrador— **antes de escribir la primera línea de código**. Siendo el proyecto de uso privado y
con prisa, se aplica la condición de escape que el propio §14 dejaba escrita:

> *"Cuándo elegir Electron en su lugar: si el equipo no domina Rust y la prioridad es llegar al MVP
> rápido."*

**Qué se conserva del razonamiento original.** El argumento de la memoria sigue siendo cierto, pero
pesa menos de lo previsto en este caso concreto: el equipo tiene 32 GB, así que los ~250 MB de Electron
no compiten de verdad con el servidor. Si el consumo llegara a importar, la arquitectura de §5 mantiene
la decisión reversible: el núcleo **no importa Electron en ningún punto**. La raíz de datos se le
inyecta desde el proceso principal (`setDataRoot`), y esa disciplina se verifica sola, porque las
pruebas ejecutan el núcleo entero fuera de Electron. Si el núcleo empezara a depender de Electron,
las pruebas dejarían de compilar.

**Stack real:**

| Pieza | Elección |
|---|---|
| Escritorio | Electron 44 |
| Interfaz | React 19 + TypeScript 7 |
| Compilación | electron-vite 5 (Vite 7) |
| Descompresión | `tar.exe` (bsdtar) de Windows, sin dependencia npm |
| Dependencias de producción | Solo React y React-DOM |

**Nota de robustez ganada por el camino:** VS Code exporta `ELECTRON_RUN_AS_NODE=1` a su terminal
integrada. Si esa variable llega a `electron.exe`, el binario arranca como Node normal,
`require('electron')` devuelve una ruta en vez del módulo y la app muere con un
`Cannot read properties of undefined (reading 'whenReady')` que no apunta en absoluto a la causa.
`npm run dev` pasa por un lanzador que la elimina.

---

## 15. Hoja de ruta

### MVP (v0.1) — "que funcione en 5 minutos"
- Catálogo **Vanilla + Paper + Fabric + Forge** (las cuatro familias reales de servidor).
- Gestión automática de Java (Adoptium).
- Asistente de creación con EULA.
- Arranque/parada limpia + consola en vivo.
- Editor básico de `server.properties` (10 opciones esenciales).
- Direcciones de conexión (local y LAN).

> **Forge entra en el MVP** (decisión tomada). Es la distribución más cara de implementar y arrastra
> consigo el instalador en dos fases y el argfile — ver §15.1, donde está el desglose de lo que
> implica y por qué conviene abordarlo el primero, no el último.

### v1.0 — "producto completo"
- **NeoForge** (casi gratis una vez hecho Forge: mismo patrón de instalación).
- Spigot vía BuildTools (avanzado).
- Panel de moderación completo con auditoría.
- Instalación de plugins/mods desde Modrinth y Hangar.
- Copias de seguridad programadas y restauración.
- UPnP, diagnóstico de red y opción de túnel.
- Editor visual completo de configuración + plantillas.

### v2.0 — "comunidad"
- **Geyser + Floodgate**: interruptor "Permitir jugadores de móvil y consola" (§11), con dirección
  Bedrock en el panel de conexión y guía de consolas.
- Automoderación con reglas.
- Cambio de versión asistido con backup y comprobación de compatibilidad de mods.
- Perfiles de permisos (LuckPerms gestionado desde la UI).
- Métricas históricas: TPS, jugadores, memoria.
- Tailscale/ZeroTier como alternativa de red privada al túnel público.
- Quilt, Velocity (proxy multi-servidor).

### v3.0 — exploratorio
- macOS y Linux (viable si se respetó la interfaz de §14.1).
- Acceso remoto (panel web sobre el mismo núcleo).
- Sincronización de mundos entre equipos.
- Repositorio comunitario de plantillas.

### 15.1 Qué implica meter Forge en el MVP

Forge no es "una descarga más". Es la única distribución del MVP que rompe el modelo simple de
*descargar un jar y ejecutarlo*, y conviene saber exactamente qué añade:

| Implicación | Detalle |
|---|---|
| **Instalación en dos fases** | Descargar el *installer* y ejecutarlo (`java -jar forge-installer.jar --installServer`). Tarda minutos y descarga cientos de MB de librerías. El asistente necesita una pantalla de progreso real, no un spinner. |
| **No hay jar ejecutable** | Las versiones modernas no producen un `server.jar`. Hay que **localizar y leer el argfile generado** (`libraries/net/minecraftforge/forge/<ver>/win_args.txt`) y construir el comando desde ahí. Asumir `-jar` funciona en 1.16 y falla en todo lo posterior. |
| **`user_jvm_args.txt`** | Forge espera que la memoria y los flags vayan en ese fichero, no en la línea de comandos. El editor de RAM de la app debe escribir ahí en las instancias Forge, y en los argumentos directos en las demás. |
| **Dos ejes de versión** | El usuario elige versión de Minecraft **y** versión de Forge. Hay que resolver la recomendada por defecto desde `promotions_slim.json` (§4.4) y esconder el segundo eje salvo en modo avanzado. |
| **Fallos del instalador** | Es el punto que más falla: red intermitente, antivirus, rutas con acentos. Necesita log propio, reintento y un mensaje que distinga "falló la descarga" de "falló la instalación". |
| **Carpeta `mods/`** | Distinta de `plugins/`. El gestor de contenido (§4.8) debe filtrar por loader desde el primer día, o el usuario instalará plugins de Paper en un Forge y no arrancará. |

**Recomendación de orden de trabajo:** implementar **Forge el primero**, no el último. Es el caso más
exigente y obliga a que la abstracción `Installer` (§6) sea correcta desde el principio. Si el diseño
se hace primero contra Vanilla y Paper —los dos casos triviales— la abstracción saldrá demasiado
estrecha y habrá que rehacerla al llegar a Forge. Vanilla y Paper encajan después casi solos.

**Efecto secundario positivo:** con Forge resuelto, **NeoForge es casi gratis** — mismo instalador,
mismo argfile, solo cambia el origen del catálogo. Por eso pasa a v1.0 en lugar de quedar lejos.

---

## 16. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **APIs de terceros cambian sin aviso** (Paper v2 -> 410 ya ocurrió) | Alto | Capa de adaptadores por fuente, caché local de catálogos con validez larga, y modo degradado que usa la caché si la API cae. Test de contrato en CI contra cada endpoint. |
| **Versionado por año rompe la ordenación** | Alto | Módulo `VersionId` centralizado; prohibido comparar versiones por string (§4.6). |
| Java no soportado en máquinas antiguas (32 bits, ARM) | Medio | Detección de arquitectura y mensaje claro; Adoptium cubre x64, aarch64 y macOS ARM. |
| BuildTools falla (git ausente, ruta con acentos, antivirus) | Medio | Solo en modo avanzado, con requisitos comprobados antes de empezar y log completo del fallo. |
| Antivirus bloquea descargas de JAR | Medio | Firma de código, documentación de exclusión, mensaje específico ante fallo de escritura. |
| Corrupción de mundo por parada forzada | Alto | `stop` limpio obligatorio + backups automáticos + confirmación al cerrar la app. |
| Mods incompatibles dejan el servidor sin arrancar | Medio | Filtrado por loader/versión desde Modrinth, backup previo, y opción "desactivar último mod instalado" ante fallo de arranque. |
| Sobredimensionar la RAM y congelar el PC anfitrión | Medio | Cálculo sobre RAM disponible con tope y aviso. |

---

## 17. Métricas de éxito

- **Tiempo hasta el primer jugador conectado** (métrica estrella): objetivo < 5 min desde instalar.
- Tasa de finalización del asistente de creación: > 90 %.
- % de servidores creados que arrancan sin error a la primera: > 95 %.
- % de usuarios que consiguen conexión desde internet: > 70 % (con UPnP + túnel).
- Instancias con backup activo: > 80 %.

---

## 18. Decisiones

### 18.1 Cerradas

| Decisión | Resolución | Dónde se desarrolla |
|---|---|---|
| **Nombre** | **QubiQ Server Launcher.** No contiene "Minecraft", así que la restricción de nombre dominante ni se aplica. Dominio recomendado: **`qubiq.gg`** (libre). | §13.1 |
| **Licencia** | **GPLv3**, ya aplicada (`LICENSE` en la raíz). Además desbloquea la firma gratuita de SignPath. | §13.2 |
| **Firma de código** | **No se compra certificado.** Fase 1 sin firmar + documentación de SmartScreen; fase 2, SignPath Foundation gratis. | §13.3 |
| **Plataformas en v1** | **Solo Windows** (x64 y arm64). El núcleo aísla lo específico del SO en 5-6 funciones para no impedir un port futuro. | §14.1 |
| **Modelo** | **Gratuita, sin funciones de pago.** Cierra la duda del EULA y elimina backend, cuentas y licencias. | §13.4 |
| **Forge en el MVP** | **Sí.** Se implementa **el primero**, no el último: es el caso que obliga a que la abstracción `Installer` sea correcta desde el principio. Arrastra NeoForge casi gratis a v1.0. | §15.1 |
| **Túnel** | **playit.gg**, ofrecido como último paso del diagnóstico de red y **no empaquetado**: se descarga el agente oficial con consentimiento. | §10.1 |
| **Bedrock** | **Geyser + Floodgate** sobre el servidor Java, un solo interruptor, en v2. Nada de servidor Bedrock nativo. | §11 |
| **Licencia** | **Necesaria si el código se publica.** Recomendación: **GPLv3**. Obligación de atribuir dependencias en cualquier caso. | §13.2 |

### 18.2 Pendientes

Ninguna decisión bloquea ya el desarrollo. Quedan solo tareas de confirmación:

1. **Registrar `qubiq.gg`** y hacer una búsqueda de marcas en software, dado que las demás extensiones
   de `qubiq` están tomadas por terceros (§13.1).
2. **Confirmar condiciones actuales de Azure Trusted Signing** — solo si SignPath Foundation rechazara
   el proyecto por falta de reputación inicial (§13.3).
3. **Diseñar la identidad visual** — sin usar ningún asset, fuente ni textura de Minecraft (§13.1).

---

## 19. Estado del desarrollo

> Actualizado el **2026-09-10**. Al ser de uso privado por ahora, el trabajo de publicación
> (firma, CI, distribución) queda aparcado; ver §19.3.

### 19.1 Hecho — el eje vertical completo funciona

El plan era atacar primero el recorrido más difícil, y está cerrado de punta a punta:

```
VersionCatalog -> JavaManager -> Installer (Forge primero) -> ProcessSupervisor -> consola
```

| Componente | Estado |
|---|---|
| `VersionCatalog` | Mojang, Paper (v3), Fabric y Forge, con caché en disco y modo degradado |
| `VersionId` | Orden por índice del manifiesto; comparar por string queda prohibido por diseño (§4.6) |
| `JavaManager` | Descarga y extrae JDK de Adoptium; runtimes compartidos entre instancias |
| `Downloader` | Verificación SHA-1/SHA-256, descarga a `.part` y renombrado atómico |
| `Installer` | Vanilla, Paper, Fabric y **Forge** (instalador en dos fases + argfile) |
| `ProcessSupervisor` | Arranque, parada limpia por `stdin`, detección de bucle de fallos |
| `logParser` | Los **tres** formatos de log reales (§19.2), diagnósticos traducidos |
| `PropertiesFile` | Preserva comentarios y claves desconocidas |
| `InstanceManager` | Instancias aisladas, EULA explícito, `server.properties` inicial |
| `WorldManager` | Varios mundos por servidor: listar, crear, cambiar y borrar (§19.6) |
| `BackupService` | Copia en caliente con secuencia segura, restauración, retención, programadas |
| `NetworkService` | IPs locales y **Server List Ping** implementado a mano (§19.4) |
| Interfaz | Asistente de 3 pasos, estado, consola, jugadores, **ajustes** y **copias** |

**Memoria recomendada por jugadores esperados.** El asistente pregunta cuánta gente se espera a la
vez y de ahí salen dos cosas: `max-players` y la RAM sugerida. El coste se reparte en una parte fija
—que paga el servidor por existir, y que con mods se dispara porque cargan miles de clases— y otra
por jugador, que son sobre todo chunks. De ahí los perfiles: 1,5 GB + 150 MB/jugador para
vanilla/Paper, 3 GB + 200 para Fabric y 4 GB + 200 para Forge. Nunca se recomienda dejar al equipo
con menos de 4 GB libres. Mientras el usuario no toque el control, este sigue a la recomendación; en
cuanto lo mueve, deja de moverse solo.

**Verificación real, no solo compilación:**

- `npm run smoke` — 127 comprobaciones contra las APIs de verdad (test de contrato, §16).
- `npm run e2e:restart` — reinicio a petición del servidor, con sus cuatro casos (§19.11).
- `npm run e2e [distribución]` — crea un servidor, lo arranca, le hace un ping como el del juego,
  crea una copia **en caliente**, lo para limpiamente y restaura. **Las cuatro distribuciones pasan**,
  Forge incluido.

### 19.2 Lo que solo aparece ejecutando de verdad

Dos cosas que ningún análisis previo habría detectado y que salieron al probar:

1. **Cada distribución usa un formato de log distinto.** Comprobado contra servidores reales:

   ```
   Vanilla:  [12:39:44] [Server thread/INFO]: mensaje
   Paper:    [12:39:44 INFO]: mensaje
   Forge:    [12:41:26] [main/INFO] [cp.mo.mo.Launcher/MODLAUNCHER]: mensaje
   ```

   Soportar solo el de vanilla —lo que haría cualquiera— deja la app **ciega en Paper y Forge**: no
   detecta el arranque ni las entradas de jugadores, y el servidor se queda en "Arrancando..." para
   siempre aunque funcione. Hay tests de regresión para los tres.

2. **`ELECTRON_RUN_AS_NODE` filtrado por VS Code** rompe el arranque con un error que no señala la
   causa. Resuelto en el lanzador (§14.2).

3. **`session.lock` hace fallar la compresión entera.** El servidor mantiene ese fichero abierto en
   exclusiva mientras corre, y bsdtar aborta el ZIP al intentar leerlo. Se excluye explícitamente;
   no se pierde nada, porque el servidor lo recrea en cada arranque. Es exactamente el tipo de fallo
   que solo aparece haciendo una copia **con el servidor encendido**, que es el caso normal.

4. **En MC 26.x las tres dimensiones viven dentro de la carpeta del mundo.** Al ir a implementar la
   gestión de mundos se ejecutaron un vanilla y un Paper y se comparó lo que dejan en disco: ambos
   generan una única carpeta con `dimensions/minecraft/{overworld,the_nether,the_end}` dentro. Las
   carpetas sueltas `<mundo>_nether` y `<mundo>_the_end` —el esquema clásico de Bukkit/Spigot que
   sale en toda la documentación— **ya no existen**. Se siguen contemplando porque los mundos
   importados de servidores antiguos las traen, pero no son el caso normal.

   Esto destapó un fallo propio: las copias de seguridad tenían la carpeta `world` **fija en el
   código**, ignorando `level-name`. Habría bastado con que el usuario cambiara de mundo para que
   las copias guardaran el mundo equivocado, o ninguna. Corregido, con prueba de regresión que crea
   una copia con un mundo llamado distinto de `world`.

5. **Hardcore no es un modo de juego.** Al pedirlo como quinta opción del selector, la vía obvia
   —añadirlo a la lista de `gamemode`— **no funciona**: el servidor rechazaría el valor. Comprobado
   ejecutando un servidor y leyendo las 65 claves que genera: `gamemode` solo admite
   survival/creative/adventure/spectator, y el modo extremo es la clave booleana **`hardcore`**,
   independiente. La interfaz lo presenta unificado pero escribe dos claves, y bloquea la dificultad
   en Difícil porque el juego la fuerza igualmente. Verificado de punta a punta: la prueba e2e activa
   `hardcore` antes de arrancar y confirma que el servidor conserva la clave tras reescribir el
   fichero, que es la única forma de saber que la ha aceptado.

### 19.3 Detalles de implementación que merecen constancia

**Copia en caliente (§12).** La secuencia `save-off` → `save-all flush` → **esperar confirmación** →
copiar → `save-on` está implementada de verdad, incluida la espera: el supervisor bloquea hasta ver
en el log `Saved the (game|world|chunks)` —el texto varía entre versiones y distribuciones— con 60 s
de margen. Si no llega la confirmación, **se reanuda el autoguardado y se aborta la copia**: dejar
`save-off` puesto sería mucho peor que quedarse sin copia, porque el mundo dejaría de guardarse en
silencio. La prueba e2e comprueba precisamente eso: que tras la copia el servidor sigue en marcha y
aceptando conexiones.

**Restaurar guarda antes de sobrescribir.** Restaurar por error es justo el momento en que más duele
no tener vuelta atrás, así que antes de tocar el mundo se crea una copia automática del estado actual.

**No se crean copias vacías.** Una instancia recién creada no tiene mundo; hacerle una copia
"preventiva" solo llenaría el historial de ruido. Se exige que exista la carpeta `world`.

**El `tar.exe` de Windows se invoca por ruta absoluta, nunca por el PATH.** Windows 10/11 trae
bsdtar en `System32` y es con el que se hacen los ZIP y se descomprime el JDK. Pero Git para
Windows, MSYS2 y Cygwin instalan un **tar de GNU**, y si su carpeta está en el PATH gana ese. GNU
tar lee `C:\Users\...` como «máquina `C`, ruta `\Users\...`» e intenta conectarse por red, así que
falla con `Cannot connect to C: resolve failed`: un mensaje que no menciona ni ZIP ni permisos ni
nada que lleve al problema real. Copias de seguridad e instalación de Java se romperían las dos, y
solo en los equipos que tengan esas herramientas, que es la peor forma de fallar. `systemTarPath()`
lo resuelve desde `%SystemRoot%` y el `smoke` comprueba que lo que hay ahí responde `bsdtar`.

### 19.4 Server List Ping, implementado a mano

El diagnóstico de red usa el **mismo handshake que el juego** (protocolo de Minecraft: VarInts,
paquete de handshake con estado 1, petición de estado, respuesta JSON), no un simple "¿acepta el
puerto conexiones TCP?".

La diferencia importa: **el puerto está abierto desde que la JVM lo reserva**, bastante antes de que
el servidor pueda aceptar jugadores. Un sondeo TCP diría "todo bien" mientras el usuario recibe un
error al intentar entrar. Con SLP se obtiene además el MOTD, la versión y el recuento de jugadores,
que es información útil de verdad para la interfaz.

Son ~150 líneas sin dependencias. La prueba e2e verifica contra un servidor real que devuelve MOTD y
`0/10` jugadores; el smoke verifica que contra algo que no habla el protocolo falla limpiamente en
lugar de colgarse.

### 19.5 Acceso desde internet: qué se ha hecho y qué no

La interfaz ofrece un selector de tres opciones —solo red local, abrir puerto en el router, o
playit.gg— con una guía paso a paso para cada una, **rellena con los datos reales del equipo** (IP
del router, IP local, puerto), no con ejemplos genéricos.

**UPnP se ha descartado, de momento.** El plan de §10 contemplaba mapear el puerto automáticamente.
Al ir a implementarlo se sondeó el router por SSDP y **no respondió**: o tiene UPnP desactivado o no
lo soporta. Construir un automatismo que no se puede probar y que aquí no haría nada era peor que no
construirlo. Queda como candidato cuando haya un router donde verificarlo de verdad.

**La comprobación es externa a propósito.** Preguntar desde esta misma máquina no vale para nada: el
servidor siempre se ve desde dentro. Se consulta la IP pública (api.ipify.org) y se pide a
**api.mcstatus.io** que intente conectarse, que es el único modo honesto de responder "¿pueden entrar
mis amigos?". Solo se ejecuta cuando el usuario pulsa el botón, y la interfaz explica antes qué se va
a consultar (§10, nota de privacidad). Estos servicios cachean alrededor de un minuto, así que el
resultado muestra la hora y avisa de ello.

**CGNAT se trata como diagnóstico, no como detección.** Sin UPnP no hay forma fiable de detectarlo
desde el equipo. Cuando la comprobación falla en modo router, la interfaz lo señala como causa más
probable y remite a playit.gg, que es la salida real.

**playit.gg no se empaqueta**, en línea con §10.1: el usuario descarga el agente de su web oficial y
pega aquí la dirección que le dan. La app la guarda, la muestra como dirección para compartir y la
verifica.

### 19.6 Varios mundos en un mismo servidor

**Un servidor de Minecraft solo tiene un mundo activo**: el que indica `level-name` en
server.properties. "Varios mundos" es, en realidad, varias carpetas conviviendo en el directorio del
servidor, y cambiar de mundo es cambiar esa clave y reiniciar. La interfaz oculta ese detalle, pero
el modelo es ese y explica todas las restricciones.

| Operación | Cómo se implementa |
|---|---|
| **Listar** | Se recorre el directorio del servidor buscando carpetas con `level.dat`, que es lo que hace a una carpeta un mundo. Así no se cuelan `plugins`, `logs` ni carpetas de mods. |
| **Crear** | Solo se escribe `level-name` (y semilla y tipo). **El mundo lo genera el servidor al arrancar**, no la app: inventar su formato sería frágil y absurdo. |
| **Cambiar** | Se reescribe `level-name`. El mundo anterior se queda en disco intacto. |
| **Borrar** | Se elimina la carpeta y sus posibles carpetas heredadas. |

**Restricciones que la interfaz explica en lugar de esconder:**

- **Todo exige el servidor parado.** En marcha reescribe `server.properties` al cerrarse y se
  perderían los cambios (§8). El panel lo dice arriba en vez de limitarse a deshabilitar botones.
- **No se puede borrar el mundo activo.** Habría que activar otro primero, y el mensaje lo indica.
- **Un mundo recién creado aparece en la lista marcado como "aún sin generar"**. Omitirlo hasta el
  primer arranque haría parecer que la creación no ha funcionado.

**Detalle que evita un mundo idéntico por sorpresa:** al crear un mundo sin semilla se **limpia**
`level-seed`. Si se dejara la del mundo anterior, el "mundo nuevo" saldría exactamente igual que el
viejo sin que nadie entendiera por qué. Lo mismo al cambiar de mundo: la semilla solo actúa al
generar, pero dejarla puesta contaminaría el siguiente que se cree.

### 19.7 Modo básico y modo avanzado

El problema de la interfaz completa no era que fuese complicada, sino que **obliga a decidir**:
versión, memoria, puerto... preguntas que alguien que nunca ha montado un servidor no sabe
responder. El modo básico no es la misma pantalla con menos botones: es **no preguntar**.

Se guarda en `settings.json` dentro de la carpeta de datos, aparte de los manifiestos, porque
describe a la persona que usa la app y no a un servidor concreto. **Por defecto arranca en básico.**

**El asistente básico es un recorrido completo, no un mínimo.** La primera versión preguntaba solo
nombre, tipo y jugadores: el servidor arrancaba, pero en supervivencia fácil con mundo normal, y
adaptarlo al gusto obligaba a ir después a Ajustes, que es justo el formulario que el modo básico
quiere evitar. Ahora pregunta, una cosa por pantalla y siempre con una opción ya marcada:

1. Nombre · 2. Tipo de servidor · 3. Jugadores a la vez
4. **Modo de juego** — Supervivencia, Creativo, Aventura o Extremo
5. **Dificultad** — *se salta en Extremo*: el juego la fija en Difícil y preguntarla sería ofrecer
   una elección que luego no se respeta
6. **Tipo de mundo** — Normal, Superplano, Biomas grandes, Amplificado
7. **Peleas entre jugadores**
8. **Desde dónde se conectan** — solo en casa, abriendo el router o con playit.gg

Al terminar, un **resumen editable** con "cambiar" en cada línea, lo que decidimos nosotros (versión
y memoria) marcado como tal, y el EULA. Editar desde el resumen vuelve a él, con una excepción:
salir de Extremo hace aparecer la pregunta de la dificultad, que nunca se contestó, así que se pasa
por ella antes de volver en vez de dejar un valor por defecto sin que nadie lo haya elegido.

Todo eso se manda **en la propia petición de creación** (`properties` y `exposure`), no con un
guardado posterior: el `server.properties` nace ya con lo elegido. El núcleo lo valida antes de
tocar el disco —solo claves del catálogo, valores de su lista, booleanos bien escritos, y el puerto
nunca por esta vía— para que un fallo de la interfaz no deje a medio crear un servidor ni, peor, uno
distinto del que el usuario configuró sin que nadie se entere.

**El día a día se reduce a tres cosas, en los dos modos.** La pantalla del servidor es un **botón
grande INICIAR/PARAR**, la **moderación** de jugadores y la **consola**. Debajo del botón va la
dirección para los amigos con su botón de copiar: es lo siguiente que hace cualquiera nada más
encenderlo. Todo lo demás —Ajustes, Conexión, Mundos, Plugins o Mods, Copias y Servidor— vive detrás
de **Configuración**, que no tiene por qué competir por la atención cada vez que se abre la app.

Nació solo para el básico, pero funcionó mejor que la pantalla de pestañas del avanzado, así que
ahora es **la misma en ambos**. El modo ya no cambia la pantalla, cambia **lo que se desbloquea dentro
de Configuración**: cada pestaña recibe el modo y el avanzado añade sus opciones. Lo que antes vivía
en la pestaña «Estado» del avanzado se ha repartido ahí: las tres direcciones con la comprobación
desde internet en *Conexión*, y la ficha técnica y «Reinstalar» en *Servidor*.

**La elección se pide al crear, no se esconde en un ajuste.** Al pulsar "Crear servidor" aparecen dos
tarjetas grandes —básico y avanzado— con lo que implica cada una, al estilo del Vibe/Spec de Kiro.
El motivo es que no es un ajuste más: decide qué tipo de conversación va a tener la app contigo, y
dejarlo en un desplegable lateral condenaría a quien no sabe del tema a encontrarse el formulario
completo sin haber elegido nada. Elegir ahí fija también el modo de la app, para que el panel del
servidor recién creado le hable igual que el asistente. El selector de la barra lateral sigue estando
como vía para cambiar de opinión en cualquier momento.

| | Básico | Avanzado |
|---|---|---|
| **Versión** | La última estable, elegida sola. Se informa, no se pregunta. | Desplegable con todas |
| **Memoria** | La recomendada según los jugadores, sin control | Control manual |
| **Puerto** | El primero libre desde 25565 | Campo editable |
| **Dirección** | **Una sola**: la que hay que pasar a los amigos | Las tres, con adaptador y latencia |
| **Pantalla principal** | Botón INICIAR/PARAR, jugadores y consola; lo demás en Configuración | **La misma** |
| **Consola** | Visible, en la pantalla principal | Visible, en la pantalla principal |
| **Ficha técnica** | Oculta (Java, build, memoria) | Visible, en Configuración → Servidor |
| **Ajustes** | Solo las opciones básicas | Con interruptor de avanzadas |
| **Copias** | Botón manual + resumen de las automáticas | Intervalo, retención y estimación |
| **Mundos** | Nombre y tipo | Añade la semilla |
| **Reinstalar** | Oculto | Visible, en Configuración → Servidor |
| **Borrar servidor** | **Visible** (querer deshacerse de uno es tan básico como crearlo) | Visible |

**Lo que NO se oculta: la dirección del servidor.** Ocultarla del todo dejaría la app inservible
para lo único que le importa al usuario, que es meter a sus amigos. Lo que se evita es el listado
técnico donde hay que adivinar cuál de las tres direcciones sirve.

**Y en el puerto se aprovecha para prevenir un fallo:** en vez de fijar 25565 a ciegas, se coge el
primero libre. Tener ya otro servidor abierto habría producido un `FAILED TO BIND TO PORT` que en
modo básico no habría sabido interpretar nadie (§7).

### 19.8 Plugins y mods

Pestaña propia, que solo aparece en Paper, Fabric y Forge — vanilla no admite ni una cosa ni otra, y
mostrarle la pestaña sería prometer algo que no puede cumplir.

**La app no descarga por ti, a propósito.** Descargar y ejecutar código de terceros en nombre del
usuario es otra responsabilidad, y de momento se prefiere el camino honesto: llevarle a las webs
buenas, decirle exactamente qué filtrar, abrirle la carpeta correcta y enseñarle qué hay dentro. La
integración con la API de Modrinth (§4.8) sigue en la hoja de ruta para automatizarlo.

**Lo primero que se ve es el aviso que decide si va a funcionar:**

| | Se instala en | Consecuencia |
|---|---|---|
| **Plugins** (Paper) | Solo en el servidor | Los amigos entran con su Minecraft normal, sin instalar nada |
| **Mods** (Forge/Fabric) | Servidor **y** en el Minecraft de cada jugador | Quien no los tenga **no podrá entrar** |

Confundir esas dos cosas es el motivo número uno de "mis amigos no pueden entrar", así que va arriba
del todo y con el color del tipo de aviso que corresponde, no escondido en un párrafo.

**Otros detalles que evitan el fallo típico:**

- La versión de Minecraft y el tipo de servidor se muestran destacados **antes** de los enlaces:
  son los dos filtros que hay que aplicar en la web, y bajarse el archivo equivocado es lo normal.
- En Fabric se avisa de que **casi todos los mods necesitan Fabric API**, con enlace directo. Sin
  ella el mod no arranca y el error no lo dice claro.
- La carpeta se **crea al vuelo** al pulsar el botón: en un servidor recién instalado que aún no ha
  arrancado, `plugins/` o `mods/` todavía no existe y el botón no llevaría a ninguna parte.
- Se listan los archivos instalados, para poder comprobar que el que has pegado ha llegado.
- **Desactivar en vez de borrar**: renombra a `.jar.disabled`, que las tres distribuciones ignoran.
  Es la salida cuando un mod impide arrancar — se descarta sin perderlo (§16).
- Los nombres de fichero se validan contra rutas (`..`, barras): la operación de borrado no puede
  salirse de su carpeta.

### 19.9 Plugins oficiales integrados

Un catálogo de plugins propios que la aplicación sabe **instalar y configurar** sin salir de ella.
Para todo lo demás sigue estando la pestaña de siempre, que lleva a Modrinth y compañía; la
diferencia es que de estos conocemos el jar y el formato de su configuración.

**Van empaquetados, no se descargan.** El repositorio del plugin no es ni siquiera un repositorio
git: no hay releases de las que tirar. La consecuencia hay que asumirla con los ojos abiertos:
**actualizar el plugin obliga a copiar el jar nuevo y recompilar la aplicación**. El modelo incluye
`distributions` desde el principio, así que añadir un mod de Fabric o Forge más adelante —o una
fuente de descarga cuando el plugin se publique— no obliga a rehacer nada.

**La plantilla de `config.yml` también viaja con la app**, y se escribe al instalar. Sin eso habría
que arrancar el servidor una vez solo para que el plugin generara el fichero, pararlo y entonces
configurarlo. Bukkit no sobrescribe una configuración que ya existe, así que adelantarla es seguro y
se ahorra ese baile absurdo.

**El `config.yml` se edita por líneas, no con un serializador de YAML** — misma decisión y mismo
motivo que `PropertiesFile` para `server.properties` (§8). El fichero del plugin está lleno de
comentarios que explican cada opción; volcarlo con un serializador los borraría todos y quien lo
abriera a mano se encontraría un YAML mudo. El editor solo sabe cambiar el valor de una clave que ya
existe: **nunca crea claves ni secciones**, así que si el plugin cambia su esquema esto no inventa
nada. Además solo se escriben rutas que el catálogo reconoce, para que la interfaz no pueda tocar
partes arbitrarias del YAML.

**El aviso de modo extremo.** HardcoreUtility solo tiene sentido en hardcore, así que elegir el papel
de "partida" muestra un aviso en rojo explicando qué cambia —dificultad a Difícil, al morir se queda
de espectador y el mundo se reinicia— y el botón pasa a decir *"Entendido, instalar y activar modo
extremo"*. Al aceptar, **se activa de verdad**: `hardcore=true`, `difficulty=hard` y
`gamemode=survival`. Prometerlo y no hacerlo dejaría la serie en supervivencia normal sin que nadie
se enterara hasta morirse y reaparecer tan tranquilo.

**Los ajustes que el plugin necesita se aplican al instalarlo.** HardcoreUtility monta una red de dos
servidores que se pasan a los jugadores con el paquete de transferencia: el lobby los manda a la
partida y la partida los devuelve al acabar la run. Un servidor con `accepts-transfers=false`
—el valor de fábrica— **rechaza a quien llega desde el otro**, y el jugador se queda fuera con un
error que no menciona ni transferencias ni el plugin. Así que al instalarlo se activa, en los dos
papeles, y la pantalla lo dice antes de hacerlo.

La lista vive en el catálogo (`serverProperties`), no en el código de instalación, y hay **una sola
función** —`serverPropertiesFor(plugin, papel)`— que la resuelve para la interfaz y para el proceso
principal. Calcularlo dos veces terminaría con una pantalla que promete una cosa y un proceso que
escribe otra. El `smoke` exige además que **toda clave impuesta exista en `PROPERTY_CATALOG`**: un
ajuste que la aplicación cambia por su cuenta y que luego no aparece en ninguna pantalla es un ajuste
embrujado, imposible de ver ni de deshacer.

**Las direcciones locales, y el motivo por el que existen.** El lobby y la partida se mandan
jugadores entre sí dándoles una dirección. Si esa dirección es la IP pública, quien juegue desde la
propia casa —el anfitrión el primero— no llega: casi ningún router doméstico permite salir a
internet y volver a entrar a su propia red (NAT loopback). El plugin resolvió esto con una segunda
dirección para las conexiones locales, y el formulario la expone: *"Dirección del lobby dentro de
casa"* y su puerto, en los dos papeles. Vacío o 0 significa «usa la de arriba», que es el
comportamiento de antes.

**Añadir opciones a un plugin rompe las instalaciones anteriores, si no se hace nada.** El fichero
del usuario es de la versión vieja y no tiene las claves nuevas; como el editor **no crea claves**,
el campo aparecería en el formulario y al guardarlo no pasaría nada — justo el fallo silencioso que
el resto del diseño evita. Por eso existe `addMissingFrom(plantilla)`, que no contradice la regla:
ahí las claves no se inventan, **se copian de la plantilla oficial**, con sus comentarios y en su
sitio, y jamás pisan un valor que el usuario ya tuviera. Hasta el espaciado se copia de la plantilla
en vez de adivinarlo, para que el fichero fusionado quede como el original.

La fusión se hace en los dos sitios donde hace falta: al instalar **y al guardar**. Ponerla solo en
instalar no bastó, y se vio en cuanto se usó de verdad: con una configuración anterior, guardar no
daba error —porque el resto de opciones sí se escribían— y el campo se vaciaba al recargar. Dos
lecciones que valen para el resto de la aplicación: **una opción visible en pantalla tiene que poder
guardarse siempre**, sin que el usuario sepa que antes debía pulsar otro botón; y **lo que no se
guarda hay que decirlo**, aunque lo demás sí se haya guardado. Antes solo se avisaba si fallaban
todas, que es justo el caso que nunca pasa.

**Y un botón "Actualizar"**, porque el número de versión no siempre cambia cuando el plugin sí:
vuelve a copiar el jar que trae la aplicación y fusiona las opciones nuevas conservando las tuyas.
Que hace falta se detecta **comparando el jar instalado con el empaquetado byte a byte**, no por el
número de versión: un plugin en desarrollo cambia muchas veces sin tocarlo. Si difieren, la ficha
marca *"Hay una versión nueva"* y el formulario avisa de que las opciones nuevas no harán efecto
hasta actualizar — porque guardar una opción que el jar instalado no entiende sí escribe en el
fichero, pero no hace nada, y eso es otro fallo silencioso con distinto disfraz.

**Quitar conserva la configuración.** Dentro está la clave compartida y las direcciones de los dos
servidores, que es lo más molesto de rehacer. Los ajustes de `server.properties` tampoco se revierten:
quien tenga montada la red puede querer seguir aceptando transferencias, y deshacerlo por sorpresa
sería otra forma del mismo problema.

**Verificación.** 39 comprobaciones en `smoke` contra la **plantilla real** del plugin, no contra un
YAML inventado — incluida una que valida que **todos los campos del formulario existen de verdad en
el `config.yml`**, de forma que un cambio de esquema en el plugin se detecta en vez de dejar
controles que no guardan nada. El `e2e` recorre el ciclo completo: comprobar que de fábrica no acepta
transferencias, instalar, ver que activa el modo extremo y las transferencias, guardar configuración
de los tres tipos, desinstalar conservando el YAML, y reinstalar como lobby para comprobar que ese
papel también acepta transferencias pero **no** se pone en modo extremo. La fusión se prueba en los
dos sitios: en `smoke` contra una configuración antigua escrita a mano (posición, comentarios, no
duplicar, idempotencia, y un fichero vacío que se reconstruye entero) y en `e2e` sobre el fichero
real de un servidor, quitándole las opciones nuevas y comprobando que **guardar** funciona igual
sobre esa configuración antigua, que el jar cambiado se detecta y que "Actualizar" lo devuelve, todo
ello sin tocar la clave compartida.

### 19.10 Borrar un servidor

El núcleo sabía borrar desde el principio y el canal IPC estaba puesto, pero **nunca se llegó a poner
el botón**: la función existía entera y era inalcanzable desde la interfaz. Un recordatorio de que
"está implementado" y "se puede usar" no son lo mismo.

Al ponerlo, la confirmación **no es un "¿seguro?"**: hay que escribir el nombre del servidor. El
motivo no es ceremonia, es que obliga a leer qué se está borrando — justo lo que falla cuando alguien
tiene varios servidores parecidos y pulsa en el equivocado.

El diálogo enumera lo que se va a perder con cifras reales (cuántos mundos, cuántas copias) en lugar
de un aviso genérico que nadie lee. Y avisa de algo que no es evidente: **las copias de seguridad
viven dentro de la carpeta del servidor**, así que se van con él; si quieres conservar el mundo hay
que sacarlo antes con "Abrir carpeta".

Está disponible en los dos modos. Querer deshacerse de un servidor es tan básico como crearlo; lo que
cambia entre modos es el texto, no el acceso.

### 19.11 Reinicio a petición del servidor

Pedido para integrar **HardcoreUtility**, un plugin de series hardcore que al morir alguien prepara un
mundo nuevo y necesita que el servidor vuelva a arrancar. El contrato es deliberadamente pobre: el
plugin deja `hardcore-restart.request` en el directorio de trabajo y se apaga. **No hace falta ninguna
API ni puerto nuevo** — el launcher ya es dueño de esa carpeta.

**La regla que gobierna todo: la parada manual siempre gana.** Si el usuario pulsa Parar, cierra la
app o borra la instancia, la petición se descarta aunque el fichero esté ahí. Para poder distinguirlo
el evento `exit` del supervisor pasó a llevar un segundo dato, `requested`, que dice si el cierre lo
pidió el usuario o lo decidió el servidor. Sin eso no hay forma de saberlo desde fuera.

**Decisiones que evitan bucles**, que es el riesgo real de reiniciar automáticamente:

| Decisión | Por qué |
|---|---|
| El fichero se **borra antes de decidir nada** | Si quedara en disco y el arranque siguiente fallara, se reintentaría sin fin. Y si el borrado falla, no se reinicia. |
| Si no se puede borrar, **no se reinicia** | Mejor quedarse corto que entrar en bucle. |
| Máximo **5 reinicios en 10 minutos** | Un plugin que se porte mal no puede dejar el equipo arrancando servidores sin parar. Al superarlo se avisa y se para. |
| La política es una **función pura** (`restartPolicy.ts`) | Se prueba en `smoke` sin arrancar un solo servidor — es justo el tipo de lógica que se rompe en silencio. |

Se reinicia **aunque el código de salida no sea 0**: que el fichero exista demuestra que el plugin ya
había hecho su trabajo. Y no hay riesgo de bucle porque un fallo *al arrancar* nunca tendrá fichero,
que se borró en el paso anterior.

**Un fallo de pérdida de datos que salió al revisar esto.** `ConfigPanel` enviaba **todos** los
valores cargados al abrir el panel, no solo los tocados. El escenario: el panel de Ajustes queda
abierto, el plugin cambia `level-name` al terminar una partida, y más tarde el usuario cambia el MOTD
y guarda → se reescribe el `level-name` viejo, que apunta a una carpeta ya borrada, y **se pierde la
run en curso**. Ahora solo se mandan las claves que han cambiado. El fallo existía al margen de esta
integración: afectaba a cualquier clave modificada fuera del panel.

También se añadió **`accepts-transfers`** al catálogo de ajustes (nivel avanzado), que el montaje
lobby + partida necesita y hasta ahora solo se podía activar editando el fichero a mano.

**Verificación:** `npm run e2e:restart` levanta un Paper real y cubre los cuatro casos — el plugin
pide reiniciar, se apaga sin pedir nada, la parada manual con petición pendiente, y el usuario
arrancando a mano durante los 3 s de espera. Los cuatro en verde.

**Fuera de alcance a propósito:** el launcher no borra mundos, no toca `level-name` ni lee el
historial de runs; todo eso es del plugin. Y no se mezcla con `manifest.autoRestart`, que sería
reiniciar tras una caída: aquí solo se reinicia si existe el fichero.

### 19.12 Empaquetado

`npm run dist` genera con electron-builder un **instalador NSIS** y un **ejecutable portable**
(~106 MB cada uno). Verificado ejecutando el portable: abre, carga las instancias existentes,
arranca un servidor de verdad, responde al Server List Ping y hace la parada limpia.

**Decisiones del empaquetado:**

| Asunto | Resolución |
|---|---|
| **Carpeta de datos** | Fijada a `%APPDATA%\qubiq-server-launcher` en el código. Por defecto Electron la deriva del nombre de la app, que difiere entre desarrollo (`qubiq-server-launcher`) y empaquetado (`QubiQ Server Launcher`): serían dos carpetas y al instalar parecería que los servidores se han esfumado. Fijarla evita además espacios en la ruta, que es donde tropieza el instalador de Forge (§14.1). |
| **Instalación por usuario** | `perMachine: false`. No pide administrador, coherente con §12. |
| **Desinstalar no borra datos** | `deleteAppDataOnUninstall: false`. Los mundos no son datos de la aplicación: son del usuario. |
| **React fuera de `dependencies`** | Vite lo inlinea en el bundle del renderer, así que enviarlo también como módulo solo engordaba el paquete. |
| **Icono propio** | Un D20 (icosaedro) con las aristas iluminadas, las caras invisibles y un punto de luz azul en cada vértice, en tres cuartos y sobre placa oscura. Geometría real, no dibujada a ojo. Sin fuentes, texturas ni assets de Minecraft, como exige §13.1. |
| **Tamaños pequeños redibujados** | `build/icon.ico` lleva 256, 128, 64, 48, 32, 24 y 16 px, y los pequeños no son el grande reducido: engordan líneas y puntos y recortan el desenfoque. A 16 px las 30 aristas se volvían una mancha, así que ahí solo va el contorno y el triángulo de la cara más cercana. 256 va en PNG y el resto en BMP de 32 bits, que es lo que acepta cualquier herramienta, NSIS incluido. |
| **Cargador con el mismo dado** | Las esperas sin porcentaje real (crear un servidor, el botón mientras arranca, las copias) muestran el D20 sin placa girando de forma semi-errática (`D20Loader`, velocidad 0.6 y nerviosismo 1). Sustituye a barras que estaban fijas al 35 % y al 45 %: un progreso inventado. La barra solo aparece cuando hay un porcentaje de verdad. |
| **Sin firmar** | Por decisión de §13.3. SmartScreen avisará en la primera ejecución; está documentado en el README junto a los dos clics necesarios. |

### 19.13 Varios juegos: el contrato y la migración (Fase 0)

Primera fase de [HOJA-DE-RUTA-MULTIJUEGO.md](HOJA-DE-RUTA-MULTIJUEGO.md). La arquitectura pasa a
hablar de *juegos* y no de *distribuciones de Minecraft*, sin añadir todavía ningún juego y sin
cambios visibles. Estructura resultante en el README (§ Arquitectura).

**El contrato (`core/games/types.ts`).** Un juego aporta:

| Pieza | Qué hace | En Minecraft |
|---|---|---|
| `prepareCreate` / `writeInitialFiles` | Valida la petición y devuelve su `data`; después escribe los ficheros iniciales | Memoria, flags de JVM, `server.properties`, `eula.txt` |
| `install` | Descarga lo necesario; devuelve lo que haya cambiado en `data` | Java + jar de la distribución |
| `applyChanges` | Recalcula lo derivado cuando el usuario cambia algo | Regenera `jvmArgs` si cambia la memoria |
| `launch` | Ejecutable, argumentos y carpeta | `java` + flags + `nogui` |
| `stop` | Estrategia de parada. Hoy solo existe `stdin` | `stop` por stdin |
| `parseLine` / `diagnoseExit` | Lectura del log y del cierre inesperado | Los tres formatos de log (§19.2) |
| `backupEntries` / `restoreTargets` / `backupMeta` | Qué se copia, qué se sustituye al restaurar y qué se anota | Carpetas del mundo activo y ficheros de jugadores |
| `holdSaves` / `resumeSaves` | Opcionales: dejar la partida consistente para copiar en marcha. Un juego sin ellos solo copia parado | `save-off` → `save-all flush` → confirmación → `save-on` |
| `ping` / `checkFromInternet` | ¿Se puede entrar? Desde dentro y desde fuera | Server List Ping y mcstatus.io |

Lo que el juego declara hacia la interfaz (nombre, condiciones que aceptar, aviso legal y
**capacidades**: mundos, contenido, plugins oficiales, memoria, reinstalar, comandos) vive en
`shared/games/index.ts`. Las capacidades deciden qué pestañas salen en Configuración; la interfaz de
cada juego (`renderer/src/games/<juego>/`) aporta asistentes, pestañas y filas de la ficha técnica.
Lo exclusivo de Minecraft que no encaja en el contrato (mundos, plugins, `server.properties`) está en
`core/games/minecraft/service.ts`, expuesto como `service.minecraft` y por canales IPC `minecraft:`.

**Decisiones:**

| Asunto | Resolución |
|---|---|
| **Registro sin ciclos** | `instances/manager.ts` recibe el adaptador como parámetro en vez de importar el registro: el registro importa a Minecraft, que usa las instancias. |
| **Condiciones genéricas** | `eulaAccepted` pasa a `agreements: AgreementId[]`. Crear y arrancar comprueban las que declare el juego, así que el acuerdo de Steam de la fase 1 no necesita código nuevo. Un EULA no aceptado en la v1 **no** se da por aceptado al migrar. |
| **Juego desconocido** | Un servidor de un juego que esta versión no conoce (creado con una app más nueva) no sale en la lista, porque la interfaz no sabría pintarlo, y se queda intacto en disco. Operar con él por id da un error explicado. |
| **Esquema más nuevo** | Se rechaza sin tocar el fichero: bajar de versión la app no puede estropear un servidor creado con una más nueva. |
| **Parseo del log** | No se ha partido en estructura común + patrones. Lo común resultó ser solo el tipo `ParsedEvent`, que vive en el contrato; el parser entero es de Minecraft. |
| **Editor clave=valor** | Extraído a `core/formats/keyValue.ts`: `servertest.ini` de Project Zomboid usa el mismo formato. Minecraft lo reexporta como `PropertiesFile`. |
| **Copias antiguas** | Los sidecar anteriores guardaban `minecraftVersion`/`distribution`; se normalizan al leer a `game`/`version`/`variant`, sin reescribirlos. |
| **Textos** | Siguen hablando de Minecraft donde la interfaz es común (subtítulo, «mundo», el aviso de playit). Se generalizan cuando haya un segundo juego que los necesite, en la fase 1, para que esta fase no cambie nada visible. |

**Migración v1 → v2** (`instances/migrations.ts`). Función pura e idempotente, ejecutada al leer:
si el manifiesto era antiguo, se guarda antes una copia literal en `instance.v1.json` (nunca se pisa
si ya existe) y se escribe el nuevo. Los datos en disco (`server/`, `backups/`, `runtimes/`) no se
mueven.

**Cómo se ha comprobado:**

- `smoke` (156): migración con un manifiesto v1 real (campos, idempotencia, EULA no aceptado,
  esquema futuro, copia en disco que no se pisa), juego desconocido, sidecar antiguo y un **juego falso** que no tiene
  nada de Minecraft (un proceso de Node que imprime `LISTO` y se para con `salir`): crear, instalar,
  arrancar, detectar listo y jugadores con su propio parser, parar con su orden, copiar sus rutas y
  borrar. Si el contrato dependiera de Minecraft, esta prueba no compilaría o fallaría.
- `e2e paper` y `e2e:restart`: en verde, igual que antes.
- **Copias de los tres servidores reales** (hc-lobby, hc-partida, los-tilted-hardcock) en una carpeta
  aislada: migran con todos los campos iguales, leen sus copias antiguas, conservan el plugin
  oficial, arrancan, responden al ping, hacen copia en caliente y paran limpio. Los originales,
  comparados por checksum fichero a fichero, no se tocaron.
- **Interfaz:** recorrido de Playwright por los dos modos, el asistente básico y Configuración, con
  capturas comparadas píxel a píxel con las de antes. Las únicas diferencias venían de la v0.3.1 y
  la v0.3.2, no de este cambio.

**Fallo encontrado por el camino (anterior a esta fase).** Server List Ping no escuchaba el cierre
de la conexión. Un servidor que corta sin responder —vanilla lo hace justo al terminar de arrancar un
mundo nuevo— no dispara ni `error` ni `timeout` (el temporizador muere con el socket), y la promesa
no se resolvía nunca: la pantalla de conexión se quedaba en «comprobando» y la verificación se colgó
así. Ahora el cierre resuelve «no responde», y el smoke lo prueba con un servidor que acepta y
cierra. De paso, `route print` tiene un límite de 10 s.

### 19.14 Cimientos de Steam (Fase 1)

Segunda fase de [HOJA-DE-RUTA-MULTIJUEGO.md](HOJA-DE-RUTA-MULTIJUEGO.md): lo que necesitan los
juegos que no son Minecraft, sin añadir todavía ninguno. Para Minecraft no cambia nada visible.

#### Prototipo 1: parar un servidor sin stdin (Valheim)

Valheim no lee órdenes: su propio `.bat` dice "PRESS CTRL-C to exit". Se probó lanzándolo como lo
hará la app (tuberías y ventana oculta, desde Node y desde Electron) y enviándole señales con un
PowerShell que se engancha a su consola (`AttachConsole` + `GenerateConsoleCtrlEvent`).

| Prueba | Resultado |
|---|---|
| **Ctrl+C** | **No llega.** `GenerateConsoleCtrlEvent` no da error, pero el proceso hijo hereda la orden de ignorar Ctrl+C y Windows la respeta. Confirmado con un proceso de control que escuchaba SIGINT. |
| **Ctrl+Break** | **Funciona.** No se puede ignorar de esa forma. Valheim ejecuta `OnApplicationQuit`, guarda el mundo ("World save (5/5) done") y sale con código 0 en unos 3 s. |
| **Durante la generación del mundo** | Se ignora. Hay que esperar a que el servidor esté listo ("Opened Steam server"). |
| **Auxiliar** | PowerShell en línea (`-EncodedCommand`, ruta absoluta): sin dependencias npm ni ejecutable propio, y sin que le afecte la política de scripts. Tarda ~0,5 s. |

**Decisión:** la vía es Ctrl+Break y el orden de las fases se mantiene. Enshrouded lo reutilizará.

#### Prototipo 2: SteamCMD

Instalados de forma anónima Valheim (2 GB), Enshrouded (8,8 GB), Satisfactory (15,5 GB), Project
Zomboid y Rust (5,5 GB), observando todo lo que escribe.

| Hallazgo | Consecuencia |
|---|---|
| Por una tubería, **la salida llega entera al final** | El progreso en vivo se lee de `logs/console_log.txt`, que se escribe cada ~2 s con las mismas líneas. Ni el `.acf` ni la carpeta de descarga sirven: el primero se actualiza al terminar y la segunda se reserva entera al principio. |
| Las líneas generales salen **traducidas** ("Buscando actualizaciones disponibles...") | Solo se interpretan `Update state (0x61) downloading, progress: 12.66 (a / b)`, `Success! App ...` y `ERROR! Failed to install app ... (motivo)`, que salen en inglés. |
| La primera ejecución sale con **código 7** tras autoactualizarse | Se repite la orden. |
| **Código 8** vale para "Missing configuration" (pasajero: el primer login tras instalar SteamCMD) y para "No subscription" (permanente) | Se decide por el motivo, no por el código. Lo pasajero se reintenta. |
| Segunda ejecución: "already up to date" en ~4 s | Actualizar es volver a instalar. |
| Versión publicada: `app_info_print` → `branches.public.buildid`; instalada: `appmanifest_<id>.acf` → `buildid` | Comprobación de actualizaciones sin cuenta. |
| `force_install_dir` tiene que ir **antes** de `login` | Si no, se ignora. |
| Valve no publica hash de `steamcmd.zip`, pero el ejecutable va **firmado** | Se valida la firma (Authenticode) antes de ejecutarlo. El del zip lleva el certificado antiguo ("O=Valve"); el autoactualizado, el nuevo ("O=Valve Corp."). |

#### Piezas comunes construidas

| Pieza | Dónde | Estado |
|---|---|---|
| Gestor de SteamCMD (descarga, firma, cola única, reintentos, progreso, actualizaciones) | `core/tools/steamcmd.ts`, `steamcmdOutput.ts` | Probado con servidores reales (`e2e:steam`) |
| Estrategias de parada: stdin, Ctrl+Break, RCON, WebRCON, API | `core/runtime/stop.ts`, contrato `stop(manifest)` con plazo de gracia por juego | Minecraft ya usa la genérica (stdin) |
| Cliente Source RCON | `core/net/rcon.ts` | Contra la grabación real de Project Zomboid |
| Cliente WebRCON (WebSocket nativo) | `core/net/webrcon.ts` | Contra el formato documentado de Rust, **sin grabación real** |
| Consulta A2S (estado y jugadores, reto, respuestas partidas) | `core/net/a2s.ts` | Contra la grabación real de Project Zomboid |
| Puertos múltiples y UDP | `serverPorts()` en `shared/games`, `isUdpPortInUse`, `findFreePortBlock` | Las guías del router y de playit se generan por puerto y protocolo |
| Comprobación desde internet para Steam | `core/net/steamServers.ts` (`GetServersAtAddress`, sin clave) | Solo dice si Steam conoce el servidor, **no** que se pueda entrar: el alta la hace el servidor hacia fuera |
| Visual C++ Redistributable | `core/system/windows.ts` | Detección; qué juego lo exige, por confirmar en cada fase |
| Actualizaciones del servidor | `checkUpdate` en el contrato, `service.checkForUpdate` / `updateServer`, IPC | Sin interfaz hasta que un juego lo use |
| Variables de entorno al lanzar | `LaunchSpec.env` | Valheim necesita `SteamAppId` |
| Vocabulario por juego | `GameInfo.save`, `backupScope`, `tunnelAddressExample` | Los textos comunes ya no dicen «mundo» a fuego |

**Decisiones:**

| Asunto | Resolución |
|---|---|
| **Grabaciones como prueba** | `scripts/smoke/fixtures/steam/` guarda salidas y tráfico reales, sin rutas del usuario. Si un juego cambia su protocolo, se vuelve a grabar y el smoke dice qué se ha roto. Lo sintético está marcado como tal en cada comprobación. |
| **Aislamiento de Project Zomboid** | Por defecto escribe en `%USERPROFILE%\Zomboid`, la misma carpeta del juego del usuario. Con `-Duser.home` y `-cachedir` queda dentro de la instancia; comprobado que la carpeta real no se toca. |
| **A2S de Valheim** | Con `-public 0` abre el puerto de consulta pero no contesta. Grabarlo exige publicar el servidor en la lista de Steam con la IP del usuario: pendiente de su decisión. |
| **WebRCON de Rust** | Mismo motivo: el servidor de Rust se anuncia siempre en la lista. Instalado, pendiente de grabar. |
| **Detección de UDP** | Reservar el puerto no basta (ver README): se confirma con `netstat`. |

**Fallo encontrado por el camino (Minecraft).** Paper publicó 26.3 con builds solo experimentales, y el
catálogo la proponía por defecto: el instalador la rechaza, así que crear un servidor de plugins con
el asistente habría fallado. Se resolvió saltándose las versiones de Paper cuyo último build no es
estable. (Esconderlas dejaba sin instalar la versión recién salida: desde §19.17 se ofrecen
marcadas y con aviso, en vez de ocultarse.)

**Cómo se ha comprobado:** smoke 213/0; `e2e:steam` completo desde cero; `e2e paper` y `e2e:restart`
en verde; guías de conexión renderizadas con la versión anterior y la nueva dando el mismo texto; y
recorrido de Playwright por los dos modos, igual que tras la fase 0.

### 19.15 Satisfactory (Fase 2)

Tercera fase de [HOJA-DE-RUTA-MULTIJUEGO.md](HOJA-DE-RUTA-MULTIJUEGO.md) y **primer juego nuevo**:
la app pasa de gestionar Minecraft a gestionar juegos. Estrena el selector de juego, el asistente de
Satisfactory, sus partidas y sus ajustes, y todo lo que hay que decir cuando un juego no da lo mismo
que Minecraft.

#### Lo que se averiguó contra el servidor real

Antes de escribir nada se lanzó el servidor de verdad (el ya instalado en `qubiq-dev`), porque tres
de estos hallazgos habrían llevado a un diseño equivocado.

| Hallazgo | Consecuencia |
|---|---|
| `FactoryServer.exe` es **solo un lanzador**: abre `Engine\Binaries\Win64\FactoryServer-Win64-Shipping-Cmd.exe` y no reenvía su salida | Se lanza el ejecutable real. Así el PID que supervisa la app es el del servidor (matar el lanzador dejaría el servidor vivo) y su registro llega en vivo por la tubería, como en Minecraft |
| `-UserDir` mueve la configuración y el registro, **pero no los guardados** | Hay que añadir `-SavesUseProjectSavedDir` (cadena encontrada en el binario del juego). Sin los dos, el servidor escribe las partidas en `%LOCALAPPDATA%\FactoryGame\Saved\SaveGames`, **la carpeta del juego del usuario** |
| El límite de jugadores no sale de `Game.ini` | Es una variable de consola: `-ini:Engine:[SystemSettings]:net.MaxPlayersOverride=N`. Probado: `playerLimit` pasó de 4 a 8 |
| El puerto de la mensajería (**8888**) no sigue al del juego | Con `-Port=7788` el servidor siguió abriendo el 8888. **Solo puede haber un servidor de Satisfactory a la vez**, y el diagnóstico del puerto ocupado lo dice |
| La API devuelve errores con **código 200** | Lo que decide si algo falló es `errorCode`, no el estado HTTP |
| `PasswordlessLogin` solo funciona **antes** de reclamar | Reclamar se hace durante la instalación, en ese hueco. Después, `PasswordLogin` con la contraseña de administrador |
| Reclamar **persiste** entre reinicios, y la sesión se autocarga | Instalar deja el servidor listo del todo: el usuario no abre el juego para configurar nada |
| La API da **cuántos** jugadores hay, no quiénes | La pantalla de jugadores cuenta en vez de listar; el registro sí dice quién entra (`Join succeeded:`) |
| El certificado autofirmado lleva la versión del juego en su descripción | De ahí sale «anniversary-2026 (build 502094)» para la ficha |
| Arranca en ~6 s y se para por API en ~2,5 s | Los plazos de espera de la app se fijaron con esos números |

**Comprobado que no se tocó nada del usuario.** Tiene Satisfactory instalado y 119 ficheros suyos en
`%LOCALAPPDATA%\FactoryGame`. Se sacaron sus checksums antes de empezar; durante las pruebas el
servidor creó ahí dos ficheros propios (una partida y `ServerSettings.7777.sav`) antes de dar con
`-SavesUseProjectSavedDir`; se borraron y se comprobó fichero a fichero que los 119 originales
seguían **idénticos**. La `e2e` de Satisfactory repite esa comprobación en cada ejecución.

#### Cómo queda

| Pieza | Dónde |
|---|---|
| Cliente de la API HTTPS (certificado autofirmado, errores traducidos) | `core/games/satisfactory/api.ts` |
| Adaptador: instalar, reclamar, arrancar, sondear, parar, copiar | `core/games/satisfactory/adapter.ts` |
| Partidas y ajustes (todo por API) | `core/games/satisfactory/service.ts`, IPC `satisfactory:` |
| Asistentes, Ajustes y Partidas | `renderer/src/games/satisfactory/` |
| Selector de juego con tarjetas | `renderer/src/GameChooser.tsx` |

**Decisiones:**

| Asunto | Resolución |
|---|---|
| **Aislamiento de los datos** | La carpeta del servidor va a `instances/<id>/server/datos`, con `-UserDir` + `-SavesUseProjectSavedDir`. Es la misma trampa que Project Zomboid y la única forma de que las copias de seguridad sepan dónde está la partida |
| **Reclamar durante la instalación** | El asistente arranca el servidor una vez, lo reclama, le pone las contraseñas y crea la partida. Cuesta ~40 s y evita que el usuario tenga que abrir el juego. Si la instalación se quedó a medias y el servidor ya tenía dueño, se entra con la contraseña en vez de fallar |
| **Estado por sondeo** | El contrato gana `poll()`: los juegos que no cuentan nada por el registro dicen por ahí si están listos y cuánta gente hay. «Listo» en Satisfactory no es que el proceso viva, sino que hay **partida cargada** |
| **Líneas ocultas** | El contrato gana `hidden`: el registro de Satisfactory es ruido de motor casi entero (y casi todo en forma de *avisos*). Se enseña lo que cuenta algo y se guarda todo para diagnosticar. Lo que huele a fallo grave (`Fatal`, `Failed to bind`, memoria) no se esconde nunca |
| **Contraseñas en el manifiesto** | La de administrador se guarda tal cual: la app la necesita en cada arranque para hablar con la API, y el usuario la necesita dentro del juego. Está en su equipo, junto a los datos del servidor, y la ficha técnica la enseña en vez de fingir que es un secreto de la app. Cifrarla con la protección de datos de Windows queda para la fase 4, que ya la necesita para Factorio |
| **Sin comprobación desde internet** | Satisfactory no sale en ninguna lista pública: no hay servicio al que preguntar. La capacidad `externalCheck` lo declara, el botón no aparece y la pantalla explica cuál es la única prueba de verdad (que entre alguien de otra red) |
| **Sin moderación ni nombres** | Capacidades `moderation` y `playerNames` en falso: la pantalla de jugadores cuenta cuántos hay y dice dónde se modera (dentro del juego) en vez de enseñar botones que no funcionarían |
| **Sin consola de órdenes** | El servidor no lee stdin. La caja de texto de la consola no aparece y se explica por qué |
| **`MapName` obligatorio** | `CreateNewGame` sin él responde `missing_params`. Se manda `GrassFields`; el servidor avisa de que no lo reconoce y usa el mapa por defecto, que es el único que hay. Queda anotado por si en el futuro admite más |
| **Elegir juego y luego modo** | Se mantiene el flujo de dos pantallas (juego → modo → asistente): la de modo es donde se explican el básico y el avanzado, y quitarla dejaría esa elección sin explicación para quien crea su primer servidor |

**Textos comunes que se generalizan.** El aviso de producto no oficial pasa a ser genérico con más
de un juego (el literal que exige Mojang se mantiene aparte), el subtítulo deja de decir «Minecraft»
y el asistente comparte sus piezas (`WizardParts`) para que crear un servidor se sienta igual en
cualquier juego.

**Encontrado usando la app de verdad (después de cerrar la fase).** Al intentar entrar en el
servidor recién creado con la conexión directa por IP, el juego respondía **«Encryption token
missing»**. No era un fallo de la app: Satisfactory exige un token que el cliente solo consigue
cuando se añade el servidor desde su menú (**Servidores → Añadir servidor**), que es cuando habla
con el panel del servidor. El registro del servidor lo decía en su idioma
(`No EncryptionToken specified, disconnecting`) y la app lo soltaba tal cual. Ahora:

- `GameInfo.joinSteps` / `joinWarning`: los juegos cuya forma de entrar no es «pega la dirección»
  enseñan los pasos en la pantalla de conexión, con el aviso de que la conexión directa no vale.
- La consola traduce ese rechazo a lenguaje humano, diciendo qué hay que hacer.

**Y un fallo peor, encontrado por la misma vía.** La `e2e` se ejecutó con un servidor real del
usuario en marcha: el servidor de la prueba no pudo coger el puerto 7777, pero su `HealthCheck`
respondió igual —lo contestaba **el otro servidor**— y la prueba siguió adelante intentando
reclamarlo. Falló solo porque las contraseñas no coincidían; con la misma contraseña, la app le
habría creado una partida nueva encima al servidor que estaba jugándose. Ahora arrancar (y la
instalación) empieza por comprobar que los dos puertos están libres, con un error que dice que solo
puede haber un servidor de Satisfactory a la vez; el smoke lo cubre y la `e2e` se niega a correr si
el 8888 está ocupado.

**Fallo del núcleo encontrado por el camino.** El supervisor daba la parada por terminada justo al
llamar a `kill()`, sin esperar a que el proceso muriera. En Windows los ficheros siguen bloqueados un
instante, así que borrar el servidor o restaurar una copia inmediatamente después podía fallar con
`EBUSY`. Ahora espera al cierre real (con un tope de 5 s) y el smoke lo cubre.

**Cómo se ha comprobado:**

- `smoke` (267): la API contra un servidor HTTPS de mentira con certificado autofirmado que devuelve
  las respuestas **reales grabadas** (`fixtures/satisfactory/`), incluidos los errores con código
  200; los argumentos de arranque —con una comprobación dedicada a que no falte
  `-SavesUseProjectSavedDir`—; la lectura del registro con líneas reales; los diagnósticos; y los
  puertos y capacidades.
- `e2e:satisfactory` con el servidor real: instalar, reclamar sin abrir el juego, arrancar, detectar
  «listo» por la API, puertos, partidas (listar, guardar, crear otra, volver), cambiar un ajuste en
  caliente, copia con el servidor en marcha, parada limpia, restauración y borrado. Y al final, que
  `%LOCALAPPDATA%\FactoryGame` no haya cambiado.
- `e2e paper`, `e2e:restart` y `e2e:steam`: en verde, igual que antes. Minecraft no empeora.
- Recorrido de Playwright por los dos modos y por el selector de juego nuevo.

### 19.16 Valheim (Fase 3)

Cuarta fase de [HOJA-DE-RUTA-MULTIJUEGO.md](HOJA-DE-RUTA-MULTIJUEGO.md) y segundo juego nuevo.
Valheim es el contrario de Satisfactory: **no tiene API, ni consola, ni fichero de configuración**.
Todo lo que se puede decidir va en la línea de órdenes del arranque, y todo lo que el servidor
cuenta lo cuenta por su registro. Eso cambia dónde vive cada cosa, no la forma de la app.

#### Lo que se averiguó contra el servidor real

Se lanzó el servidor de verdad (el ya instalado en `qubiq-dev`, versión 1.0.12, red 40) **siempre
con `-public 0` y sin crossplay**, así que no salió nada hacia fuera en ningún momento. La lista de
lo que acepta cada argumento no está copiada de ninguna wiki: el servidor escribe «Setting world
modifier: combat->veryhard» cuando entiende algo y «Could not parse … as a world modifier» cuando
no, así que se le preguntó una por una.

| Hallazgo | Consecuencia |
|---|---|
| **Las reglas de sí/no no son modificadores.** `-modifier nobuildcost true` se rechaza; `nomap`, `nobuildcost`, `passivemobs`, `playerevents` y `noportals` son **claves globales** y van con `-setkey` | Es la trampa de esta fase: el servidor lo rechaza con una línea de registro que nadie lee y arranca igual, así que el ajuste simplemente no se aplica. El smoke comprueba las dos formas |
| `-modifier` acepta **cinco claves** (combat, deathpenalty, resources, raids, portals) con valores medidos uno a uno; `default` significa «lo que diga el preset» | El catálogo de `shared/games/valheim/types.ts` es exactamente lo que el servidor contestó. Los que están en `default` **no se mandan**, para no pisar lo que ya tuviera el mundo |
| `-preset` acepta ocho: `default`, `normal`, `casual`, `easy`, `hard`, `hardcore`, `immersive`, `hammer` | Los siete con sentido para el usuario salen en el selector de dificultad; en básico solo tres |
| **El servidor NO comprueba la longitud de la contraseña**: arranca con cuatro caracteres | El `.bat` oficial dice que el mínimo son cinco y el juego los exige. Lo comprueba la app antes de crear nada, que es donde se puede explicar. Lo mismo con la contraseña metida en el nombre del servidor: el servidor no dice nada y la app sí |
| **Con `-public 0` no contesta a las consultas de Steam** (A2S), ni en el puerto de juego ni en el de consulta, ni desde el propio equipo | «¿Responde el servidor?» no se puede contestar con el protocolo del juego salvo que esté publicado. Sin publicar se mira si tiene su puerto UDP abierto, y se dice que eso es lo que se ha mirado |
| **Publicado, solo contesta en el puerto de consulta**, nunca en el de juego; el nombre del mundo no viaja (`map` repite el del servidor) y la versión útil está en las palabras clave (`g=1.0.12,n=40`), no en `version`, que dice siempre «1.0.0.0» | La consulta de estado usa el puerto de consulta y saca la versión de las palabras clave. Todo grabado en `fixtures/valheim/a2s.json` |
| El registro dice **el SteamID de quien entra, no su nombre** (`Got connection SteamID …` / `Closing socket …`) | Se puede listar quién está dentro y moderarlo, pero con ese número por delante: la pantalla lo explica en vez de hacerlo pasar por un nombre. Es justo lo que piden las listas del juego |
| **El servidor relee las listas al vuelo: vetar a alguien que está dentro lo echa** (comprobado por el usuario con un jugador real) | La moderación de Valheim no es solo «para la próxima vez»: es una capacidad de verdad, y los botones están donde se ve quién está conectado |
| El servidor crea `adminlist.txt`, `bannedlist.txt` y `permittedlist.txt` **dentro de `-savedir`** | Las tres listas se editan desde la app sin abrir ficheros, y entran en la copia de seguridad |
| «Listo» es la línea `Opened Steam server`; generar un mundo nuevo tarda ~35 s y cargar uno existente ~12 s | Los plazos de la app salen de ahí |
| El mundo es una **carpeta** dentro de `worlds_local`, no un par de ficheros sueltos | La pestaña Mundos lista carpetas y la copia guarda la carpeta entera |
| Valheim avisa de que **necesita Visual C++ Redistributable** para el crossplay (PlayFabParty) | La consola y el diagnóstico lo traducen, con la salida de emergencia: se puede jugar sin crossplay |
| **Con `-crossplay` la señal de «listo» es otra**: dice «Opened PlayFab server» y la de Steam **no llega nunca** (se esperaron tres minutos) | Buscando solo la de Steam, un servidor con crossplay se quedaría «Arrancando» para siempre. Es el fallo que encontró esta prueba |
| **Con crossplay el servidor escribe la IP pública del equipo** en cuatro líneas, porque es la que registra en PlayFab | No puede acabar en una consola que se enseña y se copia y pega: se esconde y se borra hasta del texto que se guarda. El código sí se rescata de esa línea |
| El código llega **después** de estar listo, y en dos líneas distintas | La pantalla dice «todavía no ha dado el código» mientras tanto, en vez de parecer rota |

**Comprobado que no se tocó nada del usuario.** Sin `-savedir`, Valheim escribe los mundos en
`%USERPROFILE%\AppData\LocalLow\IronGate\Valheim`, junto a las partidas de un jugador. Es la
misma trampa que Project Zomboid y Satisfactory. La `e2e` mira esa carpeta antes y después de cada
ejecución y falla si ha cambiado algo.

#### Cómo queda

| Pieza | Dónde |
|---|---|
| Adaptador: instalar, arrancar, leer el registro, parar y copiar | `core/games/valheim/adapter.ts` |
| Mundos y listas de moderación (ficheros, con el servidor parado) | `core/games/valheim/service.ts`, IPC `valheim:` |
| Catálogo de presets, modificadores y claves globales | `shared/games/valheim/types.ts` |
| Asistentes, Ajustes, Mundos y Moderación | `renderer/src/games/valheim/` |

**Decisiones:**

| Asunto | Resolución |
|---|---|
| **El crossplay es un modo de exposición, no un ajuste** | `ExposureMode` gana `crossplay`, y las capacidades, `crossplay: boolean`. Guardarlo además en `data` habría dado dos fuentes de verdad para lo mismo. Consecuencia buena: la pantalla de conexión, la ayuda y los pasos para entrar salen solos por el mismo sitio que los demás modos |
| **El código para entrar** | El juego lo genera en cada arranque y solo lo dice por el registro. El contrato gana `ParsedEvent.joinCode` y el estado `InstanceState.joinCode`; en modo básico ocupa el sitio de la dirección, porque con crossplay **la dirección no sirve**. Comprobado de punta a punta con el servidor real: el código sale en la pantalla principal con su botón de copiar |
| **Reintentar la señal de cierre** | Ctrl+Break se ignora mientras el mundo se genera (fase 1). `StopStrategy` gana `retryEveryMs` y el supervisor la repite mientras el proceso siga vivo: sin eso, parar durante la generación acabaría matando el servidor al agotarse el plazo |
| **Ajustes con el servidor parado** | Al revés que Satisfactory. Toda la configuración es la línea de órdenes, así que se guarda en el manifiesto y se aplica al arrancar. La pantalla lo dice en vez de dejar que el usuario cambie algo y no note nada |
| **Un servidor, varios mundos** | Como Minecraft: crear, cambiar y borrar, con copia automática antes de borrar y sin dejar borrar el que se está jugando. El mundo recién creado sale como «sin generar» en vez de desaparecer hasta el primer arranque |
| **Moderación por identificador, y en la pantalla principal** | Vetar **echa al jugador al momento**, así que la moderación de Valheim es de verdad y sus botones están donde se ve quién está dentro (Jugadores), no escondidos en Configuración. La pestaña Moderación se queda con las listas completas, para quien no está conectado |
| **La lista de invitados avisa** | En cuanto tiene una línea, **solo entra quien esté en ella**. Es la forma más fácil de que el usuario se quede fuera de su propio servidor, así que sale un aviso en cuanto deja de estar vacía |
| **Copia en caliente sin poder pedir un guardado** | No hay a quién pedírselo. Se espera a que le toque guardar y se copia justo después; si no llega ninguno a tiempo, la copia se cancela en vez de guardar un mundo a medio escribir |

**Textos comunes que se generalizan.** La pantalla de jugadores **ya no nombra a ningún juego**.
Antes tenía escritos a fuego los tres comandos de Minecraft (`kick`, `ban`, `op`) y el caso de
Satisfactory; ahora los botones los aporta cada juego (`GameUi.playerActions`) y el texto que
explica qué se puede moderar sale de `GameInfo.moderationHint`. Las capacidades se parten en dos,
porque no eran lo mismo: `playerIds` («el juego dice quién está dentro») y `playerNames` («y
además con un nombre que el usuario reconoce»). Valheim es el caso que lo demuestra: da el
primero y no el segundo. El recuento cae en los identificadores vistos cuando el juego no da un
número, y las pestañas del juego reciben los jugadores al día.

**Encontrado con el recorrido de la interfaz.** Con crossplay, los pasos para entrar seguían
diciendo «pega ahí la dirección», que es justo lo que no hay que hacer. Los juegos con crossplay
declaran ahora sus propios pasos (`joinStepsCrossplay`).

**Cómo se ha comprobado:**

- `smoke` (376): argumentos de arranque —con comprobaciones dedicadas a que no falte `-savedir` y a
  que las reglas de sí/no vayan por `-setkey`—, el catálogo de modificadores, la lectura del
  registro contra **líneas reales grabadas** (`fixtures/valheim/registro.txt`), la **consulta de
  Steam contra la grabación real del servidor publicado** (`fixtures/valheim/a2s.json`), el
  **arranque con crossplay grabado** (`fixtures/valheim/crossplay.txt`, con la comprobación de
  que la IP pública no se enseña), los diagnósticos, la parada, lo que el asistente no deja
  crear, las listas de moderación y los puertos y capacidades.
- `e2e:valheim` con el servidor real: instalar, arrancar generando el mundo, puertos, moderación,
  copia en caliente esperando a un guardado, parada limpia con Ctrl+Break, parar mientras arranca,
  mundos (crear, cambiar, no dejar borrar el activo), restauración y **comprobar que la carpeta de
  Valheim del usuario no ha cambiado**.
- `e2e paper`, `e2e:restart` y `e2e:steam`: en verde. Minecraft no empeora.
- Recorrido de Playwright: el selector con tres juegos, el asistente de Valheim en los dos modos y
  las pantallas del servidor (ajustes, conexión con crossplay, mundos, moderación y ficha técnica).
- Y con el servidor **arrancado de verdad desde la app** (`valheim-vivo.mjs`): arranque, mundo
  cargado, consola con las líneas reales ya traducidas y parada limpia; y otra vuelta **con
  crossplay**, viendo el código aparecer en la pantalla principal.

**El A2S, grabado con permiso.** Se arrancó el servidor real con `-public 1` durante medio minuto
y se paró en cuanto se tuvo la grabación. De ahí salen los cinco hallazgos de la tabla sobre la
consulta de Steam, y de ahí sale que la versión que se enseña ya no es «1.0.0.0».

**Lo que confirmó el usuario jugando.** Entrando de verdad en un servidor local: el identificador
de Steam aparece en la consola y en la pantalla de moderación (o sea, las líneas de conexión se
interpretan bien), y **vetar echa al jugador que está dentro**. Eso último cambió el diseño: la
moderación pasó de «solo para la próxima vez» a una capacidad de verdad, con botones en la
pantalla principal.

**El crossplay, también grabado con permiso.** Se arrancó con `-crossplay` y se paró en cuanto
llegó el código. De ahí salieron las dos filas de la tabla, y con ellas **el fallo más gordo de
la fase**: la señal de «listo» que buscaba la app no existe con crossplay, así que un servidor
con crossplay se habría quedado «Arrancando» para siempre. Probado después de punta a punta
desde la app: arranca, se pone en marcha y enseña el código en la pantalla principal.

**Lo único que queda sin grabar** son las dos líneas de conexión de jugadores
(`fixtures/valheim/sinteticas.txt`, **marcadas como sintéticas**). Su comportamiento sí está
comprobado: con un jugador dentro, la app enseña su identificador.

**Y un fallo del que conviene acordarse.** La regla que esconde la IP pública no funcionaba, y
el fichero se veía perfecto: editándolo desde Git Bash se había colado un **retroceso de verdad**
(0x08) donde tenía que ir un `\b`. TypeScript compilaba, la expresión regular no casaba nunca y
la prueba fallaba sin explicación. Ahora el smoke revisa los 123 ficheros de código y falla si
aparece cualquier carácter de control invisible.

### 19.17 Versiones de Paper en pruebas

Cuando Mojang saca una versión, Paper tarda días en tener un servidor terminado para ella: hasta
entonces solo publica builds `ALPHA`. En la fase 1 esto se resolvió **escondiendo** esas versiones
del catálogo, porque el instalador las rechazaba y el asistente reventaba al crear (§19.14). El
efecto colateral es peor que el fallo: durante esos días la app simplemente no sabía instalar la
versión que todo el mundo acaba de actualizar en su Minecraft.

Ahora se ofrecen, pero con el aviso delante:

| Pieza | Qué hace |
|---|---|
| `DistributionVersion.experimental` | Marca las versiones cuyo último build no es estable. El catálogo comprueba las **5 primeras** contra Paper y para en la primera estable; las antiguas siempre lo son y cada consulta queda en caché |
| `recommended` | Ya no es la primera de la lista, sino **la primera que no está en pruebas**. `defaultVersionFor` devuelve esa, así que el valor por defecto de los dos asistentes sigue siendo la última estable |
| `MinecraftData.allowExperimental` | Se guarda en el manifiesto cuando el usuario acepta. Hace falta porque reinstalar y actualizar el build vuelven a pasar por el instalador, y ahí ya no se le puede preguntar |
| `paper.latestBuild(version, allow)` | Sigue negándose por defecto. El mensaje ya no manda al «modo avanzado», que no era donde estaba la solución |
| `paper.latestChannel` | No lanza: un fallo de red marca la versión como en pruebas en vez de tumbar el catálogo entero |

En el asistente **avanzado** la versión en pruebas sale en la lista con su etiqueta y, al elegirla,
aparece un aviso explicando que puede fallar, ir peor y dar problemas con los plugins. En el
**sencillo**, que no tiene selector de versión a propósito, el resumen enseña un aviso solo cuando
existe una versión más nueva en pruebas, con un botón para cambiarse y otro para volver a la
estable. Se ofrece únicamente la más nueva: dar a elegir entre varias alphas sería pedirle al
usuario que decida algo que no puede valorar.

**Un aviso que no se veía como tal.** La clase `alert warn` se usa en nueve sitios (Satisfactory,
Valheim, la guía de conexión) y **no tiene regla CSS**: esas cajas salen con el borde neutro de
`.alert`, no en ámbar. Escribir la regla que falta arreglaba los nueve de golpe, pero también
cambiaba pantallas que este trabajo no toca, así que el aviso nuevo usa la misma clase y se ve
igual que los demás. Queda anotado por si algún día se decide darles color.

**Cómo se ha comprobado:** `typecheck` limpio; smoke 380/0, con comprobaciones nuevas de que la
recomendada tiene build estable, de que las que no lo tienen van marcadas y por delante de ella, y
de que el build alpha se resuelve con permiso y se rechaza sin él; `e2e paper` y `e2e:restart` en
verde; una prueba aparte, con datos en carpeta temporal, que crea un servidor de Paper 26.3 (solo
alpha ahora mismo): sin el permiso la instalación se niega con el mensaje correcto, y con él baja
el jar de 64,1 MB, guarda el build 8 y deja `allowExperimental` en el manifiesto; y el recorrido de
Playwright, con un guion nuevo (`ui/minecraft-en-pruebas.mjs`, capturas 36-38) que recorre los dos
asistentes. La comparación píxel a píxel del recorrido completo solo señala `20-resumen`, que es
justo donde aparece el aviso.

### 19.18 Cambiar de versión, en cualquier juego

Hasta ahora un servidor nacía con una versión y se quedaba con ella: el núcleo tenía
`checkForUpdate` y `updateServer` desde la fase 1, pero **ninguna pantalla los usaba** (la propia
hoja de ruta lo dejaba escrito). Y Minecraft ni siquiera tenía `checkUpdate`, porque su versión la
elige el usuario. El caso que faltaba es de ida y vuelta: subir a la que acaba de salir, y poder
volver si no convence.

#### Qué es «una versión» en cada juego

No se parecen en nada por dentro, y forzar que se parecieran habría estropeado los dos:

| | Minecraft | Juegos de Steam |
|---|---|---|
| Qué se elige | Una versión del juego (`26.2`) | Una **rama** publicada por el estudio |
| Quién manda | El catálogo cruzado de Mojang y la distribución | `app_info_print`, que lista las ramas con su descripción |
| Hacia atrás | Cualquier versión anterior que la distribución publique | Las ramas antiguas que el estudio mantenga |
| Lo que no se puede | — | Volver a una build suelta: exige `download_depot` con los identificadores de cada depósito, que Valve no sirve de forma anónima |

Lo que tienen en común es lo único que le importa a quien elige, y eso es lo que hay en
`InstallableVersion`: cómo se llama, si es anterior o posterior a la instalada, y si está
terminada. El adaptador aporta `listVersions` y `prepareVersionChange`, y el núcleo hace siempre lo
mismo: copia de seguridad, apuntar la versión en el manifiesto y reinstalar.

**Las ramas reales, consultadas contra Steam:** Satisfactory tiene `public` y `experimental`
(ahora mismo con la misma build). Valheim tiene `public` y **seis** ramas antiguas con descripción
del estudio: «Previous stable», «Last stable build before 1.0», «…before Ashlands», «…before Bog
Witch», «…before Call to Arms», «…before Mistlands». Ninguna pide contraseña; las que la pidan se
descartan, porque la app no la tiene.

#### Tres cosas que solo se supieron probándolo

**`-beta public` no es inofensivo.** La primera versión pasaba siempre `-beta <rama>`. Sobre una
instalación que ya estaba en la pública, SteamCMD lanza un trabajo de *reconfiguring* que, sin nada
que descargar, acaba en `Error! App '896660' state is 0x6 after update job` y código 8. Rompió el
`e2e:valheim` y dejó la instalación compartida a medias. Ahora la bandera solo se pasa cuando de
verdad cambia algo —a una rama distinta de la pública, o de vuelta a ella desde otra—, y el estado
0x6 se reconoce como pasajero con un mensaje que dice qué hacer.

**Al cambiar de rama hay que validar.** Steam da por buenos los ficheros que ya están, así que al
bajar a una anterior el servidor se queda mezclado. `appUpdate` compara la rama pedida con la del
`appmanifest` (`UserConfig.BetaKey`) y añade `validate` solo cuando cambia.

**Dos copias en el mismo segundo se pisaban.** El nombre de una copia es su marca de tiempo al
segundo, y cambiar de versión justo después de pedir una a mano caía en el mismo segundo: la
segunda **sobrescribía** a la primera, que era la que alguien había pedido a propósito. Ahora se
busca un nombre libre (`…-2`, `…-3`). Es anterior a este trabajo, pero salió aquí porque es donde
la copia previa es la única vuelta atrás.

Y una cuarta de redacción: la copia previa se hacía dentro de `install`, o sea **después** de
apuntar la versión nueva, así que quedaba etiquetada con una versión que ese servidor nunca tuvo.
Justo lo que se lee al restaurarla cuando algo ha salido mal. `changeVersion` la hace antes y le
pasa `skipBackup` a `install`.

#### En pantalla

En **los dos modos**: en qué versión va y, si ha salido una más nueva, un botón para ponerse al
día. No es un lujo del modo avanzado: un servidor de Steam desactualizado deja de aceptar a sus
jugadores, y esconder el arreglo dejaría tirado a quien menos sabe buscarlo.

En **avanzado**, además, la lista entera con lo que es cada una («26.1.2 — anterior», «Previous
stable (default_old)»). Subir a la recomendada no pregunta nada. Bajar, meterse en una en pruebas o
no poder saber cuál es más nueva pasan por una confirmación que nombra la partida concreta que hay
en juego («Lo que tienes guardado —su mundo, con todo lo construido— se creó con una versión
posterior») y recuerda que la copia se hace sola.

El coste: abrir «Servidor» en un juego de Steam llama a SteamCMD dos veces (las ramas y la build
publicada), y eso son unos segundos con el dado girando. Se deja así a propósito: cachear la
respuesta haría que «Volver a comprobar» mintiera.

**Cómo se ha comprobado:** `typecheck` limpio; smoke 415/0, con las ramas reales grabadas
(las siete de Valheim, su orden, las descripciones del estudio y el `BetaKey`), el estado 0x6, las
dos copias en el mismo segundo y el cambio de versión de Minecraft (Java recalculado, permiso de
versión en pruebas puesto y quitado, versión inventada rechazada); `e2e:steam` con el viaje de ida
y vuelta a `default_old` contra Steam de verdad; `e2e paper` bajando a la 26.1.2, arrancando con
ella y volviendo, con la copia previa etiquetada con la versión de la que se venía; `e2e:valheim`,
`e2e:satisfactory` y `e2e:restart` en verde; y el recorrido de Playwright con un guion nuevo
(`ui/version-servidor.mjs`, capturas 39-42). La comparación píxel a píxel solo señala las pestañas
«Servidor», que es donde va la tarjeta.

**Lo que no se ha probado:** cambiar de rama desde la interfaz con un servidor de Steam de verdad
(en el recorrido los servidores de prueba no tienen instalación). El camino sí está probado por
`e2e:steam`, que es el mismo `appUpdate`.

### 19.19 Factorio (Fase 4)

Tercer juego nuevo, adelantado a la cuarta fase a petición del usuario. Factorio es distinto a todo
lo anterior en una cosa que lo condiciona todo: **no hay servidor dedicado para Windows**. Lo que se
lanza es el ejecutable del propio juego con `--start-server`, así que para tener un servidor hay que
tener el juego, y la app no puede descargarlo de forma anónima como hace con los demás.

#### Lo que se averiguó contra el juego real

Se probó contra Factorio 2.1.19 con Space Age (la instalación de Steam del usuario) y contra la
2.0.77 estable descargada con SteamCMD. Nada se publicó en ninguna lista: `visibility.public` estuvo
siempre en `false`. Las opciones no se copiaron de la wiki: se le preguntaron al ejecutable con
`--help`.

| Hallazgo | Consecuencia |
|---|---|
| **`factorio.exe` es un binario de subsistema GUI, no de consola** (cabecera PE, subsistema 2): no tiene entrada estándar y escribir en ella da EPIPE | Se cae la mitad de lo que decía la hoja de ruta: no hay control por stdin. **Todo va por RCON**, así que todos los servidores lo llevan puesto aunque el usuario no lo pida. Ctrl+Break tampoco vale: no hace nada y, además, no guarda |
| **Factorio ignora el «paquete terminador» de Source RCON**: contesta al comando y del terminador no devuelve nada | El cliente RCON de la app lo esperaba siempre (así hablan Minecraft y Zomboid), así que **toda orden acababa en un plantón**. Peor: el servicio interpretaba ese fallo como «servidor parado» y moderaba escribiendo ficheros. `RconOptions.terminatorEcho` permite el otro modo: recoger trozos hasta que deja de llegar nada |
| Un `config.ini` propio con `write-data` **saca de `%APPDATA%\Factorio` las partidas, los mods, el registro, `temp` y las listas de moderación** | Es el aislamiento de esta fase, y hacía falta: ahí están las partidas de un jugador del usuario. El servidor ni siquiera lee su `player-data.json` |
| **Las imágenes y los sonidos no hacen falta para servir.** Quitándolos, la instalación pasa de 5,1 GB a 246 MB **con los mismos checksums de prototipos** (base 2341852305, lista 1446647465) | Cada servidor tiene su copia del juego por ~250 MB en vez de 5,4 GB, y el mapa se genera 15 veces más rápido (1 s en vez de 15,7 s). Comprobado con un cliente real entrando a jugar en una copia adelgazada. **Los `.lua` que viven dentro de `graphics/` sí hacen falta**: sin ellos no carga ni el mod base |
| **La versión estable (2.0.77) no termina de cerrarse** tras guardar con `/quit`: guarda al 100 %, escribe «Quitting multiplayer connection» y el proceso se queda vivo (probado con 60, 90 y 240 s). La 2.1.19 cierra en 0,4 s | Agotar el plazo y cerrar el proceso es seguro **porque la partida ya está en disco**: los arranques siguientes la cargan sin quejarse. Es la versión que la app propone por defecto, así que no es un caso raro |
| **Cambiar de versión sobre una instalación adelgazada falla** (`state is 0x426`) y la deja a medias; una actualización normal sobre ella dice «already up to date» y no restaura nada | Por eso la descarga va a una carpeta aparte y de ahí se copia adelgazada: el almacén temporal se borra al terminar (decisión del usuario: 0 GB fijos, a cambio de volver a descargar al cambiar de versión) |
| **SteamCMD pide la contraseña por teclado y no la escribe en la tubería**, pero sí la consume si se le manda nada más arrancar | La contraseña **no viaja en la línea de órdenes**, donde cualquiera que mire los procesos la vería. Se usa una vez; después valen las credenciales que Steam deja en caché, y a la app le basta el nombre de usuario |
| SteamCMD descarga **también el DLC** (depósito 645393) si la cuenta lo tiene | La app no pregunta si compraste Space Age: mira si llegó `data/space-age` |
| Factorio publica **una rama de Steam por versión** (22: de `0.12.35` a `2.1.19`), además de `public` (2.0.77), `experimental` y `console` | La pantalla de Versión de la 0.6.1 encaja sin tocar nada, y aquí importa más que en otros juegos: el cliente tiene que ir en la misma versión que el servidor |
| **Con `require_user_verification: true` el servidor llama a `auth.factorio.com`** al arrancar (pide un «server padlock»); con `false` no sale un paquete | Es un ajuste explícito, encendido por defecto porque sin él cualquiera entra con el nombre que quiera. La interfaz dice lo que implica |
| `--rcon-port` abre la consola remota **en 0.0.0.0**, o sea, a toda la red local | Se usa `--rcon-bind 127.0.0.1:<puerto>`: la consola remota es de la app, no de quien pase por el wifi. Por eso tampoco se lista ese puerto entre los que hay que abrir |
| El registro da **nombres de jugador de verdad**: `[JOIN] Fulano joined the game`, `[CHAT] Fulano: hola`, `[LEAVE] …`, con fecha delante, y `--console-log` deja esas líneas limpias en un fichero aparte | A diferencia de Valheim, la pantalla de jugadores lista nombres que el usuario reconoce y la moderación va por nombre |
| Quien intenta entrar sin contraseña queda como `Refusing connection for address (…), username (X). PasswordMissing` | Se traduce en la consola: el cliente solo ve que le cortan. ⚠ La dirección lleva paréntesis dentro, así que no se puede leer con un `\(([^)]+)\)` |
| **`/promote` no funciona con quien nunca ha entrado**: el servidor contesta con un silencio y no apunta nada. En cambio, escribir `server-adminlist.json` con el servidor en marcha **sobrevive a la parada** | La moderación hace las dos cosas: la orden por RCON (para que vetar eche al momento) y el fichero (para que quede). A quien no está conectado se le puede nombrar administrador igual: se aplica al reiniciar |
| El servidor guarda los nombres **en minúsculas** | Las listas se juntan sin distinguir mayúsculas; si no, la misma persona salía dos veces |
| En Windows contesta «OS does not support non-blocking saving» | El ajuste no se ofrece: prometerlo sería mentir |
| El portal de mods deja **buscar y consultar sin credenciales**, pero descargar redirige al login y contesta 403 | Para instalar hace falta el usuario y el token de factorio.com. El propio juego ya los tiene en `player-data.json`, así que la app ofrece usar esa sesión en vez de pedir otra contraseña. **El token no se guarda en disco** |
| **La API del portal no sabe buscar por texto**: `q`, `query` y `search` se ignoran (devuelven los 23.000 mods en orden alfabético) y `namelist` contesta 500 | Se pide el índice entero —13 MB en segundo y medio—, se cachea una hora y se filtra en la app, ordenando por descargas. Es la única forma de que el buscador encuentre algo |

**Comprobado que no se tocó nada del usuario.** Cada paso llevaba una foto de `%APPDATA%\Factorio`
antes y después. Los únicos cambios que aparecieron fueron los que deja el propio cliente al abrirlo
(`.lock`, sus registros, `crop-cache.dat`, el fondo del menú): ni una partida, ni un mod, ni el
`player-data.json`. La `e2e` lo comprueba en cada ejecución.

#### Decisiones

- **De dónde sale el juego.** Dos caminos, y los dos piden algo: copiar una instalación que ya esté
  en el equipo (no descarga nada) o bajarlo de Steam con la cuenta del usuario. La copia se adelgaza
  siempre; la instalación de origen no se toca.
- **La estable por defecto, en todos los juegos.** Las versiones en pruebas se eligen a mano. Ya lo
  hacía el código común, y aquí se mantiene aunque la estable sea justo la que se cuelga al cerrar.
- **RCON no es una opción.** Puerto y contraseña los genera la app al crear el servidor, atados a
  `127.0.0.1`. Sin eso no habría forma de parar el servidor ni de moderarlo.
- **Space Age se decide al crear y no se puede cambiar.** El mapa se genera con esos mods dentro y
  el checksum de prototipos cambia con ellos.
- **Ningún secreto se guarda.** Ni la contraseña de Steam, ni la de factorio.com, ni el token del
  portal: se usan y se olvidan. Lo único que se guarda es el nombre de usuario de Steam, que hace
  falta en cada descarga.

#### Sobre el portal de mods

El portal estuvo **caído (503) un buen rato** mientras se cerraba la fase. Cuando volvió se probó
entero: buscar, instalar `flib` con las credenciales de la sesión del juego, comprobar que no se
lleva por delante lo que ya había en `mod-list.json` (ahí está también Space Age) y quitarlo. La
`e2e` distingue el caso de que el portal no conteste y termina con 2 en vez de con 1, como el smoke:
que un servicio de fuera se caiga no es un fallo de la app.

---

### 19.20 Configurar plugins y mods desde la app

Hasta aquí, solo los plugins oficiales tenían formulario (§19.9), porque conocemos su `config.yml`.
Para cualquier otro plugin o mod había que abrir la carpeta y editar el fichero a mano. Ahora cada
plugin o mod instalado tiene un botón **Configurar** que abre una **ventana flotante** con sus
ficheros de configuración, cada opción con su control y con la explicación que el autor dejó en el
fichero. El formulario de los plugins oficiales, que se desplegaba debajo del plugin, pasa a la
misma ventana flotante, a petición del usuario.

#### Si los ficheros traen explicaciones (medido, no supuesto)

Antes de hacerlo se midió con ficheros reales cuántas opciones llevan un comentario encima:

| Origen | Formato | Muestra | Resultado |
|---|---|---|---|
| Mods de Forge/NeoForge | TOML | 40 ficheros del modpack ATM-10 | 35 al 90-100 %. Muchos traen además `Default`, `Range` y `Allowed Values`, porque **los genera Forge a partir del código del mod** |
| Mods con JSON | JSON | 25 ficheros del mismo modpack | **Ninguna**: el JSON no admite comentarios. Solo hay nombres de clave |
| Plugins de Paper populares | YAML | EssentialsX, LuckPerms | Muchas (700 y 530 líneas de comentario), con banners de arte ASCII y opciones apagadas con `#` |
| El propio Paper | YAML | `spigot.yml`, `paper-global.yml`, `bukkit.yml` | **Ninguna por opción**: una cabecera con un enlace a la documentación |

Así que la ventana aprovecha bien los mods de Forge y los plugins grandes, y en JSON solo puede
enseñar el nombre de cada clave; lo dice en vez de dejar el hueco vacío. La excepción que se encontró:
los mods de Darkhax (Botany Pots, Enchantment Descriptions) meten la explicación en claves `"//"` y
`"//default"` dentro del JSON, y se leen como tales.

#### Decisiones

- **Editar por líneas, sin librerías de YAML ni TOML.** La misma regla que `KeyValueFile` y
  `PluginConfigFile`: se localiza el trozo exacto del valor y se sustituye solo eso. Un serializador
  se comería los comentarios, que son justo lo que se quiere enseñar. Además el proyecto no tiene
  dependencias de ejecución y esto no justificaba la primera. Los editores viven en
  `core/formats/editable/` y no conocen Minecraft.
- **Lo que no se sabe editar sin riesgo se enseña, pero no se toca**: textos de varias líneas,
  listas con comentarios dentro, tablas en línea, anclas de YAML, `null`. Cada opción dice por qué
  y hay un botón «Abrir en el editor».
- **Un cambio que deja el mismo valor no escribe nada.** Si no, guardar reescribiría `1.6E7` como
  `16000000.0` o juntaría en una línea una lista de varias. Los enteros van como texto: Mekanism
  tiene `9223372036854775807`, que un `number` de JavaScript redondea.
- **Cómo se sabe dónde guarda cada uno**: se lee el descriptor de dentro del jar (lector de zip
  mínimo, sin descomprimirlo entero). Un plugin escribe en `plugins/<name>/` según su `plugin.yml`
  (EssentialsX-2.21.jar escribe en `plugins/Essentials/`). Un mod escribe en `config/` con su
  `modId` delante, y en Forge también en `<mundo>/serverconfig/` y `defaultconfigs/`. En el
  `mods.toml` solo cuentan los `modId` de `[[mods]]`: los de las dependencias (`forge`,
  `minecraft`) no son del jar.
- **Los ficheros `-client` no se enseñan**: en el servidor no hacen nada. Se dice cuántos hay.
- **Guardar exige el servidor parado** (mirar no): muchos plugins reescriben su configuración al
  cerrarse. Además se comprueba que el fichero no ha cambiado desde que se abrió (huella SHA-1), se
  deja una copia `.bak` y se escribe a un temporal que luego se renombra.
- **Un fichero que no es UTF-8 no se deja guardar**: al escribirlo de vuelta se estropearía.
- **Las rutas que llegan de la interfaz se limitan** a `plugins/`, `config/`, `defaultconfigs/` y
  `<mundo>/serverconfig/`. Sin eso se podría escribir cualquier fichero del equipo.

#### Cómo se probó

- Un banco de pruebas con **73 ficheros reales** (los de la tabla de arriba y la configuración de un
  servidor de Paper de la `e2e`). Por cada fichero se comprobó:
  - leer y escribir sin cambios deja los mismos bytes;
  - escribir cada opción con su propio valor no cambia nada;
  - cambiarlas todas a la vez se relee bien, sin perder un comentario, y los JSON siguen siendo
    válidos.

  Así salieron los casos de los enteros, las listas de varias líneas y la clave vacía de YAML con
  ejemplos comentados debajo (`nick-blacklist:` con `#- Notch`), que es una lista vacía y no un
  texto. El banco y las muestras están en `%LOCALAPPDATA%\qubiq-dev\ui\muestras-config`.
- El smoke, con esos casos y el jar real de HardcoreUtility.
- Un recorrido de interfaz (`plugins-config.mjs`) con esos ficheros reales puestos en plugins y mods
  de mentira. Cambia dos opciones de EssentialsX, guarda y comprueba que el fichero solo cambia en
  esas dos líneas y que queda el `.bak`.

**Lo que no se ha probado**: la ventana con un servidor arrancado de verdad (el aviso de «solo
mirar» y el botón de guardar deshabilitado se ven en el código, no en una captura), ni con un mod de
Fabric real.

---

### 19.21 NeoForge y servidores a medida

Dos peticiones del usuario juntas: poder crear servidores de **NeoForge** y poder **traer un
servidor que ya tiene** (un server pack de CurseForge, un modpack montado a mano) eligiendo con qué
archivo arranca, normalmente `run.bat`.

#### NeoForge

Casi gratis una vez hecho Forge, como se preveía en §15.1: mismo instalador con `--installServer`
y mismo `win_args.txt`. Lo común se sacó a `install/argfile.ts` sin cambiar el comportamiento de
Forge. Lo que sí es distinto es el catálogo (`versions/neoforge.ts`):

- **Su versión no lleva la de Minecraft delante**, se deduce, y cambió con el versionado por año
  de Mojang: `21.1.77` es de 1.21.1 y `21.0.167` de 1.21; `26.1.2.109` es de 26.1.2 y `26.2.0.88`
  de 26.2 (el tercer número a 0 no se escribe). Comprobado cruzando las 1.714 versiones publicadas
  con el manifiesto de Mojang.
- Publica **betas de cada versión nueva** antes de la primera estable (26.3 salió solo en beta), y
  algunas versiones se quedaron solo con betas (1.20.3, 1.21.2, 1.21.6...). Se ofrecen marcadas
  como en pruebas, igual que las alpha de Paper (§19.17), y hace falta `allowExperimental`.
- Trae experimentos del 1 de abril (`0.25w14craftmine.3-beta`) que no son de ninguna versión: se
  descartan solos al deducir la de Minecraft.
- El NeoForge de 1.20.1 se publicó con el nombre `forge`: no se ofrece (para esa versión está Forge),
  pero sí se reconoce al traer un servidor.

#### Servidores a medida

Decisiones del usuario: la carpeta **se mueve** a QubiQ (no se copia ni se usa donde está), y la
memoria la gestiona la app en `user_jvm_args.txt` cuando el script lo usa.

No es un tipo de servidor más: el manifiesto de Minecraft gana un campo opcional `custom`
(archivo de inicio, quién pone la memoria y, mientras no se ha terminado de traer, de dónde viene).
La distribución y la versión siguen ahí, reconocidas en la carpeta o corregidas por el usuario,
porque deciden el Java y si sale la pestaña de Mods o la de Plugins. Sin cambio de esquema: un
manifiesto sin `custom` es un servidor instalado por la app, como siempre.

| Decisión | Por qué |
|---|---|
| **Reconocer antes de traer** (`custom/inspect.ts`) | NeoForge y Forge por su carpeta en `libraries/`, un pack sin instalar por su instalador en la raíz, Fabric y Paper por el nombre del jar o `version_history.json`, y si no, la versión que dejó escrita el servidor en `logs/latest.log`. El usuario lo ve y lo puede corregir |
| **Carpetas que nunca se mueven** | Moverla es llevarse todo lo de dentro. Se rechazan la carpeta del usuario, las de sistema, las personales (Escritorio, Documentos, Descargas…), un disco entero, lo que ya es de QubiQ y una carpeta que no parezca un servidor (sin `server.properties`, `eula.txt` ni un inicio con mods o loader reconocible). El núcleo lo vuelve a mirar en `prepareCreate` |
| **Mover sin un solo momento sin servidor** (`custom/move.ts`) | En el mismo disco es un renombrado atómico. Entre discos se copia a `server.importando`, se comprueba que están todos los ficheros y bytes y solo entonces se pone en su sitio y se borra la original. Si falla algo, la original sigue intacta. Nunca encima de una carpeta con contenido |
| **El traslado va en `install`, no al crear** | Así tiene progreso y, si falla, el servidor queda en la lista pendiente de traer y se puede reintentar sin tocar nada del usuario. Si el traslado terminó y falló algo de después (bajar Java), el reintento no vuelve a mover |
| **Arrancar con cmd pero con el Java de la app** | El `run.bat` llama a `java` a secas. Se pone delante en el `PATH` el que toca a su versión de Minecraft, y `JAVA_HOME`. La `e2e` comprueba que el proceso que corre es ese |
| **Una copia sin `pause`** | El run.bat de Forge y NeoForge termina en `pause`. Sin consola, cmd se queda esperando una tecla y la app lo daría por arrancado para siempre. Se arranca `qubiq-run.bat`, junto al original (para que `%~dp0` siga valiendo), que no se toca |
| **Matar el árbol** (`LaunchSpec.killTree`) | El proceso que ve la app es cmd. `child.kill()` dejaría a Java vivo, con el puerto y el mundo abiertos. Solo al forzar el cierre: la parada normal sigue siendo `stop` por la entrada estándar, que cmd le pasa a Java |
| **Aviso si el script se reinicia solo** | Un `goto` hacia atrás vuelve a lanzar el servidor tras el `stop`, y Parar tiene que forzarlo al minuto. Se detecta y se avisa al elegirlo |
| **Memoria** | Si el script usa `user_jvm_args.txt` y no fija `-Xmx` él mismo, la app cambia solo las líneas de memoria y deja el resto (el recolector que eligió quien montó el pack). Si la fija el script, la app lo dice en vez de enseñar un control que no llega a ningún sitio. Un `.jar` la lleva en la línea de órdenes, como siempre |
| **Sin versiones** | Un servidor a medida no avisa de versiones nuevas ni deja cambiarla: la decide su modpack. Nueva capacidad `versions` (la tarjeta de versión solo informa) |

#### Trampas que costaron tiempo

- **`NoDefaultCurrentDirectoryInExePath`**. Con esa variable (la ponen equipos endurecidos, y la
  ponía el entorno de estas pruebas) cmd no busca en la carpeta actual y `run.bat` «no se reconoce
  como un comando interno o externo». Parecía un problema de comillas: hasta `shell: true` de Node
  fallaba igual. Se llama a `.\run.bat`. Las comillas van con `/d /s /c ""..." nogui"` y
  `windowsVerbatimArguments`, que es lo que hace Node por dentro.
- **`nogui`**. El run.bat de Forge y NeoForge no lo lleva, pero pasa sus argumentos (`%*`). Sin él,
  Minecraft abre su propia ventana además de la consola de la app.
- **La prueba de humo escribía en `C:\datos`**. Una sección de Satisfactory fijaba esa raíz para
  comprobar rutas y no la devolvía, así que todo lo de después escribía de verdad en `C:\datos`
  (desde v0.5.0). Se vio porque la prueba de mover carpetas encontró allí la de la vez anterior.
  Ahora la devuelve, y la sección de servidores a medida se niega a empezar si la raíz no es la
  temporal. Quedan en `C:\datos` restos de ejecuciones antiguas (`cache/` y
  `instances/config-plugins`), que no son del usuario.

#### Cómo se probó

- `npm run e2e -- neoforge` con NeoForge 26.2 de verdad: instalar, arrancar, parar, mundos, copias,
  mods y cambio de versión a 26.1.2 y vuelta. La comprobación de «el jar sigue en su sitio» daba por
  hecho `server.jar`; ahora en Forge y NeoForge mira el argfile de la versión nueva.
- `npm run e2e:custom` (nueva): server pack real de NeoForge 1.21.1 montado con su instalador fuera
  de QubiQ, traído, arrancado con su run.bat y parado; y un script con bucle, parado a la fuerza.
- Smoke: numeración y catálogo de NeoForge, análisis de scripts, copia sin pausas, memoria en
  `user_jvm_args.txt`, reconocer carpetas de cada tipo, carpetas prohibidas, mover y copiar.
- Recorrido de interfaz (`a-medida.mjs`): el paso de tipo con NeoForge y «Uno que ya tengo», el
  asistente de traer en los dos modos, el aviso del bucle, y después Ajustes (archivo de inicio) y
  Servidor (versión y detalles).
- Que Minecraft no empeora: `e2e paper`, `e2e forge` (26.2, con el instalador ya refactorizado) y
  `e2e:restart`, todo correcto. Una primera pasada de Forge falló en el ping (el servidor no contestó
  en los 4 s); coincidió con el recorrido de interfaz y una compilación en marcha, y ni se repitió en
  la segunda pasada ni pasa con el código anterior: es carga del equipo, no el cambio.

**Lo que no se ha probado**: traer entre dos discos de verdad (el camino de copia se prueba
directamente, sin renombrado de por medio), un server pack de CurseForge descargado de la web con
su propio instalador de arranque (ServerStarter y parecidos), un `.jar` como inicio con un servidor
real, y NeoForge con mods de verdad.

---

### 19.22 Project Zomboid (Fase 5)

Cuarto juego nuevo y el más parecido a Minecraft de toda la hoja de ruta: consola por la entrada
estándar, RCON, ficheros de texto editables y memoria de una JVM. Casi toda la gestión que ya
existía vale tal cual, así que el trabajo de la fase no fue inventar piezas nuevas, sino averiguar
**qué hace el servidor de verdad** y no prometer lo que no cumple.

A cambio trae la configuración más grande de la app: un `servertest.ini` de 144 claves y un
`servertest_SandboxVars.lua` de más de 300 opciones, los dos con las explicaciones que el propio
servidor escribe **en el idioma con el que se arrancó**.

#### Lo que se averiguó contra el servidor real

Todo con la Build 42.20 instalada de forma anónima, con el prototipo `pz-fase5.mjs` del material de
desarrollo. **Nada se anunció en ninguna lista**: los arranques fueron con `-Dzomboid.steam=0`.

| Hallazgo | Consecuencia |
|---|---|
| **Con Steam, el servidor sale en el navegador de servidores de Steam aunque `Public=false`.** Lo avisa su propio `.ini`: «los servidores habilitados para Steam siempre son visibles» | Decisión del usuario: **la app arranca sin Steam** (`-Dzomboid.steam=0`) y lo enciende solo quien lo pida, en modo avanzado y con el aviso delante. Crear un servidor no publica la dirección de nadie |
| **Sin Steam el servidor no contesta al A2S en ningún puerto** (probado en 16261 y 16262). Con Steam sí, y solo en el de juego | «¿Responde?» va por **RCON**, que contesta siempre. El A2S se usa solo cuando hay Steam, como en Valheim con `-public 1` |
| **Sin contraseña de RCON no hay RCON**: con la de serie (vacía) el puerto ni se abre (visto en netstat) | La app genera una al azar al crear el servidor. Sin ella no habría forma de saber quién está dentro ni de moderar |
| **RCON escucha en 0.0.0.0**, o sea, en toda la red local, y Zomboid **no deja elegir la dirección** (Factorio sí, con `--rcon-bind`) | La contraseña es larga y aleatoria, y ese puerto **no se lista nunca** entre los que hay que abrir en el router. Es lo único que se puede hacer |
| **Sin Steam solo se abre un puerto UDP**, el de juego. El segundo (`UDPPort`, el siguiente) está en su configuración y en todas las guías, pero no llega a escucharse | `serverPorts()` pide abrir uno, y dos solo con Steam encendido. Pedir abrir un puerto que no se usa es ruido con coste |
| **El servidor reescribe él mismo el `.ini` al arrancar**: conserva los valores, pero borra las claves que no son suyas y los comentarios que no ha puesto él | La app no guarda nada suyo ahí: edita las claves que gestiona sobre el fichero que hay. Da igual que `KeyValueFile` conserve lo desconocido, porque quien lo borra es el juego |
| **Pero acepta un `.ini` a medias y lo completa** con sus otras 130 claves y sus comentarios | Es lo que permite dejar el puerto y el RCON puestos **antes** del primer arranque. Sin eso, ese arranque usaría siempre el 16261, que es justo cuando más fácil es chocar con otro servidor |
| **El `SandboxVars.lua` sí se respeta entero**: 738 comentarios intactos tras arrancar y parar, con los valores cambiados aplicados | Las reglas de la partida se pueden editar opción a opción sin destrozar el fichero |
| **`-adminpassword` evita el plantón del primer arranque.** Sin él, el servidor se queda esperando en la consola a que alguien escriba la contraseña | Estaba en la investigación como «a confirmar»: confirmado |
| **`UPnP=true` puede colgar el arranque.** Lo dice el propio servidor: «If the server hangs here, set UPnP=false» | La app lo deja apagado. De abrir puertos ya se encarga la pantalla de conexión, que además explica lo que implica |
| **Ocupa 6,7 GB**, no los 3 y pico que se le suponían: lo dice su propio `appmanifest_380870.acf` (`SizeOnDisk` = 7.163.388.553), y son casi todo `media/` | La ficha del selector de juego lo dice medido, no estimado. Es el segundo más gordo después de Satisfactory |
| **El primer arranque tarda ~85 s** (genera el mundo) y los siguientes ~35 s. Parar con `quit` guarda y cierra en 8-11 s | El asistente lo dice antes de empezar, y el plazo de gracia de la parada es de 180 s |
| **Project Zomboid no arranca si llega a su carpeta por un enlace** (`mklink /J`): se cae generando el mundo porque no carga su Lua de servidor («attempted index: biomes of non-table»). Con la ruta real arranca en 39 s; con la misma carpeta enlazada se cae a los 23 s | Se lleva por delante el truco que usan las pruebas de Valheim y Satisfactory para no descargar. La `e2e:zomboid` guarda una **copia de verdad** y la **mueve** dentro de la instancia, que en el mismo disco es instantáneo |
| El `players` de RCON contesta `Players connected (0): \n`; `changeoption MaxPlayers 9` contesta «Option : MaxPlayers is now : 9» y lo guarda él mismo; `save` contesta «World saved» | De ahí salen los jugadores, los ajustes en caliente y la copia en caliente |
| **`save` contesta «World saved» ANTES de terminar de escribir.** La copia hecha justo después falla con un `tar.exe: (null)` que no dice nada: los ficheros de la partida cambian de tamaño mientras se leen | La copia en caliente espera a que la carpeta de la partida **deje de moverse** (mismo número de ficheros, mismo tamaño y misma fecha dos veces seguidas), en vez de fiarse de la respuesta. De paso, `runTar` ya no se traga ese «(null)»: añade lo que diga por la salida normal y el código de salida |
| **Por RCON, una razón de veto de más de una palabra no funciona.** `banuser fulano -r dupear items` contesta con la **ayuda del comando** y no veta a nadie, aunque ese mismo ejemplo esté en su ayuda; con una sola palabra sí veta. Y **las comillas rompen los comandos**: `banuser "fulano" -r motivo` contesta «This user can't be banned» | La razón se manda en una palabra (los espacios pasan a guiones) y los nombres van sin comillas. Y cada respuesta se mira: el servidor **no falla** cuando no entiende una orden, contesta con su ayuda y se queda tan ancho, así que sin mirarla la app diría que ha vetado a alguien que sigue jugando |
| Las cuentas viven en un **SQLite** (`db/servertest.db`): tabla `whitelist` con usuario, contraseña cifrada y rol, y `role` con los siete niveles (`banned`, `user`, `priority`, `observer`, `gm`, `moderator`, `admin`). Los vetos por IP van aparte, en `bannedip` | Se lee con `node:sqlite` en solo lectura, así que la pantalla enseña quién es quién **esté el servidor como esté**. Cambiar algo va siempre por RCON: la base de datos es del servidor |

**El aislamiento, que es lo de siempre.** Por defecto Zomboid escribe en `%USERPROFILE%\Zomboid`, la
misma carpeta donde el usuario tiene sus partidas de un jugador. Con `-Duser.home` y `-cachedir` todo
queda dentro de la instancia (`server/datos/Zomboid`). Es la tercera vez que aparece esta trampa,
después de Valheim y Satisfactory, y la `e2e` mira esa carpeta antes y después de cada ejecución.

#### Decisiones

- **Steam apagado por defecto** (decisión del usuario). Sin él no hay VAC ni se entra desde la lista
  de amigos, y se entra escribiendo la dirección; a cambio, el servidor no aparece en ninguna lista.
  Encenderlo está en modo avanzado, con lo que implica escrito al lado.
- **El primer arranque forma parte de la instalación** (decisión del usuario). Los ficheros de
  configuración los escribe el servidor, con sus explicaciones: escribirlos la app sería inventarse
  su contenido y dejar el editor avanzado enseñando opciones sin una línea que las explique. Cuesta
  minuto y medio, una vez.
- **El nombre de la partida no se elige:** siempre `servertest`. Es a la vez el nombre de la carpeta
  de guardado, el prefijo de los ficheros de configuración y el de la base de datos; dejarlo en el de
  siempre hace que cualquier guía de internet valga tal cual para los ficheros de este servidor.
- **La dificultad son los preajustes del propio juego** (Alzamiento, Superviviente, Apocalipsis,
  Brote, 6 meses después y Extinción), con los nombres y las descripciones que les da Zomboid en
  español. No se copian encima del `SandboxVars.lua`: se leen sus valores y se escriben **sobre** el
  fichero comentado, que es lo que hace que después se pueda editar opción a opción.
- **Seis reglas en el modo básico y las trescientas en avanzado.** Las seis son claves reales del
  fichero y sus valores son los que el juego acepta; el smoke lo comprueba contra el
  `SandboxVars.lua` real, así que si una actualización les cambia el nombre, salta.
- **Moderar exige el servidor arrancado, y se dice.** No hay listas de texto (Valheim) ni ficheros
  JSON (Factorio): hay una base de datos que el servidor tiene abierta. Ver quién es quién se puede
  siempre; cambiarlo, no.

#### Piezas nuevas del núcleo

| Pieza | Dónde | Para qué |
|---|---|---|
| **Editor de tablas Lua** | `core/formats/editable/lua.ts` | El quinto formato de `editable/`, junto a YAML, TOML, JSON y `.properties`. Saca de los comentarios del juego la explicación, los límites, el valor por defecto y **el nombre de cada valor** («4 = Normal»), así que la pantalla enseña lo mismo que el menú de Zomboid. ⚠ Los números vienen con **coma decimal**, porque el servidor los escribe en su idioma |
| `ConfigOption.allowedLabels` | `shared/editableConfig.ts` | Cómo se llama cada valor admitido. Sin esto se enseñaría un número pelado donde el juego enseña una palabra |
| **Buscador de ajustes** | `GameUi.ConfigSearch`, `games/zomboid/ConfigSearch.tsx` | Zomboid reparte **414 opciones entre dos ficheros**, y quien busca «refugio» no tiene por qué saber en cuál vive: hay 1 en las reglas de la partida y 13 en los ajustes del servidor. La barra va encima de las pestañas, busca por nombre y por la explicación del juego, agrupa por origen y deja editar y guardar los dos a la vez (cada uno con su regla: el `.ini` en caliente, las reglas solo con el servidor parado). Es el único juego que lo pone; los demás tienen pocos ajustes |
| `LiveStatus.players` | `core/games/types.ts` | La lista entera de quién está dentro, no un cambio. La estrena Zomboid, que la da completa por RCON cada vez que se le pregunta; el supervisor la hace mandar sobre la que se venía armando con el registro. Con el registro bastaba perder una línea para que la lista quedara mal hasta el siguiente arranque |

#### Los mods: el taller de Steam

Entraron después de dar la fase por hecha, al cambiar la regla de la hoja de ruta: **una fase no
termina si el juego se queda sin su forma de añadir contenido**. Y hubo suerte, porque el camino
resultó mejor de lo que pintaba.

| Hallazgo | Consecuencia |
|---|---|
| **El taller se descarga sin cuenta.** `steamcmd +login anonymous +workshop_download_item 108600 <id>` baja el mod y ya está (probado con uno real) | Al revés que Factorio, aquí no hay que pedirle la cuenta de Steam al usuario. La app lo hace sola |
| **El taller cuelga del JUEGO (108600), no del servidor dedicado** (380870) | Pedir los objetos del 380870 no devuelve nada |
| **SteamCMD sale con código 0 aunque la descarga falle** (comprobado con un id inexistente y con uno de otro juego; solo el id con letras dio 10) | `interpretWorkshop` lee la salida, no el código. Los tres errores están grabados en `fixtures/steam/zomboid-workshop.txt` |
| **La Build 42 exige la carpeta de versión dentro del mod.** Un mod con el `mod.info` y el `media/` en la raíz **no se encuentra**: el servidor solo escribe «required mod not found» en una línea perdida | La app mira las carpetas de cada mod y **avisa antes**, en vez de dejar que el servidor calle |
| **Y la regla no es «la más alta que no pase»: manda la serie mayor.** Medido con mods de mentira en un servidor 42.20.4: `41` **no** carga, `43` **no** carga, `42` y `42.20` sí, y con `42` y `42.20` a la vez cogió **la 42**. `common` vale siempre | `bestVersion()` hace exactamente eso. Sin medirlo, la app habría dado por bueno un mod de la Build 41 |
| Un objeto del taller **puede traer varios mods** (`mods/<Nombre>/…`), y lo que va en `Mods=` es el `id` del `mod.info` de cada uno, no el número del taller | El manifiesto guarda el objeto pedido y las carpetas que dejó; los identificadores se leen del disco |
| La API `GetPublishedFileDetails` de Steam **no pide clave**: da título, juego, tamaño y fecha de la última actualización | La app enseña el nombre antes de descargar, rechaza un mod de otro juego sin bajarlo y sabe cuándo su autor lo ha tocado |
| `Map=` es una tercera lista aparte, y **el mapa del juego va el último** | La app la rellena sola: sin eso, añadir un mapa es editar tres claves a mano y equivocarse en el orden |
| Con el servidor sin Steam, `WorkshopItems=` **se deja vacío a propósito** | Esa clave es para que el servidor se los baje él por Steam. Aquí ya están copiados en `Zomboid/mods` |

**Lo que no se puede arreglar y se dice:** sin Steam, **los jugadores tienen que suscribirse ellos
mismos** a los mismos mods en el taller. El servidor no puede pasárselos. La pantalla de mods lo
avisa junto al botón de añadir.

**Lo que no se ha probado:** que un cliente entre a jugar con mods (haría falta el juego comprado), y
mods con dependencias entre ellos de verdad —la app las lee del `mod.info` y avisa de las que
falten, pero no se ha visto el caso con mods reales—.

#### Cómo se ha comprobado

- **`npm run smoke`**: 774 correctas, 0 fallidas. Las de Zomboid van contra sus ficheros reales:
  la línea de órdenes (con el aislamiento como comprobación principal), las claves que gestiona la
  app, su registro, el editor del `.ini` y el del `SandboxVars.lua` (ida y vuelta byte a byte,
  límites con coma decimal, nombres de los valores), aplicar un preajuste sobre el fichero
  comentado, y que **las seis reglas del modo básico existan de verdad en el juego con esos
  valores**: si una actualización les cambia el nombre, salta aquí.
- **`npm run e2e:zomboid`**: completa y en verde con el servidor real, sin Steam. Instalar, primer
  arranque que escribe la configuración y genera el mundo, el puerto de juego abierto y **el segundo
  no**, jugadores por RCON, ajustes en caliente, cuentas y niveles de acceso, reglas de la partida
  solo con el servidor parado, copia en caliente, parada con `quit` en 10 s, **un mod real del taller
  descargado, cargado por el servidor, apagado y quitado**, restauración y —lo que más importa— que
  `%USERPROFILE%\Zomboid` no ha cambiado.
- **`npm run typecheck`**, **`npm run e2e paper`** y **`npm run e2e:restart`** en verde: Minecraft no
  ha empeorado.
- **Recorrido de interfaz** (Playwright, datos aislados): el selector con los cinco juegos, el
  asistente básico paso a paso —incluidas las tres formas de rechazar una contraseña de
  administrador—, el avanzado con la casilla de Steam apagada, y las pantallas de un servidor ya
  creado con los ficheros de configuración reales. Sin un solo error de consola. De ahí salieron dos
  arreglos: **dos pestañas se llamaban «Servidor»** y el desplegable de nivel de acceso se comía el
  nombre del jugador.

#### Lo que no se ha podido comprobar

- **Las líneas de entrada y salida de jugadores.** Hacen falta dos clientes del juego conectándose de
  verdad. Están reconstruidas a partir de las cadenas del ejecutable y marcadas como sintéticas en
  `fixtures/zomboid/sinteticas.txt`. **No deciden nada**: quién está dentro se le pregunta al
  servidor por RCON, que es exacto y no depende de que el formato del registro no cambie.
- **El A2S con Steam encendido** en este servidor: la grabación que se usa es la de la fase 1, hecha
  con Steam. Volver a grabarlo exigiría publicar el servidor del usuario, y no hace falta.
- **Entrar a jugar de verdad**, que exige tener el juego comprado.

---

### 19.23 Los mods de Satisfactory y Valheim (deuda de las fases 2 y 3)

Las fases 2 y 3 se cerraron antes de que la plantilla dijera que un juego **no está hecho hasta que
se puede ampliar como lo amplía la gente**. Esto salda esa deuda: Satisfactory con ficsit.app y
Valheim con Thunderstore, los dos con la misma forma —un cargador que el juego base no trae y un
catálogo con buscador— y por eso con piezas compartidas.

Es el tercer modelo de mods de la app, y los cuatro juegos que los tienen no se parecen:

| Juego | De dónde salen | Cargador | Cómo se pide |
|---|---|---|---|
| Project Zomboid | Taller de Steam | ninguno | pegando el enlace (no hay buscador fuera de Steam) |
| Factorio | Portal oficial | ninguno | buscador, pero **hay que identificarse** para descargar |
| **Satisfactory** | **ficsit.app** | **SML** | **buscador libre, descarga libre** |
| **Valheim** | **Thunderstore** | **BepInEx** | **buscador libre, descarga libre** |

#### Lo que se averiguó contra los servidores reales

Todo con los servidores de verdad del material de desarrollo, sin publicar nada en ninguna lista
(Satisfactory no se anuncia, y Valheim se arrancó con `-public 0`). Los prototipos, en
`%LOCALAPPDATA%\qubiq-dev`.

**Satisfactory (ficsit.app):**

| Hallazgo | Consecuencia |
|---|---|
| **El zip de ficsit ES la carpeta del mod**: en su raíz está el `.uplugin`, y dentro `Binaries/Win64` y `Content/Paks/WindowsServer` | Se descomprime tal cual en `FactoryGame/Mods/<referencia>/`. No hay que adivinar nada |
| **Cada versión publica varias «dianas»**: `Windows` (el juego), `WindowsServer` y `LinuxServer`. **Hay mods que solo publican la de cliente** (DifficultyTuner) | Un servidor necesita `WindowsServer`. El buscador marca los que no la tienen como «Solo cliente» y no deja instalarlos, en vez de bajar 20 MB para nada |
| **El servidor los carga sin tocar la línea de órdenes.** Comprobado arrancando el servidor real con SML 3.12.0 y SnapOn 1.3.1 dentro de `FactoryGame/Mods` | Instalar un mod no cambia cómo se arranca |
| **SML escribe en el registro la lista de lo que ha cargado**: `LogSatisfactoryModLoader: Display: SML: 3.12.0`, y después un mod por línea | Es lo único que demuestra que están puestos, así que sale traducido en la consola («Mod cargado: SnapOn 1.3.1») en vez de esconderse con el ruido del motor. ⚠ En esa lista SML **cuenta también el juego base** (`FactoryGame: 502094.0.0`), que no se enseña: no es un mod que el usuario haya puesto |
| **SML guarda su configuración en `FactoryGame/Configs`**, dentro de la carpeta del juego y **no** bajo `-UserDir` | Esa carpeta entra en las copias de seguridad: son ajustes que el usuario ha tocado y que reinstalar el mod no devuelve |
| **`resolveModVersions` resuelve los rangos de semver** (`^3.12.0`) en el servidor. Lo que **no** hace es elegir: con un rango ancho (`>=0.0.0`) devuelve **todas** las que valen y **sin ordenar** | La app no necesita un intérprete de semver, pero sí ordenar ella. Si esto cambiara y devolviera una sola, la app seguiría funcionando; si dejara de resolver rangos, el smoke lo dice |
| **Las dependencias no se resuelven solas**: esa consulta contesta solo por lo que se le pregunta | Se recorren a mano, en anchura y con tope. Es lo que evita instalar un mod y que el servidor no arranque por una biblioteca que faltaba |
| El catálogo publica **sha256 de cada fichero** | Toda descarga se verifica, como el resto de la app |
| ⚠ **Ordenar por popularidad pisa la relevancia.** Buscando «snapon» con `order_by:popularity` ese mod sale **el quinto**, detrás de cuatro que no se llaman así; con `order_by:search` sale el primero. Salió del recorrido de interfaz, no de las pruebas | Con texto se ordena por relevancia y con la caja vacía por popularidad, que es lo que sirve a quien no sabe qué buscar. El smoke fija que lo buscado por su nombre salga **el primero**, no solo que aparezca |

**Valheim (Thunderstore + BepInEx):**

| Hallazgo | Consecuencia |
|---|---|
| **BepInEx se engancha con el `winhttp.dll` que se deja junto a `valheim_server.exe`.** En Windows no hace falta ni cambiar la línea de órdenes ni usar el `start_server_bepinex.sh` del paquete | Instalar el cargador es volcar el contenido de `BepInExPack_Valheim/` en la raíz del servidor. Arrancar sigue siendo exactamente igual |
| **No hay que tocarle la configuración.** Se dio por hecho que habría que apagarle la consola (`[Logging.Console] Enabled = true` viene de fábrica) porque parecía que robaría la salida del proceso. **Medido: es al revés.** Con la consola encendida sus mensajes **llegan a la consola de la app** y la salida del juego sigue llegando igual | El `BepInEx.cfg` se deja como viene. La ventana negra que se temía no existe: el `conhost.exe` que nace es de Valheim y sale igual sin cargador (comprobado arrancando con y sin `winhttp.dll`), y no tiene ventana (`MainWindowHandle = 0`) |
| **La parada limpia sobrevive al cargador.** Ctrl+Break sigue guardando el mundo y saliendo con código 0 con BepInEx puesto | Era lo único que no se podía perder: en Valheim la parada limpia es lo que guarda la partida |
| **El chainloader —el que dice qué mods ha cargado— NO escribe por la consola.** Por la tubería del proceso solo llegan las líneas del preloader; `Loading [PlantEverything 1.21.2]` está solo en `BepInEx/LogOutput.log` | La pestaña de mods **lee ese fichero** y enseña qué cargó el último arranque. Sin eso, un mod que no cargue no se nota hasta que alguien lo echa de menos dentro del juego |
| ⚠ **Ese registro recoge también el del juego**, y un servidor sin pantalla escribe de serie quince errores de vídeo y de shaders | Solo se cuentan como problemas los errores **del cargador y de los mods**, nunca los de `Unity Log`. Lo contrario sería alarmar por lo que siempre ha estado ahí (pasó: la primera versión del e2e falló por eso) |
| ⚠ **BepInEx se cae si la carpeta del servidor está muy metida en el disco.** Carga las bibliotecas de Unity con las API de Mono, que se quedan en los 260 caracteres de Windows: con una ruta larga contesta `Could not run preloader!` y **el servidor arranca sin un solo mod**. El mismo servidor, movido a una ruta corta, carga perfectamente | Se mide **antes** de instalar nada, con el fichero más hondo que trae el juego, y se explica en vez de dejar un servidor que arranca bien y no hace nada |
| **Los paquetes vienen de tres formas**: el `.dll` suelto en la raíz (PlantEverything), dentro de un `plugins/` (Jotunn) o con un `BepInEx/` entero | Un mapa decide dónde va cada fichero. ⚠ La **configuración va suelta** en `BepInEx/config`, sin carpeta propia: cada mod la busca por su nombre de fichero, y metida en una subcarpeta arrancaría con los valores de fábrica sin decir nada |
| **El buscador de Thunderstore va por `q=`, no por `search=`.** Con `search=` la API contesta 200 y devuelve el catálogo entero, como si no se hubiera filtrado | Es un fallo invisible: el usuario vería siempre los mismos mods buscara lo que buscara. El smoke lo comprueba buscando algo concreto y mirando que salga |
| **Thunderstore no publica hash de sus ficheros** | No hay nada que comprobar contra el catálogo, así que se comprueba contra el contenido: un paquete que no se descomprime o que no trae `manifest.json` se rechaza sin tocar el servidor |
| **Las dependencias vienen con la versión clavada** (`denikson-BepInExPack_Valheim-5.4.2350`), no con un rango | No hay nada que resolver: se pide esa. ⚠ Separarlas por el último guion rompería los nombres que llevan guiones (`Azumatt-AzuAntiDrift`): la versión son siempre tres números |

#### Decisiones

- **Una sola pantalla para los dos juegos** (`CatalogModsPanel`). Es la misma pregunta —qué hay
  puesto, qué falta para que funcione y qué más se puede poner—, y lo que cambia (el nombre del
  catálogo, lo que necesitan los jugadores, los ejemplos de búsqueda) entra por parámetros. Zomboid y
  Factorio **no** se han metido ahí: uno va por enlaces del taller y el otro pide cuenta para
  descargar, y forzarlos a este molde habría sido peor para los cuatro.
- **El cargador se instala solo, con el primer mod.** Es una pieza técnica que el usuario no ha
  pedido y sin la cual no hay mods; pedírsela aparte sería un paso que solo puede salir mal. Se
  puede quitar, pero solo cuando no queda ningún mod: sin cargador, los que hubiera se quedarían en
  el disco sin cargarse y sin decir por qué.
- **Apagar un mod no es renombrarlo.** Los dos cargadores buscan por contenido —BepInEx recorre
  `plugins/` entero buscando `.dll` y el servidor de Satisfactory mira todas las carpetas de `Mods`—,
  así que un mod apagado sale de ahí y espera en la carpeta de la instancia (`mods-apagados/`), fuera
  de la del servidor. Volver a encenderlo no cuesta otra descarga.
- **Las dependencias se instalan y se dicen.** Se resuelven antes de descargar nada y, al terminar,
  la pantalla nombra las que han entrado de paso: una lista que crece sola sin explicación es peor
  que no tenerla.
- **Nada se actualiza solo.** Un mod nuevo a mitad de partida puede dejarla sin poder cargarse, así
  que hay un botón de buscar actualizaciones y actualizar es siempre decisión del usuario. Antes de
  cada actualización se guarda una copia.
- **Se dice lo que tienen que hacer los jugadores, y no es lo mismo en los dos juegos.**
  Satisfactory **comprueba los mods al entrar** y deja fuera a quien no los tenga; Valheim deja
  entrar igual, pero el juego se le portará mal. Las dos frases están en su pantalla.
- **Los mods son de la comunidad, no del estudio ni de la app**, y la pantalla lo dice con el
  catálogo nombrado.

#### Piezas nuevas

| Pieza | Dónde | Para qué |
|---|---|---|
| Tipos de mods con catálogo | `shared/games/mods.ts` | `ModRef`, `ModEntry`, `ModCatalogItem`, `ModLoaderInfo`, `ModsView`. Lo que de verdad es igual en los dos juegos, no un molde para los cuatro |
| Reparto de ficheros | `core/games/modFiles.ts` | Descomprimir, repartir por la carpeta del servidor y **apuntar qué rutas son de cada mod**, que es lo que permite quitarlo o apartarlo después. Los dos juegos reparten los ficheros de un mod por varias carpetas |
| `ModLoaderInfo.lastRun` | `shared/games/mods.ts` | Qué cargó el cargador la última vez. Lo aporta Valheim, cuyo chainloader no lo cuenta por la consola; SML sí y no lo necesita |
| Pantalla común de mods | `renderer/src/CatalogModsPanel.tsx` | La pestaña de los dos juegos |
| `mods.ts` de cada juego | `core/games/satisfactory/mods.ts`, `core/games/valheim/mods.ts` | Hablar con ficsit.app y con Thunderstore, y colocar lo que llega donde cada servidor lo busca |

#### Cómo se ha comprobado

- **`npm run smoke`**: 26 comprobaciones nuevas contra grabaciones reales (el `.uplugin` de SML, el
  registro de SML del servidor real y el `LogOutput.log` de BepInEx) y dos secciones de contrato
  contra las APIs de verdad, que avisan si ficsit o Thunderstore cambian. 841 correctas, 0 fallidas.
- **`npm run e2e:satisfactory`**: instala SnapOn con su cargador en el servidor real, **arranca y
  comprueba que SML dice en el registro que lo ha cargado**, para limpio, lo apaga, lo enciende y lo
  quita. Todo correcto.
- **`npm run e2e:valheim`**: lo mismo con PlantEverything y BepInEx, más la comprobación que no se
  puede perder: **que la parada con Ctrl+Break sigue guardando el mundo con el cargador puesto**.
  Todo correcto.
- Las dos pruebas dejan la instalación compartida **como vino de Steam** (se borran `FactoryGame/Mods`,
  `FactoryGame/Configs`, `BepInEx/`, `winhttp.dll` y los `preloader_*.log`), y siguen comprobando que
  no se ha tocado la carpeta del juego del usuario.
- **Recorrido de interfaz** (`ui/mods-panel.mjs`, capturas 290-291): la pestaña de los dos juegos, con
  una búsqueda de verdad en cada catálogo, sin un solo error de consola. De ahí salieron tres
  arreglos que las pruebas no podían ver: el orden del buscador de ficsit, un `<strong>` dentro de un
  aviso que lo partía en tres líneas (`.alert strong` es de bloque) y una nota con `.help` suelta en
  una tarjeta, que sale a tamaño normal en vez de pequeña. Las tres son trampas que ya estaban
  escritas en el README.

#### Lo que no se ha podido comprobar

- **Entrar a jugar con mods** desde un cliente de verdad, que exige tener los dos juegos comprados y
  una segunda máquina. Lo que sí está comprobado es que el servidor los carga y lo dice.
- **Un mod con dependencias de verdad** en el servidor real: los dos de la prueba solo dependen de su
  cargador. La resolución de dependencias está comprobada contra las dos APIs (Refined Power arrastra
  cuatro), pero no instalada de punta a punta.
- **Actualizar un mod** sobre un servidor real: se prueba el camino (quitar lo anterior, poner lo
  nuevo, copia previa), pero haría falta esperar a que un autor publique una versión.

---

### 19.24 Enshrouded (Fase 6)

Quinto juego nuevo, y el más cómodo de todos los de Steam: un solo puerto UDP, toda la
configuración en un JSON, arranque en tres segundos, parada en medio, y los guardados ya salen
dentro de la carpeta del servidor sin tener que pelearse con ninguna carpeta del usuario —la trampa
que aparecía en Valheim, Satisfactory y Project Zomboid aquí no existe—.

A cambio trae dos problemas que no tiene ningún otro juego de la app: **no se puede dejar de
publicar** y **el propio fabricante documenta mal su fichero de configuración**.

#### Lo que se averiguó contra el servidor real

Todo con la versión 0.9.0.0 (build `b466cef1500d760b8ba3dda230001923c40d0e12`) instalada de forma
anónima, con el prototipo `ens-fase6.mjs` del material de desarrollo. **El usuario autorizó
expresamente arrancarlo**, porque en este juego arrancar es publicarse.

| Hallazgo | Consecuencia |
|---|---|
| **Enshrouded no tiene «no publicar».** No hay `-public 0` ni casilla: en cuanto arranca se conecta a Steam, se registra y sale en la lista de servidores del juego. Su propio registro escribe `[online] Public ipv4: …` con la IP de casa | Es el caso de Rust, no el de Valheim. Se dice en la tarjeta del selector de juego (etiqueta de aviso), en el paso de conexión del asistente y en el asistente avanzado, **antes** de crear nada. Lo único que impide que entre cualquiera son las contraseñas de los roles, así que los cuatro nacen con una |
| **Y escribe la IP pública en el registro.** Igual que Valheim con crossplay | `parseLine` la esconde y se la borra **hasta al texto que guarda**, con esa regla la primera de todas. El smoke lo comprueba contra el registro real |
| **«Listo» es `[Session] finished transition from 'Lobby' to 'Host_Online'`**, y llega en 2-4 s | Es el juego que antes arranca de toda la app |
| **Ctrl+Break funciona y es rapidísimo**: escribe `Trigger gameflow shutdown, exit: Ctrl_Break`, guarda (`[server] Saved`) y sale con código 0 en medio segundo | La vía de la fase 1 vale tal cual, como se preveía |
| **Pero solo cuando ya está listo.** Mandado durante el arranque, el proceso muere con `0xC000013A` (3221225786) sin guardar: todavía no tiene manejador puesto | El `retryEveryMs` de Valheim también hace falta aquí, y `diagnoseExit` traduce ese código concreto en vez de soltar un número |
| **Un solo puerto UDP**, el que diga `queryPort`. Medido con `netstat` lanzándolo en el 15650: abre ese y ninguno más (el siguiente no) | `serverPorts()` pide abrir uno. La guía del router y la de playit salen con uno solo |
| **La consulta de Steam contesta siempre** y solo en ese puerto | De ahí salen «¿responde?» y cuántos jugadores hay (`poll`), que es exacto y no depende de que no cambie el formato del registro. Grabada en `fixtures/enshrouded/a2s.json` |
| **El servidor reescribe su `enshrouded_server.json` al arrancar**: conserva lo que entiende, completa lo que falta con sus valores de serie y **borra las claves que no conoce** (probado metiéndole una inventada) | La app no guarda nada suyo ahí: el manifiesto manda y el fichero se genera en cada arranque |
| **Pero hay algo que escribe él y la app no sabe: los vetados.** Se ponen desde dentro del juego | Antes de generar el fichero **se lee el que haya y se conserva su lista de vetados**. Sin eso, arrancar el servidor borraría los vetos puestos jugando |
| **Arranca por un enlace de directorio** (`mklink /J`), al revés que Project Zomboid | La `e2e:enshrouded` puede enlazar la instalación compartida en vez de copiar 8,8 GB, como hacen las de Valheim y Satisfactory |
| **Guarda solo cada 5 minutos**, medido dejándolo arrancado un cuarto de hora: guardados a los 303 s y a los 603 s | La copia en caliente espera a uno, como en Valheim, y después a que la carpeta **deje de moverse**, que es la lección de Zomboid: el aviso de guardado llega antes de que los ficheros terminen de escribirse, y copiar ahí da un `tar.exe: (null)` que no explica nada |

#### La trampa de la fase: un preajuste que ignora los ajustes

Estaba en la investigación como «si `gameSettingsPreset` no es `Custom`, el servidor ignora en
silencio los valores de `gameSettings`». **Confirmado, y es peor de lo que parecía**: el fichero se
queda con los valores puestos, así que mirándolo parece que están aplicados.

Se midió arrancando tres veces con el mismo `gameSettings` (`playerHealthFactor: 2`,
`enableStarvingDebuff: true`, `curseModifier: "Easy"`) y cambiando solo el preajuste:

| `gameSettingsPreset` | Lo que aplica el servidor |
|---|---|
| `"Default"` | `1`, `false`, `"Normal"` — **los ignora** |
| `"Custom"` | `40000000` (= 2), `true`, `"Easy"` — los aplica |
| `"Hard"` | los del preajuste, no los del fichero |

Por eso la app **pone `Custom` ella misma** en cuanto un ajuste se aparta del preajuste, y lo hace en
el servicio y no solo al escribir el fichero, para que lo que enseña la pantalla y lo que se aplica
no puedan divergir. La pantalla lo avisa antes de guardar, y el mensaje al guardar lo explica.

**Y de aquí salió el mejor hallazgo de la fase**: el servidor **vuelca por consola los ajustes que
de verdad aplica** (`[server] Game Settings 'Hard'` y un JSON detrás). Con eso:

- se pudieron **medir los cuatro preajustes** arrancándolo una vez con cada uno, en vez de copiar sus
  valores de una wiki. Están en `EFFECTIVE_PRESETS` y el smoke los compara ajuste a ajuste contra la
  grabación: si Keen cambia lo que hace «Difícil», salta;
- la app puede **partir de los valores reales de un preajuste** cuando el usuario pasa a «A mi
  manera», en vez de dejarle los de Normal y que la partida cambie sin avisar;
- la consola traduce esa línea a «Dificultad en uso: Custom», que es la forma de ver desde fuera que
  lo que se tocó se está aplicando.

Los decimales salen en **hexadecimal IEEE-754** cuando no son exactos (`3fc00000` = 1,5) y las
duraciones son objetos `{value}` en nanosegundos.

#### El fabricante documenta mal su propio fichero

El `enshrouded_server_readme.txt` que viene con el servidor dice que la lista de vetados se llama
`bans` y que cada entrada lleva `accountIDHash` (una cadena) y `banDate` (un número). **Nada de eso
es verdad en el servidor real.** Metiéndole las dos formas a la vez y arrancándolo:

```
bannedAccounts -> [{"accountId":0,"displayName":"alguien","characterName":"Alguien","banDate":{"value":1790341348}}]
bans           -> undefined
```

La clave es `bannedAccounts`, el identificador es `accountId` **y es un número**, y la fecha va
dentro de un objeto. Con los nombres del README, el servidor borra la lista entera al reescribir el
fichero y la moderación no haría absolutamente nada, sin un solo mensaje. El smoke tiene una
comprobación dedicada a que se escriba `bannedAccounts` y **no** `bans`.

Las dos reglas de los roles salen del mismo sitio —de las cadenas del ejecutable, no del README—:
`Only one user group can be without password` y `user groups passwords must be unique`. El servidor
las trata como error interno, así que las corta la app antes de crear nada.

#### Decisiones

- **Los cuatro roles nacen con contraseña**, también los dos que el asistente básico no pregunta. Un
  rol sin contraseña es al que va a parar quien entre sin escribir ninguna, y como este juego se
  anuncia siempre, eso sería dejar el servidor abierto a quien pase por ahí. Quien lo quiera así
  puede vaciar la contraseña en Configuración → Roles, con el aviso al lado.
- **El asistente básico pregunta dos contraseñas, no una.** Es la pregunta rara de este juego y no
  se puede esconder: en Enshrouded no hay contraseña del servidor, hay una por rol, y la que usas
  decide lo que puedes hacer dentro. Se preguntan las dos que importan (Administrador y Amigo) ya
  rellenas con una sorteada; las otras dos, en avanzado.
- **Se añade la pestaña Mundos**, que no estaba en el plan, por el mismo motivo que en Valheim:
  cambiar de mundo es cambiar una carpeta y ya estaba servido. Con una diferencia que se dice en
  pantalla: aquí el nombre **no decide el terreno**, porque Enshrouded tiene un mapa hecho a mano.
- **Los jugadores se cuentan, no se listan.** El registro tiene líneas de entrada y salida
  (`[online] Added peer`, `[server] Player '…' logged in with Permissions`), pero no se han podido
  grabar con clientes reales, así que no deciden nada: cuántos hay se le pregunta al servidor por su
  consulta de Steam. Las capacidades declaran `playerIds: false` y `playerNames: false`, y la
  pantalla cuenta en vez de listar, como en Satisfactory.
- **Moderar es quitar vetos, y nada más.** Lo dice el propio ejecutable: `Dedicated server kick not
  implemented`. Echar y vetar se hacen **desde dentro del juego** con la contraseña de
  Administrador, en la pestaña Social. La pantalla de Vetados lo explica en vez de enseñar botones
  que no funcionarían, y sí deja quitar un veto, que es lo único que se puede hacer desde fuera.

**El icono ya estaba dibujado** desde la fase 0 (linterna sobre niebla, violeta; §13.1): esta fase
solo lo importa en `enshroudedUi.icon`, y el componente común lo coloca solo en el selector de
juego, la lista de servidores y las cabeceras.

#### Los mods: era la incógnita, y sí hay forma

La hoja de ruta lo dejaba abierto: «si al mirarlo resulta que no hay ninguna forma establecida, se
dice». **La hay**, aunque no la de Satisfactory y Valheim.

| Hallazgo | Consecuencia |
|---|---|
| Enshrouded **no tiene mods oficiales ni taller**. Keen Games dice que llegarán. La comunidad usa dos cargadores: **Shroudtopia** y **EML** | Se elige Shroudtopia porque es el único que se puede instalar sin intervención del usuario: es MIT y publica sus binarios en **GitHub**, que no pide cuenta. EML solo está en Nexus Mods |
| **Se engancha con un `winmm.dll`** al lado del ejecutable, exactamente igual que BepInEx con su `winhttp.dll` en Valheim. Probado en el servidor dedicado real | No hay que tocar la línea de órdenes, y **la parada con Ctrl+Break sigue saliendo con código 0** con el cargador puesto |
| **Lo cuenta todo por la consola** (`[shroudtopia][INFO] Registered mod: …`), al revés que BepInEx, que solo lo escribe en su propio fichero | Aquí no hace falta leer ningún registro aparte: lo traduce `parseLine` |
| **Y avisa de lo que se rompe**: `(basics) class NoResourceCostAddress not found`. El cargador se engancha a direcciones de memoria del juego, así que una actualización de Enshrouded puede dejar un mod a medias **sin tumbar el servidor** | Esa línea se traduce a «el mod X no encaja con esta versión». Es el fallo que no se notaría |
| **Los mods viven en Nexus Mods, cuya API no deja descargar sin cuenta de pago** | No hay buscador, y se dice. El usuario baja el fichero y lo trae; la app reconoce el paquete (`.dll` suelto o `.zip` con su `mod.json`), lo deja donde el cargador lo busca, lo enciende, lo apaga y lo quita. **No encaja en `CatalogModsPanel`**, que es cargador *más* catálogo: tiene su propia pantalla |
| **`"active": false` en `shroudtopia.json` NO apaga un mod.** Medido: el cargador sigue diciendo `Loading mod`, y solo se salta `Activating`. O sea que el `Load()` del mod ya ha corrido | Apagar un mod es **sacar su fichero de `mods/`**, la misma regla que en los otros dos juegos. Se aparta a `mods-apagados/` de la instancia |
| El paquete del cargador trae **cinco mods de ejemplo** dentro, uno de ellos quita el coste de construir | **No se copian.** Meterle a alguien mods que no ha pedido le cambia la partida sin avisar. Se le dice cuáles trae y él decide. La `e2e` comprueba que no se cuela ninguno |

#### Cómo se ha comprobado

- **`npm run smoke`**: 961 correctas, 0 fallidas (120 nuevas). Las de Enshrouded van contra
  grabaciones reales: su registro, su consulta de Steam, el fichero que él mismo reescribe, el
  volcado de los cuatro preajustes y la salida del cargador de mods. Las que más valen: que ninguna
  línea de la consola enseñe una IP, que tocar un ajuste obligue a `Custom`, que se escriba
  `bannedAccounts` y no `bans`, y que los 37 ajustes de la pantalla sean claves que el juego
  reconoce de verdad.
- **`npm run e2e:enshrouded`**: 76 comprobaciones, todas en verde con el servidor real. Instalar
  (20 s reutilizando la instalación compartida por un enlace: **a Enshrouded no le molesta el
  `mklink /J` que se lleva por delante a Zomboid**), el fichero de configuración que se le escribe,
  arrancar en 4 s, **que ninguna línea de la consola enseñe una IP**, un solo puerto UDP y que no
  abre el siguiente, su consulta de Steam con nombre y plazas, **la trampa del preajuste medida en
  vivo** (se toca un ajuste, se arranca y el servidor dice por consola que aplica «Custom»), que un
  veto puesto desde el juego sobreviva a que la app reescriba el fichero **y al cierre del
  servidor**, copia en caliente (305 s: el tiempo de esperar a su guardado), parada con Ctrl+Break
  en 0,8 s, parar mientras arranca (4,9 s, reintentando la señal), mundos, **un mod real que
  Shroudtopia encuentra y carga de verdad** —con su `mod.json` leído, apagarlo, encenderlo y
  quitarlo—, restauración y que la instalación compartida queda como vino de Steam.
- **`npm run typecheck`**, **`npm run e2e paper`** y **`npm run e2e:restart`** en verde: Minecraft no
  ha empeorado.
- **Recorrido de interfaz** (Playwright, datos aislados, sin arrancar nada —que aquí importa el
  doble—): el selector con los seis juegos, el asistente básico paso a paso incluidas **las dos
  formas de rechazar las contraseñas** (corta, y las dos iguales, que es la que impediría arrancar
  el servidor), el avanzado con los cuatro roles, y las pantallas de un servidor ya creado con su
  `enshrouded_server.json` real y dos vetados puestos «desde el juego». Sin un solo error de
  consola. De ahí salieron tres arreglos de maquetación: **las casillas de permisos salían con el
  texto en el otro extremo de la tarjeta** (un `input` hereda `width: 100%` y dentro de un flex se
  estira: hay que darle tamaño y `flexShrink: 0`), **la explicación de cada casilla se pegaba al
  nombre de la opción** (`.help` es en línea; va en un `div`), y una nota suelta en una tarjeta
  salía a tamaño normal (va con `p.hint`). Las tres están recogidas en `CheckRow`.

#### Lo que no se ha podido comprobar

- **Las líneas de entrada y salida de jugadores**, que hacen falta dos clientes del juego. **No
  deciden nada**: cuántos hay se le pregunta al servidor por la consulta de Steam.
- **Si la consulta de Steam da los nombres** de quien está dentro. Con el servidor vacío devuelve una
  lista vacía bien formada, pero no se ha visto un nombre llegar. Por eso se cuenta en vez de listar.
- **Entrar a jugar de verdad** con un mod puesto.

---

### 19.25 Frecuencia libre de las copias automáticas

Hasta ahora el intervalo se elegía de una lista fija (1, 2, 3, 6, 12 y 24 horas): una hora sin copia
es mucho progreso que perder. Ahora se escribe un número y se elige la unidad (minutos u horas),
con un **mínimo de 5 minutos**: cada copia pide guardar al servidor y comprime el mundo entero, y
cada minuto sería demasiado según el juego.

- **Sin migrar el manifiesto.** Se sigue guardando `backup.intervalHours`, ahora con fracciones
  (`5 / 60`). Cambiar a minutos exigía migrar, y una versión anterior de la app que leyera un
  manifiesto sin `intervalHours` programaría el temporizador con `NaN`, que en Node es cada 1 ms.
  Todo lo demás trabaja en minutos con [`shared/backup.ts`](src/shared/backup.ts).
- **Lo valida el núcleo**, no solo la interfaz: `updateInstance` rechaza menos de 5 minutos, más de
  una semana y conservar fuera de 1 a 100 copias. El temporizador vuelve a aplicar el suelo por si
  el manifiesto se edita a mano.
- **Las copias no se amontonan.** Con 5 minutos y un mundo grande, una copia puede durar más que el
  intervalo, y en Valheim y Enshrouded espera al guardado del propio juego (30 y 5 minutos). Si al
  tocar la siguiente la anterior sigue en curso, se salta y se anota en el registro del lanzador.
- **Cambiar el intervalo con el servidor arrancado vale desde ya.** Antes el temporizador solo se
  programaba al arrancar, y el cambio no se notaba hasta el siguiente arranque.
- **Recomendación por servidor**, a partir del peso del mundo sin comprimir (lo que ya mide la
  estimación de espacio): hasta 200 MB, 15 minutos; hasta 1 GB, 30; hasta 5 GB, una hora; hasta
  20 GB, tres; más, seis. En los juegos que no guardan cuando se les pide nunca baja de su propio
  guardado: la copia lo espera, así que más a menudo solo daría copias repetidas. Si se elige
  menos, se avisa de que en la práctica saldrá una cada lo que guarde el juego, y el historial
  cubierto se calcula con ese ritmo real.
- **Historial.** Con copias frecuentes, las conservadas cubren poco: 10 copias cada 5 minutos son
  50 minutos, y un problema que se note tarde ya estaría en todas. Se explica siempre, y si no
  llega a tres horas se avisa con un botón que sube las conservadas a lo necesario (36 para 5
  minutos). Por eso el máximo de copias pasa de 30 a 100.

**Probado:** `typecheck`; `smoke` (974, 13 nuevas: límites del intervalo y de las copias en el
núcleo, que lo rechazado no se guarda, tramos de la recomendación y el suelo de Valheim);
`e2e -- paper` y `e2e:restart`; y el recorrido `ui/copias.mjs` (capturas 200-206): 5 minutos se
guardan, 3 se rechazan sin guardar, «Conservar 36 copias», 2 horas vuelve a enseñarse en horas,
«Usar esta», el aviso de Valheim y el texto del modo básico.

**Sin probar:** una copia programada de verdad cada 5 minutos con un servidor en marcha, ni el
salto de una copia que se solapa con la siguiente.

---

### 19.27 Rust (Fase 7)

Sexto juego nuevo y el que cierra la hoja de ruta. Es el más pesado de la app y el único con fecha
de caducidad: el primer jueves de cada mes Facepunch publica un parche que obliga a actualizar y que
empieza un mapa nuevo (el *wipe*). A cambio, todo se gobierna desde fuera por su consola remota.

**Decidido por el usuario al empezar la fase:** arrancar el servidor sin restricciones para medirlo
y probarlo (sabiendo que se anuncia siempre con la IP de casa); **Oxide con el catálogo de uMod**
como forma de ampliarlo (no Carbon); y que el borrado **avise y guíe**, con la opción de
programarlo decidida tanto al crear el servidor como desde el propio aviso cuando llega el día.

#### Lo que se averiguó contra el servidor real

Todo con el protocolo 2633 (build `25454815`) y el prototipo `rust-fase7.mjs` del material de
desarrollo.

| Hallazgo | Consecuencia |
|---|---|
| **No hay forma de no publicarse.** Ninguna variable del ensamblado lo permite: en cuanto arranca se da de alta en Steam | Es el caso de Enshrouded. Se dice en la tarjeta del selector, en el paso de conexión del asistente, en el avanzado y en la nota del router |
| **«Listo» es `Server startup complete`.** Antes genera el mapa: **109 s y 3,2 GB con 2000 m, 171 s y 4,2 GB con 3000, 306 s y 5,6 GB con 4000** (pico de memoria del proceso, servidor vacío). Con el mapa ya hecho, 13 s | El asistente enseña esas cifras por tamaño, y el aviso de memoria se calcula con la del mapa elegido, no con una genérica |
| **No lee la entrada estándar.** `quit` por ahí no hace nada en dos minutos | Todo va por WebRCON, como Factorio con su RCON: la consola de la app, la moderación, las copias y la parada |
| **`quit` por WebRCON guarda y sale en menos de un segundo, con código -1** | La parada limpia es esa. El código -1 con «Server Shutting Down (quit)» detrás se diagnostica como cierre normal |
| **Mandado mientras genera el mapa, `quit` espera a que termine** (90 s con 2000 m) y entonces guarda y sale | Se espera, con un plazo de gracia de 15 minutos: matarlo a medias podría dejar el `.map` roto. La consola lo explica (`StopStrategy.whileStarting`) |
| **Una orden devuelve varios mensajes** con su mismo `Identifier` (`server.save` da cuatro) y **una que no existe no devuelve ninguno** | El cliente recoge hasta que el servidor calla 250 ms, y el silencio es un error propio que se explica («Rust no avisa cuando no conoce una orden») |
| **La consola remota se abre en `0.0.0.0`** si no se le dice otra cosa | `+rcon.ip 127.0.0.1`: solo la usa la app, y así no queda a la vista de la red de casa. No se lista nunca entre los puertos a abrir |
| **Escribe la IP pública del equipo** («IP address from external API») | `parseLine` la esconde y la borra hasta del texto guardado, la primera regla de todas. Con cuidado de no tomar por dirección una versión de cuatro números («Oxide.Compiler v1.0.32.0») |
| **Escribe un tercio de sus líneas dos veces**, casi siempre seguidas y nunca a más de un segundo. No es la tubería: en su `-logfile` pasa igual | Filtro de ecos común (`runtime/echoes.ts`, `LaunchSpec.dropEchoes`): cada línea absorbe un solo eco, así que dos guardados seguidos siguen saliendo |
| **La línea de órdenes manda sobre `server.cfg`**, pero **se come el guion de los negativos**: `+app.port -1` lo lee como `1` y deja algo escuchando en el puerto 1 | Todo va en la línea de órdenes salvo apagar Rust+, que va en un bloque propio al final de `server.cfg` sin tocar lo del usuario |
| **Rust+ (la app del móvil) abre un puerto TCP propio** y se registra con Facepunch | Apagado de serie: un puerto menos que abrir. Encenderlo en avanzado lo añade a la guía del router |
| **El mapa se busca por tamaño, semilla y versión de guardado** (`proceduralmap.3000.12345.288.sav`), y **los planos llevan otra versión** (`player.blueprints.17.db`) | El borrado del mes **lo hace el propio juego**: el parche sube la versión del mapa y el servidor no encuentra el anterior. Un borrado desde la app borra lo mismo que ese parche; los planos solo si se pide |
| **Escribe solo dentro de su carpeta** (comprobado con fotos de `AppData`, `LocalLow` y `Documents` antes y después) | No hay que aislar nada, al revés que Valheim, Satisfactory o Zomboid |

#### La trampa de la fase: la consola remota que se cierra sola

La e2e se paró en seco la primera vez: la app no veía a los jugadores, la consola decía «contraseña
incorrecta» y la parada tampoco funcionaba. Con los mismos argumentos desde fuera, todo iba. Buscando
en el ensamblado salieron `rcon.maxconnectionsperip`, `rcon.connectioncooldown` y
`rcon.maxpasswordfailures`, y midiendo:

| Prueba | Resultado |
|---|---|
| Una sola conexión, 30 órdenes seguidas | Las 30 bien |
| Conexiones sueltas (conectar, mandar, cerrar) | **Las cuatro primeras bien; a partir de ahí, todas rechazadas** |
| Esperar tras el rechazo | A los 10 s entra una; a los 4 minutos se siguen rechazando |
| Con `+rcon.connectioncooldown 0` | Igual: no es la espera entre conexiones, es el límite |

**Rust admite cuatro conexiones por dirección y no suelta las cerradas**: el cliente cierra, el
servidor nunca contesta al cierre y la conexión se queda ocupando su sitio. El cliente de la fase 1
(una conexión por orden) más el sondeo de cada 5 s lo dejaban sin consola en medio minuto. La
solución es **una sesión persistente por servidor** (`net/webrconSession.ts`): el sondeo, la consola,
la moderación, las copias y la parada van por la misma, y cada respuesta se reconoce por su
`Identifier`. Tampoco se prueba nunca el puerto con una conexión a pelo, que también ocupa sitio.
La e2e comprueba que, con el sondeo en marcha medio minuto, hay **una sola** conexión abierta.

#### Oxide y uMod

| Hallazgo | Consecuencia |
|---|---|
| **Oxide sustituye siete DLL del juego** (`Assembly-CSharp.dll` entre ellos) ya parcheados, y añade catorce ficheros suyos | Tiene que ser de la build exacta. uMod dice cuándo salió cada Oxide y Steam cuándo se subió la build (`timebuildupdated`, no `timeupdated`, que Facepunch retoca 2 h 20 min después): vale si salió después |
| **Cada actualización de Rust lo quita** | Tras actualizar se repone solo si ya ha salido el de ese mes; si no, queda **pendiente** y la pantalla de plugins lo dice. El servidor funciona mientras, sin plugins |
| **Quitarlo es borrar lo que añadió y validar con SteamCMD**: 14 s y los 250 ficheros de `Managed` **idénticos** a los originales (sha1) | Es lo que hace «Quitar»; la e2e lo comprueba con el sha1 de `Assembly-CSharp.dll` |
| **Carga los plugins en caliente**: dejar un `.cs` en `oxide/plugins` lo compila y lo carga; sacarlo, lo descarga | Añadir, apagar (sacar el fichero) y quitar valen con el servidor en marcha. Solo poner o quitar Oxide exige pararlo. `CatalogModsPanel` gana `liveChanges` para decirlo |
| **uMod da el `sha1` de cada plugin** y coincide con el del fichero | Se comprueba siempre sobre los bytes descargados, antes de dejarlo donde Oxide lo compilaría |
| **Las dependencias no están en el catálogo**, pero Oxide entiende `// Requires: Otro` en el propio `.cs` | Se leen de ahí y se instalan con él, marcadas como dependencia |
| **Con Oxide, el servidor sale marcado como modificado**: `^o` en las palabras clave de su consulta de Steam | Se dice en la pantalla, porque cambia en qué pestaña de la lista del juego aparece |
| **La primera vez se baja su compilador** (`Oxide.Compiler.exe`) de internet | Esa línea se traduce; sin conexión en el primer arranque, los plugins no cargarían |
| `umod.org/games/rust.json` **no es JSON**: es una página que redirige con `<meta refresh>` | Se pide `assets.umod.org/games/rust.json` directamente |

Los jugadores **no necesitan nada**: los plugins solo corren en el servidor. Es la primera pantalla
de catálogo donde eso es así, y el título del aviso lo dice en vez de repetir el de los otros juegos.

#### El borrado mensual

- **Cuándo:** el primer jueves a las 19:00 de Londres, que son las 20:00 en España todo el año
  (cambian de hora a la vez). `forcedWipeOf` lo calcula con el horario de verano británico y el
  smoke lo fija para octubre y noviembre de 2026 y marzo y abril de 2027.
- **El aviso** sale en la pantalla principal (hueco nuevo `GameUi.Notices`) dos días antes y el
  mismo día hasta tres después, con tres botones: hacerlo ahora, que la app lo haga sola cada mes, y
  «Ahora no», que lo quita hasta el mes siguiente. Es donde se decide si no se decidió al crear.
- **Hacerlo:** avisa a quien esté dentro, para, guarda una copia, actualiza si hay versión nueva,
  borra el mapa (y los planos si se pide), pone semilla nueva si toca, y vuelve a arrancar si estaba
  en marcha. Se lleva también los mapas de meses pasados, que el juego ya no carga.
- **Programado:** un vigilante mira cada diez minutos (y al minuto de abrir la app) si ya es la hora
  y si Steam tiene la build nueva; si la tiene, hace lo mismo. Si la app estaba cerrada, lo hace al
  abrirla, dentro de los tres días.
- **Restaurar una copia de antes del borrado** devuelve el mapa **y su semilla**: el contrato gana
  `afterRestore`, y Rust apunta el tamaño y la semilla del mapa restaurado. Sin eso el servidor no lo
  encontraría y generaría otro.

#### Decisiones

- **Rust+ apagado de serie.** Es un puerto TCP más abierto a internet y un registro con Facepunch;
  quien lo use lo enciende en avanzado y la guía del router lo incluye.
- **Moderación con el servidor parado también.** En marcha va por la consola remota y
  `server.writecfg`; parado, se escriben `users.cfg` y `bans.cfg`, que el servidor lee al arrancar
  (la e2e veta con él parado y luego le pregunta por su consola: el veto está).
- **La lista de jugadores enseña nombres, pero todo va por SteamID**: el servicio lo busca en
  `playerlist` en el momento de moderar, así que dos jugadores con el mismo nombre no se confunden
  con quien ya se fue.
- **Plugins puestos a mano:** se listan, se pueden quitar, y apagarlos los adopta en el manifiesto.

**El icono ya estaba dibujado** desde la fase 0 (§13.1): esta fase solo lo importa en `rustUi.icon`.

#### Cómo se ha comprobado

- **`npm run smoke`**: 1095 correctas, 0 fallidas (**121 nuevas**, contra grabaciones reales en
  `scripts/smoke/fixtures/rust/`): registro, consola remota, consulta de Steam y la ayuda que da el
  propio servidor de cada variable. Las que más valen: que ninguna línea enseñe una IP ni la
  contraseña, que la sesión haga trece órdenes (tres a la vez) por **una sola** conexión, que la
  línea de órdenes no lleve negativos, que los valores de serie de los ajustes sean los que dice el
  servidor, las fechas del borrado con el cambio de hora y que un borrado no se lleve los planos.
- **`npm run e2e:rust`**: **71 comprobaciones**, todas en verde con el servidor real (mapa de 1000 m
  para que no tarde). Instalar reutilizando la instalación compartida por un `mklink /J` (a Rust no
  le molesta), arrancar en 42 s, **ni IP ni contraseña ni líneas dobladas** en la consola, puertos
  (la consola remota solo en 127.0.0.1, Rust+ cerrado), consulta de Steam, consola de la app,
  ajustes aplicados preguntándoselos al servidor, **una sola conexión tras medio minuto de
  sondeo**, moderación en caliente y en frío, copia en caliente en 1 s, parada en 0,3 s, **parar
  mientras genera el mapa sin matarlo** (26 s), Oxide con un plugin, **otro en caliente**, apagar
  uno en caliente, quitar Oxide con los DLL idénticos a los de Steam, borrado con el servidor en
  marcha (vuelve a arrancar solo con la semilla nueva) y **restaurar una copia de antes del
  borrado, con su semilla**.
- **Recorrido de interfaz** (Playwright, datos aislados, sin arrancar nada): el selector con los
  siete juegos y la tabla de requisitos, el asistente básico paso a paso, el avanzado, y las
  pantallas de un servidor ya creado en los dos modos con el reloj movido al jueves del borrado para
  ver el aviso (`harness-reloj.cjs`). Sin errores de consola. De ahí salieron tres arreglos: el
  aviso de la pantalla principal iba pegado a los bordes, una unidad en una fila salía a tamaño
  normal, y **una negrita dentro de un párrafo de un aviso partía la frase en líneas**, un fallo que
  ya estaba en Conexión, Zomboid y Valheim y se arregla para todos en la hoja de estilos.
- `typecheck`, `e2e paper`, `e2e:restart` y `e2e:steam` en verde (§19.28).

#### Lo que no se ha podido comprobar

- **Nada con jugadores dentro**: hacen falta clientes del juego. Las líneas de entrada, salida y
  chat se reconocen por la forma de siempre del registro de Rust y **no deciden nada** (quién está
  dentro se le pregunta al servidor); `playerlist` con alguien dentro está en el smoke como
  sintético. Echar y vetar a alguien conectado, tampoco.
- **Un borrado forzado de verdad**: habría que esperar al jueves. Lo que hace el parche está medido
  por los nombres de los ficheros; el vigilante está en el smoke con fechas fijas y la e2e hace el
  borrado de la app, pero no con una build nueva de Steam.
- **Oxide «pendiente» de verdad** (actualizar Rust antes de que salga su Oxide): está en el smoke
  con las horas reales de la build de septiembre; en vivo no se ha dado.
- **Rust+** encendido: no hay móvil emparejado con el que probarlo.

---

### 19.28 Revisión general de la 0.10.0

Con los siete juegos, la revisión que la hoja de ruta dejaba para el final.

**Textos con forma de Minecraft.** Revisadas todas las pantallas comunes. Quedaban tres: el ejemplo
de dirección de túnel de Conexión (`algo.joinmc.link`, de Minecraft, ahora sale del juego:
`tunnelAddressExample`), la pantalla de elegir modo («modo de juego, dificultad, mundo», «semillas de
mundo») y los mensajes de las copias («Comprimiendo la partida» sale ahora como «el mapa», «el
mundo» o «la partida» según el juego).

**Varios servidores a la vez.** Era la mitigación pendiente de la tabla de riesgos. `memoryNeedGb`
dice lo que usa cada servidor según su configuración (Minecraft y Zomboid, la memoria puesta; Rust,
la medida para su mapa; los demás, la mínima de su tarjeta), y antes de arrancar uno con otros en
marcha, `LoadNotice` suma y avisa si no cabe o va justo, nombrando los que están encendidos. Avisa,
nunca bloquea.

**Guía de requisitos por juego.** Cada tarjeta lleva ahora sus requisitos medidos (arranque, puertos
y lo que pide además), y el selector de juego tiene una tabla plegada que los compara todos:
memoria, descarga, arranque, puertos para jugar desde fuera y lo demás.

**Probado:** `typecheck`, `smoke` (1095), `e2e paper`, `e2e:restart` y `e2e:steam` en verde; el
recorrido del selector con la tabla (no ensancha la pantalla) y el de la pantalla de un servidor.

**Sin probar:** el aviso de memoria con servidores de verdad en marcha a la vez (solo se ha visto
que no sale cuando no hay ninguno).

---

### 19.29 Siguiente

**Ahora (uso privado):**

1. Instalación de plugins y mods desde Modrinth, filtrando por loader y versión (§4.8).
2. Moderación con el servidor parado: editar whitelist y operadores antes del primer arranque,
   resolviendo UUID contra la API de Mojang (§9).
3. Métricas en vivo: TPS y memoria del proceso, para ver si el servidor va justo.
4. Plantillas de creación ("Survival con amigos", "Creativo", "Modded") sobre el asistente actual.
5. UPnP, si aparece un router donde se pueda probar (§19.5).

**Aparcado hasta que haya que publicar:** firma de código (§13.3), CI de compilación,
actualizaciones automáticas y las tareas de marca de §18.2. El instalador ya está hecho (§19.7).
