// Tests for Model.js — the pure astronomy + cultivation engine.
//
// Run with:  node test/lunar-garden.test.js
//
// No test framework on purpose: the plugin ships no dependencies, and node's
// own assertions are enough to pin the behaviour that matters.

"use strict"

var assert = require("assert")
var M = require("../Model.js")

var failures = 0
var passed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log("  ok   " + name)
  } catch (err) {
    failures++
    console.log("  FAIL " + name)
    console.log("       " + (err && err.message ? err.message : err))
  }
}

function near(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    (label || "value") + ": expected ~" + expected + " ±" + tolerance + ", got " + actual
  )
}

var DAY = M.MS_PER_DAY

// ---------------------------------------------------------------------------
console.log("\nphase math")
// ---------------------------------------------------------------------------

test("epoch instant is a new moon (fraction 0)", function () {
  near(M.phaseFraction(M.EPOCH_MS), 0, 1e-12, "fraction")
  assert.strictEqual(M.phaseKeyForFraction(0), "newMoon")
  assert.ok(M.illumination(0) < 1e-12, "new moon must be unlit")
})

test("fraction advances a full cycle per synodic month", function () {
  // A full cycle is the same point on the circle, so compare circular distance:
  // the float sum EPOCH + CYCLE is not exactly representable and lands at
  // 0.99999999999998 rather than 0.
  var oneCycle = M.phaseFraction(M.EPOCH_MS + M.CYCLE_MS)
  near(Math.min(oneCycle, 1 - oneCycle), 0, 1e-9, "one cycle")
  near(M.phaseFraction(M.EPOCH_MS + 0.25 * M.CYCLE_MS), 0.25, 1e-9, "quarter cycle")
  near(M.phaseFraction(M.EPOCH_MS + 0.5 * M.CYCLE_MS), 0.5, 1e-9, "half cycle")
  near(M.phaseFraction(M.EPOCH_MS + 0.75 * M.CYCLE_MS), 0.75, 1e-9, "three quarters")
})

test("fraction is wrapped into [0,1) for instants before the epoch", function () {
  var f = M.phaseFraction(M.EPOCH_MS - 0.25 * M.CYCLE_MS)
  near(f, 0.75, 1e-9, "pre-epoch fraction")
  assert.ok(f >= 0 && f < 1, "fraction must stay in [0,1)")
})

test("illumination is 0 at new, 1 at full, ~0.5 at the quarters", function () {
  near(M.illumination(0), 0, 1e-12, "new")
  near(M.illumination(0.5), 1, 1e-12, "full")
  near(M.illumination(0.25), 0.5, 1e-12, "first quarter")
  near(M.illumination(0.75), 0.5, 1e-12, "last quarter")
})

test("illumination is symmetric about the full moon", function () {
  for (var d = 0.01; d < 0.5; d += 0.05) {
    near(M.illumination(0.5 - d), M.illumination(0.5 + d), 1e-12, "symmetry at " + d.toFixed(2))
  }
})

// ---------------------------------------------------------------------------
console.log("\nphase names and glyphs")
// ---------------------------------------------------------------------------

test("the eight phase names cover one cycle in order", function () {
  var expected = [
    "newMoon", "waxingCrescent", "firstQuarter", "waxingGibbous",
    "fullMoon", "waningGibbous", "lastQuarter", "waningCrescent"
  ]
  assert.deepStrictEqual(M.PHASE_KEYS, expected)
  for (var i = 0; i < 8; i++) {
    assert.strictEqual(M.phaseKeyForFraction(i / 8), expected[i], "at " + (i / 8))
  }
})

test("phase name bands are centred on the canonical instants", function () {
  assert.strictEqual(M.phaseKeyForFraction(0.98), "newMoon")
  assert.strictEqual(M.phaseKeyForFraction(0.02), "newMoon")
  assert.strictEqual(M.phaseKeyForFraction(0.26), "firstQuarter")
  assert.strictEqual(M.phaseKeyForFraction(0.49), "fullMoon")
  assert.strictEqual(M.phaseKeyForFraction(0.51), "fullMoon")
  assert.strictEqual(M.phaseKeyForFraction(0.74), "lastQuarter")
})

