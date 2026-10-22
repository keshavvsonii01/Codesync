import './globals.css'
import { GeistSans } from 'geist/font/sans'
import { JetBrains_Mono } from 'next/font/google'

const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata = {
  title: 'CodeSync - Real-Time Collaborative Editor',
  description: 'Code together in real-time with your team',
  icons: { icon: '/favicon-96x96.png' },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}