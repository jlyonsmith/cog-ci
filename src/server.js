#!/usr/bin/env node
import { ServerTool } from "./ServerTool"
import { getLog } from "./lib"
import path from "path"
import config from "config"

const serviceName = config.get("serviceName.server")
let log = getLog(serviceName)
const tool = new ServerTool(path.basename(process.argv[1], ".js"), log)

tool
  .run(process.argv.slice(2))
  .then((exitCode) => {
    process.exitCode = exitCode
  })
  .catch((err) => {
    console.error(err)
    process.exit(200)
  })
