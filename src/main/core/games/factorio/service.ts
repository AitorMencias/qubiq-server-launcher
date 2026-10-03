import { copyFile, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FactorioManifest } from '@shared/types'
import {
  MODERATION_LISTS,
  type FactorioListKind,
  type FactorioSave
} from '@shared/games/factorio/types'
import { listModeration } from '@shared/journal'
import type { GameHost } from '../minecraft/service'
import { rconCommand } from '../../net/rcon'
import { dataDirFor, savePathFor } from './adapter'

/**
 * Operaciones exclusivas de Factorio: partidas y moderación.
 *
 * La diferencia con Valheim es que aquí **sí se puede hablar con el servidor en
 * marcha**, y hay que hacerlo: el servidor tiene sus listas en memoria y las
 * vuelca al salir, así que escribir el JSON con el servidor arrancado no sirve
 * de nada (se machaca al parar). Por eso cada operación de moderación va por
 * RCON si está en marcha, y a disco si está parado.
 *
 * Las partidas, en cambio, son ficheros sueltos: activarlas o borrarlas exige
 * el servidor parado, porque la que se carga va en la línea de órdenes.
 */

/** Los autoguardados del juego se llaman así; el resto son partidas normales. */
function isAutosave(fileName: string): boolean {
  return /^_autosave\d+\.zip$/i.test(fileName)
}

/**
 * Junta nombres de jugador sin repetir.
 *
 * Hace falta porque **el servidor los guarda en minúsculas** y el fichero
 * conserva como se escribieron: sin esto, quien se llame «Fulano» saldría dos
 * veces en la lista, una por cada sitio. Gana el primero que llegue, que es el
 * del servidor cuando está en marcha.
 */
function mergeNames(...groups: string[][]): string[] {
  const seen = new Map<string, string>()
  for (const group of groups) {
    for (const name of group) {
      const key = name.toLowerCase()
      if (!seen.has(key)) seen.set(key, name)
    }
  }
  return [...seen.values()]
}

