import { Schema } from "mongoose"

export let integrationSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, required: true, auto: true },
    seq: Number,
    purpose: {
      type: String,
      enum: ["master", "release", "pullRequest", "deploy"],
    },
    repoFullName: String,
    branch: String,
    pullRequest: String,
    pullRequestTitle: String,
    repoSHA: String,
    terminationType: { type: String, enum: ["killed", "exited"] },
    exitCode: Number,
    startedBy: Schema.Types.ObjectId,
    stoppedBy: Schema.Types.ObjectId,
    startTime: Date,
    endTime: Date,
    flags: String, // TODO: Un-typed string array
    metrics: String, // TODO: Un-typed object
  },
  { timestamps: true, id: false }
)

integrationSchema.index(
  { num: 1 },
  {
    unique: true,
  }
)
