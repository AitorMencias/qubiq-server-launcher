# Checklist antes de publicar la v1.0.0 y abrir el repositorio

Revisión hecha sobre la 0.13.1. **⚠️** = hallazgo concreto que hay que arreglar; **✅** = ya está.

## 1. Cumplir la GPLv3

- [x] ✅ `LICENSE` con la GPLv3 completa y `"license": "GPL-3.0-or-later"` en `package.json`.
- [x] **Avisos legales dentro de la app** (GPLv3 §0 y §5d): Configuración → «Acerca de» con versión,
      copyright, aviso de licencia y garantía, aviso de no oficial y botones a código, licencia y
      avisos de terceros, en los 10 idiomas. Datos en `src/shared/about.ts`.
- [x] **Avisos de terceros**: `scripts/third-party-notices.ts` genera `out/THIRD-PARTY-NOTICES.txt` a
      partir de lo que entra en el bundle (hoy: react, react-dom, scheduler, todos MIT) y
      electron-builder lo deja en `resources/` junto a `LICENSE.txt`. Electron/Chromium: verificado.
- [x] **HardcoreUtility** en su repositorio (GPL-3.0) y fuera de este: `npm run plugins` baja su
      última release verificada con SHA-256 (la release usa `--update`). Sale en los avisos de
      terceros y en «Acerca de» con su enlace (ANALISIS.md §19.35). Pasa a la 1.0.0.
      Pendiente: arrancar un Paper con el jar 1.0.0 dentro.
- [ ] **Código fuente correspondiente**: no hay ninguna etiqueta en el repo. Etiquetar `v1.0.0`
      exactamente en el commit del que sale el instalador (paso 7.3).
- [x] **Compilación reproducible**: copia limpia de los ficheros versionados → `npm ci` → typecheck y
      build, con bundles idénticos byte a byte. `engines` y `.nvmrc` fijan Node 24. Falta repetirlo
      con `git clone` sobre el commit final.
- [x] Aviso de copyright y licencia en el README (sección «Licencia»).
- [x] `publish: null` en electron-builder: con `repository` en package.json ya no intentará publicar solo.

## 2. Datos personales e higiene del historial

Al abrir el repo se publica **todo el historial**, no solo el estado actual.

- [x] Historial reescrito (`git filter-repo`) en local: los 23 commits con el email `noreply` de
      GitHub, y las grabaciones limpias en todos los commits (7 ficheros, 14 líneas). Mismas fechas
      y mensajes. **Falta subirlo** (ver abajo) y configurar el email `noreply` para los commits nuevos.
- [x] Historial nuevo subido con `push --force`; email `noreply` configurado para los commits nuevos.
- [x] `hardcore-utility-tool` reescrito en local (1 commit y la etiqueta `v1.0.0`). Los jar de
      ambos repos revisados por dentro: sin rutas, usuario del equipo ni email (solo
      `authors: [AitorMencias]`). Falta su `push --force` de `main` y de la etiqueta.
- [x] Nombre del equipo en las grabaciones de Rust → `EQUIPO-PRUEBAS` (el hardware no identifica).
- [x] IPs inventadas de rangos reales (`83.45.1.9`, `88.1.2.3`, `88.12.34.56`) → rangos de
      documentación (`203.0.113.x`, `198.51.100.x`).
- [x] Firmas de los tokens de administrador del servidor de prototipo de Satisfactory
      (`api-grabada.json`) → firmas falsas. El `.pfx` del smoke es de pruebas (contraseña `qubiq-smoke`).
- [x] Smoke: «Grabaciones sin datos personales» (usuario y equipo de quien lo ejecuta, IPs públicas).
- [x] Barrido de los 23 commits: sin claves privadas, tokens de servicios (GitHub, AWS, Slack…),
      emails, IPv6 públicas ni MAC; contraseñas de las grabaciones, todas de prueba; IDs de Steam
      genéricas. **Las versiones antiguas de las grabaciones siguen en el historial** salvo que se reescriba.
- [ ] Escáner dedicado (`gitleaks detect`) como segunda opinión, si se quiere instalar.
- [x] Documentación repasada en busca de comentarios personales: nada (las menciones a «usuario»
      son al de la app).
