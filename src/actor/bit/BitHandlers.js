import autobind from "autobind-decorator"
import config from "config"
import Bitbucket from "bitbucket"

const bb = new Bitbucket()

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
    const cleanText = info.text.replace(`<@${botUser}>`, "").trim()
    const regexp = /^.*?\brepo:\s+(.*)\b.*?\s+\busername:\s+(.*)\b.*?\s+\btitle:\s+(.*)\b.*?\s+\bbranch:\s+(.*)\b.*?/m
    const regArr = regexp.exec(cleanText)
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
    const { username, repo } = info
    this.bitbucketAuth()
    await bb.repositories
      .list({ username: username })
      .then(({ data }) => {
        let thisRepo = data.values.filter((repo) => repo.name === repo)
        return thisRepo
      })
      .then((data) => console.log(data))
  }
}
