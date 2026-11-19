import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { requireUser, asyncRoute, HttpError } from '../core';
import { User } from '../core/models';
import { Booking } from '../reservations/models';
import { Bus, City, Coupon, Operator, Review, Route, Trip } from './models';
import { refreshRatings } from './ratings';
import { escapeRegex, pagination, searchInput, searchTrips } from './search';

const router = Router();
const id = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');
const listParams = pagination.extend({ q: z.string().trim().max(80).default('') });
function pageInfo(page: number, limit: number, total: number) {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}

router.get('/cities', asyncRoute(async (req, res) => {
  const { q, page, limit } = listParams.parse(req.query);
  const query = q ? { name: new RegExp('^' + escapeRegex(q), 'i') } : {};
  const [data, total] = await Promise.all([
    City.find(query).select('name state').sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    City.countDocuments(query)
  ]);
  res.json({ data, pagination: pageInfo(page, limit, total) });
}));
router.get('/operators', asyncRoute(async (req, res) => {
  const { page, limit } = pagination.parse(req.query);
  const [data, total] = await Promise.all([
    Operator.find().select('name rating description').sort({ rating: -1, name: 1 }).skip((page - 1) * limit).limit(limit).lean(), Operator.countDocuments()
  ]);
  res.json({ data, pagination: pageInfo(page, limit, total) });
}));
router.get('/routes/popular', asyncRoute(async (_req, res) => {
  const priority = ['Bengaluru/Chennai', 'Mumbai/Pune', 'Hyderabad/Vijayawada', 'Delhi/Jaipur'];
  const data = await Trip.aggregate([
    { $match: { departureAt: { $gt: new Date() }, status: { $in: ['scheduled', 'delayed'] } } },
    { $group: {
      _id: { from: '$from', to: '$to' }, routeId: { $first: '$routeId' },
      minFare: { $min: '$fare' }, frequency: { $sum: 1 },
      durationMinutes: { $min: { $divide: [{ $subtract: ['$arrivalAt', '$departureAt'] }, 60000] } }
    } },
    { $set: { rank: { $indexOfArray: [priority, { $concat: ['$_id.from', '/', '$_id.to'] }] } } },
    { $set: { rank: { $cond: [{ $lt: ['$rank', 0] }, 100, '$rank'] } } },
    { $sort: { rank: 1, frequency: -1, '_id.from': 1, '_id.to': 1 } }, { $limit: 8 },
    { $lookup: { from: Route.collection.name, localField: 'routeId', foreignField: '_id', as: 'route' } },
    { $project: { from: '$_id.from', to: '$_id.to', _id: '$routeId', distanceKm: { $first: '$route.distanceKm' }, minFare: 1, durationMinutes: 1 } }
  ]);
  res.json({ data });
}));
router.get('/routes', asyncRoute(async (req, res) => {
  const { page, limit } = pagination.parse(req.query);
  const [data, total] = await Promise.all([
    Route.find().select('-__v').sort({ from: 1, to: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(), Route.countDocuments()
  ]);
  res.json({ data, pagination: pageInfo(page, limit, total) });
}));
router.get('/buses', asyncRoute(async (req, res) => {
  const { page, limit } = pagination.parse(req.query);
  const [data, total] = await Promise.all([
    Bus.find().select('operatorId name busType amenities').sort({ name: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(), Bus.countDocuments()
  ]);
  res.json({ data, pagination: pageInfo(page, limit, total) });
}));
router.get(['/search', '/trips'], asyncRoute(async (req, res) => {
  res.json(await searchTrips(searchInput.parse(req.query)));
}));
router.get('/trips/:id', asyncRoute(async (req, res) => {
  const trip = await Trip.findById(id.parse(req.params.id)).lean();
  if (!trip) throw new HttpError(404, 'Trip not found');
  res.json({ data: { ...trip, durationMinutes: (+trip.arrivalAt - +trip.departureAt) / 60000 } });
}));
router.get('/coupons', asyncRoute(async (_req, res) => {
  res.json({ data: await Coupon.find({ active: true, expiresAt: { $gt: new Date() } })
    .select('code percent minFare maxDiscount description expiresAt').sort({ minFare: 1 }).limit(50).lean() });
}));

router.get('/reviews', asyncRoute(async (req, res) => {
  const { operatorId, page, limit } = pagination.extend({ operatorId: id.optional() }).parse(req.query);
  const query = { visible: true, ...(operatorId ? { operatorId: new Types.ObjectId(operatorId) } : {}) };
  const [data, total] = await Promise.all([
    Review.find(query).select('operatorId rating comment displayName isSeeded createdAt').sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit).limit(limit).lean(), Review.countDocuments(query)
  ]);
  res.json({ data, pagination: pageInfo(page, limit, total) });
}));
router.post('/reviews', requireUser, asyncRoute(async (req, res) => {
  const { bookingId, rating, comment } = z.object({
    bookingId: id, rating: z.number().int().min(1).max(5), comment: z.string().trim().min(2).max(1000)
  }).parse(req.body);
  const result = await mongoose.connection.transaction(async session => {
    const booking = await Booking.findOne({
      _id: bookingId, userId: req.user!.id, status: 'confirmed', arrivalAt: { $lte: new Date() }
    }).session(session).lean();
    if (!booking) throw new HttpError(403, 'A completed, confirmed booking is required for a review');
    if (await Review.exists({ bookingId }).session(session)) throw new HttpError(409, 'You already reviewed this journey');
    const author = await User.findById(req.user!.id).select('name').session(session).lean();
    const [review] = await Review.create([{
      bookingId, operatorId: booking.operatorId, tripId: booking.tripId, userId: booking.userId,
      displayName: author?.name.split(/\s+/)[0] || 'Passenger', rating, comment, isSeeded: false
    }], { session });
    await refreshRatings(booking.operatorId, session);
    return { _id: review._id, rating, comment };
  });
  res.status(201).json({ data: result });
}));
export default router;
