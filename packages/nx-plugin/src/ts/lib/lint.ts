/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  type TargetConfiguration,
  type Tree,
  updateProjectConfiguration,
} from '@nx/devkit';
import { resolveFormatter, resolveLinter } from '../../utils/linter.js';
import { readProjectConfigurationUnqualified } from '../../utils/nx.js';
import { sortObjectKeys } from '../../utils/object.js';
import { biomeTargets, registerBiomeNamedInput } from './biome.js';
import type { ConfigureProjectOptions } from './types.js';

/**
 * The per-project `lint`/`format` targets for the workspace's chosen tools.
 * Only biome needs targets written per project: oxlint's `lint` is inferred by
 * `@nx/oxlint`, and oxfmt runs through `nx format` — so only the biome-owned
 * halves are returned, and the lint -> format edge only when biome formats.
 */
export const lintTargets = (
  tree: Tree,
): Partial<Record<'format' | 'lint', TargetConfiguration>> => {
  const lint = resolveLinter(tree) === 'biome';
  const format = resolveFormatter(tree) === 'biome';
  if (!lint && !format) {
    return {};
  }
  const targets = biomeTargets(tree);
  const { dependsOn: _dependsOn, ...lintWithoutFormatEdge } = targets.lint;
  return {
    ...(format ? { format: targets.format } : {}),
    ...(lint ? { lint: format ? targets.lint : lintWithoutFormatEdge } : {}),
  };
};

/** Add the project's `lint` and `format` targets per the workspace's tools. */
export const configureLint = async (
  tree: Tree,
  options: ConfigureProjectOptions,
) => {
  const targets = lintTargets(tree);
  if (Object.keys(targets).length === 0) {
    return;
  }
  const projectJson = readProjectConfigurationUnqualified(
    tree,
    options.fullyQualifiedName,
  );
  updateProjectConfiguration(tree, options.fullyQualifiedName, {
    ...projectJson,
    // Sort targets so the lint and format targets land in deterministic
    // positions regardless of whether they already existed (keeps re-runs
    // stable)
    targets: sortObjectKeys({
      ...projectJson?.targets,
      ...targets,
    }),
  });
  registerBiomeNamedInput(tree);
};
