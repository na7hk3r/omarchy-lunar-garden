// Pure astronomy + cultivation logic for nathker.lunar-garden.
//
// No network, no clock, no QML: every function is determined by the arguments
// it receives, so the same code runs inside the shell and under `node` for the
// test suite.
//
// Accuracy: the mean synodic month. It drifts up to ~0.6 day from the true
// instant of a phase, which is fine for planning garden work and is stated as
// a known limitation in the README. This is deliberately NOT an ephemeris.

// Mean synodic month (days) and the reference new moon 2000-01-06 18:14 UTC.
var SYNODIC_DAYS = 29.530588853
var MS_PER_DAY = 86400000
var CYCLE_MS = SYNODIC_DAYS * MS_PER_DAY
var EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14)

function wrap01(value) {
  var f = Number(value) % 1
  return f < 0 ? f + 1 : f
}

// Phase fraction of the synodic cycle at ms since the Unix epoch:
// 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter.
function phaseFraction(ms) {
  return wrap01((Number(ms) - EPOCH_MS) / CYCLE_MS)
}

// Lit fraction of the disc, 0..1.
function illumination(fraction) {
  return (1 - Math.cos(2 * Math.PI * wrap01(fraction))) / 2
}

// The eight named phases, in cycle order. Every other lookup (glyph, name,
// next-change key) indexes this same order, so they can never disagree.
var PHASE_KEYS = [
  "newMoon", "waxingCrescent", "firstQuarter", "waxingGibbous",
  "fullMoon", "waningGibbous", "lastQuarter", "waningCrescent"
]

// Nearest of the eight phases (each spans 1/8 of the cycle, centred on its
// canonical point) — the same quantization the glyph set uses.
function phaseIndex(fraction) {
  return Math.round(wrap01(fraction) * 8) % 8
}

function phaseKeyForFraction(fraction) {
  return PHASE_KEYS[phaseIndex(fraction)]
}

// Monochrome Nerd Font "weather-moon" glyphs (JetBrainsMono Nerd Font ships
// them; Luna already depends on the same codepoints on this machine). Rendered
// as plain text they inherit the bar/panel foreground instead of the emoji
// font's fixed palette.
var PLAIN_GLYPHS = [
  "\uE38D", "\uE390", "\uE394", "\uE397",
  "\uE39B", "\uE39E", "\uE3A2", "\uE3A5"
]

// Southern-hemisphere viewers see the lit limb on the opposite side, so the
// visible shape of a waxing moon reads like the northern waning one. Mirroring
// the index flips the drawn limb; the phase NAME stays the same everywhere.
function glyphForKey(key, southern) {
  var index = PHASE_KEYS.indexOf(key)
  if (index < 0) index = 0
  return PLAIN_GLYPHS[southern ? (8 - index) % 8 : index]
}

function glyphForFraction(fraction, southern) {
  return glyphForKey(phaseKeyForFraction(fraction), southern)
}

// ---- Cultivation categories -------------------------------------------------
// Phase-quadrant model (the one chosen for this plugin): each day falls in one
// of four quadrants, and each quadrant favours one plant family. It follows the
// common "plant by the moon" tradition and is orientative, not agronomic proof.
//
//   new -> first quarter   : leaf
//   first quarter -> full  : fruit
//   full -> last quarter   : root
//   last quarter -> new    : flower (+ the traditional rest/soil window)
//
// marker + colour are the two independent visual channels (shape AND colour),
// so the calendar never relies on colour alone.
var CATEGORIES = {
  leaf:   { key: "leaf",   marker: "\u25B2", color: "#7fae5a" }, // triangle, green
  fruit:  { key: "fruit",  marker: "\u25A0", color: "#d06b4f" }, // square, terracotta
  root:   { key: "root",   marker: "\u25CF", color: "#c8964f" }, // circle, ochre
  flower: { key: "flower", marker: "\u25C6", color: "#a98bc4" }  // diamond, violet
}

// Cycle order, used by the legend so it reads like the moon turning.
var CATEGORY_ORDER = ["leaf", "fruit", "root", "flower"]

function categoryKeyForFraction(fraction) {
  var f = wrap01(fraction)
  if (f < 0.25) return "leaf"
  if (f < 0.5) return "fruit"
  if (f < 0.75) return "root"
  return "flower"
}

function categoryFor(fraction) {
  return CATEGORIES[categoryKeyForFraction(fraction)]
}

function categoryByKey(key) {
  return CATEGORIES[key] || CATEGORIES.leaf
}

// ---- Next phase change ------------------------------------------------------
// The four canonical instants. A boundary's key is the phase that BEGINS there.
var BOUNDARY_KEYS = { 0: "newMoon", 0.25: "firstQuarter", 0.5: "fullMoon", 0.75: "lastQuarter" }
var BOUNDARIES = [0, 0.25, 0.5, 0.75]

function boundaryKey(b) {
  return BOUNDARY_KEYS[b]
}

// Smallest instant strictly after `ms` where the fraction equals `b`.
function nextCrossingMs(ms, b) {
  var u = (Number(ms) - EPOCH_MS) / CYCLE_MS
  var k = Math.floor(u - b) + 1
  var t = EPOCH_MS + (k + b) * CYCLE_MS
  // Float guard: nudge forward if rounding landed at or before the query.
  while (t <= ms) { k++; t = EPOCH_MS + (k + b) * CYCLE_MS }
  return t
}

