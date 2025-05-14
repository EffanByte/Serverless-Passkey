import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import EquinoxLogo from './assets/Equinox.png';
import Starfield from './Starfield';

const SERVICE_UUID        = '0000feed-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUID = '0000beef-0000-1000-8000-00805f9b34fb';

const styles = {
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
  toggleButton: {
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    border: 'none',
    fontSize: '1rem',
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
  buttonContainer: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'center',
    width: '100%',
    maxWidth: '300px',
    margin: '0 auto',
  },
  disabledButton: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};

function stripLeadingZeros(buf) {
  let i = 0;
  while (i < buf.length - 1 && buf[i] === 0) i++;
  return buf.slice(i);
}

function rawSigToDer(raw) {
  let r = stripLeadingZeros(raw.subarray(0, 32));
  let s = stripLeadingZeros(raw.subarray(32, 64));
  if (r[0] & 0x80) r = Uint8Array.of(0, ...r);
  if (s[0] & 0x80) s = Uint8Array.of(0, ...s);
  const lenR = r.length, lenS = s.length;
  const seqLen = 2 + lenR + 2 + lenS;
  const der = new Uint8Array(2 + seqLen);
  let off = 0;
  der[off++] = 0x30;
  der[off++] = seqLen;
  der[off++] = 0x02;
  der[off++] = lenR;
  der.set(r, off); off += lenR;
  der[off++] = 0x02;
  der[off++] = lenS;
  der.set(s, off);
  return der.buffer;
}

