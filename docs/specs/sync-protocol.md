# The sync protocol

**Status:** version 2 (0.7.0: an entry carries its key epoch and no wrapped key, and the answer says nothing of a vault header; version 1 was 0.1.x's), written with the code (`src/core/sync/protocol.ts`, `src/server/entries/`, `src/local/wallet.ts`; DESIGN.md §11). A device holds a
copy of an account's entries, as ciphertext, and keeps it equal to the server's by sending what it changed and taking what changed. **The server cannot
read an entry** ([`vault-format.md`](vault-format.md)), so it orders, checks and stores, and the **devices merge**. A change to the protocol changes this file,
`PROTOCOL_VERSION` and the examples below, which `src/core/sync/spec.test.ts` runs, in the same change.

## One door

```
POST /api/sync        the session cookie, and Origin equal to the app's own address
GET  /api/keys/root   the account's wrapped keyring roots, as base64url; { "roots": [] } when there are none
POST /api/keys/root   keeps the root of an epoch, once: 201 when kept, 200 with the stored one when the account already had it
```

The account is the session's and nothing a request says. A request for something that is another account's is answered as one for something that is not
there. **Sealed values travel as base64url text** (RFC 4648 §5, no padding, canonical) inside JSON and are stored as bytes.

## A request

<!-- example: request -->

```json
{
  "v": 2,
  "deviceId": "6b1f1c5e-5b0f-4d7e-9a76-0c2b6d3f8a11",
  "cursor": 41,
  "mutations": [
    {
      "id": "0b0f2f4a-8f5b-4a30-bb0f-6f0f4f6f8a01",
      "op": "put",
      "entryId": "f3a1c0de-2b7c-4c3e-8d11-5f0a7b9c2d44",
      "baseVersion": 0,
      "tier": "synced",
      "keyEpoch": 1,
      "shape": "Aa…",
      "body": "Aa…"
    },
    {
      "id": "1c1f3f5b-9f6c-4b41-8c1f-7f1f5f7f9b02",
      "op": "delete",
      "entryId": "a7d2e1fa-3c8d-4d4f-9e22-6a1b8c0d3e55",
      "baseVersion": 3,
      "tier": "synced"
    }
  ]
}
```

- `v` is the protocol's version. A server that does not speak it answers **426** `{ "code": "UPDATE_REQUIRED" }`, and the device keeps its outbox and says
  to update.
- `deviceId` is a UUID the browser makes and keeps. `cursor` is the highest `seq` the device has pulled.
- **A mutation** is one entry's change. `id` is a UUID the device makes, so that **sending a mutation twice changes nothing** (the server records the ids it
  applied, per account). `entryId` is made by the device. `baseVersion` is the version the change started from: **0 for a new entry**. A `put` carries the
  key epoch (the generation of the keyring root its key is derived from: `1`), the sealed shape and, if the entry has one, the sealed body, and replaces the whole entry; a `delete` carries none of them and makes a
  tombstone. In 0.1.0 `tier` is `synced`; the others are in the format and refused (`tier_unavailable`).
- At most 50 mutations, and at most 4 MB, per request; the rest follows in the next. A request that is not this structure is **400**, one that is too large **413**,
  too many from one account **429**.

## What the server checks

In one short transaction per mutation, and **every condition is in a statement**:

1. The mutation was not applied before (then it is answered as it was, and nothing is written).
2. The entry id is not another account's (`not_found`, saying nothing of whose), and a `delete` or a `baseVersion` above 0 names an entry that is there.
3. The tier is one this server keeps (`tier_unavailable`).
4. **Sizes:** the key epoch is one the server accepts (`1`); a shape and a body **have the length that padding makes** (a whole number of 256-byte buckets for a
   shape, 1,024 for a body, plus the suite's envelope: 63 bytes, 16 for each further 64 KiB chunk, and the length of the document id
   `<account id>/<entry id>/<part>`, which the envelope carries in the clear), a shape of at most 4 KB (`invalid`, `too_large`).
5. The account is not fully offline with a body to store (`offline_mode`), has room for the entry (`limit`: entries; `quota`: bytes).
6. **`baseVersion` is the entry's current version**, else `stale`, with the row as it is now.

Then the account's counter `seq` is incremented, the row is written with that `seq` and the version one higher, and the mutation's id is recorded, all in
the transaction. A refusal takes no number. It **reads nothing of an entry but its length.**

## An answer

<!-- example: response -->

```json
{
  "v": 2,
  "applied": [{ "mutationId": "0b0f2f4a-8f5b-4a30-bb0f-6f0f4f6f8a01", "seq": 42, "version": 1 }],
  "refused": [
    {
      "mutationId": "1c1f3f5b-9f6c-4b41-8c1f-7f1f5f7f9b02",
      "code": "stale",
      "current": {
        "id": "a7d2e1fa-3c8d-4d4f-9e22-6a1b8c0d3e55",
        "tier": "synced",
        "version": 4,
        "seq": 40,
        "keyEpoch": 1,
        "shape": "Aa…",
        "body": "Aa…",
        "deletedAt": null,
        "createdAt": 1800000000000,
        "updatedAt": 1800000100000
      }
    }
  ],
  "rows": [],
  "cursor": 42,
  "more": false,
  "mode": "normal"
}
```

- `applied` says the `seq` and `version` each mutation got. `refused` says why: `stale`, `not_found`, `tier_unavailable`, `offline_mode`, `too_large`, `quota`, `limit`
  or `invalid`.
- `rows` are the account's rows past the request's `cursor`, in `seq` order, at most 100; **a tombstone has `shape` and `body` null**, and a body is sent
  only for a `synced` entry. `cursor` is the last row's `seq` (or the request's), and `more` says there are further rows past it: the device asks again.
  The answer includes the rows the request itself just wrote.
- `mode` is `normal`, or `offline` for a wallet kept fully offline (after 0.1.0).

## What a device does

- **Writes never wait.** A change is sealed, and written to the store and the **outbox** (with the row it started from) in one transaction; the loop sends it
  a moment later, and also syncs when the page loads or is returned to, when the connection returns, and again after an attempt that did not get through; never
  by the clock alone (DESIGN.md §11.3). One tab at a time.
- **A response is applied in one transaction:** the rows of the mutations that applied are put in the store as the device now knows them (so that a long
  pull cannot make them disappear for a moment), the pulled rows replace older ones (a row of a lower version is ignored), the outbox items that were
  answered are removed, and the cursor moves. Applying a response twice changes nothing.
- **A refusal other than `stale`** moves the entry's changes to _Couldn't sync_, whole, until the person retries or discards them. Nothing typed is thrown
  away.
- **`stale` is merged on the device (DESIGN.md §11.5):** the device opens the row it started from, its own change and the current row, merges field by
  field (a field changed on one side only takes that side; one changed on both takes **this device's value**, and the other is offered back with Undo; a
  list is one field), seals the result with `baseVersion` set to the current version, and sends it again. A delete against an edit is let go; an edit against a
  delete restores the entry; both deleted is deleted. **Merging needs the keys,** so while the wallet is locked a stale change waits, and is merged at the
  next unlock.
- **Several changes to one entry before any is sent** are chained (each with `baseVersion` one above the last), so that the server applies them in order.

## What this does not do yet

Files (`/api/blobs`), the other two tiers and moving between them, devices and removing one, pruning of old tombstones and applied-mutation records (they
are kept until it is built), fully offline mode, and the `lost` and `move` operations of DESIGN.md §11.2. Each changes the protocol by adding to it, with a
new version where an old device would misread it.
