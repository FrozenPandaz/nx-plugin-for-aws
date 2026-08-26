/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Tree } from '@nx/devkit';
import {
  AWS_NX_PLUGIN_CONFIG_FILE_NAME,
  readAwsNxPluginConfig,
} from './config/utils.js';

export const LINTERS = ['biome', 'oxlint'] as const;
export const FORMATTERS = ['biome', 'oxfmt'] as const;

export type Linter = (typeof LINTERS)[number];
export type Formatter = (typeof FORMATTERS)[number];

/**
 * Configuration for linting
 */
export interface LinterConfig {
  /**
   * The tool that lints TypeScript projects
   */
  tool: Linter;
}

/**
 * Configuration for formatting
 */
export interface FormatterConfig {
  /**
   * The tool that formats TypeScript projects
   */
  tool: Formatter;
}

export const BIOME_CONFIG_FILE_NAME = 'biome.json';
export const OXFMT_CONFIG_FILE_NAME = '.oxfmtrc.json';
export const OXLINT_CONFIG_FILE_NAME = '.oxlintrc.json';

/**
 * The linter the workspace uses, from `aws-nx-plugin.config.mts`. A workspace
 * that has not recorded the choice (or whose config cannot be evaluated) is
 * read from its root config files: oxlint when only `.oxlintrc.json` is
 * present, biome otherwise.
 */
export const resolveLinter = (tree: Tree): Linter => {
  const configured = readConfiguredTool(tree, 'linter');
  if (configured !== undefined) {
    assertOneOf(configured, LINTERS, 'linter');
    return configured;
  }
  return !tree.exists(BIOME_CONFIG_FILE_NAME) &&
    tree.exists(OXLINT_CONFIG_FILE_NAME)
    ? 'oxlint'
    : 'biome';
};

/**
 * The formatter the workspace uses, resolved the same way as
 * {@link resolveLinter}: oxfmt when only `.oxfmtrc.json` is present, biome
 * otherwise.
 */
export const resolveFormatter = (tree: Tree): Formatter => {
  const configured = readConfiguredTool(tree, 'formatter');
  if (configured !== undefined) {
    assertOneOf(configured, FORMATTERS, 'formatter');
    return configured;
  }
  return !tree.exists(BIOME_CONFIG_FILE_NAME) &&
    tree.exists(OXFMT_CONFIG_FILE_NAME)
    ? 'oxfmt'
    : 'biome';
};

function assertOneOf<T extends string>(
  value: string,
  allowed: readonly T[],
  key: string,
): asserts value is T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(
      `${key}.tool in ${AWS_NX_PLUGIN_CONFIG_FILE_NAME} must be one of ${allowed.join(', ')}`,
    );
  }
}

/**
 * Formatting runs on every generator, so a workspace without the config, or
 * one whose config is mid-edit and cannot be evaluated, must not fail here.
 */
const readConfiguredTool = (
  tree: Tree,
  key: 'linter' | 'formatter',
): string | undefined => {
  if (!tree.exists(AWS_NX_PLUGIN_CONFIG_FILE_NAME)) {
    return undefined;
  }
  try {
    return readAwsNxPluginConfig(tree)?.[key]?.tool;
  } catch {
    return undefined;
  }
};
