import React, { useRef, useState, useMemo, useCallback } from "react"
import type { Meta, StoryObj }                           from "@storybook/react"
import { NetworkGraph }                                  from "./components/networkGraph/NetworkGraph"
import { NetworkGraphHandle, NetworkNode }               from "./components/networkGraph/types/ComponentsType"
import { Provider as TooltipProvider }                   from "@radix-ui/react-tooltip"
import TooltipNodeComponent                              from "./NodeTooltip"
import { NodeContextMenuComponent }                      from "./NodeContextMenu"
import { useWorldMap }                                   from "./components/networkGraph/NetworkGraphHooks"
import { defaultConfig }                                 from "./components/networkGraph/Constants"
import { generateRandomNetworkModel }                    from "./GenerateRandomNetworkModel"
import { generateStrictRadialModel }                     from "./GenerateHierarchicalRadialModel"
import jsPDF                                             from "jspdf"

import modelSmall     from "./data/model_small.json"
import modelMedium    from "./data/model_medium.json"
import modelLarge1    from "./data/model_120.json"
import modelLarge2    from "./data/model_250.json"
import modelHuge      from "./data/model_500.json"
import modelGeo       from "./data/model_geo.json"
import modelGeoRadial from "./data/model_geo_radial.json"

import "./App.scss"

interface AppStoryArgs {
  modelId:
    | "small"
    | "medium"
    | "120"
    | "250"
    | "500"
    | "geo"
    | "geoRadial"
    | "genRandom"
    | "genHierarchical"
  generatedNodes:   number
  readOnly:         boolean
  bezierCurves:     boolean
  /** When true, nodes show an expand button and expansion is handled */
  expansionEnabled: boolean
}

const MODELS = {
  small:           { data: modelSmall,     centerKey: "CENTER", layout: "radial" as const, hasToggle: false },
  medium:          { data: modelMedium,    centerKey: "CENTER", layout: "radial" as const, hasToggle: false },
  "120":           { data: modelLarge1,    centerKey: "CENTER", layout: "radial" as const, hasToggle: false },
  "250":           { data: modelLarge2,    centerKey: "CENTER", layout: "radial" as const, hasToggle: false },
  "500":           { data: modelHuge,      centerKey: "CENTER", layout: "radial" as const, hasToggle: false },
  geo:             { data: modelGeo,       centerKey: "rom",    layout: "geo"    as const, hasToggle: false },
  geoRadial:       { data: modelGeoRadial, centerKey: "rom",    layout: "geo"    as const, hasToggle: true  },
  genRandom:       { data: null,           centerKey: "CENTER", layout: "radial" as const, hasToggle: false },
  genHierarchical: { data: null,           centerKey: "CENTER", layout: "radial" as const, hasToggle: false },
}

