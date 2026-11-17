import { useId, type ReactNode, type SVGProps } from 'react'
import { cn } from '@/lib/utils'
import { arc, cubic, join, line, MINUS_RED, PALETTES, plyAlong, PLUS_GREEN, toPoints, WOOD, type Palette, type Point } from '../lib/knitIconGeometry'
import { ballWraps } from '../lib/yarnDrawing'

// Icônes illustrées du module Tricot : de petits objets du métier (pelotes, fil retors, aiguilles en bois), en
// couleurs et en matière. Chaque action garde son sens habituel. Les étoiles de l'IA (AiIcon) ne changent pas.

type IconProps = SVGProps<SVGSVGElement>

/** Cadre commun : 64 × 64, 24 px par défaut (assez grand pour voir la matière), décoratif sauf aria-label. */
function Icon({ className, children, name, ...props }: Omit<IconProps, 'children'> & { name: string; children: (id: string) => ReactNode }) {
  const id = useId().replace(/:/g, '')
  const sized = /(^|\s)size-/.test(className ?? '')
  return (
    <svg viewBox="0 0 64 64" fill="none" data-icon={name} aria-hidden={props['aria-label'] ? undefined : true} className={cn(!sized && 'size-6', 'shrink-0', className)} {...props}>
      {children(id)}
    </svg>
  )
}

/** Fil retors le long d'une ligne (calculé une fois). */
function strand(points: Point[], width: number, pal: Palette) {
  const pieces = plyAlong(points, width)
  return { points: toPoints(points), width, pal, back: pieces.filter((p) => !p.front), front: pieces.filter((p) => p.front) }
}
type Strand = ReturnType<typeof strand>

function Strand({ s }: { s: Strand }) {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <polyline points={s.points} stroke={s.pal[4]} strokeWidth={s.width} />
      {s.back.map((p, i) => (
        <polyline key={`b${i}`} points={p.points} stroke={s.pal[1]} strokeWidth={s.width * 0.55} />
      ))}
      {s.front.map((p, i) => (
        <polyline key={`f${i}`} points={p.points} stroke={s.pal[2 + (p.ply % 2)]} strokeWidth={s.width * 0.55} />
      ))}
    </g>
  )
}

/** Pelote enroulée irrégulièrement (même dessin que la jauge). */
function Ball({ id, cx, cy, r, pal, seed }: { id: string; cx: number; cy: number; r: number; pal: Palette; seed: number }) {
  const wraps = ballWraps(seed, r, [pal[1], pal[2], pal[3]], 18, cx, cy)
  return (
    <g>
      <clipPath id={id}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <circle cx={cx} cy={cy} r={r} fill={pal[0]} />
        {wraps.map((w, i) => (
          <g key={i} strokeLinecap="round">
            <path d={w.d} stroke={pal[4]} strokeWidth={w.width + 0.8} />
            <path d={w.d} stroke={w.color} strokeWidth={w.width} />
          </g>
        ))}
      </g>
      <circle cx={cx} cy={cy} r={r} stroke={pal[4]} strokeWidth={r / 12} />
      <circle cx={cx - r * 0.32} cy={cy - r * 0.34} r={r * 0.4} fill="#fff" fillOpacity={0.12} />
    </g>
  )
}

/** Aiguille en bois : corps, reflet, pointe, bouton garance. */
function Needle({ from, to, w }: { from: Point; to: Point; w: number }) {
  const a = Math.atan2(to[1] - from[1], to[0] - from[0])
  const [px, py] = [Math.cos(a), Math.sin(a)]
  const tip = w * 2.2
  const end: Point = [to[0] - px * tip, to[1] - py * tip]
  return (
    <g strokeLinecap="round">
      <line x1={from[0]} y1={from[1]} x2={end[0]} y2={end[1]} stroke={WOOD[2]} strokeWidth={w + 1.2} />
      <line x1={from[0]} y1={from[1]} x2={end[0]} y2={end[1]} stroke={WOOD[0]} strokeWidth={w} />
      <line x1={from[0] + px * 2} y1={from[1] + py * 2 - w * 0.2} x2={end[0] - px * 2} y2={end[1] - py * 2 - w * 0.2} stroke={WOOD[1]} strokeWidth={w * 0.3} />
      <path d={`M${end[0] - (py * w) / 2} ${end[1] + (px * w) / 2}L${to[0]} ${to[1]}L${end[0] + (py * w) / 2} ${end[1] - (px * w) / 2}Z`} fill={WOOD[0]} stroke={WOOD[2]} strokeWidth={0.8} strokeLinejoin="round" />
      <circle cx={from[0]} cy={from[1]} r={w * 1.05} fill="#a33a26" stroke="#4f1a11" strokeWidth={0.8} />
    </g>
  )
}

