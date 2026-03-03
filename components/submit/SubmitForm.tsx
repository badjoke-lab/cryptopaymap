"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";

import LimitedModeNotice from "@/components/status/LimitedModeNotice";
import { isLimitedHeader } from "@/lib/clientDataSource";
import type { FilterMeta } from "@/lib/filters";
import type { SubmissionKind } from "@/lib/submissions";

import PaymentAcceptsEditor from "./PaymentAcceptsEditor";
import LimitedTextarea from "./LimitedTextarea";
import { FILE_LIMITS, MAX_LENGTHS } from "./constants";
import { loadDraftBundle, saveDraftBundle, serializeFiles } from "./draftStorage";
import type { OwnerCommunityDraft, ReportDraft, SubmissionDraft, SubmissionDraftFiles, StoredFile } from "./types";
import { validateDraft } from "./validation";

const emptyFiles: SubmissionDraftFiles = { gallery: [], proof: [], evidence: [] };

const buildDefaultDraft = (kind: SubmissionKind): SubmissionDraft => {
  if (kind === "report") {
    return {
      kind: "report",
      placeId: "",
      placeName: "",
      reportReason: "",
      reportDetails: "",
      reportAction: "",
      communityEvidenceUrls: [],
      submitterName: "",
      submitterEmail: "",
    } satisfies ReportDraft;
  }

  return {
    kind,
    name: "",
    country: "",
    city: "",
    address: "",
    category: "",
    acceptedChains: [],
    paymentAccepts: [],
    about: "",
    paymentNote: "",
    paymentUrl: "",
    website: "",
    twitter: "",
    instagram: "",
    facebook: "",
    lat: "",
    lng: "",
    submitterName: "",
    submitterEmail: "",
    role: kind === "owner" ? "owner" : "customer",
    notesForAdmin: "",
    placeId: "",
    placeName: "",
    desiredStatus: kind === "owner" ? "Owner Verified" : "",
    ownerVerification: "",
    ownerVerificationDomain: "",
    ownerVerificationWorkEmail: "",
    communityEvidenceUrls: [],
    amenities: [],
    amenitiesNotes: "",
  } satisfies OwnerCommunityDraft;
};

const fieldLabel = (label: string) => <span className="text-sm font-medium text-gray-800">{label}</span>;
const parseListField = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
const formatListField = (entries: string[]) => entries.join("\n");
const ensureMinimumEntries = (entries: string[], minCount: number) =>
  entries.length >= minCount ? entries : [...entries, ...Array.from({ length: minCount - entries.length }, () => "")];

type SubmitFormProps = {
  kind: SubmissionKind;
};

const AttachmentList = ({
  files,
  onRemove,
  onReorder,
  onMoveUp,
  onMoveDown,
}: {
  files: StoredFile[];
  onRemove: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}) => {
  if (!files.length) return null;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 text-sm text-gray-700">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${index}`}
          className="rounded border border-gray-200 bg-white p-2"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("text/plain", String(index));
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            const from = Number(event.dataTransfer.getData("text/plain"));
            if (Number.isInteger(from)) {
              onReorder(from, index);
            }
          }}
        >
          <div className="aspect-square overflow-hidden rounded bg-gray-100">
            <img src={file.dataUrl} alt={file.name} className="h-full w-full object-cover" />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
            <span className="font-semibold" aria-hidden>≡</span>
            <span>Drag to reorder</span>
          </div>
          <p className="mt-1 truncate text-xs" title={file.name}>{file.name}</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-40"
              onClick={() => onMoveUp(index)}
              disabled={index === 0}
              aria-label={`Move ${file.name} up`}
            >
              ↑
            </button>
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-40"
              onClick={() => onMoveDown(index)}
              disabled={index === files.length - 1}
              aria-label={`Move ${file.name} down`}
            >
              ↓
            </button>
            <button
              type="button"
              className="ml-auto text-xs text-red-600 underline"
              onClick={() => onRemove(index)}
              aria-label={`Remove ${file.name}`}
            >
              Remove
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
};

