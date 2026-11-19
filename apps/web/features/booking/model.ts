export type Trip = {
  _id: string;
  operatorId: string;
  busId: string;
  from: string;
  to: string;
  operatorName: string;
  busName: string;
  busType: string;
  departureAt: string;
  arrivalAt: string;
  date: string;
  fare: number;
  rating: number;
  amenities: string[];
  boardingPoints: string[];
  droppingPoints: string[];
  cancellationHours: number;
  refundPercent: number;
  availableSeats: number;
  durationMinutes: number;
};
export type Seat = {
  number: string;
  deck: "lower" | "upper";
  row: number;
  col: number;
  kind: "seater" | "sleeper";
  price: number;
  status: "available" | "held" | "booked";
};
export type Hold = {
  _id: string;
  tripId: string;
  seats: string[];
  expiresAt: string;
  subtotal: number;
};
export type Passenger = { name: string; age: number; seat: string };
export type Booking = {
  _id: string;
  reference: string;
  tripId: string;
  operatorId: string;
  operatorName: string;
  busName: string;
  from: string;
  to: string;
  date: string;
  departureAt: string;
  arrivalAt: string;
  boardingPoint: string;
  droppingPoint: string;
  seats: string[];
  passengers: Passenger[];
  subtotal: number;
  discount: number;
  total: number;
  phone: string;
  email: string;
  couponCode?: string;
  status: "pending" | "confirmed" | "cancelled" | "expired";
  paymentStatus: "unpaid" | "paid" | "failed" | "refund_simulated";
  paymentMode: "demo" | "razorpay" | "coupon" | null;
  expiresAt: string;
  refundAmount: number;
  verificationToken: string;
  cancellationHours: number;
  refundPercent: number;
};
export type Verification = Pick<
  Booking,
  | "reference"
  | "status"
  | "operatorName"
  | "from"
  | "to"
  | "date"
  | "departureAt"
  | "paymentStatus"
> & { seatCount: number; valid: boolean; demo: boolean };
export type PaymentOrder = {
  mode: "demo" | "razorpay" | "coupon";
  orderId: string;
  amount: number;
  currency: string;
  keyId?: string;
};
export const inr = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  })
    .format(amount)
    .replace(/\.00$/, "");
export function dateText(date: string, long = false) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(date + "T12:00:00+05:30")
    : new Date(date);
  return Number.isNaN(+d)
    ? "—"
    : d.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: long ? "long" : "short",
        day: "numeric",
        month: long ? "long" : "short",
        ...(long ? { year: "numeric" } : {}),
      });
}
export function localDay(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
export const timeText = (value: string) =>
  new Date(value).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });
export const durationText = (minutes: number) =>
  Math.floor(minutes / 60) + "h " + (minutes % 60) + "m";
export const errorText = (err: unknown) =>
  err instanceof Error
    ? err.message
    : "Something went wrong. Please try again.";
export const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export const tripHref = (id: string) => "/trip/?id=" + encodeURIComponent(id);
export const ticketHref = (id: string) =>
  "/ticket/?id=" + encodeURIComponent(id);
