import autobind from "autobind-decorator"

@autobind
export class ScheduleHandlers {
  constructor(container) {
    this.db = container.db
    this.log = container.log
  }

  async dummy(request) {
    return {}
  }

  async slackMessageReceived(message) {
    console.log("**************** MESSEGE RECEIVED BY SCHEDULER", message)
    return {}
  }
}
