import autobind from "autobind-decorator"
import config from "config"

@autobind
export class ScheduleHandlers {
  constructor(container) {
    this.db = container.db
    this.log = container.log
    this.buildIdSeqKey = "buildIdSeq"
    this.runDaemon = true // the damon should run whenever there is work to do in the queue.
    this.daemonStatus = "stopped" // status: stopped: turned off;  waiting: on but nothing in the queue so not actually running; running: active, looking for job or monitoring job.
    this.daemonTimer = null
    this.daemonIntervalMilliseconds = config.get("schedule.pollSeconds") * 1000
    this.buildTimeoutMilliseconds =
      config.get("schedule.processTimeoutSeconds") * 1000
    this.runningBuildId = null
    this.integrationMQ = container.integrationMQ
    this.integrationExchange = config.get("serviceName.integration")
  }

  async init() {
    this._startDaemon()
  }

  // Public Methods ==================================
  /**
   *
   * @param {*} buildData
   */
  async processSlackMessage(message) {
    this.log.info(
      `Message received from slack: ${JSON.stringify(message, null, 2)}`
    )
    return { received: true }
  }

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
   * This does not stop the daemon. If there are queued jobs, it will then pick up the next.
   * @param {*} buildId
   * @param {*} user
   */
  async stopBuild(request) {
    const { buildId, status, user } = request
    this.log.info(`Stopping Process: ${buildId} ... `)
    // call to integration service
    const integrationResponse = await this.integrationMQ.requestAndReply(
      this.integrationExchange,
      "killTask",
      { buildId: this.runningBuildId }
    )
    this.log.info(
      `Kill Integration Response Process: ${JSON.stringify(
        integrationResponse
      )} `
    )
    await this._updateBuildRequest(buildId, { status, endTime: new Date() })

    return { build: buildId, status: "stopped" }
  }

  async getBuildDaemonStatus() {
    const queueLengthData = await this.getQueueLength({ status: "queued" })
    const queueLength = queueLengthData.data.count
    const result = {
      daemonStatus: this.daemonStatus,
      runningBuildId: this.runningBuildId || "none",
      daemonInterval: this.daemonIntervalMilliseconds,
      queuedBuilds: queueLength,
    }
    return result
  }

  /**
   * Stop the build queue daemon so that no more builds will start. This Does Not stop a running build
   */
  async stopBuildDaemon() {
    this.runDaemon = false
    await this._stopDaemon()
    return await this.getBuildDaemonStatus()
  }

