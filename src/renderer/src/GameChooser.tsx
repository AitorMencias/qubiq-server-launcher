import { useEffect, useState } from 'react'
import type { GameId } from '@shared/types'
import { GAME_IDS, gameInfo } from '@shared/games'
import { GameIcon } from './GameIcon'

/**
 * Elección de juego al crear un servidor: el paso previo a elegir modo.
 *
 * No se elige un juego por su nombre —eso ya se sabe—, sino por lo que va a
 * costar: cuánta gente entra, cuánta memoria pide comparada con la que tiene
 * este equipo, cuánto hay que descargar y qué tiene de raro. Lo que puede
 * cambiar la decisión sale como etiqueta, no escondido dentro del asistente.
 *
 * Mientras la app gestione un solo juego NO se muestra (ver `App`): añadir un
 * clic para elegir entre una única opción sería ruido.
 */

interface Props {
  onChoose: (game: GameId) => void
  onCancel: () => void
}

export function GameChooser({ onChoose, onCancel }: Props): React.JSX.Element {
  const [selected, setSelected] = useState<GameId | null>(null)
  const [totalMemoryMb, setTotalMemoryMb] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    window.qubiq.system
      .memory()
      .then((memory) => {
        if (!cancelled) setTotalMemoryMb(memory.totalMb)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="panel">
      <div className="chooser-intro">
        <h2>¿De qué juego es el servidor?</h2>
        <p>Cada juego tiene su asistente. Tus amigos necesitarán ese mismo juego para entrar.</p>
      </div>

      <div className="game-grid">
        {GAME_IDS.map((id) => {
          const info = gameInfo(id)
          const { card } = info
          const memory = memoryChip(card.memoryGb, totalMemoryMb)

          return (
            <button
              key={id}
              className={`game-card ${selected === id ? 'selected' : ''}`}
              aria-pressed={selected === id}
              onClick={() => setSelected(id)}
              onDoubleClick={() => onChoose(id)}
            >
              <div className="game-card-head">
                <GameIcon game={id} size={40} />
                <span className="game-card-title">{info.name}</span>
              </div>

              <div className="game-card-tag">{card.tagline}</div>

              <dl className="game-facts">
                <dt>Jugadores</dt>
                <dd>{card.players}</dd>
                <dt>Memoria</dt>
                <dd>
                  {card.memoryGb.min}–{card.memoryGb.recommended} GB
                </dd>
                <dt>Descarga</dt>
                <dd>
                  {card.download}
                  {!card.downloadMeasured && <span className="game-fact-note"> (aprox.)</span>}
                </dd>
              </dl>

              <div className="chips">
                {memory && <span className={`chip ${memory.tone}`}>{memory.text}</span>}
                {card.highlights.map((highlight) => (
                  <span key={highlight.text} className={`chip ${highlight.tone}`}>
                    {highlight.text}
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>

      {/* La guía de requisitos: lo mismo que las tarjetas, pero en columnas
          para poder comparar de un vistazo. Todo medido en la fase de cada
          juego, no copiado de sus webs. */}
      <details className="card requirements-guide">
        <summary>Comparar lo que pide cada juego</summary>
        <div className="requirements-scroll">
          <table className="requirements-table">
            <thead>
              <tr>
                <th>Juego</th>
                <th>Memoria</th>
                <th>Descarga</th>
                <th>Arranque</th>
                <th>Para jugar desde fuera</th>
                <th>Además</th>
              </tr>
            </thead>
            <tbody>
              {GAME_IDS.map((id) => {
                const info = gameInfo(id)
                const { card } = info
                return (
                  <tr key={id}>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <GameIcon game={id} size={20} />
                        {info.name}
                      </span>
                    </td>
                    <td>
                      {card.memoryGb.min}–{card.memoryGb.recommended} GB
                    </td>
                    <td>{card.download}</td>
                    <td>{card.requirements.startup}</td>
                    <td>{card.requirements.ports}</td>
                    <td>{card.requirements.extra ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>
          La memoria es la del servidor solo, sin contar Windows ni el propio juego si juegas en el
          mismo equipo. Con varios servidores encendidos a la vez se suman: la app avisa antes de
          arrancar uno más si no caben.
        </p>
      </details>

      <div className="row between wizard-nav">
        <button onClick={onCancel}>Cancelar</button>
        <button className="primary" disabled={selected === null} onClick={() => onChoose(selected!)}>
          {selected ? `Crear un servidor de ${gameInfo(selected).name} →` : 'Elige un juego'}
        </button>
      </div>
    </div>
  )
}

/**
 * Cómo le queda el juego a ESTE equipo. Avisa, nunca bloquea: el ordenador es
 * suyo y puede cerrar cosas o probar de todas formas.
 */
function memoryChip(
  memoryGb: { min: number; recommended: number },
  totalMemoryMb: number | null
): { text: string; tone: 'good' | 'warn' | 'bad' } | null {
  if (totalMemoryMb === null) return null
  const totalGb = Math.round(totalMemoryMb / 1024)

  if (totalGb < memoryGb.min) {
    return { text: `Tu equipo tiene ${totalGb} GB: no le llega`, tone: 'bad' }
  }
  if (totalGb < memoryGb.recommended + 4) {
    return { text: `Tu equipo tiene ${totalGb} GB: irá justo`, tone: 'warn' }
  }
  return { text: 'Tu equipo va sobrado', tone: 'good' }
}
