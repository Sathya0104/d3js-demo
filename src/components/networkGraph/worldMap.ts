import { feature } from "topojson-client"

/**
 * TopoJSON URL for world countries at 110m resolution.
 *
 * NOTE: Take in cosideration also other resolutions (50m, 10m) if needed.
 *
 * TODO: We need to evaluate to have a good balance between detail and file size.
 *      110m is quite small (~170KB) but with low detail.
 */
export const WORLD_ATLAS_COUNTRIES_110M =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

// We can use also other resolutions if needed:
// export const WORLD_ATLAS_COUNTRIES_50M =
//   "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"
// export const WORLD_ATLAS_COUNTRIES_10M =
//   "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-10m.json"

// or land-110m.json
// for only land masses without country borders
// export const WORLD_ATLAS_LAND_110M =
//   "https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json"

export async function loadWorldCountriesGeoJson(): Promise<any> {

  const topo = await fetch(WORLD_ATLAS_COUNTRIES_110M).then(r => r.json())

  // world-atlas exports countries under topo.objects.countries
  const geo = feature(topo, topo.objects.countries)

  // geo is a GeoJSON FeatureCollection
  return geo
}
