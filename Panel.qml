import QtQuick
import Quickshell
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Model.js" as Model

// The planting calendar: today's moon and the plant family it favours, the
// next turn of the cycle, and the month ahead with its phase changes and its
// favourable days.
//
// BarWidget.qml owns the pill in the bar and hands this panel the button to
// anchor against.
Panel {
  id: root
  moduleName: "nathker.lunar-garden"
  ipcTarget: "nathker.lunar-garden"
  manageIpc: false

  property var anchorItem: null

  // The bar tracks the widget mounted in its slot — BarWidget.qml — not this
  // nested panel. Everything the bar identifies a panel by has to be that
  // widget: the popout coordinator (and with it the open-panel dot under the
  // pill) compares against `slot.activeItem`, and switchPanelFrom looks the
  // slot up the same way.
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  Commons.Translations {
    id: strings
    directory: Qt.resolvedUrl("i18n")
  }

  // ---- Settings. The panel receives the widget's shell.json entry, so the
  //      hemisphere follows the same setting the pill reads.
  function setting(name, fallback) {
    var value = settings ? settings[name] : undefined
    return value === undefined || value === null ? fallback : value
  }

  readonly property bool southern: String(setting("hemisphere", "north")).toLowerCase() === "south"

  // ---- Today. A day-precision clock keeps the reading honest across
  //      midnight without rebuilding the month every minute.
  property date today: new Date()

  // ---- The month on screen. Stepping moves this and nothing else: the grid
  //      is a read-out, not a picker.
  property int viewYear: today.getFullYear()
  property int viewMonth: today.getMonth()
  readonly property date viewDate: new Date(viewYear, viewMonth, 1, 12)
  readonly property bool viewingCurrentMonth: viewYear === today.getFullYear() && viewMonth === today.getMonth()

  // Names and the week's first day follow the Omarchy language, not the system
  // locale, which only catches up at the next login.
  readonly property var labelLocale: Qt.locale(Commons.I18n.formatLocale)
  // QLocale's first day is 1..7 with Sunday as 7; the model wants 0 for Sunday.
  readonly property int weekStart: root.labelLocale.firstDayOfWeek % 7
  readonly property var weekdays: {
    var out = []
    for (var i = 0; i < 7; i++) {
      var day = (root.weekStart + i) % 7
      out.push(day === 0 ? 7 : day)
    }
    return out
  }

  readonly property var moon: Model.moonState(today.getTime(), southern)
  readonly property var todayCategory: Model.categoryByKey(root.moon.categoryKey)
  readonly property string nextGlyph: Model.glyphForKey(root.moon.nextChangeKey, root.southern)
  readonly property var days: Model.monthGrid(
    viewYear, viewMonth, today.getTime(), root.weekStart, root.southern)

  // Guarded so the panel renders before the bar is injected (the bar-widget
  // contract instantiates it bare).
  readonly property color contentForeground: bar ? bar.foreground : Commons.Color.foreground
  readonly property string contentFontFamily: bar ? bar.fontFamily : Style.font.family
  // Nerd Font PUA codepoints are claimed by several fonts; pin the concrete
  // family the theme resolved so the moon never comes back as a box.
  readonly property string glyphFontFamily:
    Style.resolvedFontFamily !== "monospace" ? Style.resolvedFontFamily : "JetBrainsMono Nerd Font"

  // Compact card: a month of seven 45px columns plus the gap between them fits
  // the 360px shell with its padding. Both scale with the theme's spacing and
  // font scale, so the proportions hold when the desktop is made roomier.
  readonly property int cardWidth: Style.space(360)
  readonly property int cellSpacing: Style.space(2)
  readonly property int cellHeight: Style.space(32)

  readonly property string monthTitle: strings.t("ui.monthYear")
    .arg(root.labelLocale.standaloneMonthName(root.viewMonth, Locale.LongFormat))
    .arg(root.viewDate.toLocaleDateString(root.labelLocale, "yyyy"))
    .toUpperCase()

  readonly property string todayDateText: root.today.toLocaleDateString(
    root.labelLocale, strings.t("ui.datePattern"))

  function open() {
    refresh()
    root.controller.show()
    // Set after showing, not before: showing hands the popout coordinator
    // over, which closes whichever panel was open, and that close clears the
    // shared flag. Deferring means the panel taking over always wins, while a
    // handoff to a panel that does not manage the flag still leaves it
    // cleared rather than stuck on.
    Qt.callLater(function() {
      if (root.opened) setCenterHoverRevealSuppressed(true)
    })
  }

  function close() {
    setCenterHoverRevealSuppressed(false)
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.open()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  // Summoning by hotkey moves no pointer, so a hover the bar was still
  // holding must not keep the center indicators revealed behind the panel.
  function setCenterHoverRevealSuppressed(value) {
    if (root.bar && typeof root.bar.setCenterHoverRevealSuppressed === "function")
      root.bar.setCenterHoverRevealSuppressed(value)
    else if (root.bar && "centerHoverRevealSuppressed" in root.bar)
      root.bar.centerHoverRevealSuppressed = value
  }

  function refresh() {
    root.today = new Date()
    root.goToToday()
  }

  function goToToday() {
    root.viewYear = root.today.getFullYear()
    root.viewMonth = root.today.getMonth()
  }

  function moveMonth(delta) {
    var next = new Date(root.viewYear, root.viewMonth + delta, 1, 12)
    root.viewYear = next.getFullYear()
    root.viewMonth = next.getMonth()
  }

  function moveYear(delta) {
    root.moveMonth(delta * 12)
  }

  SystemClock {
    id: clock
    precision: SystemClock.Minutes
    onDateChanged: {
      if (Qt.formatDate(clock.date, "yyyy-MM-dd") === Qt.formatDate(root.today, "yyyy-MM-dd")) return
      var followToday = root.viewingCurrentMonth
      root.today = clock.date
      if (followToday) root.goToToday()
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    // Anchored under the pill, not centered on screen: the calendar belongs to
    // the widget that opened it.
    centerOnBar: false
    focusTarget: panel.loadedContent
    contentWidth: panel.fittedContentWidth(root.cardWidth)
    contentHeight: panel.fittedContentHeight(panel.loadedContentHeight)

    content: PanelKeyCatcher {
      id: keyCatcher
      implicitHeight: body.implicitHeight

      readonly property int cellWidth: Math.max(1, Math.floor((width - 6 * root.cellSpacing) / 7))

      onMoveRequested: function(dx, dy) {
        if (dx !== 0) root.moveMonth(dx)
        if (dy !== 0) root.moveYear(dy)
      }
      onActivateRequested: root.goToToday()
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(t) {
        if (t === "[") root.moveMonth(-1)
        else if (t === "]") root.moveMonth(1)
        else if (t === "{") root.moveYear(-1)
        else if (t === "}") root.moveYear(1)
        else if (t === "t" || t === "T") root.goToToday()
      }

      Column {
        id: body
        width: parent.width
        spacing: Style.space(9)

        // ---- Today's moon: the glyph leads, the reading follows.
        Item {
          width: parent.width
          height: Math.max(heroGlyph.height, heroTexts.implicitHeight)

          OpticalGlyph {
            id: heroGlyph
            width: Style.space(36)
            height: width
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            text: root.moon.glyph
            fontFamily: root.glyphFontFamily
            fontSize: Style.font.displayLarge
            paintedSize: Style.space(32)
            color: root.contentForeground
          }

          Column {
            id: heroTexts
            anchors.left: heroGlyph.right
            anchors.leftMargin: Style.space(10)
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(1)

            Text {
              width: parent.width
              textFormat: Text.PlainText
              text: strings.t("phase." + root.moon.phaseKey)
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.heading
              font.bold: true
              elide: Text.ElideRight
            }

            Text {
              width: parent.width
              textFormat: Text.PlainText
              text: root.todayDateText
              color: Qt.darker(root.contentForeground, 1.45)
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.bodySmall
              elide: Text.ElideRight
            }

            Text {
              width: parent.width
              textFormat: Text.PlainText
              text: strings.t("ui.meta")
                .arg(Commons.I18n.formatNumber(root.moon.illuminationPct))
                .arg(Commons.I18n.formatNumber(root.moon.lunarDay))
              color: Qt.darker(root.contentForeground, 1.8)
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.caption
            }
          }
        }

        // ---- The next turn of the cycle. The glyph stays neutral: it names a
        //      phase, and the family colours are already spoken for by the
        //      markers.
        Item {
          width: parent.width
          height: Math.max(nextLeft.implicitHeight, nextRight.implicitHeight)

          Row {
            id: nextLeft
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(6)

            Text {
              textFormat: Text.PlainText
              text: strings.t("ui.sectionNext").toUpperCase()
              color: Qt.darker(root.contentForeground, 1.9)
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
              font.letterSpacing: 1
            }

            Text {
              textFormat: Text.PlainText
              text: root.nextGlyph
              color: Qt.darker(root.contentForeground, 1.25)
              font.family: root.glyphFontFamily
              font.pixelSize: Style.font.bodySmall
            }

            Text {
              textFormat: Text.PlainText
              text: strings.t("phase." + root.moon.nextChangeKey)
              color: Qt.darker(root.contentForeground, 1.2)
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.bodySmall
            }
          }

          Text {
            id: nextRight
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            textFormat: Text.PlainText
            text: strings.tn("ui.inDays", root.moon.nextChangeInDays)
              .arg(Commons.I18n.formatNumber(root.moon.nextChangeInDays))
            color: Qt.darker(root.contentForeground, 1.7)
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
          }
        }

        PanelSeparator { }

        // ---- Today's work: the family, what it asks for, what it covers.
        Column {
          width: parent.width
          spacing: Style.space(4)

          Text {
            textFormat: Text.PlainText
            text: strings.t("ui.sectionToday").toUpperCase()
            color: Qt.darker(root.contentForeground, 1.9)
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.caption
            font.bold: true
            font.letterSpacing: 1
          }

          Item {
            width: parent.width
            height: categoryName.implicitHeight

            Text {
              id: categoryMarker
              textFormat: Text.PlainText
              anchors.left: parent.left
              anchors.baseline: categoryName.baseline
              text: root.todayCategory.marker
              color: root.todayCategory.color
              font.family: root.glyphFontFamily
              font.pixelSize: Style.font.title
            }

            Text {
              id: categoryName
              textFormat: Text.PlainText
              anchors.left: categoryMarker.right
              anchors.leftMargin: Style.space(5)
              text: strings.t("cat." + root.todayCategory.key + ".name")
              color: root.contentForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.subtitle
              font.bold: true
            }

            Text {
              textFormat: Text.PlainText
              anchors.right: parent.right
              anchors.baseline: categoryName.baseline
              text: strings.t("cat." + root.todayCategory.key + ".phase")
              color: Qt.darker(root.contentForeground, 1.7)
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.caption
            }
          }

          Text {
            width: parent.width
            textFormat: Text.PlainText
            text: strings.t("cat." + root.todayCategory.key + ".tasks")
            color: root.contentForeground
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
          }

          Text {
            width: parent.width
            textFormat: Text.PlainText
            text: strings.t("ui.cropsLabel") + ": " + strings.t("cat." + root.todayCategory.key + ".crops")
            color: Qt.darker(root.contentForeground, 1.55)
            font.family: root.contentFontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.WordWrap
          }
        }

        PanelSeparator { }

        // ---- The month. One wheel turn or arrow key per month; the title
        //      brings a browsing panel home.
        Column {
          width: parent.width
          spacing: Style.space(6)

          Item {
            width: parent.width
            height: Math.max(Style.space(28), prevButton.size)

            Text {
              id: monthLabel
              textFormat: Text.PlainText
              anchors.centerIn: parent
              // Leaves the chevrons their own room; a long month name elides
              // rather than sliding under them.
              width: parent.width - Style.space(72)
              horizontalAlignment: Text.AlignHCenter
              elide: Text.ElideRight
              text: root.monthTitle
              color: Qt.darker(root.contentForeground, 1.4)
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.body
              font.letterSpacing: 1
            }

            MouseArea {
              id: monthMouse
              anchors.fill: monthLabel
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: root.goToToday()
            }

            PanelToolTip {
              visible: monthMouse.containsMouse
              text: strings.t("ui.backToToday")
              fontFamily: root.contentFontFamily
            }

            PanelActionButton {
              id: prevButton
              anchors.left: parent.left
              anchors.verticalCenter: parent.verticalCenter
              iconText: Commons.I18n.rightToLeft ? "󰅂" : "󰅁"
              tooltipText: strings.t("ui.previousMonth")
              foreground: root.contentForeground
              fontFamily: root.glyphFontFamily
              onClicked: root.moveMonth(-1)
            }

            PanelActionButton {
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              iconText: Commons.I18n.rightToLeft ? "󰅁" : "󰅂"
              tooltipText: strings.t("ui.nextMonth")
              foreground: root.contentForeground
              fontFamily: root.glyphFontFamily
              onClicked: root.moveMonth(1)
            }
          }

          // Positioners lay their children out themselves, so anything that
          // needs centring in the column gets a plain Item wrapper first.
          Item {
            width: parent.width
            height: weekdayRow.height

            Row {
              id: weekdayRow
              anchors.horizontalCenter: parent.horizontalCenter
              spacing: root.cellSpacing

              Repeater {
                model: root.weekdays

                Text {
                  required property var modelData
                  textFormat: Text.PlainText
                  width: keyCatcher.cellWidth
                  // Accented abbreviations (MIÉ, SÁB) reach above the cap
                  // height; the extra room keeps them off the row's edge.
                  height: Style.space(18)
                  horizontalAlignment: Text.AlignHCenter
                  verticalAlignment: Text.AlignVCenter
                  text: String(root.labelLocale.dayName(modelData, Locale.ShortFormat)).toUpperCase()
                  color: Qt.darker(root.contentForeground, 1.5)
                  font.family: root.contentFontFamily
                  font.pixelSize: Style.font.caption
                  font.letterSpacing: 1
                  font.bold: true
                }
              }
            }
          }

          Item {
            width: parent.width
            height: monthGrid.height

            Grid {
              id: monthGrid
              anchors.horizontalCenter: parent.horizontalCenter
              columns: 7
              columnSpacing: root.cellSpacing
              rowSpacing: root.cellSpacing

              Repeater {
                model: root.days

                Rectangle {
                  id: cell
                  required property var modelData

                  width: keyCatcher.cellWidth
                  height: root.cellHeight
                  radius: Style.cornerRadius
                  // Today is outlined, not filled: a lit-up block shouts over a
                  // grid this quiet.
                  color: "transparent"
                  border.width: modelData.isToday ? Style.spacing.hairline : 0
                  border.color: Style.normalBorderFor(root.contentForeground, Commons.Color.accent)
                  opacity: modelData.inMonth ? 1 : 0.45

                  // Date and phase glyph are one centred unit: on the four
                  // change days the date steps aside just enough for the moon
                  // to sit beside it, so the glyph never drifts toward the
                  // neighbouring column and never crowds the digits.
                  Row {
                    id: dateRow
                    anchors.top: parent.top
                    anchors.topMargin: Style.space(1)
                    anchors.horizontalCenter: parent.horizontalCenter
                    spacing: Style.space(4)

                    Text {
                      id: dayNumber
                      textFormat: Text.PlainText
                      text: Commons.I18n.formatNumber(cell.modelData.day)
                      color: cell.modelData.weekday === 0 || cell.modelData.weekday === 6
                        ? Qt.darker(root.contentForeground, 1.45)
                        : root.contentForeground
                      font.family: root.contentFontFamily
                      font.pixelSize: Style.font.body
                      font.bold: cell.modelData.isToday
                    }

                    Item {
                      visible: cell.modelData.changeKey !== null
                      width: phaseGlyph.implicitWidth
                      height: dayNumber.implicitHeight

                      Text {
                        id: phaseGlyph
                        textFormat: Text.PlainText
                        anchors.verticalCenter: parent.verticalCenter
                        text: cell.modelData.changeKey ? cell.modelData.glyph : ""
                        color: Qt.darker(root.contentForeground, 1.25)
                        font.family: root.glyphFontFamily
                        font.pixelSize: Style.font.caption
                      }
                    }
                  }

                  Text {
                    textFormat: Text.PlainText
                    anchors.bottom: parent.bottom
                    anchors.bottomMargin: Style.space(2)
                    anchors.horizontalCenter: parent.horizontalCenter
                    text: Model.categoryByKey(cell.modelData.categoryKey).marker
                    color: Model.categoryByKey(cell.modelData.categoryKey).color
                    font.family: root.glyphFontFamily
                    font.pixelSize: Style.font.caption
                  }
                }
              }
            }

            WheelHandler {
              onWheel: function(event) {
                // Horizontal wheels and touchpad side-scrolls report y === 0;
                // without this they would every one read as "next month".
                if (event.angleDelta.y === 0) return
                root.moveMonth(event.angleDelta.y > 0 ? -1 : 1)
              }
            }
          }
        }

        PanelSeparator { }

        // ---- Legend: the four families, in the order the moon turns.
        Item {
          width: parent.width
          height: legendRow.height

          Row {
            id: legendRow
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: Style.space(12)

            Repeater {
              model: Model.CATEGORY_ORDER

              Row {
                required property string modelData
                spacing: Style.space(4)

                Text {
                  textFormat: Text.PlainText
                  text: Model.categoryByKey(parent.modelData).marker
                  color: Model.categoryByKey(parent.modelData).color
                  font.family: root.glyphFontFamily
                  font.pixelSize: Style.font.caption
                }

                Text {
                  textFormat: Text.PlainText
                  text: strings.t("cat." + parent.modelData + ".name")
                  color: Qt.darker(root.contentForeground, 1.55)
                  font.family: root.contentFontFamily
                  font.pixelSize: Style.font.caption
                }
              }
            }
          }
        }

        Text {
          width: parent.width
          textFormat: Text.PlainText
          text: strings.t("ui.disclaimer")
          color: Qt.darker(root.contentForeground, 1.9)
          font.family: root.contentFontFamily
          font.pixelSize: Style.font.caption
          wrapMode: Text.WordWrap
        }
      }
    }
  }
}
