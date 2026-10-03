import { useEffect, useState } from 'react'
import type { UiMode } from '@shared/types'
import type {
  DataFolderInfo,
  RelocationPlan,
  RelocationProblem,
  RelocationWarning
} from '@shared/dataFolder'
import { LANGUAGES, languageInfo, type Language } from '@shared/i18n'
import { D20Loader } from './D20Loader'
import { RemoteAccessCard } from './RemoteAccessCard'
import { Rich, formatBytes, formatList, quote, t } from './i18n'

/**
 * Configuración de la propia app, no de un servidor: idioma, modo y dónde
 * guarda sus datos. Es una pantalla más del área principal, como la de un
 * servidor, para no tener una segunda ventana que se quede detrás.
 */

interface Props {
  mode: UiMode
  onModeChange: (mode: UiMode) => void
  /** El elegido, o undefined si sigue al de Windows. */
  language: Language | undefined
  systemLanguage: Language
  onLanguageChange: (language: Language | undefined) => void
  onClose: () => void
}

export function SettingsScreen(props: Props): React.JSX.Element {
  return (
    <>
      <div className="topbar">
        <h2>{t('settings.title')}</h2>
        <button onClick={props.onClose}>{t('settings.back')}</button>
      </div>
      <div className="panel settings-screen">
        <LanguageCard
          language={props.language}
          systemLanguage={props.systemLanguage}
          onChange={props.onLanguageChange}
        />
        <ModeCard mode={props.mode} onChange={props.onModeChange} />
        <DataFolderCard />
        <RemoteAccessCard />
      </div>
    </>
  )
}

