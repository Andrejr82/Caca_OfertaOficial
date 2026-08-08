'use strict';

process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';
const { sendTelegramPhoto } = require('../telegram-auto-publisher.cjs');
const { sendFacebookPost, sendFacebookComment } = require('../facebook-auto-publisher.cjs');

describe('legacy publisher fail-closed guard', () => {
  it('blocks Telegram before any external call', async () => {
    const previous = process.env.NO_PUBLISH;
    process.env.NO_PUBLISH = '1';
    try { await expect(sendTelegramPhoto('copy', 'https://image.test/x.jpg')).rejects.toThrow(/NO_PUBLISH=1/); }
    finally { if (previous === undefined) delete process.env.NO_PUBLISH; else process.env.NO_PUBLISH = previous; }
  });

  it('blocks Facebook post and comment before any external call', async () => {
    const previous = process.env.NO_PUBLISH;
    process.env.NO_PUBLISH = '1';
    try {
      await expect(sendFacebookPost('copy', 'https://image.test/x.jpg')).rejects.toThrow(/NO_PUBLISH=1/);
      await expect(sendFacebookComment('post-1', 'comment')).rejects.toThrow(/NO_PUBLISH=1/);
    } finally { if (previous === undefined) delete process.env.NO_PUBLISH; else process.env.NO_PUBLISH = previous; }
  });
});
