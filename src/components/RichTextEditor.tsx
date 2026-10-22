"use client";

import { forwardRef, useImperativeHandle } from "react";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

export type RichTextEditorHandle = {
  insertAtCursor: (text: string) => void;
};

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  bootKey?: number;
};

export const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(
  function RichTextEditor(
    { value, onChange, placeholder = "Write your message…", bootKey = 0 },
    ref,
  ) {
    const editor = useEditor(
      {
        extensions: [
          StarterKit.configure({
            heading: { levels: [2, 3] },
            link: {
              openOnClick: false,
              autolink: true,
              defaultProtocol: "https",
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
              "tiptap-editor prose-editor min-h-[200px] max-w-none px-3.5 py-3.5 text-sm leading-relaxed text-[var(--color-ink)] focus:outline-none sm:min-h-[240px]",
          },
        },
        onUpdate: ({ editor: ed }) => {
          onChange(ed.getHTML());
        },
      },
      [bootKey],
    );

    useImperativeHandle(
      ref,
      () => ({
        insertAtCursor: (text: string) => {
          if (!editor || editor.isDestroyed) return;
          editor.chain().focus().insertContent(text).run();
        },
      }),
      [editor],
    );

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
      return <div className="min-h-[280px] animate-pulse rounded-[0.85rem] bg-[#eef2f6]" />;
    }

    return (
      <div className="rte-shell">
        <div className="rte-toolbar">
          <ToolbarButton
            label="B"
            title="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            label="I"
            title="Italic"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            label="U"
            title="Underline"
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
          <ToolbarButton label="Link" title="Link" onClick={setLink} />
          <span className="rte-divider" aria-hidden />
          <ToolbarButton
            label="H2"
            title="Heading"
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          />
          <ToolbarButton
            label="List"
            title="Bullet list"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            label="1."
            title="Numbered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <ToolbarButton
            label="Quote"
            title="Quote"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
          <span className="rte-divider" aria-hidden />
          <ToolbarButton
            label="Left"
            title="Align left"
            active={editor.isActive({ textAlign: "left" })}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
          />
          <ToolbarButton
            label="Center"
            title="Align center"
            active={editor.isActive({ textAlign: "center" })}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
          />
          <ToolbarButton
            label="Undo"
            title="Undo"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          />
        </div>
        <EditorContent editor={editor} />
      </div>
    );
  },
);

RichTextEditor.displayName = "RichTextEditor";

function ToolbarButton({
  label,
  active,
  disabled,
  title,
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
      title={title ?? label}
      disabled={disabled}
      data-active={active ? "true" : "false"}
      onClick={onClick}
      className="rte-btn"
    >
      {label}
    </button>
  );
}
