import mongoose, { Types } from "mongoose";
import { AuditLog, SupportTicket, User } from "../core/models";
import {
  Bus,
  City,
  Coupon,
  Operator,
  Review,
  Route,
  Trip,
} from "../catalog/models";
import { Booking, Payment, Refund } from "../reservations/models";
import { HttpError } from "../core";

export type Scope = { actor: string; operatorId?: Types.ObjectId };
export const key = (id: string) => {
  if (!/^[a-f\d]{24}$/i.test(id))
    throw new HttpError(400, "Invalid record identifier.");
  return new Types.ObjectId(id);
};
export const owned = (s: Scope) =>
  s.operatorId ? { operatorId: s.operatorId } : {};
export async function getScope(
  actor: string,
  operator: boolean,
): Promise<Scope> {
  if (!operator) return { actor };
  const record = await Operator.findOne({ userId: key(actor) })
    .select("_id")
    .lean();
  if (!record)
    throw new HttpError(403, "Your account has no operator profile.");
  return { actor, operatorId: record._id };
}

const lists = {
  buses: { model: Bus, fields: "name operatorId busType amenities seats" },
  routes: {
    model: Route,
    fields: "operatorId from to distanceKm boardingPoints droppingPoints",
  },
  trips: {
    model: Trip,
    fields:
      "operatorId busId routeId from to operatorName busName busType date departureAt arrivalAt fare cancellationHours refundPercent status",
  },
  bookings: {
    model: Booking,
    fields:
      "reference tripId userId operatorName busName from to date seats total status paymentMode paymentStatus boardingPoint droppingPoint cancellationHours refundPercent",
  },
  users: { model: User, fields: "name email role active" },
  operators: { model: Operator, fields: "name description userId rating" },
  coupons: {
    model: Coupon,
    fields: "code percent maxDiscount minFare active expiresAt description",
  },
  reviews: {
    model: Review,
    fields: "displayName operatorId rating comment isSeeded visible",
  },
  support: {
    model: SupportTicket,
    fields: "userId subject message status reply",
  },
  payments: {
    model: Payment,
    fields: "bookingId orderId amount provider status providerPaymentId",
  },
  refunds: {
    model: Refund,
    fields: "bookingId paymentId amount status reason",
  },
  audit: { model: AuditLog, fields: "actorId action resource resourceId" },
};
export type Resource = keyof typeof lists;
export const operatorResources = new Set([
  "buses",
  "routes",
  "trips",
  "bookings",
]);
export function resourceFor(name: string, scope: Scope): Resource {
  if (
    !Object.prototype.hasOwnProperty.call(lists, name) ||
    (scope.operatorId && !operatorResources.has(name))
  ) {
    throw new HttpError(404, "Section not found.");
  }
  return name as Resource;
}
async function expireReservations(scope: Scope) {
  await Booking.updateMany(
    { ...owned(scope), status: "pending", expiresAt: { $lte: new Date() } },
    { $set: { status: "expired" } },
  );
}
export async function list(
  scope: Scope,
  name: Resource,
  page: number,
  pageSize: number,
) {
  const { model, fields } = lists[name];
  const filter = owned(scope);
  if (name === "bookings") await expireReservations(scope);
  const dataset = mongoose.connection.collection(model.collection.name);
  const projection = Object.fromEntries(
    (fields + " createdAt updatedAt").split(" ").map((key) => [key, 1]),
  );
  const [items, total] = await Promise.all([
    dataset
      .find(filter, { projection })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    dataset.countDocuments(filter),
  ]);
  return { items, total, page, pageSize };
}
export async function options(
  scope: Scope,
  kind: string,
  term: string,
  page: number,
  owner?: string,
) {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const operatorId = scope.operatorId || (owner ? key(owner) : undefined);
  const filter = operatorId ? { operatorId } : {};
  const offset = (page - 1) * 30;
  if (kind === "cities")
    return (
      await City.find({ name: { $regex: esc, $options: "i" } })
        .sort({ name: 1 })
        .skip(offset)
        .limit(30)
        .lean()
    ).map((c) => ({ value: c.name, label: c.name }));
  if (kind === "operators" && !scope.operatorId)
    return (
      await Operator.find({ name: { $regex: esc, $options: "i" } })
        .sort({ name: 1 })
        .skip(offset)
        .limit(30)
        .lean()
    ).map((o) => ({ value: o._id, label: o.name }));
  if (kind === "buses")
    return (
      await Bus.find({ ...filter, name: { $regex: esc, $options: "i" } })
        .sort({ name: 1 })
        .skip(offset)
        .limit(30)
        .lean()
    ).map((b) => ({ value: b._id, label: b.name + " · " + b.busType }));
  if (kind === "routes")
    return (
      await Route.find({
        ...filter,
        $or: [
          { from: { $regex: esc, $options: "i" } },
          { to: { $regex: esc, $options: "i" } },
        ],
      })
        .sort({ from: 1, to: 1 })
        .skip(offset)
        .limit(30)
        .lean()
    ).map((r) => ({ value: r._id, label: r.from + " → " + r.to }));
  throw new HttpError(400, "Unknown selection.");
}

