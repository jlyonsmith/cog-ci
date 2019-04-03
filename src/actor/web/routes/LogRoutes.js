import autobind from "autobind-decorator"

@autobind
export class LogRoutes {
  constructor(container) {
    const app = container.app

    this.log = container.log

    app.route("/logs/:id").get(this.getLog)
  }

  async getLog(req, res, next) {
    const id = req.params.id
    res.json({ success: true, message: "Success", id })
  }
}