export function createFactorioService(host: GameHost) {
  async function requireManifest(id: string): Promise<FactorioManifest> {
    const manifest = await host.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    if (manifest.game !== 'factorio') {
      throw new Error('Esta operación solo existe para servidores de Factorio.')
    }
    return manifest
  }

  /** Manda una orden al servidor en marcha. Devuelve lo que conteste. */
  async function rcon(manifest: FactorioManifest, command: string): Promise<string> {
    return rconCommand(
      {
        host: '127.0.0.1',
        port: manifest.data.rconPort,
        password: manifest.data.rconPassword,
        timeoutMs: 10_000,
        // Ver `RconOptions.terminatorEcho`: Factorio no devuelve el eco.
        terminatorEcho: false
      },
      command
    )
  }

  function listFile(id: string, kind: FactorioListKind): string {
    const info = MODERATION_LISTS.find((l) => l.kind === kind)
    if (!info) throw new Error(`Lista desconocida: ${kind}`)
    return join(dataDirFor(id), info.file)
  }

  async function readListFile(id: string, kind: FactorioListKind): Promise<string[]> {
    try {
      const raw = JSON.parse(await readFile(listFile(id, kind), 'utf8')) as unknown
      if (!Array.isArray(raw)) return []
      // La lista de vetados puede traer objetos ({username, reason}) en vez de
      // nombres sueltos, según cómo se haya vetado.
      return raw
        .map((entry) =>
          typeof entry === 'string' ? entry : ((entry as { username?: string }).username ?? '')
        )
        .filter((name) => name.length > 0)
    } catch {
      // Todavía no existe: el servidor las escribe al arrancar.
      return []
    }
  }

  async function writeListFile(
    id: string,
    kind: FactorioListKind,
    names: string[]
  ): Promise<string[]> {
    await writeFile(listFile(id, kind), JSON.stringify(names, null, 2), 'utf8')
    return names
  }

  /** ¿Está el servidor escuchando en su RCON? Es la señal de que está vivo. */
  async function isLive(manifest: FactorioManifest): Promise<boolean> {
    try {
      await rcon(manifest, '/version')
      return true
    } catch {
      return false
    }
  }

  return {
    // --- Partidas ---------------------------------------------------------------

    /**
     * Las partidas que hay en la carpeta del servidor.
     *
     * Los autoguardados van marcados: son del propio juego, se sobrescriben
     * solos y no tiene sentido tratarlos como partidas normales.
     */
    async listSaves(id: string): Promise<FactorioSave[]> {
      const manifest = await requireManifest(id)
      const dir = join(dataDirFor(id), 'saves')
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])

      const saves: FactorioSave[] = []
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.zip')) continue
        const info = await stat(join(dir, entry.name))
        const name = entry.name.replace(/\.zip$/i, '')
        saves.push({
          name,
          active: name === manifest.data.saveName,
          automatic: isAutosave(entry.name),
          sizeBytes: info.size,
          modifiedAt: info.mtime.toISOString()
        })
      }
      // Primero la que se juega, luego las manuales y al final los autoguardados.
      return saves.sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1
        if (a.automatic !== b.automatic) return a.automatic ? 1 : -1
        return b.modifiedAt.localeCompare(a.modifiedAt)
      })
    },

    /**
     * Recupera un autoguardado.
     *
     * No se «activa» el autoguardado: se copia encima de la partida del
     * servidor, porque el juego los sobrescribe por turnos y activarlo sin más
     * significaría que el siguiente autoguardado se lo lleva por delante. Antes
     * se hace una copia de seguridad, que esto pisa la partida buena.
     */
    async restoreAutosave(id: string, name: string): Promise<void> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'recuperar un autoguardado')
      const from = join(dataDirFor(id), 'saves', `${name}.zip`)
      await stat(from).catch(() => {
        throw new Error(`No existe el autoguardado «${name}».`)
      })
      await host.createBackup(id, `Antes de recuperar ${name}`, true)
      await copyFile(from, savePathFor(id, manifest.data.saveName))
    },

    async deleteSave(id: string, name: string): Promise<void> {
      const manifest = await requireManifest(id)
      if (name === manifest.data.saveName) {
        throw new Error('Esa es la partida que juega el servidor: no se puede borrar.')
      }
      host.assertStopped(id, 'borrar una partida')
      await rm(join(dataDirFor(id), 'saves', `${name}.zip`), { force: true })
    },

    /** Guarda ahora mismo, sin parar el servidor. */
    async saveNow(id: string): Promise<void> {
      const manifest = await requireManifest(id)
      await rcon(manifest, '/server-save')
    },

    // --- Moderación ---------------------------------------------------------------

    /**
     * Quién está en una lista: lo del fichero y lo que el servidor tenga en
     * memoria, junto.
     *
     * Hacen falta los dos porque no siempre coinciden: al servidor en marcha se
     * le pueden añadir nombres que él no acepta (ver `addToList`), y esos solo
     * están en el fichero hasta el siguiente arranque.
     */
    async getList(id: string, kind: FactorioListKind): Promise<string[]> {
      const manifest = await requireManifest(id)
      const enFichero = await readListFile(id, kind)
      if (!(await isLive(manifest))) return enFichero

      const answer = await rcon(manifest, kind === 'admin' ? '/admins' : '/banlist get')
      const enMemoria = answer
        .replace(/^[^:]*:/, '')
        .split(/[,\n]/)
        .map((n) => n.trim())
        .filter((n) => n.length > 0 && !/^\(/.test(n))
      return mergeNames(enMemoria, enFichero)
    },

    /**
     * Añade a alguien a una lista.
     *
     * Se hacen **las dos cosas**, y cada una por un motivo (comprobado contra el
     * servidor real):
     *
     * - Por RCON, para que tenga efecto ya: vetar a alguien que está dentro lo
     *   echa al momento. Pero `/promote` **no funciona con quien nunca ha
     *   entrado**: el servidor contesta con un silencio y no apunta nada.
     * - Escribiendo el fichero, para que quede: el servidor lo lee al arrancar
     *   y **no lo machaca al parar** (probado escribiéndolo con el servidor en
     *   marcha y comprobándolo después de `/quit`).
     *
     * Por eso, a quien no está conectado se le puede nombrar administrador
     * igual: se aplicará la próxima vez que arranque el servidor.
     */
    async addToList(id: string, kind: FactorioListKind, player: string): Promise<string[]> {
      const manifest = await requireManifest(id)
      const name = player.trim()
      if (name.length === 0) throw new Error('Hay que decir a quién.')

      if (await isLive(manifest)) {
        await rcon(manifest, kind === 'admin' ? `/promote ${name}` : `/banlist add ${name}`)
      }
      const current = await readListFile(id, kind)
      if (!current.some((n) => n.toLowerCase() === name.toLowerCase())) {
        await writeListFile(id, kind, [...current, name])
      }
      host.journal(id, { kind: 'moderation', action: listModeration(kind, true), player: name })
      return this.getList(id, kind)
    },

    async removeFromList(id: string, kind: FactorioListKind, player: string): Promise<string[]> {
      const manifest = await requireManifest(id)
      const name = player.trim()

      if (await isLive(manifest)) {
        await rcon(manifest, kind === 'admin' ? `/demote ${name}` : `/banlist remove ${name}`)
      }
      const current = await readListFile(id, kind)
      await writeListFile(
        id,
        kind,
        current.filter((n) => n.toLowerCase() !== name.toLowerCase())
      )
      host.journal(id, { kind: 'moderation', action: listModeration(kind, false), player: name })
      return this.getList(id, kind)
    },

    /** Echa a alguien, sin vetarlo. Solo tiene sentido con el servidor en marcha. */
    async kick(id: string, player: string, reason?: string): Promise<void> {
      const manifest = await requireManifest(id)
      const answer = await rcon(
        manifest,
        `/kick ${player}${reason && reason.trim().length > 0 ? ` ${reason.trim()}` : ''}`
      )
      // El servidor contesta en cristiano cuando no puede: «El jugador X no existe.»
      if (/no existe|does not exist/i.test(answer)) {
        throw new Error(`${player} no está conectado.`)
      }
      host.journal(id, {
        kind: 'moderation',
        action: 'kick',
        player,
        ...(reason?.trim() ? { reason: reason.trim() } : {})
      })
    },

    /** Quién está dentro ahora mismo, preguntándoselo al servidor. */
    async onlinePlayers(id: string): Promise<string[]> {
      const manifest = await requireManifest(id)
      const answer = await rcon(manifest, '/players online')
      return answer
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.trim().replace(/\s*\(en línea\)$/i, ''))
        .filter((line) => line.length > 0)
    }
  }
}