/** Pastille ronde (« + » vert, « − » rouge) en bas à droite, détourée par le fond. */
function Badge({ sign }: { sign: '+' | '−' }) {
  return (
    <g>
      <circle cx={47} cy={47} r={13.4} fill="var(--color-card, #fff)" />
      <circle cx={47} cy={47} r={12} fill={sign === '+' ? PLUS_GREEN : MINUS_RED} />
      <path d={sign === '+' ? 'M40.5 47h13M47 40.5v13' : 'M40.5 47h13'} stroke="#fff" strokeWidth={3.8} strokeLinecap="round" />
    </g>
  )
}

/** Maille endroit (V) d'un petit tricot. */
function V({ cx, top, w, h, col, edge }: { cx: number; top: number; w: number; h: number; col: string; edge: string }) {
  const d = `M${cx - w / 2} ${top}Q${cx - w / 2} ${top + h * 0.7} ${cx} ${top + h}M${cx + w / 2} ${top}Q${cx + w / 2} ${top + h * 0.7} ${cx} ${top + h}`
  return (
    <g strokeLinecap="round">
      <path d={d} stroke={edge} strokeWidth={w * 0.55 + 0.8} />
      <path d={d} stroke={col} strokeWidth={w * 0.55} />
    </g>
  )
}

// --- Tracés calculés une fois -------------------------------------------------------------------------------------

const EDIT_THREAD = strand(join(cubic([8, 52], [16, 40], [24, 56], [32, 46]), cubic([32, 46], [37, 40], [40, 40], [42, 38])), 4.2, PALETTES.indigo)
const CUT_LEFT = strand(cubic([4, 46], [12, 40], [18, 50], [26, 44]), 4, PALETTES.garance)
const CUT_RIGHT = strand(cubic([38, 44], [46, 38], [52, 48], [60, 42]), 4, PALETTES.garance)
const CHECK = strand(join(line([10, 34], [26, 50]), line([26, 50], [54, 16])), 6.4, PALETTES.sauge)
const UNDO = strand(join(line([10, 32], [44, 32]), cubic([44, 32], [52, 32], [54, 40], [48, 44]), cubic([48, 44], [42, 48], [40, 50], [46, 54])), 6, PALETTES.indigo)
const LOOP = strand(arc(32, 34, 18, 180, 480, 60).slice(0, 56), 5.4, PALETTES.indigo)
const CHEVRON = strand(join(line([22, 12], [42, 32]), line([42, 32], [22, 52])), 6.4, PALETTES.indigo)
const LINK_A = strand(join(cubic([28, 22], [14, 8], [2, 22], [16, 36]), line([16, 36], [22, 42])), 5.2, PALETTES.garance)
const LINK_B = strand(join(cubic([36, 42], [50, 56], [62, 42], [48, 28]), line([48, 28], [42, 22])), 5.2, PALETTES.indigo)
const LINK_MID = strand(line([24, 40], [40, 24]), 5.2, PALETTES.gaude)

// --- Icônes ---------------------------------------------------------------------------------------------------------

/** Ajouter : une pelote neuve et un « + » vert. */
export function AddIcon(props: IconProps) {
  return (
    <Icon name="add" {...props}>
      {(id) => (
        <>
          <Ball id={id} cx={30} cy={30} r={23} pal={PALETTES.indigo} seed={11} />
          <Badge sign="+" />
        </>
      )}
    </Icon>
  )
}

