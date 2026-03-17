import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

export default function NavBar() {
  const location = useLocation();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut(auth);
    navigate('/login');
  }

  const links = [
    { to: '/', label: 'Dashboard' },
    { to: '/settings', label: 'Settings' },
  ];

  return (
    <nav className="navbar no-print">
      <div className="navbar-brand">
        <span className="navbar-logo">HX</span>
        <span className="navbar-title">Box Event Manager</span>
      </div>
      <div className="navbar-links">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`navbar-link ${location.pathname === link.to ? 'active' : ''}`}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <button className="btn-ghost navbar-logout" onClick={handleLogout}>
        Logout
      </button>

      <style>{`
        .navbar {
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          padding: 0 24px;
          height: 52px;
          gap: 24px;
          flex-shrink: 0;
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .navbar-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          flex-shrink: 0;
        }
        .navbar-logo {
          background: var(--yellow);
          color: #000;
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 800;
          font-size: 1rem;
          padding: 2px 6px;
          border-radius: 2px;
          letter-spacing: 0.04em;
        }
        .navbar-title {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 700;
          font-size: 1rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text);
        }
        .navbar-links {
          display: flex;
          gap: 4px;
          flex: 1;
        }
        .navbar-link {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 600;
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          padding: 6px 12px;
          border-radius: var(--radius);
          text-decoration: none;
          transition: color var(--transition), background var(--transition);
        }
        .navbar-link:hover {
          color: var(--text);
          background: var(--bg-elevated);
          text-decoration: none;
        }
        .navbar-link.active {
          color: var(--yellow);
        }
        .navbar-logout {
          flex-shrink: 0;
          font-size: 0.82rem;
        }
      `}</style>
    </nav>
  );
}
