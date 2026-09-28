# HV Reset

Your daily plan and reset, paired with [HV Vault](https://harshvittori.github.io/hv-vault-web/). Live at https://harshvittori.github.io/hv-reset/ (the old address, /harsh-reset/, forwards here).

## First visit and your plan

- A new visitor gets a short step-by-step introduction instead of a timer: Welcome ("Missed your plan? Wasted a day? Lost your routine? That's what Reset is for."), Plan your day, One task at a time (with Pause and moving your day), two dashboard steps (See where your time really goes, Know if you're getting better), then "Let's make your first plan". Next, Back, Skip, progress dots, Enter and arrow keys. Someone who has seen it once starts at the last step. No plan means no timer.
- **Make my plan** opens the plan builder: start from a ready plan (Study day, Work day, Job search day) or from scratch, then set each block's start time, task, minutes and type (Focus, Meal, Break, Free time). Save it for every day, or only for today. HV AI can also build the plan from one sentence.
- Blocks that were already over when the plan was made don't count as late; a plan made in the evening starts the next day.
- Pressing **Start** (or **Start task** on the card) starts the current task: it shows "Started at 10:05 AM · 15 min", and the timer runs for the task's own length from that moment. When that time is up, the timer turns red ("over time"), on the start screen too. A task not started by its end time also turns red ("late"). Full day shows In progress.
- While a task runs, the card, the start screen and Full day show **Now: <task> · ongoing** and **Up next: <task> at <time> · in N min**, with a live countdown. If the running task ends later than the next one was planned, Up next moves to "right after this".
- Starting a task 5+ minutes early or late asks: "Move the rest of today earlier/later by the same time?" Yes shifts every later task (only today); No keeps the planned times, and Up next says "(as planned)". The home Start button starts the current task by itself only when it is on time.
- No task today: no countdown. The home screen says "Nothing planned today" (or "Your plan starts tomorrow") with **Add a task for today**, and a small line with the next task.
- **Add a task for today**: on the home screen, the day summary, the "no plan" card and Full day. Adds one task to today only.
- A running task can be **paused** and **resumed**; the time left waits while paused. After a timed task, one optional tap answers "How focused were you?".
- **My dashboard** (`dashboard.js`, `dashboard.css`): a full-page productivity dashboard with a side menu. See "Dashboard" below.
- After HV AI plans another day, the app stays on today and says where the plan went; a future day's card is a preview with Back to today.
- Breaks and meals have no steps: the card just shows the break and **Done, next block**.
- Looking at another day shows **Back to today**.
- The built-in job-hunt program (Day 1, Day 2, job days) belongs to the owner's account only.

## Dashboard

Opens from **My dashboard** (home), **Dashboard** (Full day) or **Open my dashboard** when the day is done. It answers three questions: what am I doing with my time, am I completing what I plan, and am I improving.

- **Sections:** Overview (the three answers, score, key numbers, top insights and alerts), Reports (daily, weekly, monthly, with a copyable summary), Insights, Alerts, Time tracking (estimate vs actual, Time accuracy score), Focus (timer time vs verified focus, deep work, interruptions, focus by hour), Punctuality & delays (deadline adherence, late starts, moves, delay patterns), Day timeline (24-hour planned vs recorded, gaps, overlaps), Trends, Calendar heatmap, Workload (next 14 days against a daily limit, unrealistic estimates), Goals & habits, Productivity score (six parts with adjustable weights), Timer history (with corrections), About the data.
- **Period and filters** at the top apply everywhere: today, yesterday, this or last week, this or last month, last 7, 30 or 90 days, or a custom range. Filter by type, priority (must do or flexible), status and whether time was recorded. Every number and chart opens the tasks behind it.
- **What is recorded:** each start, pause, resume and finish is kept as a timer session in the day (`days[date].sess`). Focus ratings are in `days[date].focus`, "Got distracted" taps while a timer runs in `days[date].intr`, and moves or skips in `days[date].mv` (with the time, so a move can be called before or after its deadline). Each day also keeps a copy of its plan (`days[date].snap`), so later plan edits don't rewrite history. Dashboard settings, goals, alerts and weights are in `dash`; habits are in `habits` and `habitLog`, separate from tasks.
- **Honest numbers:** planned time is never counted as work, a running timer is not counted as focus unless you rated it, missing data shows as "not tracked" instead of zero, and comparisons only appear when the earlier period has enough data. Older days without sessions use their start and finish times, marked with *.

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