/** Retirer (un rang) : la même pelote et un « − » rouge. */
export function RemoveIcon(props: IconProps) {
  return (
    <Icon name="remove" {...props}>
      {(id) => (
        <>
          <Ball id={id} cx={30} cy={30} r={23} pal={PALETTES.indigo} seed={11} />
          <Badge sign="−" />
        </>
      )}
    </Icon>
  )
}

/** Modifier : l'aiguille écrit avec son fil. */
export function EditIcon(props: IconProps) {
  return (
    <Icon name="edit" {...props}>
      {() => (
        <>
          <Strand s={EDIT_THREAD} />
          <Needle from={[54, 8]} to={[36, 44]} w={4.4} />
        </>
      )}
    </Icon>
  )
}

/** Supprimer : les ciseaux coupent le fil. */
export function DeleteIcon(props: IconProps) {
  return (
    <Icon name="delete" {...props}>
      {() => (
        <>
          <Strand s={CUT_LEFT} />
          <Strand s={CUT_RIGHT} />
          <path d="M22 16 L40 40" stroke="#6b6f78" strokeWidth={4.4} strokeLinecap="round" />
          <path d="M42 16 L24 40" stroke="#8a8f98" strokeWidth={4.4} strokeLinecap="round" />
          <circle cx={32} cy={30} r={2} fill="#3a3d44" />
          {[22, 42].map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy={47} r={7} stroke="#4f1a11" strokeWidth={5.2} />
              <circle cx={cx} cy={47} r={7} stroke="#c4553a" strokeWidth={3.6} />
            </g>
          ))}
        </>
      )}
    </Icon>
  )
}

/** Tricoter : deux aiguilles et un petit tricot qui pousse. */
export function KnitIcon(props: IconProps) {
  return (
    <Icon name="knit" {...props}>
      {() => (
        <>
          <rect x={16} y={26} width={32} height={26} rx={3} fill={PALETTES.indigo[0]} />
          {[0, 1, 2].map((r) =>
            [0, 1, 2, 3].map((c) => <V key={`${r}-${c}`} cx={20 + c * 8} top={27 + r * 8} w={6.5} h={7} col={PALETTES.indigo[2 + ((r + c) % 2)]!} edge={PALETTES.indigo[4]} />),
          )}
          <Needle from={[6, 24]} to={[58, 22]} w={3.6} />
          <Needle from={[58, 32]} to={[10, 12]} w={3.6} />
        </>
      )}
    </Icon>
  )
}

/** Fait : une coche en fil retors, nouée au bout. */
export function DoneIcon(props: IconProps) {
  return (
    <Icon name="done" {...props}>
      {() => (
        <>
          <Strand s={CHECK} />
          <circle cx={54} cy={16} r={4.2} fill={PALETTES.sauge[1]} stroke={PALETTES.sauge[4]} strokeWidth={1.2} />
        </>
      )}
    </Icon>
  )
}

/** Défaire : un brin qui se détricote. */
export function UndoIcon(props: IconProps) {
  return <Icon name="undo" {...props}>{() => <Strand s={UNDO} />}</Icon>
}

/** Photo : l'objectif est une pelote. */
export function PhotoIcon(props: IconProps) {
  return (
    <Icon name="photo" {...props}>
      {(id) => (
        <>
          <rect x={6} y={18} width={52} height={36} rx={7} fill="#3a3530" stroke="#1f1b17" strokeWidth={1.4} />
          <rect x={20} y={12} width={16} height={8} rx={2.5} fill="#3a3530" />
          <circle cx={32} cy={36} r={14} fill="#1f1b17" />
          <Ball id={id} cx={32} cy={36} r={11} pal={PALETTES.gaude} seed={5} />
          <circle cx={50} cy={25} r={2.4} fill="#e8c547" />
        </>
      )}
    </Icon>
  )
}

