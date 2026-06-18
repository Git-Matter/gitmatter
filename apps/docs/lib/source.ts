import { loader } from "fumadocs-core/source";
import { docs } from "@/.source/server";

// Content source for the docs app. baseUrl is "/" — Next's basePath (/docs in
// next.config) prefixes routes and links, so fumadocs builds page URLs relative
// to the app root and Next adds the /docs prefix at render time.
export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
});
