import autobind from "autobind-decorator"
// import { timingSafeEqual } from "crypto"
import config from "config"

@autobind
export class SlackHandlers {
  constructor(container) {
    this.db = container.db
    this.log = container.log
    this.slack = container.slack
    this.rtm = container.rtm
    this.web = container.web
    this.mq = container.mq
    this.bitMQ = container.bitMQ

    this.rtm.on("connected", this.onConnected)
    this.rtm.on("disconnected", () => {
      this.log.info("RTM client has disconnected from Slack")
    })
    this.rtm.on("message", this.onMessage)
    this.rtm.start()

    this.botChannelId = "GHLMQCMPH"
  }

  async onConnected() {
    const botUserId = this.rtm.activeUserId
    const usersListResponse = await this.web.users.list()
    this.userIdToUserMap = usersListResponse.members.reduce((map, user) => {
      map.set(user.id, user)
      return map
    }, new Map())

    this.log.info(
      `RTM client is connected to Slack as user id ${botUserId} (@${
        this.userIdToUserMap.get(botUserId).name
      }), team id ${this.rtm.activeTeamId}`
    )

    const conversationsListResponse = await this.rtm.webClient.conversations.list(
      { types: "private_channel" }
    )

    // TODO: Refresh this when it changes
    const conversationNameToId = conversationsListResponse.channels.reduce(
      (map, channel) => {
        map.set(channel.name, channel.id)
        return map
      },
      new Map()
    )

    this.buildChannelId = conversationNameToId.get(this.slack.buildChannel)

    if (!this.buildChannelId) {
      this.log.error(
        `Cannot get channel id for build channel ${this.slack.buildChannel}`
      )
    }

    this.log.info(
      `Slack build channel is #${this.buildChannelId} (@${
        this.slack.buildChannel
      })`
    )
    this.pullRequestChannelId = conversationNameToId.get(
      this.slack.pullRequestChannel
    )

    if (!this.pullRequestChannelId) {
      throw new Error(
        `Cannot get channel id for pull request channel ${
          this.slack.pullRequestChannel
        }`
      )
    }

    this.log.info(
      `Slack pull request channel is #${this.pullRequestChannelId} (@${
        this.slack.pullRequestChannel
      })`
    )
  }

  postMessage = (payload) => {
    let { channel, as_user } = payload
    channel = channel || this.botChannelId
    as_user = as_user === false ? as_user : true
    this.web.chat.postMessage({
      ...payload,
      channel,
      as_user,
    })
  }

