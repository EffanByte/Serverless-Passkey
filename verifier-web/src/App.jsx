import React, { useState } from 'react';
import EquinoxLogo from './assets/Equinox.png';
import Starfield from './Starfield';

const SERVICE_UUID = '0000feed-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUID = '0000beef-0000-1000-8000-00805f9b34fb';

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
    fontFamily: 'Helvetica, Arial, sans-serif',
  },
  subtitle: {
    fontSize: '1.2rem',
    fontWeight: '400',
    maxWidth: '800px',
    marginBottom: '1.5rem',
    lineHeight: '1.6',
    color: '#fff',
    fontFamily: 'Helvetica, Arial, sans-serif',
  },
  features: {
    fontSize: '1.1rem',
    marginBottom: '1.5rem',
    color: '#fff',
    fontFamily: 'Helvetica, Arial, sans-serif',
  },
  card: {
    backgroundColor: '#111',
    borderRadius: '16px',
    padding: '1.5rem',
    boxShadow: '0 6px 32px rgba(0,0,0,0.25)',
    width: '100%',
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
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontWeight: '700',
  },
  buttonContainer: {
    display: 'flex',
    gap: '1.5rem',
    justifyContent: 'center',
    width: '100%',
  },
  button: {
    padding: '1rem 2.5rem',
    borderRadius: '10px',
    border: 'none',
    fontSize: '1.15rem',
    fontWeight: '600',
    fontFamily: 'Helvetica, Arial, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(.4,0,.2,1)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    outline: 'none',
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
};

export default function App() {
  const [characteristic, setCharacteristic] = useState(null);
  const [status, setStatus] = useState('Idle');

  // 1️⃣ Request and connect to the phone (peripheral)
  const connectToPhone = async () => {
    try {
      setStatus('Requesting device…');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
      });

      setStatus(`Connecting to GATT on ${device.name || 'unknown device'}…`);
      const server = await device.gatt.connect();

      setStatus('Getting service…');
      const service = await server.getPrimaryService(SERVICE_UUID);

      setStatus('Getting characteristic…');
      const char = await service.getCharacteristic(CHARACTERISTIC_UUID);

      setCharacteristic(char);
      setStatus('Connected! Ready to send.');
    } catch (err) {
      console.error(err);
      setStatus('❌ ' + err.message);
    }
  };

  // 2️⃣ Send challenge then reply
  const sendChallengeAndReply = async () => {
    if (!characteristic) {
      alert('Not connected yet!');
      return;
    }

    // generate 16 random bytes
    const challenge = window.crypto.getRandomValues(new Uint8Array(16));
    setStatus(`Writing challenge (${challenge.length} bytes)…`);
    await characteristic.writeValue(challenge);
    console.log('▶️ Challenge sent:', challenge);

    // wait a bit, then send an "ACK" reply
    setTimeout(async () => {
      const encoder = new TextEncoder();
      const reply = encoder.encode('ACK');
      setStatus('Writing reply…');
      await characteristic.writeValue(reply);
      console.log('🔄 Reply sent:', reply);
      setStatus('Done.');
    }, 1000);
  };

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
              Authenticate instantly from your phone to the web using Bluetooth Low Energy (BLE) — no passwords, no hassle. A privacy-first login experience powered by passkeys.
            </p>
            <p style={styles.features}>
              Works across devices · End-to-end secure · No app switching
            </p>
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
                  disabled={!characteristic}
                  style={{
                    ...styles.button,
                    ...styles.secondaryButton,
                    ...(!characteristic ? styles.buttonDisabled : {})
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
  );
}
