'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/money-flow', label: 'Flow' },
  { href: '/contracts', label: 'Contracts' },
  { href: '/spending', label: 'Spending' },
  { href: '/wards', label: 'Wards' },
  { href: '/council', label: 'Council' },
  { href: '/budget', label: 'Budget' },
  { href: '/about', label: 'About' }
]

const SiteHeader = () => {
  const pathname = usePathname()

  return (
    <header
      style={{
        borderBottom: '1px solid #e2e8f0',
        backgroundColor: 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}
    >
      <div
        style={{
          maxWidth: '800px',
          margin: '0 auto',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '24px'
        }}
      >
        <Link
          href="/"
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: '#0f172a',
            textDecoration: 'none',
            letterSpacing: '-0.3px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            background: '#0066CC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: '16px',
            fontWeight: 700
          }}>$</span>
          Toronto Civic Data
        </Link>
        <nav style={{ 
          display: 'flex', 
          gap: '2px',
          flexWrap: 'wrap'
        }}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href
            return (
              <Link 
                key={item.href} 
                href={item.href} 
                style={{
                  fontSize: '13px',
                  fontWeight: active ? 600 : 500,
                  color: active ? '#6366f1' : '#64748b',
                  textDecoration: 'none',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  backgroundColor: active ? '#f1f5f9' : 'transparent',
                  transition: 'all 0.15s ease'
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}

export default SiteHeader
