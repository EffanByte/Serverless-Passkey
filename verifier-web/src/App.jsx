import React, { useState, useRef } from 'react'
import PasskeyUI from './components/PasskeyUI'
import SignupPage from './components/SignupPage'
import LoginPage from './components/LoginPage'
import './App.css'

const SERVICE_UUID        = '0000feed-0000-1000-8000-00805f9b34fb'
const CHARACTERISTIC_UUID = '0000beef-0000-1000-8000-00805f9b34fb'

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
  const [currentPage, setCurrentPage] = useState('login') // 'login', 'signup', or 'passkey'
  const publicKeyRef                = useRef(null)
  const deviceNameSignatureRef = useRef(null)
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

    // 1. Public Key
    if (!publicKeyRef.current) {
      const chunk = new TextDecoder().decode(bytes)
      const combo = pubKeyAccumulatedRef.current + chunk
      try {
        const { x, y } = JSON.parse(combo)
        const xBytes = Uint8Array.from(atob(x), c => c.charCodeAt(0))
        const yBytes = Uint8Array.from(atob(y), c => c.charCodeAt(0))
        const raw = new Uint8Array(1 + xBytes.length + yBytes.length)
        raw[0] = 0x04
        raw.set(xBytes, 1)
        raw.set(yBytes, 1 + xBytes.length)
        const key = await window.crypto.subtle.importKey(
          'raw', raw.buffer,
          { name: 'ECDSA', namedCurve: 'P-256' },
          false, ['verify']
        )
        publicKeyRef.current = key
        setStatus('🔑 Public key imported')
      } catch {
        pubKeyAccumulatedRef.current = combo
      }
      return
    }

    // 2. Device name + signature (plaintext name + 64-byte sig)
    if (!deviceNameSignatureRef.current && bytes.length > 64) {
      const sigBytes = bytes.slice(bytes.length - 64)
      const nameBytes = bytes.slice(0, bytes.length - 64)
      const deviceName = new TextDecoder().decode(nameBytes)

      console.log('📛 Device name received:', deviceName)
      console.log('✍️ Signature on name:', sigBytes)
      setStatus(`📛 Device name: ${deviceName}`)
      deviceNameSignatureRef.current = sigBytes
      window.tempDeviceName = deviceName // ← store in global var if needed
      return
    }

    // 3. Challenge signature
    const challenge = challengeBufRef.current
    const key = publicKeyRef.current
    if (!key || !challenge) {
      setStatus('⚠️ Missing key or challenge')
      return
    }

    const derSig = bytes
    const valid = await window.crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      derSig,
      challenge
    )

    console.log('💡 Challenge signature valid?', valid)
    const name = window.tempDeviceName || 'Unknown'
    const finalMsg = `✅ Signature valid — authentication successful\n📛 Device: ${name}`
    setStatus(valid ? finalMsg : '❌ Signature invalid — authentication failed')

  }

  const renderPage = () => {
    switch (currentPage) {
      case 'login':
        return <LoginPage />
      case 'signup':
        return <SignupPage />
      case 'passkey':
        return (
          <PasskeyUI
            status={status}
            charac={charac}
            onConnect={connectToPhone}
            onSendChallenge={sendChallengeAndReply}
          />
        )
       case 'disconnected':
          console.warn('🔌 BLE device disconnected')
          setStatus('❌ Phone disconnected')
          break

      default:
        return <LoginPage />
    }
  }

  return (
    <div className="app-container">
      <nav className="navigation">
        <button
          className={`nav-button ${currentPage === 'login' ? 'active' : ''}`}
          onClick={() => setCurrentPage('login')}
        >
          Login
        </button>
        <button
          className={`nav-button ${currentPage === 'signup' ? 'active' : ''}`}
          onClick={() => setCurrentPage('signup')}
        >
          Sign Up
        </button>
        <button
          className={`nav-button ${currentPage === 'passkey' ? 'active' : ''}`}
          onClick={() => setCurrentPage('passkey')}
        >
          Passkey
        </button>
      </nav>
      {renderPage()}
    </div>
  )
}
