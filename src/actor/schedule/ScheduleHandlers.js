import autobind from "autobind-decorator"

@autobind
export class ScheduleHandlers {
  constructor(container) {
    this.db = container.db
    this.log = container.log
  }

  /**
   * Add a new buid to the queue
   * @param {*} buildData
   */
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

  /**
   * Stop the running job or remove it from the queue if it has not yet run
   * @param {*} buildId
   * @param {*} user
   */
  async stopBuild(buildId, user) {
    return { build: buildId, status: "stopped" }
  }

  /**
   * Stop the build queue daemon so that no more builds will start. This Does Not stop a running build
   */
  async pauseBuildQueue() {
    return { status: "paused", length: 5 }
  }

  /**
   * Start the queue daemon if it is stopped
   */
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

  /** Get the number of items in the queue (by status or all by default) */
  async getQueueLength(status = "*") {
    return { length: 5, status: "running", runningBuildId: 205 }
  }

  /**
   * Enumerate builds in the queue, with basic filtering
   * @param {*} type
   * @param {*} status
   * @param {*} offset
   * @param {*} limit
   */
  async listBuildQueue(type = "*", status = "*", offset, limit) {
    return { offset: offset, total: 0, builds: [] }
  }

  /**
   * Called by Builder Actor when build completed success or fail
   * @param {*} buildData
   */
  async onBuildComplete(buildData) {}

  async slackMessageReceived(message) {
    console.log("**************** MESSEGE RECEIVED BY SCHEDULER", message)
    return {}
  }
}
