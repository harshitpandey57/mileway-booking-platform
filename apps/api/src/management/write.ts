import mongoose, { ClientSession } from "mongoose";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { HttpError } from "../core";
import { AuditLog, Notification, SupportTicket, User } from "../core/models";
import {
  Bus,
  City,
  Coupon,
  Operator,
  Review,
  Route,
  Trip,
} from "../catalog/models";
import { makeLayout, rescaleLayout } from "../catalog/layout";
import { refreshRatings } from "../catalog/ratings";
import { passwordSchema } from "@mileway/shared/schemas/auth";
import { Inventory } from "../reservations/models";
import { cancelBooking } from "../reservations/service";
import { key, owned, type Scope, type Resource } from "./read";

const id = z.string().regex(/^[a-f\d]{24}$/i);
const text = z.string().trim().min(1).max(120);
const desc = z.string().trim().max(2000);
const fee = z.number().int().min(1).max(50000);
const points = z
  .array(text)
  .min(1)
  .max(16)
  .refine((a) => new Set(a).size === a.length, "Use unique stops.");
const operatorId = id.optional();
const kinds = [
  "AC Sleeper",
  "AC Seater",
  "Non-AC Sleeper",
  "Non-AC Seater",
] as const;
const seat = z.object({
  number: z.string().trim().min(1).max(10),
  row: z.number().int().min(0).max(80),
  col: z.number().int().min(0).max(3),
  kind: z.enum(["seater", "sleeper"]),
  deck: z.enum(["lower", "upper"]),
  price: fee,
});
const busSchema = z
  .object({
    operatorId,
    name: text,
    busType: z.enum(kinds),
    fare: fee,
    seatCount: z.number().int().min(1).max(80),
    amenities: z.array(text).max(20),
    seats: z.array(seat).min(1).max(80).optional(),
  })
  .strict();
const routeSchema = z
  .object({
    operatorId,
    from: text,
    to: text,
    distanceKm: z.number().int().min(1).max(7000),
    boardingPoints: points,
    droppingPoints: points,
  })
  .strict();
const tripSchema = z
  .object({
    operatorId,
    busId: id,
    routeId: id,
    departureAt: z.string().datetime({ offset: true }),
    arrivalAt: z.string().datetime({ offset: true }),
    fare: fee,
    cancellationHours: z.number().int().min(0).max(336),
    refundPercent: z.number().int().min(0).max(100),
  })
  .strict();
const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{2,24}$/),
    percent: z.number().int().min(1).max(100),
    maxDiscount: fee,
    minFare: z.number().int().min(0).max(100000),
    expiresAt: z.string().datetime({ offset: true }),
    active: z.boolean(),
    description: desc,
  })
  .strict();
const operatorSchema = z
  .object({
    name: text,
    description: desc,
    email: z.string().email().max(254).optional(),
    password: passwordSchema.optional(),
  })
  .strict();

