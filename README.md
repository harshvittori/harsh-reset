# HV Reset

Your daily plan and reset, paired with [HV Vault](https://harshvittori.github.io/hv-vault-web/). Live at https://harshvittori.github.io/harsh-reset/ (the address keeps its original name so links and saved data keep working).

## First visit and your plan

- A new visitor sees a short welcome that explains HV Reset (plan your day in blocks, press Start, fell behind? one tap moves the day) instead of a timer. No plan means no timer.
- **Make my plan** opens the plan builder: start from a ready plan (Study day, Work day, Job search day) or from scratch, then set each block's start time, task, minutes and type (Focus, Meal, Break, Free time). Save it for every day, or only for today. HV AI can also build the plan from one sentence.
- Blocks that were already over when the plan was made don't count as late; a plan made in the evening starts the next day.
- Pressing **Start** (or **Start task** on the card) starts the current task: it shows "Started at 10:05 AM · 15 min", and the timer runs for the task's own length from that moment. When that time is up, the timer turns red ("over time"), on the start screen too. A task not started by its end time also turns red ("late"). Full day shows In progress.
- While a task runs, the card, the start screen and Full day show **Now: <task> · ongoing** and **Up next: <task> at <time> · in N min**, with a live countdown. If the running task ends later than the next one was planned, Up next moves to "right after this".
- Breaks and meals have no steps: the card just shows the break and **Done, next block**.
- Looking at another day shows **Back to today**.
- The built-in job-hunt program (Day 1, Day 2, job days) belongs to the owner's account only.

## Your account

- Anyone can use HV Reset without an account, and even make changes. Those changes stay in that tab only. The first change brings up a small "Sign in to save" card; after "Not now", a "Not saved · Sign in" pill stays. Closing the tab with unsaved changes asks first.
- Saving needs Google sign-in (the account button, top right). It is the same account as HV Vault: both apps are on the same site, so signing in to one signs you in to the other. Changes made before signing in move into the account; if the account already has a plan, you choose which one to keep.
- Your plan is saved to your account in Firestore at `users/<your account id>/reset/state`. The security rules let a signed-in user read and write only their own `users/{uid}/` space, so only you can see it. Phone and laptop stay in step within about 15 seconds.
- HV AI chat history is saved to your account (`users/<id>/ai/reset`) and follows you across devices. Guests' chats aren't saved.
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
