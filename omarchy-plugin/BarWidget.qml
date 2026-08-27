import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "cbayschm.deepl"

  readonly property string launcher: Quickshell.env("HOME") + "/deepl-omarchy/launch.sh"

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
