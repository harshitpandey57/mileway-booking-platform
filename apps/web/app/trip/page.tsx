import { Suspense } from "react";
import Seats from "@/features/booking/Seats";
import "@/features/booking/journey.css";

export const metadata = { title: "Choose seats · Mileway" };

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="bk-shell" aria-busy="true">
          Loading…
        </main>
      }
    >
      <Seats />
    </Suspense>
  );
}
