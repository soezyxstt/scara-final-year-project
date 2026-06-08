'use client'

import * as React from 'react'
import { GripVertical } from 'lucide-react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { cn } from '@/lib/utils'

const ResizablePanelGroup = ({
  className,
  direction = 'horizontal',
  ...props
}: React.ComponentProps<typeof Group> & {
  direction?: 'horizontal' | 'vertical'
}) => (
  <Group
    orientation={direction}
    className={cn(
      'flex h-full w-full',
      className
    )}
    {...props}
  />
)

const ResizablePanel = Panel

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean
}) => (
  <Separator
    className={cn(
      'group relative flex items-center justify-center bg-transparent transition-all outline-none select-none z-10',
      // For vertical separator (horizontal layout split, default): 8px wide target
      'w-2 h-full cursor-col-resize hover:bg-hmi-ideal/10 active:bg-hmi-ideal/20',
      'aria-[orientation=vertical]:w-2 aria-[orientation=vertical]:h-full aria-[orientation=vertical]:cursor-col-resize',
      // For horizontal separator (vertical layout split): 8px high target
      'aria-[orientation=horizontal]:h-2 aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:cursor-row-resize',
      className
    )}
    {...props}
  >
    {/* Inner visually thin divider line that glows on hover/drag */}
    <div
      className={cn(
        'transition-colors bg-hmi-grid duration-150',
        'group-hover:bg-hmi-ideal group-active:bg-hmi-ideal',
        // Vertical separator (left-right split): vertical line
        'w-[1px] h-full',
        // Horizontal separator (top-bottom split): horizontal line
        'group-aria-[orientation=horizontal]:h-[1px] group-aria-[orientation=horizontal]:w-full'
      )}
    />

    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded border border-hmi-grid bg-hmi-panel">
        <GripVertical className="h-2.5 w-2.5 text-hmi-muted" />
      </div>
    )}
  </Separator>
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
