type QuerySource = {
  req: {
    query: (name: string) => string | undefined;
  };
};

type FilterValues<Filters extends Record<string, readonly string[]>> = {
  [Key in keyof Filters]?: Filters[Key][number];
};

export type ParsedPageQuery<
  Sort extends string,
  Filters extends Record<string, readonly string[]> = {},
> = {
  q?: string;
  page: number;
  pageSize: number;
  sort?: Sort;
  dir: "asc" | "desc";
} & FilterValues<Filters>;

function inList<const Values extends readonly string[]>(
  value: string | undefined,
  values: Values
): value is Values[number] {
  return value !== undefined && values.some((item) => item === value);
}

export function parsePageQuery<
  const Sorts extends readonly string[],
  const Filters extends Record<string, readonly string[]> = {},
>(
  c: QuerySource,
  options: { sorts: Sorts; filters?: Filters }
): ParsedPageQuery<Sorts[number], Filters> | null {
  const pageSizeRaw = c.req.query("pageSize");
  if (!pageSizeRaw) return null;

  const page = Math.max(0, Number(c.req.query("page") ?? 0) || 0);
  const pageSize = Math.min(200, Math.max(1, Number(pageSizeRaw) || 50));
  const sortRaw = c.req.query("sort");
  const q = c.req.query("q")?.trim() || undefined;
  const result: Record<string, unknown> = {
    q,
    page,
    pageSize,
    sort: inList(sortRaw, options.sorts) ? sortRaw : undefined,
    dir: c.req.query("dir") === "asc" ? "asc" : "desc",
  };

  for (const [name, values] of Object.entries(options.filters ?? {})) {
    const value = c.req.query(name);
    result[name] = inList(value, values) ? value : undefined;
  }

  return result as ParsedPageQuery<Sorts[number], Filters>;
}
