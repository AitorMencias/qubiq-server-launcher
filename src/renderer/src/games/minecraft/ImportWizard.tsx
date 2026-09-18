import { useEffect, useState } from 'react'
import type {
  Distribution,
  ImportInspection,
  StartFileInfo
} from '@shared/games/minecraft/types'
import { DISTRIBUTIONS, DISTRIBUTION_LABELS } from '@shared/games/minecraft/types'
import type { MemoryInfo } from '@shared/ipc'
import type { UiMode } from '@shared/types'
import { D20Loader } from '../../D20Loader'
import type { WizardProps } from '../types'

/**
 * Traer un servidor a medida (§19.x): una carpeta que el usuario ya tiene, como
 * un server pack de CurseForge o un servidor montado a mano, que arranca con su
 * propio archivo de inicio (normalmente run.bat).
 *
 * Es otro recorrido, no un paso más del asistente: aquí no se elige ni el modo
 * de juego ni el mundo, porque ya vienen en la carpeta. Lo que hay que decidir
 * es con qué arranca, qué es (para el Java y las pestañas) y cómo se llama.
 *
 * ⚠ La carpeta se MUEVE a QubiQ (decisión del usuario). Se dice antes de
 * pulsar, con la ruta delante, y cuánto va a tardar si está en otro disco.
 */

interface Props extends WizardProps {
  mode: UiMode
  /** El nombre que ya se había escrito en el asistente, si lo hay. */
  initialName: string
  /** Volver al asistente normal. */
  onBack: () => void
}

const DEFAULT_NAME = 'Mi servidor'

