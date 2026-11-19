"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BusFront,
  ChevronLeft,
  ChevronRight,
  Ticket,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  AlertBox,
  DateTag,
  Empty,
  Loading,
  LoginPrompt,
  RouteName,
  SectionCrumb,
} from "./common";
import { Booking, inr, ticketHref, timeText } from "./model";

export default function Bookings() {
  const { user, loading } = useAuth(),
    [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ["my-bookings", user?.email, page],
    queryFn: () => api<Booking[]>("/bookings?page=" + page + "&limit=10"),
    enabled: !!user,
    refetchOnMount: "always",
  });
  return (
    <main className="bk-shell">
      <SectionCrumb label="My bookings" />
      <div className="bk-heading">
        <div>
          <h1>My bookings</h1>
          <p>Your journeys, tickets and payment details.</p>
        </div>
        <Link href="/" className="bk-secondary">
          <BusFront size={17} />
          Find a bus
        </Link>
      </div>
      {loading ? (
        <Loading />
      ) : !user ? (
        <LoginPrompt next="/bookings/" />
      ) : list.isPending ? (
        <Loading />
      ) : list.error ? (
        <AlertBox error={list.error} />
      ) : list.data?.length ? (
        <div className="bk-history-list">
          {list.data.map((b) => (
            <article className="bk-box bk-history" key={b._id}>
              <div className="bk-history-icon">
                <Ticket size={24} />
              </div>
              <div className="bk-history-main">
                <span className={"bk-status status-" + b.status}>
                  {b.status}
                </span>
                <h2>
                  <RouteName {...b} />
                </h2>
                <p>
                  {b.operatorName} · {b.busName}
                </p>
                <div className="bk-history-meta">
                  <DateTag date={b.date} />
                  <i className="bk-dot" />
                  {timeText(b.departureAt)} IST
                  <i className="bk-dot" />
                  Seats {b.seats.join(", ")}
                </div>
              </div>
              <div className="bk-history-action">
                <strong>{inr(b.total)}</strong>
                <small>{b.reference}</small>
                <Link href={ticketHref(b._id)} className="bk-link">
                  View booking <ArrowRight size={15} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={page > 1 ? "No more bookings" : "No bookings yet"}
          href="/"
          action="Search buses"
        >
          {page === 1 ? "Choose a route to book your first demo journey." : ""}
        </Empty>
      )}
      {(page > 1 || list.data?.length === 10) && (
        <div className="bk-page-nav">
          <button
            className="bk-secondary"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={15} />
            Previous
          </button>
          <span>Page {page}</span>
          <button
            className="bk-secondary"
            disabled={(list.data?.length || 0) < 10}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </main>
  );
}
