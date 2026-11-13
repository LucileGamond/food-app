// Module Tricot : diagramme (grille) d'un patron, suivi rang par rang avec le compteur de l'étape.
//
// L'image est calée sur ses lignes : bas de la ligne 1 et haut de la dernière, en fractions de la hauteur (0 = haut).
// Les lignes se lisent de bas en haut et ont toutes la même hauteur. Le rang 1 du diagramme se tricote au rang
// `startRow` de l'étape ; une fois le dernier rang tricoté, le motif recommence (`repeats`) ou le diagramme est fini.
//
// À plat (allers-retours), les rangs impairs sont sur l'endroit et se lisent de droite à gauche, les rangs pairs sur
// l'envers, de gauche à droite. En rond, tout se lit sur l'endroit, de droite à gauche. Certains patrons à plat ne
// dessinent que les rangs endroit (`oddOnly`) : chaque ligne vaut alors deux rangs, le rang envers n'est pas dessiné.

export const MAX_CHART_ROWS = 500
export const MAX_CHART_TITLE = 100
/** Image du diagramme : côté long au plus (assez pour zoomer sur une grille), et poids accepté avant réduction. */
export const CHART_MAX_SIDE = 2400
export const MAX_CHART_IMAGE_BYTES = 20 * 1024 * 1024

/** Calage du diagramme, réglé par la tricoteuse. */
export interface ChartSetup {
  stepId: string | null
  title: string
  gridTop: number
  gridBottom: number
  rows: number
  startRow: number
  /** Dernier rang de l'étape où il sert (fin de sa sous-étape) ; absent ou null : jusqu'à la fin de l'étape. */
  endRow?: number | null
  /** Sous-étape suivie : ses rangs de début et de fin font foi (startRow / endRow ne servent qu'à défaut). */
  sectionId?: string | null
  /** Calage : sous-étape choisie (position dans l'étape), pas encore identifiée ; jamais enregistrée. */
  sectionIndex?: number
  repeats: boolean
  /** À plat (allers-retours) ; sinon en rond. */
  flat: boolean
  /** À plat : seuls les rangs endroit sont dessinés. */
  oddOnly: boolean
}

export interface KnitChart extends ChartSetup {
  id: string
  imagePath: string
  /** Adresse temporaire de l'image (bucket privé) ; null si elle n'a pas pu être obtenue. */
  imageUrl: string | null
}

export type Side = 'endroit' | 'envers'

export interface ChartRow {
  kind: 'row'
  /** Rang du diagramme à tricoter (1 à `chartRows`), et numéro du passage dans le motif (1, 2…). */
  chartRow: number
  repeat: number
  /** Ligne de la grille où se trouve ce rang (1 = en bas). */
  line: number
  /** Rang envers non dessiné (la ligne est celle du rang endroit juste tricoté). */
  drawn: boolean
  side: Side
  /** Sens de lecture : de droite à gauche (rtl) ou de gauche à droite (ltr). */
  direction: 'rtl' | 'ltr'
}

export type ChartPosition =
  | ChartRow
  /** Le diagramme commence plus loin dans l'étape. */
  | { kind: 'before'; startRow: number }
  /** Diagramme tricoté en entier (sans répétition). */
  | { kind: 'after' }

type Reading = Pick<ChartSetup, 'rows' | 'startRow' | 'endRow' | 'repeats' | 'flat' | 'oddOnly'>

/** Rangs tricotés pour un passage dans le diagramme. */
export function chartRows(chart: Pick<ChartSetup, 'rows' | 'flat' | 'oddOnly'>): number {
  return chart.flat && chart.oddOnly ? chart.rows * 2 : chart.rows
}

/** Où en est le diagramme quand on tricote le rang `row` de l'étape (rangs faits + 1). */
export function chartPosition(chart: Reading, row: number): ChartPosition {
  if (row < chart.startRow) return { kind: 'before', startRow: chart.startRow }
  // Rattaché à une sous-étape : fini après elle
  if (chart.endRow && row > chart.endRow) return { kind: 'after' }
  const total = chartRows(chart)
  const offset = row - chart.startRow
  if (!chart.repeats && offset >= total) return { kind: 'after' }
  const chartRow = (offset % total) + 1
  const side: Side = chart.flat && chartRow % 2 === 0 ? 'envers' : 'endroit'
  const oddOnly = chart.flat && chart.oddOnly
  return {
    kind: 'row',
    chartRow,
    repeat: Math.floor(offset / total) + 1,
    line: oddOnly ? Math.ceil(chartRow / 2) : chartRow,
    drawn: !oddOnly || side === 'endroit',
    side,
    direction: side === 'endroit' ? 'rtl' : 'ltr',
  }
}

