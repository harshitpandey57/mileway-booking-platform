import { Suspense } from "react";
import Ticket from "@/features/booking/Ticket";
import "@/features/booking/journey.css";

export const metadata = { title: "Booking details · Mileway" };

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="bk-shell" aria-busy="true">
          Loading…
        </main>
      }
    >
      <Ticket />
    </Suspense>
  );
}
