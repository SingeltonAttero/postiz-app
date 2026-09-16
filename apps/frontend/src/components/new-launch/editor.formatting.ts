import { Node, mergeAttributes } from '@tiptap/react';

export const PostBlockquote = Node.create({
  name: 'blockquote',
  content: 'block+',
  group: 'block',
  defining: true,
  parseHTML: () => [{ tag: 'blockquote' }],
  renderHTML({ HTMLAttributes }) {
    return [
      'blockquote',
      mergeAttributes(HTMLAttributes, {
        style:
          'border-left:3px solid #82b540;background:rgba(130,181,64,.10);padding:8px 12px;margin:12px 0;border-radius:4px',
      }),
      0,
    ];
  },
  addKeyboardShortcuts() {
    return { 'Mod-Shift-b': () => this.editor.commands.toggleWrap(this.name) };
  },
});

export const PostHardBreak = Node.create({
  name: 'hardBreak',
  group: 'inline',
  inline: true,
  selectable: false,
  parseHTML: () => [{ tag: 'br' }],
  renderHTML: () => ['br'],
  renderText: () => '\n',
  addKeyboardShortcuts() {
    return {
      'Shift-Enter': () =>
        this.editor.commands.insertContent({ type: this.name }),
    };
  },
});
