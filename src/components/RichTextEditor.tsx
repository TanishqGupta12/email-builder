"use client";

import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write your message…",
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          HTMLAttributes: {
            class: "text-sky-400 underline underline-offset-2",
          },
        },
        underline: {},
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "tiptap-editor prose-editor min-h-[200px] max-w-none px-3 py-3 text-sm leading-relaxed text-slate-200 focus:outline-none sm:min-h-[260px]",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  if (!editor) {
    return (
      <div className="min-h-[300px] animate-pulse rounded-xl border border-blue-900/50 bg-slate-950/50" />
    );
  }

  return (
    <div className="max-w-full overflow-hidden rounded-xl border border-blue-900/50 bg-slate-950/70 shadow-inner shadow-black/20">
      <div className="flex flex-col gap-2 border-b border-blue-900/40 bg-blue-950/30 px-1 py-2 sm:px-2">
        <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          <div className="flex w-max min-w-0 flex-nowrap items-center gap-1 px-1 pb-0.5 sm:w-auto sm:flex-wrap sm:pb-0">
          <ToolbarButton
            title="Undo"
            label="Undo"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          />
          <ToolbarButton
            title="Redo"
            label="Redo"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          />
          <ToolbarDivider />
          <ToolbarButton
            title="Bold"
            label="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            title="Italic"
            label="Italic"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            title="Underline"
            label="Underline"
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
          <ToolbarButton
            title="Strikethrough"
            label="Strike"
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          />
          <ToolbarButton
            title="Inline code"
            label="Code"
            active={editor.isActive("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
          />
          <ToolbarButton title="Add link" label="Link" onClick={setLink} />
          <ToolbarDivider />
          <ToolbarButton
            title="Heading 2"
            label="H2"
            active={editor.isActive("heading", { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          />
          <ToolbarButton
            title="Heading 3"
            label="H3"
            active={editor.isActive("heading", { level: 3 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
          />
          <ToolbarButton
            title="Paragraph"
            label="Body"
            active={editor.isActive("paragraph")}
            onClick={() => editor.chain().focus().setParagraph().run()}
          />
          </div>
        </div>
        <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          <div className="flex w-max flex-nowrap items-center gap-1 px-1 pb-0.5 sm:w-auto sm:flex-wrap sm:pb-0">
          <ToolbarButton
            title="Bullet list"
            label="• List"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            title="Numbered list"
            label="1. List"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarButton
            title="Quote"
            label="Quote"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
          <ToolbarButton
            title="Code block"
            label="{ }"
            active={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          />
          <ToolbarButton
            title="Horizontal rule"
            label="—"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          />
          <ToolbarDivider />
          <ToolbarButton
            title="Align left"
            label="Left"
            active={editor.isActive({ textAlign: "left" })}
            onClick={() =>
              editor.chain().focus().setTextAlign("left").run()
            }
          />
          <ToolbarButton
            title="Align center"
            label="Center"
            active={editor.isActive({ textAlign: "center" })}
            onClick={() =>
              editor.chain().focus().setTextAlign("center").run()
            }
          />
          <ToolbarButton
            title="Align right"
            label="Right"
            active={editor.isActive({ textAlign: "right" })}
            onClick={() =>
              editor.chain().focus().setTextAlign("right").run()
            }
          />
          <ToolbarButton
            title="Justify"
            label="Justify"
            active={editor.isActive({ textAlign: "justify" })}
            onClick={() =>
              editor.chain().focus().setTextAlign("justify").run()
            }
          />
          </div>
        </div>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarDivider() {
  return (
    <span
      className="mx-0.5 inline-block h-5 w-px shrink-0 self-center bg-blue-800/80"
      aria-hidden
    />
  );
}

function ToolbarButton({
  label,
  active,
  disabled,
  title: titleAttr,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={titleAttr ?? label}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-10 shrink-0 rounded-lg px-2.5 py-2 text-[11px] font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0 sm:px-2 sm:py-1.5 sm:text-xs ${
        active
          ? "bg-blue-600 text-white shadow-md shadow-blue-950/50"
          : "text-slate-400 hover:bg-blue-950/80 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
}
