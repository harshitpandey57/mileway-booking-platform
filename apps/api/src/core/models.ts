import { Schema, model } from "mongoose";

const savedPassenger = new Schema({
  name: { type: String, required: true, maxlength: 100 },
  age: { type: Number, required: true, min: 1, max: 120 },
});
const routePair = new Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
  },
  { _id: false },
);
const recentSearch = new Schema(
  { from: String, to: String, date: String },
  { _id: false },
);
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["customer", "operator", "admin"],
      default: "customer",
      required: true,
    },
    phone: { type: String, default: "" },
    active: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },
    resetTokenHash: { type: String, select: false },
    resetExpiresAt: { type: Date, select: false },
    savedPassengers: { type: [savedPassenger], default: [] },
    favoriteRoutes: { type: [routePair], default: [] },
    searchHistory: { type: [recentSearch], default: [] },
  },
  { timestamps: true },
);
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ resetTokenHash: 1 }, { unique: true, sparse: true });

const supportSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subject: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 3000 },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved"],
      default: "open",
    },
    reply: { type: String, default: "", maxlength: 3000 },
  },
  { timestamps: true },
);
supportSchema.index({ userId: 1, createdAt: -1 });
supportSchema.index({ status: 1, createdAt: -1 });

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, maxlength: 160 },
    message: { type: String, required: true, maxlength: 2500 },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);
notificationSchema.index({ userId: 1, createdAt: -1 });

const auditSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: String,
  },
  { timestamps: true },
);
auditSchema.index({ actorId: 1, createdAt: -1 });
export const User = model("User", userSchema);
export const SupportTicket = model("SupportTicket", supportSchema);
export const Notification = model("Notification", notificationSchema);
export const AuditLog = model("AuditLog", auditSchema);
