import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ValheimManifest } from '@shared/types'
import {
  MODERATION_LISTS,
  type ValheimListEntry,
  type ValheimListKind,
  type ValheimWorld
} from '@shared/games/valheim/types'
import type { GameHost } from '../minecraft/service'
import { saveDirFor, worldsDirFor, worldSize } from './adapter'

/**
 * Operaciones exclusivas de Valheim: mundos y listas de moderación.
 *
 * Al revés que Satisfactory, aquí **todo se hace con el servidor parado**,
 * porque todo son ficheros: el mundo activo va en la línea de órdenes del
 * arranque y las listas las lee el servidor de disco. No hay API ni consola a
 * la que pedirle nada en caliente.
 *
 * Lo único que se puede tocar con el servidor en marcha son las listas, y con
 * matices: el servidor las relee, pero a quien ya está dentro no lo echa.
 */

/** Los ficheros de un mundo (`Nombre/_main.4.db2`...) cuelgan de esta carpeta. */
function worldDir(id: string, name: string): string {
  return join(worldsDirFor(id), name)
}

/**
 * Valida el nombre de un mundo.
 *
 * Es el nombre de una carpeta y va en la línea de órdenes: un nombre con
 * caracteres raros hace que el servidor arranque y no guarde, que es el peor
 * fallo posible porque no se nota hasta que se pierde la partida.
 */
function validWorldName(name: string): boolean {
  return /^[\w áéíóúñÁÉÍÓÚÑ.-]{1,40}$/.test(name)
}

/**
 * Una línea de una lista de moderación.
 *
 * El formato del juego es un identificador por línea. Las líneas que empiezan
 * por `//` son los comentarios de ejemplo que el propio servidor escribe al
 * crear el fichero, y hay que conservarlos: si se borran, el usuario que abra
 * el fichero a mano se queda sin saber qué va ahí.
 */
function parseList(raw: string): ValheimListEntry[] {
  const entries: ValheimListEntry[] = []
  for (const line of raw.split(/\r?\n/)) {
    const clean = line.trim()
    if (clean.length === 0 || clean.startsWith('//')) continue
    const match = /^(\S+)\s*(?:\/\/\s*(.*))?$/.exec(clean)
    if (!match) continue
    entries.push({ id: match[1]!, ...(match[2] ? { note: match[2].trim() } : {}) })
  }
  return entries
}

function formatList(kind: ValheimListKind, entries: ValheimListEntry[]): string {
  const info = MODERATION_LISTS.find((l) => l.kind === kind)!
  const header = `// ${info.label}: un identificador por línea. Lo gestiona QubiQ Server Launcher.`
  const lines = entries.map((e) => (e.note ? `${e.id} // ${e.note}` : e.id))
  return [header, ...lines, ''].join('\r\n')
}

/** Un identificador de Steam son 17 dígitos; el de PlayFab, letras y números. */
function validPlayerId(id: string): boolean {
  return /^[A-Za-z0-9]{6,32}$/.test(id)
}

