import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";

async function signIn(page: Page, role: "admin" | "operator") {
  const email =
    role === "admin" ? "admin@mileway.test" : "operator1@mileway.test";
  await page.goto("/login/?next=" + encodeURIComponent("/" + role + "/"));
  await page.getByLabel("Email", { exact: false }).fill(email);
  await page
    .locator('input[name="password"]')
    .fill(process.env.E2E_SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Net revenue", { exact: true })).toBeVisible();
}

test("administrator creates and inspects a coupon", async ({ page }) => {
  await signIn(page, "admin");
  await page
    .getByRole("navigation", { name: "Administration sections" })
    .getByRole("button", { name: "Coupons" })
    .click();
  await page.getByRole("button", { name: "Add coupon" }).click();
  const dialog = page.getByRole("dialog"),
    code = "STAFF" + randomBytes(4).toString("hex").toUpperCase();
  await dialog.getByLabel("Coupon code").fill(code);
  await dialog
    .getByLabel("Offer description")
    .fill("Fictional travel discount");
  await dialog.getByLabel("Discount (%)", { exact: true }).fill("10");
  await dialog.getByLabel("Maximum discount (₹)").fill("200");
  await dialog.getByLabel("Minimum fare (₹)").fill("500");
  await dialog.getByLabel("Valid until (India time)").fill("2031-05-10T16:00");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("cell", { name: code, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("row")
    .filter({ hasText: code })
    .getByRole("button", { name: "View" })
    .click();
  await expect(dialog.getByText("Fictional travel discount")).toBeVisible();
});
test("operator inspects a departure and opens its manifest", async ({
  page,
}) => {
  await signIn(page, "operator");
  await page
    .getByRole("navigation", { name: "Operator workspace sections" })
    .getByRole("button", { name: "Departures" })
    .click();
  await page
    .getByRole("button", { name: "Manifest", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Passenger manifest" }),
  ).toBeVisible();
  await expect(
    dialog.getByText(/There are no confirmed passengers|Download CSV/),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("navigation", { name: "Operator workspace sections" })
    .getByRole("button", { name: "Fleet" })
    .click();
  await expect(page.getByRole("button", { name: "Add bus" })).toBeVisible();
  await page.goto("/admin/");
  await expect(
    page.getByText("This account does not have access to this workspace."),
  ).toBeVisible();
});
