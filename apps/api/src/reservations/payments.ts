import { createHmac, timingSafeEqual } from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { HttpError } from '../core';
import { Booking, Payment } from './models';
import { capture, duplicate, getBooking } from './service';

export function demoEnabled() {
  return process.env.DEMO_PAYMENTS === 'true' && ['development', 'demo', 'test'].includes(process.env.APP_ENV ?? '');
}

function credentials() {
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key?.startsWith('rzp_test_') || !secret) throw new HttpError(503, 'Configure a Razorpay Test Mode key pair');
  return { key, secret };
}

export function validSignature(message: string | Buffer, signature: string, secret: string) {
  if (!/^[a-f\d]{64}$/i.test(signature) || !secret) return false;
  const expected = createHmac('sha256', secret).update(message).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

async function gateway(path: string, body?: Record<string, unknown>) {
  const { key, secret } = credentials();
  let response: Response;
  try {
    response = await fetch('https://api.razorpay.com/v1' + path, {
      method: body ? 'POST' : 'GET',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: 'Basic ' + Buffer.from(key + ':' + secret).toString('base64'),
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new HttpError(502, 'Payment gateway could not be reached. Retry while your hold is active.');
  }
  if (!response.ok) throw new HttpError(502, 'Payment gateway rejected the request. Check the test gateway configuration.');
  return response.json();
}

async function orderView(payment: { provider: string; orderId: string; amount: number }) {
  if (payment.provider === 'coupon') {
    const booked = await capture(payment.orderId, payment.orderId, 0, 'coupon');
    if (booked.status !== 'confirmed') throw new HttpError(409, 'This coupon-covered booking has expired or was cancelled');
  }
  if (payment.provider === 'demo' && !demoEnabled()) throw new HttpError(503, 'Simulated payments are disabled in this environment');
  return {
    mode: payment.provider, orderId: payment.orderId, amount: payment.amount * 100, currency: 'INR',
    ...(payment.provider === 'razorpay' ? { keyId: credentials().key } : {})
  };
}

export async function createOrder(userId: string, bookingId: string) {
  const booking = await getBooking(userId, bookingId);
  const prior = await Payment.findOne({ bookingId });
  if (booking.status === 'confirmed' && prior?.provider === 'coupon') return orderView(prior);
  if (booking.status !== 'pending') throw new HttpError(409, 'This booking is no longer awaiting payment');
  if (prior) return orderView(prior);
  const provider = booking.total === 0 && booking.couponCode ? 'coupon'
    : (process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_SECRET) ? 'razorpay' : 'demo';
  if (provider === 'demo' && !demoEnabled()) throw new HttpError(503, 'Configure Razorpay test credentials or enable payments in an authorized demo environment');
  let orderId = provider + '_' + booking._id.toString();
  if (provider === 'razorpay') {
    const order = z.object({ id: z.string().regex(/^order_[\w-]+$/), amount: z.number(), currency: z.literal('INR') })
      .safeParse(await gateway('/orders', { amount: booking.total * 100, currency: 'INR', receipt: booking.reference }));
    if (!order.success || order.data.amount !== booking.total * 100) throw new HttpError(502, 'Payment gateway returned an inconsistent order');
    orderId = order.data.id;
  }
  try {
    return orderView(await Payment.create({ bookingId, orderId, provider, amount: booking.total }));
  } catch (error) {
    if (!duplicate(error)) throw error;
    const winner = await Payment.findOne({ bookingId });
    if (!winner) throw error;
    return orderView(winner);
  }
}

export async function recordFailure(orderId: string, cancelled = false) {
  return mongoose.connection.transaction(async session => {
    const payment = await Payment.findOne({ orderId }).session(session);
    if (!payment) throw new HttpError(404, 'Payment order not found');
    const booking = await Booking.findById(payment.bookingId).session(session);
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (booking.status === 'pending' && !payment.providerPaymentId) {
      payment.status = cancelled ? 'created' : 'failed';
      booking.paymentStatus = cancelled ? 'unpaid' : 'failed';
      if (booking.expiresAt <= new Date()) booking.status = 'expired';
      await payment.save({ session });
      await booking.save({ session });
    }
    return booking;
  });
}

export async function ownedPayment(userId: string, bookingId: string, provider?: 'razorpay' | 'demo') {
  await getBooking(userId, bookingId);
  const payment = await Payment.findOne({ bookingId, ...(provider ? { provider } : {}) });
  if (!payment) throw new HttpError(404, 'Create a matching payment order first');
  return payment;
}

export const verifyFields = z.object({
  razorpay_order_id: z.string().regex(/^order_[\w-]{1,100}$/),
  razorpay_payment_id: z.string().regex(/^pay_[\w-]{1,100}$/),
  razorpay_signature: z.string().max(150)
});

export async function verifyCheckout(userId: string, bookingId: string, input: z.infer<typeof verifyFields>) {
  const payment = await ownedPayment(userId, bookingId, 'razorpay');
  const { secret } = credentials();
  if (payment.orderId !== input.razorpay_order_id || !validSignature(payment.orderId + '|' + input.razorpay_payment_id, input.razorpay_signature, secret)) {
    throw new HttpError(400, 'Invalid payment signature');
  }
  // A correct checkout signature also occurs for authorizations that have not been captured.
  const response = await gateway('/payments/' + encodeURIComponent(input.razorpay_payment_id));
  const entity = captureEntity.safeParse(response);
  if (!entity.success || entity.data.id !== input.razorpay_payment_id || entity.data.order_id !== payment.orderId) {
    throw new HttpError(409, 'Payment capture is awaiting gateway confirmation');
  }
  return capture(payment.orderId, entity.data.id, entity.data.amount, 'razorpay');
}

const entity = z.object({
  id: z.string().regex(/^pay_[\w-]{1,100}$/), order_id: z.string().regex(/^order_[\w-]{1,100}$/),
  currency: z.literal('INR'), amount: z.number().int().nonnegative(), status: z.string()
});
const captureEntity = entity.extend({ status: z.literal('captured') });

export async function webhook(raw: Buffer | undefined, signature?: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, 'Payment webhook secret is not configured');
  if (!raw || !signature || !validSignature(raw, signature, secret)) throw new HttpError(400, 'Invalid webhook signature');
  const payload = z.object({ event: z.string(), payload: z.unknown() }).parse(JSON.parse(raw.toString('utf8')));
  if (!['payment.captured', 'payment.failed'].includes(payload.event)) return { received: true };
  const nested = z.object({ payment: z.object({ entity }) }).parse(payload.payload);
  const p = nested.payment.entity;
  const order = await Payment.findOne({ orderId: p.order_id, provider: 'razorpay' });
  if (!order) return { received: true };
  if (order.amount * 100 !== p.amount) throw new HttpError(422, 'Webhook amount did not match this order');
  if (payload.event === 'payment.captured' && p.status === 'captured') {
    await capture(p.order_id, p.id, p.amount, 'razorpay');
  } else if (payload.event === 'payment.failed' && p.status === 'failed') {
    await recordFailure(p.order_id);
  }
  return { received: true };
}
