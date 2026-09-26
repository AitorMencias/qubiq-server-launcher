import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { check, section } from './harness'
import {
  diagnoseExit,
  parseLine,
  randomPassword,
  defaultRoles
} from '../../src/main/core/games/enshrouded/adapter'
import { bansOf, banToRaw, buildConfig, effectivePreset } from '../../src/main/core/games/enshrouded/config'
import * as mods from '../../src/main/core/games/enshrouded/mods'
import { parseInfo } from '../../src/main/core/net/a2s'
import { capabilitiesFor, gameInfo, serverPorts } from '../../src/shared/games'
import {
  EFFECTIVE_PRESETS,
  ENSHROUDED_GAME_APP_ID,
  MAX_PLAYERS,
  PERMISSIONS,
  PRESETS,
  SETTINGS,
  TAGS,
  changedFromPreset,
  minutesToNanos,
  nanosToMinutes,
  presetSettings,
  roleProblems,
  validWorldName
} from '../../src/shared/games/enshrouded/types'
import type { EnshroudedManifest } from '../../src/shared/types'

/**
 * Prueba de humo de Enshrouded (fase 6).
 *
 * Todo va contra grabaciones **reales** del servidor 0.9.0.0, porque este juego
 * no tiene ni consola ni API que fingir: lo único que hay es un fichero JSON,
 * un registro por consola y la consulta de Steam.
 *
 * Lo que de verdad protege esta prueba, y por lo que existe:
 *
 * 1. **Que no se cuele la IP pública del usuario en la consola.** El servidor
 *    la escribe en su registro, como Valheim con crossplay.
 * 2. **Que el preajuste pase a `Custom` en cuanto se toca un ajuste.** Con
 *    cualquier otro, el servidor los ignora sin decir nada. Está medido en
 *    `preset-ignorado.txt`.
 * 3. **Que se escriba `bannedAccounts` y no `bans`.** El README oficial dice lo
 *    segundo y el servidor borra lo que no conoce, así que con el nombre del
 *    README la moderación no haría nada.
 * 4. **Que los preajustes digan lo que de verdad aplican**, contra el volcado
 *    del propio servidor (`ajustes.txt`).
 */

const FIXTURES = join(process.cwd(), 'scripts', 'smoke', 'fixtures', 'enshrouded')

async function lineas(fichero: string): Promise<string[]> {
  const raw = await readFile(join(FIXTURES, fichero), 'utf8')
  return raw.split(/\r?\n/).filter((l) => l.trim().length > 0 && !l.startsWith('//'))
}

function manifestoDePrueba(overrides: Partial<EnshroudedManifest> = {}): EnshroudedManifest {
  return {
    schemaVersion: 2,
    id: 'prueba',
    name: 'Servidor de prueba',
    game: 'enshrouded',
    port: 15637,
    expectedPlayers: 4,
    autoRestart: false,
    backup: { enabled: false, intervalHours: 6, keep: 3 },
    createdAt: new Date().toISOString(),
    agreements: ['steam-subscriber'],
    data: {
      worldName: 'Prueba',
      preset: 'Hard',
      settings: presetSettings('Hard'),
      roles: [
        {
          name: 'Admin',
          password: 'admin-secreta',
          canKickBan: true,
          canAccessInventories: true,
          canEditWorld: true,
          canEditBase: true,
          canExtendBase: true,
          reservedSlots: 0
        },
        {
          name: 'Friend',
          password: 'amigo-secreta',
          canKickBan: false,
          canAccessInventories: true,
          canEditWorld: true,
          canEditBase: true,
          canExtendBase: false,
          reservedSlots: 0
        }
      ],
      tags: ['LookingForPlayers', 'Spanish'],
      enableTextChat: true,
      enableVoiceChat: false,
      voiceChatMode: 'Proximity'
    },
    ...overrides
  } as EnshroudedManifest
}

