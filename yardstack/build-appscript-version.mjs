import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, 'google-apps-script');
mkdirSync(output, { recursive: true });

const page = readFileSync(join(root, 'index.html'), 'utf8')
  .replace('  <link rel="stylesheet" href="styles.css">', "  <?!= include('Stylesheet'); ?>")
  .replace('  <script src="app.js"></script>', "  <?!= include('JavaScript'); ?>");
const styles = readFileSync(join(root, 'styles.css'), 'utf8');
const script = readFileSync(join(root, 'app.js'), 'utf8');

writeFileSync(join(output, 'Index.html'), page, 'utf8');
writeFileSync(join(output, 'Stylesheet.html'), `<style>\n${styles}\n</style>\n`, 'utf8');
writeFileSync(join(output, 'JavaScript.html'), `<script>\n${script}\n</script>\n`, 'utf8');

console.log('Built Apps Script front-end files in google-apps-script/.');
