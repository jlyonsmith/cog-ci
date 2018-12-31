import config from "config"
import { DB, MS, getLog, isProduction } from "../../lib"
import { ScheduleHandlers } from "./ScheduleHandlers"

class ScheduleActor {
  async run() {
    const serviceName = config.get("serviceName.schedule")
    let log = getLog(serviceName)
    let container = { log }

    try {
      const ms = new MS(serviceName, { durable: false }, container)

      container.ms = ms

      const db = new DB(container)

      container.db = db

      const uri = await config.get("uri")

      await Promise.all([
        db.connect(
          uri.mongo,
          isProduction
        ),
        ms.connect(uri.amqp),
      ])

      log.info(`Connected to MongoDB at ${uri.mongo}`)
      log.info(`Connected to RabbitMQ at ${uri.amqp}`)

      container.handlers = new ScheduleHandlers(container)

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

const actor = new ScheduleActor()

actor
  .run()
  .then((exitCode) => {
    process.exitCode = exitCode
  })
  .catch((error) => {
    console.log(error)
    process.exit(200)
  })