/** Patrons : un livre ouvert, des mailles sur la page. */
export function PatternsIcon(props: IconProps) {
  return (
    <Icon name="patterns" {...props}>
      {() => (
        <>
          <path d="M6 14 C16 10 26 12 32 18 C38 12 48 10 58 14 V52 C48 48 38 50 32 56 C26 50 16 48 6 52 Z" fill="#f4ead8" stroke={WOOD[2]} strokeWidth={2} strokeLinejoin="round" />
          <path d="M32 18 V56" stroke={WOOD[2]} strokeWidth={1.6} />
          {[0, 1].map((r) => [0, 1].map((c) => <V key={`${r}-${c}`} cx={15 + c * 9} top={22 + r * 9} w={7} h={8} col={(r + c) % 2 ? '#de7a5c' : '#c4553a'} edge="#7a2a1c" />))}
          {[24, 30, 36, 42].map((y) => (
            <path key={y} d={`M38 ${y} H${y === 42 ? 48 : 52}`} stroke="#a88a6a" strokeWidth={1.8} strokeLinecap="round" />
          ))}
        </>
      )}
    </Icon>
  )
}

/** Mesures : le mètre ruban enroulé. */
export function MeasuresIcon(props: IconProps) {
  return (
    <Icon name="measures" {...props}>
      {() => (
        <>
          <path d="M30 46 H60 V56 H30 Z" fill="#e8c547" stroke="#6e520a" strokeWidth={1.4} />
          {[34, 38, 42, 46, 50, 54, 58].map((x) => (
            <path key={x} d={`M${x} 46 V${x % 8 === 2 ? 52 : 50}`} stroke="#6e520a" strokeWidth={1} />
          ))}
          <circle cx={26} cy={34} r={22} fill="#c4553a" stroke="#4f1a11" strokeWidth={1.6} />
          <circle cx={26} cy={34} r={15} fill="#de7a5c" />
          <circle cx={26} cy={34} r={6} fill="#e8c547" stroke="#6e520a" strokeWidth={1.2} />
        </>
      )}
    </Icon>
  )
}

/** Diagramme : une grille de jacquard, le rang en cours encadré. */
export function ChartIcon(props: IconProps) {
  const cols = ['#f4ead8', '#3f4fa0', '#e8c547']
  const grid = [
    [0, 1, 0, 1],
    [1, 2, 1, 0],
    [0, 1, 2, 1],
    [1, 0, 1, 0],
  ]
  return (
    <Icon name="chart" {...props}>
      {() => (
        <>
          {grid.map((row, r) => row.map((v, c) => <rect key={`${r}-${c}`} x={10 + c * 11} y={10 + r * 11} width={11} height={11} fill={cols[v]} stroke={WOOD[2]} strokeWidth={1} />))}
          <rect x={10} y={10} width={44} height={44} rx={2} stroke="#6e4a28" strokeWidth={2.2} />
          <rect x={8} y={31} width={48} height={13} rx={2} stroke="#c4553a" strokeWidth={2.4} />
        </>
      )}
    </Icon>
  )
}

/** Recommencer : le fil fait une boucle et revient. */
export function RestartIcon(props: IconProps) {
  return (
    <Icon name="restart" {...props}>
      {() => (
        <>
          <Strand s={LOOP} />
          <path d="M8 22 L16 36 L24 24 Z" fill={PALETTES.indigo[2]} stroke={PALETTES.indigo[4]} strokeWidth={1.4} strokeLinejoin="round" />
        </>
      )}
    </Icon>
  )
}

/** Chercher : la loupe trouve la pelote. */
export function SearchIcon(props: IconProps) {
  return (
    <Icon name="search" {...props}>
      {(id) => (
        <>
          <line x1={40} y1={40} x2={56} y2={56} stroke={WOOD[2]} strokeWidth={7} strokeLinecap="round" />
          <circle cx={26} cy={26} r={20} fill="#fff" fillOpacity={0.6} stroke="#6b6f78" strokeWidth={4} />
          <Ball id={id} cx={26} cy={26} r={12} pal={PALETTES.sauge} seed={9} />
        </>
      )}
    </Icon>
  )
}

/** Ouvrir : un chevron en fil. */
export function OpenIcon(props: IconProps) {
  return <Icon name="open" {...props}>{() => <Strand s={CHEVRON} />}</Icon>
}

/** Revenir : le même chevron que « Ouvrir », retourné (étape précédente, retour). */
export function BackIcon(props: IconProps) {
  return (
    <Icon name="back" {...props}>
      {() => (
        <g transform="matrix(-1 0 0 1 64 0)">
          <Strand s={CHEVRON} />
        </g>
      )}
    </Icon>
  )
}

