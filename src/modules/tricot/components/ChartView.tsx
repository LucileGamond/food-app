import { ArrowLeft, ArrowRight, Maximize2, Minus, Plus, Settings2, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { chartPosition, describePosition, describeReading, rowBand, type ChartPosition, type KnitChart } from '../lib/chart'

interface Props {
  chart: KnitChart
  /** Rangs terminés de l'étape (le rang à tricoter est le suivant). */
  rowCount: number
  onCount: (delta: number) => void
  onEdit: () => void
  onDelete: () => void
}

/** Grossissements proposés par les boutons ; le pincement va de l'un à l'autre en continu. */
const ZOOMS = [1, 1.5, 2, 3, 4]
const MIN_ZOOM = ZOOMS[0]!
const MAX_ZOOM = ZOOMS[ZOOMS.length - 1]!

/** « Rang 5 sur 24 », « Commence au rang 12 de l'étape », « Diagramme terminé ». */
function statusOf(chart: KnitChart, position: ChartPosition): { main: string; reading: string | null } {
  if (position.kind === 'before') return { main: `Commence au rang ${position.startRow} de l’étape`, reading: null }
  if (position.kind === 'after') return { main: 'Diagramme terminé', reading: null }
  return { main: describePosition(position, chart), reading: describeReading(position, chart.flat) }
}

interface ImageProps {
  chart: KnitChart
  position: ChartPosition
  zoom: number
  /** Plein écran : pincement à deux doigts pour zoomer. */
  onZoom?: (zoom: number) => void
  className?: string
}

/** Image du diagramme : bande sur le rang à tricoter, rangs faits atténués, flèche du sens de lecture. */
function ChartImage({ chart, position, zoom, onZoom, className }: ImageProps) {
  const name = chart.title || 'Diagramme'
  const row = position.kind === 'row' ? position : null
  const band = row ? rowBand(chart, row.line) : null
  const scroller = useRef<HTMLDivElement>(null)
  const bandRef = useRef<HTMLDivElement>(null)
  const previousZoom = useRef(zoom)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)

  // Zoom : le point au centre de l'écran reste au centre.
  useLayoutEffect(() => {
    const box = scroller.current
    const ratio = zoom / previousZoom.current
    previousZoom.current = zoom
    if (!box || ratio === 1) return
    box.scrollLeft = (box.scrollLeft + box.clientWidth / 2) * ratio - box.clientWidth / 2
    box.scrollTop = (box.scrollTop + box.clientHeight / 2) * ratio - box.clientHeight / 2
  }, [zoom])

  // À chaque rang : la bande revient au milieu si elle sort de la zone, et le début du rang est visible quand on a
  // zoomé (bord droit pour un rang lu de droite à gauche). La page, elle, ne bouge pas.
  useEffect(() => {
    const box = scroller.current
    const mark = bandRef.current
    if (!box || !mark) return
    const top = mark.offsetTop
    const bottom = top + mark.offsetHeight
    if (top < box.scrollTop || bottom > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, (top + bottom) / 2 - box.clientHeight / 2)
    if (box.scrollWidth > box.clientWidth) box.scrollLeft = row?.direction === 'rtl' ? box.scrollWidth : 0
    // Seuls le rang et l'image comptent : un zoom garde la position choisie.
  }, [band?.top, row?.direction, chart.imageUrl])

  function down(event: PointerEvent) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) pinch.current = { distance: spread(), zoom }
  }

  function move(event: PointerEvent) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinch.current && pointers.current.size === 2 && pinch.current.distance > 0 && onZoom) {
      onZoom(Math.min(Math.max((pinch.current.zoom * spread()) / pinch.current.distance, MIN_ZOOM), MAX_ZOOM))
    }
  }

  function up(event: PointerEvent) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  function spread() {
    const [a, b] = [...pointers.current.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }

  const pct = (n: number) => `${n * 100}%`
  const Arrow = row?.direction === 'rtl' ? ArrowLeft : ArrowRight
  if (!chart.imageUrl) return <p className="text-sm text-muted-foreground">Image indisponible : recharge la page.</p>
  return (
    <div
      ref={scroller}
      // Zone qui défile : atteignable au clavier (flèches pour la parcourir).
      role="group"
      aria-label={`Image : ${name}`}
      tabIndex={0}
      className={cn('overflow-auto rounded-lg bg-white focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none', onZoom && 'touch-pan-x touch-pan-y', className)}
      onPointerDown={onZoom && down}
      onPointerMove={onZoom && move}
      onPointerUp={onZoom && up}
      onPointerCancel={onZoom && up}
      data-testid="chart-scroller"
    >
      <div className="relative" style={{ width: pct(zoom) }}>
        <img src={chart.imageUrl} alt={`${name} du patron`} className="block w-full select-none" draggable={false} />
        {band && row && (
          <>
            {/* Rangs déjà faits : sous la bande, jusqu'au bas de la grille (la ligne en cours reste nette). */}
            <div className="pointer-events-none absolute inset-x-0 bg-white/55" style={{ top: pct(band.bottom), height: pct(chart.gridBottom - band.bottom) }} aria-hidden />
            <div
              ref={bandRef}
              className={cn('pointer-events-none absolute inset-x-0 border-y-2 border-brand', row.drawn ? 'bg-brand/20' : 'border-dashed bg-brand/5')}
              style={{ top: pct(band.top), height: pct(band.bottom - band.top) }}
              data-testid="chart-band"
              data-direction={row.direction}
              aria-hidden
            >
              {row.drawn && (
                <span className={cn('absolute top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-white shadow', row.direction === 'rtl' ? 'right-1' : 'left-1')}>
                  <Arrow className="size-3.5" />
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Diagramme du patron : la bande suit le rang à tricoter ; en plein écran, zoom et compteur à portée de pouce. */
export function ChartView({ chart, rowCount, onCount, onEdit, onDelete }: Props) {
  const position = chartPosition(chart, rowCount + 1)
  const status = statusOf(chart, position)
  const name = chart.title || 'Diagramme'
  const [full, setFull] = useState(false)
  const [zoom, setZoom] = useState(MIN_ZOOM)

  const stepZoom = (direction: 1 | -1) =>
    setZoom((z) => (direction > 0 ? (ZOOMS.find((l) => l > z + 0.01) ?? MAX_ZOOM) : ([...ZOOMS].reverse().find((l) => l < z - 0.01) ?? MIN_ZOOM)))

  return (
    <section aria-label={name} className="space-y-2 rounded-2xl border p-3">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{name}</h3>
          <p role="status" className="text-sm text-muted-foreground">
            {status.main}
            {status.reading && <span className="block">{status.reading}</span>}
          </p>
        </div>
        <Button variant="ghost" size="icon-lg" aria-label={`Plein écran : ${name}`} onClick={() => setFull(true)} disabled={!chart.imageUrl}>
          <Maximize2 />
        </Button>
        <Button variant="ghost" size="icon-lg" aria-label={`Régler ${name}`} onClick={onEdit}>
          <Settings2 />
        </Button>
        <Button variant="ghost" size="icon-lg" aria-label={`Supprimer ${name}`} onClick={onDelete}>
          <Trash2 />
        </Button>
      </div>
      {!full && <ChartImage chart={chart} position={position} zoom={1} className="max-h-[60svh]" />}

      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent
          showCloseButton={false}
          className="top-0 left-0 flex h-[100svh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 ring-0 sm:max-w-none"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base">{name}</DialogTitle>
              <DialogDescription render={<p role="status" />} className="text-sm">
                {status.main}
                {status.reading && ` · ${status.reading}`}
              </DialogDescription>
            </div>
            <Button variant="outline" size="icon-lg" aria-label="Dézoomer" disabled={zoom <= MIN_ZOOM} onClick={() => stepZoom(-1)}>
              <ZoomOut />
            </Button>
            <Button variant="outline" size="icon-lg" aria-label="Zoomer" disabled={zoom >= MAX_ZOOM} onClick={() => stepZoom(1)}>
              <ZoomIn />
            </Button>
            <Button variant="ghost" size="icon-lg" aria-label="Fermer le plein écran" onClick={() => setFull(false)}>
              <X />
            </Button>
          </div>
          <ChartImage chart={chart} position={position} zoom={zoom} onZoom={setZoom} className="min-h-0 flex-1 rounded-none" />
          <div className="flex items-center gap-3 border-t px-3 py-3">
            <Button variant="outline" size="icon-lg" aria-label="Retirer un rang" disabled={rowCount === 0} onClick={() => onCount(-1)}>
              <Minus />
            </Button>
            <p className="min-w-0 flex-1 text-center text-sm text-muted-foreground">
              <span className="text-2xl font-semibold text-foreground tabular-nums">{rowCount}</span> rangs faits
            </p>
            <Button className="h-12 px-6" onClick={() => onCount(1)}>
              <Plus />
              <span className="sr-only">Ajouter</span> 1 rang
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
