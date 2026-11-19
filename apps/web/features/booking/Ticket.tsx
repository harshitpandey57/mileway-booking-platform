"use client";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BusFront,
  Check,
  CheckCircle2,
  Download,
  Printer,
  QrCode,
  Star,
  Ticket as TicketIcon,
} from "lucide-react";
import { api, apiUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  AlertBox,
  Back,
  DateTag,
  Empty,
  Loading,
  LoginPrompt,
  RouteName,
  TripLine,
} from "./common";
import { Booking, dateText, inr, post, timeText, tripHref } from "./model";

export const paymentText = {
  paid: "Paid",
  failed: "Failed",
  unpaid: "Unpaid",
  refund_simulated: "Simulated refund",
};
function CancelBooking({
  b,
  onChange,
}: {
  b: Booking;
  onChange: (b: Booking) => void;
}) {
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  if (b.status !== "pending" && b.status !== "confirmed") return null;
  const cutoff = new Date(
    Date.parse(b.departureAt) - b.cancellationHours * 3600000,
  );
  return (
    <section className="bk-box bk-padding bk-interactive">
      <h2 className="bk-card-heading">Cancellation</h2>
      <p className="bk-muted">
        {b.status === "pending"
          ? "Cancel to release your held seats."
          : b.refundPercent +
            "% simulated refund for cancellations by " +
            timeText(cutoff.toISOString()) +
            " IST on " +
            dateText(cutoff.toISOString()) +
            "."}
      </p>
      {b.status === "confirmed" && Date.now() > +cutoff ? (
        <p className="bk-muted">The cancellation window has closed.</p>
      ) : confirm ? (
        <div className="bk-cancel-confirm">
          <p>
            {b.status === "confirmed"
              ? "Cancelling will release seats " +
                b.seats.join(", ") +
                " and record a simulated refund of " +
                inr(Math.round((b.total * b.refundPercent) / 100)) +
                "."
              : "Release these seats and cancel this booking?"}
          </p>
          <div className="bk-actions">
            <button
              disabled={busy}
              className="bk-danger"
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  onChange(
                    await api<Booking>(
                      "/bookings/" + b._id + "/cancel",
                      post({}),
                    ),
                  );
                  setConfirm(false);
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Cancelling…" : "Confirm cancellation"}
            </button>
            <button
              className="bk-secondary"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Keep booking
            </button>
          </div>
        </div>
      ) : (
        <button
          className="bk-link bk-negative"
          onClick={() => setConfirm(true)}
        >
          Cancel booking
        </button>
      )}
      <AlertBox error={error} />
    </section>
  );
}
function LeaveReview({ b }: { b: Booking }) {
  const [rating, setRating] = useState(5),
    [comment, setComment] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  if (b.status !== "confirmed" || Date.now() < Date.parse(b.arrivalAt))
    return null;
  return (
    <section className="bk-box bk-padding bk-interactive">
      <h2 className="bk-card-heading">
        <Star size={18} />
        Review your journey
      </h2>
      {done ? (
        <div className="bk-notice">
          <Check size={15} />
          Review submitted.
        </div>
      ) : (
        <form
          className="bk-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setBusy(true);
            try {
              await api(
                "/reviews",
                post({ bookingId: b._id, rating, comment: comment.trim() }),
              );
              setDone(true);
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Rating
            <select
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
            >
              {[5, 4, 3, 2, 1].map((s) => (
                <option value={s} key={s}>
                  {s} stars
                </option>
              ))}
            </select>
          </label>
          <label>
            Your experience
            <textarea
              rows={3}
              value={comment}
              maxLength={500}
              minLength={3}
              required
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          <AlertBox error={error} />
          <button className="bk-secondary" disabled={busy}>
            Submit review
          </button>
        </form>
      )}
    </section>
  );
}
export default function Ticket() {
  const params = useSearchParams(),
    id = params.get("id") || "",
    { user, loading } = useAuth(),
    qc = useQueryClient();
  const query = useQuery({
    queryKey: ["booking", id],
    queryFn: () => api<Booking>("/bookings/" + encodeURIComponent(id)),
    enabled: !!(user && id),
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 8000 : false),
  });
  const b = query.data;
  if (loading)
    return (
      <main className="bk-shell">
        <Loading />
      </main>
    );
  if (!user)
    return (
      <main className="bk-shell">
        <LoginPrompt next={"/ticket/?" + params.toString()} />
      </main>
    );
  if (!id)
    return (
      <main className="bk-shell">
        <Empty
          title="Select a booking"
          href="/bookings/"
          action="My bookings"
        />
      </main>
    );
  if (query.isPending)
    return (
      <main className="bk-shell">
        <Loading />
      </main>
    );
  if (query.error || !b)
    return (
      <main className="bk-shell">
        <AlertBox error={query.error} />
        <Back href="/bookings/">My bookings</Back>
      </main>
    );
  return (
    <main className="bk-shell">
      <div className="bk-interactive">
        <Back href="/bookings/">My bookings</Back>
      </div>
      <div className="bk-heading">
        <div>
          {b.status === "confirmed" && (
            <span className="bk-confirmed">
              <CheckCircle2 size={17} />
              Payment verified
            </span>
          )}
          <h1>
            {b.status === "confirmed"
              ? "Booking confirmed"
              : b.status === "expired"
                ? "Booking expired"
                : b.status === "cancelled"
                  ? "Booking cancelled"
                  : "Awaiting payment"}
          </h1>
          <p>Test booking · Fictional bus service</p>
        </div>
        <div className="bk-actions bk-interactive">
          {b.status === "confirmed" && (
            <>
              <button onClick={() => window.print()} className="bk-secondary">
                <Printer size={16} />
                Print
              </button>
              <a
                href={apiUrl("/tickets/" + id + "/pdf")}
                className="bk-primary"
                download
              >
                <Download size={16} />
                Download PDF
              </a>
            </>
          )}
        </div>
      </div>
      <div className="bk-book-grid">
        <div className="bk-stack">
          <article className="bk-box bk-ticket-card">
            <header className="bk-ticket-header">
              <div>
                <TicketIcon size={20} />
                <b>Mileway</b>
              </div>
              <span>Demo e-ticket</span>
            </header>
            <div className="bk-padding">
              <DateTag date={b.date} />
              <h2 className="bk-ticket-route">
                <RouteName {...b} />
              </h2>
              <p className="bk-muted">
                {b.operatorName} · {b.busName}
              </p>
              <TripLine {...b} />
              <dl className="bk-list">
                <div>
                  <dt>Boarding point</dt>
                  <dd>{b.boardingPoint}</dd>
                </div>
                <div>
                  <dt>Dropping point</dt>
                  <dd>{b.droppingPoint}</dd>
                </div>
              </dl>
            </div>
            <div className="bk-ticket-stub">
              <div>
                <small>Booking reference</small>
                <strong>{b.reference}</strong>
              </div>
              <span className={"bk-status status-" + b.status}>{b.status}</span>
            </div>
          </article>
          <section className="bk-box bk-padding">
            <h2 className="bk-card-heading">Passengers</h2>
            <dl className="bk-list">
              {b.passengers.map((p) => (
                <div key={p.seat}>
                  <dt>
                    <b>{p.name}</b> · Age {p.age}
                  </dt>
                  <dd>Seat {p.seat}</dd>
                </div>
              ))}
            </dl>
          </section>
          <LeaveReview b={b} />
        </div>
        <aside className="bk-stack">
          <section className="bk-box bk-summary">
            <div className="bk-summary-top">
              <BusFront size={19} />
              <h2>Fare details</h2>
            </div>
            <dl className="bk-list">
              <div>
                <dt>Seat subtotal</dt>
                <dd>{inr(b.subtotal)}</dd>
              </div>
              {b.discount > 0 && (
                <div>
                  <dt>Coupon · {b.couponCode}</dt>
                  <dd>−{inr(b.discount)}</dd>
                </div>
              )}
              <div>
                <dt>Payment status</dt>
                <dd>{paymentText[b.paymentStatus]}</dd>
              </div>
              {b.paymentMode && (
                <div>
                  <dt>Payment method</dt>
                  <dd>
                    {b.paymentMode === "coupon"
                      ? "Covered by coupon"
                      : b.paymentMode === "demo"
                        ? "Demo simulation"
                        : "Razorpay Test"}
                  </dd>
                </div>
              )}
              {b.paymentStatus === "refund_simulated" && (
                <div>
                  <dt>Simulated refund</dt>
                  <dd>{inr(b.refundAmount)}</dd>
                </div>
              )}
            </dl>
            <div className="bk-total">
              <span>Booking total</span>
              <strong>{inr(b.total)}</strong>
            </div>
            {b.status === "pending" && (
              <Link
                href={"/checkout/?booking=" + id}
                className="bk-primary bk-full"
              >
                Continue to payment
                <ArrowRight size={15} />
              </Link>
            )}
            {b.status === "confirmed" && (
              <Link
                href={
                  "/verify/?token=" + encodeURIComponent(b.verificationToken)
                }
                className="bk-secondary bk-full bk-interactive"
              >
                <QrCode size={15} />
                Verify ticket
              </Link>
            )}
            {(b.status === "expired" || b.status === "cancelled") && (
              <Link href={tripHref(b.tripId)} className="bk-secondary bk-full">
                Check seat availability
              </Link>
            )}
          </section>
          <CancelBooking
            b={b}
            onChange={(updated) => {
              qc.setQueryData(["booking", id], updated);
              void qc.invalidateQueries({ queryKey: ["my-bookings"] });
            }}
          />
        </aside>
      </div>
    </main>
  );
}
