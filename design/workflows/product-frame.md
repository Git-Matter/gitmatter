# Product frame and component anatomy

This revision applies [Harvey's documented system principles](https://www.harvey.ai/blog/rebuilding-harveys-design-system-from-the-ground-up)
to gitmatter's existing controls: shared semantics, consistent anatomy, composable states and
context-level cohesion. It is an implementation adaptation; no proprietary Figma library is copied.

- `AppFrame` owns the sidebar and one unboxed work surface. Production and demo previews use the
  same frame. Navigation width, chrome height and work gutter have named foundation tokens.
- `PageHeader` identifies the object with compact operational sans typography. `PageShell` keeps
  context above the scrolling work. Serif belongs to document reading and limited identity use.
- `Card` has two explicit roles: a rounded standalone surface, and a flat section in a continuous
  settings form. A category does not automatically require a new floating card.
- Settings use stable section navigation and aligned field groups. Mobile uses a labelled section
  selector. Both navigate the same URLs and retain visited panels and unfinished inputs.
- Review defaults to a document-by-question table, following Harvey's published Vault figure.
  Compact file objects, typed question headers, 44px cell controls and thin grid lines support scanning.
  The document column remains pinned during horizontal scrolling. A shared matter is shown above
  the table; mixed matters keep their own column. Source status describes captured/current version
  identity, never legal verification or approval. Counts inside findings mean source citations.
- Desktop cell inspection is a nonmodal 24rem side region within the table surface. Selecting
  another cell keeps the table available. Narrow screens use the existing modal inspector.
  Escape returns focus to the selected cell; a source preview returns to the same inspector.
- The explicit Document view retains the reading workbench. Both representations share one
  revision-keyed rationale/proposal store and one exit guard. Visited views stay mounted to retain
  reading position and local controls; the inactive view is hidden and inert. URL selection follows
  either representation. Completion is disclosed above the table and expanded in Document view;
  its content stays mounted so a prepared export request survives responsive changes.
  History starts collapsed unless the person saved a different preference.
- The matter workspace uses thin pane separators, contextual headers and a quiet empty instruction.
  Resizing, source selection, draft retention and current request scope remain functional.

Use shadcn's default derived radius scale: 8px fields, 10px dialogs and 14px cards. This supersedes
the earlier custom roundness preference. Inspect actual desktop/light/dark/mobile screens and
replay the affected interaction contracts; passing token checks alone is not visual acceptance.

The work canvas and review grid have no rounded outer frame. Only actual cards and overlays use
large surface radii. Decorative grid rules use `grid-line`, independently of interactive field
boundaries. Table overflow exposes previous/next-column controls; headers wrap instead of being
clipped to a single line. Generic breadcrumb, view switching, overlay and status behavior comes
from the shared shadcn Breadcrumb, Tabs, Sheet and Badge primitives.
