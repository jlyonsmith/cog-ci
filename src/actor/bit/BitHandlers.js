import autobind from "autobind-decorator"
import config from "config"
import Bitbucket from "bitbucket"

const bb = new Bitbucket()

const regexOptions = {
  repoUser: /^.*?\brepo:\s+(.*)\b.*?\s+\busername:\s+(.*)\b.*?/m,
  repoUserTitleBranch: /^.*?\brepo:\s+(.*)\b.*?\s+\busername:\s+(.*)\b.*?\s+\btitle:\s+(.*)\b.*?\s+\bbranch:\s+(.*)\b.*?/m,
  repoUserTag: /^.*?\brepo:\s+(.*)\b.*?\s+\busername:\s+(.*)\btag:\s+(.*)\b.*?/m,
}

@autobind
export class BitHandlers {
  constructor(container) {
    this.db = container.db
    this.log = container.log
    this.scheduleMQ = container.scheduleMQ
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

  async rollBackPreviousBuild(info) {
    const botUser = info.user
    const regArr = await this.sanitizeText(
      botUser,
      info.text,
      regexOptions.repoUserTag
    )
    const regObj = {
      repo_slug: regArr[1],
      username: regArr[2],
      name: regArr[3],
    }
    // const { repo, username, tag } = regObj
    const repoInfo = await this.getTag(regObj)
    this.scheduleMQ.request(config.serviceName.schedule, "queueBuild", {
      build_id: repoInfo.name,
      purpose: "rollback",
      repoFullName: repo.target.repository.full_name,
      repoSHA: repoInfo.target.hash,
    })
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

  async listTags(info) {
    this.bitbucketAuth()
    const { data } = await bb.repositories.listTags({
      username: info.username,
      repo_slug: info.repo_slug,
    })
    return data.values
  }

  async getTag(info) {
    this.bitbucketAuth()
    const { data } = await bb.repositories.getTag({
      username: info.username,
      repo_slug: info.repo_slug,
      name: info.name,
    })
    return data
  }

  sanitizeText(bot, text, regexStr) {
    const cleanText = text.replace(`<@${bot}>`, "").trim()
    const regexp = regexStr
    const regArr = regexp.exec(cleanText)
    return regArr
  }
}
