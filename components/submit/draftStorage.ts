import type { SubmissionKind } from "@/lib/submissions";

import type { DraftBundle, StoredFile, SubmissionDraft, SubmissionDraftFiles } from "./types";

const DRAFT_PREFIX = "submit-draft";
const FILE_DB_NAME = "submit-draft-files";
const FILE_STORE_NAME = "files";

const buildKey = (kind: SubmissionKind) => `${DRAFT_PREFIX}:${kind}`;
const buildBlobId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const openFileDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }

    const request = indexedDB.open(FILE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE_NAME)) {
        db.createObjectStore(FILE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });

const putFileBlob = async (id: string, file: File): Promise<void> => {
  const db = await openFileDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FILE_STORE_NAME, "readwrite");
    tx.objectStore(FILE_STORE_NAME).put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to store file in IndexedDB."));
    tx.onabort = () => reject(tx.error ?? new Error("Failed to store file in IndexedDB."));
  });
  db.close();
};

const getFileBlob = async (id: string): Promise<Blob | null> => {
  const db = await openFileDb();
  const file = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(FILE_STORE_NAME, "readonly");
    const request = tx.objectStore(FILE_STORE_NAME).get(id);
    request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Failed to read file from IndexedDB."));
  });
  db.close();
  return file;
};

const deleteFileBlob = async (id: string): Promise<void> => {
  const db = await openFileDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FILE_STORE_NAME, "readwrite");
    tx.objectStore(FILE_STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to remove file from IndexedDB."));
    tx.onabort = () => reject(tx.error ?? new Error("Failed to remove file from IndexedDB."));
  });
  db.close();
};

const normalizeFiles = (files?: SubmissionDraftFiles): SubmissionDraftFiles => ({
  gallery: files?.gallery ?? [],
  proof: files?.proof ?? [],
  evidence: files?.evidence ?? [],
});

export const storeFile = async (file: File): Promise<StoredFile> => {
  const id = buildBlobId();
  await putFileBlob(id, file);
  return {
    id,
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
  };
};

export const buildPreviewUrl = async (file: StoredFile): Promise<string> => {
  const blob = await getFileBlob(file.id);
  if (!blob) throw new Error(`Attachment is unavailable: ${file.name}`);
  return URL.createObjectURL(blob);
};

export const hydrateFiles = async (stored: StoredFile[]): Promise<File[]> => {
  const files: File[] = [];
  for (const entry of stored) {
    const blob = await getFileBlob(entry.id);
    if (!blob) {
      throw new Error(`Attachment is unavailable: ${entry.name}`);
    }
    files.push(new File([blob], entry.name, { type: entry.type || blob.type, lastModified: entry.lastModified }));
  }
  return files;
};

export const removeStoredFile = async (file: StoredFile): Promise<void> => {
  await deleteFileBlob(file.id);
};

export const removeStoredFiles = async (files: StoredFile[]): Promise<void> => {
  for (const file of files) {
    await deleteFileBlob(file.id);
  }
};

export const loadDraftBundle = (kind: SubmissionKind): DraftBundle | null => {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(buildKey(kind));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DraftBundle;
    return {
      ...parsed,
      files: normalizeFiles(parsed.files),
    };
  } catch (error) {
    console.warn("Failed to parse draft bundle", error);
    return null;
  }
};

export const saveDraftBundle = (kind: SubmissionKind, payload: SubmissionDraft, files: SubmissionDraftFiles): string | null => {
  if (typeof window === "undefined") return null;
  const bundle: DraftBundle = {
    kind,
    payload,
    files: normalizeFiles(files),
    updatedAt: new Date().toISOString(),
  };
  try {
    window.sessionStorage.setItem(buildKey(kind), JSON.stringify(bundle));
    return null;
  } catch (error) {
    console.error("Failed to save draft bundle", error);
    return "Failed to save draft state in this browser. Please free storage and try again.";
  }
};

export const clearDraftBundle = async (kind: SubmissionKind, files?: SubmissionDraftFiles) => {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(buildKey(kind));
  }
  const normalized = normalizeFiles(files);
  const allFiles = [...normalized.gallery, ...normalized.proof, ...normalized.evidence];
  if (!allFiles.length) return;
  try {
    await removeStoredFiles(allFiles);
  } catch (error) {
    console.warn("Failed to cleanup draft files", error);
  }
};
