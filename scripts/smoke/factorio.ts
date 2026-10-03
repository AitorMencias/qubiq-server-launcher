import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { check, section } from './harness'
import { diagnoseExit, parseLine } from '../../src/main/core/games/factorio/adapter'
import { capabilitiesFor, gameInfo, serverPorts } from '../../src/shared/games'
import {
  DEFAULT_GAME_PORT,
  MIN_PASSWORD_LENGTH,
  PRESETS,
  modList,
  presetInfo,
  serverSettings,
  type FactorioData
} from '../../src/shared/games/factorio/types'
import type { FactorioManifest } from '../../src/shared/types'

/**
 * Prueba de humo de Factorio (fase 4).
 *
 * Factorio no tiene API, y su consola remota no se puede grabar como un fichero
 * de respuestas porque lo que contesta depende de quién esté dentro. Lo que sí
 * se puede comprobar sin servidor es **lo que la app entiende de su registro** y
 * **lo que le escribe en la configuración**, que es donde están las decisiones
 * que cuestan una partida si se equivocan.
 *
 * El registro de `fixtures/factorio/registro.txt` son líneas reales del servidor
 * (2.1.19), con un cliente de verdad entrando, hablando y saliendo.
 */

const FIXTURES = join(process.cwd(), 'scripts/smoke/fixtures/factorio')

function manifestoDePrueba(data: Partial<FactorioData> = {}): FactorioManifest {
  return {
    schemaVersion: 2,
    id: 'smoke-factorio',
    name: 'Fábrica de prueba',
    game: 'factorio',
    port: DEFAULT_GAME_PORT,
    autoRestart: false,
    backup: { enabled: false, intervalHours: 24, keep: 3 },
    createdAt: new Date().toISOString(),
    agreements: ['steam-subscriber'],
    data: {
      password: 'contraseña',
      description: 'De prueba',
      maxPlayers: 8,
      saveName: 'partida',
      preset: 'default',
      spaceAge: true,
      autosaveMinutes: 10,
      autosaveSlots: 5,
      autoPause: true,
      allowCommands: 'admins-only',
      verifyAccounts: true,
      rconPort: DEFAULT_GAME_PORT + 1,
      rconPassword: 'secreta',
      source: 'steamcmd',
      steamUser: 'alguien',
      ...data
    }
  }
}

