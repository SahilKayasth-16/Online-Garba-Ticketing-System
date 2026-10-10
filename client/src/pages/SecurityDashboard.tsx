import React, { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode, type CameraDevice } from "html5-qrcode";
import { DashboardLayout } from "../components/DashboardLayout";
import { useAuth } from "../context/useAuth";
import {
  getScanHistory,
  getSecurityStats,
  verifyTicket,
} from "../services/api";
import type {
  ScanLogItem,
  SecurityStatsResponse,
  VerifyTicketResponse,
} from "../types";

const FESTIVAL_DATES = [
  { value: "2026-10-11", label: "11 Oct 2026 (Day 1)" },
  { value: "2026-10-12", label: "12 Oct 2026 (Day 2)" },
  { value: "2026-10-13", label: "13 Oct 2026 (Day 3)" },
  { value: "2026-10-14", label: "14 Oct 2026 (Day 4)" },
  { value: "2026-10-15", label: "15 Oct 2026 (Day 5)" },
  { value: "2026-10-16", label: "16 Oct 2026 (Day 6)" },
  { value: "2026-10-17", label: "17 Oct 2026 (Day 7)" },
  { value: "2026-10-18", label: "18 Oct 2026 (Day 8)" },
  { value: "2026-10-19", label: "19 Oct 2026 (Day 9)" },
  { value: "2026-10-20", label: "20 Oct 2026 (Day 10)" },
];

function getTodayIST(): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

type ScannerStatus =
  | "stopped"
  | "requesting_permission"
  | "starting"
  | "ready"
  | "verifying"
  | "error";

