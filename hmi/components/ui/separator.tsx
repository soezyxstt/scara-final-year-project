import * as React from 'react'
import { cn } from '@/lib/utils'

type SeparatorProps = React.ComponentProps<'div'> & { orientation?: 'horizontal' | 'vertical'; decorative?: boolean }

export function Separator({ className, orientation = 'horizontal', decorative = true, ...props }: SeparatorProps) {
  return <div data-slot="separator" role={decorative ? 'none' : 'separator'} aria-orientation={decorative ? undefined : orientation} data-orientation={orientation} className={cn('shrink-0 bg-hmi-grid data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px', className)} {...props} />
}
