import { after, before, describe, it } from "node:test";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import request from "supertest";
import { setupSuite } from "./harness";
import { Notification, User } from "../apps/api/src/core/models";

describe("Accounts and customer support", () => {
  let suite: Awaited<ReturnType<typeof setupSuite>>;
  before(async () => {
    suite = await setupSuite();
  });
  after(async () => {
    await suite?.close();
  });
  const path = (endpoint: string) => "/api/v1" + endpoint;
  async function createAccount() {
    const email = randomBytes(8).toString("hex") + "@mileway.test";
    const password = randomBytes(18).toString("hex");
    const credentials = { email, password };
    const client = request.agent(suite.app);
    const response = await client
      .post(path("/auth/register"))
      .send({ name: "Test Traveller", ...credentials })
      .expect(201);
    return { client, credentials, response };
  }

  it("registers a customer, hashes the password, and supports sign-in and logout", async () => {
    const { client, credentials, response } = await createAccount();
    assert.equal(response.body.data.role, "customer");
    assert.equal(response.body.data.passwordHash, undefined);
    assert.equal(response.body.data.tokenVersion, undefined);
    assert.match(response.headers["set-cookie"][0], /HttpOnly/);
    const row = await User.findById(response.body.data._id)
      .select("+passwordHash")
      .orFail();
    assert.notEqual(row.passwordHash, credentials.password);
    const cookie = response.headers["set-cookie"][0].split(";")[0];
    await client.get(path("/auth/me")).expect(200);
    await client.post(path("/auth/logout")).expect(200);
    await request(suite.app)
      .get(path("/auth/me"))
      .set("Cookie", cookie)
      .expect(401);
    await client
      .post(path("/auth/login"))
      .send({ ...credentials, password: "incorrect" })
      .expect(401);
    await client.post(path("/auth/login")).send(credentials).expect(200);
    await client
      .post(path("/auth/register"))
      .send({ name: "Duplicate", ...credentials })
      .expect(409);
  });
  it("rejects public role escalation, untrusted mutation origins and unauthenticated profile access", async () => {
    await request(suite.app).get(path("/users/me")).expect(401);
    const fields = {
      name: "New customer",
      email: "new@mileway.test",
      password: randomBytes(16).toString("hex"),
    };
    await request(suite.app)
      .post(path("/auth/register"))
      .send({ ...fields, role: "admin" })
      .expect(400);
    await request(suite.app)
      .post(path("/auth/register"))
      .set("Origin", "https://different.invalid")
      .send(fields)
      .expect(403);
  });
  it("stores passenger details, favourite routes and deduplicated search history", async () => {
    const { client } = await createAccount();
    await client
      .patch(path("/users/me"))
      .send({ name: "Asha Kumar", phone: "9900000000" })
      .expect(200);
    await client
      .post(path("/users/me/passengers"))
      .send({ name: "No age", age: 0 })
      .expect(400);
    const passenger = await client
      .post(path("/users/me/passengers"))
      .send({ name: "Asha Kumar", age: 29 })
      .expect(201);
    const pair = { from: "Bengaluru", to: "Chennai" };
    for (let i = 0; i < 2; i++) {
      await client.post(path("/users/me/favorites")).send(pair).expect(200);
      await client
        .post(path("/users/me/history"))
        .send({ ...pair, date: "2030-03-12" })
        .expect(200);
    }
    const profile = (await client.get(path("/users/me")).expect(200)).body.data;
    assert.equal(profile.name, "Asha Kumar");
    assert.equal(profile.searchHistory.length, 1);
    assert.equal(profile.favoriteRoutes.length, 1);
    assert.equal(profile.searchHistory[0].from, "Bengaluru");
    assert.equal(
      (await client.delete(path("/users/me/favorites")).send(pair).expect(200))
        .body.data.favoriteRoutes.length,
      0,
    );
    const removed = await client
      .delete(
        path(
          "/users/me/passengers/" + passenger.body.data.savedPassengers[0]._id,
        ),
      )
      .expect(200);
    assert.equal(removed.body.data.savedPassengers.length, 0);
  });
  it("keeps support records and notifications private to the requesting account", async () => {
    const { client, response } = await createAccount();
    const other = await createAccount();
    const ticket = await client
      .post(path("/support"))
      .send({
        subject: "Ticket question",
        message: "Please check my ticket download.",
      })
      .expect(201);
    assert.equal(ticket.body.data.status, "open");
    assert.equal(
      (await client.get(path("/support")).expect(200)).body.data.length,
      1,
    );
    assert.equal(
      (await other.client.get(path("/support")).expect(200)).body.data.length,
      0,
    );
    const alert = await Notification.create({
      userId: response.body.data._id,
      title: "Ticket update",
      message: "Your support request has been updated.",
    });
    await other.client
      .patch(path("/users/me/notifications/" + alert._id))
      .send({})
      .expect(404);
    const marked = await client
      .patch(path("/users/me/notifications/" + alert._id))
      .send({})
      .expect(200);
    assert.equal(marked.body.data.read, true);
  });
  it("invalidates other sessions on password change and disables inactive accounts", async () => {
    const { client, credentials, response } = await createAccount();
    const other = request.agent(suite.app);
    await other.post(path("/auth/login")).send(credentials).expect(200);
    const newPassword = randomBytes(18).toString("hex");
    await client
      .post(path("/auth/change-password"))
      .send({ currentPassword: credentials.password, newPassword })
      .expect(200);
    await other.get(path("/auth/me")).expect(401);
    await client.get(path("/auth/me")).expect(200);
    await User.updateOne({ _id: response.body.data._id }, { active: false });
    await client.get(path("/auth/me")).expect(401);
    await client
      .post(path("/auth/login"))
      .send({ ...credentials, password: newPassword })
      .expect(401);
  });
  it("delivers a dev reset link, consumes it once, and revokes old sessions", async () => {
    const { client, credentials } = await createAccount();
    let url: URL | undefined;
    const oldInfo = console.info;
    try {
      console.info = (value: unknown) => {
        const line = String(value);
        if (line.startsWith("[Mileway development mailbox] "))
          url = new URL(line.slice("[Mileway development mailbox] ".length));
      };
      const resp = await request(suite.app)
        .post(path("/auth/forgot-password"))
        .send({ email: credentials.email })
        .expect(200);
      assert.deepEqual(resp.body, { data: { success: true } });
      await request(suite.app)
        .post(path("/auth/forgot-password"))
        .send({ email: "missing@mileway.test" })
        .expect(200, resp.body);
    } finally {
      console.info = oldInfo;
    }
    assert.ok(url);
    const token = (url as URL).searchParams.get("token");
    const password = randomBytes(18).toString("hex");
    await request(suite.app)
      .post(path("/auth/reset-password"))
      .send({ token, password })
      .expect(200);
    await request(suite.app)
      .post(path("/auth/reset-password"))
      .send({ token, password })
      .expect(400);
    await client.get(path("/auth/me")).expect(401);
    await client
      .post(path("/auth/login"))
      .send({ ...credentials, password })
      .expect(200);
  });
  it("delivers a reset link through the HTTPS mail transport", async (t) => {
    const { credentials } = await createAccount();
    const settings = {
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      MAIL_FROM: process.env.MAIL_FROM,
    };
    const key = randomBytes(18).toString("hex");
    process.env.RESEND_API_KEY = key;
    process.env.MAIL_FROM = "Mileway <journeys@mileway.test>";
    let delivery:
      | {
          url: string;
          method?: string;
          authorization: string | null;
          fields: Record<string, string>;
        }
      | undefined;
    t.mock.method(
      globalThis,
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        delivery = {
          url: String(input),
          method: init?.method,
          authorization: new Headers(init?.headers).get("authorization"),
          fields: JSON.parse(String(init?.body)),
        };
        return new Response("{}", { status: 200 });
      },
    );
    try {
      await request(suite.app)
        .post(path("/auth/forgot-password"))
        .send({ email: credentials.email })
        .expect(200, { data: { success: true } });
      assert.ok(delivery);
      assert.equal(delivery.url, "https://api.resend.com/emails");
      assert.equal(delivery.method, "POST");
      assert.equal(delivery.authorization, "Bearer " + key);
      assert.equal(delivery.fields.from, process.env.MAIL_FROM);
      assert.equal(delivery.fields.to, credentials.email);
      const link = new URL(delivery.fields.text.split("\n").at(-1)!);
      assert.equal(link.origin, process.env.PUBLIC_BASE_URL);
      assert.equal(link.pathname, "/reset/");
      await request(suite.app)
        .post(path("/auth/reset-password"))
        .send({
          token: link.searchParams.get("token"),
          password: randomBytes(18).toString("hex"),
        })
        .expect(200);
    } finally {
      for (const [name, value] of Object.entries(settings)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
