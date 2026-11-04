# What already exists, and what this project changes

Checked 2026-11-04 against the primary repositories. This is a bounded comparison,
not proof that no other product offers a similar workflow. A cooling-off wishlist
and savings goals are established ideas, not inventions claimed by this project.

| Existing project | Verified license | Established capability | Our narrower focus |
|---|---|---|---|
| [Actual Budget](https://github.com/actualbudget/actual) | [MIT](https://github.com/actualbudget/actual/blob/master/LICENSE.txt) | Local-first personal finance, account transactions and envelope budgeting | A pre-purchase cooling-off journey; it does not replace an account ledger or connect to bank balances |
| [wishthis](https://github.com/wishthis/wishthis) | [AGPL-3.0](https://github.com/wishthis/wishthis/blob/develop/LICENSE) | Creating, managing and sharing wishlists for occasions | A timed personal review, including a respectful decision to buy or release; there is no gift marketplace, affiliate link or multiuser service |
| [idb-keyval](https://github.com/jakearchibald/idb-keyval) | [Apache-2.0](https://github.com/jakearchibald/idb-keyval/blob/main/LICENCE) | Small promise-based IndexedDB key-value storage | Actually reused, unchanged, for browser storage; an application adapter adds backup-copy selection and an explicit volatile-memory fallback |

The substantive workflow is **cooling period → deliberate choice → separately
recorded manual deposit → reversible audit trail**. A released ¥22 wish increases
only the avoided-purchase-intent figure. It cannot increase the deposit total.
A user may later record a ¥10 deposit; only ¥10 counts toward the goal. A reversal
retains its historical entry and removes the amount from the current total.
Linked allocations cannot exceed the related released wish, preventing the same
wish from being repeatedly credited.

The implementation combines familiar ideas for this particular Xiaohobao creator
brief. It is not presented as a novel financial invention or a completed Alipay
integration. The interface, event model and tests are independently authored.
Only idb-keyval's storage code is copied under its own license. Pinned repository
heads are recorded in [landscape-sources.json](landscape-sources.json); exact
vendored release/hash are recorded in [the provenance file](../vendor/provenance.json).

Tests cover ledger separation, exact-cent arithmetic, cooldown boundaries, double
allocation, reversals, invalid imports, deterministic replay, and storage failure
recovery. Browser QA checks the actual wish/review/manual-record workflow and
narrow-screen layout. No payment, bank request or remote AI call is involved.

Save markers increase beyond every valid copy seen at startup, preserving the
existing backup-wrapper format. This prevents clock rollback or a same-millisecond
shorter replacement from reviving a stale copy after one backend fails. It does
not merge concurrent edits from multiple tabs; use one editing tab at a time.
