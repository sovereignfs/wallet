CREATE TABLE "wallet"."keyring" (
	"account_id" text NOT NULL,
	"epoch" bigint NOT NULL,
	"wrapped_root" "bytea" NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "keyring_account_id_epoch_pk" PRIMARY KEY("account_id","epoch")
);
