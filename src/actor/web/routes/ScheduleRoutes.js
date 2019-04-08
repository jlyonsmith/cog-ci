import autobind from "autobind-decorator"
import config from "config"

@autobind
export class ScheduleRoutes {
  constructor(container) {
    const app = container.app

    this.log = container.log
    this.scheduleMQ = container.scheduleMQ
    this.scheduleExchange = config.get("serviceName.schedule")

    app.route("/buildQueue/queueBuild").post(this.queueBuild)
    app.route("/buildQueue/stopBuild/:buildId").post(this.stopBuild)
    app.route("/buildQueue").get(this.listBuildQueue)
    app.route("/buildQueue/length").get(this.getQueueLength)
    app.route("/buildQueue/next").get(this.getNextBuild)
    app.route("/buildQueue/running").get(this.getRunningBuild)
  }

  async queueBuild(req, res, next) {
    const request = req.body
    this.log.info(`queueBuild request: ${JSON.stringify(request)}`)
    const reply = await this.scheduleMQ.requestAndReply(
      this.scheduleExchange,
      "queueBuild",
      request
    )
    this.log.info(`schedule reply: ${JSON.stringify(reply)}`)
    res.json(reply.reply)
  }

  async stopBuild(req, res, next) {
    const request = req.body
    const id = req.params.id
    this.log.info(`stopBuild id: ${id}`)
    res.json({ success: true })
  }

  async listBuildQueue(req, res, next) {
    let offset = req.query.offset || 0
    offset = parseInt(offset)

    let limit = req.query.limit || 100
    limit = parseInt(limit)
    const purpose = req.query.purpose || ""
    const status = req.query.status || ""

    this.log.info(`listBuildQueue: ${JSON.stringify(req.query)}`)
    const request = { offset, limit, purpose, status }
    const reply = await this.scheduleMQ.requestAndReply(
      this.scheduleExchange,
      "listBuildQueue",
      request
    )
    this.log.info(`list reply: ${JSON.stringify(reply)}`)
    res.json(reply.reply)
  }

  async getQueueLength(req, res, next) {
    const status = req.query.status || ""

    const request = { status }
    const reply = await this.scheduleMQ.requestAndReply(
      this.scheduleExchange,
      "getQueueLength",
      request
    )
    res.json(reply.reply)
  }

  async getNextBuild(req, res, next) {
    const request = {}
    const reply = await this.scheduleMQ.requestAndReply(
      this.scheduleExchange,
      "getNextBuild",
      request
    )
    res.json(reply.reply)
  }

  async getRunningBuild(req, res, next) {
    const request = {}
    const reply = await this.scheduleMQ.requestAndReply(
      this.scheduleExchange,
      "getRunningBuild",
      request
    )
    res.json(reply.reply)
  }
}
