# QubiQ Server Launcher — guía para trabajar en el proyecto

App de escritorio para Windows (Electron + React + TypeScript) que crea, arranca, configura y modera
servidores de juegos. Gratuita y GPLv3. Empezó con Minecraft y está creciendo a más juegos por fases.

**Todo en español:** respuestas, textos de la interfaz, comentarios y documentación.

## Reglas de trabajo

- **No hacer commit ni push** salvo que el usuario lo pida. Los commits los hace él.
- **Nunca tocar los datos reales** de `%APPDATA%\qubiq-server-launcher` (sus servidores de verdad).
  Las pruebas van con datos aislados (`setDataRoot` a una carpeta temporal, o el `appData` redirigido
  del recorrido de interfaz). Si hay que probar con sus servidores: **copias**, y comprobar después
  con checksums que los originales no han cambiado.
- **Preguntar antes de exponer al usuario hacia fuera:** publicar un servidor de prueba en la lista de
  Steam (Rust siempre se anuncia; Valheim con `-public 1`), abrir puertos, enviar su IP a servicios.
- **No descartar cambios sin commit** (`git checkout`, `reset`, `stash`): se trabaja encima.
- **Versiones por debajo de 1.0.0.** Las fases multijuego van de 0.5.0 a 0.10.0. La versión de
  `package.json` la cambia `release.bat` al publicar; puede ir por detrás del último commit.
- **Iconos de juegos propios, nunca logos oficiales** (ANALISIS.md §13.1).
- Al terminar algo: decir qué se ha probado y cómo, y lo que no se ha podido probar.

## Dónde está cada cosa

| Documento | Para qué |
|---|---|
| [HOJA-DE-RUTA-MULTIJUEGO.md](HOJA-DE-RUTA-MULTIJUEGO.md) | **Qué hacer en cada fase**, estado, plantilla por juego y decisiones pendientes |
| [ANALISIS.md](ANALISIS.md) | Por qué está hecho así. §19 es el diario de desarrollo (§19.13 fase 0, §19.14 fase 1) |
| [INVESTIGACION-JUEGOS.md](INVESTIGACION-JUEGOS.md) | Datos de cada juego: instalación, puertos, requisitos, control |
| [README.md](README.md) | Comandos, arquitectura y **«Cosas que conviene saber antes de tocar el código»** (léelo) |

Arquitectura en una línea: el núcleo (`src/main/core`) no conoce Electron; cada juego implementa
`GameAdapter` (`core/games/types.ts`) y se registra en `core/games/registry.ts`; su interfaz vive en
`src/renderer/src/games/<juego>/` (con su `icon.svg` ya dibujado) y se registra en `games/index.ts`;
sus datos compartidos (nombre, condiciones, capacidades, puertos) en `src/shared/games/index.ts`.

## Cómo empezar una fase

1. Leer su apartado en la hoja de ruta, la **plantilla común de las fases 2 a 7** y los datos del
   juego en INVESTIGACION-JUEGOS.md.
2. Resolver primero las decisiones marcadas como pendientes, preguntando al usuario.
3. Usar lo que ya existe: SteamCMD (`core/tools/steamcmd.ts`), parada (`core/runtime/stop.ts`), RCON,
   WebRCON, A2S (`core/net/`), puertos UDP, `serverPorts()`, `GameInfo.save`, `LaunchSpec.env`.
4. Reutilizar los servidores ya instalados en `%LOCALAPPDATA%\qubiq-dev\steam` para prototipar sin
   volver a descargar (ver abajo).
5. Al cerrar: marcar el estado en la hoja de ruta, añadir el apartado §19.x en ANALISIS.md y
   actualizar README (comandos, número de comprobaciones del smoke, reglas nuevas).

**Estado:** las fases 0 a 7 de la hoja de ruta están hechas (la 7, Rust, cierra con la revisión
general de la 0.10.0). Después, idiomas, Configuración de la app y carpeta de datos movible (§19.29,
0.11.0): la interfaz está en diez idiomas, los mensajes del núcleo aún en español. **Control remoto por
órdenes:** R1 (anfitrión y página web, 0.12.0) y R2 (QubiQ como cliente de otro, 0.13.0) hechas.
Hoja de ruta, ANALISIS.md §19.31 y §19.33; sin decisiones pendientes. Después, el **historial del servidor**
(pestaña Historial, §19.32): si añades una forma de moderar, apúntala con `host.journal` (README). Probarlo desde fuera de casa exige
abrir un puerto: preguntar antes. Los servidores se lanzan a través del **guardián** (§19.34): si
la app se cierra de golpe, al volver los recupera; no lances el proceso de un servidor por otro
camino. Lo demás que viene está en §19.30.

