import UIKit
import Capacitor

/// Registriert die app-eigenen Funktionen (Orte, Texterkennung, Face ID) bei Capacitor.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WDIDNativePlugin())
        guard let scrollView = webView?.scrollView else { return }
        // iOS 26 legt oben und unten einen weichen Schleier über scrollende Inhalte. Die App zeichnet ihren Rand selbst.
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            scrollView.topEdgeEffect.isHidden = true
            scrollView.bottomEdgeEffect.isHidden = true
        }
        #endif
    }

    /// Hintergrund hinter der Webansicht in der Theme-Farbe, damit beim Überscrollen nichts Helles durchscheint.
    func applyBackground(_ color: UIColor) {
        view.backgroundColor = color
        webView?.backgroundColor = color
        webView?.scrollView.backgroundColor = color
        webView?.isOpaque = false
        if #available(iOS 15.0, *) { webView?.underPageBackgroundColor = color }
    }
}