test("every phase key has a distinct glyph", function () {
  var seen = {}
  M.PHASE_KEYS.forEach(function (key) {
    var glyph = M.glyphForKey(key, false)
    assert.strictEqual(typeof glyph, "string")
    assert.ok(glyph.length > 0)
    assert.ok(!seen[glyph], "duplicate glyph for " + key)
    seen[glyph] = true
  })
})

test("northern and southern glyphs mirror waxing against waning", function () {
  assert.strictEqual(M.glyphForKey("waxingCrescent", false), M.glyphForKey("waningCrescent", true))
  assert.strictEqual(M.glyphForKey("waningCrescent", false), M.glyphForKey("waxingCrescent", true))
  assert.strictEqual(M.glyphForKey("firstQuarter", false), M.glyphForKey("lastQuarter", true))
  assert.strictEqual(M.glyphForKey("waxingGibbous", false), M.glyphForKey("waningGibbous", true))
})

test("new and full moons look the same from both hemispheres", function () {
  assert.strictEqual(M.glyphForKey("newMoon", false), M.glyphForKey("newMoon", true))
  assert.strictEqual(M.glyphForKey("fullMoon", false), M.glyphForKey("fullMoon", true))
})

test("unknown phase keys fall back to the new-moon glyph instead of crashing", function () {
  assert.strictEqual(M.glyphForKey("nonsense", false), M.glyphForKey("newMoon", false))
})

// ---------------------------------------------------------------------------
console.log("\ncultivation categories")
// ---------------------------------------------------------------------------

test("each quadrant maps to its plant family", function () {
  assert.strictEqual(M.categoryKeyForFraction(0.0), "leaf")
  assert.strictEqual(M.categoryKeyForFraction(0.1), "leaf")
  assert.strictEqual(M.categoryKeyForFraction(0.24), "leaf")
  assert.strictEqual(M.categoryKeyForFraction(0.25), "fruit")
  assert.strictEqual(M.categoryKeyForFraction(0.49), "fruit")
  assert.strictEqual(M.categoryKeyForFraction(0.5), "root")
  assert.strictEqual(M.categoryKeyForFraction(0.74), "root")
  assert.strictEqual(M.categoryKeyForFraction(0.75), "flower")
  assert.strictEqual(M.categoryKeyForFraction(0.99), "flower")
})

test("the four categories cycle in moon order", function () {
  assert.deepStrictEqual(M.CATEGORY_ORDER, ["leaf", "fruit", "root", "flower"])
  M.CATEGORY_ORDER.forEach(function (key) {
    assert.strictEqual(M.categoryFor(M.CATEGORY_ORDER.indexOf(key) / 4).key, key)
  })
})

