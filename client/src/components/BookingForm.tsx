import React, { useMemo, useState } from "react";
import "../styles/bookingform.css";

interface BookingFormData {
  event_date: string;
  quantity: number;
  payment_method: "online" | "cash";
}

interface BookingFormProps {
  onSubmit: (data: BookingFormData) => void | Promise<void>;
  isProcessing: boolean;
  externalSelectedDate?: string;
  onDateChange?: (date: string) => void;
  formTitle?: string;
  formSubtitle?: string;
  badgeLabel?: string;
}

const EVENT_START_DATE = "2026-10-11";
const EVENT_END_DATE = "2026-10-20";

const FESTIVAL_DAYS = [
  { dayNum: 1, isoDate: "2026-10-11", label: "11 Oct (Day 1)" },
  { dayNum: 2, isoDate: "2026-10-12", label: "12 Oct (Day 2)" },
  { dayNum: 3, isoDate: "2026-10-13", label: "13 Oct (Day 3)" },
  { dayNum: 4, isoDate: "2026-10-14", label: "14 Oct (Day 4)" },
  { dayNum: 5, isoDate: "2026-10-15", label: "15 Oct (Day 5)" },
  { dayNum: 6, isoDate: "2026-10-16", label: "16 Oct (Day 6)" },
  { dayNum: 7, isoDate: "2026-10-17", label: "17 Oct (Day 7)" },
  { dayNum: 8, isoDate: "2026-10-18", label: "18 Oct (Day 8)" },
  { dayNum: 9, isoDate: "2026-10-19", label: "19 Oct (Day 9)" },
  { dayNum: 10, isoDate: "2026-10-20", label: "20 Oct (Day 10)" },
];

function isDateInEventRange(isoDate: string): boolean {
  if (!isoDate) {
    return false;
  }

  return isoDate >= EVENT_START_DATE && isoDate <= EVENT_END_DATE;
}

function formatIsoToReadableDate(isoDate: string): string {
  if (!isoDate) {
    return "";
  }

  const parts = isoDate.split("-");

  if (parts.length !== 3) {
    return isoDate;
  }

  const year = parts[0];
  const monthIndex = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  return `${day} ${months[monthIndex] || ""} ${year}`;
}

