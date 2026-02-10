/** Types for the NetworkGraph component.
 * @author Enrico Tedeschini
 */
import {ComponentType} from "react"

/**
 * Types for the NetworkGraph component.
 */
export type NetworkNode = {
  key: string
  text: string
  icon: string
  expandable?: boolean
  // extra data for geography nodes
  lon?: number
  lat?: number

  // TODO: handle it to aggregate nodes by type
  type?: 'server' | 'client' | 'proxy'
  // TODO: handle it to aggregate nodes by enterprise
  enterprise?: string
  // TODO: handle it group nodes visually by custom groups
  groupId?: string | number

  // extra data for custom use
  data?: any
}

export type NetworkEdge = {
  from: string
  to: string
  // TODO: extra data for custom arrow styles with firewall
  firewall?: boolean
  bidirectional?: boolean
  label?: string
  color?: string
  thickness?: number
}

export type NetworkGroup = {
  id: string | number
  title: string
  color?: string
}

export type RadialGraphData = {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  groups?: NetworkGroup[]
}

/** Configuration options for the NetworkGraph component.
 *  Consider to add here only those props that are
 *  not expected to change frequently.
 *  In case of not frequently changing props,
 *  add in the Constants.ts file instead.
 * */
export type NetworkGraphConfig = {
  maxDepth?: 1 | 2 | 3 | 4 | 5 | 6 |7
  levelRadii?: Partial<Record<1 | 2 | 3 | 4 | 5 | 6 |7, number>>
  bezierCurves?: boolean
  childSpreadDeg?: number
  minZoom: number,
  maxZoom: number
}

export type NetworkGraphNodeTooltip = {
  node: NetworkNode
}

export type NetworkGraphNodeContextMenu = {
  /** Indicates if the context menu is open */
  open: boolean
  /** Callback to open or close the context menu */
  onOpenChange: (open: boolean) => void
  /** Row data */
  node: NetworkNode
}

export type NetworkGraphProps = {
  data: RadialGraphData
  centerKey: string
  config?: NetworkGraphConfig
  minZoom?: number
  maxZoom?: number
  highlightedNodeKey?: string;
  /** If true, disables the interactivity, the user can't move any node. */
  readOnly?: boolean

  layout?: "radial" | "geo"
  /** GeoJSON data to be used when layout is "geo" */
  mapGeoJson?: any

  /** Custom renderer for node tooltips */
  renderNodeTooltip?: ComponentType<NetworkGraphNodeTooltip>
  /** Custom renderer for node context menus */
  renderNodeContextMenu?: ComponentType<NetworkGraphNodeContextMenu>
  /** Callback when a node is clicked */
  onNodeClick?: (node: NetworkNode) => void
  /** Callback when an expandable node is clicked */
  onNodeExpandableClick?: (node: NetworkNode) => void
  /** Callback when zoom level changes */
  onZoomChange?: (zoomPercent: number) => void
  /** Callback when layout computation is completed */
  onLayoutComputed?: (timeMs: number) => void
}

/** Handle to control the NetworkGraph component programmatically. */
export type NetworkGraphHandle = {
  getZoomPercent: () => number
  resetZoom: () => void
  zoomToFit: () => void
  zoomIn: () => void
  zoomOut: () => void
  exportSvgString: () => string
  downloadSvg: (filename?: string) => void
}
