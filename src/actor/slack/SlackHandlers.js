import autobind from "autobind-decorator"
// import { timingSafeEqual } from "crypto"
import config from "config"
import { SlackParser } from "./slackParser"
import { defaultCipherList } from "constants"

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
    this.slackParser = new SlackParser(container)

    this.rtm.on("connected", this.onConnected)
    this.rtm.on("disconnected", () => {
      this.log.info("RTM client has disconnected from Slack")
    })
    this.rtm.on("message", this.onMessage)
    this.rtm.start()

    this.botChannelId = "GHLMQCMPH"
    this.userIdToUserMap = new Map()
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
    const isBotMessage = message.subtype && message.subtype == "bot_message"
    const isReplyMessage =
      message.subtype && message.subtype == "message_replied"

    this.log.info(`I GOT A MESSAGE: ${JSON.stringify(message, null, 2)} `)

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

    const sendingUser = this.userIdToUserMap.get(sendingUserId)

    if (!sendingUser) {
      this.log.warn(
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

    const parseResult = this.slackParser.parseCommand(text, ["#", "A"])
    this.log.info(`Command: ${JSON.stringify(parseResult, null, 2)}`)

    if (parseResult.parsed) {
      const handlers = this.getCommandHandlers()
      const command = parseResult.command
      const handler = handlers[command.name]
      if (handler) {
        // TODO: process and check arguments
        const parameters = this.parseArguments(command, handler, message)
        if (parameters)
          try {
            const handledOk = await handler.func({
              message,
              command,
              sendingUserId,
              sendingUser,
              isFromChannel,
            })
            if (handledOk) {
              this.log.info("Message handled.")
            } else {
              this.log.error(`Error handling message`)
            }
          } catch (ex) {
            this.log.error(`Exception handling message: ${ex.message}`)
          }
      } else {
        this.log.error(`A handler was not found for command: ${command.name}`)
      }
    } else {
      // command not recognized.  Look for proximate suggestions.
      const commandWord =
        message.text?.split(" ")[0] === `<@${botUserId}>`
          ? message.text?.split(" ")[1]
          : message.text?.split(" ")[0]

      this.log.warn(
        "****** USER HAS SUBMITTED AN UN-HANDLEABLE MESSAGE",
        message
      )
      const reply = `:poopfire: Command \`${commandWord}\` not recognized by COG. Do better, <@${
        message.user
      }>.`
      this.replyToChannel(reply, message)
    }
  }

  /**
   * Send reply text to channel.
   * @param {*} text
   * @param {*} message
   */
  replyToChannel(text, message) {
    const payload = {
      text,
      channel: message.channel,
      thread_ts: message.ts,
    }

    this.postMessage(payload)
  }

  /**
   * Return map of commands, metadata and handling function.
   */
  getCommandHandlers() {
    // test-bot channel id :: GHLMQCMPH
    const handlers = {
      stopBuildCommand: {
        command: "stopBuildCommand",
        name: "stop build",
        description: "stop a running build or remove from queue",
        example: "stop build 27",
        arguments: ["#"],
        func: this.doStopBuild,
        //regexp: /^stop +build +(bb-\d+)/i,
        // func: (slackResponse) =>
        //   this.doStop(slackResponse[1], isFromChannel, sendingUser),
      },
      testCommand: {
        command: "testCommand",
        name: "test",
        description: "Test the Slack Agent",
        example: "test",
        arguments: [],
        func: this.doTest,
        // regexp: /^test/i,
        // func: (slackResponse) => {
        //   const payload = {
        //     text: `:ghostbusters: Test triggered by ${userString}`,
        //   }
        //   this.postMessage(payload)
        // },
      },
      startBuildCommand: {
        command: "startBuildCommand",
        name: "build",
        description: "queue the build of a repository/branch",
        example: "build repo: myrepo branch: newbranch1 username: itsMe",
        arguments: ["repo!", "branch!", "userName"],
        func: this.doStartBuild,
        // regexp: /^build+([a-z0-9, \.]+)/i,
      },
      statusCommand: {
        commane: "statusCommand",
        name: "show status",
        description: "Show the status of the system",
        example: "show status",
        arguments: [],
        func: this.doShowStatus,
        // func: (slackResponse) => {
        //   const payload = {
        //     text: `:shell: Status update requested by ${userString}`,
        //   }
        //   this.postMessage(payload)
        // },
        // regexp: /^(?:show +)?status/,
      },
      createPullRequestCommand: {
        command: "createPullRequestCommand",
        name: "create pull-request",
        description:
          "create a new pull request on a repo and start pr build/test",
        example:
          "create pr repo:coolRepo branch: newBranch, title: 'a long title with spaces' ",
        arguments: ["repo!", "branch!", "title!"],
        func: this.doCreatePullRequest,

        //regexp: /^(pull-request|pr|create pr|create pull request)/i,
      },
      showBuildCommand: {
        command: "showBuildsCommand",
        arguments: ["#", "status"],
        name: "show builds",
        description: "show the last n builds with optional filtering",
        example: "show builds 10",
        func: this.doShowBuilds,
        // regexp: /^show +(?:last +([0-9]+) +)?builds/i,
        // func: (slackResponse) => {
        //   const payload = {
        //     text: `:page_with_curl: List of builds requested by ${userString}`,
        //   }
        //   this.postMessage(payload)
        // },
      },
      showReportCommand: {
        command: "showReportCommand",
        arguments: [],
        name: "show report",
        description: "show a report of stuff",
        example: "show report",
        func: this.doShowReport,
        // regexp: /^show report/i,
        // func: (slackResponse) => {
        //   const payload = {
        //     text: `:scroll: Report requested by ${userString}`,
        //   }
        //   this.postMessage(payload)
        // },
      },
      showQueueCommand: {
        command: "showQueueCommand",
        arguments: ["#", "status"],
        name: "show queue",
        description: "show the queue backlog",
        example: "show queue",
        func: this.doShowQueue,
        // regexp: /^show queue/i,
        // func: (slackResponse) => {
        //   const payload = {
        //     text: `:showmewhatyougot: Queue requested by ${userString}`,
        //   }
        //   this.postMessage(payload)
        // },
      },
      helpCommand: {
        command: "helpCommand",
        name: "help",
        description: "get Cog-Ci slack command help",
        example: "help build",
        arguments: ["command"],
        func: this.doHelp,
        // regexp: /^help/i,
        // func: (slackResponse) => {
        //   let messageResponse = `Here is a list of expected commands for the Cog-CI SlackBot:\n`
        //   const alphabetizedHandlers = handlers.sort((a, b) => {
        //     return a.name.localeCompare(b.name)
        //   })
        //   for (const handler in alphabetizedHandlers) {
        //     const currentHandler = handlers[handler]
        //     messageResponse += `\`${currentHandler.name}\`\n`
        //   }
        //   const payload = {
        //     channel: message.channel,
        //     text: `:sos: ${messageResponse}`,
        //     thread_ts: message.ts,
        //   }
        //   this.postMessage(payload)
        // },
      },
      // {
      //   name: "relay",
      //   regexp: /^relay(.*)/i,
      //   func: (slackResponse) => {
      //     const payload = {
      //       text: `:zap: Bitbucket Relay Requested by ${userString}`,
      //     }
      //     this.postMessage(payload)
      //   },
      // },
      // {
      //   name: "rollback",
      //   regexp: /^rollback/i,
      //   func: async (slackResponse) => {
      //     const params = ["repo", "tag"]
      //     let errors = []
      //     for (let param in params) {
      //       const currentParam = params[param]
      //       if (slackResponse.text.indexOf(currentParam + ":") === -1) {
      //         errors.push(currentParam)
      //       }
      //     }
      //     if (errors.length > 0) {
      //       // message user about errors / missing keys

      //       let messageResponse = `The following ${
      //         errors.length === 1 ? "key is" : "keys are"
      //       } missing from the request: `
      //       for (const error in errors) {
      //         messageResponse += `\`${errors[error]}\` `
      //       }
      //       messageResponse += `\nExample Usage:\n\`rollback repo: testRepo tag: testTag\``
      //       this.postMessage({
      //         text: messageResponse,
      //         channel: message.channel,
      //         thread_ts: message.ts,
      //         // as_user: false,
      //         // icon_emoji: ":x:",
      //       })
      //     } else {
      //       // TODO: call to schedule actor to create build
      //       // wait on reply
      //       // notify channel of build status
      //       let payload = {
      //         text: `:shell: Rollback initiated by ${userString}`,
      //       }
      //       this.postMessage(payload)
      //       try {
      //         const reply = await this.bitMQ.requestAndReply(
      //           config.serviceName.bit,
      //           "rollBackPreviousBuild",
      //           slackResponse
      //         )
      //       } catch (err) {
      //         const errPayload = {
      //           text: `:sos: Error completing Rollback made by ${userString}. Details: \`${
      //             err.message
      //           }\``,
      //         }
      //         this.postMessage(errPayload)
      //       }
      //     }
      //     return {}
      //   },
      // },
    }

    return handlers
  }

  // Command Handlers ========================================================

  async doTest(data) {
    this.log.info(`doTest data: ${JSON.stringify(data, null, 2)}`)
    return true
  }

  async doStartBuild(data) {
    this.log.info(`doStartBuild ${JSON.stringify(data, null, 2)}`)
    const message = data.message
    const userString = `<@${message.user}>`
    const payload = {
      text: `:building_construction: A Build request made by ${userString}`,
    }
    this.postMessage(payload)

    // try {
    //   const reply = await this.bitMQ.requestAndReply(
    //     config.serviceName.bit,
    //     "runBuild",
    //     message
    //   )
    // } catch (err) {
    //   const errPayload = {
    //     text: `:sos: Error completing Build made by ${userString}. Details: \`${
    //       err.message
    //     }\``,
    //   }
    //   this.postMessage(errPayload)
    // }
    return true
  }

  async doStopBuild(data) {
    this.log.info(`doStopBuild data: ${JSON.stringify(data, null, 2)}`)
    return true
  }

  async doCreatePullRequest(message) {
    this.log.info(`handlePullRequest: ${JSON.stringify(message, null, 2)}`)
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
