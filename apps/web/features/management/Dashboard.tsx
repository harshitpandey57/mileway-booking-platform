"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowRight,
  BusFront,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Editor from "./Editor";
import {
  allSections,
  columns,
  creatable,
  currency,
  editable,
  operatorSections,
  removable,
  sections,
  singular,
  stamp,
  statIcons,
  value,
  type Item,
  type Role,
  type Section,
} from "./config";
import "./dashboard.css";
type Overview = {
  metrics: Record<string, number>;
  daily: { date: string; amount: number; count: number }[];
  topRoutes: { from: string; to: string; count: number; amount: number }[];
  recent: Item[];
};
type ListPage = {
  items: Item[];
  page: number;
  pageSize: number;
  total: number;
};
type Manifest = {
  trip: Item;
  passengers: {
    reference: string;
    seat: string;
    name: string;
    age: number;
    boarding: string;
    dropping: string;
    phone: string;
  }[];
};
type Action = {
  kind: "edit" | "detail" | "delete" | "cancel" | "status" | "manifest";
  item?: Item;
};
function Loading() {
  return (
    <div className="mw-loading" aria-label="Loading records" role="status">
      <LoaderCircle size={21} /> Loading records…
    </div>
  );
}
function OverviewPanel({
  data,
  onBookings,
}: {
  data: Overview;
  onBookings: () => void;
}) {
  const names: Record<string, string> = {
    revenue: "Net revenue",
    bookings: "Total bookings",
    trips: "Upcoming departures",
    buses: "Buses",
    routes: "Routes",
    users: "Users",
    operators: "Operators",
    support: "Open requests",
  };
  const week = data.daily.reduce((sum, d) => sum + d.amount, 0),
    max = Math.max(1, ...data.daily.map((d) => d.amount));
  return (
    <>
      <div className="mw-stats">
        {Object.keys(names)
          .filter((k) => data.metrics[k] !== undefined)
          .map((k) => {
            const Icon = statIcons[k as keyof typeof statIcons];
            return (
              <div className="mw-stat" key={k}>
                <span>
                  <Icon size={17} />
                  {names[k]}
                </span>
                <strong>
                  {k === "revenue"
                    ? currency(data.metrics[k])
                    : data.metrics[k].toLocaleString("en-IN")}
                </strong>
              </div>
            );
          })}
      </div>
      <div className="mw-panels">
        <section className="mw-card">
          <div className="mw-card-head">
            <h3>Revenue this week</h3>
            <span>Last 7 days · IST</span>
          </div>
          <strong className="mw-big-value">{currency(week)}</strong>
          <div className="mw-chart" aria-label="Daily net revenue">
            {data.daily.map((d) => (
              <div
                className="mw-chart-day"
                key={d.date}
                title={
                  d.date +
                  " · " +
                  currency(d.amount) +
                  " · " +
                  d.count +
                  " paid bookings"
                }
              >
                <span className="mw-bar-track">
                  <i
                    style={{
                      height: Math.max(2, (d.amount / max) * 100) + "%",
                    }}
                  />
                </span>
                <small>
                  {new Date(d.date + "T12:00:00+05:30").toLocaleDateString(
                    "en-IN",
                    { weekday: "short", timeZone: "Asia/Kolkata" },
                  )}
                </small>
                <span className="sr-only">{currency(d.amount)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="mw-card">
          <div className="mw-card-head">
            <h3>Popular routes</h3>
            <BusFront size={18} />
          </div>
          {data.topRoutes.length ? (
            data.topRoutes.map((r, i) => (
              <div className="mw-route-row" key={r.from + r.to}>
                <strong>{String(i + 1).padStart(2, "0")}</strong>
                <div>
                  {r.from} → {r.to}
                  <small>
                    {r.count} paid {r.count === 1 ? "booking" : "bookings"}
                  </small>
                </div>
                <b>{currency(r.amount)}</b>
              </div>
            ))
          ) : (
            <p className="mw-empty">Paid bookings will appear here by route.</p>
          )}
        </section>
      </div>
      <section className="mw-card">
        <div className="mw-card-head">
          <h3>Recent bookings</h3>
          <button className="mw-link" onClick={onBookings}>
            All bookings <ArrowRight size={14} />
          </button>
        </div>
        {data.recent.length ? (
          <div className="mw-scroll">
            <table>
              <thead>
                <tr>
                  {["Reference", "Journey", "Amount", "Status"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r._id}>
                    <td>{String(r.reference)}</td>
                    <td>{value(r, "journey")}</td>
                    <td>{value(r, "total")}</td>
                    <td>
                      <span className="mw-pill">{value(r, "status")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mw-empty">
            No bookings yet. Confirmed and pending reservations appear here.
          </p>
        )}
      </section>
    </>
  );
}
function ManifestPanel({ role, id }: { role: Role; id: string }) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["manage-manifest", user?.id, role, id],
    queryFn: () => api<Manifest>("/" + role + "/trips/" + id + "/manifest"),
    staleTime: 0,
  });
  if (q.isLoading) return <Loading />;
  if (!q.data)
    return (
      <p className="mw-error" role="alert">
        {q.error?.message || "Unable to load manifest."}
      </p>
    );
  const { trip, passengers } = q.data;
  function download() {
    const quote = (v: unknown) => {
      let s = String(v ?? "");
      if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replaceAll('"', '""') + '"';
    };
    const rows = [
      [
        "Reference",
        "Seat",
        "Passenger",
        "Age",
        "Boarding",
        "Dropping",
        "Phone",
      ],
      ...passengers.map((p) => [
        p.reference,
        p.seat,
        p.name,
        p.age,
        p.boarding,
        p.dropping,
        p.phone,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((r) => r.map(quote).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "manifest-" + id + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <p className="mw-note">
        <b>{value(trip, "journey")}</b>
        <br />
        {String(trip.busName)} · {stamp(trip.departureAt)} IST
      </p>
      {passengers.length ? (
        <>
          <div className="mw-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Seat",
                    "Passenger",
                    "Age",
                    "Boarding",
                    "Dropping",
                    "Contact",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {passengers.map((p) => (
                  <tr key={p.reference + p.seat}>
                    <td>{p.seat}</td>
                    <td>{p.name}</td>
                    <td>{p.age}</td>
                    <td>{p.boarding}</td>
                    <td>{p.dropping}</td>
                    <td>{p.phone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="mw-button" onClick={download}>
            <ArrowDownToLine size={15} /> Download CSV
          </button>
        </>
      ) : (
        <p className="mw-empty">
          There are no confirmed passengers for this departure.
        </p>
      )}
    </>
  );
}
export default function Dashboard({ role }: { role: Role }) {
  const { user, loading } = useAuth();
  const client = useQueryClient();
  const allowed = role === "admin" ? allSections : operatorSections;
  const [section, setSection] = useState<Section>("overview"),
    [page, setPage] = useState(1),
    [action, setAction] = useState<Action | null>(null),
    [notice, setNotice] = useState(""),
    [nextStatus, setNextStatus] = useState("scheduled");
  const dialog = useRef<HTMLDialogElement>(null);
  const roleOk = user?.role === role;
  const root = "/" + role;
  const overview = useQuery({
    queryKey: ["manage", user?.id, role, "overview"],
    queryFn: () => api<Overview>(root + "/overview"),
    enabled: roleOk && section === "overview",
  });
  const listPage = useQuery({
    queryKey: ["manage", user?.id, role, section, page],
    queryFn: () => api<ListPage>(root + "/" + section + "?page=" + page),
    enabled: roleOk && section !== "overview",
  });
  const save = useMutation({
    mutationFn: ({
      path,
      method,
      data,
    }: {
      path: string;
      method: string;
      data?: unknown;
    }) =>
      api(root + "/" + path, {
        method,
        ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
      }),
    onSuccess: () => {
      setAction(null);
      setNotice("Changes saved.");
      client.invalidateQueries({ queryKey: ["manage"] });
      client.invalidateQueries({ queryKey: ["manage-options"] });
      client.invalidateQueries({ queryKey: ["manage-manifest"] });
    },
  });
  const saveReset = save.reset;
  useEffect(() => {
    if (action && !dialog.current?.open) dialog.current?.showModal();
    if (!action && dialog.current?.open) dialog.current.close();
  }, [action]);
  function close() {
    setAction(null);
    saveReset();
  }
  function open(a: Action) {
    saveReset();
    setNotice("");
    setAction(a);
    if (a.kind === "status") setNextStatus(String(a.item?.status));
  }
  function change(s: Section) {
    close();
    setNotice("");
    setSection(s);
    setPage(1);
  }
  function submit(data: unknown) {
    if (action?.kind === "edit")
      save.mutate({
        path: section + (action.item ? "/" + action.item._id : ""),
        method: action.item ? "PUT" : "POST",
        data,
      });
  }
  const label = role === "admin" ? "Administration" : "Operator workspace",
    activeLabel = sections[section].label;
  if (loading)
    return (
      <main className="mw-guard">
        <Loading />
      </main>
    );
  if (!roleOk)
    return (
      <main className="mw-guard">
        <div>
          <ClipboardList size={30} />
          <h1>{label}</h1>
          <p>
            {user
              ? "This account does not have access to this workspace."
              : "Sign in with your " +
                (role === "admin" ? "administrator" : "operator") +
                " account to continue."}
          </p>
          <Link
            className="mw-button primary"
            href={"/login/?next=" + encodeURIComponent(root + "/")}
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  const err = section === "overview" ? overview.error : listPage.error;
  const title =
    action?.kind === "edit"
      ? (action.item ? "Edit " : "Add ") + (singular[section] || "record")
      : action?.kind === "manifest"
        ? "Passenger manifest"
        : action?.kind === "status"
          ? "Departure status"
          : action?.kind === "cancel"
            ? "Cancel this booking?"
            : action?.kind === "delete"
              ? "Remove this " + singular[section] + "?"
              : (singular[section] || "Record") + " details";
  return (
    <main className="mw-dashboard">
      <div className="mw-shell">
        <aside className="mw-side">
          <div className="mw-side-brand">
            <BusFront size={20} />
            <strong>
              {role === "admin" ? "Platform admin" : "Operations"}
            </strong>
          </div>
          <nav aria-label={label + " sections"}>
            {allowed.map((k) => {
              const Icon = sections[k].icon;
              return (
                <button
                  key={k}
                  type="button"
                  aria-current={section === k ? "page" : undefined}
                  onClick={() => change(k)}
                >
                  <Icon size={17} />
                  {sections[k].label}
                </button>
              );
            })}
          </nav>
        </aside>
        <div className="mw-workspace">
          <div className="mw-crumb">
            <Link href="/">Mileway</Link>
            <ChevronRight size={13} />
            {label}
          </div>
          <div className="mw-heading">
            <div>
              <p className="mw-overline">{label}</p>
              <h1>{activeLabel}</h1>
            </div>
            {creatable.has(section) ? (
              <button
                className="mw-button primary"
                onClick={() => open({ kind: "edit" })}
              >
                <Plus size={16} /> Add {singular[section]}
              </button>
            ) : (
              <span className="mw-date">
                <CalendarDays size={15} />
                {new Date().toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "Asia/Kolkata",
                })}
              </span>
            )}
          </div>
          {notice && (
            <p className="mw-success" role="status">
              {notice}
            </p>
          )}
          {err ? (
            <div className="mw-card">
              <p role="alert" className="mw-error">
                {err.message}
              </p>
              <button
                className="mw-button"
                onClick={() =>
                  section === "overview"
                    ? overview.refetch()
                    : listPage.refetch()
                }
              >
                Try again
              </button>
            </div>
          ) : section === "overview" ? (
            overview.data ? (
              <OverviewPanel
                data={overview.data}
                onBookings={() => change("bookings")}
              />
            ) : (
              <Loading />
            )
          ) : listPage.data ? (
            <section className="mw-card mw-table-card">
              <div className="mw-card-head">
                <h3>{activeLabel}</h3>
                <span>
                  {listPage.data.total}{" "}
                  {listPage.data.total === 1 ? "record" : "records"}
                </span>
              </div>
              {listPage.data.items.length ? (
                <div className="mw-scroll">
                  <table>
                    <thead>
                      <tr>
                        {columns[section].map(([key, h]) => (
                          <th key={key}>{h}</th>
                        ))}
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listPage.data.items.map((i) => (
                        <tr key={i._id}>
                          {columns[section].map(([k]) => (
                            <td key={k}>
                              {k.includes("tatus") ||
                              ["active", "visible"].includes(k) ? (
                                <span
                                  className={
                                    "mw-pill " +
                                    ([
                                      "cancelled",
                                      "failed",
                                      "No",
                                      "expired",
                                    ].includes(value(i, k))
                                      ? "dim"
                                      : "")
                                  }
                                >
                                  {value(i, k)}
                                </span>
                              ) : (
                                value(i, k)
                              )}
                            </td>
                          ))}
                          <td>
                            <div className="mw-row-actions">
                              <button
                                onClick={() =>
                                  open({ kind: "detail", item: i })
                                }
                              >
                                View
                              </button>
                              {editable.has(section) && (
                                <button
                                  onClick={() =>
                                    open({ kind: "edit", item: i })
                                  }
                                >
                                  Edit
                                </button>
                              )}
                              {section === "trips" && (
                                <>
                                  <button
                                    onClick={() =>
                                      open({ kind: "manifest", item: i })
                                    }
                                  >
                                    Manifest
                                  </button>
                                  <button
                                    onClick={() =>
                                      open({ kind: "status", item: i })
                                    }
                                  >
                                    Status
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mw-empty">
                  No {activeLabel.toLowerCase()} to show.
                </p>
              )}
              <div className="mw-pagination">
                <button
                  className="mw-button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={14} />
                  Previous
                </button>
                <span>
                  Page {page} of{" "}
                  {Math.max(
                    1,
                    Math.ceil(listPage.data.total / listPage.data.pageSize),
                  )}
                </span>
                <button
                  className="mw-button"
                  disabled={
                    page * listPage.data.pageSize >= listPage.data.total
                  }
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </section>
          ) : (
            <Loading />
          )}
        </div>
      </div>
      <dialog
        ref={dialog}
        className="mw-dialog"
        onCancel={(e) => {
          e.preventDefault();
          if (!save.isPending) close();
        }}
        aria-labelledby="mw-dialog-title"
      >
        {action && (
          <>
            <div className="mw-dialog-head">
              <h2 id="mw-dialog-title">{title}</h2>
              <button
                aria-label="Close dialog"
                className="mw-x"
                onClick={close}
                disabled={save.isPending}
              >
                <X size={20} />
              </button>
            </div>
            {save.error && (
              <p role="alert" className="mw-error">
                {save.error.message}
              </p>
            )}
            {action.kind === "edit" && (
              <Editor
                key={section + (action.item?._id || "new")}
                role={role}
                section={section}
                item={action.item}
                pending={save.isPending}
                onSave={submit}
                onClose={close}
              />
            )}
            {action.kind === "manifest" && (
              <ManifestPanel role={role} id={action.item!._id} />
            )}
            {action.kind === "status" && (
              <form
                className="mw-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate({
                    path: "trips/" + action.item!._id,
                    method: "PUT",
                    data: { status: nextStatus },
                  });
                }}
              >
                <label className="mw-field">
                  Status
                  <select
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value)}
                  >
                    {["scheduled", "delayed", "cancelled", "completed"].map(
                      (s) => (
                        <option key={s}>{s}</option>
                      ),
                    )}
                  </select>
                </label>
                <button disabled={save.isPending} className="mw-button primary">
                  Update status
                </button>
              </form>
            )}
            {(action.kind === "delete" || action.kind === "cancel") && (
              <>
                <p className="mw-note">
                  {action.kind === "delete"
                    ? "This record will be permanently removed."
                    : "The seats will be released. Any refund is recorded as a simulation."}
                </p>
                <div className="mw-actions">
                  <button className="mw-button" onClick={close}>
                    Go back
                  </button>
                  <button
                    className="mw-button danger"
                    disabled={save.isPending}
                    onClick={() =>
                      save.mutate(
                        action.kind === "delete"
                          ? {
                              path: section + "/" + action.item!._id,
                              method: "DELETE",
                            }
                          : {
                              path: "bookings/" + action.item!._id + "/cancel",
                              method: "POST",
                            },
                      )
                    }
                  >
                    {action.kind === "delete"
                      ? "Remove record"
                      : "Cancel booking"}
                  </button>
                </div>
              </>
            )}
            {action.kind === "detail" && action.item && (
              <>
                <dl className="mw-details">
                  {Object.entries(action.item)
                    .filter(([k]) => !["_id", "__v"].includes(k))
                    .map(([k]) => (
                      <div key={k}>
                        <dt>{k.replace(/([A-Z])/g, " $1")}</dt>
                        <dd>{value(action.item!, k)}</dd>
                      </div>
                    ))}
                </dl>
                <div className="mw-actions">
                  {removable.has(section) && (
                    <button
                      className="mw-button danger"
                      onClick={() =>
                        open({ kind: "delete", item: action.item })
                      }
                    >
                      Remove {singular[section]}
                    </button>
                  )}
                  {section === "bookings" &&
                    role === "admin" &&
                    ["confirmed", "pending"].includes(
                      String(action.item.status),
                    ) && (
                      <button
                        className="mw-button danger"
                        onClick={() =>
                          open({ kind: "cancel", item: action.item })
                        }
                      >
                        Cancel booking
                      </button>
                    )}
                </div>
              </>
            )}
          </>
        )}
      </dialog>
    </main>
  );
}
