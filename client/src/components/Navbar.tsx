import React from "react";
import { useAuth } from "../context/useAuth";
import type { UserRole } from "../types";
import "../styles/navbar.css";

interface NavbarProps {
  onNavigateHome: () => void;
  onNavigateBooking: () => void;
}

const ROLE_DASHBOARD_ROUTES: Record<UserRole, string> = {
  super_admin: "#dashboard/super-admin",
  event_admin: "#dashboard/event-admin",
  counter_operator: "#dashboard/counter-operator",
  security_staff: "#dashboard/security",
};

export const Navbar: React.FC<NavbarProps> = ({ onNavigateHome, onNavigateBooking }) => {
  const { user, isAuthenticated, logout } = useAuth();

  const handleDashboardClick = () => {
    if (user) {
      window.location.hash = ROLE_DASHBOARD_ROUTES[user.role] || "";
    }
  };

  const handleLoginClick = () => {
    window.location.hash = "#login";
  };

  const handleLogoutClick = () => {
    logout();
    window.location.hash = "";
  };

  return (
    <header className="navbar-header">
      <div className="navbar-container">
        {/* Brand Logo & Title */}
        <div 
          onClick={onNavigateHome}
          className="navbar-brand"
        >
          <div className="navbar-logo-badge">
            OG
          </div>
          <div>
            <h1 className="navbar-title gold-gradient-text">
              ONLINE GARBA 
            </h1>
            <p className="navbar-subtitle">
              Navratri Mahotsav 2026
            </p>
          </div>
        </div>

        {/* Navigation Actions */}
        <nav className="navbar-nav">
          {isAuthenticated && user ? (
            <>
              <button
                onClick={handleDashboardClick}
                className="nav-secondary-btn"
                title="Go to staff dashboard"
                style={{
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  color: '#fbbf24',
                  padding: '0.45rem 0.9rem',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
                <span>Dashboard</span>
              </button>

              <button
                onClick={handleLogoutClick}
                className="nav-secondary-btn"
                title="Logout"
                style={{
                  background: 'rgba(225, 29, 72, 0.12)',
                  border: '1px solid rgba(225, 29, 72, 0.35)',
                  color: '#fda4af',
                  padding: '0.45rem 0.8rem',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={handleLoginClick}
              className="nav-secondary-btn"
              title="Staff Portal Login"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#cbd5e1',
                padding: '0.45rem 0.9rem',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <span>Staff Login</span>
            </button>
          )}

          <button
            onClick={onNavigateBooking}
            className="nav-cta-btn"
          >
            <span>Book Tickets</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </button>
        </nav>
      </div>
    </header>
  );
};

