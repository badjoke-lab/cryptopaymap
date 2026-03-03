import assert from "node:assert/strict";
import test from "node:test";

import type { OwnerCommunityDraft, SubmissionDraftFiles } from "../components/submit/types";
import { validateDraft } from "../components/submit/validation";

const baseOwnerDraft = (): OwnerCommunityDraft => ({
  kind: "owner",
  name: "Owner Shop",
  country: "US",
  city: "Austin",
  address: "123 Main St",
  category: "Cafe",
  acceptedChains: [],
  paymentAccepts: [{ assetKey: "BTC", rails: ["lightning"], customRails: [] }],
  about: "",
  paymentNote: "",
  paymentUrl: "",
  website: "",
  twitter: "",
  instagram: "",
  facebook: "",
  lat: "",
  lng: "",
  submitterName: "Tester",
  submitterEmail: "tester@example.com",
  role: "owner",
  notesForAdmin: "",
  placeId: "",
  placeName: "",
  desiredStatus: "Owner Verified",
  ownerVerification: "domain",
  ownerVerificationDomain: "example.com",
  ownerVerificationWorkEmail: "",
  communityEvidenceUrls: [],
  amenities: [],
  amenitiesNotes: "",
});

const baseCommunityDraft = (): OwnerCommunityDraft => ({
  ...baseOwnerDraft(),
  kind: "community",
  desiredStatus: "",
  role: "customer",
  ownerVerification: "domain",
  communityEvidenceUrls: ["https://example.com/evidence-1", "https://example.com/evidence-2"],
});

const emptyFiles = (): SubmissionDraftFiles => ({ gallery: [], proof: [], evidence: [] });

const sampleProofFile = {
  name: "proof.png",
  type: "image/png",
  size: 100,
  lastModified: 1,
  dataUrl: "data:image/png;base64,AAAA",
};

test("owner requires payment URL or screenshot", () => {
  const errors = validateDraft("owner", baseOwnerDraft(), emptyFiles());
  assert.equal(errors.paymentRequirement, "Provide a payment URL or screenshot");

  const urlDraft = baseOwnerDraft();
  urlDraft.paymentUrl = "https://example.com/pay";
  const urlErrors = validateDraft("owner", urlDraft, emptyFiles());
  assert.equal(urlErrors.paymentRequirement, undefined);

  const screenshotErrors = validateDraft("owner", baseOwnerDraft(), {
    ...emptyFiles(),
    proof: [sampleProofFile],
  });
  assert.equal(screenshotErrors.paymentRequirement, undefined);
});

test("owner proof screenshot limit stays max 1", () => {
  const errors = validateDraft("owner", baseOwnerDraft(), {
    ...emptyFiles(),
    proof: [sampleProofFile, { ...sampleProofFile, name: "proof2.png" }],
  });
  assert.equal(errors.proof, "Maximum 1 file(s)");
});

test("community keeps evidence URL minimum requirement", () => {
  const community = baseCommunityDraft();
  community.communityEvidenceUrls = ["https://example.com/evidence-1"];
  const errors = validateDraft("community", community, emptyFiles());

  assert.equal(errors.communityEvidenceUrls, "Provide at least two URLs");
  assert.equal(errors.paymentRequirement, undefined);
});
