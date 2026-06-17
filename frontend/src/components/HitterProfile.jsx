import { useEffect, useState } from 'react'
import { getHitterProfile } from '../api'

const LEAGUE = { avg: 0.243, k_pct: 0.228, bb_pct: 0.085, whiff_pct: 0.245, xwoba: 0.320 }

const ZONE_POS = {
  1:[1,1],2:[2,1],3:[3,1],
  4:[1,2],5:[2,2],6:[3,2],
  7:[1,3],8:[2,3],9:[3,3],
  11:[0,1],12:[4,1],13:[2,0],14:[2,4],
}

export default function HitterProfile({ batterId, batterName }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('splits')

  useEffect(() => {
    if (!batterId) return
    setLoading(true)
    getHitterProfile(batterId)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false))
  }, [batterId])

  if (loading) return <div style={sectionStyle}><Skeleton /></div>
  if (!profile) return null

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>{batterName} — Hitter Profile</h2>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['splits','Recent Splits'],['zones','Hot/Cold Zones'],['pitches','Pitch Vulnerability']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: tab === key ? 'var(--accent)' : 'var(--surface2)',
              border: `1px solid ${tab === key ? 'var(--accent)' : 'var(--border)'}`,
              color: tab === key ? '#fff' : 'var(--text-muted)', cursor: 'pointer',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {tab === 'splits' && <SplitsTab profile={profile} />}
      {tab === 'zones' && <ZonesTab zones={profile.hot_cold_zones} samples={profile.sample_sizes} />}
      {tab === 'pitches' && <PitchVulnTab pitches={profile.pitch_vulnerability} samples={profile.sample_sizes} />}
    </div>
  )
}

function SplitsTab({ profile }) {
  const rows = [
    ['Last 7 days', profile.last_7],
    ['Last 30 days', profile.last_30],
  ]
  const stats = [
    { key: 'avg', label: 'AVG', fmt: v => v?.toFixed(3) ?? '—', good: v => v > LEAGUE.avg },
    { key: 'k_pct', label: 'K%', fmt: v => v != null ? pct(v) : '—', good: v => v < LEAGUE.k_pct, invert: true },
    { key: 'bb_pct', label: 'BB%', fmt: v => v != null ? pct(v) : '—', good: v => v > LEAGUE.bb_pct },
    { key: 'whiff_pct', label: 'Whiff%', fmt: v => v != null ? pct(v) : '—', good: v => v < LEAGUE.whiff_pct, invert: true },
    { key: 'xwoba', label: 'xwOBA', fmt: v => v?.toFixed(3) ?? '—', good: v => v > LEAGUE.xwoba },
  ]

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={th}>Period</th>
            <th style={th}>PA</th>
            {stats.map(s => <th key={s.key} style={th}>{s.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, data]) => (
            <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ ...td, fontWeight: 600 }}>{label}</td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{data?.pa ?? '—'}</td>
              {stats.map(s => {
                const val = data?.[s.key]
                const isGood = val != null && s.good(val)
                return (
                  <td key={s.key} style={{ ...td, fontFamily: 'monospace', color: isGood ? 'var(--green)' : val != null && !s.good(val) ? 'var(--red)' : 'var(--text)' }}>
                    {s.fmt(val)}
                  </td>
                )
              })}
            </tr>
          ))}
          {/* League avg row */}
          <tr style={{ borderTop: '1px solid var(--border)', opacity: 0.5 }}>
            <td style={{ ...td, color: 'var(--text-muted)', fontStyle: 'italic' }}>League avg</td>
            <td style={td}>—</td>
            <td style={{ ...td, fontFamily: 'monospace' }}>.243</td>
            <td style={{ ...td, fontFamily: 'monospace' }}>22.8%</td>
            <td style={{ ...td, fontFamily: 'monospace' }}>8.5%</td>
            <td style={{ ...td, fontFamily: 'monospace' }}>24.5%</td>
            <td style={{ ...td, fontFamily: 'monospace' }}>.320</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

const LEAGUE_XWOBA = 0.320


const ZONE_LABELS_SHORT = {
  1:'Up-In',2:'Up-Mid',3:'Up-Away',
  4:'Mid-In',5:'Heart',6:'Mid-Away',
  7:'Dn-In',8:'Dn-Mid',9:'Dn-Away',
  11:'In',12:'Away',13:'Up',14:'Down',
}

const COLOR_STOPS = [
  [8,   48,  107], // deep navy  (very cold)
  [33,  102, 172], // royal blue
  [146, 197, 222], // pale blue
  [247, 247, 247], // white      (league avg)
  [244, 165, 130], // salmon
  [214,  96,  77], // orange-red
  [153,  0,   2],  // deep red   (very hot)
]

