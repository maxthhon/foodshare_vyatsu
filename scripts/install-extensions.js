const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const extensionsFile = path.join(rootDir, '.vscode', 'extensions.json');

console.log('\n🔍 [1/4] Проверка файла окружения (.env)...');
const envPath = path.join(rootDir, '.env');
const envExamplePath = path.join(rootDir, '.env.example');

if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath);
  console.log('   ✅ Создан файл .env из .env.example');
} else if (fs.existsSync(envPath)) {
  console.log('   ✅ Файл .env уже существует');
}

console.log('\n📦 [2/4] Проверка и установка расширений VS Code...');
let installedExtensions = [];
let hasCodeCli = true;

try {
  const output = execSync('code --list-extensions', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  installedExtensions = output.split('\n').map(e => e.trim().toLowerCase()).filter(Boolean);
} catch {
  hasCodeCli = false;
  console.log('   ⚠️  CLI-команда "code" не найдена в терминале.');
  console.log('      (В VS Code нажмите "Install All" во всплывающем окне справа снизу)');
}

if (hasCodeCli && fs.existsSync(extensionsFile)) {
  try {
    const { recommendations = [] } = JSON.parse(fs.readFileSync(extensionsFile, 'utf8'));

    for (const ext of recommendations) {
      const extLower = ext.toLowerCase();
      if (installedExtensions.includes(extLower)) {
        console.log(`   ⏭️  Уже установлено: ${ext}`);
      } else {
        console.log(`   ⏳ Установка: ${ext}...`);
        try {
          execSync(`code --install-extension ${ext}`, { stdio: 'ignore' });
          console.log(`   ✅ Успешно установлено: ${ext}`);
        } catch {
          console.log(`   ❌ Ошибка при установке: ${ext}`);
        }
      }
    }
  } catch (err) {
    console.log('   ⚠️  Не удалось прочитать .vscode/extensions.json');
  }
}

console.log('\n🛠️  [3/4] Проверка зависимостей проекта (npm install)...');

function runStep(title, cmd, cwd = rootDir) {
  process.stdout.write(`   ⏳ ${title}... `);
  try {
    execSync(cmd, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    console.log('OK ✅');
    return true;
  } catch (error) {
    console.log('ОШИБКА ❌');
    if (error.stderr) console.error(error.stderr.toString());
    return false;
  }
}

runStep('Установка зависимостей корня', 'npm install');
runStep('Установка зависимостей сервера (server)', 'npm install', path.join(rootDir, 'server'));
runStep('Генерация Prisma Client', 'npx prisma generate', path.join(rootDir, 'server'));
runStep('Установка зависимостей клиента (client)', 'npm install', path.join(rootDir, 'client'));

console.log('\n✨ [4/4] Итоговая проверка:');
const serverNodeModules = fs.existsSync(path.join(rootDir, 'server', 'node_modules'));
const clientNodeModules = fs.existsSync(path.join(rootDir, 'client', 'node_modules'));

if (serverNodeModules && clientNodeModules) {
  console.log('   🎉 Все зависимости и расширения успешно настроены!\n');
} else {
  console.log('   ⚠️  Часть зависимостей не установилась. Проверьте вывод выше.\n');
}
