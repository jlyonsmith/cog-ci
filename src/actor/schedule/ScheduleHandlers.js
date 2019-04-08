import autobind from "autobind-decorator"

@autobind
export class ScheduleHandlers {
  constructor(container) {
    this.db = container.db
    this.log = container.log
    this.buildIdSeqKey = "buildIdSeq"
    this.runDaemon = true // on by default
    this.daemonStatus = "stopped"
  }

  async init() {
    this._startDaemon()
  }

  // Public Methods ==================================
  /**
   * Add a new buid to the queue
   * @param {*} buildData
   */
  async queueBuild(buildData) {
    this.log.info(`Queue Build`)
    const newBuildId = await this._getNextBuildId()
    buildData.buildId = newBuildId
    buildData.status = "queued"
    const BuildRequest = this.db.BuildRequest
    try {
      const newBuildRequest = await BuildRequest.create(buildData)
      return { success: true, message: "success", data: newBuildRequest }
    } catch (ex) {
      return { success: false, message: ex.message }
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
    this.runDaemon = false
  }

  /**
   * Start the queue daemon if it is stopped
   */
  async startBuildQueue() {
    return { status: "running", length: 5 }
    this.runDaemon = true
  }

  async getCurrentBuild() {
    return {
      buildId: 205,
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
  async listBuildQueue(purpose = "*", status = "*", offset, limit) {
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

  // Internal Methods =====================================================
  async _getNextBuildId() {
    const Counter = this.db.Counter
    this.log.info(`getNextBuild find and update key:${this.buildIdSeqKey}`)
    let seqOut = await Counter.findOneAndUpdate(
      { _id: this.buildIdSeqKey },
      { $inc: { seq: 1 } },
      { new: true }
    )
    this.log.info(` seqOut: ${seqOut}`)
    if (seqOut == null) {
      let newSeq = new Counter({ _id: this.buildIdSeqKey, seq: 1 })
      seqOut = await newSeq.save()
    }
    return seqOut.seq
  }

  async _startDaemon() {}
}
