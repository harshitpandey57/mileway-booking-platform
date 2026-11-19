import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { setupSuite } from "./harness";
import { Bus, Operator, Route, Trip } from "../apps/api/src/catalog/models";
import { Inventory } from "../apps/api/src/reservations/models";

let suite: Awaited<ReturnType<typeof setupSuite>>;
let admin: ReturnType<typeof request.agent>,
  operator: ReturnType<typeof request.agent>,
  customer: ReturnType<typeof request.agent>,
  other: ReturnType<typeof request.agent>;
let ownerId: string;
const prefix = "/api/v1";
before(async () => {
  suite = await setupSuite();
  [admin, operator, customer, other] = await Promise.all(
    ["admin", "operator1", "customer", "operator2"].map(async (role) => {
      const client = request.agent(suite.app);
      const { body } = await client
        .post(prefix + "/auth/login")
        .send({
          email: role + "@mileway.test",
          password: process.env.DEMO_SEED_PASSWORD,
        })
        .expect(200);
      if (role === "operator1")
        ownerId = String(
          (await Operator.findOne({ userId: body.data.id }).orFail())._id,
        );
      return client;
    }),
  );
});
after(async () => {
  await suite?.close();
});
test("staff access requires the correct role and operator records are scoped", async () => {
  await request(suite.app)
    .get(prefix + "/admin/overview")
    .expect(401);
  await customer.get(prefix + "/admin/overview").expect(403);
  await operator.get(prefix + "/admin/users").expect(403);
  await customer.get(prefix + "/operator/bookings").expect(403);
  await operator.get(prefix + "/operator/support").expect(404);
  const { body } = await operator.get(prefix + "/operator/buses").expect(200);
  assert.ok(body.data.items.length > 0);
  assert.ok(
    body.data.items.every(
      (bus: { operatorId: string }) => bus.operatorId === ownerId,
    ),
  );
  const unowned = (await other.get(prefix + "/operator/trips").expect(200)).body
    .data.items[0];
  await operator
    .get(prefix + "/operator/trips/" + unowned._id + "/manifest")
    .expect(404);
  await operator
    .put(prefix + "/operator/trips/" + unowned._id)
    .send({ status: "delayed" })
    .expect(404);
  const overview = (await admin.get(prefix + "/admin/overview").expect(200))
    .body.data;
  assert.equal(overview.metrics.buses, await Bus.countDocuments());
  assert.equal(overview.daily.length, 7);
  const members = (
    await admin.get(prefix + "/admin/users?pageSize=2").expect(200)
  ).body.data;
  assert.equal(members.items.length, 2);
  assert.equal(members.items[0].passwordHash, undefined);
});
test("operator can configure fleet, routes, schedules and manifests", async () => {
  const bus = {
    name: "Management test coach",
    busType: "AC Seater",
    fare: 800,
    seatCount: 12,
    amenities: ["Wi-Fi", "Reading lights"],
  };
  const id = (
    await operator
      .post(prefix + "/operator/buses")
      .send(bus)
      .expect(201)
  ).body.data._id;
  await other
    .put(prefix + "/operator/buses/" + id)
    .send({ ...bus, name: "Other fleet" })
    .expect(404);
  const route = (
    await operator
      .post(prefix + "/operator/routes")
      .send({
        from: "Mumbai",
        to: "Chennai",
        distanceKm: 1300,
        boardingPoints: ["West terminal"],
        droppingPoints: ["Central"],
      })
      .expect(201)
  ).body.data._id;
  const dep = Date.now() + 30 * 86400000;
  const trip = {
    busId: id,
    routeId: route,
    departureAt: new Date(dep).toISOString(),
    arrivalAt: new Date(dep + 7200000).toISOString(),
    fare: 880,
    refundPercent: 80,
    cancellationHours: 4,
  };
  const tripId = (
    await operator
      .post(prefix + "/operator/trips")
      .send(trip)
      .expect(201)
  ).body.data._id;
  await operator
    .post(prefix + "/operator/trips")
    .send({ ...trip, departureAt: new Date(dep + 3600000).toISOString() })
    .expect(409);
  const saved = await Trip.findById(tripId).orFail();
  assert.equal(saved.seats.length, 12);
  assert.equal(Math.min(...saved.seats.map((s) => s.price)), 880);
  assert.deepEqual(
    (
      await operator
        .get(prefix + "/operator/trips/" + tripId + "/manifest")
        .expect(200)
    ).body.data.passengers,
    [],
  );
  await operator.delete(prefix + "/operator/routes/" + route).expect(409);
  await operator.delete(prefix + "/operator/buses/" + id).expect(409);
  await Inventory.create({
    tripId,
    seat: saved.seats[0].number,
    status: "held",
    expiresAt: new Date(Date.now() + 90000),
  });
  await operator
    .put(prefix + "/operator/trips/" + tripId)
    .send({ ...trip, fare: 999 })
    .expect(409);
  await operator
    .put(prefix + "/operator/trips/" + tripId)
    .send({ status: "cancelled" })
    .expect(409);
  await operator
    .put(prefix + "/operator/trips/" + tripId)
    .send({ status: "delayed" })
    .expect(200);
  await Inventory.updateOne(
    { tripId },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  await operator
    .put(prefix + "/operator/trips/" + tripId)
    .send({ status: "cancelled" })
    .expect(200);
  assert.equal((await Trip.findById(tripId).orFail()).status, "cancelled");
  assert.equal(
    String((await Route.findById(route).orFail()).operatorId),
    ownerId,
  );
});
test("admin manages operator identity, coupons, reviews, support, and account state", async () => {
  const password = process.env.DEMO_SEED_PASSWORD!;
  const email = "staff-ops@mileway.test";
  await admin
    .post(prefix + "/admin/operators")
    .send({
      name: "Test Shuttle",
      description: "Fictional bus operator",
      email,
      password,
    })
    .expect(201);
  const staff = request.agent(suite.app);
  const account = (
    await staff
      .post(prefix + "/auth/login")
      .send({ email, password })
      .expect(200)
  ).body.data;
  assert.equal(account.role, "operator");
  assert.equal(
    (await staff.get(prefix + "/operator/overview").expect(200)).body.data
      .metrics.buses,
    0,
  );
  await admin
    .put(prefix + "/admin/users/" + account.id)
    .send({ name: account.name, active: false })
    .expect(200);
  await staff.get(prefix + "/operator/overview").expect(401);
  const coupon = {
    code: "MANAGE10",
    percent: 10,
    minFare: 200,
    maxDiscount: 80,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    active: true,
    description: "Test offer",
  };
  const couponId = (
    await admin
      .post(prefix + "/admin/coupons")
      .send(coupon)
      .expect(201)
  ).body.data._id;
  await admin
    .put(prefix + "/admin/coupons/" + couponId)
    .send({ ...coupon, active: false })
    .expect(200);
  await admin.delete(prefix + "/admin/coupons/" + couponId).expect(200);
  const review = (await admin.get(prefix + "/admin/reviews").expect(200)).body
    .data.items[0];
  await admin
    .put(prefix + "/admin/reviews/" + review._id)
    .send({ visible: false })
    .expect(200);
  const ticket = (
    await customer
      .post(prefix + "/support")
      .send({
        subject: "Trip details",
        message: "Can you help me find my departure?",
      })
      .expect(201)
  ).body.data;
  await admin
    .put(prefix + "/admin/support/" + ticket._id)
    .send({
      status: "resolved",
      reply: "You can find departure details on your ticket.",
    })
    .expect(200);
  assert.ok(
    (await admin.get(prefix + "/admin/audit").expect(200)).body.data.total >= 5,
  );
});
test("paid seats appear on the manifest and cancellation reconciles staff revenue", async () => {
  const trip = await Trip.findOne({
    operatorId: ownerId,
    status: "scheduled",
    departureAt: { $gt: new Date(Date.now() + 86400000) },
  }).orFail();
  const seat = trip.seats[0].number;
  const hold = (
    await customer
      .post(prefix + "/seat-holds")
      .send({ tripId: trip._id, seats: [seat] })
      .expect(201)
  ).body.data;
  const booking = (
    await customer
      .post(prefix + "/bookings")
      .send({
        holdId: hold._id,
        passengers: [{ seat, name: "Demo Guest", age: 31 }],
        email: "customer@mileway.test",
        phone: "9876543210",
        boardingPoint: trip.boardingPoints[0],
        droppingPoint: trip.droppingPoints[0],
      })
      .expect(201)
  ).body.data;
  await customer
    .post(prefix + "/payments/order")
    .send({ bookingId: booking._id })
    .expect(200);
  await customer
    .post(prefix + "/payments/demo")
    .send({ bookingId: booking._id, outcome: "success" })
    .expect(200);
  const manifest = (
    await operator
      .get(prefix + "/operator/trips/" + trip._id + "/manifest")
      .expect(200)
  ).body.data;
  assert.equal(manifest.passengers[0].reference, booking.reference);
  assert.equal(manifest.passengers[0].name, "Demo Guest");
  const getRevenue = async () =>
    (await operator.get(prefix + "/operator/overview").expect(200)).body.data
      .metrics.revenue;
  assert.equal(await getRevenue(), booking.total);
  await operator
    .post(prefix + "/operator/bookings/" + booking._id + "/cancel")
    .send({})
    .expect(403);
  await admin
    .post(prefix + "/admin/bookings/" + booking._id + "/cancel")
    .send({})
    .expect(200);
  assert.equal(
    await getRevenue(),
    booking.total - Math.round((booking.total * booking.refundPercent) / 100),
  );
  assert.equal(
    (await admin.get(prefix + "/admin/refunds").expect(200)).body.data.total,
    1,
  );
  assert.equal(
    (
      await operator
        .get(prefix + "/operator/trips/" + trip._id + "/manifest")
        .expect(200)
    ).body.data.passengers.length,
    0,
  );
});
