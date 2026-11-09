const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureSeedAdmin } = require('../utils/seedAdmin');

function createUserModel(users = []) {
  return {
    users,
    sequelize: {
      async transaction() {
        return {
          LOCK: { UPDATE: 'UPDATE' },
          finished: false,
          async commit() {
            this.finished = 'commit';
          },
          async rollback() {
            this.finished = 'rollback';
          }
        };
      }
    },
    async findOne({ where: { email } }) {
      return this.users.find((user) => user.email === email) || null;
    },
    async create(attributes) {
      const user = {
        ...attributes,
        async update(values) {
          Object.assign(this, values);
        }
      };
      this.users.push(user);
      return user;
    }
  };
}

test('transfère le SUPER_ADMIN existant sans supprimer ni recréer sa ligne', async () => {
  const existingAdmin = {
    email: 'gg@gmail.com',
    role: 'SUPER_ADMIN',
    language: 'fr',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    async update(values) {
      Object.assign(this, values);
    }
  };
  const User = createUserModel([existingAdmin]);
  const result = await ensureSeedAdmin({
    User,
    hashPassword: async (password) => `hashed:${password}`,
    email: 'MohamadAlzaibak.8@gmail.com',
    password: 'a-strong-test-password',
    previousEmail: 'GG@gmail.com'
  });

  assert.equal(result.user, existingAdmin);
  assert.equal(result.renamed, true);
  assert.equal(existingAdmin.email, 'mohamadalzaibak.8@gmail.com');
  assert.equal(existingAdmin.role, 'SUPER_ADMIN');
  assert.equal(existingAdmin.passwordHash, 'hashed:a-strong-test-password');
  assert.equal(User.users.length, 1);
});

test('la commande de transfert peut être relancée après le premier renommage', async () => {
  const existingAdmin = {
    email: 'mohamadalzaibak.8@gmail.com',
    role: 'SUPER_ADMIN',
    async update(values) {
      Object.assign(this, values);
    }
  };
  const User = createUserModel([existingAdmin]);
  const result = await ensureSeedAdmin({
    User,
    hashPassword: async (password) => `hashed:${password}`,
    email: 'mohamadalzaibak.8@gmail.com',
    password: 'another-strong-test-password',
    previousEmail: 'gg@gmail.com'
  });

  assert.equal(result.user, existingAdmin);
  assert.equal(result.renamed, false);
  assert.equal(User.users.length, 1);
});

test('crée le premier SUPER_ADMIN quand aucun e-mail précédent ou compte cible n’existe', async () => {
  const User = createUserModel();
  const result = await ensureSeedAdmin({
    User,
    hashPassword: async (password) => `hashed:${password}`,
    email: 'admin@example.test',
    password: 'a-strong-test-password'
  });

  assert.equal(result.user.email, 'admin@example.test');
  assert.equal(result.user.role, 'SUPER_ADMIN');
  assert.equal(result.user.status, 'ACTIVE');
  assert.equal(result.user.emailVerifiedAt instanceof Date, true);
  assert.equal(result.renamed, false);
  assert.equal(User.users.length, 1);
});

test('ne modifie pas le compte si l’adresse de destination appartient à un autre utilisateur', async () => {
  const previousAdmin = {
    email: 'gg@gmail.com',
    role: 'SUPER_ADMIN',
    async update() {
      assert.fail('Le compte source ne doit pas être modifié en cas de collision');
    }
  };
  const otherUser = { email: 'mohamadalzaibak.8@gmail.com', role: 'BUYER' };
  const User = createUserModel([previousAdmin, otherUser]);

  await assert.rejects(
    ensureSeedAdmin({
      User,
      hashPassword: async () => 'hash',
      email: 'mohamadalzaibak.8@gmail.com',
      password: 'a-strong-test-password',
      previousEmail: 'gg@gmail.com'
    }),
    /déjà utilisé par un autre compte/
  );
  assert.equal(previousAdmin.email, 'gg@gmail.com');
});

test('avec l’option explicite, promeut le BUYER cible puis supprime le SUPER_ADMIN précédent', async () => {
  const previousAdmin = {
    email: 'gg@gmail.com',
    role: 'SUPER_ADMIN',
    async destroy() {
      User.users.splice(User.users.indexOf(this), 1);
    }
  };
  const buyer = {
    email: 'mohamadalzaibak.8@gmail.com',
    role: 'BUYER',
    organizationId: 7,
    async update(values) {
      Object.assign(this, values);
    }
  };
  const User = createUserModel([previousAdmin, buyer]);
  const result = await ensureSeedAdmin({
    User,
    hashPassword: async (password) => `hashed:${password}`,
    email: 'mohamadalzaibak.8@gmail.com',
    password: 'a-strong-test-password',
    previousEmail: 'gg@gmail.com',
    deletePreviousAdmin: true
  });

  assert.equal(result.user, buyer);
  assert.equal(result.removedPrevious, true);
  assert.equal(buyer.role, 'SUPER_ADMIN');
  assert.equal(buyer.organizationId, null);
  assert.equal(buyer.passwordHash, 'hashed:a-strong-test-password');
  assert.deepEqual(User.users, [buyer]);
});
