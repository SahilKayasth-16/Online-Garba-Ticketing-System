import React, { Suspense, useEffect, useState } from "react";
import { Navbar } from "./components/Navbar";
import { Toast } from "./components/Toast";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import type { ToastMessage } from "./types";
import "./styles/global.css";

const HomePage = React.lazy(() => import("./pages/HomePage").then(m => ({ default: m.HomePage })));
const BookingPage = React.lazy(() => import("./pages/BookingPage").then(m => ({ default: m.BookingPage })));
const LoginPage = React.lazy(() => import("./pages/LoginPage").then(m => ({ default: m.LoginPage })));
const RegisterPage = React.lazy(() => import("./pages/RegisterPage").then(m => ({ default: m.RegisterPage })));
const SuperAdminDashboard = React.lazy(() => import("./pages/SuperAdminDashboard").then(m => ({ default: m.SuperAdminDashboard })));
const EventAdminDashboard = React.lazy(() => import("./pages/EventAdminDashboard").then(m => ({ default: m.EventAdminDashboard })));
const CounterOperatorDashboard = React.lazy(() => import("./pages/CounterOperatorDashboard").then(m => ({ default: m.CounterOperatorDashboard })));
const SecurityDashboard = React.lazy(() => import("./pages/SecurityDashboard").then(m => ({ default: m.SecurityDashboard })));

type AppRoute =
  | "home"
  | "book"
  | "login"
  | "register"
  | "dash_super_admin"
  | "dash_event_admin"
  | "dash_counter_operator"
  | "dash_security";

function MainApp() {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>("home");
  const [activeToast, setActiveToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === "#book" || hash.startsWith("#book")) {
        setCurrentRoute("book");
      } else if (hash === "#login") {
        setCurrentRoute("login");
      } else if (hash === "#register") {
        setCurrentRoute("register");
      } else if (hash === "#dashboard/super-admin") {
        setCurrentRoute("dash_super_admin");
      } else if (hash === "#dashboard/event-admin") {
        setCurrentRoute("dash_event_admin");
      } else if (hash === "#dashboard/counter-operator") {
        setCurrentRoute("dash_counter_operator");
      } else if (hash === "#dashboard/security") {
        setCurrentRoute("dash_security");
      } else {
        setCurrentRoute("home");
      }
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const handleNavigateHome = () => {
    setCurrentRoute("home");
    window.location.hash = "";
  };

  const handleNavigateBooking = () => {
    setCurrentRoute("book");
    window.location.hash = "#book";
  };

  const handleNavigateLogin = () => {
    setCurrentRoute("login");
    window.location.hash = "#login";
  };

  const handleNavigateRegister = () => {
    setCurrentRoute("register");
    window.location.hash = "#register";
  };

  const handleShowToast = (toast: ToastMessage) => {
    setActiveToast(toast);
    setTimeout(() => {
      setActiveToast(null);
    }, 4000);
  };

  const renderRouteContent = () => {
    switch (currentRoute) {
      case "book":
        return (
          <BookingPage
            onShowToast={handleShowToast}
            onGoHome={handleNavigateHome}
          />
        );
      case "login":
        return (
          <LoginPage
            onShowToast={handleShowToast}
            onNavigateRegister={handleNavigateRegister}
            onNavigateHome={handleNavigateHome}
          />
        );
      case "register":
        return (
          <RegisterPage
            onShowToast={handleShowToast}
            onNavigateLogin={handleNavigateLogin}
            onNavigateHome={handleNavigateHome}
          />
        );
      case "dash_super_admin":
        return (
          <ProtectedRoute allowedRoles={["super_admin"]}>
            <SuperAdminDashboard />
          </ProtectedRoute>
        );
      case "dash_event_admin":
        return (
          <ProtectedRoute allowedRoles={["event_admin"]}>
            <EventAdminDashboard />
          </ProtectedRoute>
        );
      case "dash_counter_operator":
        return (
          <ProtectedRoute allowedRoles={["counter_operator"]}>
            <CounterOperatorDashboard />
          </ProtectedRoute>
        );
      case "dash_security":
        return (
          <ProtectedRoute allowedRoles={["security_staff"]}>
            <SecurityDashboard />
          </ProtectedRoute>
        );
      case "home":
      default:
        return <HomePage onGoToBooking={handleNavigateBooking} />;
    }
  };

  return (
    <div className="app-layout">
      <Navbar onNavigateHome={handleNavigateHome} onNavigateBooking={handleNavigateBooking} />

      <main className="main-content">
        <Suspense fallback={<LoadingSkeleton />}>
          {renderRouteContent()}
        </Suspense>
      </main>

      <footer className="app-footer">
        <div>
          <p className="app-footer-title">
            ONLINE GARBA TICKETTING SYSTEM 2026
          </p>
          <p>Bardoli, Surat, Gujarat</p>
          <p style={{ marginTop: '0.35rem', fontSize: '0.75rem', opacity: 0.7 }}>
            © Online Garba Ticketting System 2026. All rights reserved. Developed by Sahil Kayasth.
          </p>
        </div>
      </footer>

      <Toast toast={activeToast} onClose={() => setActiveToast(null)} />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

export default App;

