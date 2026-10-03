import type { InstanceManifest } from '@shared/types'
import { gameInfo } from '@shared/games'
import { t } from './i18n'

/**
 * Cómo se entra, paso a paso, en los juegos donde no basta con pegar la
 * dirección.
 *
 * Existe por un caso real: Satisfactory rechaza la conexión directa por IP con
 * un «Encryption token missing» que no explica nada, y la forma correcta
 * —añadir el servidor desde el menú del juego— no se le ocurre a nadie. Los
 * juegos que no declaran pasos no pintan nada aquí.
 *
 * Los pasos dependen de CÓMO esté expuesto el servidor: con el crossplay de
 * Valheim no hay dirección que pegar, sino un código que escribir, y enseñar
 * los pasos de la dirección sería mandar al usuario por donde no es.
 */
export function JoinSteps({ manifest }: { manifest: InstanceManifest }): React.JSX.Element | null {
  const info = gameInfo(manifest.game)
  const crossplay = manifest.exposure?.mode === 'crossplay'
  const steps = (crossplay ? info.joinStepsCrossplay : undefined) ?? info.joinSteps
  if (!steps || steps.length === 0) return null

  return (
    <div className="card">
      <h3>{t('join.title')}</h3>
      <ol className="join-steps">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {info.joinWarning && !crossplay && (
        <div className="alert warn" style={{ textAlign: 'left', marginBottom: 0 }}>
          <strong>{t('join.warningTitle')}</strong>
          <p>{info.joinWarning}</p>
        </div>
      )}
    </div>
  )
}