const LoginSignup = ({ onSuccess }) => {
  const [activeTab, setActiveTab] = useState('login');
  const [formData, setFormData] = useState({
    fullName: '', email: '', password: '', confirmPassword: ''
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [enable2FA, setEnable2FA] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [user2FAStatus, setUser2FAStatus] = useState(null);

  // BLE / Passkey state
  const [charac, setCharac] = useState(null);
  const [status, setStatus] = useState('Idle');
  const publicKeyRef = useRef(null);
  const challengeBufRef = useRef(null);
  const pubKeyAccumulatedRef = useRef('');

  // --- BLE handlers (same as before) ---
  const connectToPhone = async () => {
    try {
      setStatus('Requesting device…');
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICE_UUID] }] });
      setStatus(`Connecting to ${device.name || 'device'}…`);
      const server = await device.gatt.connect();
      setStatus('Getting service…');
      const service = await server.getPrimaryService(SERVICE_UUID);
      setStatus('Getting characteristic…');
      const c = await service.getCharacteristic(CHARACTERISTIC_UUID);
      setStatus('Subscribing to notifications…');
      await c.startNotifications();
      c.addEventListener('characteristicvaluechanged', handleNotification);
      setCharac(c);
      setStatus('Connected! Ready to send.');
    } catch (err) {
      console.error(err);
      setStatus('❌ ' + err.message);
    }
  };

  const sendChallengeAndReply = async () => {
    if (!charac) return alert('Not connected yet!');
    const challenge = window.crypto.getRandomValues(new Uint8Array(16));
    challengeBufRef.current = challenge.buffer;
    setStatus('Writing challenge…');
    await charac.writeValue(challenge);
  };

  const handleNotification = async (event) => {
    const bytes = new Uint8Array(event.target.value.buffer);

    // 1) registration phase: collect {x,y}
    if (!publicKeyRef.current) {
      const chunk = new TextDecoder().decode(bytes);
      const combo = pubKeyAccumulatedRef.current + chunk;
      try {
        const { x, y } = JSON.parse(combo);
        const xBytes = Uint8Array.from(atob(x), c => c.charCodeAt(0));
        const yBytes = Uint8Array.from(atob(y), c => c.charCodeAt(0));
        const raw    = new Uint8Array(1 + xBytes.length + yBytes.length);
        raw[0] = 0x04; raw.set(xBytes, 1); raw.set(yBytes, 1 + xBytes.length);
        const key = await window.crypto.subtle.importKey(
          'raw', raw.buffer,
          { name:'ECDSA', namedCurve:'P-256' },
          false, ['verify']
        );
        publicKeyRef.current = key;
        setStatus('🔑 Public key imported');
      } catch {
        pubKeyAccumulatedRef.current = combo;
      }
      return;
    }

    // 2) login phase: verify signature
    setStatus('🔔 Signature received');
    const key = publicKeyRef.current;
    const buf = challengeBufRef.current;
    if (!key || !buf) return setStatus('⚠️ Missing key or challenge');
    const valid = await window.crypto.subtle.verify(
      { name:'ECDSA', hash:'SHA-256' },
      key, bytes, buf
    );
    setStatus(valid ? '✅ Signature valid' : '❌ Signature invalid');
    if (valid && onSuccess) onSuccess();
  };

  // --- form logic (unchanged) ---
  const handleInputChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (activeTab === 'signup') {
      if (!formData.fullName.trim()) newErrors.fullName = 'Full name is required';
      if (!formData.confirmPassword) newErrors.confirmPassword = 'Please confirm your password';
      else if (formData.password !== formData.confirmPassword)
        newErrors.confirmPassword = 'Passwords do not match';
    }
    if (!formData.email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email))
      newErrors.email = 'Email is invalid';
    if (!formData.password) newErrors.password = 'Password is required';
    else if (formData.password.length < 8)
      newErrors.password = 'Password must be at least 8 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const checkUser2FAStatus = async (email) => {
    try {
      const res = await fetch(`http://localhost:5000/api/check-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error checking 2FA status');
      setUser2FAStatus(data.has2FA);
      return data.has2FA;
    } catch (err) {
      setErrors(prev => ({ ...prev, submit: err.message }));
      return null;
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      const has2FA = await checkUser2FAStatus(formData.email);
      if (has2FA === null) return; // Error already set by checkUser2FAStatus

      if (has2FA) {
        // Regular login with password
        const res = await fetch('http://localhost:5000/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Error');
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        onSuccess?.(data);
      } else {
        // Biometric-only login
        setShowPasskeyModal(true);
      }
    } catch (err) {
      setErrors(prev => ({ ...prev, submit: err.message }));
    } finally {
      setIsLoading(false);
    }
  };

  const PasskeyModal = () => (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: '#111',
        borderRadius: '16px',
        padding: '2rem',
        boxShadow: '0 6px 32px rgba(0,0,0,0.25)',
        width: '100%',
        maxWidth: '400px',
        position: 'relative'
      }}>
        <button
          onClick={() => setShowPasskeyModal(false)}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'none',
            border: 'none',
            color: '#fff',
            fontSize: '1.5rem',
            cursor: 'pointer'
          }}
        >
          ×
        </button>
        <h2 style={{
          color: '#fff',
          fontSize: '1.5rem',
          marginBottom: '1.5rem',
          textAlign: 'center'
        }}>
          {user2FAStatus ? 'Complete Login with Biometric' : 'Login with Biometric'}
        </h2>
        <div style={{
          marginBottom: '1.5rem',
          padding: '1rem',
          borderRadius: '8px',
          backgroundColor: '#222'
        }}>
          <p style={{
            fontSize: '1rem',
            color: '#fff',
            fontWeight: '700',
            textAlign: 'center',
            fontFamily: 'Helvetica, Arial, sans-serif'
          }}>
            Status: {status}
          </p>
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
            disabled={!charac}
            style={{
              ...styles.button,
              ...styles.secondaryButton,
              ...(charac ? {} : styles.disabledButton)
            }}
          >
            Send Challenge & Reply
          </button>
        </div>
      </div>
    </div>
  );

  // --- renderForm now includes Passkey button in signup ---
  const renderForm = () => {
    const inputStyle = {
      width: '100%',
      padding: '1rem 1.25rem',
      backgroundColor: '#fff',
      border: '2px solid #e5e7eb',
      borderRadius: '0.75rem',
      color: '#000',
      fontSize: '1.1rem',
      fontWeight: '500',
      fontFamily: 'Helvetica, Arial, sans-serif',
      outline: 'none',
      marginBottom: '0.5rem'
    };
    const labelStyle = {
      display: 'block',
      fontSize: '1.1rem',
      fontWeight: '600',
      color: '#fff',
      marginBottom: '0.5rem',
      fontFamily: 'Helvetica, Arial, sans-serif',
      textAlign: 'left'
    };
    const errorStyle = {
      marginTop: '0.5rem',
      fontSize: '0.9rem',
      color: '#ef4444',
      textAlign: 'left',
      fontFamily: 'Helvetica, Arial, sans-serif'
    };

    // Login tab
    if (activeTab === 'login') {
      return (
        <form onSubmit={handleLogin} style={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}>
          <label htmlFor="email" style={labelStyle}>Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleInputChange}
            style={inputStyle}
            placeholder="Enter your email"
            disabled={isLoading}
          />
          {errors.email && <p style={errorStyle}>{errors.email}</p>}

          {user2FAStatus && (
            <>
              <label htmlFor="password" style={labelStyle}>Password</label>
              <input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleInputChange}
                style={inputStyle}
                placeholder="Enter your password"
                disabled={isLoading}
              />
              {errors.password && <p style={errorStyle}>{errors.password}</p>}
            </>
          )}

          {errors.submit && <p style={{ ...errorStyle, textAlign:'center' }}>{errors.submit}</p>}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              ...styles.button,
              ...styles.primaryButton,
              width: '100%',
              opacity: isLoading ? 0.7 : 1
            }}
          >
            {isLoading ? 'Signing in…' : user2FAStatus ? 'Sign In' : 'Continue with Biometric'}
          </button>
        </form>
      );
    }

    // Signup tab
    return (
      <form onSubmit={handleLogin} style={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}>
        <label htmlFor="fullName" style={labelStyle}>Full Name</label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          value={formData.fullName}
          onChange={handleInputChange}
          style={inputStyle}
          placeholder="Enter your full name"
          disabled={isLoading}
        />
        {errors.fullName && <p style={errorStyle}>{errors.fullName}</p>}

        <label htmlFor="email" style={labelStyle}>Email</label>
        <input
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleInputChange}
          style={inputStyle}
          placeholder="Enter your email"
          disabled={isLoading}
        />
        {errors.email && <p style={errorStyle}>{errors.email}</p>}

        <label htmlFor="password" style={labelStyle}>Password</label>
        <input
          id="password"
          name="password"
          type="password"
          value={formData.password}
          onChange={handleInputChange}
          style={inputStyle}
          placeholder="Enter your password"
          disabled={isLoading}
        />
        {errors.password && <p style={errorStyle}>{errors.password}</p>}

        <label htmlFor="confirmPassword" style={labelStyle}>Confirm Password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          value={formData.confirmPassword}
          onChange={handleInputChange}
          style={inputStyle}
          placeholder="Confirm your password"
          disabled={isLoading}
        />
        {errors.confirmPassword && <p style={errorStyle}>{errors.confirmPassword}</p>}

        <div style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '1.5rem',
          position: 'relative'
        }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            color: '#fff',
            fontSize: '1.1rem',
            fontWeight: '600',
            fontFamily: 'Helvetica, Arial, sans-serif'
          }}>
            <input
              type="checkbox"
              checked={enable2FA}
              onChange={(e) => setEnable2FA(e.target.checked)}
              style={{
                marginRight: '0.75rem',
                width: '1.25rem',
                height: '1.25rem',
                cursor: 'pointer'
              }}
            />
            Enable Two-Factor Authentication
          </label>
          <div
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            style={{
              marginLeft: '0.5rem',
              cursor: 'help',
              position: 'relative'
            }}
          >
            <span style={{
              display: 'inline-block',
              width: '1.25rem',
              height: '1.25rem',
              lineHeight: '1.25rem',
              textAlign: 'center',
              backgroundColor: '#333',
              color: '#fff',
              borderRadius: '50%',
              fontSize: '0.875rem',
              fontWeight: 'bold'
            }}>
              ?
            </span>
            {showTooltip && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#222',
                color: '#fff',
                padding: '1rem',
                borderRadius: '8px',
                width: '250px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                zIndex: 1000,
                marginTop: '0.5rem',
                fontSize: '0.9rem',
                lineHeight: '1.4'
              }}>
                <div style={{
                  position: 'absolute',
                  top: '-8px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '0',
                  height: '0',
                  borderLeft: '8px solid transparent',
                  borderRight: '8px solid transparent',
                  borderBottom: '8px solid #222'
                }} />
                When enabled, you'll need both your password and biometric authentication to log in. When disabled, you can log in using only biometric authentication.
              </div>
            )}
          </div>
        </div>

        {errors.submit && <p style={{ ...errorStyle, textAlign:'center' }}>{errors.submit}</p>}

        <button
          type="submit"
          disabled={isLoading}
          style={{
            ...styles.button,
            ...styles.primaryButton,
            width: '100%',
            opacity: isLoading ? 0.7 : 1,
            marginBottom: '1rem'
          }}
        >
          {isLoading ? 'Creating account…' : 'Create Account'}
        </button>

        <button
          type="button"
          onClick={() => setShowPasskeyModal(true)}
          style={{
            ...styles.button,
            ...styles.secondaryButton,
            width: '100%'
          }}
        >
          Generate Passkey
        </button>
      </form>
    );
  };

  return (
    <>
      <Starfield />
      <div style={{
        minHeight: '100vh',
        width: '100vw',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        zIndex: 2
      }}>
        <div style={{
          width: '100%',
          maxWidth: '1200px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          fontFamily: 'Helvetica, Arial, sans-serif',
          color: '#fff',
        }}>
          <header style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1rem',
            width: '100%',
          }}>
            <img src={EquinoxLogo} alt="Equinox Logo" style={{ height: '320px', objectFit: 'contain' }} />
          </header>
          <main style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            width: '100%',
            padding: '0 1rem',
          }}>
            <h1 style={{
              fontSize: '2.8rem',
              fontWeight: '700',
              marginBottom: '1rem',
              lineHeight: '1.2',
              color: '#fff',
              fontFamily: 'Helvetica, Arial, sans-serif',
            }}>
              Welcome to Equinox
            </h1>
            <p style={{
              fontSize: '1.2rem',
              fontWeight: '400',
              maxWidth: '800px',
              marginBottom: '1.5rem',
              lineHeight: '1.6',
              color: '#fff',
              fontFamily: 'Helvetica, Arial, sans-serif',
            }}>
              Sign in to your account or create a new one to get started
            </p>
            <div style={{
              backgroundColor: '#111',
              borderRadius: '16px',
              padding: '1.5rem',
              boxShadow: '0 6px 32px rgba(0,0,0,0.25)',
              width: '100%',
              maxWidth: '600px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}>
              <div style={{
                display: 'flex',
                gap: '1rem',
                justifyContent: 'center',
                width: '100%',
                maxWidth: '300px',
                margin: '0 auto',
                marginBottom: '2rem',
              }}>
                <button
                  onClick={() => setActiveTab('login')}
                  style={{
                    ...styles.toggleButton,
                    ...(activeTab === 'login' ? styles.primaryButton : styles.secondaryButton),
                    flex: 1,
                  }}
                >
                  Login
                </button>
                <button
                  onClick={() => setActiveTab('signup')}
                  style={{
                    ...styles.toggleButton,
                    ...(activeTab === 'signup' ? styles.primaryButton : styles.secondaryButton),
                    flex: 1,
                  }}
                >
                  Sign Up
                </button>
              </div>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                {renderForm()}
              </div>
            </div>
          </main>
        </div>
      </div>
      {showPasskeyModal && <PasskeyModal />}
    </>
  );
};

export default LoginSignup;
