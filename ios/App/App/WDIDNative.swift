import UIKit
import Capacitor
import CoreLocation
import UserNotifications
import Vision
import LocalAuthentication

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
            region.notifyOnExit = false
            manager.startMonitoring(for: region)
        }
    }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard region.identifier.hasPrefix(prefix) else { return }
        let id = String(region.identifier.dropFirst(prefix.count))
        guard let list = UserDefaults.standard.array(forKey: storeKey) as? [[String: Any]],
              let entry = list.first(where: { ($0["id"] as? String) == id }),
              let body = entry["body"] as? String, !body.isEmpty else { return }

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
        CAPPluginMethod(name: "biometryType", returnType: CAPPluginReturnPromise)
    ]

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
