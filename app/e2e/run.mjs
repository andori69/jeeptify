// Real-browser check of the running dev server. Usage: node e2e/run.mjs [outDir]
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:5173/'
const OUT = process.argv[2] ?? '.'
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
const axeSrc = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')

let fails = 0
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' · ' + extra : ''}`); if (!cond) fails++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ executablePath: BRAVE, headless: true })
const PHONE = { width: 390, height: 780 }

async function axe(page, label) {
  await page.evaluate(axeSrc)
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map((x) => `${x.id}(${x.nodes.length})`))
  ok(`axe ${label}`, v.length === 0, v.join(' '))
}
const count = (p, sel) => p.locator(sel).count()
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Pick a real test trip from the app's own data (loaded through Vite in the page).
const probe = await (async () => {
  const c = await browser.newContext(); const p = await c.newPage(); await p.goto(BASE + '?mode=commuter')
  const r = await p.evaluate(async () => {
    const { routes } = await import('/src/lib/routes.ts'); const t = await import('/src/lib/trips.ts'); const g = await import('/src/lib/geo.ts')
    const L = (await import('/src/data/landmarks.json')).default.landmarks
    for (const route of routes) {
      const lms = t.landmarksAlong(route.line, L, 100).filter((x, i, a) => a.findIndex((y) => y.lm.name === x.lm.name) === i)
      for (const a of lms) for (const b of lms) {
        if (a.along < 400 || b.along - a.along < 900) continue
        const res = t.routesServing(routes, [b.lm.lon, b.lm.lat], [a.lm.lon, a.lm.lat])
        const s = res.find((x) => x.route.id === route.id)
        if (!s || s.dir !== 'out' || res.length > 4) continue
        const other = routes.find((x) => !res.some((y) => y.route.id === x.id))
        return { routeId: route.id, other: other.id, aName: a.lm.name, bName: b.lm.name, start: route.line[0],
          before: g.pointAt(route.line, Math.max(0, s.board.along - 700)), near: g.pointAt(route.line, Math.max(0, s.board.along - 150)) }
      }
    }
  })
  await c.close(); return r
})()
console.log('trip under test:', probe.aName, '->', probe.bName, 'on', probe.routeId, '(unrelated route:', probe.other + ')')

async function pickPlace(page, name, field) {
  await page.getByLabel(field, { exact: true }).fill(name)
  await page.getByRole('button', { name: new RegExp('^' + esc(name)) }).first().click()
}

// ---------- 1,2,3,10: GPS denied -> manual start -> destination -> filtered results
for (const [label, vp] of [['phone', PHONE]]) {
  const ctx = await browser.newContext({ viewport: vp }) // no geolocation permission granted
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(BASE + '?mode=commuter')
  ok(`${label}: asks From and To first, no map yet`, (await page.getByRole('heading', { name: 'Where to?' }).isVisible()) && (await page.getByLabel('From', { exact: true }).isVisible()) && (await count(page, '.leaflet-container')) === 0)
  await page.screenshot({ path: `${OUT}/${label}-1-where-now.png` }); await axe(page, `${label} step 1`)
  await page.getByRole('button', { name: /Use my current location/ }).click()
  await page.getByText('GPS unavailable').waitFor({ timeout: 20000 })
  ok(`${label}: GPS denied -> clear message, manual search still offered`, await page.getByLabel('From', { exact: true }).isVisible())
  ok(`${label}: Show jeepneys stays disabled until both places are set`, await page.getByRole('button', { name: 'Show jeepneys' }).isDisabled())
  await pickPlace(page, probe.aName, 'From')
  ok(`${label}: start chosen, destination asked next, still no map and still disabled`, (await page.getByLabel('To', { exact: true }).isVisible()) && (await count(page, '.leaflet-container')) === 0 && (await page.getByRole('button', { name: 'Show jeepneys' }).isDisabled()))
  await page.screenshot({ path: `${OUT}/${label}-2-start-set.png` })
  await axe(page, `${label} form with start set`)
  await pickPlace(page, probe.bName, 'To')
  ok(`${label}: both set -> confirm button enabled`, await page.getByRole('button', { name: 'Show jeepneys' }).isEnabled())
  await page.getByRole('button', { name: 'Show jeepneys' }).click()
  await page.waitForSelector('.card'); await sleep(2500)
  const cards = await count(page, '.card')
  const codes = await page.locator('.card .plate').allInnerTexts()
  ok(`${label}: only relevant routes listed`, cards >= 1 && cards <= 4 && codes.includes(probe.routeId), `${cards} of 13: ${codes.join(',')}`)
  ok(`${label}: map draws only the chosen trip's road, not every route`, (await count(page, '.leaflet-overlay-pane path.leaflet-interactive')) === 1)
  const titles = await page.locator('.leaflet-marker-icon').evaluateAll((els) => els.map((e) => e.getAttribute('title') ?? ''))
  const jeepRoutes = titles.filter((t) => /jeep/i.test(t)).map((t) => t.split('· ')[1])
  ok(`${label}: jeep markers only on listed routes`, jeepRoutes.length > 0 && jeepRoutes.every((r) => codes.includes(r)), jeepRoutes.join(','))
  ok(`${label}: start + destination markers`, titles.some((t) => t.startsWith('You:')) && titles.some((t) => t === probe.bName))
  ok(`${label}: ETA text present and honest`, /Next jeep|No jeep heading/.test(await page.locator('.card').first().innerText()) && /No live traffic/.test(await page.locator('.panel').innerText()))
  await page.screenshot({ path: `${OUT}/${label}-3-results.png` }); await axe(page, `${label} results`)
  ok(`${label}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  ok(`${label}: no page errors`, errors.length === 0, errors.join('|'))
  await ctx.close()
}

// ---------- 4,5,6,7,8: commuter + drivers in ONE browser (shared demo channel)
{
  const ctx = await browser.newContext({ viewport: PHONE, geolocation: { longitude: probe.before[0], latitude: probe.before[1] }, permissions: ['geolocation'] })
  const com = await ctx.newPage()
  await com.goto(BASE + '?mode=commuter')
  await pickPlace(com, probe.aName, 'From')
  await pickPlace(com, probe.bName, 'To'); await com.getByRole('button', { name: 'Show jeepneys' }).click()
  await com.waitForSelector('.card')
  await com.locator('.card', { has: com.locator('.plate', { hasText: new RegExp('^' + esc(probe.routeId) + '$') }) }).click()
  await com.getByLabel(/drivers see I'm waiting/).check()

  async function driver(route, dir) {
    const d = await ctx.newPage(); await d.goto(BASE + '?mode=driver'); await d.waitForSelector('.leaflet-container')
    await d.locator('select').first().selectOption(route); await d.locator('select').nth(1).selectOption(dir)
    await d.getByRole('button', { name: 'Go online' }).click(); await d.waitForSelector('.state-on, .state-err', { timeout: 15000 })
    return d
  }
  const drv = await driver(probe.routeId, 'out'); await sleep(1200)
  ok('driver sees the waiting commuter on the same route + direction', (await drv.getByText('waiting', { exact: false }).first().isVisible()) && (await count(drv, '.wait')) === 1)
  ok('driver map: commuter marker distinct from jeep/pickup markers', (await count(drv, '.pin-wait')) === 1 && (await count(drv, '.pin-me')) === 1)
  ok('driver map: direction arrows drawn', (await count(drv, '.arrow')) > 3)
  const txt = await drv.locator('.panel').innerText()
  ok('driver shows pickup + destination names only (no ids)', txt.includes(probe.aName) && txt.includes(probe.bName) && !/drv-|jt:/.test(txt))
  ok('driver has no accept/reject/notify actions or trip counters', !(await drv.getByRole('button', { name: /accept|reject|decline|request/i }).count()) && !/Trip time|Driven|km driven/i.test(txt))
  await drv.screenshot({ path: `${OUT}/driver-online-with-waiting.png` })
  await axe(drv, 'driver online with waiting')

  const drvIn = await driver(probe.routeId, 'in')
  ok('driver heading the OPPOSITE direction does not see the commuter', (await count(drvIn, '.wait')) === 0)
  const drvOther = await driver(probe.other, 'out')
  ok('driver on an UNRELATED route does not see the commuter', (await count(drvOther, '.wait')) === 0 && (await count(drvOther, '.pin-wait')) === 0)
  await drvIn.close(); await drvOther.close()

  // 7: ETA follows the real jeep's position
  await com.bringToFront(); await sleep(800)
  const etaText = async () => (await com.locator('.card.sel .eta').innerText()).trim()
  const e1 = await etaText()
  ok('commuter ETA uses the LIVE driver, not the simulation', /Next jeep/.test(e1) && !/simulated/.test(e1), e1)
  const m1 = /(\d+) min/.test(e1) ? +e1.match(/(\d+) min/)[1] : e1.includes('arriving') ? 0 : null
  await ctx.setGeolocation({ longitude: probe.near[0], latitude: probe.near[1] })
  const seenPos = new Set()
  for (let i = 0; i < 10; i++) { seenPos.add(await com.locator('.leaflet-marker-icon .pin-jeep').first().evaluate((e) => { const r = e.getBoundingClientRect(); return r.x.toFixed(0) + ',' + r.y.toFixed(0) }).catch(() => 'none')); await sleep(150) }
  ok('live jeep marker glides to its new position (not a jump)', seenPos.size >= 4, `${seenPos.size} distinct positions over 1.5 s`)
  await sleep(1200)
  const e2 = await etaText()
  const m2 = /(\d+) min/.test(e2) ? +e2.match(/(\d+) min/)[1] : e2.includes('arriving') ? 0 : null
  ok('ETA updates (gets shorter) when the driver moves closer', m1 != null && m2 != null && m2 < m1, `${e1} -> ${e2}`)
  const dtxt = await drv.locator('.panel').innerText()
  ok('driver ETA to next landmarks updates and states its basis', /assumed 15 km\/h|current speed/.test(dtxt) && /no live traffic/i.test(dtxt))

  // stationary: tiny jitter must not republish
  const pubTs = () => drv.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('jt:jeep:')).map((k) => JSON.parse(localStorage[k]).ts))
  const t1 = await pubTs()
  await ctx.setGeolocation({ longitude: probe.near[0] + 0.00001, latitude: probe.near[1] })
  await sleep(2500)
  ok('stationary jitter (about 1 m) does not republish position', JSON.stringify(t1) === JSON.stringify(await pubTs()))

  // offline: nothing left behind
  const jeepKeys = () => drv.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('jt:jeep:')).length)
  const before = await jeepKeys()
  await drv.getByRole('button', { name: 'Go offline' }).click(); await sleep(500)
  ok('going offline removes this driver position and stops tracking', (await jeepKeys()) === before - 1 && (await drv.locator('.state-off').isVisible()), `${before} -> ${await jeepKeys()}`)
  await com.getByLabel(/drivers see I'm waiting/).uncheck(); await sleep(300)
  ok('commuter can withdraw: waiting entry removed', (await com.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('jt:wait:')).length)) === 0)
  await ctx.close()
}

// ---------- 8: no location at all -> ETA unavailable, honestly
{
  const ctx = await browser.newContext({ viewport: PHONE })
  const d = await ctx.newPage(); await d.goto(BASE + '?mode=driver')
  await d.getByRole('button', { name: 'Go online' }).click(); await d.waitForSelector('.state-err, .state-wait', { timeout: 20000 })
  const t = await d.locator('.panel').innerText()
  ok('driver without GPS: says ETA unavailable and why', /ETA unavailable/.test(t) && !/\d+ min/.test(t), t.split('\n').find((l) => /unavailable/.test(l)) ?? '')
  ok('driver without GPS: shows a location error state', await d.locator('.state-err, .state-wait').isVisible())
  await ctx.close()
}

// ---------- 9: slow / dead map tiles
for (const mode of ['offline', 'slow']) {
  const ctx = await browser.newContext({ viewport: PHONE })
  await ctx.route('**/tile.openstreetmap.org/**', async (r) => { if (mode === 'offline') return r.abort(); await sleep(8000); return r.abort() })
  const page = await ctx.newPage(); await page.goto(BASE + '?mode=commuter')
  await pickPlace(page, probe.aName, 'From')
  await pickPlace(page, probe.bName, 'To'); await page.getByRole('button', { name: 'Show jeepneys' }).click()
  await page.waitForSelector('.card')
  ok(`tiles ${mode}: routes and markers still render`, (await count(page, '.leaflet-overlay-pane path.leaflet-interactive')) > 0 && (await count(page, '.leaflet-marker-icon')) > 1)
  await page.locator('.card').first().click()
  ok(`tiles ${mode}: app stays interactive`, (await page.locator('.card.sel').count()) === 1)
  if (mode === 'offline') { await page.getByText(/Map background is slow or offline/).waitFor({ timeout: 10000 }).catch(() => {}); ok('tiles offline: user is told, not left with a blank map', await page.getByText(/Map background is slow or offline/).isVisible()) }
  await page.screenshot({ path: `${OUT}/phone-tiles-${mode}.png` })
  await ctx.close()
}


// ---------- motion: bottom sheet + marker glide (+ reduced motion)
for (const reduce of [false, true]) {
  const ctx = await browser.newContext({ viewport: PHONE, reducedMotion: reduce ? 'reduce' : 'no-preference' })
  const page = await ctx.newPage(); await page.goto(BASE + '?mode=commuter')
  await pickPlace(page, probe.aName, 'From')
  await pickPlace(page, probe.bName, 'To'); await page.getByRole('button', { name: 'Show jeepneys' }).click()
  await page.waitForSelector('.card'); await sleep(600)
  const tag = reduce ? 'reduced-motion' : 'motion'
  const top = () => page.locator('.panel.sheet').evaluate((e) => Math.round(e.getBoundingClientRect().top))
  const grip = page.locator('.grip'), box = await grip.boundingBox()
  ok(`${tag}: sheet starts half open with a real handle button`, (await page.locator('.sheet-half').count()) === 1 && (await grip.getAttribute('aria-label')).includes('half open'))
  if (!reduce) await page.screenshot({ path: `${OUT}/phone-sheet-half.png` })
  const tHalf = await top()
  // scrolling the list inside the half-open sheet must not push the sheet up over the map
  const lastOk = await page.locator('.panel.sheet').evaluate(async (p) => { p.scrollTop = p.scrollHeight; await new Promise((r) => setTimeout(r, 300)); const last = p.querySelector('.about summary'); const r = last.getBoundingClientRect(); return r.bottom <= window.innerHeight && r.top > 0 })
  ok(`${tag}: scrolling the list keeps the sheet at half height (map not covered)`, (await top()) === tHalf && (await page.locator('.sheet-half').count()) === 1)
  ok(`${tag}: the end of the list can be scrolled into view while half open`, lastOk)
  await page.locator('.panel.sheet').evaluate((p) => { p.scrollTop = 0 })
  await grip.click(); await sleep(500)
  ok(`${tag}: tapping the handle opens the sheet fully`, (await page.locator('.sheet-full').count()) === 1 && (await top()) < tHalf)
  if (!reduce) { await axe(page, 'phone sheet full'); await page.screenshot({ path: `${OUT}/phone-sheet-full.png` }) }
  const b2 = await grip.boundingBox(), cx = b2.x + b2.width / 2, cy = b2.y + b2.height / 2
  await page.mouse.move(cx, cy); await page.mouse.down()
  for (let i = 1; i <= 8; i++) { await page.mouse.move(cx, cy + i * 45); await sleep(16) }
  await page.mouse.up(); await sleep(500)
  ok(`${tag}: a fast downward flick collapses the sheet to peek`, (await page.locator('.sheet-peek').count()) === 1, await grip.getAttribute('aria-label'))
  if (!reduce) await page.screenshot({ path: `${OUT}/phone-sheet-peek.png` })
  ok(`${tag}: no horizontal overflow with the sheet`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  // markers are kept and moved, never rebuilt: the same DOM node must survive several simulated ticks
  await page.locator('.leaflet-marker-icon:has(.pin-sim)').first().evaluate((e) => { window.__m = e })
  await sleep(4500)
  ok(`${tag}: jeep marker is the same element after 2+ updates (no rebuild flicker)`, await page.evaluate(() => window.__m.isConnected))
  await ctx.close()
}

// ---------- map is Iligan City only
{
  const ctx = await browser.newContext({ viewport: PHONE, geolocation: { longitude: 124.64, latitude: 8.48 }, permissions: ['geolocation'] }) // Cagayan de Oro
  const page = await ctx.newPage(); await page.goto(BASE + '?mode=commuter')
  await page.getByRole('button', { name: /Use my current location/ }).click()
  await page.getByText('Outside Iligan').waitFor({ timeout: 15000 }).catch(() => {})
  ok('GPS outside Iligan City is refused with a clear message', (await page.getByText('Outside Iligan').isVisible()) && (await page.getByLabel('From', { exact: true }).isVisible()))
  await pickPlace(page, probe.aName, 'From'); await pickPlace(page, probe.bName, 'To'); await page.getByRole('button', { name: 'Show jeepneys' }).click()
  await page.waitForSelector('.card'); await sleep(800)
  const out = page.locator('.leaflet-control-zoom-out')
  for (let i = 0; i < 12 && !(await out.evaluate((e) => e.classList.contains('leaflet-disabled'))); i++) { await out.click({ timeout: 1500 }).catch(() => {}); await sleep(300) }
  ok('zooming out stops at the whole-city view', await out.evaluate((e) => e.classList.contains('leaflet-disabled')))
  await sleep(500); await page.screenshot({ path: `${OUT}/map-city-limit.png` })
  const m = page.locator('.map'); const bx = await m.boundingBox()
  await page.mouse.move(bx.x + bx.width * .7, bx.y + bx.height * .5); await page.mouse.down()
  for (let i = 1; i <= 10; i++) { await page.mouse.move(bx.x + bx.width * .7 - i * 120, bx.y + bx.height * .5 + i * 40); await sleep(16) }
  await page.mouse.up(); await sleep(700)
  await page.screenshot({ path: `${OUT}/map-pan-limit.png` })
  ok('city outline and outside mask are drawn', (await page.locator('.leaflet-mask-pane path').count()) >= 2)
  await ctx.close()
}

await browser.close()
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED')
process.exit(fails ? 1 : 0)
