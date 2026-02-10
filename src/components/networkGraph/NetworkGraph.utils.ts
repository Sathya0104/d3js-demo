/**
 * Utility functions for the NetworkGraph component.
 * Includes functions for clamping values, converting degrees to radians,
 * escaping XML, downloading text files, and computing radial layouts.
 *
 * @author
 * Enrico Tedeschini
 */

import React                                                from "react";
import {NetworkEdge, NetworkNode}                           from "./types/ComponentsType"
import {iconCenterYOffset, NODE_BOX_HEIGHT, NODE_BOX_WIDTH} from "./Constants"

export type NodePos = { x: number; y: number }
type InternalNodeInfo = { depth: number; parent?: string }

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function degToRad(deg: number) {
  return (deg * Math.PI) / 180
}

export function escapeXml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = "image/svg+xml;charset=utf-8"
) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function computeTreeLevels(
  nodes: NetworkNode[],
  edges: NetworkEdge[],
  centerKey: string,
  maxDepth: 1 | 2 | 3 | 4 |5 | 6 |7
): Map<string, InternalNodeInfo> {
  const nodeSet = new Set(nodes.map((n) => n.key))

  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.key, [])
  for (const e of edges) {
    if (!nodeSet.has(e.from) || !nodeSet.has(e.to)) continue
    adj.get(e.from)!.push(e.to)
    adj.get(e.to)!.push(e.from)
  }

  const res = new Map<string, InternalNodeInfo>()
  if (!nodeSet.has(centerKey)) return res

  const q: string[] = [centerKey]
  res.set(centerKey, { depth: 0 })

  while (q.length) {
    const cur = q.shift()!
    const curInfo = res.get(cur)!
    if (curInfo.depth >= maxDepth) continue

    for (const nb of adj.get(cur) || []) {
      if (!res.has(nb)) {
        res.set(nb, { depth: curInfo.depth + 1, parent: cur })
        q.push(nb)
      }
    }
  }

  return res
}

export function computeRadialLayout(params: {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  centerKey: string
  maxDepth: 1 | 2 | 3 | 4 |5 | 6 |7
  radii: Record<1 | 2 | 3 | 4 | 5 | 6  |7, number>
  childSpreadDeg: number
}): Map<string, NodePos> {
  const { nodes, edges, centerKey, maxDepth, radii, childSpreadDeg } = params

  const levels = computeTreeLevels(nodes, edges, centerKey, maxDepth)
  const positions = new Map<string, NodePos>()
  positions.set(centerKey, { x: 0, y: 0 })

  const byDepth: Record<number, string[]> = { 0: [], 1: [], 2: [], 3: [] ,4:[],5:[],6:[],7:[] }
  for (const n of nodes) {
    const info = levels.get(n.key)
    if (!info) continue
    byDepth[info.depth].push(n.key)
  }

  // Depth 1: uniform distribution.
  const lvl1 = byDepth[1]
  for (let i = 0; i < lvl1.length; i++) {
    const a = (i / Math.max(1, lvl1.length)) * Math.PI * 2
    positions.set(lvl1[i], { x: Math.cos(a) * radii[1], y: Math.sin(a) * radii[1] })
  }

  // Children grouped by parent.
  const childrenByParent = new Map<string, string[]>()
  for (const [k, info] of levels.entries()) {
    if (!info.parent) continue
    if (!childrenByParent.has(info.parent)) childrenByParent.set(info.parent, [])
    childrenByParent.get(info.parent)!.push(k)
  }

  // Depth >= 2: placed around the parent on an arc.
  for (const depth of [2,3] as const) {
    if (depth > maxDepth) continue
    const keys = byDepth[depth]
    for (const key of keys) {
      const info = levels.get(key)
      if (!info?.parent) continue

      const parentKey = info.parent
      const parentPos = positions.get(parentKey) || { x: 0, y: 0 }

      const parentAngle = Math.atan2(parentPos.y, parentPos.x)
      const siblings = childrenByParent.get(parentKey) || [key]
      const idx = siblings.indexOf(key)

      const spread = degToRad(childSpreadDeg)
      const t = siblings.length === 1 ? 0 : idx / (siblings.length - 1)
      const angle = parentAngle - spread / 2 + t * spread

      positions.set(key, {
        x: parentPos.x + Math.cos(angle) * radii[depth],
        y: parentPos.y + Math.sin(angle) * radii[depth],
      })
    }
  }

  return positions
}

export const getNodeIconCenter = (p: { x: number; y: number }) => ({
  x: p.x,
  y: p.y + iconCenterYOffset,
})

export const computeGraphBounds = (positions: Map<string, NodePos>) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  // Include node boxes (real overlay size)
  positions.forEach((p) => {
    grow(p.x - NODE_BOX_WIDTH / 2, p.y - NODE_BOX_HEIGHT / 2)
    grow(p.x + NODE_BOX_WIDTH / 2, p.y + NODE_BOX_HEIGHT / 2)
  })

  // Include edge anchor points (you draw edges from icon centers, not node centers)
  positions.forEach((p) => {
    const c = getNodeIconCenter(p)
    grow(c.x, c.y)
  })

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null
  }

  return { minX, minY, maxX, maxY }
}

/** Returns true if the event target is an input field where typing occurs. */
export const isTypingTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  if (!el) return false
  const tag = el.tagName?.toLowerCase()
  if (tag === "input" || tag === "textarea" || tag === "select") return true
  if (el.isContentEditable) return true
  return false
}

export const onStopPropagation = (e: React.SyntheticEvent) => {
  e.stopPropagation()
}

export const onStopPropagationAndPreventDefault = (e: React.SyntheticEvent) => {
  // for example to avoid closing context menu when clicking inside
  // or avoid triggering drag on the node when clicking the button
  e.stopPropagation()
  e.preventDefault()
}

const arrowL = 10 // length
const arrowW = 6  // width

/** Returns the SVG points string for a triangle arrowhead. */
export const makeTriPoints = (dir: 1 | -1, shift: number, ux: number, uy: number, bx: number, by: number) => {
  const vx = ux * dir
  const vy = uy * dir
  const px = -vy
  const py =  vx
  const cx = bx + vx * shift
  const cy = by + vy * shift
  const tipX  = cx + vx * (arrowL / 2)
  const tipY  = cy + vy * (arrowL / 2)
  const baseX = cx - vx * (arrowL / 2)
  const baseY = cy - vy * (arrowL / 2)
  const leftX  = baseX + px * (arrowW / 2)
  const leftY  = baseY + py * (arrowW / 2)
  const rightX = baseX - px * (arrowW / 2)
  const rightY = baseY - py * (arrowW / 2)
  return `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`
}

