#!/usr/bin/env node

import { run } from "@axi/cli";

import { notesResource } from "../resource.js";

const exitCode = await run(notesResource);
process.exitCode = exitCode;
