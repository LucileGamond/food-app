import {
  initialScanState,
  motion,
  nextScanState,
  registerCapture,
  samePageInView,
  SCAN_CONFIG,
  sharpness,
  signature,
  signatureDistance,
  toGray,
  type GrayFrame,
  type ScanState,
} from './pageScan'

const W = 160
const H = 120

/** Page de livre simulée : fond clair, lignes de « texte » sombres placées selon la graine. */
function page(seed: number, light = 1): GrayFrame {
  const data = new Uint8Array(W * H).fill(Math.round(235 * light))
  let s = seed
  const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  for (let line = 8; line < H - 8; line += 7) {
    let x = 6 + Math.floor(rand() * 10)
    while (x < W - 12) {
      const word = 4 + Math.floor(rand() * 14)
      for (let y = line; y < line + 3; y++) for (let dx = 0; dx < word && x + dx < W - 6; dx++) data[y * W + x + dx] = Math.round(30 * light)
      x += word + 3
    }
  }
  // Grand titre, différent d'une page à l'autre : l'empreinte change franchement.
  const top = 10 + Math.floor(rand() * 60)
  const left = 10 + Math.floor(rand() * 80)
  for (let y = top; y < top + 20; y++) for (let x = left; x < left + 50; x++) data[y * W + x] = Math.round(20 * light)
  return { width: W, height: H, data }
}

/** Flou (moyenne 5×5) : mise au point pas faite. */
function blur(frame: GrayFrame, radius = 2): GrayFrame {
  const data = new Uint8Array(frame.data.length)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let total = 0
      let n = 0
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const yy = y + dy
          const xx = x + dx
          if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue
          total += frame.data[yy * W + xx]!
          n++
        }
      }
      data[y * W + x] = Math.round(total / n)
    }
  }
  return { ...frame, data }
}

/** Page décalée de quelques pixels : le téléphone ou la page bouge. */
function shift(frame: GrayFrame, dx: number): GrayFrame {
  const data = new Uint8Array(frame.data.length).fill(235)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x - dx >= 0 && x - dx < W) data[y * W + x] = frame.data[y * W + x - dx]!
  return { ...frame, data }
}

/** Fait défiler des images (8 par seconde) et renvoie les instants des photos prises. */
/** Délai d'immobilité court dans la plupart des tests (moins d'images à faire défiler). */
const FAST = { ...SCAN_CONFIG, stillMs: 600 }

function run(frames: GrayFrame[], start: ScanState = initialScanState(), t0 = 0, config = FAST) {
  let state = start
  const captures: number[] = []
  const hints: string[] = []
  frames.forEach((frame, i) => {
    const now = t0 + i * 125
    const step = nextScanState(state, frame, now, config)
    state = step.state
    hints.push(step.hint)
    if (step.capture) captures.push(now)
  })
  return { state, captures, hints }
}

const repeat = (frame: GrayFrame, n: number) => Array.from({ length: n }, () => frame)
/** Page qu'on tourne : grands décalages successifs, puis la nouvelle page. */
const turning = (from: GrayFrame, to: GrayFrame) => [shift(from, 20), shift(from, 45), shift(to, -40), shift(to, -15)]

describe('mesures', () => {
  it('convertit une image RGBA en gris', () => {
    const gray = toGray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255], 3, 1)
    expect([...gray.data]).toEqual([255, 0, 76])
  })

  it('trouve une page nette plus nette que la même page floue', () => {
    expect(sharpness(page(1))).toBeGreaterThan(SCAN_CONFIG.minSharpness * 10)
    expect(sharpness(blur(page(1)))).toBeLessThan(sharpness(page(1)) * SCAN_CONFIG.relativeSharpness)
    expect(sharpness({ width: 2, height: 2, data: new Uint8Array(4) })).toBe(0)
  })

  it('mesure le mouvement entre deux images', () => {
    expect(motion(page(1), page(1))).toBe(0)
    expect(motion(page(1), shift(page(1), 20))).toBeGreaterThan(SCAN_CONFIG.turnMotion)
    expect(motion(page(1), { width: 10, height: 10, data: new Uint8Array(100) })).toBe(Infinity)
  })

  it('reconnaît la même page malgré la lumière, et distingue une autre page', () => {
    expect(signatureDistance(signature(page(1)), signature(page(1, 0.8)))).toBeLessThan(0.1)
    expect(signatureDistance(signature(page(1)), signature(page(2)))).toBeGreaterThan(SCAN_CONFIG.newPage)
  })
})

