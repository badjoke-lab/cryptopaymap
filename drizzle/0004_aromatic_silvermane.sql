CREATE TYPE "public"."entity_status" AS ENUM('active', 'inactive', 'ended', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('merchant', 'online_service', 'payment_processor', 'payment_program', 'platform');--> statement-breakpoint
CREATE TYPE "public"."location_status" AS ENUM('active', 'temporarily_closed', 'closed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."osm_element_type" AS ENUM('node', 'way', 'relation');--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(64),
	"legal_name" varchar(200),
	"website_url" text,
	"country_code" varchar(2),
	"entity_status" "entity_status" DEFAULT 'active' NOT NULL,
	"visibility" "claim_visibility" DEFAULT 'hidden' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"name" varchar(160),
	"slug" varchar(64) NOT NULL,
	"address_line" text,
	"locality" varchar(120),
	"region" varchar(120),
	"postal_code" varchar(32),
	"country_code" varchar(2) NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(10, 6) NOT NULL,
	"location_status" "location_status" DEFAULT 'active' NOT NULL,
	"visibility" "claim_visibility" DEFAULT 'hidden' NOT NULL,
	"website_url" text,
	"phone" varchar(64),
	"osm_type" "osm_element_type",
	"osm_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "locations_latitude_range" CHECK ("locations"."latitude" between -90 and 90),
	CONSTRAINT "locations_longitude_range" CHECK ("locations"."longitude" between -180 and 180),
	CONSTRAINT "locations_osm_identity_pair" CHECK (("locations"."osm_type" is null and "locations"."osm_id" is null) or ("locations"."osm_type" is not null and "locations"."osm_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entities_slug_unique" ON "entities" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "entities_type_idx" ON "entities" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "entities_status_idx" ON "entities" USING btree ("entity_status");--> statement-breakpoint
CREATE INDEX "entities_visibility_idx" ON "entities" USING btree ("visibility");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_slug_unique" ON "locations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_osm_identity_unique" ON "locations" USING btree ("osm_type","osm_id") WHERE "locations"."osm_type" is not null and "locations"."osm_id" is not null;--> statement-breakpoint
CREATE INDEX "locations_entity_idx" ON "locations" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "locations_country_locality_idx" ON "locations" USING btree ("country_code","locality");--> statement-breakpoint
CREATE INDEX "locations_status_idx" ON "locations" USING btree ("location_status");--> statement-breakpoint
CREATE INDEX "locations_visibility_idx" ON "locations" USING btree ("visibility");