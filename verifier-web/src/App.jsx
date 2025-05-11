import React, { useEffect, useState, useRef } from 'react'
import EquinoxLogo from './assets/Equinox.png'
import Starfield from './Starfield'

const SERVICE_UUID = '0000feed-0000-1000-8000-00805f9b34fb'
const CHARACTERISTIC_UUID = '0000beef-0000-1000-8000-00805f9b34fb'
const EXPECTED_SIG_BYTES = 2420
const PUBKEY_BYTES = 1312



export default function App() {
  const [charac, setCharac] = useState(null)
  const [status, setStatus] = useState('Idle')
  const [publicKeyLoaded, setPublicKeyLoaded] = useState(false)
  const [moduleReady, setModuleReady] = useState(false)

  const ModuleRef = useRef(null)
  const publicKeyRef = useRef(null)
  const challengeBufRef = useRef(null)
  const pubKeyAccumRef = useRef('')
  const sigChunksRef = useRef([])
  const receivedSigLenRef = useRef(0)




  console.log(Module.HEAPU8 instanceof Uint8Array); // ✅ should now be true
  console.log(Module._verify); // ✅ should be a function

  useEffect(() => {
    const waitForExports = async () => {
      console.log('⏳ Waiting for WASM internals like _verify and HEAPU8...')
      let attempts = 0
      while (
        (!window.Module ||
          !window.Module.HEAPU8 ||
          typeof window.Module._verify !== 'function') &&
        attempts < 100
      ) {
        await new Promise(resolve => setTimeout(resolve, 100))
        attempts++
      }

      if (window.Module?.HEAPU8 && typeof window.Module._verify === 'function') {
        ModuleRef.current = window.Module
        setModuleReady(true)
        console.log('✅ WASM internals are fully ready!')
      } else {
        console.error('❌ Module still incomplete after polling — aborting')
      }
    }

    waitForExports()
  }, [])

  const connectToPhone = async () => {
    try {
      console.log('▶️ connectToPhone: requesting Bluetooth device')
      setStatus('Requesting device…')
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICE_UUID] }] })

      console.log(`▶️ connectToPhone: connecting to GATT on ${device.name}`)
      setStatus(`Connecting to ${device.name || 'unknown device'}…`)
      const server = await device.gatt.connect()

      console.log('▶️ connectToPhone: getting service')
      const service = await server.getPrimaryService(SERVICE_UUID)

      console.log('▶️ connectToPhone: getting characteristic')
      const c = await service.getCharacteristic(CHARACTERISTIC_UUID)

      console.log('▶️ connectToPhone: wiring up handler')
      c.addEventListener('characteristicvaluechanged', handleNotification)

      console.log('▶️ connectToPhone: starting notifications')
      await c.startNotifications()

      setCharac(c)
      setStatus('✅ Subscribed! Waiting for public key…')
    } catch (err) {
      console.error(err)
      setStatus('❌ ' + err.message)
    }
  }

  const sendChallengeAndReply = async () => {
    if (!charac || !publicKeyLoaded || !moduleReady) {
      alert('Not connected or WASM/public key not ready.')
      return
    }

    const challenge = crypto.getRandomValues(new Uint8Array(16))
    challengeBufRef.current = challenge.buffer
    console.log('▶️ Challenge sent:', challenge)
    console.log('🧪 Challenge sent (base64):', btoa(String.fromCharCode(...challenge)))

    setStatus(`Writing challenge (${challenge.length} bytes)…`)
    await charac.writeValue(challenge)
  }

  const handleNotification = async (event) => {
    const bytes = new Uint8Array(event.target.value.buffer)
    console.log('🔔 Raw notification chunk:', bytes)

    if (!publicKeyRef.current) {
      pubKeyAccumRef.current += new TextDecoder().decode(bytes)
      try {
        const { sigPub } = JSON.parse(pubKeyAccumRef.current)
        const raw = Uint8Array.from(atob(sigPub), c => c.charCodeAt(0))
        publicKeyRef.current = raw
        setPublicKeyLoaded(true)
        setStatus('🔑 Public key imported — ready to send challenge')
        console.log(`🔑 Dilithium public key imported: ${raw.length} bytes`)
      } catch {
        return
      }
      return
    }

    sigChunksRef.current.push(bytes)
    receivedSigLenRef.current += bytes.length
    console.log(`🔔 Got chunk ${bytes.length} bytes (so far ${receivedSigLenRef.current}/${EXPECTED_SIG_BYTES})`)

    if (receivedSigLenRef.current < EXPECTED_SIG_BYTES) {
      setStatus(`🔔 Received ${receivedSigLenRef.current}/${EXPECTED_SIG_BYTES} bytes… waiting for more`)
      return
    }

    const fullSig = new Uint8Array(receivedSigLenRef.current)
    let offset = 0
    for (const chunk of sigChunksRef.current) {
      fullSig.set(chunk, offset)
      offset += chunk.length
    }

    setStatus(`🔔 Full signature received (${fullSig.length} bytes), verifying…`)
    console.log('✍️ Reassembled signature:', fullSig)

    try {
      const Module = ModuleRef.current
      const pubKey = publicKeyRef.current
      const challenge = new Uint8Array(challengeBufRef.current)

      if (!Module.HEAPU8) throw new Error('Module.HEAPU8 not initialized')

      const ptrMsg = Module._malloc(16)
      Module.HEAPU8.set(challenge, ptrMsg)

      const ptrSig = Module._malloc(EXPECTED_SIG_BYTES)
      Module.HEAPU8.set(fullSig, ptrSig)

      const ptrPub = Module._malloc(PUBKEY_BYTES)
      Module.HEAPU8.set(pubKey, ptrPub)

      console.log('🔍 Calling verify(ptrPub, ptrMsg, ptrSig)...')
      const result = Module._verify(ptrPub, ptrMsg, ptrSig)

      console.log('✅ Verification result:', result)
      setStatus(result === 0
        ? '✅ Signature valid — authentication successful'
        : '❌ Signature invalid — authentication failed')

      Module._free(ptrMsg)
      Module._free(ptrSig)
      Module._free(ptrPub)
    } catch (e) {
      console.error('❌ Verification failed:', e)
      setStatus('❌ Verification failed: ' + e.message)
    }

    sigChunksRef.current = []
    receivedSigLenRef.current = 0
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
              Authenticate from your phone using post-quantum security — via Bluetooth, no passwords.
            </p>
            <p style={styles.features}>PQ-Secure · Works across browsers · No app switching</p>
            <div style={styles.card}>
              <div style={styles.statusContainer}>
                <p style={styles.status}>Status: {status}</p>
              </div>
              <div style={styles.buttonContainer}>
                <button onClick={connectToPhone} style={{ ...styles.button, ...styles.primaryButton }}>
                  Connect to Phone
                </button>
                <button
                  onClick={sendChallengeAndReply}
                  disabled={!charac || !publicKeyLoaded || !moduleReady}
                  style={{
                    ...styles.button,
                    ...styles.secondaryButton,
                    ...(!charac || !publicKeyLoaded || !moduleReady ? styles.buttonDisabled : {}),
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

const styles = {
  outer: {
    minHeight: '100vh', width: '100vw', background: 'transparent',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  },
  container: {
    width: '100%', maxWidth: '1200px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', fontFamily: 'Helvetica, Arial, sans-serif', color: '#fff',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: '1rem', width: '100%',
  },
  logo: { height: '320px', objectFit: 'contain' },
  mainContent: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
    width: '100%', padding: '0 1rem',
  },
  title: {
    fontSize: '2.8rem', fontWeight: '700', marginBottom: '1rem', lineHeight: '1.2', color: '#fff',
  },
  subtitle: {
    fontSize: '1.2rem', fontWeight: '400', maxWidth: '800px',
    marginBottom: '1.5rem', lineHeight: '1.6', color: '#fff',
  },
  features: { fontSize: '1.1rem', marginBottom: '1.5rem', color: '#fff' },
  card: {
    backgroundColor: '#111', borderRadius: '16px', padding: '1.5rem',
    boxShadow: '0 6px 32px rgba(0,0,0,0.25)', maxWidth: '600px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  statusContainer: {
    marginBottom: '1rem', padding: '1rem', borderRadius: '8px',
    backgroundColor: '#222', width: '100%',
  },
  status: { fontSize: '1rem', color: '#fff', fontWeight: '700' },
  buttonContainer: { display: 'flex', gap: '1.5rem', justifyContent: 'center' },
  button: {
    padding: '1rem 2.5rem', borderRadius: '10px', border: 'none', fontSize: '1.15rem', fontWeight: '600',
    cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  primaryButton: { backgroundColor: '#fff', color: '#000', border: '2px solid #fff' },
  secondaryButton: { backgroundColor: 'transparent', color: '#fff', border: '2px solid #fff' },
  buttonDisabled: { opacity: 0.5, cursor: 'not-allowed' },
}
