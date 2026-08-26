/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { readNxJson, type Tree, updateNxJson } from '@nx/devkit';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { mergeTargetDefault } from './nx.js';

/**
 * Paths neither vended tool touches: build output, caches, and files other
 * tools own the shape of.
 */
const IGNORED_PATTERNS = [
  '**/dist',
  '**/out-tsc',
  '**/.nx',
  '**/.venv',
  // GritQL codemod cache written by generators.
  '**/.grit',
  '**/*.gen.*',
  '**/generated/**',
  // Nx's typescript-sync rewrites these without formatting.
  '**/tsconfig*.json',
];

/**
 * The `.oxfmtrc.json` vended into a new workspace. Only departures from
 * oxfmt's defaults: quoting to match the templates, import sorting to match
 * the biome config's organizeImports, and the shared exclusions.
 */
export const getDefaultOxfmtConfig = () => ({
  $schema: './node_modules/oxfmt/configuration_schema.json',
  singleQuote: true,
  sortImports: true,
  ignorePatterns: IGNORED_PATTERNS,
});

/** The `.oxlintrc.json` vended into a new workspace. */
export const getDefaultOxlintConfig = () => ({
  $schema: './node_modules/oxlint/configuration_schema.json',
  plugins: ['typescript', 'unicorn', 'oxc', 'import'],
  categories: { correctness: 'error' },
  rules: {
    // Generated projects start with a comment-only index.ts.
    'unicorn/no-empty-file': 'off',
  },
  env: { builtin: true },
  ignorePatterns: IGNORED_PATTERNS,
});

export const OXLINT_PLUGIN = '@nx/oxlint';
export const LINT_TARGET_NAME = 'lint';

/**
 * Register `@nx/oxlint` so every project's `lint` target is inferred, and
 * give that target the `fix` and `skip-lint` configurations the biome targets
 * carry so the workspace's scripts work the same with either linter. When
 * biome formats, `lint` depends on the per-project `format` target it vends;
 * oxfmt runs through `nx format` instead.
 */
export const registerOxlintPlugin = (
  tree: Tree,
  { formatTarget }: { formatTarget: boolean },
): void => {
  const nxJson = readNxJson(tree) ?? {};
  const plugins = nxJson.plugins ?? [];
  const registered = plugins.some(
    (plugin) =>
      (typeof plugin === 'string' ? plugin : plugin.plugin) === OXLINT_PLUGIN,
  );
  updateNxJson(tree, {
    ...nxJson,
    plugins: registered
      ? plugins
      : [
          ...plugins,
          { plugin: OXLINT_PLUGIN, options: { targetName: LINT_TARGET_NAME } },
        ],
    targetDefaults: {
      ...nxJson.targetDefaults,
      [LINT_TARGET_NAME]: mergeTargetDefault(
        nxJson.targetDefaults?.[LINT_TARGET_NAME],
        (base) => ({
          ...base,
          configurations: {
            ...base.configurations,
            fix: { command: 'oxlint --fix .' },
            // Cross-platform no-op (`true` is not available on Windows cmd).
            'skip-lint': { command: 'node -e ""' },
          },
          ...(formatTarget
            ? {
                dependsOn: Array.from(
                  new Set([...(base.dependsOn ?? []), 'format']),
                ),
              }
            : {}),
        }),
      ),
    },
  });
};

/**
 * Nx's oxfmt formatting, which resolves `oxfmt` from the workspace and formats
 * in-process. Imported lazily: the export arrived in nx 23.2, and a workspace
 * still on an older nx must load the plugin so init can pin the newer one.
 */
const loadNxOxfmt = async () => {
  try {
    return await import('nx/src/devkit-internals');
  } catch {
    return undefined;
  }
};

/**
 * Format files with oxfmt through Nx, reading the config and ignore files
 * through the tree. Before the workspace's first install (init, preset) there
 * is no oxfmt to resolve, so a load failure leaves the files as written; see
 * {@link formatChangesAfterInstall}.
 */
export async function formatWithOxfmt(
  tree: Tree,
  files: { path: string; content: Buffer | null }[],
): Promise<void> {
  const nx = await loadNxOxfmt();
  if (!nx?.formatFilesWithOxfmt) {
    return;
  }
  // The batch is scoped to a subtree, so the root config is seeded from the
  // tree: disk cannot see one a generator has just staged.
  const rootConfigNames = nx.oxfmtConfigFiles.filter((name) =>
    tree.exists(name),
  );
  const seedName = rootConfigNames[0];
  const seedConfig = seedName
    ? { name: seedName, content: tree.read(seedName, 'utf-8') ?? '' }
    : undefined;
  let formatted: Map<string, string>;
  try {
    ({ formatted } = await nx.formatFilesWithOxfmt(
      files.map((file) => ({
        path: file.path,
        content: file.content?.toString('utf-8') ?? '',
      })),
      tree.root,
      seedConfig,
      rootConfigNames,
      (relativePath) =>
        tree.exists(relativePath) ? tree.read(relativePath, 'utf-8') : null,
    ));
  } catch {
    return;
  }
  for (const [filePath, content] of formatted) {
    tree.write(filePath, content);
  }
}

/**
 * A callback that formats, on disk, the files the tree currently holds. For
 * the generators that install oxfmt (init, preset): their own files are
 * written before oxfmt exists, so they are formatted once the install that
 * follows has brought it in.
 */
export const formatChangesAfterInstall = (
  tree: Tree,
): (() => Promise<void>) => {
  const paths = tree
    .listChanges()
    .filter((change) => change.type !== 'DELETE')
    .map((change) => change.path);
  return async () => {
    const nx = await loadNxOxfmt();
    if (!nx?.formatFilesWithOxfmt) {
      return;
    }
    const files = paths
      .filter((filePath) => existsSync(path.join(tree.root, filePath)))
      .map((filePath) => ({
        path: filePath,
        content: readFileSync(path.join(tree.root, filePath), 'utf-8'),
      }));
    let formatted: Map<string, string>;
    try {
      ({ formatted } = await nx.formatFilesWithOxfmt(files, tree.root));
    } catch {
      return;
    }
    for (const [filePath, content] of formatted) {
      writeFileSync(path.join(tree.root, filePath), content);
    }
  };
};