export async function factorioSmoke(): Promise<void> {
  const registro = (await readFile(join(FIXTURES, 'registro.txt'), 'utf8'))
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !line.startsWith('#'))

  await section('Factorio · lo que se entiende del registro', async () => {
    const eventos = registro.map((line) => parseLine(line))

    const entrada = eventos.find((e) => e.playerJoined)
    check('reconoce a quien entra', entrada?.playerJoined === 'Jugador1', entrada?.text)

    const salida = eventos.find((e) => e.playerLeft)
    check('y a quien se va', salida?.playerLeft === 'Jugador1', salida?.text)

    const chat = eventos.find((e) => e.chat)
    check(
      'saca el chat con quién lo dijo',
      chat?.chat?.player === 'Jugador1' && chat.chat.message === 'hola',
      chat?.text
    )

    // Lo que manda la propia app por la consola remota vuelve como chat del
    // servidor: enseñarlo sería un eco de lo que el usuario acaba de escribir.
    const eco = eventos.find((e) => e.hidden && e.text === '/players')
    check('esconde el eco de sus propias órdenes', eco !== undefined)

    const listo = eventos.filter((e) => e.ready)
    check('detecta que está listo', listo.length > 0, listo[0]?.text)

    const guardado = eventos.find((e) => e.text === 'Partida guardada.')
    check('reconoce que ha terminado de guardar', guardado !== undefined)

    // Sin esto, quien intenta entrar sin contraseña solo ve que le cortan.
    const rechazo = eventos.find((e) => e.text.includes('sin la contraseña correcta'))
    check('explica el rechazo por contraseña', rechazo?.level === 'warn', rechazo?.text)

    const error = eventos.find((e) => e.level === 'error')
    check('marca los errores como errores', error !== undefined, error?.text)

    const ruido = eventos.filter((e) => e.hidden).length
    check(
      'esconde el ruido del motor, pero no todo',
      ruido > 3 && ruido < eventos.length,
      `${ruido} de ${eventos.length} líneas ocultas`
    )
  })

  await section('Factorio · diagnóstico de cierres', async () => {
    check(
      'puerto ocupado',
      diagnoseExit(1, ['Error Socket.cpp:64: Cannot bind socket']).code === 'port-in-use'
    )
    check(
      'partida de otra versión',
      diagnoseExit(1, ['Map version 2.2.0-0 is too new']).code === 'save-version-mismatch'
    )
    check('salida limpia', diagnoseExit(0, ['Goodbye']).code === 'clean-exit')
    check('lo que no se reconoce, se dice', diagnoseExit(3, ['vaya']).code === 'unknown')
  })

  await section('Factorio · lo que se le escribe al servidor', async () => {
    const manifest = manifestoDePrueba()
    const ajustes = serverSettings(manifest.name, manifest.data)

    // Publicar el servidor manda la IP del usuario a la lista de Factorio: no
    // se hace sin preguntar, así que la app nunca lo pone sola.
    check(
      'nunca se publica en la lista de Factorio',
      (ajustes.visibility as Record<string, boolean>).public === false
    )
    check('la contraseña llega tal cual', ajustes.game_password === 'contraseña')
    check('la verificación de cuentas se respeta', ajustes.require_user_verification === true)
    check(
      'y se puede quitar',
      serverSettings('x', manifestoDePrueba({ verifyAccounts: false }).data)
        .require_user_verification === false
    )
    // En Windows el servidor contesta «OS does not support non-blocking saving»:
    // prometerlo en la interfaz sería mentir.
    check('no promete el guardado sin bloqueo', ajustes.non_blocking_saving === false)
    check('los comandos son solo para administradores', ajustes.allow_commands === 'admins-only')

    const conSpaceAge = modList(true).mods
    const sinSpaceAge = modList(false).mods
    check(
      'con Space Age se encienden sus cuatro mods',
      conSpaceAge.filter((m) => m.enabled).length === 5
    )
    check(
      'sin Space Age solo queda el juego base',
      sinSpaceAge.filter((m) => m.enabled).length === 1 &&
        sinSpaceAge.find((m) => m.name === 'base')?.enabled === true
    )
  })

  await section('Factorio · catálogo', async () => {
    const info = gameInfo('factorio')
    check('tiene aviso de producto no oficial', info.disclaimer.includes('no oficial'))
    check('la partida se llama partida', info.save === 'game')
    check('avisa de que hace falta tener el juego', info.card.highlights.some((h) => h.tone === 'warn'))

    const manifest = manifestoDePrueba()
    const puertos = serverPorts(manifest)
    check('un solo puerto, y UDP', puertos.length === 1 && puertos[0]!.protocol === 'udp')
    // El de RCON no se lista a propósito: solo escucha en 127.0.0.1 y anunciarlo
    // invitaría a abrirlo en el router, que es justo lo que no hay que hacer.
    check(
      'el de la consola remota no se lista',
      !puertos.some((p) => p.port === manifest.data.rconPort)
    )

    const caps = capabilitiesFor(manifest)
    check('da nombres de jugador, no identificadores', caps.playerNames && caps.playerIds)
    check('tiene consola de comandos', caps.commands)
    check('y moderación', caps.moderation)
    // No hay servicio de fuera que hable el protocolo de Factorio sin publicar
    // el servidor, así que un botón de «comprobar desde internet» mentiría.
    check('no promete comprobación desde internet', !caps.externalCheck)

    check('los nueve presets del juego', PRESETS.length === 9)
    check('cada uno con su explicación', PRESETS.every((p) => p.description.length > 20))
    check('el preset por defecto existe', presetInfo('default').name === 'Por defecto')
    check('la contraseña mínima es razonable', MIN_PASSWORD_LENGTH >= 5)
  })
}
