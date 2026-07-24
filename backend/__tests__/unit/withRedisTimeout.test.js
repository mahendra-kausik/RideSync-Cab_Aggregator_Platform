const { withRedisTimeout } = require('../../utils/withRedisTimeout');

describe('withRedisTimeout', () => {
  it('resolves normally when the wrapped promise settles before the timeout', async () => {
    await expect(withRedisTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
  });

  it('rejects with a timeout error when the wrapped promise never settles', async () => {
    const neverResolves = new Promise(() => {});
    await expect(withRedisTimeout(neverResolves, 20, 'test')).rejects.toThrow(/timed out after 20ms \(test\)/);
  });
});