export function createValheimService(host: GameHost) {
  async function requireManifest(id: string): Promise<ValheimManifest> {
    const manifest = await host.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    if (manifest.game !== 'valheim') {
      throw new Error('Esta operación solo existe para servidores de Valheim.')
    }
    return manifest
  }

  function listPath(id: string, kind: ValheimListKind): string {
    const info = MODERATION_LISTS.find((l) => l.kind === kind)
    if (!info) throw new Error(`Lista desconocida: ${kind}`)
    return join(saveDirFor(id), info.fileName)
  }

  async function readList(id: string, kind: ValheimListKind): Promise<ValheimListEntry[]> {
    try {
      return parseList(await readFile(listPath(id, kind), 'utf8'))
    } catch {
      // Todavía no existe: el servidor las crea en su primer arranque.
      return []
    }
  }

  async function writeList(
    id: string,
    kind: ValheimListKind,
    entries: ValheimListEntry[]
  ): Promise<ValheimListEntry[]> {
    await mkdir(saveDirFor(id), { recursive: true })
    await writeFile(listPath(id, kind), formatList(kind, entries), 'utf8')
    return entries
  }

  return {
    // --- Mundos ---------------------------------------------------------------

    /**
     * Los mundos que hay en la carpeta del servidor.
     *
     * Cada uno es una carpeta dentro de `worlds_local`; el que carga el
     * servidor es el que diga el manifiesto, y puede que todavía no exista en
     * disco si nunca se ha arrancado.
     */
    async listWorlds(id: string): Promise<ValheimWorld[]> {
      const manifest = await requireManifest(id)
      const dir = worldsDirFor(id)
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])

      const worlds: ValheimWorld[] = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const { bytes, savedAt } = await worldSize(join(dir, entry.name))
        worlds.push({
          name: entry.name,
          active: entry.name === manifest.data.worldName,
          sizeBytes: bytes,
          savedAt
        })
      }

      // El mundo activo sale aunque aún no se haya generado: si no, el usuario
      // vería una lista vacía justo después de crear el servidor.
      if (!worlds.some((w) => w.active)) {
        worlds.push({
          name: manifest.data.worldName,
          active: true,
          sizeBytes: 0,
          savedAt: null
        })
      }

      return worlds.sort((a, b) => a.name.localeCompare(b.name, 'es'))
    },

    /**
     * Crea un mundo y lo deja activo. No genera nada: el servidor lo hace en el
     * siguiente arranque, que es cuando decide el terreno a partir del nombre.
     */
    async createWorld(id: string, name: string): Promise<ValheimWorld[]> {
      host.assertStopped(id, 'crear un mundo')
      const manifest = await requireManifest(id)
      const clean = name.trim()

      if (!validWorldName(clean)) {
        throw new Error(
          'El nombre del mundo solo puede llevar letras, números, espacios, puntos y guiones.'
        )
      }
      const existing = await readdir(worldsDirFor(id)).catch((): string[] => [])
      if (existing.some((entry) => entry.toLowerCase() === clean.toLowerCase())) {
        throw new Error(`Ya hay un mundo que se llama «${clean}».`)
      }

      await host.updateInstance(id, { data: { ...manifest.data, worldName: clean } })
      return this.listWorlds(id)
    },

    /** Cambia el mundo que cargará el servidor la próxima vez que arranque. */
    async activateWorld(id: string, name: string): Promise<ValheimWorld[]> {
      host.assertStopped(id, 'cambiar de mundo')
      const manifest = await requireManifest(id)
      if (manifest.data.worldName === name) return this.listWorlds(id)

      const worlds = await readdir(worldsDirFor(id)).catch((): string[] => [])
      if (!worlds.includes(name)) throw new Error(`No existe el mundo «${name}».`)

      await host.updateInstance(id, { data: { ...manifest.data, worldName: name } })
      return this.listWorlds(id)
    },

    /**
     * Borra un mundo. Nunca el activo: borrar lo que el servidor va a cargar
     * dejaría la instancia arrancando un mundo nuevo sin que nadie lo pidiera.
     */
    async deleteWorld(id: string, name: string): Promise<ValheimWorld[]> {
      host.assertStopped(id, 'borrar un mundo')
      const manifest = await requireManifest(id)
      if (manifest.data.worldName === name) {
        throw new Error(
          'No se puede borrar el mundo en el que estáis jugando. Cambia antes a otro.'
        )
      }

      // Copia de seguridad antes de una operación que no tiene vuelta atrás,
      // igual que en Minecraft (§12). Si falla, se avisa y no se borra nada.
      await host.createBackup(id, `Copia previa a borrar el mundo ${name}`, true)
      await rm(worldDir(id, name), { recursive: true, force: true })
      return this.listWorlds(id)
    },

    /** Renombrar es mover la carpeta; el juego no guarda el nombre por dentro. */
    async renameWorld(id: string, name: string, newName: string): Promise<ValheimWorld[]> {
      host.assertStopped(id, 'renombrar un mundo')
      const manifest = await requireManifest(id)
      const clean = newName.trim()
      if (!validWorldName(clean)) {
        throw new Error(
          'El nombre del mundo solo puede llevar letras, números, espacios, puntos y guiones.'
        )
      }

      await rename(worldDir(id, name), worldDir(id, clean)).catch((err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') throw new Error(`No existe el mundo «${name}».`)
        throw err
      })
      if (manifest.data.worldName === name) {
        await host.updateInstance(id, { data: { ...manifest.data, worldName: clean } })
      }
      return this.listWorlds(id)
    },

    // --- Moderación -----------------------------------------------------------

    async getList(id: string, kind: ValheimListKind): Promise<ValheimListEntry[]> {
      await requireManifest(id)
      return readList(id, kind)
    },

    /**
     * Añade a alguien a una lista.
     *
     * Aquí no se valida que el identificador exista: no hay forma de saberlo
     * sin preguntarle a Steam por una cuenta que quizá no es de este usuario.
     * Lo que sí se comprueba es que tenga forma de identificador, para que no
     * se cuele un nombre de personaje (que el servidor ignoraría en silencio).
     */
    async addToList(
      id: string,
      kind: ValheimListKind,
      playerId: string,
      note?: string
    ): Promise<ValheimListEntry[]> {
      await requireManifest(id)
      const clean = playerId.trim()
      if (!validPlayerId(clean)) {
        throw new Error(
          'Eso no parece un identificador. Valheim va por el ID de Steam (17 dígitos), no por el ' +
            'nombre del personaje: aparece en la consola cuando esa persona entra.'
        )
      }

      const entries = await readList(id, kind)
      if (entries.some((e) => e.id === clean)) return entries
      return writeList(id, kind, [...entries, { id: clean, ...(note ? { note } : {}) }])
    },

    async removeFromList(
      id: string,
      kind: ValheimListKind,
      playerId: string
    ): Promise<ValheimListEntry[]> {
      await requireManifest(id)
      const entries = await readList(id, kind)
      return writeList(
        id,
        kind,
        entries.filter((e) => e.id !== playerId)
      )
    }
  }
}

export { parseList, formatList, validWorldName, validPlayerId }
