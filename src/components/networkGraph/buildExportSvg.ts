/**
 * Builds an SVG representation of the network graph for export.
 *
 * Why is better to have this export svg function separate from the React component?
 * 1. this is not related to rendering in the browser, so no need for React lifecycle
 * 2. easier to test and maintain
 * 3. can be used in other contexts (e.g., server-side rendering, CLI tools)
 * Also others library do the same to export components to SVG
 *  (e.g., Sigma
 */
// import * as d3 from "d3"
import { ZoomTransform } from "d3-zoom"
import {NetworkGraphConfig, NetworkEdge, NetworkNode} from "./types/ComponentsType"
import {escapeXml, getNodeIconCenter, NodePos} from "./NetworkGraph.utils"
import {
  BACKGROUND_DEFAULT,
  EDGE_DEFAULT_COLOR,
  EDGE_DEFAULT_THICKNESS,
  ICON_SIZE,
  LABEL_LINE_FONT_SIZE,
  LABEL_NODE_FONT_SIZE, NODE_BOX_HEIGHT, NODE_BOX_WIDTH
} from "./Constants"
import { geoMercator, geoPath as geoPathD3 } from "d3-geo"

function buildGeoMapSvg(
  width: number,
  height: number,
  mapGeoJson: any
): string {
  if (!mapGeoJson) return ""

  const projection = geoMercator()
  projection.fitSize([width, height], mapGeoJson)

  const geoPath = geoPathD3(projection)

  /**  from CSS:
   *       shape-rendering: geometricPrecision;
   *       fill: #F2F4F7;
   *       stroke: #D0D5DD;
   *       stroke-width: 1;
   *       opacity: 1;
   */

  return `
    <g class="rng__map">
      ${mapGeoJson.features
    .map((f: any, i: number) => {
      const d = geoPath(f)
      if (!d) return ""
      return `<path d="${d}" 
        class="rng__mapPath" 
        vector-effect="non-scaling-stroke"
        shape-rendering="geometricPrecision"
        fill="#F2F4F7" 
        stroke="#D0D5DD"
        stroke-width="1"
        opacity="1"
         />`
    })
    .join("")}
    </g>
  `
}


