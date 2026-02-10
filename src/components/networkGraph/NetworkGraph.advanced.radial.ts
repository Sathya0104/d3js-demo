/**
 * Advanced radial layout for NetworkGraph.
 *
 * Features:
 * - Level 1 nodes can be arranged in rectangular rings.
 * - Children of level 1 nodes are placed "outside" the rectangle perimeter.
 * - Expandable nodes are arranged radially, non-expandable nodes are combed tangentially.
 * - Avoids jitter by stable sorting of nodes.
 * - Customizable node box size for overlap avoidance.
 * - Optional function to determine if a node is expandable.
 * - Configurable parameters for fine-tuning the layout.
 * - Maintains compatibility with existing radial layout.
 */
import type {NetworkEdge, NetworkNode} from "./types/ComponentsType"
import {clamp, computeRadialLayout, computeTreeLevels, degToRad, type NodePos} from "./NetworkGraph.utils"
import {computeRadialLayoutDynamic} from "./NetworkGraph.dynamic.radial";
const RING_U_OFFSET = 0.015

export function pointOnRectPerimeter(u: number, halfW: number, halfH: number): NodePos {
  // u in [0,1)
  const W = halfW * 2
  const H = halfH * 2
  const perim = 2 * (W + H)
  let d = (u - Math.floor(u)) * perim // normalize

  // start from (halfW, 0) and go clockwise:
  // right edge down, bottom left, left up, top right
  // Segment 1: right edge (x=+halfW), y: -halfH..+halfH
  if (d <= H) {
    const y = -halfH + d
    return { x: halfW, y }
  }
  d -= H

  // Segment 2: bottom edge (y=+halfH), x: +halfW..-halfW
  if (d <= W) {
    const x = halfW - d
    return { x, y: halfH }
  }
  d -= W

  // Segment 3: left edge (x=-halfW), y: +halfH..-halfH
  if (d <= H) {
    const y = halfH - d
    return { x: -halfW, y }
  }
  d -= H

  // Segment 4: top edge (y=-halfH), x: -halfW..+halfW
  const x = -halfW + d
  return { x, y: -halfH }
}

function rectOutwardNormal(p: NodePos, halfW: number, halfH: number): { nx: number; ny: number; tx: number; ty: number } {
  // find the closest side of the rectangle: it defines the outward normal
  const dx = halfW - Math.abs(p.x)
  const dy = halfH - Math.abs(p.y)

  // if we are closer to the vertical sides => horizontal normal, vertical tangent
  if (dx < dy) {
    const nx = p.x >= 0 ? 1 : -1
    return { nx, ny: 0, tx: 0, ty: 1 }
  }

  // else horizontal side => vertical normal, horizontal tangent
  const ny = p.y >= 0 ? 1 : -1
  return { nx: 0, ny, tx: 1, ty: 0 }
}


