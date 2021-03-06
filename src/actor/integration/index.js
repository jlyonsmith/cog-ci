import config from "config"
import { DB, MS, MQ, getLog, isProduction } from "../../lib"
import { IntegrationHandlers } from "./IntegrationHandlers"

class IntegrationActor {
  async run() {
    const serviceName = config.get("serviceName.integration")
    let log = getLog(serviceName)
    let container = { log }

    try {
      const ms = new MS(serviceName, { durable: false }, container)
      container.ms = ms
      const db = new DB(container)
      container.db = db
      const mq = new MQ(serviceName, container)
      container.mq = mq
      container.scheduleMQ = new MQ(config.serviceName.schedule, container)
      const uri = await config.get("uri")

      await Promise.all([
        db.connect(uri.mongo, isProduction),
        ms.connect(uri.amqp),
        mq.connect(uri.amqp),
        container.scheduleMQ.connect(uri.amqp),
      ])

      log.info(`Connected to MongoDB at ${uri.mongo}`)
      log.info(`Connected to RabbitMQ at ${uri.amqp}`)

      container.handlers = new IntegrationHandlers(container)

      await ms.listen(container.handlers)
    } catch (error) {
      if (log) {
        log.error(error.message)
      }
      if (container.ms) {
        container.ms.disconnect()
      }
      if (container.db) {
        container.db.disconnect()
      }
      throw error
    }
  }
}

const actor = new IntegrationActor()

actor
  .run()
  .then((exitCode) => {
    process.exitCode = exitCode
  })
  .catch((error) => {
    console.log(error)
    process.exit(200)
  })
