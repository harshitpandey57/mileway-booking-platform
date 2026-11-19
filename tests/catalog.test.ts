import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { Types } from 'mongoose';
import { setupSuite } from './harness';
import { City, Bus, Coupon, Operator, Review, Route, Trip } from '../apps/api/src/catalog/models';
import { seed } from '../apps/api/src/seed';
import { User } from '../apps/api/src/core/models';
import { Booking, Inventory } from '../apps/api/src/reservations/models';

interface Result {
  _id:string; fare:number; operatorName:string; busType:string; departureAt:string; arrivalAt:string;
  rating:number; durationMinutes:number; availableSeats:number; amenities:string[];
}
describe('MongoDB catalog, search and verified reviews', () => {
  let suite: Awaited<ReturnType<typeof setupSuite>>;
  const date = new Date(Date.now() + 86400000 + 330 * 60000).toISOString().slice(0, 10);
  const input = { from: 'Bengaluru', to: 'Chennai', date };
  const get = (path:string) => request(suite.app).get('/api/v1/' + path);
  const results = async (extra:Record<string,string|number> = {}) => {
    const result = await get('search').query({ ...input, ...extra }).expect(200);
    return result.body.data as Result[];
  };
  before(async () => { suite = await setupSuite(); });
  after(async () => { await suite?.close(); });

  it('repeats the seed without overwriting accounts, edits or duplicating inventory', async () => {
    const counts = async () => Promise.all([City.countDocuments(), Route.countDocuments(), Operator.countDocuments(), Bus.countDocuments(), Trip.countDocuments()]);
    const initial = await counts();
    assert.ok(initial[0] >= 20 && initial[1] >= 40 && initial[2] >= 10 && initial[3] >= 30 && initial[4] >= 100);
    const person = await User.findOne({ email:'admin@mileway.test' }).select('+passwordHash').orFail();
    const hash = person.passwordHash;
    await User.updateOne({ _id:person._id }, { $set:{ name:'Local admin alias' } });
    await seed();
    assert.deepEqual(await counts(), initial);
    const afterSeed = await User.findById(person._id).select('+passwordHash').orFail();
    assert.equal(afterSeed.name, 'Local admin alias');
    assert.equal(afterSeed.passwordHash, hash);
  });

  it('never promotes an unrelated account occupying a seeded operator address', async () => {
    const seeded = await User.findOne({email:'operator10@mileway.test'}).select('+passwordHash').lean().orFail();
    await User.deleteOne({_id:seeded._id});
    const other = await User.create({name:'Existing customer',email:seeded.email,role:'customer',passwordHash:seeded.passwordHash});
    try {
      await assert.rejects(seed(), (error: {code?:number}) => error.code === 11000);
      const preserved = await User.findById(other._id).lean().orFail();
      assert.equal(preserved.role,'customer');
      assert.equal(preserved.name,'Existing customer');
    } finally {
      await User.deleteOne({_id:other._id});
      await User.create(seeded);
    }
  });

  it('returns real city suggestions, popular routes, operators and redeemable coupons', async () => {
    const city = await get('cities').query({ q:'bEnG' }).expect(200);
    assert.deepEqual(city.body.data.map((c:{name:string}) => c.name), ['Bengaluru']);
    const literal = await get('cities').query({ q:'.*' }).expect(200);
    assert.equal(literal.body.data.length, 0);
    const home = await get('routes/popular').expect(200);
    assert.equal(home.body.data[0].from, input.from);
    assert.equal(home.body.data[0].to, input.to);
    assert.ok(home.body.data[0].distanceKm > 300 && home.body.data[0].minFare > 0);
    const staff = await get('operators').expect(200);
    assert.ok(staff.body.data.length >= 10);
    assert.equal(staff.body.data[0].userId, undefined);
    const expired = await Coupon.create({code:'EXPIRED', percent:10, maxDiscount:50, minFare:0, expiresAt:new Date(0)});
    const offers = await get('coupons').expect(200);
    assert.ok(offers.body.data.some((c:{code:string}) => c.code === 'FIRSTMILE'));
    assert.ok(offers.body.data.every((c:{code:string}) => c.code !== expired.code));
  });

  it('finds active dated departures and applies backend filters for fare, bus, operator, amenities and ratings', async () => {
    const all = await results();
    assert.equal(all.length, 6);
    assert.ok(all.every(r => r.availableSeats > 0 && r.durationMinutes > 0));
    const first = all[0];
    const filtered = await results({ ac:'true',kind:'sleeper',operator:first.operatorName,
      minPrice:first.fare,maxPrice:first.fare,minRating:first.rating,amenities:first.amenities.join(',') });
    assert.deepEqual(filtered.map(r => r._id), [first._id]);
    const cheap = await results({ ac:'false',kind:'seater' });
    assert.ok(cheap.length > 0 && cheap.every(r => r.busType === 'Non-AC Seater'));
    assert.deepEqual(await results({ maxPrice:1 }), []);
    await get('search').query({...input, date:'2025-02-30'}).expect(400);
    await get('search').query({...input, minPrice:100,maxPrice:90}).expect(400);
    const matched = await results({from:'bengaluru',to:'chennai'});
    assert.equal(matched.length, all.length);
  });

  it('combines Indian local-time filters, sorts by each available key, and paginates', async () => {
    const asHour = (iso:string) => new Date(new Date(iso).getTime() + 330 * 60000).getUTCHours();
    const morning = await results({ departure:'morning',arrival:'afternoon' });
    assert.ok(morning.length > 0 && morning.every(r => asHour(r.departureAt) >= 6 && asHour(r.departureAt) < 12 &&
      asHour(r.arrivalAt) >= 12 && asHour(r.arrivalAt) < 17));
    const night = await results({arrival:'night'});
    assert.ok(night.length > 0 && night.every(r => asHour(r.arrivalAt)>=21 || asHour(r.arrivalAt)<6));
    for (const sort of ['price','rating','departure','duration']) {
      const ordered = await results({sort});
      const values = ordered.map(r => ({price:r.fare,rating:-r.rating,departure:+new Date(r.departureAt),duration:r.durationMinutes})[sort]);
      assert.deepEqual(values,[...values].sort((a,b) => a!-b!));
    }
    const pages = await get('search').query({...input, page:2,limit:2}).expect(200);
    assert.deepEqual(pages.body.pagination, {page:2,limit:2,total:6,pages:3});
    assert.equal(pages.body.data[0]._id, (await results())[2]._id);
  });

  it('subtracts current holds and bookings, then exposes expired seats without a TTL cleanup', async () => {
    const [first] = await results();
    const trip = await Trip.findById(first._id).orFail();
    await Inventory.insertMany([
      { tripId:trip._id,seat:trip.seats[0].number,status:'held',expiresAt:new Date(Date.now()+600000) },
      { tripId:trip._id,seat:trip.seats[1].number,status:'booked' },
      { tripId:trip._id,seat:trip.seats[2].number,status:'held',expiresAt:new Date(0) }
    ]);
    try {
      assert.equal((await results())[0].availableSeats, trip.seats.length-2);
      const detail = await get('trips/' + first._id).expect(200);
      assert.equal(detail.body.data.seats.length,trip.seats.length);
      assert.equal(new Set(trip.seats.map(s=>s.number)).size, trip.seats.length);
    } finally {
      await Inventory.deleteMany({tripId:trip._id});
    }
  });

  it('restricts reviews to an owned, completed and confirmed booking and rejects duplicates', async () => {
    const client = request.agent(suite.app);
    await client.post('/api/v1/auth/login').send({email:'customer@mileway.test',password:process.env.DEMO_SEED_PASSWORD}).expect(200);
    const user = await User.findOne({email:'customer@mileway.test'}).orFail();
    const trip = await Trip.findOne(input).orFail();
    const booking = await Booking.create({
      reference:'test-review',verificationToken:'test-review-token',holdId:new Types.ObjectId(),
      tripId:trip._id,userId:user._id,operatorId:trip.operatorId,routeId:trip.routeId,busId:trip.busId,
      operatorName:trip.operatorName,busName:trip.busName,from:trip.from,to:trip.to,date:trip.date,
      departureAt:trip.departureAt,arrivalAt:trip.arrivalAt,boardingPoint:trip.boardingPoints[0],droppingPoint:trip.droppingPoints[0],
      seats:['L1'],passengers:[{seat:'L1',name:'Traveller',age:24}],email:user.email,phone:'9999999999',subtotal:100,
      discount:0,total:100,status:'confirmed',paymentStatus:'paid',expiresAt:new Date(),cancellationHours:4,refundPercent:80
    });
    const review = {bookingId:String(booking._id),rating:4,comment:'A smooth sample journey.'};
    await client.post('/api/v1/reviews').send(review).expect(403);
    await Booking.updateOne({_id:booking._id},{$set:{arrivalAt:new Date(0),userId:new Types.ObjectId()}});
    await client.post('/api/v1/reviews').send(review).expect(403);
    await Booking.updateOne({_id:booking._id},{$set:{userId:user._id}});
    await client.post('/api/v1/reviews').send(review).expect(201);
    await client.post('/api/v1/reviews').send(review).expect(409);
    const listing = await get('reviews').query({operatorId:String(trip.operatorId)}).expect(200);
    const visible = listing.body.data.find((r:{comment:string}) => r.comment===review.comment);
    assert.ok(visible && !visible.isSeeded && !visible.bookingId && !visible.userId);
    assert.equal(await Review.countDocuments({bookingId:booking._id}),1);
  });
});