/** Lien : deux mailles enlacées. */
export function LinkIcon(props: IconProps) {
  return (
    <Icon name="link" {...props}>
      {() => (
        <>
          <Strand s={LINK_A} />
          <Strand s={LINK_B} />
          <Strand s={LINK_MID} />
        </>
      )}
    </Icon>
  )
}

// --- Icônes des boutons (2026-11-15) : fermer, PDF, organiser, séparer, regrouper, question, traduire, surligner,
// recadrer, couverture, aiguilles, sous-étapes, notes, pesée ----------------------------------------------------------

const CLOSE_A = strand(line([14, 14], [50, 50]), 6.4, PALETTES.garance)
const CLOSE_B = strand(line([50, 14], [14, 50]), 6.4, PALETTES.garance)
const ORG_1 = strand(cubic([6, 14], [20, 10], [30, 18], [44, 14]), 5, PALETTES.indigo)
const ORG_2 = strand(cubic([18, 32], [32, 28], [42, 36], [58, 32]), 5, PALETTES.gaude)
const ORG_3 = strand(cubic([6, 50], [20, 46], [30, 54], [44, 50]), 5, PALETTES.garance)
const JOIN_A = strand(cubic([4, 18], [16, 16], [22, 30], [30, 32]), 5.2, PALETTES.indigo)
const JOIN_B = strand(cubic([60, 46], [48, 48], [42, 34], [34, 32]), 5.2, PALETTES.garance)
const starPoint = (k: number): Point => {
  const a = ((k % 10) * Math.PI) / 5 - Math.PI / 2
  const r = k % 2 ? 11 : 25
  return [32 + r * Math.cos(a), 34 + r * Math.sin(a)]
}
const STAR = strand(join(...Array.from({ length: 10 }, (_, k) => line(starPoint(k), starPoint(k + 1)))), 3.6, PALETTES.gaude)

/** Fermer, Annuler : deux brins croisés. */
export function CloseIcon(props: IconProps) {
  return (
    <Icon name="close" {...props}>
      {() => (
        <>
          <Strand s={CLOSE_A} />
          <Strand s={CLOSE_B} />
        </>
      )}
    </Icon>
  )
}

/** PDF du patron : une feuille au coin plié, des mailles dessus. */
export function PdfIcon(props: IconProps) {
  return (
    <Icon name="pdf" {...props}>
      {() => (
        <>
          <path d="M14 6 H40 L52 18 V58 H14 Z" fill="#f4ead8" stroke={WOOD[2]} strokeWidth={2} strokeLinejoin="round" />
          <path d="M40 6 V18 H52" fill="#e6d7bc" stroke={WOOD[2]} strokeWidth={2} strokeLinejoin="round" />
          {[0, 1, 2].map((c) => (
            <V key={c} cx={22 + c * 8} top={22} w={6.5} h={8} col={c % 2 ? '#de7a5c' : '#c4553a'} edge="#7a2a1c" />
          ))}
          {[38, 44, 50].map((y) => (
            <path key={y} d={`M20 ${y} H${y === 50 ? 36 : 46}`} stroke="#a88a6a" strokeWidth={2} strokeLinecap="round" />
          ))}
        </>
      )}
    </Icon>
  )
}

