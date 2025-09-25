const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const text = fs.readFileSync('data/models.ts', 'utf8');
const imageRe = /buildModelImages\(\"([^\"]+)\",\s*(\d+)(?:,\s*{[^}]*?width:\s*(\d+)[^}]*?height:\s*(\d+)[^}]*?})?/g;
const detailRe = /buildDetailImages\(\"([^\"]+)\",\s*(\d+)(?:,\s*{[^}]*?width:\s*(\d+)[^}]*?height:\s*(\d+)[^}]*?})?/g;

const models = {};
let match;
while ((match = imageRe.exec(text))) {
  const slug = match[1];
  const count = Number(match[2]);
  const width = match[3] ? Number(match[3]) : 1600;
  const height = match[4] ? Number(match[4]) : 1200;
  models[slug] = models[slug] || {};
  models[slug].images = { count, width, height };
}
while ((match = detailRe.exec(text))) {
  const slug = match[1];
  const count = Number(match[2]);
  const width = match[3] ? Number(match[3]) : 800;
  const height = match[4] ? Number(match[4]) : 800;
  models[slug] = models[slug] || {};
  models[slug].details = { count, width, height };
}

const palette = [
  { r: 235, g: 229, b: 220 },
  { r: 215, g: 206, b: 193 },
  { r: 202, g: 194, b: 181 },
  { r: 189, g: 180, b: 168 }
];

function pickColor(slug) {
  const sum = slug.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return palette[sum % palette.length];
}

async function ensureImage(filePath, width, height, color) {
  if (fs.existsSync(filePath)) {
    return false;
  }
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color
    }
  })
    .webp({ quality: 70 })
    .toFile(filePath);
  return true;
}

async function run() {
  const created = [];
  for (const [slug, config] of Object.entries(models)) {
    const dir = path.join('public', 'assets', 'modelos', slug);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const color = pickColor(slug);
    const imagesCfg = config.images || { count: 0, width: 1600, height: 1200 };
    for (let index = 1; index <= imagesCfg.count; index += 1) {
      const suffix = String(index).padStart(2, '0');
      const name = suffix + '.webp';
      const filePath = path.join(dir, name);
      if (await ensureImage(filePath, imagesCfg.width, imagesCfg.height, color)) {
        created.push(filePath);
      }
    }
    const detailsCfg = config.details || { count: 0, width: 800, height: 800 };
    for (let index = 1; index <= detailsCfg.count; index += 1) {
      const suffix = String(index).padStart(2, '0');
      const name = 'detalhe' + suffix + '.webp';
      const filePath = path.join(dir, name);
      if (await ensureImage(filePath, detailsCfg.width, detailsCfg.height, color)) {
        created.push(filePath);
      }
    }
  }
  if (created.length) {
    console.log('Created placeholders for ' + created.length + ' images.');
    created.forEach((file) => console.log('  - ' + file));
  } else {
    console.log('No placeholders were needed. All images already exist.');
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
