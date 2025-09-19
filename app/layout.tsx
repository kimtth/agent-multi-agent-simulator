import './globals.css'
import type { ReactNode } from 'react'
import { Theme, ThemePanel } from '@radix-ui/themes'
import '@radix-ui/themes/styles.css'

export const metadata = {
  title: 'Multi-Agent LLM Simulator',
  description: 'Refactored React/Next.js multi-agent simulation with Azure OpenAI & OpenAI support'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0" />
      </head>
      <body>
        <Theme accentColor="indigo" grayColor="slate" radius="large" scaling="100%">
          {children}
          {process.env.NODE_ENV === 'development' && <ThemePanel />}
        </Theme>
      </body>
    </html>
  )
}
