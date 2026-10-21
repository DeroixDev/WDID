import UIKit
import Capacitor
import CoreLocation
import UserNotifications
import Vision
import LocalAuthentication
import WebKit
import MapKit
import QuickLook

/// Ankunftserkennung über die Regionsüberwachung von iOS.
/// Lebt unabhängig von der Web-Oberfläche, weil iOS die App bei Ankunft im Hintergrund startet,
/// ohne ein Fenster zu öffnen. Die Texte der Mitteilungen legt die App vorher in UserDefaults ab.
final class GeofenceManager: NSObject, CLLocationManagerDelegate {
    static let shared = GeofenceManager()

    private let manager = CLLocationManager()
    private let storeKey = "wdid.geofences"
    private let prefix = "wdid."

    private override init() {
        super.init()
        manager.delegate = self
    }

    var status: String {
        switch manager.authorizationStatus {
        case .authorizedAlways: return "always"
        case .authorizedWhenInUse: return "whenInUse"
        case .denied, .restricted: return "denied"
        default: return "notDetermined"
        }
    }

    func requestAlways() {
        // Bei „noch nicht gefragt“ zeigt iOS erst „Beim Verwenden“ und fragt später selbst nach „Immer“
        manager.requestAlwaysAuthorization()
    }

    func update(_ regions: [[String: Any]]) {
        UserDefaults.standard.set(regions, forKey: storeKey)
        for region in manager.monitoredRegions where region.identifier.hasPrefix(prefix) {
            manager.stopMonitoring(for: region)
        }
        guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else { return }
        // iOS überwacht höchstens 20 Regionen pro App
        for entry in regions.prefix(20) {
            guard let id = entry["id"] as? String,
                  let lat = entry["lat"] as? Double,
                  let lng = entry["lng"] as? Double else { continue }
            let radius = min(max(entry["radius"] as? Double ?? 150, 100), manager.maximumRegionMonitoringDistance)
            let region = CLCircularRegion(center: CLLocationCoordinate2D(latitude: lat, longitude: lng), radius: radius, identifier: prefix + id)
            region.notifyOnEntry = true
            // Orte mit Arbeitszeiterfassung melden auch das Verlassen
            region.notifyOnExit = (entry["stop"] as? Double ?? 0) > 0
            manager.startMonitoring(for: region)
        }
    }

    private let workKey = "wdid.workEvents"

    private func entry(for region: CLRegion) -> (String, [String: Any])? {
        guard region.identifier.hasPrefix(prefix) else { return nil }
        let id = String(region.identifier.dropFirst(prefix.count))
        guard let list = UserDefaults.standard.array(forKey: storeKey) as? [[String: Any]],
              let entry = list.first(where: { ($0["id"] as? String) == id }) else { return nil }
        return (id, entry)
    }

    /// Kommen und Gehen für die Arbeitszeit; die App holt die Liste beim nächsten Öffnen ab.
    private func recordWork(_ type: String, _ id: String) {
        var events = UserDefaults.standard.array(forKey: workKey) as? [[String: Any]] ?? []
        events.append(["type": type, "id": id, "at": Date().timeIntervalSince1970 * 1000])
        UserDefaults.standard.set(Array(events.suffix(200)), forKey: workKey)
    }

