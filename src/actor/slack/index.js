import config from "config"
import { DB, MS, getLog, isProduction, MQ } from "../../lib"
import { SlackHandlers } from "./SlackHandlers"
import { RTMClient } from "@slack/rtm-api"
import { WebClient } from "@slack/web-api"

class SlackActor {
  async run() {
    const serviceNames = config.get("serviceName")
    let log = getLog(serviceNames.slack)
    let container = { log }
    const uri = await config.get("uri")

    container.ms = new MS(serviceNames.slack, { durable: false }, container)
    container.db = new DB(container)
    container.slack = config.get("slack")
    container.rtm = new RTMClient(container.slack.token)
    container.web = new WebClient(container.slack.token)
    container.mq = new MQ(serviceNames.schedule, container)

    await Promise.all([
      container.db.connect(uri.mongo, isProduction),
      container.ms.connect(uri.amqp),
      container.mq.connect(uri.amqp),
    ])

    log.info(`Connected to MongoDB at ${uri.mongo}`)
    log.info(`Connected to RabbitMQ at ${uri.amqp}`)

    container.handlers = new SlackHandlers(container)

    process.on("unhandledRejection", (error) => {
      if (log) {
        log.error(error.message)
      }
      if (container.rtm) {
        container.rtm.disconnect()
      }
      if (container.ms) {
        container.ms.disconnect()
      }
      if (container.db) {
        container.db.disconnect()
      }
      throw error
    })

    await container.ms.listen(container.handlers)
  }
}

const actor = new SlackActor()

actor
  .run()
  .then((exitCode) => {
    process.exitCode = exitCode
  })
  .catch((error) => {
    console.log(error)
    process.exit(200)
  })
