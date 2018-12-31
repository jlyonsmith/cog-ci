import { Schema } from "mongoose"

export const counterSchema = new Schema({
  _id: { type: String, required: true },
  integrationSeq: { type: Number, default: 0 },
})

counterSchema.methods.getNextIntegrationSequence = function() {}
