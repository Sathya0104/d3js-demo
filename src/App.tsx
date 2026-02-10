/**
 * Network Graph example application
 *
 * @author
 * Enrico Tedeschini
 */
import React, {useEffect, useMemo, useRef, useState} from "react"
import {NetworkGraphHandle, NetworkNode}  from "./components/networkGraph/types/ComponentsType"
import { NetworkGraph }                   from "./components/networkGraph/NetworkGraph"
import { Provider as TooltipProvider }    from "@radix-ui/react-tooltip"
import TooltipNodeComponent               from "./NodeTooltip"
import {NodeContextMenuComponent}         from "./NodeContextMenu";
import {useWorldMap}                      from "./components/networkGraph/NetworkGraphHooks"
import jsPDF                              from "jspdf"
import "./App.scss"

// import model data fro test JSON files
import modelSmall     from "./data/model_small.json"
import modelMedium    from "./data/model_medium.json"
import modelLarge1    from "./data/model_120.json"
import modelLarge2    from "./data/model_250.json"
import modelHuge      from "./data/model_500.json"
import modelGeo       from "./data/model_geo.json"
import modelGeoRadial from "./data/model_geo_radial.json"
import {defaultConfig} from "./components/networkGraph/Constants"
import {generateRandomNetworkModel} from "./GenerateRandomNetworkModel";
import {generateStrictRadialModel} from "./GenerateHierarchicalRadialModel";

const initConfig = {...defaultConfig, maxZoom: 10 }

const models = [
  { id: "1", label: "Small", data: modelSmall, centerKey: "CENTER", layout: "radial" as const },
  { id: "2", label: "Medium", data: modelMedium, centerKey: "CENTER", layout: "radial"  as const },
  { id: "3", label: "120 Nodes", data: modelLarge1, centerKey: "CENTER", layout: "radial" as const },
  { id: "4", label: "250 Nodes", data: modelLarge2, centerKey: "CENTER", layout: "radial" as const },
  { id: "5", label: "500 Nodes", data: modelHuge, centerKey: "CENTER", layout: "radial" as const },
  { id: "6", label: "Geography", data: modelGeo, centerKey: "rom", layout: "geo" as const },
  { id: "7", label: "Geography/Radial", data: modelGeoRadial, centerKey: "rom", layout: "geo" as const, changeLayoutButton: true },
  { id: "gen1", label: "Generated (random dynamic)", data: null, centerKey: "CENTER", layout: "radial" as const },
  { id: "gen2", label: "Generated (hierarchical dynamic)", data: null, centerKey: "CENTER", layout: "radial" as const },
]

