import { useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import type { InstallableVersion } from '@shared/games'
import { gameInfo, theSave } from '@shared/games'
import { uiFor } from './games'

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
          <h3>Cambiar a {version.label}</h3>
          <button disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
        </div>

        <div className="modal-body">
          <p>
            El servidor pasa de <strong>{from?.label ?? 'la versión que tiene'}</strong> a{' '}
            <strong>{version.label}</strong>. Se vuelve a instalar entero, y{' '}
            {theSave(save)} se queda donde está.
          </p>

          {goingBack && (
            <div className="alert warn">
              <strong>Vas a una versión anterior</strong>
              <p>
                Lo que tienes guardado{loss ? ` —${lowerFirst(loss)}—` : ''} se creó con una
                versión posterior. Puede que la anterior no sepa abrirlo, y en algunos juegos eso
                estropea la partida sin avisar. Si lo que quieres es probar, hazlo con un servidor
                nuevo.
              </p>
            </div>
          )}

          {unknown && (
            <div className="alert warn">
              <strong>No se sabe cuál es más nueva</strong>
              <p>
                No se ha podido comparar esta versión con la que tienes, así que podría ser
                anterior. Si lo es, {theSave(save)} podría no abrirse.
              </p>
            </div>
          )}

          {version.experimental && (
            <div className="alert warn">
              <strong>Esta versión está en pruebas</strong>
              <p>
                No está terminada: puede fallar, ir peor de rendimiento o dar problemas con lo que
                tengas instalado. La de siempre es la opción segura.
              </p>
            </div>
          )}

          <p className="note">
            Antes de tocar nada se guarda una copia de seguridad, así que si sale mal puedes
            recuperar {theSave(save)} de ahora desde la pestaña «Copias».
          </p>

          <div className="row between" style={{ marginTop: 20 }}>
            <button disabled={busy} onClick={onCancel}>
              Mejor no
            </button>
            <button
              className={goingBack || unknown ? 'danger' : 'primary'}
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? 'Cambiando...' : `Cambiar a ${version.label}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
