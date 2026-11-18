import { chromium } from "playwright-core"
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] })
const p = await b.newPage()
p.on("console", m => { if (m.type() === "error") console.log("CONSOLE", m.text()) })
p.on("pageerror", e => console.log("PAGEERR", e.message))
await p.goto(process.argv[2])
await p.waitForFunction(() => document.getElementById("out")?.textContent !== "running", null, { timeout: 60000 })
console.log(await p.textContent("#out"))
await b.close()
