"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronDown, LifeBuoy, Ticket } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  AccountShell,
  Heading,
  Notice,
  SignInGate,
  errorMessage,
  json,
} from "./common";
const faq = [
  [
    "Where do I find my ticket?",
    "Open My bookings, choose a confirmed booking, and download its PDF ticket. The QR code opens its verification record.",
  ],
  [
    "What happens if my seat hold expires?",
    "Return to seat selection and check availability again. The seat may be available to another customer once the hold expires.",
  ],
  [
    "How do cancellations work?",
    "Open your booking to see its cancellation policy and available actions. Eligible cancellations release the seats and create a simulated refund record.",
  ],
  [
    "Can I travel with a Mileway ticket?",
    "Mileway uses fictional trips and test payments. Tickets give you a way to try the booking and verification experience.",
  ],
];
type TicketData = {
  _id: string;
  subject: string;
  message: string;
  status: string;
  reply: string;
  createdAt: string;
};
export default function HelpScreen() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState(1);
  const tickets = useQuery({
    queryKey: ["customer-support", user?.email, page],
    enabled: !!user,
    queryFn: () => api<TicketData[]>("/support?limit=10&page=" + page),
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  return (
    <AccountShell title="Help centre">
      <Heading
        title="Help centre"
        description="Find answers about bookings, payments and tickets."
      />
      <div className="ac-help">
        <section className="ac-card">
          <div className="ac-icon">
            <LifeBuoy size={22} />
          </div>
          <h2>Booking questions</h2>
          <div className="ac-faq">
            {faq.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <ChevronDown size={16} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
          <Link className="ac-secondary" href="/bookings/">
            <Ticket size={16} />
            My bookings
          </Link>
        </section>
        <div className="ac-panels">
          {loading ? (
            <div className="ac-skeleton" />
          ) : !user ? (
            <SignInGate next="/help/" title="Sign in to contact support" />
          ) : (
            <>
              <section className="ac-card">
                <h2>Contact support</h2>
                <p className="ac-muted">
                  Include your booking reference if your question concerns a
                  trip.
                </p>
                <form
                  className="ac-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const element = e.currentTarget;
                    const fields = Object.fromEntries(new FormData(element));
                    setBusy(true);
                    setMessage("");
                    setFailure("");
                    try {
                      await api("/support", json("POST", fields));
                      element.reset();
                      setPage(1);
                      await tickets.refetch();
                      setMessage("Your request has been submitted.");
                    } catch (err) {
                      setFailure(errorMessage(err));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    Subject
                    <input
                      name="subject"
                      required
                      minLength={4}
                      maxLength={120}
                    />
                  </label>
                  <label>
                    Message
                    <textarea
                      name="message"
                      required
                      rows={4}
                      minLength={10}
                      maxLength={3000}
                    />
                  </label>
                  <Notice message={message} />
                  <Notice message={failure} error />
                  <button className="ac-primary" disabled={busy}>
                    {busy ? "Submitting…" : "Send request"}
                  </button>
                </form>
              </section>
              <section className="ac-card">
                <h2>My support requests</h2>
                {tickets.isPending ? (
                  <p>Loading requests…</p>
                ) : tickets.isError ? (
                  <Notice error message={errorMessage(tickets.error)} />
                ) : tickets.data.length === 0 ? (
                  <p className="ac-empty">You have no support requests.</p>
                ) : (
                  tickets.data.map((t) => (
                    <details className="ac-request" key={t._id}>
                      <summary>
                        {t.subject}
                        <small>{t.status.replace("_", " ")}</small>
                      </summary>
                      <p>{t.message}</p>
                      {t.reply && (
                        <div className="ac-response">
                          <b>Support reply</b>
                          <p>{t.reply}</p>
                        </div>
                      )}
                    </details>
                  ))
                )}
                {(page > 1 || tickets.data?.length === 10) && (
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
                      disabled={tickets.data?.length !== 10}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </AccountShell>
  );
}
