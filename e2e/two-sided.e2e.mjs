// End-to-end test for two-sided cards (API schema 2.1, card-agent-enterprise feature/two-sided-cards).
//
//   CONSOLE_URL=http://localhost:5173 ADMIN_TOKEN=... SAMPLES=./samples CHROME=/usr/bin/google-chrome \
//   node e2e/two-sided.e2e.mjs
//
// Prerequisite: scripts/seed_demo.py run against a 2.1 server (creates ae.gamma = data on both sides,
// qa.delta = data on the back only, and $SAMPLES/two_sided/*.jpg). Never run against production.
import { chromium } from "playwright-core"
import fs from "node:fs"
import path from "node:path"

const URL = process.env.CONSOLE_URL ?? "http://localhost:5173"
const TOKEN = process.env.ADMIN_TOKEN ?? ""
const SAMPLES = path.join(process.env.SAMPLES ?? "samples", "two_sided")
const SHOTS = process.env.SHOTS ?? "e2e/screenshots-two-sided"
const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome"
fs.mkdirSync(SHOTS, { recursive: true })

const results = []
let page
const photo = (f) => path.join(SAMPLES, f)
const body = () => page.evaluate(() => document.body.innerText)
const waitText = (t, timeout = 60000) => page.waitForFunction((s) => document.body.innerText.includes(s), t, { timeout })
const waitRe = (re, timeout = 60000) => page.waitForFunction((s) => new RegExp(s).test(document.body.innerText), re.source, { timeout })
const shot = (name, full = true) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full })
const go = async (hash) => {
  await page.goto(`${URL}/#${hash}`)
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.waitForTimeout(500)
}
const mode = (name) => page.getByRole("radio", { name }).click()
const validateAndWait = async () => {
  await page.getByRole("button", { name: /^Validate( both photos)?$/ }).click()
  await waitRe(/Card accepted automatically|A person must decide|Card rejected/)
  await page.waitForTimeout(300)
}

