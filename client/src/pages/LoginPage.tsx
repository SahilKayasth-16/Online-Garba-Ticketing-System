import React, { useState } from "react";
import { useAuth } from "../context/useAuth";
import type { ToastMessage, UserRole } from "../types";
import "../styles/auth.css";

interface LoginPageProps {
  onShowToast?: (toast: ToastMessage) => void;
  onNavigateRegister?: () => void;
  onNavigateHome?: () => void;
}

const ROLE_DASHBOARD_ROUTES: Record<UserRole, string> = {
  super_admin: "#dashboard/super-admin",
  event_admin: "#dashboard/event-admin",
  counter_operator: "#dashboard/counter-operator",
  security_staff: "#dashboard/security",
};

export const LoginPage: React.FC<LoginPageProps> = ({
  onShowToast,
  onNavigateRegister,
  onNavigateHome,
}) => {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage("Please enter both email and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await login({
        email: email.trim(),
        password,
      });

      if (onShowToast) {
        onShowToast({
          id: Date.now().toString(),
          type: "success",
          title: "Login Successful",
          message: `Welcome back, ${response.user.name}!`,
        });
      }

      const targetRoute = ROLE_DASHBOARD_ROUTES[response.user.role] || "";
      window.location.hash = targetRoute;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed. Please try again.";
      setErrorMessage(message);
      if (onShowToast) {
        onShowToast({
          id: Date.now().toString(),
          type: "error",
          title: "Authentication Error",
          message,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-badge">STAFF PORTAL</span>
          <h2 className="auth-title">Account Login</h2>
          <p className="auth-subtitle">
            Online Garba Ticketting System 2026 Management
          </p>
        </div>

        {errorMessage && (
          <div className="auth-error-alert" style={{ marginBottom: "1.25rem" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field-group">
            <label className="auth-label" htmlFor="login-email">
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              className="auth-input"
              placeholder="operator@test.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-field-group">
            <label className="auth-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className="auth-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="auth-submit-btn"
          >
            {isSubmitting ? "Authenticating..." : "Sign In"}
          </button>
        </form>

        <div className="auth-footer-links">
          <span>Need to create a staff account?</span>
          <button
            type="button"
            onClick={onNavigateRegister || (() => { window.location.hash = "#register"; })}
            className="auth-link"
            style={{ background: 'none', border: 'none', font: 'inherit' }}
          >
            Register Here
          </button>
          <div style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              onClick={onNavigateHome || (() => { window.location.hash = ""; })}
              className="auth-link"
              style={{ background: 'none', border: 'none', font: 'inherit', color: '#94a3b8' }}
            >
              ← Back to Main Public Site
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
