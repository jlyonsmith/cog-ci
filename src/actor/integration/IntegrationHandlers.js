/**
 * Build, Release, Test action agents
 */

import config from "config"
import autobind from "autobind-decorator"
import { execFile, exec } from "child_process"
import fs from "fs"
import fsx from "fs-extra"
import path from "path"

@autobind
export class IntegrationHandlers {
  constructor(container) {
    this.db = container.db
    this.log = container.log

    this.scheduleMQ = container.scheduleMQ
    this.scheduleExchange = config.get("serviceName.schedule")

    this.rootPath = config.get("integration.rootPath")
    this.templateDir = config.get("integration.templateDir")
    this.repoHost = config.get("integration.repoHost")

    this.buildId = null // id of current or last "build" request
    this.process = null // if running, current child process
    this.processStatus = "" // "",  "running", "success", "fail", "killed"
    this.processStdout = "" // last stdout
    this.processStderr = "" // last stderr
  }

  // Public Methods ======================================
  async startTask(request) {
    let response = { success: true, message: "", data: null }
    this.log.info(`Integration.startTask: ${JSON.stringify(request, null, 2)}`)

    this.buildId = request.buildId
    const dirCreated = await this._setupDirectory(request)
    if (dirCreated.success) {
      this._runProcess(dirCreated.path, request)
      this.log.info("Process Started")
    } else {
      response[success] = false
      response[message] = dirCreated.message
    }
    return response
  }

  async checkTaskStatus(request) {
    // this.log.info(
    //   `Integration.checkTaskStatus: ${JSON.stringify(request, null, 2)}`
    // )
    let result = { status: this.processStatus }
    if (this.process) {
      result = {
        buildId: this.buildId,
        status: this.processStatus,
        pid: this.process.pid,
      }
    } else {
      result = {
        buildId: this.buildId,
        status: this.processStatus,
        output: this.processStdout,
      }
    }
    return result
  }

  async killTask(request) {
    this.log.info(`Integration.killTask: ${JSON.stringify(request, null, 2)}`)
    if (this.process) {
      this.log.warn(
        `Killing process: buildId: ${this.buildId}, pid: ${this.process.pid}`
      )
      this.process.kill()
      this.process = null
      this.processStatus = "killed"
      return { success: true, message: "task killed" }
    } else {
      this.log.warn(`No process to kill. Ignoring.`)
      return { success: false, message: "not process currently running" }
    }
  }

  // Private Methods ======================================

  async _setupDirectory(request) {
    const workingDir = `${request.purpose}-${request.buildId}`
    const templatePath = path.join(this.rootPath, this.templateDir)
    const workingPath = path.join(this.rootPath, workingDir)
    this.log.info(
      `Creating working directory. Template: ${templatePath}  Working: ${workingPath}`
    )
    try {
      await fsx.copy(templatePath, workingPath)
      this.log.info(`Working directory created`)
      return { success: true, message: "success", path: workingPath }
    } catch (ex) {
      this.log.error(`Error creating working directory`)
      return { success: false, message: ex.message, path: null }
    }
  }

  async _runProcess(directory, request) {
    const repoFullName = request.repoFullName
    const [repoOwner, repoName] = repoFullName.split("/")

    const execPath = path.join(directory, "bootstrap.sh")
    const args = [request.purpose, this.repoHost, repoOwner, repoName]
    const options = { cwd: directory }
    const self = this
    this.processStdout = ""
    this.processStderr = ""
    this.log.info(`Running task at ${execPath}...`)
    this.process = execFile(
      execPath,
      args,
      options,
      (error, stdout, stderr) => {
        let result = {}
        if (error) {
          self.log.error(`Process Error :${error.message} `)
          self.process = null
          self.processStderr = stderr
          self.processStatus = "fail"
          result = { buildId: self.buildId, success: false, message: stderr }
        } else {
          this.log.info(
            `Process completed \nstdout: ${stdout} \nstderr: ${stderr}`
          )
          self.processStdout = stdout
          self.processStderr = stderr
          self.process = null
          self.processStatus = "success"
          result = { buildId: self.buildId, success: true, message: stdout }
        }
        // fire and forget callback to Scheduler with process termination info.
        this.log.info(
          `Sending onBuildComplete to Scheduler: ${JSON.stringify(
            result,
            null,
            2
          )}`
        )
        this.scheduleMQ.request(
          this.scheduleExchange,
          "onBuildComplete",
          result
        )
      }
    )
    this.processStatus = "running"
  }
}