// Next of the four phase changes, with the phase it starts and a day delta.
function nextPhaseChange(ms) {
  var best = null
  for (var i = 0; i < BOUNDARIES.length; i++) {
    var t = nextCrossingMs(ms, BOUNDARIES[i])
    if (!best || t < best.ms) {
      best = {
        ms: t,
        boundary: BOUNDARIES[i],
        key: boundaryKey(BOUNDARIES[i]),
        // The family that takes over at that boundary, so the popup can say
        // "next: root season" without re-deriving the mapping.
        categoryKey: categoryKeyForFraction(BOUNDARIES[i]),
        inDays: Math.max(0, Math.ceil((t - Number(ms)) / MS_PER_DAY))
      }
    }
  }
  return best
}

// ---- Day / month helpers ----------------------------------------------------
// Local-midnight boundaries come from the JS Date constructor, so the platform's
// time zone and DST rules apply exactly as the desktop clock would.
function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function sameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

// A phase boundary that lands on the local day [dayStart, dayEnd), or null.
function phaseChangeOnDay(dayStart, dayEnd) {
  for (var i = 0; i < BOUNDARIES.length; i++) {
    var b = BOUNDARIES[i]
    var u = (dayStart - EPOCH_MS) / CYCLE_MS
    var k = Math.ceil(u - b)
    var t = EPOCH_MS + (k + b) * CYCLE_MS
    while (t < dayStart) { k++; t = EPOCH_MS + (k + b) * CYCLE_MS }
    if (t < dayEnd) return boundaryKey(b)
  }
  return null
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

// Everything the UI needs about "now".
function moonState(ms, southern) {
  var f = phaseFraction(ms)
  var next = nextPhaseChange(ms)
  return {
    fraction: f,
    // The tradition counts the cycle in thirty lunar days, the first one
    // beginning at the new moon itself. An integer is what a gardener reads;
    // the fractional age stays here for callers that want the exact offset.
    lunarDay: Math.floor(f * 30) + 1,
    ageDays: Math.round(f * SYNODIC_DAYS * 10) / 10,
    illuminationPct: Math.round(illumination(f) * 100),
    phaseKey: phaseKeyForFraction(f),
    glyph: glyphForFraction(f, southern === true),
    categoryKey: categoryKeyForFraction(f),
    nextChangeKey: next.key,
    // The family that begins at the next change, for the popup's "next" line.
    nextCategoryKey: next.categoryKey,
    nextChangeMs: next.ms,
    nextChangeInDays: next.inDays
  }
}

// Calendar cells for one month view, padded with neighbouring-month days so
// every row has seven slots. `month` is 0-based (JS Date convention);
// `firstDayOfWeek` is 0 for Sunday, 1 for Monday. Fractions are sampled at
// local noon, which is stable for the whole day.
function monthGrid(year, month, nowMs, firstDayOfWeek, southern) {
  var weekStart = (firstDayOfWeek === 0) ? 0 : 1
  var first = new Date(year, month, 1)
  var total = daysInMonth(year, month)
  var offset = (first.getDay() - weekStart + 7) % 7
  var cells = Math.ceil((offset + total) / 7) * 7
  var now = new Date(Number(nowMs))
  var out = []

  for (var i = 0; i < cells; i++) {
    var d = new Date(year, month, 1 - offset + i)
    var y = d.getFullYear(), m = d.getMonth(), day = d.getDate()
    var noon = new Date(y, m, day, 12, 0, 0, 0).getTime()
    var dayStart = startOfLocalDay(d)
    var dayEnd = new Date(y, m, day + 1).getTime()
    var f = phaseFraction(noon)
    var change = phaseChangeOnDay(dayStart, dayEnd)
    var phaseKey = change || phaseKeyForFraction(f)
    out.push({
      year: y,
      month: m,
      day: day,
      // 0 = Sunday … 6 = Saturday, so the grid can dim weekends without
      // rebuilding a Date per cell in QML.
      weekday: d.getDay(),
      inMonth: m === month,
      isToday: sameLocalDay(d, now),
      fraction: f,
      phaseKey: phaseKey,
      glyph: glyphForKey(phaseKey, southern === true),
      categoryKey: categoryKeyForFraction(f),
      changeKey: change
    })
  }
  return out
}

if (typeof module !== "undefined") {
  module.exports = {
    SYNODIC_DAYS: SYNODIC_DAYS,
    EPOCH_MS: EPOCH_MS,
    MS_PER_DAY: MS_PER_DAY,
    CYCLE_MS: CYCLE_MS,
    wrap01: wrap01,
    phaseFraction: phaseFraction,
    illumination: illumination,
    PHASE_KEYS: PHASE_KEYS,
    phaseIndex: phaseIndex,
    phaseKeyForFraction: phaseKeyForFraction,
    PLAIN_GLYPHS: PLAIN_GLYPHS,
    glyphForKey: glyphForKey,
    glyphForFraction: glyphForFraction,
    CATEGORIES: CATEGORIES,
    CATEGORY_ORDER: CATEGORY_ORDER,
    categoryKeyForFraction: categoryKeyForFraction,
    categoryFor: categoryFor,
    categoryByKey: categoryByKey,
    nextPhaseChange: nextPhaseChange,
    phaseChangeOnDay: phaseChangeOnDay,
    daysInMonth: daysInMonth,
    startOfLocalDay: startOfLocalDay,
    sameLocalDay: sameLocalDay,
    moonState: moonState,
    monthGrid: monthGrid
  }
}
