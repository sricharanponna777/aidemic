'use client';

/**
 * RichTextEditor — WYSIWYG implementation using Tiptap
 *
 * Dependencies to install:
 *   npm install @tiptap/react @tiptap/pm @tiptap/starter-kit \
 *               @tiptap/extension-underline @tiptap/extension-code-block \
 *               @tiptap/extension-placeholder @tiptap/extension-text-style \
 *               @tiptap/extension-color @tiptap/extension-highlight
 */

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import CodeBlock from '@tiptap/extension-code-block';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Code,
  List,
  ListOrdered,
  Braces,
  Minus,
  Pilcrow,
  Undo2,
  Redo2,
  Code2,
  Heading2,
  Heading3,
  Highlighter,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Cloze extension — renders {{c1::text}} spans visually
// ---------------------------------------------------------------------------
const ClozeExtension = Extension.create({
  name: 'cloze',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('cloze'),
        props: {
          decorations(state) {
            const { doc } = state;
            const decorations: Decoration[] = [];
            const pattern = /\{\{c(\d+)::([^}]+)\}\}/g;

            doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              let match: RegExpExecArray | null;
              pattern.lastIndex = 0;
              while ((match = pattern.exec(node.text)) !== null) {
                const from = pos + match.index;
                const to = from + match[0].length;
                decorations.push(
                  Decoration.inline(from, to, {
                    class: `cloze-deletion cloze-c${match[1]}`,
                    'data-cloze': match[1],
                  }),
                );
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});

// ---------------------------------------------------------------------------
// Toolbar button
// ---------------------------------------------------------------------------
interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault(); // Prevent editor losing focus
        onClick();
      }}
      className={[
        'inline-flex items-center justify-center rounded-md p-1.5 text-sm transition-all duration-100',
        'border',
        active
          ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-900/40 dark:text-indigo-300'
          : 'border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-100 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700',
        disabled ? 'cursor-not-allowed opacity-30' : 'cursor-pointer',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Divider
// ---------------------------------------------------------------------------
function Divider() {
  return <div className="mx-0.5 h-5 w-px self-center bg-slate-200 dark:bg-slate-700" />;
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------
function Toolbar({ editor }: { editor: Editor }) {
  const insertCloze = () => {
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      editor.chain().focus().insertContent('{{c1::}}').run();
    } else {
      const selectedText = editor.state.doc.textBetween(from, to);
      editor
        .chain()
        .focus()
        .deleteSelection()
        .insertContent(`{{c1::${selectedText}}}`)
        .run();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800/60">
      {/* History */}
      <ToolbarButton
        title="Undo"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Redo"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>

      <Divider />

      {/* Headings */}
      <ToolbarButton
        title="Heading 2"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Heading 3"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>

      <Divider />

      {/* Inline marks */}
      <ToolbarButton
        title="Bold"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Italic"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Underline"
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Highlight"
        active={editor.isActive('highlight')}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <Highlighter className="h-4 w-4" />
      </ToolbarButton>

      <Divider />

      {/* Code */}
      <ToolbarButton
        title="Inline code"
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Code block"
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code2 className="h-4 w-4" />
      </ToolbarButton>

      <Divider />

      {/* Lists */}
      <ToolbarButton
        title="Bullet list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Numbered list"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>

      <Divider />

      {/* Structural */}
      <ToolbarButton
        title="Paragraph"
        active={editor.isActive('paragraph')}
        onClick={() => editor.chain().focus().setParagraph().run()}
      >
        <Pilcrow className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Horizontal rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Minus className="h-4 w-4" />
      </ToolbarButton>

      <Divider />

      {/* Cloze */}
      <ToolbarButton title="Wrap in cloze {{c1::…}}" onClick={insertCloze}>
        <Braces className="h-4 w-4" />
        <span className="ml-1 text-[10px] font-bold tracking-tight">c1</span>
      </ToolbarButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Word / char counter
// ---------------------------------------------------------------------------
function Counter({ editor }: { editor: Editor }) {
  const text = editor.state.doc.textContent;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;

  return (
    <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-400 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-500">
      <span>{words} word{words !== 1 ? 's' : ''}</span>
      <span>·</span>
      <span>{chars} char{chars !== 1 ? 's' : ''}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------
export interface RichTextEditorProps {
  /** HTML string value */
  value: string;
  /** Called with updated HTML whenever the content changes */
  onChange: (html: string) => void;
  placeholder?: string;
  label?: string;
  minHeightClassName?: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start typing…',
  label,
  minHeightClassName = 'min-h-[180px]',
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Code block handled separately for future syntax highlighting
        codeBlock: false,
      }),
      Underline,
      CodeBlock,
      Highlight.configure({ multicolor: false }),
      TextStyle,
      Color,
      ClozeExtension,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: value,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: [
          'prose prose-sm max-w-none outline-none',
          'text-slate-900 dark:text-slate-100',
          'dark:prose-invert',
          minHeightClassName,
          'px-4 py-3',
        ].join(' '),
      },
    },
  });

  if (!editor) return null;

  return (
    <>
      {/* Scoped styles */}
      <style>{`
        /* Placeholder */
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #94a3b8;
          pointer-events: none;
          height: 0;
        }

        /* Cloze decorations */
        .cloze-deletion {
          display: inline-block;
          padding: 0 4px;
          border-radius: 4px;
          font-weight: 600;
          font-family: ui-monospace, monospace;
          font-size: 0.85em;
        }
        .cloze-c1 { background: #dbeafe; color: #1d4ed8; }
        .cloze-c2 { background: #dcfce7; color: #15803d; }
        .cloze-c3 { background: #fef9c3; color: #a16207; }
        .cloze-c4 { background: #fce7f3; color: #be185d; }
        .cloze-c5 { background: #ede9fe; color: #6d28d9; }

        @media (prefers-color-scheme: dark) {
          .cloze-c1 { background: #1e3a5f; color: #93c5fd; }
          .cloze-c2 { background: #14532d; color: #86efac; }
          .cloze-c3 { background: #422006; color: #fde68a; }
          .cloze-c4 { background: #4a044e; color: #f9a8d4; }
          .cloze-c5 { background: #2e1065; color: #c4b5fd; }
        }

        /* Code block */
        .ProseMirror pre {
          background: #0f172a;
          color: #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
          font-family: ui-monospace, monospace;
          font-size: 0.875em;
          overflow-x: auto;
        }

        /* Highlight */
        .ProseMirror mark {
          background: #fef08a;
          border-radius: 2px;
          padding: 0 2px;
        }
      `}</style>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
          {label && (
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {label}
            </p>
          )}
          <span className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400">
            WYSIWYG
          </span>
        </div>

        {/* Toolbar */}
        <Toolbar editor={editor} />

        {/* Editing surface */}
        <EditorContent editor={editor} />

        {/* Footer */}
        <Counter editor={editor} />
      </div>
    </>
  );
}