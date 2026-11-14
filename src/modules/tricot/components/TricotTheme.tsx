import { useEffect, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'

/**
 * Identité visuelle du module Tricot (« Teinturerie ») : pose `data-module="tricot"` sur <html> tant qu'une page du
 * module est affichée. Les couleurs (écru, indigo, gaude, garance, noix) et les titres en Fraunces viennent de
 * `index.css`, sous ce sélecteur ; le reste de l'app garde son thème.
 */
export function TricotTheme({ children }: { children?: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement
    root.dataset.module = 'tricot'
    return () => {
      if (root.dataset.module === 'tricot') delete root.dataset.module
    }
  }, [])
  return children ?? <Outlet />
}

/**
 * Couleurs de la laine du projet : la première remplace l'indigo du module le temps de la page, et chacune teinte un
 * brin du cordon (--yarn-1 à --yarn-3). Le CSS en tire
 * une teinte assez sombre (ou claire en mode sombre) pour garder le texte blanc lisible sur les boutons.
 */
export function useYarnHue(hues: string[]) {
  const key = hues.join(',')
  useEffect(() => {
    const all = key ? key.split(',') : []
    if (all.length === 0) return
    const root = document.documentElement
    root.style.setProperty('--yarn', all[0]!)
    // Brins du cordon (fil sous le titre, onglet actif, pastille de l'étape en cours) : une couleur par brin.
    all.forEach((hue, i) => root.style.setProperty(`--yarn-${i + 1}`, hue))
    root.dataset.yarn = ''
    return () => {
      root.style.removeProperty('--yarn')
      all.forEach((_, i) => root.style.removeProperty(`--yarn-${i + 1}`))
      delete root.dataset.yarn
    }
  }, [key])
}
