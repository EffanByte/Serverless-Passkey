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
  const [isLoading, setIsLoading]    = useState(false)
  const [error, setError]            = useState(null)
  const publicKeyRef                = useRef(null)
  const deviceNameSignatureRef        = useRef(null)
  const challengeBufRef             = useRef(null)
  const pubKeyAccumulatedRef        = useRef('')
  const deviceNameRef               = useRef('')
  const publicKeyBase64Ref         = useRef('')

  const handleSignup = async (userData, deviceData) => {
    setIsLoading(true)
    setError(null)
    try {
      // First, register the user
      const userResponse = await fetch('/api/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: userData.username,
          email: userData.email,
          password: userData.password,
          twoFactorEnabled: userData.enable2FA
        }),
      })

      if (!userResponse.ok) {
        const errorData = await userResponse.json()
        throw new Error(errorData.message || 'Failed to register user')
      }

      const { user, token } = await userResponse.json()

      // Then, register the device
      const deviceResponse = await fetch('/api/register-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          publicKey: deviceData.publicKey,
          deviceName: deviceData.deviceName
        }),
      })

      if (!deviceResponse.ok) {
        const errorData = await deviceResponse.json()
        throw new Error(errorData.message || 'Failed to register device')
      }

      // Store the token in localStorage for future requests
      localStorage.setItem('token', token)
      
      // Update status and redirect
      setStatus('✅ Registration successful')
      setCurrentPage('login')
      
      return { success: true, token }
    } catch (err) {
      console.error('Registration error:', err)
      setError(err.message)
      setStatus(`❌ Registration failed: ${err.message}`)
      return { success: false, error: err.message }
    } finally {
      setIsLoading(false)
    }
  }

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
        // Store the base64-encoded public key for device registration
        publicKeyBase64Ref.current = btoa(String.fromCharCode.apply(null, raw))
        setStatus('🔑 Public key imported')
        pubKeyAccumulatedRef.current = ''
        return
      } catch {
        pubKeyAccumulatedRef.current = combo
        return
      }
    }

    // 2. Device name + signature
    if (!deviceNameSignatureRef.current && bytes.length > 64) {
      try {
        const sigBytes = bytes.slice(bytes.length - 64)
        const nameBytes = bytes.slice(0, bytes.length - 64)
        let name
        try {
          name = new TextDecoder('utf-8').decode(nameBytes)
          try {
            JSON.parse(name)
            console.log('Received JSON instead of device name, skipping...')
            return
          } catch {
            // Not JSON, continue with the name
          }
        } catch (e) {
          name = new TextDecoder('ascii').decode(nameBytes)
        }

        if (!name || name.length === 0 || /[\x00-\x1F\x7F-\x9F]/.test(name)) {
          console.error('Invalid device name received:', name)
          return
        }

        console.log('📛 Device name received:', name)
        deviceNameRef.current = name
        window.tempDeviceName = name
        setStatus(`📛 Device name: ${name}`)
        deviceNameSignatureRef.current = sigBytes
        return
      } catch (error) {
        console.error('Error processing device name:', error)
        setStatus('❌ Error processing device name')
      }
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
    if (valid) {
      const name = deviceNameRef.current || window.tempDeviceName || 'Unknown'
      const finalMsg = `✅ Signature valid — authentication successful\n📛 Device: ${name}`
      setStatus(valid ? finalMsg : '❌ Signature invalid — authentication failed')
    }
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'login':
        return <LoginPage />
      case 'signup':
        return (
          <SignupPage 
            onSignup={handleSignup}
            deviceData={{
              publicKey: publicKeyBase64Ref.current,
              deviceName: deviceNameRef.current
            }}
            isLoading={isLoading}
            error={error}
          />
        )
      case 'passkey':
        return (
          <PasskeyUI
            status={status}
            charac={charac}
            onConnect={connectToPhone}
            onSendChallenge={sendChallengeAndReply}
          />
        )
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
