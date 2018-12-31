import amqp from "amqplib"
import autobind from "autobind-decorator"
import createError from "http-errors"

@autobind
export class MS {
  constructor(exchangeName, options, container) {
    // These should never be left undefined
    this.amqp = container.amqp || amqp
    this.dispatchMessage = container.dispatchMessage || this.dispatchMessage

    // Provides mocks
    this.channel = container.channel
    this.connection = container.connection
    this.consumerTag = container.consumerTag
    this.log = container.log
    this.handlers = container.handlers
    this.options = options
    this.isProduction = process.env.NODE_ENV === "production"
    this.exchangeName = exchangeName
  }

  async connect(amqpUri) {
    this.connection = await this.amqp.connect(amqpUri)
    this.connection.on("error", (error) => {
      this.log.error(`${error}. Shutting down service.`)
      throw error
    })

    this.channel = await this.connection.createChannel()
    this.channel.prefetch(1) // Only process one message at a time
    return this
  }

  async listen(obj) {
    let handlers = {}
    let typeNames = ""
    this.handlersObject = obj // Save object to use for 'this' when calling the handler

    for (const key of Object.getOwnPropertyNames(obj.constructor.prototype)) {
      const val = obj[key]

      if (
        key !== "constructor" &&
        typeof val === "function" &&
        !key.startsWith("_")
      ) {
        handlers[key] = val

        if (!typeNames) {
          typeNames = `'${key}'`
        } else {
          typeNames += ", " + `'${key}'`
        }
      }
    }

    this.handlers = handlers

    let ok = await this.channel.assertExchange(this.exchangeName, "fanout", {
      durable: !!this.options.durable,
    })
    const q = await this.channel.assertQueue("", { exclusive: true })

    this.log.info(
      `Waiting for '${
        this.exchangeName
      }' exchange ${typeNames} messages in queue '${q.queue}'`
    )
    await this.channel.bindQueue(q.queue, this.exchangeName, "")
    this.consumerTag = this.channel.consume(q.queue, this.consumeMessage)
  }

  async disconnect() {
    if (this.channel) {
      if (this.consumerTag) {
        this.channel.cancel(this.consumerTag)
        this.consumerTag = null
      }

      await this.channel.close()
      this.channel = null
    }

    if (this.connection) {
      await this.connection.close()
      this.connection = null
    }
  }

  async consumeMessage(msg) {
    const { type, appId, replyTo, correlationId } = msg.properties
    const s = msg.content.toString()
    const content = JSON.parse(s)

    this.log.info(
      `Received '${type}' from '${appId} (correlation id ${correlationId})', ${s}`
    )
    const sendReply = (replyContent) => {
      if (content.passback) {
        replyContent = { ...replyContent, passback: content.passback }
      }
      this.channel.sendToQueue(
        replyTo,
        Buffer.from(JSON.stringify(replyContent)),
        {
          correlationId,
          appId,
          contentType: "application/json",
          timestamp: Date.now(),
          type,
        }
      )
    }

    try {
      const reply = await this.dispatchMessage(type, content)

      sendReply({ reply })
      this.channel.ack(msg)
      this.log.info(
        `Processed '${type}', ${JSON.stringify(
          reply
        )} (correlation id '${correlationId}')`
      )
    } catch (err) {
      this.log.error(
        `Failed to process '${type}' (correlation id '${correlationId}')`
      )
      if (!this.isProduction) {
        console.error(err)
      }
      sendReply({
        error: {
          status: err.status,
          message: err.message,
          detail: {
            exchange: this.exchangeName,
            message: type,
          },
        },
      })
      this.channel.ack(msg)
    }
  }

  dispatchMessage(type, content) {
    const handler = this.handlers[type]

    if (handler) {
      return handler.call(this.handlersObject, content)
    } else {
      return Promise.reject(
        createError.BadRequest(`Unknown message type '${type}'`)
      )
    }
  }

  // Used for intra-service requests
  async request(exchangeName, msgType, msg, correlationId) {
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
}
