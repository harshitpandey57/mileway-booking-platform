import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import mongoose, { Types } from 'mongoose';
import { User } from '../core/models';
import { Bus, City, Coupon, Operator, Review, Route, Station, Trip } from '../catalog/models';
import { makeLayout } from '../catalog/layout';
import { cities, corridors, operators } from './fixtures';

const dayMs = 86400000;
const objectId = (key: string) => new Types.ObjectId(createHash('sha256').update('mileway-seed-v1/' + key).digest('hex').slice(0, 24));
const fixture = <T extends object>(key: string, fields: T) => ({ _id: objectId(key), ...fields });
function upserts<T extends { _id: Types.ObjectId }>(documents: T[]) {
  const now = new Date();
  return documents.map(({ _id, ...fields }) => {
    const insertFields: Record<string, unknown> = { ...fields, createdAt: now, updatedAt: now };
    return { updateOne: { filter: { _id }, update: { $setOnInsert: insertFields }, upsert: true, timestamps: false } };
  });
}
const dayString = (date: Date) => new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 10);
const layoutTypes = ['AC Sleeper', 'AC Seater', 'Non-AC Seater', 'Non-AC Sleeper'] as const;
const departures = [6 * 60 + 30, 7 * 60, 9 * 60 + 30, 20 * 60];
const amenitiesFor = (index: number, type: string) => [
  'Charging port', 'Reading light', ...(type.endsWith('Sleeper') ? ['Blanket'] : []),
  ...(index % 3 !== 1 ? ['Wi-Fi'] : []), ...(type.startsWith('AC') ? ['Water bottle'] : [])
];

