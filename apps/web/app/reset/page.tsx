import { Suspense } from "react";
import { ResetScreen } from "@/features/account/auth-screens";
export default function Reset() {
  return (
    <Suspense fallback={<p>Loading password reset…</p>}>
      <ResetScreen />
    </Suspense>
  );
}
