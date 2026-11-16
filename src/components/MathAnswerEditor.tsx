'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import Mathematics from '@tiptap/extension-mathematics';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Eraser,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { MonoLabel } from '@/components/ui/telemetry';
import { MarkdownContent } from '@/components/MarkdownContent';
import { buttonStyles } from '@/components/ui/button';
import { answerToEditorHtml, insertSnippet, LATEX_SNIPPETS, type LatexSnippet } from '@/lib/answerEditor';
import { renderMath } from '@/lib/richText';

type MathAnswerEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** Minimum height, in lines of text. */
  rows?: number;
  /** Shows the rendered answer only — for reviewing a submitted attempt. */
  disabled?: boolean;
  placeholder?: string;
  /** `null` hides the label (the caller already shows one). */
  label?: string | null;
  /** Amber border: the text needs checking (a transcription the reader was unsure of). */
  warning?: boolean;
  className?: string;
};

// Stored inside the answer's HTML, so these are literal colours rather than theme tokens, picked
// to read on both the light and dark surface. Highlights are translucent for the same reason.
const TEXT_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Grey', value: '#94a3b8' },
];
const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: 'rgba(250, 204, 21, 0.45)' },
  { name: 'Green', value: 'rgba(34, 197, 94, 0.35)' },
  { name: 'Blue', value: 'rgba(59, 130, 246, 0.35)' },
  { name: 'Pink', value: 'rgba(236, 72, 153, 0.35)' },
  { name: 'Orange', value: 'rgba(249, 115, 22, 0.4)' },
];
const ALIGNMENTS = [
  { value: 'left', label: 'Align left', icon: AlignLeft },
  { value: 'center', label: 'Centre', icon: AlignCenter },
  { value: 'right', label: 'Align right', icon: AlignRight },
  { value: 'justify', label: 'Justify', icon: AlignJustify },
] as const;

type Menu = 'color' | 'highlight' | 'clear' | 'align' | null;
/** The fx panel: closed, inserting a new formula, or editing the one at `pos`. */
type LatexPanel = { open: false } | { open: true; latex: string; pos: number | null };

/**
 * A typed answer, as a small word-processor: formatting, lists and inline maths that render as
 * you type. fx expands a LaTeX panel to write or edit a formula; clicking a formula reopens it.
 *
 * The value is the editor's HTML ('' when empty). The marker never sees it as HTML — mark-answers
 * runs it through `answerToText`, which keeps bold, lists, sub/superscripts and the LaTeX, and
 * drops colour, highlight and alignment. Plain text (a scan transcript, an older answer) is
 * loaded with each `\( … \)` turned into a maths node.
 */
export function MathAnswerEditor(props: MathAnswerEditorProps) {
  const { disabled = false, label = 'Your answer', value, className = '' } = props;
  // Review mode renders the answer without creating an editor per question.
  if (!disabled) return <EditableAnswer {...props} />;
  return (
    <div className={className}>
      {label ? <MonoLabel className="mb-1">{label}</MonoLabel> : null}
      <MarkdownContent
        className="rounded-field border border-subtle bg-surface-sunken px-3.5 py-2 text-body text-content"
        content={value.trim() ? value : 'No answer entered.'}
      />
    </div>
  );
}

