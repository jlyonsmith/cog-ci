import autobind from "autobind-decorator"
import config from "config"
import { catchAll } from "."
import bodyParser from "body-parser"

@autobind
export class WebhookRoutes {
  constructor(container) {
    const app = container.app

    this.log = container.log
    this.slackmq = container.slackmq

    app
      .use(bodyParser.json())
      .post("/bitbucket_hooks", catchAll(this.getWebhook))
  }

  async getWebhook(req, res, next) {
    const BBCloudEvent = req.headers["x-event-key"]
    const BBCloudRequest = req.body
    res.json({ success: true })
    const username = BBCloudRequest.actor.username
    const repo = BBCloudRequest.repository.full_name
    const link = BBCloudRequest.pullrequest.links.html.href
    const author = BBCloudRequest.pullrequest.author.display_name
    switch (BBCloudEvent) {
      case "pullrequest:created":
        this.slackmq.request(config.serviceName.slack, "notifyChannel", {
          message: `${username} has created a Pull Request for the ${repo} repository. Link: ${link}`,
        })
        break
      case "pullrequest:updated":
        this.slackmq.request(config.serviceName.slack, "notifyChannel", {
          message: `${username} has updated a Pull Request to the ${repo} repository. Link: ${link}`,
        })
        break
      case "pullrequest:approved":
        this.slackmq.request(config.serviceName.slack, "notifyChannel", {
          message: `${username} has approved the Pull Request for the ${repo} repository. Link: ${link}`,
        })
        break
      case "pullrequest:rejected":
        this.slackmq.request(config.serviceName.slack, "notifyChannel", {
          message: `${username} has declined a Pull Request to the ${repo} repository. Great shame is heaped upon ${author}. Link: ${link}`,
        })
        break
      case "pullrequest:fulfilled":
        this.slackmq.request(config.serviceName.slack, "notifyChannel", {
          message: `The Pull Request has been fulfilled for the ${repo} repository.`,
        })
        break
      case "pullrequest:comment_created":
        this.slackmq.request(config.serviceName.slack, "notifyChannel", {
          message: `${username} has commented to the Pull Request for the ${repo} repository.`,
        })
        break
      case "pullrequest:comment_updated":
        this.slackmq.request(config.serviceName.slack, "notifyChannel", {
          message: `${username} has updated a comment to the Pull Request for the ${repo} repository.`,
        })
        break
      case "pullrequest:comment_deleted":
        this.slackmq.request(config.serviceName.slack, "notifyChannel", {
          message: `${username} has deleted a comment to the Pull Request for the ${repo} repository. Why? What is ${
            BBCloudRequest.actor.display_name
          } hiding?`,
        })
        break
      default:
        break
    }
  }
}
