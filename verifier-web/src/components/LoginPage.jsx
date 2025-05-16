import React, { useState, useRef, useEffect } from 'react'
import EquinoxLogo from '../assets/Equinox.png'
import Starfield from '../Starfield'

const SERVICE_UUID = '0000feed-0000-1000-8000-00805f9b34fb'
const CHARACTERISTIC_UUID = '0000beef-0000-1000-8000-00805f9b34fb'

const LoginPage = ({onLoginSuccess}) => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showPasskeyMenu, setShowPasskeyMenu] = useState(false)
  const [status, setStatus] = useState('Idle')
  const [charac, setCharac] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [publicKey, setPublicKey] = useState(null)
  const [deviceNameSignature, setDeviceNameSignature] = useState(null)
  const [challengeBuf, setChallengeBuf] = useState(null)
  const [pubKeyAccumulated, setPubKeyAccumulated] = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [publicKeyBase64, setPublicKeyBase64] = useState('')
  const [finalDeviceName, setFinalDeviceName] = useState('')
  const [hasCheckedEmail, setHasCheckedEmail] = useState(false)
  const [hasTwoFactor, setHasTwoFactor] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [device, setDevice] = useState(null)


  // Using refs to maintain values between renders
  const publicKeyRef = useRef(null)
  const deviceNameRef = useRef('')
  const challengeBufRef = useRef(null)
  const pubKeyAccumulatedRef = useRef('')
  const hasReceivedDeviceNameRef = useRef(false)





   // Sync state to refs
   useEffect(() => { pubKeyAccumulatedRef.current = pubKeyAccumulated }, [pubKeyAccumulated])
   useEffect(() => { challengeBufRef.current = challengeBuf }, [challengeBuf])


  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const checkEmail = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/check-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: formData.email }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to check email')
      }

      const { hasTwoFactor } = await response.json()
      setHasTwoFactor(hasTwoFactor)
      setHasCheckedEmail(true)
    } catch (err) {
      console.error('Email check error:', err)
      setError(err.message)
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
       const initialDeviceName = device.name || 'unknown device'
       console.log('Initial device name from connection:', initialDeviceName)
       setStatus(`Connecting to ${initialDeviceName}…`)
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


// When you’re done (e.g. after handleSubmit), disconnect:
const disconnect = () => {
  if (device?.gatt?.connected) {
    device.gatt.disconnect()
    setStatus('🔌 Disconnected')
    setCharac(null)
    setDevice(null)
  }
}

   const sendChallengeAndReply = async () => {
     if (!charac) {
       alert('Not connected yet!')
       return
     }
     const challenge = window.crypto.getRandomValues(new Uint8Array(16))
     challengeBufRef.current = challenge.buffer
     setChallengeBuf(challenge.buffer)
     setStatus(`Writing challenge (${challenge.length} bytes)…`)
     await charac.writeValue(challenge)
     console.log('▶️ Challenge sent:', challenge)
   }

   const handleNotification = async (event) => {
     const bytes = new Uint8Array(event.target.value.buffer)
     console.log('🔔 Raw notification chunk:', bytes)

     // 1) PUBLIC KEY CHUNKS → JSON → raw CryptoKey
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

         // import as ECDSA P-256 verify key
         const key = await window.crypto.subtle.importKey(
           'raw',
           raw.buffer,
           { name: 'ECDSA', namedCurve: 'P-256' },
           true,
           ['verify']
         )

         publicKeyRef.current = key
         setPublicKey(key)
         setStatus('🔑 Public key imported')
         pubKeyAccumulatedRef.current = ''
       } catch {
         // still accumulating
         pubKeyAccumulatedRef.current = combo
         setPubKeyAccumulated(combo)
       }

       return
     }

    // 2) DEVICE NAME + SIGNATURE
    if (!deviceNameSignature && bytes.length > 64) {
      try {
        const sigBytes  = bytes.slice(bytes.length - 64);
        const nameBytes = bytes.slice(0, bytes.length - 64);

        // decode name (UTF-8 fallback to ASCII)
        let name;
        try {
          name = new TextDecoder('utf-8').decode(nameBytes);
          // if it parses as JSON, it's not a plain name
          if (JSON.parse(name)) {
            console.log('…got JSON, not a name…');
            name = null;
          }
        } catch {
          name = new TextDecoder('ascii').decode(nameBytes);
        }

        if (!name || /[\x00-\x1F\x7F-\x9F]/.test(name)) {
          console.error('Invalid device name:', name);
          return;
        }

        // store locally
        setDeviceName(name);
        deviceNameRef.current = name;
        setFinalDeviceName(name);                    // ← ensure finalDeviceName is set
        hasReceivedDeviceNameRef.current = true;
        setStatus(`📛 Device name: ${name}`);
        setDeviceNameSignature(sigBytes);

        // export SPKI → base64
        const spkiBuf = await window.crypto.subtle.exportKey(
          'spki',
          publicKeyRef.current
        );
        const spkiB64 = btoa(
          String.fromCharCode(...new Uint8Array(spkiBuf))
        );

        // store it in local state
        setPublicKeyBase64(spkiB64);                // ← use the correct setter
      } catch (err) {
        console.error('Error processing device name:', err);
        setStatus('❌ Error processing device name');
      }

      return;
    }

     // 3) CHALLENGE SIGNATURE VERIFICATION
     const challenge = challengeBufRef.current
     const key       = publicKeyRef.current
     if (!key || !challenge) {
       setStatus('⚠️ Missing key or challenge')
       return
     }

     const valid = await window.crypto.subtle.verify(
       { name: 'ECDSA', hash: 'SHA-256' },
       key,
       bytes,            // DER‐encoded signature
       challenge         // original Uint8Array.buffer
     )

     console.log('💡 Challenge signature valid?', valid)
     if (valid) {
       setIsAuthenticated(true)
       const finalName = deviceNameRef.current || window.tempDeviceName || 'Unknown'
       setStatus(`✅ Authentication successful\n📛 Device: ${finalName}`)
       setShowPasskeyMenu(false)
       disconnect()
     } else {
       setStatus('❌ Authentication failed')
     }
   }


  // Reset passkey/BLE state
  const resetPasskeyState = () => {
    if (device?.gatt?.connected) device.gatt.disconnect()
    setDevice(null)
    setCharac(null)
    setPublicKeyBase64('')
    setDeviceName('')
    setFinalDeviceName('')
    deviceNameRef.current = ''
    setDeviceNameSignature(null)
    challengeBufRef.current = null
    pubKeyAccumulatedRef.current = ''
    publicKeyRef.current = null
    setIsAuthenticated(false)
    setStatus('Idle')
    setShowPasskeyMenu(false)
  }


  const handleSubmit = async (e) => {
    e.preventDefault()
    setSuccessMessage('')
    if (!isAuthenticated) return alert('Complete passkey auth first')
    if (!publicKeyBase64 || !finalDeviceName)
      return alert('Device info missing; regenerate passkey')

    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          publicKey: publicKeyBase64,
          deviceName: finalDeviceName
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Login failed')
      }
      const { token, user } = await res.json()
      //localStorage.setItem('token', token)
      //localStorage.setItem('fullName', user.fullName)

      localStorage.setItem('token', token)
      localStorage.setItem('fullName', user.fullName)
      setSuccessMessage('✅ Login successful!')
      setStatus('✅ Login successful!')
      resetPasskeyState()

      onLoginSuccess?.()
    } catch (err) {
      setError(err.message)
      setStatus(`❌ Login failed: ${err.message}`)
      resetPasskeyState()
      setHasCheckedEmail(false)
      setHasTwoFactor(false)
      setFormData({ email: '', password: '' })
    } finally {
      setIsLoading(false)
    }
  }

  const renderLoginForm = () => {
    if (!hasCheckedEmail) {
      return (
        <form onSubmit={checkEmail} style={{ width: '100%' }}>
          <div style={{ marginBottom: '1rem', width: '100%' }}>
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              className="input"
              required
            />
          </div>
          <button type="submit" className="button primaryButton" style={{ width: '100%' }}>
            Continue
          </button>
        </form>
      )
    }

    return (
      <form onSubmit={handleSubmit} style={{ width: '100%' }}>
        {hasTwoFactor && (
          <div style={{ marginBottom: '1rem', width: '100%' }}>
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              className="input"
              required
            />
          </div>
        )}
        <div style={{ marginBottom: '1.5rem', width: '100%' }}>
          <button
            type="button"
            onClick={() => setShowPasskeyMenu(!showPasskeyMenu)}
            className="button primaryButton"
            style={{ width: '100%' }}
          >
            {isAuthenticated ? `✅ Passkey Generated (${deviceNameRef.current || deviceName || 'Unknown'})` : 'Generate Passkey'}
          </button>
          {showPasskeyMenu && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              backgroundColor: '#222',
              borderRadius: '8px',
              width: '100%'
            }}>
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ color: '#fff', marginBottom: '0.5rem', whiteSpace: 'pre-line' }}>Status: {status}</p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={connectToPhone}
                  className="button primaryButton"
                >
                  Connect to Phone
                </button>
                <button
                  type="button"
                  onClick={sendChallengeAndReply}
                  disabled={!charac}
                  className={`button secondaryButton ${!charac ? 'buttonDisabled' : ''}`}
                >
                  Send Challenge & Reply
                </button>
              </div>
            </div>
          )}
        </div>
        <button
          type="submit"
          className="button primaryButton"
          style={{
            width: '100%',
            opacity: (isAuthenticated && (!hasTwoFactor || formData.password)) ? 1 : 0.5,
            cursor: (isAuthenticated && (!hasTwoFactor || formData.password)) ? 'pointer' : 'not-allowed'
          }}
          disabled={!isAuthenticated || (hasTwoFactor && !formData.password)}
        >
          Sign In
        </button>
      </form>
    )
  }

  return (
    <>
      <Starfield />
      <div className="outer" style={{ position: 'relative', zIndex: 2 }}>
        <div className="container">
          <header className="header">
            <img src={EquinoxLogo} alt="Equinox Logo" className="logo"/>
          </header>
          <main className="mainContent">
            <h1 className="title">Welcome Back</h1>
            <p className="subtitle">
              Sign in to continue your secure authentication journey.
            </p>
            <div className="card">
              {successMessage && (
                <div style={{
                  backgroundColor: 'rgba(0, 255, 0, 0.1)',
                  color: '#22bb33',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  textAlign: 'left',
                  fontWeight: 'bold',
                }}>
                  {successMessage}
                </div>
              )}
              {error && (
                <div style={{
                  backgroundColor: 'rgba(255, 0, 0, 0.1)',
                  color: '#ff4444',
                  padding: '1rem',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  textAlign: 'left'
                }}>
                  {error}
                </div>
              )}
              {renderLoginForm()}
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

export default LoginPage