import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookingForm } from "../components/BookingForm";
import { DashboardLayout } from "../components/DashboardLayout";
import { Toast } from "../components/Toast";
import { useAuth } from "../context/useAuth";
import {
  ApiError,
  confirmCashPayment,
  createBooking,
  createPaymentQr,
  getBookingById,
  getBookings,
  getDailyCapacities,
  getTicketPdfUrl,
} from "../services/api";
import type { BookingData, DailyCapacity, ToastMessage } from "../types";

const FESTIVAL_DATES = [
  { isoDate: "2026-10-11", label: "11 Oct 2026 (Day 1)" },
  { isoDate: "2026-10-12", label: "12 Oct 2026 (Day 2)" },
  { isoDate: "2026-10-13", label: "13 Oct 2026 (Day 3)" },
  { isoDate: "2026-10-14", label: "14 Oct 2026 (Day 4)" },
  { isoDate: "2026-10-15", label: "15 Oct 2026 (Day 5)" },
  { isoDate: "2026-10-16", label: "16 Oct 2026 (Day 6)" },
  { isoDate: "2026-10-17", label: "17 Oct 2026 (Day 7)" },
  { isoDate: "2026-10-18", label: "18 Oct 2026 (Day 8)" },
  { isoDate: "2026-10-19", label: "19 Oct 2026 (Day 9)" },
  { isoDate: "2026-10-20", label: "20 Oct 2026 (Day 10)" },
];

