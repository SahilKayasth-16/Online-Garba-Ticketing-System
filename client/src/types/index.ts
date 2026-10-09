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

export interface BookingData {
  booking_id: string;
  venue: string;
  event_date: string;
  quantity: number;
  ticket_price: number;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  created_at?: string;
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

