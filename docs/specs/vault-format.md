# The vault format

**Status:** version 1, written with the code in `src/core/vault/` (DESIGN.md §8). This is the one specification of how Wallet seals what a person keeps: a
native app, a reviewer or a future version of this code reads it and nothing else. **Changing a format changes this file, its version byte and its
vectors in the same change.** The vectors are in [`vault-format.vectors.json`](vault-format.vectors.json), and `src/core/vault/vectors.test.ts` holds the
code to them.

Words: **MUST** and **MUST NOT** are as in RFC 2119. All integers are big-endian. `‖` is concatenation. `UTF-8(x)` is the bytes of the text `x`.

## 1. What each key does

```
 wallet key (age X25519)  ─┐
 recovery key (age X25519) ─┴─ age ─▶ vault header = age( { v, vault_key, vault_key_id, created } )
                                                          │
                                       vault key  (AES-256, 32 random bytes)
                                                          │ AES-256-GCM wrap, bound to account, entry and vault key
                                       entry key  (AES-256, 32 random bytes, one per entry)
                                                          │
                       ┌──────────────────────────────────┼───────────────────────────┐
                shape (AES-256-GCM)               body (AES-256-GCM)          files (AES-256-GCM STREAM,
                                                                              a key per file by HKDF-SHA-256)
```

- **age is used for the header only.** Its per-message overhead is too large for each field, and entries must be usable as non-extractable WebCrypto keys.
- **Everything below the header is AES-256-GCM** with a 96-bit nonce and a 128-bit tag, from WebCrypto, so that every key can be a **non-extractable**
  `CryptoKey` once loaded. An implementation MUST NOT keep a key's bytes after loading it, other than the moment a new entry key is made and wrapped.
- **A new entry key per entry,** so a later share is of one entry, and moving an entry between places needs no re-encryption.

## 2. The wallet key and the recovery key

An age X25519 identity: `AGE-SECRET-KEY-1…` (bech32, upper case), whose recipient is `age1…`. **Post-quantum identities are not accepted.** A **key
file** is what `age-keygen` writes: comment lines beginning `#`, then the identity on its own line. A comment is not trusted: the recipient is derived
from the identity, never read from the file. The first comment line names the app (`# Wallet key.` or `# Wallet recovery key.`).

A **protected key file** is the key file encrypted with age's scrypt recipient (work factor 2^18), in age's ASCII armour.

## 3. The vault header

A vault header is an age file (binary format, `age-encryption.org/v1`) encrypted to one to four recipients (the wallet key, the recovery key, and room
for a key being replaced), whose plaintext is UTF-8 JSON:

```json
{
  "v": 1,
  "vault_key": "<base64url, 32 bytes>",
  "vault_key_id": "<base64url, 12 bytes>",
  "created": "<ISO 8601>"
}
```

- `base64url` is RFC 4648 §5 **without padding**, and **canonical**: a value whose spelling is not the one its bytes have is refused.
- `v` greater than 1 is an unsupported version, and anything else that is not 1 is malformed. The vault key id is chosen at random when the vault key is
  made and is **bound into every wrapped entry key**, so a wrapped key does not open under a vault key that has the same bytes and another id.
- Replacing a key re-encrypts this one small file and no entry. **An old header in an old backup still opens with the old key.**

The real `age` command reads a header (`age -d -i key.txt header.age`), and a header can be made with `age -r <recipient>`: `header.test.ts` does both.

## 4. A wrapped entry key

```
byte 0       version (0x01)
bytes 1–12   nonce (random, 96 bits)
bytes 13–60  AES-256-GCM( vault key, nonce, entry key (32 bytes), AAD ) — 32 bytes of ciphertext and the 16-byte tag
AAD          UTF-8( "wallet/v1/key|" ‖ account id ‖ "|" ‖ entry id ‖ "|" ‖ vault key id )
```

Total 61 bytes, stored as the entry's `wrapped_key`. It is unwrapped with WebCrypto `unwrapKey` straight into a non-extractable key; an implementation
that must use the entry key for both AES-GCM and HKDF unwraps the same bytes twice, once for each algorithm, since WebCrypto will not use one key for both.

## 5. A sealed shape or body

