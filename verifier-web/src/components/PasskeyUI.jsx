
import React from 'react'
import EquinoxLogo from '../assets/Equinox.png'
import Starfield from '../Starfield'
import '../App.css'

const PasskeyUI = ({ status, charac, onConnect, onSendChallenge }) => {
  return (
    <>
      <Starfield />
      <div className="outer" style={{ position: 'relative', zIndex: 2 }}>
        <div className="container">
          <header className="header">
            <img src={EquinoxLogo} alt="Equinox Logo" className="logo"/>
          </header>
          <main className="mainContent">
            <h1 className="title">Seamless & Secure Logins with Passkeys</h1>
            <p className="subtitle">
              Authenticate instantly from your phone to the web using Bluetooth Low Energy — no passwords, no hassle.
            </p>
            <p className="features">Works across devices · End-to-end secure · No app switching</p>
            <div className="card">
              <div className="statusContainer">
              <p className="status">
                Status: <span style={{ whiteSpace: 'pre-line' }}>{status}</span>
              </p>
              </div>
              <div className="buttonContainer">
                <button
                  onClick={onConnect}
                  className="button primaryButton"
                >
                  Connect to Phone
                </button>
                <button
                  onClick={onSendChallenge}
                  disabled={!charac}
                  className={`button secondaryButton ${!charac ? 'buttonDisabled' : ''}`}
                >
                  Send Challenge & Reply
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

export default PasskeyUI