# Grabaciones de Valheim

| Fichero | Qué es |
|---|---|
| `registro.txt` | Líneas **reales** del registro del servidor 1.0.12: arranque, dificultad y modificadores, generación del mundo, «listo» y parada con Ctrl+Break |
| `a2s.json` | Consulta A2S **real** contra el servidor publicado (`-public 1`), en los dos puertos |
| `crossplay.txt` | Arranque **real** con `-crossplay`: el registro en PlayFab y el código para entrar |
| `sinteticas.txt` | Las dos líneas de conexión de jugadores, que **no** están grabadas: copiadas de las cadenas del binario |

## Sobre `a2s.json`

Grabado con el servidor arrancado con `-public 1` durante medio minuto y parado justo después. Lo
que enseña, y que no se sabía antes de grabarlo:

- **Solo contesta en el puerto de consulta** (el siguiente al de juego). En el de juego no responde
  ni publicado.
- El **nombre del mundo no sale**: `map` repite el nombre del servidor, y `game` viene vacío.
- La versión útil está en `keywords` (`g=1.0.12,n=40`), no en `version`, que dice «1.0.0.0».
- El campo `appId` viene a 0; el identificador del juego (892970) llega en `gameId`.
- `maxPlayers` es **10**, que es el límite real del juego.

No lleva ningún dato del usuario: el identificador que aparece es el del **servidor** (login anónimo
de Steam), no el de ninguna cuenta, y no hay rutas ni direcciones.

## Sobre `crossplay.txt`

Grabado arrancando con `-crossplay` y parando en cuanto llegó el código. Dos cosas que cambiaron el
código de la app:

- **Con crossplay no aparece «Opened Steam server».** La señal de «listo» es **«Opened PlayFab
  server»**; se esperaron tres minutos a la de Steam y no llega nunca. Buscando solo esa, un
  servidor con crossplay se quedaría «Arrancando» para siempre.
- **El servidor escribe la IP pública del equipo** en cuatro líneas, porque es la que registra en
  PlayFab. No puede acabar en una consola que se enseña y se copia y pega, así que `parseLine` la
  esconde y la borra hasta del texto que guarda.

Limpiado antes de traerlo al repo: la IP pública (sustituida por una de documentación, RFC 5737), el
identificador de PlayFab del equipo y los de la sesión (red, lobby y cadena de conexión). El código
de 6 dígitos se conserva: esa sesión murió al parar el servidor.

## Sobre `sinteticas.txt`

Si un día se graban de verdad, se sustituyen por la grabación y se quita el aviso del fichero.
