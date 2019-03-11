import { Schema } from "mongoose"

export let projectSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, required: true, auto: true },
    githubWebhookPort: Number,
    githubWebhookSecretToken: Number,
    githubApiToken: String,
  },
  { timestamps: true, id: false }
)

integrationSchema.index(
  { num: 1 },
  {
    unique: true,
  }
)
