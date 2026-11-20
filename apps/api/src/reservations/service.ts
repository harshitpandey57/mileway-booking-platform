import { randomBytes } from 'node:crypto';
import mongoose, { type ClientSession, Types } from 'mongoose';
import { z } from 'zod';
import { Trip, Coupon } from '../catalog/models';
import { HttpError } from '../core';
import { Notification, User } from '../core/models';
import { Booking, Inventory, Passenger, Payment, Refund, SeatHold } from './models';

const idPattern = /^[a-f\d]{24}$/i;
export const id = z.string().regex(idPattern, 'Invalid record ID');
const seat = z.string().trim().min(1).max(12);
export const holdInput = z.object({
  tripId: id,
  seats: z.array(seat).min(1).max(6).refine(v => new Set(v).size === v.length, 'Select each seat once')
});
export const bookingInput = z.object({
  holdId: id,
  passengers: z.array(z.object({
    seat, name: z.string().trim().min(2).max(80),
    age: z.number().int().min(1).max(120)
  })).min(1).max(6),
  phone: z.string().trim().regex(/^\+?[\d ()-]{10,19}$/).refine(s => s.replace(/\D/g, '').length >= 10 && s.replace(/\D/g, '').length <= 15, 'Invalid contact number'),
  email: z.string().trim().email().max(254),
  boardingPoint: z.string().min(1).max(160), droppingPoint: z.string().min(1).max(160),
  couponCode: z.string().trim().max(40).optional()
});
export const bookingIdInput = z.object({ bookingId: id });
export const duplicate = (error: unknown) => (error as {code?: number})?.code === 11000;
const objectId = (value: string) => new Types.ObjectId(id.parse(value));

export async function availability(tripId: string) {
  const trip = await Trip.findById(objectId(tripId)).lean();
  if (!trip) throw new HttpError(404, 'Trip not found');
  if (!['scheduled', 'delayed'].includes(trip.status) || trip.departureAt <= new Date()) {
    throw new HttpError(409, 'This trip is no longer open for seat selection');
  }
  const occupied = await Inventory.find({
    tripId: trip._id, $or: [{ status: 'booked' }, { status: 'held', expiresAt: { $gt: new Date() } }]
  }).select('seat status').lean();
  const states = new Map(occupied.map(s => [s.seat, s.status]));
  return { tripId, seats: trip.seats.map(s => ({ ...s, status: states.get(s.number) ?? 'available' })) };
}

export async function createHold(userId: string, input: z.infer<typeof holdInput>) {
  try {
    return await mongoose.connection.transaction(async session => {
      const now = new Date();
      // A common account write serializes the outstanding-seat limit across trips.
      const account = await User.updateOne({ _id: userId, active: true }, { $inc: { __v: 1 } }, { session });
      if (!account.matchedCount) throw new HttpError(401, 'Sign in to reserve seats');
      // Serialize holds with trip edits/cancellations in the same transaction.
      const trip = await Trip.findOneAndUpdate({
        _id: input.tripId, status: { $in: ['scheduled', 'delayed'] }, departureAt: { $gt: now }
      }, { $inc: { __v: 1 } }, { session, new: true }).lean();
      if (!trip) throw new HttpError(409, 'This trip is no longer open for booking');
      const existing = await SeatHold.findOne({
        tripId: trip._id, userId, status: 'active', expiresAt: { $gt: now },
        seats: { $all: input.seats, $size: input.seats.length }
      }).session(session).lean();
      if (existing) return existing;
      const recent = await SeatHold.find({ userId, status: { $in: ['active', 'converted'] }, expiresAt: { $gt: now } })
        .select('_id').session(session).lean();
      const outstanding = await Inventory.countDocuments({ holdId: { $in: recent.map(hold => hold._id) }, status: 'held', expiresAt: { $gt: now } }).session(session);
      if (outstanding + input.seats.length > 12) throw new HttpError(429, 'You can hold up to 12 seats at once. Finish or release an existing reservation.');
      const selected = trip.seats.filter(s => input.seats.includes(s.number));
      if (selected.length !== input.seats.length) throw new HttpError(422, 'One or more seats do not belong to this trip');
      const subtotal = selected.reduce((sum, s) => sum + s.price, 0);
      const expiresAt = new Date(Math.min(now.getTime() + 10 * 60_000, trip.departureAt.getTime()));
      const [hold] = await SeatHold.create([{ userId, tripId: trip._id, seats: input.seats, subtotal, expiresAt }], { session });
      for (const number of [...input.seats].sort()) {
        // The unique index rejects an attempted upsert if a booked or unexpired row already exists.
        await Inventory.updateOne({
          tripId: trip._id, seat: number, $or: [{ status: 'free' }, { status: 'held', expiresAt: { $lte: now } }]
        }, { $set: { holdId: hold._id, status: 'held', expiresAt }, $unset: { bookingId: 1 } }, { upsert: true, session });
      }
      return hold.toObject();
    });
  } catch (error) {
    if (duplicate(error)) throw new HttpError(409, 'One or more seats were just taken. Select again.');
    throw error;
  }
}

