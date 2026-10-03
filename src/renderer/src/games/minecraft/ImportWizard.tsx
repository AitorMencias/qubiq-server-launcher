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
import { Rich, formatNumber, formatSize, t, unitLabel } from '../../i18n'

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
      if (name.trim() === '' || name === t('mc.wizard.defaultName')) {
        setName(lastSegment(folder).slice(0, 40))
      }
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
            <h3>{t('mc.import.bringing')}</h3>
            <p className="hint">
              {inspection?.sameDrive ? t('mc.import.bringingSame') : t('mc.import.bringingOther')}
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>
              {progress?.detail ?? t('panel.working')}
            </p>
            {progress?.progress != null && (
              <div className="progress">
                <div style={{ width: `${Math.round(progress.progress * 100)}%` }} />
              </div>
            )}
            {error && (
              <div className="alert error" style={{ marginTop: 16 }}>
                <strong>{t('mc.import.failed')}</strong>
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
          <strong>{t('catalog.error')}</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="card">
        <h3>{t('mc.import.where')}</h3>
        <p className="hint">
          <Rich k="mc.import.whereHint" values={{ runBat: <strong>run.bat</strong> }} />
        </p>
        <div className="row">
          <button className={inspection ? '' : 'primary'} disabled={inspecting} onClick={() => void chooseFolder()}>
            {inspection ? t('mc.import.otherFolder') : t('mc.import.chooseFolder')}
          </button>
          {inspecting && (
            <span className="row" style={{ gap: 8, color: 'var(--muted)' }}>
              <D20Loader size={20} /> {t('mc.import.inspecting')}
            </span>
          )}
        </div>

        {inspection && (
          <div style={{ marginTop: 14 }}>
            <div className="mono-path">{inspection.folder}</div>

            {inspection.problems.length > 0 ? (
              <div className="alert error" style={{ marginTop: 12, marginBottom: 0 }}>
                <strong>{t('mc.import.cannot')}</strong>
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
                      : t('mc.import.unknownType')}
                    {inspection.build ? ` ${inspection.build}` : ''}
                  </span>
                  <span className={`chip ${inspection.minecraftVersion ? 'good' : 'warn'}`}>
                    {inspection.minecraftVersion
                      ? `Minecraft ${inspection.minecraftVersion}`
                      : t('mc.import.unknownVersion')}
                  </span>
                  {inspection.contentCount > 0 && (
                    <span className="chip">
                      {inspection.distribution === 'paper'
                        ? t('mc.import.plugins', { count: inspection.contentCount })
                        : t('mc.import.mods', { count: inspection.contentCount })}
                    </span>
                  )}
                  <span className="chip">
                    {inspection.hasWorld ? t('mc.import.withWorld') : t('mc.import.noWorld')}
                  </span>
                  <span className="chip">{sizeLabel(inspection.sizeBytes)}</span>
                </div>

                <div className="alert warn" style={{ marginTop: 12, marginBottom: 0 }}>
                  <strong>{t('mc.import.willMove')}</strong>
                  <p>
                    {t('mc.import.willMoveText')}{' '}
                    {inspection.sameDrive
                      ? t('mc.import.sameDrive')
                      : t('mc.import.otherDrive', { size: sizeLabel(inspection.sizeBytes) })}
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
            <h3>{t('mc.import.startWith')}</h3>
            <p className="hint">
              <Rich k="mc.import.startWithHint" values={{ runBat: <strong>run.bat</strong> }} />
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
              {t('mc.import.otherFile')}
            </button>

            {selected?.restartLoop && (
              <div className="alert warn" style={{ marginTop: 12, marginBottom: 0 }}>
                <strong>{t('mc.import.loopTitle')}</strong>
                <p>{t('mc.import.loopText')}</p>
              </div>
            )}
          </div>

          <div className="card">
            <h3>{t('mc.import.what')}</h3>
            <p className="hint">
              {inspection.distribution && inspection.minecraftVersion
                ? t('mc.import.recognized')
                : t('mc.import.notRecognized')}
            </p>
            <div className="field">
              <label>{t('mc.wizard.summary.type')}</label>
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
              <div className="help">{t('mc.import.typeHelp')}</div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>{t('mc.wizard.summary.version')}</label>
              <select value={version} onChange={(e) => setVersion(e.target.value)}>
                {!version && <option value="">{t('mc.import.pickVersion')}</option>}
                {versionOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <div className="help">{t('mc.import.versionHelp')}</div>
            </div>
          </div>

          <div className="card">
            <h3>{t('mc.import.nameAndSettings')}</h3>
            <div className="field">
              <label>{t('wizard.summary.name')}</label>
              <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              <div className="help">{t('mc.import.nameHelp')}</div>
            </div>

            <div className="field">
              <label>{t('mc.import.players', { count: expectedPlayers })}</label>
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
                <strong>{t('mc.import.scriptMemory')}</strong>
                <p>
                  {selected.setsMemory ? t('mc.import.scriptSetsMemory') : t('mc.import.scriptNoArgs')}
                </p>
              </div>
            ) : (
              <div className="field" style={advanced ? undefined : { marginBottom: 0 }}>
                <label>{t('mc.memory.label', { gb: gbText(memoryMb) })}</label>
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
                    ? t('mc.memory.over')
                    : t('mc.import.recommend', {
                        gb: recommendedMb !== null ? `${gbText(recommendedMb)} ${unitLabel('GB')}` : '...'
                      })}
                  {selected?.memory === 'jvm-args' && ` ${t('mc.import.jvmArgs')}`}
                </div>
              </div>
            )}

            {advanced && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>{t('help.router.port')}</label>
                <input
                  type="number"
                  value={port}
                  min={1024}
                  max={65535}
                  onChange={(e) => setPort(Number(e.target.value))}
                />
                <div className="help">
                  {inspection.port
                    ? t('mc.import.portFromFile', { port: inspection.port })
                    : t('mc.import.portDefault')}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <h3>{t('mc.wizard.eula.title')}</h3>
            <p className="hint">{t('mc.import.eulaHint')}</p>
            <label className="row" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={eula}
                onChange={(e) => setEula(e.target.checked)}
                style={{ width: 16, height: 16, flexShrink: 0 }}
              />
              <span>
                <Rich
                  k="mc.wizard.eula.accept"
                  values={{
                    link: (
                      <a
                        href="https://aka.ms/MinecraftEULA"
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--accent)' }}
                      >
                        {t('mc.wizard.eula.link')}
                      </a>
                    )
                  }}
                />
              </span>
            </label>
          </div>
        </>
      )}

      <div className="row between">
        <button onClick={onBack}>{t('wizard.back')}</button>
        <button className="primary" disabled={!canCreate} onClick={() => void create()}>
          {t('mc.import.bring')}
        </button>
      </div>
    </div>
  )
}

/** Lo que conviene saber de un archivo de inicio antes de elegirlo. */
function describeStart(file: StartFileInfo): string {
  const what = file.kind === 'jar' ? t('mc.start.jar') : t('mc.start.script')
  const memory =
    file.memory === 'app'
      ? t('mc.start.memoryHere')
      : file.memory === 'jvm-args'
        ? t('mc.start.memoryJvmArgs')
        : t('mc.start.memoryScript')
  const loop = file.restartLoop ? ` · ${t('mc.start.loops')}` : ''
  return `${what} · ${memory}${loop}`
}

function lastSegment(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return formatSize(Math.max(1, Math.round(bytes / (1024 * 1024))), 'MB')
  return formatSize(bytes / (1024 * 1024 * 1024), 'GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Megas a gigas con un decimal y el separador del idioma: «6,0» / «6.0». */
function gbText(mb: number): string {
  return formatNumber(mb / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
