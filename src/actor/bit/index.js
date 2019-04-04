import config from "config"
import { DB, MS, getLog, isProduction } from "../../lib"
import { BitHandlers } from "./BitHandlers"
import Bitbucket from "bitbucket"
import assert from "assert"

class BitActor {
  async run() {
    const serviceName = config.get("serviceName.bit")
    let log = getLog(serviceName)
    let container = { log }

    const bb = new Bitbucket()
    bb.authenticate({
      type: "basic",
      username: config.bit.username,
      password: config.bit.appPassword, //Bitbucket App Password
    })

    try {
      //Return the repository from the Bitbucket API that matchces the name of the provided repo name

      // await bb.repositories
      //   .list({ username: config.bit.username })
      //   .then(({ data }) => {
      //     let newval = data.values.filter(
      //       (repo) => repo.name === config.bit.repo
      //     )
      //     return newval
      //   })
      //   .then((data) => console.log(data))

      //Create a Pull Request

      await bb.repositories
        .createPullRequest({
          repo_slug: config.bit.repo,
          username: config.bit.username,
          _body: { title: "My New PR", source: { branch: { name: "beta" } } },
        })
        .then(({ data, headers }) => console.log(data))

      const ms = new MS(serviceName, { durable: false }, container)
      const uri = await config.get("uri")

      container.ms = ms
      await ms.connect(uri.amqp)

      log.info(`Connected to RabbitMQ at ${uri.amqp}`)

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
