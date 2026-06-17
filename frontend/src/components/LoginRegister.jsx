import React, { useState } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';

export default function LoginRegister({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let firebaseUser;
      if (isRegister) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        firebaseUser = userCredential.user;
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        firebaseUser = userCredential.user;
      }

      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const payload = isRegister 
        ? { email, firebase_uid: firebaseUser.uid, display_name: displayName }
        : { firebase_uid: firebaseUser.uid };

      const response = await fetch(`http://localhost:5000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      // Save credentials and fire callback
      localStorage.setItem('whatsapp_token', data.token);
      onLogin(data.user, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      setLoading(false);
      return;
    }

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setSuccessMsg('Password reset email sent! Check your inbox.');
      setIsResetting(false);
      setPassword('');
    } catch (err) {
      if (err.code === 'auth/invalid-email') {
        setError('Invalid email address. Please enter a valid email like name@example.com');
      } else if (err.code === 'auth/user-not-found') {
        setError('No account found with this email. Please sign up first.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.authCard} className="glass-panel">
        <div style={styles.brand}>
          <div style={styles.logoRing}>
            <svg style={styles.logoIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 10.742h.008v.008h-.008v-.008zm.37 3.078a5.978 5.978 0 01-.549-2.097 5.978 5.978 0 012.097-.549c.813-.082 1.625-.082 2.438 0a5.978 5.978 0 012.097.549 5.978 5.978 0 01-.549 2.097 8.016 8.016 0 01-5.534 0zm0 0l-1.077 1.077M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h2 style={styles.title}>HeroChat</h2>
          <p style={styles.subtitle}>Secure End-to-End Voice & Messaging</p>
        </div>

        {error && <div style={styles.errorAlert}>{error}</div>}
        {successMsg && <div style={{...styles.errorAlert, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)'}}>{successMsg}</div>}

        {isResetting ? (
          <form onSubmit={handleResetPassword} style={styles.form}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Email Address</label>
              <input
                type="email"
                className="glass-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. hello@example.com"
                required
                disabled={loading}
              />
            </div>
            <button type="submit" style={styles.submitBtn} className="glass-btn" disabled={loading}>
              {loading ? 'Processing...' : 'Reset Password'}
            </button>
            <div style={styles.toggleFooter}>
              <button
                type="button"
                style={styles.toggleBtn}
                onClick={() => {
                  setIsResetting(false);
                  setError('');
                  setSuccessMsg('');
                }}
                disabled={loading}
              >
                Back to Login
              </button>
            </div>
          </form>
        ) : (
          <>
            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Email Address</label>
                <input
                  type="email"
                  className="glass-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. hello@example.com"
                  required
                  disabled={loading}
                />
              </div>

              {isRegister && (
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Display Name</label>
                  <input
                    type="text"
                    className="glass-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Vinay Kumar"
                    disabled={loading}
                  />
                </div>
              )}

              <div style={styles.inputGroup}>
                <label style={styles.label}>Password</label>
                <input
                  type="password"
                  className="glass-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
              </div>

              {!isRegister && (
                <div style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    style={{ ...styles.toggleBtn, fontSize: '12px' }}
                    onClick={() => {
                      setIsResetting(true);
                      setError('');
                      setSuccessMsg('');
                    }}
                    disabled={loading}
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              <button type="submit" style={styles.submitBtn} className="glass-btn" disabled={loading}>
                {loading ? 'Processing...' : isRegister ? 'Create Account' : 'Log In'}
              </button>
            </form>

            <div style={styles.toggleFooter}>
              <span style={styles.footerText}>
                {isRegister ? 'Already have an account?' : "Don't have an account?"}
              </span>
              <button
                type="button"
                style={styles.toggleBtn}
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError('');
                  setSuccessMsg('');
                }}
                disabled={loading}
              >
                {isRegister ? 'Log In' : 'Sign Up'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at 10% 20%, #111827 0%, #030712 100%)',
    overflow: 'hidden'
  },
  authCard: {
    width: '420px',
    padding: '40px',
    borderRadius: '16px',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
    textAlign: 'center'
  },
  brand: {
    marginBottom: '28px'
  },
  logoRing: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px auto'
  },
  logoIcon: {
    width: '30px',
    height: '30px',
    color: '#10b981',
    filter: 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.5))'
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: '-0.5px',
    marginBottom: '4px'
  },
  subtitle: {
    fontSize: '13px',
    color: '#94a3b8'
  },
  errorAlert: {
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#f87171',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '14px',
    textAlign: 'left',
    marginBottom: '20px'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    textAlign: 'left'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  label: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#cbd5e1'
  },
  submitBtn: {
    marginTop: '10px',
    padding: '12px',
    fontSize: '15px',
    fontWeight: '600',
    background: 'rgba(16, 185, 129, 0.9)',
    border: '1px solid rgba(16, 185, 129, 0.5)',
    color: '#ffffff',
    borderRadius: '8px',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'center'
  },
  toggleFooter: {
    marginTop: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontSize: '14px'
  },
  footerText: {
    color: '#94a3b8'
  },
  toggleBtn: {
    background: 'none',
    border: 'none',
    color: '#10b981',
    fontWeight: '600',
    cursor: 'pointer',
    padding: '0',
    fontFamily: 'inherit'
  }
};
