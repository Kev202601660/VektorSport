# VektorSport Security Specification (Phase 0)

## 1. Data Invariants
1. **Strict Ownership**: Every document under `/users/{userId}` and its subcollections (`favorite_teams`, `saved_predictions`, `alert_events`) belongs strictly to `request.auth.uid == userId` with `request.auth.token.email_verified == true`.
2. **Master Gate**: Subcollection documents can only be created, read, or updated if the parent `/users/{userId}` document exists and its `uid` matches `request.auth.uid`.
3. **Immutable Ownership & Creation Time**: `uid`, `userId`, and `createdAt` can never be mutated after creation.
4. **Server Timestamps**: `createdAt` and `updatedAt` must strictly equal `request.time`.
5. **Terminal State Locking**: A `SavedPrediction` with `status` in `['won', 'lost', 'void']` cannot transition to another status.
6. **No Blanket List / No PII Leakage**: `list` on `/users` is strictly denied; `list` on subcollections explicitly validates `resource.data.userId == request.auth.uid`.

## 2. Dirty Dozen Attack Payloads (All Must Fail with PERMISSION_DENIED)
1. **Unauthenticated read on `/users/userA`**: `auth: null`.
2. **Cross-user get on `/users/userB` by `userA`**: `auth.uid != userB`.
3. **Unverified email write on `/users/userA`**: `email_verified: false`.
4. **Shadow field injection on `UserProfile`**: adding `isAdmin: true` to create payload.
5. **Identity spoofing on `FavoriteTeam`**: `userId: "victimUid"` while authenticated as `attackerUid`.
6. **Path variable ID poisoning**: `teamKey` containing `/` or `> 128` chars or special symbols (`$bad!`).
7. **Unbounded array Denial-of-Wallet**: `followedLeagues` array with 50 items (> 25 limit).
8. **Type poisoning on `SavedPrediction`**: `confidence: "100"` (string instead of number) or `confidence: 150` (> 100).
9. **Client timestamp forgery**: `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time`.
10. **Immutable field mutation**: updating `userId` or `createdAt` on `SavedPrediction`.
11. **Terminal state bypass**: changing `SavedPrediction.status` from `'won'` back to `'pending'`.
12. **Blanket list query on `/users` collection**: attempting `getDocs(collection(db, 'users'))`.
