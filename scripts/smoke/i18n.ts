import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'

import { check, section } from './harness'
import {
  LANGUAGES,
  detectLanguage,
  dictionaries,
  formatBytes,
  hasKey,
  resolveLanguage,
  setLanguage,
  t,
  type Language,
  type Plural
} from '../../src/shared/i18n'
import * as gamesIndex from '../../src/shared/games'
import * as satisfactoryTypes from '../../src/shared/games/satisfactory/types'
import * as valheimTypes from '../../src/shared/games/valheim/types'
import * as factorioTypes from '../../src/shared/games/factorio/types'
import * as zomboidTypes from '../../src/shared/games/zomboid/types'
import * as enshroudedTypes from '../../src/shared/games/enshrouded/types'
import * as rustTypes from '../../src/shared/games/rust/types'
import * as minecraftTypes from '../../src/shared/games/minecraft/types'
import * as officialPlugins from '../../src/shared/games/minecraft/officialPlugins'
import * as mcProperties from '../../src/main/core/games/minecraft/config/properties'
import { readSettings, updateSettings } from '../../src/main/core/settings/manager'
import { dataRoot, DATA_ENTRIES } from '../../src/main/core/paths'
import { planRelocation, resolveTarget, SUBFOLDER } from '../../src/main/core/dataFolder/plan'
import { copyThenRemove, relocateData, STAGING_DIR } from '../../src/main/core/dataFolder/relocate'
import type { InstanceManifest } from '../../src/shared/types'

/**
 * Prueba de humo de los idiomas y de la carpeta de datos.
 *
 * El typecheck ya garantiza que todos los idiomas tienen las mismas claves que
 * el español. Lo que no ve, y se comprueba aquí: que cada traducción use las
 * mismas variables (una `{port}` perdida deja la frase coja), que los plurales
 * tengan las formas que su idioma necesita, que no quede texto sin traducir y
 * que las claves montadas con plantillas (`mc.prop.${key}.label`) existan.
 */

type Entry = string | Plural

function variables(entry: Entry): Set<string> {
  const texts = typeof entry === 'string' ? [entry] : Object.values(entry).filter((v): v is string => !!v)
  const names = new Set<string>()
  for (const text of texts) for (const match of text.matchAll(/\{(\w+)\}/g)) names.add(match[1]!)
  return names
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((value) => b.has(value))
}

/** Las formas de plural que salen con números enteros en ese idioma. */
function neededCategories(locale: string): Set<string> {
  const rules = new Intl.PluralRules(locale)
  const categories = new Set<string>()
  for (let n = 0; n <= 1000; n++) categories.add(rules.select(n))
  return categories
}

/**
 * Textos que es normal que coincidan con el español: nombres propios, siglas y
 * palabras que se escriben igual. Todo lo demás idéntico es sospechoso de
 * haberse quedado sin traducir.
 */
const SAME_ALLOWED = /^[\s\d{}\w.,:;·()/%+×→–—-]*$/

