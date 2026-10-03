import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { ConfigChange, ConfigOption } from '@shared/editableConfig'
import { pathKey } from '@shared/editableConfig'
import type {
  ContentConfigDocument,
  ContentConfigFile,
  ContentConfigInfo
} from '@shared/games/minecraft/types'
import { FloatingWindow } from '../../FloatingWindow'
import { t } from '../../i18n'

/**
 * Configuración de un plugin o mod instalado, en una ventana flotante (§19.20).
 *
 * La app no conoce estos plugins: lee sus ficheros y enseña cada opción con la
 * explicación que dejó el autor encima, si la dejó. Lo que no sabe editar sin
 * riesgo (textos de varias líneas, estructuras anidadas, formatos raros) lo
 * enseña igualmente y ofrece abrirlo con el editor de Windows.
 *
 * Se puede mirar con el servidor en marcha, pero no guardar: muchos plugins
 * reescriben su configuración al cerrarse y se llevarían los cambios.
 */

interface Props {
  instanceId: string
  /** Fichero del plugin o mod en la carpeta `plugins`/`mods`. */
  fileName: string
  running: boolean
  onClose: () => void
}

/**
 * Lo que el usuario ha tocado y aún no ha guardado. Las listas se guardan como
 * el texto del cuadro (uno por línea) para no pelearse con el cursor al
 * escribir; se convierten en elementos al guardar.
 */
type Draft = string | boolean

/** Con ficheros de miles de opciones, pintar todas atasca la ventana. */
const MAX_SHOWN = 250

/** Fuera del componente: así no cuenta como dependencia de los efectos. */
function api(): typeof window.qubiq.minecraft.content.config {
  return window.qubiq.minecraft.content.config
}

