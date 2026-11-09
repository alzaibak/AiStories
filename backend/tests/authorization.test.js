const test = require('node:test');
const assert = require('node:assert/strict');
const { allowRoles, namespaceRole } = require('../middleware/authorization');

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

test('les espaces vendeur et acheteur refusent le rôle opposé', () => {
  for (const [namespace, role] of [['SELLER', 'BUYER'], ['BUYER', 'SELLER']]) {
    const res = response();
    let continued = false;
    namespaceRole(namespace)({ user: { role } }, res, () => { continued = true; });
    assert.equal(continued, false);
    assert.equal(res.statusCode, 403);
  }
});

test('le middleware autorise son rôle et inclut SUPER_ADMIN dans les routes admin', () => {
  let sellerContinued = false;
  namespaceRole('SELLER')({ user: { role: 'SELLER' } }, response(), () => { sellerContinued = true; });
  assert.equal(sellerContinued, true);

  let adminContinued = false;
  allowRoles('ADMIN')({ user: { role: 'SUPER_ADMIN' } }, response(), () => { adminContinued = true; });
  assert.equal(adminContinued, true);
});