async function step(name, fn) {
  const t0 = Date.now()
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  ✓ ${name} (${Date.now() - t0} ms)`)
  } catch (e) {
    results.push({ name, ok: false, error: e.message })
    console.log(`  ✗ ${name}: ${e.message.split("\n")[0]}`)
    await shot(`FAILED-${name.replace(/\W+/g, "_")}`).catch(() => {})
  }
}

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] })
page = await (await browser.newContext({ viewport: { width: 1480, height: 960 } })).newPage()
const pageErrors = []
page.on("pageerror", (e) => pageErrors.push(e.message))
console.log(`Two-sided cards e2e — ${URL}`)

await step("sign in", async () => {
  await go("/validate")
  await page.getByRole("button", { name: /Sign in/ }).click()
  await page.getByLabel("Admin token").fill(TOKEN)
  await page.getByRole("button", { name: /Connect as admin/ }).click()
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'))
})

await step("one photo is still the default (field image)", async () => {
  await go("/validate")
  if (!(await page.getByRole("radio", { name: "One photo" }).getAttribute("aria-checked")).includes("true")) throw new Error("One photo is not the default")
})

await step("processing animation plays while validating and clears with the result", async () => {
  // hold the stream briefly so the running state can be observed (a local server answers in ~1 s)
  const slow = async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue() }
  await page.route("**/v1/cards/validate/stream**", slow)
  await page.getByLabel("Card photo photo").setInputFiles(photo("gamma_gold_front.jpg"))
  await page.getByRole("button", { name: /^Validate$/ }).click()
  await page.waitForSelector("[data-testid=card-scanning]", { timeout: 5000 })
  const y = () => page.evaluate(() => document.querySelector(".card-scan-beam").getBoundingClientRect().top - document.querySelector("[data-testid=card-scanning]").getBoundingClientRect().top)
  const y1 = await y(); await page.waitForTimeout(300); const y2 = await y()
  if (Math.abs(y2 - y1) < 2) throw new Error(`scan beam is not moving (${y1} → ${y2})`)
  const label = await page.locator("[data-testid=card-scanning] [role=status]").innerText()
  if (!/…$/.test(label)) throw new Error(`no stage label: '${label}'`)
  await waitRe(/Card accepted automatically|A person must decide|Card rejected/)
  if (await page.locator("[data-testid=card-scanning]").count()) throw new Error("animation still shown after the result")
  await page.unroute("**/v1/cards/validate/stream**", slow)
  await page.getByLabel("remove Card photo").click()
})

await step("front and back → ACCEPT, both straightened photos, fields by side", async () => {
  await mode("Front and back")
  await page.getByLabel("Front photo").setInputFiles(photo("gamma_gold_front.jpg"))
  await page.getByLabel("Back photo").setInputFiles(photo("gamma_gold_back.jpg"))
  await validateAndWait()
  await waitText("Card accepted automatically")
  const t = await body()
  if (!t.includes("Straightened photos")) throw new Error("two straightened photos not shown")
  if (!t.includes("2 photos")) throw new Error("photo count badge missing")
  await shot("01-front-back-accept")
  await page.getByRole("tab", { name: "Result" }).click()
  await waitText("Photos (2)")
  await shot("02-result-photos")
  await page.getByRole("tab", { name: /Stages/ }).click()
})

await step("per-photo sub-rows in the quality stage", async () => {
  await page.locator("#step-quality button").first().click()
  await page.waitForTimeout(300)
  const t = await page.locator("#step-quality").innerText()
  if (!/front/i.test(t) || !/back/i.test(t)) throw new Error("per-photo rows missing")
  await page.locator("#step-fields button").first().click()
  await waitText("Side assignment")
  await shot("03-stage-evidence", false)
})

await step("swapped front/back is detected and corrected", async () => {
  await page.getByLabel("remove Front").click()
  await page.getByLabel("remove Back").click()
  await page.getByLabel("Front photo").setInputFiles(photo("gamma_gold_back.jpg"))
  await page.getByLabel("Back photo").setInputFiles(photo("gamma_gold_front.jpg"))
  await validateAndWait()
  await waitText("side corrected")
  await waitText("Card accepted automatically")
  await shot("04-side-corrected", false)
})

await step("front only → REJECT SIDE_REQUIRED:back, 'not photographed', add the back → ACCEPT", async () => {
  await page.getByLabel("remove Back").click()
  await page.getByLabel("remove Front").click()
  await page.getByLabel("Front photo").setInputFiles(photo("gamma_gold_front.jpg"))
  await validateAndWait()
  await waitText("Card rejected")
  await waitText("This programme needs the back of the card")
  await page.getByRole("tab", { name: "Result" }).click()
  await waitText("not photographed")
  await shot("05-side-required")
  await page.getByRole("tab", { name: /Stages/ }).click()
  await page.getByRole("button", { name: /Add a photo of the back/ }).click()
  await page.getByLabel("Back photo").setInputFiles(photo("gamma_gold_back.jpg"))
  await validateAndWait()
  await waitText("Card accepted automatically")
})

await step("sides unknown (images) → ACCEPT", async () => {
  await mode("Sides unknown")
  await page.getByLabel("remove Photo 1").click().catch(() => {})
  await page.getByLabel("remove Photo 2").click().catch(() => {})
  await page.getByLabel("Photo 1 photo").setInputFiles(photo("delta_back.jpg"))
  await page.getByLabel("Photo 2 photo").setInputFiles(photo("delta_front.jpg"))
  await validateAndWait()
  await waitText("Card accepted automatically")
})

await step("one photo of a back-only programme → ACCEPT", async () => {
  await mode("One photo")
  await page.getByLabel("remove Card photo").click().catch(() => {})
  await page.getByLabel("Card photo photo").setInputFiles(photo("delta_back.jpg"))
  await validateAndWait()
  await waitText("Card accepted automatically")
})

await step("batch pairs *_front / *_back files into one card", async () => {
  await page.getByRole("tab", { name: /Batch/ }).click()
  await page.locator("input[type=file][multiple]").first().setInputFiles([photo("gamma_gold_front.jpg"), photo("delta_back.jpg"), photo("gamma_gold_back.jpg")])
  await waitText("1 front/back pair")
  await page.getByRole("button", { name: /^Validate 2/ }).click()
  await page.waitForFunction(() => document.body.innerText.includes("2/2 cards"), null, { timeout: 120000 })
  await shot("06-batch-pairs", false)
})

await step("programme overview shows sides and per-side references", async () => {
  await go("/cards")
  await waitText("front + back")
  await shot("07-cards-list", false)
  await go("/cards/ae.gamma")
  await waitText("photo required")
  await shot("08-programme-sides", false)
})

await step("field layout per side", async () => {
  await page.getByRole("tab", { name: "Field layout" }).click()
  await page.getByRole("radio", { name: "Back" }).click()
  await page.waitForTimeout(800)
  const regions = await page.locator(".aspect-\\[1012\\/638\\] span").allInnerTexts()
  if (!regions.includes("card_number") || regions.includes("holder_name")) throw new Error(`back regions wrong: ${regions}`)
  await shot("09-layout-back", false)
})

// Leftovers from an earlier run (the enrol step adds the same photos as references) would turn the
// upload below into "already a reference". Remove them through the API so the suite is re-runnable.
async function cleanEnrolledRefs() {
  const api = process.env.API_URL ?? URL
  const h = { "X-Admin-Token": TOKEN }
  const list = await (await fetch(`${api}/v1/cards/ae.gamma/references`, { headers: h })).json()
  for (const v of list.variants ?? [])
    for (const r of v.references)
      if (r.source !== "registry" && (r.filename.startsWith("run-") || r.filename.startsWith("gamma_gold_")))
        await fetch(`${api}/v1/cards/ae.gamma/references/${r.ref_id}?force=true`, { method: "DELETE", headers: h })
}

await step("reference images per side: upload to the back and delete", async () => {
  await cleanEnrolledRefs()
  await page.reload()
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.getByRole("tab", { name: "Reference images" }).click()
  await waitText("Upload back")
  await page.getByLabel("upload gold back").setInputFiles(photo("gamma_gold_back.jpg"))
  await waitRe(/reference image\(s\) added to gold \(back\)/)
  await page.waitForTimeout(1000)
  await shot("10-references-by-side")
  const tile = page.locator("button[title='gamma_gold_back.jpg']").first()
  await tile.click()
  await page.getByRole("button", { name: /^Delete$/ }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: /^Delete$/ }).click()
  await waitText("Reference deleted")
})

await step("run detail shows both photos; enrol both sides on review", async () => {
  await go("/runs?status=ACCEPT&family=ae.gamma")
  await page.locator("tbody tr", { hasText: "2 photos" }).first().click()
  await waitText("Uploaded photos (2)")
  await shot("11-run-two-photos")
  await page.getByRole("tab", { name: /^Review/ }).click()
  await page.getByLabel(/Enroll this photo/).click()
  await waitText("Enrol as")
  await shot("12-review-enrol-sides", false)
  await page.getByRole("button", { name: /Accept card/ }).click()
  await waitRe(/2 photos enrolled as ae\.gamma\/gold references \(\w+ \+ \w+\)/)
})

await step("wizard creates a two-sided programme with a field on the back", async () => {
  await go("/cards/new")
  await page.getByPlaceholder("ae.fazaa").fill("qa.epsilon")
  await page.getByPlaceholder("AE", { exact: true }).fill("QA")
  await page.getByPlaceholder("Fazaa", { exact: true }).fill("Epsilon Test")
  await page.getByPlaceholder("Issuing organisation").fill("Epsilon QA")
  await page.getByPlaceholder(/FAZAA/).fill("EPSILONTEST")
  await page.keyboard.press("Enter")
  await page.getByRole("button", { name: /^Next/ }).click() // → variants
  await page.getByRole("button", { name: /^Next/ }).click() // → sides
  await page.getByRole("button", { name: /Front and back/ }).click()
  await page.getByRole("button", { name: /^Next/ }).click() // → fields
  await page.getByLabel("card_number side").click()
  await page.getByRole("option", { name: "Back" }).click()
  await page.getByRole("radio", { name: "Back" }).click()
  await page.waitForTimeout(300)
  await shot("13-wizard-fields-back", false)
  await page.getByRole("button", { name: /^Next/ }).click() // → rules
  await page.getByRole("button", { name: /^Next/ }).click() // → review
  const yaml = await page.locator(".cm-content").innerText()
  if (!/sides:/.test(yaml) || !/side: back/.test(yaml)) throw new Error("YAML lacks sides / side: back")
  await page.getByRole("button", { name: /Create programme/ }).click()
  await waitText("Epsilon Test is live")
  await waitText("Upload back")
  await shot("14-wizard-refs-by-side", false)
  await go("/cards/qa.epsilon")
  await page.getByRole("button", { name: /^Delete$/ }).click()
  await page.getByLabel(/Type/).fill("qa.epsilon")
  await page.getByRole("button", { name: /Delete programme/ }).click()
  await waitText("qa.epsilon deleted")
})

await step("evaluation report lists both files of two-photo cases", async () => {
  await go("/evaluations")
  await page.locator("tbody").first().locator("tr").last().click()
  await waitText("Per-photo results")
  await page.getByLabel("Only disagreements").click()
  await waitText("g1b.jpg")
  await shot("15-evaluation-files")
})

await step("decision settings expose sides_mismatch_geometry", async () => {
  await go("/settings")
  await waitText("sides_mismatch_geometry")
})

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed${pageErrors.length ? ` · page errors: ${pageErrors.slice(0, 3).join(" | ")}` : ""}`)
process.exit(failed.length || pageErrors.length ? 1 : 0)