export default function App() {
  const graphRef                              = useRef<NetworkGraphHandle | null>(null)
  const [zoom, setZoom]                       = useState(100)
  const [readOnly, setReadOnly]               = useState(false)
  const [bezierCurves, setBezierCurves]       = useState(false)
  const [selectedModelId, setSelectedModelId] = useState(models[0].id)
  const [config, setConfig]                   = useState(initConfig)
  const [layout, setLayout]                   = useState<"radial" | "geo">("radial")
  const [generatedNodesDraft, setGeneratedNodesDraft] = useState(120)
  const [generatedNodes, setGeneratedNodes]   = useState(120)
  const [generatedModel, setGeneratedModel]   = useState(null)
  const [layoutTimeMs, setLayoutTimeMs]       = useState<number | null>(null)
  const { geoJson }                           = useWorldMap()

  useEffect(() => {
    if (selectedModelId === "gen1") {
      setGeneratedModel(generateRandomNetworkModel(generatedNodes))
      return
    }

    if (selectedModelId === "gen2") {
      setGeneratedModel(generateStrictRadialModel(generatedNodes))
      return
    }
  }, [selectedModelId, generatedNodes])

  useEffect(() => {
    if (!selectedModelId.startsWith("gen")) return

    // Debounce delay in ms
    const timeoutId = setTimeout(() => {
      setGeneratedNodes(generatedNodesDraft)
    }, 400)

    // Cleanup to cancel previous timeout
    return () => {
      clearTimeout(timeoutId)
    }
  }, [generatedNodesDraft, selectedModelId])

  const selectedModel = useMemo(() => {
    const activeModel = models.find((m) => m.id === selectedModelId) ?? models[0]
    setLayout(activeModel.layout)

    if (activeModel.id === "gen1" || activeModel.id === "gen2") {
      return {
        ...activeModel,
        data: generatedModel,
      }
    }

    return activeModel
  }, [selectedModelId, generatedModel])

  const onChangeBezierConfig = (flag: boolean) => {
    const newConfig = { ...config, bezierCurves: flag }
    setConfig(newConfig)
    setBezierCurves(flag)
  }

  const onChangeLayout = () => {
    const newLayout = layout === "radial" ? "geo" : "radial"
    setLayout(newLayout)
  }

  const exportPdf = async (filename: string) => {
    if (!graphRef.current) return

    // TODO:
    //  evaluate the jspdf version used by the metadata search where the svg is loaded as a canvas
    //  and this allow to have a very high quality export
    const pdf         = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })
    const svgText     = graphRef.current.exportSvgString()
    const parser      = new DOMParser()
    const svgElement  = parser.parseFromString(svgText, "image/svg+xml").documentElement as unknown as SVGElement
    const pageWidth   = pdf.internal.pageSize.getWidth()
    const pageHeight  = pdf.internal.pageSize.getHeight()
    const widthAttr   = parseFloat(svgElement.getAttribute("width") ?? "0")
    const heightAttr  = parseFloat(svgElement.getAttribute("height") ?? "0")
    const scale       = Math.min(pageWidth / widthAttr, pageHeight / heightAttr)
    await pdf.addSvgAsImage(svgText, 0, 0, widthAttr * scale, heightAttr * scale)
    pdf.save(filename)
  }

  const onChangeModel = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedModelId(e.target.value)

    if (e.target.value === "gen1") {
      setGeneratedModel(generateRandomNetworkModel(generatedNodes))
    } else if (e.target.value === "gen2") {
      setGeneratedModel(generateStrictRadialModel(generatedNodes))
    }
  }

  const onNodeClick = (node: NetworkNode) => {
    console.log("nodeClick", node)
  }

  const onNodeExpandClick = (node: NetworkNode) => {
    // alert(`onNodeExpandClick: ${JSON.stringify(node)}`)
  }



  return (
    <TooltipProvider>
      <div className="app">
        {/* tools bar */}
        <div className="app__toolbar">
          <span className="app__toolbarLabel">Model:</span>
          <select className="app__select" value={selectedModelId} onChange={onChangeModel}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <span className="app__toolbarLabel">Zoom: {zoom}%</span>
          <button type="button" className="app__button" onClick={() => graphRef.current?.zoomToFit()}>Zoom to fit</button>
          <button type="button" className="app__button" onClick={() => graphRef.current?.resetZoom()}>Reset zoom</button>
          <button type="button" className="app__button" onClick={() => graphRef.current?.zoomOut()}>Zoom -</button>
          <button type="button" className="app__button" onClick={() => graphRef.current?.zoomIn()}>Zoom +</button>
          <button type="button" className="app__button" onClick={() => graphRef.current?.downloadSvg("graph.svg")}>Export SVG</button>
          <button type="button" className="app__button" onClick={() => exportPdf("graph.pdf")}>Export PDF</button>
          <span className="app__toolbarLabel">Read-Only:</span>
          <input className="app__checkbox" type={"checkbox"} checked={readOnly} onChange={(e) => {setReadOnly(e.currentTarget.checked)}} />
          <span className="app__toolbarLabel">Bezier Curves:</span>
          <input className="app__checkbox" type={"checkbox"} checked={bezierCurves} onChange={(e) => {onChangeBezierConfig(e.currentTarget.checked)}} />
          {selectedModel.changeLayoutButton && (
            <button type="button" className="app__button" onClick={onChangeLayout}>Change Layout</button>
          )}
          {selectedModelId.startsWith("gen") && (
            <div className="app__toolbar app__toolbar--secondary">
              <span className="app__toolbarLabel">Nodes:</span>
              <input type="range" min={5} max={500} step={1} value={generatedNodesDraft} onChange={(e) => setGeneratedNodesDraft(Number(e.target.value))}/>
              <span className="app__toolbarValue">{generatedNodesDraft}</span>
              {/*<button className="app__button" onClick={() => {setGeneratedNodes(generatedNodesDraft)}}>Generate model</button>*/}
            </div>
          )}
          {layoutTimeMs !== null && (
            <div className="app__toolbarInfo">
              Layout compute time: <strong>{layoutTimeMs} ms</strong>
            </div>
          )}
        </div>

        <div className="app__graphWrap">
          {/* TODO Activate to test the render performance, wiht a huge model ,
              with 500 nodes the October 2025 the time was 32 ms
          <React.Profiler
            id="NetworkGraph"
            onRender={(id, phase, actualDuration, baseDuration) => {
              console.log(
                `[Profiler] ${id} ${phase} actual=${actualDuration.toFixed(2)}ms base=${baseDuration.toFixed(2)}ms`
              )
            }}
          > */}
            <NetworkGraph
              ref={graphRef}
              data={selectedModel.data}
              config={config}
              centerKey={selectedModel.centerKey}
              readOnly={readOnly}
              mapGeoJson={geoJson}
              layout={layout}
              onZoomChange={setZoom}
              onNodeClick={onNodeClick}
              onNodeExpandableClick={onNodeExpandClick}
              renderNodeTooltip={TooltipNodeComponent}
              renderNodeContextMenu={NodeContextMenuComponent}
              onLayoutComputed={setLayoutTimeMs}
            />
          {/*</React.Profiler>*/}
        </div>
      </div>
    </TooltipProvider>
  )
}






