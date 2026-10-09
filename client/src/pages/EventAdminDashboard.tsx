import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "../components/DashboardLayout";
import { getDailyCapacities, getSuperAdminStatus } from "../services/api";
import type { DailyCapacity } from "../types";

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

export const EventAdminDashboard: React.FC = () => {
  const [capacities, setCapacities] = useState<DailyCapacity[]>([]);
  const [superAdminName, setSuperAdminName] = useState<string>("Super Admin");
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const [capData, saStatus] = await Promise.all([
        getDailyCapacities(),
        getSuperAdminStatus(),
      ]);

      setCapacities(capData);
      if (saStatus && saStatus.name) {
        setSuperAdminName(saStatus.name);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load event data.";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Aggregate statistics
  const totalCapacity = useMemo(
    () => capacities.reduce((sum, item) => sum + item.capacity, 0),
    [capacities]
  );
  const totalSold = useMemo(
    () => capacities.reduce((sum, item) => sum + item.sold, 0),
    [capacities]
  );
  const totalRemaining = useMemo(
    () => capacities.reduce((sum, item) => sum + item.remaining, 0),
    [capacities]
  );

  // Sold-Out Alerts ONLY (Event Admin does NOT receive low-capacity alerts)
  const soldOutAlerts = useMemo(() => {
    return capacities
      .filter((item) => item.remaining === 0)
      .map((item) => ({
        id: `ea-soldout-${item.event_date}`,
        message: `All tickets of ${formatToLongDate(item.event_date)} are sold out. Kindly check out today's revenue collection & ticket's sale`,
        eventDate: item.event_date,
      }));
  }, [capacities]);

  const disabledTooltipMessage = `You don't have permission to change daily ticket capacity. Kindly contact super admin ${superAdminName} for this.`;

  return (
    <DashboardLayout
      roleTitle="Event Admin"
      roleSubtitle="Event Management & Scheduling"
    >
      {/* 1. Operational Overview Card */}
      <div className="dashboard-card">
        <h2 className="dashboard-card-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          Event Operations Panel
        </h2>
        <p className="dashboard-role-description">
          This dashboard is for Event Admin. Monitor festival dates, daily capacity, pass availability, and live ticket sales.
        </p>

        <div className="dashboard-grid">
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Festival Span</span>
            <span className="dashboard-stat-value">10 Nights</span>
            <span className="dashboard-stat-desc">11 October to 20 October 2026</span>
          </div>

          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Daily Capacity</span>
            <span className="dashboard-stat-value">Database Driven</span>
            <span className="dashboard-stat-desc">
              Capacity managed via PostgreSQL database
            </span>
          </div>

          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Show Timings</span>
            <span className="dashboard-stat-value" style={{ fontSize: "1.2rem" }}>7:30 PM - Late</span>
            <span className="dashboard-stat-desc">Nightly Aarti at 7:30 PM</span>
          </div>

          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Venue Location</span>
            <span className="dashboard-stat-value" style={{ fontSize: "1.1rem", marginTop: "0.25rem" }}>Bardoli Ground</span>
            <span className="dashboard-stat-desc">Station Road, Bardoli, Surat</span>
          </div>
        </div>
      </div>

      {/* 2. Daily Ticket Capacity Section (Read-Only with Tooltips) */}
      <div className="dashboard-card capacity-card">
        <div className="capacity-header-row">
          <div>
            <h2 className="dashboard-card-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              Festival Daily Ticket Capacity Overview
            </h2>
            <p className="capacity-subtitle">
              Live capacity and sales data for all festival dates (11 – 20 October 2026).
            </p>
          </div>

          <button
            onClick={() => fetchDashboardData(true)}
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
            {refreshing ? "Refreshing..." : "Refresh Live Data"}
          </button>
        </div>

        {/* Live Summary Bar */}
        <div className="capacity-stats-bar">
          <div className="capacity-mini-card">
            <span className="capacity-mini-label">Total Festival Capacity</span>
            <span className="capacity-mini-value highlight-gold">
              {loading ? "..." : totalCapacity.toLocaleString()}
            </span>
          </div>

          <div className="capacity-mini-card">
            <span className="capacity-mini-label">Confirmed Sold Tickets</span>
            <span className="capacity-mini-value highlight-blue">
              {loading ? "..." : totalSold.toLocaleString()}
            </span>
          </div>

          <div className="capacity-mini-card">
            <span className="capacity-mini-label">Total Remaining Tickets</span>
            <span className="capacity-mini-value highlight-green">
              {loading ? "..." : totalRemaining.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Sold-out Alerts for Event Admin */}
        {soldOutAlerts.length > 0 && (
          <div className="capacity-alerts-list">
            {soldOutAlerts.map((alert) => (
              <div
                key={alert.id}
                className="capacity-alert-banner alert-sold-out"
                role="alert"
              >
                <div className="capacity-alert-content">
                  <div className="capacity-alert-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  </div>
                  <div>
                    <span className="capacity-alert-tag">SOLD OUT</span>
                    <span>{alert.message}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="capacity-feedback-banner error">
            <span>⚠ {error}</span>
          </div>
        )}

        {/* Capacity Table with Disabled Edit Buttons and Accessible Tooltips */}
        {loading ? (
          <div className="capacity-loading-state">
            Loading ticket capacities from PostgreSQL database...
          </div>
        ) : capacities.length === 0 ? (
          <div className="capacity-error-state">
            No capacity records found. Please check database connectivity.
          </div>
        ) : (
          <div className="capacity-table-container">
            <table className="capacity-table">
              <thead>
                <tr>
                  <th>Event Date</th>
                  <th>Current Capacity</th>
                  <th>Tickets Sold</th>
                  <th>Remaining Tickets</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {capacities.map((item) => (
                  <tr key={item.event_date}>
                    <td>
                      <div className="capacity-date-cell">
                        <span className="capacity-date-title">
                          {item.formatted_date}
                        </span>
                        <span className="capacity-date-day">
                          Day {item.day_number} of 10 ({item.event_date})
                        </span>
                      </div>
                    </td>

                    <td>
                      <span className="capacity-num-badge badge-capacity">
                        {item.capacity}
                      </span>
                    </td>

                    <td>
                      <span className="capacity-num-badge badge-sold">
                        {item.sold}
                      </span>
                    </td>

                    <td>
                      <span className="capacity-num-badge badge-remaining">
                        {item.remaining}
                      </span>
                    </td>

                    <td style={{ textAlign: "right" }}>
                      <div
                        className="capacity-actions-cell"
                        style={{ justifyContent: "flex-end" }}
                      >
                        {/* Accessible Tooltip Wrapper for Disabled Edit Control */}
                        <div
                          className="disabled-tooltip-wrapper"
                          tabIndex={0}
                          role="region"
                          aria-label={disabledTooltipMessage}
                        >
                          <button
                            type="button"
                            disabled
                            aria-disabled="true"
                            tabIndex={-1}
                            className="btn-capacity-edit-disabled"
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
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            Edit
                          </button>
                          <div className="disabled-tooltip-box" role="tooltip">
                            {disabledTooltipMessage}
                          </div>
                        </div>
                      </div>
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
