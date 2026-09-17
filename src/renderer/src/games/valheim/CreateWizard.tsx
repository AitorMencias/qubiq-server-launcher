import { useEffect, useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { GAMES, defaultPortFor } from '@shared/games'
import {
  GLOBAL_KEYS,
  MIN_PASSWORD_LENGTH,
  MODIFIERS,
  PRESETS,
  queryPortFor,
  type ValheimGlobalKey,
  type ValheimModifiers,
  type ValheimPreset
} from '@shared/games/valheim/types'
import { D20Loader } from '../../D20Loader'

/**
 * Asistente de Valheim en modo avanzado: todo en un formulario.
 *
 * Sobre el básico añade control, no pasos: el puerto, los modificadores sueltos
 * (dureza, castigo por morir, recursos, ataques, portales), las reglas de sí o
 * no y si el servidor sale en la lista pública de Steam.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

export function CreateWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [name, setName] = useState('Mi Valheim')
  const [worldName, setWorldName] = useState('')
  const [password, setPassword] = useState('')
  const [port, setPort] = useState(defaultPortFor('valheim'))
  const [connection, setConnection] = useState<ExposureMode>('crossplay')
  const [preset, setPreset] = useState<ValheimPreset>('normal')
  const [modifiers, setModifiers] = useState<ValheimModifiers>({})
  const [globalKeys, setGlobalKeys] = useState<ValheimGlobalKey[]>([])
  const [listed, setListed] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Valheim usa el puerto y el siguiente, los dos UDP. Un puerto UDP
    // «reservable» no está libre de verdad (README), de ahí el protocolo.
    void window.qubiq.network
      .freePort(defaultPortFor('valheim'), 'udp')
      .then(setPort)
      .catch(() => undefined)
  }, [])

  const passwordOk = password.trim().length === 0 || password.trim().length >= MIN_PASSWORD_LENGTH
  const passwordInName =
    password.trim().length > 0 && name.toLowerCase().includes(password.trim().toLowerCase())
  const canCreate = agreed && passwordOk && !passwordInName && name.trim().length > 0

  function toggleKey(key: ValheimGlobalKey, on: boolean): void {
    setGlobalKeys((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)))
  }

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const manifest = await window.qubiq.instances.create({
        game: 'valheim',
        name,
        port,
        agreements: agreed ? ['steam-subscriber'] : [],
        exposure: { mode: connection },
        options: {
          password: password.trim(),
          worldName: worldName.trim() || name.trim(),
          preset,
          modifiers,
          globalKeys,
          listed
        }
      })
      onCreated(manifest.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  if (busy) {
    return (
      <div className="panel">
        <div className="card loading-card" style={{ maxWidth: 620, margin: '40px auto 0' }}>
          <D20Loader size={84} />
          <div>
            <h3>Preparando tu servidor</h3>
            <p className="hint">
              Descargando Valheim (unos 2 GB la primera vez). El mundo lo genera el servidor en su
              primer arranque.
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>{progress?.detail ?? 'Trabajando...'}</p>
            {progress?.progress != null && (
              <div className="progress">
                <div style={{ width: `${Math.round(progress.progress * 100)}%` }} />
              </div>
            )}
            {error && (
              <div className="alert error" style={{ marginTop: 16 }}>
                <strong>No se pudo preparar el servidor</strong>
                <p>{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>Algo ha fallado</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="card">
        <h3>Servidor</h3>

        <div className="field">
          <label>Nombre</label>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <div className="help">Es el que verán tus amigos al añadirlo a su lista.</div>
        </div>

        <div className="field">
          <label>Mundo</label>
          <input
            value={worldName}
            maxLength={40}
            placeholder={name}
            onChange={(e) => setWorldName(e.target.value)}
          />
          <div className="help">
            El nombre determina el terreno. Si lo dejas vacío, se llama como el servidor.
          </div>
        </div>

        <div className="field">
          <label>Contraseña</label>
          <input
            type="text"
            value={password}
            maxLength={40}
            placeholder={`Al menos ${MIN_PASSWORD_LENGTH} caracteres, o vacío`}
            onChange={(e) => setPassword(e.target.value)}
          />
          {!passwordOk && (
            <div className="help" style={{ color: 'var(--danger)' }}>
              Valheim pide al menos {MIN_PASSWORD_LENGTH} caracteres.
            </div>
          )}
          {passwordInName && (
            <div className="help" style={{ color: 'var(--danger)' }}>
              No puede estar dentro del nombre del servidor: quien vea el nombre la sabría.
            </div>
          )}
        </div>

        <div className="field">
          <label>Puerto</label>
          <input
            type="number"
            min={1024}
            max={65535}
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
          />
          <div className="help">
            Valheim usa este y el siguiente ({queryPortFor(port)}), los dos <strong>UDP</strong>. El
            segundo no se puede elegir por separado.
          </div>
        </div>

        <div className="field">
          <label>¿Cómo van a entrar?</label>
          <select
            value={connection}
            onChange={(e) => setConnection(e.target.value as ExposureMode)}
          >
            <option value="local">Solo en mi casa (misma red)</option>
            <option value="crossplay">Con el crossplay del juego (código de 6 dígitos)</option>
            <option value="router">Abriendo los puertos en el router</option>
            <option value="tunnel">Con playit.gg</option>
          </select>
          <div className="help">
            El crossplay lo trae el propio juego: no toca el router y funciona con CGNAT.
          </div>
        </div>

        <label className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={listed}
            onChange={(e) => setListed(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>Que aparezca en la lista pública de servidores de Steam</span>
        </label>
        <div className="help">
          Cualquiera podría encontrarlo, y ahí sale tu dirección de internet. A cambio, la app puede
          preguntarle cuánta gente hay dentro: sin esto, el servidor no contesta a esas preguntas.
        </div>
      </div>

      <div className="card">
        <h3>Dificultad</h3>

        <div className="field">
          <label>Preajuste</label>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as ValheimPreset)}
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <div className="help">{PRESETS.find((p) => p.value === preset)?.help}</div>
        </div>

        {MODIFIERS.map((modifier) => (
          <div className="field" key={modifier.key}>
            <label>{modifier.label}</label>
            <select
              value={modifiers[modifier.key] ?? 'default'}
              onChange={(e) =>
                setModifiers((prev) => ({ ...prev, [modifier.key]: e.target.value }))
              }
            >
              {modifier.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="help">{modifier.help}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Reglas del mundo</h3>
        <p className="hint">De sí o no, y afectan a la partida entera.</p>
        {GLOBAL_KEYS.map((rule) => (
          <label className="row" key={rule.key} style={{ cursor: 'pointer', marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={globalKeys.includes(rule.key)}
              onChange={(e) => toggleKey(rule.key, e.target.checked)}
              style={{ width: 16, height: 16, flexShrink: 0 }}
            />
            <span>
              <strong>{rule.label}</strong>
              <div className="help" style={{ margin: 0 }}>
                {rule.help}
              </div>
            </span>
          </label>
        ))}
      </div>

      <div className="card">
        <h3>Condiciones</h3>
        <p className="hint">
          El servidor se descarga de Steam de forma anónima, sin cuenta ni contraseña.
        </p>
        <label className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>
            He leído y acepto el{' '}
            <a
              href={GAMES.valheim.agreements[0]!.url}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent)' }}
            >
              Acuerdo de Suscriptor de Steam
            </a>
          </span>
        </label>
      </div>

      <div className="row">
        <button className="primary" disabled={!canCreate} onClick={() => void create()}>
          Crear servidor
        </button>
        <button onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}
