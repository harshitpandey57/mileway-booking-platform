import { randomBytes, createHash } from "node:crypto";
import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { z } from "zod";
import {
  emailSchema,
  loginSchema,
  registerSchema,
  passwordSchema,
  profileSchema,
  routePairSchema,
  passengerSchema,
  searchEntrySchema,
  supportSchema,
} from "@mileway/shared/schemas/auth";
import { User, Notification, SupportTicket } from "./models";
import { requireUser, asyncRoute, HttpError } from "./index";

const router = Router();
const publicFields =
  "_id name email phone role savedPassengers favoriteRoutes searchHistory createdAt";
const id = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid record identifier");
const validPair = routePairSchema.refine(
  (v) => v.from.toLowerCase() !== v.to.toLowerCase(),
  "Choose different cities",
);
const credentialLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { message: "Too many attempts. Try again in 15 minutes." },
  },
});
const resetLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { message: "Too many reset requests. Try again in 15 minutes." },
  },
});
const week = 7 * 86400 * 1000;
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
});
const issue = (res: Response, userId: string, version: number) => {
  const token = jwt.sign({ ver: version }, process.env.JWT_SECRET!, {
    subject: userId,
    algorithm: "HS256",
    expiresIn: "7d",
  });
  res.cookie("mileway_session", token, { ...cookieOptions(), maxAge: week });
};
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
async function profile(userId: string) {
  const user = await User.findOne({ _id: userId, active: true })
    .select(publicFields)
    .lean();
  if (!user) throw new HttpError(401, "Sign in to access your account");
  return { ...user, id: user._id.toString() };
}
const paging = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.post(
  "/auth/register",
  credentialLimit,
  asyncRoute(async (req, res) => {
    const { name, email, password } = registerSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(password, 12);
    let account;
    try {
      account = await User.create({
        name,
        email,
        passwordHash,
        role: "customer",
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000)
        throw new HttpError(409, "An account already exists for this email");
      throw err;
    }
    issue(res, String(account._id), account.tokenVersion);
    res.status(201).json({ data: await profile(String(account._id)) });
  }),
);
// Equalize password work for unknown accounts, keeping the login response generic.
const dummyHash = bcrypt.hash("unused login comparison", 12);
router.post(
  "/auth/login",
  credentialLimit,
  asyncRoute(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const account = await User.findOne({ email, active: true }).select(
      "+passwordHash",
    );
    const matches = await bcrypt.compare(
      password,
      account?.passwordHash ?? (await dummyHash),
    );
    if (!account || !matches)
      throw new HttpError(401, "Email or password is incorrect");
    issue(res, String(account._id), account.tokenVersion);
    res.json({ data: await profile(String(account._id)) });
  }),
);
router.get(
  ["/auth/me", "/users/me"],
  requireUser,
  asyncRoute(async (req, res) => {
    res.json({ data: await profile(req.user!.id) });
  }),
);
router.post(
  "/auth/logout",
  requireUser,
  asyncRoute(async (req, res) => {
    await User.updateOne({ _id: req.user!.id }, { $inc: { tokenVersion: 1 } });
    res.clearCookie("mileway_session", cookieOptions());
    res.json({ data: { success: true } });
  }),
);
router.patch(
  "/users/me",
  requireUser,
  asyncRoute(async (req, res) => {
    const fields = profileSchema.parse(req.body);
    await User.updateOne({ _id: req.user!.id }, { $set: fields });
    res.json({ data: await profile(req.user!.id) });
  }),
);
router.post(
  "/auth/change-password",
  requireUser,
  credentialLimit,
  asyncRoute(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({
        currentPassword: z.string().min(1).max(256),
        newPassword: passwordSchema,
      })
      .parse(req.body);
    const account = await User.findById(req.user!.id).select("+passwordHash");
    if (
      !account ||
      !(await bcrypt.compare(currentPassword, account.passwordHash))
    )
      throw new HttpError(403, "Current password is incorrect");
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const changed = await User.findOneAndUpdate(
      { _id: account._id, active: true, tokenVersion: account.tokenVersion },
      {
        $set: { passwordHash },
        $inc: { tokenVersion: 1 },
        $unset: { resetTokenHash: "", resetExpiresAt: "" },
      },
      { new: true },
    );
    if (!changed)
      throw new HttpError(409, "Your account changed. Sign in and try again.");
    issue(res, String(account._id), changed.tokenVersion);
    res.json({ data: { success: true } });
  }),
);
router.post(
  "/auth/forgot-password",
  resetLimit,
  asyncRoute(async (req, res) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body);
    const delivery =
      process.env.RESEND_API_KEY || process.env.SMTP_URL ? "email" : "console";
    const localMailbox =
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_DEV_RESET_LOG === "true";
    if (
      (process.env.RESEND_API_KEY && !process.env.MAIL_FROM) ||
      (delivery === "console" && !localMailbox)
    )
      throw new HttpError(
        503,
        "Password reset delivery is unavailable. Contact the service administrator.",
      );
    const token = randomBytes(32).toString("hex");
    const account = await User.findOneAndUpdate(
      { email, active: true },
      {
        $set: {
          resetTokenHash: hashToken(token),
          resetExpiresAt: new Date(Date.now() + 15 * 60000),
        },
      },
    );
    if (account) {
      const url = new URL(
        "/reset/",
        process.env.PUBLIC_BASE_URL || "http://localhost:3000",
      );
      url.searchParams.set("token", token);
      const mail = {
        from: process.env.MAIL_FROM || "Mileway <noreply@mileway.test>",
        to: email,
        subject: "Reset your Mileway password",
        text:
          "Open this link within 15 minutes to set a new Mileway password.\n\n" +
          url.href,
      };
      // Provider failures must not reveal account existence or expose a reset URL in logs.
      try {
        if (process.env.RESEND_API_KEY) {
          const result = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + process.env.RESEND_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(mail),
            signal: AbortSignal.timeout(8000),
          });
          if (!result.ok)
            console.error(
              `Password reset delivery failed (Resend HTTP ${result.status}). Check your Resend API key and sender settings.`,
            );
        } else if (process.env.SMTP_URL) {
          await nodemailer.createTransport(process.env.SMTP_URL).sendMail(mail);
        } else {
          console.info("[Mileway development mailbox] " + url.href);
        }
      } catch {
        const provider = process.env.RESEND_API_KEY ? "Resend" : "SMTP";
        console.error(
          `Password reset delivery failed. Check the ${provider} connection and sender settings.`,
        );
      }
    }
    res.json({ data: { success: true, delivery } });
  }),
);
router.post(
  "/auth/reset-password",
  resetLimit,
  asyncRoute(async (req, res) => {
    const { token, password } = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        password: passwordSchema,
      })
      .parse(req.body);
    const filter = {
      resetTokenHash: hashToken(token),
      resetExpiresAt: { $gt: new Date() },
      active: true,
    };
    if (!(await User.exists(filter)))
      throw new HttpError(
        400,
        "This reset link has expired or was already used",
      );
    const result = await User.updateOne(filter, {
      $set: { passwordHash: await bcrypt.hash(password, 12) },
      $unset: { resetTokenHash: "", resetExpiresAt: "" },
      $inc: { tokenVersion: 1 },
    });
    if (!result.modifiedCount)
      throw new HttpError(
        400,
        "This reset link has expired or was already used",
      );
    res.clearCookie("mileway_session", cookieOptions());
    res.json({ data: { success: true } });
  }),
);
router.post(
  "/users/me/passengers",
  requireUser,
  asyncRoute(async (req, res) => {
    const p = passengerSchema.parse(req.body);
    const result = await User.updateOne(
      { _id: req.user!.id, "savedPassengers.19": { $exists: false } },
      { $push: { savedPassengers: p } },
    );
    if (!result.modifiedCount)
      throw new HttpError(409, "You can save up to 20 passengers");
    res.status(201).json({ data: await profile(req.user!.id) });
  }),
);
router.delete(
  "/users/me/passengers/:id",
  requireUser,
  asyncRoute(async (req, res) => {
    const target = id.parse(req.params.id);
    const result = await User.updateOne(
      { _id: req.user!.id },
      { $pull: { savedPassengers: { _id: target } } },
    );
    if (!result.modifiedCount)
      throw new HttpError(404, "Passenger was not found");
    res.json({ data: await profile(req.user!.id) });
  }),
);
router.post(
  "/users/me/favorites",
  requireUser,
  asyncRoute(async (req, res) => {
    const pair = validPair.parse(req.body);
    const result = await User.updateOne(
      {
        _id: req.user!.id,
        $or: [
          { "favoriteRoutes.29": { $exists: false } },
          { favoriteRoutes: { $elemMatch: pair } },
        ],
      },
      { $addToSet: { favoriteRoutes: pair } },
    );
    if (!result.matchedCount)
      throw new HttpError(409, "You can save up to 30 routes");
    res.json({ data: await profile(req.user!.id) });
  }),
);
router.delete(
  "/users/me/favorites",
  requireUser,
  asyncRoute(async (req, res) => {
    const pair = validPair.parse(req.body);
    await User.updateOne(
      { _id: req.user!.id },
      { $pull: { favoriteRoutes: pair } },
    );
    res.json({ data: await profile(req.user!.id) });
  }),
);
router.post(
  "/users/me/history",
  requireUser,
  asyncRoute(async (req, res) => {
    const search = searchEntrySchema.parse(req.body);
    const item = { $literal: search };
    await User.updateOne({ _id: req.user!.id }, [
      {
        $set: {
          searchHistory: {
            $slice: [
              {
                $concatArrays: [
                  [item],
                  {
                    $filter: {
                      input: { $ifNull: ["$searchHistory", []] },
                      as: "entry",
                      cond: { $ne: ["$$entry", item] },
                    },
                  },
                ],
              },
              10,
            ],
          },
        },
      },
    ]);
    res.json({ data: { success: true } });
  }),
);
router.get(
  "/users/me/notifications",
  requireUser,
  asyncRoute(async (req, res) => {
    const { limit, page } = paging.parse(req.query);
    const data = await Notification.find({ userId: req.user!.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    res.json({ data, pagination: { limit, page } });
  }),
);
router.patch(
  "/users/me/notifications/:id",
  requireUser,
  asyncRoute(async (req, res) => {
    const data = await Notification.findOneAndUpdate(
      { _id: id.parse(req.params.id), userId: req.user!.id },
      { read: true },
      { new: true },
    ).lean();
    if (!data) throw new HttpError(404, "Notification was not found");
    res.json({ data });
  }),
);
router.post(
  "/support",
  requireUser,
  asyncRoute(async (req, res) => {
    const message = supportSchema.parse(req.body);
    const ticket = await SupportTicket.create({
      ...message,
      userId: req.user!.id,
    });
    res.status(201).json({ data: ticket });
  }),
);
router.get(
  "/support",
  requireUser,
  asyncRoute(async (req, res) => {
    const { limit, page } = paging.parse(req.query);
    const data = await SupportTicket.find({ userId: req.user!.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    res.json({ data, pagination: { page, limit } });
  }),
);
export default router;
