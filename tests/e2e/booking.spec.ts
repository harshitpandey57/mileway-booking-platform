import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

test("a customer searches, selects seats, pays, downloads the ticket and cancels", async ({
  page,
  browser,
  baseURL,
}) => {
  const email = "journey-" + randomUUID() + "@example.test";
  const password = "Journey-" + randomBytes(18).toString("base64url");
  const day = new Date(Date.now() + 3 * 86400000 + 19800000)
    .toISOString()
    .slice(0, 10);

  await page.goto("/");
  await page.getByLabel("Travel date").fill(day);
  await page.getByRole("button", { name: "Search buses" }).click();
  await expect(page).toHaveURL(/\/search\//);
  await page.getByRole("link", { name: "View seats" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Choose your seats" }),
  ).toBeVisible();
  const firstSeat = page.getByRole("button", { name: /^Seat .+, ₹/ }).first();
  const seatName = await firstSeat.getAttribute("aria-label");
  await firstSeat.click();
  await page.getByRole("button", { name: "Continue to passengers" }).click();

  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill("Journey Tester");
  await page.getByLabel("Email address").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: seatName!, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Continue to passengers" }).click();
  await page.getByLabel("Passenger 1 name").fill("Asha Shah");
  await page.getByLabel("Passenger 1 age").fill("28");
  await page.getByLabel("Mobile number").fill("9876543210");
  await expect(page.getByLabel("Email address")).toHaveValue(email);
  await page.getByLabel("Boarding point").selectOption({ index: 1 });
  await page.getByLabel("Dropping point").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Review booking" }).click();
  await page.getByRole("button", { name: "Pay with demo" }).click();
  await page.getByRole("button", { name: "Simulate failure" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Simulated payment failed" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pay with demo" }).click();
  await page.getByRole("button", { name: "Simulate success" }).click();
  await expect(
    page.getByRole("heading", { name: "Booking confirmed" }),
  ).toBeVisible();

  const downloaded = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF" }).click();
  const download = await downloaded;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/^MW-[A-F0-9]+\.pdf$/);
  const file = await download.path();
  expect((await readFile(file!)).subarray(0, 5).toString()).toBe("%PDF-");

  const ref = download.suggestedFilename().replace(/\.pdf$/, "");
  const verifyHref = await page
    .getByRole("link", { name: "Verify ticket" })
    .getAttribute("href");
  const fresh = await browser.newContext({ baseURL });
  try {
    const returning = await fresh.newPage();
    // Anyone holding the ticket QR can verify it. Passenger contact details are private.
    await returning.goto(verifyHref!);
    await expect(returning.getByText("Verified demo booking")).toBeVisible();
    await expect(returning.getByText(ref, { exact: true })).toBeVisible();
    await expect(returning.getByText(email)).toHaveCount(0);
    await expect(returning.getByText("Asha Shah")).toHaveCount(0);

    await returning.goto("/login/?next=%2Fbookings%2F");
    await returning.getByLabel("Email address").fill(email);
    await returning.locator('input[name="password"]').fill(password);
    await returning
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    const booking = returning.getByRole("article").filter({ hasText: ref });
    await expect(booking).toBeVisible();
    await booking.getByRole("link", { name: "View booking" }).click();
    await returning.getByRole("button", { name: "Cancel booking" }).click();
    await returning
      .getByRole("button", { name: "Confirm cancellation" })
      .click();
    await expect(
      returning.getByRole("heading", { name: "Booking cancelled" }),
    ).toBeVisible();
    await returning.goto(verifyHref!);
    await expect(returning.getByText("Inactive booking")).toBeVisible();
  } finally {
    await fresh.close();
  }
});
