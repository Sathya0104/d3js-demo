/**
 * @description A container hooks.
 * First draft in October 2025
 * Author Enrico Tedeschini
 */
import {useLayoutEffect, useEffect, useState} from "react"
import { loadWorldCountriesGeoJson }          from "./worldMap"


/** Hook to observe size changes of a DOM element using ResizeObserver API
 *  this allow to have a reactive width/height values without polling
 *  the element size.
 * */
export function useResizeObserver<T extends Element>(ref: React.RefObject<T>) {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr) return

      // Avoid pointless re-renders
      setSize((prev) => {
        const w = Math.round(cr.width)
        const h = Math.round(cr.height)
        if (prev.width === w && prev.height === h) return prev
        return { width: w, height: h }
      })
    })

    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return size
}

/** Hook to load world map GeoJSON data */
export function useWorldMap() {
  const [geoJson, setGeoJson] = useState<any>(null)

  useEffect(() => {
    loadWorldCountriesGeoJson().then(setGeoJson)
  }, [])

  return { geoJson }
}
