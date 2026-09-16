import {
  formatTelegramHtml,
  sendRichPhoto,
} from '../../libraries/nestjs-libraries/src/integrations/social/telegram.format';

describe('Telegram HTML', () => {
  it('keeps named links, nested emphasis and entities', () => {
    const result = formatTelegramHtml(
      '<p><strong>A &amp; B</strong> <a href="https://example.com/?a=1&amp;b=2"><u>Docs</u></a></p>'
    );
    expect(result.visible).toBe('A & B Docs');
    expect(result.html).toBe(
      '<b>A &amp; B</b> <a href="https://example.com/?a=1&amp;b=2"><u>Docs</u></a>'
    );
  });
  it('preserves one, two and three line breaks', () => {
    expect(
      formatTelegramHtml('<p>A<br>B</p><p>C</p><p></p><p>D</p>').visible
    ).toBe('A\nB\n\nC\n\n\nD');
  });
  it('keeps quotes as rich blocks and Telegram HTML', () => {
    const result = formatTelegramHtml(
      '<p>Before</p><blockquote><p><strong>Quote</strong><br>line</p></blockquote><p>After</p>'
    );
    expect(result.html).toContain(
      '<blockquote><b>Quote</b>\nline</blockquote>'
    );
    expect(result.blocks.map((b) => b.type)).toEqual([
      'paragraph',
      'blockquote',
      'paragraph',
    ]);
    expect(result.blocks[1]).toEqual({
      type: 'blockquote',
      blocks: [
        {
          type: 'paragraph',
          text: [{ type: 'bold', text: ['Quote'] }, '\n', 'line'],
        },
      ],
    });
  });
  it('supports heading and list text', () => {
    const result = formatTelegramHtml(
      '<h2>Title</h2><ul><li>One</li><li>Two</li></ul>'
    );
    expect(result.html).toContain('<b>Title</b>');
    expect(result.visible).toContain('• One\n\n• Two');
  });
  it('escapes literal tags once', () => {
    expect(
      formatTelegramHtml('<p>&lt;widget&gt; &amp; &amp;lt;</p>').html
    ).toBe('&lt;widget&gt; &amp; &amp;lt;');
  });
  it.each([
    'javascript:alert(1)',
    'file:///tmp/private',
    'https://user:password@example.com',
    '/relative',
  ])('rejects unsupported link %s', (url) => {
    expect(() =>
      formatTelegramHtml(`<p><a href="${url}">link</a></p>`)
    ).toThrow(/Telegram link/);
  });
  it('rejects unsupported markup', () => {
    expect(() => formatTelegramHtml('<iframe>text</iframe>')).toThrow(
      /Unsupported Telegram/
    );
  });
  it('handles an empty draft', () => {
    expect(formatTelegramHtml('<p></p>').visible).toBe('');
  });
});

describe('Rich Message transport', () => {
  const photo = {
    media: 'photo-id',
    fileOptions: { filename: 'image.png', contentType: 'image/png' },
  };
  it('puts a referenced photo before text and preserves replies', async () => {
    const bot = {
      _formatSendData: jest.fn().mockReturnValue([null, 'photo-id']),
      _request: jest.fn().mockResolvedValue({ message_id: 12 }),
    };
    const formatted = formatTelegramHtml(
      '<p>Body</p><blockquote><p>Quote</p></blockquote>'
    );
    await expect(sendRichPhoto(bot, '42', photo, formatted, 9)).resolves.toBe(
      12
    );
    const [method, options] = bot._request.mock.calls[0];
    expect(method).toBe('sendRichMessage');
    expect(options.form.reply_parameters).toBe('{"message_id":9}');
    expect(JSON.parse(options.form.rich_message).blocks[0]).toEqual({
      type: 'photo',
      photo: { type: 'photo', media: 'photo-id' },
    });
  });
  it('uses multipart data for a local upload', async () => {
    const file = { value: Buffer.from('fixture'), options: photo.fileOptions };
    const bot = {
      _formatSendData: jest
        .fn()
        .mockReturnValue([{ postiz_photo: file }, null]),
      _request: jest.fn().mockResolvedValue({ message_id: 13 }),
    };
    await sendRichPhoto(bot, '42', photo, formatTelegramHtml('<p>Body</p>'));
    const options = bot._request.mock.calls[0][1];
    expect(options.formData.postiz_photo).toBe(file);
    expect(
      JSON.parse(options.formData.rich_message).blocks[0].photo.media
    ).toBe('attach://postiz_photo');
    expect(options.form).toBeUndefined();
  });
  it('does not report success without a message ID', async () => {
    const bot = {
      _formatSendData: jest.fn().mockReturnValue([null, 'photo-id']),
      _request: jest.fn().mockResolvedValue({}),
    };
    await expect(
      sendRichPhoto(bot, '42', photo, formatTelegramHtml('Body'))
    ).rejects.toThrow('no message ID');
  });
  it('propagates API errors without sending a duplicate fallback', async () => {
    const bot = {
      _formatSendData: jest.fn().mockReturnValue([null, 'photo-id']),
      _request: jest.fn().mockRejectedValue(new Error('API unavailable')),
    };
    await expect(
      sendRichPhoto(bot, '42', photo, formatTelegramHtml('Body'))
    ).rejects.toThrow('API unavailable');
    expect(bot._request).toHaveBeenCalledTimes(1);
  });
});
