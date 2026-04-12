const fs = require('fs');
const code = fs.readFileSync(__dirname + '/archery-league-demo.html', 'utf8');
const re = /<script(?:\s[^>]*)?>(\s[\s\S]*?)<\/script>/g;
let largest = '';
let m;
while ((m = re.exec(code)) !== null) {
  if (m[1].length > largest.length) largest = m[1];
}
try {
  new Function(largest);
  console.log('SYNTAX OK — ' + largest.length + ' chars');
} catch (e) {
  console.error('SYNTAX ERROR:', e.message);
}
