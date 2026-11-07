// Pages d'un PDF rendues en images dans le navigateur (pdf.js), par exemple pour en tirer le diagramme d'un patron.
// pdf.js (≈ 1 Mo avec son worker) n'est chargé qu'à la première ouverture d'un PDF.

/** PDF ouvert : nombre de pages, rendu d'une page, et fermeture (libère le worker). */
export interface OpenedPdf {
  pageCount: number
  /** Page (1 = première) en JPEG, son côté long réduit ou agrandi à `longSide` pixels. */
  renderPage: (page: number, longSide: number) => Promise<File>
  close: () => Promise<void>
}

/** Échelle de rendu pour que le côté long de la page fasse `longSide` pixels (bornée : une page géante reste lisible). */
export function renderScale(page: { width: number; height: number }, longSide: number): number {
  const side = Math.max(page.width, page.height)
  return side > 0 ? Math.min(Math.max(longSide / side, 0.1), 8) : 1
}

export async function openPdf(data: Blob): Promise<OpenedPdf> {
  const [pdfjs, { default: workerUrl }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ data: new Uint8Array(await data.arrayBuffer()) })
  const doc = await task.promise
  return {
    pageCount: doc.numPages,
    async renderPage(number, longSide) {
      const page = await doc.getPage(number)
      try {
        const viewport = page.getViewport({ scale: renderScale(page.getViewport({ scale: 1 }), longSide) })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        // Fond blanc : les pages sans fond deviendraient noires en JPEG.
        await page.render({ canvas, viewport, background: '#ffffff' }).promise
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
        if (!blob) throw new Error('Rendu de la page impossible.')
        return new File([blob], `page-${number}.jpg`, { type: 'image/jpeg' })
      } finally {
        page.cleanup()
      }
    },
    close: () => task.destroy(),
  }
}
