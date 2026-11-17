import { Fragment, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export type Crumb = { label: string; to?: string; params?: Record<string, string> };

/** Shared page identity, standard breadcrumbs and grouped actions. */
export function PageHeader({
  title,
  action,
  actions,
  breadcrumbs,
}: {
  title?: ReactNode;
  /** A single action cluster (back-compat). */
  action?: ReactNode;
  /** Multiple action clusters, spaced apart on the right. */
  actions?: ReactNode[];
  breadcrumbs?: Crumb[];
}) {
  const groups = actions ?? (action ? [action] : []);
  const hasCrumbs = !!breadcrumbs && breadcrumbs.length > 0;

  return (
    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {hasCrumbs && breadcrumbs.length > 1 && (
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.slice(0, -1).map((crumb, index) => (
                <Fragment key={index}>
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {crumb.to ? (
                      <BreadcrumbLink render={<Link to={crumb.to} params={crumb.params} />}>
                        {crumb.label || "Untitled"}
                      </BreadcrumbLink>
                    ) : (
                      <span>{crumb.label || "Untitled"}</span>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        )}
        <h1 className="truncate font-sans text-xl leading-tight font-medium tracking-tight">
          {hasCrumbs ? breadcrumbs.at(-1)?.label || "Untitled" : title}
        </h1>
      </div>
      {groups.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {groups.map((g, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              {g}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
