import autobind from "autobind-decorator"
import config from "config"
import Bitbucket from "bitbucket"

const bb = new Bitbucket()

const regexOptions = {
  repoUser: /^.*?\brepo:\s+(.*)\b.*?/m,
  repoUserTitleBranch: /^.*?\brepo:\s+(.*)\b.*?\s+\btitle:\s+(.*)\b.*?\s+\bbranch:\s+(.*)\b.*?/m,
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
      username: config.bit.username,
      title: regArr[2],
      branch: regArr[3],
    }
    const { repo, username, title, branch } = regObj
    this.bitbucketAuth()
    await bb.repositories.createPullRequest({
      repo_slug: repo,
      username: username,
      _body: { title: title, source: { branch: { name: branch } } },
    })
  }

  //In the event of a rollback, find the specific tag and pass that info to the scheduler/queuebuild
  async rollBackPreviousBuild(info) {
    const botUser = info.user
    const regArr = await this.sanitizeText(
      botUser,
      info.text,
      regexOptions.repoUser
    )
    const regObj = {
      repo_slug: regArr[1],
      username: config.bit.username,
      name: regArr[2],
    }
    const repoInfo = await this.getTag(regObj)
    //more likely, this would be sent to a deployment method, not the queue
    this.scheduleMQ.request(config.serviceName.schedule, "queueBuild", {
      build_id: repoInfo.name,
      purpose: "rollback",
      repoFullName: repoInfo.target.repository.full_name,
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
      username: config.bit.username,
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

  //Find users
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

  // Add users to a Pull Request. First, find the user's ID via the lookup tool (get the uuid) and then trigger bitbucket api to update PR with new data
  async addReviewerToPullRequest(info) {
    this.bitbucketAuth()
    let reviewers = await this.userLookup(info.team, info.individual)
    await bb.repositories.updatePullRequest({
      username: config.bit.username,
      repo_slug: info.repo,
      pull_request_id: info.pr_id,
      _body: {
        title: info.title,
        reviewers: [{ uuid: reviewers.uuid }],
      },
    })
  }

  // get an array of tags applied to the commits in the repo
  async listTags(info) {
    this.bitbucketAuth()
    const { data } = await bb.repositories.listTags({
      username: config.bit.username, //username or UUID
      repo_slug: info.repo_slug, //repo
    })
    return data.values
  }

  // get details about commit based on a specific tag
  async getTag(info) {
    this.bitbucketAuth()
    const { data } = await bb.repositories.getTag({
      username: config.bit.username, //username or UUID
      repo_slug: info.repo_slug, //repo
      name: info.name, //this is the tag name
    })
    return data
  }

  //
  async findCommit(info) {
    const { username, sha, repo } = info
    this.bitbucketAuth()
    const { data, headers } = await bb.commits.get({
      username: config.bit.username,
      node: sha,
      repo_slug: repo,
    })
    return data
  }

  async findBuildStatusForCommit(info) {
    const { username, sha, repo } = info
    this.bitbucketAuth()
    const { data, headers } = await bb.commitstatuses.list({
      username: config.bit.username,
      node: sha,
      repo_slug: repo,
    })
    return data.values
  }

  async setBuildStatus(info) {
    const {
      sha,
      repo,
      state,
      name,
      description,
      created_on,
      updated_on,
      url,
    } = info
    this.bitbucketAuth()
    const { data, headers } = await bb.commitstatuses
      .createBuildStatus({
        repo_slug: repo,
        username: config.bit.username,
        node: sha,
        _body: {
          type: "commit",
          key: "build",
          state: state,
          name: name,
          description: description,
          created_on: created_on,
          updated_on: updated_on,
          url: url,
        },
      })
      .catch((err) => {
        console.log(err)
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
