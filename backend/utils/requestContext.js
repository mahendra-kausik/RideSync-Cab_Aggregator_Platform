/**
 * Per-request correlation ID, propagated across async/await via AsyncLocalStorage
 * so log lines from the same request share an ID without threading it through
 * every function signature.
 */
const { AsyncLocalStorage } = require('async_hooks');

const asyncLocalStorage = new AsyncLocalStorage();

function run(requestId, fn) {
  return asyncLocalStorage.run({ requestId }, fn);
}

function getRequestId() {
  return asyncLocalStorage.getStore()?.requestId;
}

module.exports = { run, getRequestId };
