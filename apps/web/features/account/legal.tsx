import Link from "next/link";
import { AccountShell, Heading } from "./common";
const privacy = [
  [
    "Information you provide",
    "Mileway stores your account name, email address, password hash and optional contact number. Booking records include journey details, selected seats, passenger names and ages, contact details and payment references. Use fictional passenger details when trying this demonstration.",
  ],
  [
    "How your information is used",
    "Account and booking data supports sign-in, seat reservations, ticket generation, cancellation, support and trip management. Signed-in travellers can save routes and passenger details. Operators can view passenger manifests for their own trips. Administrators can manage platform records.",
  ],
  [
    "Cookies and service providers",
    "A first-party session cookie identifies signed-in users. The deployment’s MongoDB database stores application records. When Razorpay test checkout is enabled, Razorpay handles payment entry and sends verification details to Mileway. The application does not store card numbers or security codes.",
  ],
  [
    "Ticket verification",
    "The public QR verification link displays limited ticket validity and journey information. Keep the full PDF and your account credentials private.",
  ],
  [
    "Your controls",
    "Manage saved travellers, favourites, profile details and your password under My account. To ask about account access, data retention or deletion, send a request through the help centre.",
  ],
];
const terms = [
  [
    "Using Mileway",
    "Mileway is a proof of concept for exploring an intercity bus booking experience. Operators, trips, inventory and fares are fictional. A confirmed demo ticket has no value for travel.",
  ],
  [
    "Account access",
    "Provide a reachable test email if you want to receive password reset messages from a configured deployment. Protect your password and use only account features you are authorised to access.",
  ],
  [
    "Fares and reservations",
    "The trip’s displayed seat prices, eligible discounts and final total are calculated by the server. Selected seats are held for a limited time during checkout. Availability is rechecked before a booking can be confirmed.",
  ],
  [
    "Payments, cancellation and refunds",
    "Checkout uses Razorpay test payments or the explicitly labelled local simulation when enabled. Do not enter live card or bank credentials. Each booking has a cancellation policy. Refund records in this demonstration simulate the amount due and do not transfer money.",
  ],
  [
    "Reviews and support",
    "Submit reviews only for your own eligible journeys. Keep passenger privacy in mind when writing reviews and support messages. Contact the help centre for questions about this demonstration.",
  ],
];
export function Legal({ page }: { page: "privacy" | "terms" }) {
  const title = page === "privacy" ? "Privacy policy" : "Terms and conditions";
  return (
    <AccountShell title={title}>
      <article className="ac-legal">
        <Heading title={title} />
        {(page === "privacy" ? privacy : terms).map(([h, p]) => (
          <section key={h}>
            <h2>{h}</h2>
            <p>{p}</p>
          </section>
        ))}
        <Link className="ac-text" href="/help/">
          Visit the help centre →
        </Link>
      </article>
    </AccountShell>
  );
}