export async function enshroudedSmoke(): Promise<void> {
  // --- El fichero de configuración --------------------------------------------

  await section('Enshrouded: lo que se le escribe al servidor', async () => {
    const config = buildConfig(manifestoDePrueba(), null)

    check('el mundo va dentro de la instancia', config.saveDirectory === './mundos/Prueba')
    check('los registros del juego también', config.logDirectory === './registros')
    check('el puerto es el del manifiesto', config.queryPort === 15637)
    check('las plazas salen de los jugadores esperados', config.slotCount === 4)
    check('escucha en todas las interfaces', config.ip === '0.0.0.0')
    check('los roles viajan enteros', config.userGroups.length === 2)
    check('con su contraseña', config.userGroups[0]!.password === 'admin-secreta')
    check('las etiquetas también', config.tags.join(',') === 'LookingForPlayers,Spanish')

    // ⚠ El nombre de la lista de vetados es `bannedAccounts`. El README oficial
    // dice `bans`, y con ese nombre el servidor la borra al reescribir el
    // fichero: la moderación no haría nada y nadie se enteraría.
    check(
      'la lista de vetados se llama bannedAccounts',
      Object.prototype.hasOwnProperty.call(config, 'bannedAccounts')
    )
    check('y no bans', !Object.prototype.hasOwnProperty.call(config, 'bans'))

    // Las plazas nunca se salen del rango del juego.
    const muchos = buildConfig(manifestoDePrueba({ expectedPlayers: 99 }), null)
    check('nunca más plazas de las que admite el juego', muchos.slotCount === MAX_PLAYERS)
    const pocos = buildConfig(manifestoDePrueba({ expectedPlayers: 0 }), null)
    check('ni menos de una', pocos.slotCount === 1)
  })

  await section('Enshrouded: los vetados sobreviven a que la app reescriba', async () => {
    // El caso real: el usuario veta a alguien DENTRO del juego, el servidor lo
    // escribe en el fichero y después la app vuelve a generarlo al arrancar.
    const anterior = JSON.parse(
      await readFile(join(FIXTURES, 'config-reescrito.json'), 'utf8')
    ) as Record<string, unknown>

    const previos = bansOf(anterior)
    check('se lee el veto que dejó el servidor', previos.length === 1)
    check('con su nombre de Steam', previos[0]!.displayName === 'alguien')
    check('y su personaje', previos[0]!.characterName === 'Alguien')
    check('la fecha viene dentro de un objeto {value}', previos[0]!.banDate > 0)

    const config = buildConfig(manifestoDePrueba(), anterior)
    check('y sigue ahí después de que la app reescriba el fichero', config.bannedAccounts.length === 1)

    // Y la forma con la que se devuelve es la suya, no la del README.
    const raw = banToRaw(previos[0]!) as Record<string, unknown>
    check('se devuelve con accountId', typeof raw['accountId'] === 'number')
    check('y con banDate como objeto', typeof raw['banDate'] === 'object')
    check('no con accountIDHash, que es lo que dice el README', !('accountIDHash' in raw))
  })

  // --- La trampa de la fase ---------------------------------------------------

  await section('Enshrouded: un ajuste tocado obliga a poner Custom', async () => {
    // Medido: con el preajuste «Default» y playerHealthFactor 2 en el fichero,
    // el servidor aplica 1 y no avisa de nada (fixtures/preset-ignorado.txt).
    const sinTocar = manifestoDePrueba({
      data: { ...manifestoDePrueba().data, preset: 'Default', settings: presetSettings('Default') }
    } as Partial<EnshroudedManifest>)
    check('sin tocar nada se respeta el preajuste', effectivePreset(sinTocar) === 'Default')

    const tocado = manifestoDePrueba({
      data: {
        ...manifestoDePrueba().data,
        preset: 'Default',
        settings: { ...presetSettings('Default'), playerHealthFactor: 2 }
      }
    } as Partial<EnshroudedManifest>)
    check('con un ajuste cambiado pasa a Custom', effectivePreset(tocado) === 'Custom')
    check(
      'y el fichero lleva el valor tocado',
      buildConfig(tocado, null).gameSettings['playerHealthFactor'] === 2
    )

    // Y al revés: con un preajuste sin tocar, lo que se escribe son SUS valores
    // medidos, no los que hubiera guardados.
    const escrito = buildConfig(sinTocar, null)
    check(
      'con preajuste se escriben sus valores de verdad',
      escrito.gameSettings['randomSpawnerAmount'] === 'Normal'
    )

    check(
      'changedFromPreset encuentra lo que se aparta',
      changedFromPreset('Default', { ...presetSettings('Default'), curseModifier: 'Easy' }).join(
        ','
      ) === 'curseModifier'
    )
    check(
      'y no se inventa cambios donde no los hay',
      changedFromPreset('Survival', presetSettings('Survival')).length === 0
    )
  })

  await section('Enshrouded: los preajustes dicen lo que el servidor aplica', async () => {
    // El propio servidor vuelca sus ajustes efectivos al arrancar. Si Keen
    // cambia lo que hace un preajuste, esto salta y hay que volver a medirlo.
    const bloques = (await readFile(join(FIXTURES, 'ajustes.txt'), 'utf8'))
      .split(/\n(?=\[server\] Game Settings)/)
      .filter((b) => b.includes('Game Settings'))

    check('están grabados los cuatro preajustes', bloques.length === 4, `${bloques.length}`)

    for (const bloque of bloques) {
      const nombre = /Game Settings '(\w+)'/.exec(bloque)?.[1]
      if (!nombre || nombre === 'Custom') continue
      const json = bloque.slice(bloque.indexOf('{'))
      const volcado = JSON.parse(json) as Record<string, unknown>
      const esperado = EFFECTIVE_PRESETS[nombre as keyof typeof EFFECTIVE_PRESETS]
      check(`el preajuste ${nombre} está en la app`, esperado !== undefined)
      if (!esperado) continue

      let iguales = 0
      let distintos: string[] = []
      for (const [clave, valor] of Object.entries(volcado)) {
        const nuestro = esperado[clave]
        const suyo =
          valor && typeof valor === 'object' && 'value' in (valor as Record<string, unknown>)
            ? (valor as Record<string, number>)['value']
            : decodeFloat(valor)
        if (nuestro === suyo) iguales++
        else distintos.push(`${clave}: ${String(suyo)} != ${String(nuestro)}`)
      }
      check(
        `${nombre}: los ${Object.keys(volcado).length} ajustes coinciden con el servidor`,
        distintos.length === 0,
        distintos.slice(0, 3).join(' · ')
      )
      check(`${nombre}: se han comparado todos`, iguales === Object.keys(volcado).length)
    }
  })

  await section('Enshrouded: los ajustes del catálogo existen de verdad', async () => {
    // Si una actualización del juego renombra un ajuste, la pantalla enseñaría
    // un control que no hace nada. Se comprueba contra el volcado del servidor.
    const delJuego = new Set(Object.keys(await volcadoDe('Default')))

    const inventados = SETTINGS.filter((s) => !delJuego.has(s.key)).map((s) => s.key)
    check(
      `los ${SETTINGS.length} ajustes de la pantalla son claves reales del juego`,
      inventados.length === 0,
      inventados.join(', ')
    )
    const olvidados = [...delJuego].filter((k) => !SETTINGS.some((s) => s.key === k))
    check('y no falta ninguno por enseñar', olvidados.length === 0, olvidados.join(', '))

    const basicos = SETTINGS.filter((s) => s.basic)
    check('el modo básico enseña unos pocos', basicos.length > 3 && basicos.length < 12)
  })

  // --- El registro -------------------------------------------------------------

  await section('Enshrouded: lectura del registro real', async () => {
    const raw = await lineas('registro.txt')
    const eventos = raw.map(parseLine)

    const listos = eventos.filter((e) => e.ready)
    check('se detecta «listo» una sola vez', listos.length === 1)
    check(
      'y se dice en cristiano',
      listos[0]?.text.includes('acepta jugadores') === true,
      listos[0]?.text
    )

    // ⚠ LO MÁS IMPORTANTE: la IP pública del usuario no puede salir en la
    // consola, que se enseña y se copia y se pega.
    const conIp = eventos.filter((e) => /\d{1,3}(\.\d{1,3}){3}/.test(e.text))
    check('ninguna línea enseña una dirección IP', conIp.length === 0, conIp[0]?.text)

    const publicIp = raw.find((l) => l.includes('Public ipv4'))
    check('la línea de la IP pública está en la grabación', publicIp !== undefined)
    if (publicIp) {
      const evento = parseLine(publicIp)
      check('y se esconde', evento.hidden === true)
      check('y se le borra la dirección hasta al texto guardado', evento.text.includes('<dirección>'))
    }

    const guardado = eventos.find((e) => e.text === 'Mundo guardado.')
    check('se reconoce el guardado, que es lo que espera la copia en caliente', guardado !== undefined)

    const ajustes = eventos.find((e) => e.text.startsWith('Dificultad en uso'))
    check('se dice qué dificultad ha aplicado de verdad', ajustes !== undefined, ajustes?.text)

    const cierre = eventos.find((e) => e.text.includes('Cerrando el servidor'))
    check('se reconoce la parada con Ctrl+Break', cierre !== undefined)

    // Ruido: el servidor escribe cientos de líneas de motor por arranque.
    const escondidas = eventos.filter((e) => e.hidden).length
    check(
      'la mayor parte del registro no se enseña, porque es ruido del motor',
      escondidas > eventos.length / 2,
      `${escondidas} de ${eventos.length}`
    )
    check('pero algo se enseña', escondidas < eventos.length)
  })

  await section('Enshrouded: el cargador de mods se traduce', async () => {
    const raw = await lineas('shroudtopia.txt')
    const eventos = raw.map(parseLine)

    const encontrados = eventos.filter((e) => e.text.startsWith('Mod encontrado:'))
    check('se listan los mods que encuentra', encontrados.length === 10, `${encontrados.length}`)

    // El fallo que importa: un mod que no encaja con la versión del juego. No
    // tumba el servidor y solo se ve aquí.
    const roto = eventos.find((e) => e.level === 'warn' && e.text.includes('no encaja'))
    check('se avisa del mod que no encaja con esta versión', roto !== undefined, roto?.text)

    const enMarcha = eventos.find((e) => e.text.includes('Shroudtopia en marcha'))
    check('y de que el cargador ha arrancado', enMarcha !== undefined)
  })

  await section('Enshrouded: diagnóstico de cierres', async () => {
    // 0xC000013A: se mandó Ctrl+Break antes de que el servidor tuviera su
    // manejador puesto. Medido: pasa si se para mientras arranca.
    const pronto = diagnoseExit(3221225786, [])
    check('se reconoce la parada durante el arranque', pronto.code === 'stopped-while-starting')
    check('y se dice si se pierde algo', pronto.detail.includes('copia de seguridad'))

    const puerto = diagnoseExit(1, ['[net] Failed to bind socket'])
    check('puerto ocupado', puerto.code === 'port-in-use')
    check('con botón para cambiarlo', puerto.action?.kind === 'change-port')

    const memoria = diagnoseExit(1, ['std::bad_alloc'])
    check('sin memoria', memoria.code === 'out-of-memory')

    const steam = diagnoseExit(1, ['[online] Server failed to connected to Steam 3'])
    check('sin Steam', steam.code === 'steam-unreachable')

    const cualquiera = diagnoseExit(42, ['nada que ver'])
    check('y lo desconocido dice el código', cualquiera.detail.includes('42'))
  })

  // --- La consulta de Steam -----------------------------------------------------

  await section('Enshrouded: consulta de Steam grabada', async () => {
    const grabado = JSON.parse(await readFile(join(FIXTURES, 'a2s.json'), 'utf8')) as Record<
      string,
      { info: { log: { dir: string; hex: string }[]; timeout?: boolean } }
    >

    const puertos = Object.keys(grabado)
    const consulta = puertos[0]!
    const siguiente = puertos[1]!

    // Contesta en su único puerto y en ninguno más. A diferencia de Valheim, no
    // hay puerto de consulta aparte: es el mismo.
    check('contesta en su puerto', grabado[consulta]!.info.timeout !== true)
    check('y en el siguiente no', grabado[siguiente]!.info.timeout === true)

    const respuesta = grabado[consulta]!.info.log.find((e) => e.dir === 'in' && e.hex[8] === '4')
    const payload = Buffer.from(
      grabado[consulta]!.info.log.filter((e) => e.dir === 'in').at(-1)!.hex,
      'hex'
    )
    check('la respuesta es del tipo esperado', respuesta !== undefined)

    const info = parseInfo(payload.subarray(4))
    check('se lee el nombre del servidor', info.name === 'QubiQ fase 6', info.name)
    check('el juego es Enshrouded', info.game === 'Enshrouded', info.game)
    check('las plazas son las configuradas', info.maxPlayers === 4, `${info.maxPlayers}`)
    check('no había nadie dentro', info.players === 0)
    // Con los roles con contraseña, el servidor se anuncia como protegido: es la
    // única forma de que no entre cualquiera, porque publicarse no se puede evitar.
    check('sale marcado como protegido con contraseña', info.passwordProtected)
    check('el identificador del juego llega en gameId', info.gameId === String(ENSHROUDED_GAME_APP_ID))
    check('y el puerto que anuncia es el suyo', info.gamePort === 15650, `${info.gamePort}`)
  })

  // --- Catálogo y capacidades ---------------------------------------------------

  await section('Enshrouded: puertos y capacidades', async () => {
    const puertos = serverPorts(manifestoDePrueba())
    check('un solo puerto que abrir', puertos.length === 1)
    check('y es UDP', puertos[0]!.protocol === 'udp')
    check('el del manifiesto', puertos[0]!.port === 15637)

    const caps = capabilitiesFor(manifestoDePrueba())
    check('no hay consola de comandos', !caps.commands)
    check('ni nombres de jugador', !caps.playerNames)
    check('ni identificadores', !caps.playerIds)
    // Quitar un veto es moderar, y es lo único que hay.
    check('pero sí moderación', caps.moderation)
    check('tiene mods', caps.content)
    check('y ajustes', caps.settings)
    check('no tiene crossplay', !caps.crossplay)

    const info = gameInfo('enshrouded')
    check('se avisa de que siempre sale en la lista', info.card.highlights.some((h) => h.tone === 'warn'))
    check('se explica lo que no se puede moderar', info.moderationHint?.includes('no está implementado') === true)
    check('hay pasos para entrar', (info.joinSteps?.length ?? 0) >= 3)
    check('y el aviso de las contraseñas por rol', info.joinWarning?.includes('por rol') === true)
  })

  await section('Enshrouded: reglas de los roles', async () => {
    const base = manifestoDePrueba().data.roles

    check('los de prueba valen', roleProblems(base) === null)

    // Dos reglas que el servidor trata como error interno: si se cuelan, no
    // arranca y el usuario no entiende por qué.
    const mismaClave = base.map((r) => ({ ...r, password: 'la-misma' }))
    check(
      'dos roles con la misma contraseña se rechazan',
      roleProblems(mismaClave)?.includes('misma contraseña') === true
    )

    const dosAbiertos = base.map((r) => ({ ...r, password: '' }))
    check(
      'dos roles sin contraseña también',
      roleProblems(dosAbiertos)?.includes('sin contraseña') === true
    )

    const corta = [{ ...base[0]!, password: 'abc' }, base[1]!]
    check('una contraseña corta se rechaza', roleProblems(corta) !== null)

    check('sin roles no se puede entrar', roleProblems([]) !== null)

    const repetidos = [base[0]!, { ...base[1]!, name: 'Admin' }]
    check('dos roles con el mismo nombre se rechazan', roleProblems(repetidos) !== null)

    // Uno solo sin contraseña sí vale: es la forma de tener el servidor abierto.
    const unoAbierto = [base[0]!, { ...base[1]!, password: '' }]
    check('uno solo sin contraseña sí vale', roleProblems(unoAbierto) === null)

    // Los cuatro roles de serie nacen con contraseña propia.
    const serie = defaultRoles()
    check('los cuatro roles de serie traen contraseña', serie.every((r) => r.password.length >= 6))
    check('y todas distintas', new Set(serie.map((r) => r.password)).size === 4)
    check('los permisos son los cinco del juego', PERMISSIONS.length === 5)
    check('y una contraseña sorteada no se repite', randomPassword('x') !== randomPassword('x'))
  })

  await section('Enshrouded: catálogo y conversiones', async () => {
    check('hay cinco preajustes', PRESETS.length === 5)
    check('uno es «a mi manera»', PRESETS.some((p) => p.value === 'Custom'))
    check('las etiquetas incluyen español', TAGS.some((t) => t.value === 'Spanish'))

    check('nombre de mundo normal', validWorldName('Mi mundo 1'))
    check('con acentos y eñes', validWorldName('Montaña Ñoño'))
    // Es el nombre de una carpeta: con algo raro el servidor guarda donde no toca.
    check('sin barras', !validWorldName('mundo/otro'))
    check('sin dos puntos', !validWorldName('C:mundo'))
    check('ni vacío', !validWorldName(''))

    // El juego guarda las duraciones en nanosegundos; la pantalla, en minutos.
    check('media hora son 1.800.000.000.000 ns', minutesToNanos(30) === 1_800_000_000_000)
    check('y de vuelta', nanosToMinutes(1_800_000_000_000) === 30)
    check('el día de serie dura 30 min', nanosToMinutes(Number(EFFECTIVE_PRESETS.Default['dayTimeDuration'])) === 30)
    check('la noche, 12', nanosToMinutes(Number(EFFECTIVE_PRESETS.Default['nightTimeDuration'])) === 12)
  })

  await section('Enshrouded: comparación de versiones del cargador', async () => {
    check('0.1.10 es más nueva que 0.1.1', mods.compareVersions('0.1.10', '0.1.1') > 0)
    check('y 0.1.1 que 0.0.3', mods.compareVersions('0.1.1', '0.0.3') > 0)
    check('la misma es la misma', mods.compareVersions('0.1.1', '0.1.1') === 0)

    check('el cargador deja su winmm.dll', mods.LOADER_PATHS.includes('winmm.dll'))
    check('y su dll', mods.LOADER_PATHS.includes('shroudtopia.dll'))
    // ⚠ `mods/` NO está en la lista a propósito: ahí viven los mods del usuario
    // y quitar el cargador no puede llevárselos por delante.
    check('pero no la carpeta de mods', !mods.LOADER_PATHS.includes('mods'))
    check('se aceptan .dll y .zip', mods.ACCEPTED_EXTENSIONS.join(',') === '.dll,.zip')
  })

  // --- Contrato con GitHub ------------------------------------------------------

  await section('Enshrouded: contrato con las publicaciones de Shroudtopia', async () => {
    const release = await mods.latestLoader()
    check('hay una versión publicada', release.version.length > 0, release.version)
    check('con su paquete .zip', release.url.endsWith('.zip'), release.url)
    check('servido por GitHub', release.url.startsWith('https://github.com/'))
  })
}

