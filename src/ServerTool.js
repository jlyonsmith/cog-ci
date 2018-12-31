import childProcess from "child_process"
import path from "path"
import timers from "timers"
import autobind from "autobind-decorator"
import config from "config"

@autobind
export class ServerTool {
  constructor(toolName, log) {
    this.toolName = toolName
    this.log = log
    this.actors = config.get("actors")
  }

  restart(actor) {
    const timeSinceStart = Date.now() - actor.startTime

    if (timeSinceStart < actor.timeToInit) {
      actor.backOff += 1
    } else {
      actor.backOff = 0
    }

    const backOffTime = (Math.pow(2, Math.min(actor.backOff, 7)) - 1) * 1000

    if (backOffTime > 0) {
      this.log.warn(
        `Actor '${actor.name}' died quickly, waiting ${Math.floor(
          backOffTime / 1000
        )} seconds to restart`
      )
    } else {
      this.log.warn(`Actor ${actor.name} died, restarting`)
    }

    timers.setTimeout(() => {
      actor.starts += 1
      actor.startTime = Date.now()
      actor.proc = childProcess.fork(actor.modulePath)
      actor.proc.on("exit", (code, signal) => {
        // Don't restart if the exit was clean or Control+C
        if (code === 0 || signal === "SIGINT") {
          this.log.info(`Actor ${actor.name} terminated normally`)
          return
        }

        this.restart(actor)
      })
      this.log.info(`Restarted actor '${actor.name}', pid ${actor.proc.pid}`)
    }, backOffTime)
  }

  async run() {
    let promises = []

    this.actors.forEach((actor) => {
      promises.push(
        new Promise((resolve, reject) => {
          actor.modulePath = path.join(__dirname, "actor", actor.name)
          actor.startTime = Date.now()
          actor.backOff = 0
          actor.timeToInit = actor.timeToInit || 10000
          actor.proc = childProcess.fork(actor.modulePath)
          actor.proc.on("exit", (code, signal) => {
            const timeSinceStart = Date.now() - actor.startTime

            if (timeSinceStart < actor.timeToInit) {
              this.log.error(
                `Actor '${actor.name}' exited during initialization`
              )

              if (this.actors) {
                this.actors.forEach((otherActor) => {
                  if (otherActor !== actor) {
                    this.log.info(
                      `Terminating actor ${actor.name}, pid ${
                        otherActor.proc.pid
                      }`
                    )
                    otherActor.proc.kill("SIGINT")
                    otherActor.proc = null
                  }
                })

                actor.proc = null
                this.actors = null
              }

              return reject(
                new Error("All actors must initialize on first start")
              )
            }

            this.restart(actor)
          })
          timers.setTimeout(() => {
            if (actor.proc) {
              resolve()
            }
          }, actor.timeToInit)
          this.log.info(`Started actor '${actor.name}', pid ${actor.proc.pid}`)
        })
      ) // new Promise()
    })

    return Promise.all(promises)
  }
}
