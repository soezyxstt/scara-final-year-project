'use client'

import { useState, useMemo } from 'react'
import { useHMISlow } from '@/lib/hmi-context'
import { computeCTEList } from '@/lib/cte-utils'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

const PAGE_SIZE = 50

export function ComparisonTable() {
  const { state } = useHMISlow()
  const [page, setPage] = useState(0)

  const { frozenD: d, frozenT: t } = state

  const ctes = useMemo(() => {
    return computeCTEList(t)
  }, [t])

  if (d.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Ideal vs Actual</CardTitle></CardHeader>
        <CardContent><p className="text-xs text-hmi-muted">No data — complete a move first.</p></CardContent>
      </Card>
    )
  }

  const rows = useMemo(() => {
    const r2d = 180 / Math.PI
    return d.map((s, i) => {
      const tp = t[i]
      const eef = tp ? Math.sqrt((tp.xi - tp.xa) ** 2 + (tp.yi - tp.ya) ** 2) : 0
      const cte = ctes[i] ?? 0
      return {
        idx: s.idx,
        t: (s.t / 1000).toFixed(3),
        th1d: (s.th1d * r2d).toFixed(3),
        th1: (s.th1 * r2d).toFixed(3),
        e1: (s.e1 * r2d).toFixed(3),
        th2d: (s.th2d * r2d).toFixed(3),
        th2: (s.th2 * r2d).toFixed(3),
        e2: (s.e2 * r2d).toFixed(3),
        v1: (s.dth1 * r2d).toFixed(3),
        v2: (s.dth2 * r2d).toFixed(3),
        v1d: (s.dth1d * r2d).toFixed(3),
        v2d: (s.dth2d * r2d).toFixed(3),
        pwm1: s.pwm1,
        th1_raw: (s.th1raw * r2d).toFixed(3),
        th2_raw: (s.th2raw * r2d).toFixed(3),
        eef: eef.toFixed(3),
        cte: cte.toFixed(3),
      }
    })
  }, [d, t, ctes])

  const totalPages = Math.ceil(rows.length / PAGE_SIZE)
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function downloadCSV() {
    const header = 'Sample,t(s),θ1_d(°),θ1(°),e1(°),θ2_d(°),θ2(°),e2(°),v1(°/s),v2(°/s),v1d(°/s),v2d(°/s),pwm1,θ1_raw(°),θ2_raw(°),EEF_err(mm),CTE(mm)\n'
    const body = rows.map(r =>
      `${r.idx},${r.t},${r.th1d},${r.th1},${r.e1},${r.th2d},${r.th2},${r.e2},${r.v1},${r.v2},${r.v1d},${r.v2d},${r.pwm1},${r.th1_raw},${r.th2_raw},${r.eef},${r.cte}`
    ).join('\n')
    const blob = new Blob([header + body], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'hmi_data.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Ideal vs Actual ({rows.length} samples)</CardTitle>
          <Button variant="outline" size="sm" onClick={downloadCSV}>Export CSV</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sample</TableHead>
              <TableHead>t (s)</TableHead>
              <TableHead>θ1_d (°)</TableHead>
              <TableHead>θ1 (°)</TableHead>
              <TableHead>e1 (°)</TableHead>
              <TableHead>θ2_d (°)</TableHead>
              <TableHead>θ2 (°)</TableHead>
              <TableHead>e2 (°)</TableHead>
              <TableHead>v1 (°/s)</TableHead>
              <TableHead>v2 (°/s)</TableHead>
              <TableHead>v1d (°/s)</TableHead>
              <TableHead>v2d (°/s)</TableHead>
              <TableHead>pwm1</TableHead>
              <TableHead>θ1_raw (°)</TableHead>
              <TableHead>θ2_raw (°)</TableHead>
              <TableHead>EEF err (mm)</TableHead>
              <TableHead>CTE (mm)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map(r => (
              <TableRow key={r.idx}>
                <TableCell>{r.idx}</TableCell>
                <TableCell>{r.t}</TableCell>
                <TableCell>{r.th1d}</TableCell>
                <TableCell>{r.th1}</TableCell>
                <TableCell>{r.e1}</TableCell>
                <TableCell>{r.th2d}</TableCell>
                <TableCell>{r.th2}</TableCell>
                <TableCell>{r.e2}</TableCell>
                <TableCell>{r.v1}</TableCell>
                <TableCell>{r.v2}</TableCell>
                <TableCell>{r.v1d}</TableCell>
                <TableCell>{r.v2d}</TableCell>
                <TableCell>{r.pwm1}</TableCell>
                <TableCell>{r.th1_raw}</TableCell>
                <TableCell>{r.th2_raw}</TableCell>
                <TableCell>{r.eef}</TableCell>
                <TableCell>{r.cte}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-3 py-2 border-t border-hmi-grid">
          <span className="text-xs text-hmi-muted">
            Page {page + 1} / {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Prev
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
