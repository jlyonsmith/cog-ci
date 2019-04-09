/**
 * Build, Release, Test action agents
 */

import config from "config"
import autobind from "autobind-decorator"

@autobind
export class IntegrationHandlers {
  constructor(container) {
    this.db = container.db
    this.log = container.log
    this.scheduleMQ = container.scheduleMQ
    this.scheduleExchange = config.get("serviceName.schedule")
    this.runningTask = null
  }

  async startTask(request) {
    this.log.info(`Integration.startTask: ${JSON.stringify(request, null, 2)}`)
    return { success: true, message: "success", data: request }
  }

  async checkTaskStatus(request) {
    this.log.info(
      `Integration.checkTaskStatus: ${JSON.stringify(request, null, 2)}`
    )
    return { success: true, message: "running" }
  }

  async killTask(request) {
    this.log.info(`Integration.killTask: ${JSON.stringify(request, null, 2)}`)
    return { success: true, message: "task killed" }
  }
}
