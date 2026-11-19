"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Armchair,
  ArrowRight,
  Bookmark,
  BusFront,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPinned,
  PencilLine,
  Search as SearchIcon,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Wifi,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  AlertBox,
  DateTag,
  Empty,
  Loading,
  RouteName,
  SectionCrumb,
  TripLine,
} from "./common";
import { durationText, inr, localDay, post, Trip, tripHref } from "./model";

const amenitiesList = [
  "Wi-Fi",
  "Charging port",
  "Blanket",
  "Water bottle",
  "Reading light",
];
const windows = ["morning", "afternoon", "evening", "night"];
const initialFilters = {
  maxPrice: "",
  ac: "",
  kind: "",
  departure: "",
  arrival: "",
  operator: "",
  amenities: "",
  minRating: "",
};
type FilterKey = keyof typeof initialFilters;
function BusCard({ trip }: { trip: Trip }) {
  const [details, setDetails] = useState(false);
  const reviews = useQuery({
    queryKey: ["operator-reviews", trip.operatorId],
    queryFn: () =>
      api<
        {
          _id: string;
          displayName: string;
          rating: number;
          comment: string;
          isSeeded: boolean;
        }[]
      >(
        "/reviews?" +
          new URLSearchParams({ operatorId: trip.operatorId, limit: "3" }),
      ),
    enabled: details,
    staleTime: 60_000,
  });
  return (
    <article className="bk-result-card">
      <div className="bk-result-body">
        <div className="bk-result-top">
          <div className="bk-bus-mark">
            <BusFront size={24} />
          </div>
          <div>
            <h2>{trip.operatorName}</h2>
            <p>
              {trip.busName} · {trip.busType}
            </p>
          </div>
          <span className="bk-rating">
            <Star size={13} fill="currentColor" />
            {trip.rating.toFixed(1)}
          </span>
        </div>
        <div className="bk-result-mid">
          <div>
            <TripLine {...trip} />
            <span className="bk-duration">
              <Clock3 size={13} />
              {durationText(trip.durationMinutes)}
            </span>
          </div>
          <div className="bk-card-price">
            <small>From</small>
            <strong>{inr(trip.fare)}</strong>
            <small>per seat</small>
          </div>
        </div>
        <div className="bk-amenities">
          {trip.amenities.slice(0, 4).map((x) => (
            <span key={x}>
              {x === "Wi-Fi" ? (
                <Wifi size={14} />
              ) : x === "Charging port" ? (
                <Zap size={14} />
              ) : (
                <span className="bk-dot" />
              )}
              {x}
            </span>
          ))}
        </div>
      </div>
      <div className="bk-result-foot">
        <button
          type="button"
          aria-expanded={details}
          onClick={() => setDetails(!details)}
          className="bk-link"
        >
          Trip details <ChevronDown size={15} />
        </button>
        <div>
          <span>
            <Armchair size={14} />
            {trip.availableSeats} seats left
          </span>
          {trip.availableSeats > 0 ? (
            <Link href={tripHref(trip._id)} className="bk-primary">
              View seats <ArrowRight size={15} />
            </Link>
          ) : (
            <span className="bk-pill">Sold out</span>
          )}
        </div>
      </div>
      {details && (
        <div className="bk-card-details">
          <section>
            <h3>
              <MapPinned size={15} />
              Stops
            </h3>
            <p>
              <b>Boarding</b> {trip.boardingPoints.join(" · ")}
            </p>
            <p>
              <b>Dropping</b> {trip.droppingPoints.join(" · ")}
            </p>
          </section>
          <section>
            <h3>
              <ShieldCheck size={16} />
              Cancellation policy
            </h3>
            <p>
              {trip.refundPercent}% simulated refund when cancelled at least{" "}
              {trip.cancellationHours} hours before departure.
            </p>
          </section>
          <section className="bk-reviews">
            <h3>
              <Star size={15} />
              Passenger reviews
            </h3>
            {reviews.isPending ? (
              <p>Loading reviews…</p>
            ) : reviews.error ? (
              <AlertBox error={reviews.error} />
            ) : reviews.data?.length ? (
              reviews.data.map((r) => (
                <figure key={r._id}>
                  <figcaption>
                    <b>{r.displayName}</b> · {r.rating}/5 ·{" "}
                    {r.isSeeded ? "Sample review" : "Verified demo booking"}
                  </figcaption>
                  <blockquote>{r.comment}</blockquote>
                </figure>
              ))
            ) : (
              <p>No reviews yet.</p>
            )}
          </section>
        </div>
      )}
    </article>
  );
}
function SelectFilter({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  items: [string, string][];
}) {
  return (
    <label className="bk-filter-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Any</option>
        {items.map(([k, v]) => (
          <option value={k} key={k}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}
export default function Search() {
  const params = useSearchParams(),
    router = useRouter(),
    { user } = useAuth();
  const from = params.get("from") || "",
    to = params.get("to") || "",
    date = params.get("date") || localDay();
  const operatorParam = params.get("operator") || "";
  const sourceKey = JSON.stringify([from, to, date]);
  const [edit, setEdit] = useState(false),
    [mobileFilters, setMobileFilters] = useState(false),
    [filters, setFilters] = useState(initialFilters),
    [sort, setSort] = useState("departure"),
    [page, setPage] = useState(1);
  const [message, setMessage] = useState(""),
    [actionError, setActionError] = useState<unknown>(null),
    [saving, setSaving] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from),
    [draftTo, setDraftTo] = useState(to),
    [draftDate, setDraftDate] = useState(date);
  useEffect(() => {
    setPage(1);
    setFilters({ ...initialFilters, operator: operatorParam });
    setDraftFrom(from);
    setDraftTo(to);
    setDraftDate(date);
    setMessage("");
    setActionError(null);
  }, [from, to, date, operatorParam]);
  const historyRef = useRef("");
  useEffect(() => {
    if (user && from && to && historyRef.current !== sourceKey) {
      historyRef.current = sourceKey;
      void api("/users/me/history", post({ from, to, date })).catch(() => {
        historyRef.current = "";
      });
    }
  }, [user, from, to, date, sourceKey]);
  const cities = useQuery({
    queryKey: ["search-cities"],
    queryFn: () => api<{ name: string }[]>("/cities?limit=100"),
    enabled: edit || !from || !to,
  });
  const queryArgs = new URLSearchParams({
    from,
    to,
    date,
    page: String(page),
    limit: "10",
    sort,
  });
  Object.entries(filters).forEach(([k, v]) => {
    if (v) queryArgs.set(k, v);
  });
  const listings = useQuery({
    queryKey: ["search", queryArgs.toString()],
    queryFn: () => api<Trip[]>("/search?" + queryArgs),
    enabled: Boolean(from && to && date),
  });
  const operatorQuery = useQuery({
    queryKey: ["operators-for", sourceKey],
    queryFn: () =>
      api<Trip[]>(
        "/search?" + new URLSearchParams({ from, to, date, limit: "100" }),
      ),
    enabled: Boolean(from && to && date),
    staleTime: 60000,
  });
  const operators = Array.from(
    new Set((operatorQuery.data || []).map((t) => t.operatorName)),
  ).sort();
  function choose(k: FilterKey, value: string) {
    setFilters((f) => ({ ...f, [k]: value }));
    setPage(1);
  }
  const selectedFilters = Object.values(filters).filter(Boolean).length;
  return (
    <main className="bk-shell">
      <SectionCrumb label="Search results" />
      <div className="bk-heading">
        <div>
          <h1>
            {from && to ? <RouteName from={from} to={to} /> : "Find a bus"}
          </h1>
          <DateTag date={date} />
        </div>
        <div className="bk-actions">
          {user && from && to && (
            <button
              className="bk-secondary"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                setActionError(null);
                try {
                  await api("/users/me/favorites", post({ from, to }));
                  setMessage("Route saved to your profile.");
                } catch (e) {
                  setActionError(e);
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Bookmark size={16} />
              Save route
            </button>
          )}
          <button
            className="bk-secondary"
            aria-expanded={edit}
            onClick={() => setEdit(!edit)}
          >
            <PencilLine size={16} />
            Modify search
          </button>
        </div>
      </div>
      {message && (
        <p role="status" className="bk-notice">
          {message}
        </p>
      )}
      <AlertBox error={actionError} />
      {(edit || !from || !to) && (
        <form
          className="bk-modify"
          onSubmit={(e) => {
            e.preventDefault();
            setEdit(false);
            router.push(
              "/search/?" +
                new URLSearchParams({
                  from: draftFrom.trim(),
                  to: draftTo.trim(),
                  date: draftDate,
                }),
            );
          }}
        >
          <label>
            From city
            <input
              list="bk-cities"
              required
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
            />
          </label>
          <label>
            To city
            <input
              list="bk-cities"
              required
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
            />
          </label>
          <datalist id="bk-cities">
            {cities.data?.map((c) => (
              <option key={c.name} value={c.name} />
            ))}
          </datalist>
          <label>
            Travel date
            <input
              type="date"
              required
              min={localDay()}
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
            />
          </label>
          <button className="bk-primary">
            <SearchIcon size={15} />
            Search buses
          </button>
        </form>
      )}
      {from && to && (
        <div className="bk-results-grid">
          <button
            className="bk-mobile-filter bk-secondary"
            onClick={() => setMobileFilters(!mobileFilters)}
            aria-expanded={mobileFilters}
          >
            <SlidersHorizontal size={17} /> Filters{" "}
            {selectedFilters > 0 && "(" + selectedFilters + ")"}
          </button>
          <aside
            className={"bk-filter-panel " + (mobileFilters ? "bk-open" : "")}
          >
            <div className="bk-space">
              <h2>
                <SlidersHorizontal size={17} />
                Filters
              </h2>
              <button
                className="bk-link"
                disabled={!selectedFilters}
                onClick={() => {
                  setFilters(initialFilters);
                  setPage(1);
                }}
              >
                Reset
              </button>
            </div>
            <label className="bk-filter-field">
              <span>Maximum fare (₹)</span>
              <input
                type="number"
                min="1"
                placeholder="Any price"
                value={filters.maxPrice}
                onChange={(e) => choose("maxPrice", e.target.value)}
              />
            </label>
            <SelectFilter
              label="Air conditioning"
              value={filters.ac}
              onChange={(s) => choose("ac", s)}
              items={[
                ["true", "AC"],
                ["false", "Non-AC"],
              ]}
            />
            <SelectFilter
              label="Seat type"
              value={filters.kind}
              onChange={(s) => choose("kind", s)}
              items={[
                ["seater", "Seater"],
                ["sleeper", "Sleeper"],
              ]}
            />
            {(["departure", "arrival"] as const).map((k) => (
              <SelectFilter
                key={k}
                label={k === "departure" ? "Departure time" : "Arrival time"}
                value={filters[k]}
                onChange={(s) => choose(k, s)}
                items={windows.map((w) => [
                  w,
                  w.charAt(0).toUpperCase() + w.slice(1),
                ])}
              />
            ))}
            <SelectFilter
              label="Operator"
              value={filters.operator}
              onChange={(s) => choose("operator", s)}
              items={operators.map((n) => [n, n])}
            />
            <SelectFilter
              label="Minimum rating"
              value={filters.minRating}
              onChange={(s) => choose("minRating", s)}
              items={[
                ["4", "4 stars"],
                ["4.5", "4.5 stars"],
              ]}
            />
            <fieldset className="bk-checkboxes">
              <legend>Amenities</legend>
              {amenitiesList.map((n) => (
                <label key={n}>
                  <input
                    type="checkbox"
                    checked={filters.amenities.split(",").includes(n)}
                    onChange={(e) => {
                      const next = filters.amenities
                        .split(",")
                        .filter((x) => x && x !== n);
                      if (e.target.checked) next.push(n);
                      choose("amenities", next.join(","));
                    }}
                  />
                  {n}
                </label>
              ))}
            </fieldset>
          </aside>
          <section aria-label="Bus results">
            <div className="bk-sort-bar">
              <h2>Available buses</h2>
              <label>
                Sort by{" "}
                <select
                  aria-label="Sort buses"
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="departure">Departure</option>
                  <option value="price">Lowest fare</option>
                  <option value="duration">Shortest trip</option>
                  <option value="rating">Top rated</option>
                </select>
              </label>
            </div>
            {listings.isPending ? (
              <Loading />
            ) : listings.error ? (
              <AlertBox error={listings.error} />
            ) : listings.data?.length ? (
              listings.data.map((t) => <BusCard trip={t} key={t._id} />)
            ) : (
              <Empty title="No buses on this search">
                Try another travel date or adjust your filters.
              </Empty>
            )}
            {(page > 1 || listings.data?.length === 10) && (
              <div className="bk-page-nav">
                <button
                  className="bk-secondary"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={15} /> Previous
                </button>
                <span>Page {page}</span>
                <button
                  className="bk-secondary"
                  disabled={(listings.data?.length || 0) < 10}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight size={15} />
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
