import { parseFragment } from 'parse5';

type Mark = 'bold' | 'underline' | 'italic' | 'strikethrough' | 'code';
type RichText =
  | string
  | { type: Mark | 'blockquote'; text: RichText[] }
  | { type: 'url'; text: RichText[]; url: string };
type RichBlock =
  | { type: 'paragraph'; text: RichText[] }
  | { type: 'blockquote'; blocks: RichBlock[] };

// Structural view of parse5's tree; no new parser dependency is needed.
type HtmlNode = {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: HtmlNode[];
  parentNode?: HtmlNode;
};

const marks: Record<string, Mark> = {
  strong: 'bold',
  b: 'bold',
  h1: 'bold',
  h2: 'bold',
  h3: 'bold',
  u: 'underline',
  em: 'italic',
  i: 'italic',
  s: 'strikethrough',
  del: 'strikethrough',
  code: 'code',
};
const allowed = new Set([
  'p',
  'div',
  'span',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'br',
  ...Object.keys(marks),
]);
const blocks = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function plainText(value: RichText | RichText[]): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(plainText).join('');
  return plainText(value.text);
}

function trimText(parts: RichText[]): RichText[] {
  const copy = parts.slice();
  while (typeof copy[0] === 'string' && !(copy[0] as string).trim())
    copy.shift();
  while (
    typeof copy[copy.length - 1] === 'string' &&
    !(copy[copy.length - 1] as string).trim()
  )
    copy.pop();
  if (typeof copy[0] === 'string') copy[0] = copy[0].trimStart();
  const last = copy.length - 1;
  if (typeof copy[last] === 'string')
    copy[last] = (copy[last] as string).trimEnd();
  return copy;
}

function toHtml(value: RichText | RichText[]): string {
  if (typeof value === 'string') return escapeHtml(value);
  if (Array.isArray(value)) return value.map(toHtml).join('');
  if (value.type === 'blockquote')
    return '<blockquote>' + toHtml(trimText(value.text)) + '</blockquote>';
  if (value.type === 'url')
    return (
      '<a href="' + escapeHtml(value.url) + '">' + toHtml(value.text) + '</a>'
    );
  const tag = {
    bold: 'b',
    underline: 'u',
    italic: 'i',
    strikethrough: 's',
    code: 'code',
  }[value.type];
  return '<' + tag + '>' + toHtml(value.text) + '</' + tag + '>';
}

function toBlocks(parts: RichText[]): RichBlock[] {
  const result: RichBlock[] = [];
  let paragraph: RichText[] = [];
  function flush() {
    if (plainText(paragraph).trim())
      result.push({ type: 'paragraph', text: paragraph });
    paragraph = [];
  }
  for (const part of parts) {
    if (typeof part !== 'string' && part.type === 'blockquote') {
      flush();
      result.push({
        type: 'blockquote',
        blocks: toBlocks(trimText(part.text)),
      });
    } else paragraph.push(part);
  }
  flush();
  return result;
}

export function formatTelegramHtml(source: string) {
  const document = parseFragment(source) as HtmlNode;
  function render(nodes: HtmlNode[], atRoot = false): RichText[] {
    const result: RichText[] = [];
    for (const node of nodes) {
      if (node.nodeName === '#text') {
        if (!atRoot || node.value.trim()) result.push(node.value);
        continue;
      }
      if (node.nodeName === '#comment') continue;
      const name = node.tagName;
      if (!allowed.has(name))
        throw new Error('Unsupported Telegram formatting tag: ' + name);
      if (name === 'br') {
        result.push('\n');
        continue;
      }
      // An empty editor paragraph adds one intentional blank line.
      if (
        name === 'p' &&
        !(node.childNodes || []).some((n) =>
          n.nodeName === '#text' ? n.value.trim() : n.tagName !== 'br'
        )
      ) {
        result.push('\n');
        continue;
      }
      const children = render(node.childNodes || []);
      if (name === 'a') {
        const url =
          node.attrs?.find((attr) => attr.name === 'href')?.value || '';
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          throw new Error('Invalid Telegram link');
        }
        if (
          !['https:', 'http:'].includes(parsed.protocol) ||
          parsed.username ||
          parsed.password
        ) {
          throw new Error('Unsupported Telegram link URL');
        }
        result.push({ type: 'url', text: children, url });
      } else if (name === 'blockquote') {
        result.push({ type: 'blockquote', text: children });
      } else if (marks[name]) {
        result.push({ type: marks[name], text: children });
      } else if (name === 'li') {
        const siblings =
          node.parentNode?.childNodes?.filter((n) => n.tagName === 'li') || [];
        result.push(
          node.parentNode?.tagName === 'ol'
            ? siblings.indexOf(node) + 1 + '. '
            : '• ',
          ...children
        );
      } else result.push(...children);
      if (blocks.has(name)) result.push('\n\n');
    }
    return result;
  }
  // Preserve explicit spacing within paragraphs in both HTML and Rich Message.
  const merged: RichText[] = [];
  for (const part of render(document.childNodes || [], true)) {
    const last = merged.length - 1;
    if (typeof part === 'string' && typeof merged[last] === 'string')
      merged[last] += part;
    else merged.push(part);
  }
  const richText = trimText(merged);
  return {
    richText,
    blocks: toBlocks(richText),
    html: toHtml(richText),
    visible: plainText(richText),
  };
}

// node-telegram-bot-api 0.66 has no public sendRichMessage method. Keep the
// compatibility boundary in one place and test both uploads and references.
export interface RichMessageBot {
  _formatSendData(
    name: string,
    media: string,
    fileOptions: { filename?: string; contentType: string }
  ): [Record<string, unknown> | null, string | null];
  _request(
    method: string,
    options: {
      form?: Record<string, string>;
      formData?: Record<string, unknown>;
    }
  ): Promise<{ message_id?: number }>;
}

export async function sendRichPhoto(
  bot: RichMessageBot,
  chatId: string,
  media: {
    media: string;
    fileOptions: { filename?: string; contentType: string };
  },
  formatted: ReturnType<typeof formatTelegramHtml>,
  replyToMessageId?: number
): Promise<number> {
  const attachment = 'postiz_photo';
  const [fileData, reference] = bot._formatSendData(
    attachment,
    media.media,
    media.fileOptions
  );
  const richMessage = {
    blocks: [
      {
        type: 'photo',
        photo: {
          type: 'photo',
          media: fileData ? `attach://${attachment}` : reference,
        },
      },
      ...formatted.blocks,
    ],
  };
  const fields: Record<string, string> = {
    chat_id: String(chatId),
    rich_message: JSON.stringify(richMessage),
  };
  if (replyToMessageId)
    fields.reply_parameters = JSON.stringify({ message_id: replyToMessageId });
  const response = await bot._request(
    'sendRichMessage',
    fileData ? { formData: { ...fileData, ...fields } } : { form: fields }
  );
  if (!Number.isInteger(response.message_id))
    throw new Error('Telegram returned no message ID');
  return response.message_id;
}
