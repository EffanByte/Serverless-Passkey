import React, { useState } from 'react'
import EquinoxLogo from '../assets/Equinox.png'
import Starfield from '../Starfield'

const SignupPage = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  })

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    // Handle signup logic here
    console.log('Signup data:', formData)
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
            <h1 className="title">Create Your Account</h1>
            <p className="subtitle">
              Join us to experience seamless and secure authentication with passkeys.
            </p>
            <div className="card">
              <form onSubmit={handleSubmit} style={{ width: '100%' }}>
                <div style={{ marginBottom: '1rem', width: '100%' }}>
                  <input
                    type="text"
                    name="username"
                    placeholder="Username"
                    value={formData.username}
                    onChange={handleChange}
                    className="input"
                    required
                  />
                </div>
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
                <div style={{ marginBottom: '1rem', width: '100%' }}>
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
                <div style={{ marginBottom: '1.5rem', width: '100%' }}>
                  <input
                    type="password"
                    name="confirmPassword"
                    placeholder="Confirm Password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="input"
                    required
                  />
                </div>
                <button type="submit" className="button primaryButton" style={{ width: '100%' }}>
                  Sign Up
                </button>
              </form>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

export default SignupPage