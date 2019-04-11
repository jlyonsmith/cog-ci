import config from "config"
import { MS, getLog, MQ } from "../../lib"
import { BitHandlers } from "./BitHandlers"
import assert from "assert"

class BitActor {
  async run() {
    const serviceNames = config.get("serviceName")
    let log = getLog(serviceNames.bit)
    let container = { log }

    try {
      const ms = new MS(serviceNames.bit, { durable: false }, container)
      const uri = await config.get("uri")

      container.ms = ms
      await ms.connect(uri.amqp)

      log.info(`Connected to RabbitMQ at ${uri.amqp}`)

      container.scheduleMQ = new MQ(config.serviceName.schedule, container)

      container.handlers = new BitHandlers(container)

      await ms.listen(container.handlers)
    } catch (error) {
      if (log) {
        log.error(error.message)
      }
      if (container.ms) {
        container.ms.disconnect()
      }
      throw error
    }
  }
}

const actor = new BitActor()

actor
  .run()
  .then((exitCode) => {
    process.exitCode = exitCode
  })
  .catch((error) => {
    console.log(error)
    process.exit(200)
  })