export async function overview(scope: Scope) {
  await expireReservations(scope);
  const filter = owned(scope);
  const now = Date.now();
  const ist = 5.5 * 3600000,
    day = 86400000;
  const midnight = Math.floor((now + ist) / day) * day - ist;
  const since = new Date(midnight - 6 * day);
  // Retained cancellation fees count toward net revenue after a simulated refund.
  const net = { $subtract: ["$total", { $ifNull: ["$refundAmount", 0] }] };
  const settled = {
    ...filter,
    paymentStatus: { $in: ["paid", "refund_simulated"] },
  };
  const [
    buses,
    routes,
    trips,
    bookings,
    users,
    operators,
    support,
    payments,
    series,
    top,
    recent,
  ] = await Promise.all([
    Bus.countDocuments(filter),
    Route.countDocuments(filter),
    Trip.countDocuments({
      ...filter,
      departureAt: { $gte: new Date(now) },
      status: { $in: ["scheduled", "delayed"] },
    }),
    Booking.countDocuments(filter),
    scope.operatorId ? undefined : User.countDocuments(),
    scope.operatorId ? undefined : Operator.countDocuments(),
    scope.operatorId
      ? undefined
      : SupportTicket.countDocuments({ status: { $ne: "resolved" } }),
    Booking.aggregate([
      { $match: settled },
      { $group: { _id: null, revenue: { $sum: net }, paid: { $sum: 1 } } },
    ]),
    Booking.aggregate([
      { $match: { ...settled, createdAt: { $gte: since } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
              timezone: "Asia/Kolkata",
            },
          },
          amount: { $sum: net },
          count: { $sum: 1 },
        },
      },
    ]),
    Booking.aggregate([
      { $match: settled },
      {
        $group: {
          _id: { from: "$from", to: "$to" },
          count: { $sum: 1 },
          amount: { $sum: net },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    Booking.find(filter)
      .select("reference from to total status createdAt")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
  ]);
  return {
    metrics: {
      buses,
      routes,
      trips,
      bookings,
      users,
      operators,
      support,
      revenue: payments[0]?.revenue || 0,
      paid: payments[0]?.paid || 0,
    },
    daily: Array.from({ length: 7 }, (_, i) => {
      const date = new Date(since.getTime() + i * day + ist)
        .toISOString()
        .slice(0, 10);
      const row = series.find((d) => d._id === date);
      return { date, amount: row?.amount || 0, count: row?.count || 0 };
    }),
    topRoutes: top.map((r) => ({
      from: r._id.from,
      to: r._id.to,
      count: r.count,
      amount: r.amount,
    })),
    recent,
  };
}
export async function manifest(scope: Scope, id: string) {
  const trip = await Trip.findOne({ _id: key(id), ...owned(scope) })
    .select("operatorName busName from to departureAt")
    .lean();
  if (!trip) throw new HttpError(404, "Departure not found.");
  const bookings = await Booking.find({
    tripId: trip._id,
    ...owned(scope),
    status: "confirmed",
  })
    .select("reference seats passengers boardingPoint droppingPoint phone")
    .sort({ reference: 1 })
    .lean();
  return {
    trip,
    passengers: bookings.flatMap((b) =>
      b.passengers.map((p) => ({
        reference: b.reference,
        seat: p.seat,
        name: p.name,
        age: p.age,
        boarding: b.boardingPoint,
        dropping: b.droppingPoint,
        phone: b.phone,
      })),
    ),
  };
}
