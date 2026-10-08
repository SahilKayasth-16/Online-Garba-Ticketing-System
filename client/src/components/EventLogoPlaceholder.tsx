import React from "react";
import "../styles/eventlogo.css";

export const EventLogoPlaceholder: React.FC = () => {
  return (
    <div className="event-logo-wrapper">
      <div className="event-logo-box">
        <span className="event-logo-tag">
          OFFICIAL FESTIVAL EMBLEM
        </span>
        <div className="event-logo-placeholder-text">
          MAIN EVENT LOGO
        </div>
        <p className="event-logo-subtext">Organizer Group Identity</p>
      </div>
    </div>
  );
};