function valToRgb(val, scaleLo, scaleHi) {
  const t = Math.max(0, Math.min(1, (val - scaleLo) / Math.max(0.001, scaleHi - scaleLo)))
  const idx = t * (COLOR_STOPS.length - 1)
  const lo = Math.floor(idx), hi2 = Math.min(COLOR_STOPS.length - 1, lo + 1)
  const f = idx - lo
  const a = COLOR_STOPS[lo], b = COLOR_STOPS[hi2]
  return [Math.round(a[0]+(b[0]-a[0])*f), Math.round(a[1]+(b[1]-a[1])*f), Math.round(a[2]+(b[2]-a[2])*f)]
}

function ZoneGrid({ zones, width = 200 }) {
  const byZone = Object.fromEntries(zones.map(z => [z.zone, z]))
  const vals = zones.map(z => z.xwoba)
  const spread = Math.max(0.09, ...vals.map(v => Math.abs(v - LEAGUE_XWOBA)))
  const lo = LEAGUE_XWOBA - spread, hi = LEAGUE_XWOBA + spread

  const W = width
  const cs = Math.round(W * 0.14)       // chase strip size
  const iW = (W - 2 * cs) / 3           // inner cell width
  const iH = iW * 1.1                   // inner cell height (slightly taller)
  const H = Math.round(2 * cs + 3 * iH)

  function fill(id) {
    const z = byZone[id]
    if (!z) return 'rgba(255,255,255,0.04)'
    const [r, g, b] = valToRgb(z.xwoba, lo, hi)
    return `rgb(${r},${g},${b})`
  }

  function label(id) {
    return byZone[id]?.xwoba.toFixed(3) ?? ''
  }

  const inner = [[1,2,3],[4,5,6],[7,8,9]]
  const cellBorder = 'rgba(0,0,0,0.18)'
  const fontSize = Math.round(iW * 0.22)

  return (
    <svg width={W} height={H} style={{ display: 'block', borderRadius: 4, overflow: 'hidden' }}>
      {/* Chase zones */}
      <rect x={cs}     y={0}      width={W - 2*cs} height={cs}     fill={fill(13)} />
      <rect x={cs}     y={H - cs} width={W - 2*cs} height={cs}     fill={fill(14)} />
      <rect x={0}      y={cs}     width={cs}        height={H-2*cs} fill={fill(11)} />
      <rect x={W - cs} y={cs}     width={cs}        height={H-2*cs} fill={fill(12)} />

      {/* Corner fills */}
      <rect x={0}      y={0}      width={cs} height={cs} fill="rgba(255,255,255,0.03)" />
      <rect x={W - cs} y={0}      width={cs} height={cs} fill="rgba(255,255,255,0.03)" />
      <rect x={0}      y={H - cs} width={cs} height={cs} fill="rgba(255,255,255,0.03)" />
      <rect x={W - cs} y={H - cs} width={cs} height={cs} fill="rgba(255,255,255,0.03)" />

      {/* Inner 3×3 */}
      {inner.map((row, ri) => row.map((zid, ci) => (
        <rect key={zid}
          x={cs + ci * iW} y={cs + ri * iH}
          width={iW} height={iH}
          fill={fill(zid)}
          stroke={cellBorder} strokeWidth={1}
        />
      )))}

      {/* xwOBA labels on inner cells */}
      {inner.map((row, ri) => row.map((zid, ci) => {
        const lbl = label(zid)
        if (!lbl) return null
        const cx = cs + ci * iW + iW / 2
        const cy = cs + ri * iH + iH / 2
        return (
          <text key={`t${zid}`} x={cx} y={cy}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={fontSize} fontWeight="700" fill="rgba(0,0,0,0.65)"
          >{lbl}</text>
        )
      }))}

      {/* Dashed strike zone border */}
      <rect x={cs} y={cs} width={W - 2*cs} height={H - 2*cs}
        fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={2} strokeDasharray="6 4"
      />
    </svg>
  )
}

