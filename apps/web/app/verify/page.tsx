import { Suspense } from "react";
import Verify from "@/features/booking/Verify";
import "@/features/booking/journey.css";

export const metadata = { title: "Verify a ticket · Mileway" };

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="bk-shell" aria-busy="true">
          Loading…
        </main>
      }
    >
      <Verify />
    </Suspense>
  );
}
