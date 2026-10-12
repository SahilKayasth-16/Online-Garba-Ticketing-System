import type {
  ApiResponse,
  AuthResponse,
  BookingData,
  Event,
  LoginRequest,
  RegisterRequest,
  TicketType,
  UserPublic,
  DailyCapacity,
  CreateBookingPayload,
  VerifyTicketRequest,
  VerifyTicketResponse,
  ScanHistoryResponse,
  SecurityStatsResponse,
  ConfirmCashPaymentResponse,
  RazorpayOrderResponse,
  CreatePaymentQrResponse,
  VerifyPaymentRequest,
  PaymentVerificationResponse,
} from "../types";




const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export interface SuperAdminStatus {
  exists: boolean;
  name: string | null;
  message: string | null;
}

export async function getEvents(): Promise<Event[]> {
  const response = await fetch(`${API_BASE_URL}/events`);

  if (!response.ok) {
    throw new Error(`Failed to fetch events (Status ${response.status})`);
  }

  const result: ApiResponse<Event[]> = await response.json();

  if (!result.success) {
    throw new Error(result.message || "Failed to retrieve events");
  }

  return result.data;
}

export async function getEventById(id: number): Promise<Event> {
  const response = await fetch(`${API_BASE_URL}/events/${id}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Event not found.");
    }

    throw new Error(
      `Failed to fetch event details (Status ${response.status})`,
    );
  }

  const result: ApiResponse<Event> = await response.json();

  if (!result.success) {
    throw new Error(result.message || "Failed to retrieve event details");
  }

  return result.data;
}

export async function getEventTickets(
  eventId: number,
): Promise<TicketType[]> {
  const response = await fetch(
    `${API_BASE_URL}/events/${eventId}/tickets`,
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Event not found.");
    }

    throw new Error(
      `Failed to fetch ticket categories (Status ${response.status})`,
    );
  }

  const result: ApiResponse<TicketType[]> = await response.json();

  if (!result.success) {
    throw new Error(
      result.message || "Failed to retrieve ticket categories",
    );
  }

  return result.data;
}

export async function getBookingById(
  bookingId: string,
): Promise<BookingData> {
  const response = await fetch(
    `${API_BASE_URL}/bookings/${encodeURIComponent(bookingId)}`,
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    if (response.status === 404) {
      throw new Error("Booking not found.");
    }

    throw new Error(
      errorData.detail ||
        `Failed to retrieve booking (Status ${response.status})`,
    );
  }

  const result: ApiResponse<BookingData> = await response.json();

  if (!result.success) {
    throw new Error(result.message || "Failed to retrieve booking.");
  }

  return result.data;
}

export function getTicketPdfUrl(bookingId: string): string {
  return `${API_BASE_URL}/bookings/${encodeURIComponent(
    bookingId,
  )}/ticket.pdf`;
}

export async function registerUser(
  payload: RegisterRequest,
): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    throw new Error(
      errorData.detail ||
        "Registration failed. Please check your details.",
    );
  }

  const result: ApiResponse<AuthResponse> = await response.json();

  if (!result.success) {
    throw new Error(result.message || "Registration failed.");
  }

  return result.data;
}

export async function loginUser(
  payload: LoginRequest,
): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    throw new Error(
      errorData.detail || "Invalid email or password.",
    );
  }

  const result: ApiResponse<AuthResponse> = await response.json();

  if (!result.success) {
    throw new Error(result.message || "Login failed.");
  }

  return result.data;
}

export async function getCurrentUser(
  token: string,
): Promise<UserPublic> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    throw new Error(
      errorData.detail || "Session expired or invalid.",
    );
  }

  const result: ApiResponse<UserPublic> = await response.json();

  if (!result.success) {
    throw new Error(result.message || "Failed to load user profile.");
  }

  return result.data;
}

export async function getSuperAdminStatus(): Promise<SuperAdminStatus> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/super-admin`);

    if (!response.ok) {
      return {
        exists: false,
        name: null,
        message: null,
      };
    }

    const result: ApiResponse<SuperAdminStatus> = await response.json();

    return result.data;
  } catch {
    return {
      exists: false,
      name: null,
      message: null,
    };
  }
}

export async function getDailyCapacities(): Promise<DailyCapacity[]> {
  const response = await fetch(`${API_BASE_URL}/capacities`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail ||
        `Failed to retrieve ticket capacities (Status ${response.status})`,
    );
  }

  const result: ApiResponse<DailyCapacity[]> = await response.json();

  if (!result.success) {
    throw new Error(result.message || "Failed to retrieve ticket capacities.");
  }

  return result.data;
}

