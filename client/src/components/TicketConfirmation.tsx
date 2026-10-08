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

  const paymentMethodLabel =
    booking.payment_method.toUpperCase() === "CASH"
      ? "Cash Payment"
      : "Online Payment";

  const paymentStatusLabel =
    booking.payment_status.toUpperCase() === "PAID"
      ? "Payment Successful"
      : booking.payment_status;

  return (
    <div className="confirmation-card">
      {/* Success Icon Badge */}
      <div className="success-badge-icon">
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
      </div>

      <span className="success-pill">{paymentStatusLabel}</span>

      <h2 className="confirmation-title">Booking Confirmed!</h2>
      <p className="confirmation-sub">
        Online Garba Ticketting System 2026
      </p>

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

          <span>Download Ticket PDF</span>
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