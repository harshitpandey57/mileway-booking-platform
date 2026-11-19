"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Route, Ticket } from "lucide-react";
import "./account.css";

export type SavedPassenger = { _id: string; name: string; age: number };
export type RoutePair = { from: string; to: string };
export type Profile = {
  _id: string;
  name: string;
  email: string;
  role: string;
  phone: string;
  savedPassengers: SavedPassenger[];
  favoriteRoutes: RoutePair[];
  searchHistory: (RoutePair & { date: string })[];
};
export const json = (method: string, value?: unknown): RequestInit => ({
  method,
  ...(value !== undefined
    ? {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      }
    : {}),
});
export const errorMessage = (err: unknown) =>
  err instanceof Error
    ? err.message
    : "Something went wrong. Please try again.";
export function Notice({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return message ? (
    <p
      role={error ? "alert" : "status"}
      className={error ? "ac-alert ac-alert-error" : "ac-alert"}
    >
      {message}
    </p>
  ) : null;
}
export function Trail({ current }: { current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="ac-trail">
      <Link href="/">Home</Link>
      <ChevronRight size={13} aria-hidden />
      {current}
    </nav>
  );
}
export function Heading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="ac-heading">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}
export function SignInGate({
  next,
  title = "Sign in to your account",
}: {
  next: string;
  title?: string;
}) {
  return (
    <section className="ac-card ac-gate">
      <div className="ac-icon">
        <Ticket size={25} />
      </div>
      <h2>{title}</h2>
      <p>Access your bookings, saved travellers and account details.</p>
      <Link
        className="ac-primary"
        href={"/login/?next=" + encodeURIComponent(next)}
      >
        Sign in
      </Link>
    </section>
  );
}
export function TravelPanel() {
  return (
    <aside className="ac-travel">
      <div className="ac-panel-top">
        <Route size={27} /> Mileway
      </div>
      <div>
        <span className="ac-route-line" />
        <h2>
          Your journeys,
          <br />
          in one place.
        </h2>
        <p>Keep your tickets, travellers and favourite routes together.</p>
      </div>
      <svg viewBox="0 0 320 133" preserveAspectRatio="none" aria-hidden="true">
        <path
          fill="#5672db"
          d="M0 65 50 34 82 49 115 20 154 63 210 29 238 39 290 5 320 29v104H0Z"
        />
        <path
          fill="#344eae"
          d="m0 88 63-33 44 22 54-35 71 44 56-38 32 17v68H0Z"
        />
        <path fill="#263f96" d="m0 100 74-13 66 9 55-13 63-17 62 17v50H0Z" />
        <path
          d="M235 83c-94 13 62 9-21 22s-50 17-28 28"
          fill="none"
          stroke="#b3c5ff"
          strokeWidth="5"
        />
      </svg>
    </aside>
  );
}
export function AccountShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="ac-shell">
      <Trail current={title} />
      {children}
    </main>
  );
}
