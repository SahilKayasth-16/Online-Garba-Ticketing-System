import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookingForm } from "../components/BookingForm";
import { DashboardLayout } from "../components/DashboardLayout";
import { Toast } from "../components/Toast";
import {
  ApiError,
  createBooking,
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
  const [toast, setToast] = useState<ToastMessage | null>(null);

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

  const handleBookingSubmit = async (formData: {
    event_date: string;
    quantity: number;
    payment_method: "online" | "cash";
  }) => {
    setIsProcessingBooking(true);

    try {
      const result = await createBooking({
        event_date: formData.event_date,
        quantity: formData.quantity,
        payment_method: formData.payment_method,
      });

      showToast({
        id: Date.now().toString(),
        type: "success",
        title: "TICKET ISSUED SUCCESSFULLY",
        message: `Booking #${result.booking_id}: ${result.quantity} pass(es) confirmed for ${result.event_date}. Total: ₹${result.total_amount}.`,
      });

      // Refresh data from database
      await loadData(selectedDate, true);
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
          Process on-spot ticket bookings, issue passes for cash and online payments, and inspect live ticket capacity.
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
                  <th style={{ textAlign: "right" }}>Ticket PDF</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
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
                          b.payment_status.toLowerCase() === "paid"
                            ? "paid"
                            : "pending"
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};
