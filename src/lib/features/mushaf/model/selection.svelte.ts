/**
 * Selection of a contiguous run of printed slots on the mushaf, marked in
 * two taps.
 *
 * Tapping a word marks the selection's start: it alone lights up, softly,
 * and waits. The next tap — a word or a verse-end medallion — ends the
 * selection, which then spans everything between the two taps in either
 * direction; tapping the marked word again completes a one-word selection.
 * A verse tapped with no start marked selects its whole unit at once, and
 * can still serve as the end tap afterwards; with a selection already
 * standing, further verse taps accumulate — each grows the run to cover its
 * verse and everything between. Tapping inside a finished selection
 * dismisses it; shift-tap, Ctrl-click or a long press extends instead.
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
 * slot indexes: a word of a verse, or a whole verse.
 */
export type RunCandidate = { kind: "word"; word: WordIdentity } | { kind: "verse"; key: VerseKey }

/** What one gesture resolves to: the slot it aims at and the unit it covers. */
export interface GestureTarget {
  /** What the gesture means: a single word, or a whole verse. */
  unit: "word" | "verse"
  /** The tapped slot (the word, or the verse's end medallion). */
  point: WordRef
  /** The whole printed unit: the word alone, or the whole verse. */
  span: SelectionRun
}

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

/** Turn a candidate into the gesture's point and span, or null when unknown. */
export function resolveTarget(
  candidate: RunCandidate,
  context: CommandContext,
): GestureTarget | null {
  switch (candidate.kind) {
    case "word": {
      const ref = wordRefOf(candidate.word, context)
      if (!ref) return null
      const total = context.verseWordCount(verseKey(ref.surah, ref.ayah))
      // The verse-end medallion — the ayah number — means the whole verse,
      // in every phase of the two-tap flow.
      if (total !== undefined && ref.word === total) {
        return {
          unit: "verse",
          point: ref,
          span: { start: { surah: ref.surah, ayah: ref.ayah, word: 1 }, end: ref },
        }
      }
      return { unit: "word", point: ref, span: { start: ref, end: ref } }
    }
    case "verse": {
      const parsed = parseVerseKey(candidate.key)
      const total = context.verseWordCount(candidate.key)
      if (!parsed || total === undefined) return null
      const [surah, ayah] = parsed
      const start = { surah, ayah, word: 1 }
      const end = { surah, ayah, word: total }
      return { unit: "verse", point: end, span: { start, end } }
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
function applyRunSpan(run: SelectionRun, engine: SelectionEngine, context: CommandContext): void {
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
  private pendingState = $state<WordRef | null>(null)
  private wordCountState = $state(0)
  private touchedState = $state<VerseKey[]>([])
  private wholeState = $state(false)
  private revisionState = $state(0)

  /** Changes once per user action, so listeners can react to a new selection. */
  get revision(): number {
    return this.revisionState
  }

  /** The selected run, or null when nothing is selected. */
  get run(): SelectionRun | null {
    return this.runState
  }

  /** The start a tap has marked, waiting for the end tap. */
  get pending(): WordRef | null {
    return this.pendingState
  }

  /** What the sheet highlights: the marked start alone, or the selection. */
  get displayRun(): SelectionRun | null {
    const pending = this.pendingState
    if (pending) return { start: pending, end: pending }
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
    const run = this.displayRun
    if (!run) return false
    return compareWordRefs(ref, run.start) >= 0 && compareWordRefs(ref, run.end) <= 0
  }

  /** Whether the selection touches this verse, even partially. */
  has(key: VerseKey): boolean {
    const pending = this.pendingState
    if (pending && verseKey(pending.surah, pending.ayah) === key) return true
    return this.touchedState.includes(key)
  }

  /** Touched verses in mushaf order (copy and bookmark operate on these). */
  verseKeys(): VerseKey[] {
    return [...this.touchedState]
  }

  /** Mark a word as the selection's start; it replaces any selection. */
  setPending(ref: WordRef): void {
    this.pendingState = ref
    this.runState = null
    this.wordCountState = 0
    this.touchedState = []
    this.wholeState = false
    this.revisionState += 1
  }

  setRun(run: SelectionRun, words: number, touched: VerseKey[], whole: boolean): void {
    this.pendingState = null
    this.runState = run
    this.wordCountState = words
    this.touchedState = touched
    this.wholeState = whole
    this.revisionState += 1
  }

  clear(): void {
    this.pendingState = null
    this.runState = null
    this.wordCountState = 0
    this.touchedState = []
    this.wholeState = false
    this.revisionState += 1
  }
}

/** A user action on the selection. */
export interface SelectionCommand {
  readonly name: string
  execute(engine: SelectionEngine, context: CommandContext): void
}

/** Tap a printed target: mark a start, complete a selection, or dismiss.
 * A verse tap accumulates: it grows the run to cover itself and everything
 * between it and the run. */
export class TapRun implements SelectionCommand {
  readonly name = "tap-run"

  constructor(private readonly candidate: RunCandidate) {}

  execute(engine: SelectionEngine, context: CommandContext): void {
    const target = resolveTarget(this.candidate, context)
    if (!target) return
    const pending = engine.pending
    if (pending) {
      // The second tap ends the selection: it spans from the marked start
      // to everything this gesture covers, in either direction.
      applyRunSpan(
        {
          start: minWordRef(pending, target.span.start),
          end: maxWordRef(pending, target.span.end),
        },
        engine,
        context,
      )
      return
    }
    const run = engine.run
    if (run && engine.isWordSelected(target.span.start) && engine.isWordSelected(target.span.end)) {
      // Tapping inside the selection dismisses it.
      engine.clear()
      return
    }
    // A word marks the start and waits for the end; a verse selects its
    // whole unit at once.
    if (target.unit === "word") {
      engine.setPending(target.point)
      return
    }
    if (run) {
      // Verse taps accumulate: another verse grows the run to cover both,
      // from the earlier one's first slot to the later one's end.
      applyRunSpan(
        {
          start: minWordRef(run.start, target.span.start),
          end: maxWordRef(run.end, target.span.end),
        },
        engine,
        context,
      )
      return
    }
    applyRunSpan(target.span, engine, context)
  }
}

/**
 * Shift-tap, Ctrl-click or a long press: extend the selection to cover the
 * target instead of marking a start. Acts like the plain gesture when
 * nothing is marked or selected yet.
 */
export class ExtendRun implements SelectionCommand {
  readonly name = "extend-run"

  constructor(private readonly candidate: RunCandidate) {}

  execute(engine: SelectionEngine, context: CommandContext): void {
    const target = resolveTarget(this.candidate, context)
    if (!target) return
    const current = engine.displayRun
    if (!current) {
      if (target.unit === "word") {
        engine.setPending(target.point)
        return
      }
      applyRunSpan(target.span, engine, context)
      return
    }
    applyRunSpan(
      {
        start: minWordRef(current.start, target.span.start),
        end: maxWordRef(current.end, target.span.end),
      },
      engine,
      context,
    )
  }
}

/** Empty the selection (a marked start included). */
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
