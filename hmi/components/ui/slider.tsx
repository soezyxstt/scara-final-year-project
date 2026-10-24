'use client'

import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'

export const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>>(
  ({ className, 'aria-label': label, 'aria-valuetext': valueText, ...props }, ref) => <SliderPrimitive.Root ref={ref} className={cn('relative flex w-full touch-none select-none items-center data-[disabled]:opacity-40', className)} {...props}>
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-sm bg-hmi-grid">
      <SliderPrimitive.Range className="absolute h-full bg-hmi-ideal" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb aria-label={label} aria-valuetext={valueText} className="block size-4 rounded-full border-2 border-hmi-ideal bg-hmi-panel transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hmi-ideal focus-visible:ring-offset-2 focus-visible:ring-offset-hmi-panel disabled:pointer-events-none" />
  </SliderPrimitive.Root>
)
Slider.displayName = 'Slider'
