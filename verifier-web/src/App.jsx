// src/App.jsx
import React, { useEffect, useState, useRef } from 'react'
import EquinoxLogo from './assets/Equinox.png'
import Starfield from './Starfield'

const SERVICE_UUID        = '0000feed-0000-1000-8000-00805f9b34fb'
const CHARACTERISTIC_UUID = '0000beef-0000-1000-8000-00805f9b34fb'

// ML-DSA-44 constants:
const EXPECTED_SIG_BYTES = 2420
const CHALLENGE_LEN      = 16
const PUBKEY_BYTES       = 1312

export default function App() {
  const [charac, setCharac]               = useState(null)
  const [status, setStatus]               = useState('Idle')
  const [publicKeyLoaded, setPublicKeyLoaded] = useState(false)

  const ModuleRef         = useRef(null)
  const publicKeyRef      = useRef(null)
  const challengeBufRef   = useRef(null)
  const pubKeyAccumRef    = useRef('')
  const sigChunksRef      = useRef([])
  const receivedSigLenRef = useRef(0)

  // Wait for Emscripten’s Module global to be ready
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let attempts = 0
      while (
        (!window.Module || !window.Module.HEAPU8 || typeof window.Module._verify !== 'function') &&
        attempts < 50
      ) {
        await new Promise(r => setTimeout(r, 100))
        attempts++
      }
      if (!cancelled && window.Module?.HEAPU8 && typeof window.Module._verify === 'function') {
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
      const server  = await device.gatt.connect()
      const service = await server.getPrimaryService(SERVICE_UUID)
      const c       = await service.getCharacteristic(CHARACTERISTIC_UUID)

      c.addEventListener('characteristicvaluechanged', handleNotification)
      await c.startNotifications()

      setCharac(c)
      setStatus('✅ Subscribed! Waiting for public key…')
    } catch (err) {
      console.error(err)
      setStatus('❌ ' + err.message)
    }
  }

    const sendChallengeAndReply = async () => {
      if (!charac || !publicKeyLoaded) {
        alert('Not connected or public key not yet loaded.');
        return;
      }

      const challenge = crypto.getRandomValues(new Uint8Array(CHALLENGE_LEN));
      challengeBufRef.current = challenge.buffer;

      console.log('▶️ Challenge sent:', challenge);
      console.log('🧪 Challenge (base64):', btoa(String.fromCharCode(...challenge)));
      console.log('📤 Challenge (bytes):', Array.from(challenge));
      console.log('📏 Challenge length:', challenge.length);

      setStatus(`Writing challenge (${challenge.length} bytes)…`);
      await charac.writeValue(challenge);
    };

  const handleNotification = async (event) => {
    const bytes = new Uint8Array(event.target.value.buffer)
    console.log('🔔 Raw chunk:', bytes)

    // 1) receive public-key JSON first
    if (!publicKeyRef.current) {
      pubKeyAccumRef.current += new TextDecoder().decode(bytes)
      try {
        const { sigPub } = JSON.parse(pubKeyAccumRef.current)
        console.log('🔑 Web received Base64 pubkey:', sigPub)
        publicKeyRef.current = Uint8Array.from(atob(sigPub), c => c.charCodeAt(0))
        setPublicKeyLoaded(true)
        setStatus('🔑 Public key imported — click to send challenge')
        console.log("🔑 Public key fingerprint (first 8 bytes):", publicKeyRef.current.slice(0, 8));
        console.log(`🔑 Public key: ${publicKeyRef.current.length} bytes`)

        console.log("🔑 Web public key hex:\n" +
          Array.from(publicKeyRef.current)
               .map(b => b.toString(16).padStart(2, '0'))
               .join(' ')
        );
      } catch {
        // not a full JSON yet
      }
      return
    }

    // 2) accumulate signature chunks
    sigChunksRef.current.push(bytes)
    receivedSigLenRef.current += bytes.length
    console.log(`🔔 Got ${bytes.length} bytes (${receivedSigLenRef.current}/${EXPECTED_SIG_BYTES})`)

    if (receivedSigLenRef.current < EXPECTED_SIG_BYTES) {
      setStatus(`🔔 Received ${receivedSigLenRef.current}/${EXPECTED_SIG_BYTES}… waiting`)
      return
    }

    // 3) assemble full signature
    const fullSig = new Uint8Array(receivedSigLenRef.current)
    let off = 0
    for (const chunk of sigChunksRef.current) {
      fullSig.set(chunk, off)
      off += chunk.length
    }

    setStatus(`🔔 Full signature (${fullSig.length} bytes), verifying…`)
    console.log('✍️ Reassembled signature:', fullSig)

    try {
      const Module    = ModuleRef.current
      const pubKey    = publicKeyRef.current
      const challenge = new Uint8Array(challengeBufRef.current)

      // allocate & copy
      const ptrMsg = Module._malloc(CHALLENGE_LEN)
      Module.HEAPU8.set(challenge, ptrMsg)

      const ptrSig = Module._malloc(EXPECTED_SIG_BYTES)
      Module.HEAPU8.set(fullSig, ptrSig)

      const ptrPub = Module._malloc(PUBKEY_BYTES)
      Module.HEAPU8.set(pubKey, ptrPub)

      console.log('🔍 Calling verify(sig, msg, pub)…')
      const result = Module._verify(
        ptrSig, EXPECTED_SIG_BYTES,
        ptrMsg, CHALLENGE_LEN,
        ptrPub
      );


      console.log('✅ Verification result:', result)
      setStatus(
        result === 0
          ? '✅ Signature valid — authentication successful'
          : '❌ Signature invalid — authentication failed'
      )

      // free
      Module._free(ptrMsg)
      Module._free(ptrSig)
      Module._free(ptrPub)
    } catch (e) {
      console.error('❌ Verification failed:', e)
      setStatus('❌ Verification failed: ' + e.message)
    } finally {
      sigChunksRef.current = []
      receivedSigLenRef.current = 0
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
                  disabled={!charac || !publicKeyLoaded}
                  style={{
                    ...styles.button,
                    ...styles.secondaryButton,
                    ...(!charac || !publicKeyLoaded ? styles.buttonDisabled : {})
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
  outer:          { minHeight:'100vh', width:'100vw', background:'transparent', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' },
  container:      { width:'100%', maxWidth:'1200px', display:'flex', flexDirection:'column', alignItems:'center', fontFamily:'Helvetica, Arial, sans-serif', color:'#fff' },
  header:         { display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'1rem', width:'100%' },
  logo:           { height:'320px', objectFit:'contain' },
  mainContent:    { display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', width:'100%', padding:'0 1rem' },
  title:          { fontSize:'2.8rem', fontWeight:'700', marginBottom:'1rem', lineHeight:'1.2', color:'#fff' },
  subtitle:       { fontSize:'1.2rem', fontWeight:'400', maxWidth:'800px', marginBottom:'1.5rem', lineHeight:'1.6', color:'#fff' },
  features:       { fontSize:'1.1rem', marginBottom:'1.5rem', color:'#fff' },
  card:           { backgroundColor:'#111', borderRadius:'16px', padding:'1.5rem', boxShadow:'0 6px 32px rgba(0,0,0,0.25)', maxWidth:'600px', display:'flex', flexDirection:'column', alignItems:'center' },
  statusContainer:{ marginBottom:'1rem', padding:'1rem', borderRadius:'8px', backgroundColor:'#222', width:'100%' },
  status:         { fontSize:'1rem', color:'#fff', fontWeight:'700' },
  buttonContainer:{ display:'flex', gap:'1.5rem', justifyContent:'center' },
  button:         { padding:'1rem 2.5rem', borderRadius:'10px', border:'none', fontSize:'1.15rem', fontWeight:'600', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.15)' },
  primaryButton:  { backgroundColor:'#fff', color:'#000', border:'2px solid #fff' },
  secondaryButton:{ backgroundColor:'transparent', color:'#fff', border:'2px solid #fff' },
  buttonDisabled: { opacity:0.5, cursor:'not-allowed' },
}
