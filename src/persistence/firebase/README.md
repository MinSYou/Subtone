# Adding a Firebase (Firestore) adapter

Nothing here is wired up yet; the app runs fully on-device. This describes how to add sync without touching the UI or analytics.

## Shape

```
users/{uid}/transactions/{id}
users/{uid}/categories/{id}
users/{uid}/budgets/{id}
users/{uid}/recurring/{id}
users/{uid}/goals/{id}
users/{uid}/contributions/{id}
users/{uid}/meta/settings
```

## Adapter sketch

```ts
import type { FinanceRepository, ChangeSet } from '../repository';
import { COLLECTIONS } from '../repository';
import { parseSnapshot } from '../backup';

export function createFirestoreRepository(db: Firestore, uid: string): FinanceRepository {
  return {
    kind: 'firestore',
    async load() {
      // read each collection + meta/settings, then validate with parseSnapshot()
    },
    async apply(changes: ChangeSet) {
      const batch = writeBatch(db);
      for (const name of COLLECTIONS) {
        changes[name]?.upserts.forEach((r) => batch.set(doc(db, 'users', uid, name, r.id), r));
        changes[name]?.deletes.forEach((id) => batch.delete(doc(db, 'users', uid, name, id)));
      }
      if (changes.settings) batch.set(doc(db, 'users', uid, 'meta', 'settings'), changes.settings);
      await batch.commit(); // throw on failure; FinanceStore shows the error and offers retry
    },
    async replaceAll(snapshot) {
      // delete existing docs, then write the snapshot in batches of ≤ 500 operations
    },
  };
}
```

Then return it from `chooseRepository()` in `src/main.tsx` once the user signs in. Keep the localStorage adapter as an offline cache, or enable Firestore's own persistence.

## Notes

- Validate with `parseSnapshot()` on load, just as backups are validated.
- Security rules: `allow read, write: if request.auth.uid == uid;` on `users/{uid}/**`.
- Amounts stay integer cents; dates stay `YYYY-MM-DD` strings, which sort and query correctly in Firestore.
