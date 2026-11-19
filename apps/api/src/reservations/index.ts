import { Router } from 'express';
import { z } from 'zod';
import { asyncRoute, HttpError, requireUser } from '../core';
import { Booking, SeatHold } from './models';
import {
  availability, bookingIdInput, bookingInput, cancelBooking, capture, createBooking, createHold,
  expirePending, getBooking, holdInput, id, releaseHold
} from './service';
import { createOrder, demoEnabled, ownedPayment, recordFailure, verifyCheckout, verifyFields, webhook } from './payments';
import { ticketPdf } from './tickets';

const router = Router();
const pagination = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) });

router.get('/trips/:id/seats', asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'no-store').json({ data: await availability(id.parse(req.params.id)) });
}));
router.post('/seat-holds', requireUser, asyncRoute(async (req, res) => {
  res.status(201).json({ data: await createHold(req.user!.id, holdInput.parse(req.body)) });
}));
router.get('/seat-holds/:id', requireUser, asyncRoute(async (req, res) => {
  const hold = await SeatHold.findOne({ _id: id.parse(req.params.id), userId: req.user!.id });
  if (!hold) throw new HttpError(404, 'Seat hold not found');
  res.json({ data: hold });
}));
router.delete('/seat-holds/:id', requireUser, asyncRoute(async (req, res) => {
  res.json({ data: await releaseHold(req.user!.id, id.parse(req.params.id)) });
}));
router.post('/bookings', requireUser, asyncRoute(async (req, res) => {
  res.status(201).json({ data: await createBooking(req.user!.id, bookingInput.parse(req.body)) });
}));
router.get('/bookings', requireUser, asyncRoute(async (req, res) => {
  const { page, limit } = pagination.parse(req.query);
  const userId = req.user!.id;
  await expirePending(userId);
  const [data, total] = await Promise.all([
    Booking.find({ userId }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Booking.countDocuments({ userId })
  ]);
  res.json({ data, pagination: { page, limit, total } });
}));
router.get('/bookings/:id', requireUser, asyncRoute(async (req, res) => {
  res.json({ data: await getBooking(req.user!.id, id.parse(req.params.id)) });
}));
router.post('/bookings/:id/cancel', requireUser, asyncRoute(async (req, res) => {
  res.json({ data: await cancelBooking(id.parse(req.params.id), req.user!) });
}));
router.post('/payments/order', requireUser, asyncRoute(async (req, res) => {
  const { bookingId } = bookingIdInput.parse(req.body);
  res.json({ data: await createOrder(req.user!.id, bookingId) });
}));
router.post('/payments/demo', requireUser, asyncRoute(async (req, res) => {
  if (!demoEnabled()) throw new HttpError(403, 'Simulated payments are disabled in this environment');
  const { bookingId, outcome } = bookingIdInput.extend({ outcome: z.enum(['success', 'failure', 'cancel']) }).parse(req.body);
  const payment = await ownedPayment(req.user!.id, bookingId, 'demo');
  const data = outcome === 'success'
    ? await capture(payment.orderId, 'simulated_' + bookingId, payment.amount * 100, 'demo')
    : await recordFailure(payment.orderId, outcome === 'cancel');
  res.json({ data });
}));
router.post('/payments/verify', requireUser, asyncRoute(async (req, res) => {
  const input = bookingIdInput.merge(verifyFields).parse(req.body);
  res.json({ data: await verifyCheckout(req.user!.id, input.bookingId, input) });
}));
router.post('/payments/failure', requireUser, asyncRoute(async (req, res) => {
  const { bookingId, cancelled } = bookingIdInput.extend({ cancelled: z.boolean().optional() }).parse(req.body);
  const payment = await ownedPayment(req.user!.id, bookingId);
  res.json({ data: await recordFailure(payment.orderId, cancelled) });
}));
router.post('/payments/webhook', asyncRoute(async (req, res) => {
  res.json({ data: await webhook(req.rawBody, req.get('x-razorpay-signature')) });
}));
router.get('/tickets/verify/:token', asyncRoute(async (req, res) => {
  const token = z.string().regex(/^[a-f0-9]{48}$/).parse(req.params.token);
  const b = await Booking.findOne({ verificationToken: token }).select('reference status operatorName from to date departureAt seats paymentStatus expiresAt').lean();
  if (!b) throw new HttpError(404, 'Unknown ticket');
  const status = b.status === 'pending' && b.expiresAt <= new Date() ? 'expired' : b.status;
  res.set('Cache-Control', 'no-store').json({ data: {
    reference: b.reference, status, operatorName: b.operatorName, from: b.from, to: b.to,
    date: b.date, departureAt: b.departureAt, seatCount: b.seats.length, paymentStatus: b.paymentStatus,
    valid: status === 'confirmed' && b.paymentStatus === 'paid', demo: true
  } });
}));
router.get('/tickets/:id/pdf', requireUser, asyncRoute(async (req, res) => {
  const ticket = await ticketPdf(req.user!.id, id.parse(req.params.id));
  res.type('application/pdf').attachment(ticket.reference + '.pdf').set('Cache-Control', 'private, no-store').send(ticket.bytes);
}));
export default router;
