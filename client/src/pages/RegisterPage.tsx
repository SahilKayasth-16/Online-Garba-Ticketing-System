import React, { useState } from "react";
import { useAuth } from "../context/useAuth";
import type { ToastMessage, UserRole } from "../types";
import "../styles/auth.css";

interface RegisterPageProps {
  onShowToast?: (toast: ToastMessage) => void;
  onNavigateLogin?: () => void;
  onNavigateHome?: () => void;
}

const ROLE_DASHBOARD_ROUTES: Record<UserRole, string> = {
  super_admin: "#dashboard/super-admin",
  event_admin: "#dashboard/event-admin",
  counter_operator: "#dashboard/counter-operator",
  security_staff: "#dashboard/security",
};

export const RegisterPage: React.FC<RegisterPageProps> = ({
  onShowToast,
  onNavigateLogin,
  onNavigateHome,
}) => {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("counter_operator");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    if (!contactNumber.trim()) {
      setErrorMessage("Please enter your contact number.");
      return;
    }
    if (!email.trim()) {
      setErrorMessage("Please enter your email address.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await register({
        name: name.trim(),
        contact_number: contactNumber.trim(),
        email: email.trim(),
        password,
        role,
      });

      if (onShowToast) {
        onShowToast({
          id: Date.now().toString(),
          type: "success",
          title: "Registration Successful",
          message: `Account created for ${response.user.name}!`,
        });
      }

      const targetRoute = ROLE_DASHBOARD_ROUTES[response.user.role] || "";
      window.location.hash = targetRoute;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed. Please check inputs.";
      setErrorMessage(message);
      if (onShowToast) {
        onShowToast({
          id: Date.now().toString(),
          type: "error",
          title: "Registration Error",
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
          <span className="auth-badge">PORTAL REGISTRATION</span>
          <h2 className="auth-title">Create Account</h2>
          <p className="auth-subtitle">
            Online Garba Ticketting System 2026 Staff Portal
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
            <label className="auth-label" htmlFor="reg-name">
              Full Name
            </label>
            <input
              id="reg-name"
              type="text"
              className="auth-input"
              placeholder="e.g. Ramesh Patel"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="auth-field-group">
            <label className="auth-label" htmlFor="reg-phone">
              Contact Number
            </label>
            <input
              id="reg-phone"
              type="tel"
              className="auth-input"
              placeholder="e.g. 9876543210"
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              required
            />
          </div>

          <div className="auth-field-group">
            <label className="auth-label" htmlFor="reg-email">
              Email Address
            </label>
            <input
              id="reg-email"
              type="email"
              className="auth-input"
              placeholder="e.g. staff@test.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-field-group">
            <label className="auth-label" htmlFor="reg-password">
              Password (min 6 characters)
            </label>
            <input
              id="reg-password"
              type="password"
              className="auth-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <div className="auth-field-group">
            <label className="auth-label" htmlFor="reg-role">
              Assign Role
            </label>
            <select
              id="reg-role"
              className="auth-select"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              <option value="super_admin">Super Admin</option>
              <option value="event_admin">Event Admin</option>
              <option value="counter_operator">Counter Operator</option>
              <option value="security_staff">Security Staff</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="auth-submit-btn"
          >
            {isSubmitting ? "Creating Account..." : "Register Staff Account"}
          </button>
        </form>

        <div className="auth-footer-links">
          <span>Already have an account?</span>
          <button
            type="button"
            onClick={onNavigateLogin || (() => { window.location.hash = "#login"; })}
            className="auth-link"
            style={{ background: 'none', border: 'none', font: 'inherit' }}
          >
            Sign In Here
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
