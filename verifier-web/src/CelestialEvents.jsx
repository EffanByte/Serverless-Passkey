import React, { useState, useEffect } from 'react';
import Starfield from './Starfield';
import EquinoxLogo from './assets/Equinox.png';

const CelestialEvents = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCelestialEvents();
  }, []);

  const fetchCelestialEvents = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/celestial-events');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error fetching celestial events');
      setEvents(data.events);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
          padding: '2rem'
        }}>
          <header style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '2rem',
            width: '100%',
          }}>
            <img src={EquinoxLogo} alt="Equinox Logo" style={{ height: '160px', objectFit: 'contain' }} />
          </header>

          <main style={{
            width: '100%',
            maxWidth: '800px',
            backgroundColor: '#111',
            borderRadius: '16px',
            padding: '2rem',
            boxShadow: '0 6px 32px rgba(0,0,0,0.25)',
          }}>
            <h1 style={{
              fontSize: '2.4rem',
              fontWeight: '700',
              marginBottom: '1.5rem',
              textAlign: 'center',
              color: '#fff'
            }}>
              Celestial Events
            </h1>

            {loading ? (
              <div style={{
                textAlign: 'center',
                padding: '2rem',
                color: '#fff',
                fontSize: '1.2rem'
              }}>
                Loading celestial events...
              </div>
            ) : error ? (
              <div style={{
                textAlign: 'center',
                padding: '2rem',
                color: '#ef4444',
                fontSize: '1.2rem'
              }}>
                {error}
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gap: '1.5rem'
              }}>
                {events.map((event, index) => (
                  <div
                    key={index}
                    style={{
                      backgroundColor: '#222',
                      borderRadius: '12px',
                      padding: '1.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem'
                    }}
                  >
                    <h3 style={{
                      fontSize: '1.5rem',
                      fontWeight: '600',
                      color: '#fff',
                      margin: 0
                    }}>
                      {event.name}
                    </h3>
                    <p style={{
                      fontSize: '1.1rem',
                      color: '#ccc',
                      margin: 0
                    }}>
                      {formatDate(event.date)}
                    </p>
                    <p style={{
                      fontSize: '1rem',
                      color: '#999',
                      margin: 0,
                      lineHeight: '1.5'
                    }}>
                      {event.description}
                    </p>
                    {event.significance && (
                      <div style={{
                        backgroundColor: '#333',
                        borderRadius: '8px',
                        padding: '1rem',
                        marginTop: '0.5rem'
                      }}>
                        <p style={{
                          fontSize: '0.9rem',
                          color: '#ccc',
                          margin: 0,
                          fontStyle: 'italic'
                        }}>
                          Significance: {event.significance}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
};

export default CelestialEvents;