export async function updateDailyCapacity(
  eventDate: string,
  capacity: number,
  token?: string | null,
): Promise<DailyCapacity> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(
    `${API_BASE_URL}/capacities/${encodeURIComponent(eventDate)}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ capacity }),
    },
  );

  const resData = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error(
        resData.detail || "Forbidden: Only Super Admin can modify daily ticket capacity.",
      );
    }
    if (response.status === 401) {
      throw new Error("Authentication required. Please log in as Super Admin.");
    }
    throw new Error(
      resData.detail ||
        resData.message ||
        `Failed to update daily capacity (Status ${response.status})`,
    );
  }

  const result: ApiResponse<DailyCapacity> = resData;

  if (!result.success && !result.data) {
    throw new Error(result.message || "Failed to update daily capacity.");
  }

  return result.data;
}

export class ApiError extends Error {
  errorCode?: string;
  statusCode: number;

  constructor(message: string, statusCode: number, errorCode?: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

export async function createBooking(
  payload: CreateBookingPayload,
): Promise<BookingData> {
  const response = await fetch(`${API_BASE_URL}/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resData = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg =
      resData.detail ||
      resData.message ||
      `Booking request failed (Status ${response.status})`;
    const errCode = resData.error_code;
    throw new ApiError(errorMsg, response.status, errCode);
  }

  const result: ApiResponse<BookingData> = resData;

  if (!result.success && !result.data) {
    throw new ApiError(
      result.message || "Failed to create booking.",
      response.status,
    );
  }

  return result.data;
}

export async function getBookings(eventDate?: string): Promise<BookingData[]> {
  const url = eventDate
    ? `${API_BASE_URL}/bookings?event_date=${encodeURIComponent(eventDate)}`
    : `${API_BASE_URL}/bookings`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail ||
        `Failed to retrieve bookings (Status ${response.status})`,
    );
  }

  const result: ApiResponse<BookingData[]> = await response.json();

  if (!result.success) {
    throw new Error(result.message || "Failed to retrieve bookings.");
  }

  return result.data;
}

export async function verifyTicket(
  token: string,
  payload: VerifyTicketRequest,
): Promise<VerifyTicketResponse> {
  const response = await fetch(`${API_BASE_URL}/security/verify-ticket`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const resData = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg =
      resData.detail ||
      resData.message ||
      `Verification request failed (Status ${response.status})`;
    throw new ApiError(errorMsg, response.status, resData.error_code);
  }

  return resData;
}

export async function getScanHistory(
  token: string,
  eventDate?: string,
  limit: number = 50,
): Promise<ScanHistoryResponse> {
  const url = eventDate
    ? `${API_BASE_URL}/security/scan-history?event_date=${encodeURIComponent(eventDate)}&limit=${limit}`
    : `${API_BASE_URL}/security/scan-history?limit=${limit}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail ||
        `Failed to retrieve scan history (Status ${response.status})`,
    );
  }

  return response.json();
}

export async function getSecurityStats(
  token: string,
  eventDate?: string,
): Promise<SecurityStatsResponse> {
  const url = eventDate
    ? `${API_BASE_URL}/security/stats?event_date=${encodeURIComponent(eventDate)}`
    : `${API_BASE_URL}/security/stats`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail ||
        `Failed to retrieve security stats (Status ${response.status})`,
    );
  }

  return response.json();
}

export async function confirmCashPayment(
  token: string,
  bookingId: string,
): Promise<ConfirmCashPaymentResponse> {
  const response = await fetch(
    `${API_BASE_URL}/bookings/${encodeURIComponent(bookingId)}/confirm-cash`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const resData = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg =
      resData.detail ||
      resData.message ||
      `Failed to confirm cash payment (Status ${response.status})`;
    throw new ApiError(errorMsg, response.status, resData.error_code);
  }

  return resData;
}

export async function createRazorpayOrder(
  bookingId: string,
): Promise<RazorpayOrderResponse> {
  const response = await fetch(`${API_BASE_URL}/payments/create-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ booking_id: bookingId }),
  });

  const resData = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg =
      resData.detail ||
      resData.message ||
      `Failed to create Razorpay order (Status ${response.status})`;
    throw new ApiError(errorMsg, response.status, resData.error_code);
  }

  return resData;
}

export async function createPaymentQr(
  bookingId: string,
): Promise<CreatePaymentQrResponse> {
  const response = await fetch(`${API_BASE_URL}/payments/create-qr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ booking_id: bookingId }),
  });

  const resData = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg =
      resData.detail ||
      resData.message ||
      `Failed to generate payment QR (Status ${response.status})`;
    throw new ApiError(errorMsg, response.status, resData.error_code);
  }

  return resData;
}

export async function verifyPayment(
  payload: VerifyPaymentRequest,
): Promise<PaymentVerificationResponse> {
  const response = await fetch(`${API_BASE_URL}/payments/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resData = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg =
      resData.detail ||
      resData.message ||
      `Payment verification failed (Status ${response.status})`;
    throw new ApiError(errorMsg, response.status, resData.error_code);
  }

  return resData;
}