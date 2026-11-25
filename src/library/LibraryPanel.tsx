import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { PlayerCardsPanel } from '../pdf/PlayerCardsPanel'
import { PrintPanel } from '../pdf/PrintPanel'
import { WristCoachPanel } from '../pdf/WristCoachPanel'
import { checkPlay } from '../rules/checkPlay'
import { exportFileName, exportPlaybook, importPlaybook, PlaybookFormatError } from '../storage/playbookFile'
import { endCoalescing, toPlaybook, useEditor } from '../store/editorStore'
import { COMMON_TAGS, duplicateNumbers, MAX_PLAY_NUMBER, normalizeTag, searchPlays, tagCounts } from './library'

const titleCase = (tag: string) => tag.charAt(0).toUpperCase() + tag.slice(1)

/** Hands the browser a file to save. */
function download(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

/** The play library: search, tag filter, the list, and the open play's details. */
export function LibraryPanel() {
  const play = useEditor((s) => s.play)
  const plays = useEditor((s) => s.plays)
  const rules = useEditor((s) => s.rules)
  const { openPlay, newPlay, duplicatePlay, mirrorPlay, deletePlay, renamePlay, setPlayNumber, toggleTag, loadPlaybook } =
    useEditor.getState()

  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [newTag, setNewTag] = useState('')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const tags = tagCounts(plays)
  // A tag filter for a tag nobody has any more would hide every play.
  const activeTag = tag && tags.some((t) => t.tag === tag) ? tag : null
  const shown = searchPlays(plays, query, activeTag)
  const dupes = duplicateNumbers(plays)
  const tagOptions = [...new Set([...COMMON_TAGS, ...play.tags])]

  const onExport = () => {
    const playbook = toPlaybook(useEditor.getState())
    download(exportFileName(playbook.name), exportPlaybook(playbook))
    setMessage({ text: `Exported ${playbook.plays.length} play${playbook.plays.length === 1 ? '' : 's'}.`, error: false })
  }

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Clear the input so picking the same file again still fires.
    e.target.value = ''
    if (!file) return
    try {
      const playbook = importPlaybook(await file.text())
      const count = `${playbook.plays.length} play${playbook.plays.length === 1 ? '' : 's'}`
      const ok = window.confirm(
        `Replace this playbook with "${playbook.name}" (${count})?\n\nThe ${plays.length} play${plays.length === 1 ? '' : 's'} here now will be removed. Export first if you want to keep them.`,
      )
      if (!ok) return
      loadPlaybook(playbook)
      setQuery('')
      setTag(null)
      setMessage({ text: `Imported ${count}.`, error: false })
    } catch (error) {
      const text = error instanceof PlaybookFormatError ? error.message : 'That file could not be read.'
      setMessage({ text: `Import failed. ${text}`, error: true })
    }
  }

  const onDelete = () => {
    if (window.confirm(`Delete "${play.name}"? This cannot be undone.`)) deletePlay(play.id)
  }

  const onAddTag = (e: FormEvent) => {
    e.preventDefault()
    const clean = normalizeTag(newTag)
    if (clean && !play.tags.includes(clean)) toggleTag(clean)
    setNewTag('')
  }

  return (
    <aside className="library">
      <label className="field-label">
        Search plays
        <input
          type="search"
          className="input"
          placeholder="name, tag, or number"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <div className="chips" role="group" aria-label="Filter by tag">
        <button type="button" className="pill" aria-pressed={activeTag === null} onClick={() => setTag(null)}>
          All {plays.length}
        </button>
        {tags.map((t) => (
          <button
            key={t.tag}
            type="button"
            className="pill"
            aria-pressed={activeTag === t.tag}
            onClick={() => setTag(activeTag === t.tag ? null : t.tag)}
          >
            {titleCase(t.tag)} {t.count}
          </button>
        ))}
      </div>

      <ul className="play-list" aria-label="Plays">
        {shown.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="play-row"
              aria-current={p.id === play.id ? 'true' : undefined}
              onClick={() => openPlay(p.id)}
            >
              <span className={dupes.has(p.number) ? 'play-number dupe' : 'play-number'}>{p.number}</span>
              <span className="play-name">{p.name || 'Untitled'}</span>
              {checkPlay(p, rules).length > 0 && (
                <span className="warn-dot" role="img" aria-label="Has a rule warning" title="Has a rule warning" />
              )}
              <span className="play-formation">{p.formation}</span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="muted small empty">No plays match.</li>}
      </ul>

      {dupes.size > 0 && (
        <p className="warn small">
          Two plays share call number {[...dupes].sort((a, b) => a - b).join(', ')}. Each needs its own for the
          wrist coach.
        </p>
      )}

      <button type="button" className="tool dashed" onClick={newPlay}>
        + New play
      </button>

      <section className="group">
        <h2 className="eyebrow">This play</h2>
        <div className="name-row">
          <label className="field-label number">
            No.
            <input
              type="number"
              className="input"
              min={1}
              max={MAX_PLAY_NUMBER}
              value={play.number}
              onChange={(e) => setPlayNumber(e.target.valueAsNumber)}
              onBlur={endCoalescing}
            />
          </label>
          <label className="field-label grow">
            Name
            <input
              type="text"
              className="input"
              value={play.name}
              maxLength={40}
              onChange={(e) => renamePlay(e.target.value)}
              onBlur={endCoalescing}
            />
          </label>
        </div>

        <div className="chips" role="group" aria-label="Tags on this play">
          {tagOptions.map((t) => (
            <button key={t} type="button" className="pill" aria-pressed={play.tags.includes(t)} onClick={() => toggleTag(t)}>
              {titleCase(t)}
            </button>
          ))}
        </div>
        <form className="name-row" onSubmit={onAddTag}>
          <input
            type="text"
            className="input grow"
            placeholder="add a tag"
            aria-label="Add a tag"
            value={newTag}
            maxLength={24}
            onChange={(e) => setNewTag(e.target.value)}
          />
          <button type="submit" className="tool" disabled={!normalizeTag(newTag)}>
            Add
          </button>
        </form>

        <div className="route-grid">
          <button type="button" className="tool" onClick={() => duplicatePlay(play.id)}>
            Duplicate
          </button>
          <button type="button" className="tool" onClick={() => mirrorPlay(play.id)}>
            Mirror
          </button>
          <button type="button" className="tool danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </section>

      <PrintPanel />

      <WristCoachPanel />

      <PlayerCardsPanel />

      <section className="group">
        <h2 className="eyebrow">Backup</h2>
        <div className="route-grid two">
          <button type="button" className="tool" onClick={onExport}>
            Export
          </button>
          <button type="button" className="tool" onClick={() => fileInput.current?.click()}>
            Import
          </button>
        </div>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={onImport} />
        {message && (
          <p className={message.error ? 'warn small' : 'ok small'} role="status">
            {message.text}
          </p>
        )}
        <p className="muted small">
          Plays save in this browser as you work. Export a file to back up or to move to another device.
        </p>
      </section>
    </aside>
  )
}
