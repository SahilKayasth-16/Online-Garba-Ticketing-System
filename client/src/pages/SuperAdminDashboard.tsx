import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "../components/DashboardLayout";
import { useAuth } from "../context/useAuth";
import { getDailyCapacities, updateDailyCapacity } from "../services/api";
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

function getLowCapacityThreshold(capacity: number): number {
  if (capacity < 100) return 25;
  if (capacity <= 1000) return 40;
  return 70;
}

export const SuperAdminDashboard: React.FC = () => {
  const { token } = useAuth();

  const [capacities, setCapacities] = useState<DailyCapacity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Editing state
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [inputCapacity, setInputCapacity] = useState<string>("");
  const [savingDate, setSavingDate] = useState<string | null>(null);

  const fetchCapacities = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const data = await getDailyCapacities();
      setCapacities(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load ticket capacities.";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCapacities();
  }, [fetchCapacities]);

  // Aggregate statistics across all 10 festival dates
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

  // Super Admin Capacity Alerts: Sold-out + Dynamic Low-Capacity Alerts
  const capacityAlerts = useMemo(() => {
    const alerts: Array<{
      id: string;
      type: "sold_out" | "low_capacity";
      message: string;
      dateIso: string;
      remaining: number;
    }> = [];

    capacities.forEach((item) => {
      const longDate = formatToLongDate(item.event_date);
      if (item.remaining === 0) {
        alerts.push({
          id: `sold-out-${item.event_date}`,
          type: "sold_out",
          message: `All tickets of ${longDate} are sold out. Kindly check out today's revenue collection & ticket's sale`,
          dateIso: item.event_date,
          remaining: 0,
        });
      } else {
        const threshold = getLowCapacityThreshold(item.capacity);
        if (item.remaining <= threshold) {
          alerts.push({
            id: `low-cap-${item.event_date}`,
            type: "low_capacity",
            message: `Only ${item.remaining} are left for ${longDate}. You may increase it before it sold out totally`,
            dateIso: item.event_date,
            remaining: item.remaining,
          });
        }
      }
    });

    return alerts;
  }, [capacities]);

  const handleStartEdit = (item: DailyCapacity) => {
    setEditingDate(item.event_date);
    setInputCapacity(item.capacity.toString());
    setError(null);
    setSuccessMessage(null);
  };

  const handleCancelEdit = () => {
    setEditingDate(null);
    setInputCapacity("");
  };

  const handleSaveCapacity = async (item: DailyCapacity) => {
    const rawVal = inputCapacity.trim();

    // 1. Validate empty
    if (!rawVal) {
      setError("Capacity cannot be empty.");
      return;
    }

    // 2. Validate integers only (no decimals)
    if (rawVal.includes(".")) {
      setError("Capacity must be a whole integer, decimal values are not allowed.");
      return;
    }

    const numVal = parseInt(rawVal, 10);

    // 3. Validate numeric positive integer
    if (isNaN(numVal) || !/^\d+$/.test(rawVal) || numVal <= 0) {
      setError("Capacity must be a positive integer greater than zero.");
      return;
    }

    // 4. Validate not below sold count
    if (numVal < item.sold) {
      setError(
        `Capacity cannot be reduced below the number of confirmed tickets already sold (${item.sold}) for ${item.formatted_date}.`
      );
      return;
    }

    setSavingDate(item.event_date);
    setError(null);
    setSuccessMessage(null);

    try {
      const updated = await updateDailyCapacity(item.event_date, numVal, token);

      // Update state with confirmed data returned from PostgreSQL
      setCapacities((prev) =>
        prev.map((c) => (c.event_date === updated.event_date ? updated : c))
      );

      setSuccessMessage(
        `Daily ticket capacity for ${updated.formatted_date} successfully updated to ${updated.capacity} tickets.`
      );
      setEditingDate(null);
      setInputCapacity("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update daily capacity.";
      setError(msg);
    } finally {
      setSavingDate(null);
    }
  };

  return (
    <DashboardLayout
      roleTitle="Super Admin"
      roleSubtitle="System & Administration Console"
    >
      {/* 1. Super Admin Overview */}
      <div className="dashboard-card">
        <h2 className="dashboard-card-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
          Super Admin Console
        </h2>
        <p className="dashboard-role-description">
          This dashboard is for Super Admin. Full administrative control over users, daily ticket capacity, and system operations.
        </p>

        <div className="dashboard-grid">
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Event Status</span>
            <span className="dashboard-stat-value">Configured</span>
            <span className="dashboard-stat-desc">11 – 20 October 2026 (10 Days)</span>
          </div>

          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Ticket Capacity</span>
            <span className="dashboard-stat-value">Database Backed</span>
            <span className="dashboard-stat-desc">
              Configurable per festival date in PostgreSQL
            </span>
          </div>

          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Active Modules</span>
            <span className="dashboard-stat-value">4 Roles</span>
            <span className="dashboard-stat-desc">Super Admin, Event, Counter, Security</span>
          </div>

          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Venue Location</span>
            <span className="dashboard-stat-value" style={{ fontSize: '1.1rem', marginTop: '0.25rem' }}>Bardoli Ground</span>
            <span className="dashboard-stat-desc">Station Road, Bardoli, Surat</span>
          </div>
        </div>
      </div>

      {/* 2. Daily Ticket Capacity Foundation Section */}
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
              Festival Daily Ticket Capacity Management
            </h2>
            <p className="capacity-subtitle">
              Manage and configure daily capacity independently for each date (11 – 20 October 2026).
            </p>
          </div>

          <button
            onClick={() => fetchCapacities(true)}
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

        {/* Dynamic Capacity Alerts (Super Admin Only: Sold-out + Low Capacity) */}
        {capacityAlerts.length > 0 && (
          <div className="capacity-alerts-list">
            {capacityAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`capacity-alert-banner ${
                  alert.type === "sold_out"
                    ? "alert-sold-out"
                    : "alert-low-capacity"
                }`}
                role="alert"
              >
                <div className="capacity-alert-content">
                  <div className="capacity-alert-icon">
                    {alert.type === "sold_out" ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <span className="capacity-alert-tag">
                      {alert.type === "sold_out" ? "SOLD OUT" : "LOW CAPACITY"}
                    </span>
                    <span>{alert.message}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const target = capacities.find((c) => c.event_date === alert.dateIso);
                    if (target) handleStartEdit(target);
                  }}
                  className="btn-capacity-edit"
                  style={{ whiteSpace: "nowrap" }}
                >
                  Adjust Capacity
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Feedback Banners */}
        {successMessage && (
          <div className="capacity-feedback-banner success">
            <span>✓ {successMessage}</span>
            <button
              className="capacity-feedback-close"
              onClick={() => setSuccessMessage(null)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        )}

        {error && (
          <div className="capacity-feedback-banner error">
            <span>⚠ {error}</span>
            <button
              className="capacity-feedback-close"
              onClick={() => setError(null)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        )}

        {/* Capacity Table */}
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
                {capacities.map((item) => {
                  const isEditing = editingDate === item.event_date;
                  const isSavingThis = savingDate === item.event_date;

                  return (
                    <tr
                      key={item.event_date}
                      className={isEditing ? "editing-row" : ""}
                    >
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
                        {isEditing ? (
                          <div className="capacity-inline-editor">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={inputCapacity}
                              onChange={(e) => setInputCapacity(e.target.value)}
                              className="capacity-input-number"
                              placeholder="Capacity"
                              autoFocus
                              disabled={isSavingThis}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleSaveCapacity(item);
                                } else if (e.key === "Escape") {
                                  handleCancelEdit();
                                }
                              }}
                            />
                          </div>
                        ) : (
                          <span className="capacity-num-badge badge-capacity">
                            {item.capacity}
                          </span>
                        )}
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
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleSaveCapacity(item)}
                                disabled={isSavingThis}
                                className="btn-capacity-save"
                              >
                                {isSavingThis ? "Saving..." : "Update Capacity"}
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                disabled={isSavingThis}
                                className="btn-capacity-cancel"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleStartEdit(item)}
                              className="btn-capacity-edit"
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
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                              Edit
                            </button>
                          )}
                        </div>
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
