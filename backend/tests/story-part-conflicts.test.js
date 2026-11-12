const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { app } = require('../index');
const { Story, StoryPart, User } = require('../models');

test('la création d’un numéro de partie déjà utilisé renvoie 409 avec la partie à modifier', async (context) => {
  const previousSecret = process.env.JWT_SECRET_KEY;
  process.env.JWT_SECRET_KEY = 'test-secret-for-story-part-conflict';
  const originalFindUser = User.findByPk;
  const originalFindStory = Story.findByPk;
  const originalFindPart = StoryPart.findOne;
  User.findByPk = async () => ({
    id: 8,
    role: 'EDITOR',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    language: 'fr'
  });
  Story.findByPk = async () => ({ id: 3 });
  StoryPart.findOne = async () => ({ id: 44, partNumber: 1 });

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  context.after(async () => {
    User.findByPk = originalFindUser;
    Story.findByPk = originalFindStory;
    StoryPart.findOne = originalFindPart;
    if (previousSecret === undefined) delete process.env.JWT_SECRET_KEY;
    else process.env.JWT_SECRET_KEY = previousSecret;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  const token = jwt.sign({ id: 8, role: 'EDITOR', status: 'ACTIVE' }, process.env.JWT_SECRET_KEY);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/content/stories/3/parts`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'accept-language': 'fr'
    },
    body: JSON.stringify({
      partNumber: 1,
      title: 'Titre',
      content: 'Contenu',
      endingHook: 'À suivre',
      translations: { ar: { title: 'عنوان', content: 'محتوى', endingHook: 'يتبع' } },
      estimatedReadingMinutes: 5,
      isFree: false
    })
  });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.code, 'PART_NUMBER_CONFLICT');
  assert.equal(body.existingPart.id, 44);
  assert.match(body.message, /La partie 1 existe déjà/);
  assert.equal(body.fields.partNumber, body.message);
});