  async onMessage(message) {
    const isUserMessage = message.subtype === undefined
    const isBotMessage = message.subtype && message.subtype !== "bot_message"

    console.log("I GOT A MESSAGE", message)

    // Only respoond to messages from users or bots
    if (!isUserMessage && !isBotMessage) {
      return
    }

    const text = message.text?.trim()

    // Nothing to do if no text
    if (!text) {
      return
    }

    const sendingUserId = message.user
    const botUserId = this.rtm.activeUserId

    // Don't respond if we sent the message
    if (sendingUserId === botUserId) {
      return
    }

    const sendingUserName = this.userIdToUserMap.get(sendingUserId)

    if (!sendingUserName) {
      this.log.warning(
        `Unable to identify name of user ${sendingUserId} to process a message`
      )
      return
    }

    const isFromChannel =
      message.channel[0] === "C" || message.channel[0] === "G"

    // Don't respond if the message is from a channel and our name is not in the message
    if (isFromChannel && !text.match(new RegExp("<@" + botUserId + ">"))) {
      return
    }

    const userString = `<@${message.user}>`

    // test-bot channel id :: GHLMQCMPH
    const handlers = [
      {
        name: "stop build",
        regexp: /^stop +build +(bb-\d+)/i,
        func: (slackResponse) =>
          this.doStop(slackResponse[1], isFromChannel, sendingUserName),
      },
      {
        name: "test",
        regexp: /^test/i,
        func: (slackResponse) => {
          const payload = {
            text: `:ghostbusters: Test triggered by ${userString}`,
          }
          this.postMessage(payload)
        },
      },
      {
        name: "build",
        regexp: /^build+([a-z0-9, \.]+)/i,
        func: this.handleBuild,
      },
      {
        name: "status | show status",
        regexp: /^(?:show +)?status/,
        func: (slackResponse) => {
          const payload = {
            text: `:shell: Status update requested by ${userString}`,
          }
          this.postMessage(payload)
        },
      },
      {
        name: "pull-request | pr | create pr | create pull request",
        regexp: /^(pull-request|pr|create pr|create pull request)/i,
        func: this.handlePullRequest,
        // func: async (slackResponse) => {
        //   const params = ["repo", "username", "title", "branch"]
        //   let errors = []
        //   for (let param in params) {
        //     const currentParam = params[param]
        //     if (slackResponse.text.indexOf(currentParam + ":") === -1) {
        //       errors.push(currentParam)
        //     }
        //   }
        //   if (errors.length > 0) {
        //     // message user about errors / missing keys

        //     let messageResponse = `The following ${
        //       errors.length === 1 ? "key is" : "keys are"
        //     } missing from the request: `
        //     for (const error in errors) {
        //       messageResponse += `\`${errors[error]}\` `
        //     }
        //     messageResponse += `\nExample Usage:\n\`pull-request repo: testRepo username: bpt-build title: newPRTitle branch: beta\``
        //     this.postMessage({
        //       text: messageResponse,
        //       channel: message.channel,
        //       thread_ts: message.ts,
        //       // as_user: false,
        //       // icon_emoji: ":x:",
        //     })
        //   } else {
        //     // TODO: call to schedule actor to create build
        //     // wait on reply
        //     // notify channel of build status
        //     let payload = {
        //       text: `:shell: Pull Request made by ${userString}`,
        //     }
        //     this.postMessage(payload)
        //     try {
        //       const reply = await this.bitMQ.requestAndReply(
        //         config.serviceName.bit,
        //         "createPullRequest",
        //         slackResponse
        //       )
        //     } catch (err) {
        //       const errPayload = {
        //         text: `:sos: Error completing Pull Request made by ${userString}. Details: \`${
        //           err.message
        //         }\``,
        //       }
        //       this.postMessage(errPayload)
        //     }
        //   }
        //   return {}
        // },
      },
      {
        name: "show builds | show last [0-9] builds",
        regexp: /^show +(?:last +([0-9]+) +)?builds/i,
        func: (slackResponse) => {
          const payload = {
            text: `:page_with_curl: List of builds requested by ${userString}`,
          }
          this.postMessage(payload)
        },
      },
      {
        name: "show report",
        regexp: /^show report/i,
        func: (slackResponse) => {
          const payload = {
            text: `:scroll: Report requested by ${userString}`,
          }
          this.postMessage(payload)
        },
      },
      {
        name: "show queue",
        regexp: /^show queue/i,
        func: (slackResponse) => {
          const payload = {
            text: `:showmewhatyougot: Queue requested by ${userString}`,
          }
          this.postMessage(payload)
        },
      },
      {
        name: "help",
        regexp: /^help/i,
        func: (slackResponse) => {
          let messageResponse = `Here is a list of expected commands for the Cog-CI SlackBot:\n`
          const alphabetizedHandlers = handlers.sort((a, b) => {
            return a.name.localeCompare(b.name)
          })
          for (const handler in alphabetizedHandlers) {
            const currentHandler = handlers[handler]
            messageResponse += `\`${currentHandler.name}\`\n`
          }
          const payload = {
            channel: message.channel,
            text: `:sos: ${messageResponse}`,
            thread_ts: message.ts,
          }
          this.postMessage(payload)
        },
      },
      {
        name: "relay",
        regexp: /^relay(.*)/i,
        func: (slackResponse) => {
          const payload = {
            text: `:zap: Bitbucket Relay Requested by ${userString}`,
          }
          this.postMessage(payload)
        },
      },
      {
        name: "rollback",
        regexp: /^rollback/i,
        func: async (slackResponse) => {
          const params = ["repo", "tag"]
          let errors = []
          for (let param in params) {
            const currentParam = params[param]
            if (slackResponse.text.indexOf(currentParam + ":") === -1) {
              errors.push(currentParam)
            }
          }
          if (errors.length > 0) {
            // message user about errors / missing keys

            let messageResponse = `The following ${
              errors.length === 1 ? "key is" : "keys are"
            } missing from the request: `
            for (const error in errors) {
              messageResponse += `\`${errors[error]}\` `
            }
            messageResponse += `\nExample Usage:\n\`rollback repo: testRepo tag: testTag\``
            this.postMessage({
              text: messageResponse,
              channel: message.channel,
              thread_ts: message.ts,
              // as_user: false,
              // icon_emoji: ":x:",
            })
          } else {
            // TODO: call to schedule actor to create build
            // wait on reply
            // notify channel of build status
            let payload = {
              text: `:shell: Rollback initiated by ${userString}`,
            }
            this.postMessage(payload)
            try {
              const reply = await this.bitMQ.requestAndReply(
                config.serviceName.bit,
                "rollBackPreviousBuild",
                slackResponse
              )
            } catch (err) {
              const errPayload = {
                text: `:sos: Error completing Rollback made by ${userString}. Details: \`${
                  err.message
                }\``,
              }
              this.postMessage(errPayload)
            }
          }
          return {}
        },
      },

      // when /build +([a-z0-9, \.]+)/i
      //   do_build $1, is_from_slack_channel, slack_user_name
      // when /(?:show +)?status/
      //   do_show_status
      // when /show +(?:last +([0-9]+) +)?builds/
      //   limit = $1.to_i unless $1.nil?
      //   if limit.nil? or limit < 5
      //     limit = 5
      //   end
      //   do_show_builds limit
      // when /show report/
      //   do_show_report
      // when /show queue/
      //   do_show_queue
      // when /help/i
      //   do_show_help is_from_slack_channel, slack_user_name
      // when /^relay(.*)/i # This must be sent directly to build-buddy
      //   do_relay $1, slack_user_name
      // else
      //   "Sorry#{is_from_slack_channel ? ' ' + slack_user_name : ''}, I'm not sure how to respond."
      //              end
    ]
    let hasHandler = false
    for (const handler in handlers) {
      const currentHandler = handlers[handler]
      const cleanText = message.text.replace(`<@${botUserId}>`, "").trim() // if a user addresses/tags @Cog-Ci, we don't want to parse that in our regex handling
      if (currentHandler.regexp.test(cleanText)) {
        hasHandler = true
        currentHandler.func(message)
        // optional "break" here (or check hasHandler) if we only ever want a single match in the handlers regex
      }
    }

    // respond if message is unhandled
    if (!hasHandler) {
      const commandWord =
        message.text?.split(" ")[0] === `<@${botUserId}>`
          ? message.text?.split(" ")[1]
          : message.text?.split(" ")[0]
      const payload = {
        channel: message.channel,
        text: `:poopfire: Command \`${commandWord}\` not recognized by COG. Do better, <@${
          message.user
        }>.`,
        thread_ts: message.ts,
      }
      console.log("****** USER HAS SUBMITTED AN UN-HANDLEABLE MESSAGE", message)
      this.postMessage(payload)
    } else {
      // message was successfully handled
      this.log.info("It's not a hamster!")
      this.mq.request(
        config.serviceName.schedule,
        "slackMessageReceived",
        message
      )
    }
  }

