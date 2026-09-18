import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { ConfigChange, ConfigOption } from '@shared/editableConfig'
import { pathKey } from '@shared/editableConfig'
import type {
  ContentConfigDocument,
  ContentConfigFile,
  ContentConfigInfo
} from '@shared/games/minecraft/types'
import { FloatingWindow } from '../../FloatingWindow'

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
    return window.confirm(
      `Tienes ${dirty === 1 ? 'un cambio' : `${dirty} cambios`} sin guardar. ¿Descartarlos?`
    )
  }

  const close = useCallback(() => {
    if (dirty === 0 || window.confirm(`Tienes cambios sin guardar. ¿Cerrar sin guardarlos?`)) {
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
          ? 'No había nada distinto que guardar.'
          : `Guardado (${result.written === 1 ? '1 opción' : `${result.written} opciones`}). ` +
              `La versión anterior queda en ${result.backupPath}. ` +
              'Se aplicará la próxima vez que arranque el servidor.'
      )
    } catch (err) {
      const text = message(err)
      setError(text)
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
        {dirty > 0
          ? `${dirty === 1 ? '1 cambio' : `${dirty} cambios`} sin guardar`
          : `Se guarda en ${doc.path}`}
      </span>
      <div className="row">
        <button onClick={() => void api().open(instanceId, doc.path).catch((e) => setError(message(e)))}>
          Abrir en el editor
        </button>
        {dirty > 0 && (
          <button disabled={saving} onClick={() => setDrafts({})}>
            Descartar
          </button>
        )}
        <button
          className="primary"
          disabled={readOnly || saving || dirty === 0 || problems.length > 0}
          title={running ? 'Para el servidor para poder guardar.' : undefined}
          onClick={() => void save()}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </>
  ) : undefined

  return (
    <FloatingWindow
      wide
      title={`Configurar ${info?.name ?? fileName.replace(/\.jar(\.disabled)?$/i, '')}`}
      subtitle={fileName}
      onClose={close}
      footer={footer}
    >
      <div className="cfg-layout">
        <aside className="cfg-files">
          <div className="cfg-files-title">Ficheros</div>
          {files.length === 0 && !loading && (
            <p className="hint" style={{ margin: 0 }}>
              Ninguno todavía.
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
              {!file.format && <span className="cfg-file-note">Se abre con otro programa</span>}
            </button>
          ))}
          {(info?.hiddenClientFiles ?? 0) > 0 && (
            <p className="cfg-files-hint">
              {info!.hiddenClientFiles === 1
                ? 'Hay 1 fichero de cliente que no se enseña'
                : `Hay ${info!.hiddenClientFiles} ficheros de cliente que no se enseñan`}
              : solo cuentan en el Minecraft de cada jugador.
            </p>
          )}
          <button
            className="cfg-open-folder"
            onClick={() =>
              void api().open(instanceId, info?.folder ?? 'config').catch((e) => setError(message(e)))
            }
            disabled={!info || (info.folder !== null && files.length === 0)}
          >
            Abrir la carpeta
          </button>
        </aside>

        <section className="cfg-main">
          {error && (
            <div className="alert error">
              <strong>{stale ? 'El fichero ha cambiado' : 'No se pudo completar la operación'}</strong>
              <p>{error}</p>
              {stale && selected && (
                <button style={{ marginTop: 10 }} onClick={() => void load(selected)}>
                  Volver a abrirlo (se pierden los cambios sin guardar)
                </button>
              )}
            </div>
          )}

          {notice && !error && (
            <div className="alert info">
              <strong>Listo</strong>
              <p>{notice}</p>
            </div>
          )}

          {info && files.length === 0 && <NothingYet info={info} />}

          {loading && <p className="hint">Leyendo…</p>}

          {doc && !loading && (
            <>
              {running && (
                <div className="alert info">
                  <strong>El servidor está en marcha: puedes mirar, pero no guardar</strong>
                  <p>
                    Muchos plugins y mods vuelven a escribir su configuración al cerrarse, y se
                    llevarían tus cambios. Para el servidor, cambia lo que quieras y vuelve a
                    arrancarlo.
                  </p>
                </div>
              )}
              {doc.readOnlyReason && (
                <div className="alert error">
                  <strong>Este fichero solo se puede mirar</strong>
                  <p>{doc.readOnlyReason}</p>
                </div>
              )}

              <div className="cfg-toolbar">
                <input
                  type="search"
                  placeholder="Buscar opción o explicación…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <span className="cfg-count">
                  {query ? `${filtered.length} de ${options.length}` : `${options.length} opciones`}
                </span>
              </div>

              <p className="cfg-origin">
                {described > 0
                  ? 'Las explicaciones las escribe el autor en el propio fichero, casi siempre en inglés.'
                  : doc.config.format === 'json'
                    ? 'Este fichero es JSON, que no admite comentarios: el autor no ha tenido dónde explicar las opciones. Si dudas de alguna, busca el mod en Modrinth o CurseForge.'
                    : 'El autor no ha dejado explicaciones en este fichero.'}
              </p>

              {options.length === 0 && <p className="hint">El fichero no tiene opciones.</p>}

              <OptionList
                options={filtered.slice(0, MAX_SHOWN)}
                sectionNotes={sectionNotes}
                drafts={drafts}
                disabled={readOnly || saving}
                onChange={setDraft}
              />

              {filtered.length > MAX_SHOWN && (
                <p className="hint">
                  Hay {filtered.length - MAX_SHOWN} opciones más. Usa el buscador para llegar a ellas.
                </p>
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
      <strong>Todavía no hay configuración</strong>
      <p>
        Los plugins crean sus ficheros la primera vez que arrancan. Arranca el servidor una vez,
        páralo y vuelve aquí.
      </p>
    </div>
  ) : (
    <div className="alert info">
      <strong>No hemos encontrado configuración de este mod</strong>
      <p>
        Algunos mods no tienen, y otros la crean la primera vez que arranca el servidor. Si ya ha
        arrancado y sabes que tiene, búscala en la carpeta config: puede que use un nombre distinto
        al del mod.
      </p>
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
                {section.length > 0 ? section.map(humanize).join(' › ') : 'Opciones generales'}
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
        {modified && <span className="badge">Cambiado</span>}
      </div>
      {option.description && <p className="cfg-desc">{option.description}</p>}

      {!option.editable ? (
        <div className="cfg-readonly">
          <code>{readOnlyValue(option)}</code>
          <div className="help">
            No se puede cambiar desde aquí: {option.readOnlyReason}. Usa «Abrir en el editor».
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
              <span>Por defecto: {option.defaultValue}</span>
              {!disabled && !sameValue(option, value, defaultDraft(option)) && (
                <button className="link" onClick={() => onChange(defaultDraft(option))}>
                  Volver a este valor
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
          <span>{value === true ? 'Activado (true)' : 'Desactivado (false)'}</span>
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
          <div className="help">Uno por línea.</div>
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
    if (text === '' || !Number.isFinite(n)) return 'Tiene que ser un número.'
    if (option.type === 'integer' && !/^[-+]?\d+$/.test(text)) return 'Tiene que ser un número entero, sin decimales.'
    if (option.min !== undefined && n < option.min) return `No puede ser menor que ${option.min}.`
    if (option.max !== undefined && n > option.max) return `No puede ser mayor que ${option.max}.`
  }
  if (option.type === 'text' && /[\r\n]/.test(String(value))) return 'No admite saltos de línea.'
  return null
}

function rangeText(option: ConfigOption): string | null {
  const { min, max } = option
  if (min !== undefined && max !== undefined) return `Entre ${min} y ${max}`
  if (min !== undefined) return `Desde ${min}`
  if (max !== undefined) return `Hasta ${max}`
  return null
}

function readOnlyValue(option: ConfigOption): string {
  if (option.type === 'list') return (option.items ?? []).join(', ') || '(vacía)'
  const text = option.value || '(vacío)'
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
  return m ? `nº ${Number(m[1]) + 1}` : segment
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
