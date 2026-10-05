# Colaborar

Gracias por querer echar una mano. QubiQ Server Launcher lo mantiene una persona, así que lo que
más ayuda son los avisos de fallos bien explicados y los cambios pequeños y probados.

## Avisar de un fallo o proponer algo

- **Fallos y propuestas:** abre un [issue](https://github.com/AitorMencias/qubiq-server-launcher/issues/new/choose)
  con la plantilla que toque. En español o en inglés.
- **Problemas de seguridad:** nunca en un issue; sigue [SECURITY.md](SECURITY.md).
- **Un juego nuevo:** antes de ponerte a programarlo, abre un issue. Cada juego exige investigarlo
  de verdad (ver [INVESTIGACION-JUEGOS.md](INVESTIGACION-JUEGOS.md)) y decidir qué deja hacer.

## Cambios de código

1. Lee [docs/DESARROLLO.md](docs/DESARROLLO.md), sobre todo **«Cosas que conviene saber antes de
   tocar el código»**: muchas reglas salen de fallos reales.
2. Para algo más que un arreglo pequeño, abre antes un issue y lo hablamos.
3. Antes de mandar el pull request:
   - `npm run typecheck` y `npm run smoke` tienen que pasar.
   - Si tocas el núcleo, el supervisor o Minecraft: `npm run e2e -- paper` y `npm run e2e:restart`.
     Las demás pruebas, según lo que toques, están en la tabla de [CLAUDE.md](CLAUDE.md#pruebas).
   - Di en el pull request qué has probado y cómo, y qué no has podido probar.

### Reglas del proyecto

- **Todo en español:** textos de la interfaz, comentarios, documentación y mensajes de commit.
- **Ningún texto de la interfaz escrito a pelo.** Va con `t('clave')` a
  `src/shared/i18n/locales/es/` y a los otros nueve idiomas. Si no sabes traducir a alguno, déjalo
  dicho en el pull request y se resuelve allí.
- **Nunca logotipos oficiales** de los juegos: los iconos son dibujos propios.
- **No pruebes con tus servidores de verdad.** Las pruebas van con una carpeta de datos aparte
  (`setDataRoot`), nunca con `%APPDATA%\qubiq-server-launcher`.
- **Grabaciones de protocolos** (`scripts/smoke/fixtures/`): sin tu usuario, el nombre de tu
  equipo, IPs públicas (usa `203.0.113.x`) ni tokens de verdad. El smoke lo comprueba.
- **Cuidado con las pruebas que publican:** `e2e:rust` y `e2e:enshrouded` anuncian el servidor en
  la lista pública del juego, con tu IP.
- **Si moderas de una forma nueva**, apúntalo en el historial del servidor (`host.journal`).

## Licencia de lo que aportes

El proyecto es GPL-3.0-or-later. Al mandar un pull request aceptas que tu aportación se publique
bajo esa misma licencia, y confirmas que tienes derecho a hacerlo (es tuya, o es de un proyecto
con una licencia compatible y lo dices).