  // Command Handlers ========================================================

  async handlePullRequest(message) {
    const userString = `<@${message.user}>`

    const params = ["repo", "title", "branch"]
    let errors = []
    for (let param in params) {
      const currentParam = params[param]
      if (message.text.indexOf(currentParam + ":") === -1) {
        errors.push(currentParam)
      }
    }
    if (errors.length > 0) {
      // message user about errors / missing keys

      let messageResponse = `The following ${
        errors.length === 1 ? "key is" : "keys are"
      } missing from the request: `
      for (const error in errors) {
        messageResponse += `\`${errors[error]}\` `
      }
      messageResponse += `\nExample Usage:\n\`pull-request repo: testRepo title: newPRTitle branch: beta\``
      this.postMessage({
        text: messageResponse,
        channel: message.channel,
        thread_ts: message.ts,
        // as_user: false,
        // icon_emoji: ":x:",
      })
    } else {
      // TODO: call to schedule actor to create build
      // wait on reply
      // notify channel of build status
      // BDA: no creation of PR from bitbucket should trigger the pr build (test).

      let payload = {
        text: `:shell: Pull Request made by ${userString}`,
      }
      this.postMessage(payload)
      try {
        const reply = await this.bitMQ.requestAndReply(
          config.serviceName.bit,
          "createPullRequest",
          message
        )
      } catch (err) {
        const errPayload = {
          text: `:sos: Error completing Pull Request made by ${userString}. Details: \`${
            err.message
          }\``,
        }
        this.postMessage(errPayload)
      }
    }
    return {}
  }

  async handleBuild(message) {
    const userString = `<@${message.user}>`
    const payload = {
      text: `:building_construction: A Build request made by ${userString}`,
    }
    this.postMessage(payload)

    try {
      const reply = await this.bitMQ.requestAndReply(
        config.serviceName.bit,
        "runBuild",
        message
      )
    } catch (err) {
      const errPayload = {
        text: `:sos: Error completing Build made by ${userString}. Details: \`${
          err.message
        }\``,
      }
      this.postMessage(errPayload)
    }
  }

  // End Command Handlers ======================================================

  async notifyChannel(request) {
    const payload = {
      channel: request.channel || this.botChannelId,
      text:
        `:airhorn: ${request.message || request.text}` ||
        ":dumpster_fire: Channel notification requested without specifying content.",
    }
    this.postMessage(payload)
    return {}
  }
}