function ZonesTab({ zones, samples }) {
  if (!zones?.length) return (
    <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 0' }}>
      Not enough contact data in the last 20 games.
    </div>
  )

  const vals = zones.map(z => z.xwoba)
  const spread = Math.max(0.09, ...vals.map(v => Math.abs(v - LEAGUE_XWOBA)))
  const lo = LEAGUE_XWOBA - spread, hi = LEAGUE_XWOBA + spread

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 28, alignItems: 'start' }}>
      <div>
        <ZoneGrid zones={zones} width={200} />
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Cold</span>
          <div style={{ flex: 1, height: 4, borderRadius: 3, background: 'linear-gradient(to right,#08306b,#2166ac,#92c5de,#f7f7f7,#f4a582,#d6604d,#99000d)' }} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Hot</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          xwOBA · last {samples?.last_20_games ?? 20} games · {samples?.last_20_games_pitches ?? '?'} pitches
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Zone Breakdown</div>
        {zones.map(z => {
          const isHot = z.xwoba > LEAGUE_XWOBA
          const [dr, dg, db2] = valToRgb(z.xwoba, lo, hi)
          return (
            <div key={z.zone} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: `rgb(${dr},${dg},${db2})` }} />
              <span style={{ fontSize: 12, flex: 1, color: 'var(--text)' }}>{ZONE_LABELS_SHORT[z.zone] ?? `Zone ${z.zone}`}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: isHot ? 'var(--red)' : 'var(--accent)' }}>
                {z.xwoba.toFixed(3)}
              </span>
              <span style={{ fontSize: 10, color: isHot ? 'var(--red)' : 'var(--accent)', fontFamily: 'monospace', minWidth: 44, textAlign: 'right' }}>
                {z.vs_avg > 0 ? '+' : ''}{z.vs_avg.toFixed(3)}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 32, textAlign: 'right' }}>n={z.n}</span>
            </div>
          )
        })}
        <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted)' }}>
          Sorted hottest → coldest · league avg .320
        </div>
      </div>
    </div>
  )
}

function PitchVulnTab({ pitches, samples }) {
  if (!pitches?.length) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Not enough data in the last 15 days.</div>

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>Last 20 games · {samples?.last_20_games_pitches} pitches seen · Red = hitter is crushing it, Green = vulnerable</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <th style={th}>Pitch</th>
            <th style={th}>Whiff%</th>
            <th style={th}>Chase%</th>
            <th style={th}>Hard Hit%</th>
            <th style={th}>GB%</th>
            <th style={th}>Avg EV</th>
            <th style={th}>xwOBA</th>
            <th style={th}>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {pitches.map(p => {
            const crushing = p.xwoba > 0.380
            const vulnerable = p.xwoba < 0.260 || (p.whiff_pct > 0.30)
            return (
              <tr key={p.pitch_type} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...td, fontWeight: 600 }}>{p.pitch_label}</td>
                <td style={{ ...td, fontFamily: 'monospace', color: p.whiff_pct > 0.30 ? 'var(--green)' : 'var(--text)' }}>
                  {p.whiff_pct != null ? pct(p.whiff_pct) : '—'}
                </td>
                <td style={{ ...td, fontFamily: 'monospace', color: p.chase_pct > 0.30 ? 'var(--green)' : 'var(--text)' }}>
                  {p.chase_pct != null ? pct(p.chase_pct) : '—'}
                </td>
                <td style={{ ...td, fontFamily: 'monospace', color: p.hard_hit_pct > 0.40 ? 'var(--red)' : p.hard_hit_pct < 0.25 ? 'var(--green)' : 'var(--text)' }}>
                  {p.hard_hit_pct != null ? pct(p.hard_hit_pct) : '—'}
                </td>
                <td style={{ ...td, fontFamily: 'monospace', color: 'var(--text)' }}>
                  {p.gb_pct != null ? pct(p.gb_pct) : '—'}
                </td>
                <td style={{ ...td, fontFamily: 'monospace', color: p.avg_ev > 92 ? 'var(--red)' : p.avg_ev < 82 ? 'var(--green)' : 'var(--text)' }}>
                  {p.avg_ev != null ? `${p.avg_ev} mph` : '—'}
                </td>
                <td style={{ ...td, fontFamily: 'monospace', color: crushing ? 'var(--red)' : vulnerable ? 'var(--green)' : 'var(--text)' }}>
                  {p.xwoba?.toFixed(3) ?? '—'}
                </td>
                <td style={td}>
                  {crushing && <span className="tag tag-red">Danger</span>}
                  {vulnerable && !crushing && <span className="tag tag-green">Attack</span>}
                  {!crushing && !vulnerable && <span className="tag tag-gray">Neutral</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Skeleton() {
  return <div style={{ height: 120, background: 'var(--surface2)', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
}

const sectionStyle = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 12, padding: '18px 20px', marginTop: 24,
}
const th = { padding: '6px 8px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }
const td = { padding: '8px 8px' }
const pct = v => `${(v * 100).toFixed(1)}%`
