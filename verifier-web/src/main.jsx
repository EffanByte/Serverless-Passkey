import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

async function waitForWasmThenRender() {
  console.log('⏳ Waiting for WASM + exports…')

  let attempts = 0
  while (
    !window.Module?.calledRun ||
    typeof window.Module._verify !== 'function' ||
    !(window.Module.HEAPU8 instanceof Uint8Array)
  ) {
    if (attempts++ >= 50) {
      console.error('❌ WASM still not ready after polling — aborting.')
      return
    }
    await new Promise(res => setTimeout(res, 100))
  }

  console.log('✅ WASM fully ready — rendering React app')
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

waitForWasmThenRender()
