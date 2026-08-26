/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { readNxJson, readProjectConfiguration, type Tree } from '@nx/devkit';
import { formatFilesInSubtree } from '../../utils/format.js';
import { createTreeUsingTsSolutionSetup } from '../../utils/test.js';
import tsProjectGenerator from './generator.js';

const generate = async (tree: Tree) => {
  await tsProjectGenerator(tree, {
    name: 'test',
    preferInstallDependencies: false,
  });
  return readProjectConfiguration(tree, '@proj/test').targets;
};

describe('configureLint', () => {
  it('writes biome lint and format targets by default', async () => {
    const targets = await generate(createTreeUsingTsSolutionSetup());
    expect(targets.lint.options.command).toBe('biome lint {projectRoot}');
    expect(targets.lint.dependsOn).toContain('format');
    expect(targets.format.options.command).toBe('biome format {projectRoot}');
  });

  describe('oxlint + oxfmt', () => {
    let tree: Tree;

    beforeEach(() => {
      tree = createTreeUsingTsSolutionSetup({
        linter: 'oxlint',
        formatter: 'oxfmt',
      });
    });

    it('writes no lint or format target: lint is inferred by @nx/oxlint and oxfmt runs through nx format', async () => {
      const targets = await generate(tree);
      expect(targets.lint).toBeUndefined();
      expect(targets.format).toBeUndefined();
      expect(readNxJson(tree)?.plugins).toContainEqual({
        plugin: '@nx/oxlint',
        options: { targetName: 'lint' },
      });
    });

    it('formats generated files with oxfmt', async () => {
      await generate(tree);
      tree.write('test/src/x.ts', 'export const a = "b"');
      tree.write('test/src/y.json', '{"a":1}');
      await formatFilesInSubtree(tree, 'test');
      expect(tree.read('test/src/x.ts', 'utf-8')).toBe(
        "export const a = 'b';\n",
      );
      expect(tree.read('test/src/y.json', 'utf-8')).toBe('{ "a": 1 }\n');
    });

    it('leaves tsconfigs and ignored files untouched', async () => {
      await generate(tree);
      tree.write('test/tsconfig.lib.json', '{"a":1}');
      tree.write('test/src/routeTree.gen.ts', 'export const a = "b"');
      await formatFilesInSubtree(tree, 'test');
      expect(tree.read('test/tsconfig.lib.json', 'utf-8')).toBe('{"a":1}');
      expect(tree.read('test/src/routeTree.gen.ts', 'utf-8')).toBe(
        'export const a = "b"',
      );
    });
  });

  it('oxlint + biome: writes only the biome format target, and lint depends on it', async () => {
    const tree = createTreeUsingTsSolutionSetup({
      linter: 'oxlint',
      formatter: 'biome',
    });
    const targets = await generate(tree);
    expect(targets.lint).toBeUndefined();
    expect(targets.format.options.command).toBe('biome format {projectRoot}');
    expect(readNxJson(tree)?.targetDefaults?.lint).toMatchObject({
      dependsOn: ['format'],
      configurations: { fix: { command: 'oxlint --fix .' } },
    });
  });

  it('biome + oxfmt: writes only the biome lint target, without a format dependency', async () => {
    const tree = createTreeUsingTsSolutionSetup({
      linter: 'biome',
      formatter: 'oxfmt',
    });
    const targets = await generate(tree);
    expect(targets.format).toBeUndefined();
    expect(targets.lint.options.command).toBe('biome lint {projectRoot}');
    expect(targets.lint.dependsOn).toBeUndefined();
  });
});
