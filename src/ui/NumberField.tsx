import { useEffect, useState } from 'react'

/** Two decimals at most, so 66⅔ shows as 66.67 in a number box. */
const show = (value: number | null) => (value === null ? '' : String(Math.round(value * 100) / 100))

type NumberFieldProps = {
  label: string
  value: number | null
  /** Shown when the box is empty, for settings that can be switched off. */
  placeholder?: string
  suffix?: string
  onCommit(value: number | null): void
}

/** A number box that applies on blur or Enter, so half-typed values never reach the field. */
export function NumberField({ label, value, placeholder, suffix, onCommit }: NumberFieldProps) {
  const [text, setText] = useState(show(value))
  useEffect(() => setText(show(value)), [value])

  const commit = () => {
    const trimmed = text.trim()
    if (trimmed === '') {
      if (placeholder !== undefined) onCommit(null)
      else setText(show(value))
      return
    }
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) onCommit(parsed)
    else setText(show(value))
  }

  return (
    <label className="rule-row">
      <span>{label}</span>
      <span className="rule-input">
        <input
          className="input"
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {suffix && <span className="muted">{suffix}</span>}
      </span>
    </label>
  )
}