export const BookingForm: React.FC<BookingFormProps> = ({
  onSubmit,
  isProcessing,
  externalSelectedDate,
  onDateChange,
  formTitle,
  formSubtitle,
  badgeLabel,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(
    externalSelectedDate || EVENT_START_DATE
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [paymentOption, setPaymentOption] =
    useState<"online" | "cash">("online");
  const [formError, setFormError] = useState<string | null>(null);

  React.useEffect(() => {
    if (externalSelectedDate && externalSelectedDate !== selectedDate) {
      setSelectedDate(externalSelectedDate);
    }
  }, [externalSelectedDate]);

  const isDateValid = useMemo(
    () => isDateInEventRange(selectedDate),
    [selectedDate],
  );

  const formattedReadableDate = useMemo(
    () => formatIsoToReadableDate(selectedDate),
    [selectedDate],
  );

  const handleDecreaseQuantity = () => {
    if (quantity > 1) {
      setQuantity((current) => current - 1);
    }
  };

  const handleIncreaseQuantity = () => {
    if (quantity < 10) {
      setQuantity((current) => current + 1);
    }
  };

  const handleDateChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const newDate = event.target.value;
    setSelectedDate(newDate);
    setFormError(null);
    onDateChange?.(newDate);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!selectedDate || !isDateValid) {
      setFormError("Please select a valid festival date.");
      return;
    }

    if (quantity < 1 || quantity > 10) {
      setFormError("Please select between 1 and 10 tickets.");
      return;
    }

    if (!paymentOption) {
      setFormError("Please select a valid payment option.");
      return;
    }

    await onSubmit({
      event_date: selectedDate,
      quantity,
      payment_method: paymentOption,
    });
  };

  return (
    <form

      onSubmit={handleSubmit}
      className="booking-form-card"
      noValidate
    >
      <div className="booking-form-header">
        <span className="booking-form-badge">
          {badgeLabel || "ONLINE PASS RESERVATION"}
        </span>

        <h2 className="booking-form-title">
          {formTitle || "BOOK YOUR TICKETS"}
        </h2>

        <p className="booking-form-sub">
          {formSubtitle || "Online Garba Ticketing System 2026 • 11th to 20th October 2026"}
        </p>
      </div>


      {formError && (
        <div className="error-alert" role="alert">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>

          <span>{formError}</span>
        </div>
      )}

      <div className="form-group section-date-selection">
        <div className="form-section-title-row">
          <span className="form-step-num">1</span>

          <label
            className="form-label form-label-left"
            htmlFor="booking-date-input"
          >
            Date Selection
          </label>
        </div>

        <p className="form-section-desc">
          Select any festival day in advance for your Garba pass.
        </p>

        <div className="date-input-container">
          <input
            id="booking-date-input"
            type="date"
            value={selectedDate}
            min={EVENT_START_DATE}
            max={EVENT_END_DATE}
            onChange={handleDateChange}
            className={`form-input-date ${
              !isDateValid
                ? "input-date-error"
                : "input-date-valid"
            }`}
            aria-describedby="date-status-msg"
            required
          />
        </div>

        {!isDateValid ? (
          <div
            id="date-status-msg"
            className="date-warning-box"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>

            <span className="warning-text-highlight">
              Please select a valid event date.
            </span>

            <span className="warning-text-sub">
              Event dates are from 11th October 2026 to
              20th October 2026.
            </span>
          </div>
        ) : (
          <div className="date-valid-box">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>

            <span>
              Selected Event Date:{" "}
              <strong>{formattedReadableDate}</strong>
            </span>
          </div>
        )}

        <div className="festival-days-pills-label">
          Quick Day Selector:
        </div>

        <div className="festival-days-grid">
          {FESTIVAL_DAYS.map((day) => (
            <button
              key={day.isoDate}
              type="button"
              onClick={() => {
                setSelectedDate(day.isoDate);
                setFormError(null);
                onDateChange?.(day.isoDate);
              }}
              className={`festival-day-pill ${
                selectedDate === day.isoDate
                  ? "festival-day-pill-active"
                  : ""
              }`}
            >
              {day.label}
            </button>
          ))}

        </div>
      </div>

      <div className="form-group section-ticket-counter">
        <div className="form-section-title-row">
          <span className="form-step-num">2</span>

          <label className="form-label form-label-left">
            Number of Tickets
          </label>
        </div>

        <p className="form-section-desc">
          Select the number of passes you want to book. Final
          pricing and availability will be validated by the
          ticketing system.
        </p>

        <div className="stepper-container">
          <button
            type="button"
            onClick={handleDecreaseQuantity}
            disabled={quantity <= 1}
            className="stepper-btn"
            aria-label="Decrease ticket quantity"
          >
            -
          </button>

          <div className="stepper-value-box">
            <span className="stepper-value">{quantity}</span>

            <span className="stepper-unit">
              {quantity === 1 ? "Ticket" : "Tickets"}
            </span>
          </div>

          <button
            type="button"
            onClick={handleIncreaseQuantity}
            disabled={quantity >= 10}
            className="stepper-btn"
            aria-label="Increase ticket quantity"
          >
            +
          </button>
        </div>

        <div className="preset-buttons">
          {[1, 2, 4, 5, 6, 10].map((number) => (
            <button
              key={number}
              type="button"
              onClick={() => setQuantity(number)}
              className={`preset-btn ${
                quantity === number
                  ? "preset-btn-active"
                  : ""
              }`}
            >
              {number} {number === 1 ? "Ticket" : "Tickets"}
            </button>
          ))}
        </div>

        <div className="live-price-box">
          <div className="price-calc-row">
            <span>Selected Date:</span>
            <span className="price-calc-val">
              {formattedReadableDate}
            </span>
          </div>

          <div className="price-calc-row">
            <span>Selected Passes:</span>
            <span className="price-calc-val">
              {quantity}
            </span>
          </div>

          <div className="price-calc-divider">
            <span className="price-total-text">
              Amount
            </span>

            <span className="price-total-num">
              ₹{(quantity * 200).toLocaleString()}
            </span>
          </div>

          <p className="price-calc-formula">
            ₹200 per pass × {quantity} pass{quantity > 1 ? "es" : ""}. Verified in real-time with database capacity.
          </p>

        </div>
      </div>

      <div className="form-group section-payment-dropdown">
        <div className="form-section-title-row">
          <span className="form-step-num">3</span>

          <label
            className="form-label form-label-left"
            htmlFor="payment-dropdown-select"
          >
            Payment Option
          </label>
        </div>

        <p className="form-section-desc">
          Choose your preferred payment method.
        </p>

        <div className="dropdown-select-wrapper">
          <select
            id="payment-dropdown-select"
            value={paymentOption}
            onChange={(event) =>
              setPaymentOption(
                event.target.value as "online" | "cash",
              )
            }
            className="form-dropdown-select"
          >
            <option value="online">
              Online Payment
            </option>

            <option value="cash">
              Cash Payment
            </option>
          </select>

          <div className="dropdown-arrow-icon">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </div>

      <div className="form-group section-payment-cta">
        <div className="final-summary-card">
          <div className="final-summary-title">
            Booking Summary
          </div>

          <div className="final-summary-row">
            <span>Event:</span>

            <span className="final-summary-bold">
              Online Garba Ticketting System 2026
            </span>
          </div>

          <div className="final-summary-row">
            <span>Event Date:</span>

            <span
              className={`final-summary-bold ${
                !isDateValid
                  ? "text-danger"
                  : "text-amber"
              }`}
            >
              {isDateValid
                ? formattedReadableDate
                : "Invalid Date Selected"}
            </span>
          </div>

          <div className="final-summary-row">
            <span>Quantity:</span>

            <span className="final-summary-bold">
              {quantity}{" "}
              {quantity === 1 ? "Pass" : "Passes"}
            </span>
          </div>

          <div className="final-summary-row">
            <span>Payment Mode:</span>

            <span className="final-summary-bold">
              {paymentOption === "cash"
                ? "Cash Payment"
                : "Online Payment"}
            </span>
          </div>

          <div className="final-summary-total-row">
            <span className="final-total-label">
              Total Payable:
            </span>

            <span className="final-total-amount">
              ₹{(quantity * 200).toLocaleString()}
            </span>

          </div>
        </div>

        <button
          type="submit"
          disabled={isProcessing || !isDateValid}
          className="btn-make-payment"
        >
          {isProcessing ? (
            <>
              <svg
                className="spin-icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="2" x2="12" y2="6" />
                <line x1="12" y1="18" x2="12" y2="22" />
                <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                <line x1="2" y1="12" x2="6" y2="12" />
                <line x1="18" y1="12" x2="22" y2="12" />
                <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
              </svg>

              <span>Processing...</span>
            </>
          ) : (
            <>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect
                  x="2"
                  y="5"
                  width="20"
                  height="14"
                  rx="2"
                />

                <line
                  x1="2"
                  y1="10"
                  x2="22"
                  y2="10"
                />
              </svg>

              <span>Continue to Booking</span>
            </>
          )}
        </button>

        <p className="form-footer-note">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect
              x="3"
              y="11"
              width="18"
              height="11"
              rx="2"
              ry="2"
            />

            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>

          <span>
            Ticket price, availability, and booking details
            are validated by the ticketing system.
          </span>
        </p>
      </div>
    </form>
  );
};