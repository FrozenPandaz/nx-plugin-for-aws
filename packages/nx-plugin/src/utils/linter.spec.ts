/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { describe, expect, it } from 'vitest';
import { AWS_NX_PLUGIN_CONFIG_FILE_NAME } from './config/utils.js';
import { resolveFormatter, resolveLinter } from './linter.js';

describe('resolveLinter / resolveFormatter', () => {
  it('default to biome with no config or root files', () => {
    const tree = createTreeWithEmptyWorkspace();
    tree.delete('.oxfmtrc.json');
    expect(resolveLinter(tree)).toBe('biome');
    expect(resolveFormatter(tree)).toBe('biome');
  });

  it('resolve oxfmt for an nx workspace that only has .oxfmtrc.json', () => {
    expect(resolveFormatter(createTreeWithEmptyWorkspace())).toBe('oxfmt');
  });

  it('read the tools from the plugin config', () => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write(
      AWS_NX_PLUGIN_CONFIG_FILE_NAME,
      `export default { linter: { tool: 'oxlint' }, formatter: { tool: 'oxfmt' } };`,
    );
    expect(resolveLinter(tree)).toBe('oxlint');
    expect(resolveFormatter(tree)).toBe('oxfmt');
  });

  it('fall back to the root config files when the plugin config cannot be evaluated', () => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write(
      AWS_NX_PLUGIN_CONFIG_FILE_NAME,
      `export default { license: NOT_DEFINED };`,
    );
    tree.write('.oxfmtrc.json', '{}');
    tree.write('.oxlintrc.json', '{}');
    expect(resolveLinter(tree)).toBe('oxlint');
    expect(resolveFormatter(tree)).toBe('oxfmt');
  });

  it('prefer biome when biome.json is present and nothing is configured', () => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write('biome.json', '{}');
    tree.write('.oxfmtrc.json', '{}');
    expect(resolveFormatter(tree)).toBe('biome');
  });

  it('reject an unknown tool', () => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write(
      AWS_NX_PLUGIN_CONFIG_FILE_NAME,
      `export default { linter: { tool: 'eslint' } };`,
    );
    expect(() => resolveLinter(tree)).toThrow(/must be one of biome, oxlint/);
  });
});
