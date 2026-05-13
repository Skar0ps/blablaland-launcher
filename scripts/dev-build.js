const { execSync } = require('child_process');
const fs = require('fs');

const DEV_URL = 'http://blablaland-site.test';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const originalName = pkg.productName;

const indexSrc = fs.readFileSync('index.js', 'utf8');
const originalIndex = indexSrc;

const players = [
  { name: 'Blablastrae Dev 1', appId: 'com.blablastrae.dev1' },
  { name: 'Blablastrae Dev 2', appId: 'com.blablastrae.dev2' },
];

const cleanup = () => {
  pkg.productName = originalName;
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
  fs.writeFileSync('index.js', originalIndex);
};

let patchedIndex = indexSrc.replace(
  /const GAME_URL = .+;/,
  `const GAME_URL = '${DEV_URL}';`
);

if (patchedIndex === indexSrc) {
  console.error('Erreur : impossible de patcher GAME_URL dans index.js');
  process.exit(1);
}

patchedIndex = patchedIndex.replace(
  /const isDev = .+;/,
  `const isDev = true;`
);

if (!patchedIndex.includes('const isDev = true;')) {
  console.error('Erreur : impossible de patcher isDev dans index.js');
  process.exit(1);
}

fs.writeFileSync('index.js', patchedIndex);

try {
  for (const player of players) {
    console.log(`\nBuild de "${player.name}" -> ${DEV_URL}`);

    pkg.productName = player.name;
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));

    fs.writeFileSync('electron-builder.dev.yml',
      fs.readFileSync('electron-builder.dev.yml', 'utf8')
        .replace(/^appId: ".+"/m, `appId: "${player.appId}"`)
    );

    execSync(
      'yarn electron-builder --win portable --x64 --publish never --config electron-builder.dev.yml',
      { stdio: 'inherit' }
    );
  }
} finally {
  cleanup();
}

console.log('\nTermine. Les portables sont dans release-dev/');
