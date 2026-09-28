# HV Reset

Your daily plan and reset, paired with [HV Vault](https://harshvittori.github.io/hv-vault-web/). Live at https://harshvittori.github.io/harsh-reset/ (the address keeps its original name so links and saved data keep working).

## Your account

- HV Reset opens after Google sign-in. It is the same account as HV Vault: both apps are on the same site, so signing in to one signs you in to the other.
- Your plan is saved to your account in Firestore at `users/<your account id>/reset/state`. The security rules let a signed-in user read and write only their own `users/{uid}/` space, so only you can see it. Phone and laptop stay in step within about 15 seconds.
- The browser keeps a working copy per account. Signing out removes it from that browser.
- Before accounts, HV Reset kept one shared plan in a public document (`reset/<id>`). On the owner's first sign-in it is copied into the owner's account, once. It is never deleted by the app, and nobody else's account receives it.

After the owner has signed in once, remove public access to the old document in Firebase console > Firestore > Rules, so the rules only allow each user's own space:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```
