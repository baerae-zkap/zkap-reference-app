package com.baerae.signin.google

import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.PasswordCredential
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException

import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async

private const val TAG: String = "GoogleSignModule"

class GoogleSignModule : Module() {
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  override fun definition() = ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('GoogleSign')` in JavaScript.
    Name("GoogleSign")

    AsyncFunction("signin") Coroutine { clientId: String, nonce: String ->
      Log.d(TAG, "client : $clientId")
      Log.d(TAG, "nonce : $nonce")

      val googleIdOption = GetGoogleIdOption.Builder()
        .setFilterByAuthorizedAccounts(false) // true - check if the user has any accounts that have previously been used to sign in to the app
        .setServerClientId(clientId)
        .setAutoSelectEnabled(true) // true- Enable automatic sign-in for returning users
        .setNonce(nonce)
        .build()

      Log.d(TAG, "get cred req")
      val request: GetCredentialRequest = GetCredentialRequest.Builder()
        .addCredentialOption(googleIdOption)
        .build()

      val credentialManager = CredentialManager.create(appContext.reactContext!!)
      val activity = appContext.currentActivity ?: throw Exception("No activity available for Google Sign-In")

      val tokenId = CoroutineScope(Dispatchers.Unconfined).async {
        try {
          Log.d(TAG, "get credential")
          val result = credentialManager.getCredential(
            context = activity,
            request = request,
          )
          Log.d(TAG, "result $result")
          val idToken = handleSignIn(result)
          return@async idToken
        } catch( e: GetCredentialException) {
          handleFailure(e)
        }
      }

      return@Coroutine tokenId.await()
    }
  }

  private suspend fun handleSignIn(result: GetCredentialResponse): String {
    when(val credential = result.credential) {
      // PasskeyCredential
      is PublicKeyCredential -> {
//                val responseJson = credential.authenticationResponseJson
      }

      // Password credential
      is PasswordCredential -> {
//                val username = credential.id
//                var password = credential.password
      }

      // GoogleIdToken credential
      is CustomCredential -> {
        if(credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
          try {
            val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
            val idToken = googleIdTokenCredential.idToken

            Log.d(TAG, "credential $googleIdTokenCredential")
            Log.d(TAG, "idToken $idToken")

            return idToken
          } catch(e: GoogleIdTokenParsingException) {
            Log.e(TAG, "Received an invalid google id token response", e)
          }
        } else {
          // Catch any unrecognized custom credential type here.
          Log.e(TAG, "Unexpected type of credential, $credential")
        }
      }

      else -> {
        // Catch any unrecognized custom credential type here.
        Log.e(TAG, "Unexpected type of credential $credential")
      }
    }

    return ""
  }

  private fun handleFailure(e: GetCredentialException) {
    Log.w(TAG, "Unexpected exception type ${e::class.java.name}, $e")
    throw e
  }
}
