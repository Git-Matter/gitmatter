import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/data/api";
import type { SearchResult } from "@workspace/core";

export function MatterWorkSearch({ matterId }: { matterId: string }) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [allMatters, setAllMatters] = useState(false);
  const [type, setType] = useState<"" | SearchResult["type"]>("");
  const [page, setPage] = useState(0);
  const { data, isFetching, error } = useQuery({
    queryKey: ["matter-work-search", matterId, query, allMatters, type, page],
    queryFn: () =>
      api.searchWork({
        query,
        matterId: allMatters ? undefined : matterId,
        type: type || undefined,
        page,
      }),
    enabled: !!query,
  });
  const groups = new Map<string, SearchResult[]>();
  for (const result of data?.results ?? []) {
    const group = result.matterName ?? "Library and shared work";
    groups.set(group, [...(groups.get(group) ?? []), result]);
  }
  return (
    <section className="min-h-0 flex-1 space-y-5 overflow-auto" aria-label="Find prior work">
      <div>
        <h2 className="font-serif text-xl">Find prior work</h2>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Search source text, saved review findings and approved positions. Only work you can
          currently read contributes to results and counts.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setQuery(draft.trim());
        }}
        className="flex flex-wrap gap-2"
      >
        <label className="min-w-48 flex-1">
          <span className="sr-only">Search terms</span>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={300}
            placeholder="Find a clause or review value…"
          />
        </label>
        <Button disabled={!draft.trim() || isFetching}>
          {isFetching ? "Searching…" : "Search"}
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allMatters}
            onChange={(e) => {
              setAllMatters(e.target.checked);
              setPage(0);
            }}
          />
          All authorized matters
        </label>
        <label className="flex items-center gap-2">
          <span>Source</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-2"
            value={type}
            onChange={(e) => {
              setType(e.target.value as typeof type);
              setPage(0);
            }}
          >
            <option value="">All sources</option>
            <option value="document">Documents</option>
            <option value="cell">Review findings</option>
            <option value="clause">Clauses</option>
            <option value="playbook">Playbooks</option>
            <option value="matter">Matter details</option>
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Search failed. Check your connection and try again.
        </p>
      )}
      {query && data && (
        <p role="status" className="text-xs text-muted-foreground">
          {data.rowCount} authorized results
        </p>
      )}
      {query && data && !data.rowCount && (
        <p className="text-sm text-muted-foreground">
          No matching work. Try fewer terms or choose all authorized matters.
        </p>
      )}
      {[...groups].map(([name, results]) => (
        <section key={name} className="space-y-3">
          <h3 className="text-sm font-semibold">{name}</h3>
          {results.map((result) => (
            <a
              key={`${result.type}:${result.id}`}
              href={result.url}
              className="block space-y-1 rounded-md py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-medium underline underline-offset-4">
                  {result.title}
                </span>
                <span className="text-xs text-muted-foreground capitalize">
                  {result.type === "cell" ? "review finding" : result.type}
                </span>
              </div>
              <p className="max-w-prose text-sm text-muted-foreground">{result.snippet}</p>
            </a>
          ))}
        </section>
      ))}
      {!!data?.rowCount && (
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={!page || isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page + 1}</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={(page + 1) * 20 >= data.rowCount || isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </section>
  );
}
