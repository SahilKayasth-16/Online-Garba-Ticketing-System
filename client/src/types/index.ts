export type UserRole =
  | "super_admin"
  | "event_admin"
  | "counter_operator"
  | "security_staff";

export interface UserPublic {
  id: number;
  name: string;
  contact_number: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface RegisterRequest {
  name: string;
  contact_number: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: UserPublic;
}

export interface TicketType {
  id: number;
  event_id: number;
  name: string;
  description: string | null;
  price: string | number;
  capacity: number;
  available_quantity: number;
  created_at: string;
}

export interface Event {
  id: number;
  name: string;
  description: string | null;
  venue: string;
  event_date: string;
  start_time: string;
  end_time: string;
  image: string | null;
  status: string;
  created_at: string;
  ticket_types?: TicketType[];
}

export interface TicketItem {
  ticket_number: string;
  ticket_token: string;
  event_date: string;
  status: string;
  entry_status: string;
  qr_code_data_url?: string | null;
}

export interface BookingData {
  booking_id: string;
  venue: string;
  event_date: string;
  quantity: number;
  ticket_price: number;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  cash_collected_at?: string | null;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  razorpay_qr_id?: string | null;
  payment_qr_payload?: string | null;
  payment_qr_data_url?: string | null;
  tickets?: TicketItem[];
  created_at?: string;
}

export interface ConfirmCashPaymentResponse {
  success: boolean;
  status: string;
  message: string;
  data: BookingData;
}

export interface RazorpayOrderResponse {
  success: boolean;
  configured: boolean;
  booking_id: string;
  amount_in_paise: number;
  amount_in_rupees: number;
  currency: string;
  razorpay_order_id?: string | null;
  razorpay_key_id?: string | null;
  message: string;
}

export interface CreatePaymentQrResponse {
  success: boolean;
  configured: boolean;
  booking_id: string;
  amount_in_paise: number;
  amount_in_rupees: number;
  razorpay_qr_id?: string | null;
  qr_image_url?: string | null;
  qr_data_url?: string | null;
  message: string;
}

export interface VerifyPaymentRequest {
  booking_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface PaymentVerificationResponse {
  success: boolean;
  status: string;
  message: string;
  data?: BookingData | null;
}

export interface CreateBookingPayload {
  event_date: string;
  quantity: number;
  payment_method: "cash" | "online";
  venue?: string;
}



export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  title?: string;
  message: string;
}

export interface DailyCapacity {
  id: number;
  event_date: string;
  formatted_date: string;
  day_number: number;
  capacity: number;
  sold: number;
  remaining: number;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateCapacityPayload {
  capacity: number;
}

export interface VerifyTicketRequest {
  ticket_token: string;
  gate_event_date?: string;
}

export interface TicketVerificationData {
  serial_number: string;
  event_date: string;
  payment_status: string;
  entry_status: string;
  entry_timestamp?: string | null;
  venue?: string;
}

export interface VerifyTicketResponse {
  success: boolean;
  status: "valid" | "already_used" | "invalid" | "unpaid" | "wrong_date" | "revoked";
  message: string;
  error_code?: string;
  ticket?: TicketVerificationData | null;
}

export interface ScanLogItem {
  id: number;
  ticket_number?: string | null;
  event_date?: string | null;
  scan_result: string;
  message: string;
  scanned_at: string;
  scanned_by?: string | null;
  is_successful_entry: boolean;
}

export interface ScanHistoryResponse {
  success: boolean;
  total: number;
  items: ScanLogItem[];
}

export interface SecurityStatsResponse {
  success: boolean;
  total_scans: number;
  successful_entries: number;
  rejected_scans: number;
  already_used_scans: number;
  active_event_date: string;
}


