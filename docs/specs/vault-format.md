# What Wallet adds to the suite's encryption

**Status:** version 2 (0.7.0), written with the code (`src/core/vault/`, `src/keys/`; DESIGN.md §7, §8; RFC 0001). It replaces 0.1.x's own vault format (an age header, a
vault key and a wrapped key for each entry), which is gone: nothing of it is read, and no wallet made by 0.1.x is migrated. **Wallet holds no cipher.** The SDK
(`@sovereignfs/sdk`) does the encrypting, and this file says only what Wallet puts around it: the **keyring root**, the **entry keys derived from it**, the
**document ids** a value is bound to, and the **padding**. A change to any of them changes this file, its vectors (`vault-format.vectors.json`, run by
`src/core/vault/vectors.test.ts`) and the strings below, in the same change. **Not yet audited.**

## The keys

```
app key       the suite's: AES-GCM, random, wraps this app's keys, cannot be exported (core's release, or the app's own vault)
keyring root  32 random bytes per account and epoch, made by the account's first device
entry key     32 bytes, derived, never stored; the SDK's "document key"
```

- **The wrapped root.** `AES-256-GCM(app key, nonce, root, AAD)` with a random 12-byte nonce and `AAD = "wallet/v2/root|<account id>|<epoch>"`, stored as
  `nonce || ciphertext || tag`: **60 bytes**. The server keeps it (`keyring`, one row per account and epoch) and cannot open it. The first epoch is `1`.
- **An entry's key.** `HKDF-SHA-256(IKM = root, salt = empty, info = "wallet/v2/entry|<account id>|<entry id>")`, 32 bytes, imported with the SDK's
  `importDocumentKey` as a key that cannot be exported, and the bytes overwritten. It is a function of the root and two ids, so **an entry opens and is made with no
  network** once a device holds the root, and one entry's key tells nothing of another's.
- **On a device,** the root is held only as a non-extractable HKDF key while the wallet is unlocked, and at rest only under an unlock wrapper (DESIGN.md §9.3): a
  passkey's PRF output through HKDF (`info = "wallet/v2/unlock-key"`, the PRF input `wallet/v2/unlock`), or a device passcode through Argon2id (64 MiB, 3 passes) and
  a key the browser keeps; each wrapper is `AES-256-GCM` with `AAD = "wallet/v2/unlock|<passkey|passcode>|<epoch>"`.

## A sealed value

An entry's **shape** and **body** are each `encryptBytes(entry key, { documentId, version }, padded)`:

- `documentId = "<account id>/<entry id>/<part>"`, `part` being `shape` or `body`: the value is bound to its account, entry and part, so the server cannot move one
  to another entry, account or part unnoticed.
- `version` is the entry's **key epoch**: the generation of the root its key comes from, so a value made under another root does not open.
- `padded` is the UTF-8 JSON, then `0x80`, then `0x00` bytes to the next multiple of the bucket (ISO/IEC 7816-4): **256 bytes for a shape and 1,024 for a body**. A value
  that fills a bucket gets a whole bucket more. A server sees a shape as 256 or 512 bytes (plus the envelope), not as the length of a title.
- **The envelope** is the suite's (suite 1, RFC 0005 §1.3): `"SVE1"`, the suite byte, the chunk size, the version, the document id's length and the document id, 32 random
  bytes, then the ciphertext in 64 KiB chunks, each with a 16-byte tag. For a value of one chunk it adds **63 bytes and the length of the document id** (`<account
id>/<entry id>/<part>`, which the envelope carries in the clear, and the server knows); 16 more for each chunk after the first. The server's size check
  (`src/core/sync/limits.ts`) is this sum, and `limits.test.ts` holds it to the SDK's own output.
- A **file** is `encryptContent` under the entry's key and a document id of its own, as a stream of 64 KiB chunks, with the plaintext padded first (DESIGN.md §8.3).

## What a reader checks

A value that does not open for the key, document id and epoch it is read with is a `TamperedError`; one that opens and is not what `seal` made (not JSON, or no
padding marker) is a `MalformedError`. Nothing is guessed at, and a value that cannot be opened is kept and said so, never shown and never dropped.

## Test vectors

`vault-format.vectors.json`: a root, an account id and an entry id, the 32 bytes of the entry key they derive, the strings the wrapped root and the value are bound
to, and a shape sealed by the SDK when this was written, which an implementation must open. The envelope's nonce is random, so a sealed value is a vector of
what must open, not of what must be produced.
