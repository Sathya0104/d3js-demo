/**
 * Network Node custom context menu component
 */

import React, {FC, useState}            from "react"
// TODO import icons from our @netenius/ui-assets package and
//   not from local assets to be consistent with other NetScout apps
// import AddSvg                        from '@ngenius/ui-assets/actions/add.svg?react'
// import EditSvg                       from '@ngenius/ui-assets/actions/edit-pen.svg?react'
// import DeleteSvg                     from '@ngenius/ui-assets/actions/delete.svg?react'
import AddSvg                           from './assets/add.svg?react'
import EditSvg                          from './assets/edit.svg?react'
import DeleteSvg                        from './assets/delete.svg?react'
import EllipsisSvg                      from './assets/ellipsis.svg?react'
// TODO import QuickMenu and actions from our @netenius/omnis-components package
// import { StandardAction, QuickMenu }    from '@ngenius/omnis-components'
import * as DropdownMenu                from '@radix-ui/react-dropdown-menu'
import {NetworkGraphNodeContextMenu}    from "./components/networkGraph/types/ComponentsType"


/** VERSION 1 (the best): Node custom context menu example
 * Base don the QuickMenu component from Omnis Components
 * Using this we can have a consistent UX with the rest of the NetScout applications
 * and it reduce the development effort since we don't need to build a
 * custom context menu from scratch
 *
 * PROs:
 * - consistent UX with other NetScout apps
 * - reduced development effort
 * - reduce redundant code
 * - easy to implement
 * - no modal menu is used, so better for user experience
 *
 * It works but it need s a NetScout package */
const NodeContextMenuComponentNetScout: FC<NetworkGraphNodeContextMenu> = ({ open, onOpenChange, node }) => {

   const handleClick = (event: React.MouseEvent | React.KeyboardEvent, id: string): void => {
     // NOTE: required if I want to prevent the onNodeClick event to
     //  be triggered but anyway closes the menu
     // event.stopPropagation()
     // event.preventDefault()
     // onOpenChange(false)
    console.log("onContextMenuItemClick", event.type, id, node.key)
   }

   // Example: you can enable or disable the icons based on the node selected
   // in this case, when you move the mouse over the node with key 'CENTER' or 'nyc' (for geo map),
   // ADD, EDIT and DELETE icons in the context menu are disabled
   const disableCenter = node.key === 'CENTER'  || node.key === 'nyc'

   if (!open) {
    return null
   }
   /* Usable it it's installed
   return (
     <QuickMenu usage='rowContext'>
       <QuickMenu.Item id={StandardAction.ACTION_LAUNCH_MONITORS} onClick={handleClick}/>
       <QuickMenu.Item id="ACTION_ADD" label="IDS_ADD" iconPath={AddSvg} disabled={disableCenter} onClick={handleClick} />
       <QuickMenu.Item id="ACTION_EDIT" label="IDS_EDIT"  disabled={disableCenter} iconPath={EditSvg} onClick={handleClick} />
       <QuickMenu.Item id="ACTION_DELETE" label="IDS_DELETE" disabled={disableCenter} iconPath={DeleteSvg} onClick={handleClick} />
     </QuickMenu>
   )
   */
 }

/** VERSION 2: Node custom context based on Radix UI Dropdown Menu
 *
 * CONs:
 * - extra CSS needed to have a similar look&feel of the QuickMenu component
 * - extra work needed to implement features available out-of-the-box
 * - modal menu is used, so worse for user experience
 * - extra code to have icons in the menu items
 *
 * TODO: It not works properly when used inside the NetworkGraph component
 *  probably due to event propagation issues... to be investigated
 * */
const NodeContextMenuComponentBase: FC<NetworkGraphNodeContextMenu> = ({ /* open, onOpenChange, */ node }) => {

  const [open, setOpen] = useState(false)

  const handleClick1 = (event: React.MouseEvent | React.KeyboardEvent): void => {
    console.log("handleClick", event.type, 'ADD', node.key)
    setOpen(false)
  }
  const handleClick2 = (event: React.MouseEvent | React.KeyboardEvent): void => {
    console.log("handleClick", event.type, 'EDIT', node.key)
    setOpen(false)
  }
  const handleClick3 = (event: React.MouseEvent | React.KeyboardEvent): void => {
    console.log("handleClick", event.type, 'DELETE', node.key)
    setOpen(false)
  }

  // Example: you can enable or disable the icons based on the node selected
  // in this case, when you move the mouse over the node with key 'CENTER' or 'nyc' (for geo map),
  // ADD, EDIT and DELETE icons in the context menu are disabled
  const disableCenter = node.key === 'CENTER' || node.key === 'nyc'

  return (
    <DropdownMenu.Root open={open} onOpenChange={() => setOpen(!open)}>
      <DropdownMenu.Trigger asChild>
        <div className="appContextIcon"><EllipsisSvg/></div>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="appContextContent" side="right" align="start" sideOffset={5}>
          <DropdownMenu.Item className="appContextItem" onClick={handleClick1} disabled={disableCenter}>IDS_ACTION_LAUNCH_MONITORS</DropdownMenu.Item>
          <DropdownMenu.Item className="appContextItem" onClick={handleClick1} disabled={disableCenter}>IDS_ADD</DropdownMenu.Item>
          <DropdownMenu.Item className="appContextItem" onClick={handleClick2} disabled={disableCenter}>IDS_EDIT</DropdownMenu.Item>
          <DropdownMenu.Item className="appContextItem" onClick={handleClick3} disabled={disableCenter}>IDS_DELETE</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

// export const NodeContextMenuComponent = NodeContextMenuComponentNetScout
export const NodeContextMenuComponent = NodeContextMenuComponentBase
