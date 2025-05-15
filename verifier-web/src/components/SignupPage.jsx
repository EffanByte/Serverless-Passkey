import React, { useState, useRef, useEffect } from 'react'
import EquinoxLogo from '../assets/Equinox.png'
import Starfield from '../Starfield'

const SERVICE_UUID = '0000feed-0000-1000-8000-00805f9b34fb'
const CHARACTERISTIC_UUID = '0000beef-0000-1000-8000-00805f9b34fb'

const SignupPage = ({ onSignup, isLoading, error }) => {
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
        setPublicKey(key)
        setPublicKeyBase64(btoa(String.fromCharCode.apply(null, raw)))
        setStatus('🔑 Public key imported')
        pubKeyAccumulatedRef.current = ''
        return
      } catch {
        pubKeyAccumulatedRef.current = combo
        setPubKeyAccumulated(combo)
        return
      }
    }

    // 2. Device name + signature
    if (!deviceNameSignature && bytes.length > 64) {
      try {
        // Get the signature bytes (last 64 bytes)
        const sigBytes = bytes.slice(bytes.length - 64)
        // Get the name bytes (everything before the signature)
        const nameBytes = bytes.slice(0, bytes.length - 64)
        
        // Log raw bytes for debugging
        console.log('Raw name bytes:', nameBytes)
        console.log('Raw signature bytes:', sigBytes)
        
        // Try to decode the name bytes
        let name
        try {
          // First try UTF-8
          name = new TextDecoder('utf-8').decode(nameBytes)
          console.log('UTF-8 decoded name:', name)
          
          // Check if the decoded name is actually JSON (public key data)
          try {
            JSON.parse(name)
            console.log('Received JSON instead of device name, skipping...')
            return
          } catch {
            // Not JSON, continue with the name
          }
        } catch (e) {
          console.log('UTF-8 decode failed, trying ASCII:', e)
          // Fallback to ASCII
          name = new TextDecoder('ascii').decode(nameBytes)
          console.log('ASCII decoded name:', name)
        }

        // Validate the name is not empty and contains reasonable characters
        if (!name || name.length === 0 || /[\x00-\x1F\x7F-\x9F]/.test(name)) {
          console.error('Invalid device name received:', name)
          return
        }

        console.log('📛 Device name received:', name)
        console.log('✍️ Signature on name:', sigBytes)
        
        // Store device name in multiple places to ensure it's captured
        setDeviceName(name)
        setFinalDeviceName(name)
        deviceNameRef.current = name
        window.tempDeviceName = name
        hasReceivedDeviceNameRef.current = true
        
        setStatus(`📛 Device name: ${name}`)
        setDeviceNameSignature(sigBytes)
        
        // Verify device name was stored
        console.log('Device name storage verification:', {
          state: deviceName,
          ref: deviceNameRef.current,
          global: window.tempDeviceName,
          hasReceived: hasReceivedDeviceNameRef.current
        })
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
      setIsAuthenticated(true)
      
      // Get device name from all possible sources
      const name = deviceNameRef.current || deviceName || window.tempDeviceName || 'Unknown'
      console.log('Final device name used:', name)
      
      const successMessage = `✅ Authentication successful\n📛 Device: ${name}`
      console.log('Success message:', successMessage)
      
      setStatus(successMessage)
      setShowPasskeyMenu(false)
      
      // Final verification of device name
      console.log('Final device name verification:', {
        state: deviceName,
        ref: deviceNameRef.current,
        global: window.tempDeviceName,
        hasReceived: hasReceivedDeviceNameRef.current
      })
    } else {
      setStatus('❌ Authentication failed')
    }
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
      } else {
        setStatus(`❌ Registration failed: ${result.error}`)
      }
    } catch (err) {
      console.error('Signup error:', err)
      setStatus(`❌ Registration failed: ${err.message}`)
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
                    placeholder="Username"
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
                          ? "With 2FA enabled, you'll need both your password and biometric for login"
                          : "Without 2FA, you'll only need biometric for login"}
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