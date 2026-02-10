/**
 * NetworkGraph component
 * @description
 * Renders an interactive radial network graph using D3.js and React.
 * First draft in October 2025
 *
 * This component is based on advanced knowledge of React and D3.js,
 * and it is designed to handle complex graph structures with
 * customizable layouts and interactions.
 * D3 wants to directly manipulate the DOM, while React wants to
 * be in full control of the DOM. To make both libraries work together,
 * is important to clearly separate their responsibilities.
 * We must not let D3 manipulate DOM elements that React also controls.
 *
 * TODO: List of tasks required (see any TODO in the code for details)
 *  - Grouped nodes handling
 *     Analyze data modeling and rendering strategies for grouped nodes,
 *     evaluate UX and layout implications, and define a consistent approach for interactions, edges, and export.
 *  - Expandable nodes behavior
 *     Evaluate interaction patterns for expandable nodes to ensure children
 *     are shown/hidden only on explicit user action, avoiding automatic expansion.
 *  - Radial layout improvements
 *     Analyze current overlap issues with dense graphs and evaluate alternative
 *     layout algorithms (radial variants, force-based, hybrid) to improve node distribution.
 *  - Edge routing strategies
 *    Review edge rendering techniques (straight lines, curves, orthogonal routing)
 *    to minimize overlaps and improve readability in complex graphs.
 *  - Split Node component into a separate module
 *     Assess component architecture to isolate Node rendering, reduce
 *     unnecessary re-renders, and manage local state at node level.
 *  - Export SVG support for grouped and geo layouts
 *     Review export pipeline to correctly represent grouped nodes and geographic layouts,
 *     ensuring visual parity with on-screen rendering.
 *  - SCSS modularization
 *     Evaluate migration from global SCSS to CSS/SCSS modules
 *     to improve encapsulation and avoid style leakage.
 *  - Dark mode support
 *     Review current styling and define a CSS variables
 *     strategy to support light/dark themes consistently.
 *  - Node interaction usability & accessibility review
 *     Analyze node interactions (mouse, keyboard, focus) to improve usability,
 *     accessibility, and compliance with a11y best practices.
 *  - Animated edges for data flow direction
 *     Evaluate animation techniques to visually represent data
 *     flow direction without impacting performance or readability.
 *  - Debouncing and throttling of events
 *     Analyze interaction and zoom/drag events to determine if debouncing
 *     or throttling is needed for performance optimization.
 *  - Icons as SVG components (name or URL)
 *     Review icon handling strategy to replace inline base64
 *     with reusable SVG components or external URLs.
 *  - Model updates with minimal re-layout
 *     Evaluate strategies to preserve user-moved nodes and
 *     minimize layout recalculation when the underlying model changes.
 *  - Unit testing
 *     Define a testing strategy for core logic, layout
 *     computation, and critical interactions.
 *  - Documentation & Storybook
 *     Create documentation and Storybook stories to showcase features,
 *     configurations, and usage patterns of the component.
 *  - Performance optimization tests
 *     Plan and execute performance tests to validate rendering,
 *     interactions, and scalability under large datasets.
 *
 *   @author
 *   Enrico Tedeschini*/

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
// import * as d3 from "d3"
import { select } from "d3-selection"
import { zoom, zoomIdentity, ZoomBehavior, ZoomTransform } from "d3-zoom"
import { geoMercator, geoPath as geoPathD3 } from "d3-geo"
import * as Tooltip from "@radix-ui/react-tooltip"
import {
  NetworkEdge,
  NetworkGraphHandle,
  NetworkGraphProps, NetworkNode,
} from "./types/ComponentsType"
import { buildExportSvg } from "./buildExportSvg"
import {
  clamp,
  downloadTextFile,
  NodePos,
  getNodeIconCenter,
  computeGraphBounds,
  isTypingTarget,
  onStopPropagation,
  onStopPropagationAndPreventDefault,
  makeTriPoints
} from "./NetworkGraph.utils"
import { useResizeObserver } from "./NetworkGraphHooks"
import {
  defaultConfig,
  EDGE_DEFAULT_COLOR,
  EDGE_DEFAULT_THICKNESS,
  ICON_SIZE,
  LABEL_LINE_FONT_SIZE,
  LABEL_NODE_FONT_SIZE,
  NODE_BOX_HEIGHT,
  NODE_BOX_WIDTH
} from "./Constants"
import ExpandNode from '../../assets/node-collapse.svg?react'
import "./NetworkGraph.scss"
import {
  CLUSTER_GRID_SIZE,
  CLUSTER_ZOOM_THRESHOLD, ClusterGroup,
  computeAggregatedEdges,
  computeGridClusters
} from "./NetworkGraph.cluster";
import {computeRadialLayoutAdaptive, computeRadialLayoutAdvanced} from "./NetworkGraph.advanced.radial";