test("each category has both a shape marker and a colour", function () {
  var markers = {}
  M.CATEGORY_ORDER.forEach(function (key) {
    var cat = M.categoryByKey(key)
    assert.strictEqual(cat.key, key)
    assert.ok(cat.marker && cat.marker.length > 0, key + " needs a marker")
    assert.ok(/^#[0-9a-f]{6}$/i.test(cat.color), key + " needs a hex colour")
    assert.ok(!markers[cat.marker], "markers must be distinct (colour-blind safety)")
    markers[cat.marker] = true
  })
})

test("an unknown category key falls back instead of returning undefined", function () {
  assert.strictEqual(M.categoryByKey("nope").key, "leaf")
})

// ---------------------------------------------------------------------------
console.log("\nnext phase change")
// ---------------------------------------------------------------------------

test("from a new moon the next change is the first quarter", function () {
  var next = M.nextPhaseChange(M.EPOCH_MS)
  assert.strictEqual(next.key, "firstQuarter")
  near((next.ms - M.EPOCH_MS) / DAY, 0.25 * M.SYNODIC_DAYS, 1e-6, "delay")
})

test("the next change is always strictly in the future", function () {
  var samples = [0, 0.1, 0.25, 0.3, 0.5, 0.6, 0.75, 0.9, 0.999]
  samples.forEach(function (f) {
    var ms = M.EPOCH_MS + f * M.CYCLE_MS
    var next = M.nextPhaseChange(ms)
    assert.ok(next.ms > ms, "next change must be after now at f=" + f)
    assert.ok(next.ms - ms <= 0.25 * M.CYCLE_MS + 1, "next change must be within a quadrant")
    assert.ok(next.inDays >= 1, "a future change is at least one day away")
  })
})

test("boundary keys name the phase that begins there", function () {
  assert.strictEqual(M.nextPhaseChange(M.EPOCH_MS).key, "firstQuarter")
  assert.strictEqual(M.nextPhaseChange(M.EPOCH_MS + 0.25 * M.CYCLE_MS).key, "fullMoon")
  assert.strictEqual(M.nextPhaseChange(M.EPOCH_MS + 0.5 * M.CYCLE_MS).key, "lastQuarter")
  assert.strictEqual(M.nextPhaseChange(M.EPOCH_MS + 0.75 * M.CYCLE_MS).key, "newMoon")
})

test("each boundary announces the family it hands over to", function () {
  assert.strictEqual(M.nextPhaseChange(M.EPOCH_MS).categoryKey, "fruit")
  assert.strictEqual(M.nextPhaseChange(M.EPOCH_MS + 0.25 * M.CYCLE_MS).categoryKey, "root")
  assert.strictEqual(M.nextPhaseChange(M.EPOCH_MS + 0.5 * M.CYCLE_MS).categoryKey, "flower")
  assert.strictEqual(M.nextPhaseChange(M.EPOCH_MS + 0.75 * M.CYCLE_MS).categoryKey, "leaf")
})

test("inDays rounds up so 'in 1 day' never means 'already happened'", function () {
  var justBefore = M.EPOCH_MS + 0.25 * M.CYCLE_MS - 2 * 3600 * 1000 // 2h before first quarter
  var next = M.nextPhaseChange(justBefore)
  assert.strictEqual(next.key, "firstQuarter")
  assert.strictEqual(next.inDays, 1)
})

// ---------------------------------------------------------------------------
console.log("\ncalendar day detection")
// ---------------------------------------------------------------------------

function localDayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

test("the epoch new moon is detected on its own local day", function () {
  var reference = new Date(M.EPOCH_MS)
  var start = localDayStart(reference)
  var end = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + 1).getTime()
  assert.strictEqual(M.phaseChangeOnDay(start, end), "newMoon")
})

test("a day with no boundary reports none", function () {
  var reference = new Date(M.EPOCH_MS + 3 * DAY) // mid-waxing-crescent
  var start = localDayStart(reference)
  var end = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + 1).getTime()
  assert.strictEqual(M.phaseChangeOnDay(start, end), null)
})

test("phaseChangeOnDay never misses a boundary across a whole cycle", function () {
  var found = {}
  for (var d = 0; d < 30; d++) {
    var reference = new Date(M.EPOCH_MS + d * DAY)
    var start = localDayStart(reference)
    var end = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + 1).getTime()
    var key = M.phaseChangeOnDay(start, end)
    if (key) found[key] = true
  }
  assert.deepStrictEqual(
    Object.keys(found).sort(),
    ["firstQuarter", "fullMoon", "lastQuarter", "newMoon"]
  )
})

// ---------------------------------------------------------------------------
console.log("\nmonth grid")
// ---------------------------------------------------------------------------

