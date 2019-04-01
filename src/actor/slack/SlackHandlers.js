import autobind from "autobind-decorator"
import { timingSafeEqual } from "crypto"

@autobind
export class SlackHandlers {
  constructor(container) {
    this.db = container.db
    this.log = container.log
    this.slack = container.slack
    this.rtm = container.rtm
    this.web = container.web

    this.rtm.on("connected", this.onConnected)
    this.rtm.on("disconnected", () => {
      this.log.info("RTM client has disconnected from Slack")
    })
    this.rtm.on("message", this.onMessage)
    this.rtm.start()
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

  async onMessage(message) {
    console.log(message)

    const isUserMessage = message.subtype === undefined
    const isBotMessage = message.subtype && message.subtype !== "bot_message"

    // Only respoond to messages from users or bots
    if (!isUserMessage && !isBotMessage) {
      return
    }

    const text = message.text.trim()

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

    // Don't responding if the message is from a channel and our nome is not in the message
    if (isFromChannel && !text.match(new RegExp("<@" + botUserId + ">"))) {
      return
    }

    const handlers = [
      {
        regexp: /stop +build +(bb-\d+)/i,
        func: (arr) => this.doStop(arr[1], isFromChannel, sendingUserName),
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

    this.log.info("It's not a hamster!")
  }

  async notifyChannel(request) {
    return {}
  }
}
