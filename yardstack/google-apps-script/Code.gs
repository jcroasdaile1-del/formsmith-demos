/**
 * YardStack Apps Script web-app shell.
 *
 * This version deliberately uses the same browser-local demo repository as
 * the GitHub Pages build. It does not read or write a Google Sheet. Paste the
 * four project files into a standalone Apps Script project and deploy it to
 * run the complete demo immediately.
 *
 * When connecting a Sheet later, keep the UI and replace DemoRepository in
 * JavaScript.html with narrow google.script.run calls. See SETUP.md.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('YardStack — Equipment Rental Operations')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
