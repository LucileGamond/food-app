import { describePhoto, formatPhotoDate, type ProgressPhoto } from './progress'

const PHOTO: ProgressPhoto = { id: 'ph1', storagePath: 'u-lucile/ph1.jpg', caption: '', stepId: 's1', takenAt: '2026-11-08T10:00:00Z' }

describe('photos d’avancement', () => {
  it('décrit une photo : étape et date', () => {
    expect(formatPhotoDate('2026-11-08T10:00:00Z')).toBe('8 nov. 2026')
    expect(describePhoto(PHOTO, (id) => (id === 's1' ? 'Dos – côtes' : undefined))).toBe('Dos – côtes · 8 nov. 2026')
  })

  it('sans étape (ou étape supprimée) : la date seule', () => {
    expect(describePhoto({ ...PHOTO, stepId: null }, () => 'x')).toBe('8 nov. 2026')
    expect(describePhoto(PHOTO, () => undefined)).toBe('8 nov. 2026')
  })
})
