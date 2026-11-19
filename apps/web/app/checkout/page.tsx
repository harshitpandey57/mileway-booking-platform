import { Suspense } from "react";
import Checkout from "@/features/booking/Checkout";
import "@/features/booking/journey.css";

export const metadata = { title: "Checkout · Mileway" };

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="bk-shell" aria-busy="true">
          Loading…
        </main>
      }
    >
      <Checkout />
    </Suspense>
  );
}
