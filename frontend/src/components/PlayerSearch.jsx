import { useState, useRef, useEffect } from 'react'
import { searchPlayers } from '../api'

export default function PlayerSearch({ label, placeholder, selected, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timer = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function handleChange(e) {
    const val = e.target.value
    setQuery(val)
    if (selected) onSelect(null)
    clearTimeout(timer.current)
    if (val.length < 2) { setResults([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await searchPlayers(val)
        setResults(data)
        setOpen(true)
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 300)
  }

  function pick(player) {
    onSelect(player)
    setQuery(player.name)
    setOpen(false)
    setResults([])
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          value={selected ? selected.name : query}
          onChange={handleChange}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: '10px 14px',
            background: 'var(--surface)',
            border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 8,
            color: 'var(--text)',
            fontSize: 14,
            outline: 'none',
          }}
        />
        {selected && (
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--green)', fontSize: 16 }}>✓</span>
        )}
      </div>

      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,.4)',
        }}>
          {results.map(p => (
            <button key={p.id} onClick={() => pick(p)} style={{
              display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left',
              background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer',
              fontSize: 14, borderBottom: '1px solid var(--border)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span style={{ fontWeight: 500 }}>{p.name}</span>
              {p.position && <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: 12 }}>{p.position}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
