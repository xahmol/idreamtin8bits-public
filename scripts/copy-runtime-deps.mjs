// Copy the packages the SSR bundle imports at runtime into the Lambda's
// node_modules (.amplify-hosting/compute/default/node_modules), including
// their dependencies. Run after `astro build` in amplify.yml postBuild.
//
// Replaces a hand-kept package list in the Amplify build settings: such a
// list silently misses packages (in the reference site, fflate went missing
// and the Assembly64 zip download returned 500 on Lambda) and needs
// re-checking on every Astro/Vite upgrade, because what gets bundled versus
// left external changes between versions.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const computeDir = path.join(root, '.amplify-hosting/compute/default');
const destModules = path.join(computeDir, 'node_modules');
const srcModules = path.join(root, 'node_modules');

/** Package name of a bare specifier ('@a/b/c' -> '@a/b', 'x/y' -> 'x'). */
function packageName(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Bare specifiers imported by the bundle (static and dynamic imports). */
function bundleImports(dir) {
  const found = new Set();
  // Statement syntax only (identifiers, braces, commas between import and
  // from), so prose in bundled blog text such as "... from 'x'" never matches.
  const importRe = /^(?:import|export)\s+[\w$*{},\s]+?\s+from\s*['"]([^'"./][^'"]*)['"]|^import\s*['"]([^'"./][^'"]*)['"]|\bimport\(\s*['"]([^'"./][^'"]*)['"]\s*\)/gm;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
    const file = path.join(entry.parentPath, entry.name);
    if (file.startsWith(destModules)) continue;
    const code = fs.readFileSync(file, 'utf8');
    for (const m of code.matchAll(importRe)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (spec.startsWith('node:') || spec.includes(':')) continue;
      found.add(packageName(spec));
    }
  }
  return found;
}

/** Directory of `name` as Node would resolve it from `fromDir`, or null. */
function resolvePackageDir(name, fromDir) {
  let dir = fromDir;
  while (dir.startsWith(root)) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const builtins = new Set((await import('node:module')).builtinModules);
const copied = new Set();
const missing = [];

function copyPackage(name, fromDir) {
  if (builtins.has(name)) return;
  const pkgDir = resolvePackageDir(name, fromDir);
  if (!pkgDir) { missing.push(name); return; }
  if (copied.has(pkgDir)) return;
  copied.add(pkgDir);

  // Keep the package's place in the tree, so nested node_modules resolve as before.
  const target = path.join(destModules, path.relative(srcModules, pkgDir));
  fs.cpSync(pkgDir, target, { recursive: true, dereference: true });

  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies };
  for (const dep of Object.keys(deps)) {
    // Optional and peer deps may legitimately be absent; only report real ones.
    if (!resolvePackageDir(dep, pkgDir)) {
      if (pkg.dependencies?.[dep]) missing.push(`${dep} (needed by ${name})`);
      continue;
    }
    copyPackage(dep, pkgDir);
  }
}

const imports = bundleImports(computeDir);
for (const name of imports) copyPackage(name, root);

console.log(`copy-runtime-deps: ${imports.size} imported packages, ${copied.size} copied into ${path.relative(root, destModules)}`);
if (missing.length) {
  console.error(`copy-runtime-deps: not found in node_modules: ${[...new Set(missing)].join(', ')}`);
  process.exit(1);
}
