CREATE TYPE "public"."acceptance_claim_status" AS ENUM('candidate', 'confirmed', 'stale', 'ended', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."claim_visibility" AS ENUM('public', 'hidden', 'temporarily_hidden');--> statement-breakpoint
CREATE TYPE "public"."route_type" AS ENUM('direct_wallet', 'processor_checkout');--> statement-breakpoint
CREATE TYPE "public"."submission_resolution" AS ENUM('approved', 'partially_approved', 'accepted_as_candidate', 'not_approved', 'duplicate', 'no_change', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."submission_workflow_status" AS ENUM('received', 'triage', 'in_review', 'needs_information', 'on_hold', 'resolved', 'duplicate', 'rejected_spam', 'withdrawn');