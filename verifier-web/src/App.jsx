import React, { useState, useRef } from 'react';

const SERVICE_UUID = '0000feed-0000-1000-8000-00805f9b34fb';
const WRITE_CHAR_UUID = '0000beef-0000-1000-8000-00805f9b34fb';
const NOTIFY_CHAR_UUID = '0000cafe-0000-1000-8000-00805f9b34fb';
const PUBKEY_CHAR_UUID = '0000f00d-0000-1000-8000-00805f9b34fb';

// Helper: bytes → hex string
const bytesToHex = bytes =>
  Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

// Helper: parse DER ECDSA signature
function parseDer(buffer) {
  const b = new Uint8Array(buffer);
  let i = 0;
  if (b[i++] !== 0x30) throw 'Bad DER: no SEQ';
  i++; // skip SEQ length
  if (b[i++] !== 0x02) throw 'No r tag';
  const rLen = b[i++];
  const r = b.slice(i, i + rLen); i += rLen;
  if (b[i++] !== 0x02) throw 'No s tag';
  const sLen = b[i++];
  const s = b.slice(i, i + sLen);
  return { r, s };
}

export default function App() {
  const [writeChar, setWriteChar] = useState(null);
  const [logs, setLogs] = useState([]);
  const pubKeyRef = useRef(null); // ✅ FIXED: useRef instead of useState

  const log = msg => setLogs(prev => [msg, ...prev]);

  const handleSignature = async (e) => {
    const dv = e.target.value;
    const sigArr = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    log(`📥 Raw DER (hex): ${bytesToHex(sigArr)}`);

    let r, s;
    try {
      ({ r, s } = parseDer(sigArr.buffer));
      log(`📐 r (hex): ${bytesToHex(r)}`);
      log(`📐 s (hex): ${bytesToHex(s)}`);
    } catch (err) {
      log('❌ DER parse error: ' + err);
      return;
    }

    const rawSig = new Uint8Array(64);
    rawSig.set(r.length < 32 ? new Uint8Array(32 - r.length).fill(0).concat(Array.from(r)) : r.slice(r.length - 32), 0);
    rawSig.set(s.length < 32 ? new Uint8Array(32 - s.length).fill(0).concat(Array.from(s)) : s.slice(s.length - 32), 32);
    log(`🔑 rawSig (hex): ${bytesToHex(rawSig)}`);

    if (!window._currentChallenge) {
      log('❌ No challenge stored');
      return;
    }

    try {
      const pubKey = pubKeyRef.current;
      if (!pubKey) {
        log('❌ No public key available');
        return;
      }

      const ok = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        pubKey,
        rawSig.buffer,
        window._currentChallenge
      );
      log(ok
        ? '✅ Signature valid — authentication succeeded'
        : '❌ Signature invalid — authentication failed');
    } catch (err) {
      log('❌ Verification error: ' + err.message);
    }
  };

  const connectToPhone = async () => {
    try {
      log('🔎 Requesting device…');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID]
      });
      log(`🔌 Selected: ${device.name || device.id}`);

      device.addEventListener('gattserverdisconnected', () => {
        log('⚠️ Disconnected');
        setWriteChar(null);
      });

      log('⏳ Connecting GATT…');
      const server = await device.gatt.connect();
      log('✅ GATT connected');

      log('🔍 Getting service…');
      const service = await server.getPrimaryService(SERVICE_UUID);
      log('✅ Service found');

      log('🔍 Getting public-key characteristic…');
      const pkChar = await service.getCharacteristic(PUBKEY_CHAR_UUID);
      log('🔍 Reading public key…');
      const dv = await pkChar.readValue();
      const raw = new Uint8Array(dv.buffer);

      if (raw.length !== 65 || raw[0] !== 0x04) {
        log('❌ Invalid public key format');
        return;
      }

      const xArr = raw.slice(1, 33);
      const yArr = raw.slice(33, 65);
      log(`🔑 pubX (hex): ${bytesToHex(xArr)}`);
      log(`🔑 pubY (hex): ${bytesToHex(yArr)}`);

      const key = await crypto.subtle.importKey(
        'raw',
        raw.buffer,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      pubKeyRef.current = key; // ✅ FIX: assign to ref
      log('✅ Public key imported');

      const wc = await service.getCharacteristic(WRITE_CHAR_UUID);
      setWriteChar(wc);
      log('✅ Write characteristic ready');

      const nc = await service.getCharacteristic(NOTIFY_CHAR_UUID);
      await nc.startNotifications();
      nc.addEventListener('characteristicvaluechanged', handleSignature);
      log('✅ Subscribed to notifications');
    } catch (err) {
      log('❌ ' + (err.message || err));
    }
  };

  const sendChallenge = async () => {
    if (!writeChar) {
      alert('Connect first');
      return;
    }
    setLogs([]);
    const challenge = crypto.getRandomValues(new Uint8Array(16));
    window._currentChallenge = challenge.buffer;
    log(`▶️ Sending challenge (${challenge.byteLength} bytes)…`);
    await writeChar.writeValue(challenge);
    log('✅ Challenge sent');
  };

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>BLE Verifier</h1>
      <div style={{ marginBottom: 12 }}>
        <button onClick={connectToPhone}>Connect to Phone</button>
        <button onClick={sendChallenge} disabled={!writeChar}>Send Challenge</button>
      </div>
      <div style={{
        border: '1px solid #ccc',
        borderRadius: 4,
        padding: 8,
        height: '60vh',
        overflowY: 'auto'
      }}>
        {logs.map((l, i) => <div key={i} style={{ margin: '4px 0', fontSize: 14 }}>{l}</div>)}
      </div>
    </div>
  );
}