export function ImportWizard({
  mode,
  initialName,
  onBack,
  onCreated,
  progress
}: Props): React.JSX.Element {
  const advanced = mode === 'advanced'

  const [inspection, setInspection] = useState<ImportInspection | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const [startFiles, setStartFiles] = useState<StartFileInfo[]>([])
  const [startFile, setStartFile] = useState('')
  const [distribution, setDistribution] = useState<Distribution>('neoforge')
  const [version, setVersion] = useState('')
  const [releases, setReleases] = useState<string[]>([])
  const [name, setName] = useState(initialName)
  const [expectedPlayers, setExpectedPlayers] = useState(8)
  const [memory, setMemory] = useState<MemoryInfo | null>(null)
  const [memoryMb, setMemoryMb] = useState(6144)
  const [memoryTouched, setMemoryTouched] = useState(false)
  const [recommendedMb, setRecommendedMb] = useState<number | null>(null)
  const [port, setPort] = useState(25565)
  const [eula, setEula] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.qubiq.minecraft.catalog.memory().then(setMemory)
    // Todas las versiones publicadas del juego: la del servidor puede ser
    // cualquiera, no solo las que la app sabría instalar.
    void window.qubiq.minecraft.catalog
      .versions('vanilla')
      .then((list) => setReleases(list.map((v) => v.minecraftVersion)))
      .catch(() => setReleases([]))
  }, [])

  useEffect(() => {
    let cancelled = false
    void window.qubiq.minecraft.catalog
      .recommendMemory(expectedPlayers, distribution)
      .then((value) => {
        if (cancelled) return
        setRecommendedMb(value)
        if (!memoryTouched) setMemoryMb(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [expectedPlayers, distribution, memoryTouched])

  async function chooseFolder(): Promise<void> {
    setError(null)
    const folder = await window.qubiq.minecraft.custom.pickFolder()
    if (!folder) return
    setInspecting(true)
    setInspection(null)
    try {
      const found = await window.qubiq.minecraft.custom.inspect(folder)
      setInspection(found)
      setStartFiles(found.startFiles)
      setStartFile(found.suggestedStartFile ?? '')
      if (found.distribution) setDistribution(found.distribution)
      setVersion(found.minecraftVersion ?? '')
      if (found.port) setPort(found.port)
      if (found.maxPlayers) setExpectedPlayers(Math.max(2, Math.min(50, found.maxPlayers)))
      // Si no se había escrito nombre, el de la carpeta dice más que «Mi servidor».
      if (name.trim() === '' || name === DEFAULT_NAME) setName(lastSegment(folder).slice(0, 40))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInspecting(false)
    }
  }

  async function chooseStartFile(): Promise<void> {
    if (!inspection) return
    setError(null)
    try {
      const picked = await window.qubiq.minecraft.custom.pickStartFile({ folder: inspection.folder })
      if (!picked) return
      setStartFiles((current) =>
        current.some((f) => f.path === picked.path) ? current : [...current, picked]
      )
      setStartFile(picked.path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function create(): Promise<void> {
    if (!inspection) return
    setBusy(true)
    setError(null)
    try {
      // En básico el puerto no se pregunta: se respeta el del servidor si está
      // libre y, si no, el primero libre a partir de él.
      const chosenPort = advanced ? port : await window.qubiq.network.freePort(inspection.port ?? 25565)
      const manifest = await window.qubiq.instances.create({
        game: 'minecraft',
        name,
        expectedPlayers,
        port: chosenPort,
        agreements: eula ? ['minecraft-eula'] : [],
        options: {
          distribution,
          minecraftVersion: version,
          memoryMb,
          import: { folder: inspection.folder, startFile }
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
            <h3>Trayendo tu servidor</h3>
            <p className="hint">
              {inspection?.sameDrive
                ? 'Lo movemos a QubiQ y preparamos el Java que necesita.'
                : 'Está en otro disco, así que primero se copia entero; la carpeta original se borra solo cuando la copia está completa.'}
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>{progress?.detail ?? 'Trabajando...'}</p>
            {progress?.progress != null && (
              <div className="progress">
                <div style={{ width: `${Math.round(progress.progress * 100)}%` }} />
              </div>
            )}
            {error && (
              <div className="alert error" style={{ marginTop: 16 }}>
                <strong>No se pudo traer el servidor</strong>
                <p>{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const usable = inspection !== null && inspection.problems.length === 0
  const selected = startFiles.find((f) => f.path === startFile)
  const versionOptions = version && !releases.includes(version) ? [version, ...releases] : releases
  const overMemory = memory !== null && memoryMb > memory.warningThresholdMb
  const canCreate =
    usable && Boolean(selected) && version.length > 0 && name.trim().length > 0 && eula

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>Algo ha fallado</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="card">
        <h3>1. ¿Dónde está el servidor?</h3>
        <p className="hint">
          La carpeta donde está su <strong>run.bat</strong> (o su .jar): un server pack descargado
          de CurseForge o Modrinth, o un servidor que ya tenías montado.
        </p>
        <div className="row">
          <button className={inspection ? '' : 'primary'} disabled={inspecting} onClick={() => void chooseFolder()}>
            {inspection ? 'Elegir otra carpeta' : 'Elegir carpeta…'}
          </button>
          {inspecting && (
            <span className="row" style={{ gap: 8, color: 'var(--muted)' }}>
              <D20Loader size={20} /> Mirando qué hay dentro…
            </span>
          )}
        </div>

        {inspection && (
          <div style={{ marginTop: 14 }}>
            <div className="mono-path">{inspection.folder}</div>

            {inspection.problems.length > 0 ? (
              <div className="alert error" style={{ marginTop: 12, marginBottom: 0 }}>
                <strong>Esta carpeta no se puede traer</strong>
                {inspection.problems.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            ) : (
              <>
                <div className="chips" style={{ marginTop: 10 }}>
                  <span className="chip good">
                    {inspection.distribution
                      ? DISTRIBUTION_LABELS[inspection.distribution].name
                      : 'Tipo sin reconocer'}
                    {inspection.build ? ` ${inspection.build}` : ''}
                  </span>
                  <span className={`chip ${inspection.minecraftVersion ? 'good' : 'warn'}`}>
                    {inspection.minecraftVersion
                      ? `Minecraft ${inspection.minecraftVersion}`
                      : 'Versión sin reconocer'}
                  </span>
                  {inspection.contentCount > 0 && (
                    <span className="chip">
                      {inspection.contentCount} {inspection.distribution === 'paper' ? 'plugins' : 'mods'}
                    </span>
                  )}
                  <span className="chip">{inspection.hasWorld ? 'Con mundo' : 'Sin mundo todavía'}</span>
                  <span className="chip">{formatSize(inspection.sizeBytes)}</span>
                </div>

                <div className="alert warn" style={{ marginTop: 12, marginBottom: 0 }}>
                  <strong>La carpeta se va a mover a QubiQ</strong>
                  <p>
                    Dejará de estar donde está ahora. Si quieres conservar una copia ahí, hazla
                    antes de seguir.{' '}
                    {inspection.sameDrive
                      ? 'Está en el mismo disco, así que es instantáneo.'
                      : `Está en otro disco: se copiarán ${formatSize(inspection.sizeBytes)} y, cuando la copia esté completa, se borrará la original. Puede tardar un rato.`}
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {usable && (
        <>
          <div className="card">
            <h3>2. ¿Con qué arranca?</h3>
            <p className="hint">
              El archivo que abrías para encender el servidor. Normalmente es <strong>run.bat</strong>.
            </p>
            <div className="choice-grid" style={{ gridTemplateColumns: '1fr' }}>
              {startFiles.map((file) => (
                <button
                  key={file.path}
                  className={`choice ${startFile === file.path ? 'selected' : ''}`}
                  onClick={() => setStartFile(file.path)}
                >
                  <div className="title">{file.path}</div>
                  <div className="sub">{describeStart(file)}</div>
                </button>
              ))}
            </div>
            <button style={{ marginTop: 10 }} onClick={() => void chooseStartFile()}>
              Elegir otro archivo…
            </button>

            {selected?.restartLoop && (
              <div className="alert warn" style={{ marginTop: 12, marginBottom: 0 }}>
                <strong>Este archivo vuelve a arrancar el servidor cuando se cierra</strong>
                <p>
                  Con QubiQ no hace falta (tiene su propio reinicio automático) y hace que Parar no
                  pueda cerrarlo limpiamente: tendría que forzarlo pasado un minuto. Si hay otro
                  archivo sin ese bucle, mejor elige ese.
                </p>
              </div>
            )}
          </div>

          <div className="card">
            <h3>3. ¿Qué servidor es?</h3>
            <p className="hint">
              {inspection.distribution && inspection.minecraftVersion
                ? 'Lo hemos reconocido solo. Cámbialo solo si no es correcto.'
                : 'No lo hemos reconocido del todo: complétalo tú.'}
            </p>
            <div className="field">
              <label>Tipo</label>
              <select
                value={distribution}
                onChange={(e) => setDistribution(e.target.value as Distribution)}
              >
                {DISTRIBUTIONS.map((d) => (
                  <option key={d} value={d}>
                    {DISTRIBUTION_LABELS[d].name}
                  </option>
                ))}
              </select>
              <div className="help">Decide si aparece la pestaña de Mods o la de Plugins.</div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Versión de Minecraft</label>
              <select value={version} onChange={(e) => setVersion(e.target.value)}>
                {!version && <option value="">Elige la versión…</option>}
                {versionOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <div className="help">
                Con ella elegimos el Java que necesita, y es la que tendrán que usar tus amigos.
              </div>
            </div>
          </div>

          <div className="card">
            <h3>4. Nombre y ajustes</h3>
            <div className="field">
              <label>Nombre</label>
              <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              <div className="help">El que verás en la lista. Puedes cambiarlo luego.</div>
            </div>

            <div className="field">
              <label>¿Cuánta gente vais a ser? {expectedPlayers} jugadores</label>
              <input
                type="range"
                min={2}
                max={50}
                step={1}
                value={expectedPlayers}
                onChange={(e) => setExpectedPlayers(Number(e.target.value))}
              />
            </div>

            {selected?.memory === 'script' ? (
              <div className="alert info" style={{ marginBottom: advanced ? 16 : 0 }}>
                <strong>La memoria la decide tu archivo de inicio</strong>
                <p>
                  {selected.setsMemory
                    ? 'Lleva escrita la suya (-Xmx), y manda sobre cualquier otra. Para cambiarla, edita ese archivo.'
                    : 'No usa user_jvm_args.txt, así que la app no tiene dónde ponerla. Para cambiarla, edita ese archivo.'}
                </p>
              </div>
            ) : (
              <div className="field" style={advanced ? undefined : { marginBottom: 0 }}>
                <label>Memoria asignada: {(memoryMb / 1024).toFixed(1)} GB</label>
                <input
                  type="range"
                  min={2048}
                  max={memory ? Math.max(4096, memory.totalMb - 2048) : 8192}
                  step={512}
                  value={memoryMb}
                  onChange={(e) => {
                    setMemoryTouched(true)
                    setMemoryMb(Number(e.target.value))
                  }}
                />
                <div className="help">
                  {overMemory
                    ? 'Cuidado: estás asignando casi toda la memoria del equipo. Si además juegas en este PC, se puede quedar sin respuesta.'
                    : `Recomendamos ${recommendedMb !== null ? `${(recommendedMb / 1024).toFixed(1)} GB` : '...'}; un modpack grande puede pedir más.`}
                  {selected?.memory === 'jvm-args' &&
                    ' Se guarda en su user_jvm_args.txt, cambiando solo las líneas de memoria.'}
                </div>
              </div>
            )}

            {advanced && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Puerto</label>
                <input
                  type="number"
                  value={port}
                  min={1024}
                  max={65535}
                  onChange={(e) => setPort(Number(e.target.value))}
                />
                <div className="help">
                  {inspection.port
                    ? `Es el que tenía en su server.properties (${inspection.port}).`
                    : 'Déjalo en 25565 salvo que ya tengas otro servidor usándolo.'}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Condiciones de Minecraft</h3>
            <p className="hint">
              Mojang exige aceptar su EULA para poder ejecutar un servidor.
            </p>
            <label className="row" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={eula}
                onChange={(e) => setEula(e.target.checked)}
                style={{ width: 16, height: 16, flexShrink: 0 }}
              />
              <span>
                He leído y acepto el{' '}
                <a
                  href="https://aka.ms/MinecraftEULA"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent)' }}
                >
                  EULA de Minecraft
                </a>
              </span>
            </label>
          </div>
        </>
      )}

      <div className="row between">
        <button onClick={onBack}>Atrás</button>
        <button className="primary" disabled={!canCreate} onClick={() => void create()}>
          Traer servidor
        </button>
      </div>
    </div>
  )
}

/** Lo que conviene saber de un archivo de inicio antes de elegirlo. */
function describeStart(file: StartFileInfo): string {
  const what = file.kind === 'jar' ? 'Jar de Java' : 'Script de Windows'
  const memory =
    file.memory === 'app'
      ? 'la memoria la pones aquí'
      : file.memory === 'jvm-args'
        ? 'la memoria la pones aquí (va a su user_jvm_args.txt)'
        : 'la memoria la decide el propio archivo'
  const loop = file.restartLoop ? ' · se reinicia solo al cerrarse' : ''
  return `${what} · ${memory}${loop}`
}

function lastSegment(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace('.', ',')} GB`
}
