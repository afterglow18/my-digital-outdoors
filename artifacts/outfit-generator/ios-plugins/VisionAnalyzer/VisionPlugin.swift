import Foundation
import Capacitor
import Vision
import UIKit

@objc(VisionPlugin)
public class VisionPlugin: CAPPlugin {

    /// Analyze an image data URL with VNClassifyImageRequest + VNRecognizeTextRequest.
    /// Both requests run synchronously on a background queue.
    /// Always resolves — never rejects. Falls back to empty arrays on any error.
    @objc func analyze(_ call: CAPPluginCall) {
        guard let dataUrl = call.getString("imageDataUrl") else {
            call.resolve(["labels": [], "text": []])
            return
        }

        // Strip the data URL prefix to get the raw base64 string
        let base64 = dataUrl
            .replacingOccurrences(of: "data:image/jpeg;base64,", with: "")
            .replacingOccurrences(of: "data:image/png;base64,",  with: "")
            .replacingOccurrences(of: "data:image/webp;base64,", with: "")

        guard
            let data   = Data(base64Encoded: base64, options: .ignoreUnknownCharacters),
            let uiImg  = UIImage(data: data),
            let cgImg  = uiImg.cgImage
        else {
            call.resolve(["labels": [], "text": []])
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            var labels:    [String] = []
            var textItems: [String] = []
            let handler = VNImageRequestHandler(cgImage: cgImg, options: [:])

            // ── Classify (objects / scenes / colors) ──────────────────────────
            let classifyReq = VNClassifyImageRequest()
            // ── Recognize text ────────────────────────────────────────────────
            let textReq = VNRecognizeTextRequest()
            textReq.recognitionLevel = .accurate
            textReq.usesLanguageCorrection = true

            do {
                try handler.perform([classifyReq, textReq])
            } catch {
                // Fall through — both arrays stay empty
            }

            if let results = classifyReq.results {
                labels = results
                    .filter { $0.confidence >= 0.3 }
                    .map    { $0.identifier }
            }

            if let results = textReq.results {
                textItems = results
                    .compactMap { $0.topCandidates(1).first?.string }
                    .filter     { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            }

            call.resolve(["labels": labels, "text": textItems])
        }
    }
}
