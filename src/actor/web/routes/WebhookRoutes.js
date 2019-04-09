import autobind from "autobind-decorator"
import config from "config"
import { catchAll } from "."
import bodyParser from "body-parser"

@autobind
export class WebhookRoutes {
  constructor(container) {
    const app = container.app

    this.log = container.log
    this.slackMQ = container.slackMQ
    this.scheduleMQ = container.scheduleMQ

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
        this.slackMQ.request(config.serviceName.slack, "notifyChannel", {
          message: `${username} has created a Pull Request for the ${repo} repository. Link: ${link}`,
        })
        break
      case "pullrequest:updated":
        this.slackMQ.request(config.serviceName.slack, "notifyChannel", {
          message: `${username} has updated a Pull Request to the ${repo} repository. Link: ${link}`,
        })
        break
      case "pullrequest:approved":
        this.slackMQ.request(config.serviceName.slack, "notifyChannel", {
          message: `:clap: The Pull Request to the ${repo} repository has been approved by ${username} :clap:. Link: ${link}`,
        })
        break
      case "pullrequest:unapproved":
        this.slackMQ.request(config.serviceName.slack, "notifyChannel", {
          message: `:man-raising-hand: Remember when ${username} approved your Pull Request? Well, they've changed their mind. The Pull Request to the ${repo} repository has been unapproved by ${username} :shrug:. Link: ${link}`,
        })
        break
      case "pullrequest:rejected":
        this.slackMQ.request(config.serviceName.slack, "notifyChannel", {
          message: `${username} has declined a Pull Request to the ${repo} repository. Great shame is heaped upon ${author}. Link: ${link}`,
        })
        break
      case "pullrequest:fulfilled":
        this.slackMQ.request(config.serviceName.slack, "notifyChannel", {
          message: `:confetti_ball: The Pull Request has been fulfilled for the ${repo} repository. :tada:`,
        })
        this.scheduleMQ.request(config.serviceName.schedule, "queueBuild", {
          build_id: BBCloudRequest.pullrequest.id,
          purpose: "pullRequest",
          repoFullName: repo,
          branch: BBCloudRequest.pullrequest.source.branch.name,
          pullRequest: link,
          pullRequestTitle: BBCloudRequest.pullrequest.title,
          repoSHA: BBCloudRequest.pullrequest.destination.commit.hash,
        })
        break
      case "pullrequest:comment_created":
        this.slackMQ.request(config.serviceName.slack, "notifyChannel", {
          message: `${username} has commented on the Pull Request for the ${repo} repository. Link: ${link}`,
        })
        break
      case "pullrequest:comment_updated":
        this.slackMQ.request(config.serviceName.slack, "notifyChannel", {
          message: `${username} has updated a comment for the Pull Request for the ${repo} repository. Link: ${link}`,
        })
        break
      case "pullrequest:comment_deleted":
        this.slackMQ.request(config.serviceName.slack, "notifyChannel", {
          message: `${username} has deleted a comment for the Pull Request for the ${repo} repository. Why? What is ${
            BBCloudRequest.actor.display_name
          } hiding?`,
        })
        break
      default:
        break
    }
  }
}
