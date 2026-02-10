/**
 * Radial layout with dynamic child radius to avoid overlaps
 *
 * - Radius grows when children do not fit on the circumference
 * - Deterministic (no force simulation)
 * - Per-subtree adjustment
 */

import type { NetworkNode, NetworkEdge } from "./types/ComponentsType"
import type { NodePos } from "./NetworkGraph.utils"
import { NODE_BOX_WIDTH, NODE_BOX_HEIGHT } from "./Constants"

/* ---------------- Helpers ---------------- */

/**
 * Compute a radius large enough to fit N nodes
 * on a circumference without overlap
 */
function computeChildRadius(
  baseRadius: number,
  childCount: number,
  nodeBoxSize: number,
  padding = 12
): number {
  if (childCount <= 1) return baseRadius

  const neededCircumference = childCount * (nodeBoxSize + padding)
  const neededRadius = neededCircumference / (2 * Math.PI)

  return Math.max(baseRadius, neededRadius)
}

/**
 * Build adjacency list (parent -> children)
 * Direction is inferred from edges.from -> edges.to
 */
function buildChildrenMap(edges: NetworkEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>()

  edges.forEach(e => {
    if (!map.has(e.from)) map.set(e.from, [])
    map.get(e.from)!.push(e.to)
  })

  return map
}

/* ---------------- Layout ---------------- */

interface ComputeRadialLayoutParams {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  centerKey: string
  baseRadii: Record<number, number>
  maxDepth: number
}

export function computeRadialLayoutDynamic({
  nodes,
  edges,
  centerKey,
  baseRadii,
  maxDepth,
}: ComputeRadialLayoutParams): Map<string, NodePos> {

  const positions = new Map<string, NodePos>()
  const childrenMap = buildChildrenMap(edges)

  const nodeByKey = new Map(nodes.map(n => [n.key, n]))

  /* ---------- CENTER ---------- */

  positions.set(centerKey, { x: 0, y: 0 })

  /* ---------- DFS LAYOUT ---------- */

  function layoutSubtree(
    parentKey: string,
    level: number,
    parentAngle: number,
    parentRadius: number
  ) {
    if (level > maxDepth) return

    const children = childrenMap.get(parentKey) ?? []
    if (children.length === 0) return

    const baseRadius = baseRadii[level] ?? parentRadius
    const effectiveRadius = computeChildRadius(
      baseRadius,
      children.length,
      Math.max(NODE_BOX_WIDTH, NODE_BOX_HEIGHT)
    )

    const angleStep = (2 * Math.PI) / children.length
    const startAngle = parentAngle - Math.PI

    children.forEach((childKey, index) => {
      const angle = startAngle + index * angleStep

      const parentPos = positions.get(parentKey)!
      const x = parentPos.x + Math.cos(angle) * effectiveRadius
      const y = parentPos.y + Math.sin(angle) * effectiveRadius

      positions.set(childKey, { x, y })

      layoutSubtree(childKey, level + 1, angle, effectiveRadius)
    })
  }

  /* ---------- START ---------- */

  layoutSubtree(
    centerKey,
    1,
    0,
    baseRadii[1]
  )

  return positions
}
