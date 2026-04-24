#!/usr/bin/env node
/**
 * Atomic version bump for every publishable package in the monorepo.
 *
 * Usage: node scripts/release/bump-version.mjs <oldVersion> <newVersion>
 *
 * Why this exists: every release in this repo touches every publishable package.json
 * in lockstep. Doing that by hand is the kind of mechanical work that quietly
 * goes wrong (typo, missed file, off-by-one). The release workflow's
 * `check-source.mjs` then fails the publish, but only after CI has burned
 * through several minutes — and historically two of the publishable packages
 * (`@geometra/agent`, `@geometra/cli`) weren't even in `check-source.mjs`,
 * so they could drift forever without detection.
 *
 * This script:
 *   - Verifies every package currently sits at <oldVersion> (refuses to
 *     proceed if any drift exists — explicit "first fix the drift" signal).
 *   - Rewrites each package.json's "version" field to <newVersion>.
 *   - Prints what it touched.
 *
 * It deliberately does NOT touch internal `^x.y.z` dependency ranges between
 * @geometra/* packages. `scripts/release/normalize-publish-deps.mjs`
 * rewrites those at publish time, so source can stay loose.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { publishablePackageJsons } from './package-manifest.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

const packages = publishablePackageJsons()

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.+-]+)?$/

function usage() {
  console.error('Usage: node scripts/release/bump-version.mjs <oldVersion> <newVersion>')
  console.error('Example: node scripts/release/bump-version.mjs 1.34.0 1.35.0')
}

async function main() {
  const [oldVersion, newVersion] = process.argv.slice(2)
  if (!oldVersion || !newVersion) {
    usage()
    process.exit(1)
  }
  if (!SEMVER_RE.test(oldVersion) || !SEMVER_RE.test(newVersion)) {
    console.error(`Both versions must look like x.y.z (got "${oldVersion}" → "${newVersion}")`)
    process.exit(1)
  }
  if (oldVersion === newVersion) {
    console.error(`Old and new versions are identical (${oldVersion}). Nothing to do.`)
    process.exit(1)
  }

  // First pass: verify every package is at oldVersion. Fail fast on drift
  // before mutating anything, so we never leave the tree half-bumped.
  const drift = []
  for (const [expectedName, relPath] of packages) {
    const abs = join(root, relPath)
    const raw = await readFile(abs, 'utf8')
    const pkg = JSON.parse(raw)
    if (pkg.name !== expectedName) {
      console.error(`${relPath}: expected name ${expectedName}, found ${pkg.name ?? 'unknown'}`)
      process.exit(1)
    }
    if (pkg.version !== oldVersion) {
      drift.push(`  ${pkg.name}: ${pkg.version} (expected ${oldVersion})`)
    }
  }
  if (drift.length > 0) {
    console.error(`Refusing to bump — some packages are not at ${oldVersion}:`)
    console.error(drift.join('\n'))
    console.error('Fix the drift first, then re-run.')
    process.exit(1)
  }

  // Second pass: rewrite "version" with a string replace that preserves the
  // exact byte layout of the file (no JSON.stringify reformat). package.json
  // line/indent style varies across this repo and we don't want bumps to
  // produce noisy whitespace diffs.
  const versionLineRe = /"version":\s*"\d+\.\d+\.\d+(?:-[\w.+-]+)?"/
  const replacement = `"version": "${newVersion}"`
  let updated = 0
  for (const [, relPath] of packages) {
    const abs = join(root, relPath)
    const raw = await readFile(abs, 'utf8')
    if (!versionLineRe.test(raw)) {
      console.error(`${relPath}: could not locate "version" field — file may be hand-formatted in an unusual way`)
      process.exit(1)
    }
    const next = raw.replace(versionLineRe, replacement)
    await writeFile(abs, next)
    updated++
    console.log(`  ${relPath}: ${oldVersion} → ${newVersion}`)
  }

  console.log(`\nBumped ${updated} package.json files: ${oldVersion} → ${newVersion}`)
  console.log('Next: commit as `chore(release): vX.Y.Z — <summary>`, push, then `gh release create vX.Y.Z`.')
}

main().catch((err) => {
  console.error(String(err?.message ?? err))
  process.exit(1)
})
