import { Schema } from "mongoose"

export const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
})

counterSchema.methods.getNextIntegrationSequence = function() {
  this.findAndModify({
    query: { _id: "integrationSeq" },
    update: { $inc: { seq: 1 } },
    new: true,
  })
}
