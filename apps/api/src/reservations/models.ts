import { model, Schema } from 'mongoose';

const ref = (name: string) => ({ type: Schema.Types.ObjectId, ref: name, required: true as const });
const money = { type: Number, min: 0, required: true } as const;
const options = { timestamps: true };
const passenger = new Schema({
  seat: { type: String, required: true },
  name: { type: String, required: true },
  age: { type: Number, min: 1, max: 120, required: true }
}, { _id: false });

const hold = new Schema({
  userId: ref('User'), tripId: ref('Trip'), seats: { type: [String], required: true },
  subtotal: money, expiresAt: { type: Date, required: true },
  status: { type: String, enum: ['active', 'converted', 'released'], default: 'active', required: true }
}, options);
hold.index({ userId: 1, createdAt: -1 });
hold.index({ tripId: 1, expiresAt: 1 });
export const SeatHold = model('SeatHold', hold);

const inventory = new Schema({
  tripId: ref('Trip'), seat: { type: String, required: true },
  status: { type: String, enum: ['held', 'booked', 'free'], required: true },
  holdId: { type: Schema.Types.ObjectId, ref: 'SeatHold' },
  bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' }, expiresAt: Date
}, options);
inventory.index({ tripId: 1, seat: 1 }, { unique: true });
inventory.index({ tripId: 1, status: 1, expiresAt: 1 });
export const Inventory = model('SeatInventory', inventory);

const booking = new Schema({
  reference: { type: String, required: true, unique: true }, holdId: { ...ref('SeatHold'), unique: true },
  userId: ref('User'), operatorId: ref('Operator'), busId: ref('Bus'), routeId: ref('Route'), tripId: ref('Trip'),
  operatorName: { type: String, required: true }, busName: { type: String, required: true },
  from: { type: String, required: true }, to: { type: String, required: true }, date: { type: String, required: true },
  departureAt: { type: Date, required: true }, arrivalAt: { type: Date, required: true },
  boardingPoint: { type: String, required: true }, droppingPoint: { type: String, required: true },
  seats: { type: [String], required: true }, passengers: { type: [passenger], required: true },
  email: { type: String, required: true }, phone: { type: String, required: true },
  subtotal: money, discount: money, total: money, refundAmount: { type: Number, default: 0 },
  couponCode: String, expiresAt: { type: Date, required: true }, cancellationHours: { type: Number, required: true },
  refundPercent: { type: Number, required: true },
  verificationToken: { type: String, required: true, unique: true },
  status: { type: String, enum: ['pending', 'confirmed', 'cancelled', 'expired'], required: true, default: 'pending' },
  paymentStatus: { type: String, enum: ['unpaid', 'paid', 'failed', 'refund_simulated'], required: true, default: 'unpaid' },
  paymentMode: { type: String, enum: ['demo', 'razorpay', 'coupon', null], default: null },
  confirmedAt: Date, cancelledAt: Date
}, options);
booking.index({ userId: 1, createdAt: -1 });
booking.index({ operatorId: 1, status: 1, departureAt: 1 });
booking.index({ tripId: 1, status: 1 });
booking.index({ status: 1, expiresAt: 1 });
export const Booking = model('Booking', booking);

const passengerRecord = new Schema({
  bookingId: ref('Booking'), userId: ref('User'), seat: { type: String, required: true },
  name: { type: String, required: true }, age: { type: Number, min: 1, max: 120, required: true }
}, options);
passengerRecord.index({ bookingId: 1, seat: 1 }, { unique: true });
export const Passenger = model('Passenger', passengerRecord);

const payment = new Schema({
  bookingId: { ...ref('Booking'), unique: true }, orderId: { type: String, unique: true, required: true },
  amount: money, currency: { type: String, default: 'INR' }, provider: { type: String, enum: ['demo', 'razorpay', 'coupon'], required: true },
  status: { type: String, enum: ['created', 'failed', 'captured', 'refund_simulated'], default: 'created', required: true },
  providerPaymentId: { type: String, unique: true, sparse: true }
}, options);
payment.index({ createdAt: -1 });
export const Payment = model('Payment', payment);

const refund = new Schema({
  bookingId: { ...ref('Booking'), unique: true }, paymentId: ref('Payment'), amount: money,
  status: { type: String, default: 'simulated', required: true }, reason: { type: String, required: true }
}, options);
export const Refund = model('Refund', refund);
