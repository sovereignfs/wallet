-- 0.7.0 starts clean (RFC 0001): an entry made by 0.1.x is sealed under a key that the suite's keys do not open, and there is no way to open it, so none is kept.
-- Its mutations and the account's change counter go with it, so that a device that still holds the old cursor is told to update and starts again.
DELETE FROM "wallet"."entry";--> statement-breakpoint
DELETE FROM "wallet"."applied_mutation";--> statement-breakpoint
DELETE FROM "wallet"."account_stream";
