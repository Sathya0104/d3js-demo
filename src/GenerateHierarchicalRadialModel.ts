/**
 * Strict radial model generator
 *
 * Structure:
 * - 1 central node (NOT expandable)
 * - N radial nodes (level 1)
 * - Only 6 radial nodes can have children
 * - Children are connected ONLY to their radial parent
 * - No lateral or cross links
 */

import { NetworkEdge, NetworkNode } from "./components/networkGraph/types/ComponentsType"

/* ---------------- Icons ---------------- */

const CENTER_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
  <rect x="3" y="3" width="18" height="6" rx="2" fill="#344054"/>
  <rect x="3" y="10" width="18" height="6" rx="2" fill="#475467"/>
  <rect x="3" y="17" width="18" height="4" rx="2" fill="#667085"/>
</svg>
`)

const RADIAL_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
  <rect x="4" y="4" width="16" height="12" rx="2" fill="#1D2939"/>
</svg>
`)

const EXPANDABLE_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
  <rect x="4" y="4" width="16" height="12" rx="2" fill="#1D2939"/>
  <rect x="8" y="18" width="8" height="2" rx="1" fill="#12B76A"/>
</svg>
`)

/* ---------------- Helpers ---------------- */

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max)

const pick = <T,>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)]

/* Edge style presets */
const EDGE_STYLES = [
  { color: "#006400", thickness: 3 }, // dark green
  { color: "#8B0000", thickness: 3 }, // dark red
  { color: "#475467", thickness: 1 },
]

/* Edge direction presets */
type EdgeDirection = "CENTER_TO_RADIAL" | "RADIAL_TO_CENTER" | "BIDIRECTIONAL"

const EDGE_DIRECTIONS: EdgeDirection[] = [
  "CENTER_TO_RADIAL",
  "RADIAL_TO_CENTER",
  "BIDIRECTIONAL",
]

/* ---------------- Generator ---------------- */

export function generateStrictRadialModel(
  totalNodes: number
): { nodes: NetworkNode[]; edges: NetworkEdge[] } {

  const maxNodes = clamp(totalNodes, 5, 500)

  const nodes: NetworkNode[] = []
  const edges: NetworkEdge[] = []

  /* ---------- CENTER ---------- */

  nodes.push({
    key: "CENTER",
    text: "Central Node",
    icon: CENTER_ICON,
    // NOT expandable
  })

  /* ---------- LEVEL 1 (radial) ---------- */

  const radialCount = clamp(maxNodes - 1, 1, maxNodes - 1)
  const radialKeys: string[] = []

  for (let i = 0; i < radialCount; i++) {
    const key = `R${i + 1}`
    radialKeys.push(key)

    nodes.push({
      key,
      text: `Radial ${i + 1}`,
      icon: RADIAL_ICON,
      expandable: false,
    })

    const dir = pick(EDGE_DIRECTIONS)
    const style = pick(EDGE_STYLES)

    if (dir === "CENTER_TO_RADIAL") {
      edges.push({ from: "CENTER", to: key, ...style })
    }

    if (dir === "RADIAL_TO_CENTER") {
      edges.push({ from: key, to: "CENTER", ...style })
    }

    if (dir === "BIDIRECTIONAL") {
      edges.push({
        from: "CENTER",
        to: key,
        bidirectional: true,
        ...style,
      })
    }
  }

  /* ---------- SELECT 6 EXPANDABLE RADIALS ---------- */

  const expandableRadials = radialKeys.slice(0, 6)

  expandableRadials.forEach((key) => {
    const node = nodes.find(n => n.key === key)
    if (node) node.expandable = true
  })

  /* ---------- LEVEL 2 (children) ---------- */

  let created = nodes.length

  expandableRadials.forEach((parentKey, pIdx) => {
    if (created >= maxNodes) return

    const availableSlots = maxNodes - created
    if (availableSlots <= 0) return

    const childrenCount = Math.min(6, Math.ceil(availableSlots / expandableRadials.length))

    for (let i = 0; i < childrenCount; i++) {
      if (created >= maxNodes) break

      const key = `C${pIdx + 1}_${i + 1}`

      nodes.push({
        key,
        text: `Child ${pIdx + 1}.${i + 1}`,
        icon: EXPANDABLE_ICON,
      })

      const style = pick(EDGE_STYLES)
      const dir = pick(["OUT", "IN"] as const)

      edges.push(
        dir === "OUT"
          ? { from: parentKey, to: key, ...style }
          : { from: key, to: parentKey, ...style }
      )

      created++
    }
  })

  return { nodes, edges }
}
