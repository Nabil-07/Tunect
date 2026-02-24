// src/components/RichTextEditor.tsx
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Image as ImageIcon, Loader2, Pilcrow, Undo, Redo } from 'lucide-react';
import api from '../lib/apiClient';

/* ------------------------------------------------------------------ */
/* Toolbar Button                                                      */
/* ------------------------------------------------------------------ */

function ToolbarBtn({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-lg transition-colors ${
        active
          ? 'bg-ocean-100 text-ocean-800'
          : 'text-slate-600 hover:bg-slate-100'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbar                                                             */
/* ------------------------------------------------------------------ */

function Toolbar({ editor, onImageUpload }: { editor: Editor | null; onImageUpload: () => void }) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-slate-50 px-2 py-1.5 rounded-t-lg">
      <ToolbarBtn
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold (Ctrl+B)"
      >
        <Bold className="h-4 w-4" />
      </ToolbarBtn>

      <ToolbarBtn
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic (Ctrl+I)"
      >
        <Italic className="h-4 w-4" />
      </ToolbarBtn>

      <ToolbarBtn
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline (Ctrl+U)"
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarBtn>

      <div className="mx-1 h-5 w-px bg-slate-300" />

      <ToolbarBtn
        active={editor.isActive('paragraph')}
        onClick={() => editor.chain().focus().setParagraph().run()}
        title="Paragraph"
      >
        <Pilcrow className="h-4 w-4" />
      </ToolbarBtn>

      <ToolbarBtn
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading 2"
      >
        <span className="text-xs font-bold">H2</span>
      </ToolbarBtn>

      <ToolbarBtn
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Heading 3"
      >
        <span className="text-xs font-bold">H3</span>
      </ToolbarBtn>

      <div className="mx-1 h-5 w-px bg-slate-300" />

      <ToolbarBtn
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet List"
      >
        <List className="h-4 w-4" />
      </ToolbarBtn>

      <ToolbarBtn
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered List"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarBtn>

      <div className="mx-1 h-5 w-px bg-slate-300" />

      <ToolbarBtn onClick={onImageUpload} title="Insert Image">
        <ImageIcon className="h-4 w-4" />
      </ToolbarBtn>

      <div className="mx-1 h-5 w-px bg-slate-300" />

      <ToolbarBtn
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (Ctrl+Z)"
      >
        <Undo className="h-4 w-4" />
      </ToolbarBtn>

      <ToolbarBtn
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo className="h-4 w-4" />
      </ToolbarBtn>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Upload helper – direct upload via backend (avoids S3 CORS)         */
/* ------------------------------------------------------------------ */

async function uploadImageToS3(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('useCase', 'blogs');
  const { data } = await api.post<{ key: string; downloadUrl: string }>('/uploads/direct', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.downloadUrl;
}

/* ------------------------------------------------------------------ */
/* Main Component                                                      */
/* ------------------------------------------------------------------ */

export default function RichTextEditor({
  content,
  onChange,
  placeholder = 'Write your blog content here…',
}: {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        bulletList: {},
        orderedList: {},
      }),
      Underline,
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-slate max-w-none min-h-[200px] px-4 py-3 focus:outline-none',
      },
    },
  });

  // Sync external content changes (e.g. when editing a post)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  const handleImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editor) return;

      setUploading(true);
      try {
        const url = await uploadImageToS3(file);
        editor.chain().focus().setImage({ src: url, alt: file.name }).run();
      } catch (err) {
        console.error('Image upload failed:', err);
        alert('Failed to upload image. Please try again.');
      } finally {
        setUploading(false);
        // Reset input so the same file can be selected again
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [editor],
  );

  return (
    <div className="rounded-lg border border-slate-300 overflow-hidden bg-white">
      <Toolbar editor={editor} onImageUpload={handleImageUpload} />

      {uploading && (
        <div className="flex items-center gap-2 bg-blue-50 border-b px-3 py-1.5 text-xs text-blue-700">
          <Loader2 className="h-3 w-3 animate-spin" /> Uploading image…
        </div>
      )}

      <EditorContent editor={editor} />

      {/* Hidden file input for image uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
