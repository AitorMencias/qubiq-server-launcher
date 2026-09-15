import { join } from 'node:path'
import { access } from 'node:fs/promises'
import type { Installer, InstallContext, InstallResult, LaunchPlan } from './types'
import { defaultJvmArgs } from './jvmArgs'
import { download } from '../../../net/downloader'
import { ensureDir } from '../../../paths'
import * as mojang from '../versions/mojang'
import * as paper from '../versions/paper'
import * as fabric from '../versions/fabric'

/**
 * Vanilla, Paper y Fabric (§6): las tres se resuelven descargando un único jar
 * y lanzando `java -jar <jar> nogui`.
 *
 * Encajan sin fricción en la abstracción precisamente porque esta se diseñó
 * contra Forge, que es el caso difícil (§15.1).
 */

const SERVER_JAR = 'server.jar'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function simpleLaunchPlan(ctx: InstallContext, jarName: string): LaunchPlan {
  return {
    args: [...defaultJvmArgs(ctx.memoryMb), '-jar', jarName, 'nogui'],
    memoryHandledExternally: false
  }
}

export const vanillaInstaller: Installer = {
  distribution: 'vanilla',

  async install(ctx: InstallContext): Promise<InstallResult> {
    await ensureDir(ctx.serverDir)
    ctx.onProgress('resolve', null, 'Consultando el catálogo de Mojang')
    const { url, sha1, size } = await mojang.serverDownload(ctx.minecraftVersion)

    ctx.onProgress('download', 0, 'Descargando el servidor')
    await download({
      url,
      destination: join(ctx.serverDir, SERVER_JAR),
      expectedHash: { algorithm: 'sha1', value: sha1 },
      expectedSize: size,
      signal: ctx.signal,
      onProgress: (received, total) => {
        ctx.onProgress('download', total ? received / total : null, 'Descargando el servidor')
      }
    })
    return {}
  },

  async buildLaunchPlan(ctx: InstallContext): Promise<LaunchPlan> {
    return simpleLaunchPlan(ctx, SERVER_JAR)
  }
}

export const paperInstaller: Installer = {
  distribution: 'paper',

  async install(ctx: InstallContext): Promise<InstallResult> {
    await ensureDir(ctx.serverDir)
    ctx.onProgress('resolve', null, 'Buscando el último build estable de Paper')
    const build = await paper.latestBuild(ctx.minecraftVersion)

    ctx.onProgress('download', 0, 'Descargando Paper')
    await download({
      url: build.url,
      destination: join(ctx.serverDir, SERVER_JAR),
      // Paper publica SHA-256, no SHA-1 (§4.2).
      expectedHash: { algorithm: 'sha256', value: build.sha256 },
      expectedSize: build.size,
      signal: ctx.signal,
      onProgress: (received, total) => {
        ctx.onProgress('download', total ? received / total : null, 'Descargando Paper')
      }
    })
    return { build: build.build }
  },

  async buildLaunchPlan(ctx: InstallContext): Promise<LaunchPlan> {
    return simpleLaunchPlan(ctx, SERVER_JAR)
  }
}

export const fabricInstaller: Installer = {
  distribution: 'fabric',

  async install(ctx: InstallContext): Promise<InstallResult> {
    await ensureDir(ctx.serverDir)
    ctx.onProgress('resolve', null, 'Consultando el meta de Fabric')
    const jar = await fabric.serverJar(ctx.minecraftVersion)

    ctx.onProgress('download', 0, 'Descargando Fabric')
    await download({
      url: jar.url,
      destination: join(ctx.serverDir, jar.fileName),
      signal: ctx.signal,
      onProgress: (received, total) => {
        ctx.onProgress('download', total ? received / total : null, 'Descargando Fabric')
      }
    })

    // El launcher de Fabric descarga sus dependencias en el primer arranque,
    // así que hasta entonces la instancia necesita conexión (§6).
    ctx.onProgress('install', 1, 'Fabric listo. El primer arranque necesitará conexión.')
    return { build: jar.loader }
  },

  async buildLaunchPlan(ctx: InstallContext): Promise<LaunchPlan> {
    const launcher = 'fabric-server-launch.jar'
    if (!(await exists(join(ctx.serverDir, launcher)))) {
      throw new Error(
        'Falta fabric-server-launch.jar. La instalación quedó incompleta: reinstala la instancia.'
      )
    }
    return simpleLaunchPlan(ctx, launcher)
  }
}
