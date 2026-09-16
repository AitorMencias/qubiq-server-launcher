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
`checksums.sha256`. El canal (`STABLE` / `EXPERIMENTAL`) viene en el campo `channel`: la app debe
ofrecer solo `STABLE` salvo en modo avanzado.

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
el asistente habría fallado. Ahora, sin el modo inestable, se saltan las versiones de Paper cuyo
último build no es estable, y el smoke lo comprueba.

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
| **Contraseñas en el manifiesto** | La de administrador se guarda tal cual: la app la necesita en cada arranque para hablar con la API, y el usuario la necesita dentro del juego. Está en su equipo, junto a los datos del servidor, y la ficha técnica la enseña en vez de fingir que es un secreto de la app. Cifrarla con la protección de datos de Windows queda para la fase 7, que ya la necesita para Factorio |
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

### 19.16 Siguiente

**Ahora (uso privado):**

1. Instalación de plugins y mods desde Modrinth, filtrando por loader y versión (§4.8).
2. Moderación con el servidor parado: editar whitelist y operadores antes del primer arranque,
   resolviendo UUID contra la API de Mojang (§9).
3. Métricas en vivo: TPS y memoria del proceso, para ver si el servidor va justo.
4. Plantillas de creación ("Survival con amigos", "Creativo", "Modded") sobre el asistente actual.
5. UPnP, si aparece un router donde se pueda probar (§19.5).

**Aparcado hasta que haya que publicar:** firma de código (§13.3), CI de compilación,
actualizaciones automáticas y las tareas de marca de §18.2. El instalador ya está hecho (§19.7).
