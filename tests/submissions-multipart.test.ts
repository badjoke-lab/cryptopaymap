import test from "node:test";
import assert from "node:assert/strict";

import { parseMultipartSubmission } from "../lib/submissions/parseMultipart";
import { emptyAcceptedMediaSummary, validateMultipartSubmission } from "../lib/submissions/validateMultipart";

const buildMultipartRequest = (form: FormData) =>
  new Request("http://localhost/api/submissions", {
    method: "POST",
    body: form,
  });

test("parseMultipartSubmission rejects when payload is missing", async () => {
  const form = new FormData();
  const result = await parseMultipartSubmission(buildMultipartRequest(form));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_PAYLOAD");
  }
});

test("parseMultipartSubmission extracts payload and files", async () => {
  const form = new FormData();
  form.set("payload", JSON.stringify({ verificationRequest: "owner", kind: "owner" }));
  form.append("gallery", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
  form.append("gallery", new File([new Uint8Array([4])], "b.png", { type: "image/png" }));
  form.append("proof", new File([new Uint8Array([5])], "proof.png", { type: "image/png" }));

  const result = await parseMultipartSubmission(buildMultipartRequest(form));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.filesByField.gallery.length, 2);
    assert.equal(result.value.filesByField.proof.length, 1);
    assert.deepEqual(result.value.unexpectedFileFields, []);
  }
});

test("validateMultipartSubmission partially accepts overflow gallery files", () => {
  const files = {
    proof: [],
    evidence: [],
    gallery: Array.from({ length: 5 }, (_, idx) =>
      new File([new Uint8Array([idx])], `g${idx}.png`, { type: "image/png" }),
    ),
  };

  const result = validateMultipartSubmission("community", files, []);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.acceptedFilesByField.gallery.length, 4);
    assert.equal(result.rejectedMedia.length, 1);
    assert.equal(result.rejectedMedia[0]?.code, "TOO_MANY_FILES");
  }
});

test("validateMultipartSubmission partially accepts invalid media types", () => {
  const files = {
    proof: [],
    evidence: [],
    gallery: [new File([new Uint8Array([1])], "bad.gif", { type: "image/gif" })],
  };

  const result = validateMultipartSubmission("community", files, []);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.acceptedFilesByField.gallery.length, 0);
    assert.equal(result.rejectedMedia[0]?.code, "INVALID_MEDIA_TYPE");
  }
});

test("validateMultipartSubmission partially accepts oversized files", () => {
  const oversized = new Uint8Array(2 * 1024 * 1024 + 1);
  const files = {
    proof: [],
    evidence: [],
    gallery: [new File([oversized], "big.png", { type: "image/png" })],
  };

  const result = validateMultipartSubmission("community", files, []);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.acceptedFilesByField.gallery.length, 0);
    assert.equal(result.rejectedMedia[0]?.code, "FILE_TOO_LARGE");
  }
});



test("validateMultipartSubmission keeps proof strict at one file", () => {
  const files = {
    proof: [
      new File([new Uint8Array([1])], "proof-a.png", { type: "image/png" }),
      new File([new Uint8Array([2])], "proof-b.png", { type: "image/png" }),
    ],
    evidence: [],
    gallery: [],
  };

  const result = validateMultipartSubmission("owner", files, [], { paymentUrl: "", ownerVerification: "dashboard_ss" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "TOO_MANY_FILES");
  }
});

test("validateMultipartSubmission rejects unexpected file fields", () => {
  const files = {
    proof: [new File([new Uint8Array([1])], "proof.png", { type: "image/png" })],
    evidence: [],
    gallery: [],
  };

  const result = validateMultipartSubmission("community", files, []);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "UNKNOWN_FORM_FIELD");
  }
});

test("validateMultipartSubmission returns accepted media summary", () => {
  const files = {
    proof: [new File([new Uint8Array([1])], "proof.png", { type: "image/png" })],
    evidence: [],
    gallery: [new File([new Uint8Array([2])], "g.png", { type: "image/png" })],
  };

  const result = validateMultipartSubmission("owner", files, []);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.acceptedMediaSummary, { proof: 1, gallery: 1 });
  }

  assert.deepEqual(emptyAcceptedMediaSummary("report"), { evidence: 0 });
});
