CREATE TYPE "public"."quarantine_upload_reservation_purpose" AS ENUM('evidence_image', 'owner_verification_proof', 'public_gallery_candidate');--> statement-breakpoint
CREATE TABLE "quarantine_upload_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"intake_request_id" uuid NOT NULL,
	"purpose" "quarantine_upload_reservation_purpose" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_by_submission_id" uuid,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quarantine_upload_reservations_consumption_pair" CHECK (("quarantine_upload_reservations"."consumed_by_submission_id" is null and "quarantine_upload_reservations"."consumed_at" is null) or ("quarantine_upload_reservations"."consumed_by_submission_id" is not null and "quarantine_upload_reservations"."consumed_at" is not null)),
	CONSTRAINT "quarantine_upload_reservations_time_order" CHECK ("quarantine_upload_reservations"."created_at" < "quarantine_upload_reservations"."expires_at" and ("quarantine_upload_reservations"."consumed_at" is null or "quarantine_upload_reservations"."created_at" <= "quarantine_upload_reservations"."consumed_at"))
);
--> statement-breakpoint
ALTER TABLE "quarantine_upload_reservations" ADD CONSTRAINT "quarantine_upload_reservations_consumed_by_submission_id_submissions_id_fk" FOREIGN KEY ("consumed_by_submission_id") REFERENCES "public"."submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quarantine_upload_reservations_owner_expiry_idx" ON "quarantine_upload_reservations" USING btree ("intake_request_id","expires_at");--> statement-breakpoint
CREATE INDEX "quarantine_upload_reservations_consumed_submission_idx" ON "quarantine_upload_reservations" USING btree ("consumed_by_submission_id");
