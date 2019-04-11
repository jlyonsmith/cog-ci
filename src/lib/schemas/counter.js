import { Schema } from "mongoose"

export const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
})

counterSchema.methods.getNextBuildSequence = function() {
  this.findOneAndUpdate(
    { _id: "buildIdSeq" },
    { $inc: { seq: 1 } },
    { new: true }
  )
}