export function computeRadialLayoutAdvanced(params: {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  centerKey: string
  maxDepth: 1 | 2 | 3 | 4 |5 | 6 |7
  radii: Record<1 | 2 | 3 | 4 |5 | 6 |7, number>
  childSpreadDeg: number

  nodeBox?: { w: number; h: number; pad?: number }
  level1Layout?: {
    type: "circle" | "rectRings"
    // only for rectRings:
    halfW?: number
    halfH?: number
    outerRatio?: number      // fraction of lvl1 nodes in outer ring
    innerScale?: number      // scale applied to inner ring (e.g. 0.72)
  }
  // optional function to decide if a node can be expanded further
  isExpandable?: (node: NetworkNode) => boolean
}): Map<string, NodePos> {
  const { nodes, edges, centerKey, maxDepth, radii, childSpreadDeg } = params

  const isExpandable    = params.isExpandable ?? (() => false)
  const nodeByKey       = new Map(nodes.map(n => [n.key, n]))
  const levels          = computeTreeLevels(nodes, edges, centerKey, maxDepth)
  const positions       = new Map<string, NodePos>()
  positions.set(centerKey, { x: 0, y: 0 })

  const byDepth: Record<number, string[]> = { 0: [], 1: [], 2: [], 3: [] , 4:[] ,5:[],6:[],7:[] }
  for (const n of nodes) {
    const info = levels.get(n.key)
    if (!info) continue
    byDepth[info.depth].push(n.key)
  }

  // Depth 1: uniform distribution.
  // Depth 1
  const lvl1 = byDepth[1]
  // avoid jitter by sorting alphabetically
  lvl1.sort((a, b) => a.localeCompare(b))

  const expandableLvl1: string[] = []
  const nonExpandableLvl1: string[] = []

  for (const k of lvl1) {
    const n = nodeByKey.get(k)
    if (n && isExpandable(n)) expandableLvl1.push(k)
    else nonExpandableLvl1.push(k)
  }

  const l1 = params.level1Layout ?? { type: "circle" as const }

  if (l1.type === "rectRings") {
    const halfW = Math.max(120, l1.halfW ?? radii[1])
    const halfH = Math.max(120, l1.halfH ?? radii[1])
    const outerRatio = clamp(l1.outerRatio ?? 0.55, 0.05, 0.95)
    const innerScale = clamp(l1.innerScale ?? 0.72, 0.2, 0.98)

    // outer ring = ALL expandable + quota di nonExpandable fino a outerCount
    const outerCount = Math.max(1, Math.round(lvl1.length * outerRatio))
    const outerKeys = expandableLvl1.slice()
    for (const k of nonExpandableLvl1) {
      if (outerKeys.length >= outerCount) break
      outerKeys.push(k)
    }
    const outerSet = new Set(outerKeys)
    const innerKeys = lvl1.filter(k => !outerSet.has(k))

    // Outer ring: points on the rectangle perimeter
    for (let i = 0; i < outerKeys.length; i++) {
      const uBase = i / Math.max(1, outerKeys.length)
      // apply ring offset to avoid overlap with inner ring
      const u = uBase + RING_U_OFFSET * 1
      const p = pointOnRectPerimeter(u, halfW, halfH)
      positions.set(outerKeys[i], p)
    }

    // Inner ring (ringIndex = 0)
    for (let i = 0; i < innerKeys.length; i++) {
      const uBase = i / Math.max(1, innerKeys.length)
      const u = uBase + RING_U_OFFSET * 0
      const p = pointOnRectPerimeter(u, halfW, halfH)
      positions.set(innerKeys[i], {
        x: p.x * innerScale,
        y: p.y * innerScale
      })
    }
  } else {
    // circle (current behavior)
    for (let i = 0; i < lvl1.length; i++) {
      const a = (i / Math.max(1, lvl1.length)) * Math.PI * 2
      positions.set(lvl1[i], { x: Math.cos(a) * radii[1], y: Math.sin(a) * radii[1] })
    }
  }

  // Children grouped by parent.
  const childrenByParent = new Map<string, string[]>()
  for (const [k, info] of levels.entries()) {
    if (!info.parent) continue
    if (!childrenByParent.has(info.parent)) childrenByParent.set(info.parent, [])
    childrenByParent.get(info.parent)!.push(k)
  }
  // avoid jitter by sorting children alphabetically
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => a.localeCompare(b))
  }

  // Depth >= 2: placed around the parent on an arc.
  for (const depth of [6, 7] as const) {  //changed 
    if (depth > maxDepth) continue
    const keys = byDepth[depth]
    for (const key of keys) {
      const info = levels.get(key)
      if (!info?.parent) continue

      const parentKey = info.parent
      const parentPos = positions.get(parentKey) || { x: 0, y: 0 }

      // const parentAngle = Math.atan2(parentPos.y, parentPos.x)
      // const siblings = childrenByParent.get(parentKey) || [key]
      // const idx = siblings.indexOf(key)
      //
      // const spread = degToRad(childSpreadDeg)
      // const t = siblings.length === 1 ? 0 : idx / (siblings.length - 1)
      // const angle = parentAngle - spread / 2 + t * spread
      //
      // positions.set(key, {
      //   x: parentPos.x + Math.cos(angle) * radii[depth],
      //   y: parentPos.y + Math.sin(angle) * radii[depth],
      // })

      const spread    = degToRad(childSpreadDeg)
      const siblings  = childrenByParent.get(parentKey) || [key]
      const idx       = siblings.indexOf(key)
      const t         = siblings.length === 1 ? 0 : idx / (siblings.length - 1)
      const offset    = (t - 0.5) // [-0.5, +0.5]

      // if lvl1 is rectRings, push children "outside" the rectangle perimeter
      if (params.level1Layout?.type === "rectRings") {
        const halfW = Math.max(120, params.level1Layout.halfW ?? radii[1])
        const halfH = Math.max(120, params.level1Layout.halfH ?? radii[1])

        const { nx, ny, tx, ty } = rectOutwardNormal(parentPos, halfW, halfH)

        // min distance to avoid overlap
        const boxW = params.nodeBox?.w ?? 120
        const boxH = params.nodeBox?.h ?? 60
        const pad  = params.nodeBox?.pad ?? 10
        const minSep = Math.max(boxW, boxH) + pad

        const parentNode = nodeByKey.get(parentKey)
        const parentIsExpandable = !!parentNode && isExpandable(parentNode)

        // distance from parent to place children
        const outwardBase = Math.max(radii[depth], minSep * 1.1)

        if (parentIsExpandable) {
          // radial layout for expandable parents
          const baseAngle = Math.atan2(ny, nx) // outward direction
          const spread = Math.min(degToRad(140), Math.max(degToRad(childSpreadDeg), (siblings.length - 1) * (minSep / outwardBase)))
          const angle = baseAngle - spread / 2 + t * spread

          positions.set(key, {
            x: parentPos.x + Math.cos(angle) * outwardBase,
            y: parentPos.y + Math.sin(angle) * outwardBase,
          })
        } else {
          // not expandable: keep your combed outward+tangent
          const tangentGap = minSep
          positions.set(key, {
            x: parentPos.x + nx * outwardBase + tx * offset * tangentGap,
            y: parentPos.y + ny * outwardBase + ty * offset * tangentGap,
          })
        }
      } else {
        // fallback circle: current behavior
        const parentAngle = Math.atan2(parentPos.y, parentPos.x)
        const angle = parentAngle - spread / 2 + t * spread

        positions.set(key, {
          x: parentPos.x + Math.cos(angle) * radii[depth],
          y: parentPos.y + Math.sin(angle) * radii[depth],
        })
      }
    }
  }

  return positions
}

