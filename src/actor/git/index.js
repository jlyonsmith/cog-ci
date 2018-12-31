import config from "config"
import { MS, getLog, isProduction } from "../../lib"
import { GitHandlers } from "./GitHandlers"

class GitActor {
  async run() {
    const serviceName = config.get("serviceName.git")
    let log = getLog(serviceName)
    let container = { log }

    try {
      const ms = new MS(serviceName, { durable: false }, container)
      const uri = await config.get("uri")

      container.ms = ms
      await ms.connect(uri.amqp)

      log.info(`Connected to RabbitMQ at ${uri.amqp}`)

      container.handlers = new GitHandlers(container)

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

const actor = new GitActor()

actor
  .run()
  .then((exitCode) => {
    process.exitCode = exitCode
  })
  .catch((error) => {
    console.log(error)
    process.exit(200)
  })
