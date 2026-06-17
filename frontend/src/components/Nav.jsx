import { Link, useLocation } from 'react-router-dom'

export default function Nav() {
  const { pathname } = useLocation()
  return (
    <nav style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '0 32px',
      display: 'flex',
      alignItems: 'center',
      gap: 32,
      height: 56,
    }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Diamond shape */}
          <polygon points="16,2 30,16 16,30 2,16" fill="#1d4ed8" opacity="0.15" stroke="#3b82f6" strokeWidth="1.5"/>
          {/* Inner diamond */}
          <polygon points="16,7 25,16 16,25 7,16" fill="#1d4ed8" opacity="0.25" stroke="#60a5fa" strokeWidth="1"/>
          {/* Baseball seam arcs */}
          <path d="M11,13 Q16,10 21,13" stroke="#f87171" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          <path d="M11,19 Q16,22 21,19" stroke="#f87171" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          {/* Center dot */}
          <circle cx="16" cy="16" r="2" fill="#60a5fa"/>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span style={{ color: 'var(--text)', fontWeight: 800, fontSize: 15, letterSpacing: '-0.02em' }}>DIAMOND</span>
          <span style={{ color: '#3b82f6', fontWeight: 700, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Blueprint</span>
        </div>
      </Link>
      <NavLink to="/" active={pathname === '/'}>Search</NavLink>
    </nav>
  )
}

function NavLink({ to, children, active }) {
  return (
    <Link to={to} style={{
      color: active ? 'var(--accent2)' : 'var(--text-muted)',
      fontWeight: 500,
      fontSize: 13,
      transition: 'color .15s',
    }}>
      {children}
    </Link>
  )
}
