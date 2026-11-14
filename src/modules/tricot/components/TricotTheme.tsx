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
 * Couleur de la laine du projet (sa première couleur) : remplace l'indigo du module le temps de la page. Le CSS en tire
 * une teinte assez sombre (ou claire en mode sombre) pour garder le texte blanc lisible sur les boutons.
 */
export function useYarnHue(hues: string[]) {
  const hue = hues[0] ?? null
  useEffect(() => {
    if (!hue) return
    const root = document.documentElement
    root.style.setProperty('--yarn', hue)
    root.dataset.yarn = ''
    return () => {
      root.style.removeProperty('--yarn')
      delete root.dataset.yarn
    }
  }, [hue])
}
