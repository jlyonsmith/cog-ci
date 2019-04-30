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

  async notifySlack(text) {
    this.slackMQ.request(config.serviceName.slack, "notifyChannel", {
      message: text,
    })
  }

  async sendToScheduler(actorMethod, reqJSON) {
    this.scheduleMQ.request(config.serviceName.schedule, actorMethod, {
      build_id: reqJSON.pullrequest.id,
      purpose: "pullRequest",
      repoFullName: reqJSON.repository.full_name,
      branch: reqJSON.pullrequest.source.branch.name,
      pullRequest: reqJSON.pullrequest.id,
      pullRequestTitle: reqJSON.pullrequest.title,
      repoSHA: reqJSON.pullrequest.destination.commit.hash,
      requestUser: reqJSON.actor.username,
    })
  }

  async getWebhook(req, res, next) {
    const BBCloudEvent = req.headers["x-event-key"]
    const BBCloudRequest = await req.body
    const username = BBCloudRequest.actor.username
    const repo = BBCloudRequest.repository.full_name
    const link = BBCloudRequest.repository.links.html.href
    const author = BBCloudRequest.actor.display_name
    res.json({ success: true })
    let text = ""
    switch (BBCloudEvent) {
      case "pullrequest:created":
        text = `${username} has created a Pull Request for the ${repo} repository. Link: ${link}`
        await this.notifySlack(text)
        await this.sendToScheduler("queueBuild", BBCloudRequest)
        break
      case "pullrequest:updated":
        text = `${username} has updated a Pull Request to the ${repo} repository. Link: ${link}`
        await this.notifySlack(text)
        await this.sendToScheduler("queueBuild", BBCloudRequest)
        break
      case "pullrequest:approved":
        text = `:clap: The Pull Request to the ${repo} repository has been approved by ${username} :clap:. Link: ${link}`
        await this.notifySlack(text)
        break
      case "pullrequest:unapproved":
        text = `:man-raising-hand: Remember when ${username} approved your Pull Request? Well, they've changed their mind. The Pull Request to the ${repo} repository has been unapproved by ${username} :shrug:. Link: ${link}`
        await this.notifySlack(text)
        break
      case "pullrequest:rejected":
        text = `${username} has declined a Pull Request to the ${repo} repository. Great shame is heaped upon ${author}. Link: ${link}`
        await this.notifySlack(text)
        // Notify the scheduler to remove this from the queue????
        await this.sendToScheduler("stopBuild", BBCloudRequest)
        break
      case "pullrequest:fulfilled":
        text = `:confetti_ball: The Pull Request has been fulfilled for the ${repo} repository. :tada:`
        await this.notifySlack(text)
        break
      case "pullrequest:comment_created":
        text = `${username} has commented on the Pull Request for the ${repo} repository. Link: ${link}`
        await this.notifySlack(text)
        break
      case "pullrequest:comment_updated":
        text = `${username} has updated a comment for the Pull Request for the ${repo} repository. Link: ${link}`
        await this.notifySlack(text)
        break
      case "pullrequest:comment_deleted":
        text = `${username} has deleted a comment for the Pull Request for the ${repo} repository. Why? What is ${
          BBCloudRequest.actor.display_name
        } hiding?`
        await this.notifySlack(text)
        break
      default:
        break
    }
  }
}
