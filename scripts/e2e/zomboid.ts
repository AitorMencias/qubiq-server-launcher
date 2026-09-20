/**
 * Prueba de extremo a extremo de Project Zomboid (fase 5), con el servidor real:
 *
 * 1. Instalación por SteamCMD (reutilizando la copia ya descargada si la hay).
 * 2. Primer arranque: el servidor escribe su configuración y genera el mundo.
 * 3. Puertos: el de juego, UDP; el segundo NO, porque va sin Steam.
 * 4. Arranque normal: «listo» por el registro y jugadores por la consola remota.
 * 5. Ajustes en caliente: cambiar una clave del `.ini` con el servidor en marcha.
 * 6. Cuentas: la de administrador que crea el servidor, y cambiarle el nivel.
 * 7. Reglas de la partida: se leen siempre y solo se cambian con el servidor parado.
 * 8. Copia en caliente: se le pide que guarde y se copia.
 * 9. Parada limpia con `quit`: guarda la partida y sale con código 0.
 * 10. Mods del taller: añadir uno de verdad, que el servidor lo cargue, apagarlo y quitarlo.
 * 11. Restauración de la copia.
 * 12. **Lo más importante:** que la carpeta de Zomboid del usuario
 *     (`%USERPROFILE%\Zomboid`) no se haya tocado.
 *
 * Nada de esto sale hacia fuera: el servidor arranca **sin Steam**, así que no
 * aparece en el navegador de servidores ni se anuncia en ningún sitio.
 *
 * ⚠ **No se puede enlazar la instalación compartida con un `mklink /J`**, que es
 * lo que hacen las pruebas de Valheim y Satisfactory para no descargar: Project
 * Zomboid **no arranca** si llega a su carpeta por un enlace (se cae generando
 * el mundo, porque no carga su Lua de servidor: «attempted index: biomes of
 * non-table»). Comprobado con la ruta real —arranca en 39 s— y con la misma
 * carpeta por un enlace —se cae a los 23 s—. Así que aquí se guarda una copia
 * de verdad en `e2e-zomboid-juego` y se **mueve** dentro de la instancia, que en
 * el mismo disco es instantáneo; al terminar se devuelve a su sitio.
 *
 * Ejecutar con:  npm run e2e:zomboid  [-- --descargar]
 */

import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { access, cp, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises'

import { setDataRoot, instanceDir } from '../../src/main/core/paths'
import { service } from '../../src/main/core/service'
import * as instances from '../../src/main/core/instances/manager'
import { gameFor } from '../../src/main/core/games/registry'
import { isUdpPortInUse } from '../../src/main/core/net/network'
import {
  gameDirFor,
  iniPathFor,
  javaPathFor,
  modsDirFor,
  sandboxPathFor,
  savePathFor,
  zomboidDirFor
} from '../../src/main/core/games/zomboid/adapter'
import { udpPortFor } from '../../src/shared/games/zomboid/types'
import type { ZomboidManifest } from '../../src/shared/types'

/** Aparte del puerto de siempre, por si el usuario tiene uno suyo en marcha. */
const PORT = 16271

let failed = 0

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  OK   ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed++
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * La carpeta donde Zomboid escribe si no se le dice otra cosa: la del juego del
 * usuario, con sus partidas de un jugador. Es la que esta prueba tiene que
 * dejar exactamente igual.
 */
function userGameDir(): string {
  return join(homedir(), 'Zomboid')
}

async function userFiles(): Promise<string[]> {
  return (await readdir(userGameDir()).catch(() => [])).sort()
}

async function waitForStatus(id: string, status: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await service.get(id)
    if (state.status === status) return true
    if (state.status === 'crashed') return false
    await sleep(2_000)
  }
  return false
}

