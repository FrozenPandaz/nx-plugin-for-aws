/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Containers } from '../utils/containers.js';
import { Iac } from '../utils/iac.js';
import type { Formatter, Linter } from '../utils/linter.js';

export type InitContainersOption = Containers | 'infer';

export interface InitGeneratorSchema {
  readonly iac: Iac;
  readonly mcp?: boolean;
  readonly containers?: InitContainersOption;
  readonly gitSecrets?: boolean;
  readonly linter?: Linter;
  readonly formatter?: Formatter;
  readonly preferInstallDependencies?: boolean;
}
