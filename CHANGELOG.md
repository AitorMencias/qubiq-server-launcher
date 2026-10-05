# Cambios

Lo que cambia en cada versión de QubiQ Server Launcher. Desde la 1.0.0 se sigue el
[versionado semántico](https://semver.org/lang/es/): 1.0.x son arreglos, 1.x.0 funciones nuevas y
2.0.0 cambios que rompen algo de lo que ya tenías.

El detalle de cada cambio, con lo que se probó, está en el diario de desarrollo
([ANALISIS.md §19](ANALISIS.md)). Hasta la 0.13.1 el proyecto no era público, y no todas esas
versiones se publicaron como release.

## [1.0.0] — 2026-10-05

Primera versión pública, con el código abierto bajo GPL-3.0-or-later.

**Si vienes de la 0.13.x:** se instala encima y tus servidores, mundos y copias se conservan, sin
migrar nada. Los servidores de Minecraft con HardcoreUtility 0.1.0 verán que hay versión nueva del
plugin: al pulsar *Actualizar* se instala la 1.0.0, con el mismo papel y la configuración intacta
(si era de una versión antigua, solo se le añaden las opciones nuevas).

### Añadido
- **Acerca de**, en *Configuración de la app*: versión, copyright, licencia, enlace al código, los
  plugins oficiales que incluye con su licencia y su código, y los avisos de terceros, en los diez
  idiomas.
- Los avisos de terceros (`THIRD-PARTY-NOTICES.txt`) y la licencia viajan con el ejecutable.
- Cada release publica el SHA-256 de sus ejecutables (`SHA256SUMS.txt`).
- Documentación pública: [README](README.md) con capturas y en inglés ([README.en.md](README.en.md)),
  [PRIVACIDAD.md](PRIVACIDAD.md) (qué sale del equipo, cuándo y a quién),
  [SECURITY.md](SECURITY.md) (cómo avisar en privado de un problema de seguridad),
  [CONTRIBUTING.md](CONTRIBUTING.md) y plantillas para avisar de fallos y proponer cosas.

### Cambiado
- El plugin oficial **HardcoreUtility** pasa a la 1.0.0 y vive en su propio repositorio
  ([hardcore-utility-tool](https://github.com/AitorMencias/hardcore-utility-tool)); cada release de
  la app incluye la última versión publicada del plugin.
- El repositorio se llama `qubiq-server-launcher`.
- Electron 44.5.1.

### Arreglado
- Actualizar un servidor de Steam ya instalado (visto con Project Zomboid y Rust) fallaba con «Steam
  dejó la instalación a medias»: Steam ya no da el manifiesto de la versión instalada. Ahora la app
  lo detecta, vuelve a comprobar lo instalado y baja solo lo que ha cambiado.
- Si de verdad no hay conexión con Steam, el mensaje lo dice así.

### Seguridad
- La ventana ya no puede navegar a otra página ni abrir ventanas nuevas: los enlaces externos se
  abren en tu navegador. Antes, arrastrar un enlace a la ventana cargaba esa web dentro de la app,
  con acceso a sus funciones.
- La interfaz va con `sandbox` y sin más permisos del navegador que el portapapeles.
- El núcleo comprueba los identificadores de servidor y los nombres de mundos, partidas y copias que
  le llegan de la interfaz, para que nunca toquen nada fuera de su carpeta.
- Abrir un fichero de configuración de un plugin ya no puede ejecutar un programa.
- Los errores que el control remoto manda a un dispositivo ya no llevan rutas con tu usuario de
  Windows.

### Conocido
- Algunos mensajes de error (de instalación o de arranque) siguen saliendo solo en español, aunque
  la interfaz esté en otro idioma. Se traducirán en la 1.1.
- El ejecutable no está firmado: la primera vez Windows SmartScreen avisa (*Más información →
  Ejecutar de todas formas*). El SHA-256 de cada fichero está en la release.
- El control remoto usa un certificado propio: la primera vez que abres su página, el navegador
  avisa y hay que aceptarlo.

## [0.13.1] — 2026-10-04

### Añadido
- **Guardián**: los servidores ya no dependen de la ventana de la app. Si la app se cierra de golpe
  con servidores en marcha, al volver a abrirla los recupera, con su consola y su parada limpia.

### Arreglado
- «Cancelar» en el aviso de cerrar con servidores en marcha cerraba la app igualmente.

## [0.13.0] — 2026-10-03

### Añadido
- **Servidores de otro QubiQ**: esta app se empareja como un dispositivo más de otro equipo y
  enseña sus servidores en la lista lateral, con lo mismo que permite la página remota.

## [0.12.1] — 2026-10-03

### Añadido
- **Historial del servidor**: quién entra y sale, la moderación, las órdenes de la consola, los
  guardados y los arranques y paradas.

## [0.12.0] — 2026-10-03

Incluye lo que estaba previsto como 0.11.0.

### Añadido
- **Control remoto**: arrancar, parar, reiniciar y ver la consola desde el móvil u otro PC, con
  una página que sirve la propia app por HTTPS, dispositivos emparejados con un código y permisos
  por dispositivo.
- **Diez idiomas** en la interfaz: español, inglés, ruso, alemán, italiano, francés, portugués,
  chino, hindi y japonés.
- **Configuración de la app**, con el idioma, el modo y la **carpeta de datos**, que se puede llevar
  a otro disco.

## [0.10.0] — 2026-09-26

### Añadido
- **Rust**: instalación por Steam, consola remota (WebRCON), borrado mensual avisado o programado y
  plugins de uMod con Oxide.
- Aviso de memoria antes de arrancar un servidor más con otros en marcha.

## [0.9.1] — 2026-09-26

### Cambiado
- Frecuencia libre de las copias de seguridad automáticas, con una recomendación según el juego.

## [0.9.0] — 2026-09-26

### Añadido
- **Enshrouded**: instalación por Steam, permisos por contraseña de rol, preajustes de dificultad y
  sus ajustes uno a uno, y mods con Shroudtopia.

## [0.8.1] — 2026-09-25

### Añadido
- Mods de **Satisfactory** (ficsit.app) y **Valheim** (Thunderstore, con BepInEx) desde la app.

## [0.8.0] — 2026-09-20

### Añadido
- **Project Zomboid**: instalación por Steam, consola remota, moderación, reglas de la partida y mods
  del Taller.

## [0.7.2] — 2026-09-19

### Añadido
- **NeoForge** en Minecraft.
- **Servidores a medida**: traer una carpeta de Minecraft que ya tienes (un server pack, un modpack)
  y arrancarla con su propio script.

## [0.7.1] — 2026-09-18

### Añadido
- Configurar cualquier plugin o mod de Minecraft desde la app (YAML, TOML, JSON, .properties),
  conservando los comentarios del autor.

## [0.7.0] — 2026-09-18

### Añadido
- **Factorio**, con el juego copiado de tu instalación o bajado con tu cuenta de Steam.

## [0.6.1] — 2026-09-17

### Añadido
- Actualizar el servidor y cambiar de versión, en cualquier juego, incluidas las versiones en
  pruebas.

## [0.6.0] — 2026-09-17

### Añadido
- **Valheim**: instalación por Steam, crossplay con código, varios mundos y moderación.

## [0.5.0] — 2026-09-17

### Añadido
- **Satisfactory**: instalación por Steam, reclamar el servidor sin abrir el juego, partidas y
  ajustes por su API.
- Iconos nuevos de los juegos.

## [0.4.1] — 2026-09-16

### Cambiado
- Iconos propios para cada juego, en lugar de los logotipos oficiales.

## [0.4.0] — 2026-09-15

### Añadido
- Base para gestionar **varios juegos** y selector de juego al crear un servidor.

## [0.3.2] — 2026-09-15

### Cambiado
- Icono de la app nuevo y animación de carga.

## [0.3.1] — 2026-09-14

### Cambiado
- La pantalla de inicio del servidor también en el modo avanzado.

## [0.3.0] — 2026-09-14

### Cambiado
- Modo básico rehecho como un recorrido de una pregunta por pantalla.

## [0.2.1] — 2026-09-14

### Cambiado
- Versión nueva del plugin oficial HardcoreUtility.

## [0.2.0] — 2026-09-13

### Añadido
- **Plugins oficiales**: plugins propios que se instalan con un botón y se configuran con un
  formulario. El primero, HardcoreUtility.

## [0.1.0] — 2026-09-10

Primera versión: crear, arrancar, configurar y moderar servidores de Minecraft (vanilla, Paper,
Fabric y Forge) con Java automático, mundos, copias de seguridad y ayuda para conectarse desde
fuera.
