import { Suspense } from "react";
import Bookings from "@/features/booking/Bookings";
import "@/features/booking/journey.css";

export const metadata = { title: "My bookings · Mileway" };

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="bk-shell" aria-busy="true">
          Loading…
        </main>
      }
    >
      <Bookings />
    </Suspense>
  );
}
