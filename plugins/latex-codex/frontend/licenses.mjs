import fs from 'node:fs';
import path from 'node:path';
const lock = JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const notices = [];
for (const [directory,entry] of Object.entries(lock.packages)) {
  if (!directory || entry.dev && directory !== 'node_modules/tailwindcss') continue;
  const pkg = JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
  const files = fs.readdirSync(directory).filter(name=>/^licen[sc]e|^copying/i.test(name) && fs.statSync(path.join(directory,name)).isFile());
  for (const file of files) notices.push(`${pkg.name} ${pkg.version}\n${fs.readFileSync(path.join(directory,file),'utf8')}`);
}
fs.writeFileSync('../scripts/vendor/history-tabs.LICENSE.txt',notices.join('\n\n--------------------\n\n'));
