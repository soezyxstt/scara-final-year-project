'use client'

import { memo, useMemo, type HTMLAttributes, type ReactNode } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/utils'

interface MathFormulaProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'dangerouslySetInnerHTML'> {
  tex: string
  display?: boolean
}

/** KaTeX emits accessible MathML and rejects trusted HTML/link commands. */
export const MathFormula = memo(function MathFormula({ tex, display = false, className, ...props }: MathFormulaProps) {
  const html = useMemo(() => katex.renderToString(tex, {
    displayMode: display, throwOnError: false, trust: false, strict: 'ignore',
    output: 'htmlAndMathml', maxExpand: 1000,
  }), [tex, display])
  return <span className={cn(display ? 'block' : 'inline-block align-baseline', className)} {...props} dangerouslySetInnerHTML={{ __html: html }} />
})

const SYMBOL = /θ\u0307?[₁₂12]?d?|[εσωτΔ]|e[₁₂]/gu
const TEX_SYMBOLS: Record<string, string> = { ε: '\\varepsilon', σ: '\\sigma', ω: '\\omega', τ: '\\tau', Δ: '\\Delta', 'e₁': 'e_1', 'e₂': 'e_2' }

function symbolTex(symbol: string) {
  if (!symbol.startsWith('θ')) return TEX_SYMBOLS[symbol] ?? symbol
  const index = symbol.match(/[₁₂12]/)?.[0].replace('₁', '1').replace('₂', '2')
  const theta = symbol.includes('\u0307') ? '\\dot{\\theta}' : '\\theta'
  return `${theta}${index ? `_{${index}${symbol.endsWith('d') ? ',\\mathrm{d}' : ''}}` : ''}`
}

/** Converts known math symbols in DOM labels; SVG axis labels stay plain text. */
export const MathLabel = memo(function MathLabel({ children, className }: { children: string; className?: string }) {
  const parts = useMemo(() => {
    const result: ReactNode[] = []
    let position = 0
    for (const match of children.matchAll(SYMBOL)) {
      const index = match.index!
      if (index > position) result.push(children.slice(position, index))
      result.push(<MathFormula key={index} tex={symbolTex(match[0])} />)
      position = index + match[0].length
    }
    if (position < children.length) result.push(children.slice(position))
    return result
  }, [children])
  return <span className={className}>{parts}</span>
})
