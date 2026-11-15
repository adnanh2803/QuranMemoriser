/**
 * Selection of a contiguous run of printed slots on the mushaf.
 *
 * Every gesture picks a run: tapping a word selects its verse from the first
 * word through the tapped word; tapping the verse-end medallion (the ayah
 * number) selects the whole verse; tapping a printed row's edge or the gap
 * between two of its words selects the row. A fresh tap replaces the run and
 * tapping inside it clears; shift-tap or a long press extends the run to
 * cover the tapped target instead.
 *
 * The state lives in one small engine; every user action is a command object
 * executed against it with the command context, so the interactions stay
 * declarative and testable.
 */
import { parseVerseKey, type VerseKey, verseKey } from "../../../domain/schemas"
import type { CommandContext, WordIdentity } from "../data/mushaf-repository"

/** One printed slot of a verse, in mushaf order. */
export interface WordRef {
  surah: number
  ayah: number
  /** 1-based slot index within the verse, in printed order. */
  word: number
}

/** The selected span: from one slot to a later one, in mushaf order. */
export interface SelectionRun {
  start: WordRef
  end: WordRef
}

/**
 * Which printed target a gesture aimed at, before the context resolves the
 * slot indexes: a word of a verse, a whole verse, or a printed row.
 */
export type RunCandidate =
  | { kind: "word"; word: WordIdentity }
  | { kind: "verse"; key: VerseKey }
  | { kind: "row"; first: WordIdentity; last: WordIdentity }

/** Mushaf order of two slots: surah, then ayah, then printed position. */
export function compareWordRefs(a: WordRef, b: WordRef): number {
  if (a.surah !== b.surah) return a.surah - b.surah
  if (a.ayah !== b.ayah) return a.ayah - b.ayah
  return a.word - b.word
}

const minWordRef = (a: WordRef, b: WordRef): WordRef => (compareWordRefs(a, b) <= 0 ? a : b)
const maxWordRef = (a: WordRef, b: WordRef): WordRef => (compareWordRefs(a, b) >= 0 ? a : b)

/** The slot a word identity resolves to, or null when it is unknown. */
function wordRefOf(word: WordIdentity, context: CommandContext): WordRef | null {
  const index = context.wordIndex(word)
  if (index === undefined) return null
  return { surah: word.surah, ayah: word.ayah, word: index }
}

/** Turn a candidate into a concrete run, or null when it cannot resolve. */
export function resolveCandidate(
  candidate: RunCandidate,
  context: CommandContext,
): SelectionRun | null {
  switch (candidate.kind) {
    case "word": {
      // A word selects its verse from the first word through itself; the
      // verse-end medallion is the last slot, so it selects the whole verse.
      const ref = wordRefOf(candidate.word, context)
      if (!ref) return null
      return { start: { ...ref, word: 1 }, end: ref }
    }
    case "verse": {
      const parsed = parseVerseKey(candidate.key)
      const total = context.verseWordCount(candidate.key)
      if (!parsed || total === undefined) return null
      const [surah, ayah] = parsed
      return { start: { surah, ayah, word: 1 }, end: { surah, ayah, word: total } }
    }
    case "row": {
      const first = wordRefOf(candidate.first, context)
      const last = wordRefOf(candidate.last, context)
      if (!first || !last) return null
      return { start: minWordRef(first, last), end: maxWordRef(first, last) }
    }
  }
}

/** Every verse the run touches, in mushaf order. */
function touchedVerses(run: SelectionRun, context: CommandContext): VerseKey[] {
  const from = context.indexOf(verseKey(run.start.surah, run.start.ayah))
  const to = context.indexOf(verseKey(run.end.surah, run.end.ayah))
  if (from === undefined || to === undefined) return []
  return context.keysBetween(Math.min(from, to), Math.max(from, to))
}

