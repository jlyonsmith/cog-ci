import redis from "redis"
import util from "util"
import autobind from "autobind-decorator"

@autobind
export class RS {
  constructor(container) {
    // These should never be left undefined
    this.redis = container.redis || redis

    // Mocks
    this.client = container.client
    this.log = container.log
  }

  async connect(redisUri) {
    const client = this.redis.createClient(redisUri, { detect_buffers: true })

    this.setAsync = util.promisify(client.set.bind(client))
    this.getAsync = util.promisify(client.get.bind(client))
    this.setrangeAsync = util.promisify(client.setrange.bind(client))
    this.incrAsync = util.promisify(client.incr.bind(client))
    this.expireAsync = util.promisify(client.expire.bind(client))
    this.delAsync = util.promisify(client.del.bind(client))

    this.client = client

    return this
  }

  async disconnect() {
    return this.client.quit()
  }
}
