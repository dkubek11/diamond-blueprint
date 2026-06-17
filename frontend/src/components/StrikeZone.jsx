import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

/*
  Statcast zone layout (catcher's view):
    1  2  3    ← top
    4  5  6    ← middle
    7  8  9    ← bottom
  Shadow/chase:
   11 = inside,  12 = outside,  13 = up,  14 = down
*/

const ZONE_GRID = {
  // [col, row] in a 5×5 grid where [1,1]=top-left inner
  1:  [1, 1], 2:  [2, 1], 3:  [3, 1],
  4:  [1, 2], 5:  [2, 2], 6:  [3, 2],
  7:  [1, 3], 8:  [2, 3], 9:  [3, 3],
  11: [0, 1], 12: [4, 1],              // inner / outer shadow (mid height)
  13: [1, 0], 14: [1, 4],              // up / down shadow (inner col)
}

// Catcher-view: inside = left side of zone for RHH, right for LHH
// We'll label based on stand prop but keep zone numbers fixed

export default function StrikeZone({ zones = [], activePitch = null, stand = 'R', width = 300 }) {
  const svgRef = useRef(null)

  useEffect(() => {
    if (!svgRef.current) return

    const W = width
    const H = Math.round(W * 1.1)
    const pad = { top: 32, left: 32, right: 32, bottom: 32 }
    const inner = { w: W - pad.left - pad.right, h: H - pad.top - pad.bottom }

    // 5 columns × 5 rows grid
    const cellW = inner.w / 5
    const cellH = inner.h / 5

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H)

    const g = svg.append('g').attr('transform', `translate(${pad.left},${pad.top})`)

    // Build score lookup by zone id
    const scoreByZone = {}
    if (zones.length) {
      const scores = zones.map(z => z.score)
      const extent = d3.extent(scores)
      const colorScale = d3.scaleSequential()
        .domain(extent)
        .interpolator(d3.interpolateRgbBasis(['#1d4ed8', '#93c5fd', '#f8fafc', '#fca5a5', '#dc2626']))

      zones.forEach(z => {
        scoreByZone[z.zone] = { score: z.score, color: colorScale(z.score), data: z }
      })
    }

    // Draw cells
    Object.entries(ZONE_GRID).forEach(([zoneId, [col, row]]) => {
      const zid = parseInt(zoneId)
      const x = col * cellW
      const y = row * cellH
      const isInZone = zid <= 9
      const isActive = activePitch && activePitch.best_zone && activePitch.best_zone.zone === zid
      const cell = scoreByZone[zid]

      // Shadow zones slightly smaller
      const shrink = isInZone ? 0 : 3
      const rx = x + shrink, ry = y + shrink
      const rw = cellW - shrink * 2, rh = cellH - shrink * 2

      // Cell fill
      g.append('rect')
        .attr('x', rx).attr('y', ry)
        .attr('width', rw).attr('height', rh)
        .attr('rx', isInZone ? 4 : 6)
        .attr('fill', cell ? cell.color : (isInZone ? '#1e2d45' : '#111827'))
        .attr('stroke', isActive ? '#fbbf24' : (isInZone ? '#2d4060' : '#1a2a3a'))
        .attr('stroke-width', isActive ? 3 : 1)
        .attr('opacity', isInZone ? 1 : 0.75)

      // Zone number
      g.append('text')
        .attr('x', rx + rw / 2).attr('y', ry + rh / 2 - (cell ? 6 : 0))
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('fill', cell ? (isLightColor(cell.color) ? '#0f172a' : '#f8fafc') : '#334155')
        .attr('font-size', 11).attr('font-weight', 600)
        .attr('font-family', 'JetBrains Mono, monospace')
        .text(zid <= 9 ? zid : '')

      // Whiff rate label inside cell
      if (cell && cell.data.whiff_rate != null) {
        g.append('text')
          .attr('x', rx + rw / 2).attr('y', ry + rh / 2 + 10)
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
          .attr('fill', isLightColor(cell.color) ? '#1e3a5f' : '#bfdbfe')
          .attr('font-size', 10)
          .text(`${(cell.data.whiff_rate * 100).toFixed(0)}% K`)
      }

      // Gold star for best zone
      if (isActive) {
        g.append('text')
          .attr('x', rx + rw - 6).attr('y', ry + 12)
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
          .attr('font-size', 12)
          .text('★')
          .attr('fill', '#fbbf24')
      }
    })

    // Strike zone border (inner 3×3)
    g.append('rect')
      .attr('x', cellW).attr('y', cellH)
      .attr('width', cellW * 3).attr('height', cellH * 3)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4 2')
      .attr('rx', 2)

    // Labels
    const inLabel = stand === 'R' ? 'Inside' : 'Outside'
    const outLabel = stand === 'R' ? 'Outside' : 'Inside'
    g.append('text').attr('x', cellW * 0.5).attr('y', -14)
      .attr('text-anchor', 'middle').attr('fill', '#475569').attr('font-size', 10).text(inLabel)
    g.append('text').attr('x', cellW * 4.5).attr('y', -14)
      .attr('text-anchor', 'middle').attr('fill', '#475569').attr('font-size', 10).text(outLabel)
    g.append('text').attr('x', -20).attr('y', cellH * 1.5)
      .attr('text-anchor', 'middle').attr('fill', '#475569').attr('font-size', 10)
      .attr('writing-mode', 'tb').text('Up')
    g.append('text').attr('x', -20).attr('y', cellH * 3.5)
      .attr('text-anchor', 'middle').attr('fill', '#475569').attr('font-size', 10)
      .attr('writing-mode', 'tb').text('Down')

  }, [zones, activePitch, stand, width])

  return <svg ref={svgRef} style={{ display: 'block' }} />
}

function isLightColor(hex) {
  if (!hex || !hex.startsWith('#')) return false
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}