**Textos de la interfaz:** nunca a pelo en el código. Van con `t('clave')` a
`src/shared/i18n/locales/es/<área>.ts` y a los otros nueve idiomas (el typecheck avisa si falta
alguno; el smoke, si cambian las variables). Ver «Idiomas» en README.
Rust, Enshrouded y Valheim publicado se anuncian solos en la lista de Steam: arrancarlos para probar
sigue exigiendo preguntar antes, salvo lo ya autorizado para su fase.

## Pruebas

| Comando | Cuándo |
|---|---|
| `npm run typecheck` | Siempre. Los scripts de `scripts/` no entran: se comprueban aparte si se tocan |
| `npm run smoke` | Siempre. Sale con 2 (no 1) si solo falla por no llegar a un servicio externo |
| `npm run e2e -- paper` y `npm run e2e:restart` | Al tocar núcleo, supervisor o Minecraft. **Minecraft no puede empeorar** |
| `npm run e2e:custom` | Al tocar servidores a medida (`games/minecraft/custom/`), arranque con cmd o cierre forzado del supervisor |
| `npm run e2e:steam` | Al tocar SteamCMD, parada o puertos. Caché en `%LOCALAPPDATA%\qubiq-dev\e2e-steam` |
| `npm run e2e:remote` | Al tocar el control remoto (`core/remote/`, `shared/remote.ts`) o `service.restart`. Escucha solo en 127.0.0.1 |
| `npm run e2e:rust` | Al tocar Rust o la sesión WebRCON. **Publica el servidor** (Rust se anuncia siempre) |
| Recorrido de interfaz | Al tocar la interfaz: ver `%LOCALAPPDATA%\qubiq-dev\LEEME.md` (Playwright, capturas y comparación píxel a píxel) |

Las grabaciones reales de protocolos (SteamCMD, RCON y A2S de Zomboid) están en
`scripts/smoke/fixtures/steam/`. Si un juego cambia su protocolo, se vuelve a grabar y se sustituye.
Antes de llevar una grabación al repo hay que quitar las rutas con el nombre de usuario.

## Material fuera del repositorio

`%LOCALAPPDATA%\qubiq-dev\` (índice en su `LEEME.md`):
- `steam/`: SteamCMD y los servidores de **Valheim, Satisfactory, Enshrouded, Project Zomboid y Rust
  ya instalados** (~35 GB), más los prototipos de cada fase (los de Rust: `rust-fase7.mjs` y los
  `rust-rcon-*.mjs` que midieron el límite de conexiones de su consola remota). Zomboid tiene su carpeta de usuario
  aislada en `steam/pz-home` (por defecto escribiría en `%USERPROFILE%\Zomboid`, la del juego real).
- `ui/`: recorrido de la interfaz con datos aislados.
- `verificacion-migracion/`: script para probar cambios de esquema del manifiesto sobre copias.
- `bocetos/`: selector de juego e iconos.

## Trampas del entorno

- **Bash en Windows (Git Bash):** los heredocs y `sed` se comen las barras invertidas (`\\n`, `\t`,
  rutas `C:\...`). Para scripts con barras, escribirlos a un fichero con la herramienta Write y
  ejecutarlos, o editar con Edit.
- **Rutas con `C:` en bash** para programas nativos: `cygpath -w`.
- **Argumentos que empiezan por `/` en bash:** Git Bash los convierte en rutas (`/players` → `C:/Program Files/Git/players`). Los comandos de Factorio y de RCON van con
  `MSYS_NO_PATHCONV=1` o dentro de un script, nunca sueltos en la línea de órdenes.
- **Electron desde bash:** `env -u ELECTRON_RUN_AS_NODE <repo>\node_modules\electron\dist\electron.exe script.cjs`.
- **`tar`:** usar siempre `systemTarPath()` (el de GNU del PATH rompe con `C:\`).
- **Servidores de Steam:** Ctrl+C no llega a un proceso hijo (hereda la orden de ignorarlo); usar
  Ctrl+Break. SteamCMD no vacía su salida por tubería: el progreso sale de `logs/console_log.txt`.
