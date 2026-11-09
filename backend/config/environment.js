const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

function loadEnvironment() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const fileValues = dotenv.parse(fs.readFileSync(envPath));
  for (const [key, value] of Object.entries(fileValues)) {
    if (!process.env[key]?.trim()) process.env[key] = value;
  }
}

module.exports = { loadEnvironment };
