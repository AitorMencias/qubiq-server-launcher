import type { Distribution } from '@shared/types'
import type { Installer } from './types'
import { vanillaInstaller, paperInstaller, fabricInstaller } from './simple'
import { forgeInstaller } from './forge'

const REGISTRY: Record<Distribution, Installer> = {
  vanilla: vanillaInstaller,
  paper: paperInstaller,
  fabric: fabricInstaller,
  forge: forgeInstaller
}

export function installerFor(distribution: Distribution): Installer {
  const installer = REGISTRY[distribution]
  if (!installer) {
    throw new Error(`No hay instalador para la distribución "${distribution}".`)
  }
  return installer
}

export type { Installer, InstallContext, InstallResult, LaunchPlan } from './types'
