"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BusFront,
  ChevronDown,
  CircleHelp,
  CircleUserRound,
  LogOut,
  Menu,
  Ticket,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import styles from "./SiteChrome.module.css";

export function MilewayLogo() {
  return (
    <span className={styles.brand}>
      <svg width="38" height="38" viewBox="0 0 40 40" aria-hidden="true">
        <rect x="1" y="1" width="38" height="38" rx="11" fill="#254ddc" />
        <path
          d="m6.5 27.2 8.2-15h5.1l.8 7.4 4.1-7.4h5.1l3.1 15h-5.7l-1.6-8-4.3 8h-4.5l-1.1-8-4.1 8z"
          fill="#fff"
        />
      </svg>
      <span>Mileway</span>
    </span>
  );
}

export default function SiteChrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const [account, setAccount] = useState(false);
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    setMenu(false);
    setAccount(false);
  }, [path]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) {
        setMenu(false);
        setAccount(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(false);
        setAccount(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const navLinks = [
    {
      label: "Bus tickets",
      href: "/",
      icon: BusFront,
      current:
        path === "/" || path.startsWith("/search") || path.startsWith("/trip"),
    },
    {
      label: "My bookings",
      href: "/bookings/",
      icon: Ticket,
      current: path.startsWith("/bookings"),
    },
  ];
  const links = navLinks.map(({ href, label, icon: Icon, current }) => (
    <Link
      key={href}
      href={href}
      aria-current={current ? "page" : undefined}
      className={current ? styles.current : undefined}
      onClick={() => setMenu(false)}
    >
      <Icon size={17} aria-hidden="true" />
      {label}
    </Link>
  ));
  return (
    <div className={styles.site}>
      <a href="#mileway-content" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.header} ref={header}>
        <div className={styles.headerInner}>
          <Link href="/" aria-label="Mileway home" className={styles.logoLink}>
            <MilewayLogo />
          </Link>
          <nav className={styles.nav} aria-label="Main navigation">
            {links}
          </nav>
          <div className={styles.right}>
            <Link className={styles.help} href="/help/">
              <CircleHelp size={17} />
              Help
            </Link>
            <span className={styles.divider} />
            {user ? (
              <div className={styles.account}>
                <button
                  className={styles.signIn}
                  type="button"
                  aria-expanded={account}
                  aria-controls="account-menu"
                  onClick={() => {
                    setAccount(!account);
                    setMenu(false);
                  }}
                >
                  <CircleUserRound size={17} />
                  <span>{user.name.split(" ")[0]}</span>
                  <ChevronDown size={14} />
                </button>
                {account && (
                  <div className={styles.drop} id="account-menu">
                    <Link href="/account/" onClick={() => setAccount(false)}>
                      My account
                    </Link>
                    {user.role !== "customer" && (
                      <Link
                        href={"/" + user.role + "/"}
                        onClick={() => setAccount(false)}
                      >
                        {user.role === "admin" ? "Admin" : "Operator"} dashboard
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await logout();
                          setAccount(false);
                          toast.success("You have signed out.");
                        } catch {
                          toast.error("Could not sign out. Try again.");
                        }
                      }}
                    >
                      <LogOut size={15} />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link className={styles.signIn} href="/login/">
                <CircleUserRound size={17} />
                <span>Sign in</span>
              </Link>
            )}
            <button
              type="button"
              className={styles.mobileToggle}
              aria-label={menu ? "Close menu" : "Open menu"}
              aria-expanded={menu}
              aria-controls="mobile-menu"
              onClick={() => {
                setMenu(!menu);
                setAccount(false);
              }}
            >
              {menu ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>
        {menu && (
          <nav
            className={styles.mobileNav}
            id="mobile-menu"
            aria-label="Mobile navigation"
          >
            {links}
            <Link href="/help/" onClick={() => setMenu(false)}>
              <CircleHelp size={17} />
              Help and support
            </Link>
          </nav>
        )}
      </header>
      <div id="mileway-content" className={styles.content} tabIndex={-1}>
        {children}
      </div>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div>
            <Link href="/" aria-label="Mileway home">
              <MilewayLogo />
            </Link>
            <p>Intercity bus travel across India.</p>
          </div>
          <div className={styles.footerGroup}>
            <h2>Travel</h2>
            <Link href="/">Search buses</Link>
            <Link href="/bookings/">My bookings</Link>
            <Link href="/account/">My account</Link>
          </div>
          <div className={styles.footerGroup}>
            <h2>Information</h2>
            <Link href="/help/">Help and support</Link>
            <Link href="/privacy/">Privacy policy</Link>
            <Link href="/terms/">Terms and conditions</Link>
          </div>
        </div>
        <div className={styles.footNote}>
          <span>© Mileway</span>
          <span>Demo platform · Fictional trips, operators, and tickets</span>
        </div>
      </footer>
    </div>
  );
}
