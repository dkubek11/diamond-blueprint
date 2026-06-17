const COUNTS = [
  [0,0],[0,1],[0,2],
  [1,0],[1,1],[1,2],
  [2,0],[2,1],[2,2],
  [3,0],[3,1],[3,2],
]

const CATEGORY = {
  '0-0':'FP', '0-1':'↑','0-2':'↑↑',
  '1-0':'↓','1-1':'=','1-2':'↑↑',
  '2-0':'↓↓','2-1':'=','2-2':'↑↑',
  '3-0':'↓↓','3-1':'↓↓','3-2':'FL',
}

const CAT_COLOR = {
  'FP':'#3b82f6','↑':'#22c55e','↑↑':'#16a34a',
  '↓':'#f59e0b','↓↓':'#ef4444','=':'#64748b','FL':'#f59e0b',
}

export default function CountSelector({ balls, strikes, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
        Count
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {COUNTS.map(([b, s]) => {
          const active = b === balls && s === strikes
          const cat = CATEGORY[`${b}-${s}`]
          return (
            <button
              key={`${b}-${s}`}
              onClick={() => onChange(b, s)}
              style={{
                padding: '8px 4px',
                background: active ? 'var(--accent)' : 'var(--surface)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 6,
                color: active ? '#fff' : 'var(--text)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 700,
                fontFamily: 'JetBrains Mono, monospace',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                transition: 'all .12s',
              }}
            >
              <span>{b}-{s}</span>
              <span style={{ fontSize: 9, color: active ? 'rgba(255,255,255,.7)' : CAT_COLOR[cat] }}>{cat}</span>
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
        {[['FP','First Pitch'],['↑↑',"Pitcher's"],['↓↓',"Hitter's"],['FL','Full'],['=','Even']].map(([k,v]) => (
          <span key={k} style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            <span style={{ color: CAT_COLOR[k], fontWeight: 700 }}>{k}</span> {v}
          </span>
        ))}
      </div>
    </div>
  )
}