  /**
   * Start the queue daemon if it is stopped
   */
  async startBuildDaemon() {
    this.runDaemon = true
    await this._startDaemon()
    return await this.getBuildDaemonStatus()
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
      // this.log.info(`next build ${JSON.stringify(result)}`)
      return {
        success: true,
        message: "",
        found: result.length,
        data: result[0],
      }
    } catch (ex) {
      return { success: false, message: ex.message, found: 0, data: null }
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
    const total = await BuildRequest.countDocuments(find)
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
      const data = await query.exec()
      return { success: true, message: "success", offset, total, data }
    } catch (ex) {
      return { success: false, message: ex.message }
    }
  }

  /**
   * Called by Builder Actor when build completed success or fail
   * @param {*} buildData
   */
  async onBuildComplete(resultData) {
    const now = new Date()
    const buildId = resultData.buildId
    this.log.info(
      `onBuildComplete data: ${JSON.stringify(resultData, null, 2)}`
    )

    let update = {}
    if (resultData.success) {
      update = {
        stopTime: now,
        status: "success",
        resultMessage: resultData.message,
      }
    } else {
      update = {
        stopTime: now,
        status: "fail",
        resultMessage: resultData.message,
      }
    }
    const updated = await this._updateBuildRequest(buildId, update)
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

  async _updateBuildRequest(buildId, document) {
    const BuildRequest = this.db.BuildRequest
    try {
      const condition = { buildId: { $eq: buildId } }
      const result = await BuildRequest.updateOne(condition, document)
      return result.nModified
    } catch (ex) {
      return false
    }
  }

  // Daemon methods and handlers ==========================================
  async _startDaemon() {
    if (this.runDaemon) {
      const nextBuild = await this.getNextBuild()
      if (nextBuild.found > 0) {
        if (this.daemonStatus != "running") {
          this.daemonTimer = setInterval(
            this._onDaemonTimer,
            this.daemonIntervalMilliseconds,
            this
          )
          this.daemonStatus = "running"
          this.log.info(
            `Daemon started with interval: ${
              this.daemonIntervalMilliseconds
            } milliseconds`
          )
        } else {
          this.log.info("Daemon is already running. Request ignored.")
        }
      } else {
        // no queued builds, pause the daemon (do not start it.)
        this.daemonStatus = "paused"
        this.log.info(
          `There are no queued builds. Daemon going into paused mode.`
        )
        return false
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
    this.log.info("Daemon Halted")
    this.daemonStatus = "stopped"
  }

  async _onDaemonTimer(origin) {
    const daemonNow = new Date()
    this.log.info(`onDaemonTimer ${daemonNow.toISOString()}`)

    // Get current running build
    const runningBuild = await this.getRunningBuild()
    if (runningBuild.found > 0) {
      // if found,
      //  check runtime and
      //    terminate if running too long

      this.runningBuildId = runningBuild.data.buildId
      const startTime = runningBuild.data.startTime
      this.log.info(
        `Running build found: ${this.runningBuildId} started: ${startTime}`
      )

      if (startTime) {
        const timeout = startTime.getTime() + this.buildTimeoutMilliseconds
        this.log.info(
          `Checking for timeout ${timeout} < ${daemonNow.getTime()}`
        )
        if (timeout < daemonNow.getTime()) {
          // build timed out.
          this.log.warn(
            `Build buildId: ${this.runningBuildId} timed out. Stopping`
          )
          await this.stopBuild({
            buildId: this.runningBuildId,
            status: "timeout",
            user: null,
          })
        } else {
          // Check status of build.
          this.log.info("Check build status....")
          const integrationResponse = await this.integrationMQ.requestAndReply(
            this.integrationExchange,
            "checkTaskStatus",
            runningBuild.data
          )
          this.log.info(
            `Status response: ${JSON.stringify(integrationResponse)}`
          )
        }
      } else {
        this.log.error(
          `Build buildId: ${this.runningBuildId}, start time not recorded`
        )
        await this.stopBuild({
          buildId: this.runningBuildId,
          status: "killed",
          user: null,
        })
      }
    } else {
      this.log.info(`No running build, find next`)
      const nextBuild = await this.getNextBuild()
      if (nextBuild.found > 0) {
        const nextBuildId = nextBuild.data.buildId

        this.log.info(`startTask request ...`)
        const integrationResponse = await this.integrationMQ.requestAndReply(
          this.integrationExchange,
          "startTask",
          nextBuild.data
        )

        const integrationReply = integrationResponse.reply
        this.log.info(
          `startTask reply: ${JSON.stringify(integrationReply, null, 2)}`
        )
        if (integrationReply.success == true) {
          // record running build
          const updated = await this._updateBuildRequest(nextBuildId, {
            startTime: daemonNow,
            status: "running",
          })
          this.runningBuildId = nextBuild.data.buildId
        } else {
          this.log.warn(
            `Integration task start failed: ${integrationReply.message}`
          )
          const updated = await this._updateBuildRequest(nextBuildId, {
            status: "fail",
          })
          this.runningBuildId = null
        }
      } else {
        // put the daemon to sleep until something pushed
        this.runningBuildId = null
        this.log.info(
          `Queue is empty, pushing pause on daemon until next reqest`
        )
        await this._stopDaemon()
      }
    }
  }
}
