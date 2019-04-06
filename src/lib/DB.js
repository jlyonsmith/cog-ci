import mongoose from "mongoose"
import mongodb from "mongodb"
import autobind from "autobind-decorator"
import * as Schemas from "./schemas"

@autobind
export class DB {
  constructor(container) {
    this.mongoose = container.mongoose || mongoose
    this.mongodb = container.mongodb || mongodb
    this.log = container.log
  }

  async connect(mongoUri, isProduction) {
    this.connection = await this.mongoose.createConnection(mongoUri, {
      promiseLibrary: Promise,
      autoIndex: !isProduction,
      useNewUrlParser: true,
      useCreateIndex: true,
    })

    this.BuildRequest = this.connection.model(
      "buildRequest",
      Schemas.buildRequestSchema
    )
    this.Counter = this.connection.model("Counter", Schemas.counterSchema)
    return this
  }

  newObjectId(s) {
    // If s is undefined, then a new ObjectID is created, else s is assumed to be a parsable ObjectID
    return new this.mongodb.ObjectID(s)
  }

  async disconnect() {
    if (this.connection) {
      await this.connection.close()
    }
  }
}