/**
 * Adaptive radial layout:
 * - if level 1 nodes < threshold => simple radial layout
 * - else advanced radial layout
 */
export function computeRadialLayoutAdaptive(params: {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  centerKey: string
  maxDepth: 1 | 2 | 3 | 4 |5 | 6 |7
  radii: Record<1 | 2 | 3 | 4 |5 | 6 |7, number>
  childSpreadDeg: number
  // if lvl1 nodes < soglia => simple layout
  // else advanced layout
  rectRingsMinLvl1?: number,
  level1Layout?: {
    type: "circle" | "rectRings"
    halfW?: number
    halfH?: number
    outerRatio?: number
    innerScale?: number
  }
  isExpandable?: (node: NetworkNode) => boolean
  nodeBox?: { w: number; h: number; pad?: number }
}) {
  const rectRingsMinLvl1 = params.rectRingsMinLvl1 ?? 80

  // count lvl1 nodes robustly using computeTreeLevels (so it doesn't depend on edge fields)
  const levels = computeTreeLevels(params.nodes, params.edges, params.centerKey, 1)
  let lvl1Count = 0
  for (const info of levels.values()) if (info.depth === 1) lvl1Count++

  if (lvl1Count < rectRingsMinLvl1) {
    // simple layout
    return computeRadialLayout({
      nodes: params.nodes,
      edges: params.edges,
      centerKey: params.centerKey,
      maxDepth: params.maxDepth,
      radii: params.radii,
      childSpreadDeg: params.childSpreadDeg,
    })

    // return computeRadialLayoutDynamic({
    //   nodes: params.nodes,
    //   edges: params.edges,
    //   centerKey: params.centerKey,
    //   maxDepth: params.maxDepth,
    //   baseRadii: params.radii,
    //   maxDepth: params.maxDepth,
    // })
  }

  // advanced layout
  console.log(`computeRadialLayoutAdaptive: using advanced layout for lvl1Count=${lvl1Count}`)

  return computeRadialLayoutAdvanced(params)
}


