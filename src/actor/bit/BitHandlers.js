import autobind from "autobind-decorator"
import config from "config"
import Bitbucket from "bitbucket"

const bb = new Bitbucket()

const regexOptions = {
  repoUser: /^.*?\brepo:\s+(.*)\b.*?\s+\busername:\s+(.*)\b.*?/m,
  repoUserTitleBranch: /^.*?\brepo:\s+(.*)\b.*?\s+\busername:\s+(.*)\b.*?\s+\btitle:\s+(.*)\b.*?\s+\bbranch:\s+(.*)\b.*?/m,
}

@autobind
export class BitHandlers {
  constructor(container) {
    this.db = container.db
    this.log = container.log
  }

  async bitbucketAuth() {
    await bb.authenticate({
      type: "basic",
      username: config.bit.username,
      password: config.bit.appPassword, //Bitbucket App Password
    })
  }

  //Create a Pull Request
  async createPullRequest(info) {
    const botUser = info.user
    const regArr = await this.sanitizeText(
      botUser,
      info.text,
      regexOptions.repoUserTitleBranch
    )
    const regObj = {
      repo: regArr[1],
      username: regArr[2],
      title: regArr[3],
      branch: regArr[4],
    }
    const { repo, username, title, branch } = regObj
    this.bitbucketAuth()
    await bb.repositories.createPullRequest({
      repo_slug: repo,
      username: username,
      _body: { title: title, source: { branch: { name: branch } } },
    })
    // .then(({ data, headers }) => console.log(data))
  }

  //Return the repository from the Bitbucket API that matchces the name of the provided repo name
  async listRepositories(info) {
    const botUser = info.user
    const regArr = await this.sanitizeText(
      botUser,
      info.text,
      regexOptions.repoUser
    )
    const regObj = {
      repo: regArr[1],
      username: regArr[2],
    }
    const { repo, username } = regObj
    this.bitbucketAuth()
    await bb.repositories
      .list({ username: username })
      .then(({ data }) => {
        let thisRepo = data.values.filter((item) => {
          item.name === repo
        })
        return thisRepo
      })
      .then((data) => console.log(data))
  }

  async userLookup(team, individual) {
    this.bitbucketAuth()
    const { data, headers } = await bb.teams.getAllMembers({ username: team })
    for (const names in data.values) {
      if (
        data.values[names].display_name.toLowerCase() ===
          individual.toLowerCase() ||
        data.values[names].username.toLowerCase() === individual.toLowerCase()
      ) {
        return data.values[names]
      }
    }
  }

  async addReviewerToPullRequest(info) {
    this.bitbucketAuth()
    let reviewers = await this.userLookup(info.team, info.individual)
    await bb.repositories.updatePullRequest({
      username: info.username,
      repo_slug: info.repo,
      pull_request_id: info.pr_id,
      _body: {
        title: info.title,
        reviewers: [{ uuid: reviewers.uuid }],
      },
    })
  }

  sanitizeText(bot, text, regexStr) {
    const cleanText = text.replace(`<@${bot}>`, "").trim()
    const regexp = regexStr
    const regArr = regexp.exec(cleanText)
    return regArr
  }
}
