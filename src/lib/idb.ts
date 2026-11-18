// Minimal IndexedDB key-value store (reference uploads + run history are too big for localStorage).
const DB = "card-agent-console"
const STORE = "kv"

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

export async function idbGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await open()
    return await new Promise<T>((res) => {
      const q = db.transaction(STORE).objectStore(STORE).get(key)
      q.onsuccess = () => res((q.result as T) ?? fallback)
      q.onerror = () => res(fallback)
    })
  } catch {
    return fallback
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await open()
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } catch {
    /* storage unavailable — keep in memory only */
  }
}

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

export function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota / private mode */
  }
}