- [x] `CLAUDE.md` se publica, con un aviso de que `qubiq-dev` es material local del autor y qué
      pruebas funcionan sin él.

## 3. Coherencia de versión y metadatos

- [x] `package.json` en 0.7.2: es la última release generada con `release.bat`; los commits
      posteriores se nombraron por versión sin generar release. `release.bat 1.0.0` la pondrá bien
      (no crea etiqueta de git: `--no-git-tag-version`).
- [x] `description` de `package.json` y campos `repository`, `homepage`, `bugs`.
- [x] README: «MVP funcional. Seis juegos» → «Siete juegos».
- [x] `CLAUDE.md`: la regla de «por debajo de 1.0.0» pasa a versionado semántico desde la 1.0.0.
- [x] Repo → `qubiq-server-launcher` (sin «Minecraft», como pide Mojang). URL cambiada en
      `package.json` y `about.ts`. **Falta:** renombrarlo en GitHub y `git remote set-url`.
      El `appId` se queda igual (Windows reconoce la app instalada por él); la carpeta de datos
      está fijada en `main/index.ts` y no depende de ningún nombre.
- [x] Marca «QubiQ» (TMview, 2026-10-05): **ninguna en España**. La relevante es la Benelux
      1026932 «Q QUBIQ» (QubiQ Digital / QubiQ Labs, Ámsterdam): **combinada** (cubo verde con Q),
      clases 35 (marketing) y 42 (**servicios** de software, SaaS), **sin clase 9** (software
      descargable), solo Benelux, vence el 31/08/2027. Riesgo bajo. Decisión: se mantiene QubiQ,
      usando siempre el nombre completo «QubiQ Server Launcher» y sin logo de cubo con Q (el icono
      actual, un poliedro sin letra, no se parece).

## 4. Documentación pública

- [x] README para usuarios (9 KB: descargar, SmartScreen, requisitos, juegos, funciones, datos,
      ayuda, marcas y licencia). Lo técnico, entero, en `docs/DESARROLLO.md` con los enlaces
      ajustados. Corregido de paso: Windows x64 (no arm64) y Node 24 (no 22).
- [x] Capturas en el README (panel, selector de juego, asistente y configuración), en español e
      inglés, en `docs/img/`. Hechas con datos de prueba, peticiones externas bloqueadas y revisadas
      una a una (sin usuario, rutas ni IP pública; solo una IP de red local).
- [x] `README.en.md`, traducción completa, enlazado desde el README.
- [x] `CHANGELOG.md` desde la 0.1.0, con la 1.0.0 «sin publicar».
- [x] `SECURITY.md`. **Falta:** activar «Private vulnerability reporting» en GitHub
      (Settings → Code security).
- [x] `CONTRIBUTING.md`: idioma, pruebas, textos en 10 idiomas, grabaciones limpias, pruebas que
      publican, y aportaciones bajo GPL-3.0-or-later.
- [x] `PRIVACIDAD.md`, sacado del código: descargas, mods, IP pública (solo al elegir router o al
      pulsar «Comprobar»), listas públicas de cada juego, cuentas de Steam y Factorio, control
      remoto. Sin telemetría ni autoactualización.
- [x] Avisos de marcas de los siete juegos y de Valve en el README.
- [x] Plantillas de issues (fallo, propuesta y enlace al aviso privado de seguridad).
      **Falta:** crear las etiquetas `fallo` y `propuesta` en GitHub.
- [x] `release.mjs` genera `SHA256SUMS.txt` (el README lo promete).

## 5. Calidad del producto

- [x] Pruebas (2026-10-04): typecheck, smoke (1489), `e2e -- paper`, `e2e:restart`, `e2e:custom`,
      `e2e:remote`, `e2e:steam`, `e2e:valheim`, `e2e:factorio --rapido`, `e2e:satisfactory` y
      `e2e:enshrouded` (publicada, con permiso): **todas correctas**.