async function main(): Promise<void> {
  const dev = join(process.env['LOCALAPPDATA'] ?? tmpdir(), 'qubiq-dev')
  const root = join(dev, 'e2e-zomboid')
  const compartido = join(dev, 'steam', 'zomboid')
  /** Copia de verdad del juego, que se reaprovecha entre ejecuciones. */
  const cache = join(dev, 'e2e-zomboid-juego')
  const reusar = !process.argv.includes('--descargar') && (await exists(compartido))

  // Si una ejecución anterior se cortó a medias, el juego se quedó dentro de la
  // instancia: se rescata antes de borrar nada, que son 6,7 GB.
  if (reusar && !(await exists(cache))) {
    for (const previa of await readdir(join(root, 'instances')).catch(() => [])) {
      const dentro = join(root, 'instances', previa, 'server', 'juego')
      if (await exists(join(dentro, 'jre64'))) {
        console.log('Rescatando el juego de la ejecución anterior')
        await rename(dentro, cache)
        break
      }
    }
  }

  await rm(root, { recursive: true, force: true })
  await mkdir(join(root, 'cache'), { recursive: true })
  setDataRoot(root)
  await service.initialize()
  console.log(`Datos en ${root}`)
  console.log(
    reusar
      ? `Reutilizando la instalación de ${compartido} (enlace, sin descargar)\n`
      : 'Instalando desde Steam: son unos 6,7 GB\n'
  )

  if (await isUdpPortInUse(PORT)) {
    console.error(`El puerto ${PORT} está ocupado. Cierra lo que lo esté usando y repite.`)
    process.exit(1)
  }

  // Foto de la carpeta del usuario ANTES de tocar nada.
  const antes = await userFiles()

  // --- 1. Crear e instalar -------------------------------------------------------

  console.log('== Creación e instalación')
  const manifest = (await instances.createInstance(
    {
      game: 'zomboid',
      name: 'Zomboid e2e',
      port: PORT,
      agreements: ['steam-subscriber'],
      exposure: { mode: 'local' },
      options: {
        adminPassword: 'qubiq-e2e',
        password: 'entrada-e2e',
        maxPlayers: 6,
        pvp: true,
        preset: 'apocalypse',
        // Sin Steam: esta prueba no anuncia el servidor en ningún sitio.
        useSteam: false,
        sandbox: { Zombies: 6 }
      }
    },
    gameFor('zomboid')
  )) as ZomboidManifest

  check('crea la instancia', manifest.data.preset === 'apocalypse')
  check('genera una contraseña de consola remota', manifest.data.rconPassword.length >= 20)
  check('y arranca sin Steam', manifest.data.useSteam === false)

  // El `.ini` se siembra al crear, ANTES del primer arranque: si no, ese
  // arranque usaría el puerto 16261 en vez del elegido.
  const iniSembrado = await readFile(iniPathFor(manifest.id), 'utf8').catch(() => '')
  check('deja el puerto puesto antes de arrancar nada', iniSembrado.includes(`DefaultPort=${PORT}`))
  check('y la contraseña de la consola remota', iniSembrado.includes('RCONPassword='))

  if (reusar) {
    if (!(await exists(cache))) {
      // Solo la primera vez: copiar 6,7 GB tarda, pero descargarlos tarda más.
      console.log('  ... copiando el juego a la caché de la prueba (solo la primera vez)')
      await cp(compartido, cache, { recursive: true })
    }
    await rm(gameDirFor(manifest.id), { recursive: true, force: true })
    // Mover, no copiar ni enlazar: en el mismo disco es instantáneo y la ruta
    // que ve el servidor es una ruta normal, que es lo único que le vale.
    await rename(cache, gameDirFor(manifest.id))
  }

  const t0 = Date.now()
  let ultimaFase = ''
  service.on('progress', (update: { phase: string; detail?: string }) => {
    if (update.phase !== ultimaFase) {
      ultimaFase = update.phase
      console.log(`  ... ${update.detail ?? update.phase}`)
    }
  })

  await service.install(manifest.id)
  const instalado = (await service.get(manifest.id)).manifest as ZomboidManifest

  check(
    'servidor instalado',
    await exists(javaPathFor(manifest.id)),
    `${((Date.now() - t0) / 1000).toFixed(0)} s`
  )
  check('anota la versión que dijo el servidor', instalado.data.gameVersion !== undefined, instalado.data.gameVersion)
  check('y la build de Steam', instalado.data.buildId !== undefined, instalado.data.buildId)

  // --- 2. Lo que dejó el primer arranque -------------------------------------------

  console.log('\n== Lo que escribió el servidor en su primer arranque')
  check('escribe su configuración', await exists(iniPathFor(manifest.id)))
  check('y las reglas de la partida', await exists(sandboxPathFor(manifest.id)))
  check('y genera el mundo', await exists(savePathFor(manifest.id)))
  check(
    'la base de datos de cuentas también',
    await exists(join(zomboidDirFor(manifest.id), 'db'))
  )

  const ini = await readFile(iniPathFor(manifest.id), 'utf8')
  check('el servidor completó el .ini entero', (ini.match(/^\w+=/gm) ?? []).length > 120, `${(ini.match(/^\w+=/gm) ?? []).length} claves`)
  check('con sus explicaciones', (ini.match(/^#/gm) ?? []).length > 100)
  check('respeta el puerto elegido', /^DefaultPort=16271$/m.test(ini))
  check('el límite de jugadores', /^MaxPlayers=6$/m.test(ini))
  check('el PvP', /^PVP=true$/m.test(ini))
  check('la contraseña de entrada', /^Password=entrada-e2e$/m.test(ini))
  // El propio servidor avisa de que UPnP puede colgarle el arranque.
  check('y deja UPnP apagado', /^UPnP=false$/m.test(ini))

  const sandbox = await service.zomboid.getSandbox(manifest.id)
  check('lee las reglas de la partida', sandbox.options.length > 250, `${sandbox.options.length} opciones`)
  const zombies = sandbox.options.find((o) => o.path.join('.') === 'Zombies')
  check('aplicó lo que se eligió al crear', zombies?.value === '6', zombies?.value)
  check('con su explicación, la del propio juego', (zombies?.description ?? '').length > 10)

  // --- 3. Arranque -----------------------------------------------------------------

  console.log('\n== Arranque')
  const t1 = Date.now()
  await service.start(manifest.id)
  const arrancado = await waitForStatus(manifest.id, 'running', 6 * 60_000)
  check('arranca y dice que ya acepta jugadores', arrancado, `${((Date.now() - t1) / 1000).toFixed(0)} s`)

  check('ocupa el puerto de juego (UDP)', await isUdpPortInUse(PORT))
  // Sin Steam, el segundo puerto ni se abre: por eso no se pide abrirlo.
  check('y NO el segundo, porque va sin Steam', !(await isUdpPortInUse(udpPortFor(PORT))))

  const info = await service.connectionInfo(manifest.id)
  check('la app lo da por accesible', info.ping.state === 'ok', info.ping.state)

  // Los jugadores no salen del registro: se le preguntan por la consola remota.
  await sleep(6_000)
  const estado = await service.get(manifest.id)
  check('sabe cuánta gente hay dentro', estado.playerCount === 0, String(estado.playerCount))

  // --- 4. Ajustes en caliente --------------------------------------------------------

  console.log('\n== Ajustes con el servidor en marcha')
  const ajustes = await service.zomboid.getSettings(manifest.id)
  check('lee los ajustes', ajustes.options.length > 120)
  check(
    'las claves que lleva la app no se editan aquí',
    ajustes.options.find((o) => o.path[0] === 'MaxPlayers')?.editable === false
  )
  check(
    'y la contraseña de la consola remota ni se enseña',
    ajustes.options.find((o) => o.path[0] === 'RCONPassword')?.value === '(oculta)'
  )

  const tras = await service.zomboid.setSettings(manifest.id, [
    { path: ['AnnounceDeath'], value: true }
  ])
  check(
    'cambia un ajuste en caliente por la consola remota',
    tras.options.find((o) => o.path[0] === 'AnnounceDeath')?.value === 'true'
  )

  let bloqueado = false
  try {
    await service.zomboid.setSettings(manifest.id, [{ path: ['MaxPlayers'], value: 3 }])
  } catch {
    bloqueado = true
  }
  check('y no deja tocar las que lleva la app', bloqueado)

  // --- 5. Cuentas ----------------------------------------------------------------------

  console.log('\n== Cuentas y moderación')
  const cuentas = await service.zomboid.listAccounts(manifest.id)
  check('ve las cuentas del servidor', cuentas.length >= 1, cuentas.map((c) => `${c.username}:${c.role}`).join(', '))
  const admin = cuentas.find((c) => c.username === 'admin')
  check('la de administrador que crea el servidor', admin !== undefined)
  check('con nivel de administrador', admin?.role === 'admin', admin?.role)

  const tocada = await service.zomboid.setRole(manifest.id, 'admin', 'moderator')
  check('le cambia el nivel', tocada.find((c) => c.username === 'admin')?.role === 'moderator')
  const devuelta = await service.zomboid.setRole(manifest.id, 'admin', 'admin')
  check('y se lo devuelve', devuelta.find((c) => c.username === 'admin')?.role === 'admin')

  const nueva = await service.zomboid.addAccount(manifest.id, 'invitado-e2e', 'clave-e2e')
  check('da de alta a alguien a mano', nueva.some((c) => c.username === 'invitado-e2e'))

  // ⚠ La razón va en una sola palabra a propósito: con varias, el servidor
  // contesta con la ayuda del comando y no veta a nadie (comprobado).
  const vetada = await service.zomboid.setRole(manifest.id, 'invitado-e2e', 'banned', 'prueba e2e')
  check('y lo veta', vetada.find((c) => c.username === 'invitado-e2e')?.role === 'banned')

  const readmitida = await service.zomboid.setRole(manifest.id, 'invitado-e2e', 'user')
  check('y lo readmite', readmitida.find((c) => c.username === 'invitado-e2e')?.role === 'user')

  // --- 6. Reglas de la partida con el servidor en marcha --------------------------------

  let reglasBloqueadas = false
  try {
    await service.zomboid.setSandbox(manifest.id, [{ path: ['Zombies'], value: 4 }])
  } catch {
    reglasBloqueadas = true
  }
  check('no deja cambiar las reglas con el servidor arrancado', reglasBloqueadas)

  // --- 7. Copia en caliente -------------------------------------------------------------

  console.log('\n== Copia de seguridad en caliente')
  const t2 = Date.now()
  const backup = await service.createBackup(manifest.id, 'e2e')
  check(
    'le pide guardar y copia después',
    backup.sizeBytes > 0,
    `${(backup.sizeBytes / 1024 / 1024).toFixed(1)} MB en ${((Date.now() - t2) / 1000).toFixed(0)} s`
  )
  check('anota la dificultad en la copia', backup.variant === 'Apocalipsis', backup.variant)

  // --- 8. Parada limpia -------------------------------------------------------------------

  console.log('\n== Parada limpia (quit por la consola)')
  const t3 = Date.now()
  await service.stop(manifest.id)
  const stopMs = Date.now() - t3
  check('para y sale solo', (await service.get(manifest.id)).status === 'stopped', `${(stopMs / 1000).toFixed(1)} s`)
  // Si hubiera hecho falta matarlo habrían pasado los 180 s del plazo.
  check('sin tener que matarlo', stopMs < 120_000)
  check('suelta el puerto', !(await isUdpPortInUse(PORT)))

  // --- 9. Reglas de la partida con el servidor parado ---------------------------------------

  console.log('\n== Reglas de la partida (servidor parado)')
  const antesLua = await readFile(sandboxPathFor(manifest.id), 'utf8')
  const cambiadas = await service.zomboid.setSandbox(manifest.id, [
    { path: ['Zombies'], value: 4 },
    { path: ['ZombieLore', 'Speed'], value: 2 }
  ])
  const regla = (path: string): string | undefined =>
    cambiadas.options.find((o) => o.path.join('.') === path)?.value
  check('cambia una regla suelta', regla('Zombies') === '4', regla('Zombies'))
  check('y otra de dentro de una tabla', regla('ZombieLore.Speed') === '2', regla('ZombieLore.Speed'))
  const despuesLua = await readFile(sandboxPathFor(manifest.id), 'utf8')
  check(
    'sin perder un solo comentario del juego',
    (antesLua.match(/^\s*--/gm) ?? []).length === (despuesLua.match(/^\s*--/gm) ?? []).length
  )
  const distintas = antesLua.split(/\r?\n/).filter((l, i) => l !== despuesLua.split(/\r?\n/)[i])
  check('y tocando solo esas dos líneas', distintas.length === 2, distintas.join(' | '))

  // --- 10. Mods del taller ------------------------------------------------------------------

  console.log('\n== Mods del taller de Steam')
  // Un mod real, pequeño (70 KB) y de la Build 42. Se descarga sin cuenta.
  const MOD = '3802614552'
  const conMod = await service.zomboid.addMod(manifest.id, `https://steamcommunity.com/sharedfiles/filedetails/?id=${MOD}`)
  check('añade un mod del taller por su enlace', conMod.length === 1, String(conMod.length))
  check('le pone el nombre que dice Steam', (conMod[0]?.ref.title ?? '').length > 3, conMod[0]?.ref.title)
  check('y lo deja encendido', conMod[0]?.ref.enabled === true)

  const mod = conMod[0]?.mods[0]
  check('lee lo que trae dentro', mod !== undefined, `${conMod[0]?.mods.length} mods`)
  check('con su identificador de carga', mod?.id === 'GetInTheDamnCar', mod?.id)
  check('y la carpeta de versión que le sirve', mod?.version !== null, `${mod?.version}`)
  check('sin problemas que contar', conMod[0]?.problem === undefined, conMod[0]?.problem)
  check('el mod está en la carpeta del servidor', await exists(join(modsDirFor(manifest.id), mod!.folder)))

  // Un id que no existe se rechaza sin dejar nada a medias.
  let rechazado = ''
  try {
    await service.zomboid.addMod(manifest.id, '999999999999')
  } catch (err) {
    rechazado = err instanceof Error ? err.message : String(err)
  }
  check('un mod que no existe se rechaza con sentido', /enlace/i.test(rechazado), rechazado)
  check('y no se queda apuntado', (await service.zomboid.listMods(manifest.id)).length === 1)

  // Lo que de verdad importa: que el servidor lo cargue.
  console.log('  ... arrancando con el mod puesto')
  await service.start(manifest.id)
  const conModArrancado = await waitForStatus(manifest.id, 'running', 6 * 60_000)
  check('el servidor arranca con el mod', conModArrancado)

  const iniConMod = await readFile(iniPathFor(manifest.id), 'utf8')
  check('la app ha escrito Mods= sola', /^Mods=GetInTheDamnCar$/m.test(iniConMod), /^Mods=.*$/m.exec(iniConMod)?.[0])
  // ⚠ Esta clave se queda vacía a propósito: es para que el servidor se los baje
  // por Steam, y este arranca sin Steam.
  check('y ha dejado WorkshopItems vacío', /^WorkshopItems=$/m.test(iniConMod))
  check('y el mapa del juego el último en Map=', /^Map=Muldraugh, KY$/m.test(iniConMod), /^Map=.*$/m.exec(iniConMod)?.[0])

  const registro = (await readFile(join(instanceDir(manifest.id), 'launcher.log'), 'utf8')).slice(-40000)
  check('y el servidor dice que lo carga', /Mod cargado: GetInTheDamnCar/.test(registro))
  check('sin quejarse de que le falte', !/No se encuentra el mod/.test(registro))

  await service.stop(manifest.id)
  check('para con el mod puesto', (await service.get(manifest.id)).status === 'stopped')

  const apagado = await service.zomboid.setModEnabled(manifest.id, MOD, false)
  check('se puede apagar sin borrarlo', apagado[0]?.ref.enabled === false)
  check('y sigue en disco', await exists(join(modsDirFor(manifest.id), mod!.folder)))

  const sinMods = await service.zomboid.removeMod(manifest.id, MOD)
  check('se puede quitar', sinMods.length === 0)
  check('y desaparece del disco', !(await exists(join(modsDirFor(manifest.id), mod!.folder))))

  // --- 11. Restauración -----------------------------------------------------------------------

  console.log('\n== Restauración')
  await service.restoreBackup(manifest.id, backup.fileName)
  check('restaura la partida', await exists(savePathFor(manifest.id)))
  const ficheros = await readdir(savePathFor(manifest.id)).catch(() => [])
  check('con sus ficheros', ficheros.length > 0, `${ficheros.length} ficheros`)
  check('y la base de datos de cuentas', await exists(join(zomboidDirFor(manifest.id), 'db')))

  // --- 12. La comprobación que más importa ------------------------------------------------------

  console.log('\n== Aislamiento de los datos del juego del usuario')
  const despues = await userFiles()
  check(
    'no ha escrito nada en la carpeta Zomboid del usuario',
    antes.length === despues.length && antes.every((f, i) => f === despues[i]),
    despues.filter((f) => !antes.includes(f)).join(', ') || 'sin cambios'
  )

  // --- Limpieza -----------------------------------------------------------------------------------

  if (reusar) {
    // El juego vuelve a su caché antes de borrar la instancia: si se fuera con
    // ella, la siguiente ejecución tendría que copiar otros 6,7 GB.
    await rename(gameDirFor(manifest.id), cache)
    check('devuelve el juego a la caché de la prueba', await exists(join(cache, 'jre64')))
  }

  await service.remove(manifest.id)
  check('borra el servidor', !(await exists(instanceDir(manifest.id))))

  if (reusar) {
    const sigue = await stat(compartido).catch(() => null)
    check('la instalación compartida sigue intacta', sigue !== null)
  }

  console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} fallos.`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
