'use strict';

import { describe, expect, it } from 'vitest';
const { createTelegramPublisher, telegramIdempotencyKey } = require('../telegram-auto-publisher.cjs');

function createFakeSupabase() {
  const state = {
    setting: { telegram_automation_enabled: true },
    failFinalization: false,
    posts: [{
      id: 'post-1',
      offer_id: 'offer-1',
      channel: 'telegram',
      status: 'draft',
      content: 'Oferta de teste',
      media_url: 'https://example.test/image.jpg',
      offers: { image_url: 'https://example.test/image.jpg', product_name: 'Produto', notes: '' }
    }]
  };

  return {
    state,
    from(table) { return new FakeQuery(state, table); }
  };
}

class FakeQuery {
  constructor(state, table) { this.state = state; this.table = table; this.operation = 'select'; this.filters = []; this.payload = null; }
  select() { return this; }
  update(payload) { this.operation = 'update'; this.payload = payload; return this; }
  eq(column, value) { this.filters.push([column, value]); return this; }
  in(column, values) { this.filters.push([column, values]); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return this.execute(); }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  async execute() {
    if (this.table === 'app_settings') return { data: [{ value: this.state.setting }], error: null };
    const matches = (post) => this.filters.every(([column, value]) => Array.isArray(value) ? value.includes(post[column]) : post[column] === value);
    if (this.operation === 'select') return { data: this.state.posts.filter(matches), error: null };
    const post = this.state.posts.find(matches);
    if (!post) return { data: null, error: null };
    if (this.state.failFinalization && this.payload.status === 'published') {
      return { data: null, error: new Error('simulated persistence failure') };
    }
    Object.assign(post, this.payload);
    return { data: { ...post }, error: null };
  }
}

describe('Telegram Oracle publisher concurrency', () => {
  it('fails closed when no editorial Top30 selection is supplied', async () => {
    const supabase = createFakeSupabase();
    const sends = [];
    const worker = createTelegramPublisher({ supabase, sendPhoto: async () => { sends.push(true); return { message_id: 1 }; }, sleep: async () => {} });

    await expect(worker.processQueue()).resolves.toMatchObject({ result: 'disabled', reason: 'editorial_selection_missing' });
    expect(sends).toHaveLength(0);
  });

  it('publishes only selected editorial offer ids and allows only the Telegram opt-in over NO_PUBLISH', async () => {
    const supabase = createFakeSupabase();
    supabase.state.posts.push({
      id: 'manual-post', offer_id: 'manual-offer', channel: 'telegram', status: 'draft', content: 'Manual', media_url: 'https://example.test/manual.jpg',
      offers: { image_url: 'https://example.test/manual.jpg', product_name: 'Manual', notes: '', explainability: { manual_source: true } }
    });
    const sends = [];
    const previousNoPublish = process.env.NO_PUBLISH;
    const previousTelegramAutoPublish = process.env.TELEGRAM_AUTO_PUBLISH;
    process.env.NO_PUBLISH = '1';
    process.env.TELEGRAM_AUTO_PUBLISH = '1';
    try {
      const worker = createTelegramPublisher({ supabase, sendPhoto: async (text, mediaUrl, context) => { sends.push({ text, mediaUrl, context }); return { message_id: 22 }; }, sleep: async () => {} });
      await worker.processQueue({ selectedEditorialTop30OfferIds: ['offer-1', 'manual-offer'] });
      expect(sends).toHaveLength(1);
      expect(sends[0].context.offerId).toBe('offer-1');
      expect(supabase.state.posts.find((post) => post.offer_id === 'manual-offer').status).toBe('draft');
    } finally {
      if (previousNoPublish === undefined) delete process.env.NO_PUBLISH; else process.env.NO_PUBLISH = previousNoPublish;
      if (previousTelegramAutoPublish === undefined) delete process.env.TELEGRAM_AUTO_PUBLISH; else process.env.TELEGRAM_AUTO_PUBLISH = previousTelegramAutoPublish;
    }
  });

  it('allows only one of two workers to send the same draft', async () => {
    const supabase = createFakeSupabase();
    const sends = [];
    const sendPhoto = async (text, mediaUrl, context) => {
      sends.push({ text, mediaUrl, context });
      return { message_id: 9876 };
    };
    const logs = [];
    const options = { supabase, sendPhoto, logger: { log: (entry) => logs.push(entry), warn: (entry) => logs.push(entry), error: (entry) => logs.push(entry) }, sleep: async () => {} };
    const workerA = createTelegramPublisher({ ...options, pid: 101 });
    const workerB = createTelegramPublisher({ ...options, pid: 202 });

    await Promise.all([workerA.processQueue({ selectedEditorialTop30OfferIds: ['offer-1'] }), workerB.processQueue({ selectedEditorialTop30OfferIds: ['offer-1'] })]);

    expect(sends).toHaveLength(1);
    expect(sends[0].context.idempotencyKey).toBe(telegramIdempotencyKey('post-1'));
    expect(supabase.state.posts[0]).toMatchObject({ status: 'published', external_id: '9876', publishing_idempotency_key: telegramIdempotencyKey('post-1') });
    expect(logs.some((entry) => entry.result === 'claim_lost')).toBe(true);
  });

  it('skips an overlapping poll in the same process', async () => {
    const supabase = createFakeSupabase();
    let releaseSend;
    const sendStarted = new Promise((resolve) => { releaseSend = resolve; });
    const sends = [];
    const logs = [];
    const worker = createTelegramPublisher({
      supabase,
      sendPhoto: async () => {
        sends.push(true);
        await sendStarted;
        return { message_id: 1234 };
      },
      logger: { log: (entry) => logs.push(entry), warn: (entry) => logs.push(entry), error: (entry) => logs.push(entry) },
      sleep: async () => {}
    });

    const first = worker.processQueue({ selectedEditorialTop30OfferIds: ['offer-1'] });
    await Promise.resolve();
    const second = await worker.processQueue({ selectedEditorialTop30OfferIds: ['offer-1'] });
    releaseSend();
    await first;

    expect(second).toMatchObject({ result: 'overlap' });
    expect(sends).toHaveLength(1);
    expect(logs.some((entry) => entry.result === 'overlap')).toBe(true);
  });

  it('leaves a sent post in publishing and logs reconciliation when final persistence fails', async () => {
    const supabase = createFakeSupabase();
    supabase.state.failFinalization = true;
    const logs = [];
    const worker = createTelegramPublisher({
      supabase,
      sendPhoto: async () => ({ message_id: 4321 }),
      logger: { log: (entry) => logs.push(entry), warn: (entry) => logs.push(entry), error: (entry) => logs.push(entry) },
      sleep: async () => {}
    });

    await worker.processQueue({ selectedEditorialTop30OfferIds: ['offer-1'] });

    expect(supabase.state.posts[0]).toMatchObject({ status: 'publishing', publishing_idempotency_key: telegramIdempotencyKey('post-1') });
    expect(logs.some((entry) => entry.result === 'send_confirmed_persistence_failed' && entry.external_id === '4321')).toBe(true);
  });
});