/** Bande de la ligne `line` (1 = en bas), en fractions de la hauteur de l'image. */
export function rowBand(chart: Pick<ChartSetup, 'gridTop' | 'gridBottom' | 'rows'>, line: number): { top: number; bottom: number } {
  const height = (chart.gridBottom - chart.gridTop) / chart.rows
  const bottom = chart.gridBottom - (line - 1) * height
  return { top: bottom - height, bottom }
}

/** Calage lu en base : valeurs bornées, pour qu'une donnée abîmée ne fasse pas planter l'écran. */
export function sanitizeSetup(raw: { grid_top: number | string; grid_bottom: number | string; rows: number; start_row: number; end_row?: number | null; section_id?: string | null }): Pick<ChartSetup, 'gridTop' | 'gridBottom' | 'rows' | 'startRow' | 'endRow' | 'sectionId'> {
  const fraction = (v: number | string, fallback: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : fallback
  }
  const top = fraction(raw.grid_top, 0)
  const bottom = fraction(raw.grid_bottom, 1)
  const count = (v: number, max: number) => (Number.isInteger(v) && v >= 1 ? Math.min(v, max) : 1)
  return {
    gridTop: bottom > top ? top : 0,
    gridBottom: bottom > top ? bottom : 1,
    rows: count(raw.rows, MAX_CHART_ROWS),
    startRow: count(raw.start_row, 5000),
    ...(typeof raw.end_row === 'number' && Number.isInteger(raw.end_row) && raw.end_row >= raw.start_row ? { endRow: Math.min(raw.end_row, 5000) } : {}),
    ...(typeof raw.section_id === 'string' && raw.section_id ? { sectionId: raw.section_id } : {}),
  }
}

export interface ChartForm {
  stepId: string
  title: string
  gridTop: number
  gridBottom: number
  rows: string
  startRow: string
  /** Dernier rang (vide : jusqu'à la fin de l'étape). */
  endRow?: string
  /** Sous-étape suivie (choisie dans le calage) : son identifiant, ou sa position si elle n'en a pas encore. */
  sectionId?: string
  sectionIndex?: number
  repeats: boolean
  flat: boolean
  oddOnly: boolean
}

export function setupToForm(setup: ChartSetup): ChartForm {
  const { endRow, sectionId, sectionIndex: _sectionIndex, ...rest } = setup
  return { ...rest, stepId: setup.stepId ?? '', rows: String(setup.rows), startRow: String(setup.startRow), ...(endRow ? { endRow: String(endRow) } : {}), ...(sectionId ? { sectionId } : {}) }
}

/** Plus petit écart entre le haut et le bas du diagramme (fraction de l'image). */
export const MIN_GRID_HEIGHT = 0.02

/** Valeurs du formulaire → calage, ou message d'erreur. */
export function formToSetup(form: ChartForm): ChartSetup | string {
  const parse = (value: string, max: number) => {
    const n = Number(value.trim())
    return value.trim() && Number.isInteger(n) && n >= 1 && n <= max ? n : null
  }
  const rows = parse(form.rows, MAX_CHART_ROWS)
  if (rows === null) return `Lignes de la grille : un nombre entier entre 1 et ${MAX_CHART_ROWS}.`
  const startRow = parse(form.startRow, 5000)
  if (startRow === null) return 'Premier rang : un nombre entier entre 1 et 5000.'
  if (form.gridBottom - form.gridTop < MIN_GRID_HEIGHT) return 'Place le trait du haut au-dessus du trait du bas.'
  const endRow = form.endRow?.trim() ? parse(form.endRow, 5000) : null
  if (endRow === null && form.endRow?.trim()) return 'Dernier rang : un nombre entier entre 1 et 5000.'
  if (endRow !== null && endRow < startRow) return 'Le dernier rang vient après le premier.'
  return {
    stepId: form.stepId || null,
    title: form.title.trim().slice(0, MAX_CHART_TITLE),
    gridTop: round4(Math.max(form.gridTop, 0)),
    gridBottom: round4(Math.min(form.gridBottom, 1)),
    rows,
    startRow,
    repeats: form.repeats,
    flat: form.flat,
    // En rond, chaque tour est dessiné.
    oddOnly: form.flat && form.oddOnly,
    ...(endRow !== null ? { endRow } : {}),
    ...(form.sectionId ? { sectionId: form.sectionId } : {}),
    ...(form.sectionIndex !== undefined && !form.sectionId ? { sectionIndex: form.sectionIndex } : {}),
  }
}

