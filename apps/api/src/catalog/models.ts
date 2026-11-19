import { Schema, model } from 'mongoose';
import type { LayoutSeat } from './layout';

const ref = (name: string) => ({ type: Schema.Types.ObjectId, ref: name, required: true as const });
const text = { type: String, required: true, trim: true } as const;
const options = { timestamps: true };
const positive = { type: Number, required: true, min: 1 } as const;
const points = {
  type: [String], required: true,
  validate: (items: string[]) => items.length > 0 && items.every(item => item.trim().length > 0)
};
const seats = {
  type: [new Schema<LayoutSeat>({
    number: { ...text, maxlength: 10 },
    deck: { ...text, enum: ['upper', 'lower'] },
    row: { type: Number, required: true, min: 0, max: 80 },
    col: { type: Number, required: true, min: 0, max: 3 },
    kind: { ...text, enum: ['seater', 'sleeper'] },
    price: { ...positive, max: 100000 }
  }, { _id: false })],
  required: true,
  validate: (layout: LayoutSeat[]) => layout.length > 0 && layout.length <= 120
    && new Set(layout.map(s => s.number)).size === layout.length
    && new Set(layout.map(s => [s.deck, s.row, s.col].join('/'))).size === layout.length
};
export const busTypes = ['AC Sleeper', 'AC Seater', 'Non-AC Sleeper', 'Non-AC Seater'] as const;

const citySchema = new Schema({ name: { ...text, unique: true }, state: text }, options);
export const City = model('City', citySchema);
const stationSchema = new Schema({ name: text, cityId: ref('City') }, options);
stationSchema.index({ cityId: 1, name: 1 }, { unique: true });
export const Station = model('Station', stationSchema);

const operatorSchema = new Schema({
  name: { ...text, unique: true }, userId: { ...ref('User'), unique: true },
  rating: { type: Number, default: 0, min: 0, max: 5 }, description: { type: String, default: '' }
}, options);
export const Operator = model('Operator', operatorSchema);

const busSchema = new Schema({
  operatorId: ref('Operator'), name: text, busType: { ...text, enum: busTypes },
  amenities: { type: [String], default: [] }, seats
}, options);
busSchema.index({ operatorId: 1, name: 1 }, { unique: true });
export const Bus = model('Bus', busSchema);

const routeSchema = new Schema({
  operatorId: ref('Operator'), from: text, to: text, distanceKm: positive,
  boardingPoints: points, droppingPoints: points
}, options);
routeSchema.index({ operatorId: 1, from: 1, to: 1 }, { unique: true });
routeSchema.index({ from: 1, to: 1 });
export const Route = model('Route', routeSchema);

const tripSchema = new Schema({
  operatorId: ref('Operator'), busId: ref('Bus'), routeId: ref('Route'),
  from: text, to: text, operatorName: text, busName: text, busType: { ...text, enum: busTypes },
  departureAt: { type: Date, required: true }, arrivalAt: { type: Date, required: true },
  date: { ...text, match: /^\d{4}-\d{2}-\d{2}$/ }, fare: positive, rating: { type: Number, min: 0, max: 5, default: 0 },
  amenities: [String], boardingPoints: points, droppingPoints: points, seats,
  status: { ...text, enum: ['scheduled', 'delayed', 'cancelled', 'completed'], default: 'scheduled' },
  cancellationHours: { type: Number, required: true, min: 0, default: 4 },
  refundPercent: { type: Number, required: true, min: 0, max: 100, default: 80 }
}, options);
tripSchema.index({ from: 1, to: 1, date: 1, status: 1, departureAt: 1 }, {
  collation: { locale: 'en', strength: 2 }
});
tripSchema.index({ busId: 1, departureAt: 1 }, { unique: true });
tripSchema.index({ operatorId: 1, departureAt: 1 });
export const Trip = model('Trip', tripSchema);

const couponSchema = new Schema({
  code: { ...text, uppercase: true, unique: true }, percent: { ...positive, max: 100 },
  maxDiscount: positive, minFare: { type: Number, required: true, min: 0 }, active: { type: Boolean, default: true },
  expiresAt: { type: Date, required: true }, description: { type: String, default: '' }
}, options);
export const Coupon = model('Coupon', couponSchema);

const reviewSchema = new Schema({
  bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' }, userId: { type: Schema.Types.ObjectId, ref: 'User' },
  operatorId: ref('Operator'), tripId: { type: Schema.Types.ObjectId, ref: 'Trip' },
  rating: { ...positive, max: 5 }, comment: { ...text, maxlength: 1000 }, displayName: text,
  isSeeded: { type: Boolean, required: true, default: false }, visible: { type: Boolean, default: true }
}, options);
reviewSchema.index({ bookingId: 1 }, { unique: true, sparse: true });
reviewSchema.index({ operatorId: 1, visible: 1, createdAt: -1 });
export const Review = model('Review', reviewSchema);