function LanguageCard({
  language,
  systemLanguage,
  onChange
}: {
  language: Language | undefined
  systemLanguage: Language
  onChange: (language: Language | undefined) => void
}): React.JSX.Element {
  return (
    <div className="card">
      <h3>{t('settings.language.title')}</h3>
      <p className="hint">{t('settings.language.hint')}</p>
      <div className="field" style={{ marginBottom: 0 }}>
        <select
          id="app-language"
          value={language ?? ''}
          onChange={(e) => onChange(e.target.value ? (e.target.value as Language) : undefined)}
        >
          <option value="">
            {t('settings.language.auto', { name: languageInfo(systemLanguage).name })}
          </option>
          {LANGUAGES.map((info) => (
            <option key={info.id} value={info.id}>
              {info.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function ModeCard({
  mode,
  onChange
}: {
  mode: UiMode
  onChange: (mode: UiMode) => void
}): React.JSX.Element {
  const options: { id: UiMode; title: string; sub: string }[] = [
    { id: 'basic', title: t('mode.basic'), sub: t('settings.mode.basicSub') },
    { id: 'advanced', title: t('mode.advanced'), sub: t('settings.mode.advancedSub') }
  ]
  return (
    <div className="card">
      <h3>{t('settings.mode.title')}</h3>
      <p className="hint">{t('settings.mode.hint')}</p>
      <div className="choice-grid">
        {options.map((option) => (
          <button
            key={option.id}
            className={`choice ${mode === option.id ? 'selected' : ''}`}
            onClick={() => onChange(option.id)}
          >
            <div className="title">{option.title}</div>
            <div className="sub">{option.sub}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

type PlanState =
  | { state: 'none' }
  | { state: 'checking'; chosen: string }
  | { state: 'ready'; plan: RelocationPlan }
  | { state: 'applying'; plan: RelocationPlan }
  | { state: 'error'; message: string }

function DataFolderCard(): React.JSX.Element {
  const [info, setInfo] = useState<DataFolderInfo | null>(null)
  const [plan, setPlan] = useState<PlanState>({ state: 'none' })

  useEffect(() => {
    void window.qubiq.dataFolder
      .info()
      .then(setInfo)
      .catch(() => undefined)
  }, [])

  async function check(chosen: string): Promise<void> {
    setPlan({ state: 'checking', chosen })
    try {
      setPlan({ state: 'ready', plan: await window.qubiq.dataFolder.plan(chosen) })
    } catch (err) {
      setPlan({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function choose(): Promise<void> {
    const chosen = await window.qubiq.dataFolder.choose()
    if (chosen) await check(chosen)
  }

  async function apply(current: RelocationPlan): Promise<void> {
    setPlan({ state: 'applying', plan: current })
    try {
      // Si todo va bien, la app se cierra y no se llega a volver de aquí.
      const checked = await window.qubiq.dataFolder.apply(current.chosen)
      setPlan({ state: 'ready', plan: checked })
    } catch (err) {
      setPlan({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const busy = plan.state === 'checking' || plan.state === 'applying'

  return (
    <div className="card">
      <h3>{t('settings.dataFolder.title')}</h3>
      <p className="hint">{t('settings.dataFolder.hint')}</p>

      {info && (
        <div className="field">
          <label>{t('settings.dataFolder.current')}</label>
          <div className="mono-path data-folder-path">{info.current}</div>
          <div className="help">
            {info.isDefault
              ? t('settings.dataFolder.isDefault')
              : t('settings.dataFolder.notDefault', { path: info.defaultPath })}
          </div>
        </div>
      )}

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button onClick={() => void window.qubiq.dataFolder.open()}>
          {t('settings.dataFolder.open')}
        </button>
        <button onClick={() => void choose()} disabled={busy}>
          {t('settings.dataFolder.change')}
        </button>
        {info && !info.isDefault && (
          <button onClick={() => void check(info.defaultPath)} disabled={busy}>
            {t('settings.dataFolder.backToDefault')}
          </button>
        )}
      </div>

      {plan.state === 'checking' && (
        <div className="row data-folder-checking">
          <D20Loader size={28} />
          <span>{t('settings.dataFolder.checking')}</span>
        </div>
      )}

      {plan.state === 'error' && (
        <div className="alert error" style={{ marginTop: 16, marginBottom: 0 }}>
          <strong>{t('settings.dataFolder.checkFailed')}</strong>
          <p>{plan.message}</p>
        </div>
      )}

      {(plan.state === 'ready' || plan.state === 'applying') && (
        <PlanView
          plan={plan.plan}
          applying={plan.state === 'applying'}
          onCancel={() => setPlan({ state: 'none' })}
          onApply={() => void apply(plan.plan)}
        />
      )}
    </div>
  )
}

function PlanView({
  plan,
  applying,
  onCancel,
  onApply
}: {
  plan: RelocationPlan
  applying: boolean
  onCancel: () => void
  onApply: () => void
}): React.JSX.Element {
  const blocked = plan.problems.length > 0
  const subfolder = plan.target.toLowerCase() !== plan.chosen.toLowerCase()

  return (
    <div className="data-folder-plan">
      <div className="field">
        <label>{t('settings.dataFolder.target')}</label>
        <div className="mono-path data-folder-path">{plan.target}</div>
        {subfolder && <div className="help">{t('settings.dataFolder.subfolder')}</div>}
      </div>

      <p className="data-folder-how">
        {plan.sameDrive
          ? t('settings.dataFolder.sameDrive')
          : t('settings.dataFolder.otherDrive', { size: formatBytes(plan.totalBytes) })}
      </p>

      {plan.problems.map((problem, index) => (
        <div key={`p${index}`} className="alert error">
          <strong>{t('settings.dataFolder.problemTitle')}</strong>
          <p>{problemText(problem)}</p>
        </div>
      ))}

      {!blocked &&
        plan.warnings.map((warning, index) => (
          <div key={`w${index}`} className="alert warn">
            <strong>{warningTitle(warning)}</strong>
            <p>{warningText(warning)}</p>
          </div>
        ))}

      {!blocked && (
        <div className="alert info">
          <strong>{t('settings.dataFolder.howTitle')}</strong>
          <p>
            <Rich
              k="settings.dataFolder.howText"
              values={{ button: <b>{t('settings.dataFolder.apply')}</b> }}
            />
          </p>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button onClick={onCancel} disabled={applying}>
          {t('common.cancel')}
        </button>
        <button className="primary" onClick={onApply} disabled={blocked || applying}>
          {applying ? t('settings.dataFolder.applying') : t('settings.dataFolder.apply')}
        </button>
      </div>
    </div>
  )
}

function problemText(problem: RelocationProblem): string {
  switch (problem.code) {
    case 'same':
      return t('settings.dataFolder.problem.same')
    case 'nested':
      return t('settings.dataFolder.problem.nested')
    case 'spaces':
      return t('settings.dataFolder.problem.spaces')
    case 'network':
      return t('settings.dataFolder.problem.network')
    case 'occupied':
      return t('settings.dataFolder.problem.occupied', { entries: formatList(problem.entries) })
    case 'not-writable':
      return t('settings.dataFolder.problem.notWritable')
    case 'space':
      return t('settings.dataFolder.problem.space', {
        needed: formatBytes(problem.neededBytes),
        free: formatBytes(problem.freeBytes)
      })
    case 'busy':
      return t('settings.dataFolder.problem.busy', {
        count: problem.servers.length,
        servers: formatList(problem.servers.map(quote))
      })
    case 'valheim-path':
      return t('settings.dataFolder.problem.valheimPath', {
        count: problem.servers.length,
        servers: formatList(problem.servers.map(quote)),
        length: problem.length,
        max: problem.max
      })
    case 'links':
      return t('settings.dataFolder.problem.links', { path: problem.path })
  }
}

function warningTitle(warning: RelocationWarning): string {
  switch (warning.code) {
    case 'firewall':
      return t('settings.dataFolder.warning.firewallTitle')
    case 'copy':
      return t('settings.dataFolder.warning.copyTitle')
    case 'cloud':
      return t('settings.dataFolder.warning.cloudTitle')
    case 'valheim-path':
      return t('settings.dataFolder.warning.valheimPathTitle')
  }
}

function warningText(warning: RelocationWarning): string {
  switch (warning.code) {
    case 'firewall':
      return t('settings.dataFolder.warning.firewall')
    case 'copy':
      return t('settings.dataFolder.warning.copy', {
        size: formatBytes(warning.totalBytes),
        minutes: Math.max(1, Math.ceil(warning.totalBytes / COPY_BYTES_PER_MINUTE))
      })
    case 'cloud':
      return t('settings.dataFolder.warning.cloud')
    case 'valheim-path':
      return t('settings.dataFolder.warning.valheimPath', {
        count: warning.servers.length,
        servers: formatList(warning.servers.map(quote)),
        length: warning.length,
        max: warning.max
      })
  }
}

/**
 * Para la estimación del aviso: unos 100 MB/s, lo que da un SSD normal
 * copiando muchos ficheros pequeños (los servidores de Steam lo son). En un
 * disco duro puede ser bastante más, y el aviso lo dice.
 */
const COPY_BYTES_PER_MINUTE = 100 * 1024 * 1024 * 60