    func takeWorkEvents() -> [[String: Any]] {
        let events = UserDefaults.standard.array(forKey: workKey) as? [[String: Any]] ?? []
        UserDefaults.standard.removeObject(forKey: workKey)
        return events
    }

    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        guard let found = entry(for: region), (found.1["stop"] as? Double ?? 0) > 0 else { return }
        let (id, entry) = found
        recordWork("exit", id)
        let now = Date().timeIntervalSince1970
        let enteredAt = UserDefaults.standard.double(forKey: "wdid.enter." + id)
        UserDefaults.standard.removeObject(forKey: "wdid.enter." + id)
        guard let body = entry["exitBody"] as? String, enteredAt > 0 else { return }
        let minutes = Int((now - enteredAt) / 60)
        let duration = minutes < 60 ? "\(minutes) min" : "\(minutes / 60) h \(String(format: "%02d", minutes % 60)) min"
        let content = UNMutableNotificationContent()
        content.title = body
        content.body = "Vor Ort: \(duration). Die Zeit steht im Eintrag."
        content.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "wdid.exit.\(id).\(Int(now))", content: content, trigger: nil))
    }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard let found = entry(for: region) else { return }
        let (id, entry) = found
        if (entry["track"] as? Double ?? 0) > 0 {
            recordWork("enter", id)
            // Beim kurzen Rein-und-Raus die erste Ankunft behalten
            if UserDefaults.standard.double(forKey: "wdid.enter." + id) == 0 {
                UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "wdid.enter." + id)
            }
        }
        guard let body = entry["body"] as? String, !body.isEmpty else { return }

        // Höchstens eine Mitteilung pro Ort alle zwei Stunden
        let lastKey = "wdid.geofence.last." + id
        let now = Date().timeIntervalSince1970
        if now - UserDefaults.standard.double(forKey: lastKey) < 7200 { return }
        UserDefaults.standard.set(now, forKey: lastKey)

        let content = UNMutableNotificationContent()
        content.title = entry["title"] as? String ?? "WDID"
        content.body = body
        content.sound = .default
        content.userInfo = ["wdidPlace": entry["placeId"] as? String ?? id]
        let request = UNNotificationRequest(identifier: "wdid.geo.\(id).\(Int(now))", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}

