"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Armchair,
  BusFront,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  LifeBuoy,
  Minus,
  Mountain,
  Palmtree,
  Plus,
  ShieldCheck,
  Star,
  TicketPercent,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import JourneySearch, { journeyDate, searchHref } from "./JourneySearch";
import styles from "./Home.module.css";

type PopularRoute = {
  _id: string;
  from: string;
  to: string;
  minFare: number;
  durationMinutes: number;
  distanceKm: number;
};
type Offer = {
  code: string;
  description: string;
  percent: number;
  maxDiscount: number;
  minFare: number;
  expiresAt: string;
};
type Operator = {
  _id: string;
  name: string;
  rating: number;
  description: string;
};
type Review = {
  _id: string;
  displayName: string;
  rating: number;
  comment: string;
  isSeeded: boolean;
};
const destinations: Record<string, string> = {
  Chennai: "chennai",
  Pune: "pune",
  Vijayawada: "vijayawada",
  Jaipur: "jaipur",
};
const artDescriptions: Record<string, string> = {
  Chennai: "Temple towers and palms in Chennai",
  Pune: "A hillside fort near Pune",
  Vijayawada: "A bridge over the Krishna River at Vijayawada",
  Jaipur: "The pink façade of Hawa Mahal in Jaipur",
};
const faqs = [
  [
    "How do I book a bus ticket?",
    "Search by city and travel date, choose a bus, and select your seats. Sign in to hold them, add your passenger details, and complete the test payment. Your ticket will appear in My bookings.",
  ],
  [
    "Can I choose my own seat?",
    "Yes. Open the seat map for a trip to see available seats and prices. Sleeper buses can have upper and lower berths. Selected seats are held for a limited time during checkout.",
  ],
  [
    "Where can I find my ticket?",
    "Sign in and open My bookings. Select a confirmed booking to view, print, or download your ticket with its verification QR code.",
  ],
  [
    "Can I cancel a booking?",
    "Open the booking details to check the operator’s cancellation window and refund amount. Eligible confirmed tickets can be cancelled from that page. Refunds in this demo are simulated.",
  ],
  [
    "Are these real travel reservations?",
    "Mileway is a working demonstration with fictional operators and inventory. Payments use Razorpay Test Mode or a clearly labelled demo payment. Tickets are for testing only.",
  ],
];
function rupees(value: number) {
  return "₹" + value.toLocaleString("en-IN");
}
function duration(minutes: number) {
  const total = Math.round(minutes);
  return [
    Math.floor(total / 60) ? Math.floor(total / 60) + "h" : "",
    total % 60 ? (total % 60) + "m" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
function Feedback({
  error,
  pending,
  retry,
  empty,
}: {
  error: boolean;
  pending: boolean;
  retry: () => void;
  empty: string;
}) {
  if (pending)
    return (
      <div className={styles.loading} role="status" aria-label="Loading">
        <span />
        <span />
        <span />
      </div>
    );
  return (
    <div className={styles.feedback}>
      {error ? (
        <>
          Unable to load this section.{" "}
          <button onClick={retry} type="button">
            Try again
          </button>
        </>
      ) : (
        empty
      )}
    </div>
  );
}
function PopularRoutes({ date }: { date: string }) {
  const routes = useQuery({
    queryKey: ["routes", "popular"],
    queryFn: () => api<PopularRoute[]>("/routes/popular"),
  });
  const [expanded, setExpanded] = useState(false);
  const items = routes.data || [];
  return (
    <section
      className={styles.section}
      aria-labelledby="popular-title"
      id="popular"
    >
      <div className={styles.sectionHead}>
        <div>
          <h2 id="popular-title">Popular routes</h2>
          <p>Explore some of India’s most-travelled bus routes.</p>
        </div>
        {items.length > 4 && (
          <button
            type="button"
            className={styles.textButton}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show fewer" : "More routes"}
            {expanded ? <ArrowUp size={16} /> : <ArrowRight size={16} />}
          </button>
        )}
      </div>
      {items.length ? (
        <div className={styles.routes}>
          {items.slice(0, expanded ? undefined : 4).map((route) => (
            <Link
              href={searchHref(route.from, route.to, date)}
              className={styles.routeCard}
              key={route._id}
            >
              <span
                className={styles.routeArt}
                role="img"
                aria-label={
                  artDescriptions[route.to] ||
                  "Illustrated intercity bus journey"
                }
                style={{
                  backgroundImage:
                    "url(/illustrations/" +
                    (destinations[route.to] || "western-ghats") +
                    ".svg)",
                }}
              />
              <div className={styles.routeDetails}>
                <h3>
                  {route.from}
                  <ArrowRight size={14} aria-hidden="true" />
                  {route.to}
                </h3>
                <div className={styles.routeMeta}>
                  <span>
                    <Clock3 size={13} />
                    {duration(route.durationMinutes)}
                  </span>
                  <span className={styles.metaDot}>·</span>
                  <span>
                    From <b>{rupees(route.minFare)}</b>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Feedback
          error={routes.isError}
          pending={routes.isPending}
          retry={() => void routes.refetch()}
          empty="No upcoming routes are available."
        />
      )}
    </section>
  );
}
function Offers() {
  const coupons = useQuery({
    queryKey: ["coupons", "home"],
    queryFn: () => api<Offer[]>("/coupons"),
  });
  const [copied, setCopied] = useState("");
  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      toast.success("Coupon " + code + " copied.");
    } catch {
      toast.info("Use " + code + " in the coupon field at checkout.");
    }
  }
  return (
    <section className={styles.section} aria-labelledby="offers-title">
      <div className={styles.sectionHead}>
        <div>
          <h2 id="offers-title">Offers for your journey</h2>
          <p>Use a coupon at checkout to save on your fare.</p>
        </div>
      </div>
      {coupons.data?.length ? (
        <div className={styles.offers}>
          {coupons.data.slice(0, 3).map((offer) => (
            <article key={offer.code} className={styles.offer}>
              <div className={styles.offerHeading}>
                <span className={styles.couponIcon}>
                  <TicketPercent size={21} />
                </span>
                <h3>{offer.percent}% off bus fares</h3>
              </div>
              <p>{offer.description}</p>
              <small>
                Up to {rupees(offer.maxDiscount)} on fares of{" "}
                {rupees(offer.minFare)} or more
              </small>
              <button
                className={styles.copy}
                type="button"
                aria-label={"Copy coupon " + offer.code}
                onClick={() => void copy(offer.code)}
              >
                {offer.code}
                {copied === offer.code ? (
                  <Check size={14} />
                ) : (
                  <Copy size={14} />
                )}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Feedback
          error={coupons.isError}
          pending={coupons.isPending}
          retry={() => void coupons.refetch()}
          empty="There are no active offers today."
        />
      )}
    </section>
  );
}
function OperatorDetails({ operator }: { operator: Operator }) {
  const reviews = useQuery({
    queryKey: ["reviews", operator._id],
    queryFn: () => api<Review[]>("/reviews?limit=2&operatorId=" + operator._id),
  });
  return (
    <div className={styles.operatorDetails}>
      <p>{operator.description}</p>
      {reviews.data?.map((review) => (
        <p key={review._id}>
          <strong>
            {review.displayName} · {review.rating}/5
          </strong>
          {review.isSeeded && <small> · Demo review</small>}
          <br />
          {review.comment}
        </p>
      ))}
      {!reviews.data?.length && (
        <Feedback
          error={reviews.isError}
          pending={reviews.isPending}
          retry={() => void reviews.refetch()}
          empty="No reviews yet."
        />
      )}
    </div>
  );
}
function Operators() {
  const operators = useQuery({
    queryKey: ["operators", "featured"],
    queryFn: () => api<Operator[]>("/operators?limit=3"),
  });
  const [open, setOpen] = useState("");
  const icons = [Mountain, BusFront, Palmtree];
  return (
    <section className={styles.section} aria-labelledby="operators-title">
      <div className={styles.sectionHead}>
        <div>
          <h2 id="operators-title">Featured operators</h2>
          <p>Meet the fictional bus operators in our demo network.</p>
        </div>
      </div>
      {operators.data?.length ? (
        <div className={styles.operators}>
          {operators.data.map((operator, index) => {
            const Icon = icons[index % icons.length];
            return (
              <article className={styles.operator} key={operator._id}>
                <button
                  type="button"
                  aria-expanded={open === operator._id}
                  onClick={() =>
                    setOpen(open === operator._id ? "" : operator._id)
                  }
                >
                  <span className={styles.operatorIcon}>
                    <Icon size={23} />
                  </span>
                  <span className={styles.operatorName}>
                    {operator.name}
                    <small>
                      <Star size={12} fill="currentColor" />
                      {operator.rating.toFixed(1)} · Operator rating
                    </small>
                  </span>
                  <ChevronDown size={16} />
                </button>
                {open === operator._id && (
                  <OperatorDetails operator={operator} />
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Feedback
          error={operators.isError}
          pending={operators.isPending}
          retry={() => void operators.refetch()}
          empty="No operators are currently listed."
        />
      )}
    </section>
  );
}
function Faq() {
  const [open, setOpen] = useState(-1);
  return (
    <section className={styles.faq} aria-labelledby="faq-title">
      <div className={styles.faqHeading}>
        <CircleHelp size={26} />
        <h2 id="faq-title">Frequently asked questions</h2>
        <Link href="/help/">
          Visit the help centre <ArrowUpRight size={15} />
        </Link>
      </div>
      <div>
        {faqs.map(([question, answer], index) => (
          <div className={styles.question} key={question}>
            <h3>
              <button
                type="button"
                aria-expanded={open === index}
                aria-controls={"answer-" + index}
                onClick={() => setOpen(open === index ? -1 : index)}
              >
                {question}
                {open === index ? <Minus size={18} /> : <Plus size={18} />}
              </button>
            </h3>
            <p id={"answer-" + index} hidden={open !== index}>
              {answer}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
export default function HomePage() {
  const [date, setDate] = useState("");
  useEffect(() => {
    setDate(journeyDate(1));
  }, []);
  return (
    <main className={styles.home}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroInner}>
          <div className={styles.eyebrow}>
            <span />
            Intercity bus travel
          </div>
          <h1 id="hero-title">
            The road is <em>calling.</em>
          </h1>
          <p>
            Find intercity buses across India, compare fares,
            <br className={styles.desktopBreak} /> and choose your perfect seat.
          </p>
        </div>
      </section>
      <div className={styles.container}>
        <JourneySearch date={date} setDate={setDate} />
        <PopularRoutes date={date} />
        <Offers />
        <Operators />
        <section className={styles.benefits} aria-label="Travel benefits">
          <div>
            <Armchair />
            <span>
              <strong>Pick your seat</strong>
              <small>Compare seats and sleeper berths.</small>
            </span>
          </div>
          <div>
            <ShieldCheck />
            <span>
              <strong>Clear fares</strong>
              <small>See your total before you pay.</small>
            </span>
          </div>
          <div>
            <LifeBuoy />
            <span>
              <strong>Booking support</strong>
              <small>Get help with tickets and cancellations.</small>
            </span>
          </div>
        </section>
        <Faq />
      </div>
    </main>
  );
}
