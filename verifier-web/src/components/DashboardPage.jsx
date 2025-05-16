// src/components/DashboardPage.jsx
import React, { useEffect, useState } from 'react'
import EquinoxLogo from '../assets/Equinox.png'
import Starfield from '../Starfield'

const DashboardPage = ({ onLogout }) => {
  const [username, setUsername] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())

  // On mount: read from localStorage
  useEffect(() => {
    const name = localStorage.getItem('fullName')
    setUsername(name || 'User')
  }, [])

  // tick clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const handleLogout = () => {
    localStorage.clear()
    onLogout?.()        // if parent passed a handler to switch page
    // or simply:
    // window.location.reload()
  }

  return (
    <>
      <Starfield />
      <div className="outer" style={{ position: 'relative', zIndex: 2 }}>
        <div className="container">
          <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <img src={EquinoxLogo} alt="Equinox Logo" className="logo" />
            <button
              onClick={handleLogout}
              style={{
                background: 'transparent',
                border: '1px solid #fff',
                borderRadius: '8px',
                padding: '0.5rem 1rem',
                color: '#fff',
                cursor: 'pointer'
              }}
            >
              Logout
            </button>
          </header>
          <main className="mainContent">
            <h1 className="title">Dashboard</h1>
            <div className="card">
              <p style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>
                Hi, <strong>{username}</strong>!
              </p>
              <p style={{ fontSize: '1rem', color: '#ccc' }}>
                Current time:
                <br />
                <span style={{ fontFamily: 'monospace', fontSize: '1.1rem' }}>
                  {currentTime.toLocaleTimeString()}
                </span>
              </p>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

export default DashboardPage
