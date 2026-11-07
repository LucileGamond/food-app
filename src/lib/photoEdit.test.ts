import { cropFromDrag, FULL_CROP, isFullCrop, isUnchanged, rotateCrop, turn } from './photoEdit'

describe('retouche de photo', () => {
  it('tourne d’un quart de tour dans les deux sens', () => {
    expect(turn(0, 1)).toBe(90)
    expect(turn(270, 1)).toBe(0)
    expect(turn(0, -1)).toBe(270)
    expect(turn(180, -1)).toBe(90)
  })

  it('trace un cadre du doigt dans n’importe quel sens, borné à l’image ; un simple toucher ne recadre pas', () => {
    expect(cropFromDrag({ x: 0.8, y: 0.9 }, { x: 0.2, y: 0.1 })).toEqual({ left: 0.2, top: 0.1, right: 0.8, bottom: 0.9 })
    expect(cropFromDrag({ x: -0.5, y: 0.5 }, { x: 1.4, y: 2 })).toEqual({ left: 0, top: 0.5, right: 1, bottom: 1 })
    expect(cropFromDrag({ x: 0.5, y: 0.5 }, { x: 0.52, y: 0.9 })).toBeNull()
  })

  it('le cadre suit l’image tournée, et revient à sa place après un tour complet', () => {
    const crop = { left: 0.1, top: 0.2, right: 0.5, bottom: 0.6 }
    // Coin haut gauche → coin haut droit après un quart de tour à droite.
    expect(rotateCrop(crop, 1)).toEqual({ left: 0.4, top: 0.1, right: 0.8, bottom: 0.5 })
    const close = (a: typeof crop, b: typeof crop) => (['left', 'top', 'right', 'bottom'] as const).forEach((k) => expect(a[k]).toBeCloseTo(b[k]))
    close(rotateCrop(rotateCrop(crop, 1), -1), crop)
    close([1, 1, 1, 1].reduce((c) => rotateCrop(c, 1), crop), crop)
  })

  it('sait quand il n’y a rien à changer', () => {
    expect(isFullCrop(FULL_CROP)).toBe(true)
    expect(isUnchanged(0, FULL_CROP)).toBe(true)
    expect(isUnchanged(90, FULL_CROP)).toBe(false)
    expect(isUnchanged(0, { ...FULL_CROP, left: 0.1 })).toBe(false)
  })
})
