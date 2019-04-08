import autobind from "autobind-decorator"

@autobind
export class ScheduleHandlers {
  constructor(container) {
    this.db = container.db
    this.log = container.log
    this.buildIdSeqKey = "buildIdSeq"
    this.runDaemon = true // the damon should run whenever there is work to do in the queue.
    this.daemonStatus = "stopped"
    this.daemonTimer = null
    this.daemonInterval = 5000 // milliseconds
    this.runnigBuild = null
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
      this._startDaemon() // ensure the daemon is running if enabled.
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
    this.runDaemon = false
    this._stopDaemon()
    return { status: "paused", length: 5 }
  }

  /**
   * Start the queue daemon if it is stopped
   */
  async startBuildQueue() {
    this.runDaemon = true
    this._startDaemon()
    return { status: "running", length: 5 }
  }

  async getNextBuild() {
    return await this._getNextBuild("queued")
  }

  async getRunningBuild() {
    return await this._getNextBuild("running")
  }

  async _getNextBuild(status) {
    const filter = { status: { $eq: status } }
    const sortSpec = { buildId: 1 }
    const BuildRequest = this.db.BuildRequest

    try {
      const query = BuildRequest.find(filter)
        .skip(0)
        .limit(1)
        .sort(sortSpec)
      const result = await query.exec()
      return { success: true, message: "", data: result[0] }
    } catch (ex) {
      return { success: false, message: ex.message, data: null }
    }
  }

  /** Get the number of items in the queue (by status or all by default) */
  async getQueueLength(request) {
    const { status } = request
    let filter = {}
    if (status != "") {
      filter["status"] = { $eq: status }
    }
    const BuildRequest = this.db.BuildRequest
    try {
      const query = BuildRequest.find(filter).count()
      const result = await query.exec()
      return { success: true, message: "success", data: { count: result } }
    } catch (ex) {
      return { success: false, message: ex.message }
    }
  }

  /**
   * Enumerate builds in the queue, with basic filtering
   * @param {*} type
   * @param {*} status
   * @param {*} offset
   * @param {*} limit
   */
  async listBuildQueue(request) {
    const { purpose, status, offset, limit } = request
    let find = {}
    if (purpose != "") {
      find["purpose"] = { $eq: purpose }
    }
    if (status != "") {
      find["status"] = { $eq: status }
    }
    const BuildRequest = this.db.BuildRequest
    // this.log.info(`listBuildQueue find:
    // purpose:${purpose}  status:${status} find: ${JSON.stringify(
    //   find,
    //   null,
    //   2
    // )}`)
    try {
      const query = BuildRequest.find(find)
        .skip(offset)
        .limit(limit)
        .sort({ buildId: 1 })
      const result = await query.exec()
      return { success: true, message: "success", data: result }
    } catch (ex) {
      return { success: false, message: ex.message }
    }
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

  // Daemon methods and handlers ==========================================
  async _startDaemon() {
    if (this.runDaemon) {
      if (this.daemonStatus != "running") {
        this.daemonTimer = setInterval(
          this._onDaemonTimer,
          this.daemonInterval,
          this
        )
        this.daemonStatus = "running"
        this.log.info(
          `Daemon started with interval: ${this.daemonInterval} milliseconds`
        )
      } else {
        this.log.info("Daemon is already running. Request ignored.")
      }

      return true
    } else {
      this.log.warning(
        "The Daemon is disabled. Run 'startBuildQueue' to enable it."
      )
      this.daemonStatus = "stopped"
      return false
    }
  }

  async _stopDaemon() {
    clearInterval(this.daemonTimer)
    this.log.info("Daemon Stopped")
    this.daemonStatus = "stopped"
  }

  async _onDaemonTimer(origin) {
    const now = new Date()
    this.log.info(`onDaemonTimer ${now.toISOString()}`)
  }
}
