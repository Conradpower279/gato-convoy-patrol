// Build the offline single-file game from the same source used during development.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "src/styles.css"), "utf8");
html = html.replace(
  '<link rel="stylesheet" href="src/styles.css">',
  () => `<style>\n${css}\n</style>`,
);
// Prettier may add a self-closing slash to the link element.
html = html.replace(
  '<link rel="stylesheet" href="src/styles.css" />',
  () => `<style>\n${css}\n</style>`,
);
for (const name of ["interface", "harbor", "tactics", "game"]) {
  const js = fs.readFileSync(path.join(root, `src/${name}.js`), "utf8");
  html = html.replace(
    `<script src="src/${name}.js"></script>`,
    () => `<script>\n${js}\n</script>`,
  );
}
if (html.includes('src="src/') || html.includes('href="src/'))
  throw new Error("Build contains unresolved local source references.");
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/gato_convoy_patrol_v15.html"), html);
console.log("Built dist/gato_convoy_patrol_v15.html");
