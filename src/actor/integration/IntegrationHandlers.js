/**
 * Build, Release, Test action agents
 */

import autobind from "autobind-decorator"

@autobind
export class IntegrationHandlers {
  constructor(container) {
    this.db = container.db
    this.log = container.log
  }

  async dummy(request) {
    return {}
  }
}
