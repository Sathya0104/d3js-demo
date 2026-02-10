/**
 * Random network model generator for NetworkGraph
 *
 * Features:
 * - Variable number of nodes (5–500)
 * - One central node
 * - At least 4 expandable nodes
 * - At least 2 expansion levels
 * - Inline SVG icons for center and expandable nodes
 * - Random bidirectional and directional edges
 * - Random edge colors and thickness
 */

import type {NetworkEdge, NetworkNode} from "./components/networkGraph/types/ComponentsType";

/** Inline SVG used for center and expandable nodes */
const SERVER_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
  <rect x="3" y="3" width="18" height="6" rx="2" fill="#344054"/>
  <rect x="3" y="10" width="18" height="6" rx="2" fill="#475467"/>
  <rect x="3" y="17" width="18" height="4" rx="2" fill="#667085"/>
</svg>
`)

const CLIENT_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
  <rect x="3" y="4" width="18" height="12" rx="2" fill="#1D2939"/>
  <rect x="8" y="18" width="8" height="2" rx="1" fill="#667085"/>
</svg>
`)

/** Random helpers */
const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min

const pick = <T,>(arr: T[]): T => arr[randInt(0, arr.length - 1)]

/** Edge style presets */
const EDGE_STYLES = [
  { color: "#006400", thickness: 3 }, // dark green
  { color: "#8B0000", thickness: 3 }, // dark red
  { color: "#475467", thickness: 1 },
]

export interface GeneratedModel {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
}

/**
 * Generate a random network graph model
 */
export function generateRandomNetworkModel(
  totalNodes: number
): GeneratedModel {

  const nodeCount = Math.min(Math.max(totalNodes, 5), 500)

  const nodes: NetworkNode[] = []
  const edges: NetworkEdge[] = []

  /* ---------- CENTER ---------- */

  const centerKey = "CENTER"

  nodes.push({
    key: centerKey,
    text: "Central Server",
    icon: SERVER_ICON,
    expandable: false,
  })

  /* ---------- FIRST LEVEL ---------- */

  const firstLevelCount = Math.min(nodeCount - 1, randInt(6, 20))
  const firstLevelKeys: string[] = []

  for (let i = 0; i < firstLevelCount; i++) {
    const key = `N${i + 1}`

    firstLevelKeys.push(key)

    nodes.push({
      key,
      text: `Node ${i + 1}`,
      icon: CLIENT_ICON,
      expandable: false,
    })

    edges.push({
      from: centerKey,
      to: key,
      bidirectional: Math.random() > 0.7,
      ...pick(EDGE_STYLES),
    })
  }

  /* ---------- MARK SOME EXPANDABLE ---------- */

  const expandableCount = Math.max(4, Math.floor(firstLevelCount * 0.4))
  const expandableKeys = firstLevelKeys.slice(0, expandableCount)

  expandableKeys.forEach((key) => {
    const n = nodes.find(n => n.key === key)
    if (n) n.expandable = true
  })

  /* ---------- FILL NODES UNTIL nodeCount ---------- */

  let idx = 0

  while (nodes.length < nodeCount) {
    const parentKey =
      expandableKeys.length > 0
        ? expandableKeys[idx % expandableKeys.length]
        : centerKey

    const key = `X${nodes.length}`

    nodes.push({
      key,
      text: `Auto ${nodes.length}`,
      icon: CLIENT_ICON,
    })

    edges.push({
      from: Math.random() > 0.5 ? parentKey : key,
      to: Math.random() > 0.5 ? key : parentKey,
      bidirectional: Math.random() > 0.6,
      ...pick(EDGE_STYLES),
    })

    idx++
  }

  /* ---------- OPTIONAL CROSS LINKS ---------- */

  const extraEdges = Math.floor(nodeCount * 0.2)

  for (let i = 0; i < extraEdges; i++) {
    const a = pick(nodes).key
    const b = pick(nodes).key
    if (a === b) continue

    edges.push({
      from: a,
      to: b,
      bidirectional: Math.random() > 0.8,
      ...pick(EDGE_STYLES),
    })
  }

  return { nodes, edges }
}
