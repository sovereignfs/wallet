CREATE SCHEMA "wallet";
--> statement-breakpoint
CREATE TABLE "wallet"."account_stream" (
	"account_id" text PRIMARY KEY NOT NULL,
	"seq" bigint DEFAULT 0 NOT NULL,
	"mode" text DEFAULT 'normal' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet"."applied_mutation" (
	"account_id" text NOT NULL,
	"id" text NOT NULL,
	"seq" bigint NOT NULL,
	"applied_at" bigint NOT NULL,
	CONSTRAINT "applied_mutation_account_id_id_pk" PRIMARY KEY("account_id","id")
);
--> statement-breakpoint
CREATE TABLE "wallet"."credential" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"purpose" text NOT NULL,
	"sealed" text NOT NULL,
	"key_fingerprint" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet"."entry" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"tier" text NOT NULL,
	"holder_device_id" text,
	"version" bigint NOT NULL,
	"seq" bigint NOT NULL,
	"wrapped_key" "bytea" NOT NULL,
	"shape" "bytea",
	"body" "bytea",
	"file_count" bigint DEFAULT 0 NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"deleted_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet"."rate_bucket" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" bigint NOT NULL,
	"count" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet"."vault" (
	"account_id" text PRIMARY KEY NOT NULL,
	"version" bigint NOT NULL,
	"recipients" text NOT NULL,
	"header" "bytea" NOT NULL,
	"vault_key_id" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "credential_account_idx" ON "wallet"."credential" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "credential_key_idx" ON "wallet"."credential" USING btree ("key_fingerprint");--> statement-breakpoint
CREATE INDEX "entry_account_seq_idx" ON "wallet"."entry" USING btree ("account_id","seq");--> statement-breakpoint
CREATE INDEX "entry_account_id_idx" ON "wallet"."entry" USING btree ("account_id","id");--> statement-breakpoint
CREATE INDEX "rate_bucket_window_idx" ON "wallet"."rate_bucket" USING btree ("window_start");