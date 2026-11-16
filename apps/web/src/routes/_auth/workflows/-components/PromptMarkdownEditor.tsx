import { EditorContent, type Editor, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { useEffect, useRef } from "react";
import { Bold, Heading1, Heading2, Heading3, Italic, List, ListOrdered } from "lucide-react";
import { cn } from "@/lib/util/utils";

interface Props {
  value: string;
  onChange?: (markdown: string) => void;
  readOnly?: boolean;
}

type MarkdownStorage = {
  markdown: {
    getMarkdown: () => string;
  };
};

type ToolbarItem = {
  title: string;
  active: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
  icon: React.ComponentType<{ className?: string }>;
};

const TOOLBAR_GROUPS: ToolbarItem[][] = [
  [
    {
      title: "Heading 1",
      active: (editor) => editor.isActive("heading", { level: 1 }),
      run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      icon: Heading1,
    },
    {
      title: "Heading 2",
      active: (editor) => editor.isActive("heading", { level: 2 }),
      run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      icon: Heading2,
    },
    {
      title: "Heading 3",
      active: (editor) => editor.isActive("heading", { level: 3 }),
      run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      icon: Heading3,
    },
  ],
  [
    {
      title: "Bold",
      active: (editor) => editor.isActive("bold"),
      run: (editor) => editor.chain().focus().toggleBold().run(),
      icon: Bold,
    },
    {
      title: "Italic",
      active: (editor) => editor.isActive("italic"),
      run: (editor) => editor.chain().focus().toggleItalic().run(),
      icon: Italic,
    },
  ],
  [
    {
      title: "Bullet list",
      active: (editor) => editor.isActive("bulletList"),
      run: (editor) => editor.chain().focus().toggleBulletList().run(),
      icon: List,
    },
    {
      title: "Numbered list",
      active: (editor) => editor.isActive("orderedList"),
      run: (editor) => editor.chain().focus().toggleOrderedList().run(),
      icon: ListOrdered,
    },
  ],
];

const PROMPT_EDITOR_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    codeBlock: false,
    code: false,
    blockquote: false,
    horizontalRule: false,
  }),
  Markdown.configure({
    html: false,
    transformCopiedText: true,
    transformPastedText: true,
  }),
];

export function PromptMarkdownEditor({ value, onChange, readOnly = false }: Props) {
  const lastEmittedRef = useRef(value);

  const editor = useEditor({
    extensions: PROMPT_EDITOR_EXTENSIONS,
    content: value,
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const markdown = getMarkdown(editor);
      lastEmittedRef.current = markdown;
      onChange?.(markdown);
    },
    editorProps: {
      attributes: {
        class: "workflow-editor-content",
        role: "textbox",
        "aria-label": "Workflow prompt",
        "aria-multiline": "true",
        "aria-readonly": String(readOnly),
      },
    },
  });

  // Sync external value (e.g. on load from API).
  useEffect(() => {
    syncEditorValue({ editor, value, lastEmittedRef });
  }, [value, editor]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-md border border-border bg-background">
      {!readOnly && editor ? <PromptToolbar editor={editor} /> : null}
      {readOnly ? <ReadOnlyHeader /> : null}
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();
}

function syncEditorValue({
  editor,
  value,
  lastEmittedRef,
}: {
  editor: Editor | null;
  value: string;
  lastEmittedRef: React.MutableRefObject<string>;
}) {
  if (!editor || editor.isDestroyed) return;
  if (value === lastEmittedRef.current) return;

  lastEmittedRef.current = value;
  editor.commands.setContent(value, { emitUpdate: false });
}

function PromptToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 border-b border-border bg-muted/40 px-2 py-1.5">
      {TOOLBAR_GROUPS.map((group, groupIndex) => (
        <ToolbarGroup key={groupIndex} editor={editor} items={group} showDivider={groupIndex > 0} />
      ))}
    </div>
  );
}

function ToolbarGroup({
  editor,
  items,
  showDivider,
}: {
  editor: Editor;
  items: ToolbarItem[];
  showDivider: boolean;
}) {
  return (
    <>
      {showDivider ? <ToolbarDivider /> : null}
      {items.map((item) => (
        <ToolbarButton
          key={item.title}
          title={item.title}
          active={item.active(editor)}
          onClick={() => item.run(editor)}
        >
          <item.icon className="h-4 w-4" />
        </ToolbarButton>
      ))}
    </>
  );
}

interface ToolbarButtonProps {
  onClick: () => void;
  active: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ active, children, onClick, title }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
      className={cn(
        "rounded p-1.5 transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-1 h-4 w-px shrink-0 bg-border" />;
}

function ReadOnlyHeader() {
  return (
    <div className="flex h-9 shrink-0 items-center bg-muted/40 px-5">
      <span className="text-xs font-medium text-muted-foreground">Read-only</span>
    </div>
  );
}