/** Organiser, Déplacer : trois rangs de fil, celui du milieu poussé d'un cran. */
export function OrganizeIcon(props: IconProps) {
  return (
    <Icon name="organize" {...props}>
      {() => (
        <>
          <Strand s={ORG_1} />
          <Strand s={ORG_2} />
          <Strand s={ORG_3} />
          <path d="M6 26 L12 32 L6 38" stroke={PALETTES.gaude[4]} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </Icon>
  )
}

/** Nouvelle étape à partir d'ici : un tricot séparé en deux par un pointillé. */
export function SplitIcon(props: IconProps) {
  return (
    <Icon name="split" {...props}>
      {() => (
        <>
          <rect x={10} y={6} width={44} height={22} rx={3} fill={PALETTES.indigo[0]} />
          <rect x={10} y={36} width={44} height={22} rx={3} fill={PALETTES.sauge[0]} />
          {[0, 1].map((r) =>
            [0, 1, 2, 3, 4].map((c) => <V key={`a${r}${c}`} cx={15 + c * 8.5} top={7 + r * 10} w={6.5} h={9} col={PALETTES.indigo[2 + ((r + c) % 2)]!} edge={PALETTES.indigo[4]} />),
          )}
          {[0, 1].map((r) =>
            [0, 1, 2, 3, 4].map((c) => <V key={`b${r}${c}`} cx={15 + c * 8.5} top={37 + r * 10} w={6.5} h={9} col={PALETTES.sauge[2 + ((r + c) % 2)]!} edge={PALETTES.sauge[4]} />),
          )}
          <path d="M3 32 H61" stroke="#a33a26" strokeWidth={2.6} strokeDasharray="5 4" strokeLinecap="round" />
        </>
      )}
    </Icon>
  )
}

/** Regrouper : deux fils qui se nouent. */
export function JoinIcon(props: IconProps) {
  return (
    <Icon name="join" {...props}>
      {() => (
        <>
          <Strand s={JOIN_A} />
          <Strand s={JOIN_B} />
          <circle cx={32} cy={32} r={7.5} fill={PALETTES.gaude[2]} stroke={PALETTES.gaude[4]} strokeWidth={1.6} />
          <path d="M27 29 Q32 37 37 29" stroke={PALETTES.gaude[4]} strokeWidth={1.6} strokeLinecap="round" />
        </>
      )}
    </Icon>
  )
}

/** Une question : une étiquette de laine (comme celle d'une pelote) et un « ? » imprimé (choisie le 2026-11-15). */
export function QuestionIcon(props: IconProps) {
  return (
    <Icon name="question" {...props}>
      {() => (
        <>
          <path d="M14 10 H50 L56 16 V48 L50 54 H14 L8 48 V16 Z" fill="#f4ead8" stroke={WOOD[2]} strokeWidth={2} strokeLinejoin="round" />
          <circle cx={16} cy={32} r={3} stroke={WOOD[2]} strokeWidth={1.6} />
          <path d="M14 32 L2 22" stroke={PALETTES.garance[2]} strokeWidth={2} strokeLinecap="round" />
          <text x={36} y={44} textAnchor="middle" fontSize={30} fontWeight={800} fill={PALETTES.indigo[1]} fontFamily="Fraunces, Georgia, serif">
            ?
          </text>
        </>
      )}
    </Icon>
  )
}

/** Traduire : une bulle « FR » et une pastille « EN ». */
export function TranslateIcon(props: IconProps) {
  return (
    <Icon name="translate" {...props}>
      {() => (
        <>
          <path d="M6 8 H50 V40 H22 L12 50 V40 H6 Z" fill="#f4ead8" stroke={WOOD[2]} strokeWidth={2} strokeLinejoin="round" />
          <text x={28} y={31} textAnchor="middle" fontSize={17} fontWeight={700} fill={PALETTES.indigo[1]} fontFamily="system-ui, sans-serif">
            FR
          </text>
          <circle cx={50} cy={50} r={11} fill={PALETTES.garance[2]} stroke={PALETTES.garance[4]} strokeWidth={1.4} />
          <text x={50} y={54} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff" fontFamily="system-ui, sans-serif">
            EN
          </text>
        </>
      )}
    </Icon>
  )
}

/** Corriger le surlignage : un surligneur jaune gaude et son trait. */
export function HighlightIcon(props: IconProps) {
  return (
    <Icon name="highlight" {...props}>
      {() => (
        <>
          <path d="M8 54 H40" stroke={PALETTES.gaude[2]} strokeWidth={9} strokeLinecap="round" opacity={0.75} />
          <g transform="rotate(40 38 26)">
            <rect x={30} y={2} width={16} height={34} rx={3} fill={PALETTES.gaude[1]} stroke={PALETTES.gaude[4]} strokeWidth={1.6} />
            <rect x={30} y={2} width={16} height={10} rx={3} fill="#3a3530" />
            <path d="M32 36 H44 L41 45 H35 Z" fill={PALETTES.gaude[3]} stroke={PALETTES.gaude[4]} strokeWidth={1.4} strokeLinejoin="round" />
          </g>
        </>
      )}
    </Icon>
  )
}

/** Recadrer : deux équerres en bois autour d'une grille. */
export function CropIcon(props: IconProps) {
  return (
    <Icon name="crop" {...props}>
      {() => (
        <>
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={19 + c * 9} y={19 + r * 9} width={9} height={9} fill={(r + c) % 2 ? '#3f4fa0' : '#f4ead8'} stroke={WOOD[2]} strokeWidth={0.8} />),
          )}
          <path d="M14 4 V50 H60" stroke={WOOD[2]} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 4 V50 H60" stroke={WOOD[0]} strokeWidth={4.6} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 14 H50 V60" stroke={WOOD[2]} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 14 H50 V60" stroke={WOOD[1]} strokeWidth={4.6} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </Icon>
  )
}

/** Mettre en couverture : une étoile en fil gaude. */
export function StarIcon(props: IconProps) {
  return <Icon name="star" {...props}>{() => <Strand s={STAR} />}</Icon>
}

/** Aiguille : deux aiguilles en bois croisées. */
export function NeedlesIcon(props: IconProps) {
  return (
    <Icon name="needles" {...props}>
      {() => (
        <>
          <Needle from={[8, 10]} to={[54, 56]} w={4.6} />
          <Needle from={[56, 10]} to={[10, 56]} w={4.6} />
        </>
      )}
    </Icon>
  )
}

/** Sous-étapes : trois pelotes alignées, chacune sa ligne. */
export function StepsIcon(props: IconProps) {
  const pals = [PALETTES.indigo, PALETTES.gaude, PALETTES.garance]
  return (
    <Icon name="steps" {...props}>
      {(id) => (
        <>
          {pals.map((pal, i) => (
            <g key={i}>
              <Ball id={`${id}${i}`} cx={12} cy={12 + i * 20} r={8} pal={pal} seed={3 + i} />
              <path d={`M26 ${12 + i * 20} H${i === 2 ? 46 : 58}`} stroke="#a88a6a" strokeWidth={3} strokeLinecap="round" />
            </g>
          ))}
        </>
      )}
    </Icon>
  )
}

/** Notes : un carnet à spirale et son marque-page. */
export function NotesIcon(props: IconProps) {
  return (
    <Icon name="notes" {...props}>
      {() => (
        <>
          <rect x={12} y={6} width={40} height={52} rx={4} fill="#f4ead8" stroke={WOOD[2]} strokeWidth={2} />
          {[14, 24, 34, 44].map((y) => (
            <circle key={y} cx={12} cy={y} r={3} stroke="#6b6f78" strokeWidth={2} />
          ))}
          {[20, 28, 36, 44].map((y) => (
            <path key={y} d={`M20 ${y} H${y === 44 ? 34 : 40}`} stroke="#a88a6a" strokeWidth={2} strokeLinecap="round" />
          ))}
          <path d="M42 6 V24 L46 20 L50 24 V6" fill={PALETTES.garance[2]} stroke={PALETTES.garance[4]} strokeWidth={1.2} strokeLinejoin="round" />
        </>
      )}
    </Icon>
  )
}

/** Assez de laine ? : une balance de cuisine, une pelote dessus. */
export function ScaleIcon(props: IconProps) {
  return (
    <Icon name="scale" {...props}>
      {(id) => (
        <>
          <Ball id={id} cx={32} cy={20} r={14} pal={PALETTES.sauge} seed={7} />
          <path d="M10 36 H54" stroke="#6b6f78" strokeWidth={4} strokeLinecap="round" />
          <path d="M14 40 H50 L46 58 H18 Z" fill="#d9d4cc" stroke="#6b6f78" strokeWidth={2} strokeLinejoin="round" />
          <rect x={23} y={45} width={18} height={8} rx={1.5} fill="#2f412c" />
          <text x={32} y={51.5} textAnchor="middle" fontSize={6.5} fill="#aac2a5" fontFamily="monospace">
            50g
          </text>
        </>
      )}
    </Icon>
  )
}
