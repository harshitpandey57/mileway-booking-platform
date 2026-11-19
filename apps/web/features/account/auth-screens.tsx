"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { z } from "zod";
import {
  emailSchema,
  loginSchema,
  registerSchema,
  passwordSchema,
} from "@mileway/shared/schemas/auth";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  AccountShell,
  errorMessage,
  json,
  Notice,
  TravelPanel,
} from "./common";

type Mode = "login" | "register" | "forgot";
function safeNext(raw: string | null) {
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    /[\x00-\x1f]/.test(raw)
  )
    return "/account/";
  return raw;
}
const messages = {
  login: ["Welcome back", "Sign in to manage your journeys.", "Sign in"],
  register: [
    "Create an account",
    "Save your travel details and book your next trip.",
    "Create account",
  ],
  forgot: [
    "Reset your password",
    "Enter the email address you use with Mileway.",
    "Send reset link",
  ],
};
export function AuthScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<Mode>(
    params.get("mode") === "register" ? "register" : "login",
  );
  const [show, setShow] = useState(false);
  const [failure, setFailure] = useState("");
  const [status, setStatus] = useState("");
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<{ name: string; email: string; password: string }>();
  const change = (value: Mode) => {
    setMode(value);
    setFailure("");
    setStatus("");
    setShow(false);
  };
  const submit = handleSubmit(async (values) => {
    setFailure("");
    setStatus("");
    try {
      if (mode === "forgot") {
        await api(
          "/auth/forgot-password",
          json("POST", { email: emailSchema.parse(values.email) }),
        );
        setStatus(
          "If this email has an active account, a reset link has been sent. The link expires in 15 minutes.",
        );
      } else {
        const fields =
          mode === "register"
            ? registerSchema.parse(values)
            : loginSchema.parse(values);
        await api("/auth/" + mode, json("POST", fields));
        await refresh();
        router.replace(safeNext(params.get("next")));
      }
    } catch (err) {
      setFailure(
        err instanceof z.ZodError ? err.issues[0].message : errorMessage(err),
      );
    }
  });
  return (
    <AccountShell title={messages[mode][2]}>
      <div className="ac-auth">
        <TravelPanel />
        <section className="ac-auth-inner">
          <div className="ac-icon">
            <LockKeyhole size={21} />
          </div>
          <h1>{messages[mode][0]}</h1>
          <p>{messages[mode][1]}</p>
          <form onSubmit={submit} className="ac-form">
            {mode === "register" && (
              <label>
                Full name
                <input
                  required
                  maxLength={100}
                  autoComplete="name"
                  {...register("name")}
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                required
                autoComplete="email"
                {...register("email")}
              />
            </label>
            {mode !== "forgot" && (
              <label>
                Password
                <span className="ac-secret">
                  <input
                    type={show ? "text" : "password"}
                    required
                    autoComplete={
                      mode === "register" ? "new-password" : "current-password"
                    }
                    minLength={mode === "register" ? 10 : 1}
                    {...register("password")}
                  />
                  <button
                    type="button"
                    aria-label={show ? "Hide password" : "Show password"}
                    onClick={() => setShow(!show)}
                  >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
                {mode === "register" && (
                  <small>Use at least 10 characters.</small>
                )}
              </label>
            )}
            {mode === "login" && (
              <button
                className="ac-text ac-right"
                type="button"
                onClick={() => change("forgot")}
              >
                Forgot password?
              </button>
            )}
            <Notice message={failure} error />
            <Notice message={status} />
            <button className="ac-primary" disabled={isSubmitting}>
              {isSubmitting ? "Please wait…" : messages[mode][2]}
              <ArrowRight size={16} />
            </button>
          </form>
          <div className="ac-auth-switch">
            {mode === "login" ? (
              <>
                New to Mileway?{" "}
                <button className="ac-text" onClick={() => change("register")}>
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button className="ac-text" onClick={() => change("login")}>
                  Sign in
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </AccountShell>
  );
}
export function ResetScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<{ password: string }>({
    resolver: zodResolver(z.object({ password: passwordSchema })),
  });
  const token = params.get("token");
  return (
    <AccountShell title="Password reset">
      <div className="ac-auth">
        <TravelPanel />
        <section className="ac-auth-inner">
          <h1>Set a new password</h1>
          {token ? (
            <form
              className="ac-form"
              onSubmit={handleSubmit(async ({ password }) => {
                setMessage("");
                try {
                  await api(
                    "/auth/reset-password",
                    json("POST", { token, password }),
                  );
                  router.replace("/login/");
                } catch (err) {
                  setMessage(errorMessage(err));
                }
              })}
            >
              <label>
                New password
                <input
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  {...register("password")}
                />
                <small>
                  {errors.password?.message || "Use at least 10 characters."}
                </small>
              </label>
              <Notice message={message} error />
              <button className="ac-primary" disabled={isSubmitting}>
                Set password and sign in
                <ArrowRight size={16} />
              </button>
            </form>
          ) : (
            <p>Use the link in your password reset email to continue.</p>
          )}
        </section>
      </div>
    </AccountShell>
  );
}
