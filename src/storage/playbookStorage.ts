import { openDB } from 'idb'
import type { Playbook } from '../model/types'

/** Where the playbook lives between visits. Returns whatever was stored, unchecked. */
export type PlaybookStorage = {
  load(): Promise<unknown>
  save(playbook: Playbook): Promise<void>
  /** Sets aside a record that could not be read, so a bad load never destroys data. */
  quarantine(record: unknown): Promise<void>
}

const DB_NAME = 'seven-deep'
const STORE = 'playbooks'
const CURRENT = 'current'

/** The playbook in the browser's IndexedDB. One record, replaced on every save. */
export function indexedDbStorage(dbName: string = DB_NAME): PlaybookStorage {
  const db = openDB(dbName, 1, {
    upgrade(database) {
      database.createObjectStore(STORE)
    },
  })
  return {
    async load() {
      return (await (await db).get(STORE, CURRENT)) ?? null
    },
    async save(playbook) {
      await (await db).put(STORE, playbook, CURRENT)
    },
    async quarantine(record) {
      await (await db).put(STORE, record, `unreadable-${Date.now()}`)
    },
  }
}

/** Keeps the playbook in memory only. For tests, and as a fallback when the browser blocks storage. */
export function memoryStorage(initial: unknown = null): PlaybookStorage & { saves: number; quarantined: unknown[] } {
  let current = initial
  return {
    saves: 0,
    quarantined: [],
    async load() {
      return current
    },
    async save(playbook) {
      // A structured clone, like IndexedDB makes, so later edits cannot reach the stored copy.
      current = structuredClone(playbook)
      this.saves++
    },
    async quarantine(record) {
      this.quarantined.push(record)
    },
  }
}
