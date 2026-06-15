import { Streamdown } from "streamdown";
import type { Column } from "@/lib/api";
import { formatIcon, formatLabel } from "./columnFormat";
import { WorkflowModal } from "./WorkflowModal";

interface Props {
  col: Column;
  onClose: () => void;
}

export function WFColumnViewModal({ col, onClose }: Props) {
  const FormatIcon = formatIcon(col.format ?? "text");
  return (
    <WorkflowModal
      open
      onClose={onClose}
      breadcrumbs={["Workflows", col.name]}
      primaryAction={{ label: "Close", onClick: onClose }}
      cancelAction={false}
    >
      <div className="flex flex-col gap-4 py-1">
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Column Title</p>
          <p className="text-sm text-foreground">{col.name}</p>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Format</p>
          <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
            <FormatIcon className="h-3.5 w-3.5 text-muted-foreground" />
            {formatLabel(col.format ?? "text")}
          </span>
        </div>
        {col.tags && col.tags.length > 0 && (
          <div>
            <p className="mb-2.5 text-sm font-medium text-muted-foreground">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {col.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Prompt</p>
          <div className="text-sm leading-relaxed text-foreground/80">
            <Streamdown>{col.prompt || "_No prompt defined._"}</Streamdown>
          </div>
        </div>
      </div>
    </WorkflowModal>
  );
}