describe('prise automatique', () => {
  it('prend la photo après 600 ms d’immobilité sur une page nette, une seule fois', () => {
    const { captures, hints } = run(repeat(page(1), 20))
    // 1re image : pas de comparaison possible (« moving ») ; la 6e est immobile depuis 625 ms.
    expect(captures).toEqual([750])
    expect(hints[1]).toBe('steadying')
    expect(hints.at(-1)).toBe('same-page')
  })

  it('réglage réel : 3 s d’immobilité avant la photo, le temps de retirer les mains', () => {
    const { captures } = run(repeat(page(1), 30), initialScanState(), 0, SCAN_CONFIG)
    expect(captures).toEqual([3125])
  })

  it('attend que le téléphone soit immobile', () => {
    const frames = [page(1), shift(page(1), 3), page(1), shift(page(1), 3), page(1), shift(page(1), 3), page(1)]
    const { captures, hints } = run(frames)
    expect(captures).toEqual([])
    expect(hints.slice(1).every((h) => h === 'moving')).toBe(true)
  })

  it('attend la mise au point : pas de photo tant que la page est floue', () => {
    // Page nette vue un instant (référence), puis floue et immobile : pas de photo ; la mise au point revient : photo.
    const frames = [page(1), shift(page(1), 30), ...repeat(blur(page(1)), 10), ...repeat(page(1), 8)]
    const { captures, hints } = run(frames)
    expect(hints[6]).toBe('blurry')
    expect(captures).toHaveLength(1)
    expect(captures[0]).toBeGreaterThanOrEqual(12 * 125)
  })

  it('reprend une photo quand la page a été tournée, pas avant', () => {
    const frames = [...repeat(page(1), 10), ...turning(page(1), page(2)), ...repeat(page(2), 10), ...turning(page(2), page(3)), ...repeat(page(3), 10)]
    const { captures } = run(frames)
    expect(captures).toHaveLength(3)
  })

  it('reprend une photo entre deux pages de même mise en page (titre au même endroit, autre texte)', () => {
    // Livre de cuisine : toutes les pages se ressemblent en 32×24 ; seule la page tournée doit compter.
    const templated = (seed: number): GrayFrame => {
      const data = new Uint8Array(W * H).fill(235)
      let s = seed
      const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
      for (let y = 10; y < 26; y++) for (let x = 10; x < 90; x++) data[y * W + x] = 20
      for (let line = 34; line < H - 8; line += 7) {
        let x = 6 + Math.floor(rand() * 10)
        while (x < W - 12) {
          const word = 4 + Math.floor(rand() * 14)
          for (let y = line; y < line + 3; y++) for (let dx = 0; dx < word && x + dx < W - 6; dx++) data[y * W + x + dx] = 30
          x += word + 3
        }
      }
      return { width: W, height: H, data }
    }
    const [a, b] = [templated(4), templated(5)]
    expect(signatureDistance(signature(a), signature(b))).toBeLessThan(0.35)
    const frames = [...repeat(a, 10), ...turning(a, b), ...repeat(b, 10)]
    expect(run(frames).captures).toHaveLength(2)
  })

  it('compte la page comme tournée quand la vue s’en éloigne franchement, même sans grand mouvement entre deux images', () => {
    const frames = [...repeat(page(1), 10), ...repeat(page(7), 3), ...repeat(page(2), 10)]
    expect(run(frames, initialScanState(), 0, { ...FAST, turnMotion: Infinity }).captures).toHaveLength(2)
  })

  it('ne reprend pas la même page après l’avoir bougée sans la tourner', () => {
    const frames = [...repeat(page(1), 10), shift(page(1), 30), shift(page(1), -30), ...repeat(page(1), 10)]
    expect(run(frames).captures).toHaveLength(1)
  })

  it('espace les photos d’au moins 1,5 s', () => {
    // Sans délai d'immobilité, une page changée aussitôt : la 2e photo attend 1,5 s après la 1re.
    const frames = [...repeat(page(1), 3), ...repeat(page(2), 14)]
    const { captures } = run(frames, initialScanState(), 0, { ...SCAN_CONFIG, stillMs: 0 })
    expect(captures).toEqual([125, 1625])
  })

  it('photo à la main : la page affichée compte comme prise', () => {
    let state = run(repeat(page(1), 2)).state
    expect(samePageInView(state)).toBe(false)
    state = registerCapture(state, page(1), 300)
    expect(samePageInView(state)).toBe(true)
    expect(run(repeat(page(1), 10), state, 400).captures).toEqual([])
    // Page tournée depuis : elle n'est plus devant la caméra.
    expect(samePageInView(run([shift(page(1), 40)], state, 400).state)).toBe(false)
    // Sans image analysée, l'empreinte précédente est gardée.
    expect(registerCapture(state, null, 500).lastSignature).toBe(state.lastSignature)
  })
})
