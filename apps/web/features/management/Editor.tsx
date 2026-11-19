"use client";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Item, Role, Section } from "./config";

const timeInput = (v: unknown) =>
  v ? new Date(+new Date(String(v)) + 19800000).toISOString().slice(0, 16) : "";
function format(v: unknown) {
  return Array.isArray(v) ? v.join(", ") : String(v ?? "");
}
type Props = {
  role: Role;
  section: Section;
  item?: Item;
  pending: boolean;
  onSave: (data: unknown) => void;
  onClose: () => void;
};
function Picker({
  role,
  kind,
  owner,
  selected,
  onSelect,
  label,
  initialLabel,
}: {
  role: Role;
  kind: string;
  owner?: string;
  selected: string;
  onSelect: (v: string) => void;
  label: string;
  initialLabel?: string;
}) {
  const [term, setTerm] = useState(""),
    [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["manage-options", role, kind, owner, term, page],
    queryFn: () =>
      api<{ value: string; label: string }[]>(
        "/" +
          role +
          "/options?" +
          new URLSearchParams({
            kind,
            term,
            page: String(page),
            ...(owner ? { operatorId: owner } : {}),
          }),
      ),
  });
  return (
    <div className="mw-field">
      <label>
        {label}
        <input
          aria-label={"Filter " + label.toLowerCase()}
          type="search"
          placeholder={"Find " + label.toLowerCase()}
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setPage(1);
          }}
        />
      </label>
      <select
        required
        aria-label={label}
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">Choose {label.toLowerCase()}</option>
        {selected && !q.data?.some((x) => x.value === selected) && (
          <option value={selected}>{initialLabel || selected}</option>
        )}
        {q.data?.map((x) => (
          <option key={x.value} value={x.value}>
            {x.label}
          </option>
        ))}
      </select>
      {q.error && <small role="alert">{q.error.message}</small>}
      {(page > 1 || q.data?.length === 30) && (
        <div className="mw-inline">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={q.data?.length !== 30}
            onClick={() => setPage((p) => p + 1)}
          >
            More options
          </button>
        </div>
      )}
    </div>
  );
}
export default function Editor({
  role,
  section,
  item,
  pending,
  onSave,
  onClose,
}: Props) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const val = Object.fromEntries(
      Object.entries(item || {}).map(([k, v]) => [k, format(v)]),
    );
    const seats = Array.isArray(item?.seats) ? item.seats : [];
    return {
      ...val,
      name: val.name || "",
      description: val.description || "",
      busType: val.busType || "AC Sleeper",
      fare:
        val.fare ||
        String(
          seats.length ? Math.min(...seats.map((s) => Number(s.price))) : 750,
        ),
      seatCount: String(seats.length || 30),
      layout: "",
      active: String(item?.active ?? true),
      visible: String(item?.visible ?? true),
      status: val.status || "open",
      refundPercent: val.refundPercent || "75",
      cancellationHours: val.cancellationHours || "6",
      departureAt: timeInput(item?.departureAt),
      arrivalAt: timeInput(item?.arrivalAt),
      expiresAt: timeInput(item?.expiresAt),
      reply: val.reply || "",
    };
  });
  const [error, setError] = useState(""),
    [advanced, setAdvanced] = useState(false);
  function set(k: string, v: string) {
    setForm((f) => ({
      ...f,
      [k]: v,
      ...(k === "operatorId" ? { routeId: "", busId: "" } : {}),
    }));
  }
  const field = (
    k: string,
    label: string,
    type = "text",
    opts?: {
      min?: number;
      max?: number;
      optional?: boolean;
      placeholder?: string;
    },
  ) => (
    <label className="mw-field" key={k}>
      {label}
      <input
        type={type}
        required={!opts?.optional}
        min={opts?.min}
        max={opts?.max}
        placeholder={opts?.placeholder}
        value={form[k] || ""}
        onChange={(e) => set(k, e.target.value)}
        autoComplete={type === "password" ? "new-password" : "off"}
      />
    </label>
  );
  const area = (
    k: string,
    label: string,
    placeholder = "",
    required = false,
  ) => (
    <label className="mw-field">
      {label}
      <textarea
        rows={3}
        required={required}
        placeholder={placeholder}
        value={form[k] || ""}
        onChange={(e) => set(k, e.target.value)}
      />
    </label>
  );
  const select = (k: string, label: string, values: string[]) => (
    <label className="mw-field">
      {label}
      <select value={form[k]} onChange={(e) => set(k, e.target.value)}>
        {values.map((v) => (
          <option key={v} value={v}>
            {v.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
  const toggle = (k: string, label: string) => (
    <label className="mw-check">
      <input
        type="checkbox"
        checked={form[k] === "true"}
        onChange={(e) => set(k, String(e.target.checked))}
      />
      {label}
    </label>
  );
  const pick = (
    kind: string,
    k: string,
    label: string,
    initialLabel?: string,
  ) => (
    <Picker
      role={role}
      kind={kind}
      owner={form.operatorId}
      selected={form[k] || ""}
      onSelect={(v) => set(k, v)}
      label={label}
      initialLabel={initialLabel}
    />
  );
  function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const f = form,
      numeric = (k: string) => Number(f[k]),
      csv = (k: string) =>
        (f[k] || "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      datetime = (k: string) => new Date(f[k] + ":00+05:30").toISOString();
    const op = role === "admin" ? { operatorId: f.operatorId } : {};
    try {
      switch (section) {
        case "users":
          return onSave({ name: f.name, active: f.active === "true" });
        case "operators":
          return onSave({
            name: f.name,
            description: f.description,
            ...(!item ? { email: f.email, password: f.password } : {}),
          });
        case "buses": {
          const seats = Array.isArray(item?.seats) ? item.seats : [];
          const sameLayout =
            seats.length > 0 &&
            numeric("seatCount") === seats.length &&
            f.busType === item?.busType &&
            numeric("fare") === Math.min(...seats.map((s) => Number(s.price)));
          const sanitized = seats.map((s) => ({
            number: s.number,
            row: s.row,
            col: s.col,
            kind: s.kind,
            deck: s.deck,
            price: s.price,
          }));
          const custom =
            advanced && f.layout
              ? JSON.parse(f.layout)
              : sameLayout
                ? sanitized
                : undefined;
          return onSave({
            ...op,
            name: f.name,
            busType: f.busType,
            amenities: csv("amenities"),
            seatCount: numeric("seatCount"),
            fare: numeric("fare"),
            ...(custom ? { seats: custom } : {}),
          });
        }
        case "routes":
          return onSave({
            ...op,
            from: f.from,
            to: f.to,
            distanceKm: numeric("distanceKm"),
            boardingPoints: csv("boardingPoints"),
            droppingPoints: csv("droppingPoints"),
          });
        case "trips":
          return onSave({
            ...op,
            busId: f.busId,
            routeId: f.routeId,
            departureAt: datetime("departureAt"),
            arrivalAt: datetime("arrivalAt"),
            fare: numeric("fare"),
            cancellationHours: numeric("cancellationHours"),
            refundPercent: numeric("refundPercent"),
          });
        case "coupons":
          return onSave({
            code: f.code,
            percent: numeric("percent"),
            maxDiscount: numeric("maxDiscount"),
            minFare: numeric("minFare"),
            expiresAt: datetime("expiresAt"),
            description: f.description,
            active: f.active === "true",
          });
        case "reviews":
          return onSave({ visible: f.visible === "true" });
        case "support":
          return onSave({ status: f.status, reply: f.reply });
      }
    } catch {
      setError("Check the dates and custom seat JSON before saving.");
    }
  }
  return (
    <form onSubmit={submit} className="mw-form">
      {role === "admin" &&
        ["routes", "buses", "trips"].includes(section) &&
        (item ? (
          <p className="mw-note">
            This record stays with its current operator.
          </p>
        ) : (
          pick("operators", "operatorId", "Operator")
        ))}
      {["users", "operators", "buses"].includes(section) &&
        field("name", "Name")}
      {section === "users" && toggle("active", "Account active")}
      {section === "operators" && (
        <>
          {area("description", "Description")}
          {!item && (
            <>
              {field("email", "Operator login email", "email")}
              {field(
                "password",
                "Initial password (10–72 characters)",
                "password",
              )}
            </>
          )}
        </>
      )}
      {section === "buses" && (
        <>
          {select("busType", "Bus type", [
            "AC Sleeper",
            "AC Seater",
            "Non-AC Sleeper",
            "Non-AC Seater",
          ])}
          <div className="mw-pair">
            {field("seatCount", "Seat count", "number", { min: 1, max: 80 })}
            {field("fare", "Starting fare (₹)", "number", {
              min: 1,
              max: 50000,
            })}
          </div>
          {field("amenities", "Amenities, comma-separated", "text", {
            optional: true,
            placeholder: "Wi-Fi, Water bottle",
          })}
          <label className="mw-check">
            <input
              type="checkbox"
              checked={advanced}
              onChange={(e) => {
                setAdvanced(e.target.checked);
                if (
                  e.target.checked &&
                  !form.layout &&
                  Array.isArray(item?.seats)
                )
                  set(
                    "layout",
                    JSON.stringify(
                      item.seats.map(
                        ({ number, row, col, deck, kind, price }) => ({
                          number,
                          row,
                          col,
                          deck,
                          kind,
                          price,
                        }),
                      ),
                      null,
                      2,
                    ),
                  );
              }}
            />
            Customize individual seats
          </label>
          {advanced &&
            area(
              "layout",
              "Seat layout (JSON array)",
              '[{"number":"L1","row":0,"col":0,"deck":"lower","kind":"sleeper","price":750}]',
              true,
            )}
        </>
      )}
      {section === "routes" && (
        <>
          <div className="mw-pair">
            {pick("cities", "from", "Origin")}
            {pick("cities", "to", "Destination")}
          </div>
          {field("distanceKm", "Distance (km)", "number", {
            min: 1,
            max: 7000,
          })}
          {field("boardingPoints", "Boarding points, comma-separated")}
          {field("droppingPoints", "Dropping points, comma-separated")}
        </>
      )}
      {section === "trips" && (
        <>
          {pick("buses", "busId", "Bus", String(item?.busName || ""))}
          {pick(
            "routes",
            "routeId",
            "Route",
            item ? item.from + " → " + item.to : "",
          )}
          {field("departureAt", "Departure (India time)", "datetime-local")}
          {field("arrivalAt", "Arrival (India time)", "datetime-local")}
          {field("fare", "Starting fare (₹)", "number", { min: 1, max: 50000 })}
          <div className="mw-pair">
            {field("cancellationHours", "Cancel before (hours)", "number", {
              min: 0,
              max: 336,
            })}
            {field("refundPercent", "Refund (%)", "number", {
              min: 0,
              max: 100,
            })}
          </div>
        </>
      )}
      {section === "coupons" && (
        <>
          {field("code", "Coupon code")}
          {area("description", "Offer description")}
          <div className="mw-pair">
            {field("percent", "Discount (%)", "number", { min: 1, max: 100 })}
            {field("maxDiscount", "Maximum discount (₹)", "number", {
              min: 1,
              max: 50000,
            })}
          </div>
          {field("minFare", "Minimum fare (₹)", "number", {
            min: 0,
            max: 100000,
          })}
          {field("expiresAt", "Valid until (India time)", "datetime-local")}
          {toggle("active", "Coupon active")}
        </>
      )}
      {section === "reviews" && (
        <>
          <blockquote>{String(item?.comment || "")}</blockquote>
          {toggle("visible", "Show this review publicly")}
        </>
      )}
      {section === "support" && (
        <>
          <p className="mw-note">{String(item?.message || "")}</p>
          {select("status", "Request status", [
            "open",
            "in_progress",
            "resolved",
          ])}
          {area("reply", "Reply to customer")}
        </>
      )}
      {error && (
        <p role="alert" className="mw-error">
          {error}
        </p>
      )}
      <div className="mw-actions">
        <button type="button" className="mw-button" onClick={onClose}>
          Close
        </button>
        <button disabled={pending} className="mw-button primary" type="submit">
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
