// End-to-end test: drives every console operation in a real browser against a real card-agent API.
//
//   CONSOLE_URL=http://localhost:5173  ADMIN_TOKEN=...  SAMPLES=./samples  CHROME=/usr/bin/google-chrome \
//   node e2e/console.e2e.mjs
//
// Prerequisite: the API is seeded with scripts/seed_demo.py (programmes ae.alpha + sa.beta, sample
// photos in $SAMPLES, an evaluation set). Writes screenshots to $SHOTS (default e2e/screenshots).
// NEVER run against production: it creates, edits and deletes programmes, runs and settings.
import { chromium } from "playwright-core"
import fs from "node:fs"
import path from "node:path"

const URL = process.env.CONSOLE_URL ?? "http://localhost:5173"
const TOKEN = process.env.ADMIN_TOKEN ?? ""
const SAMPLES = process.env.SAMPLES ?? "samples"
const SHOTS = process.env.SHOTS ?? "e2e/screenshots"
const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome"
fs.mkdirSync(SHOTS, { recursive: true })

const results = []
let page
const sample = (f) => path.join(SAMPLES, f)
const text = () => page.evaluate(() => document.body.innerText)
const waitText = (t, timeout = 60000) => page.waitForFunction((s) => document.body.innerText.includes(s), t, { timeout })
const shot = (name, full = true) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full })
const go = async (hash) => {
  await page.goto(`${URL}/#${hash}`)
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.waitForTimeout(600)
}

// Toasts pause while hovered; a toast over the next button would then never leave. Like a person,
// move the pointer away and let open toasts close before each step.
async function settle() {
  if (!page) return
  await page.mouse.move(2, 2).catch(() => {})
  await page.waitForFunction(() => !document.querySelector("[data-sonner-toast]"), null, { timeout: 10000 }).catch(() => {})
}

async function step(name, fn) {
  const t0 = Date.now()
  try {
    await settle()
    await fn()
    results.push({ name, ok: true, ms: Date.now() - t0 })
    console.log(`  ✓ ${name} (${Date.now() - t0} ms)`)
  } catch (e) {
    results.push({ name, ok: false, error: e.message })
    console.log(`  ✗ ${name}: ${e.message.split("\n")[0]}`)
    await shot(`FAILED-${name.replace(/\W+/g, "_")}`).catch(() => {})
  }
}

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] })
const ctx = await browser.newContext({ viewport: { width: 1480, height: 960 } })
page = await ctx.newPage()
const pageErrors = []
page.on("pageerror", (e) => pageErrors.push(e.message))

console.log(`Card Agent console e2e — ${URL}`)

await step("operator view: admin screens are locked without a token", async () => {
  await go("/")
  await waitText("Admin access required")
  await shot("00-locked-overview", false)
})

await step("sign in with the admin token", async () => {
  await page.getByRole("button", { name: /Enter admin token/ }).first().click()
  await page.getByLabel("Admin token").fill(TOKEN)
  await page.getByRole("button", { name: /Connect as admin/ }).click()
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'))
  await waitText("Auto-accept rate")
})

await step("overview dashboard shows statistics", async () => {
  await waitText("Decisions per day")
  await page.waitForTimeout(800)
  await shot("01-overview")
})

await step("validate one photo with the live stream", async () => {
  await go("/validate")
  await page.setInputFiles('input[type=file][accept="image/jpeg,image/png,image/webp"]', sample("alpha_amber_prefix_mismatch.jpg"))
  await page.getByRole("button", { name: /^Validate$/ }).click()
  await page.waitForTimeout(500)
  await shot("02-validate-live", false)
  await waitText("A person must decide")
  await page.waitForTimeout(400)
  await shot("03-validate-result")
})

await step("validate an unknown card → rejected", async () => {
  await page.setInputFiles('input[type=file][accept="image/jpeg,image/png,image/webp"]', sample("not_a_card.jpg"))
  await page.getByRole("button", { name: /^Validate$/ }).click()
  await waitText("Card rejected")
  await shot("04-validate-reject")
})

