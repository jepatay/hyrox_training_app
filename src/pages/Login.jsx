import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError('Invalid credentials. Check your email and password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-brand">
          <span className="login-logo">HX</span>
          <div>
            <div className="login-title">Box Event Manager</div>
            <div className="login-subtitle">Admin Access</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@hyrox.local"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="btn-primary login-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>

      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg);
          padding: 24px;
        }
        .login-container {
          width: 100%;
          max-width: 360px;
          display: flex;
          flex-direction: column;
          gap: 32px;
        }
        .login-brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .login-logo {
          background: var(--yellow);
          color: #000;
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 800;
          font-size: 1.8rem;
          padding: 6px 12px;
          border-radius: 4px;
          letter-spacing: 0.04em;
        }
        .login-title {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 800;
          font-size: 1.4rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .login-subtitle {
          font-size: 0.8rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 24px;
        }
        .login-btn {
          width: 100%;
          padding: 10px;
          font-size: 1rem;
        }
      `}</style>
    </div>
  );
}