@objc(WDIDNativePlugin)
public class WDIDNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WDIDNativePlugin"
    public let jsName = "WDIDNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setGeofences", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "locationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAlwaysLocation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recognizeText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "biometryType", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBackground", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "detectCodes", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "makePdf", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takeWorkEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "searchPlaces", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "preview", returnType: CAPPluginReturnPromise)
    ]

    /// Orte über die Apple-Karten-Suche finden (braucht Internet)
    @objc func searchPlaces(_ call: CAPPluginCall) {
        guard let query = call.getString("query"), !query.isEmpty else {
            call.resolve(["results": []])
            return
        }
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        if let lat = call.getDouble("lat"), let lng = call.getDouble("lng") {
            request.region = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: lat, longitude: lng), latitudinalMeters: 60000, longitudinalMeters: 60000)
        }
        DispatchQueue.main.async {
            MKLocalSearch(request: request).start { response, error in
                if let error = error as? MKError, error.code == .placemarkNotFound {
                    call.resolve(["results": []])
                    return
                }
                if let error = error {
                    call.reject(error.localizedDescription)
                    return
                }
                let results: [[String: Any]] = (response?.mapItems ?? []).prefix(8).map { item in
                    let mark = item.placemark
                    let street = [mark.thoroughfare, mark.subThoroughfare].compactMap { $0 }.joined(separator: " ")
                    let city = [mark.postalCode, mark.locality].compactMap { $0 }.joined(separator: " ")
                    let address = [street, city].filter { !$0.isEmpty }.joined(separator: ", ")
                    return ["name": item.name ?? query, "address": address,
                            "lat": mark.coordinate.latitude, "lng": mark.coordinate.longitude]
                }
                call.resolve(["results": results])
            }
        }
    }

    /// Dokumente mit der iOS-Vorschau öffnen (PDF, Bilder, Office, Text)
    @objc func preview(_ call: CAPPluginCall) {
        guard let path = call.getString("path"),
              let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            call.reject("Datei fehlt")
            return
        }
        let url = base.appendingPathComponent(path)
        guard FileManager.default.fileExists(atPath: url.path) else {
            call.reject("Datei nicht gefunden")
            return
        }
        DispatchQueue.main.async {
            let preview = FilePreview(url: url, title: call.getString("title"))
            let controller = QLPreviewController()
            controller.dataSource = preview
            FilePreview.current = preview
            self.bridge?.viewController?.present(controller, animated: true)
            call.resolve()
        }
    }

    @objc func takeWorkEvents(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["events": GeofenceManager.shared.takeWorkEvents()])
        }
    }

    /// Barcodes und QR-Codes auf Etiketten, ohne Internet
    @objc func detectCodes(_ call: CAPPluginCall) {
        guard let b64 = call.getString("base64"),
              let data = Data(base64Encoded: b64, options: .ignoreUnknownCharacters),
              let image = UIImage(data: data),
              let cgImage = image.cgImage else {
            call.reject("Das Bild konnte nicht gelesen werden.")
            return
        }
        let request = VNDetectBarcodesRequest { request, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            var seen = Set<String>()
            let codes = ((request.results as? [VNBarcodeObservation]) ?? [])
                .compactMap { $0.payloadStringValue?.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty && seen.insert($0).inserted }
            call.resolve(["codes": codes])
        }
        let orientation = CGImagePropertyOrientation(image.imageOrientation)
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try VNImageRequestHandler(cgImage: cgImage, orientation: orientation).perform([request])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Macht aus HTML ein mehrseitiges A4-PDF im temporären Ordner
    @objc func makePdf(_ call: CAPPluginCall) {
        guard let html = call.getString("html") else {
            call.reject("Kein Inhalt")
            return
        }
        let name = call.getString("name") ?? "WDID-Bericht"
        DispatchQueue.main.async {
            PDFMaker().make(html: html, name: name, host: self.bridge?.viewController?.view) { url, error in
                if let url = url { call.resolve(["uri": url.absoluteString]) } else { call.reject(error ?? "PDF fehlgeschlagen") }
            }
        }
    }

    /// Theme-Farbe als Hex (#RRGGBB) für den nativen Hintergrund
    @objc func setBackground(_ call: CAPPluginCall) {
        let hex = (call.getString("color") ?? "").trimmingCharacters(in: CharacterSet(charactersIn: "# "))
        guard hex.count == 6, let v = UInt32(hex, radix: 16) else { return call.reject("Ungültige Farbe") }
        let color = UIColor(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
        DispatchQueue.main.async {
            (self.bridge?.viewController as? MainViewController)?.applyBackground(color)
            call.resolve()
        }
    }

    @objc func setGeofences(_ call: CAPPluginCall) {
        let regions = (call.getArray("regions") ?? []).compactMap { value -> [String: Any]? in
            guard let obj = value as? JSObject else { return nil }
            var out: [String: Any] = [:]
            for (key, val) in obj {
                if let n = val as? NSNumber { out[key] = n.doubleValue } else if let s = val as? String { out[key] = s }
            }
            return out
        }
        DispatchQueue.main.async {
            GeofenceManager.shared.update(regions)
            call.resolve(["count": min(regions.count, 20)])
        }
    }

    @objc func locationStatus(_ call: CAPPluginCall) {
        call.resolve(["status": GeofenceManager.shared.status])
    }

    @objc func requestAlwaysLocation(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            GeofenceManager.shared.requestAlways()
            call.resolve(["status": GeofenceManager.shared.status])
        }
    }

    /// Texterkennung direkt auf dem iPhone, ohne Internet
    @objc func recognizeText(_ call: CAPPluginCall) {
        guard let b64 = call.getString("base64"),
              let data = Data(base64Encoded: b64, options: .ignoreUnknownCharacters),
              let image = UIImage(data: data),
              let cgImage = image.cgImage else {
            call.reject("Das Bild konnte nicht gelesen werden.")
            return
        }
        let request = VNRecognizeTextRequest { request, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
            // Von oben nach unten, dann von links nach rechts (Vision zählt y von unten)
            let sorted = observations.sorted {
                abs($0.boundingBox.midY - $1.boundingBox.midY) > 0.01 ? $0.boundingBox.midY > $1.boundingBox.midY : $0.boundingBox.minX < $1.boundingBox.minX
            }
            let lines = sorted.compactMap { $0.topCandidates(1).first?.string }
            call.resolve(["text": lines.joined(separator: "\n")])
        }
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["de-DE", "en-US"]
        request.usesLanguageCorrection = true
        let orientation = CGImagePropertyOrientation(image.imageOrientation)
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try VNImageRequestHandler(cgImage: cgImage, orientation: orientation).perform([request])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            call.resolve(["success": false, "available": false])
            return
        }
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: call.getString("reason") ?? "WDID entsperren") { success, _ in
            call.resolve(["success": success, "available": true])
        }
    }

    @objc func biometryType(_ call: CAPPluginCall) {
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch context.biometryType {
        case .faceID: call.resolve(["type": "faceID"])
        case .touchID: call.resolve(["type": "touchID"])
        default: call.resolve(["type": "none"])
        }
    }
}

