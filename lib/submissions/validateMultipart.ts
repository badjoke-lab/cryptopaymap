import type { SubmissionKind } from "@/lib/submissions";

import type { MultipartFilesByField } from "./parseMultipart";

type MediaField = "proof" | "gallery" | "evidence";

type MultipartValidationErrorCode =
  | "INVALID_MEDIA_TYPE"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_FILES"
  | "REQUIRED_FILE_MISSING"
  | "UNKNOWN_FORM_FIELD";

type MultipartValidationError = {
  code: MultipartValidationErrorCode;
  message: string;
  details: Record<string, unknown>;
};

export type RejectedMediaItem = {
  field: MediaField;
  name: string;
  code: Exclude<MultipartValidationErrorCode, "REQUIRED_FILE_MISSING" | "UNKNOWN_FORM_FIELD">;
  message: string;
  details: Record<string, unknown>;
};

type MultipartValidationResult =
  | {
      ok: true;
      acceptedMediaSummary: Record<string, number>;
      acceptedFilesByField: MultipartFilesByField;
      rejectedMedia: RejectedMediaItem[];
    }
  | { ok: false; error: MultipartValidationError };

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

type FileCountRequirement = {
  min: number;
  max: number;
};

const KIND_REQUIREMENTS: Record<SubmissionKind, Record<MediaField, FileCountRequirement>> = {
  owner: {
    proof: { min: 0, max: 1 },
    gallery: { min: 0, max: 8 },
    evidence: { min: 0, max: 0 },
  },
  community: {
    proof: { min: 0, max: 0 },
    gallery: { min: 0, max: 4 },
    evidence: { min: 0, max: 0 },
  },
  report: {
    proof: { min: 0, max: 0 },
    gallery: { min: 0, max: 0 },
    evidence: { min: 0, max: 4 },
  },
};

const PARTIAL_ACCEPT_FIELDS = new Set<MediaField>(["gallery", "evidence"]);

const KIND_ALLOWED_FIELDS: Record<SubmissionKind, MediaField[]> = {
  owner: ["proof", "gallery"],
  community: ["gallery"],
  report: ["evidence"],
};

const buildAcceptedMediaSummary = (
  kind: SubmissionKind,
  filesByField: MultipartFilesByField,
): Record<string, number> => {
  const allowedFields = KIND_ALLOWED_FIELDS[kind];
  return allowedFields.reduce<Record<string, number>>((summary, field) => {
    summary[field] = filesByField[field].length;
    return summary;
  }, {});
};


const validateFile = (field: MediaField, file: File): MultipartValidationError | null => {
  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return {
      code: "INVALID_MEDIA_TYPE",
      message: `${field} has an unsupported media type`,
      details: { field, mimeType: file.type || "unknown", allowedMimeTypes: ALLOWED_MIME_TYPES },
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      code: "FILE_TOO_LARGE",
      message: `${field} exceeds the maximum file size`,
      details: { field, size: file.size, limitBytes: MAX_FILE_SIZE_BYTES },
    };
  }

  return null;
};

const toRejectedMedia = (
  field: MediaField,
  file: File,
  error: MultipartValidationError,
): RejectedMediaItem => ({
  field,
  name: file.name,
  code: error.code as RejectedMediaItem["code"],
  message: error.message,
  details: error.details,
});

export const validateMultipartSubmission = (
  kind: SubmissionKind,
  filesByField: MultipartFilesByField,
  unexpectedFileFields: string[],
  payload?: unknown,
): MultipartValidationResult => {
  if (unexpectedFileFields.length > 0) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN_FORM_FIELD",
        message: "Unexpected file fields provided",
        details: { fields: unexpectedFileFields, allowedFields: KIND_ALLOWED_FIELDS[kind] },
      },
    };
  }

  const requirements = KIND_REQUIREMENTS[kind];
  const allowedFields = new Set(KIND_ALLOWED_FIELDS[kind]);
  const acceptedFilesByField: MultipartFilesByField = { proof: [], gallery: [], evidence: [] };
  const rejectedMedia: RejectedMediaItem[] = [];

  // owner: proof requirement is conditional (URL or dashboard_ss)
  let effectiveProofMin = requirements.proof.min;
  if (kind === "owner") {
    const paymentUrl = typeof (payload as any)?.paymentUrl === "string" ? (payload as any).paymentUrl.trim() : "";
    const ownerVerification = (payload as any)?.ownerVerification;
    const needsProof = ownerVerification === "dashboard_ss" || paymentUrl.length === 0;
    effectiveProofMin = needsProof ? 1 : 0;
  }

  for (const field of Object.keys(filesByField) as MediaField[]) {
    const incoming = filesByField[field];
    const requirement = requirements[field];

    if (!allowedFields.has(field) && incoming.length > 0) {
      return {
        ok: false,
        error: {
          code: "UNKNOWN_FORM_FIELD",
          message: `Unexpected file field: ${field}`,
          details: { field, allowedFields: KIND_ALLOWED_FIELDS[kind] },
        },
      };
    }

    const isPartialAccept = PARTIAL_ACCEPT_FIELDS.has(field);
    if (!isPartialAccept) {
      if (incoming.length > requirement.max) {
        return {
          ok: false,
          error: {
            code: "TOO_MANY_FILES",
            message: `${field} exceeds the allowed file count`,
            details: { field, count: incoming.length, limit: requirement.max },
          },
        };
      }

      for (const file of incoming) {
        const fileError = validateFile(field, file);
        if (fileError) {
          return { ok: false, error: fileError };
        }
      }
      acceptedFilesByField[field] = incoming;
      continue;
    }

    for (const file of incoming) {
      if (acceptedFilesByField[field].length >= requirement.max) {
        rejectedMedia.push({
          field,
          name: file.name,
          code: "TOO_MANY_FILES",
          message: `${field} exceeds the allowed file count`,
          details: { field, limit: requirement.max },
        });
        continue;
      }

      const fileError = validateFile(field, file);
      if (fileError) {
        rejectedMedia.push(toRejectedMedia(field, file, fileError));
        continue;
      }

      acceptedFilesByField[field].push(file);
    }
  }

  if (acceptedFilesByField.proof.length < effectiveProofMin) {
    return {
      ok: false,
      error: {
        code: "REQUIRED_FILE_MISSING",
        message: `proof requires at least ${effectiveProofMin} file(s)`,
        details: { field: "proof", count: acceptedFilesByField.proof.length, min: effectiveProofMin },
      },
    };
  }

  return {
    ok: true,
    acceptedMediaSummary: buildAcceptedMediaSummary(kind, acceptedFilesByField),
    acceptedFilesByField,
    rejectedMedia,
  };
};

export const emptyAcceptedMediaSummary = (kind: SubmissionKind): Record<string, number> =>
  KIND_ALLOWED_FIELDS[kind].reduce<Record<string, number>>((summary, field) => {
    summary[field] = 0;
    return summary;
  }, {});