/** Recorre un valor leyendo todas sus propiedades (también los getters no enumerables). */
function collectStrings(value: unknown, out: string[], seen = new Set<unknown>(), depth = 0): void {
  if (depth > 8 || value === null || value === undefined) return
  if (typeof value === 'string') {
    out.push(value)
    return
  }
  if (typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  if (value instanceof Map) {
    for (const item of value.values()) collectStrings(item, out, seen, depth + 1)
    return
  }
  if (value instanceof Set) {
    for (const item of value) collectStrings(item, out, seen, depth + 1)
    return
  }
  for (const name of Object.getOwnPropertyNames(value)) {
    let child: unknown
    try {
      child = (value as Record<string, unknown>)[name]
    } catch {
      continue
    }
    if (typeof child === 'function') continue
    collectStrings(child, out, seen, depth + 1)
  }
}

const KEY_LIKE = /^(mc|sf|vh|fa|pz|en|rust)\.[\w.-]+$/

export async function i18nSmoke(): Promise<void> {
  await section('Idiomas: diccionarios', async () => {
    const all = dictionaries()
    const es = all.es as Record<string, Entry>
    const esKeys = Object.keys(es)
    check('el español tiene textos', esKeys.length > 1000, `${esKeys.length} claves`)

    for (const { id, locale } of LANGUAGES) {
      if (id === 'es') continue
      const dict = all[id] as Record<string, Entry>
      const keys = Object.keys(dict)
      const missing = esKeys.filter((key) => !(key in dict))
      const extra = keys.filter((key) => !(key in es))
      check(`${id}: mismas claves que el español`, missing.length === 0 && extra.length === 0,
        missing.length + extra.length > 0 ? `faltan ${missing.slice(0, 3).join(', ')}; sobran ${extra.slice(0, 3).join(', ')}` : `${keys.length}`)

      const badVars: string[] = []
      const badPlural: string[] = []
      const sameAsSpanish: string[] = []
      const placeholders: string[] = []
      const needed = neededCategories(locale)
      for (const key of esKeys) {
        const source = es[key]!
        const entry = dict[key]
        if (entry === undefined) continue
        if (typeof source !== typeof entry) {
          badPlural.push(`${key} (texto/plural)`)
          continue
        }
        if (!sameSet(variables(source), variables(entry))) badVars.push(key)
        if (typeof entry === 'object') {
          for (const category of needed) {
            if (!(category in entry)) badPlural.push(`${key} (${category})`)
          }
        } else {
          if (/RELLENO|PROVISIONAL|TODO/.test(entry)) placeholders.push(key)
          if (entry === source && !SAME_ALLOWED.test(entry)) sameAsSpanish.push(key)
        }
      }
      check(`${id}: cada texto usa las mismas variables que el español`, badVars.length === 0,
        badVars.slice(0, 5).join(', '))
      check(`${id}: plurales con las formas del idioma (${[...needed].join('/')})`, badPlural.length === 0,
        badPlural.slice(0, 5).join(', '))
      check(`${id}: sin relleno provisional`, placeholders.length === 0, placeholders.slice(0, 5).join(', '))
      // Algunos coinciden de verdad (Backups en alemán, Normal, Admin…): el
      // umbral pilla un fichero entero sin traducir, no una palabra.
      check(`${id}: casi nada igual que en español`, sameAsSpanish.length < esKeys.length * 0.02,
        `${sameAsSpanish.length} iguales${sameAsSpanish.length ? `: ${sameAsSpanish.slice(0, 5).join(', ')}` : ''}`)
    }
  })

  await section('Idiomas: elección y formato', async () => {
    check('Windows en español → español', detectLanguage(['es-ES', 'en-US']) === 'es')
    check('Portugués de Portugal → portugués', detectLanguage(['pt-PT']) === 'pt')
    check('Chino tradicional → chino (el único que hay)', detectLanguage(['zh-TW']) === 'zh')
    check('Idioma sin traducir → inglés', detectLanguage(['eu-ES', 'ca-ES']) === 'en')
    check('Sin idiomas → inglés', detectLanguage([]) === 'en')
    check('El elegido manda sobre Windows', resolveLanguage('ja', ['es-ES']) === 'ja')
    check('Un elegido desconocido cae al de Windows',
      resolveLanguage('xx' as Language, ['de-DE']) === 'de')

    setLanguage('ru')
    const ruSize = formatBytes(3 * 1024 ** 3)
    check('Ruso: unidades en cirílico', ruSize.endsWith('ГБ'), ruSize)
    setLanguage('fr')
    const frSize = formatBytes(5 * 1024 ** 2)
    check('Francés: octetos (Mo)', frSize.endsWith('Mo'), frSize)
    setLanguage('en')
    check('Plural en inglés', t('rust.since.daysAgo', { count: 1 }) === '1 day ago' &&
      t('rust.since.daysAgo', { count: 3 }) === '3 days ago')
    setLanguage('ru')
    check('Plural ruso con sus tres formas',
      t('rust.settings.minutesValue', { count: 1 }) === '1 минута' &&
        t('rust.settings.minutesValue', { count: 3 }) === '3 минуты' &&
        t('rust.settings.minutesValue', { count: 5 }) === '5 минут')
    setLanguage('de')
    check('Los números de las frases van sin separador de miles (puertos)',
      t('en.create.port', { port: 15636 }) === 'Port 15636', t('en.create.port', { port: 15636 }))
    setLanguage('es')
  })

  await section('Idiomas: claves montadas con plantillas', async () => {
    const modules: Record<string, unknown> = {
      gamesIndex, satisfactoryTypes, valheimTypes, factorioTypes, zomboidTypes, enshroudedTypes,
      rustTypes, minecraftTypes, officialPlugins, mcProperties
    }
    for (const { id } of LANGUAGES) {
      setLanguage(id)
      const strings: string[] = []
      for (const exported of Object.values(modules)) collectStrings(exported, strings)
      // Los catálogos que viajan por IPC se copian: que la copia lleve el texto.
      collectStrings(mcProperties.localizedCatalog(), strings)
      const unknown = [...new Set(strings.filter((s) => KEY_LIKE.test(s) && !hasKey(s)))]
      check(`${id}: los catálogos no enseñan claves sin texto`, unknown.length === 0,
        unknown.length ? unknown.slice(0, 5).join(', ') : `${strings.length} textos leídos`)
    }
    setLanguage('es')
    const rustSizes = rustTypes.WORLD_SIZES.map((w) => w.label)
    check('Rust: tamaños de mapa traducidos', rustSizes.every((label) => !KEY_LIKE.test(label)), rustSizes.join(', '))
  })

  await section('Configuración: idioma guardado', async () => {
    const settingsFile = join(dataRoot(), 'settings.json')
    const before = await readFile(settingsFile, 'utf8').catch(() => null)
    try {
      await writeFile(settingsFile, JSON.stringify({ uiMode: 'advanced', language: 'tlh' }), 'utf8')
      const unknown = await readSettings()
      check('Un idioma desconocido en el fichero se olvida', unknown.language === undefined && unknown.uiMode === 'advanced')

      await updateSettings({ language: 'ja' })
      check('Se guarda el idioma elegido', (await readSettings()).language === 'ja')
      await updateSettings({ language: undefined })
      const raw = JSON.parse(await readFile(settingsFile, 'utf8')) as Record<string, unknown>
      check('«Como Windows» quita el idioma del fichero', !('language' in raw) && raw['uiMode'] === 'advanced')
    } finally {
      if (before === null) await rm(settingsFile, { force: true })
      else await writeFile(settingsFile, before, 'utf8')
    }
  })

  await section('Carpeta de datos: comprobación previa', async () => {
    const base = await mkdtemp(join(tmpdir(), 'qubiq-reubicar-'))
    try {
      const from = join(base, 'origen')
      const defaultRoot = join(base, 'por-defecto')
      await mkdir(join(from, 'instances', 'uno'), { recursive: true })
      await writeFile(join(from, 'instances', 'uno', 'instance.json'), '{}')
      await writeFile(join(from, 'settings.json'), '{}')
      const plan = (chosen: string, extra: Partial<Parameters<typeof planRelocation>[0]> = {}) =>
        planRelocation({ from, chosen, defaultRoot, manifests: [], busy: [], ...extra })
      const codes = (p: Awaited<ReturnType<typeof plan>>) => p.problems.map((problem) => problem.code)

      const empty = join(base, 'vacia')
      const ok = await plan(empty)
      check('Carpeta nueva: sin problemas', ok.problems.length === 0, codes(ok).join(', '))
      check('Carpeta nueva: mismo disco (se renombra)', ok.sameDrive)
      check('Siempre avisa del cortafuegos', ok.warnings.some((w) => w.code === 'firewall'))

      const withStuff = join(base, 'con-cosas')
      await mkdir(withStuff, { recursive: true })
      await writeFile(join(withStuff, 'foto.jpg'), 'x')
      check('Carpeta con cosas → subcarpeta QubiQ',
        (await resolveTarget(withStuff, defaultRoot)) === join(withStuff, SUBFOLDER))

      // Como la actual tiene cosas, iría a su subcarpeta QubiQ: queda dentro.
      const itself = codes(await plan(from))
      check('Elegir la carpeta actual no vale', itself.includes('same') || itself.includes('nested'), itself.join(', '))
      check('Una carpeta dentro de los datos no vale', codes(await plan(join(from, 'dentro'))).includes('nested'))
      check('Con espacios no vale (Forge)', codes(await plan(join(base, 'con espacio'))).includes('spaces'))
      check('Carpeta de red no vale', codes(await plan('\\\\servidor\\datos')).includes('network'))
      check('Con un servidor encendido no vale', codes(await plan(empty, { busy: ['Mi server'] })).includes('busy'))

      const occupied = join(base, 'ocupada')
      await mkdir(join(occupied, SUBFOLDER, 'instances', 'otro'), { recursive: true })
      await writeFile(join(occupied, 'algo.txt'), 'x')
      await writeFile(join(occupied, SUBFOLDER, 'instances', 'otro', 'x'), 'x')
      check('Si ya hay datos de la app en el destino, no se pisan',
        codes(await plan(occupied)).includes('occupied'))

      const valheim = {
        id: 'v', name: 'Mi Valheim', game: 'valheim',
        data: { loaderVersion: '5.4.2333', mods: [] }
      } as unknown as InstanceManifest
      const deep = join(base, 'x'.repeat(150))
      const deepPlan = await plan(deep, { manifests: [valheim] })
      check('Valheim con mods y ruta demasiado larga → no se deja', codes(deepPlan).includes('valheim-path'))
      const noMods = { ...valheim, data: {} } as unknown as InstanceManifest
      const warnPlan = await plan(deep, { manifests: [noMods] })
      check('Valheim sin mods y ruta larga → solo aviso',
        !codes(warnPlan).includes('valheim-path') && warnPlan.warnings.some((w) => w.code === 'valheim-path'))
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  await section('Carpeta de datos: traslado', async () => {
    const base = await mkdtemp(join(tmpdir(), 'qubiq-traslado-'))
    try {
      const make = async (root: string) => {
        await mkdir(join(root, 'instances', 'uno', 'server', 'world'), { recursive: true })
        await writeFile(join(root, 'instances', 'uno', 'instance.json'), '{"id":"uno"}')
        await writeFile(join(root, 'instances', 'uno', 'server', 'world', 'level.dat'), Buffer.alloc(4096, 7))
        await mkdir(join(root, 'cache'), { recursive: true })
        await writeFile(join(root, 'cache', 'x.json'), '[]')
        await writeFile(join(root, 'settings.json'), '{"uiMode":"basic"}')
        // Lo de Electron no es de la app: se queda donde está.
        await mkdir(join(root, 'GPUCache'), { recursive: true })
        await writeFile(join(root, 'GPUCache', 'data_0'), 'x')
      }

      // Mismo disco: se renombra.
      const a = join(base, 'a')
      const b = join(base, 'b')
      await make(a)
      await mkdir(join(b, 'cache'), { recursive: true }) // carpeta vacía de un intento anterior
      const renamed = await relocateData(a, b)
      check('Mismo disco: se renombra, no se copia', !renamed.copied && !renamed.leftovers)
      check('Mismo disco: los datos llegan',
        (await readFile(join(b, 'instances', 'uno', 'server', 'world', 'level.dat'))).length === 4096)
      check('Mismo disco: lo de Electron se queda', (await readdir(a)).join() === 'GPUCache')
      check('Una carpeta vacía en el destino no estorba',
        (await readFile(join(b, 'cache', 'x.json'), 'utf8')) === '[]')

      // Entre discos: se copia, se comprueba y solo entonces se borra.
      const c = join(base, 'c')
      const copied = await copyThenRemove(b, c)
      check('Entre discos: copia y borra el origen', copied.copied && !copied.leftovers)
      check('Entre discos: llega todo',
        (await readFile(join(c, 'settings.json'), 'utf8')).includes('basic') &&
          (await readFile(join(c, 'instances', 'uno', 'server', 'world', 'level.dat'))).length === 4096)
      check('Entre discos: no queda la carpeta temporal', !(await readdir(c)).includes(STAGING_DIR))
      const leftInB = (await readdir(b)).filter((entry) => (DATA_ENTRIES as readonly string[]).includes(entry))
      check('Entre discos: el origen queda sin datos de la app', leftInB.length === 0, leftInB.join(', '))

      // Destino con datos: no se toca nada.
      const d = join(base, 'd')
      await mkdir(join(d, 'instances', 'ajeno'), { recursive: true })
      await writeFile(join(d, 'instances', 'ajeno', 'x'), 'no tocar')
      let refused = false
      try {
        await copyThenRemove(c, d)
      } catch {
        refused = true
      }
      check('Destino ocupado: se niega', refused)
      check('Destino ocupado: el origen sigue entero',
        (await readFile(join(c, 'instances', 'uno', 'instance.json'), 'utf8')).includes('uno'))
      check('Destino ocupado: lo ajeno sigue igual',
        (await readFile(join(d, 'instances', 'ajeno', 'x'), 'utf8')) === 'no tocar')
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
}