await step("batch validation of several photos", async () => {
  await page.getByRole("tab", { name: /Batch/ }).click()
  const files = ["alpha_blue_ok.jpg", "beta_red_ok.jpg", "alpha_blue_expired.jpg", "blurry.jpg"].map(sample)
  await page.locator('input[type=file][multiple]').first().setInputFiles(files)
  await page.getByRole("button", { name: /^Validate 4/ }).click()
  await page.waitForFunction(() => document.body.innerText.includes("4/4"), null, { timeout: 120000 })
  await shot("05-batch")
})

await step("review queue: accept with enrolment", async () => {
  await go("/review")
  await waitText("Decision")
  await page.getByLabel("Reviewer").fill("e2e.reviewer")
  await shot("06-review-queue")
  const before = await text()
  const pending = Number((before.match(/(\d+) pending/) ?? [])[1] ?? 0)
  await page.getByRole("button", { name: /Accept card/ }).click()
  await waitText("Accepted")
  await page.waitForTimeout(1500)
  const after = Number(((await text()).match(/(\d+) pending/) ?? [])[1] ?? 0)
  if (pending && after >= pending) throw new Error(`pending did not drop (${pending} → ${after})`)
})

await step("run history: filter and open a run", async () => {
  await go("/runs?status=REJECT")
  await waitText("Run history")
  await shot("07-runs", false)
  await page.locator("tbody tr").first().click()
  await waitText("Uploaded photo")
  await page.getByRole("button", { name: /Re-validate now/ }).click()
  await waitText("Re-validated just now")
  await shot("08-run-detail")
})

await step("card programmes list", async () => {
  await go("/cards")
  await waitText("Alpha Club")
  await shot("09-cards", false)
})

await step("edit a programme definition (YAML) and save", async () => {
  await go("/cards/ae.alpha?tab=yaml")
  await waitText("Valid definition")
  await page.locator(".cm-content").click()
  await page.keyboard.press("Control+Home")
  await page.keyboard.press("End")
  // first line is "id: ae.alpha" — edit the issuer line instead via search/replace in the editor
  const yaml = await page.locator(".cm-content").innerText()
  if (!yaml.includes("issuer:")) throw new Error("issuer line not found")
  await page.locator(".cm-line", { hasText: "issuer:" }).first().click()
  await page.keyboard.press("End")
  await page.keyboard.type(" (edited)")
  await waitText("Unsaved changes")
  await shot("10-card-yaml", false)
  await page.getByRole("button", { name: /^Save/ }).click()
  await waitText("ae.alpha saved")
})

await step("YAML validation catches errors before saving", async () => {
  await page.locator(".cm-line", { hasText: "country:" }).first().click()
  await page.keyboard.press("End")
  await page.keyboard.type("X")
  await waitText("problem(s)")
  await shot("11-card-yaml-error", false)
  await page.getByRole("button", { name: /Discard/ }).click()
})

await step("field layout editor on a real reference image", async () => {
  await page.getByRole("tab", { name: "Field layout" }).click()
  await waitText("Regions")
  await page.waitForTimeout(800)
  await shot("12-card-layout", false)
})

await step("reference images: upload and delete", async () => {
  await page.getByRole("tab", { name: "Reference images" }).click()
  await waitText("Find and straighten the card")
  const before = await page.locator("button[title]").count()
  await page.locator('input[type=file][multiple]').first().setInputFiles(sample("alpha_blue_ok.jpg"))
  await waitText("reference image(s) added")
  await page.waitForTimeout(1200)
  await shot("13-card-references")
  const after = await page.locator("button[title]").count()
  if (after <= before) throw new Error("reference not added")
  await page.locator("button[title='alpha_blue_ok.jpg']").first().click()
  await page.getByRole("button", { name: /^Delete$/ }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: /^Delete$/ }).click()
  await waitText("Reference deleted")
})

await step("onboard a new programme with the wizard", async () => {
  await go("/cards/new")
  await page.getByRole("combobox").first().click()
  await page.getByRole("option", { name: /Alpha Club/ }).click()
  await page.getByPlaceholder("ae.fazaa").fill("qa.gamma")
  await page.getByPlaceholder("AE", { exact: true }).fill("QA")
  await page.getByPlaceholder("Fazaa", { exact: true }).fill("Gamma Test")
  await page.getByPlaceholder("Issuing organisation").fill("Gamma QA Issuer")
  await page.getByPlaceholder(/FAZAA/).fill("GAMMATEST")
  await page.keyboard.press("Enter")
  for (let i = 0; i < 5; i++) { // identity → variants → sides → fields → rules → review
    await page.getByRole("button", { name: /^Next/ }).click()
    await page.waitForTimeout(300)
  }
  await shot("14-wizard-review", false)
  await page.getByRole("button", { name: /Create programme/ }).click()
  await waitText("Gamma Test is live")
  await shot("15-wizard-refs", false)
})

