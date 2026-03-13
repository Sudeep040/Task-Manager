"use client";

import { useCallback, useRef, useState } from "react";
import { Attachment, uploadApi } from "@/lib/api-client";

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadStatus = "idle" | "uploading" | "done" | "error";

interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number; // 0–100
  error?: string;
  attachment?: Attachment;
}

interface FileUploaderProps {
  /** Called whenever the committed attachments list changes */
  onChange: (attachments: Attachment[]) => void;
  /** Already-committed attachments (controlled) */
  value?: Attachment[];
  disabled?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACCEPT_IMAGE = "image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml";
const ACCEPT_VIDEO = "video/mp4,video/quicktime,video/webm,video/avi,video/x-msvideo";
const ACCEPT_ALL = `${ACCEPT_IMAGE},${ACCEPT_VIDEO}`;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(type: string) {
  return type.startsWith("image/");
}

/** Upload a single file (handles both single-URL and multipart). */
async function uploadFile(
  file: File,
  onProgress: (pct: number) => void
): Promise<Attachment> {
  const init = await uploadApi.initUpload({
    filename: file.name,
    contentType: file.type,
    fileSize: file.size,
  });

  if (init.type === "single") {
    await uploadApi.uploadChunk(init.uploadUrl, file, onProgress);
    return {
      url: init.publicUrl,
      key: init.key,
      filename: init.filename,
      fileType: init.fileType,
      fileSize: init.fileSize,
    };
  }

  // Multipart — upload each part and collect ETags
  const parts = init.parts;
  const etags: { PartNumber: number; ETag: string }[] = [];
  let totalUploaded = 0;

  for (const part of parts) {
    const chunk = file.slice(part.start, part.end);
    const etag = await uploadApi.uploadChunk(
      part.uploadUrl,
      chunk,
      (partPct) => {
        const partBytes = (part.end - part.start) * (partPct / 100);
        const overall = Math.round(((totalUploaded + partBytes) / file.size) * 100);
        onProgress(Math.min(overall, 99));
      }
    );
    etags.push({ PartNumber: part.partNumber, ETag: etag });
    totalUploaded += part.end - part.start;
  }

  onProgress(99);
  const completed = await uploadApi.completeMultipart({
    key: init.key,
    uploadId: init.uploadId,
    parts: etags,
  });

  return {
    url: completed.publicUrl,
    key: init.key,
    filename: init.filename,
    fileType: init.fileType,
    fileSize: init.fileSize,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FileUploader({ onChange, value = [], disabled = false }: FileUploaderProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRefs = useRef<Map<string, AbortController>>(new Map());

  // Committed attachments come from `value` (passed in from parent)
  const committedAttachments = value;

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function notifyParent(newAttachment: Attachment) {
    onChange([...committedAttachments, newAttachment]);
  }

  async function startUpload(item: UploadItem) {
    updateItem(item.id, { status: "uploading", progress: 0, error: undefined });
    try {
      const attachment = await uploadFile(item.file, (pct) => {
        updateItem(item.id, { progress: pct });
      });
      updateItem(item.id, { status: "done", progress: 100, attachment });
      notifyParent(attachment);
    } catch (err) {
      updateItem(item.id, {
        status: "error",
        error: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }

  function enqueueFiles(files: File[]) {
    const newItems: UploadItem[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "idle",
      progress: 0,
    }));
    setItems((prev) => [...prev, ...newItems]);
    newItems.forEach((item) => startUpload(item));
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) enqueueFiles(files);
    // Reset so the same file can be picked again
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) enqueueFiles(files);
  }

  function handleRetry(item: UploadItem) {
    startUpload({ ...item, status: "idle", progress: 0, error: undefined });
  }

  function handleRemoveItem(id: string) {
    // Abort in-flight XHR if any
    abortRefs.current.get(id)?.abort();
    abortRefs.current.delete(id);
    // Also remove from parent's committed list if it was done
    const item = items.find((i) => i.id === id);
    if (item?.attachment) {
      onChange(committedAttachments.filter((a) => a.key !== item.attachment!.key));
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const isUploading = items.some((i) => i.status === "uploading");

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-sm transition-colors cursor-pointer select-none
          ${dragOver ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/40"}
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_ALL}
          className="hidden"
          onChange={handleFileInputChange}
          disabled={disabled}
        />

        <div className="flex gap-3">
          {/* Image icon */}
          <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          {/* Video icon */}
          <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
            />
          </svg>
        </div>

        <p className="font-medium text-gray-700">
          {dragOver ? "Drop files here" : "Click or drag files to upload"}
        </p>
        <p className="text-xs text-gray-400">
          Images (JPEG, PNG, GIF, WebP, SVG) · Videos (MP4, MOV, WebM, AVI) · Max 200 MB each
        </p>
      </div>

      {/* Upload queue */}
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <UploadRow
              key={item.id}
              item={item}
              onRetry={() => handleRetry(item)}
              onRemove={() => handleRemoveItem(item.id)}
            />
          ))}
        </ul>
      )}

      {/* Overall status */}
      {isUploading && (
        <p className="text-xs text-indigo-600 animate-pulse">Uploading files…</p>
      )}
    </div>
  );
}

// ─── Upload row sub-component ─────────────────────────────────────────────────

interface UploadRowProps {
  item: UploadItem;
  onRetry: () => void;
  onRemove: () => void;
}

function UploadRow({ item, onRetry, onRemove }: UploadRowProps) {
  const isImg = isImageType(item.file.type);

  const statusColor: Record<UploadStatus, string> = {
    idle: "text-gray-400",
    uploading: "text-indigo-600",
    done: "text-emerald-600",
    error: "text-red-600",
  };

  const statusLabel: Record<UploadStatus, string> = {
    idle: "Pending",
    uploading: `${item.progress}%`,
    done: "Done",
    error: "Failed",
  };

  return (
    <li className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2 shadow-sm">
      {/* File type icon */}
      <div className="flex-shrink-0">
        {isImg ? (
          <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
            />
          </svg>
        )}
      </div>

      {/* Name + size + progress */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-800 truncate">{item.file.name}</p>
          <span className={`text-xs font-medium flex-shrink-0 ${statusColor[item.status]}`}>
            {statusLabel[item.status]}
          </span>
        </div>

        <p className="text-xs text-gray-400">{formatBytes(item.file.size)}</p>

        {/* Progress bar */}
        {item.status === "uploading" && (
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-200"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}

        {/* Error message */}
        {item.status === "error" && item.error && (
          <p className="mt-1 text-xs text-red-500 truncate">{item.error}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-1">
        {item.status === "error" && (
          <button
            type="button"
            onClick={onRetry}
            title="Retry upload"
            className="p-1 rounded hover:bg-amber-50 text-amber-500 hover:text-amber-600 transition-colors"
          >
            {/* Refresh/retry icon */}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        )}

        {item.status === "done" && (
          <span className="p-1 text-emerald-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </span>
        )}

        {item.status !== "uploading" && (
          <button
            type="button"
            onClick={onRemove}
            title="Remove"
            className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </li>
  );
}
