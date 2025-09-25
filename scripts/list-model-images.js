const fs = require('fs');
const text = fs.readFileSync('data/models.ts', 'utf8');
const imageRe = /buildModelImages\(\"([^\"]+)\",\s*(\d+)(?:,\s*{[^}]*?width:\s*(\d+)[^}]*?height:\s*(\d+)[^}]*?})?/g;
const detailRe = /buildDetailImages\(\"([^\"]+)\",\s*(\d+)(?:,\s*{[^}]*?width:\s*(\d+)[^}]*?height:\s*(\d+)[^}]*?})?/g;
const results = {};
let match;
while ((match = imageRe.exec(text))) {
  const slug = match[1];
  const count = Number(match[2]);
  const width = match[3] ? Number(match[3]) : 1600;
  const height = match[4] ? Number(match[4]) : 1200;
  results[slug] = results[slug] || {};
  results[slug].images = { count, width, height };
}
while ((match = detailRe.exec(text))) {
  const slug = match[1];
  const count = Number(match[2]);
  const width = match[3] ? Number(match[3]) : 800;
  const height = match[4] ? Number(match[4]) : 800;
  results[slug] = results[slug] || {};
  results[slug].details = { count, width, height };
}
for (const slug of Object.keys(results)) {
  const img = results[slug].images || { count: 0, width: 1600, height: 1200 };
  const det = results[slug].details || { count: 0, width: 800, height: 800 };
  console.log(JSON.stringify({ slug, images: img, details: det }));
}