export async function releaseHold(userId: string, holdId: string) {
  return mongoose.connection.transaction(async session => {
    const hold = await SeatHold.findOne({ _id: objectId(holdId), userId }).session(session);
    if (!hold) throw new HttpError(404, 'Seat hold not found');
    if (hold.status === 'converted') throw new HttpError(409, 'Use the booking to cancel this hold');
    hold.status = 'released';
    await hold.save({ session });
    await Inventory.updateMany({ holdId: hold._id, status: 'held' }, {
      $set: { status: 'free' }, $unset: { holdId: 1, expiresAt: 1 }
    }, { session });
    return { released: true };
  });
}

async function quoteCoupon(subtotal: number, code: string | undefined, session: ClientSession) {
  if (!code) return { discount: 0, total: subtotal };
  const coupon = await Coupon.findOne({ code: code.toUpperCase(), active: true, expiresAt: { $gt: new Date() } }).session(session).lean();
  if (!coupon || subtotal < coupon.minFare) throw new HttpError(422, 'Coupon is invalid, expired, or below its minimum fare');
  const discount = Math.min(subtotal, coupon.maxDiscount, Math.round(subtotal * coupon.percent / 100));
  return { couponCode: coupon.code, discount, total: subtotal - discount };
}

export async function createBooking(userId: string, input: z.infer<typeof bookingInput>) {
  return mongoose.connection.transaction(async session => {
    const existing = await Booking.findOne({ holdId: input.holdId, userId }).session(session);
    if (existing) {
      if (existing.status === 'pending' && existing.expiresAt <= new Date()) {
        existing.status = 'expired';
        await existing.save({ session });
      }
      return existing;
    }
    const hold = await SeatHold.findOneAndUpdate({
      _id: input.holdId, userId, status: 'active', expiresAt: { $gt: new Date() }
    }, { $set: { status: 'converted' } }, { new: true, session });
    if (!hold) throw new HttpError(409, 'Seat hold is unavailable or has expired');
    const now = new Date();
    const trip = await Trip.findOne({ _id: hold.tripId, status: { $in: ['scheduled', 'delayed'] }, departureAt: { $gt: now } }).session(session).lean();
    if (!trip) throw new HttpError(409, 'This trip is no longer open for booking');
    if (!trip.boardingPoints.includes(input.boardingPoint) || !trip.droppingPoints.includes(input.droppingPoint)) {
      throw new HttpError(422, 'Choose boarding and dropping points for this trip');
    }
    const requested = new Set(input.passengers.map(p => p.seat));
    if (input.passengers.length !== hold.seats.length || !hold.seats.every(s => requested.has(s))) {
      throw new HttpError(422, 'Enter exactly one passenger for each selected seat');
    }
    const priced = await quoteCoupon(hold.subtotal, input.couponCode, session);
    const [booking] = await Booking.create([{
      holdId: hold._id, userId, tripId: trip._id, operatorId: trip.operatorId, routeId: trip.routeId, busId: trip.busId,
      from: trip.from, to: trip.to, date: trip.date, departureAt: trip.departureAt, arrivalAt: trip.arrivalAt,
      operatorName: trip.operatorName, busName: trip.busName, cancellationHours: trip.cancellationHours,
      refundPercent: trip.refundPercent, reference: 'MW-' + randomBytes(7).toString('hex').toUpperCase(),
      verificationToken: randomBytes(24).toString('hex'), expiresAt: hold.expiresAt, subtotal: hold.subtotal,
      seats: hold.seats, passengers: input.passengers, phone: input.phone, email: input.email.toLowerCase(),
      boardingPoint: input.boardingPoint, droppingPoint: input.droppingPoint, ...priced
    }], { session });
    const retained = await Inventory.updateMany({ holdId: hold._id, status: 'held', expiresAt: { $gt: now } }, {
      $set: { bookingId: booking._id }
    }, { session });
    if (retained.matchedCount !== hold.seats.length) throw new HttpError(409, 'Seat hold has expired');
    await Passenger.insertMany(input.passengers.map(p => ({ ...p, userId, bookingId: booking._id })), { session, ordered: true });
    return booking;
  });
}

export async function expirePending(userId?: string) {
  await Booking.updateMany({ ...(userId ? { userId } : {}), status: 'pending', expiresAt: { $lte: new Date() } }, { $set: { status: 'expired' } });
}