export const NetworkGraph = forwardRef<NetworkGraphHandle, NetworkGraphProps>(
({
  data,
  centerKey,
  config = defaultConfig,
  readOnly = false,
  onNodeClick,
  renderNodeTooltip,
  renderNodeContextMenu,
  onNodeExpandableClick,
  onLayoutComputed,
  onZoomChange,
  layout = "radial",
  mapGeoJson
}, ref) => {
  const containerRef      = useRef<HTMLDivElement | null>(null)
  const svgRef            = useRef<SVGSVGElement | null>(null)
  const gRef              = useRef<SVGGElement | null>(null)
  const overlayRef        = useRef<HTMLDivElement | null>(null)
  const zoomRef           = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const didInitialFitRef  = useRef(false)
  const prevSizeRef       = useRef({ width: 0, height: 0 })
  const transformRef      = useRef<ZoomTransform>(zoomIdentity)
  // Pointer-based drag state.
  const dragStateRef      = useRef<{ key: string; offsetX: number; offsetY: number } | null>(null)
  const didGeoInitRef     = useRef(false)
  const resizeTimeoutRef = useRef<number | null>(null)
  const layoutTimeRef = useRef<number>(0)

  // ADDED NEWLY - HIERARCHICAL EXPANSION: EXPANSION PATH STATE
  // Tracks the current expansion path from root (centerKey) to the focused node.
  // This creates a breadcrumb trail showing the navigation hierarchy.
  // Example: [CENTER, N9, N50, N99] means user expanded CENTER→N9→N50→N99
  const [expansionPath, setExpansionPath] = useState<string[]>([centerKey])

  // ADDED NEWLY - HIERARCHICAL EXPANSION: VISIBLE NODES COMPUTATION
  // Computes which nodes should be visible based on the current expansion path.
  // Shows: 1) All nodes in the expansion path (breadcrumb trail)
  //        2) Direct children of the currently focused node (last in path)
  // This creates a clean, focused view by hiding sibling branches and deeper descendants.
  const visibleNodes = useMemo(() => {
    if (expansionPath.length === 0) return data.nodes

    const focusNode = expansionPath[expansionPath.length - 1]
    const visibleKeys = new Set<string>()

    // Always show all nodes in the expansion path (breadcrumb trail)
    expansionPath.forEach(key => visibleKeys.add(key))

    // Show direct children of the CURRENT focused node (last in path)
    data.edges.forEach(edge => {
      if (edge.from === focusNode) {
        visibleKeys.add(edge.to)
      }
      if (edge.to === focusNode) {
        visibleKeys.add(edge.from)
      }
    })

    return data.nodes.filter(node => visibleKeys.has(node.key))
  }, [data.nodes, data.edges, expansionPath])

  // ADDED NEWLY - HIERARCHICAL EXPANSION: VISIBLE EDGES FILTERING
  // Filters edges to only show connections between currently visible nodes.
  // This ensures no edges are drawn to/from hidden nodes in collapsed branches.
  const visibleEdges = useMemo(() => {
    const visibleKeys = new Set(visibleNodes.map(n => n.key))
    return data.edges.filter(edge => visibleKeys.has(edge.from) && visibleKeys.has(edge.to))
  }, [data.edges, visibleNodes])

  // ADDED NEWLY - COLLAPSED NODE INFO COMPUTATION
  // Computes for each node in the expansion path how many children are hidden (collapsed).
  // This is used to show "+N nodes" indicator on breadcrumb nodes.
  const collapsedNodeInfo = useMemo(() => {
    const info = new Map<string, { totalChildren: number; hiddenChildren: number }>()
    
    const visibleKeys = new Set(visibleNodes.map(n => n.key))
    
    // For each node in expansion path (except the last one which is the current focus)
    expansionPath.slice(0, -1).forEach(nodeKey => {
      // Find all children of this node
      const children = data.edges
        .filter(e => e.from === nodeKey || e.to === nodeKey)
        .map(e => e.from === nodeKey ? e.to : e.from)
        .filter(childKey => childKey !== nodeKey) // Exclude self-loops
      
      const totalChildren = new Set(children).size
      const hiddenChildren = children.filter(childKey => !visibleKeys.has(childKey)).length
      
      if (hiddenChildren > 0) {
        info.set(nodeKey, { totalChildren, hiddenChildren })
      }
    })
    
    return info
  }, [data.edges, visibleNodes, expansionPath])

  const { width: measuredWidth, height: measuredHeight } = useResizeObserver(containerRef)

  const projection = useMemo(() => {
    if (layout !== "geo") return null
    if (measuredWidth === 0 || measuredHeight === 0) return null

    // Mercator: good for world maps, but distorts near poles
    // geoIdentity: good for small areas, no distortion
    // geoConicConformal: good for mid-latitude countries
    // in future can change in geoIdentity and geoConicConformal based on area size
    const proj = geoMercator()

    // fit on mapGeoJson if available
    if (mapGeoJson) {
      proj.fitSize([measuredWidth, measuredHeight], mapGeoJson)
      return proj
    }

    // else fit on node points
    const features = data.nodes
      .filter(n => Number.isFinite(n.lon) && Number.isFinite(n.lat))
      .map(n => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [n.lon, n.lat] },
        properties: { key: n.key },
      }))

    const fc = { type: "FeatureCollection", features }

    // in case no valid features, skip fitting to avoid errors
    if (features.length > 0) {
      proj.fitSize([measuredWidth, measuredHeight], fc)
    }

    return proj
  }, [layout, mapGeoJson, data.nodes, measuredWidth, measuredHeight])

  const geoPath = useMemo(() => {
    if (!projection) return null
    return geoPathD3(projection)
  }, [projection])

  /**
   * Radii calculation:
   * We want to have a good default radius for each level
   * based on the container size, but also allow the user
   * to override them via config.
   * We calculate a base radius as 28% of the smaller
   * container dimension (width or height). Then we set the level 1 radius
   * to this base radius, level 2 to 55% of base (min 60px)
   * and level 3 to 45% of base (min 55px). This way we ensure that
   * the graph looks good in most container sizes, but also
   * allow the user to customize the radii if needed.
   * */
  const radii = useMemo(() => {
    const base = Math.min(measuredWidth, measuredHeight) * 0.28
    const r1 = config.levelRadii?.[1] ?? base
    const r2 = config.levelRadii?.[2] ?? Math.max(60, base * 1.15)
    const r3 = config.levelRadii?.[3] ?? Math.max(55, base * 1.15)
    const r4 = config.levelRadii?.[4] ?? Math.max(55, base * 0.45)
    const r5 = config.levelRadii?.[5] ?? Math.max(55, base * 0.45)
    const r6 = config.levelRadii?.[6] ?? Math.max(55, base * 0.45)
    const r7 = config.levelRadii?.[7] ?? Math.max(55, base * 0.45)
    return { 1: r1, 2: r2, 3: r3 , 4:r4, 5:r5, 6:r6, 7:r7 } as Record<1 | 2 | 3 | 4| 5 | 6 | 7, number>
  }, [measuredWidth, measuredHeight, config.levelRadii])

  const baseLayout = useMemo(() => {
    const start = performance.now()
    if (layout === "geo") {
      const res = new Map<string, NodePos>()
      if (!projection) return res

      // ADDED NEWLY - VISIBILITY FILTERING FOR GEOGRAPHIC LAYOUT
      // Uses only visible nodes for geographic layout to respect expansion state
      for (const n of visibleNodes) {
        if (!Number.isFinite(n.lon) || !Number.isFinite(n.lat)) continue
        const p = (projection)([n.lon, n.lat]) as [number, number] | null
        if (!p) continue
        res.set(n.key, { x: p[0], y: p[1] })
      }
      const end = performance.now()
      layoutTimeRef.current = Math.round(end - start)
      return res
    }

    const halfW = Math.max(160, measuredWidth / 2 - NODE_BOX_WIDTH)
    const halfH = Math.max(160, measuredHeight / 2 - NODE_BOX_HEIGHT)

    // ADDED NEWLY - HIERARCHICAL EXPANSION FIX
    // Uses the current focus node (last node in expansion path) as the layout center
    // instead of always using the original centerKey. This enables infinite depth
    // expansion by recentering the radial layout around the currently focused node.
    // Without this, nodes beyond maxDepth from the original center won't get positions.
    const effectiveCenterKey = expansionPath[expansionPath.length - 1]

    // ADDED NEWLY - VISIBILITY FILTERING
    // Uses filtered visible nodes and edges for radial layout based on expansion path.
    // This ensures only nodes in the current expansion hierarchy are positioned.
    const res = computeRadialLayoutAdaptive({
      nodes: visibleNodes,
      edges: visibleEdges,
      centerKey: effectiveCenterKey,
      maxDepth: config.maxDepth,
      radii,
      childSpreadDeg: config.childSpreadDeg,
      rectRingsMinLvl1: 20,

      // NEW: lvl1 on rectangle perimeter with 2 rings
      level1Layout: {
        type: "rectRings",
        halfW,
        halfH,
        outerRatio: 0.55,  // ~55% outer ring, rest inner ring
        innerScale: 0.72,  // inner ring closer to center
      },
      isExpandable: (n) => n.expandable && n.key !== centerKey,
      nodeBox: { w: NODE_BOX_WIDTH, h: NODE_BOX_HEIGHT, pad: 25 }, // INCREASED padding from 10 to 25
    })
    const end = performance.now()
    layoutTimeRef.current = Math.round(end - start)
    return res

  }, [layout,
    projection,
    measuredWidth,
    measuredHeight,
    visibleNodes,
    visibleEdges,
    centerKey,
    config.maxDepth,
    radii,
    config.childSpreadDeg])

  const [positions, setPositions]         = useState<Map<string, NodePos>>(baseLayout)
  const [transform, setTransform]         = useState<ZoomTransform>(() => zoomIdentity)
  const [menuNodeKey, setMenuNodeKey]     = useState<string | null>(null)
  const [isHover, setIsHover]             = useState(false)
  const [isFocusWithin, setIsFocusWithin] = useState(false)

  // dragging state and ref node dragged
  const [isDraggingNode, setIsDraggingNode]   = useState(false)
  const [draggingNodeKey, setDraggingNodeKey] = useState<string | null>(null)

  const isClusterMode         = transform.k < CLUSTER_ZOOM_THRESHOLD
  const effectiveClusterMode  = isClusterMode && !isDraggingNode

  const cluster = useMemo(() => {
    if (!effectiveClusterMode) {
      // do not cluster calculation wne it is not needed
      return { groups: [], nodeToGroup: new Map(), groupPositions: new Map(), groupBounds: new Map() }
    }
    return computeGridClusters({ nodes: data.nodes, positions, gridSize: CLUSTER_GRID_SIZE })
  }, [effectiveClusterMode, data.nodes, positions])

  const groupSizes = useMemo(() => {
    const m = new Map<string, number>()
    cluster.groups.forEach(g => {
      m.set(g.key, g.members.length)
    })
    return m
  }, [cluster.groups])

  const aggregatedEdges = useMemo(() => {
    if (!effectiveClusterMode) return []
    return computeAggregatedEdges({
      edges: data.edges,
      nodeToGroup: cluster.nodeToGroup,
      groupSizes,
    })
  }, [effectiveClusterMode, data.edges, cluster.nodeToGroup, groupSizes])

  // helper: zoom to a world point (wx, wy) at a target scale
  const zoomToWorldPoint = (wx: number, wy: number, targetK: number, duration = 250) => {
    if (measuredWidth === 0 || measuredHeight === 0) return
    const k = clamp(targetK, config.minZoom, config.maxZoom)

    const next = zoomIdentity
      .translate(measuredWidth / 2, measuredHeight / 2)
      .scale(k)
      .translate(-wx, -wy)

    applyTransform(next, duration)
  }

  useEffect(() => {
    setPositions(baseLayout)

    if (onLayoutComputed) {
      onLayoutComputed(layoutTimeRef.current)
    }

  }, [baseLayout])

  const lastAddedKeysRef = useRef<string[]>([])

  // ADDED NEWLY - HIERARCHICAL EXPANSION: RESET ON DATA CHANGE
  // Resets the expansion path back to the root whenever the centerKey or data changes.
  // This prevents showing stale expansion states when the graph data is updated or
  // when switching between different graph models (e.g., in a demo with multiple datasets).
  useEffect(() => {
    setExpansionPath([centerKey])
  }, [centerKey, data])

  useLayoutEffect(() => {
    if (!svgRef.current || !gRef.current) return
    if (measuredWidth === 0 || measuredHeight === 0) return

    const svgSel = select(svgRef.current)
    const gSel = select(gRef.current)

    const zoomBehavior =
      zoom<SVGSVGElement, unknown>()
      .scaleExtent([config.minZoom, config.maxZoom])
      .on("zoom", (event) => {
        gSel.attr("transform", event.transform.toString())

        // keep latest transform in ref to avoid stale closure in other callbacks
        transformRef.current = event.transform
        setTransform(event.transform)

        // sync overlay position
        if (overlayRef.current) {
          overlayRef.current.style.transform =
            `translate(${event.transform.x}px, ${event.transform.y}px) scale(${event.transform.k})`
        }
        // TODO add debounced to avoid too many calls
        onZoomChange?.(Math.round(event.transform.k * 100))
      })

    zoomRef.current = zoomBehavior
    svgSel.call(zoomBehavior)

    // Keep the current transform on resize instead of resetting every time.
    // If this is the first time, transform is identity and we will do an initial fit later.
    svgSel.call(zoomBehavior.transform, transform)

    return () => {
      svgSel.on(".zoom", null)
    }
  }, [measuredWidth, measuredHeight, config.minZoom, config.maxZoom]) // intentionally no "transform" dependency

  /** Why do we need this effect?
   * When layout is "geo", we want to reset the zoom/pan to avoid weird positions.
   */
  useEffect(() => {
    // when I exit from geo layout, reset the geo init flag
    if (layout !== "geo") {
      didGeoInitRef.current = false
      return
    }

    // waiting for projection to be ready
    if (!projection) return
    if (!svgRef.current || !zoomRef.current) return

    // execute the geo init only once
    if (didGeoInitRef.current) return
    didGeoInitRef.current = true

    const t = zoomIdentity

    // keep current center and zoom from projection fitting
    transformRef.current = t
    setTransform(t)

    if (overlayRef.current) {
      overlayRef.current.style.transform = `translate(0px, 0px) scale(1)`
    }

    // apply without animation to avoid "jumping" feel
    select(svgRef.current).call(zoomRef.current.transform, t)
  }, [layout, projection])

  /** Convert screen (client) coordinates to world (graph) coordinates.
   *  This is used for node dragging and all other pointer-based interactions.
   * */
  const screenToWorld = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return [0, 0]

    const rect = svg.getBoundingClientRect()
    const sx = clientX - rect.left
    const sy = clientY - rect.top

    // use the latest transform from ref to avoid stale closure
    return transformRef.current.invert([sx, sy])
  }

  const applyTransform = (t: ZoomTransform, duration = 350) => {
    if (!svgRef.current || !zoomRef.current) return
    const sel = select(svgRef.current)
    if (duration <= 0) {
      sel.call(zoomRef.current.transform, t)
      return
    }
    sel.transition().duration(duration).call(zoomRef.current.transform, t)
  }

  useEffect(() => {
    if (!zoomRef.current || !svgRef.current) return
    if (measuredWidth === 0 || measuredHeight === 0) return

    const prev = prevSizeRef.current

    // First valid measure: just store and exit.
    if (prev.width === 0 || prev.height === 0) {
      prevSizeRef.current = { width: measuredWidth, height: measuredHeight }
      return
    }

    // If size didn't actually change, skip.
    if (prev.width === measuredWidth && prev.height === measuredHeight) return

    // World point that was previously at the center of the viewport.
    const t = transformRef.current
    const worldCenter = t.invert([prev.width / 2, prev.height / 2])

    const next = zoomIdentity
      .translate(measuredWidth / 2, measuredHeight / 2)
      .scale(t.k)
      .translate(-worldCenter[0], -worldCenter[1])


    // Apply without animation to avoid "jumping" feel.
    applyTransform(next, 0)

    prevSizeRef.current = { width: measuredWidth, height: measuredHeight }
  }, [measuredWidth, measuredHeight])

  /**
   * Reset initial-fit flag when graph data changes,
   * so the next layout will auto-fit again.
   */
  useEffect(() => {
    // For geo layout, we consider that the fit is already done via projection fitting.
    didInitialFitRef.current = layout === "geo"
    prevSizeRef.current = { width: 0, height: 0 }
  }, [layout, data])

  /** Pan the graph by the given screen pixel offsets. */
  const panBySmooth = (dx: number, dy: number) => {
    if (!svgRef.current || !zoomRef.current) return

    // stop any animations currently in progress
    select(svgRef.current).interrupt()

    const t = transformRef.current
    const next = zoomIdentity.translate(t.x + dx, t.y + dy).scale(t.k)

    // short duration to smooth out the jump
    applyTransform(next, 70)
  }

  /** Zoom the graph by the given factor, centered on the viewport center. */
  const zoomBy = (factor: number, duration = 180) => {
    if (!svgRef.current || !zoomRef.current) return
    if (measuredWidth === 0 || measuredHeight === 0) return

    const t = transformRef.current

    // world point currently at the center of the viewport
    const worldCenter = t.invert([measuredWidth / 2, measuredHeight / 2])

    const nextK = clamp(t.k * factor, config.minZoom, config.maxZoom)

    const next = zoomIdentity
      .translate(measuredWidth / 2, measuredHeight / 2)
      .scale(nextK)
      .translate(-worldCenter[0], -worldCenter[1])

    applyTransform(next, duration)
  }

  const zoomIn = () => zoomBy(1.2)

  const zoomOut = () => zoomBy(1 / 1.2)

  const resetZoom = () => {
    const t =
      layout === "geo"
        ? zoomIdentity
        : zoomIdentity.translate(measuredWidth / 2, measuredHeight / 2).scale(1)

    applyTransform(t, 300)
  }

  const zoomToFit = (posMap: Map<string, NodePos> = positions) => {
    if (posMap.size === 0) return
    if (measuredWidth === 0 || measuredHeight === 0) return

    const b = computeGraphBounds(posMap)
    if (!b) return

    const padding = 5

    const minX = b.minX - padding
    const minY = b.minY - padding
    const maxX = b.maxX + padding
    const maxY = b.maxY + padding

    const contentW = Math.max(1, maxX - minX)
    const contentH = Math.max(1, maxY - minY)

    const rawK = Math.min(measuredWidth / contentW, measuredHeight / contentH)

    const k = clamp(rawK, config.minZoom, didInitialFitRef.current ? config.maxZoom : 1)

    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2

    const t = zoomIdentity
      .translate(measuredWidth / 2, measuredHeight / 2)
      .scale(k)
      .translate(-cx, -cy)

    applyTransform(t, 400)
  }

  useEffect(() => {
    const added = lastAddedKeysRef.current
    if (!added || added.length === 0) return
    if (measuredWidth === 0 || measuredHeight === 0) return

    // compute world-bounds of newly added nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const k of added) {
      const p = positions.get(k)
      if (!p) continue
      minX = Math.min(minX, p.x - NODE_BOX_WIDTH / 2)
      minY = Math.min(minY, p.y - NODE_BOX_HEIGHT / 2)
      maxX = Math.max(maxX, p.x + NODE_BOX_WIDTH / 2)
      maxY = Math.max(maxY, p.y + NODE_BOX_HEIGHT / 2)
    }
    if (!Number.isFinite(minX)) return

    // current viewport in world coords
    const t = transformRef.current
    const [vx0, vy0] = t.invert([0, 0])
    const [vx1, vy1] = t.invert([measuredWidth, measuredHeight])

    const vminX = Math.min(vx0, vx1)
    const vmaxX = Math.max(vx0, vx1)
    const vminY = Math.min(vy0, vy1)
    const vmaxY = Math.max(vy0, vy1)

    const pad = 40

    const alreadyVisible =
      minX >= vminX + pad &&
      maxX <= vmaxX - pad &&
      minY >= vminY + pad &&
      maxY <= vmaxY - pad

    // if they are not visible, fit whole graph (positions unchanged)
    if (!alreadyVisible) {
      zoomToFit(positions)
    }

    lastAddedKeysRef.current = []
  }, [positions, measuredWidth, measuredHeight])

  useEffect(() => {
    // No auto-fit for geo layout.
    if (layout === "geo") {
      didInitialFitRef.current = true
      return
    }

    if (didInitialFitRef.current) return
    if (measuredWidth === 0 || measuredHeight === 0) return
    if (!zoomRef.current || !svgRef.current) return
    if (baseLayout.size === 0) return

    // IMPORTANT: use the right layout here
    zoomToFit(baseLayout)
    didInitialFitRef.current = true
  }, [layout, measuredWidth, measuredHeight, baseLayout])

  const exportSvgString = () => {
    // ADDED NEWLY - HIERARCHICAL EXPANSION: SVG EXPORT
    // Exports only the currently visible nodes and edges based on the expansion state.
    // This means the exported SVG shows the same focused view as displayed in the UI,
    // not the entire graph. Only the expansion path and current level children are included.
    return buildExportSvg({
      width: measuredWidth,
      height: measuredHeight,
      nodes: visibleNodes,
      edges: visibleEdges,
      positions,
      transform,
      config,
      layout,
      mapGeoJson
    })
  }

  const downloadSvg = (filename = "graph.svg") => {
    downloadTextFile(filename, exportSvgString())
  }

  /** Expose imperative methods to parent via ref. */
  useImperativeHandle(
    ref, () => ({
      getZoomPercent: () => Math.round((transform?.k ?? 1) * 100),
      resetZoom,
      zoomToFit,
      zoomIn,
      zoomOut,
      exportSvgString,
      downloadSvg,
    }),
    [transform, resetZoom, zoomToFit, zoomIn, zoomOut, visibleNodes, visibleEdges, positions]
  )

  const onNodePointerDown = (e: React.PointerEvent, key: string) => {
    // do not start drag in readOnly mode
    if (readOnly) return
    e.stopPropagation()
    setIsDraggingNode(true)
    setDraggingNodeKey(key);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    const p = positions.get(key)
    if (!p) return

    const [wx, wy] = screenToWorld(e.clientX, e.clientY)
    dragStateRef.current = { key, offsetX: p.x - wx, offsetY: p.y - wy }

  }

  const onNodePointerMove = (e: React.PointerEvent) => {
    const s = dragStateRef.current
    if (!s) return

    const [wx, wy] = screenToWorld(e.clientX, e.clientY)
    const nx = wx + s.offsetX
    const ny = wy + s.offsetY

    setPositions((prev) => {
      const next = new Map(prev)
      next.set(s.key, { x: nx, y: ny })
      return next
    })
  }

  const onNodePointerUp = (e: React.PointerEvent) => {
    const s = dragStateRef.current
    if (!s) return
    dragStateRef.current = null
    setIsDraggingNode(false)
    setDraggingNodeKey(null)
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // No-op.
    }
  }

  /** Handle keyboard events for panning and zooming. */
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    const isArmed = isHover || isFocusWithin
    if (!isArmed) return
    if (isTypingTarget(e.target)) return

    // step: use shift for bigger steps
    const step = e.shiftKey ? 90 : 35

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault()
        panBySmooth(step, 0)
        break
      case "ArrowRight":
        e.preventDefault()
        panBySmooth(-step, 0)
        break
      case "ArrowUp":
        e.preventDefault()
        panBySmooth(0, step)
        break
      case "ArrowDown":
        e.preventDefault()
        panBySmooth(0, -step)
        break
      case "+":
      case "=":
        e.preventDefault()
        zoomIn()
        break
      case "-":
      case "_":
        e.preventDefault()
        zoomOut()
        break
      case "0":
        e.preventDefault()
        resetZoom()
        break
      case "f":
      case "F":
        e.preventDefault()
        zoomToFit()
        break
      default:
        break
    } 
  }

  /** Render edges between nodes. */
  const renderClusterEdge = (from: string, to: string, count: number, idx: number) => {
    const p1 = cluster.groupPositions.get(from)
    const p2 = cluster.groupPositions.get(to)
    if (!p1 || !p2) return null

    const x1 = p1.x
    const y1 = p1.y
    const x2 = p2.x
    const y2 = p2.y

    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2

    const d = `M ${x1},${y1} L ${x2},${y2}`

    return (
      <g key={`CL-${from}-${to}-${idx}`}>
        <path
          className="rng__edge rng__edge--cluster"
          d={d}
          fill="none"
          stroke={EDGE_DEFAULT_COLOR}
          strokeWidth={EDGE_DEFAULT_THICKNESS}
          strokeDasharray="6 4"
        />
        <text
          className="rng__edgeLabel rng__edgeLabel--cluster"
          x={mx}
          y={my - 6}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={LABEL_LINE_FONT_SIZE}
          fill={EDGE_DEFAULT_COLOR}
        >
          {count}
        </text>
      </g>
    )
  }

  const renderNormalEdge = (e: NetworkEdge, idx: number) => {
    const p1 = positions.get(e.from)
    const p2 = positions.get(e.to)
    if (!p1 || !p2) return null

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

    const isBezierCurves = config.bezierCurves
    const bend = isBezierCurves ? 18 : 0
    const c1x = x1 + dx / 3 + nx * bend
    const c1y = y1 + dy / 3 + ny * bend
    const c2x = x1 + (2 * dx) / 3 + nx * bend
    const c2y = y1 + (2 * dy) / 3 + ny * bend

    let d: string
    let curveArrows: React.ReactNode = null
    let markerMid: string | undefined
    let strokeDasharray: string | undefined

    if (isBezierCurves) {
      const t = 0.5
      const mt = 1 - t
      const bx = mt * mt * mt * x1 + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * x2
      const by = mt * mt * mt * y1 + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * y2
      const dxdt = 3 * mt * mt * (c1x - x1) + 6 * mt * t * (c2x - c1x) + 3 * t * t * (x2 - c2x)
      const dydt = 3 * mt * mt * (c1y - y1) + 6 * mt * t * (c2y - c1y) + 3 * t * t * (y2 - c2y)
      const dlen = Math.hypot(dxdt, dydt) || 1
      const ux = dxdt / dlen
      const uy = dydt / dlen

      if (e.bidirectional) {
        curveArrows = (
          <>
            <polygon points={makeTriPoints(1, 6, ux, uy, bx, by)} fill={stroke} />
            <polygon points={makeTriPoints(-1, 6, ux, uy, bx, by)} fill={stroke} />
          </>
        )
      } else {
        curveArrows = <polygon points={makeTriPoints(1, 0, ux, uy, bx, by)} fill={stroke} />
      }

      strokeDasharray = "6 4"
      d = `M ${x1},${y1} C ${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`
    }
    else {
      markerMid = e.bidirectional ? "url(#arrowMidBi)" : "url(#arrowMid)"
      d = `M ${x1},${y1} L ${mx},${my} L ${x2},${y2}`
    }

    return (
      <g key={`${e.from}-${e.to}-${idx}`}>
        <path
          className={["rng__edge", e.bidirectional && "rng__edge--bi", isBezierCurves && "rng__edge--animated"]
            .filter(Boolean)
            .join(" ")}
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={sw}
          style={{ color: stroke }}
          strokeDasharray={strokeDasharray}
          markerMid={markerMid}
        />
        {curveArrows}
        {e.label ? (
          <text
            className="rng__edgeLabel"
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={LABEL_LINE_FONT_SIZE}
            fill={stroke}
            transform={`rotate(${angle.toFixed(2)} ${lx.toFixed(2)} ${ly.toFixed(2)})`}
          >
            {e.label}
          </text>
        ) : null}
      </g>
    )
  }

  const renderedEdges = useMemo(() => {
    if (!effectiveClusterMode) {
      // ADDED NEWLY - HIERARCHICAL EXPANSION: EDGE RENDERING
      // Renders only edges between currently visible nodes (filtered by expansion state).
      // This ensures edges are only drawn for the active expansion path and its children.
      return visibleEdges.map(renderNormalEdge).filter(Boolean)
    }

    const result: React.ReactNode[] = []

    aggregatedEdges.forEach((ae, idx) => {
      result.push(renderClusterEdge(ae.from, ae.to, ae.count, idx))
    })

    // ADDED NEWLY - HIERARCHICAL EXPANSION: CLUSTER MODE EDGE RENDERING
    // In cluster mode, renders only edges between visible nodes (respects expansion state).
    // Skips edges where either endpoint is part of a multi-node cluster.
    visibleEdges.forEach((e, idx) => {
      const fromClustered = groupSizes.get(cluster.nodeToGroup.get(e.from) ?? "")! > 1
      const toClustered   = groupSizes.get(cluster.nodeToGroup.get(e.to) ?? "")! > 1

      if (!fromClustered && !toClustered) {
        result.push(renderNormalEdge(e, idx))
      }
    })

    return result.filter(Boolean)
  }, [
    effectiveClusterMode,
    aggregatedEdges,
    visibleEdges,
    positions,
    config.bezierCurves,
    groupSizes,
  ])

  /** Render map when layout is "geo" */
  const renderedMap = useMemo(() => {
    if (layout !== "geo") return null
    if (!geoPath || !mapGeoJson) return null

    const features = (mapGeoJson?.features ?? [])

    return (
      <g className="rng__map">
        {features.map((f, i) => (
          <path
            key={f?.id ?? f?.properties?.id ?? i}
            className="rng__mapPath"
            d={geoPath(f) ?? undefined}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    )
  }, [layout, geoPath, mapGeoJson])

  /** Render nodes as HTML elements overlaid on top of the SVG. */
  const renderNodeElement = (n: NetworkNode) => {
    const p = positions.get(n.key)
    if (!p) return null

    const left = p.x - NODE_BOX_WIDTH / 2
    const top = p.y - NODE_BOX_HEIGHT / 2
    const ContentContextMenu = renderNodeContextMenu ?? (() => null)

    // ADDED NEWLY - COLLAPSED NODE INFO
    // Check if this node has hidden (collapsed) children to show indicator
    const collapsedInfo = collapsedNodeInfo.get(n.key)
    const hasCollapsedChildren = collapsedInfo && collapsedInfo.hiddenChildren > 0

    const onClick = () => {
      if (isDraggingNode) return
      onNodeClick?.(n)
    }

    // ADDED NEWLY - HIERARCHICAL EXPANSION: EXPAND BUTTON CLICK HANDLER
    // Handles the logic when a node's expand button is clicked.
    // Three scenarios:
    //   1) Direct child of current focus → Add to expansion path (drill down)
    //   2) Node already in path → Navigate back to that level (drill up)
    //   3) Unrelated node → No action (shouldn't happen with proper UI)
    const onExpandClick = (e: React.MouseEvent) => {
      e.stopPropagation()
      
      if (n.key !== centerKey) {
        // Find if this node is a direct child of the current focus node
        const currentFocus = expansionPath[expansionPath.length - 1]
        
        // IMPORTANT: Check against ALL edges in original data, not filtered visibleEdges.
        // This is critical for deep expansions (level 3+) to work correctly, because
        // visibleEdges only contains edges between currently visible nodes, which may
        // not include the parent-child relationship we're checking for nodes at depth 4+.
        const isDirectChild = data.edges.some(
          edge => (edge.from === currentFocus && edge.to === n.key) || 
                  (edge.to === currentFocus && edge.from === n.key)
        )
        
        if (isDirectChild) {
          // Scenario 1: This is a child of current focus → expand by adding to path
          setExpansionPath([...expansionPath, n.key])
        } else {
          // Scenario 2: Check if this node is already in the expansion path
          const nodeIndexInPath = expansionPath.indexOf(n.key)
          if (nodeIndexInPath !== -1) {
            // If found in path → navigate back up by slicing the path to this node
            setExpansionPath(expansionPath.slice(0, nodeIndexInPath + 1))
          }
        }
      }
      
      // Call the parent's callback if provided (for logging, analytics, etc.)
      onNodeExpandableClick?.(n)
    }

    const nodeElement = (
      // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
      <div
        role="button"
        className={`rng__node ${draggingNodeKey === n.key ? "rng__node--dragging" : ""}`}
        tabIndex={0}
        onClick={onClick}
        onPointerDown={(e) => onNodePointerDown(e, n.key)}
        onFocusCapture={onStopPropagation}
        onMouseEnter={() => { if (!isDraggingNode) setMenuNodeKey(n.key)}}
        onMouseLeave={() => { if (!isDraggingNode) setMenuNodeKey(null)}}
        onBlurCapture={onStopPropagation}
        onPointerMove={onNodePointerMove}
        onPointerUp={onNodePointerUp}
        onPointerCancel={onNodePointerUp}
        style={{ left, top, width: NODE_BOX_WIDTH, height: NODE_BOX_HEIGHT }}
      >
        <div className="rng__nodeIconWrap">
          <img className="rng__nodeIcon" src={n.icon} width={ICON_SIZE} height={ICON_SIZE} draggable={false} />
          {n.expandable && onNodeExpandableClick && (
            <button
              type="button"
              className="rng__nodeExpand"
              aria-label="expand node"
              onPointerDown={onStopPropagationAndPreventDefault}
              onClick={onExpandClick}
            >
              <ExpandNode width={16} height={16} />
            </button>
          )}
        </div>

        <div className="rng__nodeLabel" title={n.text} style={{ fontSize: LABEL_NODE_FONT_SIZE }}>
          {n.text}
        </div>
        <div className="rng__nodeMenu">
          <ContentContextMenu
            open={menuNodeKey === n.key}
            onOpenChange={(open) => setMenuNodeKey(open ? n.key : null)}
            node={n}
          />
        </div>
        
      </div>
    )

    if (!renderNodeTooltip) return nodeElement

    const ContentTooltip = renderNodeTooltip ?? (() => null)
    return (
      <Tooltip.Root delayDuration={150} key={n.key}>
        <Tooltip.Trigger asChild>{nodeElement}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="rng__tooltip" side="top" align="center">
            <ContentTooltip node={n} />
            {/* ADDED NEWLY - Show collapsed info in tooltip */}
            {hasCollapsedChildren && (
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(18, 18, 18, 0.2)' }}>
                <div style={{ fontSize: '12px', color: 'rgba(18, 18, 18, 0.9)' }}>
                  +{collapsedInfo.hiddenChildren} hidden node{collapsedInfo.hiddenChildren > 1 ? 's' : ''}
                </div>
              </div>
            )}
            <Tooltip.Arrow className="rng__tooltipArrow" width={10} height={6} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    )
  }

  const renderClusterRect = (g: ClusterGroup) => {
    const b = cluster.groupBounds.get(g.key)
    if (!b) return null

    const left = b.minX
    const top = b.minY
    const width = Math.max(1, b.maxX - b.minX)
    const height = Math.max(1, b.maxY - b.minY)

    return (
      // biome-ignore lint/a11y/useFocusableInteractive: <explanation>
      // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
      <div
        key={g.key}
        role="button"
        className="rng__group"
        style={{ left, top, width, height }}
        onPointerDown={onStopPropagation}
        onClick={(e) => {
          e.stopPropagation()
          const targetK = Math.max(transformRef.current.k * 1.35, CLUSTER_ZOOM_THRESHOLD * 1.25)
          zoomToWorldPoint(g.center.x, g.center.y, targetK, 250)
        }}
      >
        <div className="rng__groupLabel">+{g.members.length}</div>
      </div>
    )
  }

  const renderedNodesOverlay = useMemo(() => {
    // ADDED NEWLY - HIERARCHICAL EXPANSION: NODE RENDERING
    // Filters to only render nodes that are:
    //   1) In the current expansion path (breadcrumb trail), OR
    //   2) Direct children of the currently focused node
    // This creates the focused hierarchical view where only relevant nodes are shown.
    const nodesWithPos = visibleNodes.filter((n) => positions.has(n.key))

    // ADDED NEWLY - COLLAPSED NODE BOXES
    // Render surrounding boxes for nodes with collapsed children
    const collapsedBoxes = nodesWithPos
      .filter(n => {
        const info = collapsedNodeInfo.get(n.key)
        return info && info.hiddenChildren > 0
      })
      .map(n => {
        const p = positions.get(n.key)
        if (!p) return null

        const info = collapsedNodeInfo.get(n.key)!
        const ContentContextMenu = renderNodeContextMenu ?? (() => null)

        // Box surrounds the node with padding
        // INCREASED padding from 15 to 20 to prevent box collisions when multiple nodes are expanded
        const padding = 20
        const boxWidth = NODE_BOX_WIDTH + padding * 2
        const boxHeight = NODE_BOX_HEIGHT + padding * 2
        const boxLeft = p.x - boxWidth / 2
        const boxTop = p.y - boxHeight / 2

        return (
          <div
            key={`collapsed-box-${n.key}`}
            className="rng__collapsedBox"
            style={{
              position: 'absolute',
              left: boxLeft,
              top: boxTop,
              width: boxWidth,
              height: boxHeight,
              border: '2px dashed #3b82f6',
              borderRadius: '8px',
              background: 'rgba(0, 0, 0, 0.05)',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          >
            {/* Count badge at top-right corner */}
            <div
              style={{
                position: 'absolute',
                top: '-10px',
                right: '-10px',
                background: '#3b82f6',
                color: 'white',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: '600',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                pointerEvents: 'all',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              onClick={(e) => {
                e.stopPropagation()
                // Navigate back to this node to show all its children
                const nodeIndex = expansionPath.indexOf(n.key)
                if (nodeIndex !== -1) {
                  setExpansionPath(expansionPath.slice(0, nodeIndex + 1))
                }
              }}
              onMouseEnter={() => setMenuNodeKey(n.key)}
              onMouseLeave={() => setMenuNodeKey(null)}
            >
              +{info.hiddenChildren}
              
              {/* Context menu trigger - invisible but clickable */}
              <div 
                style={{ 
                  position: 'relative',
                  width: '14px',
                  height: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuNodeKey(n.key)
                }}
              >
                {/* Three dots menu icon */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  cursor: 'pointer',

                }}>
                  <div style={{ width: '3px', height: '3px', borderRadius: '70%' }} />
                  <div style={{ width: '3px', height: '3px', borderRadius: '70%' }} />
                  <div style={{ width: '3px', height: '3px', borderRadius: '70%' }} />
                </div>
                
                {/* Context menu */}
                <div style={{ position: 'absolute', top: 0, left: 0  ,  color: '#000000'}}>
                  <ContentContextMenu
                    open={menuNodeKey === n.key}
                    onOpenChange={(open) => setMenuNodeKey(open ? n.key : null)}
                    node={n}
                    
                  />
                </div>
              </div>
            </div>
          </div>
        )
      })

    if (!effectiveClusterMode) {
      // Normal mode: render all visible nodes with their tooltips and interactions
      return (
        <>
          {collapsedBoxes}
          {nodesWithPos.map(renderNodeElement)}
        </>
      )
    }

    // Cluster mode: aggregate nodes into groups when zoomed out
    // - Groups with >1 member are rendered as cluster rectangles with count badges
    // - Nodes that are alone in their group still render normally
    const groups = cluster.groups
    const rects = groups.filter((g) => g.members.length > 1).map(renderClusterRect)

    const singles = new Set(groups.filter((g) => g.members.length === 1).map((g) => g.members[0]))
    const singleNodes = nodesWithPos.filter((n) => singles.has(n.key))

    return (
      <>
        {collapsedBoxes}
        {rects}
        {singleNodes.map(renderNodeElement)}
      </>
    )
  }, [
    visibleNodes,
    positions,
    effectiveClusterMode,
    cluster.groups,
    cluster.groupBounds,
    menuNodeKey,
    renderNodeTooltip,
    renderNodeContextMenu,
    onNodeClick,
    expansionPath,
    isDraggingNode,
    draggingNodeKey,
    onNodeExpandableClick,
    collapsedNodeInfo,
  ])

  const uiScale = 1 / transform.k
  const uiScaleClamped = clamp(uiScale, 0.75, 1.15) // min/max

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: <explanation>
    <div
      ref={containerRef}
      className={`rng ${menuNodeKey ? "rng--menuOpen" : ""} ${isDraggingNode ? "rng--dragging" : ""}`}
      tabIndex={0} // to receive keyboard events
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      onFocusCapture={() => setIsFocusWithin(true)}
      onBlurCapture={(e) => {
        // it also fires when focusing from one node to another inside:
        // we check if the new focus is still inside.
        const next = e.relatedTarget as Node | null
        if (next && containerRef.current?.contains(next)) return
        setIsFocusWithin(false)
      }}
      onKeyDownCapture={onKeyDownCapture}
    >
      {measuredWidth > 0 && measuredHeight > 0 && (
        <>
          <svg ref={svgRef} width={measuredWidth} height={measuredHeight} className="rng__svg">
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
                markerWidth="20"
                markerHeight="10"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path
                  d="M 0 5 L 6 0 L 6 3 L 14 3 L 14 0 L 20 5 L 14 10 L 14 7 L 6 7 L 6 10 Z"
                  fill="currentColor"
                />
              </marker>
            </defs>

            <g ref={gRef}>
              {renderedMap}
              <g className="rng__edges">
                {renderedEdges}
              </g>
            </g>
          </svg>
          <div ref={overlayRef}
             className="rng__overlay"
               style={{ ["--uiScale" as any]: uiScaleClamped }}>
            {renderedNodesOverlay}
          </div>
        </>
      )}
    </div>
  )}
)



