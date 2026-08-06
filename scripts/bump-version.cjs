const fs = require('fs');
const path = require('path');

const type = process.argv[2] || 'patch'; // 'patch' (사소한 변경) 또는 'minor' (중대한 변경)

const pkgPath = path.join(__dirname, '..', 'package.json');
const gradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');

// 1. package.json 버전 읽기 및 수정
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
let versionParts = pkg.version.split('.').map(Number);
let major = versionParts[0] || 0;
let minor = versionParts[1] || 0;
let patch = versionParts[2] || 0;

if (type === 'minor') {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}

const newVersion = `${major}.${minor}.${patch}`;
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// 2. build.gradle versionCode 및 versionName 업데이트
let gradleContent = fs.readFileSync(gradlePath, 'utf8');

let versionCodeMatch = gradleContent.match(/versionCode\s+(\d+)/);
let currentVersionCode = versionCodeMatch ? parseInt(versionCodeMatch[1], 10) : 1;
let newVersionCode = currentVersionCode + 1;

gradleContent = gradleContent.replace(/versionCode\s+\d+/, `versionCode ${newVersionCode}`);
gradleContent = gradleContent.replace(/versionName\s+"[^"]+"/, `versionName "${newVersion}"`);

fs.writeFileSync(gradlePath, gradleContent, 'utf8');

console.log(`[Version Bump] Version updated to v${newVersion} (versionCode: ${newVersionCode})`);
