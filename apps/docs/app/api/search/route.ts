import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

// Powers the docs search box (fumadocs RootProvider default search).
export const { GET } = createFromSource(source);
