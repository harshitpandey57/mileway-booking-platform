import { Suspense } from "react";
import { AuthScreen } from "@/features/account/auth-screens";
export default function Login() {
  return (
    <Suspense fallback={<p>Loading sign in…</p>}>
      <AuthScreen />
    </Suspense>
  );
}
