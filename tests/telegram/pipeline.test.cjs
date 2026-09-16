// Use Node's native ESM interop for isomorphic-dompurify's current jsdom.
require('ts-node').register({
  transpileOnly: true,
  moduleTypes: { '**/editor.formatting.ts': 'cjs' },
  compilerOptions: {
    module: 'commonjs',
    target: 'es2020',
    esModuleInterop: true,
  },
});
const { test, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true },
  document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
  Node: { value: dom.window.Node, configurable: true },
  getComputedStyle: {
    value: dom.window.getComputedStyle.bind(dom.window),
    configurable: true,
  },
});
const { Editor } = require('@tiptap/react');
const Document = require('@tiptap/extension-document').default;
const Paragraph = require('@tiptap/extension-paragraph').default;
const Text = require('@tiptap/extension-text').default;
const Bold = require('@tiptap/extension-bold').default;
const Link = require('@tiptap/extension-link').default;
const {
  PostBlockquote,
  PostHardBreak,
} = require('../../apps/frontend/src/components/new-launch/editor.formatting');
const {
  sanitizePostContent,
} = require('../../libraries/helpers/src/utils/sanitize.post.content');
const {
  stripHtmlValidation,
} = require('../../libraries/helpers/src/utils/strip.html.validation');
const {
  formatTelegramHtml,
} = require('../../libraries/nestjs-libraries/src/integrations/social/telegram.format');

const extensions = [
  Document,
  Paragraph,
  Text,
  Bold,
  Link,
  PostBlockquote,
  PostHardBreak,
];
const editors = [];
function editor(content) {
  const result = new Editor({
    element: document.createElement('div'),
    extensions,
    content,
  });
  editors.push(result);
  return result;
}
afterEach(() => editors.splice(0).forEach((item) => item.destroy()));
after(() => dom.window.close());

test('preserves editor → sanitizer → outgoing HTML → Telegram formatting', () => {
  const input =
    '<p>A<br>B</p><p>C</p><p></p><p>D</p><blockquote><p><strong>Quote</strong></p></blockquote><p><a href="https://example.com/?a=1&amp;b=2">Docs</a></p>';
  const result = formatTelegramHtml(
    stripHtmlValidation('html', sanitizePostContent(editor(input).getHTML()))
  );
  assert.ok(result.visible.includes('A\nB\n\nC\n\n\nD'));
  assert.ok(result.html.includes('<blockquote><b>Quote</b></blockquote>'));
  assert.ok(
    result.html.includes('<a href="https://example.com/?a=1&amp;b=2">Docs</a>')
  );
  assert.ok(result.blocks.some((block) => block.type === 'blockquote'));
});

test('does not reinterpret literal tags and ampersands as markup', () => {
  const input = '<p>&lt;widget&gt; &amp; &amp;lt;</p>';
  assert.equal(
    formatTelegramHtml(
      stripHtmlValidation('html', sanitizePostContent(editor(input).getHTML()))
    ).html,
    '&lt;widget&gt; &amp; &amp;lt;'
  );
});

test('still removes scripts, event handlers and unsafe URLs', () => {
  const clean = sanitizePostContent(
    '<p onclick="alert(1)">OK</p><script>alert(1)</script><blockquote>Quote</blockquote><a href="javascript:alert(1)">link</a>'
  );
  assert.doesNotMatch(clean, /script|onclick|javascript/);
  assert.ok(clean.includes('<blockquote>Quote</blockquote>'));
});

test('supports inserting quotes and hard breaks in the editable document', () => {
  const instance = editor('<p>Hello</p>');
  instance.commands.setTextSelection(3);
  assert.equal(instance.commands.toggleWrap('blockquote'), true);
  assert.equal(instance.commands.insertContent({ type: 'hardBreak' }), true);
  assert.ok(instance.getHTML().includes('<blockquote'));
  assert.ok(instance.getHTML().includes('He<br>llo'));
  instance.commands.toggleWrap('blockquote');
  assert.ok(!instance.getHTML().includes('blockquote'));
});
