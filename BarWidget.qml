import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Model.js" as Model

// Lunar Garden in the bar: the moon as it stands today, plus the shape of the
// plant family it favours. Colour carries the family too, but the shape is the
// channel that survives a colour-blind eye or a monochrome theme.
//
// Left click opens the planting calendar; right click brings a browsing panel
// back to the current month.
BarWidget {
  id: root
  moduleName: "nathker.lunar-garden"

  // The lit limb of the moon swaps sides below the equator, so the same lunar
  // day is drawn mirrored there. Set "south" in this widget's shell.json entry.
  readonly property bool southern: String(setting("hemisphere", "north")).toLowerCase() === "south"

  // Kept at day precision: the reading is a calendar, not a clock, so one
  // update at midnight is all a minute-precision clock is asked for.
  property date today: new Date()

  readonly property var moon: Model.moonState(today.getTime(), root.southern)
  readonly property var category: Model.categoryByKey(root.moon.categoryKey)

  // Nerd Font PUA codepoints are claimed by several fonts, so the glyphs are
  // pinned to the family the theme actually resolved instead of letting Qt's
  // fallback wander into, say, a CJK font's slot for the same code.
  readonly property string glyphFontFamily:
    Style.resolvedFontFamily !== "monospace" ? Style.resolvedFontFamily : "JetBrainsMono Nerd Font"

  // The model hands the family colour out as a hex string; a `color` property
  // coerces it, and only then do `.r/.g/.b` work — reading them straight off
  // the string yields undefined and Qt.tint falls back to the bare foreground.
  readonly property color categoryColor: root.category.color

  // The bar is monochrome by design; tinting the pill toward the family's
  // colour keeps that calm while still naming the day at a glance.
  readonly property color pillColor: root.bar
    ? Qt.tint(root.bar.barForeground, Qt.rgba(root.categoryColor.r, root.categoryColor.g, root.categoryColor.b, 0.8))
    : Commons.Color.foreground

  Commons.Translations {
    id: strings
    directory: Qt.resolvedUrl("i18n")
  }

  readonly property string label: root.moon.glyph + " " + root.category.marker
  readonly property string tooltip: strings.t("ui.tooltip")
    .arg(strings.t("phase." + root.moon.phaseKey))
    .arg(strings.t("cat." + root.category.key + ".name"))

  function refresh() {
    root.today = new Date()
    if (panelLoader.item && panelLoader.item.refresh) panelLoader.item.refresh()
  }

  function goToToday() {
    if (panelLoader.item && panelLoader.item.goToToday) panelLoader.item.goToToday()
  }

  // ---- Panel. Shape contract for shell.summon/hide/toggle routing:
  //      Bar.findPanelWidget requires open/close/opened on this root.
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false

  function open() {
    if (panelLoader.item) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function togglePanel() {
    if (panelLoader.item) panelLoader.item.toggle()
  }

  // Lets this widget stand in for the panel as the bar's popout identity:
  // Bar.requestPopout prefers closeForPopoutSwitch over close, and
  // KeyboardPanel reads popoutSwitchClosing back off its owner.
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  // The open-panel mark tracks what the pill paints, not the whole slot.
  readonly property real openPanelIndicatorWidth: button.labelWidth
  readonly property real openPanelIndicatorHeight: Math.max(Style.space(10), Math.round(Style.bar.iconSlot * 0.55))

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  SystemClock {
    id: clock
    precision: SystemClock.Minutes
    onDateChanged: {
      // Minute precision exists only to notice midnight; the reading itself
      // recomputes when the local date actually turns over.
      if (Qt.formatDate(clock.date, "yyyy-MM-dd") === Qt.formatDate(root.today, "yyyy-MM-dd")) return
      root.today = clock.date
    }
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  IpcHandler {
    target: "nathker.lunar-garden"

    function refresh(): void { root.broadcast("refresh") }
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.togglePanel() }
    function goToToday(): void { root.goToToday() }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.label
    foreground: root.pillColor
    fontSize: Style.bar.iconFont
    fontFamily: root.glyphFontFamily
    tooltipText: root.tooltip
    // The label is a pair of Nerd Font glyphs; the font's own figure metrics
    // are the honest ones here, so the default figure-centring applies.
    horizontalMargin: 8

    onPressed: function(button) {
      if (!root.bar) return
      if (button === Qt.RightButton) root.goToToday()
      else root.togglePanel()
    }
  }
}
