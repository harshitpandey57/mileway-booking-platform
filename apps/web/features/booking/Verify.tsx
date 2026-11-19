"use client";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, CircleX, QrCode } from "lucide-react";
import { api } from "@/lib/api";
import {
  AlertBox,
  DateTag,
  Empty,
  Loading,
  RouteName,
  SectionCrumb,
} from "./common";
import { timeText, Verification } from "./model";
export default function Verify() {
  const token = useSearchParams().get("token") || "";
  const check = useQuery({
    queryKey: ["verify-ticket", token],
    queryFn: () =>
      api<Verification>("/tickets/verify/" + encodeURIComponent(token)),
    enabled: !!token,
    retry: false,
  });
  const b = check.data;
  return (
    <main className="bk-shell bk-narrow">
      <SectionCrumb label="Ticket verification" />
      <div className="bk-heading">
        <div>
          <h1>Ticket verification</h1>
        </div>
      </div>
      {!token ? (
        <Empty title="Scan a ticket QR code">
          Use the QR code on a Mileway PDF ticket to check its current status.
        </Empty>
      ) : check.isPending ? (
        <Loading />
      ) : check.error || !b ? (
        <AlertBox error={check.error} />
      ) : (
        <article className="bk-box bk-padding">
          <span className={"bk-status status-" + b.status}>
            {b.valid ? <CircleCheck size={16} /> : <CircleX size={16} />}{" "}
            {b.valid ? "Verified demo booking" : "Inactive booking"}
          </span>
          <h2 className="bk-ticket-route">
            <RouteName {...b} />
          </h2>
          <DateTag date={b.date} />
          <dl className="bk-list">
            <div>
              <dt>Reference</dt>
              <dd>{b.reference}</dd>
            </div>
            <div>
              <dt>Operator</dt>
              <dd>{b.operatorName}</dd>
            </div>
            <div>
              <dt>Departure (IST)</dt>
              <dd>{timeText(b.departureAt)}</dd>
            </div>
            <div>
              <dt>Seats</dt>
              <dd>{b.seatCount}</dd>
            </div>
            <div>
              <dt>Booking status</dt>
              <dd>{b.status}</dd>
            </div>
          </dl>
          <div className="bk-demo-note">
            <QrCode size={17} />
            This verification covers a demo booking. No travel entitlement.
          </div>
        </article>
      )}
    </main>
  );
}