/** How many printed slots the run covers. */
function countRunWords(run: SelectionRun, context: CommandContext): number {
  const touched = touchedVerses(run, context)
  if (touched.length === 0) return 0
  if (touched.length === 1) return run.end.word - run.start.word + 1
  let total = 0
  for (const key of touched) total += context.verseWordCount(key) ?? 0
  const endTotal = context.verseWordCount(verseKey(run.end.surah, run.end.ayah)) ?? 0
  return total - (run.start.word - 1) - (endTotal - run.end.word)
}

/** True when the run covers its verses from the first word to the last slot. */
function isWholeVerseRun(run: SelectionRun, context: CommandContext): boolean {
  const endTotal = context.verseWordCount(verseKey(run.end.surah, run.end.ayah))
  return run.start.word === 1 && endTotal !== undefined && run.end.word === endTotal
}

/** Assign a resolved run and its derived counts to the engine. */
function applyRun(run: SelectionRun, engine: SelectionEngine, context: CommandContext): void {
  engine.setRun(
    run,
    countRunWords(run, context),
    touchedVerses(run, context),
    isWholeVerseRun(run, context),
  )
}

/** The selection state. Reactive: reading it in a component tracks changes. */
export class SelectionEngine {
  private runState = $state<SelectionRun | null>(null)
  private wordCountState = $state(0)
  private touchedState = $state<VerseKey[]>([])
  private wholeState = $state(false)

  /** The selected run, or null when nothing is selected. */
  get run(): SelectionRun | null {
    return this.runState
  }

  /** How many printed slots are inside the run. */
  get size(): number {
    return this.wordCountState
  }

  /** How many verses the run touches (edge verses included when partial). */
  get verseCount(): number {
    return this.touchedState.length
  }

  /** True when the run covers its verses from the first word to the end. */
  get wholeVerses(): boolean {
    return this.wholeState
  }

  isWordSelected(ref: WordRef): boolean {
    const run = this.runState
    if (!run) return false
    return compareWordRefs(ref, run.start) >= 0 && compareWordRefs(ref, run.end) <= 0
  }

  /** Whether the run touches this verse, even partially. */
  has(key: VerseKey): boolean {
    return this.touchedState.includes(key)
  }

  /** Touched verses in mushaf order (copy and bookmark operate on these). */
  verseKeys(): VerseKey[] {
    return [...this.touchedState]
  }

  setRun(run: SelectionRun, words: number, touched: VerseKey[], whole: boolean): void {
    this.runState = run
    this.wordCountState = words
    this.touchedState = touched
    this.wholeState = whole
  }

  clear(): void {
    this.runState = null
    this.wordCountState = 0
    this.touchedState = []
    this.wholeState = false
  }
}

/** A user action on the selection. */
export interface SelectionCommand {
  readonly name: string
  execute(engine: SelectionEngine, context: CommandContext): void
}

/** Tap a printed target: select its run, or clear when it is already inside. */
export class TapRun implements SelectionCommand {
  readonly name = "tap-run"

  constructor(private readonly candidate: RunCandidate) {}

  execute(engine: SelectionEngine, context: CommandContext): void {
    const run = resolveCandidate(this.candidate, context)
    if (!run) return
    if (engine.isWordSelected(run.start) && engine.isWordSelected(run.end)) {
      engine.clear()
      return
    }
    applyRun(run, engine, context)
  }
}

/**
 * Shift-tap or long-press a printed target: extend the run to cover it. Acts
 * like a tap when nothing is selected yet.
 */
export class ExtendRun implements SelectionCommand {
  readonly name = "extend-run"

  constructor(private readonly candidate: RunCandidate) {}

  execute(engine: SelectionEngine, context: CommandContext): void {
    const candidate = resolveCandidate(this.candidate, context)
    if (!candidate) return
    const current = engine.run
    if (!current) {
      applyRun(candidate, engine, context)
      return
    }
    applyRun(
      {
        start: minWordRef(current.start, candidate.start),
        end: maxWordRef(current.end, candidate.end),
      },
      engine,
      context,
    )
  }
}

/** Empty the selection. */
export class ClearSelection implements SelectionCommand {
  readonly name = "clear-selection"

  execute(engine: SelectionEngine): void {
    engine.clear()
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
