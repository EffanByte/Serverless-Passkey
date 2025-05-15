import React, { useState } from 'react'
import EquinoxLogo from '../assets/Equinox.png'
import Starfield from '../Starfield'

const LoginPage = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    // Handle login logic here
    console.log('Login data:', formData)
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
            <h1 className="title">Welcome Back</h1>
            <p className="subtitle">
              Sign in to continue your secure authentication journey.
            </p>
            <div className="card">
              <form onSubmit={handleSubmit} style={{ width: '100%' }}>
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
                <div style={{ marginBottom: '1.5rem', width: '100%' }}>
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
                <button type="submit" className="button primaryButton" style={{ width: '100%' }}>
                  Sign In
                </button>
              </form>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

export default LoginPage