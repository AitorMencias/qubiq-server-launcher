import type { UiMode } from '@shared/types'

/**
 * Elección de modo al crear un servidor.
 *
 * Se pregunta ANTES del asistente y no dentro, porque no es un ajuste más: es
 * qué tipo de conversación va a tener la app contigo. Poner esto como un
 * desplegable escondido dejaría a quien no sabe del tema en el formulario
 * completo, que es justo lo que queremos evitar (§3).
 */

interface Props {
  current: UiMode
  onChoose: (mode: UiMode) => void
  onCancel: () => void
}

interface ModeCard {
  mode: UiMode
  title: string
  tagline: string
  points: string[]
  recommended?: boolean
}

const MODES: ModeCard[] = [
  {
    mode: 'basic',
    title: 'Básico',
    tagline: 'Te guiamos paso a paso',
    points: [
      'Una pregunta por pantalla: el nombre, cuánta gente sois, lo que pida el juego y cómo os conectáis',
      'Lo técnico lo ponemos nosotros: versión, memoria y puerto',
      'Después, solo un botón para encender y apagar, tus jugadores y la consola'
    ],
    recommended: true
  },
  {
    mode: 'advanced',
    title: 'Avanzado',
    tagline: 'Tú decides todo',
    points: [
      'Eliges versión concreta, memoria y puerto',
      'La misma pantalla, con toda la configuración desbloqueada y ficha técnica',
      'Copias con intervalo y retención, semillas y todos los ajustes del juego'
    ]
  }
]

export function ModeChooser({ current, onChoose, onCancel }: Props): React.JSX.Element {
  return (
    <div className="panel">
      <div className="chooser-intro">
        <h2>¿Cómo quieres crearlo?</h2>
        <p>
          Puedes cambiar de modo cuando quieras desde la barra de la izquierda. No afecta al
          servidor, solo a cuánto te preguntamos.
        </p>
      </div>

      <div className="mode-choice-grid">
        {MODES.map((card) => (
          <button
            key={card.mode}
            className={`mode-card ${current === card.mode ? 'current' : ''}`}
            onClick={() => onChoose(card.mode)}
          >
            <div className="mode-card-head">
              <span className="mode-card-title">{card.title}</span>
              {card.recommended && <span className="badge">Recomendado</span>}
              {current === card.mode && !card.recommended && (
                <span className="badge muted">Tu modo actual</span>
              )}
            </div>

            <p className="mode-card-tagline">{card.tagline}</p>

            <ul className="mode-card-points">
              {card.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>

            <span className="mode-card-cta">Crear en modo {card.title.toLowerCase()} →</span>
          </button>
        ))}
      </div>

      <div className="row" style={{ justifyContent: 'center', marginTop: 4 }}>
        <button onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}
