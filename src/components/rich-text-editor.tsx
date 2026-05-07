"use client";

import { useEditor, EditorContent, type Content } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useRef, useState } from "react";

type Props = {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  aiEndpoint?: string;
};

// Minimal Markdown -> HTML conversion for AI-drafted briefs.
// Handles headings (##, ###), bullet/numbered lists, bold, italic, and paragraphs.
//
// SL-12: escape HTML-significant characters BEFORE the regex transforms.
// Without this, AI-drafted text containing `<img onerror=...>` would be
// inserted into the editor verbatim. tiptap's StarterKit + ProseMirror
// schema sanitize most of it today, but custom marks / future extensions
// could blow this open. Defense in depth at the input layer is cheaper
// than chasing every consumer downstream.
function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  const escHtml = (s: string) =>
    s.replace(/[&<>"']/g, (c) =>
      c === "&"
        ? "&amp;"
        : c === "<"
        ? "&lt;"
        : c === ">"
        ? "&gt;"
        : c === '"'
        ? "&quot;"
        : "&#39;",
    );

  const inline = (s: string) =>
    escHtml(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)([^*]+?)\*/g, "$1<em>$2</em>");

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeLists();
      continue;
    }
    const h3 = line.match(/^###\s+(.*)$/);
    if (h3) {
      closeLists();
      html.push(`<h3>${inline(h3[1])}</h3>`);
      continue;
    }
    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      closeLists();
      html.push(`<h2>${inline(h2[1])}</h2>`);
      continue;
    }
    const h1 = line.match(/^#\s+(.*)$/);
    if (h1) {
      closeLists();
      html.push(`<h1>${inline(h1[1])}</h1>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        html.push("<ol>");
        inOl = true;
      }
      html.push(`<li>${inline(ordered[1])}</li>`);
      continue;
    }
    closeLists();
    html.push(`<p>${inline(line)}</p>`);
  }
  closeLists();
  return html.join("");
}

// F-63: known node types our StarterKit ships. Anything outside this set
// (e.g. content saved by an older build that loaded extra extensions, or a
// hand-edited JSON blob) gets stripped before tiptap sees it. Without this
// guard, tiptap throws a RangeError ("Unknown node type") and the entire
// editor fails to mount, taking the surrounding form down with it.
const KNOWN_NODE_TYPES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
]);
const KNOWN_MARK_TYPES = new Set(["bold", "italic", "strike", "code"]);

type TiptapNode = {
  type?: string;
  content?: TiptapNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
};

// Recursively walk a tiptap doc and drop any node/mark whose type isn't in
// our known set. Returns null when the node itself is unknown so the parent
// can splice it out.
function sanitiseNode(node: TiptapNode): TiptapNode | null {
  if (!node || typeof node !== "object") return null;
  if (!node.type || !KNOWN_NODE_TYPES.has(node.type)) return null;
  const out: TiptapNode = { type: node.type };
  if (node.attrs) out.attrs = node.attrs;
  if (typeof node.text === "string") out.text = node.text;
  if (node.marks) {
    out.marks = node.marks.filter((m) => m && KNOWN_MARK_TYPES.has(m.type));
  }
  if (Array.isArray(node.content)) {
    out.content = node.content
      .map(sanitiseNode)
      .filter((n): n is TiptapNode => n !== null);
  }
  return out;
}

// F-63: parse the saved JSON content defensively. The string can be:
//   - undefined / "" → editor starts empty
//   - valid tiptap JSON → sanitise and use
//   - malformed JSON → fall back to a paragraph carrying the raw text
//   - valid JSON but containing unknown node types → strip the unknowns
function parseEditorContent(raw: string): Content {
  if (!raw) return null;
  const fallback: Content = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: raw }] }],
  };
  try {
    const parsed = JSON.parse(raw) as TiptapNode;
    const sanitised = sanitiseNode(parsed);
    if (sanitised) return sanitised as Content;
    // Parsed JSON but the root wasn't a known doc — show as plain paragraph.
    return fallback;
  } catch {
    // Not JSON at all — treat as plain text so users still see their content
    // instead of an empty editor.
    return fallback;
  }
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = "Start writing...",
  aiEndpoint,
}: Props) {
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [drafting, setDrafting] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content: parseEditorContent(content),
    onUpdate: ({ editor }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onChange(JSON.stringify(editor.getJSON()));
      }, 500);
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none min-h-[300px] focus:outline-none p-4",
      },
    },
  });

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Toolbar */}
      {editor && (
        <div className="flex items-center gap-1 p-2 border-b bg-muted/30 flex-wrap">
          <ToolbarButton
            active={editor.isActive("heading", { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            H1
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            H3
          </ToolbarButton>
          <span className="w-px h-5 bg-border mx-1" />
          <ToolbarButton
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            B
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            I
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            S
          </ToolbarButton>
          <span className="w-px h-5 bg-border mx-1" />
          <ToolbarButton
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            List
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1.
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            Code
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            Quote
          </ToolbarButton>
          {aiEndpoint && (
            <>
              <span className="w-px h-5 bg-border mx-1" />
              <button
                type="button"
                disabled={drafting}
                onClick={async () => {
                  if (!editor || drafting) return;
                  setDrafting(true);
                  try {
                    const res = await fetch(aiEndpoint, { method: "POST" });
                    if (!res.ok) return;
                    const data = (await res.json()) as { content?: string };
                    if (typeof data.content === "string" && data.content.trim()) {
                      const html = markdownToHtml(data.content);
                      editor.chain().focus().insertContent(html).run();
                    }
                  } finally {
                    setDrafting(false);
                  }
                }}
                className="ml-auto px-2 py-1 text-xs font-medium rounded transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                <span className="mr-1" aria-hidden>{"\u2728"}</span>
                {drafting ? "Drafting..." : "Draft with AI"}
              </button>
            </>
          )}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  // F-44: real button affordance — visible idle background, border, and
  // hover state so the toolbar reads as buttons rather than plain text.
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-7 h-7 px-2 text-xs font-semibold rounded-md border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-background text-foreground border-border hover:bg-accent hover:text-accent-foreground hover:border-accent-foreground/20"
      }`}
    >
      {children}
    </button>
  );
}
