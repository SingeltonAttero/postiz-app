import TelegramBot from 'node-telegram-bot-api';
import { TelegramProvider } from '../../libraries/nestjs-libraries/src/integrations/social/telegram.provider';
import type { PostDetails } from '../../libraries/nestjs-libraries/src/integrations/social/social.integrations.interface';

jest.mock('@gitroom/nestjs-libraries/integrations/social.abstract', () => ({
  SocialAbstract: class {},
}));
jest.mock('@gitroom/nestjs-libraries/services/make.is', () => ({
  makeId: () => 'fixture',
}));
jest.mock('node-telegram-bot-api', () =>
  jest.fn().mockImplementation(() => ({
    sendMessage: jest.fn().mockResolvedValue({ message_id: 10 }),
    sendPhoto: jest.fn().mockResolvedValue({ message_id: 11 }),
    sendVideo: jest.fn().mockResolvedValue({ message_id: 12 }),
    sendDocument: jest.fn().mockResolvedValue({ message_id: 13 }),
    sendMediaGroup: jest.fn().mockResolvedValue([{ message_id: 14 }]),
    _formatSendData: jest.fn().mockReturnValue([null, 'photo-id']),
    _request: jest.fn().mockResolvedValue({ message_id: 15 }),
  }))
);

const bot = (TelegramBot as jest.MockedClass<typeof TelegramBot>).mock
  .results[0].value;
const provider = new TelegramProvider();
const post = (message: string, paths: string[] = []): PostDetails =>
  ({
    id: 'fixture',
    message,
    media: paths.map((path) => ({ path })),
  } as PostDetails);
beforeEach(() => jest.clearAllMocks());

it('keeps a text-only post on sendMessage with formatted HTML', async () => {
  await provider.post('fixture', '42', [
    post('<p><a href="https://example.com">Docs</a><br>Line</p>'),
  ]);
  expect(bot.sendMessage).toHaveBeenCalledWith(
    '42',
    '<a href="https://example.com">Docs</a>\nLine',
    { parse_mode: 'HTML' }
  );
  expect(bot._request).not.toHaveBeenCalled();
});
it.each([1023, 1024])(
  'keeps %i visible characters on the photo-caption route',
  async (length) => {
    await provider.post('fixture', '42', [
      post(`<p><strong>${'x'.repeat(length)}</strong></p>`, [
        'https://example.com/image.png',
      ]),
    ]);
    expect(bot.sendPhoto).toHaveBeenCalledTimes(1);
    expect(bot._request).not.toHaveBeenCalled();
  }
);
it('uses one rich message for a photo and 1025 visible characters', async () => {
  const result = await provider.post('fixture', '42', [
    post(`<p>${'x'.repeat(1025)}</p>`, ['https://example.com/image.png']),
  ]);
  expect(bot._request).toHaveBeenCalledTimes(1);
  expect(bot.sendPhoto).not.toHaveBeenCalled();
  expect(bot.sendMessage).not.toHaveBeenCalled();
  expect(result[0].postId).toBe('15');
});
it.each([
  ['movie.mp4', 'sendVideo'],
  ['notes.pdf', 'sendDocument'],
])('keeps the existing route for %s', async (file, method) => {
  await provider.post('fixture', '42', [
    post('<p>Caption</p>', ['https://example.com/' + file]),
  ]);
  expect(bot[method]).toHaveBeenCalledTimes(1);
  expect(bot._request).not.toHaveBeenCalled();
});
it('keeps albums on sendMediaGroup', async () => {
  await provider.post('fixture', '42', [
    post('<p>Caption</p>', [
      'https://example.com/one.png',
      'https://example.com/two.png',
    ]),
  ]);
  expect(bot.sendMediaGroup).toHaveBeenCalledTimes(1);
  expect(bot._request).not.toHaveBeenCalled();
});