export function buildExportSvg(params: {
  width: number
  height: number
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  positions: Map<string, NodePos>
  transform: ZoomTransform
  config: NetworkGraphConfig,
  layout?: "radial" | "geo"
  mapGeoJson?: any
}) {
  const {
    width,
    height,
    nodes,
    edges,
    positions,
    // transform is currently unused because export is fit-to-content
    config,
    layout = "radial",
    mapGeoJson,
  } = params

  // Export is "fit-to-content" by design (not current viewport).
  const padding = 80

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  for (const n of nodes) {
    const p = positions.get(n.key)
    if (!p) continue
    grow(p.x - NODE_BOX_WIDTH / 2, p.y - NODE_BOX_HEIGHT / 2)
    grow(p.x + NODE_BOX_WIDTH / 2, p.y + NODE_BOX_HEIGHT / 2)
  }

  for (const e of edges) {
    const p1 = positions.get(e.from)
    const p2 = positions.get(e.to)
    if (!p1 || !p2) continue
    grow(p1.x, p1.y)
    grow(p2.x, p2.y)
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    minX = -width / 2
    minY = -height / 2
    maxX = width / 2
    maxY = height / 2
  } else {
    minX -= padding
    minY -= padding
    maxX += padding
    maxY += padding
  }

  const vb = {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  }

  const outW = vb.w.toFixed(2)
  const outH = vb.h.toFixed(2)
  const outX = vb.x.toFixed(2)
  const outY = vb.y.toFixed(2)

  const bgRect = `<rect x="0" y="0" width="${outW}" height="${outH}" fill="${BACKGROUND_DEFAULT}" />`
  const clipId = "rng-clip-map"
  const defs = `
  <defs>
    <marker
      id="arrowMid"
      viewBox="0 0 10 10"
      refX="5"
      refY="5"
      markerWidth="10"
      markerHeight="10"
      orient="auto"
      markerUnits="userSpaceOnUse"
    >
      <path d="M 0 0 L 10 5 L 0 10 Z" fill="currentColor" />
    </marker>
    <marker
      id="arrowMidBi"
      viewBox="0 0 20 10"
      refX="10"
      refY="5"
      markerWidth="22"
      markerHeight="10"
      orient="auto"
      markerUnits="userSpaceOnUse"
    >
      <path
        d="M 0 5 L 6 0 L 6 3 L 14 3 L 14 0 L 20 5 L 14 10 L 14 7 L 6 7 L 6 10 Z" fill="currentColor"/>
    </marker>
    <clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
      <rect x="${outX}" y="${outY}" width="${outW}" height="${outH}" />
    </clipPath>
  </defs>`

  let mapSvg = ""
  if (layout === "geo" && mapGeoJson) {

    // Why clip-path?
    // To avoid rendering outside the intended map area
    // (which could happen due to projection distortions)

    mapSvg = `
      <g clip-path="url(#${clipId})">
        ${buildGeoMapSvg(width, height, mapGeoJson)}
      </g>
    `
  }

  const edgeSvgs = edges
    .map((e) => {
      const p1 = positions.get(e.from)
      const p2 = positions.get(e.to)
      if (!p1 || !p2) return ""

      const stroke = e.color || EDGE_DEFAULT_COLOR
      const sw = e.thickness ?? EDGE_DEFAULT_THICKNESS

      const c1 = getNodeIconCenter(p1)
      const c2 = getNodeIconCenter(p2)

      const x1 = c1.x
      const y1 = c1.y
      const x2 = c2.x
      const y2 = c2.y

      const mx = (x1 + x2) / 2
      const my = (y1 + y2) / 2

      const markerMid = e.bidirectional ? "url(#arrowMidBi)" : "url(#arrowMid)"

      const dx = x2 - x1
      const dy = y2 - y1
      const len = Math.hypot(dx, dy) || 1

      let angle = (Math.atan2(dy, dx) * 180) / Math.PI
      if (angle > 90 || angle < -90) angle += 180

      const nx = -dy / len
      const ny = dx / len
      const offset = 14

      const lx = mx + nx * offset
      const ly = my + ny * offset

      const label = e.label
        ? `<text
              x="${lx}"
              y="${ly}"
              text-anchor="middle"
              dominant-baseline="middle"
              font-size="${LABEL_LINE_FONT_SIZE}"
              fill="${stroke}"
              font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial"
              transform="rotate(${angle.toFixed(2)} ${lx.toFixed(2)} ${ly.toFixed(2)})"
            >
              ${escapeXml(e.label)}
            </text>`
        : ""

      return `
        <g>
          <path 
            class="rng__edge"
            d="M ${x1},${y1} L ${mx},${my} L ${x2},${y2}"
            fill="none"
            stroke="${escapeXml(stroke)}"
            stroke-width="${sw}"
            style="color:${escapeXml(stroke)}"
            marker-mid="${markerMid}"
          />
          ${label}
        </g>
      `
    })
    .join("\n")

  const nodeSvgs = nodes
    .map((n) => {
      const p = positions.get(n.key)
      if (!p) return ""

      const x = p.x - NODE_BOX_WIDTH / 2
      const y = p.y - NODE_BOX_HEIGHT / 2

      const iconX = x + (NODE_BOX_WIDTH - ICON_SIZE) / 2
      const iconY = y + 4

      const textY = y + 4 + ICON_SIZE + LABEL_NODE_FONT_SIZE + 6

      return `
        <g transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})">
          <g transform="translate(${-NODE_BOX_WIDTH / 2} ${-NODE_BOX_HEIGHT / 2})">
            <image href="${escapeXml(n.icon)}"
                   x="${(iconX - x).toFixed(2)}"
                   y="${(iconY - y).toFixed(2)}"
                   width="${ICON_SIZE}" height="${ICON_SIZE}" />
            <text x="${(NODE_BOX_WIDTH / 2).toFixed(2)}"
                  y="${(textY - y).toFixed(2)}"
                  text-anchor="middle"
                  font-size="${LABEL_NODE_FONT_SIZE}"
                  fill="#101828"
                  font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial">
              ${escapeXml(n.text)}
            </text>
          </g>
        </g>
      `
    })
    .join("\n")

  // NOTE: viewBox vbx and vby could be negative, but to avoid issues in the PDF (where the SVG could be transformed in
  // we set always to 0,0 in the viewBox and adjust the inner group with a translation
  // transform after

  // const transformAttr = `translate(${transform.x}, ${transform.y}) scale(${transform.k})`

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
    width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}" preserveAspectRatio="xMidYMid meet">
      ${defs}
      ${bgRect}
    <g transform="translate(${-outX} ${-outY})">
      ${mapSvg}
      ${edgeSvgs}
      ${nodeSvgs}
    </g>
  </svg>`
}
