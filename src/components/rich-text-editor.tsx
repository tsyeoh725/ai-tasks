"use client";

import { useEditor, EditorContent } from "@tiptap/react";
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
    content: content ? JSON.parse(content) : undefined,
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      {children}
    </button>
  );
}
