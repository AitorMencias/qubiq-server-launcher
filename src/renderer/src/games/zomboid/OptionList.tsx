import type { ConfigChange, ConfigOption, EditableConfig } from '@shared/editableConfig'
import { pathKey } from '@shared/editableConfig'
import { t } from '../../i18n'

/**
 * Lista editable de opciones de un fichero de configuración de Zomboid.
 *
 * Lo que enseña no lo escribe la app: la explicación de cada opción, sus
 * límites, su valor por defecto y los nombres de sus valores salen del propio
 * fichero, que el servidor escribe en el idioma con el que se arrancó. Por eso
 * no hay aquí ningún catálogo que mantener al día cuando el juego se actualice.
 *
 * Es su propia lista y no la de los plugins de Minecraft porque las opciones de
 * Zomboid piden algo que aquella no tiene: un desplegable con el NOMBRE de cada
 * valor («4 = Normal») en vez del número pelado.
 */

export type Draft = string | boolean

interface Props {
  config: EditableConfig
  drafts: Map<string, Draft>
  disabled: boolean
  onChange: (option: ConfigOption, value: Draft) => void
}

export function OptionList({ config, drafts, disabled, onChange }: Props): React.JSX.Element {
  const visible = config.options
  const sections = new Map(config.sections.map((s) => [s.path.join('.'), s]))
  let lastSection = ''

  return (
    <div className="cfg-options">
      {visible.map((option) => {
        const section = option.path.slice(0, -1).join('.')
        const header = section !== lastSection ? section : null
        lastSection = section
        return (
          <div key={pathKey(option.path)}>
            {header !== null && header !== '' && (
              <div className="cfg-section">
                <div className="cfg-section-title">{header}</div>
                {sections.get(header)?.description && (
                  <p className="cfg-section-desc">{sections.get(header)!.description}</p>
                )}
              </div>
            )}
            <OptionRow
              option={option}
              draft={drafts.get(pathKey(option.path))}
              disabled={disabled}
              onChange={(value) => onChange(option, value)}
            />
          </div>
        )
      })}
    </div>
  )
}

function OptionRow({
  option,
  draft,
  disabled,
  onChange
}: {
  option: ConfigOption
  draft: Draft | undefined
  disabled: boolean
  onChange: (value: Draft) => void
}): React.JSX.Element {
  const value = draft ?? originalOf(option)
  const modified = draft !== undefined
  const problem = modified ? validate(option, value) : null

  return (
    <div className={`cfg-option ${modified ? 'modified' : ''}`}>
      <div className="cfg-option-head">
        <code className="cfg-key">{option.path[option.path.length - 1]}</code>
        {modified && <span className="badge">{t('cfg.changed')}</span>}
      </div>
      {option.description && <p className="cfg-desc">{option.description}</p>}

      {!option.editable ? (
        <div className="cfg-readonly">
          <code>{option.value}</code>
          <div className="help">{t('pz.cfg.cannotEdit', { reason: option.readOnlyReason ?? '' })}</div>
        </div>
      ) : (
        <Control option={option} value={value} disabled={disabled} onChange={onChange} />
      )}

      {option.editable && (rangeText(option) || option.defaultValue !== undefined) && (
        <div className="help cfg-meta">
          {rangeText(option) && <span>{rangeText(option)}</span>}
          {option.defaultValue !== undefined && (
            <>
              <span>{t('cfg.default', { value: labelFor(option, option.defaultValue) })}</span>
              {!disabled && String(value) !== option.defaultValue && (
                <button className="link" onClick={() => onChange(option.defaultValue!)}>
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
  if (option.type === 'boolean') {
    return (
      <label className="cfg-toggle">
        <input
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{value === true ? t('pz.cfg.yes') : t('pz.cfg.no')}</span>
      </label>
    )
  }

  // Las opciones que el juego enumera se enseñan con su nombre, no con su
  // número: en el fichero pone `Zombies = 4`, pero lo que el usuario entiende
  // es «Normal».
  if (option.allowed && option.allowed.length > 0) {
    return (
      <select
        value={String(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {!option.allowed.includes(String(value)) && (
          <option value={String(value)}>{String(value)}</option>
        )}
        {option.allowed.map((allowed) => (
          <option key={allowed} value={allowed}>
            {option.allowedLabels?.[allowed] ?? allowed}
          </option>
        ))}
      </select>
    )
  }

  if (option.type === 'integer' || option.type === 'number') {
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

export function originalOf(option: ConfigOption): Draft {
  return option.type === 'boolean' ? option.value.toLowerCase() === 'true' : option.value
}

/** Lo que hay que mandar al núcleo, ya en el tipo que espera el fichero. */
export function changeOf(option: ConfigOption, value: Draft): ConfigChange {
  if (option.type === 'boolean') return { path: option.path, value: value === true }
  if (option.type === 'integer' || option.type === 'number') {
    return { path: option.path, value: Number(String(value).replace(',', '.')) }
  }
  return { path: option.path, value: String(value) }
}

export function sameAsOriginal(option: ConfigOption, value: Draft): boolean {
  if (option.type === 'boolean') return (value === true) === (option.value.toLowerCase() === 'true')
  if (option.type === 'integer' || option.type === 'number') {
    return Number(String(value).replace(',', '.')) === Number(option.value)
  }
  return String(value) === option.value
}

function validate(option: ConfigOption, value: Draft): string | null {
  if (option.type === 'integer' || option.type === 'number') {
    const text = String(value).replace(',', '.').trim()
    if (text === '' || !Number.isFinite(Number(text))) return t('cfg.mustBeNumber')
    if (option.type === 'integer' && !/^-?\d+$/.test(text)) return t('pz.cfg.mustBeInteger')
    const n = Number(text)
    if (option.min !== undefined && n < option.min) return t('cfg.min', { min: option.min })
    if (option.max !== undefined && n > option.max) return t('cfg.max', { max: option.max })
  }
  if (option.type === 'text' && /[\r\n]/.test(String(value))) {
    return t('cfg.noNewlines')
  }
  return null
}

function rangeText(option: ConfigOption): string | null {
  if (option.min !== undefined && option.max !== undefined) {
    return t('cfg.between', { min: option.min, max: option.max })
  }
  if (option.min !== undefined) return t('pz.cfg.minimum', { min: option.min })
  if (option.max !== undefined) return t('pz.cfg.maximum', { max: option.max })
  return null
}

function labelFor(option: ConfigOption, value: string): string {
  return option.allowedLabels?.[value] ?? value
}
