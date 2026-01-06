import ChatWidget from './components/ChatWidget'
import SiteHeader from './components/SiteHeader'

export const metadata = {
  title: 'Toronto Money Flow',
  description: 'Track Toronto municipal spending',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ 
        margin: 0, 
        fontFamily: 'system-ui, -apple-system, sans-serif',
        backgroundColor: '#f5f5f5',
        minHeight: '100vh'
      }}>
        <SiteHeader />
        <main
          style={{
            maxWidth: '900px',
            margin: '0 auto',
            backgroundColor: 'white',
            minHeight: '100vh'
          }}
        >
          {children}
        </main>
        <ChatWidget mode="floating" />
      </body>
    </html>
  )
}
