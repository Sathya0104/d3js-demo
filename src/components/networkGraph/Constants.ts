/**
 * Constants for the Network Graph component.
 */
import {NetworkGraphConfig} from "./types/ComponentsType"

export const ICON_TOP = 4
export const LABEL_LINE_FONT_SIZE = 10
export const LABEL_NODE_FONT_SIZE = 12
export const ICON_SIZE = 24
export const EDGE_DEFAULT_COLOR = "#98A2B3"
export const EDGE_DEFAULT_THICKNESS = 1.5
export const NODE_BOX_WIDTH = 90
export const NODE_BOX_HEIGHT = 50
export const BACKGROUND_DEFAULT = "#FFFFFF"

export const iconCenterYOffset = -(NODE_BOX_HEIGHT / 2) + ICON_TOP + ICON_SIZE / 2

export const defaultConfig: NetworkGraphConfig = {
  maxDepth: 7,
  childSpreadDeg: 80,
  bezierCurves: false,
  minZoom: 0.25,
  maxZoom: 3,
}

