#!/usr/bin/env node

/**
 * NOTICES.md 自動生成スクリプト
 * package-lock.json から依存パッケージのライセンス情報を抽出し、NOTICES.md を生成します。
 */

const fs = require('fs');
const path = require('path');

// ファイルパス
const PACKAGE_LOCK_PATH = path.join(__dirname, '..', 'package-lock.json');
const NOTICES_PATH = path.join(__dirname, '..', 'NOTICES.md');

// ライセンステキスト
const LICENSE_TEXTS = {
  'BSD-3-Clause': `Copyright (c) <year> <owner>

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software without
   specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`,

  'MIT': `Copyright (c) <year> <copyright holders>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,

  'Apache-2.0': `Copyright <year> <copyright holder>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`,

  'ISC': `Copyright (c) <year> <copyright holder>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`,

  '0BSD': `Copyright (c) <year> <copyright holder>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.`
};

/**
 * package-lock.json を読み込んでライセンス情報を抽出
 */
function extractLicenses() {
  const packageLock = JSON.parse(fs.readFileSync(PACKAGE_LOCK_PATH, 'utf8'));
  const packages = packageLock.packages || {};
  const licenseMap = new Map();

  for (const [pkgPath, pkgInfo] of Object.entries(packages)) {
    // ルートパッケージはスキップ
    if (pkgPath === '') continue;

    // devDependencies のみ対象
    if (!pkgInfo.dev) continue;

    const pkgName = pkgPath.replace('node_modules/', '');
    const license = pkgInfo.license || 'UNKNOWN';

    if (!licenseMap.has(license)) {
      licenseMap.set(license, []);
    }

    licenseMap.get(license).push({
      name: pkgName,
      version: pkgInfo.version || 'N/A',
      resolved: pkgInfo.resolved || '',
    });
  }

  return licenseMap;
}

/**
 * NOTICES.md を生成
 */
function generateNotices() {
  const licenseMap = extractLicenses();
  let content = `# Third-Party Licenses

This plugin uses the following third-party software. Their licenses are included below.

---

`;

  // ライセンスごとにグループ化
  const sortedLicenses = Array.from(licenseMap.keys()).sort();

  for (const license of sortedLicenses) {
    const packages = licenseMap.get(license);
    content += `## ${license} License\n\n`;
    content += `The following ${packages.length} package(s) are licensed under ${license}:\n\n`;

    // パッケージリストを表示（最大10件、それ以上は省略）
    const displayPackages = packages.slice(0, 10);
    for (const pkg of displayPackages) {
      content += `- **${pkg.name}** (v${pkg.version})\n`;
    }

    if (packages.length > 10) {
      content += `- ... and ${packages.length - 10} more packages\n`;
    }

    content += `\n---\n\n`;
  }

  // ライセンス全文を追加
  content += `## Full License Texts\n\n`;

  for (const [license, text] of Object.entries(LICENSE_TEXTS)) {
    if (licenseMap.has(license)) {
      content += `### ${license} License\n\n\`\`\`\n${text}\n\`\`\`\n\n---\n\n`;
    }
  }

  content += `For the complete list of dependencies and their licenses, please refer to \`package-lock.json\`.\n`;

  // ファイル書き込み
  fs.writeFileSync(NOTICES_PATH, content, 'utf8');
  console.log(`✅ NOTICES.md が生成されました: ${NOTICES_PATH}`);
}

// メイン処理
try {
  generateNotices();
} catch (error) {
  console.error('❌ エラーが発生しました:', error.message);
  process.exit(1);
}