test("grid always has whole weeks and covers every day of the month", function () {
  [[2026, 10], [2024, 1], [2026, 0], [2025, 11]].forEach(function (ym) {
    var grid = M.monthGrid(ym[0], ym[1], Date.now(), 1, false)
    assert.strictEqual(grid.length % 7, 0, "rows must be whole weeks")
    var inMonth = grid.filter(function (c) { return c.inMonth })
    assert.strictEqual(inMonth.length, M.daysInMonth(ym[0], ym[1]), "every day present")
    inMonth.forEach(function (c) {
      assert.strictEqual(c.month, ym[1])
      assert.strictEqual(c.year, ym[0])
    })
  })
})

test("grid respects the first day of the week", function () {
  // Monday-first: the first cell must be a Monday (getDay() === 1).
  var grid = M.monthGrid(2026, 10, Date.now(), 1, false)
  assert.strictEqual(new Date(grid[0].year, grid[0].month, grid[0].day).getDay(), 1)
  // Sunday-first: the first cell must be a Sunday (getDay() === 0).
  var sunday = M.monthGrid(2026, 10, Date.now(), 0, false)
  assert.strictEqual(new Date(sunday[0].year, sunday[0].month, sunday[0].day).getDay(), 0)
})

test("exactly one cell is today, and only in the real month", function () {
  var now = new Date(2026, 10, 10, 15, 30).getTime()
  var grid = M.monthGrid(2026, 10, now, 1, false)
  var today = grid.filter(function (c) { return c.isToday })
  assert.strictEqual(today.length, 1)
  assert.strictEqual(today[0].day, 10)
  assert.strictEqual(today[0].month, 10)
  assert.ok(today[0].inMonth)
})

test("a different month shows no today marker", function () {
  var now = new Date(2026, 10, 10, 15, 30).getTime()
  var grid = M.monthGrid(2026, 8, now, 1, false)
  assert.strictEqual(grid.filter(function (c) { return c.isToday }).length, 0)
})

test("adjacent-month padding days keep their own month and are flagged out of month", function () {
  var grid = M.monthGrid(2026, 10, Date.now(), 1, false)
  var padding = grid.filter(function (c) { return !c.inMonth })
  assert.ok(padding.length > 0, "a month rarely starts on the week boundary")
  padding.forEach(function (c) {
    assert.notStrictEqual(c.month, 10)
  })
})

test("every cell carries a category, a phase and a glyph", function () {
  var grid = M.monthGrid(2026, 10, Date.now(), 1, false)
  grid.forEach(function (c) {
    assert.ok(M.CATEGORY_ORDER.indexOf(c.categoryKey) >= 0, "category at day " + c.day)
    assert.ok(M.PHASE_KEYS.indexOf(c.phaseKey) >= 0, "phase at day " + c.day)
    assert.ok(c.glyph.length > 0, "glyph at day " + c.day)
    assert.ok(c.weekday >= 0 && c.weekday <= 6, "weekday at day " + c.day)
    assert.strictEqual(c.weekday, new Date(c.year, c.month, c.day).getDay())
  })
})

test("days with a phase change carry the phase that begins, and a change flag", function () {
  var grid = M.monthGrid(2026, 10, Date.now(), 1, false)
  // Only the month's own days: the grid's padding cells belong to the
  // neighbouring months and would inflate the count.
  var changes = grid.filter(function (c) { return c.changeKey && c.inMonth })
  assert.ok(changes.length >= 3 && changes.length <= 5, "a month holds 3 to 5 phase changes, got " + changes.length)
  changes.forEach(function (c) {
    assert.strictEqual(c.phaseKey, c.changeKey)
  })
  grid.filter(function (c) { return !c.changeKey }).forEach(function (c) {
    assert.strictEqual(c.changeKey, null)
  })
})

test("southern rendering flips the glyphs inside the grid", function () {
  var north = M.monthGrid(2026, 10, Date.now(), 1, false)
  var south = M.monthGrid(2026, 10, Date.now(), 1, true)
  var differences = 0
  for (var i = 0; i < north.length; i++) {
    if (north[i].glyph !== south[i].glyph) differences++
  }
  assert.ok(differences > 0, "southern grid should differ somewhere")
})

