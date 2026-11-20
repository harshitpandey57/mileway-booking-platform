import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import request from 'supertest';
import { setupSuite } from './harness';
import { Coupon, Trip } from '../apps/api/src/catalog/models';
import { Booking, Inventory, Passenger, Payment, Refund, SeatHold } from '../apps/api/src/reservations/models';

const base = '/api/v1';
const sign = (text: string, secret: string) => createHmac('sha256', secret).update(text).digest('hex');
type Agent = ReturnType<typeof request.agent>;

describe('Seat reservations and payments', () => {
  let suite: Awaited<ReturnType<typeof setupSuite>>;
  let owner: Agent;
  let other: Agent;
  let tripId: string;
  let boardingPoint: string;
  let droppingPoint: string;

  before(async () => {
    suite = await setupSuite();
    owner = request.agent(suite.app);
    other = request.agent(suite.app);
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = randomBytes(32).toString('hex');
    await owner.post(base + '/auth/login').send({ email: 'customer@mileway.test', password: process.env.DEMO_SEED_PASSWORD }).expect(200);
    await other.post(base + '/auth/register').send({ name: 'Other Rider', email: 'other-rider@mileway.test', password: 'Other-Rider123!' }).expect(201);
    const trip = await Trip.findOne({ status: 'scheduled', departureAt: { $gt: new Date(Date.now() + 2 * 86400_000) } }).lean();
    assert.ok(trip, 'Seeder creates trips more than two days ahead');
    tripId = String(trip._id);
    boardingPoint = trip.boardingPoints[0];
    droppingPoint = trip.droppingPoints[0];
  });
  after(async () => { if (suite) await suite.close(); });

  async function available() {
    const r = await owner.get(base + '/trips/' + tripId + '/seats').expect(200);
    return (r.body.data.seats as { number: string; price: number; status: string }[]).filter(s => s.status === 'available');
  }
  async function newHold(client: Agent, seats: string[]) {
    return (await client.post(base + '/seat-holds').send({ tripId, seats }).expect(201)).body.data;
  }
  function checkout(hold: { _id: string; seats: string[] }) {
    return {
      holdId: hold._id, boardingPoint, droppingPoint, email: 'rider@example.net', phone: '+91 98765 43210',
      passengers: hold.seats.map((seat, i) => ({ seat, name: i === 0 ? 'मीनाक्षी देशमुख' : 'Passenger ' + (i + 1), age: 32 }))
    };
  }
  async function newBooking() {
    const seat = (await available())[0].number;
    const hold = await newHold(owner, [seat]);
    return (await owner.post(base + '/bookings').send(checkout(hold)).expect(201)).body.data;
  }
  async function demoOrder(bookingId: string) {
    const { body } = await owner.post(base + '/payments/order').send({ bookingId }).expect(200);
    assert.equal(body.data.mode, 'demo');
    return body.data;
  }
  async function gatewayOrder() {
    const booking = await newBooking();
    const orderId = 'order_' + booking._id;
    await Payment.create({ bookingId: booking._id, orderId, amount: booking.total, provider: 'razorpay' });
    return { booking, orderId, paymentId: 'pay_' + booking._id };
  }

  it('lets exactly one of two customers hold overlapping seats, atomically', async () => {
    const seats = (await available()).slice(0, 3).map(s => s.number);
    const [one, two] = await Promise.all([
      owner.post(base + '/seat-holds').send({ tripId, seats: seats.slice(0, 2) }),
      other.post(base + '/seat-holds').send({ tripId, seats: seats.slice(1, 3) })
    ]);
    assert.deepEqual([one.status, two.status].sort(), [201, 409]);
    const winner = one.status === 201 ? one : two;
    const winnerClient = one.status === 201 ? owner : other;
    const loser = one.status === 201 ? other : owner;
    const selected = winner.body.data.seats;
    const free = await available();
    assert.equal(free.filter(s => seats.includes(s.number)).length, 1);
    assert.equal(await Inventory.countDocuments({ tripId, seat: { $in: selected }, status: 'held' }), 2);
    await loser.delete(base + '/seat-holds/' + winner.body.data._id).expect(404);
    await winnerClient.delete(base + '/seat-holds/' + winner.body.data._id).expect(200);
    assert.equal((await available()).filter(s => seats.includes(s.number)).length, 3);
  });

  it('limits outstanding seats across concurrent trips while preserving idempotent holds', async () => {
    const seats = (await available()).slice(0, 6).map(s => s.number);
    const hold = await newHold(owner, seats);
    assert.equal((await newHold(owner, [...seats].reverse()))._id, hold._id);
    const b = (await owner.post(base + '/bookings').send(checkout(hold)).expect(201)).body.data;
    const trips = await Trip.find({ _id: { $ne: tripId }, status: 'scheduled', departureAt: { $gt: new Date() } }).limit(2).lean();
    assert.equal(trips.length, 2);
    const responses = await Promise.all(trips.map(trip => owner.post(base + '/seat-holds').send({
      tripId: String(trip._id), seats: trip.seats.slice(0, 6).map(s => s.number)
    })));
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 429]);
    const winner = responses.find(r => r.status === 201)!;
    await owner.post(base + '/bookings/' + b._id + '/cancel').send({}).expect(200);
    await owner.delete(base + '/seat-holds/' + winner.body.data._id).expect(200);
  });

  it('checks passenger assignment, point membership and coupons, deriving its own totals', async () => {
    const seats = (await available()).slice(0, 2);
    const subtotal = seats.reduce((a, s) => a + s.price, 0);
    const hold = await newHold(owner, seats.map(s => s.number));
    const payload = checkout(hold);
    await owner.post(base + '/bookings').send({ ...payload, passengers: [payload.passengers[0]] }).expect(422);
    await owner.post(base + '/bookings').send({ ...payload, boardingPoint: 'Wrong stop' }).expect(422);
    await owner.post(base + '/bookings').send({ ...payload, couponCode: 'UNKNOWN-CODE' }).expect(422);
    await Coupon.create({ code: 'INTEGRATION10', percent: 10, maxDiscount: 50, minFare: subtotal, active: true, expiresAt: new Date(Date.now() + 86400_000) });
    const r = await owner.post(base + '/bookings').send({ ...payload, total: 1, couponCode: 'integration10' }).expect(201);
    const b = r.body.data;
    assert.equal(b.subtotal, subtotal);
    assert.equal(b.discount, Math.min(50, Math.round(subtotal * 0.1)));
    assert.equal(b.total, subtotal - b.discount);
    const replay = await owner.post(base + '/bookings').send(payload).expect(201);
    assert.equal(replay.body.data._id, b._id);
    assert.equal(await Passenger.countDocuments({ bookingId: b._id }), 2);
    await other.get(base + '/bookings/' + b._id).expect(404);
    await owner.post(base + '/bookings/' + b._id + '/cancel').send({}).expect(200);
  });

  it('handles cancelled and failed attempts, successful retry, PDF ticket, history, cancellation and simulated refund', async () => {
    const b = await newBooking();
    const order = await demoOrder(b._id);
    assert.equal(order.amount, b.total * 100);
    assert.equal((await demoOrder(b._id)).orderId, order.orderId);
    await other.post(base + '/payments/demo').send({ bookingId: b._id, outcome: 'success' }).expect(404);
    for (const outcome of ['cancel', 'failure']) {
      const r = await owner.post(base + '/payments/demo').send({ bookingId: b._id, outcome }).expect(200);
      assert.equal(r.body.data.status, 'pending');
      assert.equal(r.body.data.paymentStatus, outcome === 'cancel' ? 'unpaid' : 'failed');
    }
    const confirmed = await owner.post(base + '/payments/demo').send({ bookingId: b._id, outcome: 'success' }).expect(200);
    assert.equal(confirmed.body.data.status, 'confirmed');
    assert.equal(await Inventory.countDocuments({ bookingId: b._id, status: 'booked' }), 1);
    const history = await owner.get(base + '/bookings').expect(200);
    assert.ok(history.body.data.some((item: { _id: string }) => item._id === b._id));
    const verified = await request(suite.app).get(base + '/tickets/verify/' + b.verificationToken).expect(200);
    assert.equal(verified.body.data.valid, true);
    assert.equal(verified.body.data.email, undefined);
    assert.equal(verified.body.data.passengers, undefined);
    await other.get(base + '/tickets/' + b._id + '/pdf').expect(404);
    const pdf = await owner.get(base + '/tickets/' + b._id + '/pdf').expect('Content-Type', /application\/pdf/).expect(200);
    const document = Buffer.from(pdf.body);
    assert.equal(document.subarray(0, 5).toString(), '%PDF-');
    assert.match(document.toString('latin1'), /NotoSansDevanagari-Regular/);
    await other.post(base + '/bookings/' + b._id + '/cancel').send({}).expect(404);
    const cancelled = await owner.post(base + '/bookings/' + b._id + '/cancel').send({}).expect(200);
    assert.equal(cancelled.body.data.status, 'cancelled');
    assert.equal(cancelled.body.data.refundAmount, Math.round(b.total * b.refundPercent / 100));
    await owner.post(base + '/bookings/' + b._id + '/cancel').send({}).expect(200);
    assert.equal(await Refund.countDocuments({ bookingId: b._id }), 1);
    assert.ok((await available()).some(s => s.number === b.seats[0]));
    assert.equal((await owner.get(base + '/tickets/verify/' + b.verificationToken)).body.data.valid, false);
    await owner.get(base + '/tickets/' + b._id + '/pdf').expect(409);
  });

  it('rejects forged callbacks and confirms a signed checkout only after fetching captured amount and currency', async t => {
    const booking = await newBooking();
    const orderId = 'order_' + booking._id;
    const paymentId = 'pay_' + booking._id;
    const secret = randomBytes(32).toString('hex');
    process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
    process.env.RAZORPAY_KEY_SECRET = secret;
    t.after(() => { delete process.env.RAZORPAY_KEY_ID; delete process.env.RAZORPAY_KEY_SECRET; });
    const input = { bookingId: booking._id, razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sign(orderId + '|' + paymentId, secret) };
    let amount = booking.total * 100 + 1;
    t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      if (url.endsWith('/orders') && init.method === 'POST') {
        assert.deepEqual(JSON.parse(String(init.body)), { amount: booking.total * 100, currency: 'INR', receipt: booking.reference });
        return Response.json({ id: orderId, amount: booking.total * 100, currency: 'INR' });
      }
      assert.equal(url, 'https://api.razorpay.com/v1/payments/' + paymentId);
      return Response.json({ id: paymentId, order_id: orderId, status: 'captured', currency: 'INR', amount });
    });
    const order = await owner.post(base + '/payments/order').send({ bookingId: booking._id }).expect(200);
    assert.equal(order.body.data.keyId, 'rzp_test_integration');
    assert.equal(order.body.data.orderId, orderId);
    assert.equal(order.body.data.keySecret, undefined);
    await owner.post(base + '/payments/verify').send({ ...input, razorpay_signature: 'f'.repeat(64) }).expect(400);
    await owner.post(base + '/payments/verify').send(input).expect(422);
    amount = booking.total * 100;
    const paid = await owner.post(base + '/payments/verify').send(input).expect(200);
    assert.equal(paid.body.data.paymentMode, 'razorpay');
    assert.equal(paid.body.data.status, 'confirmed');
    // The local gateway fixture never contacts Razorpay.
  });

  it('withholds the gateway order if the customer cancelled during order creation', async t => {
    const booking = await newBooking();
    process.env.RAZORPAY_KEY_ID = 'rzp_test_integration';
    process.env.RAZORPAY_KEY_SECRET = randomBytes(32).toString('hex');
    t.after(() => { delete process.env.RAZORPAY_KEY_ID; delete process.env.RAZORPAY_KEY_SECRET; });
    t.mock.method(globalThis, 'fetch', async () => {
      await owner.post(base + '/bookings/' + booking._id + '/cancel').send({}).expect(200);
      return Response.json({ id: 'order_' + booking._id, amount: booking.total * 100, currency: 'INR' });
    });
    await owner.post(base + '/payments/order').send({ bookingId: booking._id }).expect(409);
    assert.equal(await Payment.countDocuments({ bookingId: booking._id }), 0);
    assert.ok((await available()).some(s => s.number === booking.seats[0]));
  });

  it('verifies raw webhook signatures and processes duplicates and out-of-order failures once', async () => {
    const { booking, orderId, paymentId } = await gatewayOrder();
    function event(status: 'failed' | 'captured', forged = false) {
      const payload = JSON.stringify({ event: 'payment.' + status, payload: { payment: { entity: {
        id: paymentId, order_id: orderId, amount: booking.total * 100, currency: 'INR', status
      } } } });
      return request(suite.app).post(base + '/payments/webhook').set('Content-Type', 'application/json')
        .set('x-razorpay-signature', forged ? 'wrong' : sign(payload, process.env.RAZORPAY_WEBHOOK_SECRET!)).send(payload);
    }
    await event('captured', true).expect(400);
    await event('failed').expect(200);
    assert.equal((await Booking.findById(booking._id))?.paymentStatus, 'failed');
    await Promise.all([event('captured').expect(200), event('captured').expect(200)]);
    await event('failed').expect(200);
    assert.equal((await Booking.findById(booking._id))?.paymentStatus, 'paid');
    assert.equal(await Payment.countDocuments({ bookingId: booking._id, status: 'captured' }), 1);
    assert.equal(await Inventory.countDocuments({ bookingId: booking._id, status: 'booked' }), 1);
  });

  it('reclaims expired seats without TTL deletion and reconciles late capture without changing the new hold', async () => {
    const b = await newBooking();
    await demoOrder(b._id);
    const expiresAt = new Date(Date.now() - 1000);
    await Promise.all([
      Inventory.updateMany({ bookingId: b._id }, { expiresAt }),
      SeatHold.updateOne({ _id: b.holdId }, { expiresAt }),
      Booking.updateOne({ _id: b._id }, { expiresAt })
    ]);
    const next = await newHold(other, b.seats);
    const late = await owner.post(base + '/payments/demo').send({ bookingId: b._id, outcome: 'success' }).expect(200);
    assert.equal(late.body.data.status, 'expired');
    assert.equal(late.body.data.paymentStatus, 'refund_simulated');
    assert.equal(late.body.data.refundAmount, b.total);
    assert.equal(await Inventory.countDocuments({ holdId: next._id, status: 'held' }), b.seats.length);
    await other.delete(base + '/seat-holds/' + next._id).expect(200);
  });

  it('confirms fully coupon-covered seats without a gateway transaction', async () => {
    await Coupon.create({ code: 'COVERED', percent: 100, minFare: 0, maxDiscount: 100000, active: true, expiresAt: new Date(Date.now() + 86400_000) });
    const hold = await newHold(owner, [(await available())[0].number]);
    const booking = (await owner.post(base + '/bookings').send({ ...checkout(hold), couponCode: 'COVERED' }).expect(201)).body.data;
    const first = await owner.post(base + '/payments/order').send({ bookingId: booking._id }).expect(200);
    assert.equal(first.body.data.mode, 'coupon');
    assert.equal(first.body.data.amount, 0);
    assert.equal((await Booking.findById(booking._id))?.status, 'confirmed');
    await owner.post(base + '/payments/order').send({ bookingId: booking._id }).expect(200);
    assert.equal(await Payment.countDocuments({ bookingId: booking._id }), 1);
  });

  it('disables simulated capture outside explicitly allowed environments', async () => {
    const b = await newBooking();
    await demoOrder(b._id);
    const original = process.env.APP_ENV;
    process.env.APP_ENV = 'production';
    try {
      await owner.post(base + '/payments/demo').send({ bookingId: b._id, outcome: 'success' }).expect(403);
    } finally { process.env.APP_ENV = original; }
    assert.equal((await Booking.findById(b._id))?.paymentStatus, 'unpaid');
  });
});
