import { z } from 'zod';
import type { PipelineStage } from 'mongoose';
import { Inventory } from '../reservations/models';
import { Trip } from './models';

const cityName = z.string().trim().min(1).max(80);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Choose a valid calendar date');
const timeOfDay = z.enum(['morning', 'afternoon', 'evening', 'night']);
export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});
export const searchInput = pagination.extend({
  from: cityName, to: cityName, date: localDate,
  minPrice: z.coerce.number().min(0).optional(), maxPrice: z.coerce.number().min(0).optional(),
  ac: z.enum(['true', 'false']).optional(), kind: z.enum(['seater', 'sleeper']).optional(),
  departure: timeOfDay.optional(), arrival: timeOfDay.optional(), operator: z.string().max(100).optional(),
  amenities: z.string().trim().max(250).optional(), minRating: z.coerce.number().min(0).max(5).optional(),
  sort: z.enum(['price', 'duration', 'departure', 'rating']).default('departure')
}).refine(v => v.from.toLowerCase() !== v.to.toLowerCase(), 'Choose two different cities')
  .refine(v => v.minPrice == null || v.maxPrice == null || v.minPrice <= v.maxPrice, 'Minimum price exceeds maximum');
export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const durations = { $divide: [{ $subtract: ['$arrivalAt', '$departureAt'] }, 60000] };
const hourFilters = { morning: [6, 12], afternoon: [12, 17], evening: [17, 21], night: [21, 6] };
function partOfDay(field: string, value: z.infer<typeof timeOfDay>) {
  const hour = { $hour: { date: '$' + field, timezone: 'Asia/Kolkata' } };
  const [start, end] = hourFilters[value];
  return { [start < end ? '$and' : '$or']: [{ $gte: [hour, start] }, { $lt: [hour, end] }] };
}

export async function searchTrips(input: z.infer<typeof searchInput>) {
  const now = new Date();
  const match: Record<string, unknown> = {
    from: input.from, to: input.to, date: input.date,
    status: { $in: ['scheduled', 'delayed'] }, departureAt: { $gt: now }
  };
  if (input.minPrice != null || input.maxPrice != null) match.fare = {
    ...(input.minPrice != null ? { $gte: input.minPrice } : {}),
    ...(input.maxPrice != null ? { $lte: input.maxPrice } : {})
  };
  if (input.minRating != null) match.rating = { $gte: input.minRating };
  if (input.ac || input.kind) {
    const air = input.ac ? (input.ac === 'true' ? 'AC' : 'Non-AC') : '(AC|Non-AC)';
    const layout = input.kind ? (input.kind === 'seater' ? 'Seater' : 'Sleeper') : '(Seater|Sleeper)';
    match.busType = new RegExp('^' + air + ' ' + layout + '$', 'i');
  }
  if (input.operator) match.operatorName = input.operator;
  if (input.amenities) match.amenities = { $all: input.amenities.split(',').map(s => s.trim()).filter(Boolean) };
  const timeFilters = [
    ...(input.departure ? [partOfDay('departureAt', input.departure)] : []),
    ...(input.arrival ? [partOfDay('arrivalAt', input.arrival)] : [])
  ];
  if (timeFilters.length) match.$expr = { $and: timeFilters };
  const order = { price: 'fare', duration: 'durationMinutes', departure: 'departureAt', rating: 'rating' }[input.sort];
  const data: PipelineStage.FacetPipelineStage[] = [
    { $addFields: { durationMinutes: durations, capacity: { $size: '$seats' } } },
    { $project: { seats: 0, __v: 0 } },
    { $sort: { [order]: input.sort === 'rating' ? -1 : 1, _id: 1 } },
    { $skip: (input.page - 1) * input.limit }, { $limit: input.limit },
    { $lookup: {
      from: Inventory.collection.name, localField: '_id', foreignField: 'tripId', as: 'occupancy',
      pipeline: [{ $match: { $or: [{ status: 'booked' }, { status: 'held', expiresAt: { $gt: now } }] } }, { $count: 'used' }]
    } },
    { $addFields: { availableSeats: { $subtract: ['$capacity', { $ifNull: [{ $first: '$occupancy.used' }, 0] }] } } },
    { $project: { occupancy: 0, capacity: 0 } }
  ];
  const [result] = await Trip.aggregate([{ $match: match }, { $facet: { data, total: [{ $count: 'count' }] } }])
    .collation({ locale: 'en', strength: 2 });
  const total = result.total[0]?.count ?? 0;
  return { data: result.data, pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) } };
}
