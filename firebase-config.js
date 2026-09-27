/* Firebase web config shared by HV Vault and HV Reset (Firebase project: harsh-reset).
   These values are public by design; the Firestore security rules are what protect data.
   Paste apiKey and appId from: Firebase console > Project settings > General > Your apps > Web app. */
window.HV_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDggasAVdqpvamkn1xeex2NmPUqG9JiZJ4",
  authDomain: "harsh-reset.firebaseapp.com",
  projectId: "harsh-reset",
  appId: "1:592094409539:web:57d3aa494464b867bbf5f6",
  // App Check: the same public reCAPTCHA Enterprise site key HV Vault uses (same web app, same domain:
  // harshvittori.github.io). The site's built-in AI (Firebase AI Logic) only answers App Check-verified pages.
  appCheckSiteKey: "6LdZltEtAAAAANC5e-PJFqs2YrM1ubR3CKv0sOhl",
  appCheckProvider: "enterprise",
};
