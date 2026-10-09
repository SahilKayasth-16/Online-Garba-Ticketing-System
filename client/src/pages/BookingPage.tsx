import React, { useState } from "react";
import { BookingForm } from "../components/BookingForm";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { TicketConfirmation } from "../components/TicketConfirmation";
import { ApiError, createBooking } from "../services/api";
import type { BookingData, ToastMessage } from "../types";
import "../styles/bookingpage.css";

interface BookingFormData {
  event_date: string;
  quantity: number;
  payment_method: "online" | "cash";
}

interface BookingPageProps {
  onShowToast: (toast: ToastMessage) => void;
  onGoHome: () => void;
}

export const BookingPage: React.FC<BookingPageProps> = ({
  onShowToast,
  onGoHome,
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [bookingSuccessData, setBookingSuccessData] =
    useState<BookingData | null>(null);

  const handleBookingSubmit = async (formData: BookingFormData): Promise<void> => {
    setIsProcessing(true);

    try {
      const bookingResult = await createBooking({
        event_date: formData.event_date,
        quantity: formData.quantity,
        payment_method: formData.payment_method,
      });

      setBookingSuccessData(bookingResult);
      onShowToast({
        id: Date.now().toString(),
        type: "success",
        title: "BOOKING CONFIRMED",
        message: `Successfully reserved ${bookingResult.quantity} pass(es) for ${bookingResult.event_date}.`,
      });
    } catch (err: unknown) {
      if (err instanceof ApiError && err.errorCode === "EVENT_DATE_SOLD_OUT") {
        onShowToast({
          id: Date.now().toString(),
          type: "error",
          title: "SOLD OUT",
          message:
            "Today's ticket are sold out. You may book advance for another day. Sorry for inconveniency",
        });
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : "Booking request could not be processed.";
        onShowToast({
          id: Date.now().toString(),
          type: "error",
          title: "BOOKING FAILED",
          message: msg,
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBookMore = () => {
    setBookingSuccessData(null);
  };

  return (
    <div className="booking-page-container">
      <div className="booking-header-bar">
        <button onClick={onGoHome} className="back-btn">
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
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>

          <span>Back to Event Details</span>
        </button>
      </div>

      {isProcessing ? (
        <LoadingSkeleton />
      ) : bookingSuccessData ? (
        <TicketConfirmation
          booking={bookingSuccessData}
          onBookMore={handleBookMore}
          onGoHome={onGoHome}
        />
      ) : (
        <BookingForm
          onSubmit={handleBookingSubmit}
          isProcessing={isProcessing}
        />
      )}
    </div>
  );
};