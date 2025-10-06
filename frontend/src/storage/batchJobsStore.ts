import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import {
  BATCH_JOBS_KEY,
  type BatchJob,
  type BatchJobStatus,
  normalizeBatchJobStatus,
} from "../types/batchJobs";
import { genId } from "../utils/id";

const DB_NAME = "alpaca-flow";
const DB_VERSION = 1;
const STORE_NAME = "batch_jobs";
const INDEX_STATUS = "by-status";
const INDEX_CREATED_AT = "by-createdAt";
const INDEX_KIND = "by-kind";

type Nullable<T> = T | null | undefined;

interface BatchJobsDb extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: BatchJob;
    indexes: {
      [INDEX_STATUS]: BatchJobStatus;
      [INDEX_CREATED_AT]: string;
      [INDEX_KIND]: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<BatchJobsDb>> | null = null;
let disableIndexedDb = false;

const isWindowAvailable = () => typeof window !== "undefined";

const isIndexedDbSupported = () => isWindowAvailable() && "indexedDB" in window && !disableIndexedDb;

const getDb = async () => {
  if (!isIndexedDbSupported()) throw new Error("IndexedDB not available");

  if (!dbPromise) {
    dbPromise = openDB<BatchJobsDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex(INDEX_STATUS, "status", { unique: false });
          store.createIndex(INDEX_CREATED_AT, "createdAt", { unique: false });
          store.createIndex(INDEX_KIND, "kind", { unique: false });
        }
      },
    });
  }
  return dbPromise;
};

const toStringSafe = (value: Nullable<unknown>, fallback = "") =>
  value === null || value === undefined ? fallback : String(value);

const toNumberSafe = (value: Nullable<unknown>, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toStringRecord = (input: unknown) => {
  if (!input || typeof input !== "object") return {};
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [String(k), String(v)]));
};

const normalizeJob = (raw: unknown): BatchJob => {
  const rawData = raw as Record<string, unknown> | null | undefined;
  const id = toStringSafe(rawData?.id, genId());
  const name = toStringSafe(rawData?.name, "Batch Backtest");
  const kind = rawData?.kind === "local" ? "local" : "server";

  const total = toNumberSafe(rawData?.total, 0);
  let completed = toNumberSafe(rawData?.completed, 0);

  const createdAt = toStringSafe(rawData?.createdAt, new Date().toISOString());
  const updatedAt = toStringSafe(
    rawData?.updatedAt,
    toStringSafe(rawData?.createdAt, new Date().toISOString())
  );

  const error = rawData?.error ? toStringSafe(rawData.error) : null;
  const truncated = Boolean(rawData?.truncated);
  const viewUrl = rawData?.viewUrl ? toStringSafe(rawData.viewUrl) : null;
  const csvUrl = rawData?.csvUrl ? toStringSafe(rawData.csvUrl) : null;
  const completedAt = rawData?.completedAt ? toStringSafe(rawData.completedAt) : null;
  const preview = Array.isArray(rawData?.preview)
    ? (rawData.preview as unknown[]).map((item: unknown) => ({
        vars: toStringRecord((item as Record<string, unknown> | null | undefined)?.vars),
        description: toStringSafe((item as Record<string, unknown> | null | undefined)?.description),
      }))
    : undefined;
  const previewCount = preview ? preview.length : 0;

  let status = normalizeBatchJobStatus(rawData?.status, "queued");

  const inferredFinished =
    total > 0 &&
    ((completed >= total && status !== "finished") ||
      (!error && (previewCount > 0 || !!completedAt)));

  if (status === "finished" || inferredFinished) {
    status = "finished";
    if (total > 0 && completed < total) completed = total;
  }

  return {
    id,
    name,
    kind,
    status,
    total,
    completed,
    createdAt,
    updatedAt,
    detail: Array.isArray(rawData?.detail)
      ? (rawData.detail as unknown[]).map((item: unknown) => {
          const itemRecord = item as Record<string, unknown> | null | undefined;
          return {
            name: toStringSafe(itemRecord?.name, "var"),
            count: toNumberSafe(itemRecord?.count, 0),
            values: Array.isArray(itemRecord?.values)
              ? (itemRecord.values as unknown[]).map((v: unknown) => toStringSafe(v))
              : [],
            label: itemRecord?.label ? toStringSafe(itemRecord.label) : undefined,
            originalName: itemRecord?.originalName ? toStringSafe(itemRecord.originalName) : undefined,
          };
        })
      : [],
    error,
    truncated,
    viewUrl,
    csvUrl,
    completedAt,
    preview,
  };
};

const filterLegacyLocalJobs = (jobs: BatchJob[]): BatchJob[] =>
  jobs.filter((job) => job.kind !== "local" && !job.id.startsWith("local-"));