/**
 * El volcado de ajustes efectivos de un preajuste, sacado de la grabación.
 *
 * Se corta por la cabecera de cada bloque («[server] Game Settings 'X'») y no
 * buscando llaves: hay duraciones que son objetos, así que la primera `}` del
 * texto está dentro del propio JSON.
 */
async function volcadoDe(preset: string): Promise<Record<string, unknown>> {
  const texto = await readFile(join(FIXTURES, 'ajustes.txt'), 'utf8')
  const bloque = texto
    .split(/\n(?=\[server\] Game Settings)/)
    .find((b) => b.includes(`Game Settings '${preset}'`))
  if (!bloque) throw new Error(`No está grabado el preajuste ${preset}`)
  return JSON.parse(bloque.slice(bloque.indexOf('{'))) as Record<string, unknown>
}

/**
 * Los decimales que el servidor vuelca en hexadecimal IEEE-754 («3fc00000» =
 * 1,5). Los enteros los escribe como número, así que «1» es 1.
 */
function decodeFloat(value: unknown): unknown {
  if (typeof value !== 'string') return value
  if (/^[0-9a-f]{8}$/i.test(value) && value !== '1') {
    const buffer = Buffer.alloc(4)
    buffer.writeUInt32BE(Number.parseInt(value, 16))
    return Number(buffer.readFloatBE(0).toFixed(4))
  }
  const numero = Number(value)
  return Number.isNaN(numero) ? value : numero
}
