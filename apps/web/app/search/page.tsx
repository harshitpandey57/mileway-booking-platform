import { Suspense } from "react";
import Search from "@/features/booking/Search";
import "@/features/booking/journey.css";

export const metadata = { title: "Search buses · Mileway" };

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="bk-shell" aria-busy="true">
          Loading…
        </main>
      }
    >
      <Search />
    </Suspense>
  );
}
