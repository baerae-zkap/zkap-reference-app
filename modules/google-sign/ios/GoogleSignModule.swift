import ExpoModulesCore
import GoogleSignIn

public class GoogleSignModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GoogleSign")

    AsyncFunction("signin") { (clientId: String, nonce: String) -> String in
      // Configure if not already set by @react-native-google-signin
      await MainActor.run {
        if GIDSignIn.sharedInstance.configuration == nil {
          GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientId)
        }
      }

      guard let vc = await MainActor.run(body: { Self.topViewController() }) else {
        throw GoogleSignError.noViewController
      }

      do {
        let result = try await GIDSignIn.sharedInstance.signIn(
          withPresenting: vc,
          hint: nil,
          additionalScopes: nil,
          nonce: nonce
        )

        guard let idToken = result.user.idToken?.tokenString else {
          throw GoogleSignError.noIdToken
        }

        return idToken
      } catch {
        let nsError = error as NSError
        if nsError.domain == "com.google.GIDSignIn" && nsError.code == -5 {
          throw GoogleSignError.cancelled
        }
        throw error
      }
    }
  }

  private static func topViewController() -> UIViewController? {
    guard let windowScene = UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene })
      .first,
      let rootVC = windowScene.windows.first(where: { $0.isKeyWindow })?.rootViewController
    else {
      return nil
    }

    var top = rootVC
    while let presented = top.presentedViewController {
      top = presented
    }
    return top
  }
}

enum GoogleSignError: LocalizedError {
  case noViewController
  case noIdToken
  case cancelled

  var errorDescription: String? {
    switch self {
    case .noViewController: return "Cannot find a view controller to present Google Sign-In"
    case .noIdToken: return "No ID token returned from Google Sign-In"
    case .cancelled: return "Sign in cancelled"
    }
  }
}
