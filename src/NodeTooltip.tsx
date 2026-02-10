/**
 * Example of a custom tooltip component for network graph nodes
 */
import React, {FC} from "react"
import {NetworkGraphNodeTooltip} from "./components/networkGraph/types/ComponentsType"

const TooltipNodeComponent: FC<NetworkGraphNodeTooltip> = ({node}) => {
  return (
    <div className="appTooltip">
      <div className="appTooltip__title">{node.text}</div>
      <div className="appTooltip__sub">{node.key}</div>
    </div>
  )
}
export default TooltipNodeComponent
