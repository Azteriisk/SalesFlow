import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import App from './App.tsx'
import './index.css'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  console.warn("Missing Clerk Publishable Key")
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {PUBLISHABLE_KEY ? (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <App />
      </ClerkProvider>
    ) : (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#1d2021', color: 'white', fontFamily: 'Outfit, sans-serif' }}>
        <h2>Clerk Auth Configuration Required</h2>
        <p>Please create a <code>.env</code> file in the project root with your <code>VITE_CLERK_PUBLISHABLE_KEY</code> to enable authentication.</p>
        <p style={{ marginTop: '1rem', color: '#a1a1aa', fontSize: '0.9rem' }}>See <code>.env.example</code> for details.</p>
      </div>
    )}
  </React.StrictMode>,
)
