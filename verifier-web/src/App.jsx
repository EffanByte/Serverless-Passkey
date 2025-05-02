import React, { useState, useEffect } from 'react';

const SERVICE_UUID = '0000feed-0000-1000-8000-00805f9b34fb';
const WRITE_CHAR_UUID = '0000beef-0000-1000-8000-00805f9b34fb';
const NOTIFY_CHAR_UUID = '0000cafe-0000-1000-8000-00805f9b34fb';

// ─── EXACT Base64 X/Y from your logcat dump ────────────────────────────────
// (no trailing spaces or newlines)
const rawX_b64 = "ncQ5XdcCPJWZjTiKIF+8OTRiDEiRCRbMt3mwKsrrGPc=";
const rawY_b64 = "1P2XyqNLmTSqWKjVVnh+k9XdAxpYMTLGNTLFTgZutXU=";
// ───────────────────────────────────────────────────────────────────────────

// Parse a DER‐encoded ECDSA signature: 30 .. 02 len r 02 len s
function parseDerSignature(buffer) {
  const bytes = new Uint8Array(buffer);
  let i = 0;
  if (bytes[i++] !== 0x30) throw 'Bad DER: no SEQ';
  const seqLen = bytes[i++];
  if (bytes[i++] !== 0x02) throw 'Bad DER: no INTEGER r';
  const rLen = bytes[i++];
  const r = bytes.slice(i, i + rLen);
  i += rLen;
  if (bytes[i++] !== 0x02) throw 'Bad DER: no INTEGER s';
  const sLen = bytes[i++];
  const s = bytes.slice(i, i + sLen);
  return { r, s };
}

// Clean Base64 → Uint8Array
function base64ToUint8Array(b64) {
  const clean = b64.replace(/\s+/g, '');
  const bin = atob(clean);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return arr;
}

// Uint8Array → lowercase hex string
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Pad or truncate to exactly 32 bytes
function padTo32(arr) {
  if (arr.length === 32) return arr;
  if (arr.length < 32) {
    const pad = new Uint8Array(32 - arr.length);
    return new Uint8Array([...pad, ...arr]);
  }
  // arr.length > 32: take last 32 bytes
  return arr.slice(arr.length - 32);
}

export default function App() {
  const [writeChar, setWriteChar] = useState(null);
  const [pubKey, setPubKey] = useState(null);
  const [logs, setLogs] = useState([]);

  const log = msg => setLogs(prev => [msg, ...prev]);

  // 1) Import JWK public key on mount
  useEffect(() => {
    ; (async () => {
      try {
        const xArr = base64ToUint8Array(rawX_b64);
        const yArr = base64ToUint8Array(rawY_b64);

        // Build uncompressed point: 0x04 || X || Y
        const raw = new Uint8Array(1 + xArr.length + yArr.length);
        raw[0] = 0x04;
        raw.set(xArr, 1);
        raw.set(yArr, 1 + xArr.length);

        const key = await crypto.subtle.importKey(
          "raw",
          raw.buffer,
          { name: "ECDSA", namedCurve: "P-256" },
          false,
          ["verify"]
        );
        setPubKey(key);
        log('🔑 Public key imported');
      } catch (e) {
        console.error(e);
        log('❌ Error importing public key: ' + e.message);
      }
    })();
  }, []);

  // 2) Handle incoming signature notifications
  const handleSignature = async (event) => {
    // a) exactly the bytes from GATT
    const dv = event.target.value;  // DataView
    const sigArr = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);

    // b) log raw DER
    log(`📥 Raw DER (hex): ${bytesToHex(sigArr)}`);

    // c) parse DER → r & s
    let r, s;
    try {
      ({ r, s } = parseDerSignature(sigArr.buffer));
      log(`📐 r (hex): ${bytesToHex(r)}`);
      log(`📐 s (hex): ${bytesToHex(s)}`);
    } catch (e) {
      log('❌ DER parse error: ' + e);
      return;
    }

    // d) pad/truncate to 32 bytes each
    r = padTo32(r);
    s = padTo32(s);

    // e) build raw 64-byte signature r||s
    const rawSig = new Uint8Array(64);
    rawSig.set(r, 0);
    rawSig.set(s, 32);
    log(`🔑 rawSig (hex): ${bytesToHex(rawSig)}`);

    // f) check challenge
    const chalBuf = window._currentChallenge;
    if (!chalBuf) {
      log('❌ No challenge stored');
      return;
    }

    // g) verify
    try {
      const ok = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        pubKey,
        rawSig.buffer,
        chalBuf
      );
      log(ok
        ? '✅ Signature valid — authentication succeeded'
        : '❌ Signature invalid — authentication failed'
      );
    } catch (err) {
      console.error(err);
      log('❌ Verification error: ' + err.message);
    }
  };

  // 3) Connect & subscribe
  const connectToPhone = async () => {
    try {
      log('🔎 Requesting device…');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID],
      });
      log(`🔌 Selected: ${device.name || device.id}`);

      device.addEventListener('gattserverdisconnected', () => {
        log('⚠️ Device disconnected');
        setWriteChar(null);
      });

      log('⏳ Connecting GATT…');
      const server = await device.gatt.connect();
      log('✅ GATT connected');

      log('🔍 Getting service…');
      const service = await server.getPrimaryService(SERVICE_UUID);
      log('✅ Service found');

      log('🔍 Getting write characteristic…');
      const wc = await service.getCharacteristic(WRITE_CHAR_UUID);
      log('✅ Write characteristic ready');
      setWriteChar(wc);

      log('🔍 Getting notify characteristic…');
      const nc = await service.getCharacteristic(NOTIFY_CHAR_UUID);
      await nc.startNotifications();
      nc.addEventListener('characteristicvaluechanged', handleSignature);
      log('✅ Subscribed to notifications');
    } catch (err) {
      console.error(err);
      log('❌ ' + (err.message || err));
    }
  };

  // 4) Send 16-byte challenge
  const sendChallenge = async () => {
    if (!pubKey) {
      alert('Waiting for public key import…');
      return;
    }
    if (!writeChar) {
      alert('Please connect to the phone first');
      return;
    }
    setLogs([]); // clear log

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
        <button onClick={connectToPhone} style={{ marginRight: 8 }}>
          Connect to Phone
        </button>
        <button onClick={sendChallenge} disabled={!writeChar || !pubKey}>
          Send Challenge
        </button>
      </div>
      <div style={{
        border: '1px solid #ccc',
        borderRadius: 4,
        padding: 8,
        height: '60vh',
        overflowY: 'auto'
      }}>
        {logs.length === 0
          ? <p style={{ color: '#888' }}>Event log will appear here</p>
          : logs.map((line, i) =>
            <div key={i} style={{ marginBottom: 4, fontSize: 14 }}>
              {line}
            </div>
          )
        }
      </div>
    </div>
  );
}
