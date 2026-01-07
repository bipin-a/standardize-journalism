import ChatWidget from './components/ChatWidget'
import SiteHeader from './components/SiteHeader'

export const metadata = {
  title: 'Toronto Civic Data Standardized',
  description: 'Open data dashboard for Toronto municipal finance and civic engagement',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ 
        margin: 0, 
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        backgroundColor: '#fafbfc',
        minHeight: '100vh',
        color: '#0f172a',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale'
      }}>
        <SiteHeader />
        <main>
          {children}
        </main>
        <ChatWidget mode="floating" />
      </body>
    </html>
  )
}
