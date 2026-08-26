/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  joinPathFragments,
  readJson,
  type Tree,
  updateJson,
  writeJson,
} from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { expect } from 'vitest';
import { AWS_NX_PLUGIN_CONFIG_FILE_NAME } from './config/utils.js';
import { getDefaultBiomeConfig } from './format.js';
import {
  BIOME_CONFIG_FILE_NAME,
  type Formatter,
  type Linter,
  OXFMT_CONFIG_FILE_NAME,
  OXLINT_CONFIG_FILE_NAME,
} from './linter.js';
import {
  getDefaultOxfmtConfig,
  getDefaultOxlintConfig,
  registerOxlintPlugin,
} from './oxc.js';

/** Formatter configs Nx discovers and formats generated files with. */
const NX_FORMATTER_CONFIG_FILES = [
  '.oxfmtrc.json',
  '.oxfmtrc.jsonc',
  'oxfmt.config.ts',
  'oxfmt.config.mts',
  '.prettierrc',
];

/**
 * Create a workspace tree configured so that nx's `isUsingTsSolutionSetup`
 * reports `true`, matching the workspaces our preset generates. Rather than
 * mocking nx internals, we set up the real markers it checks for:
 * - package manager workspaces enabled (`pnpm-workspace.yaml` with `packages`)
 * - a root `tsconfig.json` extending `tsconfig.base.json` with empty `include`
 * - `composite: true` in `tsconfig.base.json`
 * - a root `package.json` with `type: module`, matching the ESM default the
 *   preset establishes
 */
export const createTreeUsingTsSolutionSetup = ({
  linter = 'biome',
  formatter = 'biome',
}: {
  linter?: Linter;
  formatter?: Formatter;
} = {}): Tree => {
  const tree = createTreeWithEmptyWorkspace();

  // `createTreeWithEmptyWorkspace` seeds a formatter config Nx then formats
  // generated files with. Our workspaces select `formatter: 'none'` and format
  // with biome, so remove it to match what the preset produces.
  for (const config of NX_FORMATTER_CONFIG_FILES) {
    if (tree.exists(config)) {
      tree.delete(config);
    }
  }

  tree.write('pnpm-workspace.yaml', `packages:\n  - packages/*`);

  // Write both workspace markers so package-manager detection finds workspaces
  // enabled whether tests run via pnpm or npm/npx.
  updateJson(tree, 'package.json', (json) => ({
    ...json,
    type: 'module',
    workspaces: ['packages/*'],
  }));

  const baseTsConfig = readJson(tree, 'tsconfig.base.json');
  writeJson(tree, 'tsconfig.base.json', {
    ...baseTsConfig,
    compilerOptions: { ...baseTsConfig.compilerOptions, composite: true },
  });
  writeJson(tree, 'tsconfig.json', {
    extends: './tsconfig.base.json',
    files: [],
    include: [],
    references: [],
  });

  // The preset always writes the chosen tools' root configs, so mirror that
  // here for realistic lint-target configuration. The choice itself is only
  // recorded when it departs from the default, so the default tree stays a
  // workspace without a plugin config, as most specs expect.
  if (linter !== 'biome' || formatter !== 'biome') {
    tree.write(
      AWS_NX_PLUGIN_CONFIG_FILE_NAME,
      `export default { linter: { tool: '${linter}' }, formatter: { tool: '${formatter}' } };\n`,
    );
  }
  if (linter === 'biome' || formatter === 'biome') {
    writeJson(
      tree,
      BIOME_CONFIG_FILE_NAME,
      getDefaultBiomeConfig(tree, { linter, formatter }),
    );
  }
  if (linter === 'oxlint') {
    writeJson(tree, OXLINT_CONFIG_FILE_NAME, getDefaultOxlintConfig());
    registerOxlintPlugin(tree, { formatTarget: formatter === 'biome' });
  }
  if (formatter === 'oxfmt') {
    writeJson(tree, OXFMT_CONFIG_FILE_NAME, getDefaultOxfmtConfig());
  }
  return tree;
};

/**
 * Snapshot all files within a directory in the given tree
 */
export const snapshotTreeDir = (tree: Tree, dir: string) => {
  if (tree.isFile(dir)) {
    expect(tree.read(dir, 'utf-8')).toMatchSnapshot(dir);
  } else {
    tree
      .children(dir)
      .forEach((subDir) =>
        snapshotTreeDir(tree, joinPathFragments(dir, subDir)),
      );
  }
};
