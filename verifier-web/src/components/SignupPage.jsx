import React, { useState, useRef, useEffect } from 'react'
import EquinoxLogo from '../assets/Equinox.png'
import Starfield from '../Starfield'

const SERVICE_UUID = '0000feed-0000-1000-8000-00805f9b34fb'
const CHARACTERISTIC_UUID = '0000beef-0000-1000-8000-00805f9b34fb'

const SignupPage = ({ onSignup, onSignupSuccess, isLoading, error }) => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [enable2FA, setEnable2FA] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [showPasskeyMenu, setShowPasskeyMenu] = useState(false)
  const [status, setStatus] = useState('Idle')
  const [charac, setCharac] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [publicKey, setPublicKey] = useState(null)
  const [device, setDevice] = useState(null)
  const [deviceNameSignature, setDeviceNameSignature] = useState(null)
  const [challengeBuf, setChallengeBuf] = useState(null)
  const [pubKeyAccumulated, setPubKeyAccumulated] = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [publicKeyBase64, setPublicKeyBase64] = useState('')
  const [finalDeviceName, setFinalDeviceName] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Using refs to maintain values between renders
  const publicKeyRef = useRef(null)
  const deviceNameRef = useRef('')
  const challengeBufRef = useRef(null)
  const pubKeyAccumulatedRef = useRef('')
  const hasReceivedDeviceNameRef = useRef(false)

  // Effect to log device name changes
  useEffect(() => {
    if (deviceName) {
      console.log('Device name updated in state:', deviceName)
    }
  }, [deviceName])

  useEffect(() => {
    pubKeyAccumulatedRef.current = pubKeyAccumulated
  }, [pubKeyAccumulated])

  useEffect(() => {
    challengeBufRef.current = challengeBuf
  }, [challengeBuf])


  // Effect to log device name ref changes
  useEffect(() => {
    if (deviceNameRef.current) {
      console.log('Device name updated in ref:', deviceNameRef.current)
    }
  }, [deviceNameRef.current])

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleCheckboxChange = (e) => {
    setEnable2FA(e.target.checked)
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

   // resets everything related to the BLE/passkey dance
   const resetPasskeyState = () => {
     setIsAuthenticated(false)
     setCharac(null)
     setDevice(null)
     setDeviceName('')
     deviceNameRef.current = ''
     setDeviceNameSignature(null)
     setChallengeBuf(null)
     challengeBufRef.current = null
     setPubKeyAccumulated('')
     pubKeyAccumulatedRef.current = ''
     publicKeyRef.current = null
     setPublicKey(null)
     setPublicKeyBase64('')
     setFinalDeviceName('')
     setShowPasskeyMenu(false)
     setStatus('Idle')
   }


  const handleSubmit = async (e) => {
    e.preventDefault()
    setSuccessMessage('')
    if (!isAuthenticated) {
      alert('Please complete passkey authentication first')
      return
    }
    if (!publicKeyBase64 || !finalDeviceName) {
      alert('Device information is missing. Please try generating the passkey again.')
      return
    }
    try {
      const result = await onSignup({
        ...formData,
        enable2FA
      }, {
        publicKey: publicKeyBase64,
        deviceName: finalDeviceName,
      })
      if (result.success) {
        setSuccessMessage('✅ Registration successful! You can now log in.')
        setStatus('✅ Registration successful!')
        resetPasskeyState()
        onSignupSuccess()
      } else {
        setStatus(`❌ Registration failed: ${result.error}`)
      }
    } catch (err) {
      console.error('Signup error:', err)
      setStatus(`❌ Registration failed: ${err.message}`)
      resetPasskeyState()
    }
  }

  const isFormValid = () => {
    return formData.username &&
           formData.email &&
           formData.password &&
           formData.confirmPassword === formData.password
  }

  const getDisplayDeviceName = () => {
    return deviceNameRef.current || deviceName || window.tempDeviceName || 'Unknown'
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
            <h1 className="title">Create Your Account</h1>
            <p className="subtitle">
              Join us to experience seamless and secure authentication with passkeys.
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
              <form onSubmit={handleSubmit} style={{ width: '100%' }}>
                <div style={{ marginBottom: '1rem', width: '100%' }}>
                  <input
                    type="text"
                    name="username"
                    placeholder="Full Name"
                    value={formData.username}
                    onChange={handleChange}
                    className="input"
                    required
                  />
                </div>
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
                <div style={{ marginBottom: '1rem', width: '100%' }}>
                  <input
                    type="password"
                    name="confirmPassword"
                    placeholder="Confirm Password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="input"
                    required
                  />
                </div>
                <div style={{
                  marginBottom: '1.5rem',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={enable2FA}
                      onChange={handleCheckboxChange}
                      style={{ width: '1.2rem', height: '1.2rem' }}
                    />
                    Enable Two-Factor Authentication
                  </label>
                  <div
                    style={{
                      position: 'relative',
                      cursor: 'help'
                    }}
                    onMouseEnter={() => setShowTooltip(true)}
                    onMouseLeave={() => setShowTooltip(false)}
                  >
                    <span style={{ fontSize: '1.2rem' }}>?</span>
                    {showTooltip && (
                      <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        color: 'white',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        width: '200px',
                        fontSize: '0.9rem',
                        zIndex: 1000
                      }}>
                        {enable2FA
                          ? "With 2FA enabled, you'll need both your password and biometrics for login"
                          : "Without 2FA, you'll only need biometrics for login"}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ marginBottom: '1.5rem', width: '100%' }}>
                  <button
                    type="button"
                    onClick={() => setShowPasskeyMenu(!showPasskeyMenu)}
                    className="button primaryButton"
                    style={{ width: '100%' }}
                  >
                    {isAuthenticated ? `✅ Passkey Generated (${getDisplayDeviceName()})` : 'Generate Passkey'}
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
                    opacity: (isFormValid() && isAuthenticated && !isLoading) ? 1 : 0.5,
                    cursor: (isFormValid() && isAuthenticated && !isLoading) ? 'pointer' : 'not-allowed'
                  }}
                  disabled={!isFormValid() || !isAuthenticated || isLoading}
                >
                  {isLoading ? 'Signing up...' : 'Sign Up'}
                </button>
              </form>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

export default SignupPage