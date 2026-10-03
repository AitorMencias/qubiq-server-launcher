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
import { links } from './links'
import type { Dictionary } from '../../types'

/** Portugués (de Brasil). */
export const pt: Dictionary = {
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
  ...remote,
  ...links
}
