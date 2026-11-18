/**
 * Node has no persistent web storage unless started with --localstorage-file,
 * so the unit suite installs a small in-memory Storage. It is cleared before
 * every test, which is what each suite expects of a fresh browser profile.
 */
import { beforeEach, vi } from "vitest"

class MemoryStorage implements Storage {
  #items = new Map<string, string>()

  get length(): number {
    return this.#items.size
  }

  clear(): void {
    this.#items.clear()
  }

  getItem(key: string): string | null {
    return this.#items.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.#items.delete(key)
  }

  setItem(key: string, value: string): void {
    this.#items.set(key, value)
  }
}

const storage = new MemoryStorage()

vi.stubGlobal("localStorage", storage)
beforeEach(() => {
  storage.clear()
})
