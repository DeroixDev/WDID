import UIKit
import Capacitor

/// Registriert die app-eigenen Funktionen (Orte, Texterkennung, Face ID) bei Capacitor.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WDIDNativePlugin())
    }
}
