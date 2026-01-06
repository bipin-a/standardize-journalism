'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/money-flow', label: 'Money Flow' },
  { href: '/contracts', label: 'Contracts' },
  { href: '/spending', label: 'Spending' },
  { href: '/wards', label: 'Wards' },
  { href: '/council', label: 'Council' },
  { href: '/budget', label: 'Budget' },
  { href: '/about', label: 'About' }
]

const getLinkStyle = (active) => ({
  fontSize: '12px',
  fontWeight: active ? 700 : 600,
  color: active ? '#111827' : '#6b7280',
  textDecoration: 'none',
  padding: '6px 10px',
  borderRadius: '999px',
  backgroundColor: active ? '#f3f4f6' : 'transparent'
})

const SiteHeader = () => {
  const pathname = usePathname()

  return (
    <header
      style={{
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#ffffff'
      }}
    >
      <div
        style={{
          maxWidth: '900px',
          margin: '0 auto',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <Link
          href="/"
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: '#111827',
            textDecoration: 'none'
          }}
        >
          Toronto Money Flow
        </Link>
        <nav style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href} style={getLinkStyle(active)}>
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
