import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "io.github.cbayschm74.deepl-clipboard"

  readonly property url launcherUrl: Qt.resolvedUrl("launch.sh")
  readonly property string launcher: decodeURIComponent(
    String(launcherUrl).replace(/^file:\/\//, "")
  )

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "\uf1ab"
    slotSize: Style.bar.statusSlot
    fontSize: Style.font.caption
    tooltipText: "Translate clipboard with DeepL"
    onPressed: Quickshell.execDetached([root.launcher])
  }
}
