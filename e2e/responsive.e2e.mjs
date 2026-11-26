// Responsive layout check for the programme editor (wizard steps and the programme page's form editor).
// At each width it fails when controls in a row overlap, stick out of their row, number inputs are too
// narrow to show a value, or the page scrolls sideways.
//
//   CONSOLE_URL=http://localhost:5173 ADMIN_TOKEN=... node e2e/responsive.e2e.mjs [screenshot-prefix]
//
// Needs a 2.1 server seeded by scripts/seed_demo.py (uses ae.gamma). Creates nothing on the server.
import { chromium } from "playwright-core"
import fs from "node:fs"
const out = process.argv[2] ?? "e2e/screenshots-responsive/editor"
fs.mkdirSync(out.replace(/\/[^/]*$/, ""), { recursive: true })
const U = process.env.CONSOLE_URL ?? "http://localhost:5173"
const b = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] })
const p = await (await b.newContext({ viewport: { width: 1480, height: 1000 } })).newPage()
await p.goto(`${U}/#/validate`); await p.waitForTimeout(1000)
await p.getByRole("button", { name: /Sign in/ }).click()
await p.getByLabel("Admin token").fill(process.env.ADMIN_TOKEN ?? "")
await p.getByRole("button", { name: /Connect as admin/ }).click()
await p.waitForFunction(() => !document.querySelector('[role="dialog"]'))

const check = () => p.evaluate(() => {
  const res = []
  const rows = document.querySelectorAll("main .rounded-lg.border")
  rows.forEach((row, ri) => {
    const els = [...row.querySelectorAll("input,button,label,[role=switch],[role=combobox]")].filter((e) => e.offsetParent && e.type !== "file")
    const rs = els.map((e) => e.getBoundingClientRect())
    const box = row.getBoundingClientRect()
    for (let i = 0; i < rs.length; i++) {
      const a = rs[i]
      if (a.right > box.right + 1 || a.left < box.left - 1) res.push(`row${ri}: ${els[i].tagName} '${(els[i].textContent || els[i].getAttribute("aria-label") || "").slice(0, 14)}' sticks out`)
      for (let j = i + 1; j < rs.length; j++) {
        const c = rs[j]
        if (els[i].contains(els[j]) || els[j].contains(els[i])) continue
        const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left), oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top)
        if (ox > 1 && oy > 1) res.push(`row${ri}: ${els[i].tagName}'${(els[i].textContent || els[i].getAttribute("aria-label") || "").slice(0, 10)}' × ${els[j].tagName}'${(els[j].textContent || els[j].getAttribute("aria-label") || "").slice(0, 10)}'`)
      }
    }
    // number inputs too narrow to show "0.05"
    row.querySelectorAll("input[type=number]").forEach((n) => { if (n.offsetParent && n.clientWidth < 44) res.push(`row${ri}: number input ${n.clientWidth}px`) })
  })
  if (document.documentElement.scrollWidth > window.innerWidth + 1) res.push(`page overflows ${document.documentElement.scrollWidth}>${window.innerWidth}`)
  return res
})

let bad = 0
for (const w of [1920, 1480, 1366, 1280, 1100, 1024, 900, 768, 600, 414, 375]) {
  await p.setViewportSize({ width: w, height: 1000 })
  await p.goto(`${U}/#/`); await p.goto(`${U}/#/cards/new`); await p.waitForTimeout(900)
  await p.getByPlaceholder("ae.fazaa").fill("qa.zeta")
  await p.getByPlaceholder("AE", { exact: true }).fill("QA")
  await p.getByPlaceholder("Fazaa", { exact: true }).fill("Zeta Test")
  await p.getByPlaceholder("Issuing organisation").fill("Zeta QA")
  await p.getByPlaceholder(/FAZAA/).fill("ZETATEST"); await p.keyboard.press("Enter")
  const report = {}
  report.identity = await check()
  await p.getByRole("button", { name: /^Next/ }).click(); await p.getByRole("button", { name: /^Variant$/ }).click()
  report.variants = await check(); if (w === 1480 || w === 414) await p.screenshot({ path: `${out}-variants-${w}.png`, fullPage: true })
  await p.getByRole("button", { name: /^Next/ }).click()
  await p.getByRole("button", { name: /Front and back/ }).click()
  report.sides = await check()
  await p.getByRole("button", { name: /^Next/ }).click()
  await p.getByRole("button", { name: /^Field$/ }).click(); await p.waitForTimeout(300)
  report.fields = await check()
  await p.screenshot({ path: `${out}-${w}.png`, fullPage: true })
  await p.getByRole("button", { name: /^Next/ }).click()
  await p.getByRole("button", { name: /^Rule$/ }).click()
  report.rules = await check(); if (w === 1480 || w === 414) await p.screenshot({ path: `${out}-rules-${w}.png`, fullPage: true })
  const issues = Object.entries(report).filter(([, v]) => v.length)
  bad += issues.length
  console.log(w, issues.length ? issues.map(([k, v]) => `${k}: ${v.slice(0, 3).join(" | ")}`).join(" ;; ") : "clean")
}
// programme page form editor (full width)
for (const w of [1480, 900, 414]) {
  await p.setViewportSize({ width: w, height: 1000 })
  await p.goto(`${U}/#/cards/ae.gamma?tab=form`); await p.waitForTimeout(1200)
  await p.getByRole("tab", { name: "Form editor" }).click().catch(() => {}); await p.waitForTimeout(500)
  const r = await check(); bad += r.length ? 1 : 0
  console.log(`form editor ${w}`, r.length ? r.slice(0, 3).join(" | ") : "clean")
  if (w !== 900) await p.screenshot({ path: `${out}-formeditor-${w}.png`, fullPage: true })
}
await b.close()
process.exit(bad ? 1 : 0)
