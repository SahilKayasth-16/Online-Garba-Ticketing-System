import React from "react";
import { CountdownTimer } from "../components/CountdownTimer";
import { EventLogoPlaceholder } from "../components/EventLogoPlaceholder";
import { SponsorMarquee } from "../components/SponsorMarquee";
import "../styles/homepage.css";

interface HomePageProps {
  onGoToBooking: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onGoToBooking }) => {
  return (
    <div className="homepage-wrapper">
      {/* 1. TOP HERO: LARGE LOGO PLACEHOLDER + PROMINENT TITLE */}
      <section className="hero-section">
        <div className="hero-content">
          <EventLogoPlaceholder />

          <h1 className="hero-title">
            ONLINE GARBA TICKETTING SYSTEM
          </h1>

          <p className="hero-subtitle">
            ગરબા અને દાંડિયાના સૌથી લોકપ્રિય નવરાત્રિના ઉત્સવનો અનુભવ કરો. પરંપરાગત તાલ, આકર્ષક રંગો અને અવિસ્મરણીય સાંસ્કૃતિક ઉત્સવ.
          </p>
        </div>
      </section>

      {/* 2. SPONSOR MARQUEE */}
      <section>
        <SponsorMarquee />
      </section>

      {/* 3. COUNTDOWN TIMER */}
      <section>
        <CountdownTimer />
      </section>

      {/* 4. ORDERED EVENT SPECIFICATIONS & BOOKING CTA */}
      <section className="event-details-section">
        <div className="event-details-header">
          <span className="event-details-tag">
            EVENT SPECIFICATIONS
          </span>
          <h2 className="event-details-heading">
            JOIN THE CELEBRATION
          </h2>
        </div>

        <div className="event-details-list">
          {/* 1. Event starting date */}
          <div className="event-detail-item">
            <div className="event-detail-icon-box">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </div>
            <div className="event-detail-content">
              <span className="event-detail-label">Event Date</span>
              <span className="event-detail-value">11th October 2026 to 20th October 2026</span>
            </div>
          </div>

          {/* 2. Address */}
          <div className="event-detail-item">
            <div className="event-detail-icon-box">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
            </div>
            <div className="event-detail-content">
              <span className="event-detail-label">Venue Address</span>
              <span className="event-detail-value">
              Bardoli, Surat, Gujarat
              </span>
            </div>
          </div>

          {/* 3. Tickets starting from */}
          <div className="event-detail-item">
            <div className="event-detail-icon-box">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"></path>
              </svg>
            </div>
            <div className="event-detail-content">
              <span className="event-detail-label">Tickets Pricing</span>
              <span className="event-detail-value event-detail-value-gold">
                Tickets starting from ₹200
              </span>
            </div>
          </div>
        </div>

        {/* 4. Book Tickets Button */}
        <button
          onClick={onGoToBooking}
          className="btn-book-tickets-main"
        >
          <span>Book Tickets</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>
      </section>
    </div>
  );
};
