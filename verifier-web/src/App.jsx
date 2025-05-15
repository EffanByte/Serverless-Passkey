// src/App.jsx
import React, { useEffect, useState, useRef } from 'react'
import EquinoxLogo from './assets/Equinox.png'
import Starfield from './Starfield'

const SERVICE_UUID = '0000feed-0000-1000-8000-00805f9b34fb'
const CHARACTERISTIC_UUID = '0000beef-0000-1000-8000-00805f9b34fb'

// ML-DSA-44 constants
const CHALLENGE_LEN = 16   // 16-byte challenges
const PUBKEY_BYTES = 1312 // as before
const CHUNK_SIZE = 512  // must match your Flutter chunkSize

export default function App() {
  const [charac, setCharac] = useState(null)
  const [status, setStatus] = useState('Idle')
  const [publicKeyLoaded, setPublicKeyLoaded] = useState(false)

  const ModuleRef = useRef(null)
  const publicKeyRef = useRef(null)
  const challengeBufRef = useRef(null)
  const pubKeyAccumRef = useRef('')
  const sigChunksRef = useRef([])
  const receivedLenRef = useRef(0)

  // Wait for WASM Module
  useEffect(() => {
    let cancelled = false

      ; (async () => {
        let attempts = 0
        while (
          (!window.Module || !window.Module.HEAPU8 || typeof window.Module._verify !== 'function')
          && attempts < 50
        ) {
          await new Promise(r => setTimeout(r, 100))
          attempts++
        }
        if (!cancelled && window.Module && window.Module.HEAPU8 && typeof window.Module._verify === 'function') {
          ModuleRef.current = window.Module
          console.log('✅ WASM is ready!')
        } else if (!cancelled) {
          console.error('❌ Failed to initialize WASM')
        }
      })()

    return () => { cancelled = true }
  }, [])

  const connectToPhone = async () => {
    try {
      setStatus('Requesting device…')
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }]
      })
      setStatus(`Connecting to ${device.name || 'device'}…`)
      const server = await device.gatt.connect()
      const service = await server.getPrimaryService(SERVICE_UUID)
      const c = await service.getCharacteristic(CHARACTERISTIC_UUID)

      c.addEventListener('characteristicvaluechanged', handleNotification)
      await c.startNotifications()

      setCharac(c)
      setStatus('✅ Subscribed! Waiting for public key…')
    } catch (err) {
      console.error(err)
      setStatus('❌ ' + (err.message || err))
    }
  }

  const sendChallengeAndReply = async () => {
    if (!charac || !publicKeyLoaded) {
      alert('Not connected or public key not yet loaded.')
      return
    }

    const challenge = crypto.getRandomValues(new Uint8Array(CHALLENGE_LEN))
    challengeBufRef.current = challenge.buffer

    console.log('▶️ Challenge sent:', challenge)
    console.log('📏 Challenge length:', challenge.length)

    setStatus(`Writing challenge (${challenge.length} bytes)…`)
    await charac.writeValue(challenge)
  }

  const handleNotification = async (event) => {
    const bytes = new Uint8Array(event.target.value.buffer)
    console.log('🔔 Raw chunk:', bytes)

    // 1) Receive public-key JSON first
    if (!publicKeyRef.current) {
      pubKeyAccumRef.current += new TextDecoder().decode(bytes)
      try {
        const { sigPub } = JSON.parse(pubKeyAccumRef.current)
        console.log('🔑 Web received Base64 pubkey:', sigPub)
        publicKeyRef.current = Uint8Array.from(
          atob(sigPub),
          c => c.charCodeAt(0)
        )
        setPublicKeyLoaded(true)
        setStatus('🔑 Public key imported — click to send challenge')
      } catch {
        // still building JSON
      }
      return
    }

    // 2) Accumulate signature chunks
    sigChunksRef.current.push(bytes)
    receivedLenRef.current += bytes.length
    setStatus(`🔔 Received ${receivedLenRef.current} bytes… waiting`)

    // detect final chunk by size < CHUNK_SIZE
    if (bytes.length === CHUNK_SIZE) {
      return
    }

    // 3) Assemble full signature
    const fullSig = new Uint8Array(receivedLenRef.current)
    let offset = 0
    for (const chunk of sigChunksRef.current) {
      fullSig.set(chunk, offset)
      offset += chunk.length
    }

    setStatus(`🔔 Full signature (${fullSig.length} bytes), verifying…`)
    console.log('✍️ Reassembled signature:', fullSig)

    // ——— VERIFY WITH DEBUG LOGS ———
    try {
      const Module = ModuleRef.current
      if (!Module) throw new Error('WASM Module not initialized')

      const pubKey = publicKeyRef.current
      const challenge = new Uint8Array(challengeBufRef.current)

      // allocate & copy challenge
      const ptrMsg = Module._malloc(CHALLENGE_LEN)
      Module.HEAPU8.set(challenge, ptrMsg)

      // allocate & copy signature
      const sigLen = fullSig.length
      const ptrSig = Module._malloc(sigLen)
      Module.HEAPU8.set(fullSig, ptrSig)

      // allocate & copy public key
      const ptrPub = Module._malloc(PUBKEY_BYTES)
      Module.HEAPU8.set(pubKey, ptrPub)

      // debug pointers & first bytes
      console.log(
        '🔢 ptrSig:', ptrSig, 'sigLen:', sigLen,
        'ptrMsg:', ptrMsg, 'CHALLENGE_LEN:', CHALLENGE_LEN,
        'ptrPub:', ptrPub
      )
      console.log(
        '✍️ sig bytes[0..15]:',
        Array.from(Module.HEAPU8.subarray(ptrSig, ptrSig + Math.min(16, sigLen)))
      )
      console.log(
        '📥 msg bytes:',
        Array.from(Module.HEAPU8.subarray(ptrMsg, ptrMsg + CHALLENGE_LEN))
      )
      console.log(
        '🔑 pub bytes[0..7]:',
        Array.from(Module.HEAPU8.subarray(ptrPub, ptrPub + 8))
      )

      // actual verify
      console.log('🔍 Calling verify(sig, msg, pub)…')
      const result = Module._verify(
        ptrSig, sigLen,
        ptrMsg, CHALLENGE_LEN,
        ptrPub
      )

      console.log('✅ Verification result:', result)
      setStatus(
        result === 0
          ? '✅ Signature valid — authentication successful'
          : '❌ Signature invalid — authentication failed'
      )

      // free all
      Module._free(ptrMsg)
      Module._free(ptrSig)
      Module._free(ptrPub)
    } catch (err) {
      console.error('❌ Verification error:', err)
      setStatus('❌ Verification failed: ' + (err.message || err))
    } finally {
      sigChunksRef.current = []
      receivedLenRef.current = 0
    }
  };  // ← note the semicolon here, ending the arrow function
  

  return (
    <>
      <Starfield />
      <div style={{ minHeight: '100vh', width: '100vw', position: 'relative', zIndex: 2 }}>
        <div style={{
          width: '100%', maxWidth: '1200px', margin: '0 auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          fontFamily: 'Helvetica, Arial, sans-serif', color: '#fff'
        }}>
          <header style={{ margin: '2rem 0' }}>
            <img src={EquinoxLogo} alt="Equinox Logo" style={{ height: '200px' }} />
          </header>

          <main style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '2.5rem' }}>Seamless & Secure Logins with Passkeys</h1>
            <p>PQ-Secure · Works across browsers · No app switching</p>

            <div style={{
              background: '#111', borderRadius: '12px', padding: '1.5rem',
              boxShadow: '0 6px 20px rgba(0,0,0,0.4)', marginTop: '2rem'
            }}>
              <p style={{ fontWeight: 600 }}>Status: {status}</p>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button
                  onClick={connectToPhone}
                  style={{ padding: '0.75rem 1.5rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Connect to Phone
                </button>
                <button
                  onClick={sendChallengeAndReply}
                  disabled={!charac || !publicKeyLoaded}
                  style={{
                    padding: '0.75rem 1.5rem', fontWeight: 600,
                    opacity: !charac || !publicKeyLoaded ? 0.5 : 1,
                    cursor: !charac || !publicKeyLoaded ? 'not-allowed' : 'pointer'
                  }}
                >
                  Send Challenge & Verify
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}