async function owner(
  scope: Scope,
  selected: string | undefined,
  session: ClientSession,
) {
  const ownerId = scope.operatorId || (selected && key(selected));
  if (
    !ownerId ||
    (scope.operatorId && selected && String(scope.operatorId) !== selected)
  )
    throw new HttpError(400, "Choose a valid operator.");
  const result = await Operator.updateOne(
    { _id: ownerId },
    { $inc: { __v: 1 } },
    { session },
  );
  if (!result.matchedCount) throw new HttpError(404, "Operator not found.");
  return ownerId;
}
async function save(
  scope: Scope,
  name: Resource,
  recordId: string | undefined,
  input: unknown,
  session: ClientSession,
) {
  const filter = recordId ? { _id: key(recordId), ...owned(scope) } : null;
  if (name === "buses") {
    const data = busSchema.parse(input);
    const operator = await owner(scope, data.operatorId, session);
    const kind = data.busType.endsWith("Sleeper") ? "sleeper" : "seater";
    const seats = data.seats || makeLayout(kind, data.fare, data.seatCount);
    if (
      data.seats &&
      (seats.length !== data.seatCount || seats.some((s) => s.kind !== kind))
    )
      throw new HttpError(
        400,
        "Seat count and type must match the bus layout.",
      );
    if (
      new Set(seats.map((s) => s.number)).size !== seats.length ||
      new Set(seats.map((s) => s.deck + "-" + s.row + "-" + s.col)).size !==
        seats.length
    )
      throw new HttpError(
        400,
        "Seat numbers and deck positions must be unique.",
      );
    const fields = {
      operatorId: operator,
      name: data.name,
      busType: data.busType,
      amenities: data.amenities,
      seats,
    };
    return filter
      ? Bus.findOneAndUpdate(
          { ...filter, operatorId: operator },
          { $set: fields },
          { new: true, runValidators: true, session },
        )
      : (await Bus.create([fields], { session }))[0];
  }
  if (name === "routes") {
    const data = routeSchema.parse(input);
    const operator = await owner(scope, data.operatorId, session);
    if (
      data.from === data.to ||
      (await City.countDocuments({
        name: { $in: [data.from, data.to] },
      }).session(session)) !== 2
    )
      throw new HttpError(
        400,
        "Choose two different cities from the directory.",
      );
    const fields = { ...data, operatorId: operator };
    return filter
      ? Route.findOneAndUpdate(
          { ...filter, operatorId: operator },
          { $set: fields },
          { new: true, runValidators: true, session },
        )
      : (await Route.create([fields], { session }))[0];
  }
  if (name === "trips") {
    // Holds write to the trip inside their own transaction. The shared write
    // forces conflicting transactions to retry inventory checks on fresh data.
    const current = filter
      ? await Trip.findOneAndUpdate(
          filter,
          { $inc: { __v: 1 } },
          { session, new: true },
        )
      : null;
    if (filter && !current) throw new HttpError(404, "Departure not found.");
    if (current && input && typeof input === "object" && "status" in input) {
      const { status } = z
        .object({
          status: z.enum(["scheduled", "delayed", "cancelled", "completed"]),
        })
        .strict()
        .parse(input);
      if (current.status === status) return current;
      if (["cancelled", "completed"].includes(current.status))
        throw new HttpError(409, "This departure is closed.");
      if (status === "completed" && current.arrivalAt.getTime() > Date.now())
        throw new HttpError(409, "The arrival time has not passed.");
      if (
        status === "cancelled" &&
        (await Inventory.exists({
          tripId: current._id,
          $or: [
            { status: "booked" },
            { status: "held", expiresAt: { $gt: new Date() } },
          ],
        }).session(session))
      )
        throw new HttpError(
          409,
          "Cancel confirmed bookings and wait for active holds to expire first.",
        );
      current.status = status;
      return current.save({ session });
    }
    const data = tripSchema.parse(input);
    const op = await owner(scope, data.operatorId, session);
    if (current && !current.operatorId.equals(op))
      throw new HttpError(404, "Departure not found.");
    if (
      current &&
      (current.status !== "scheduled" ||
        (await Inventory.exists({
          tripId: current._id,
          $or: [
            { status: "booked" },
            { status: "held", expiresAt: { $gt: new Date() } },
          ],
        }).session(session)))
    )
      throw new HttpError(
        409,
        "Only scheduled departures without active reservations can be edited.",
      );
    const departureAt = new Date(data.departureAt),
      arrivalAt = new Date(data.arrivalAt);
    if (
      departureAt.getTime() <= Date.now() ||
      arrivalAt <= departureAt ||
      +arrivalAt - +departureAt > 1000 * 3600 * 72
    )
      throw new HttpError(
        400,
        "Choose a future departure and an arrival within 72 hours.",
      );
    const bus = await Bus.findOneAndUpdate(
      { _id: key(data.busId), operatorId: op },
      { $inc: { __v: 1 } },
      { session, new: true },
    );
    const route = await Route.findOneAndUpdate(
      { _id: key(data.routeId), operatorId: op },
      { $inc: { __v: 1 } },
      { session, new: true },
    );
    if (!bus || !route)
      throw new HttpError(
        404,
        "The bus and route must belong to this operator.",
      );
    if (
      await Trip.exists({
        busId: bus._id,
        _id: { $ne: current?._id || null },
        status: { $in: ["scheduled", "delayed"] },
        departureAt: { $lt: arrivalAt },
        arrivalAt: { $gt: departureAt },
      }).session(session)
    )
      throw new HttpError(
        409,
        "This bus is already scheduled during these hours.",
      );
    const operator = await Operator.findById(op).session(session).orFail();
    const fields = {
      operatorId: op,
      busId: bus._id,
      routeId: route._id,
      operatorName: operator.name,
      busName: bus.name,
      busType: bus.busType,
      from: route.from,
      to: route.to,
      date: new Date(+departureAt + 19800000).toISOString().slice(0, 10),
      departureAt,
      arrivalAt,
      fare: data.fare,
      rating: operator.rating,
      amenities: bus.amenities,
      seats: rescaleLayout(bus.seats, data.fare),
      boardingPoints: route.boardingPoints,
      droppingPoints: route.droppingPoints,
      status: "scheduled",
      refundPercent: data.refundPercent,
      cancellationHours: data.cancellationHours,
    };
    if (current) {
      current.set(fields);
      return current.save({ session });
    }
    return (await Trip.create([fields], { session }))[0];
  }
  if (scope.operatorId)
    throw new HttpError(403, "Administrator access required.");
  if (name === "operators") {
    const data = operatorSchema.parse(input);
    if (filter)
      return Operator.findOneAndUpdate(
        filter,
        { $set: { name: data.name, description: data.description } },
        { new: true, session, runValidators: true },
      );
    if (!data.email || !data.password)
      throw new HttpError(
        400,
        "Enter credentials for the new operator account.",
      );
    const [user] = await User.create(
      [
        {
          name: data.name,
          email: data.email.toLowerCase(),
          role: "operator",
          passwordHash: await bcrypt.hash(data.password, 12),
        },
      ],
      { session },
    );
    return (
      await Operator.create(
        [
          {
            name: data.name,
            description: data.description,
            userId: user._id,
            rating: 0,
          },
        ],
        { session },
      )
    )[0];
  }
  if (name === "coupons") {
    const data = couponSchema.parse(input);
    return filter
      ? Coupon.findOneAndUpdate(
          filter,
          { $set: data },
          { new: true, session, runValidators: true },
        )
      : (await Coupon.create([data], { session }))[0];
  }
  if (!filter) throw new HttpError(405, "This record cannot be added here.");
  if (name === "users") {
    const data = z
      .object({ name: text, active: z.boolean() })
      .strict()
      .parse(input);
    const user = await User.findOne(filter).session(session);
    if (!user) return null;
    if (
      !data.active &&
      (user.role === "admin" || user._id.toString() === scope.actor)
    )
      throw new HttpError(409, "Administrator accounts must stay active.");
    if (user.active !== data.active) user.tokenVersion += 1;
    user.set(data);
    await user.save({ session });
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
    };
  }
  if (name === "reviews") {
    const data = z.object({ visible: z.boolean() }).strict().parse(input);
    const review = await Review.findOneAndUpdate(
      filter,
      { $set: data },
      { new: true, session },
    );
    if (review) await refreshRatings(review.operatorId, session);
    return review;
  }
  if (name === "support") {
    const data = z
      .object({
        status: z.enum(["open", "in_progress", "resolved"]),
        reply: desc,
      })
      .strict()
      .parse(input);
    const item = await SupportTicket.findOneAndUpdate(
      filter,
      { $set: data },
      { new: true, session, runValidators: true },
    );
    if (item)
      await Notification.create(
        [
          {
            userId: item.userId,
            title: "Support request updated",
            message:
              item.subject +
              " · " +
              data.status.replace("_", " ") +
              (data.reply ? " — " + data.reply : ""),
          },
        ],
        { session },
      );
    return item;
  }
  throw new HttpError(405, "This record is read-only.");
}
export async function mutate(
  scope: Scope,
  name: Resource,
  recordId: string | undefined,
  input: unknown,
) {
  return mongoose.connection.transaction(async (session) => {
    const record = await save(scope, name, recordId, input, session);
    if (!record) throw new HttpError(404, "Record not found.");
    await AuditLog.create(
      [
        {
          actorId: scope.actor,
          resource: name,
          resourceId: String(record._id),
          action: recordId ? "update" : "create",
        },
      ],
      { session },
    );
    return { _id: record._id };
  });
}
export async function remove(scope: Scope, name: Resource, id: string) {
  return mongoose.connection.transaction(async (session) => {
    const q = { _id: key(id), ...owned(scope) };
    let deleted = 0;
    if (name === "routes" || name === "buses") {
      const exists = await Trip.exists(
        name === "buses" ? { busId: q._id } : { routeId: q._id },
      ).session(session);
      // Do not reveal references belonging to another operator.
      if (
        name === "buses"
          ? !(await Bus.exists(q).session(session))
          : !(await Route.exists(q).session(session))
      )
        throw new HttpError(404, "Record not found.");
      if (exists)
        throw new HttpError(409, "This record is referenced by a departure.");
      deleted = (
        name === "buses"
          ? await Bus.deleteOne(q, { session })
          : await Route.deleteOne(q, { session })
      ).deletedCount;
    } else if (name === "coupons" && !scope.operatorId)
      deleted = (await Coupon.deleteOne(q, { session })).deletedCount;
    else throw new HttpError(405, "This record cannot be removed.");
    if (!deleted) throw new HttpError(404, "Record not found.");
    await AuditLog.create(
      [
        {
          actorId: scope.actor,
          resource: name,
          resourceId: id,
          action: "delete",
        },
      ],
      { session },
    );
    return { deleted: true };
  });
}
export async function cancel(scope: Scope, bookingId: string) {
  if (scope.operatorId)
    throw new HttpError(403, "Administrator access required.");
  await cancelBooking(
    key(bookingId).toString(),
    { id: scope.actor, role: "admin" },
    true,
  );
  await AuditLog.create({
    actorId: scope.actor,
    action: "cancel",
    resource: "bookings",
    resourceId: bookingId,
  });
  return { cancelled: true };
}