extension CGImagePropertyOrientation {
    init(_ orientation: UIImage.Orientation) {
        switch orientation {
        case .up: self = .up
        case .upMirrored: self = .upMirrored
        case .down: self = .down
        case .downMirrored: self = .downMirrored
        case .left: self = .left
        case .leftMirrored: self = .leftMirrored
        case .right: self = .right
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}

/// Lädt HTML in eine unsichtbare Webansicht und druckt sie seitenweise in ein PDF.
final class PDFMaker: NSObject, WKNavigationDelegate {
    private static var running: [PDFMaker] = []
    private var webView: WKWebView?
    private var name = "WDID-Bericht"
    private var completion: ((URL?, String?) -> Void)?

    func make(html: String, name: String, host: UIView?, completion: @escaping (URL?, String?) -> Void) {
        self.name = name
        self.completion = completion
        let webView = WKWebView(frame: CGRect(x: -2000, y: 0, width: 595, height: 842))
        webView.navigationDelegate = self
        webView.isHidden = true
        host?.addSubview(webView)
        self.webView = webView
        PDFMaker.running.append(self)
        webView.loadHTMLString(html, baseURL: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Bilder kurz dekodieren lassen
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.render() }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(nil, error.localizedDescription)
    }

    private func render() {
        guard let webView = webView else { return }
        let renderer = UIPrintPageRenderer()
        renderer.addPrintFormatter(webView.viewPrintFormatter(), startingAtPageAt: 0)
        let page = CGRect(x: 0, y: 0, width: 595.2, height: 841.8)
        renderer.setValue(NSValue(cgRect: page), forKey: "paperRect")
        renderer.setValue(NSValue(cgRect: page.insetBy(dx: 42, dy: 48)), forKey: "printableRect")
        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, page, [kCGPDFContextTitle as String: name, kCGPDFContextCreator as String: "WDID"])
        renderer.prepare(forDrawingPages: NSRange(location: 0, length: renderer.numberOfPages))
        for index in 0..<renderer.numberOfPages {
            UIGraphicsBeginPDFPage()
            renderer.drawPage(at: index, in: UIGraphicsGetPDFContextBounds())
        }
        UIGraphicsEndPDFContext()
        let file = name.replacingOccurrences(of: "/", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(file + ".pdf")
        do {
            try data.write(to: url, options: .atomic)
            finish(url, nil)
        } catch {
            finish(nil, error.localizedDescription)
        }
    }

    private func finish(_ url: URL?, _ error: String?) {
        completion?(url, error)
        completion = nil
        webView?.removeFromSuperview()
        webView = nil
        PDFMaker.running.removeAll { $0 === self }
    }
}

/// Datenquelle für die iOS-Dateivorschau, mit lesbarem Titel statt Dateiname
final class FilePreview: NSObject, QLPreviewControllerDataSource {
    static var current: FilePreview?
    private let item: Item

    final class Item: NSObject, QLPreviewItem {
        let previewItemURL: URL?
        let previewItemTitle: String?
        init(url: URL, title: String?) {
            previewItemURL = url
            previewItemTitle = title
        }
    }

    init(url: URL, title: String?) {
        item = Item(url: url, title: title)
    }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { item }
}
