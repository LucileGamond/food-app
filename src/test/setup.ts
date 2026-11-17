import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Pages chargées à la demande et machine chargée (CI, 9 copies de travail qui partagent la machine) : 5 s pour qu'un
// élément apparaisse, bien en dessous des 10 s d'un test.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
})

// jsdom ne fournit pas ces API du navigateur, utilisées par les composants.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:preview'
  URL.revokeObjectURL = () => undefined
}
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as MediaQueryList
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined
// Onglets (base-ui) : capture du pointeur, absente de jsdom.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.hasPointerCapture = () => false
}