- [x] ⚠️→✅ `e2e:zomboid` y `e2e:rust` fallaban al instalar. **No era la red** (la primera hipótesis,
      LaLiga, era errónea): Steam ya no da a la cuenta anónima el manifiesto de la versión
      **instalada**, y SteamCMD lo resume como «No connection». A cualquier usuario le fallaría
      «Actualizar» en esos juegos. Arreglado en `appUpdate` (ANALISIS.md §19.37): quita el
      appmanifest y repite, reaprovechando lo instalado. `e2e:zomboid` **todo correcto** pasando por
      el arreglo.
- [ ] `e2e:rust`: el arreglo funciona y pasa hasta «Oxide y plugins de uMod», donde para porque
      Oxide aún no ha salido para el parche de Rust de este mes (la app lo explica bien). **Repetir
      cuando salga Oxide** para las secciones de plugins, borrado y restauración.
- [x] Mensaje correcto cuando de verdad no hay red: «No se puede llegar a los servidores de descarga
      de Steam» (en vez de «Steam dejó la instalación a medias»).
- [x] Recorrido de interfaz en los 10 idiomas, los 7 servidores pestaña a pestaña: sin textos que no
      quepan ni errores (`ui/idiomas-local.mjs`, sobre una copia en modo local).
- [ ] Cosmético: en inglés la lista lateral de servidores necesita scroll antes que en español.
- [x] Mensajes del núcleo solo en español: se deja para la 1.1 (decisión del usuario). El README lo dice.
- [x] `TODO`/`FIXME`: no hay ninguno de verdad (eran «TODO» en español y marcadores `XXXX-XXXX`).
- [x] Actualización 0.13.x → 1.0.0 sobre **copias** de 8 servidores reales (`qubiq-dev/verificacion-1.0`):
      todo se lee igual, el plugin 0.1.0 se ve desfasado y actualizarlo deja la 1.0.0 con el mismo
      papel y la configuración intacta (a una de 0.1.0 antigua solo le añade las 28 líneas de las
      opciones nuevas), y Paper arranca con `HardcoreUtility v1.0.0`. **Originales intactos**
      (md5 de 6435 ficheros antes y después).
- [ ] Instalación limpia en otro PC + portable (**tarea del autor**).
- [ ] Desinstalar no borra servidores: ✅ configurado; probarlo **en el otro PC** (aquí están los datos reales).

## 6. Seguridad

Detalle en ANALISIS.md §19.36.

- [x] Control remoto y guardián revisados: bien (firmas, nonces, límites, emparejamiento, TLS 1.2+,
      consola de nivel 2 cerrada; tubería del guardián solo para el usuario). Arreglado: el error de
      una orden fallida salía con rutas del usuario.
- [x] ⚠️→✅ **La ventana podía navegar fuera de la app y esa página recibía `window.qubiq`**
      (comprobado). Ahora `src/main/security.ts`: navegación bloqueada, enlaces al navegador,
      sin ventanas nuevas ni `<webview>`, solo el permiso del portapapeles. `sandbox: true`.
- [x] ⚠️→✅ **Identificadores y nombres de la interfaz sin comprobar** (`remove('..')` borraba la
      carpeta de datos): `instanceDir` valida, `childPath` para mundos y partidas, copias solo `*.zip`.
- [x] `openContentConfig` ya no ejecuta un `.exe`/`.bat` de `plugins/`.
- [x] Extracciones (bsdtar) seguras ante zips con `../`: probado.
- [x] `npm audit fix` (0 vulnerabilidades) y Electron 44.5.1.
- [x] Contraseñas: Steam por entrada estándar; las de las consolas de los juegos no salen en registros.
- [ ] Opcional: `gitleaks` como segunda opinión del historial (punto 2).

## 7. Publicación (en este orden)

1. [ ] Limpiar historial si se decide (punto 2) y `push --force` con el repo **aún privado**.
2. [ ] `release.bat 1.0.0` desde un clon limpio.
3. [ ] Etiqueta `v1.0.0` sobre ese commit y subirla.
4. [ ] Release en GitHub: instalador, portable, `SHA256SUMS.txt` y notas del changelog.
5. [ ] Repo: descripción, topics, protección de `main`, avisos privados de seguridad, Dependabot.
6. [ ] Hacer público y comprobar desde sesión anónima.
