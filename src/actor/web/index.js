import config from "config"
import express from "express"
import * as pinoExpress from "pino-pretty-express"
import http from "http"
import { DB, MQ, getLog, isProduction } from "../../lib"
import createError from "http-errors"
import * as Routes from "./routes"

class WebActor {
  async run() {
    const serviceName = config.get("serviceName.web")
    let log = getLog(serviceName)
    let container = { log }

    try {
      let app = express()
      let server = http.createServer(app)

      container.app = app
      container.server = server

      app.use(pinoExpress.config({ log }))

      const db = new DB(container)
      container.db = db
      const mq = new MQ(serviceName, container)
      container.mq = mq

      container.slackmq = new MQ(config.serviceName.slack, container)
      container.scheduleMQ = new MQ(config.serviceName.schedule, container)

      const uri = await config.get("uri")

      await Promise.all([
        db.connect(uri.mongo, isProduction),
        mq.connect(uri.amqp),
        container.slackmq.connect(uri.amqp),
        container.scheduleMQ.connect(uri.amqp),
      ])

      log.info(`Connected to MongoDB at ${uri.mongo}`)
      log.info(`Connected to RabbitMQ at ${uri.amqp}`)

      container.logRoutes = new Routes.LogRoutes(container)
      container.webhookRoutes = new Routes.WebhookRoutes(container)
      container.scheduleRoutes = new Routes.ScheduleRoutes(container)

      app.use(function(req, res, next) {
        res.status(404).json({
          message: "Not found",
        })
      })
      app.use(function(err, req, res, next) {
        if (!isProduction) {
          log.error(err)
        }

        if (!err.status) {
          err = createError.InternalServerError(err.message)
        }

        res.status(err.status).json({
          message: err.message,
          detail: err.detail,
        })
      })

      let port = config.get("web.port")
      server.listen(port)
      log.info(`Cog CI web server started on port ${port}`)
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
      if (container.rs) {
        container.rs.disconnect()
      }
      if (container.server) {
        container.server.close()
      }
      throw error
    }
  }
}

const actor = new WebActor()

actor
  .run()
  .then((exitCode) => {
    process.exitCode = exitCode
  })
  .catch((error) => {
    console.log(error)
    process.exit(200)
  })
