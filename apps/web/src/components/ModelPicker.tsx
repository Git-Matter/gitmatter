import { useEffect, useState } from "react";
import { api, type LlmModel } from "../lib/api";

/**
 * Provider/model selector backed by /api/models. The empty value means "server
 * default". Shared by chat (per message) and tabular reviews (per run).
 */
export function ModelPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (model: string) => void;
  className?: string;
}) {
  const [models, setModels] = useState<LlmModel[]>([]);

  useEffect(() => {
    api
      .listModels()
      .then(setModels)
      .catch(() => {});
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 rounded-md border border-input bg-background px-2.5 text-sm ${className ?? ""}`}
    >
      <option value="">Default model</option>
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
