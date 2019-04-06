import { Schema } from "mongoose"

export let buildRequestSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, required: true, auto: true },
    build_id: Number,
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
      enum: ["queued", "running", "killed", "fail", "success"],
    },
    exitCode: Number,
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
  { build_id: 1 },
  {
    unique: true,
  }
)
