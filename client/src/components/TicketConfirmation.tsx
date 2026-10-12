import React from "react";
import type { BookingData } from "../types";
import { getTicketPdfUrl } from "../services/api";
import "../styles/ticketconfirmation.css";

interface TicketConfirmationProps {
  booking: BookingData;
  onBookMore: () => void;
  onGoHome?: () => void;
}

export const TicketConfirmation: React.FC<TicketConfirmationProps> = ({
  booking,
  onBookMore,
  onGoHome,
}) => {
  const pdfUrl = getTicketPdfUrl(booking.booking_id);
  const isPaid = booking.payment_status.toUpperCase() === "PAID";
  const isOnline = booking.payment_method.toUpperCase() === "ONLINE";

  const paymentMethodLabel =
    booking.payment_method.toUpperCase() === "CASH"
      ? "Cash Payment"
      : "Online Payment";

  const paymentStatusLabel = isPaid
    ? "Payment Successful & Confirmed"
    : "Payment Pending";

  return (
    <div className="confirmation-card">
      {/* Icon Badge */}
      <div
        className="success-badge-icon"
        style={{
          borderColor: isPaid ? "rgba(52, 211, 153, 0.5)" : "rgba(245, 158, 11, 0.5)",
          color: isPaid ? "#34d399" : "#fbbf24",
          backgroundColor: isPaid ? "rgba(16, 185, 129, 0.12)" : "rgba(245, 158, 11, 0.12)",
        }}
      >
        {isPaid ? (
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        ) : (
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        )}
      </div>

      <span className={isPaid ? "success-pill" : "pending-pill"}>
        {paymentStatusLabel}
      </span>

      <h2 className="confirmation-title">
        {isPaid ? "Booking Confirmed & Issued!" : "Booking Reserved — Payment Due"}
      </h2>
      <p className="confirmation-sub">
        Online Garba Ticketing System 2026 • Bardoli Ground
      </p>

      {/* Customer Payment QR for Pending Online Orders */}
      {!isPaid && isOnline && (
        <div className="public-payment-qr-card">
          <span
            style={{
              display: "inline-block",
              padding: "0.25rem 0.75rem",
              borderRadius: "9999px",
              backgroundColor: "rgba(99, 102, 241, 0.2)",
              color: "#a5b4fc",
              border: "1px solid #6366f1",
              fontWeight: 800,
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Customer Payment QR (QR System 1)
          </span>

          <h3 style={{ color: "#ffffff", fontSize: "1.1rem", margin: "0.25rem 0" }}>
            Scan to Pay: ₹{booking.total_amount.toFixed(2)} ({Math.round(booking.total_amount * 100)} paise)
          </h3>

          {booking.payment_qr_data_url ? (
            <img
              src={booking.payment_qr_data_url}
              alt="Customer Payment QR"
              className="public-qr-img"
            />
          ) : (
            <div style={{ color: "#fbbf24", padding: "1rem" }}>
              Generating secure payment QR...
            </div>
          )}

          <p style={{ color: "#94a3b8", fontSize: "0.8rem", maxWidth: "420px", margin: 0 }}>
            Scan this QR code with any UPI app to pay the exact amount. This code is strictly for payment collection and is <strong>not valid for event entry</strong>.
          </p>
        </div>
      )}

      {/* Cash Notice for Pending Cash Orders */}
      {!isPaid && !isOnline && (
        <div
          style={{
            backgroundColor: "rgba(245, 158, 11, 0.12)",
            border: "1.5px solid rgba(245, 158, 11, 0.4)",
            borderRadius: "16px",
            padding: "1.25rem",
            marginBottom: "1.5rem",
            textAlign: "center",
          }}
        >
          <strong style={{ color: "#fbbf24", display: "block", marginBottom: "0.35rem" }}>
            Awaiting Cash Collection at Counter Desk
          </strong>
          <span style={{ color: "#e2e8f0", fontSize: "0.85rem" }}>
            Please present this booking reference at the box office ticket counter. The operator will collect <strong>₹{booking.total_amount.toFixed(2)}</strong> and issue your official entrance passes.
          </span>
        </div>
      )}

      {/* Pass Details Card */}
      <div className="pass-details-box">
        <div className="pass-row">
          <span className="pass-label">Booking Reference ID:</span>
          <span className="pass-ref-code">{booking.booking_id}</span>
        </div>

        <div className="pass-row">
          <span className="pass-label">Event Date:</span>
          <span className="pass-val">{booking.event_date}</span>
        </div>

        <div className="pass-row">
          <span className="pass-label">Passes Booked:</span>
          <span className="pass-val-amber">
            {booking.quantity} Ticket(s)
          </span>
        </div>

        <div className="pass-row">
          <span className="pass-label">Payment Method:</span>
          <span className="pass-val">{paymentMethodLabel}</span>
        </div>

        <div className="pass-row">
          <span className="pass-label">Venue:</span>
          <span
            className="pass-val"
            style={{
              fontSize: "0.75rem",
              textAlign: "right",
              maxWidth: "280px",
            }}
          >
            {booking.venue}
          </span>
        </div>

        <div className="pass-row">
          <span className="pass-label">Ticket Price:</span>
          <span className="pass-val">
            ₹{booking.ticket_price}
          </span>
        </div>

        <div className="pass-row pass-row-last">
          <span
            className="pass-label"
            style={{
              fontWeight: 800,
              color: "#fef3c7",
            }}
          >
            Total Amount:
          </span>

          <span className="pass-total-amount">
            ₹{booking.total_amount}
          </span>
        </div>
      </div>

      {/* Individual Admission Tickets (QR System 2) when Paid */}
      {isPaid && booking.tickets && booking.tickets.length > 0 && (
        <div className="entrance-tickets-section">
          <h3 className="entrance-tickets-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2"></rect>
              <line x1="6" y1="8" x2="6" y2="8"></line>
              <line x1="10" y1="8" x2="18" y2="8"></line>
              <line x1="6" y1="12" x2="18" y2="12"></line>
              <line x1="6" y1="16" x2="12" y2="16"></line>
            </svg>
            Official Entrance Passes ({booking.tickets.length})
          </h3>

          <div className="entrance-tickets-grid">
            {booking.tickets.map((t, idx) => (
              <div key={t.ticket_number} className="entrance-ticket-card">
                <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: "0.75rem" }}>
                  <span style={{ color: "#94a3b8", fontWeight: 700 }}>PASS {idx + 1} OF {booking.quantity}</span>
                  <span style={{ color: "#34d399", fontWeight: 800 }}>VALID</span>
                </div>

                <div style={{ fontFamily: "monospace", fontWeight: 800, color: "#fde68a", fontSize: "0.9rem" }}>
                  {t.ticket_number}
                </div>

                {t.qr_code_data_url && (
                  <img src={t.qr_code_data_url} alt={`Pass ${t.ticket_number}`} />
                )}

                <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  Scan at Security Gate (QR System 2)
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="confirmation-actions">
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={`ticket-${booking.booking_id}.pdf`}
          className="btn-download-pdf"
        >
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
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>

          <span>{isPaid ? "Download Ticket PDF" : "Download Booking Receipt"}</span>
        </a>

        <button
          onClick={onBookMore}
          className="btn-book-more"
        >
          Book More Tickets
        </button>

        {onGoHome && (
          <button
            onClick={onGoHome}
            className="btn-book-more"
            style={{
              marginTop: "0.5rem",
              background: "transparent",
              border: "1px solid rgba(245, 158, 11, 0.3)",
            }}
          >
            Return to Home
          </button>
        )}
      </div>
    </div>
  );
};