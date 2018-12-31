import amqp from "amqplib"
import uuidv4 from "uuid/v4"
import autobind from "autobind-decorator"
import EventEmitter from "eventemitter3"
import createError from "http-errors"

@autobind
export class MQ extends EventEmitter {
  constructor(serviceName, container) {
    super()
    this.replyQueueName = `reply-${uuidv4()}`

    //dependency injection for imports
    //Use the import if not mocked.
    this.amqp = container.amqp || amqp
    this.appId = container.serviceName || serviceName
    this.EventEmitter = container.EventEmitter || EventEmitter
    this.createError = container.createError || createError

    // Dependency injection for functions: leave undefined if not mocked.
    this.connection = container.connection
    this.replyChannel = container.replyChannel
  }

  async connect(amqpUri) {
    this.connection = await this.amqp.connect(amqpUri)
    this.connection.on("error", (error) => {
      throw new Error(`RabbitMQ error, shutting down service. ${error.message}`)
    })

    this.replyChannel = (await this.connection.createChannel()) || {
      createChannel: () => {},
    }

    const q = await this.replyChannel.assertQueue(this.replyQueueName, {
      exclusive: true,
      durable: false,
    })

    if (!q) {
      throw new Error(`Could not create reply queue ${this.replyQueueName}`)
    }

    this.replyChannel.consume(q.queue, this.handleReply, { noAck: true })

    return this
  }

  handleReply(rawMsg) {
    const { type, correlationId, timestamp } = rawMsg.properties
    const content = JSON.parse(rawMsg.content.toString())
    const { error, reply, passback } = content
    let properties = {
      passback,
      correlationId,
      type,
      timestamp,
    }

    if (error) {
      this.emit(
        "error",
        createError(error.status, error.message, {
          detail: error.detail,
          properties,
        })
      )
    } else {
      this.emit("data", { properties, reply })
    }
  }

  async close() {
    await this.replyChannel.close()
    await this.connection.close()
  }

  async request(exchangeName, msgType, msg) {
    const correlationId = uuidv4()
    const channel = await this.connection.createChannel()

    await channel.checkExchange(exchangeName)
    await channel.publish(exchangeName, "", Buffer.from(JSON.stringify(msg)), {
      type: msgType,
      contentType: "application/json",
      timestamp: Date.now(),
      correlationId,
      appId: this.appId,
      replyTo: this.replyQueueName,
    })
    await channel.close()

    return correlationId
  }

  async requestAndReply(exchangeName, msgType, msg, timeout = 30 * 1000) {
    const correlationId = await this.request(exchangeName, msgType, msg)

    const replyPromise = new Promise((resolve, reject) => {
      this.on("data", (data) => {
        if (data.properties.correlationId === correlationId) {
          resolve(data)
        }
      })
      this.on("error", (error) => {
        if (error.properties.correlationId === correlationId) {
          reject(error)
        }
      })
    })

    const timeoutPromise = new Promise((resolve, reject) => {
      // This promise never resolves, it only rejects
      const id = setTimeout(() => {
        clearTimeout(id)
        reject(
          createError.RequestTimeout(
            `Request to ${exchangeName} with id ${correlationId} timed out in ${timeout}ms.`
          )
        )
      }, timeout)
    })

    return Promise.race([replyPromise, timeoutPromise])
  }
}