// ---------------------------------------------------------------------------
console.log("\nmoonState snapshot")
// ---------------------------------------------------------------------------

test("moonState reports a complete, self-consistent snapshot", function () {
  var now = new Date(2026, 10, 10, 15, 30).getTime()
  var state = M.moonState(now, false)
  assert.ok(state.fraction >= 0 && state.fraction < 1)
  assert.ok(state.illuminationPct >= 0 && state.illuminationPct <= 100)
  assert.ok(state.ageDays >= 0 && state.ageDays <= M.SYNODIC_DAYS)
  assert.ok(state.lunarDay >= 1 && state.lunarDay <= 30)
  assert.ok(M.PHASE_KEYS.indexOf(state.phaseKey) >= 0)
  assert.ok(M.CATEGORY_ORDER.indexOf(state.categoryKey) >= 0)
  assert.ok(state.glyph.length > 0)
  assert.ok(state.nextChangeMs > now)
  assert.ok(M.PHASE_KEYS.indexOf(state.nextChangeKey) >= 0)
  assert.ok(M.CATEGORY_ORDER.indexOf(state.nextCategoryKey) >= 0)
  assert.ok(state.nextChangeInDays >= 1)
  assert.strictEqual(state.phaseKey, M.phaseKeyForFraction(state.fraction))
  assert.strictEqual(state.categoryKey, M.categoryKeyForFraction(state.fraction))
})

test("lunar day counts the cycle in thirty whole days", function () {
  var cycleMs = M.SYNODIC_DAYS * 24 * 60 * 60 * 1000
  // The new moon starts lunar day 1; the cycle's last thirtieth closes on 30.
  assert.strictEqual(M.moonState(M.EPOCH_MS + 1000, false).lunarDay, 1)
  assert.strictEqual(M.moonState(M.EPOCH_MS + cycleMs * 0.99, false).lunarDay, 30)
  assert.strictEqual(M.moonState(M.EPOCH_MS + cycleMs * 0.35, false).lunarDay, 11)
})

test("moonState defaults to the northern glyph when handed no hemisphere", function () {
  var now = Date.now()
  assert.strictEqual(M.moonState(now).glyph, M.moonState(now, false).glyph)
})

// ---------------------------------------------------------------------------
console.log("\ni18n catalogs")
// ---------------------------------------------------------------------------

var fs = require("fs")
var path = require("path")

function catalog(lang) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "i18n", lang + ".json"), "utf8"))
}

test("both catalogs parse and carry the same keys", function () {
  var en = catalog("en")
  var es = catalog("es")
  assert.deepStrictEqual(Object.keys(es).sort(), Object.keys(en).sort())
})

test("every phase and category the model can produce has a translation", function () {
  var langs = ["en", "es"]
  for (var i = 0; i < langs.length; i++) {
    var d = catalog(langs[i])
    M.PHASE_KEYS.forEach(function (key) {
      assert.ok(typeof d["phase." + key] === "string" && d["phase." + key].length > 0,
        langs[i] + " is missing phase." + key)
    })
    M.CATEGORY_ORDER.forEach(function (key) {
      ["name", "phase", "tasks", "crops"].forEach(function (field) {
        var k = "cat." + key + "." + field
        assert.ok(typeof d[k] === "string" && d[k].length > 0, langs[i] + " is missing " + k)
      })
    })
  }
})

test("the day-count key carries both CLDR plural forms", function () {
  ;["en", "es"].forEach(function (lang) {
    var value = catalog(lang)["ui.inDays"]
    assert.ok(value && typeof value === "object", lang + " ui.inDays must be a plural object")
    assert.ok(typeof value.one === "string" && typeof value.other === "string", lang + " needs one/other")
    assert.ok(value.one.indexOf("%1") >= 0 && value.other.indexOf("%1") >= 0, lang + " needs a %1 hole")
  })
})

// ---------------------------------------------------------------------------
console.log("\n" + passed + " passed, " + failures + " failed\n")
process.exit(failures === 0 ? 0 : 1)
