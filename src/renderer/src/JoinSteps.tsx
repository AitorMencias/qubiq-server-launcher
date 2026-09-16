import type { InstanceManifest } from '@shared/types'
import { gameInfo } from '@shared/games'

/**
 * Cómo se entra, paso a paso, en los juegos donde no basta con pegar la
 * dirección.
 *
 * Existe por un caso real: Satisfactory rechaza la conexión directa por IP con
 * un «Encryption token missing» que no explica nada, y la forma correcta
 * —añadir el servidor desde el menú del juego— no se le ocurre a nadie. Los
 * juegos que no declaran pasos no pintan nada aquí.
 */
export function JoinSteps({ manifest }: { manifest: InstanceManifest }): React.JSX.Element | null {
  const info = gameInfo(manifest.game)
  if (!info.joinSteps || info.joinSteps.length === 0) return null

  return (
    <div className="card">
      <h3>Cómo entran en el servidor</h3>
      <ol className="join-steps">
        {info.joinSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {info.joinWarning && (
        <div className="alert warn" style={{ textAlign: 'left', marginBottom: 0 }}>
          <strong>Ojo con la conexión directa</strong>
          <p>{info.joinWarning}</p>
        </div>
      )}
    </div>
  )
}
