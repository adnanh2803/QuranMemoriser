/**
 * The audio repository: per-ayah recitation MP3s from EveryAyah, addressed
 * by the printed surah:ayah numbers the mushaf already shows, so no extra
 * index file is needed. The CDN answers with a wildcard CORS header, which
 * is what lets the service worker cache played files for offline replay.
 */

export interface Reciter {
  id: string
  /** Display name, as the bar shows it. */
  label: string
  /** The reciter's folder under everyayah.com/data. */
  folder: string
}

const DEFAULT_RECITER: Reciter = {
  id: "alafasy",
  label: "Mishary Alafasy",
  folder: "Alafasy_128kbps",
}

export const RECITERS: Reciter[] = [
  DEFAULT_RECITER,
  { id: "husary", label: "Mahmoud Al-Husary (Murattal)", folder: "Husary_64kbps" },
  { id: "minshawi", label: "Al-Minshawi (Murattal)", folder: "Minshawy_Murattal_128kbps" },
  { id: "abdulbasit", label: "Abdul Basit (Murattal)", folder: "Abdul_Basit_Murattal_64kbps" },
  {
    id: "abdulbasit-mujawwad",
    label: "Abdul Basit (Mujawwad)",
    folder: "Abdul_Basit_Mujawwad_128kbps",
  },
  { id: "sudais", label: "Abdurrahman As-Sudais", folder: "Abdurrahmaan_As-Sudais_192kbps" },
  { id: "shaatree", label: "Abu Bakr Ash-Shaatree", folder: "Abu_Bakr_Ash-Shaatree_128kbps" },
  { id: "hani-rifai", label: "Hani Rifai", folder: "Hani_Rifai_192kbps" },
  { id: "husary-muallim", label: "Al-Husary (Muallim)", folder: "Husary_Muallim_128kbps" },
  { id: "minshawi-mujawwad", label: "Al-Minshawi (Mujawwad)", folder: "Minshawy_Mujawwad_192kbps" },
  { id: "tablaway", label: "Mohammad al-Tablaway", folder: "Mohammad_al_Tablaway_128kbps" },
  { id: "shuraym", label: "Saood ash-Shuraym", folder: "Saood_ash-Shuraym_128kbps" },
]

const RECITER_KEY = "qm.reciter"

/** The stored reciter id, or the default when nothing valid was saved. */
export function storedReciterId(): string {
  const saved = localStorage.getItem(RECITER_KEY)
  return saved !== null && RECITERS.some((reciter) => reciter.id === saved)
    ? saved
    : DEFAULT_RECITER.id
}

export function reciterById(id: string): Reciter {
  return RECITERS.find((reciter) => reciter.id === id) ?? DEFAULT_RECITER
}

/** One ayah's MP3 URL, with the surah and ayah padded to three digits. */
export function ayahUrl(reciter: Reciter, surah: number, ayah: number): string {
  const ref = `${String(surah).padStart(3, "0")}${String(ayah).padStart(3, "0")}`
  return `https://everyayah.com/data/${reciter.folder}/${ref}.mp3`
}
