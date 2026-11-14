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
