import {
  Activity,
  BadgeIndianRupee,
  BookOpenCheck,
  BusFront,
  CalendarClock,
  ChartNoAxesColumnIncreasing,
  Headset,
  History,
  MapPinned,
  MessageSquareText,
  Receipt,
  TicketPercent,
  Users,
  WalletCards,
  Building2,
} from "lucide-react";
export const sections = {
  overview: { label: "Overview", icon: ChartNoAxesColumnIncreasing },
  bookings: { label: "Bookings", icon: BookOpenCheck },
  trips: { label: "Departures", icon: CalendarClock },
  buses: { label: "Fleet", icon: BusFront },
  routes: { label: "Routes", icon: MapPinned },
  users: { label: "Users", icon: Users },
  operators: { label: "Operators", icon: Building2 },
  payments: { label: "Payments", icon: WalletCards },
  refunds: { label: "Refunds", icon: Receipt },
  coupons: { label: "Coupons", icon: TicketPercent },
  reviews: { label: "Reviews", icon: MessageSquareText },
  support: { label: "Support", icon: Headset },
  audit: { label: "Activity log", icon: History },
};
export type Section = keyof typeof sections;
export type Role = "admin" | "operator";
export type Item = { _id: string; [key: string]: unknown };
export const statIcons = {
  revenue: BadgeIndianRupee,
  bookings: BookOpenCheck,
  trips: CalendarClock,
  buses: BusFront,
  routes: MapPinned,
  users: Users,
  operators: Building2,
  support: Headset,
  paid: Activity,
};
export const columns: Record<
  Exclude<Section, "overview">,
  [string, string][]
> = {
  users: [
    ["name", "Name"],
    ["email", "Email"],
    ["role", "Role"],
    ["active", "Active"],
  ],
  operators: [
    ["name", "Operator"],
    ["description", "About"],
    ["rating", "Rating"],
  ],
  buses: [
    ["name", "Bus"],
    ["busType", "Type"],
    ["seats", "Seats"],
    ["amenities", "Amenities"],
  ],
  routes: [
    ["from", "Origin"],
    ["to", "Destination"],
    ["distanceKm", "Distance (km)"],
    ["boardingPoints", "Boarding points"],
  ],
  trips: [
    ["from", "Origin"],
    ["to", "Destination"],
    ["busName", "Bus"],
    ["departureAt", "Departure (IST)"],
    ["fare", "Fare"],
    ["status", "Status"],
  ],
  bookings: [
    ["reference", "Reference"],
    ["journey", "Journey"],
    ["date", "Date"],
    ["total", "Total"],
    ["status", "Status"],
    ["paymentStatus", "Payment"],
  ],
  payments: [
    ["orderId", "Order"],
    ["provider", "Provider"],
    ["amount", "Amount"],
    ["status", "Status"],
  ],
  refunds: [
    ["bookingId", "Booking"],
    ["amount", "Amount"],
    ["reason", "Reason"],
    ["status", "Status"],
  ],
  coupons: [
    ["code", "Code"],
    ["percent", "Discount (%)"],
    ["maxDiscount", "Limit"],
    ["expiresAt", "Expires (IST)"],
    ["active", "Active"],
  ],
  support: [
    ["subject", "Subject"],
    ["message", "Request"],
    ["status", "Status"],
    ["updatedAt", "Updated (IST)"],
  ],
  reviews: [
    ["displayName", "Reviewed by"],
    ["rating", "Stars"],
    ["comment", "Review"],
    ["visible", "Visible"],
  ],
  audit: [
    ["action", "Action"],
    ["resource", "Section"],
    ["resourceId", "Record"],
    ["createdAt", "Time (IST)"],
  ],
};
export const allSections = Object.keys(sections) as Section[];
export const operatorSections: Section[] = [
  "overview",
  "trips",
  "bookings",
  "buses",
  "routes",
];
export const creatable = new Set<Section>([
  "operators",
  "buses",
  "routes",
  "trips",
  "coupons",
]);
export const editable = new Set<Section>([
  "operators",
  "users",
  "buses",
  "routes",
  "trips",
  "coupons",
  "support",
  "reviews",
]);
export const removable = new Set<Section>(["buses", "routes", "coupons"]);
export const singular: Partial<Record<Section, string>> = {
  operators: "operator",
  users: "user",
  buses: "bus",
  routes: "route",
  trips: "departure",
  coupons: "coupon",
  support: "request",
  reviews: "review",
  bookings: "booking",
};
export const currency = (v: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(v) || 0);
export const stamp = (v: unknown) =>
  new Date(String(v)).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
export function value(item: Item, k: string): string {
  const v = item[k];
  if (k === "journey") return item.from + " → " + item.to;
  if (v === null || v === undefined || v === "") return "—";
  if (k === "seats" && Array.isArray(v) && typeof v[0] === "object")
    return String(v.length);
  if (["total", "amount", "fare", "maxDiscount"].includes(k))
    return currency(v);
  if (k.endsWith("At")) return stamp(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return (Array.isArray(v) ? v.join(", ") : String(v)).replace(/_/g, " ");
}
