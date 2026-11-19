"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Armchair,
  ArrowRight,
  BusFront,
  ChevronRight,
  CircleGauge,
  Info,
  ShieldCheck,
  Star,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  AlertBox,
  Back,
  DateTag,
  Empty,
  Loading,
  RouteName,
  Steps,
  TripLine,
} from "./common";
import { durationText, Hold, inr, post, Seat, Trip, tripHref } from "./model";

export default function Seats() {
  const p = useSearchParams(),
    id = p.get("id") || "",
    router = useRouter(),
    { user, loading } = useAuth();
  const [chosen, setChosen] = useState<string[]>(
    () => p.get("seats")?.split(",").filter(Boolean) || [],
  );
  const [deck, setDeck] = useState<"lower" | "upper">("lower"),
    [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>(null);
  const trip = useQuery({
    queryKey: ["trip", id],
    queryFn: () => api<Trip>("/trips/" + encodeURIComponent(id)),
    enabled: !!id,
  });
  const inventory = useQuery({
    queryKey: ["seats", id],
    queryFn: () =>
      api<{ seats: Seat[] }>("/trips/" + encodeURIComponent(id) + "/seats"),
    enabled: !!id,
    refetchInterval: 12000,
  });
  if (!id)
    return (
      <main className="bk-shell">
        <Empty title="Choose a journey first" href="/" action="Search buses" />
      </main>
    );
  if (trip.isPending || inventory.isPending)
    return (
      <main className="bk-shell">
        <Loading />
      </main>
    );
  if (trip.error || inventory.error || !trip.data || !inventory.data)
    return (
      <main className="bk-shell">
        <AlertBox error={trip.error || inventory.error} />
        <Back href="/">New search</Back>
      </main>
    );
  const t = trip.data,
    seats = inventory.data.seats,
    selected = seats.filter(
      (s) => chosen.includes(s.number) && s.status === "available",
    ),
    subtotal = selected.reduce((a, s) => a + s.price, 0);
  const filtered = seats.filter((s) => s.deck === deck);
  const cols = Array.from(new Set(filtered.map((s) => s.col))).sort(
    (a, b) => a - b,
  );
  const rows = Array.from(new Set(filtered.map((s) => s.row))).sort(
    (a, b) => a - b,
  );
  const aisleAfter = filtered[0]?.kind === "sleeper" ? 1 : 2;
  const gridCols = cols
    .map((_, i) => (i + 1 === aisleAfter ? "1fr .5fr" : "1fr"))
    .join(" ");
  async function proceed() {
    if (!selected.length || !t) return;
    if (!user) {
      const path =
        tripHref(id) +
        "&seats=" +
        encodeURIComponent(selected.map((s) => s.number).join(","));
      router.push("/login/?next=" + encodeURIComponent(path));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const hold = await api<Hold>(
        "/seat-holds",
        post({ tripId: id, seats: selected.map((s) => s.number) }),
      );
      router.push("/checkout/?hold=" + encodeURIComponent(hold._id));
    } catch (e) {
      setError(e);
      await inventory.refetch();
      setPending(false);
    }
  }
  return (
    <main className="bk-shell">
      <Back
        href={
          "/search/?" +
          new URLSearchParams({ from: t.from, to: t.to, date: t.date })
        }
      >
        Search results
      </Back>
      <Steps stage={0} />
      <div className="bk-heading">
        <div>
          <h1>Choose your seats</h1>
          <p>
            <RouteName from={t.from} to={t.to} />
            <i className="bk-dot" />
            <DateTag date={t.date} />
          </p>
        </div>
      </div>
      <div className="bk-book-grid">
        <section className="bk-box">
          <div className="bk-panel-heading">
            <div className="bk-bus-mark">
              <BusFront size={24} />
            </div>
            <div>
              <h2>{t.operatorName}</h2>
              <p>
                {t.busName} · {t.busType}
              </p>
            </div>
            <span className="bk-rating">
              <Star fill="currentColor" size={13} />
              {t.rating.toFixed(1)}
            </span>
          </div>
          <div className="bk-seat-section">
            <div className="bk-deck-toggle" role="group" aria-label="Seat deck">
              {(["lower", "upper"] as const)
                .filter((d) => seats.some((s) => s.deck === d))
                .map((d) => (
                  <button
                    key={d}
                    aria-pressed={d === deck}
                    onClick={() => setDeck(d)}
                  >
                    {d === "lower" ? "Lower deck" : "Upper deck"}
                  </button>
                ))}
            </div>
            <div className="bk-legend">
              {["Available", "Selected", "Held", "Booked"].map((s) => (
                <span key={s}>
                  <i className={"bk-key-" + s.toLowerCase()} />
                  {s}
                </span>
              ))}
            </div>
            <div className="bk-coach">
              <div className="bk-coach-front">
                <span>Front</span>
                <CircleGauge aria-label="Driver" size={22} />
              </div>
              <div
                className="bk-seat-grid"
                style={{ gridTemplateColumns: gridCols }}
              >
                {filtered.map((s) => {
                  const selectedNow = selected.some(
                      (x) => x.number === s.number,
                    ),
                    i = cols.indexOf(s.col);
                  return (
                    <button
                      key={s.number}
                      type="button"
                      className={
                        "bk-seat bk-seat-" +
                        s.kind +
                        " " +
                        (selectedNow ? "is-selected" : s.status)
                      }
                      style={{
                        gridRow: rows.indexOf(s.row) + 1,
                        gridColumn: i + 1 + (i >= aisleAfter ? 1 : 0),
                      }}
                      disabled={s.status !== "available" || pending}
                      aria-pressed={selectedNow}
                      title={s.number + " · " + inr(s.price) + " · " + s.status}
                      aria-label={
                        "Seat " +
                        s.number +
                        ", " +
                        inr(s.price) +
                        (s.status === "available" ? "" : ", " + s.status)
                      }
                      onClick={() => {
                        setError(null);
                        if (!selectedNow && selected.length >= 6) {
                          setError(
                            new Error("Choose up to 6 seats per booking."),
                          );
                          return;
                        }
                        setChosen((a) =>
                          a.includes(s.number)
                            ? a.filter((n) => n !== s.number)
                            : [...a, s.number],
                        );
                      }}
                    >
                      {s.number}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="bk-seat-note">
              <Info size={15} /> Choose up to 6 seats to see your fare.
            </p>
          </div>
        </section>
        <aside className="bk-box bk-summary">
          <div className="bk-summary-top">
            <Armchair size={20} />
            <h2>Journey summary</h2>
          </div>
          <TripLine {...t} />
          <span className="bk-duration">
            <span>{durationText(t.durationMinutes)}</span>
            <i className="bk-dot" />
            {dateLabel(t.date)}
          </span>
          <hr />
          <dl className="bk-list">
            {selected.length ? (
              selected.map((s) => (
                <div key={s.number}>
                  <dt>
                    Seat {s.number} · {s.deck}
                  </dt>
                  <dd>{inr(s.price)}</dd>
                </div>
              ))
            ) : (
              <div>
                <dt>Selected seats</dt>
                <dd>None yet</dd>
              </div>
            )}
          </dl>
          <div className="bk-total">
            <span>Seat total</span>
            <strong>{inr(subtotal)}</strong>
          </div>
          <AlertBox error={error} />
          <button
            type="button"
            disabled={!selected.length || pending || loading}
            onClick={proceed}
            className="bk-primary bk-full"
          >
            {pending ? "Holding seats…" : "Continue to passengers"}
            <ArrowRight size={16} />
          </button>
          <details className="bk-policy">
            <summary>
              <ShieldCheck size={15} />
              Cancellation policy
              <ChevronRight size={14} />
            </summary>
            <p>
              {t.refundPercent}% simulated refund up to {t.cancellationHours}{" "}
              hours before departure.
            </p>
          </details>
        </aside>
      </div>
    </main>
  );
}
function dateLabel(date: string) {
  return new Date(date + "T12:00:00+05:30").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}
