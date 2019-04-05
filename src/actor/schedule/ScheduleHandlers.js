import autobind from "autobind-decorator"

@autobind
export class ScheduleHandlers {
  constructor(container) {
    this.db = container.db
    this.log = container.log
  }

  async queueBuild(buildData) {
    this.log.info(`Queue Build`)
    return {
      buildId: 99,
      status: "queued",
      queueStatus: "running",
      queueLength: 5,
      buildData,
    }
  }

  async stopBuild(buildId, user) {
    return { build: buildId, status: "stopped" }
  }

  async pauseBuildQueue() {
    return { status: "paused", length: 5 }
  }

  async startBuildQueue() {
    return { status: "running", length: 5 }
  }

  async getCurrentBuild() {
    return {
      build_id: 205,
      status: "building",
      data: { user: "me", type: "pullRequest", repository: "it" },
    }
  }
  async getQueueLength() {
    return { length: 5, status: "running", runningBuildId: 205 }
  }

  async listBuildQueue(offset, limit) {
    return { offset: offset, total: 0, builds: [] }
  }

  async slackMessageReceived(message) {
    console.log("**************** MESSEGE RECEIVED BY SCHEDULER", message)
    return {}
  }
}
