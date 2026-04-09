#!/usr/bin/env node

import { run } from "@axi/cli";

import { gitResource } from "../resource.js";

const exitCode = await run(gitResource);
process.exitCode = exitCode;