await step("delete the new programme (type-to-confirm)", async () => {
  await go("/cards/qa.gamma")
  await page.getByRole("button", { name: /^Delete$/ }).click()
  await page.getByLabel(/Type/).fill("qa.gamma")
  await page.getByRole("button", { name: /Delete programme/ }).click()
  await waitText("qa.gamma deleted")
})

await step("registry: sync and reload", async () => {
  await go("/registry")
  await waitText("Import from the Git registry")
  await page.getByRole("button", { name: /Run sync/ }).first().click()
  await page.getByRole("alertdialog").getByRole("button", { name: /Run sync/ }).click()
  await page.waitForFunction(() => /Registry synced|already up to date/.test(document.body.innerText), null, { timeout: 120000 })
  await page.getByRole("button", { name: /Reload now/ }).click()
  await waitText("Reloaded cards and settings")
  await shot("16-registry")
})

await step("decision settings: what-if evaluation", async () => {
  await go("/settings")
  await waitText("family_min")
  const input = page.getByLabel("scoring.family_min")
  await input.fill("0.6")
  await waitText("change(s)")
  await shot("17-settings", false)
  await page.getByRole("button", { name: /What-if evaluate/ }).click()
  await page.getByRole("dialog").getByRole("combobox").click()
  await page.getByRole("option").first().click()
  await page.getByRole("button", { name: /Start evaluation/ }).click()
  await waitText("Evaluation report")
  await page.waitForFunction(() => /Gate (passed|failed)/.test(document.body.innerText), null, { timeout: 180000 })
  await shot("18-evaluation-whatif")
})

await step("decision settings: apply and reset", async () => {
  await go("/settings")
  const input = page.getByLabel("scoring.family_min")
  await input.fill("0.55")
  await page.getByRole("button", { name: /Apply to live traffic/ }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: /^Apply$/ }).click()
  await waitText("Settings applied")
  await waitText("Runtime overrides are active")
  await page.getByRole("button", { name: /Reset all overrides/ }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: /^Reset$/ }).click()
  await waitText("Overrides removed")
})

await step("evaluations: list, set and report comparison", async () => {
  await go("/evaluations")
  await waitText("Evaluation runs")
  await shot("19-evaluations", false)
  await page.locator("tbody").nth(1).locator("tr").first().click()
  await waitText("Evaluations of this set")
  await page.locator("tbody tr").first().click()
  await waitText("Programme confusion")
  await shot("20-evaluation-report")
})

await step("evaluation set from reviewed runs", async () => {
  await go("/evaluations")
  await page.getByRole("button", { name: /From reviewed runs/ }).click()
  await page.getByPlaceholder("e.g. Reviewed in November").fill("e2e reviewed runs")
  await page.getByRole("button", { name: /Build set/ }).click()
  await waitText("Evaluations of this set")
})

await step("health & metrics", async () => {
  await go("/system")
  await waitText("cardagent_")
  await shot("21-system", false)
})

await step("command palette (Ctrl K)", async () => {
  await page.keyboard.press("Control+k")
  await page.getByPlaceholder(/Search pages/).fill("review")
  await page.keyboard.press("Enter")
  await waitText("Review queue")
})

await step("sign out locks admin screens again", async () => {
  await page.getByRole("button", { name: "Sign out" }).click()
  await go("/runs")
  await waitText("Admin access required")
})

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed${pageErrors.length ? ` · ${pageErrors.length} page error(s): ${pageErrors.slice(0, 3).join(" | ")}` : ""}`)
fs.writeFileSync(path.join(SHOTS, "results.json"), JSON.stringify({ results, pageErrors }, null, 1))
process.exit(failed.length || pageErrors.length ? 1 : 0)
