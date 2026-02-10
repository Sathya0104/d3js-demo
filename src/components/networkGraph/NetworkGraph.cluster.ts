// -------------------------------
// Clustering (group nearby nodes)
// -------------------------------

import type {NodePos} from "./NetworkGraph.utils"
import type {NetworkEdge, NetworkNode} from "./types/ComponentsType"
import {NODE_BOX_HEIGHT, NODE_BOX_WIDTH} from "./Constants"

export const CLUSTER_ZOOM_THRESHOLD = 0.9
export const CLUSTER_GRID_SIZE = 160 // world units (tweak)

export type ClusterBounds = { minX: number; minY: number; maxX: number; maxY: number }

export type ClusterGroup = {
  key: string
  members: string[]
  bounds: ClusterBounds
  center: NodePos
}

export function computeGridClusters(params: {
  nodes: NetworkNode[]
  positions: Map<string, NodePos>
  gridSize: number
}): { groups: ClusterGroup[]; nodeToGroup: Map<string, string>; groupPositions: Map<string, NodePos>; groupBounds: Map<string, ClusterBounds> } {
  const { nodes, positions, gridSize } = params

  const groupsMap = new Map<string, ClusterGroup>()
  const nodeToGroup = new Map<string, string>()

  const padX = NODE_BOX_WIDTH / 3
  const padY = NODE_BOX_HEIGHT / 3

  for (const n of nodes) {
    const p = positions.get(n.key)
    if (!p) continue

    const cx = Math.floor(p.x / gridSize)
    const cy = Math.floor(p.y / gridSize)
    const gKey = `G:${cx},${cy}`

    let g = groupsMap.get(gKey)
    if (!g) {
      g = {
        key: gKey,
        members: [],
        bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
        center: { x: 0, y: 0 },
      }
      groupsMap.set(gKey, g)
    }

    g.members.push(n.key)
    nodeToGroup.set(n.key, gKey)

    // bounds include node box size so the rectangle contains the actual HTML node box
    g.bounds.minX = Math.min(g.bounds.minX, p.x - padX)
    g.bounds.minY = Math.min(g.bounds.minY, p.y - padY)
    g.bounds.maxX = Math.max(g.bounds.maxX, p.x + padX)
    g.bounds.maxY = Math.max(g.bounds.maxY, p.y + padY)
  }

  // finalize centers
  const groups: ClusterGroup[] = []
  const groupPositions = new Map<string, NodePos>()
  const groupBounds = new Map<string, ClusterBounds>()

  for (const g of groupsMap.values()) {
    if (
      !Number.isFinite(g.bounds.minX) ||
      !Number.isFinite(g.bounds.minY) ||
      !Number.isFinite(g.bounds.maxX) ||
      !Number.isFinite(g.bounds.maxY)
    ) continue

    const cx = (g.bounds.minX + g.bounds.maxX) / 2
    const cy = (g.bounds.minY + g.bounds.maxY) / 2
    g.center = { x: cx, y: cy }

    groups.push(g)
    groupPositions.set(g.key, g.center)
    groupBounds.set(g.key, g.bounds)
  }

  // stable order (helps React keys + avoids jitter)
  groups.sort((a, b) => a.key.localeCompare(b.key))

  return { groups, nodeToGroup, groupPositions, groupBounds }
}

/**
 * Compute aggregated edges between cluster groups
 */
export function computeAggregatedEdges({
 edges,
 nodeToGroup,
 groupSizes,
}: {
  edges: NetworkEdge[]
  nodeToGroup: Map<string, string>
  groupSizes: Map<string, number>
}) {
  const map = new Map<string, Map<string, number>>()

  for (const e of edges) {
    const gFrom = nodeToGroup.get(e.from)
    const gTo   = nodeToGroup.get(e.to)

    // conditions:
    // - both nodes must belong to a group
    // - both nodes must not belong to the same group
    if (!gFrom || !gTo) continue
    if (gFrom === gTo) continue

    const fromSize = groupSizes.get(gFrom) ?? 1
    const toSize   = groupSizes.get(gTo) ?? 1

    // filter key: if both are singles → NOT a cluster edge
    if (fromSize === 1 && toSize === 1) continue

    if (!map.has(gFrom)) map.set(gFrom, new Map())
    const inner = map.get(gFrom)!

    inner.set(gTo, (inner.get(gTo) ?? 0) + 1)
  }

  const res: { from: string; to: string; count: number }[] = []

  for (const [from, m] of map.entries()) {
    for (const [to, count] of m.entries()) {
      res.push({ from, to, count })
    }
  }

  return res
}