export const SecurityDashboard: React.FC = () => {
  const { token, user } = useAuth();

  // Active gate date (defaults to today in IST if within festival, else Oct 11)
  const [activeDate, setActiveDate] = useState<string>(() => {
    const today = getTodayIST();
    const inRange = FESTIVAL_DATES.some((d) => d.value === today);
    return inRange ? today : "2026-10-11";
  });

  // Scanner state
  const [scannerStatus, setScannerStatus] = useState<ScannerStatus>("stopped");
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [manualTokenInput, setManualTokenInput] = useState<string>("");

  // Verification result
  const [lastResult, setLastResult] = useState<VerifyTicketResponse | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  // Stats and history
  const [stats, setStats] = useState<SecurityStatsResponse | null>(null);
  const [history, setHistory] = useState<ScanLogItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Refs for scanner lifecycle
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const isVerifyingRef = useRef<boolean>(false);
  const lastScannedPayloadRef = useRef<{ code: string; time: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchStatsAndHistory = useCallback(async () => {
    if (!token) return;
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const [statsData, historyData] = await Promise.all([
        getSecurityStats(token, activeDate).catch(() => null),
        getScanHistory(token, activeDate, 50),
      ]);
      if (statsData) setStats(statsData);
      setHistory(historyData.items);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Failed to load scan records.");
    } finally {
      setLoadingHistory(false);
    }
  }, [token, activeDate]);

  useEffect(() => {
    fetchStatsAndHistory();
  }, [fetchStatsAndHistory]);

  // Load available video cameras on mount
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setCameras(devices);
          // Prefer back camera if available
          const backCam = devices.find(
            (c) =>
              c.label.toLowerCase().includes("back") ||
              c.label.toLowerCase().includes("rear") ||
              c.label.toLowerCase().includes("environment")
          );
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
        }
      })
      .catch((err) => {
        // Will request permission when user clicks 'Start Scanner'
        console.warn("Could not pre-enumerate cameras:", err);
      });
  }, []);

  // Main verification processor
  const processTicketVerification = useCallback(
    async (scannedCode: string) => {
      const trimmed = scannedCode.trim();
      if (!trimmed || isVerifyingRef.current || !token) return;

      // Throttle exact duplicate scans within 3 seconds to avoid double submission
      const now = Date.now();
      if (
        lastScannedPayloadRef.current &&
        lastScannedPayloadRef.current.code === trimmed &&
        now - lastScannedPayloadRef.current.time < 3000
      ) {
        return;
      }
      lastScannedPayloadRef.current = { code: trimmed, time: now };

      isVerifyingRef.current = true;
      setIsVerifying(true);
      setScannerStatus("verifying");

      try {
        const response = await verifyTicket(token, {
          ticket_token: trimmed,
          gate_event_date: activeDate,
        });
        setLastResult(response);
      } catch (err) {
        setLastResult({
          success: false,
          status: "invalid",
          message:
            err instanceof Error
              ? err.message
              : "Network or server verification error occurred.",
          error_code: "VERIFICATION_FAILED",
        });
      } finally {
        isVerifyingRef.current = false;
        setIsVerifying(false);
        setScannerStatus("ready");
        // Dynamically refresh statistics and history log
        fetchStatsAndHistory();
      }
    },
    [token, activeDate, fetchStatsAndHistory]
  );

  // Start the live camera scanner
  const handleStartScanner = async () => {
    setScannerError(null);
    setScannerStatus("requesting_permission");

    try {
      if (!qrScannerRef.current) {
        qrScannerRef.current = new Html5Qrcode("qr-scanner-video-region");
      }

      setScannerStatus("starting");

      const cameraConfig = selectedCameraId
        ? { deviceId: { exact: selectedCameraId } }
        : { facingMode: "environment" };

      await qrScannerRef.current.start(
        cameraConfig,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          processTicketVerification(decodedText);
        },
        () => {
          // Normal frame pass, ignore
        }
      );

      setScannerStatus("ready");

      // Re-fetch cameras list if not previously populated
      if (cameras.length === 0) {
        const updatedCameras = await Html5Qrcode.getCameras().catch(() => []);
        if (updatedCameras.length > 0) {
          setCameras(updatedCameras);
        }
      }
    } catch (err: unknown) {
      console.error("Camera scanner start failed:", err);
      let errorMsg = "Unable to access the camera.";
      const errorStr = String(err);

      if (
        errorStr.includes("NotAllowedError") ||
        errorStr.includes("Permission denied")
      ) {
        errorMsg =
          "Camera permission was denied. Please grant camera access in your browser settings to scan QR tickets.";
      } else if (
        errorStr.includes("NotFoundError") ||
        errorStr.includes("DevicesNotFoundError")
      ) {
        errorMsg =
          "No camera hardware detected on this device. You can verify passes using file upload or manual token entry.";
      } else if (errorStr.includes("NotReadableError")) {
        errorMsg =
          "Camera is currently being used by another application or browser tab. Please close it and retry.";
      } else if (errorStr.includes("already running")) {
        setScannerStatus("ready");
        return;
      }

      setScannerError(errorMsg);
      setScannerStatus("error");
    }
  };

  // Stop the live camera scanner
  const handleStopScanner = async () => {
    if (qrScannerRef.current) {
      try {
        if (qrScannerRef.current.isScanning) {
          await qrScannerRef.current.stop();
        }
        qrScannerRef.current.clear();
      } catch (err) {
        console.warn("Error while stopping scanner:", err);
      }
    }
    setScannerStatus("stopped");
    setScannerError(null);
  };

  // Cleanup camera on component unmount
  useEffect(() => {
    return () => {
      if (qrScannerRef.current) {
        if (qrScannerRef.current.isScanning) {
          qrScannerRef.current
            .stop()
            .catch(() => {})
            .finally(() => {
              try {
                qrScannerRef.current?.clear();
              } catch {
                // ignore
              }
            });
        }
      }
    };
  }, []);

  // Handle image file upload scan
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScannerError(null);
    try {
      let scanner = qrScannerRef.current;
      if (!scanner) {
        scanner = new Html5Qrcode("qr-scanner-video-region");
        qrScannerRef.current = scanner;
      }

      const decodedText = await scanner.scanFile(file, true);
      processTicketVerification(decodedText);
    } catch (err) {
      setScannerError(
        "Could not detect a valid QR code in the uploaded image. Please ensure the image is clear and well-lit."
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Handle manual token entry
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTokenInput.trim()) return;
    processTicketVerification(manualTokenInput.trim());
    setManualTokenInput("");
  };

  const todayIST = getTodayIST();
  const isTodayInFestival = FESTIVAL_DATES.some((d) => d.value === todayIST);

  return (
    <DashboardLayout
      roleTitle="Security Staff"
      roleSubtitle="Gate Access & Ticket QR Verification"
    >
      {/* Top Gate & Event Context Card */}
      <div className="security-date-card">
        <div className="security-date-info">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          <div>
            <span>Gate Inspection Date:</span>{" "}
            <strong>
              {FESTIVAL_DATES.find((d) => d.value === activeDate)?.label ||
                activeDate}
            </strong>
            {!isTodayInFestival && (
              <span style={{ fontSize: "0.75rem", color: "#94a3b8", marginLeft: "0.5rem" }}>
                (Today {todayIST} is outside festival)
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <label htmlFor="gate-date-select" style={{ fontSize: "0.8rem", color: "#cbd5e1", fontWeight: 700 }}>
            Gate Date:
          </label>
          <select
            id="gate-date-select"
            className="security-date-select"
            value={activeDate}
            onChange={(e) => setActiveDate(e.target.value)}
          >
            {FESTIVAL_DATES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Security Checkpoint Live Metrics */}
      <div className="dashboard-grid">
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">Total Gate Scans</span>
          <span className="dashboard-stat-value">
            {stats ? stats.total_scans : "—"}
          </span>
          <span className="dashboard-stat-desc">All verification attempts</span>
        </div>

        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">Approved Entries</span>
          <span className="dashboard-stat-value" style={{ color: "#34d399" }}>
            {stats ? stats.successful_entries : "—"}
          </span>
          <span className="dashboard-stat-desc">Valid passes admitted</span>
        </div>

        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">Denied / Rejections</span>
          <span className="dashboard-stat-value" style={{ color: "#f87171" }}>
            {stats ? stats.rejected_scans : "—"}
          </span>
          <span className="dashboard-stat-desc">Invalid, unpaid or used</span>
        </div>

        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">Active Officer</span>
          <span className="dashboard-stat-value" style={{ fontSize: "1.1rem" }}>
            {user ? user.name : "Security Staff"}
          </span>
          <span className="dashboard-stat-desc">Main Entrance Checkpoint</span>
        </div>
      </div>

      {/* Main Scanner & Verification Grid */}
      <div className="security-main-grid">
        {/* Left Column: Live QR Camera Scanner */}
        <div className="scanner-panel">
          <div className="scanner-header">
            <h3 className="scanner-title">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
                <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
                <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
                <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
                <rect x="7" y="7" width="10" height="10" rx="1"></rect>
              </svg>
              Live QR Scanner
            </h3>

            <span className={`scanner-status-badge ${scannerStatus}`}>
              {scannerStatus === "stopped" && "Stopped"}
              {scannerStatus === "requesting_permission" && "Requesting Cam"}
              {scannerStatus === "starting" && "Starting..."}
              {scannerStatus === "ready" && "Ready to Scan"}
              {scannerStatus === "verifying" && "Verifying..."}
              {scannerStatus === "error" && "Error"}
            </span>
          </div>

          {/* Camera Viewport Container */}
          <div className="scanner-viewport-wrapper">
            <div id="qr-scanner-video-region"></div>
            {scannerStatus === "stopped" && (
              <div className="scanner-placeholder">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
                <p className="scanner-placeholder-text">
                  Camera is idle. Click <strong>Start Scanner</strong> to activate
                  the camera or choose a photo below.
                </p>
              </div>
            )}
          </div>

          {/* Scanner Error Guidance Banner */}
          {scannerError && (
            <div className="scanner-error-box">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>{scannerError}</span>
            </div>
          )}

          {/* Camera Controls & Selector */}
          <div className="scanner-controls">
            {cameras.length > 1 && (
              <div className="scanner-camera-picker">
                <label htmlFor="cam-selector" style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  Camera:
                </label>
                <select
                  id="cam-selector"
                  value={selectedCameraId}
                  onChange={(e) => {
                    setSelectedCameraId(e.target.value);
                    if (scannerStatus === "ready") {
                      handleStopScanner().then(handleStartScanner);
                    }
                  }}
                >
                  {cameras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label || `Camera ${c.id.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="scanner-button-row">
              {scannerStatus !== "ready" && scannerStatus !== "verifying" ? (
                <button
                  type="button"
                  className="btn-scanner btn-scanner-start"
                  onClick={handleStartScanner}
                  disabled={scannerStatus === "starting" || scannerStatus === "requesting_permission"}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  {scannerStatus === "starting" ? "Starting..." : "Start Scanner"}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-scanner btn-scanner-stop"
                  onClick={handleStopScanner}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="6" y="6" width="12" height="12"></rect>
                  </svg>
                  Stop Scanner
                </button>
              )}

              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />

              <button
                type="button"
                className="btn-scanner btn-scanner-alt"
                onClick={() => fileInputRef.current?.click()}
                disabled={isVerifying}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                Scan from Image
              </button>
            </div>

            {/* Manual Token Entry Fallback */}
            <form onSubmit={handleManualSubmit} className="scanner-manual-input-box">
              <input
                type="text"
                className="scanner-manual-input"
                placeholder="Or enter Ticket Token / Serial manually..."
                value={manualTokenInput}
                onChange={(e) => setManualTokenInput(e.target.value)}
                disabled={isVerifying}
              />
              <button
                type="submit"
                className="btn-dash-action"
                style={{
                  backgroundColor: "#f59e0b",
                  color: "#020617",
                  border: "none",
                  fontWeight: 800,
                }}
                disabled={isVerifying || !manualTokenInput.trim()}
              >
                Verify
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Latest Verification Result Card */}
        <div className="result-panel">
          <h3 className="scanner-title">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 11 12 14 22 4"></polyline>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
            </svg>
            Verification Result
          </h3>

          {lastResult ? (
            <div className={`result-card ${lastResult.status}`}>
              <div className="result-header">
                <div className="result-icon">
                  {lastResult.status === "valid" && (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                  {lastResult.status === "already_used" && (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                  )}
                  {lastResult.status !== "valid" && lastResult.status !== "already_used" && (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="15" y1="9" x2="9" y2="15"></line>
                      <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                  )}
                </div>

                <div className="result-headings">
                  <span className="result-verdict">
                    {lastResult.status === "valid" && "VALID TICKET — ENTRY APPROVED"}
                    {lastResult.status === "already_used" && "ALREADY USED — ENTRY DENIED"}
                    {lastResult.status === "unpaid" && "ENTRY NOT ALLOWED — UNPAID"}
                    {lastResult.status === "wrong_date" && "WRONG EVENT DATE — NOT FOR TODAY"}
                    {lastResult.status === "revoked" && "ENTRY NOT ALLOWED — REVOKED"}
                    {lastResult.status === "invalid" && "INVALID QR CODE / TICKET"}
                  </span>
                  <span className="result-submessage">{lastResult.message}</span>
                </div>
              </div>

              {lastResult.ticket && (
                <div className="result-details-grid">
                  <div className="detail-slot">
                    <span className="detail-label">Serial Number</span>
                    <span className="detail-val">{lastResult.ticket.serial_number}</span>
                  </div>

                  <div className="detail-slot">
                    <span className="detail-label">Event Date</span>
                    <span className="detail-val">{lastResult.ticket.event_date}</span>
                  </div>

                  <div className="detail-slot">
                    <span className="detail-label">Payment Status</span>
                    <div>
                      {lastResult.ticket.payment_status === "paid" ? (
                        <span className="detail-badge-paid">PAID</span>
                      ) : (
                        <span className="detail-badge-pending">
                          {lastResult.ticket.payment_status.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="detail-slot">
                    <span className="detail-label">Entry Status</span>
                    <span className="detail-val" style={{ textTransform: "uppercase" }}>
                      {lastResult.ticket.entry_status}
                    </span>
                  </div>

                  {lastResult.ticket.entry_timestamp && (
                    <div className="detail-slot" style={{ gridColumn: "span 2" }}>
                      <span className="detail-label">Entry Timestamp</span>
                      <span className="detail-val" style={{ fontSize: "0.85rem", color: "#fef3c7" }}>
                        {new Date(lastResult.ticket.entry_timestamp).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          dateStyle: "medium",
                          timeStyle: "medium",
                        })}
                      </span>
                    </div>
                  )}

                  {lastResult.ticket.venue && (
                    <div className="detail-slot" style={{ gridColumn: "span 2" }}>
                      <span className="detail-label">Venue</span>
                      <span className="detail-val" style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
                        {lastResult.ticket.venue}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="result-card idle">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                <path d="M7 15h0M2 9.5h20"></path>
              </svg>
              <p style={{ marginTop: "0.75rem", fontSize: "0.95rem" }}>
                Awaiting scan... Present an attendee ticket QR pass to the camera.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section: Scan History Table */}
      <div className="history-panel">
        <div className="history-header">
          <h3 className="history-title">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            Recent Gate Scan History ({history.length})
          </h3>

          <button
            type="button"
            className="btn-refresh"
            onClick={fetchStatsAndHistory}
            disabled={loadingHistory}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={loadingHistory ? "spin" : ""}
            >
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            {loadingHistory ? "Refreshing..." : "Refresh Records"}
          </button>
        </div>

        {historyError && (
          <div className="scanner-error-box">
            <span>{historyError}</span>
          </div>
        )}

        <div className="scan-history-table-container">
          <table className="scan-history-table">
            <thead>
              <tr>
                <th>Scan Time (IST)</th>
                <th>Ticket Serial</th>
                <th>Event Date</th>
                <th>Result</th>
                <th>Security Officer</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {history.length > 0 ? (
                history.map((item) => (
                  <tr key={item.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {new Date(item.scanned_at).toLocaleTimeString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td>
                      <strong style={{ color: "#fef3c7" }}>
                        {item.ticket_number || "—"}
                      </strong>
                    </td>
                    <td>{item.event_date || "—"}</td>
                    <td>
                      <span className={`badge-scan-result ${item.scan_result}`}>
                        {item.scan_result.replace("_", " ")}
                      </span>
                    </td>
                    <td>{item.scanned_by || "Security Staff"}</td>
                    <td style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                      {item.message}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "2.5rem", color: "#64748b" }}>
                    {loadingHistory
                      ? "Loading scan history from database..."
                      : "No scan records recorded yet for this gate date."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
};
