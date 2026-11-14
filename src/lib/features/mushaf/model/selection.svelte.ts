/**
 * Selection of whole ayahs on the mushaf.
 *
 * Tapping any glyph of an ayah selects the ayah; tapping another extends or
 * starts a new selection; shift-tap selects the whole range from the anchor.
 * The state lives in one small engine; every user action is a command object
 * executed against it, so the interactions stay declarative and testable.
 */
import { SvelteSet } from "svelte/reactivity"
import type { VerseKey } from "../../../domain/schemas"
import type { CommandContext } from "../data/mushaf-repository"

/** A user action on the selection. */
export interface SelectionCommand {
  readonly name: string
  execute(engine: SelectionEngine, context: CommandContext): void
}

/** The selection state. Reactive: reading it in a component tracks changes. */
export class SelectionEngine {
  private readonly selected = new SvelteSet<VerseKey>()
  private anchor = $state<VerseKey | null>(null)

  /** How many ayahs are selected. */
  get size(): number {
    return this.selected.size
  }

  /** The ayah ranges extend from (null when the last action was a removal). */
  get anchorKey(): VerseKey | null {
    return this.anchor
  }

  has(key: VerseKey): boolean {
    return this.selected.has(key)
  }

  /** Selected keys in insertion order. */
  keys(): VerseKey[] {
    return [...this.selected]
  }

  /** Select one ayah and make it the range anchor. */
  select(key: VerseKey): void {
    this.selected.add(key)
    this.anchor = key
  }

  /** Deselect one ayah; it stops being the anchor. */
  deselect(key: VerseKey): void {
    this.selected.delete(key)
    if (this.anchor === key) this.anchor = null
  }

  /** Replace the whole selection (a range or a clear). */
  replace(keys: Iterable<VerseKey>, anchor: VerseKey | null): void {
    this.selected.clear()
    for (const key of keys) this.selected.add(key)
    this.anchor = anchor
  }

  clear(): void {
    this.selected.clear()
    this.anchor = null
  }
}

/** Tap a word: select its ayah, or deselect it if it was selected. */
export class TapAyah implements SelectionCommand {
  readonly name = "tap-ayah"

  constructor(private readonly key: VerseKey) {}

  execute(engine: SelectionEngine): void {
    if (engine.has(this.key)) {
      engine.deselect(this.key)
    } else {
      engine.select(this.key)
    }
  }
}

/** Shift-tap a word: select every ayah from the anchor to this one. */
export class ExtendToAyah implements SelectionCommand {
  readonly name = "extend-to-ayah"

  constructor(private readonly key: VerseKey) {}

  execute(engine: SelectionEngine, context: CommandContext): void {
    const anchor = engine.anchorKey
    if (!anchor) {
      engine.select(this.key)
      return
    }
    const from = context.indexOf(anchor)
    const to = context.indexOf(this.key)
    if (from === undefined || to === undefined) {
      engine.select(this.key)
      return
    }
    const [start, end] = from <= to ? [from, to] : [to, from]
    engine.replace(context.keysBetween(start, end), anchor)
  }
}

/** Empty the selection. */
export class ClearSelection implements SelectionCommand {
  readonly name = "clear-selection"

  execute(engine: SelectionEngine): void {
    engine.clear()
  }
}

/** Select an explicit run of ayahs (used by the ayah-list view). */
export class SelectRange implements SelectionCommand {
  readonly name = "select-range"

  constructor(
    private readonly from: VerseKey,
    private readonly to: VerseKey,
  ) {}

  execute(engine: SelectionEngine, context: CommandContext): void {
    const from = context.indexOf(this.from)
    const to = context.indexOf(this.to)
    if (from === undefined || to === undefined) return
    const [start, end] = from <= to ? [from, to] : [to, from]
    engine.replace(context.keysBetween(start, end), this.from)
  }
}

/** Run a command against the engine, guarding against a missing context. */
export function dispatchSelection(
  engine: SelectionEngine,
  command: SelectionCommand,
  contextPromise: Promise<CommandContext>,
): void {
  void contextPromise.then(
    (context) => command.execute(engine, context),
    () => {},
  )
}