function AppStory({
  modelId,
  generatedNodes,
  readOnly,
  bezierCurves,
  expansionEnabled,
}: AppStoryArgs) {
  const graphRef                          = useRef<NetworkGraphHandle | null>(null)
  const [zoom, setZoom]                   = useState(100)
  const [resetKey, setResetKey]           = useState(0)
  const [layoutTimeMs, setLayoutTimeMs]   = useState<number | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<string[]>([])
  const [lastExpanded, setLastExpanded]   = useState<string | null>(null)
  const { geoJson }                       = useWorldMap()

  const activeModel         = MODELS[modelId]
  const [layout, setLayout] = useState<"radial" | "geo">(activeModel.layout)

  const config = useMemo(
    () => ({ ...defaultConfig, maxZoom: 10, bezierCurves }),
    [bezierCurves],
  )

  const data = useMemo(() => {
    if (modelId === "genRandom")       return generateRandomNetworkModel(generatedNodes)
    if (modelId === "genHierarchical") return generateStrictRadialModel(generatedNodes)
    return activeModel.data
  }, [modelId, generatedNodes])

  const onNodeClick = (node: NetworkNode) => {
    if (node.key === activeModel.centerKey) {
      setLayout(activeModel.layout)
      setResetKey((k) => k + 1)
      setExpandedNodes([])
      setLastExpanded(null)
    }
  }

  const onNodeExpandableClick = useCallback((node: NetworkNode) => {
    console.log(`Expanded Node ${JSON.stringify(node)}`)
    setLastExpanded(node.key)
    setExpandedNodes((prev) =>
      prev.includes(node.key)
        ? prev.filter((k) => k !== node.key)
        : [...prev, node.key],
    )
  }, [])

  const exportPdf = async () => {
    if (!graphRef.current) return
    const pdf     = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })
    const svgText = graphRef.current.exportSvgString()
    const parser  = new DOMParser()
    const svgEl   = parser.parseFromString(svgText, "image/svg+xml").documentElement as unknown as SVGElement
    const pw      = pdf.internal.pageSize.getWidth()
    const ph      = pdf.internal.pageSize.getHeight()
    const w       = parseFloat(svgEl.getAttribute("width")  ?? "0")
    const h       = parseFloat(svgEl.getAttribute("height") ?? "0")
    const scale   = Math.min(pw / w, ph / h)
    await pdf.addSvgAsImage(svgText, 0, 0, w * scale, h * scale)
    pdf.save("graph.pdf")
  }

  return (
    <TooltipProvider>
      <div className="app">
        {/* Toolbar */}
        <div className="app__toolbar">
          <span className="app__toolbarLabel">Zoom: {zoom}%</span>
          <button type="button" className="app__button" onClick={() => graphRef.current?.zoomToFit()}>Zoom to fit</button>
          <button type="button" className="app__button" onClick={() => graphRef.current?.resetZoom()}>Reset zoom</button>
          <button type="button" className="app__button" onClick={() => graphRef.current?.zoomOut()}>Zoom −</button>
          <button type="button" className="app__button" onClick={() => graphRef.current?.zoomIn()}>Zoom +</button>
          <button type="button" className="app__button" onClick={() => graphRef.current?.downloadSvg("graph.svg")}>Export SVG</button>
          <button type="button" className="app__button" onClick={exportPdf}>Export PDF</button>

          {activeModel.hasToggle && (
            <button
              type="button"
              className="app__button"
              onClick={() => setLayout((l) => (l === "radial" ? "geo" : "radial"))}
            >
              Change Layout
            </button>
          )}

          {expansionEnabled && (
            <div className="app__toolbarInfo">
              Expanded nodes: <strong>{expandedNodes.length}</strong>
              {lastExpanded && (
                <span style={{ marginLeft: 8 }}>
                  — last: <strong>{lastExpanded}</strong>
                </span>
              )}
              {expandedNodes.length > 0 && (
                <button
                  type="button"
                  className="app__button"
                  style={{ marginLeft: 8 }}
                  onClick={() => { setExpandedNodes([]); setLastExpanded(null) }}
                >
                  Collapse all
                </button>
              )}
            </div>
          )}

          {layoutTimeMs !== null && (
            <div className="app__toolbarInfo">
              Layout compute time: <strong>{layoutTimeMs} ms</strong>
            </div>
          )}
        </div>

        {/* Graph */}
        <div className="app__graphWrap">
          <NetworkGraph
            key={resetKey}
            ref={graphRef}
            data={data}
            config={config}
            centerKey={activeModel.centerKey}
            readOnly={readOnly}
            mapGeoJson={geoJson}
            layout={layout}
            onZoomChange={setZoom}
            onNodeClick={onNodeClick}
            onNodeExpandableClick={expansionEnabled ? onNodeExpandableClick : undefined}
            renderNodeTooltip={TooltipNodeComponent}
            renderNodeContextMenu={NodeContextMenuComponent}
            onLayoutComputed={setLayoutTimeMs}
          />
        </div>
      </div>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Meta — MDX docs page wired up via the `docs.page` import in App.mdx
// ---------------------------------------------------------------------------
const meta = {
  title:     "NetworkGraph/App",
  component: AppStory,
  // autodocs is intentionally NOT set here; the custom MDX page takes over.
  parameters: { layout: "fullscreen" },
  tags:       ["autodocs"], //Automatically docs generated docs.

  argTypes: {
    modelId: {
      name:        "Dataset",
      control:     "select",
      options:     ["small", "medium", "120", "250", "500", "geo", "geoRadial", "genRandom", "genHierarchical"],
      description: "Active dataset / layout",
    },
    generatedNodes: {
      name:        "Generated node count",
      control:     { type: "range", min: 5, max: 500, step: 1 },
      description: "Node count — active only for genRandom / genHierarchical",
    },
    readOnly: {
      name:        "Read-Only",
      control:     "boolean",
      description: "Disable all drag and edit interactions",
    },
    bezierCurves: {
      name:        "Bezier Curves",
      control:     "boolean",
      description: "Render edges as smooth cubic curves",
    },
    expansionEnabled: {
      name:        "Node Expansion",
      control:     "boolean",
      description: "Show expand button on nodes and track expanded state in the toolbar",
    },
  },
} satisfies Meta<typeof AppStory>

export default meta
type Story = StoryObj<typeof meta>

// Shared base defaults
const base: AppStoryArgs = {
  modelId:          "small",
  generatedNodes:   120,
  readOnly:         false,
  bezierCurves:     false,
  expansionEnabled: false,
}

// ===========================================================================
// Stories — all with expansionEnabled: true
// ===========================================================================

export const Small: Story = {
  name: "Small",
  args: { ...base, modelId: "small", expansionEnabled: true },
}

export const Medium: Story = {
  name: "Medium",
  args: { ...base, modelId: "medium", expansionEnabled: true },
}

export const Nodes120: Story = {
  name: "120 Nodes",
  args: { ...base, modelId: "120", expansionEnabled: true },
}

export const Nodes250: Story = {
  name: "250 Nodes",
  args: { ...base, modelId: "250", expansionEnabled: true },
}

export const Nodes500: Story = {
  name: "500 Nodes",
  args: { ...base, modelId: "500", expansionEnabled: true },
}

export const Geography: Story = {
  name: "Geography",
  args: { ...base, modelId: "geo", expansionEnabled: true },
}

export const GeographyRadial: Story = {
  name: "Geography / Radial",
  args: { ...base, modelId: "geoRadial", expansionEnabled: true },
}

export const GeneratedRandom: Story = {
  name: "Generated Random",
  args: { ...base, modelId: "genRandom", generatedNodes: 120, expansionEnabled: true },
}

export const GeneratedHierarchical: Story = {
  name: "Generated Hierarchical",
  args: { ...base, modelId: "genHierarchical", generatedNodes: 120, expansionEnabled: true },
}