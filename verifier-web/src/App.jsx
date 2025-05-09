import React, { useState, useRef } from 'react'
import EquinoxLogo from './assets/Equinox.png'
import Starfield from './Starfield'

const SERVICE_UUID        = '0000feed-0000-1000-8000-00805f9b34fb'
const CHARACTERISTIC_UUID = '0000beef-0000-1000-8000-00805f9b34fb'

const styles = {
  outer: {
    minHeight: '100vh',
    width: '100vw',
    background: 'transparent',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    width: '100%',
    maxWidth: '1200px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    fontFamily: 'Helvetica, Arial, sans-serif',
    color: '#fff',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '1rem',
    width: '100%',
  },
  logo: {
    height: '320px',
    objectFit: 'contain',
  },
  mainContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    width: '100%',
    padding: '0 1rem',
  },
  title: {
    fontSize: '2.8rem',
    fontWeight: '700',
    marginBottom: '1rem',
    lineHeight: '1.2',
    color: '#fff',
  },
  subtitle: {
    fontSize: '1.2rem',
    fontWeight: '400',
    maxWidth: '800px',
    marginBottom: '1.5rem',
    lineHeight: '1.6',
    color: '#fff',
  },
  features: {
    fontSize: '1.1rem',
    marginBottom: '1.5rem',
    color: '#fff',
  },
  card: {
    backgroundColor: '#111',
    borderRadius: '16px',
    padding: '1.5rem',
    boxShadow: '0 6px 32px rgba(0,0,0,0.25)',
    maxWidth: '600px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  statusContainer: {
    marginBottom: '1rem',
    padding: '1rem',
    borderRadius: '8px',
    backgroundColor: '#222',
    width: '100%',
  },
  status: {
    fontSize: '1rem',
    color: '#fff',
    fontWeight: '700',
  },
  buttonContainer: {
    display: 'flex',
    gap: '1.5rem',
    justifyContent: 'center',
  },
  button: {
    padding: '1rem 2.5rem',
    borderRadius: '10px',
    border: 'none',
    fontSize: '1.15rem',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  primaryButton: {
    backgroundColor: '#fff',
    color: '#000',
    border: '2px solid #fff',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    color: '#fff',
    border: '2px solid #fff',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
}

// strip leading zeros from a big-endian integer
function stripLeadingZeros(buf) {
  let i = 0
  while (i < buf.length - 1 && buf[i] === 0) i++
  return buf.slice(i)
}

// turn raw 64-byte r||s into DER-encoded signature
function rawSigToDer(raw) {
  let r = stripLeadingZeros(raw.subarray(0, 32))
  let s = stripLeadingZeros(raw.subarray(32, 64))
  if (r[0] & 0x80) r = Uint8Array.of(0, ...r)
  if (s[0] & 0x80) s = Uint8Array.of(0, ...s)
  const lenR = r.length, lenS = s.length
  const seqLen = 2 + lenR + 2 + lenS
  const der = new Uint8Array(2 + seqLen)
  let off = 0
  der[off++] = 0x30
  der[off++] = seqLen
  der[off++] = 0x02
  der[off++] = lenR
  der.set(r, off); off += lenR
  der[off++] = 0x02
  der[off++] = lenS
  der.set(s, off)
  return der.buffer
}

export default function App() {
  const [charac, setCharac]         = useState(null)
  const [status, setStatus]         = useState('Idle')
  const publicKeyRef                = useRef(null)
  const challengeBufRef             = useRef(null)
  const pubKeyAccumulatedRef        = useRef('')

  const connectToPhone = async () => {
    try {
      setStatus('Requesting device…')
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
      })
      setStatus(`Connecting to ${device.name || 'unknown device'}…`)
      const server = await device.gatt.connect()
      setStatus('Getting service…')
      const service = await server.getPrimaryService(SERVICE_UUID)
      setStatus('Getting characteristic…')
      const c = await service.getCharacteristic(CHARACTERISTIC_UUID)

      setStatus('Subscribing to notifications…')
      await c.startNotifications()
      c.addEventListener('characteristicvaluechanged', handleNotification)

      setCharac(c)
      setStatus('Connected! Ready to send.')
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
    const challenge = window.crypto.getRandomValues(new Uint8Array(16))
    challengeBufRef.current = challenge.buffer
    setStatus(`Writing challenge (${challenge.length} bytes)…`)
    await charac.writeValue(challenge)
    console.log('▶️ Challenge sent:', challenge)
  }

  const handleNotification = async (event) => {
    const bytes = new Uint8Array(event.target.value.buffer)
    console.log('🔔 Raw notification chunk:', bytes)

    // --- 1) accumulate & parse the public‐key JSON ---
    if (!publicKeyRef.current) {
      const chunk    = new TextDecoder().decode(bytes)
      const combo   = pubKeyAccumulatedRef.current + chunk
      try {
        const { x, y } = JSON.parse(combo)
        console.log('🗝️ Received public key JSON:', { x, y })
        const xBytes = Uint8Array.from(atob(x), c=>c.charCodeAt(0))
        const yBytes = Uint8Array.from(atob(y), c=>c.charCodeAt(0))
        const raw    = new Uint8Array(1 + xBytes.length + yBytes.length)
        raw[0] = 0x04; raw.set(xBytes,1); raw.set(yBytes,1+xBytes.length)
        console.log('🗝️ Raw public key bytes:', raw)
        const key = await window.crypto.subtle.importKey(
          'raw', raw.buffer,
          { name: 'ECDSA', namedCurve: 'P-256' },
          false, ['verify']
        )
        publicKeyRef.current = key
        setStatus('🔑 Public key imported')
      } catch {
        // not complete JSON yet
        pubKeyAccumulatedRef.current = combo
      }
      return
    }

    // --- 2) treat all further notifications as the 64‐byte raw signature ---
    console.log('✉️ Received signature bytes:', bytes)
    setStatus(`🔔 Signature received (${bytes.length} bytes)`)
    const key = publicKeyRef.current
    const buf = challengeBufRef.current
    if (!key || !buf) {
      setStatus('⚠️ Missing key or challenge')
      return
    }

    // convert raw→DER then verify
    const derSig = bytes
    console.log('📝 DER-encoded signature:', new Uint8Array(derSig))

    const valid = await window.crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      derSig,
      buf
    )
    console.log('💡 Signature valid?', valid)
    setStatus(
      valid
        ? '✅ Signature valid — authentication successful'
        : '❌ Signature invalid — authentication failed'
    )
  }

  return (
    <>
      <Starfield />
      <div style={{ ...styles.outer, position: 'relative', zIndex: 2 }}>
        <div style={styles.container}>
          <header style={styles.header}>
            <img src={EquinoxLogo} alt="Equinox Logo" style={styles.logo}/>
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
                  disabled={!charac}
                  style={{
                    ...styles.button,
                    ...styles.secondaryButton,
                    ...(!charac ? styles.buttonDisabled : {}),
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
