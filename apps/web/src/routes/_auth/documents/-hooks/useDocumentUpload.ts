import { captureActionOrigin, notifySuccess, type ActionOrigin } from "@/lib/feedback";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { PaginationState } from "@tanstack/react-table";
import { api, ApiError } from "@/lib/data/api";

export type UploadResult = {
  id: number;
  name: string;
  file: File | null;
  matterId: string | undefined;
  origin: ActionOrigin;
  status:
    | "waiting"
    | "uploading"
    | "uploaded"
    | "failed"
    | "unconfirmed"
    | "not_attempted"
    | "unsupported";
  error?: string;
};

export function canRetryUpload(item: UploadResult): boolean {
  return item.file !== null && ["failed", "unconfirmed", "not_attempted"].includes(item.status);
}

export function useDocumentUpload({
  matterId,
  onUploaded,
  setPagination,
  disabled = false,
}: {
  matterId: string | null | undefined;
  onUploaded: () => void;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const resultsRef = useRef<UploadResult[]>([]);
  const uploadInFlight = useRef(false);
  const nextFileId = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  function updateResults(change: (previous: UploadResult[]) => UploadResult[]) {
    resultsRef.current = change(resultsRef.current);
    setResults(resultsRef.current);
  }
  function setFileStatus(id: number, next: UploadResult["status"], error?: string) {
    updateResults((previous) =>
      previous.map((item) =>
        item.id === id
          ? { ...item, status: next, error, file: next === "uploaded" ? null : item.file }
          : item
      )
    );
  }

  async function uploadBatch(items: UploadResult[]) {
    if (uploadInFlight.current || disabled || !items.length) return;
    uploadInFlight.current = true;
    setUploading(true);
    let confirmed = 0;
    try {
      for (const item of items) {
        if (!item.file) continue;
        setFileStatus(item.id, "uploading");
        try {
          // A retry is sent only from a deliberate user action. No uncertain write is replayed here.
          await api.uploadDocument(item.file, undefined, item.matterId);
        } catch (error) {
          const rejected =
            error instanceof ApiError &&
            error.status >= 400 &&
            error.status < 500 &&
            error.status !== 408;
          setFileStatus(
            item.id,
            rejected ? "failed" : "unconfirmed",
            error instanceof Error ? error.message : "The upload result could not be confirmed."
          );
          updateResults((previous) =>
            previous.map((entry) =>
              entry.status === "waiting" ? { ...entry, status: "not_attempted" } : entry
            )
          );
          onUploaded();
          break;
        }
        setFileStatus(item.id, "uploaded");
        confirmed++;
        onUploaded();
      }
      if (confirmed) {
        setPagination((current) => ({ ...current, pageIndex: 0 }));
        const unresolved = resultsRef.current.some((item) => item.status !== "uploaded");
        notifySuccess(
          `${confirmed} file${confirmed === 1 ? "" : "s"} uploaded. ${unresolved ? "Other upload results need attention." : "Text extraction may still be processing."}`,
          items[0].origin
        );
      }
    } finally {
      uploadInFlight.current = false;
      setUploading(false);
    }
  }

  function uploadFiles(files: File[]) {
    if (uploadInFlight.current || disabled) return;
    const origin = captureActionOrigin();
    const batch = files.map<UploadResult>((file) => {
      const supported = /\.(pdf|docx?)$/i.test(file.name);
      return {
        id: ++nextFileId.current,
        name: file.name,
        file: supported ? file : null,
        matterId: matterId ?? undefined,
        origin,
        status: supported ? "waiting" : "unsupported",
        error: supported
          ? undefined
          : "This file type is not supported. Choose a PDF or Word document.",
      };
    });
    // New picks never erase an unresolved retry list.
    updateResults((previous) => [...previous, ...batch]);
    void uploadBatch(batch.filter((item) => item.status === "waiting"));
  }

  function retryUpload(id: number) {
    const item = resultsRef.current.find((entry) => entry.id === id);
    if (item && canRetryUpload(item)) void uploadBatch([item]);
  }
  function dismissUploads() {
    if (!uploadInFlight.current) updateResults(() => []);
  }
  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    uploadFiles(files);
  }
  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    uploadFiles(Array.from(event.dataTransfer.files));
  }
  function onDragEnter(event: React.DragEvent) {
    if (disabled || uploadInFlight.current || !event.dataTransfer.types.includes("Files")) return;
    dragDepth.current++;
    setDragging(true);
  }
  function onDragOver(event: React.DragEvent) {
    if (event.dataTransfer.types.includes("Files")) event.preventDefault();
  }
  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDragging(false);
  }

  return {
    dragging,
    fileRef,
    onDragEnter,
    onDragLeave,
    onDragOver,
    onDrop,
    onPick,
    uploading,
    results,
    retryUpload,
    dismissUploads,
  };
}
