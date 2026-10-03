import { shell } from './shell'
import { games } from './games'
import { panel } from './panel'
import { minecraft } from './minecraft'
import { satisfactory } from './satisfactory'
import { valheim } from './valheim'
import { factorio } from './factorio'
import { zomboid } from './zomboid'
import { enshrouded } from './enshrouded'
import { rust } from './rust'
import { remote } from './remote'
import type { Dictionary } from '../../types'

/** Hindi. */
export const hi: Dictionary = {
  ...shell,
  ...games,
  ...panel,
  ...minecraft,
  ...satisfactory,
  ...valheim,
  ...factorio,
  ...zomboid,
  ...enshrouded,
  ...rust,
  ...remote
}
