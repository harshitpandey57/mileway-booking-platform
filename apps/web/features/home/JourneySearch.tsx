"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  CalendarDays,
  Check,
  CircleDot,
  MapPin,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";
import styles from "./Home.module.css";

type City = { _id: string; name: string; state: string };

export function journeyDate(offset = 0) {
  // Offset midnight to India Standard Time before deriving a calendar date.
  return new Date(Date.now() + 19_800_000 + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
export function searchHref(from: string, to: string, date: string) {
  return "/search/?" + new URLSearchParams({ from, to, date }).toString();
}

function CityPicker({
  label,
  value,
  onChange,
  cities,
  unavailable,
}: {
  label: "From" | "To";
  value: string;
  onChange: (city: string) => void;
  cities: City[];
  unavailable: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(-1);
  const choices = cities
    .filter(
      (city) =>
        !typed || city.name.toLowerCase().includes(value.trim().toLowerCase()),
    )
    .slice(0, 7);
  const Icon = label === "From" ? CircleDot : MapPin;
  function choose(name: string) {
    onChange(name);
    setTyped(false);
    setOpen(false);
    setActive(-1);
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((i) =>
        event.key === "ArrowDown"
          ? Math.min(i + 1, choices.length - 1)
          : i < 0
            ? choices.length - 1
            : Math.max(0, i - 1),
      );
    } else if (event.key === "Enter" && open && choices[active]) {
      event.preventDefault();
      choose(choices[active].name);
    }
  }
  return (
    <div
      className={styles.city}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Icon className={styles.fieldIcon} size={21} aria-hidden="true" />
      <div className={styles.cityControl}>
        <label htmlFor={id}>{label}</label>
        <input
          type="text"
          id={id}
          role="combobox"
          autoComplete="off"
          maxLength={80}
          placeholder={label === "From" ? "Origin city" : "Destination city"}
          value={value}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={id + "-list"}
          aria-activedescendant={
            open && choices[active] ? id + "-" + active : undefined
          }
          onFocus={(event) => {
            event.target.select();
            setTyped(false);
            setOpen(true);
            setActive(-1);
          }}
          onClick={() => setOpen(true)}
          onKeyDown={keyDown}
          onChange={(event) => {
            onChange(event.target.value);
            setTyped(true);
            setOpen(true);
            setActive(-1);
          }}
          required
        />
      </div>
      {open && (
        <ul
          className={styles.suggestions}
          role="listbox"
          id={id + "-list"}
          aria-label={label + " cities"}
        >
          {choices.map((city, index) => (
            <li
              key={city._id}
              id={id + "-" + index}
              role="option"
              aria-selected={active === index}
              className={active === index ? styles.highlight : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(city.name)}
            >
              <MapPin size={15} />
              <span>
                {city.name}
                <small>{city.state}</small>
              </span>
              {city.name === value && <Check size={15} />}
            </li>
          ))}
          {!choices.length && (
            <li
              className={styles.noCities}
              role="option"
              aria-selected="false"
              aria-disabled="true"
            >
              {unavailable
                ? "City suggestions unavailable"
                : cities.length
                  ? "No matching cities"
                  : "Loading cities…"}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default function JourneySearch({
  date,
  setDate,
}: {
  date: string;
  setDate: (date: string) => void;
}) {
  const router = useRouter();
  const [from, setFrom] = useState("Bengaluru");
  const [to, setTo] = useState("Chennai");
  const [today, setToday] = useState("");
  const [tomorrow, setTomorrow] = useState("");
  const [error, setError] = useState("");
  const dateInput = useRef<HTMLInputElement>(null);
  const cities = useQuery({
    queryKey: ["cities", "home"],
    queryFn: () => api<City[]>("/cities?limit=100"),
    staleTime: 300_000,
  });
  useEffect(() => {
    setToday(journeyDate());
    setTomorrow(journeyDate(1));
  }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    const origin = from.trim(),
      destination = to.trim();
    if (!origin || !destination) {
      setError("Enter your departure and arrival cities.");
      return;
    }
    if (origin.toLowerCase() === destination.toLowerCase()) {
      setError("Choose a different destination city.");
      return;
    }
    if (!date || date < journeyDate()) {
      setError("Choose today or a future travel date.");
      return;
    }
    setError("");
    const canonical = (name: string) =>
      cities.data?.find(
        (city) => city.name.toLowerCase() === name.toLowerCase(),
      )?.name || name;
    router.push(searchHref(canonical(origin), canonical(destination), date));
  }
  const dateLabel = date
    ? new Intl.DateTimeFormat("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(new Date(date + "T12:00:00Z"))
    : "Select date";
  return (
    <form
      className={styles.searchPanel}
      onSubmit={submit}
      aria-label="Search for bus tickets"
    >
      <div className={styles.searchRow}>
        <div className={styles.cityPair}>
          <CityPicker
            label="From"
            value={from}
            onChange={setFrom}
            cities={cities.data || []}
            unavailable={cities.isError}
          />
          <button
            type="button"
            className={styles.swap}
            aria-label="Swap cities"
            onClick={() => {
              setFrom(to);
              setTo(from);
              setError("");
            }}
          >
            <ArrowLeftRight size={16} />
          </button>
          <CityPicker
            label="To"
            value={to}
            onChange={setTo}
            cities={cities.data || []}
            unavailable={cities.isError}
          />
        </div>
        <div className={styles.dateGroup}>
          <CalendarDays
            className={styles.fieldIcon}
            size={21}
            aria-hidden="true"
          />
          <div>
            <label htmlFor="travel-date">Travel date</label>
            <div className={styles.dateControl}>
              <strong aria-hidden="true">{dateLabel}</strong>
              <input
                ref={dateInput}
                type="date"
                id="travel-date"
                aria-label="Travel date"
                value={date}
                min={today}
                onChange={(event) => setDate(event.target.value)}
                onClick={() => {
                  try {
                    dateInput.current?.showPicker?.();
                  } catch {
                    /* Native picker can manage its own focus. */
                  }
                }}
                required
              />
            </div>
          </div>
        </div>
        <button type="submit" className={styles.searchButton}>
          <Search size={19} strokeWidth={2.4} />
          Search buses
        </button>
      </div>
      <div className={styles.shortcuts}>
        <span>Quick dates</span>
        <button
          type="button"
          aria-pressed={date === today && !!today}
          onClick={() => setDate(journeyDate())}
        >
          Today
        </button>
        <button
          type="button"
          aria-pressed={date === tomorrow && !!tomorrow}
          onClick={() => setDate(journeyDate(1))}
        >
          Tomorrow
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