/** Upserts the current fortnight without deleting inventory, bookings, or changing existing passwords. */
export async function seed() {
  const password = process.env.DEMO_SEED_PASSWORD;
  if (!password || password.length < 12 || Buffer.byteLength(password) > 72)
    throw new Error('Set DEMO_SEED_PASSWORD to a private passphrase of 12–72 bytes before seeding.');
  // Allocate stable IDs so another account that already owns a demo address is never elevated.
  const passwordHash = await bcrypt.hash(password, 12);
  const demoDomain = (process.env.DEMO_SEED_EMAIL_DOMAIN || 'mileway.test').trim().toLowerCase();
  if (!z.string().email().safeParse('customer@' + demoDomain).success || demoDomain.length > 235)
    throw new Error('DEMO_SEED_EMAIL_DOMAIN must be a valid mail domain.');
  const domainAnchor = await User.findById(objectId('account/admin')).select('email').lean();
  if (domainAnchor && domainAnchor.email !== 'admin@' + demoDomain)
    throw new Error('This database already contains Mileway demo accounts on another domain. Use its original seed domain.');
  const owner = (i: number) => objectId('account/operator' + (i + 1));
  const opId = (i: number) => objectId('operator/' + i);
  const sampleRating = (i: number) => (50 - (i % 5 + 1)) / 10;
  await Promise.all([User.init(), City.init(), Station.init(), Operator.init(), Review.init(), Route.init(), Bus.init(), Trip.init(), Coupon.init()]);
  const accounts = [
    { key: 'customer', name: 'Demo Traveller', role: 'customer' },
    { key: 'admin', name: 'Demo Administrator', role: 'admin' },
    ...operators.map(([name], i) => ({ key: 'operator' + (i + 1), name, role: 'operator' }))
  ];
  await User.bulkWrite(upserts(accounts.map(a => fixture('account/' + a.key, {
    email: a.key + '@' + demoDomain, name: a.name, role: a.role, passwordHash
  }))));
  await City.bulkWrite(upserts(Object.entries(cities).map(([name, [state]]) => fixture('city/' + name, { name, state }))));
  await Station.bulkWrite(upserts(Object.entries(cities).flatMap(([city, [, ...locations]]) =>
    locations.map(name => fixture('station/' + city + '/' + name, { name, cityId: objectId('city/' + city) })))));
  await Operator.bulkWrite(upserts(operators.map(([name, description], i) =>
    fixture('operator/' + i, { name, description, userId: owner(i), rating: sampleRating(i) }))));
  const comments = [
    'Comfortable seats and a convenient boarding point.', 'The sleeper was tidy and the ride was smooth.',
    'Good reading lights for the evening journey.', 'Boarding instructions were easy to follow.',
    'The coach felt spacious and the seats were clean.'
  ];
  const names = ['Anu', 'Ravi', 'Mira', 'Kabir', 'Leela', 'Vikram', 'Tara', 'Neel', 'Jaya', 'Dev'];
  await Review.bulkWrite(upserts(operators.flatMap((_, i) => names.map((name, j) => fixture('review/' + i + '/' + j, {
    operatorId: opId(i), displayName: name, rating: j <= i % 5 ? 4 : 5,
    comment: comments[(i + j) % comments.length], isSeeded: true, visible: true
  })))));
  const coupons = [
    { code: 'FIRSTMILE', percent: 15, maxDiscount: 150, minFare: 300, description: 'Save 15% on a journey of ₹300 or more, up to ₹150.' },
    { code: 'WEEKENDER', percent: 10, maxDiscount: 250, minFare: 600, description: 'Take 10% off bookings of ₹600 or more, up to ₹250.' },
    { code: 'TRAVELTOGETHER', percent: 20, maxDiscount: 400, minFare: 1500, description: 'Save up to ₹400 on bookings of ₹1,500 or more.' }
  ];
  await Coupon.bulkWrite(upserts(coupons.map(coupon => fixture('coupon/' + coupon.code, {
    ...coupon, active: true, expiresAt: new Date(Date.now() + 365 * dayMs)
  }))));

  const serviceCorridors = [...corridors.map((_, i) => i), 0, 0, 0, 0, 0, 1, 1, 2, 3, 3];
  const timetable = serviceCorridors.map((ci, busIndex) => {
    const [a, b, km, mins] = corridors[ci];
    const variation = serviceCorridors.slice(0, busIndex).filter(item => item === ci).length;
    const op = (ci + variation + Math.floor(busIndex / 10)) % operators.length;
    const busType = layoutTypes[(ci + variation) % layoutTypes.length];
    const kind = busType.endsWith('Sleeper') ? 'sleeper' : 'seater';
    const fare = Math.max(150, Math.round((km * (busType.startsWith('AC') ? 2.1 : 1.3) + (kind === 'sleeper' ? 90 : 0) + variation * 12) / 10) * 10);
    const busId = objectId('bus/' + busIndex);
    const busName = ['Coastliner', 'Citybird', 'Nightjar', 'Wayfarer'][busIndex % 4] + ' ' + (101 + busIndex);
    const amenities = amenitiesFor(busIndex, busType);
    const bus = { _id: busId, name: busName, busType, operatorId: opId(op), seats: makeLayout(kind, fare), amenities };
    const duration = mins + variation * 5;
    const departure = (departures[ci % departures.length] + variation * 205) % 1440;
    const directions = [[a, b], [b, a]].map(([from, to], i) => ({
      route: fixture('route/' + op + '/' + from + '/' + to, {
        operatorId: opId(op), from, to, distanceKm: km, boardingPoints: cities[from].slice(1), droppingPoints: cities[to].slice(1)
      }),
      startMinutes: (departure + i * (duration + 70)) % 1440
    }));
    return { bus, duration, directions };
  });
  await Bus.bulkWrite(upserts(timetable.map(t => t.bus)));
  const routesById = new Map(timetable.flatMap(t => t.directions.map(d => [String(d.route._id), d.route] as const)));
  await Route.bulkWrite(upserts([...routesById.values()]));
  const now = new Date();
  const dates = Array.from({ length: 15 }, (_, offset) => dayString(new Date(+now + offset * dayMs)));
  const plans = timetable.map(({ bus, duration, directions }) => {
    const candidates = dates.flatMap(date => directions.map(({ route, startMinutes }) => {
      const midnight = new Date(date + 'T00:00:00+05:30').getTime();
      const departureAt = new Date(midnight + startMinutes * 60000);
      return fixture('trip/' + bus._id + '/' + route._id + '/' + date, {
        busId: bus._id, routeId: route._id, from: route.from, to: route.to, date,
        departureAt, arrivalAt: new Date(+departureAt + duration * 60000)
      });
    })).filter(trip => trip.departureAt > now);
    return { busId: bus._id, candidates };
  });
  // A warm restart usually finds the entire horizon already present. Read only IDs in this pass.
  const plannedIds = plans.flatMap(plan => plan.candidates.map(trip => trip._id));
  const existingIds = await Trip.find({ _id: { $in: plannedIds } }).select('_id').lean();
  const present = new Set(existingIds.map(doc => String(doc._id)));
  const missing = plans.map(plan => ({
    busId: plan.busId, candidates: plan.candidates.filter(trip => !present.has(String(trip._id)))
  })).filter(plan => plan.candidates.length);

  async function extendBus(plan: typeof missing[number]) {
    return mongoose.connection.transaction(async session => {
      // Staff scheduling takes the same bus write lock. A conflicting writer must recheck its timetable.
      const bus = await Bus.findOneAndUpdate({ _id: plan.busId }, { $inc: { __v: 1 } },
        { new: true, session, timestamps: false }).lean();
      if (!bus) return 0;
      const operator = await Operator.findById(bus.operatorId).select('name rating').session(session).lean();
      if (!operator) return 0;
      const currentRoutes = await Route.find({ operatorId: operator._id, _id: { $in: plan.candidates.map(t => t.routeId) } })
        .session(session).lean();
      const byId = new Map(currentRoutes.map(route => [String(route._id), route]));
      const start = new Date(Math.min(...plan.candidates.map(t => +t.departureAt)));
      const end = new Date(Math.max(...plan.candidates.map(t => +t.arrivalAt)));
      const occupied = await Trip.find({ $or: [
        { _id: { $in: plan.candidates.map(t => t._id) } },
        { busId: bus._id, departureAt: { $lt: end }, arrivalAt: { $gt: start } }
      ] }).select('_id busId departureAt arrivalAt status').session(session).lean();
      const known = new Set(occupied.map(t => String(t._id)));
      const windows: { departureAt: Date; arrivalAt: Date; status: string }[] =
        occupied.filter(t => t.busId.equals(bus._id));
      const inserts = [];
      for (const trip of plan.candidates) {
        const route = byId.get(String(trip.routeId));
        if (!route || route.from !== trip.from || route.to !== trip.to ||
          trip.departureAt.getTime() <= Date.now() || known.has(String(trip._id))) continue;
        // An exact departure is unique even for cancelled or completed records.
        const overlaps = windows.some(w => +w.departureAt === +trip.departureAt ||
          (['scheduled', 'delayed'].includes(w.status) && w.departureAt < trip.arrivalAt && w.arrivalAt > trip.departureAt));
        if (overlaps) continue;
        const record = {
          ...trip, operatorId: operator._id, operatorName: operator.name, busName: bus.name, busType: bus.busType,
          amenities: bus.amenities, seats: bus.seats, fare: Math.min(...bus.seats.map(seat => seat.price)), rating: operator.rating,
          boardingPoints: route.boardingPoints, droppingPoints: route.droppingPoints, status: 'scheduled' as const,
          cancellationHours: 4, refundPercent: 80
        };
        windows.push(record);
        inserts.push(record);
      }
      if (inserts.length) await Trip.bulkWrite(upserts(inserts), { session });
      return inserts.length;
    });
  }
  let insertedTrips = 0;
  for (let i = 0; i < missing.length; i += 4) {
    const counts = await Promise.all(missing.slice(i, i + 4).map(extendBus));
    insertedTrips += counts.reduce((sum, n) => sum + n, 0);
  }
  return { cities: Object.keys(cities).length, operators: operators.length, buses: timetable.length,
    routes: routesById.size, insertedTrips, existingUpcomingFixtures: present.size };

}

if (require.main === module) {
  (async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('Set MONGODB_URI in the environment or root .env file.');
    await mongoose.connect(uri);
    try { console.info('Mileway fictional inventory ready', await seed()); }
    finally { await mongoose.disconnect(); }
  })().catch(error => { console.error('Seed failed:', error.message); process.exitCode = 1; });
}
