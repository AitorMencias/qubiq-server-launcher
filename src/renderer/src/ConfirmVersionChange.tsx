import { useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import type { InstallableVersion } from '@shared/games'
import { gameInfo } from '@shared/games'
import { uiFor } from './games'
import { Rich, t } from './i18n'

/**
 * Confirmación para llevar un servidor a otra versión.
 *
 * Subir a la recomendada no pasa por aquí: es lo que el juego espera. Lo que sí
 * pasa es bajar a una anterior, meterse en una en pruebas o cambiar sin poder
 * saber cuál es más nueva.
 *
 * Bajar es lo grave, y conviene decirlo sin rodeos: una partida guardada por
 * una versión posterior puede no volver a abrirse (un mundo de Minecraft 26.3
 * no carga en 26.2). Por eso la pantalla nombra la partida concreta que hay en
 * juego, no «tus datos», y recuerda que la copia se hace sola antes de tocar
 * nada.
 */

interface Props {
  state: InstanceState
  /** A dónde va. */
  version: InstallableVersion
  /** De dónde viene, si se sabe. */
  from: InstallableVersion | null
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** «Sus 3 mundos…» metido dentro de una frase deja de ir en mayúscula. */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

export function ConfirmVersionChange({
  state,
  version,
  from,
  busy,
  onCancel,
  onConfirm
}: Props): React.JSX.Element {
  const { manifest } = state
  const save = gameInfo(manifest.game).save
  const [loss, setLoss] = useState<string | null>(null)

  // Lo mismo que se enseña al borrar: qué hay dentro ahora mismo, dicho en
  // concreto. Una advertencia sobre «la partida» no la lee nadie; sobre «tu
  // mundo Valheim de prueba», sí.
  useEffect(() => {
    void uiFor(manifest)
      .describeLoss(manifest)
      .then(setLoss)
      .catch(() => setLoss(null))
  }, [manifest.id])

  const goingBack = version.relation === 'older'
  const unknown = version.relation === 'unknown'

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t('versionChange.title', { version: version.label })}</h3>
          <button disabled={busy} onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>

        <div className="modal-body">
          <p>
            <Rich
              k={`versionChange.intro.${save}`}
              values={{
                from: <strong>{from?.label ?? t('versionChange.currentVersion')}</strong>,
                to: <strong>{version.label}</strong>
              }}
            />
          </p>

          {goingBack && (
            <div className="alert warn">
              <strong>{t('versionChange.olderTitle')}</strong>
              <p>
                {loss
                  ? t('versionChange.olderWithLoss', { loss: lowerFirst(loss) })
                  : t('versionChange.older')}
              </p>
            </div>
          )}

          {unknown && (
            <div className="alert warn">
              <strong>{t('versionChange.unknownTitle')}</strong>
              <p>{t(`versionChange.unknown.${save}`)}</p>
            </div>
          )}

          {version.experimental && (
            <div className="alert warn">
              <strong>{t('versionChange.experimentalTitle')}</strong>
              <p>{t('versionChange.experimental')}</p>
            </div>
          )}

          <p className="note">
            {t(`versionChange.backupNote.${save}`, { tab: t('panel.tab.backups') })}
          </p>

          <div className="row between" style={{ marginTop: 20 }}>
            <button disabled={busy} onClick={onCancel}>
              {t('common.betterNot')}
            </button>
            <button
              className={goingBack || unknown ? 'danger' : 'primary'}
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? t('versionChange.changing') : t('versionChange.title', { version: version.label })}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