```
byte 0       version (0x01)
bytes 1–12   nonce (random, 96 bits, new for every seal)
bytes 13–    AES-256-GCM( entry key, nonce, padded plaintext, AAD ) — the ciphertext and the 16-byte tag
AAD          UTF-8( "wallet/v1/" ‖ part ‖ "|" ‖ account id ‖ "|" ‖ entry id )       part is "shape" or "body"
plaintext    UTF-8 JSON, then 0x80, then 0x00 bytes up to the next multiple of the bucket
bucket       shape 256 bytes, body 1,024 bytes
```

- **Padding is ISO/IEC 7816-4.** A value that exactly fills a bucket gets a whole bucket more, since the `0x80` needs a byte. So the sealed length is
  `1 + 12 + ceil((n + 1) / bucket) × bucket + 16` for `n` bytes of JSON; the server sees 285 bytes for a shape of up to 255 bytes of JSON, and not the
  length of a title.
- **The AAD binds** the value to its account, entry and part: a value moved to another entry, account or part fails to open. A reader checks the version
  byte first (`unsupported_version`), then the length (`malformed`), and any failure of the tag is `tampered`.
- **A reader refuses** a plaintext that has no `0x80` marker after its last non-zero byte, as tampered.
- The shape is at most 4 KB sealed, and the body at most `WALLET_ENTRY_MAX_KB` (default 256 KB), checked by the server on the length alone.

## 6. A file

```
header       version (0x01) ‖ salt (16 random bytes) ‖ chunk size (u32, 65,536)                                     21 bytes
file key     HKDF-SHA-256( ikm = entry key, salt = the header's salt, info = UTF-8("wallet/v1/file|" ‖ file id) ) → 32 bytes, an AES-256-GCM key
chunk i      AES-256-GCM( file key, nonce, plaintext chunk i, AAD = UTF-8(file id) )     i from 0; a chunk is 65,536 bytes of plaintext, the last may be fewer
nonce        11-byte big-endian counter i ‖ one flag byte: 0x01 for the last chunk and 0x00 for every other
plaintext    the 8-byte length n of the file, the n bytes of the file, then 0x00 bytes up to the next bucket of the whole
bucket       16 KiB while 8 + n is under 1 MiB, 256 KiB from there
```

- The ciphertext of a chunk is its plaintext and a 16-byte tag. Every chunk but the last is exactly 65,552 bytes, so the reader finds the chunks by
  length, and knows a chunk is the last because **no data follows it**.
- **A reader MUST fail** when: the version is not 1 (`unsupported_version`) or the chunk size is not 65,536 (`malformed`); a tag fails for any chunk
  (`tampered`: this covers a changed byte, a reordered chunk, a changed salt and another file id or entry key); the stream ends with no chunk marked last, or
  with data after one that is (`tampered`: a truncated file, a dropped last chunk, an appended chunk); the bytes after the file are not all `0x00`, or the
  whole plaintext is not the padded length of `n`, or the file's bytes are not `n` (`tampered`).
- The encrypted size is `21 + padded + 16 × ceil(padded / 65,536)`, which is what the server sees and a quota counts.
- A file's name, type and dimensions are not in it: images are re-encoded in the browser, with every piece of metadata removed, before they are encrypted.

## 7. Test vectors

[`vault-format.vectors.json`](vault-format.vectors.json) gives, for fixed keys and nonces, the bytes of a wrapped entry key, a sealed shape, a sealed body
and a small encrypted file. They were made by the code and **checked against Node's own AES-GCM and HKDF** (`seal.test.ts`, `stream.test.ts`), which share
nothing with the WebCrypto path the code uses. The vectors use `acct-1`, `entry-1` and `file-1`, and the vault key id `dmstLWlkLTAwMQ`, which is opaque
text to a wrapped key (a real id is 12 random bytes). A header has no vector, since age's ephemeral keys make every header different; it is checked with the
real `age` instead.

## 8. What this does not do

It does not hide the number of entries, the size of each (to a bucket), when they change or which tier they are in (DESIGN.md §8.5), and it does not
protect a device that is unlocked, or script that the server serves (§8.6). It has had **no independent review yet** (DESIGN.md §33).
