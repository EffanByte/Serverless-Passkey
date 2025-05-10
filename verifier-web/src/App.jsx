// app/src/App.jsx

import React, { useState, useRef } from 'react'
import EquinoxLogo from './assets/Equinox.png'
import Starfield from './Starfield'
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa'

const SERVICE_UUID        = '0000feed-0000-1000-8000-00805f9b34fb'
const CHARACTERISTIC_UUID = '0000beef-0000-1000-8000-00805f9b34fb'
const EXPECTED_SIG_BYTES  = ml_dsa44.SIG_BYTES

export default function App() {
  const [charac, setCharac]           = useState(null)
  const [status, setStatus]           = useState('Idle')
  const [publicKeyLoaded, setPublicKeyLoaded] = useState(false)
  const publicKeyRef                  = useRef(null)    // Uint8Array
  const challengeBufRef               = useRef(null)    // ArrayBuffer
  const pubKeyAccumRef                = useRef('')      // JSON accumulator
  const sigChunksRef                  = useRef([])      // Array<Uint8Array>
  const receivedSigLenRef             = useRef(0)

  const connectToPhone = async () => {
    try {
      console.log('▶️ connectToPhone: requesting Bluetooth device')
      setStatus('Requesting device…')
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
      })

      console.log(`▶️ connectToPhone: connecting to GATT on ${device.name}`)
      setStatus(`Connecting to ${device.name || 'unknown device'}…`)
      const server = await device.gatt.connect()

      console.log('▶️ connectToPhone: getting service')
      setStatus('Getting service…')
      const service = await server.getPrimaryService(SERVICE_UUID)

      console.log('▶️ connectToPhone: getting characteristic')
      setStatus('Getting characteristic…')
      const c = await service.getCharacteristic(CHARACTERISTIC_UUID)

      console.log('▶️ connectToPhone: starting notifications')
      setStatus('Subscribing to notifications…')
      await c.startNotifications()

      console.log('▶️ connectToPhone: wiring up handler')
      c.addEventListener('characteristicvaluechanged', handleNotification)

      setCharac(c)
      setStatus('✅ Subscribed! Waiting for public key…')
      console.log('🔔 Subscribed to notifications, ready for public key')
    } catch (err) {
      console.error(err)
      setStatus('❌ ' + err.message)
    }
  }

  const sendChallengeAndReply = async () => {
    if (!charac) {
      alert('Not connected yet!')
      return
    }
    if (!publicKeyLoaded) {
      alert('Still waiting for the Dilithium public key—cannot send challenge yet.')
      setStatus('⚠️ No public key yet')
      return
    }

    const challenge = window.crypto.getRandomValues(new Uint8Array(16))
    challengeBufRef.current = challenge.buffer
    setStatus(`Writing challenge (${challenge.length} bytes)…`)
    await charac.writeValue(challenge)
    console.log('▶️ Challenge sent:', challenge)
  }

  const handleNotification = async (event) => {
    const bytes = new Uint8Array(event.target.value.buffer)
    console.log('🔔 Raw notification chunk:', bytes)

    // 1) Accumulate & parse public‐key JSON until we see {"sigPub":…}
    if (!publicKeyLoaded) {
      pubKeyAccumRef.current += new TextDecoder().decode(bytes)
      try {
        const { sigPub } = JSON.parse(pubKeyAccumRef.current)
        const raw = Uint8Array.from(atob(sigPub), c => c.charCodeAt(0))
        publicKeyRef.current = raw
        setPublicKeyLoaded(true)
        setStatus('🔑 Public key imported — ready to send challenge')
        console.log(`🔑 Dilithium public key imported: ${raw.length} bytes`)
      } catch {
        // not complete JSON yet
      }
      return
    }

    // 2) Collect signature chunks
    sigChunksRef.current.push(bytes)
    receivedSigLenRef.current += bytes.length
    console.log(
      `🔔 Got chunk ${bytes.length} bytes ` +
      `(so far ${receivedSigLenRef.current}/${EXPECTED_SIG_BYTES})`
    )

    if (receivedSigLenRef.current < EXPECTED_SIG_BYTES) {
      setStatus(
        `🔔 Received ${receivedSigLenRef.current}/${EXPECTED_SIG_BYTES} bytes… waiting for more`
      )
      return
    }

    // 3) Reassemble full signature
    const fullSig = new Uint8Array(receivedSigLenRef.current)
    let off = 0
    for (const chunk of sigChunksRef.current) {
      fullSig.set(chunk, off)
      off += chunk.length
    }
    sigChunksRef.current = []
    receivedSigLenRef.current = 0

    setStatus(`🔔 Full signature received (${fullSig.length} bytes), verifying…`)
    console.log(`🔔 Full signature assembled (${fullSig.length} bytes), verifying…`)

    // 4) Verify with Dilithium-2
    try {
      console.log('🔍 Verification inputs – pubkey:', publicKeyRef.current)
      console.log('🔍 Verification inputs – challenge:', new Uint8Array(challengeBufRef.current))
      console.log('🔍 Verification inputs – signature:', fullSig)

      const valid = await ml_dsa44.verify(
        publicKeyRef.current,
        new Uint8Array(challengeBufRef.current),
        fullSig
      )
      console.log('💡 Signature valid?', valid)
      setStatus(
        valid
          ? '✅ Signature valid — authentication successful'
          : '❌ Signature invalid — authentication failed'
      )
    } catch (e) {
      console.error(e)
      setStatus(`❌ Verification error: ${e.message}`)
    }
  }

  return (
    <>
      <Starfield />
      <div style={{ ...styles.outer, position: 'relative', zIndex: 2 }}>
        <div style={styles.container}>
          <header style={styles.header}>
            <img src={EquinoxLogo} alt="Equinox Logo" style={styles.logo} />
          </header>
          <main style={styles.mainContent}>
            <h1 style={styles.title}>Seamless & Secure Logins with Passkeys</h1>
            <p style={styles.subtitle}>
              Authenticate instantly from your phone to the web using Bluetooth Low Energy — no passwords, no hassle.
            </p>
            <p style={styles.features}>Works across devices · End-to-end secure · No app switching</p>
            <div style={styles.card}>
              <div style={styles.statusContainer}>
                <p style={styles.status}>Status: {status}</p>
              </div>
              <div style={styles.buttonContainer}>
                <button
                  onClick={connectToPhone}
                  style={{ ...styles.button, ...styles.primaryButton }}
                >
                  Connect to Phone
                </button>
                <button
                  onClick={sendChallengeAndReply}
                  disabled={!charac || !publicKeyLoaded}
                  style={{
                    ...styles.button,
                    ...styles.secondaryButton,
                    ...(!charac || !publicKeyLoaded ? styles.buttonDisabled : {}),
                  }}
                >
                  Send Challenge & Reply
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

const styles = {
  outer: {
    minHeight: '100vh', width: '100vw',
    background: 'transparent',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
  },
  container: {
    width: '100%', maxWidth: '1200px',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center',
    fontFamily: 'Helvetica, Arial, sans-serif',
    color: '#fff',
  },
  header: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'center', marginBottom: '1rem',
    width: '100%',
  },
  logo:    { height: '320px', objectFit: 'contain' },
  mainContent: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', textAlign: 'center',
    width: '100%', padding: '0 1rem',
  },
  title: {
    fontSize: '2.8rem', fontWeight: '700',
    marginBottom: '1rem', lineHeight: '1.2', color: '#fff',
  },
  subtitle: {
    fontSize: '1.2rem', fontWeight: '400',
    maxWidth: '800px', marginBottom: '1.5rem', lineHeight: '1.6',
    color: '#fff',
  },
  features: { fontSize: '1.1rem', marginBottom: '1.5rem', color: '#fff' },
  card: {
    backgroundColor: '#111', borderRadius: '16px',
    padding: '1.5rem', boxShadow: '0 6px 32px rgba(0,0,0,0.25)',
    maxWidth: '600px', display: 'flex',
    flexDirection: 'column', alignItems: 'center',
  },
  statusContainer: {
    marginBottom: '1rem', padding: '1rem',
    borderRadius: '8px', backgroundColor: '#222',
    width: '100%',
  },
  status:     { fontSize: '1rem', color: '#fff', fontWeight: '700' },
  buttonContainer:{ display:'flex',gap:'1.5rem',justifyContent:'center' },
  button: {
    padding:'1rem 2.5rem', borderRadius:'10px',
    border:'none',fontSize:'1.15rem',fontWeight:'600',
    cursor:'pointer',boxShadow:'0 2px 8px rgba(0,0,0,0.15)',
  },
  primaryButton:{ backgroundColor:'#fff',color:'#000',border:'2px solid #fff' },
  secondaryButton:{ backgroundColor:'transparent',color:'#fff',border:'2px solid #fff' },
  buttonDisabled:{ opacity:0.5,cursor:'not-allowed' },
}
