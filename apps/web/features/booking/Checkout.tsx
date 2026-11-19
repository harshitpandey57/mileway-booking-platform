"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  Armchair,
  BusFront,
  Check,
  CreditCard,
  LockKeyhole,
  MapPin,
  Ticket,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  AlertBox,
  Back,
  DateTag,
  Empty,
  HoldClock,
  Loading,
  LoginPrompt,
  RouteName,
  Steps,
  TripLine,
  useSeconds,
} from "./common";
import {
  Booking,
  Hold,
  inr,
  PaymentOrder,
  post,
  ticketHref,
  Trip,
  tripHref,
} from "./model";

const schema = z.object({
  passengers: z.array(
    z.object({
      seat: z.string(),
      name: z.string().trim().min(2, "Enter at least 2 characters").max(80),
      age: z
        .number({ error: "Enter an age" })
        .int()
        .min(1, "Minimum age is 1")
        .max(120, "Maximum age is 120"),
    }),
  ),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d ()-]{10,19}$/, "Enter a valid contact number")
    .refine((s) => {
      const l = s.replace(/\D/g, "").length;
      return l >= 10 && l <= 15;
    }, "Use 10 to 15 digits"),
  email: z.string().trim().email("Enter a valid email address").max(254),
  boardingPoint: z.string().min(1, "Choose a boarding point"),
  droppingPoint: z.string().min(1, "Choose a dropping point"),
  couponCode: z.string().trim().max(40),
});
type FormValues = z.infer<typeof schema>;
type Profile = {
  email: string;
  phone?: string;
  savedPassengers?: { _id: string; name: string; age: number }[];
};
function FieldError({ msg }: { msg?: string }) {
  return msg ? (
    <small role="alert" className="bk-field-error">
      {msg}
    </small>
  ) : null;
}
function PassengerForm({
  hold,
  trip,
  profile,
}: {
  hold: Hold;
  trip: Trip;
  profile: Profile;
}) {
  const router = useRouter(),
    seconds = useSeconds(hold.expiresAt);
  const [error, setError] = useState<unknown>(null),
    [releasing, setReleasing] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      passengers: hold.seats.map((seat) => ({ seat, name: "" })),
      email: profile.email || "",
      phone: profile.phone || "",
      boardingPoint: "",
      droppingPoint: "",
      couponCode: "",
    },
  });
  const expired = seconds === 0;
  const release = async () => {
    setReleasing(true);
    setError(null);
    try {
      await api("/seat-holds/" + hold._id, { method: "DELETE" });
      router.push(tripHref(trip._id));
    } catch (e) {
      setError(e);
      setReleasing(false);
    }
  };
  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      const booking = await api<Booking>(
        "/bookings",
        post({ holdId: hold._id, ...values }),
      );
      router.replace("/checkout/?booking=" + encodeURIComponent(booking._id));
    } catch (e) {
      setError(e);
    }
  });
  return (
    <>
      <Steps stage={1} />
      <div className="bk-heading">
        <div>
          <h1>Passenger details</h1>
          <p>
            <RouteName {...trip} />
            <i className="bk-dot" />
            <DateTag date={trip.date} />
          </p>
        </div>
        <HoldClock seconds={seconds} />
      </div>
      {expired ? (
        <Empty
          title="Your seat hold has expired"
          href={tripHref(trip._id)}
          action="Choose seats again"
        >
          Live availability has been refreshed for this journey.
        </Empty>
      ) : (
        <form className="bk-book-grid" onSubmit={submit} noValidate>
          <div className="bk-stack">
            <section className="bk-box bk-padding">
              <h2 className="bk-card-heading">
                <UserRound size={19} />
                Passengers
              </h2>
              {hold.seats.map((seat, i) => (
                <fieldset className="bk-passenger" key={seat}>
                  <legend>
                    Passenger {i + 1} <span>Seat {seat}</span>
                  </legend>
                  {!!profile.savedPassengers?.length && (
                    <label className="bk-saved">
                      Saved passenger
                      <select
                        aria-label={"Choose saved passenger for seat " + seat}
                        defaultValue=""
                        onChange={(e) => {
                          const person = profile.savedPassengers?.find(
                            (s) => s._id === e.target.value,
                          );
                          if (person) {
                            setValue(`passengers.${i}.name`, person.name, {
                              shouldValidate: true,
                            });
                            setValue(`passengers.${i}.age`, person.age, {
                              shouldValidate: true,
                            });
                          }
                        }}
                      >
                        <option value="">Enter details manually</option>
                        {profile.savedPassengers.map((s) => (
                          <option key={s._id} value={s._id}>
                            {s.name}, {s.age}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="bk-fields">
                    <label>
                      Full name
                      <input
                        aria-label={"Passenger " + (i + 1) + " name"}
                        autoComplete="off"
                        maxLength={80}
                        {...register(`passengers.${i}.name`)}
                      />
                      <FieldError msg={errors.passengers?.[i]?.name?.message} />
                    </label>
                    <label>
                      Age
                      <input
                        aria-label={"Passenger " + (i + 1) + " age"}
                        type="number"
                        min="1"
                        max="120"
                        inputMode="numeric"
                        {...register(`passengers.${i}.age`, {
                          valueAsNumber: true,
                        })}
                      />
                      <FieldError msg={errors.passengers?.[i]?.age?.message} />
                    </label>
                  </div>
                </fieldset>
              ))}
            </section>
            <section className="bk-box bk-padding">
              <h2 className="bk-card-heading">
                <MapPin size={19} />
                Boarding and dropping
              </h2>
              <div className="bk-fields">
                <label>
                  Boarding point
                  <select {...register("boardingPoint")}>
                    <option value="">Select boarding point</option>
                    {trip.boardingPoints.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <FieldError msg={errors.boardingPoint?.message} />
                </label>
                <label>
                  Dropping point
                  <select {...register("droppingPoint")}>
                    <option value="">Select dropping point</option>
                    {trip.droppingPoints.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <FieldError msg={errors.droppingPoint?.message} />
                </label>
              </div>
            </section>
            <section className="bk-box bk-padding">
              <h2 className="bk-card-heading">
                <Ticket size={19} />
                Contact details
              </h2>
              <div className="bk-fields">
                <label>
                  Email address
                  <input
                    type="email"
                    autoComplete="email"
                    {...register("email")}
                  />
                  <FieldError msg={errors.email?.message} />
                </label>
                <label>
                  Mobile number
                  <input type="tel" autoComplete="tel" {...register("phone")} />
                  <FieldError msg={errors.phone?.message} />
                </label>
              </div>
            </section>
          </div>
          <aside className="bk-box bk-summary">
            <div className="bk-summary-top">
              <BusFront size={20} />
              <h2>{trip.operatorName}</h2>
            </div>
            <p className="bk-muted">
              {trip.busName} · {trip.busType}
            </p>
            <TripLine {...trip} />
            <hr />
            <dl className="bk-list">
              <div>
                <dt>Seats</dt>
                <dd>{hold.seats.join(", ")}</dd>
              </div>
              <div>
                <dt>Seat subtotal</dt>
                <dd>{inr(hold.subtotal)}</dd>
              </div>
            </dl>
            <label className="bk-coupon">
              Coupon code <span>(optional)</span>
              <input placeholder="Enter a code" {...register("couponCode")} />
              <FieldError msg={errors.couponCode?.message} />
            </label>
            <div className="bk-total">
              <span>Before discounts</span>
              <strong>{inr(hold.subtotal)}</strong>
            </div>
            <AlertBox error={error} />
            <button
              disabled={isSubmitting || releasing}
              className="bk-primary bk-full"
            >
              {isSubmitting ? "Checking fare…" : "Review booking"}
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="bk-link bk-center"
              disabled={isSubmitting || releasing}
              onClick={release}
            >
              Release seats and change selection
            </button>
          </aside>
        </form>
      )}
    </>
  );
}

type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type RazorpayInstance = {
  open: () => void;
  on: (event: string, fn: () => void) => void;
};
type RazorpayConstructor = new (
  options: Record<string, unknown>,
) => RazorpayInstance;
declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}
let checkoutScript: Promise<RazorpayConstructor> | undefined;
async function getGateway() {
  if (window.Razorpay) return window.Razorpay;
  if (!checkoutScript)
    checkoutScript = new Promise<RazorpayConstructor>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => {
        if (window.Razorpay) resolve(window.Razorpay);
        else {
          checkoutScript = undefined;
          reject(new Error("Checkout did not load. Please retry."));
        }
      };
      script.onerror = () => {
        checkoutScript = undefined;
        script.remove();
        reject(
          new Error(
            "Could not load Razorpay Checkout. Check your connection and retry.",
          ),
        );
      };
      document.head.appendChild(script);
    });
  return checkoutScript;
}
function Payment({ booking }: { booking: Booking }) {
  const router = useRouter(),
    qc = useQueryClient(),
    seconds = useSeconds(booking.expiresAt);
  const [demoOpen, setDemoOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [feedback, setFeedback] = useState("");
  const active = seconds > 0 && booking.status === "pending";
  const order = useQuery({
    queryKey: ["payment-order", booking._id],
    enabled: active,
    queryFn: () =>
      api<PaymentOrder>("/payments/order", post({ bookingId: booking._id })),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (booking.status === "confirmed" || order.data?.mode === "coupon")
      router.replace(ticketHref(booking._id));
  }, [booking.status, booking._id, order.data?.mode, router]);
  function update(b: Booking) {
    qc.setQueryData(["booking", b._id], b);
    if (b.status === "confirmed") router.replace(ticketHref(b._id));
  }
  async function demo(outcome: "success" | "failure" | "cancel") {
    setBusy(true);
    setError(null);
    try {
      const b = await api<Booking>(
        "/payments/demo",
        post({ bookingId: booking._id, outcome }),
      );
      update(b);
      setDemoOpen(false);
      if (outcome !== "success")
        setFeedback(
          outcome === "failure"
            ? "Simulated payment failed. You can retry while your seats are held."
            : "Payment cancelled. Your seats are held until the timer expires.",
        );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function launch() {
    if (!order.data || busy || order.data.mode === "coupon") return;
    setFeedback("");
    setError(null);
    if (order.data.mode === "demo") {
      setDemoOpen(true);
      return;
    }
    setBusy(true);
    try {
      const Gateway = await getGateway();
      let resolved = false,
        failed = false;
      const modal = new Gateway({
        key: order.data.keyId,
        order_id: order.data.orderId,
        amount: order.data.amount,
        currency: order.data.currency,
        name: "Mileway",
        description: "Test bus booking " + booking.reference,
        prefill: {
          email: booking.email,
          contact: booking.phone,
          name: booking.passengers[0]?.name,
        },
        theme: { color: "#224ee8" },
        handler: async (result: RazorpayResponse) => {
          resolved = true;
          try {
            update(
              await api<Booking>(
                "/payments/verify",
                post({ bookingId: booking._id, ...result }),
              ),
            );
          } catch (e) {
            setError(e);
            void qc.invalidateQueries({ queryKey: ["booking", booking._id] });
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: async () => {
            if (resolved) return;
            try {
              update(
                await api<Booking>(
                  "/payments/failure",
                  post({ bookingId: booking._id, cancelled: !failed }),
                ),
              );
              setFeedback(
                failed
                  ? "Test payment failed. You can try again."
                  : "Checkout closed. You can return to payment while the hold is active.",
              );
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          },
        },
      });
      modal.on("payment.failed", () => {
        failed = true;
      });
      modal.open();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }
  if (!active && booking.status !== "confirmed")
    return (
      <Empty
        title={
          booking.status === "cancelled"
            ? "Booking cancelled"
            : "Your seat hold has expired"
        }
        href={tripHref(booking.tripId)}
        action="Choose seats again"
      >
        You can start another booking using the current seat inventory.
      </Empty>
    );
  return (
    <>
      <Steps stage={2} />
      <div className="bk-heading">
        <div>
          <h1>Review and pay</h1>
          <p>Booking {booking.reference}</p>
        </div>
        <HoldClock seconds={seconds} />
      </div>
      <div className="bk-book-grid">
        <div className="bk-stack">
          <section className="bk-box bk-padding">
            <h2 className="bk-card-heading">
              <BusFront size={20} />
              <RouteName {...booking} />
            </h2>
            <DateTag date={booking.date} />
            <TripLine {...booking} />
            <dl className="bk-list">
              <div>
                <dt>Operator</dt>
                <dd>{booking.operatorName}</dd>
              </div>
              <div>
                <dt>Boarding</dt>
                <dd>{booking.boardingPoint}</dd>
              </div>
              <div>
                <dt>Dropping</dt>
                <dd>{booking.droppingPoint}</dd>
              </div>
            </dl>
          </section>
          <section className="bk-box bk-padding">
            <h2 className="bk-card-heading">
              <Armchair size={19} />
              Passengers
            </h2>
            <dl className="bk-list">
              {booking.passengers.map((p) => (
                <div key={p.seat}>
                  <dt>
                    {p.name}, {p.age}
                  </dt>
                  <dd>Seat {p.seat}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
        <aside className="bk-box bk-summary">
          <div className="bk-summary-top">
            <CreditCard size={20} />
            <h2>Payment summary</h2>
          </div>
          <dl className="bk-list">
            <div>
              <dt>Seat subtotal</dt>
              <dd>{inr(booking.subtotal)}</dd>
            </div>
            {booking.discount > 0 && (
              <div>
                <dt>{booking.couponCode} discount</dt>
                <dd>−{inr(booking.discount)}</dd>
              </div>
            )}
          </dl>
          <div className="bk-total">
            <span>Total payable</span>
            <strong>{inr(booking.total)}</strong>
          </div>
          <div className="bk-demo-note">
            <LockKeyhole size={16} />
            <span>
              Test booking with fictional inventory. No travel entitlement.
            </span>
          </div>
          <AlertBox error={error || order.error} />
          {feedback && (
            <p role="status" className="bk-notice">
              {feedback}
            </p>
          )}
          {order.error && (
            <button
              onClick={() => order.refetch()}
              className="bk-secondary bk-full"
            >
              Retry payment setup
            </button>
          )}
          {demoOpen ? (
            <section className="bk-demo-options">
              <h3>Simulated payment</h3>
              <p>Choose a test outcome. No money moves.</p>
              <button
                className="bk-primary bk-full"
                disabled={busy}
                onClick={() => demo("success")}
              >
                <Check size={16} />
                Simulate success
              </button>
              <button
                className="bk-secondary bk-full"
                disabled={busy}
                onClick={() => demo("failure")}
              >
                Simulate failure
              </button>
              <button
                className="bk-link bk-center"
                disabled={busy}
                onClick={() => demo("cancel")}
              >
                Cancel demo payment
              </button>
            </section>
          ) : (
            !order.error && (
              <button
                type="button"
                className="bk-primary bk-full"
                disabled={
                  !active || busy || !order.data || order.data.mode === "coupon"
                }
                onClick={launch}
              >
                {busy
                  ? "Waiting for payment…"
                  : !order.data
                    ? "Preparing payment…"
                    : order.data.mode === "coupon"
                      ? "Covered by coupon"
                      : order.data.mode === "demo"
                        ? "Pay with demo"
                        : "Pay with Razorpay Test"}
                <ArrowRight size={16} />
              </button>
            )
          )}
          <Link href={ticketHref(booking._id)} className="bk-link bk-center">
            View booking details
          </Link>
        </aside>
      </div>
    </>
  );
}
export default function Checkout() {
  const params = useSearchParams(),
    holdId = params.get("hold") || "",
    bookingId = params.get("booking") || "",
    { user, loading } = useAuth();
  const hold = useQuery({
    queryKey: ["hold", holdId],
    queryFn: () => api<Hold>("/seat-holds/" + encodeURIComponent(holdId)),
    enabled: !!(user && holdId && !bookingId),
  });
  const trip = useQuery({
    queryKey: ["trip", hold.data?.tripId],
    queryFn: () => api<Trip>("/trips/" + hold.data!.tripId),
    enabled: !!(user && hold.data?.tripId && !bookingId),
  });
  const booking = useQuery({
    queryKey: ["booking", bookingId],
    queryFn: () => api<Booking>("/bookings/" + encodeURIComponent(bookingId)),
    enabled: !!(user && bookingId),
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 5000 : false),
  });
  const profile = useQuery({
    queryKey: ["checkout-profile", user?.email],
    queryFn: () => api<Profile>("/users/me"),
    enabled: !!(user && holdId && !bookingId),
  });
  const error = booking.error || hold.error || trip.error;
  return (
    <main className="bk-shell">
      {loading ? (
        <Loading />
      ) : !user ? (
        <LoginPrompt next={"/checkout/?" + params.toString()} />
      ) : !holdId && !bookingId ? (
        <Empty
          title="Start by selecting your seats"
          href="/"
          action="Find buses"
        />
      ) : error ? (
        <>
          <AlertBox error={error} />
          <Back href="/bookings/">My bookings</Back>
        </>
      ) : bookingId ? (
        booking.data ? (
          <Payment booking={booking.data} />
        ) : (
          <Loading />
        )
      ) : hold.data && trip.data && !profile.isPending ? (
        <PassengerForm
          key={hold.data._id}
          hold={hold.data}
          trip={trip.data}
          profile={profile.data || { email: user.email }}
        />
      ) : (
        <Loading />
      )}
    </main>
  );
}