const readFromLocalStorage = (): BatchJob[] => {
  if (!isWindowAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(BATCH_JOBS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return filterLegacyLocalJobs(parsed.map((item) => normalizeJob(item)));
  } catch (error) {
    console.warn("Failed to parse batch jobs from localStorage", error);
    return [];
  }
};

const writeToLocalStorage = (jobs: BatchJob[]) => {
  if (!isWindowAvailable()) return;
  try {
    window.localStorage.setItem(BATCH_JOBS_KEY, JSON.stringify(jobs));
  } catch (error) {
    console.warn("Failed to persist batch jobs to localStorage", error);
  }
};

const clearLocalStorage = () => {
  if (!isWindowAvailable()) return;
  try {
    window.localStorage.removeItem(BATCH_JOBS_KEY);
  } catch (error) {
    console.warn("Failed to clear batch jobs localStorage key", error);
  }
};

const seedDbIfNeeded = async (db: IDBPDatabase<BatchJobsDb>): Promise<BatchJob[]> => {
  const rawExisting = await db.getAll(STORE_NAME);
  const existing = filterLegacyLocalJobs(rawExisting);
  if (existing.length !== rawExisting.length) {
    const txCleanup = db.transaction(STORE_NAME, "readwrite");
    await Promise.all(
      rawExisting
        .filter((job) => job.kind === "local" || job.id.startsWith("local-"))
        .map((job) => txCleanup.store.delete(job.id))
    );
    await txCleanup.done;
  }
  if (existing.length > 0) return existing;

  const fromLocal = readFromLocalStorage();
  if (!fromLocal.length) return [];

  const tx = db.transaction(STORE_NAME, "readwrite");
  try {
    await Promise.all(fromLocal.map((job) => tx.store.put(job)));
    await tx.done;
    clearLocalStorage();
  } catch (error) {
    console.warn("Failed to seed IndexedDB from localStorage", error);
    disableIndexedDb = true;
    writeToLocalStorage(fromLocal);
    return fromLocal;
  }

  return fromLocal;
};

const handleIndexedDbError = (error: unknown) => {
  console.warn("IndexedDB operation failed; falling back to localStorage", error);
  disableIndexedDb = true;
};

export const getAllJobs = async (): Promise<BatchJob[]> => {
  if (!isWindowAvailable()) return [];
  if (!isIndexedDbSupported()) return readFromLocalStorage();

  try {
    const db = await getDb();
    const seeded = await seedDbIfNeeded(db);
    if (seeded.length) return filterLegacyLocalJobs(seeded);
    return filterLegacyLocalJobs(await db.getAll(STORE_NAME));
  } catch (error) {
    handleIndexedDbError(error);
    return readFromLocalStorage();
  }
};

export const saveJobList = async (jobs: BatchJob[]): Promise<void> => {
  const normalized = jobs.map((job) => normalizeJob(job));

  if (!isIndexedDbSupported()) {
    writeToLocalStorage(normalized);
    return;
  }

  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    await tx.store.clear();
    await Promise.all(normalized.map((job) => tx.store.put(job)));
    await tx.done;
  } catch (error) {
    handleIndexedDbError(error);
    writeToLocalStorage(normalized);
  }
};

export const putJob = async (job: BatchJob): Promise<void> => {
  const normalized = normalizeJob(job);

  if (!isIndexedDbSupported()) {
    const current = readFromLocalStorage();
    const existingIndex = current.findIndex((item) => item.id === normalized.id);
    const next = existingIndex >= 0
      ? [...current.slice(0, existingIndex), normalized, ...current.slice(existingIndex + 1)]
      : [...current, normalized];
    writeToLocalStorage(next);
    return;
  }

  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    await tx.store.put(normalized);
    await tx.done;
  } catch (error) {
    handleIndexedDbError(error);
    const current = readFromLocalStorage();
    const existingIndex = current.findIndex((item) => item.id === normalized.id);
    const next = existingIndex >= 0
      ? [...current.slice(0, existingIndex), normalized, ...current.slice(existingIndex + 1)]
      : [...current, normalized];
    writeToLocalStorage(next);
  }
};

export const deleteJob = async (id: string): Promise<void> => {
  if (!isIndexedDbSupported()) {
    const current = readFromLocalStorage().filter((job) => job.id !== id);
    writeToLocalStorage(current);
    return;
  }

  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    await tx.store.delete(id);
    await tx.done;
  } catch (error) {
    handleIndexedDbError(error);
    const current = readFromLocalStorage().filter((job) => job.id !== id);
    writeToLocalStorage(current);
  }
};

export const clearJobs = async (): Promise<void> => {
  if (!isIndexedDbSupported()) {
    clearLocalStorage();
    return;
  }

  try {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    await tx.store.clear();
    await tx.done;
  } catch (error) {
    handleIndexedDbError(error);
    clearLocalStorage();
  }
};
