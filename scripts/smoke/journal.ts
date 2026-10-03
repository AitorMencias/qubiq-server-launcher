import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'

import { check, fileExists, section } from './harness'
import { instanceDir } from '../../src/main/core/paths'
import { appendJournal, journalPath, readJournal } from '../../src/main/core/journal/store'
import { playerChanges } from '../../src/main/core/journal/players'
import { gameFor } from '../../src/main/core/games/registry'
import { parseLine as minecraftLine } from '../../src/main/core/games/minecraft/logParser'
import { journalFilterOf, listModeration, type JournalEntry } from '../../src/shared/journal'

/**
 * Historial de cada servidor (§19.32): quién entra y sale, guardados,
 * moderación y órdenes. Lo que se apunta de verdad al arrancar un servidor lo
 * comprueba el juego falso de `common.ts`; aquí, las piezas sueltas.
 */
export async function journalSmoke(): Promise<void> {
  await section('Historial: quién entra y quién sale', async () => {
    const resumen = (changes: ReturnType<typeof playerChanges>): string =>
      changes
        .map((c) => (c.kind === 'join' || c.kind === 'leave' ? `${c.kind}:${c.player ?? '?'}:${c.online}` : c.kind))
        .join(' ')

    check(
      'con nombres, compara las listas',
      resumen(playerChanges({ names: ['Ana', 'Luis'], count: null }, { names: ['Ana', 'Eva'], count: null }, false)) ===
        'leave:Luis:1 join:Eva:2'
    )
    check(
      'la misma gente en otro orden no es un cambio',
      playerChanges({ names: ['Ana', 'Luis'], count: null }, { names: ['Luis', 'Ana'], count: null }, false).length === 0
    )
    check(
      'solo con el número, cuenta entradas sin nombre',
      resumen(playerChanges({ names: [], count: 1 }, { names: [], count: 3 }, true)) === 'join:?:2 join:?:3'
    )
    check(
      'y aprovecha el nombre si el registro lo ha dado',
      resumen(playerChanges({ names: [], count: 0 }, { names: ['Pioneer'], count: 1 }, true)) === 'join:Pioneer:1'
    )
    check(
      'sin número todavía no apunta nada',
      playerChanges({ names: [], count: null }, { names: ['Pioneer'], count: null }, true).length === 0
    )
    check(
      'las salidas sin nombre también',
      resumen(playerChanges({ names: [], count: 2 }, { names: [], count: 0 }, true)) === 'leave:?:1 leave:?:0'
    )
  })

  await section('Historial: el fichero', async () => {
    const id = 'historial-prueba'
    await mkdir(instanceDir(id), { recursive: true })

    appendJournal(id, { ts: 1, kind: 'start' })
    appendJournal(id, { ts: 2, kind: 'save' })
    // Una línea cortada (un apagón a mitad) y una de una versión más nueva.
    await writeFile(journalPath(id), `${await readFile(journalPath(id), 'utf8')}{"ts":3,"kin\n`, 'utf8')
    appendJournal(id, { ts: 4, kind: 'futuro' } as unknown as JournalEntry)
    appendJournal(id, { ts: 5, kind: 'stop' })

    const leidas = await readJournal(id, 10)
    check(
      'devuelve lo más reciente primero y salta lo que no entiende',
      leidas.map((e) => e.ts).join(',') === '5,2,1',
      leidas.map((e) => e.ts).join(',')
    )
    check('respeta el límite', (await readJournal(id, 2)).map((e) => e.ts).join(',') === '5,2')
    check('sin fichero, historial vacío', (await readJournal('no-existe', 10)).length === 0)

    // Un servidor recién borrado: apuntar algo no puede volver a crear su carpeta.
    appendJournal('borrado-hace-nada', { ts: 1, kind: 'stop' })
    check('no resucita la carpeta de un servidor borrado', !(await fileExists(instanceDir('borrado-hace-nada'))))

    // Se recorta solo al pasar de ~1 MB, quedándose con lo último.
    const relleno = 'x'.repeat(300)
    for (let i = 0; i < 4000; i++) {
      appendJournal(id, { ts: 100 + i, kind: 'command', command: relleno })
    }
    const tamaño = (await stat(journalPath(id))).size
    const ultima = (await readJournal(id, 1))[0]
    check('no crece sin límite', tamaño <= 1024 * 1024, `${tamaño} bytes`)
    check('y al recortar conserva lo más reciente', ultima?.ts === 4099)

    await rm(instanceDir(id), { recursive: true, force: true })
  })

  await section('Historial: Minecraft', async () => {
    const kick = minecraftLine('[12:34:56] [Server thread/INFO]: Kicked Alex: Kicked by an operator')
    check(
      'expulsar desde la consola (Vanilla)',
      kick.moderation?.action === 'kick' && kick.moderation.player === 'Alex' && !kick.moderation.by,
      JSON.stringify(kick.moderation)
    )
    const ban = minecraftLine('[12:34:56 INFO]: [Steve: Banned Alex: rompía casas]')
    check(
      'vetar desde dentro del juego dice quién (Paper)',
      ban.moderation?.action === 'ban' && ban.moderation.by === 'Steve' && ban.moderation.reason === 'rompía casas',
      JSON.stringify(ban.moderation)
    )
    check(
      'dar y quitar operador, lista blanca y perdón',
      minecraftLine('[12:34:56 INFO]: Made Alex a server operator').moderation?.action === 'admin' &&
        minecraftLine('[12:34:56 INFO]: Made Alex no longer a server operator').moderation?.action === 'unadmin' &&
        minecraftLine('[12:34:56 INFO]: Added Alex to the whitelist').moderation?.action === 'whitelist' &&
        minecraftLine('[12:34:56 INFO]: Removed Alex from the whitelist').moderation?.action === 'unwhitelist' &&
        minecraftLine('[12:34:56 INFO]: Unbanned Alex').moderation?.action === 'unban'
    )
    check(
      'un veto por IP no se apunta (el historial no guarda direcciones)',
      !minecraftLine('[12:34:56 INFO]: Banned IP 203.0.113.9: spam').moderation
    )
    check(
      'quien se va expulsado no es otra moderación',
      !minecraftLine('[12:34:56 INFO]: Alex lost connection: Kicked by an operator').moderation
    )
    check(
      'el chat no se confunde con una orden',
      !minecraftLine('[12:34:56 INFO]: <Alex> Kicked Steve: broma').moderation
    )
    check(
      'guardar (save-all y al cerrar)',
      minecraftLine('[12:34:56] [Server thread/INFO]: Saved the game').saved === true &&
        minecraftLine('[12:34:56 INFO]: [Steve: Saved the game]').saved === true &&
        minecraftLine('[12:34:56] [Server thread/INFO]: ThreadedAnvilChunkStorage: All dimensions are saved').saved === true
    )
    check(
      'y el cierre de Paper 26, que no siempre dice lo de Vanilla',
      minecraftLine(
        "[21:07:36 INFO]: [ChunkHolderManager] Saved 0 block chunks, 0 entity chunks, 0 poi chunks in world 'minecraft:overworld' in 0,00s"
      ).saved === true
    )
  })

  await section('Historial: guardados de cada juego', async () => {
    const guarda = (game: string, line: string): boolean => gameFor(game).parseLine(line).saved === true
    check('Valheim', guarda('valheim', '10/03/2026 12:00:00: World save (5/5) done'))
    check('Factorio', guarda('factorio', '  12.345 Info AppManagerStates.cpp:2000: Saving finished'))
    check('Project Zomboid', guarda('zomboid', 'LOG  : General     , 1727000000000> Saving took 120 ms'))
    check('Enshrouded', guarda('enshrouded', '[server] Saved'))
    check('Rust, el automático', guarda('rust', 'Saved 41,234 ents, cache(0.01), write(0.01), disk(0.01).'))
    check(
      'Satisfactory, al guardar y no al cargar',
      guarda('satisfactory', '[2026.09.16-12.44.46:905][  0]LogGame: World Serialization (save): 0.264 seconds (game thread)') &&
        !guarda('satisfactory', '[2026.09.16-12.44.46:905][  0]LogGame: World Serialization (load): 5.947 seconds')
    )
  })

  await section('Historial: grupos', async () => {
    check('entrar es de jugadores', journalFilterOf('join') === 'players')
    check('las copias van con los guardados', journalFilterOf('backup') === 'saves')
    check('una caída es del servidor', journalFilterOf('crash') === 'server')
    check(
      'las listas de Valheim y Factorio son moderación',
      listModeration('banned', true) === 'ban' && listModeration('permitted', false) === 'unwhitelist'
    )
  })
}