function getKolkataIsoDate(): string {
  const now = new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function formatToLongDate(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const day = parseInt(parts[2], 10);
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthIndex = parseInt(parts[1], 10) - 1;
  const month = monthNames[monthIndex] || "";
  const year = parts[0];
  return `${day} ${month} ${year}`;
}

export const CounterOperatorDashboard: React.FC = () => {
  const { token } = useAuth();

  // Current calendar date in Asia/Kolkata
  const [todayIso, setTodayIso] = useState<string>(getKolkataIsoDate);
  const lastTodayIsoRef = useRef<string>(todayIso);

  const isTodayFestivalDay = useMemo(
    () => FESTIVAL_DATES.some((d) => d.isoDate === todayIso),
    [todayIso]
  );

  // Selected date for booking & inspection
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return isTodayFestivalDay ? todayIso : FESTIVAL_DATES[0].isoDate;
  });

  const [capacities, setCapacities] = useState<DailyCapacity[]>([]);
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isProcessingBooking, setIsProcessingBooking] = useState<boolean>(false);
  const [activeBooking, setActiveBooking] = useState<BookingData | null>(null);
  const [confirmingCashIds, setConfirmingCashIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const activeBookingRef = useRef<HTMLDivElement | null>(null);

  const showToast = (t: ToastMessage) => {
    setToast(t);
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Fetch live capacity and bookings for selected date
  const loadData = useCallback(async (targetDate: string, isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const [caps, bks] = await Promise.all([
        getDailyCapacities(),
        getBookings(targetDate),
      ]);
      setCapacities(caps);
      setBookings(bks);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load counter data.";
      showToast({
        id: Date.now().toString(),
        type: "error",
        title: "DATA FETCH ERROR",
        message: msg,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(selectedDate);
  }, [loadData, selectedDate]);

  // Automatic day transition monitor (runs every 30s)
  useEffect(() => {
    const timer = setInterval(() => {
      const currentKolkataDate = getKolkataIsoDate();
      if (currentKolkataDate !== lastTodayIsoRef.current) {
        lastTodayIsoRef.current = currentKolkataDate;
        setTodayIso(currentKolkataDate);

        // If newly transitioned day is an eligible festival date, automatically select it
        const eligible = FESTIVAL_DATES.some((d) => d.isoDate === currentKolkataDate);
        if (eligible) {
          setSelectedDate(currentKolkataDate);
          loadData(currentKolkataDate, true);
        } else {
          loadData(selectedDate, true);
        }
      }
    }, 30000);

    return () => clearInterval(timer);
  }, [loadData, selectedDate]);

  // Capacity stats for the currently selected date
  const currentCapacity = useMemo(() => {
    return capacities.find((c) => c.event_date === selectedDate);
  }, [capacities, selectedDate]);

  // Confirm cash collection handler
  const handleConfirmCash = async (bookingId: string) => {
    if (!token) {
      showToast({
        id: Date.now().toString(),
        type: "error",
        title: "AUTHENTICATION REQUIRED",
        message: "You must be logged in as Counter Operator or Admin to collect cash.",
      });
      return;
    }

    setConfirmingCashIds((prev) => new Set(prev).add(bookingId));

    try {
      const res = await confirmCashPayment(token, bookingId);

      showToast({
        id: Date.now().toString(),
        type: "success",
        title: "PAYMENT CONFIRMED",
        message: "payment received",
      });

      // If activeBooking is the one being confirmed, update it with issued tickets
      if (activeBooking && activeBooking.booking_id === bookingId) {
        setActiveBooking(res.data);
      }

      // Refresh table and capacity stats
      await loadData(selectedDate, true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "payment failed";
      showToast({
        id: Date.now().toString(),
        type: "error",
        title: "PAYMENT FAILED",
        message: msg.toLowerCase().includes("fail") ? msg : "payment failed",
      });
    } finally {
      setConfirmingCashIds((prev) => {
        const next = new Set(prev);
        next.delete(bookingId);
        return next;
      });
    }
  };

  // Inspect existing booking in desk preview
  const handleInspectBooking = async (bookingId: string) => {
    try {
      let b = await getBookingById(bookingId);
      // If online pending and lacks QR URL, fetch payment QR
      if (b.payment_method.toUpperCase() === "ONLINE" && b.payment_status.toLowerCase() === "pending" && !b.payment_qr_data_url) {
        const qrRes = await createPaymentQr(bookingId);
        b = { ...b, payment_qr_data_url: qrRes.qr_data_url };
      }
      setActiveBooking(b);
      setTimeout(() => {
        activeBookingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load booking details.";
      showToast({
        id: Date.now().toString(),
        type: "error",
        title: "INSPECTION ERROR",
        message: msg,
      });
    }
  };

  const handleBookingSubmit = async (formData: {
    event_date: string;
    quantity: number;
    payment_method: "online" | "cash";
  }) => {
    setIsProcessingBooking(true);

    try {
      let result = await createBooking({
        event_date: formData.event_date,
        quantity: formData.quantity,
        payment_method: formData.payment_method,
      });

      // If online payment requested, fetch Customer Payment QR (System 1)
      if (formData.payment_method === "online") {
        try {
          const qrRes = await createPaymentQr(result.booking_id);
          result = { ...result, payment_qr_data_url: qrRes.qr_data_url };
        } catch {
          // fallback to result as-is
        }
      }

      setActiveBooking(result);

      if (formData.payment_method === "cash") {
        showToast({
          id: Date.now().toString(),
          type: "info",
          title: "CASH PAYMENT REQUIRED",
          message: `Booking #${result.booking_id} reserved. Please collect cash from customer.`,
        });
      } else {
        showToast({
          id: Date.now().toString(),
          type: "info",
          title: "PAYMENT QR GENERATED",
          message: `Booking #${result.booking_id} created. Customer payment QR ready.`,
        });
      }

      // Refresh data from database
      await loadData(selectedDate, true);

      setTimeout(() => {
        activeBookingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.errorCode === "EVENT_DATE_SOLD_OUT") {
        showToast({
          id: Date.now().toString(),
          type: "error",
          title: "SOLD OUT",
          message:
            "Today's ticket are sold out. You may book advance for another day. Sorry for inconveniency",
        });
      } else {
        const msg =
          err instanceof Error ? err.message : "Booking submission failed.";
        showToast({
          id: Date.now().toString(),
          type: "error",
          title: "BOOKING REJECTED",
          message: msg,
        });
      }
    } finally {
      setIsProcessingBooking(false);
    }
  };

  return (
    <DashboardLayout
      roleTitle="Counter Operator"
      roleSubtitle="Box Office & Ticket Sales Desk"
    >
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <div className="dashboard-card">
        <h2 className="dashboard-card-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2"></rect>
            <line x1="6" y1="8" x2="6" y2="8"></line>
            <line x1="10" y1="8" x2="18" y2="8"></line>
            <line x1="6" y1="12" x2="18" y2="12"></line>
            <line x1="6" y1="16" x2="12" y2="16"></line>
          </svg>
          Counter Operator Dashboard
        </h2>
        <p className="dashboard-role-description">
          Process on-spot ticket bookings, collect cash, generate customer payment QRs, and issue official admission passes.
        </p>

        {/* Notice when current calendar date has no scheduled event */}
        {!isTodayFestivalDay && (
          <div className="no-event-banner" role="status">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>
              There is no event scheduled for today ({todayIso}). You can select an available event date to make an advance booking.
            </span>
          </div>
        )}

        {/* Date Selector Bar */}
        <div className="counter-date-bar">
          <div className="counter-date-label-group">
            <span className="counter-date-label">
              Active Desk Date {selectedDate === todayIso && "(Today)"}
            </span>
            <span className="counter-date-value">
              {formatToLongDate(selectedDate)}
            </span>
          </div>

          <div className="counter-selector-group">
            <label htmlFor="counter-date-dropdown" className="counter-date-label">
              Select Festival Date:
            </label>
            <select
              id="counter-date-dropdown"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="counter-date-select"
            >
              {FESTIVAL_DATES.map((day) => (
                <option key={day.isoDate} value={day.isoDate}>
                  {day.label} {day.isoDate === todayIso ? "★ (Today)" : ""}
                </option>
              ))}
            </select>

            <button
              onClick={() => loadData(selectedDate, true)}
              disabled={loading || refreshing}
              className="btn-capacity-edit"
              title="Refresh from PostgreSQL Database"
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
                style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }}
              >
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Live Capacity Stats for Selected Date */}
        <div className="dashboard-grid" style={{ marginBottom: "2rem" }}>
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Daily Capacity</span>
            <span className="dashboard-stat-value">
              {currentCapacity ? currentCapacity.capacity : "..."}
            </span>
            <span className="dashboard-stat-desc">
              Configured in PostgreSQL
            </span>
          </div>

          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Confirmed / Sold Passes</span>
            <span className="dashboard-stat-value" style={{ color: "#38bdf8" }}>
              {currentCapacity ? currentCapacity.sold : "..."}
            </span>
            <span className="dashboard-stat-desc">
              Actual database sales count
            </span>
          </div>

          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Remaining for Sale</span>
            <span
              className="dashboard-stat-value"
              style={{
                color:
                  currentCapacity && currentCapacity.remaining === 0
                    ? "#e11d48"
                    : "#34d399",
              }}
            >
              {currentCapacity ? currentCapacity.remaining : "..."}
            </span>
            <span className="dashboard-stat-desc">
              {currentCapacity && currentCapacity.remaining === 0
                ? "SOLD OUT for this date"
                : "Available for counter issuance"}
            </span>
          </div>

          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Authoritative Price</span>
            <span className="dashboard-stat-value" style={{ color: "#fbbf24" }}>
              ₹200.00
            </span>
            <span className="dashboard-stat-desc">Per ticket pass</span>
          </div>
        </div>
      </div>

      {/* Active Desk Booking Terminal / Issuance Panel */}
      {activeBooking && (
        <div className="dashboard-card" ref={activeBookingRef} style={{ marginTop: "2rem", border: "1.5px solid rgba(245, 158, 11, 0.5)" }}>
          <div className="capacity-header-row" style={{ alignItems: "center" }}>
            <div>
              <h2 className="dashboard-card-title" style={{ color: "#fef3c7" }}>
                Active Desk Order: {activeBooking.booking_id}
              </h2>
              <p className="capacity-subtitle">
                {formatToLongDate(activeBooking.event_date)} • {activeBooking.quantity} pass(es) • Total: ₹{activeBooking.total_amount.toFixed(2)}
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span
                className={`badge-status ${
                  activeBooking.payment_status.toLowerCase() === "paid" ? "paid" : "pending"
                }`}
              >
                {activeBooking.payment_status.toUpperCase()}
              </span>
              <button
                onClick={() => setActiveBooking(null)}
                className="btn-capacity-cancel"
                style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}
              >
                Close Order View
              </button>
            </div>
          </div>

          {/* 1. CASH WORKFLOW PROMPT & ACTION */}
          {activeBooking.payment_method.toUpperCase() === "CASH" && activeBooking.payment_status.toLowerCase() === "pending" && (
            <div className="cash-collection-alert" role="alert">
              <div className="cash-collection-header">
                <div>
                  <span className="cash-prompt-pill">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    collect cash from customer
                  </span>
                  <p style={{ marginTop: "0.5rem", color: "#fef3c7", fontSize: "0.95rem" }}>
                    Physical cash due: <strong>₹{activeBooking.total_amount.toFixed(2)}</strong> for {activeBooking.quantity} entrance pass(es).
                  </p>
                </div>
                <button
                  onClick={() => handleConfirmCash(activeBooking.booking_id)}
                  disabled={confirmingCashIds.has(activeBooking.booking_id)}
                  className="btn-cash-collected"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  {confirmingCashIds.has(activeBooking.booking_id)
                    ? "Recording Cash Receipt..."
                    : "Cash Collected"}
                </button>
              </div>
            </div>
          )}

          {/* 2. ONLINE PAYMENT QR SYSTEM 1 */}
          {activeBooking.payment_method.toUpperCase() === "ONLINE" && activeBooking.payment_status.toLowerCase() === "pending" && (
            <div className="payment-qr-container">
              <div>
                <span
                  style={{
                    display: "inline-block",
                    padding: "0.3rem 0.8rem",
                    borderRadius: "9999px",
                    backgroundColor: "rgba(99, 102, 241, 0.2)",
                    color: "#a5b4fc",
                    border: "1px solid #6366f1",
                    fontWeight: 800,
                    fontSize: "0.8rem",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    marginBottom: "0.5rem",
                  }}
                >
                  Customer Payment QR (QR System 1)
                </span>
                <h3 style={{ color: "#ffffff", fontSize: "1.2rem", margin: "0.25rem 0" }}>
                  Scan to Pay: ₹{activeBooking.total_amount.toFixed(2)} ({Math.round(activeBooking.total_amount * 100)} paise)
                </h3>
                <p style={{ color: "#94a3b8", fontSize: "0.85rem", maxWidth: "460px" }}>
                  Ask customer to scan this QR with any UPI app to pay the exact amount. This QR is strictly for payment collection.
                </p>
              </div>

              {activeBooking.payment_qr_data_url ? (
                <img
                  src={activeBooking.payment_qr_data_url}
                  alt="Customer Payment QR"
                  className="payment-qr-image"
                />
              ) : (
                <div style={{ color: "#fbbf24", padding: "1rem" }}>
                  Loading payment QR code...
                </div>
              )}

              <p style={{ color: "#cbd5e1", fontSize: "0.8rem", fontStyle: "italic" }}>
                Entrance passes with security gate QR codes will be unlocked after online payment is confirmed.
              </p>
            </div>
          )}

          {/* 3. ISSUED PASSES WITH QR SYSTEM 2 (ENTRANCE QRS) */}
          {activeBooking.payment_status.toLowerCase() === "paid" && (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  margin: "1rem 0",
                  padding: "0.75rem 1rem",
                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid rgba(16, 185, 129, 0.4)",
                  borderRadius: "12px",
                }}
              >
                <span style={{ color: "#34d399", fontWeight: 700, fontSize: "0.95rem" }}>
                  ✓ Payment confirmed! {activeBooking.tickets?.length || activeBooking.quantity} entrance pass(es) issued with gate admission QR codes.
                </span>

                <a
                  href={getTicketPdfUrl(activeBooking.booking_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-pdf-download"
                  style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  Download Multi-Page Passes PDF
                </a>
              </div>

              <div className="passes-issued-grid">
                {(activeBooking.tickets || []).map((t, idx) => (
                  <div key={t.ticket_number} className="pass-card-issued">
                    <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 700 }}>
                        PASS {idx + 1} OF {activeBooking.quantity}
                      </span>
                      <span className="pass-card-badge">{t.status.toUpperCase()}</span>
                    </div>

                    <div className="pass-card-serial">{t.ticket_number}</div>

                    {t.qr_code_data_url ? (
                      <img
                        src={t.qr_code_data_url}
                        alt={`QR Pass ${t.ticket_number}`}
                        className="pass-card-qr-img"
                      />
                    ) : (
                      <div style={{ width: 140, height: 140, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
                        QR Ready
                      </div>
                    )}

                    <div style={{ fontSize: "0.75rem", color: "#cbd5e1", lineHeight: 1.3 }}>
                      <strong>Entrance Gate Pass (QR System 2)</strong>
                      <br />
                      Valid for {formatToLongDate(t.event_date)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Embedded Counter Booking Form */}
      <div className="dashboard-card" style={{ marginTop: "2rem" }}>
        <h2 className="dashboard-card-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="12" y1="18" x2="12" y2="12"></line>
            <line x1="9" y1="15" x2="15" y2="15"></line>
          </svg>
          Issue Ticket Pass (Desk Terminal)
        </h2>
        <p className="dashboard-role-description">
          Enter ticket quantity and payment mode. Capacity is validated at checkout against PostgreSQL.
        </p>

        <BookingForm
          onSubmit={handleBookingSubmit}
          isProcessing={isProcessingBooking}
          externalSelectedDate={selectedDate}
          onDateChange={(d) => setSelectedDate(d)}
          badgeLabel="COUNTER DESK ISSUANCE"
          formTitle={`RESERVE PASSES FOR ${formatToLongDate(selectedDate).toUpperCase()}`}
          formSubtitle={`Online Garba Ticketing System 2026 • Counter Sales Desk`}
        />
      </div>

      {/* 3. Real Bookings History for Selected Date */}
      <div className="dashboard-card" style={{ marginTop: "2rem" }}>
        <div className="capacity-header-row">
          <div>
            <h2 className="dashboard-card-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
              Booking Records for {formatToLongDate(selectedDate)}
            </h2>
            <p className="capacity-subtitle">
              Live booking entries stored in PostgreSQL for the selected festival date.
            </p>
          </div>
        </div>

        {bookings.length === 0 ? (
          <div className="capacity-loading-state">
            No bookings recorded yet for {formatToLongDate(selectedDate)}.
          </div>
        ) : (
          <div className="capacity-table-container">
            <table className="capacity-table">
              <thead>
                <tr>
                  <th>Booking ID</th>
                  <th>Passes</th>
                  <th>Total Amount</th>
                  <th>Payment Mode</th>
                  <th>Status</th>
                  <th>Booked At</th>
                  <th>Actions & Cash Collection</th>
                  <th style={{ textAlign: "right" }}>Ticket PDF</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const isCashPending =
                    b.payment_method.toUpperCase() === "CASH" &&
                    b.payment_status.toLowerCase() === "pending";
                  const isPaid = b.payment_status.toLowerCase() === "paid";

                  return (
                    <tr key={b.booking_id}>
                      <td>
                        <strong style={{ color: "#fef3c7" }}>
                          {b.booking_id}
                        </strong>
                      </td>
                      <td>{b.quantity} pass(es)</td>
                      <td>₹{b.total_amount.toFixed(2)}</td>
                      <td>
                        <span className="capacity-date-day">
                          {b.payment_method}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge-status ${
                            isPaid ? "paid" : "pending"
                          }`}
                        >
                          {b.payment_status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className="capacity-date-day">
                          {b.created_at
                            ? new Date(b.created_at).toLocaleString()
                            : "N/A"}
                        </span>
                      </td>
                      <td>
                        {isCashPending ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                            <span
                              className="badge-status pending"
                              style={{
                                fontSize: "0.7rem",
                                padding: "0.2rem 0.5rem",
                                display: "inline-block",
                                textAlign: "center",
                              }}
                            >
                              collect cash from customer
                            </span>
                            <button
                              onClick={() => handleConfirmCash(b.booking_id)}
                              disabled={confirmingCashIds.has(b.booking_id)}
                              className="btn-cash-collected"
                              style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
                            >
                              {confirmingCashIds.has(b.booking_id)
                                ? "Confirming..."
                                : "Cash Collected"}
                            </button>
                          </div>
                        ) : isPaid ? (
                          <button
                            onClick={() => handleInspectBooking(b.booking_id)}
                            className="btn-capacity-edit"
                            style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
                          >
                            View Passes ({b.quantity})
                          </button>
                        ) : (
                          <button
                            onClick={() => handleInspectBooking(b.booking_id)}
                            className="btn-capacity-edit"
                            style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
                          >
                            Show Payment QR
                          </button>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <a
                          href={getTicketPdfUrl(b.booking_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-pdf-download"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                          </svg>
                          PDF
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};
