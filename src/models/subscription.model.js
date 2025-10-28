import mongoose ,{Schema} from "mongoose";

const subscriptionSchema = new Schema({
    subscriber:{
        type: Schema.Types.ObjectId, //user who is subscribing
        ref:"User",
        required: true
    },
    channel : {
        type: Schema.Types.ObjectId, //user who is being subscribed to
        ref:"User",
        required: true
    }
},{ timestamps: true}
)



export const Subscription = new mongoose.model('Subscription',subscriptionSchema)