export async function getBooking(userId: string, bookingId: string) {
  await expirePending(userId);
  const booking = await Booking.findOne({ _id: objectId(bookingId), userId });
  if (!booking) throw new HttpError(404, 'Booking not found');
  return booking;
}

async function releaseInventory(bookingId: Types.ObjectId, session: ClientSession) {
  await Inventory.updateMany({ bookingId }, { $set: { status: 'free' }, $unset: { bookingId: 1, holdId: 1, expiresAt: 1 } }, { session });
}

export async function cancelBooking(bookingId: string, actor: { id: string; role: string }, force = false) {
  return mongoose.connection.transaction(async session => {
    const admin = actor.role === 'admin' && force;
    const booking = await Booking.findOne({ _id: objectId(bookingId), ...(admin ? {} : { userId: actor.id }) }).session(session);
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (booking.status === 'cancelled' || booking.status === 'expired') return booking;
    const now = Date.now();
    if (booking.status === 'confirmed') {
      const cutoff = booking.departureAt.getTime() - booking.cancellationHours * 3_600_000;
      if (!admin && now >= cutoff) throw new HttpError(409, 'The cancellation window has closed');
      const payment = await Payment.findOne({ bookingId: booking._id, status: 'captured' }).session(session);
      if (!payment) throw new HttpError(409, 'Captured payment record is missing');
      const amount = Math.round(booking.total * booking.refundPercent / 100);
      await Refund.create([{ bookingId: booking._id, paymentId: payment._id, amount, reason: 'Booking cancellation' }], { session });
      payment.status = 'refund_simulated';
      await payment.save({ session });
      booking.refundAmount = amount;
      booking.paymentStatus = 'refund_simulated';
    }
    await releaseInventory(booking._id, session);
    booking.status = booking.status === 'pending' && booking.expiresAt.getTime() <= now ? 'expired' : 'cancelled';
    booking.cancelledAt = new Date(now);
    await Notification.create([{ userId: booking.userId, title: booking.status === 'expired' ? 'Seat hold expired' : 'Booking cancelled', message: booking.reference + ': your seats have been released.' + (booking.paymentStatus === 'refund_simulated' ? ' Simulated refund of INR ' + booking.refundAmount + '.' : '') }], { session });
    await booking.save({ session });
    return booking;
  });
}

/** Capture is replayable from either a verified checkout or a signed webhook. */
export async function capture(orderId: string, providerPaymentId: string, amountPaise: number, provider: 'razorpay' | 'demo' | 'coupon') {
  return mongoose.connection.transaction(async session => {
    const payment = await Payment.findOne({ orderId, provider }).session(session);
    if (!payment || payment.amount * 100 !== amountPaise) throw new HttpError(422, 'Payment order or amount did not match');
    const booking = await Booking.findById(payment.bookingId).session(session);
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (payment.providerPaymentId && payment.providerPaymentId !== providerPaymentId) throw new HttpError(409, 'This order already has a captured payment');
    if (['captured', 'refund_simulated'].includes(payment.status)) return booking;
    const now = new Date();
    const occupied = await Inventory.countDocuments({
      bookingId: booking._id, status: 'held', expiresAt: { $gt: now }
    }).session(session);
    payment.providerPaymentId = providerPaymentId;
    booking.paymentMode = provider;
    if (booking.status !== 'pending' || booking.expiresAt <= now || occupied !== booking.seats.length) {
      // Even a genuine capture arriving after expiration cannot displace another customer.
      if (booking.status === 'pending') booking.status = 'expired';
      await releaseInventory(booking._id, session);
      await Refund.create([{ bookingId: booking._id, paymentId: payment._id, amount: payment.amount, reason: 'Capture after release or expiration' }], { session });
      payment.status = 'refund_simulated';
      booking.paymentStatus = 'refund_simulated';
      booking.refundAmount = payment.amount;
    } else {
      const locked = await Inventory.updateMany({
        bookingId: booking._id, status: 'held', expiresAt: { $gt: now }
      }, { $set: { status: 'booked' }, $unset: { expiresAt: 1 } }, { session });
      if (locked.modifiedCount !== booking.seats.length) throw new HttpError(409, 'Seat inventory changed during confirmation');
      booking.status = 'confirmed';
      booking.confirmedAt = now;
      booking.paymentStatus = 'paid';
      payment.status = 'captured';
    }
    await Notification.create([{
      userId: booking.userId, title: booking.status === 'confirmed' ? 'Your demo ticket is ready' : 'Simulated refund recorded',
      message: booking.reference + (booking.status === 'confirmed' ? ' is confirmed. Download the ticket in your bookings.' : ' was paid after its seats were released. A full simulated refund was recorded.')
    }], { session });
    await payment.save({ session });
    await booking.save({ session });
    return booking;
  });
}
