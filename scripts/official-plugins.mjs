#!/usr/bin/env node
/**
 * Trae los plugins oficiales de la última release de su repositorio y los deja
 * en `resources/minecraft/plugins/<id>/`, que es de donde los copia la app y lo
 * que electron-builder empaqueta. Los jars no se versionan en este repo: cada
 * plugin tiene el suyo, con su código y su licencia.
 *
 * Uso:  npm run plugins                 (solo si falta alguno; sin red si ya están)
 *       npm run plugins -- --update     (siempre la última release; lo usa release.mjs)
 *
 * Por cada plugin deja tres ficheros:
 *   - el jar, verificado con el SHA-256 que publica GitHub del fichero subido;
 *   - `config.yml`, la plantilla, sacada de DENTRO del jar: así nunca puede
 *     quedarse de otra versión (ya pasó una vez, sin ningún error que lo delatara);
 *   - `plugin.json`, con la versión, el nombre del jar, la licencia y el
 *     repositorio, que lee la app (`content/official.ts`) y los avisos de terceros.
 *
 * Los repositorios están aquí y en `shared/games/minecraft/officialPlugins.ts`
 * (`repository`); el smoke comprueba que coinciden.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export const OFFICIAL_PLUGIN_SOURCES = [
  {
    id: 'hardcore-utility',
    repo: 'AitorMencias/hardcore-utility-tool',
    asset: /^HardcoreUtility-[\d.]+\.jar$/i
  }
]

const pluginDir = (id) => join(root, 'resources', 'minecraft', 'plugins', id)

/** Lee un fichero de dentro de un jar con el bsdtar de Windows, sin dependencias. */
function readFromJar(jarPath, entry) {
  const windowsDir = process.env.SystemRoot || process.env.windir
  // Por ruta absoluta: el tar de GNU que instala Git no entiende "C:\..." (§19.3).
  const tar = windowsDir ? join(windowsDir, 'System32', 'tar.exe') : 'tar.exe'
  const result = spawnSync(tar, ['-xOf', jarPath, entry], { maxBuffer: 16 * 1024 * 1024 })
  return result.status === 0 && result.stdout.length > 0 ? result.stdout : null
}

async function github(path) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'qubiq-server-launcher' }
  // Sin token, GitHub deja 60 consultas por hora y equipo: de sobra para esto.
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const response = await fetch(`https://api.github.com/${path}`, { headers })
  if (!response.ok) throw new Error(`GitHub respondió ${response.status} a ${path}`)
  return response.json()
}

function installed(id) {
  const dir = pluginDir(id)
  const infoPath = join(dir, 'plugin.json')
  if (!existsSync(infoPath)) return null
  const info = JSON.parse(readFileSync(infoPath, 'utf8'))
  return existsSync(join(dir, info.jarFileName)) && existsSync(join(dir, 'config.yml')) ? info : null
}

async function fetchPlugin(source) {
  const release = await github(`repos/${source.repo}/releases/latest`)
  const repo = await github(`repos/${source.repo}`)
  const assets = (release.assets ?? []).filter((a) => source.asset.test(a.name ?? ''))
  if (assets.length !== 1) {
    throw new Error(
      `${source.repo} ${release.tag_name}: la release trae ${assets.length} jars que encajan y debería traer uno.`
    )
  }
  const asset = assets[0]
  const expected = /^sha256:([0-9a-f]{64})$/.exec(asset.digest ?? '')?.[1]
  if (!expected) throw new Error(`${asset.name}: GitHub no publica su SHA-256, no se puede verificar.`)

  const response = await fetch(asset.browser_download_url)
  if (!response.ok) throw new Error(`${asset.name}: la descarga respondió ${response.status}`)
  const jar = Buffer.from(await response.arrayBuffer())
  const actual = createHash('sha256').update(jar).digest('hex')
  if (actual !== expected) {
    throw new Error(`${asset.name}: el SHA-256 no coincide (esperado ${expected}, llegó ${actual}).`)
  }

  // Se prepara todo fuera y solo se toca la carpeta al final: un fallo a medias
  // no puede dejar un jar sin su plantilla.
  // En la carpeta temporal del sistema: si el script se corta, lo que quede a
  // medias no puede acabar empaquetado con los recursos.
  const dir = pluginDir(source.id)
  const staging = mkdtempSync(join(tmpdir(), 'qubiq-plugin-'))
  const jarPath = join(staging, asset.name)
  writeFileSync(jarPath, jar)

  const pluginYml = readFromJar(jarPath, 'plugin.yml')?.toString('utf8') ?? ''
  const version = /^version:\s*['"]?([^'"\s]+)/m.exec(pluginYml)?.[1]
  const tag = String(release.tag_name ?? '').replace(/^v/, '')
  if (!version) throw new Error(`${asset.name}: no trae plugin.yml con su versión.`)
  if (version !== tag) {
    throw new Error(`${asset.name}: su plugin.yml dice ${version} y la release es ${release.tag_name}.`)
  }

  const template = readFromJar(jarPath, 'config.yml')
  if (!template) throw new Error(`${asset.name}: no trae config.yml, y la app lo necesita de plantilla.`)
  writeFileSync(join(staging, 'config.yml'), template)

  const info = {
    version,
    jarFileName: asset.name,
    sha256: actual,
    license: repo.license?.spdx_id ?? null,
    repository: `https://github.com/${source.repo}`,
    release: release.html_url
  }
  writeFileSync(join(staging, 'plugin.json'), JSON.stringify(info, null, 2) + '\n')

  // Se sustituye la carpeta entera: un jar de la versión anterior que se
  // quedara al lado haría que el servidor no arrancara. Copiar y no renombrar:
  // en Windows el renombrado falla a ratos si el antivirus está mirando.
  rmSync(dir, { recursive: true, force: true })
  cpSync(staging, dir, { recursive: true })
  rmSync(staging, { recursive: true, force: true })
  return info
}

/**
 * Deja los plugins oficiales en su sitio. Con `update`, siempre la última
 * release; sin él, solo los que falten. Devuelve false si alguno falla.
 */
export async function syncOfficialPlugins({ update = false } = {}) {
  let ok = true
  for (const source of OFFICIAL_PLUGIN_SOURCES) {
    const current = installed(source.id)
    if (current && !update) continue
    try {
      const info = await fetchPlugin(source)
      const change = !current
        ? 'descargado'
        : current.sha256 === info.sha256
          ? 'ya estaba al día'
          : `ACTUALIZADO desde ${current.version}`
      console.log(`  ${source.id}: ${info.jarFileName} (${info.license}) ${change}`)
    } catch (err) {
      ok = false
      console.error(`  ${source.id}: ${err instanceof Error ? err.message : err}`)
    }
  }
  return ok
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const update = process.argv.includes('--update')
  if (!(await syncOfficialPlugins({ update }))) {
    console.error('\nNo se han podido traer los plugins oficiales. Sin ellos la app no puede instalarlos.')
    process.exit(1)
  }
}
