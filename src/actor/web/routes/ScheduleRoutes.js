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
}
