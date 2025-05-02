import React, { useState } from 'react';

const SERVICE_UUID = '0000feed-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUID = '0000beef-0000-1000-8000-00805f9b34fb';

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

    // wait a bit, then send an “ACK” reply
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
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Verifier (Web → Phone via BLE)</h1>
      <p>Status: {status}</p>
      <button onClick={connectToPhone} style={{ marginRight: 8 }}>
        Connect to Phone
      </button>
      <button
        onClick={sendChallengeAndReply}
        disabled={!characteristic}
      >
        Send Challenge & Reply
      </button>
    </div>
  );
}
