"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Ticket,
} from "lucide-react";
import { dateText, errorText, localDay, timeText } from "./model";

export function AlertBox({ error }: { error: unknown }) {
  return error ? (
    <div className="bk-alert" role="alert">
      <CircleAlert size={17} />
      <span>{errorText(error)}</span>
    </div>
  ) : null;
}
export function SectionCrumb({ label }: { label: string }) {
  return (
    <nav aria-label="Breadcrumb" className="bk-crumb">
      <Link href="/">Home</Link>
      <ChevronRight size={13} />
      <span>{label}</span>
    </nav>
  );
}
export function Empty({
  title,
  children,
  href,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  href?: string;
  action?: string;
}) {
  return (
    <div className="bk-empty">
      <Ticket size={28} />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {href && (
        <Link href={href} className="bk-primary">
          {action}
          <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function Loading() {
  return (
    <div className="bk-loading" role="status" aria-label="Loading">
      <span />
      <span />
      <span />
    </div>
  );
}
export function LoginPrompt({ next }: { next: string }) {
  return (
    <Empty
      title="Sign in to continue"
      href={"/login/?next=" + encodeURIComponent(next)}
      action="Sign in"
    >
      Your account keeps your passenger details and tickets together.
    </Empty>
  );
}
export function TripLine({
  from,
  to,
  departureAt,
  arrivalAt,
}: {
  from: string;
  to: string;
  departureAt: string;
  arrivalAt: string;
}) {
  const arrivalDay =
    localDay(new Date(arrivalAt)) !== localDay(new Date(departureAt));
  return (
    <div className="bk-timeline">
      <div>
        <strong>{timeText(departureAt)}</strong>
        <small>{from}</small>
      </div>
      <div className="bk-line">
        <i />
        <span />
        <i />
      </div>
      <div>
        <strong>
          {timeText(arrivalAt)}
          {arrivalDay && <sup>+1</sup>}
        </strong>
        <small>{to}</small>
      </div>
    </div>
  );
}
export function RouteName({ from, to }: { from: string; to: string }) {
  return (
    <span className="bk-route-name">
      {from} <ArrowRight aria-label="to" /> {to}
    </span>
  );
}
export function DateTag({ date }: { date: string }) {
  return (
    <span className="bk-date-tag">
      <CalendarDays size={15} />
      {dateText(date)}
    </span>
  );
}
export function Back({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="bk-back">
      <ArrowLeft size={15} />
      {children}
    </Link>
  );
}
export function Steps({ stage }: { stage: number }) {
  return (
    <ol className="bk-steps" aria-label="Booking progress">
      {["Seats", "Passengers", "Payment", "Ticket"].map((s, i) => (
        <li
          key={s}
          aria-current={stage === i ? "step" : undefined}
          data-state={stage === i ? "now" : stage > i ? "done" : "later"}
        >
          <span>{stage > i ? <Check size={13} /> : i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}
export function useSeconds(expiry?: string) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!expiry) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiry]);
  return expiry ? Math.max(0, Math.ceil((Date.parse(expiry) - now) / 1000)) : 0;
}
export function HoldClock({ seconds }: { seconds: number }) {
  return (
    <div className={"bk-hold-clock" + (seconds < 60 ? " bk-hurry" : "")}>
      <Clock3 size={17} />
      {seconds > 0
        ? "Seats held for " +
          Math.floor(seconds / 60) +
          ":" +
          String(seconds % 60).padStart(2, "0")
        : "Seat hold expired"}
    </div>
  );
}
