import { Schema } from "mongoose"

export let buildRequestSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, required: true, auto: true },
    buildId: Number,
    purpose: {
      type: String,
      enum: ["master", "release", "pullRequest", "deploy"],
    },
    repoFullName: String,
    branch: String,
    pullRequest: String,
    pullRequestTitle: String,
    repoSHA: String,
    status: {
      type: String,
      enum: ["queued", "running", "killed", "timeout", "fail", "success"],
    },
    exitCode: Number,
    resultMessage: String,
    requestUser: String,
    startedBy: Schema.Types.ObjectId,
    stoppedBy: Schema.Types.ObjectId,
    startTime: Date,
    endTime: Date,
    flags: String, // TODO: Un-typed string array
    metrics: String, // TODO: Un-typed object
  },
  { timestamps: true, id: false }
)

buildRequestSchema.index(
  { buildId: 1 },
  {
    unique: true,
  }
)