export function ContentConfigWindow({
  instanceId,
  fileName,
  running,
  onClose
}: Props): React.JSX.Element {
  const [info, setInfo] = useState<ContentConfigInfo | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [doc, setDoc] = useState<ContentConfigDocument | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const dirty = Object.keys(drafts).length

  useEffect(() => {
    let alive = true
    api()
      .files(instanceId, fileName)
      .then((result) => {
        if (!alive) return
        setInfo(result)
        const first = result.files.find((f) => f.format) ?? null
        setSelected(first?.path ?? null)
        if (!first) setLoading(false)
      })
      .catch((err) => {
        if (!alive) return
        setError(message(err))
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [instanceId, fileName])

  const load = useCallback(
    async (path: string) => {
      setLoading(true)
      setError(null)
      setStale(false)
      setNotice(null)
      try {
        setDoc(await api().read(instanceId, path))
        setDrafts({})
      } catch (err) {
        setDoc(null)
        setError(message(err))
      } finally {
        setLoading(false)
      }
    },
    [instanceId]
  )

  useEffect(() => {
    if (selected) void load(selected)
  }, [selected, load])

  function confirmDiscard(): boolean {
    if (dirty === 0) return true
    return window.confirm(t('cfg.confirmDiscard', { count: dirty }))
  }

  const close = useCallback(() => {
    if (dirty === 0 || window.confirm(t('cfg.confirmClose'))) {
      onClose()
    }
  }, [dirty, onClose])

  function choose(file: ContentConfigFile): void {
    if (!file.format) {
      void api().open(instanceId, file.path).catch((err) => setError(message(err)))
      return
    }
    if (file.path === selected || !confirmDiscard()) return
    setQuery('')
    setSelected(file.path)
  }

  const options = useMemo(() => doc?.config.options ?? [], [doc])
  const byKey = useMemo(() => new Map(options.map((o) => [pathKey(o.path), o])), [options])
  const sectionNotes = useMemo(
    () => new Map((doc?.config.sections ?? []).map((s) => [pathKey(s.path), s.description])),
    [doc]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.path.join('.').toLowerCase().includes(q) ||
        (o.description ?? '').toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q)
    )
  }, [options, query])

  const problems = Object.entries(drafts)
    .map(([key, draft]) => {
      const option = byKey.get(key)
      return option ? validate(option, draft) : null
    })
    .filter((p): p is string => p !== null)

  function setDraft(option: ConfigOption, value: Draft): void {
    const key = pathKey(option.path)
    setNotice(null)
    setDrafts((prev) => {
      const next = { ...prev }
      if (sameAsOriginal(option, value)) delete next[key]
      else next[key] = value
      return next
    })
  }

  async function save(): Promise<void> {
    if (!doc) return
    const changes: ConfigChange[] = Object.entries(drafts).map(([key, draft]) => {
      const option = byKey.get(key)!
      return {
        path: option.path,
        value: option.type === 'list' ? toItems(String(draft)) : draft
      }
    })
    setSaving(true)
    setError(null)
    setStale(false)
    try {
      const result = await api().write(instanceId, doc.path, doc.hash, changes)
      setDoc(result.document)
      setDrafts({})
      setNotice(
        result.written === 0
          ? t('cfg.nothingToSave')
          : t('cfg.savedNotice', { count: result.written, backup: result.backupPath ?? '' })
      )
    } catch (err) {
      const text = message(err)
      setError(text)
      // El núcleo todavía avisa en español (sus mensajes se traducirán en la
      // segunda entrega de los idiomas): se reconoce por su frase.
      setStale(text.includes('ha cambiado desde que lo abriste'))
    } finally {
      setSaving(false)
    }
  }

  const files = info?.files ?? []
  const prefix = commonPrefix(files.map((f) => f.path), info?.folder ?? null)
  const described = options.filter((o) => o.description).length
  const readOnly = running || Boolean(doc?.readOnlyReason)

  const footer = doc ? (
    <>
      <span className="modal-footer-status">
        {dirty > 0 ? t('cfg.unsaved', { count: dirty }) : t('mc.official.savedIn', { path: doc.path })}
      </span>
      <div className="row">
        <button onClick={() => void api().open(instanceId, doc.path).catch((e) => setError(message(e)))}>
          {t('cfg.openEditor')}
        </button>
        {dirty > 0 && (
          <button disabled={saving} onClick={() => setDrafts({})}>
            {t('cfg.discard')}
          </button>
        )}
        <button
          className="primary"
          disabled={readOnly || saving || dirty === 0 || problems.length > 0}
          title={running ? t('cfg.stopToSave') : undefined}
          onClick={() => void save()}
        >
          {saving ? t('common.saving') : t('cfg.save')}
        </button>
      </div>
    </>
  ) : undefined

  return (
    <FloatingWindow
      wide
      title={t('mc.official.configureTitle', {
        name: info?.name ?? fileName.replace(/\.jar(\.disabled)?$/i, '')
      })}
      subtitle={fileName}
      onClose={close}
      footer={footer}
    >
      <div className="cfg-layout">
        <aside className="cfg-files">
          <div className="cfg-files-title">{t('cfg.files')}</div>
          {files.length === 0 && !loading && (
            <p className="hint" style={{ margin: 0 }}>
              {t('cfg.noneYet')}
            </p>
          )}
          {files.map((file) => (
            <button
              key={file.path}
              className={`cfg-file ${file.path === selected ? 'active' : ''}`}
              onClick={() => choose(file)}
              title={file.path}
            >
              <span className="cfg-file-name">{file.path.slice(prefix.length)}</span>
              {file.note && <span className="cfg-file-note">{file.note}</span>}
              {!file.format && <span className="cfg-file-note">{t('cfg.otherProgram')}</span>}
            </button>
          ))}
          {(info?.hiddenClientFiles ?? 0) > 0 && (
            <p className="cfg-files-hint">
              {t('cfg.hiddenClient', { count: info!.hiddenClientFiles })}
            </p>
          )}
          <button
            className="cfg-open-folder"
            onClick={() =>
              void api().open(instanceId, info?.folder ?? 'config').catch((e) => setError(message(e)))
            }
            disabled={!info || (info.folder !== null && files.length === 0)}
          >
            {t('cfg.openFolder')}
          </button>
        </aside>

        <section className="cfg-main">
          {error && (
            <div className="alert error">
              <strong>{stale ? t('cfg.changedTitle') : t('backup.error')}</strong>
              <p>{error}</p>
              {stale && selected && (
                <button style={{ marginTop: 10 }} onClick={() => void load(selected)}>
                  {t('cfg.reopen')}
                </button>
              )}
            </div>
          )}

          {notice && !error && (
            <div className="alert info">
              <strong>{t('backup.done')}</strong>
              <p>{notice}</p>
            </div>
          )}

          {info && files.length === 0 && <NothingYet info={info} />}

          {loading && <p className="hint">{t('cfg.reading')}</p>}

          {doc && !loading && (
            <>
              {running && (
                <div className="alert info">
                  <strong>{t('cfg.runningTitle')}</strong>
                  <p>{t('cfg.runningText')}</p>
                </div>
              )}
              {doc.readOnlyReason && (
                <div className="alert error">
                  <strong>{t('cfg.readOnlyTitle')}</strong>
                  <p>{doc.readOnlyReason}</p>
                </div>
              )}

              <div className="cfg-toolbar">
                <input
                  type="search"
                  placeholder={t('cfg.search')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <span className="cfg-count">
                  {query
                    ? t('cfg.countOf', { n: filtered.length, total: options.length })
                    : t('cfg.count', { count: options.length })}
                </span>
              </div>

              <p className="cfg-origin">
                {described > 0
                  ? t('cfg.byAuthor')
                  : doc.config.format === 'json'
                    ? t('cfg.jsonNoComments')
                    : t('cfg.noExplanations')}
              </p>

              {options.length === 0 && <p className="hint">{t('cfg.noOptions')}</p>}

              <OptionList
                options={filtered.slice(0, MAX_SHOWN)}
                sectionNotes={sectionNotes}
                drafts={drafts}
                disabled={readOnly || saving}
                onChange={setDraft}
              />

              {filtered.length > MAX_SHOWN && (
                <p className="hint">{t('cfg.more', { count: filtered.length - MAX_SHOWN })}</p>
              )}
            </>
          )}
        </section>
      </div>
    </FloatingWindow>
  )
}

function NothingYet({ info }: { info: ContentConfigInfo }): React.JSX.Element {
  return info.folder !== null ? (
    <div className="alert info">
      <strong>{t('cfg.noConfigTitle')}</strong>
      <p>{t('cfg.noConfigPlugin')}</p>
    </div>
  ) : (
    <div className="alert info">
      <strong>{t('cfg.noConfigModTitle')}</strong>
      <p>{t('cfg.noConfigMod')}</p>
    </div>
  )
}

// --- Lista de opciones --------------------------------------------------------

interface ListProps {
  options: ConfigOption[]
  sectionNotes: Map<string, string | null>
  drafts: Record<string, Draft>
  disabled: boolean
  onChange: (option: ConfigOption, value: Draft) => void
}

function OptionList({ options, sectionNotes, drafts, disabled, onChange }: ListProps): React.JSX.Element {
  let previous: string | null = null
  return (
    <div className="cfg-options">
      {options.map((option) => {
        const { label, section } = displayOf(option)
        const sectionKey = pathKey(section)
        const header =
          sectionKey !== previous && (section.length > 0 || previous !== null) ? (
            <div className="cfg-section">
              <div className="cfg-section-title">
                {section.length > 0 ? section.map(humanize).join(' › ') : t('cfg.general')}
              </div>
              {sectionNotes.get(sectionKey) && (
                <p className="cfg-section-desc">{sectionNotes.get(sectionKey)}</p>
              )}
            </div>
          ) : null
        previous = sectionKey
        const key = pathKey(option.path)
        return (
          <Fragment key={key}>
            {header}
            <OptionRow
              option={option}
              label={label}
              draft={drafts[key]}
              disabled={disabled}
              onChange={(v) => onChange(option, v)}
            />
          </Fragment>
        )
      })}
    </div>
  )
}

interface RowProps {
  option: ConfigOption
  label: string
  draft: Draft | undefined
  disabled: boolean
  onChange: (value: Draft) => void
}

function OptionRow({ option, label, draft, disabled, onChange }: RowProps): React.JSX.Element {
  const value = draft ?? original(option)
  const modified = draft !== undefined
  const problem = modified ? validate(option, value) : null
  const limits = rangeText(option)

  return (
    <div className={`cfg-option ${modified ? 'modified' : ''}`}>
      <div className="cfg-option-head">
        <code className="cfg-key">{label}</code>
        {modified && <span className="badge">{t('cfg.changed')}</span>}
      </div>
      {option.description && <p className="cfg-desc">{option.description}</p>}

      {!option.editable ? (
        <div className="cfg-readonly">
          <code>{readOnlyValue(option)}</code>
          <div className="help">
            {t('cfg.cannotEdit', { reason: option.readOnlyReason ?? '', button: t('cfg.openEditor') })}
          </div>
        </div>
      ) : (
        <Control option={option} value={value} disabled={disabled} onChange={onChange} />
      )}

      {option.editable && (limits || option.defaultValue !== undefined) && (
        <div className="help cfg-meta">
          {limits && <span>{limits}</span>}
          {option.defaultValue !== undefined && option.type !== 'list' && (
            <>
              <span>{t('cfg.default', { value: option.defaultValue })}</span>
              {!disabled && !sameValue(option, value, defaultDraft(option)) && (
                <button className="link" onClick={() => onChange(defaultDraft(option))}>
                  {t('cfg.backToDefault')}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {problem && <div className="cfg-error">{problem}</div>}
    </div>
  )
}

function Control({
  option,
  value,
  disabled,
  onChange
}: {
  option: ConfigOption
  value: Draft
  disabled: boolean
  onChange: (value: Draft) => void
}): React.JSX.Element {
  switch (option.type) {
    case 'boolean':
      return (
        <label className="cfg-toggle">
          <input
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{value === true ? t('cfg.on') : t('cfg.off')}</span>
        </label>
      )
    case 'integer':
    case 'number':
      return (
        <input
          type="text"
          inputMode="decimal"
          className="cfg-number"
          value={String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'list':
      return (
        <>
          <textarea
            rows={Math.min(Math.max(String(value).split('\n').length + 1, 2), 8)}
            value={String(value)}
            disabled={disabled}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="help">{t('cfg.onePerLine')}</div>
        </>
      )
    case 'text':
      if (option.allowed) {
        return (
          <select value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
            {!option.allowed.includes(String(value)) && <option value={String(value)}>{String(value)}</option>}
            {option.allowed.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )
      }
      return (
        <input
          type="text"
          value={String(value)}
          disabled={disabled}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

// --- Valores ------------------------------------------------------------------

function original(option: ConfigOption): Draft {
  if (option.type === 'boolean') return option.value.toLowerCase() === 'true'
  if (option.type === 'list') return (option.items ?? []).join('\n')
  return option.value
}

function defaultDraft(option: ConfigOption): Draft {
  const d = option.defaultValue ?? ''
  return option.type === 'boolean' ? d.toLowerCase() === 'true' : d
}

function toItems(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
}

function sameValue(option: ConfigOption, a: Draft, b: Draft): boolean {
  if (option.type === 'list') return toItems(String(a)).join('\n') === toItems(String(b)).join('\n')
  if (option.type === 'integer' || option.type === 'number') {
    const x = String(a).trim()
    const y = String(b).trim()
    return x === y || (x !== '' && y !== '' && Number(x) === Number(y) && !/^-?\d{16,}$/.test(x))
  }
  return a === b
}

function sameAsOriginal(option: ConfigOption, value: Draft): boolean {
  return sameValue(option, value, original(option))
}

/** Lo mismo que comprueba el proceso principal, dicho antes de guardar. */
function validate(option: ConfigOption, value: Draft): string | null {
  if (option.type === 'integer' || option.type === 'number') {
    const text = String(value).trim()
    const n = Number(text)
    if (text === '' || !Number.isFinite(n)) return t('cfg.mustBeNumber')
    if (option.type === 'integer' && !/^[-+]?\d+$/.test(text)) return t('cfg.mustBeInteger')
    if (option.min !== undefined && n < option.min) return t('cfg.min', { min: option.min })
    if (option.max !== undefined && n > option.max) return t('cfg.max', { max: option.max })
  }
  if (option.type === 'text' && /[\r\n]/.test(String(value))) return t('cfg.noNewlines')
  return null
}

function rangeText(option: ConfigOption): string | null {
  const { min, max } = option
  if (min !== undefined && max !== undefined) return t('cfg.between', { min, max })
  if (min !== undefined) return t('cfg.from', { min })
  if (max !== undefined) return t('cfg.upTo', { max })
  return null
}

function readOnlyValue(option: ConfigOption): string {
  if (option.type === 'list') return (option.items ?? []).join(', ') || t('cfg.emptyList')
  const text = option.value || t('cfg.emptyValue')
  return text.length > 300 ? `${text.slice(0, 300)}…` : text
}

/**
 * Nombre que se enseña y sección a la que pertenece. En los JSON con la
 * convención de `//` (Darkhax), la opción de verdad se llama `value` y lo que
 * interesa es el nombre de su grupo.
 */
function displayOf(option: ConfigOption): { label: string; section: string[] } {
  const path = option.path
  if (path.length > 1 && path[path.length - 1] === 'value') {
    return { label: path[path.length - 2]!, section: path.slice(0, -2) }
  }
  return { label: path[path.length - 1]!, section: path.slice(0, -1) }
}

/** `#0` es el primer elemento de una lista de tablas. */
function humanize(segment: string): string {
  const m = /^#(\d+)$/.exec(segment)
  return m ? t('cfg.number', { n: Number(m[1]) + 1 }) : segment
}

/** Lo común a todas las rutas, para enseñar `config.yml` y no `plugins/Essentials/config.yml`. */
function commonPrefix(paths: string[], folder: string | null): string {
  if (folder) return `${folder}/`
  if (paths.length === 0) return ''
  const dirs = paths.map((p) => p.split('/').slice(0, -1))
  const first = dirs[0]!
  let n = 0
  while (n < first.length && dirs.every((d) => d[n] === first[n])) n++
  return n === 0 ? '' : `${first.slice(0, n).join('/')}/`
}

function message(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  // Electron antepone "Error invoking remote method '...': Error: ".
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
