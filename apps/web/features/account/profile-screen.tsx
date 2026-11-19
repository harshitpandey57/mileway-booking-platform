"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  Bookmark,
  Clock3,
  Contact,
  KeyRound,
  MapPin,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  AccountShell,
  Heading,
  SignInGate,
  Notice,
  type Profile,
  type RoutePair,
  json,
  errorMessage,
} from "./common";
type Alert = { _id: string; title: string; message: string; read: boolean };
const sections = [
  { key: "profile", label: "Profile", icon: UserRound },
  { key: "passengers", label: "Saved travellers", icon: UsersRound },
  { key: "routes", label: "Routes & searches", icon: Bookmark },
  { key: "alerts", label: "Notifications", icon: Bell },
  { key: "security", label: "Security", icon: KeyRound },
];
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="ac-card">
      <h2>{title}</h2>
      {description && <p className="ac-muted">{description}</p>}
      {children}
    </section>
  );
}
function ProfileContent({
  user,
  reload,
}: {
  user: Profile;
  reload: () => Promise<unknown>;
}) {
  const [section, setSection] = useState("profile");
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const alerts = useQuery({
    queryKey: ["account-alerts", user._id, page],
    queryFn: () =>
      api<Alert[]>("/users/me/notifications?limit=10&page=" + page),
    enabled: section === "alerts",
  });
  async function act(effect: () => Promise<unknown>, message: string) {
    setBusy(true);
    setStatus("");
    setFailure("");
    try {
      await effect();
      await reload();
      setStatus(message);
      return true;
    } catch (e) {
      setFailure(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function form(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const element = e.currentTarget;
    return { fields: Object.fromEntries(new FormData(element)), element };
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const routeUrl = (pair: RoutePair, date?: string) =>
    "/search/?" +
    new URLSearchParams({
      from: pair.from,
      to: pair.to,
      date: date && date >= today ? date : today,
    });
  return (
    <div className="ac-dash">
      <nav aria-label="Account settings" className="ac-dashnav">
        {sections.map((s) => (
          <button
            key={s.key}
            className={s.key === section ? "ac-nav-active" : ""}
            aria-current={s.key === section ? "page" : undefined}
            onClick={() => {
              setSection(s.key);
              setFailure("");
              setStatus("");
            }}
          >
            <s.icon size={18} />
            {s.label}
          </button>
        ))}
        <Link href="/bookings/">
          My bookings
          <ArrowRight size={15} />
        </Link>
      </nav>
      <div className="ac-panels">
        <Notice message={status} />
        <Notice message={failure} error />
        {section === "profile" && (
          <Section
            title="Personal details"
            description="Your contact details for booking and account updates."
          >
            <form
              className="ac-form"
              onSubmit={(e) => {
                const { fields } = form(e);
                void act(
                  () => api("/users/me", json("PATCH", fields)),
                  "Your profile has been updated.",
                );
              }}
            >
              <label>
                Full name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  defaultValue={user.name}
                  autoComplete="name"
                />
              </label>
              <label>
                Email address
                <input value={user.email} readOnly type="email" />
                <small>Your sign-in email address.</small>
              </label>
              <label>
                Contact number
                <input
                  name="phone"
                  defaultValue={user.phone}
                  autoComplete="tel"
                  type="tel"
                  maxLength={20}
                />
              </label>
              <button className="ac-primary" disabled={busy}>
                Save changes
              </button>
            </form>
          </Section>
        )}
        {section === "passengers" && (
          <>
            <Section
              title="Saved travellers"
              description="Keep passenger details handy for your next trip."
            >
              {user.savedPassengers.length === 0 ? (
                <p className="ac-empty">
                  You haven’t saved any travellers yet.
                </p>
              ) : (
                <ul className="ac-records">
                  {user.savedPassengers.map((p) => (
                    <li key={p._id}>
                      <span className="ac-record-icon">
                        <Contact size={19} />
                      </span>
                      <div>
                        <b>{p.name}</b>
                        <small>Age {p.age}</small>
                      </div>
                      <button
                        disabled={busy}
                        className="ac-icon-btn"
                        aria-label={"Remove " + p.name}
                        onClick={() =>
                          void act(
                            () =>
                              api(
                                "/users/me/passengers/" + p._id,
                                json("DELETE"),
                              ),
                            "Traveller removed.",
                          )
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Add a traveller">
              <form
                className="ac-form"
                onSubmit={async (e) => {
                  const { fields, element } = form(e);
                  if (
                    await act(
                      () => api("/users/me/passengers", json("POST", fields)),
                      "Traveller saved.",
                    )
                  )
                    element.reset();
                }}
              >
                <div className="ac-fields">
                  <label>
                    Passenger name
                    <input name="name" required minLength={2} maxLength={100} />
                  </label>
                  <label>
                    Age
                    <input
                      name="age"
                      type="number"
                      required
                      min={1}
                      max={120}
                    />
                  </label>
                </div>
                <button disabled={busy} className="ac-primary">
                  Save traveller
                </button>
              </form>
            </Section>
          </>
        )}
        {section === "routes" && (
          <>
            <Section title="Favourite routes">
              {user.favoriteRoutes.length === 0 ? (
                <p className="ac-empty">
                  Save a route from search results to find it here.
                </p>
              ) : (
                <ul className="ac-records">
                  {user.favoriteRoutes.map((r) => (
                    <li key={JSON.stringify(r)}>
                      <MapPin size={18} />
                      <Link href={routeUrl(r)}>
                        {r.from} → {r.to}
                      </Link>
                      <button
                        className="ac-icon-btn"
                        aria-label={"Remove " + r.from + " to " + r.to}
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () => api("/users/me/favorites", json("DELETE", r)),
                            "Route removed.",
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Recent searches">
              {user.searchHistory.length === 0 ? (
                <p className="ac-empty">
                  Your recent searches will appear here.
                </p>
              ) : (
                <ul className="ac-records">
                  {user.searchHistory.map((r) => (
                    <li key={JSON.stringify(r)}>
                      <Clock3 size={18} />
                      <Link href={routeUrl(r, r.date)}>
                        {r.from} → {r.to}
                        <small>{r.date}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
        {section === "alerts" && (
          <Section title="Notifications">
            {alerts.isPending ? (
              <p>Loading notifications…</p>
            ) : alerts.isError ? (
              <Notice message={errorMessage(alerts.error)} error />
            ) : alerts.data.length === 0 ? (
              <p className="ac-empty">You’re all caught up.</p>
            ) : (
              <ul className="ac-records">
                {alerts.data.map((n) => (
                  <li key={n._id}>
                    <Bell size={17} />
                    <div>
                      <b>{n.title}</b>
                      <small>{n.message}</small>
                    </div>
                    {!n.read && (
                      <button
                        className="ac-text"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await api(
                              "/users/me/notifications/" + n._id,
                              json("PATCH"),
                            );
                            await alerts.refetch();
                          }, "Notification marked as read.")
                        }
                      >
                        Mark read
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {(page > 1 || alerts.data?.length === 10) && (
              <div className="ac-pagination">
                <button
                  className="ac-text"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <span>Page {page}</span>
                <button
                  className="ac-text"
                  disabled={alerts.data?.length !== 10}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </Section>
        )}
        {section === "security" && (
          <Section
            title="Change password"
            description="Updating your password signs out your other sessions."
          >
            <form
              className="ac-form"
              onSubmit={async (e) => {
                const { fields, element } = form(e);
                if (
                  await act(
                    () => api("/auth/change-password", json("POST", fields)),
                    "Your password has been changed.",
                  )
                )
                  element.reset();
              }}
            >
              <label>
                Current password
                <input
                  required
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                />
              </label>
              <label>
                New password
                <input
                  required
                  name="newPassword"
                  type="password"
                  minLength={10}
                  autoComplete="new-password"
                />
                <small>Use at least 10 characters.</small>
              </label>
              <button disabled={busy} className="ac-primary">
                Update password
              </button>
            </form>
          </Section>
        )}
      </div>
    </div>
  );
}
export default function ProfileScreen() {
  const { user, loading, refresh } = useAuth();
  const profile = useQuery({
    queryKey: ["account-profile", user?.email],
    enabled: !!user,
    queryFn: () => api<Profile>("/users/me"),
  });
  return (
    <AccountShell title="My account">
      <Heading
        title="My account"
        description={
          user ? "Manage your profile and travel preferences." : undefined
        }
      />
      {loading ? (
        <div className="ac-skeleton" aria-label="Loading account" />
      ) : !user ? (
        <SignInGate next="/account/" />
      ) : profile.isError ? (
        <Notice error message={errorMessage(profile.error)} />
      ) : !profile.data ? (
        <div className="ac-skeleton" aria-label="Loading account" />
      ) : (
        <ProfileContent
          user={profile.data}
          reload={async () => {
            await profile.refetch();
            await refresh();
          }}
        />
      )}
    </AccountShell>
  );
}
