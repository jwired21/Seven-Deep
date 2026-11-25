import { useState } from 'react'
import { feet } from '../model/defaults'
import { formatYd } from '../model/format'
import type { RulesProfile } from '../model/types'
import { useEditor } from '../store/editorStore'
import { NumberField } from '../ui/NumberField'
import { checkPlay, femalePlay, inNoRunZone } from './checkPlay'
import { rulesSummary } from './rules'

type NumberKey = 'fieldWidth' | 'fieldLength' | 'endZoneDepth' | 'noRunZone'
type CountKey = 'blitzesPerGame' | 'qbRunAfterSeconds' | 'maxMales' | 'femalePlayEvery'
type ToggleKey =
  | 'firstDownAtMidfield'
  | 'blitzAllowed'
  | 'qbRunOnBlitz'
  | 'handoffsAllowed'
  | 'blockingAllowed'
  | 'allEligible'

function RulesEditor({ rules }: { rules: RulesProfile }) {
  const { setRules } = useEditor.getState()

  const yards = (key: NumberKey, label: string) => (
    <NumberField label={label} value={rules[key]} suffix="yd" onCommit={(v) => v !== null && setRules({ [key]: v })} />
  )
  const count = (key: CountKey, label: string, placeholder: string) => (
    <NumberField label={label} value={rules[key]} placeholder={placeholder} onCommit={(v) => setRules({ [key]: v })} />
  )
  const toggle = (key: ToggleKey, label: string) => (
    <label className="rule-row check">
      <span>{label}</span>
      <input type="checkbox" checked={rules[key]} onChange={(e) => setRules({ [key]: e.target.checked })} />
    </label>
  )

  return (
    <div className="rules-editor">
      <label className="rule-row">
        <span>Profile name</span>
        <input
          className="input"
          value={rules.name}
          maxLength={40}
          onChange={(e) => setRules({ name: e.target.value })}
        />
      </label>

      <h3 className="eyebrow">Field</h3>
      {yards('fieldWidth', 'Width')}
      {yards('fieldLength', 'Length, end zones included')}
      {yards('endZoneDepth', 'End zone depth')}
      {toggle('firstDownAtMidfield', 'First down at midfield')}

      <h3 className="eyebrow">No-run zone</h3>
      {yards('noRunZone', 'Distance from goal line')}
      <div className="segmented three" role="group" aria-label="Common no-run zone distances">
        {[feet(10), 5, 10].map((yd) => (
          <button
            key={yd}
            type="button"
            aria-pressed={Math.abs(rules.noRunZone - yd) < 1e-6}
            onClick={() => setRules({ noRunZone: yd })}
          >
            {formatYd(yd)} yd
          </button>
        ))}
      </div>
      <p className="muted small">The rulebook says 10 feet, which is 3⅓ yd. Set 0 for no zone.</p>

      <h3 className="eyebrow">Blitz and QB run</h3>
      {toggle('blitzAllowed', 'Blitzing allowed')}
      {count('blitzesPerGame', 'Blitzes per game', 'no limit')}
      {toggle('qbRunOnBlitz', 'QB can run when blitzed')}
      {count('qbRunAfterSeconds', 'QB can run after count', 'never')}

      <h3 className="eyebrow">Offense</h3>
      {toggle('handoffsAllowed', 'Handoffs and runs allowed')}
      {toggle('blockingAllowed', 'Blocking allowed')}
      {toggle('allEligible', 'All 7 eligible, center included')}

      <h3 className="eyebrow">Coed</h3>
      {count('maxMales', 'Most males on the field', 'no limit')}
      {count('femalePlayEvery', 'Female play, 1 of every', 'none')}
    </div>
  )
}

/** What the open play breaks in the rules profile, if anything. Shown at the top of the side panel. */
export function RulesCheck() {
  const play = useEditor((s) => s.play)
  const rules = useEditor((s) => s.rules)

  const warnings = checkPlay(play, rules)
  const female = rules.femalePlayEvery !== null ? femalePlay(play) : null
  const eightPoints = female?.status === 'yes' && !inNoRunZone(play, rules)

  return (
      <section id="rules-check" className={warnings.length ? 'card warnings' : 'card'} aria-live="polite">
        <h2 className="eyebrow">Rules check</h2>
        {warnings.length === 0 ? (
          <div className="ok">No rule conflicts</div>
        ) : (
          <ul className="warning-list">
            {warnings.map((w) => (
              <li key={w.id}>{w.message}</li>
            ))}
          </ul>
        )}
        {female && (
          <div className="text-2">
            Female play: <strong>{female.status === 'yes' ? 'Yes' : female.status === 'no' ? 'No' : 'Not sure'}</strong>.{' '}
            {female.reason}
            {eightPoints && ' A touchdown is worth 8.'}
            {female.status === 'yes' && !eightPoints && ' Worth 6 from inside the no-run zone.'}
          </div>
        )}
      </section>
  )
}

/** The profile summary, and the editor behind "Edit rules". */
export function RulesPanel() {
  const rules = useEditor((s) => s.rules)
  const [editing, setEditing] = useState(false)

  return (
      <section className="card" id="rules">
        <h2 className="eyebrow">Rules profile · {rules.name}</h2>
        {!editing && rulesSummary(rules).map((line) => <div key={line}>{line}</div>)}
        {editing && <RulesEditor rules={rules} />}
        <button type="button" className="link start" aria-expanded={editing} onClick={() => setEditing(!editing)}>
          {editing ? 'Done' : 'Edit rules'}
        </button>
      </section>
  )
}