export default function SubmitForm({ kind }: SubmitFormProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<SubmissionDraft>(() => buildDefaultDraft(kind));
  const [files, setFiles] = useState<SubmissionDraftFiles>(emptyFiles);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fileMessages, setFileMessages] = useState<Record<keyof SubmissionDraftFiles, string[]>>({
    gallery: [],
    proof: [],
    evidence: [],
  });
  const [meta, setMeta] = useState<FilterMeta | null>(null);
  const [limitedMode, setLimitedMode] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [activeDropField, setActiveDropField] = useState<keyof SubmissionDraftFiles | null>(null);
  const proofInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const evidenceInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        const res = await fetch("/api/filters/meta");
        if (!res.ok) throw new Error("Failed to load meta");
        const data = (await res.json()) as FilterMeta;
        setMeta(data);
        setLimitedMode(isLimitedHeader(res.headers));
      } catch (error) {
        console.error(error);
      }
    };
    loadMeta();
  }, []);

  useEffect(() => {
    const saved = loadDraftBundle(kind);
    if (saved?.payload) {
      const defaults = buildDefaultDraft(kind);
      setDraft({ ...defaults, ...saved.payload });
      setFiles(saved.files ?? emptyFiles);
    }
    setInitialized(true);
  }, [kind]);

  useEffect(() => {
    if (!initialized) return;
    saveDraftBundle(kind, draft, files);
  }, [draft, files, initialized, kind]);

  const citiesForCountry = useMemo(() => {
    if (!meta || draft.kind === "report") return [];
    return meta.cities[draft.country] ?? [];
  }, [meta, draft]);

  const ownerDraft = draft.kind === "report" ? null : (draft as OwnerCommunityDraft);
  const reportDraft = draft.kind === "report" ? (draft as ReportDraft) : null;
  const aboutMaxLength = kind === "owner" ? MAX_LENGTHS.aboutOwner : MAX_LENGTHS.aboutCommunity;
  const paymentAssetOptions = useMemo(() => {
    if (!ownerDraft) return [];
    const base = [
      "BTC",
      "ETH",
      "USDT",
      "USDC",
      "DAI",
      "SOL",
      "TRX",
      ...(meta?.chains ?? []),
      ...ownerDraft.paymentAccepts.map((entry) => entry.assetKey),
    ];
    return Array.from(new Set(base.map((item) => item.trim().toUpperCase()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [meta?.chains, ownerDraft]);

  type DraftField = keyof OwnerCommunityDraft | keyof ReportDraft;
  type DraftValue<T extends DraftField> =
    | OwnerCommunityDraft[T & keyof OwnerCommunityDraft]
    | ReportDraft[T & keyof ReportDraft];

  const handleChange = <T extends DraftField>(field: T, value: DraftValue<T>) => {
    setDraft((prev) => ({ ...prev, [field]: value }) as SubmissionDraft);
  };

  const handleFileAdd = async (field: keyof SubmissionDraftFiles, incoming: File[] | FileList | null) => {
    if (!incoming) return;
    const incomingFiles = Array.isArray(incoming) ? incoming : Array.from(incoming);
    if (!incomingFiles.length) return;

    const strictSingleField = field === "proof";
    if (strictSingleField && incomingFiles.length > 1) {
      setErrors((prev) => ({ ...prev, proof: "Payment screenshot / proof supports only one file" }));
      setFileMessages((prev) => ({
        ...prev,
        proof: ["too_many_files: payment screenshot / proof is max 1"],
      }));
      return;
    }

    const nextFiles = [...files[field]];
    const limit = FILE_LIMITS[kind][field];
    const newErrors: Record<string, string> = {};
    const messages: string[] = [];

    for (const file of incomingFiles) {
      if (nextFiles.length >= limit) {
        if (strictSingleField) {
          newErrors[field] = `Maximum ${limit} file(s)`;
          messages.push(`too_many_files: ${file.name} (max ${limit})`);
          break;
        }
        messages.push(`too_many_files: ${file.name} (max ${limit})`);
        continue;
      }
      if (file.size > 2 * 1024 * 1024) {
        messages.push(`too_large (>2MB): ${file.name}`);
        newErrors[`${field}:${file.name}`] = "File exceeds 2MB limit";
        if (strictSingleField) newErrors[field] = "File exceeds 2MB limit";
        continue;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        messages.push(`unsupported_type: ${file.name} (${file.type || "unknown"})`);
        newErrors[`${field}:${file.name}`] = "Unsupported file type";
        if (strictSingleField) newErrors[field] = "Unsupported file type";
        continue;
      }
      const [stored] = await serializeFiles([file]);
      nextFiles.push(stored);
    }

    setErrors((prev) => ({ ...prev, ...newErrors }));
    setFileMessages((prev) => ({ ...prev, [field]: messages }));
    setFiles((prev) => ({ ...prev, [field]: nextFiles }));
  };

  const handleFileRemove = (field: keyof SubmissionDraftFiles, index: number) => {
    setFiles((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const handleFileReorder = (field: keyof SubmissionDraftFiles, from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setFiles((prev) => {
      const list = [...prev[field]];
      const [moved] = list.splice(from, 1);
      if (!moved) return prev;
      list.splice(to, 0, moved);
      return { ...prev, [field]: list };
    });
  };


  const handleFileMoveUp = (field: keyof SubmissionDraftFiles, index: number) => {
    if (index <= 0) return;
    handleFileReorder(field, index, index - 1);
  };

  const handleFileMoveDown = (field: keyof SubmissionDraftFiles, index: number) => {
    if (index >= files[field].length - 1) return;
    handleFileReorder(field, index, index + 1);
  };

  const inputRefs: Record<keyof SubmissionDraftFiles, RefObject<HTMLInputElement>> = {
    proof: proofInputRef,
    gallery: galleryInputRef,
    evidence: evidenceInputRef,
  };

  const openFilePicker = (field: keyof SubmissionDraftFiles) => {
    inputRefs[field].current?.click();
  };

  const handleDropzoneDragOver = (field: keyof SubmissionDraftFiles, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (activeDropField !== field) setActiveDropField(field);
  };

  const handleDropzoneDragEnter = (field: keyof SubmissionDraftFiles, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveDropField(field);
  };

  const handleDropzoneDragLeave = (field: keyof SubmissionDraftFiles, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    if (activeDropField === field) setActiveDropField(null);
  };

  const handleDropzoneDrop = (field: keyof SubmissionDraftFiles, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveDropField(null);
    void handleFileAdd(field, Array.from(event.dataTransfer.files));
  };

  const handleSubmit = () => {
    const validationErrors = validateDraft(kind, draft, files);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length) return;
    saveDraftBundle(kind, draft, files);
    router.push(`/submit/${kind}/confirm`);
  };

  const communityEvidenceEntries =
    kind === "community" && ownerDraft
      ? ensureMinimumEntries(ownerDraft.communityEvidenceUrls ?? [], 2)
      : ownerDraft?.communityEvidenceUrls ?? [];

  const handleCommunityEvidenceChange = (index: number, value: string) => {
    if (!ownerDraft) return;
    const next = [...communityEvidenceEntries];
    next[index] = value;
    handleChange("communityEvidenceUrls", next);
  };

  const handleCommunityEvidenceAdd = () => {
    if (!ownerDraft) return;
    handleChange("communityEvidenceUrls", [...communityEvidenceEntries, ""]);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-gray-500">Submit</p>
          <h1 className="text-3xl font-bold text-gray-900">
            {kind === "owner" && "Owner verification"}
            {kind === "community" && "Community suggestion"}
            {kind === "report" && "Report a listing"}
          </h1>
          <p className="text-gray-600">
            {kind === "report"
              ? "Flag incorrect or harmful information so we can review it."
              : "Share details so our team can review and verify the place."}
          </p>
        </div>

        {limitedMode ? <LimitedModeNotice className="w-full max-w-sm" /> : null}

        {kind !== "report" && ownerDraft ? (
          <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Place details</h2>
            <div className="space-y-1">
              {fieldLabel("Business name (required)")}
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2"
                value={ownerDraft.name}
                onChange={(e) => handleChange("name", e.target.value)}
                maxLength={MAX_LENGTHS.businessName}
              />
              {errors.name && <p className="text-red-600 text-sm">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Country (required)")}
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.country}
                  onChange={(e) => handleChange("country", e.target.value)}
                >
                  <option value="">Select</option>
                  {meta?.countries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
                {errors.country && <p className="text-red-600 text-sm">{errors.country}</p>}
              </div>
              <div className="space-y-1">
                {fieldLabel("City (required)")}
                {citiesForCountry.length ? (
                  <select
                    className="w-full rounded-md border px-3 py-2"
                    value={ownerDraft.city}
                    onChange={(e) => handleChange("city", e.target.value)}
                  >
                    <option value="">Select</option>
                    {citiesForCountry.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="w-full rounded-md border px-3 py-2"
                    value={ownerDraft.city}
                    onChange={(e) => handleChange("city", e.target.value)}
                    maxLength={MAX_LENGTHS.city}
                  />
                )}
                {errors.city && <p className="text-red-600 text-sm">{errors.city}</p>}
              </div>
            </div>

            <div className="space-y-1">
              {fieldLabel("Address (required)")}
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2"
                value={ownerDraft.address}
                onChange={(e) => handleChange("address", e.target.value)}
                maxLength={MAX_LENGTHS.address}
              />
              {errors.address && <p className="text-red-600 text-sm">{errors.address}</p>}
            </div>

            <div className="space-y-1">
              <div className="space-y-1">
                {fieldLabel("Category (required)")}
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.category}
                  onChange={(e) => handleChange("category", e.target.value)}
                >
                  <option value="">Select</option>
                  {meta?.categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                {errors.category && <p className="text-red-600 text-sm">{errors.category}</p>}
              </div>
            </div>

            <div className="space-y-1">
              {fieldLabel("Accepted crypto (required)")}
              <p className="text-xs text-gray-500">Select at least one crypto. Network is optional.</p>
              <PaymentAcceptsEditor
                value={ownerDraft.paymentAccepts}
                assetOptions={paymentAssetOptions}
                onChange={(next) => handleChange("paymentAccepts", next)}
              />
              {errors.paymentAccepts && <p className="text-red-600 text-sm">{errors.paymentAccepts}</p>}
            </div>

            {kind === "owner" ? (
              <div className="space-y-1">
                {fieldLabel("Desired status (required)")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2 bg-gray-50"
                  value={ownerDraft.desiredStatus}
                  readOnly
                />
                {errors.desiredStatus && <p className="text-red-600 text-sm">{errors.desiredStatus}</p>}
              </div>
            ) : null}

            <div className="space-y-1">
              {fieldLabel("Verification method (required)")}
              <select
                className="w-full rounded-md border px-3 py-2"
                value={ownerDraft.ownerVerification}
                onChange={(e) => handleChange("ownerVerification", e.target.value)}
              >
                <option value="">Select</option>
                <option value="domain">Domain verification</option>
                <option value="otp">Work email OTP</option>
                <option value="dashboard_ss">Dashboard screenshot</option>
              </select>
              {errors.ownerVerification && <p className="text-red-600 text-sm">{errors.ownerVerification}</p>}
            </div>

            {ownerDraft.ownerVerification === "domain" ? (
              <div className="space-y-1">
                {fieldLabel("Domain to verify (required)")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.ownerVerificationDomain}
                  onChange={(e) => handleChange("ownerVerificationDomain", e.target.value)}
                  placeholder="example.com"
                  maxLength={MAX_LENGTHS.ownerVerificationDomain}
                />
                {errors.ownerVerificationDomain && (
                  <p className="text-red-600 text-sm">{errors.ownerVerificationDomain}</p>
                )}
              </div>
            ) : null}

            {ownerDraft.ownerVerification === "otp" ? (
              <div className="space-y-1">
                {fieldLabel("Work email for OTP (required)")}
                <input
                  type="email"
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.ownerVerificationWorkEmail}
                  onChange={(e) => handleChange("ownerVerificationWorkEmail", e.target.value)}
                  placeholder="name@company.com"
                  maxLength={MAX_LENGTHS.ownerVerificationWorkEmail}
                />
                {errors.ownerVerificationWorkEmail && (
                  <p className="text-red-600 text-sm">{errors.ownerVerificationWorkEmail}</p>
                )}
              </div>
            ) : null}

            {ownerDraft.ownerVerification === "dashboard_ss" ? (
              <p className="text-sm text-gray-600">
                Upload a proof image of the dashboard in the attachments section.
              </p>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Latitude (optional)")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.lat}
                  onChange={(e) => handleChange("lat", e.target.value)}
                  placeholder="35.680"
                />
                {errors.lat && <p className="text-red-600 text-sm">{errors.lat}</p>}
              </div>
              <div className="space-y-1">
                {fieldLabel("Longitude (optional)")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.lng}
                  onChange={(e) => handleChange("lng", e.target.value)}
                  placeholder="139.760"
                />
                {errors.lng && <p className="text-red-600 text-sm">{errors.lng}</p>}
              </div>
            </div>

            <div className="space-y-1">
              {fieldLabel(`About (optional, ${aboutMaxLength} chars max)`)}
              <LimitedTextarea
                value={ownerDraft.about}
                onChange={(value) => handleChange("about", value)}
                maxLength={aboutMaxLength}
                rows={3}
                error={errors.about}
              />
            </div>

            <div className="space-y-1">
              {fieldLabel("Amenities (optional, one per line)")}
              <textarea
                className="w-full rounded-md border px-3 py-2"
                rows={3}
                value={formatListField(ownerDraft.amenities)}
                onChange={(e) => handleChange("amenities", parseListField(e.target.value))}
              />
              {errors.amenities && <p className="text-red-600 text-sm">{errors.amenities}</p>}
            </div>

            <div className="space-y-1">
              {fieldLabel(`Amenities notes (optional, ${MAX_LENGTHS.amenitiesNotes} chars max)`)}
              <LimitedTextarea
                value={ownerDraft.amenitiesNotes}
                onChange={(value) => handleChange("amenitiesNotes", value)}
                maxLength={MAX_LENGTHS.amenitiesNotes}
                rows={2}
                error={errors.amenitiesNotes}
              />
            </div>

            {kind === "owner" ? (
              <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Payment proof (required: provide URL or screenshot)
                </h3>
                <p className="text-xs text-gray-600">Required: Provide either a payment URL or a screenshot.</p>

                <div className="space-y-1">
                  {fieldLabel("Payment URL (recommended)")}
                  <input
                    type="url"
                    className="w-full rounded-md border px-3 py-2"
                    value={ownerDraft.paymentUrl}
                    onChange={(e) => handleChange("paymentUrl", e.target.value)}
                    placeholder="https://example.com/pay"
                    maxLength={MAX_LENGTHS.paymentUrl}
                  />
                  <p className="text-xs text-gray-500">
                    Link to your payment page / QR page / invoice page. If you don’t have a URL, upload a screenshot
                    instead.
                  </p>
                  {errors.paymentUrl && <p className="text-red-600 text-sm">{errors.paymentUrl}</p>}
                </div>

                <div className="space-y-2">
                  {fieldLabel(`Payment screenshot (alternative, max 1) (${files.proof.length}/1)`)}
                  <div
                    className={`rounded border border-dashed p-3 transition ${
                      activeDropField === "proof" ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white"
                    }`}
                    onDragEnter={(event) => handleDropzoneDragEnter("proof", event)}
                    onDragOver={(event) => handleDropzoneDragOver("proof", event)}
                    onDragLeave={(event) => handleDropzoneDragLeave("proof", event)}
                    onDrop={(event) => handleDropzoneDrop("proof", event)}
                  >
                    <input
                      ref={proofInputRef}
                      type="file"
                      className="hidden"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => handleFileAdd("proof", e.target.files)}
                    />
                    <button
                      type="button"
                      className="rounded border border-gray-300 bg-white px-3 py-1 text-sm"
                      onClick={() => openFilePicker("proof")}
                    >
                      Choose file
                    </button>
                    <p className="text-xs text-gray-500 mt-2">
                      {activeDropField === "proof"
                        ? "Drop to add"
                        : "Click or drop a single payment screenshot anywhere in this box."}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">
                    Upload a screenshot showing the payment option or QR. If you provided a URL, screenshot is optional.
                  </p>
                  {errors.proof && <p className="text-red-600 text-sm">{errors.proof}</p>}
                  {fileMessages.proof.length ? (
                    <ul className="text-xs text-amber-700 list-disc pl-5">
                      {fileMessages.proof.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}
                    </ul>
                  ) : null}
                  <AttachmentList
                    files={files.proof}
                    onRemove={(index) => handleFileRemove("proof", index)}
                    onReorder={(from, to) => handleFileReorder("proof", from, to)}
                    onMoveUp={(index) => handleFileMoveUp("proof", index)}
                    onMoveDown={(index) => handleFileMoveDown("proof", index)}
                  />
                </div>

                <div className="space-y-1">
                  {fieldLabel("Payment note (optional, max 150 characters)")}
                  <textarea
                    className="w-full rounded-md border px-3 py-2"
                    rows={2}
                    value={ownerDraft.paymentNote}
                    onChange={(e) => handleChange("paymentNote", e.target.value)}
                    maxLength={MAX_LENGTHS.paymentNote}
                  />
                  <p className="text-xs text-gray-500">
                    Short instructions for customers (e.g., &quot;Ask staff for QR&quot;, &quot;Lightning only&quot;).
                  </p>
                  <p className="text-xs text-gray-500">{ownerDraft.paymentNote.length} / {MAX_LENGTHS.paymentNote}</p>
                  {errors.paymentNote && <p className="text-red-600 text-sm">{errors.paymentNote}</p>}
                </div>

                {errors.paymentRequirement && (
                  <p className="text-red-600 text-sm">{errors.paymentRequirement}</p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {fieldLabel("Payment note (optional, max 150 characters)")}
                <textarea
                  className="w-full rounded-md border px-3 py-2"
                  rows={2}
                  value={ownerDraft.paymentNote}
                  onChange={(e) => handleChange("paymentNote", e.target.value)}
                  maxLength={MAX_LENGTHS.paymentNote}
                />
                <p className="text-xs text-gray-500">
                  Short instructions for customers (e.g., &quot;Ask staff for QR&quot;, &quot;Lightning only&quot;).
                </p>
                <p className="text-xs text-gray-500">{ownerDraft.paymentNote.length} / {MAX_LENGTHS.paymentNote}</p>
                {errors.paymentNote && <p className="text-red-600 text-sm">{errors.paymentNote}</p>}
              </div>
            )}

            {kind === "community" ? (
              <div className="space-y-2">
                {fieldLabel("Community evidence URLs (required, at least 2)")}
                <p className="text-xs text-gray-500">
                  Share third-party evidence links that support your suggestion. Payment page URLs are also valid evidence
                  and should be added here.
                </p>
                <div className="space-y-2">
                  {communityEvidenceEntries.map((entry, index) => (
                    <input
                      key={`community-evidence-${index}`}
                      type="url"
                      className="w-full rounded-md border px-3 py-2"
                      value={entry}
                      onChange={(e) => handleCommunityEvidenceChange(index, e.target.value)}
                      placeholder={`https://example.com/evidence-${index + 1}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleCommunityEvidenceAdd}
                  className="text-sm font-medium text-blue-600"
                >
                  + Add another URL
                </button>
                {errors.communityEvidenceUrls && (
                  <p className="text-red-600 text-sm">{errors.communityEvidenceUrls}</p>
                )}
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Website")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.website}
                  onChange={(e) => handleChange("website", e.target.value)}
                  placeholder="https://..."
                  maxLength={MAX_LENGTHS.website}
                />
              </div>
              <div className="space-y-1">
                {fieldLabel("Twitter / X")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.twitter}
                  onChange={(e) => handleChange("twitter", e.target.value)}
                  placeholder="@handle"
                  maxLength={MAX_LENGTHS.twitter}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Instagram")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.instagram}
                  onChange={(e) => handleChange("instagram", e.target.value)}
                  placeholder="@handle"
                  maxLength={MAX_LENGTHS.instagram}
                />
              </div>
              <div className="space-y-1">
                {fieldLabel("Facebook")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.facebook}
                  onChange={(e) => handleChange("facebook", e.target.value)}
                  placeholder="https://facebook.com/..."
                  maxLength={MAX_LENGTHS.facebook}
                />
              </div>
            </div>
          </div>
        ) : null}

        {kind === "report" && reportDraft ? (
          <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Report details</h2>
            <div className="space-y-1">
              {fieldLabel("Place name (required)")}
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2"
                value={reportDraft.placeName}
                onChange={(e) => handleChange("placeName", e.target.value)}
                maxLength={MAX_LENGTHS.reportPlaceName}
              />
              {errors.placeName && <p className="text-red-600 text-sm">{errors.placeName}</p>}
            </div>
            <div className="space-y-1">
              {fieldLabel("Reason (required)")}
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2"
                value={reportDraft.reportReason}
                onChange={(e) => handleChange("reportReason", e.target.value)}
                maxLength={MAX_LENGTHS.reportReason}
              />
              {errors.reportReason && <p className="text-red-600 text-sm">{errors.reportReason}</p>}
            </div>
            <div className="space-y-1">
              {fieldLabel("Requested action (required)")}
              <select
                className="w-full rounded-md border px-3 py-2"
                value={reportDraft.reportAction}
                onChange={(e) => handleChange("reportAction", e.target.value)}
              >
                <option value="">Select</option>
                <option value="hide">Hide listing</option>
                <option value="edit">Request correction</option>
              </select>
              {errors.reportAction && <p className="text-red-600 text-sm">{errors.reportAction}</p>}
            </div>
            <div className="space-y-1">
              {fieldLabel("What is incorrect? (required)")}
              <textarea
                className="w-full rounded-md border px-3 py-2"
                rows={3}
                value={reportDraft.reportDetails}
                onChange={(e) => handleChange("reportDetails", e.target.value)}
                maxLength={MAX_LENGTHS.reportDetails}
              />
              {errors.reportDetails && <p className="text-red-600 text-sm">{errors.reportDetails}</p>}
            </div>
            <div className="space-y-1">
              {fieldLabel("Evidence URLs (required, one per line)")}
              <textarea
                className="w-full rounded-md border px-3 py-2"
                rows={3}
                value={formatListField(reportDraft.communityEvidenceUrls)}
                onChange={(e) => handleChange("communityEvidenceUrls", parseListField(e.target.value))}
              />
              {errors.communityEvidenceUrls && (
                <p className="text-red-600 text-sm">{errors.communityEvidenceUrls}</p>
              )}
            </div>
          </div>
        ) : null}

        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Attachments</h2>
          <p className="text-sm text-gray-600">
            JPEG, PNG, or WebP only. Max file size 2MB.
          </p>
          {kind !== "report" && (
            <div className="space-y-2">
              {fieldLabel(`Gallery images (${files.gallery.length}/${FILE_LIMITS[kind].gallery})`)}
              <div
                className={`rounded border border-dashed p-3 transition ${
                  activeDropField === "gallery" ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-gray-50"
                }`}
                onDragEnter={(event) => handleDropzoneDragEnter("gallery", event)}
                onDragOver={(event) => handleDropzoneDragOver("gallery", event)}
                onDragLeave={(event) => handleDropzoneDragLeave("gallery", event)}
                onDrop={(event) => handleDropzoneDrop("gallery", event)}
              >
                <input
                  ref={galleryInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleFileAdd("gallery", e.target.files)}
                />
                <button
                  type="button"
                  className="rounded border border-gray-300 bg-white px-3 py-1 text-sm"
                  onClick={() => openFilePicker("gallery")}
                >
                  Choose files
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  {activeDropField === "gallery" ? "Drop to add" : "Click or drop multiple gallery images anywhere in this box."}
                </p>
              </div>
              {errors.gallery && <p className="text-red-600 text-sm">{errors.gallery}</p>}
              {fileMessages.gallery.length ? (
                <ul className="text-xs text-amber-700 list-disc pl-5">
                  {fileMessages.gallery.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}
                </ul>
              ) : null}
              <AttachmentList
                files={files.gallery}
                onRemove={(index) => handleFileRemove("gallery", index)}
                onReorder={(from, to) => handleFileReorder("gallery", from, to)}
                onMoveUp={(index) => handleFileMoveUp("gallery", index)}
                onMoveDown={(index) => handleFileMoveDown("gallery", index)}
              />
            </div>
          )}
          {kind === "report" && (
            <div className="space-y-2">
              {fieldLabel(`Evidence images (${files.evidence.length}/${FILE_LIMITS[kind].evidence})`)}
              <div
                className={`rounded border border-dashed p-3 transition ${
                  activeDropField === "evidence" ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-gray-50"
                }`}
                onDragEnter={(event) => handleDropzoneDragEnter("evidence", event)}
                onDragOver={(event) => handleDropzoneDragOver("evidence", event)}
                onDragLeave={(event) => handleDropzoneDragLeave("evidence", event)}
                onDrop={(event) => handleDropzoneDrop("evidence", event)}
              >
                <input
                  ref={evidenceInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleFileAdd("evidence", e.target.files)}
                />
                <button
                  type="button"
                  className="rounded border border-gray-300 bg-white px-3 py-1 text-sm"
                  onClick={() => openFilePicker("evidence")}
                >
                  Choose files
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  {activeDropField === "evidence" ? "Drop to add" : "Click or drop multiple evidence images anywhere in this box."}
                </p>
              </div>
              {errors.evidence && <p className="text-red-600 text-sm">{errors.evidence}</p>}
              {fileMessages.evidence.length ? (
                <ul className="text-xs text-amber-700 list-disc pl-5">
                  {fileMessages.evidence.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}
                </ul>
              ) : null}
              <AttachmentList
                files={files.evidence}
                onRemove={(index) => handleFileRemove("evidence", index)}
                onReorder={(from, to) => handleFileReorder("evidence", from, to)}
                onMoveUp={(index) => handleFileMoveUp("evidence", index)}
                onMoveDown={(index) => handleFileMoveDown("evidence", index)}
              />
            </div>
          )}
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Your info</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              {fieldLabel(`Name ${kind === "report" ? "(optional)" : "(required)"}`)}
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2"
                value={draft.submitterName}
                onChange={(e) => handleChange("submitterName", e.target.value)}
                maxLength={MAX_LENGTHS.submitterNameMax}
              />
              {errors.submitterName && <p className="text-red-600 text-sm">{errors.submitterName}</p>}
            </div>
            <div className="space-y-1">
              {fieldLabel(`Email ${kind === "report" ? "(optional)" : "(required)"}`)}
              <input
                type="email"
                className="w-full rounded-md border px-3 py-2"
                value={draft.submitterEmail}
                onChange={(e) => handleChange("submitterEmail", e.target.value)}
                maxLength={MAX_LENGTHS.contactEmail}
              />
              {errors.submitterEmail && <p className="text-red-600 text-sm">{errors.submitterEmail}</p>}
            </div>
          </div>

          {kind !== "report" && ownerDraft ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Role")}
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.role}
                  onChange={(e) => handleChange("role", e.target.value)}
                >
                  <option value="owner">Owner</option>
                  <option value="staff">Staff</option>
                  <option value="customer">Customer</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1">
                {fieldLabel("Notes for admin")}
                <textarea
                  className="w-full rounded-md border px-3 py-2"
                  rows={2}
                  maxLength={MAX_LENGTHS.notesForAdmin}
                  value={ownerDraft.notesForAdmin}
                  onChange={(e) => handleChange("notesForAdmin", e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-md bg-blue-600 text-white px-4 py-2 font-semibold"
          >
            Confirm details
          </button>
        </div>
      </div>
    </div>
  );
}
