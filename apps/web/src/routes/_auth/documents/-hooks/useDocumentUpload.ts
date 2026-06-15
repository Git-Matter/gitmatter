import { useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useMutation } from "@tanstack/react-query";
import type { PaginationState } from "@tanstack/react-table";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function useDocumentUpload({
  matterId,
  onUploaded,
  setPagination,
}: {
  matterId: string | null | undefined;
  onUploaded: () => void;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadDocument(file, undefined, matterId ?? undefined),
    onSuccess: onUploaded,
  });

  async function uploadFiles(files: File[]) {
    const ok = files.filter((file) => /\.(pdf|docx?)$/i.test(file.name));
    if (!ok.length) {
      if (files.length) toast.error("Only PDF or DOCX files are supported");
      return;
    }
    setUploading(true);
    try {
      for (const file of ok) {
        await uploadMutation.mutateAsync(file);
      }
      setPagination((current) => ({ ...current, pageIndex: 0 }));
      toast.success(`Uploaded ${ok.length} file${ok.length > 1 ? "s" : ""} - extracting...`);
    } catch (err) {
      onUploaded();
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void uploadFiles(files);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void uploadFiles(Array.from(e.dataTransfer.files));
  }

  function onDragEnter(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes("Files")) e.preventDefault();
  }

  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
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
  };
}