function EditableAnswer({
  value,
  onChange,
  rows = 4,
  placeholder = 'Write your answer…',
  label = 'Your answer',
  warning = false,
  className = '',
}: MathAnswerEditorProps) {
  const [menu, setMenu] = useState<Menu>(null);
  const [panel, setPanel] = useState<LatexPanel>({ open: false });
  const [textColor, setTextColor] = useState(TEXT_COLORS[0].value);
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0].value);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const extensions = useMemo(
    () => [
      StarterKit.configure({ heading: false, codeBlock: false, code: false, blockquote: false, horizontalRule: false, link: false }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      TextAlign.configure({ types: ['paragraph'] }),
      Mathematics.configure({
        // Clicking a formula reopens the fx panel to edit it.
        inlineOptions: { onClick: (node, pos) => setPanel({ open: true, latex: String(node.attrs.latex ?? ''), pos }) },
        blockOptions: { onClick: (node, pos) => setPanel({ open: true, latex: String(node.attrs.latex ?? ''), pos }) },
        katexOptions: { throwOnError: false, strict: 'ignore' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    [placeholder],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      content: answerToEditorHtml(value),
      editorProps: {
        attributes: {
          class: 'answer-editor-content markdown-content px-3.5 py-2 text-body text-content outline-none',
          style: `min-height: ${rows * 1.6 + 1}rem`,
          'aria-label': label ?? 'Answer',
        },
      },
      onUpdate: ({ editor: current }) => {
        const next = current.isEmpty ? '' : current.getHTML();
        lastEmitted.current = next;
        onChangeRef.current(next);
      },
    },
    [extensions],
  );

  // A value set from outside (a reset, a transcript arriving) replaces the content.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(answerToEditorHtml(value), { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !toolbarRef.current?.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);

  return (
    <div className={className}>
      {label ? <MonoLabel className="mb-1">{label}</MonoLabel> : null}
      <div className={`answer-editor rounded-field border bg-surface focus-within:border-accent ${warning ? 'border-warning' : 'border-subtle'}`}>
        <Toolbar
          editor={editor}
          toolbarRef={toolbarRef}
          menu={menu}
          setMenu={setMenu}
          textColor={textColor}
          setTextColor={setTextColor}
          highlightColor={highlightColor}
          setHighlightColor={setHighlightColor}
          latexOpen={panel.open}
          toggleLatex={() => setPanel(panel.open ? { open: false } : { open: true, latex: '', pos: null })}
        />
        {panel.open && editor ? (
          <LatexPanel key={panel.pos ?? 'new'} editor={editor} panel={panel} close={() => setPanel({ open: false })} />
        ) : null}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// ─── Toolbar ───────────────────────────────────────────────────────────────────────────

const toolClass = (active = false) =>
  buttonStyles({
    variant: 'plain',
    size: 'none',
    className: `h-8 min-w-8 px-1.5 rounded-control ${active ? 'bg-accent-muted text-accent' : 'text-content-muted hover:bg-surface-sunken hover:text-content'}`,
  });

function ToolButton({ title, active, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active === undefined ? undefined : active}
      // Keep the editor's selection: a click would otherwise blur it first.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={toolClass(active)}
    >
      {children}
    </button>
  );
}

function MenuCaret({ title, open, onClick }: { title: string; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-expanded={open}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={buttonStyles({
        variant: 'plain',
        size: 'none',
        className: `-ml-1 h-8 w-4 rounded-control ${open ? 'text-content' : 'text-content-subtle hover:bg-surface-sunken hover:text-content'}`,
      })}
    >
      <ChevronDown className="h-3 w-3" />
    </button>
  );
}

function Popover({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      role="menu"
      className={`absolute left-0 top-full z-30 mt-1 rounded-field border border-subtle bg-surface p-1.5 shadow-raised ${wide ? 'w-48' : 'w-max'}`}
    >
      {children}
    </div>
  );
}

function Swatches({ colors, onPick, none }: { colors: { name: string; value: string }[]; onPick: (value: string | null) => void; none: string }) {
  return (
    <>
      <div className="grid grid-cols-[repeat(4,1.5rem)] gap-1.5">
        {colors.map((color) => (
          <button
            key={color.value}
            type="button"
            role="menuitem"
            title={color.name}
            aria-label={color.name}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(color.value)}
            className="h-6 w-6 rounded-full border border-subtle transition hover:scale-110"
            style={{ background: color.value }}
          />
        ))}
      </div>
      <button
        type="button"
        role="menuitem"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onPick(null)}
        className="mt-1.5 w-full rounded-control px-2 py-1 text-left text-xs text-content-muted hover:bg-surface-sunken hover:text-content"
      >
        {none}
      </button>
    </>
  );
}

function Toolbar({
  editor,
  toolbarRef,
  menu,
  setMenu,
  textColor,
  setTextColor,
  highlightColor,
  setHighlightColor,
  latexOpen,
  toggleLatex,
}: {
  editor: Editor | null;
  toolbarRef: React.RefObject<HTMLDivElement | null>;
  menu: Menu;
  setMenu: (menu: Menu) => void;
  textColor: string;
  setTextColor: (value: string) => void;
  highlightColor: string;
  setHighlightColor: (value: string) => void;
  latexOpen: boolean;
  toggleLatex: () => void;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            superscript: e.isActive('superscript'),
            subscript: e.isActive('subscript'),
            bulletList: e.isActive('bulletList'),
            orderedList: e.isActive('orderedList'),
            align: ALIGNMENTS.find((a) => e.isActive({ textAlign: a.value }))?.value ?? 'left',
          }
        : null,
  });

  const run = (command: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => {
    if (editor) command(editor.chain().focus()).run();
  };
  const toggleMenu = (name: Exclude<Menu, null>) => setMenu(menu === name ? null : name);
  const AlignIcon = ALIGNMENTS.find((a) => a.value === state?.align)?.icon ?? AlignLeft;

  return (
    <div ref={toolbarRef} role="toolbar" aria-label="Answer formatting" className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-subtle p-1">
      <div className="flex items-center">
        <ToolButton title="Bold (Ctrl+B)" active={state?.bold} onClick={() => run((c) => c.toggleBold())}>
          <Bold className="h-4 w-4" strokeWidth={2.5} />
        </ToolButton>
        <ToolButton title="Italic (Ctrl+I)" active={state?.italic} onClick={() => run((c) => c.toggleItalic())}>
          <Italic className="h-4 w-4" />
        </ToolButton>
        <ToolButton title="Underline (Ctrl+U)" active={state?.underline} onClick={() => run((c) => c.toggleUnderline())}>
          <UnderlineIcon className="h-4 w-4" />
        </ToolButton>
      </div>

      <div className="flex items-center">
        <ToolButton title="Superscript" active={state?.superscript} onClick={() => run((c) => c.unsetSubscript().toggleSuperscript())}>
          <SuperscriptIcon className="h-4 w-4" />
        </ToolButton>
        <ToolButton title="Subscript" active={state?.subscript} onClick={() => run((c) => c.unsetSuperscript().toggleSubscript())}>
          <SubscriptIcon className="h-4 w-4" />
        </ToolButton>
      </div>

      <div className="flex items-center">
        <div className="relative flex items-center">
          <ToolButton title="Font colour" onClick={() => run((c) => c.setColor(textColor))}>
            <span className="flex flex-col items-center leading-none">
              <span className="text-[14px] font-semibold">A</span>
              <span className="mt-0.5 h-[3px] w-4 rounded-sm" style={{ background: textColor }} />
            </span>
          </ToolButton>
          <MenuCaret title="Choose font colour" open={menu === 'color'} onClick={() => toggleMenu('color')} />
          {menu === 'color' ? (
            <Popover>
              <Swatches
                colors={TEXT_COLORS}
                none="Automatic"
                onPick={(color) => {
                  if (color) setTextColor(color);
                  run((c) => (color ? c.setColor(color) : c.unsetColor()));
                  setMenu(null);
                }}
              />
            </Popover>
          ) : null}
        </div>

        <div className="relative flex items-center">
          <ToolButton title="Highlight" onClick={() => run((c) => c.toggleHighlight({ color: highlightColor }))}>
            <span className="flex flex-col items-center leading-none">
              <Highlighter className="h-3.5 w-3.5" />
              <span className="mt-0.5 h-[3px] w-4 rounded-sm" style={{ background: highlightColor }} />
            </span>
          </ToolButton>
          <MenuCaret title="Choose highlight colour" open={menu === 'highlight'} onClick={() => toggleMenu('highlight')} />
          {menu === 'highlight' ? (
            <Popover>
              <Swatches
                colors={HIGHLIGHT_COLORS}
                none="No highlight"
                onPick={(color) => {
                  if (color) setHighlightColor(color);
                  run((c) => (color ? c.setHighlight({ color }) : c.unsetHighlight()));
                  setMenu(null);
                }}
              />
            </Popover>
          ) : null}
        </div>

        <div className="relative flex items-center">
          <ToolButton title="Clear formatting" onClick={() => run((c) => c.unsetAllMarks().clearNodes().unsetTextAlign())}>
            <Eraser className="h-4 w-4" />
          </ToolButton>
          <MenuCaret title="Clear options" open={menu === 'clear'} onClick={() => toggleMenu('clear')} />
          {menu === 'clear' ? (
            <Popover wide>
              {[
                { label: 'Clear text formatting', apply: (c: ReturnType<Editor['chain']>) => c.unsetAllMarks() },
                { label: 'Clear all formatting', apply: (c: ReturnType<Editor['chain']>) => c.unsetAllMarks().clearNodes().unsetTextAlign() },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    run(item.apply);
                    setMenu(null);
                  }}
                  className="block w-full rounded-control px-2 py-1.5 text-left text-sm text-content-muted hover:bg-surface-sunken hover:text-content"
                >
                  {item.label}
                </button>
              ))}
            </Popover>
          ) : null}
        </div>
      </div>

      <div className="flex items-center">
        <ToolButton title="Bulleted list" active={state?.bulletList} onClick={() => run((c) => c.toggleBulletList())}>
          <List className="h-4 w-4" />
        </ToolButton>
        <ToolButton title="Numbered list" active={state?.orderedList} onClick={() => run((c) => c.toggleOrderedList())}>
          <ListOrdered className="h-4 w-4" />
        </ToolButton>
        <div className="relative">
          <ToolButton title="Alignment" onClick={() => toggleMenu('align')}>
            <AlignIcon className="h-4 w-4" />
          </ToolButton>
          {menu === 'align' ? (
            <Popover wide>
              {ALIGNMENTS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="menuitem"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    run((c) => c.setTextAlign(value));
                    setMenu(null);
                  }}
                  className={`flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm hover:bg-surface-sunken hover:text-content ${state?.align === value ? 'text-accent' : 'text-content-muted'}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </Popover>
          ) : null}
        </div>
      </div>

      <div className="flex items-center">
        <ToolButton title="Equation (LaTeX)" active={latexOpen} onClick={toggleLatex}>
          <span className="font-serif text-[15px] italic leading-none">
            f<span className="text-[12px]">x</span>
          </span>
        </ToolButton>
      </div>
    </div>
  );
}

// ─── fx: the LaTeX panel ───────────────────────────────────────────────────────────────

function LatexPanel({ editor, panel, close }: { editor: Editor; panel: Extract<LatexPanel, { open: true }>; close: () => void }) {
  const [latex, setLatex] = useState(panel.latex);
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = panel.pos !== null;
  const preview = useMemo(() => (latex.trim() ? renderMath(latex, false) : ''), [latex]);

  useEffect(() => inputRef.current?.focus(), []);

  const addSnippet = (snippet: LatexSnippet) => {
    const input = inputRef.current;
    const result = insertSnippet(latex, input?.selectionStart ?? latex.length, input?.selectionEnd ?? latex.length, snippet);
    setLatex(result.value);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const commit = () => {
    const tex = latex.trim();
    const chain = editor.chain().focus();
    if (editing && panel.pos !== null) {
      (tex ? chain.updateInlineMath({ latex: tex, pos: panel.pos }) : chain.deleteInlineMath({ pos: panel.pos })).run();
    } else if (tex) {
      chain.insertInlineMath({ latex: tex }).insertContent(' ').run();
    }
    close();
  };

  return (
    <div className="space-y-2 border-b border-subtle bg-surface-sunken p-2">
      <div className="flex flex-wrap gap-0.5" role="group" aria-label="Insert into equation">
        {LATEX_SNIPPETS.map((snippet) => (
          <button
            key={snippet.id}
            type="button"
            title={snippet.title}
            aria-label={snippet.title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => addSnippet(snippet)}
            className={toolClass()}
          >
            <span className="font-serif text-base font-normal">{snippet.label}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          value={latex}
          onChange={(event) => setLatex(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              close();
              editor.commands.focus();
            }
          }}
          placeholder="LaTeX, e.g. x^{\frac{3}{2}} \times x^{\frac{1}{3}}"
          aria-label="Equation in LaTeX"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-control border border-subtle bg-surface px-2.5 py-1.5 font-mono text-sm text-content outline-none focus:border-accent"
        />
        <button type="button" onClick={commit} className={buttonStyles({ variant: 'primary', size: 'sm' })}>
          {editing ? (latex.trim() ? 'Update' : 'Remove') : 'Insert'}
        </button>
        <button type="button" onClick={close} className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
          Cancel
        </button>
      </div>
      {preview ? (
        <div className="flex min-h-10 items-center rounded-control bg-surface px-3 py-1.5 text-content" dangerouslySetInnerHTML={{ __html: preview }} />
      ) : null}
    </div>
  );
}
