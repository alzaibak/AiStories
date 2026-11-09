const test = require('node:test');
const assert = require('node:assert/strict');
const { allowRoles } = require('../middleware/authorization');

function response() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('les routes administrateur incluent SUPER_ADMIN', () => {
  let adminContinued = false;
  allowRoles('ADMIN')({ user: { role: 'SUPER_ADMIN' } }, response(), () => { adminContinued = true; });
  assert.equal(adminContinued, true);
});