/** Comme en base (numeric(5, 4)). */
const round4 = (n: number) => Math.round(n * 10_000) / 10_000

/** Déplace le trait le plus proche de `y` (fraction de la hauteur) sans croiser l'autre. */
export function moveNearestLine(grid: { gridTop: number; gridBottom: number }, y: number): { gridTop: number; gridBottom: number } {
  const clamped = Math.min(Math.max(y, 0), 1)
  const top = Math.abs(clamped - grid.gridTop) <= Math.abs(clamped - grid.gridBottom)
  return top
    ? { ...grid, gridTop: Math.min(clamped, grid.gridBottom - MIN_GRID_HEIGHT) }
    : { ...grid, gridBottom: Math.max(clamped, grid.gridTop + MIN_GRID_HEIGHT) }
}

/** Diagramme repéré à la lecture du patron : page du PDF et calage proposé (voir la fonction knit-pattern). */
export interface ChartHint {
  page: number
  title: string
  rows: number | null
  /** Position de l'étape (0 = première). */
  step: number | null
  flat: boolean | null
  oddOnly: boolean
}

/** Diagrammes repérés lus en base : seuls ceux bien formés sont gardés. */
export function sanitizeHints(raw: unknown): ChartHint[] {
  if (!Array.isArray(raw)) return []
  const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null)
  return raw.flatMap((value): ChartHint[] => {
    if (typeof value !== 'object' || value === null) return []
    const h = value as Record<string, unknown>
    const page = int(h.page, 2000)
    if (!page) return []
    const rows = int(h.rows, MAX_CHART_ROWS)
    const flat = typeof h.flat === 'boolean' ? h.flat : null
    return [
      {
        page,
        title: typeof h.title === 'string' ? h.title.slice(0, MAX_CHART_TITLE) : '',
        rows: rows || null,
        step: int(h.step, 200),
        flat,
        oddOnly: h.oddOnly === true && flat !== false,
      },
    ]
  })
}

/** Formulaire d'un nouveau diagramme, pré-rempli avec ce que la lecture a repéré (sinon l'étape en cours). */
export function newChartForm(stepId: string, hint: ChartHint | null = null, steps: { id: string }[] = []): ChartForm {
  const hintedStep = hint?.step !== null && hint?.step !== undefined ? steps[hint.step]?.id : undefined
  const flat = hint?.flat ?? true
  return {
    stepId: hintedStep ?? stepId,
    title: hint?.title ?? '',
    gridTop: 0,
    gridBottom: 1,
    rows: hint?.rows ? String(hint.rows) : '',
    startRow: '1',
    repeats: true,
    flat,
    oddOnly: flat && (hint?.oddOnly ?? false),
  }
}

/** « Torsade, page 4 », « Diagramme, page 5 ». */
export function describeHint(hint: ChartHint): string {
  return `${hint.title || 'Diagramme'}, page ${hint.page}`
}

/** « Rang 5 sur 24 », « Rang 5 sur 24 · 2e fois ». */
export function describePosition(position: ChartRow, chart: Pick<ChartSetup, 'rows' | 'flat' | 'oddOnly'>): string {
  return `Rang ${position.chartRow} sur ${chartRows(chart)}${position.repeat > 1 ? ` · ${position.repeat}e fois` : ''}`
}

/** « Endroit, de droite à gauche », « Envers non dessiné : … », « De droite à gauche » (en rond). */
export function describeReading(position: ChartRow, flat: boolean): string {
  if (!position.drawn) return 'Envers, non dessiné : en général, les mailles comme elles se présentent'
  const direction = position.direction === 'rtl' ? 'de droite à gauche' : 'de gauche à droite'
  return flat ? `${position.side === 'endroit' ? 'Endroit' : 'Envers'}, ${direction}` : `Tour ${direction}`
}

/** « Rang 5 sur 24 », « Commence au rang 12 de l'étape », « Diagramme terminé ». */
export function chartStatus(chart: Pick<ChartSetup, 'rows' | 'flat' | 'oddOnly'>, position: ChartPosition): { main: string; reading: string | null } {
  if (position.kind === 'before') return { main: `Commence au rang ${position.startRow} de l’étape`, reading: null }
  if (position.kind === 'after') return { main: 'Diagramme terminé', reading: null }
  return { main: describePosition(position, chart), reading: describeReading(position, chart.flat) }
}
