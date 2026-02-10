declare module '*.svg?react' {
  import { type FunctionComponent, type SVGProps } from 'react'
  const ReactComponent: FunctionComponent<SVGProps<SVGSVGElement>>
  export default ReactComponent
}

declare module '*.svg?raw' {
  const content: string;
  export default content;
}
