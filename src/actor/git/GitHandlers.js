import autobind from "autobind-decorator"

@autobind
export class GitHandlers {
  constructor(container) {
    this.db = container.db
    this.log = container.log
  }

  async dummy(request) {
    console.log("I RECEIVED A MESSAGE", request)
    return {}
  }
}
