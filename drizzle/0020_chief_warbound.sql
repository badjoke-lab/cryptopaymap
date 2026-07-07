ALTER TABLE "locations" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "opening_hours" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "amenities" text[];--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "social_links" jsonb;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_social_links_array" CHECK ("locations"."social_links" is null or jsonb_typeof("locations"."social_links") = 'array');
