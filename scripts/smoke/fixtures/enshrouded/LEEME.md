# Grabaciones de Enshrouded

| Fichero | Que es |
|---|---|
| `registro.txt` | Lineas **reales** del registro del servidor 0.9.0.0 por su salida estandar: arranque, ajustes efectivos, listo, guardado y parada con Ctrl+Break |
| `ajustes.txt` | Los ajustes que aplica de verdad **cada uno de los cuatro preajustes**, volcados por el propio servidor al arrancar |
| `preset-ignorado.txt` | La trampa de la fase, medida: el mismo `gameSettings` con tres preajustes distintos |
| `config-reescrito.json` | El `enshrouded_server.json` tal como lo deja **el servidor** tras arrancar y parar |
| `a2s.json` | Consulta de Steam **real** contra el servidor, en su puerto y en el siguiente |
| `shroudtopia.txt` | El cargador de mods **cargando de verdad** en el servidor dedicado, y lo que pasa al apagar un mod por configuracion |

## Sobre `preset-ignorado.txt`

Es la comprobacion que sostiene media fase. Las tres veces se arranco con el mismo
`gameSettings` (`playerHealthFactor: 2`, `enableStarvingDebuff: true`, `curseModifier: "Easy"`) y
solo se cambio `gameSettingsPreset`:

- `"Default"` -> el servidor aplica `1`, `false` y `"Normal"`: **los ignora**;
- `"Custom"` -> aplica `40000000` (= 2), `true` y `"Easy"`;
- `"Hard"` -> aplica los del preajuste.

Y no avisa de nada: el fichero se queda con los valores puestos, asi que mirandolo parece que estan
aplicados. Por eso la app pone `Custom` ella sola en cuanto algo se aparta del preajuste.

## Sobre `ajustes.txt`

El servidor vuelca por consola los ajustes efectivos (`[server] Game Settings 'Hard'` y un JSON
detras). Grabado arrancandolo una vez con cada preajuste, que es de donde salen los valores de
`EFFECTIVE_PRESETS`. El smoke los compara ajuste a ajuste: si una actualizacion del juego cambia lo
que hace un preajuste, salta aqui y hay que volver a medirlo.

Formato: los decimales salen en **hexadecimal IEEE-754** cuando no son exactos (`3fc00000` = 1,5) y
las duraciones son objetos `{value}` en nanosegundos.

## Sobre `config-reescrito.json`

Lo escribio el servidor, no la app. Es la prueba de tres cosas:

- **reescribe el fichero entero** y borra las claves que no conoce (se le colo una inventada a
  proposito y desaparecio);
- la lista de vetados se llama **`bannedAccounts`**, no `bans` como dice su propio README;
- cada veto lleva **`accountId`** (un numero, no un hash) y **`banDate` dentro de un objeto**.

Con los nombres del README, el servidor borra la lista entera al reescribir y la moderacion no
hace nada, sin un solo mensaje.

## Sobre `a2s.json`

Grabado con el servidor arrancado unos segundos y parado justo despues. Lo que ensena:

- **contesta en su unico puerto**, y en el siguiente no. Aqui el de consulta ES el de juego: desde
  el Content Update #2 no hay dos;
- `maxPlayers` es el `slotCount` configurado, y sale **marcado como protegido con contrasena**
  porque los roles la llevan;
- el identificador del juego (1203620) llega en `gameId`, no en `appId`, que viene a 0;
- `version` dice «0.0.15.0», que **no es** la version del juego (0.9.0.0).

No lleva ningun dato del usuario: el identificador que aparece es el del **servidor** (login
anonimo de Steam), no el de ninguna cuenta.

## Sobre `registro.txt`

Limpiado antes de traerlo al repo: las rutas con el nombre del usuario y **su IP publica**, que el
servidor escribe en `[online] Public ipv4` (sustituida por una de documentacion, RFC 5737). Esa
linea se deja a proposito: el smoke comprueba contra ella que la app la esconde y que le borra la
direccion hasta al texto que guarda.

Se han dejado tambien lineas de ruido del motor (hilos, cachés), porque el parser tiene que
distinguirlas de las que si dicen algo.

## Lo que NO esta grabado

Las lineas de **entrada y salida de jugadores**, que hacen falta dos clientes del juego. Se
reconocen por la forma que tienen en el ejecutable (`[online] Added peer`, `[server] Player '…'
logged in with Permissions`) y **no deciden nada**: cuantos hay dentro se le pregunta al servidor
por su consulta de Steam. Si algun dia se graban de verdad, se anaden aqui.
